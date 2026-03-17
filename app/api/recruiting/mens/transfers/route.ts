import { NextResponse } from 'next/server';
import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.POSTGRES_URL,
  ssl: { rejectUnauthorized: false }
});

export async function GET() {
  try {
    const transfersResult = await pool.query(`
      SELECT
        t.player_id       AS "playerId",
        t.name,
        t.previous_school AS "previousSchool",
        t.new_school      AS "newSchool",
        t.division,
        t.match_status    AS "matchStatus",
        t.team_name       AS "teamName",
        t.position,
        t.year,
        t.height,
        t.games, t.starts, t.minutes,
        t.fgm, t.fga, t.tpm, t.tpa, t.ftm, t.fta,
        t.orb, t.drb, t.trb, t.ast, t.stl, t.blk, t.tov, t.pf, t.points
      FROM transfers t
      ORDER BY t.division, t.name
    `);

    const teamsResult = await pool.query(`
      SELECT
        team_id   AS "teamId",
        team_name AS "teamName",
        division,
        games,
        fgm, fga, tpm, tpa, ftm, fta,
        orb, drb, trb, ast, stl, blk, tov, pf, points,
        opp_fgm, opp_fga, opp_tpm, opp_tpa, opp_ftm, opp_fta,
        opp_orb, opp_drb, opp_trb, opp_ast, opp_stl, opp_blk, opp_tov, opp_pf, opp_points
      FROM teams
      WHERE division IN ('mens-d1', 'mens-d2')
    `);

    const metaResult = await pool.query(`
      SELECT value FROM site_metadata WHERE key = 'transfers_last_updated'
    `);
    const lastUpdated = metaResult.rows[0]?.value ?? null;

    return NextResponse.json({
      transfers: transfersResult.rows,
      teams: teamsResult.rows,
      lastUpdated,
    });
  } catch (error) {
    console.error('Transfers API error:', error);
    return NextResponse.json({ error: 'Failed to fetch transfers' }, { status: 500 });
  }
}
