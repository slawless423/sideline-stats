// app/api/recruiting/mens/profile/[slug]/route.ts
//
// Resolves a unified profile slug to its full set of stat rows.
// The unified profiles file (lib/recruiting/unified_profiles_men.json)
// is imported at build time and tells us:
//   - the canonical display name, grad year, and height for the player
//   - the list of (league, season, player_id) source rows that belong to them
//
// We then query Neon for the stat rows + team totals matching that source list.

import { NextResponse } from 'next/server';
import { Pool } from 'pg';
import unifiedProfiles from '@/lib/recruiting/unified_profiles_men.json';

const pool = new Pool({ connectionString: process.env.POSTGRES_URL });

type Source = {
  league: string;
  season: string;
  player_id: number;
  team: string;
  display_name?: string;
  grad_year?: number | null;
  height?: string | null;
};

type Profile = {
  unified_id: string;
  display_name: string;
  grad_year: number | null;
  height_inches: number | null;
  sources: Source[];
  match_confidence: string;
};

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;

  const profile = (unifiedProfiles.profiles as Profile[]).find(
    p => p.unified_id === slug
  );
  if (!profile) {
    return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
  }

  if (!profile.sources || profile.sources.length === 0) {
    return NextResponse.json({
      profile,
      stat_rows: [],
      team_rows: [],
    });
  }

  const client = await pool.connect();
  try {
    // Build IN-list parameters for source player_ids and (league, season, team)
    // tuples for team stats.
    const sourceIds = profile.sources.map(s => s.player_id);

    const playerStatsRes = await client.query(
      `
        SELECT
          p.id, p.full_name, p.team, p.league, p.season,
          p.grad_year, p.height,
          s.gp, s.mp, s.pts,
          s.fgm, s.fga,
          s.fg3m, s.fg3a,
          s.ftm, s.fta,
          s.oreb, s.dreb, s.reb,
          s.ast, s.stl, s.blk, s.tov
        FROM eybl_players p
        JOIN eybl_player_stats s ON s.player_id = p.id
        WHERE p.id = ANY($1::int[])
      `,
      [sourceIds]
    );

    // Pull team totals for every (team, league, season) combination this
    // player appeared in — needed for advanced-stat calculations.
    const teamLookups = new Set(
      profile.sources.map(s => `${s.team}|${s.league}|${s.season}`)
    );
    const teamRows: any[] = [];
    if (teamLookups.size > 0) {
      // Build parallel arrays so we can use unnest()
      const teamArr: string[] = [];
      const leagueArr: string[] = [];
      const seasonArr: string[] = [];
      for (const key of teamLookups) {
        const [t, l, s] = key.split('|');
        teamArr.push(t);
        leagueArr.push(l);
        seasonArr.push(s);
      }
      const teamRes = await client.query(
        `
          SELECT
            team, league, season, gp, mp,
            fgm, fga, fg3m, fg3a, ftm, fta,
            oreb, dreb, reb, ast, stl, blk, tov, pts,
            opp_fgm, opp_fga, opp_fg3m, opp_fg3a, opp_ftm, opp_fta,
            opp_oreb, opp_dreb, opp_reb, opp_ast, opp_stl, opp_blk,
            opp_tov, opp_pts
          FROM eybl_team_stats
          WHERE (team, league, season) IN (
            SELECT * FROM unnest($1::text[], $2::text[], $3::text[])
          )
        `,
        [teamArr, leagueArr, seasonArr]
      );
      teamRows.push(...teamRes.rows);
    }

    return NextResponse.json({
      profile,
      stat_rows: playerStatsRes.rows,
      team_rows: teamRows,
    });
  } catch (err) {
    console.error('Profile API error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}
