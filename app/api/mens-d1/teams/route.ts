import { NextResponse } from 'next/server';
import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.POSTGRES_URL,
  ssl: { rejectUnauthorized: false }
});

const MENS_D1_CONFERENCES = [
  'acc', 'american', 'america-east', 'asun', 'atlantic-10',
  'big-12', 'big-east', 'big-sky', 'big-south', 'big-ten', 'big-west',
  'caa', 'cusa', 'horizon', 'ivy-league', 'maac', 'mac', 'meac',
  'mountain-west', 'mvc', 'nec', 'ovc', 'patriot', 'sec', 'socon',
  'southland', 'summit-league', 'sun-belt', 'swac', 'wac', 'wcc'
];

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
        AND conference = ANY($1)
      ORDER BY adj_em DESC
    `, [MENS_D1_CONFERENCES]);

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
