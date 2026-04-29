// app/api/recruiting/womens/profile/[id]/route.ts
//
// Given a canonical player id (from hs_players_womens), returns:
//   - the canonical player row's identity (display name, height, grad year)
//   - every per-(team, league, season) stat row attached to that player
//     — both the canonical row itself AND any dupe rows whose canonical_player_id
//     points at it
//   - team totals for every (team, league, season) those rows cover, used for
//     advanced stat calculations (ORtg, %Usage, etc.)
//
// The id passed in MUST be a canonical row id (canonical_player_id IS NULL).
// Old hs_players_womens links sometimes pointed at dupe ids; for those, we
// transparently follow the dupe up to its canonical and proceed from there.

import { NextResponse } from 'next/server';
import { Pool } from 'pg';

const pool = new Pool({ connectionString: process.env.POSTGRES_URL });

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const numericId = parseInt(id, 10);
  if (!Number.isFinite(numericId)) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  }

  const client = await pool.connect();
  try {
    // Step 1: resolve to canonical id. If the user followed a stale link to
    // a dupe row, we follow the pointer up to the canonical so the rest of
    // the query is consistent.
    const resolveRes = await client.query(
      `
        SELECT
          CASE
            WHEN canonical_player_id IS NULL THEN id
            ELSE canonical_player_id
          END AS canonical_id
        FROM hs_players_womens
        WHERE id = $1
      `,
      [numericId]
    );
    if (resolveRes.rows.length === 0) {
      return NextResponse.json({ error: 'Player not found' }, { status: 404 });
    }
    const canonicalId: number = resolveRes.rows[0].canonical_id;

    // Step 2: fetch the canonical row's identity (display name, height, grad year).
    // The canonical row is whichever has id = canonicalId. We pull display info
    // from there as the source of truth.
    const canonicalRowRes = await client.query(
      `
        SELECT id, full_name, grad_year, height
        FROM hs_players_womens
        WHERE id = $1
      `,
      [canonicalId]
    );
    if (canonicalRowRes.rows.length === 0) {
      return NextResponse.json({ error: 'Canonical row missing' }, { status: 404 });
    }
    const canonical = canonicalRowRes.rows[0];

    // Step 3: fetch every per-row stat line that belongs to this player —
    // the canonical row itself plus every dupe pointing at it.
    const statRowsRes = await client.query(
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
        FROM hs_players_womens p
        JOIN hs_player_stats_womens s ON s.player_id = p.id
        WHERE p.id = $1 OR p.canonical_player_id = $1
      `,
      [canonicalId]
    );

    // Step 4: pull team totals for every distinct (team, league, season) the
    // rows above appear in.
    const teamLookups = new Set<string>();
    for (const r of statRowsRes.rows) {
      teamLookups.add(`${r.team}|${r.league}|${r.season}`);
    }
    let teamRows: any[] = [];
    if (teamLookups.size > 0) {
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
          FROM hs_team_stats_womens
          WHERE (team, league, season) IN (
            SELECT * FROM unnest($1::text[], $2::text[], $3::text[])
          )
        `,
        [teamArr, leagueArr, seasonArr]
      );
      teamRows = teamRes.rows;
    }

    return NextResponse.json({
      canonical_id: canonicalId,
      profile: {
        display_name: canonical.full_name,
        grad_year: canonical.grad_year,
        height: canonical.height,
      },
      stat_rows: statRowsRes.rows,
      team_rows: teamRows,
    });
  } catch (err) {
    console.error('Womens profile API error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  } finally {
    client.release();
  }
}
