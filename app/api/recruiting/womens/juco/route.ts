import { NextResponse } from 'next/server';
import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.POSTGRES_URL,
  ssl: { rejectUnauthorized: false }
});

export async function GET() {
  try {
    const playersResult = await pool.query(`
      SELECT
        player_id        AS "playerId",
        team_name        AS "teamName",
        jersey,
        name,
        season,
        gp               AS games,
        min              AS minutes,
        clean_games      AS "cleanGames",
        clean_min        AS "cleanMin",
        fg               AS fgm,
        fga,
        fg3              AS tpm,
        fg3a             AS tpa,
        ft               AS ftm,
        fta,
        reb_off          AS orb,
        reb_def          AS drb,
        reb_tot          AS trb,
        ast,
        stl,
        blk,
        to_stat          AS tov,
        pf,
        pts              AS points,
        clean_fg         AS "cleanFgm",
        clean_fga        AS "cleanFga",
        clean_fg3        AS "cleanTpm",
        clean_fg3a       AS "cleanTpa",
        clean_ft         AS "cleanFtm",
        clean_fta        AS "cleanFta",
        clean_reb_off    AS "cleanOrb",
        clean_reb_def    AS "cleanDrb",
        clean_reb_tot    AS "cleanTrb",
        clean_ast        AS "cleanAst",
        clean_stl        AS "cleanStl",
        clean_blk        AS "cleanBlk",
        clean_to_stat    AS "cleanTov",
        clean_pf         AS "cleanPf",
        clean_pts        AS "cleanPts"
      FROM njcaa_womens_d1_players
      ORDER BY team_name, name
    `);

    const teamsResult = await pool.query(`
      SELECT
        team_name         AS "teamName",
        season,
        gp                AS games,
        clean_games       AS "cleanGames",
        fg                AS fgm,
        fga,
        fg3               AS tpm,
        fg3a              AS tpa,
        ft                AS ftm,
        fta,
        reb_off           AS orb,
        reb_tot           AS trb,
        ast,
        to_stat           AS tov,
        pts               AS points,
        clean_fga         AS "cleanFga",
        clean_fta         AS "cleanFta",
        clean_reb_off     AS "cleanOrb",
        clean_reb_tot     AS "cleanTrb",
        clean_to_stat     AS "cleanTov",
        clean_opp_fga     AS "cleanOppFga",
        clean_opp_fta     AS "cleanOppFta",
        clean_opp_reb_off AS "cleanOppOrb",
        clean_opp_reb_tot AS "cleanOppTrb",
        clean_opp_to_stat AS "cleanOppTov"
      FROM njcaa_womens_d1_team_totals
    `);

    return NextResponse.json({
      players: playersResult.rows,
      teams: teamsResult.rows,
    });
  } catch (error) {
    console.error('NJCAA Womens JUCO API error:', error);
    return NextResponse.json({ error: 'Failed to fetch JUCO data' }, { status: 500 });
  }
}
