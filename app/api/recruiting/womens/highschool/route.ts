import { NextResponse } from 'next/server';
import { Pool } from 'pg';

const pool = new Pool({ connectionString: process.env.POSTGRES_URL });

export async function GET() {
  try {
    const client = await pool.connect();
    try {
      const [playersRes, teamsRes] = await Promise.all([
        client.query(`
          WITH aggregated AS (
            -- Sum stats across every player row that shares a canonical ID.
            -- COALESCE(canonical_player_id, id) means: if this row IS the canonical
            -- (canonical_player_id IS NULL), group it by its own id; if it's a dupe,
            -- group it under the row it points at.
            -- ::int casts required because SUM() returns bigint, which node-postgres
            -- returns as a STRING, breaking all arithmetic in the frontend.
            SELECT
              COALESCE(p.canonical_player_id, p.id) AS canon_id,
              SUM(s.gp)::int   AS gp,
              SUM(s.mp)::int   AS mp,
              SUM(s.pts)::int  AS pts,
              SUM(s.fgm)::int  AS fgm,  SUM(s.fga)::int  AS fga,
              SUM(s.fg3m)::int AS fg3m, SUM(s.fg3a)::int AS fg3a,
              SUM(s.ftm)::int  AS ftm,  SUM(s.fta)::int  AS fta,
              SUM(s.oreb)::int AS oreb, SUM(s.dreb)::int AS dreb, SUM(s.reb)::int AS reb,
              SUM(s.ast)::int  AS ast,  SUM(s.stl)::int  AS stl,
              SUM(s.blk)::int  AS blk,  SUM(s.tov)::int  AS tov
            FROM hs_players_womens p
            JOIN hs_player_stats_womens s ON s.player_id = p.id
            GROUP BY COALESCE(p.canonical_player_id, p.id)
          )
          SELECT
            p.id,
            p.full_name,
            p.team,
            p.league,
            p.season,
            p.grad_year,
            p.height,
            a.gp,
            a.mp,
            a.pts,
            a.fgm, a.fga,
            a.fg3m, a.fg3a,
            a.ftm, a.fta,
            a.oreb, a.dreb, a.reb,
            a.ast, a.stl, a.blk, a.tov
          FROM hs_players_womens p
          JOIN aggregated a ON a.canon_id = p.id
          WHERE p.canonical_player_id IS NULL
            AND a.gp > 0
          ORDER BY p.full_name
        `),
        client.query(`
          SELECT
            team, league, season, gp, mp,
            fgm, fga, fg3m, fg3a, ftm, fta,
            oreb, dreb, reb, ast, stl, blk, tov, pts,
            opp_fgm, opp_fga, opp_fg3m, opp_fg3a, opp_ftm, opp_fta,
            opp_oreb, opp_dreb, opp_reb, opp_ast, opp_stl, opp_blk, opp_tov, opp_pts
          FROM hs_team_stats_womens
        `),
      ]);

      return NextResponse.json({
        players: playersRes.rows,
        teams: teamsRes.rows,
      });
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('Womens HS API error:', err);
    return NextResponse.json({ players: [], teams: [] }, { status: 500 });
  }
}
