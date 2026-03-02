import { NextResponse } from 'next/server';
import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.POSTGRES_URL,
  ssl: { rejectUnauthorized: false }
});

export async function GET(
  request: Request,
  { params }: { params: Promise<{ teamId: string }> }
) {
  const { teamId } = await params;

  try {
    const result = await pool.query(`
      SELECT 
        team_id as "teamId",
        team_name as "teamName",
        conference,
        games,
        wins,
        losses,
        adj_o as "adjO",
        adj_d as "adjD",
        adj_em as "adjEM",
        adj_t as "adjT",
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
      WHERE team_id = $1
    `, [teamId]);

    if (result.rows.length === 0) {
      return NextResponse.json({ error: 'Team not found' }, { status: 404 });
    }

    // Parse numeric values
    const team = result.rows[0];
    return NextResponse.json({
      ...team,
      adjO: team.adjO ? parseFloat(team.adjO) : null,
      adjD: team.adjD ? parseFloat(team.adjD) : null,
      adjEM: team.adjEM ? parseFloat(team.adjEM) : null,
      adjT: team.adjT ? parseFloat(team.adjT) : null,
    });
  } catch (error) {
    console.error('Database error:', error);
    return NextResponse.json({ error: 'Failed to fetch team' }, { status: 500 });
  }
}
