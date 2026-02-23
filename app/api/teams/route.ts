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
        adj_o as "adjO",
        adj_d as "adjD",
        adj_em as "adjEM",
        adj_t as "adjT",
        points,
        opp_points,
        fga,
        orb,
        tov,
        fta,
        opp_fga,
        opp_orb,
        opp_tov,
        opp_fta
      FROM teams
      ORDER BY adj_em DESC
    `);

    // Parse numeric values - use adj stats since raw calculations need more data
    const rows = result.rows.map(row => ({
      ...row,
      adjO: row.adj_o ? parseFloat(row.adj_o) : null,
      adjD: row.adj_d ? parseFloat(row.adj_d) : null,
      adjEM: row.adj_em ? parseFloat(row.adj_em) : null,
      adjT: row.adj_t ? parseFloat(row.adj_t) : null,
      // Use adj stats for display
      rawO: row.adj_o ? parseFloat(row.adj_o) : null,
      rawD: row.adj_d ? parseFloat(row.adj_d) : null,
      rawEM: row.adj_em ? parseFloat(row.adj_em) : null,
      rawT: row.adj_t ? parseFloat(row.adj_t) : null,
    }));

    return NextResponse.json({
      updated: new Date().toISOString(),
      rows
    });
  } catch (error) {
    console.error('Database error:', error);
    return NextResponse.json({ error: 'Failed to fetch teams' }, { status: 500 });
  }
}
