import { Pool } from 'pg';
import { NextResponse } from 'next/server';

const pool = new Pool({
  connectionString: process.env.POSTGRES_URL,
  ssl: { rejectUnauthorized: false }
});

export async function GET(
  request: Request,
  { params }: { params: Promise<{ teamid: string }> }
) {
  const { teamid } = await params;
  const teamId = teamid;

  try {
    const teamResult = await pool.query(`
      SELECT 
        team_id as "teamId",
        team_name as "teamName",
        conference,
        games,
        wins,
        losses,
        adj_o::float as "adjO",
        adj_d::float as "adjD",
        adj_em::float as "adjEM",
        adj_t::float as "adjT",
        points,
        opp_points,
        fgm, fga, tpm, tpa, ftm, fta,
        orb, drb, trb, ast, stl, blk, tov, pf,
        opp_fgm, opp_fga, opp_tpm, opp_tpa, opp_ftm, opp_fta,
        opp_orb, opp_drb, opp_trb, opp_ast, opp_stl, opp_blk, opp_tov, opp_pf
      FROM teams 
      WHERE team_id = $1 AND division = 'mens-d1'
    `, [teamId]);

    if (teamResult.rows.length === 0) {
      return NextResponse.json({ error: 'Team not found' }, { status: 404 });
    }

    const playersResult = await pool.query(`
      SELECT 
        player_id as "playerId",
        first_name as "firstName",
        last_name as "lastName",
        number,
        position,
        year,
        games,
        starts,
        minutes,
        fgm, fga, tpm, tpa, ftm, fta,
        orb, drb, trb, ast, stl, blk, tov, pf, points
      FROM players 
      WHERE team_id = $1 AND division = 'mens-d1'
      ORDER BY points DESC
    `, [teamId]);

    return NextResponse.json({
      team: teamResult.rows[0],
      players: playersResult.rows
    });
  } catch (error) {
    console.error('Database error:', error);
    return NextResponse.json({ error: 'Failed to fetch team' }, { status: 500 });
  }
}
