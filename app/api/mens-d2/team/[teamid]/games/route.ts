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
        game_id as "gameId",
        game_date as "gameDate",
        home_team_id as "homeId",
        home_team_name as "homeTeam",
        home_score as "homeScore",
        away_team_id as "awayId",
        away_team_name as "awayTeam",
        away_score as "awayScore",
        is_conference_game as "isConferenceGame"
      FROM games 
      WHERE (home_team_id = $1 OR away_team_id = $1)
        AND division = 'mens-d2'
      ORDER BY game_date DESC
    `, [teamid]);

    return NextResponse.json({
      games: result.rows
    });
  } catch (error) {
    console.error('Database error:', error);
    return NextResponse.json({ error: 'Failed to fetch games' }, { status: 500 });
  }
}
