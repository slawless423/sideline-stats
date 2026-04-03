import { NextResponse } from 'next/server';
import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.POSTGRES_URL,
  ssl: { rejectUnauthorized: false }
});

const PLAYER_COLS = `
  player_id                      AS "playerId",
  year,
  team_name                      AS "teamName",
  jersey,
  name,
  season,
  division,
  gp::int                        AS games,
  COALESCE(min,0)::int           AS minutes,
  COALESCE(clean_games,0)::int   AS "cleanGames",
  COALESCE(clean_min,0)::int     AS "cleanMin",
  COALESCE(fg,0)::int            AS fgm,
  COALESCE(fga,0)::int           AS fga,
  COALESCE(fg3,0)::int           AS tpm,
  COALESCE(fg3a,0)::int          AS tpa,
  COALESCE(ft,0)::int            AS ftm,
  COALESCE(fta,0)::int           AS fta,
  COALESCE(reb_off,0)::int       AS orb,
  COALESCE(reb_def,0)::int       AS drb,
  COALESCE(reb_tot,0)::int       AS trb,
  COALESCE(ast,0)::int           AS ast,
  COALESCE(stl,0)::int           AS stl,
  COALESCE(blk,0)::int           AS blk,
  COALESCE(to_stat,0)::int       AS tov,
  COALESCE(pf,0)::int            AS pf,
  COALESCE(pts,0)::int           AS points,
  COALESCE(clean_fg,0)::int      AS "cleanFgm",
  COALESCE(clean_fga,0)::int     AS "cleanFga",
  COALESCE(clean_fg3,0)::int     AS "cleanTpm",
  COALESCE(clean_fg3a,0)::int    AS "cleanTpa",
  COALESCE(clean_ft,0)::int      AS "cleanFtm",
  COALESCE(clean_fta,0)::int     AS "cleanFta",
  COALESCE(clean_reb_off,0)::int AS "cleanOrb",
  COALESCE(clean_reb_def,0)::int AS "cleanDrb",
  COALESCE(clean_reb_tot,0)::int AS "cleanTrb",
  COALESCE(clean_ast,0)::int     AS "cleanAst",
  COALESCE(clean_stl,0)::int     AS "cleanStl",
  COALESCE(clean_blk,0)::int     AS "cleanBlk",
  COALESCE(clean_to_stat,0)::int AS "cleanTov",
  COALESCE(clean_pf,0)::int      AS "cleanPf",
  COALESCE(clean_pts,0)::int     AS "cleanPts"
`;

const TEAM_COLS = `
  team_name         AS "teamName",
  division,
  season,
  gp::int                        AS games,
  COALESCE(clean_games,0)::int   AS "cleanGames",
  COALESCE(fg,0)::int            AS fgm,
  COALESCE(fga,0)::int           AS fga,
  COALESCE(fg3,0)::int           AS tpm,
  COALESCE(fg3a,0)::int          AS tpa,
  COALESCE(ft,0)::int            AS ftm,
  COALESCE(fta,0)::int           AS fta,
  COALESCE(reb_off,0)::int       AS orb,
  COALESCE(reb_tot,0)::int       AS trb,
  COALESCE(ast,0)::int           AS ast,
  COALESCE(to_stat,0)::int       AS tov,
  COALESCE(pts,0)::int           AS points,
  COALESCE(clean_fg,0)::int          AS "cleanFgm",
  COALESCE(clean_fga,0)::int         AS "cleanFga",
  COALESCE(clean_fg3,0)::int         AS "cleanTpm",
  COALESCE(clean_ft,0)::int          AS "cleanFtm",
  COALESCE(clean_fta,0)::int         AS "cleanFta",
  COALESCE(clean_ast,0)::int         AS "cleanAst",
  COALESCE(clean_pts,0)::int         AS "cleanPts",
  COALESCE(clean_reb_off,0)::int     AS "cleanOrb",
  COALESCE(clean_reb_tot,0)::int     AS "cleanTrb",
  COALESCE(clean_to_stat,0)::int     AS "cleanTov",
  COALESCE(clean_opp_fga,0)::int     AS "cleanOppFga",
  COALESCE(clean_opp_fg3a,0)::int    AS "cleanOppTpa",
  COALESCE(clean_opp_fta,0)::int     AS "cleanOppFta",
  COALESCE(clean_opp_reb_off,0)::int AS "cleanOppOrb",
  COALESCE(clean_opp_reb_tot,0)::int AS "cleanOppTrb",
  COALESCE(clean_opp_to_stat,0)::int AS "cleanOppTov"
`;

export async function GET() {
  try {
    const playersResult = await pool.query(`
      SELECT ${PLAYER_COLS} FROM njcaa_womens_d1_players
      UNION ALL
      SELECT ${PLAYER_COLS} FROM njcaa_womens_d2_players
      ORDER BY "teamName", name
    `);

    const teamsResult = await pool.query(`
      SELECT ${TEAM_COLS} FROM njcaa_womens_d1_team_totals
      UNION ALL
      SELECT ${TEAM_COLS} FROM njcaa_womens_d2_team_totals
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
