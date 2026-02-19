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
      WHERE conference IS NOT NULL 
        AND conference != ''
        AND conference IN (
          'acc', 'big-12', 'big-ten', 'sec', 'pac-12', 'big-east',
          'american', 'aac', 'wcc', 'mwc', 'mountain-west', 'atlantic-10', 'a-10',
          'mvc', 'mac', 'cusa', 'sun-belt', 'sunbelt', 'colonial', 'caa',
          'horizon', 'maac', 'ovc', 'patriot', 'southland', 'summit-league',
          'wac', 'big-sky', 'big-south', 'southern', 'socon',
          'big-west', 'ivy-league', 'meac', 'nec', 'northeast', 'swac',
          'asun', 'america-east', 'americaeast'
        )
    `);

return NextResponse.json({ teams: result.rows });
  } catch (error) {
    console.error('Database error:', error);
    return NextResponse.json({ error: 'Failed to fetch team stats' }, { status: 500 });
  }
}

export {};
