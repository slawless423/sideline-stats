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
        team_id as "teamId",
        team_name as "teamName",
        conference,
        games,
        wins,
        losses,
        points,
        opp_points as "opp_points",
        fgm, fga, tpm, tpa, ftm, fta,
        orb, drb, trb, ast, stl, blk, tov, pf,
        opp_fgm as "opp_fgm",
        opp_fga as "opp_fga",
        opp_tpm as "opp_tpm",
        opp_tpa as "opp_tpa",
        opp_ftm as "opp_ftm",
        opp_fta as "opp_fta",
        opp_orb as "opp_orb",
        opp_drb as "opp_drb",
        opp_trb as "opp_trb",
        opp_ast as "opp_ast",
        opp_stl as "opp_stl",
        opp_blk as "opp_blk",
        opp_tov as "opp_tov",
        opp_pf as "opp_pf"
      FROM teams

      WHERE division = 'mens-d2'
  AND conference IS NOT NULL
  AND conference != ''
    `);

    return NextResponse.json({
      teams: result.rows
    });
  } catch (error) {
    console.error('Database error:', error);
    return NextResponse.json({ error: 'Failed to fetch teams' }, { status: 500 });
  }
}
