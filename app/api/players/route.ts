import { NextResponse } from 'next/server';
import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.POSTGRES_URL,
  ssl: { rejectUnauthorized: false }
});

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const minMinutes = parseInt(searchParams.get('minMinutes') || '0');
  
  try {
    const result = await pool.query(`
      SELECT 
        p.player_id as "playerId",
        p.first_name as "firstName",
        p.last_name as "lastName",
        p.team_name as "teamName",
        p.team_id as "teamId",
        p.year,
        p.position,
        p.number,
        p.games,
        p.starts,
        p.minutes,
        p.fgm,
        p.fga,
        p.tpm,
        p.tpa,
        p.ftm,
        p.fta,
        p.orb,
        p.drb,
        p.trb,
        p.ast,
        p.stl,
        p.blk,
        p.tov,
        p.pf,
        p.points
      FROM players p
      WHERE p.minutes >= $1
      ORDER BY p.points DESC
    `, [minMinutes]);

    return NextResponse.json({
      players: result.rows,
      total: result.rows.length
    });
  } catch (error) {
    console.error('Database error:', error);
    return NextResponse.json({ error: 'Failed to fetch players' }, { status: 500 });
  }
}

export {};
