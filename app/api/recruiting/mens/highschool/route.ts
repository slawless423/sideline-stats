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
          ORDER BY p.full_name
        `),
        client.query(`
          SELECT
            team, league, season, gp, mp,
            fgm, fga, fg3m, fg3a, ftm, fta,
            oreb, dreb, reb, ast, stl, blk, tov, pts,
            opp_fgm, opp_fga, opp_fg3m, opp_fg3a, opp_ftm, opp_fta,
            opp_oreb, opp_dreb, opp_reb, opp_ast, opp_stl, opp_blk, opp_tov, opp_pts
          FROM eybl_team_stats
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
