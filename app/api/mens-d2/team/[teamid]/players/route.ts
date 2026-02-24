import { Pool } from 'pg';
import { NextResponse } from 'next/server';

const pool = new Pool({
  connectionString: process.env.POSTGRES_URL,
  ssl: { rejectUnauthorized: false }
});

export async function GET(
  request: Request,
  { params }: { params: Promise<{ teamid: string }> }
) {
  const { teamid } = await params;
  const { searchParams } = new URL(request.url);
  const confOnly = searchParams.get('conf') === 'true';

  try {
    let result;

    if (confOnly) {
      // Sum player stats from only conference games using player_games table
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
          COUNT(pg.game_id) as "games",
          p.starts,
          SUM(pg.minutes) as "minutes",
          SUM(pg.fgm) as "fgm", SUM(pg.fga) as "fga",
          SUM(pg.tpm) as "tpm", SUM(pg.tpa) as "tpa",
          SUM(pg.ftm) as "ftm", SUM(pg.fta) as "fta",
          SUM(pg.orb) as "orb", SUM(pg.drb) as "drb", SUM(pg.trb) as "trb",
          SUM(pg.ast) as "ast", SUM(pg.stl) as "stl", SUM(pg.blk) as "blk",
          SUM(pg.tov) as "tov", SUM(pg.pf) as "pf", SUM(pg.points) as "points"
        FROM players p
        JOIN player_games pg ON pg.player_id = p.player_id
        JOIN games g ON g.game_id = pg.game_id
        WHERE p.team_id = $1
          AND p.division = 'mens-d2'
          AND g.division = 'mens-d2'
          AND g.is_conference_game = true
          AND (g.home_team_id = $1 OR g.away_team_id = $1)
        GROUP BY 
          p.player_id, p.team_id, p.team_name, p.first_name, p.last_name,
          p.number, p.position, p.year, p.starts
        HAVING SUM(pg.points) > 0 OR SUM(pg.minutes) > 0
        ORDER BY SUM(pg.points) DESC
      `, [teamid]);
    } else {
      // Full season totals from players table
      result = await pool.query(`
        SELECT 
          player_id as "playerId",
          team_id as "teamId",
          team_name as "teamName",
          first_name as "firstName",
          last_name as "lastName",
          number,
          position,
          year,
          games,
          starts,
          minutes,
          fgm, fga, tpm, tpa, ftm, fta,
          orb, drb, trb, ast, stl, blk, tov, pf, points
        FROM players 
        WHERE team_id = $1 AND division = 'mens-d2'
        ORDER BY points DESC
      `, [teamid]);
    }

    return NextResponse.json({ players: result.rows });
  } catch (error) {
    console.error('Database error:', error);
    return NextResponse.json({ error: 'Failed to fetch players' }, { status: 500 });
  }
}
