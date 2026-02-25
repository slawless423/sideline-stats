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
        team_name as "team",
        conference,
        games,
        wins,
        losses,
        adj_o as "rawO",
        adj_d as "rawD",
        adj_em as "rawEM",
        adj_t as "rawT",
        updated_at as "updated"
      FROM teams
      WHERE division = 'mens-d1'
        AND conference IS NOT NULL
        AND conference != ''
      ORDER BY adj_em DESC
    `);

    const rows = result.rows.map(row => ({
      ...row,
      rawO: row.rawO ? parseFloat(row.rawO) : null,
      rawD: row.rawD ? parseFloat(row.rawD) : null,
      rawEM: row.rawEM ? parseFloat(row.rawEM) : null,
      rawT: row.rawT ? parseFloat(row.rawT) : null,
    }));

    return NextResponse.json({
      rows,
      updated: rows[0]?.updated ?? null,
    });
  } catch (error) {
    console.error('Database error:', error);
    return NextResponse.json({ error: 'Failed to fetch teams' }, { status: 500 });
  }
}
