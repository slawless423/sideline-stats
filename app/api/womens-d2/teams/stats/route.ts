import { NextResponse } from 'next/server';
import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.POSTGRES_URL,
  ssl: { rejectUnauthorized: false }
});

export async function GET() {
  try {
    const result = await pool.query(`
      SELECT 
        t.team_id as "teamId",
        t.team_name as "teamName",
        t.conference,
        t.games,
        t.wins,
        t.losses,
        t.points,
        t.opp_points as "opp_points",
        t.fgm, t.fga, t.tpm, t.tpa, t.ftm, t.fta,
        t.orb, t.drb, t.trb, t.ast, t.stl, t.blk, t.tov, t.pf,
        t.opp_fgm as "opp_fgm",
        t.opp_fga as "opp_fga",
        t.opp_tpm as "opp_tpm",
        t.opp_tpa as "opp_tpa",
        t.opp_ftm as "opp_ftm",
        t.opp_fta as "opp_fta",
        t.opp_orb as "opp_orb",
        t.opp_drb as "opp_drb",
        t.opp_trb as "opp_trb",
        t.opp_ast as "opp_ast",
        t.opp_stl as "opp_stl",
        t.opp_blk as "opp_blk",
        t.opp_tov as "opp_tov",
        t.opp_pf as "opp_pf",
        COALESCE(SUM(pg.minutes), t.games * 200) as "totalMinutes"
      FROM teams t
      LEFT JOIN player_games pg ON pg.team_id = t.team_id
      WHERE t.division = 'womens-d2'
        AND t.conference IS NOT NULL
        AND t.conference != ''
      GROUP BY t.team_id, t.team_name, t.conference, t.games, t.wins, t.losses,
        t.points, t.opp_points, t.fgm, t.fga, t.tpm, t.tpa, t.ftm, t.fta,
        t.orb, t.drb, t.trb, t.ast, t.stl, t.blk, t.tov, t.pf,
        t.opp_fgm, t.opp_fga, t.opp_tpm, t.opp_tpa, t.opp_ftm, t.opp_fta,
        t.opp_orb, t.opp_drb, t.opp_trb, t.opp_ast, t.opp_stl, t.opp_blk,
        t.opp_tov, t.opp_pf
    `);
    return NextResponse.json({ teams: result.rows });
  } catch (error) {
    console.error('Database error:', error);
    return NextResponse.json({ error: 'Failed to fetch teams' }, { status: 500 });
  }
}
