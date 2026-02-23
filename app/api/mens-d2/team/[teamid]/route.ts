import { Pool } from 'pg';
import { NextResponse } from 'next/server';

const pool = new Pool({
  connectionString: process.env.POSTGRES_URL,
  ssl: { rejectUnauthorized: false }
});

export async function GET(
  request: Request,
  { params }: { params: { teamid: string } }
) {
  const teamId = params.teamid;

  try {
    // Get team info
    const teamResult = await pool.query(`
      SELECT * FROM teams WHERE team_id = $1 AND division = 'mens-d2'
    `, [teamId]);

    if (teamResult.rows.length === 0) {
      return NextResponse.json({ error: 'Team not found' }, { status: 404 });
    }

    // Get players for this team
    const playersResult = await pool.query(`
      SELECT * FROM players 
      WHERE team_id = $1 AND division = 'mens-d2'
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
