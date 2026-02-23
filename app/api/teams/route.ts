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

    // Parse numeric values and calculate raw stats
    const rows = result.rows.map(row => {
      const poss = Math.max(1, row.fga - row.orb + row.tov + 0.475 * row.fta);
      const oppPoss = Math.max(1, row.opp_fga - row.opp_orb + row.opp_tov + 0.475 * row.opp_fta);
      
      const rawO = row.games > 0 && poss > 0 ? (row.points / poss) * 100 : null;
      const rawD = row.games > 0 && oppPoss > 0 ? (row.opp_points / oppPoss) * 100 : null;
      const rawEM = rawO !== null && rawD !== null ? rawO - rawD : null;
      const rawT = row.games > 0 ? (poss + oppPoss) / (2 * row.games) : null;
      
      return {
        ...row,
        adjO: row.adjO ? parseFloat(row.adjO) : null,
        adjD: row.adjD ? parseFloat(row.adjD) : null,
        adjEM: row.adjEM ? parseFloat(row.adjEM) : null,
        adjT: row.adjT ? parseFloat(row.adjT) : null,
        rawO,
        rawD,
        rawEM,
        rawT,
      };
    });

    return NextResponse.json({
      updated: new Date().toISOString(),
      rows
    });
  } catch (error) {
    console.error('Database error:', error);
    return NextResponse.json({ error: 'Failed to fetch teams' }, { status: 500 });
  }
}
