// app/api/recruiting/mens/highschool/route.ts
//
// Returns season-aggregate player + team rows for the men's HS recruiting page.
// Sources unioned together (same shape, distinguished by `league` column):
//   - eybl_players / eybl_player_stats / eybl_team_stats
//       → EYBL Scholastic + Nike EYBL leagues
//   - adidas_3ssb_players / adidas_3ssb_player_stats / adidas_3ssb_team_stats
//       → adidas 3SSB leagues
//
// 3SSB tables carry a few extra columns (first_name, last_name, cerebro_player_id,
// position, hometown, high_school on players; pf on stats; pf/opp_pf on team_stats).
// They are dropped from the SELECT so the union shape matches eybl_* exactly.

import { NextResponse } from 'next/server';
import { Pool } from 'pg';

const pool = new Pool({ connectionString: process.env.POSTGRES_URL });

export async function GET() {
  try {
    const client = await pool.connect();
    try {
      const [playersRes, teamsRes] = await Promise.all([
        client.query(`
          SELECT
            p.id,
            p.full_name,
            p.team,
            p.league,
            p.season,
            p.grad_year,
            p.height,
            s.gp,
            s.mp,
            s.pts,
            s.fgm, s.fga,
            s.fg3m, s.fg3a,
            s.ftm, s.fta,
            s.oreb, s.dreb, s.reb,
            s.ast, s.stl, s.blk, s.tov
          FROM eybl_players p
          JOIN eybl_player_stats s ON s.player_id = p.id
          WHERE s.gp > 0

          UNION ALL

          SELECT
            p.id,
            p.full_name,
            p.team,
            p.league,
            p.season,
            p.grad_year,
            p.height,
            s.gp,
            s.mp,
            s.pts,
            s.fgm, s.fga,
            s.fg3m, s.fg3a,
            s.ftm, s.fta,
            s.oreb, s.dreb, s.reb,
            s.ast, s.stl, s.blk, s.tov
          FROM adidas_3ssb_players p
          JOIN adidas_3ssb_player_stats s ON s.player_id = p.id
          WHERE s.gp > 0

          ORDER BY full_name
        `),
        client.query(`
          SELECT
            team, league, season, gp, mp,
            fgm, fga, fg3m, fg3a, ftm, fta,
            oreb, dreb, reb, ast, stl, blk, tov, pts,
            opp_fgm, opp_fga, opp_fg3m, opp_fg3a, opp_ftm, opp_fta,
            opp_oreb, opp_dreb, opp_reb, opp_ast, opp_stl, opp_blk, opp_tov, opp_pts
          FROM eybl_team_stats

          UNION ALL

          SELECT
            team, league, season, gp, mp,
            fgm, fga, fg3m, fg3a, ftm, fta,
            oreb, dreb, reb, ast, stl, blk, tov, pts,
            opp_fgm, opp_fga, opp_fg3m, opp_fg3a, opp_ftm, opp_fta,
            opp_oreb, opp_dreb, opp_reb, opp_ast, opp_stl, opp_blk, opp_tov, opp_pts
          FROM adidas_3ssb_team_stats
        `),
      ]);

      return NextResponse.json({
        players: playersRes.rows,
        teams: teamsRes.rows,
      });
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('HS API error:', err);
    return NextResponse.json({ players: [], teams: [] }, { status: 500 });
  }
}
