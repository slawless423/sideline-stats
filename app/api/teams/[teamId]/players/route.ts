import { NextResponse } from 'next/server';
import { Pool } from 'pg';
const pool = new Pool({
  connectionString: process.env.POSTGRES_URL,
  ssl: { rejectUnauthorized: false }
});
export async function GET(
  request: Request,
  { params }: { params: Promise<{ teamId: string }> }
) {
  const { teamId } = await params;
  const { searchParams } = new URL(request.url);
  const confOnly = searchParams.get('conf') === 'true';
  try {
    let result;
    if (confOnly) {
      result = await pool.query(`
        SELECT
          p.player_id as "playerId",
          p.team_id as "teamId",
          p.team_name as "teamName",
          p.first_name as "firstName",
          p.last_name as "lastName",
          p.number,
          p.position,
          p.year,
          p.height,
          COUNT(DISTINCT pg.game_id) as games,
          p.starts,
          SUM(pg.minutes) as minutes,
          SUM(pg.fgm) as fgm, SUM(pg.fga) as fga,
          SUM(pg.tpm) as tpm, SUM(pg.tpa) as tpa,
          SUM(pg.ftm) as ftm, SUM(pg.fta) as fta,
          SUM(pg.orb) as orb, 
          p.drb,
          p.trb,
          SUM(pg.ast) as ast, SUM(pg.stl) as stl, SUM(pg.blk) as blk,
          SUM(pg.tov) as tov, SUM(pg.pf) as pf, SUM(pg.points) as points
        FROM players p
        JOIN player_games pg ON pg.player_id = p.player_id
        JOIN games g ON g.game_id = pg.game_id
        WHERE p.team_id = $1
          AND pg.division = 'womens-d1'
          AND g.is_conference_game = true
        GROUP BY p.player_id, p.team_id, p.team_name, p.first_name, p.last_name,
                 p.number, p.position, p.year, p.height, p.starts, p.drb, p.trb
        HAVING SUM(pg.minutes) > 0
        ORDER BY SUM(pg.minutes) DESC
      `, [teamId]);
      if (result.rows.length === 0) {
        result = await pool.query(`
          SELECT
            player_id as "playerId", team_id as "teamId", team_name as "teamName",
            first_name as "firstName", last_name as "lastName",
            number, position, year, height, games, starts, minutes,
            fgm, fga, tpm, tpa, ftm, fta,
            orb, drb, trb, ast, stl, blk, tov, pf, points
          FROM players
          WHERE team_id = $1
          ORDER BY minutes DESC
        `, [teamId]);
        return NextResponse.json({ players: result.rows, fallback: true });
      }
    } else {
      result = await pool.query(`
        SELECT
          player_id as "playerId", team_id as "teamId", team_name as "teamName",
          first_name as "firstName", last_name as "lastName",
          number, position, year, height, games, starts, minutes,
          fgm, fga, tpm, tpa, ftm, fta,
          orb, drb, trb, ast, stl, blk, tov, pf, points
        FROM players
        WHERE team_id = $1
        ORDER BY minutes DESC
      `, [teamId]);
    }
    return NextResponse.json({ players: result.rows });
  } catch (error) {
    console.error('Database error:', error);
    return NextResponse.json({ error: 'Failed to fetch players' }, { status: 500 });
  }
}
