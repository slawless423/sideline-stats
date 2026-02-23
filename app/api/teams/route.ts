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
      WHERE division = 'womens-d1'
        AND conference IN (
          'acc', 'america-east', 'american', 'asun', 'atlantic-10',
          'big-12', 'big-east', 'big-sky', 'big-south', 'big-ten', 'big-west',
          'caa', 'cusa', 'horizon', 'ivy-league', 'maac', 'mac',
          'meac', 'mvc', 'mountain-west', 'nec', 'ovc',
          'patriot', 'socon', 'southland', 'summit-league',
          'sun-belt', 'swac', 'wac', 'wcc'
        )
      ORDER BY adj_em DESC
    `);

    // Parse numeric values - use adj stats
    const rows = result.rows.map(row => ({
      ...row,
      adjO: row.adjO ? parseFloat(row.adjO) : null,
      adjD: row.adjD ? parseFloat(row.adjD) : null,
      adjEM: row.adjEM ? parseFloat(row.adjEM) : null,
      adjT: row.adjT ? parseFloat(row.adjT) : null,
      // Use adj stats for display (they're the same as raw for now)
      rawO: row.adjO ? parseFloat(row.adjO) : null,
      rawD: row.adjD ? parseFloat(row.adjD) : null,
      rawEM: row.adjEM ? parseFloat(row.adjEM) : null,
      rawT: row.adjT ? parseFloat(row.adjT) : null,
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
