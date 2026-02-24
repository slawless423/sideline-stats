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

  try {
    const result = await pool.query(`
      SELECT 
        player_id as "playerId",
        team_id as "teamId",
        team_name as "teamName",
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
      WHERE team_id = $1 AND division = 'mens-d2'
      ORDER BY points DESC
    `, [teamid]);

    return NextResponse.json({
      players: result.rows
    });
  } catch (error) {
    console.error('Database error:', error);
    return NextResponse.json({ error: 'Failed to fetch players' }, { status: 500 });
  }
}
