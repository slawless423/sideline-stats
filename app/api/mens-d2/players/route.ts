import { NextResponse } from 'next/server';
import { Pool } from 'pg'; 

const pool = new Pool({
  connectionString: process.env.POSTGRES_URL,
  ssl: { rejectUnauthorized: false }
});

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const minMinutes = parseInt(searchParams.get('minMinutes') || '0');

    const result = await pool.query(`
      SELECT 
        p.player_id as "playerId",
        p.team_id as "teamId",
        p.team_name as "teamName",
        p.first_name as "firstName",
        p.last_name as "lastName",
        p.number,
        p.position,
        p.year,
        p.games,
        p.starts,
        p.minutes,
        p.fgm, p.fga, p.tpm, p.tpa, p.ftm, p.fta,
        p.orb, p.drb, p.trb, p.ast, p.stl, p.blk, p.tov, p.pf, p.points
      FROM players p
      WHERE p.division = 'mens-d2'
        AND p.minutes >= $1
      ORDER BY p.points DESC
    `, [minMinutes]);

    return NextResponse.json({
      players: result.rows
    });
  } catch (error) {
    console.error('Database error:', error);
    return NextResponse.json({ error: 'Failed to fetch players' }, { status: 500 });
  }
}
