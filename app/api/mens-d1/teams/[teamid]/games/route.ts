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
    const whereClause = confOnly
      ? `WHERE (home_team_id = $1 OR away_team_id = $1) AND division = 'mens-d1' AND is_conference_game = true`
      : `WHERE (home_team_id = $1 OR away_team_id = $1) AND division = 'mens-d1'`;

    const result = await pool.query(`
      SELECT 
        game_id as "gameId",
        game_date as "gameDate",
        home_team_id as "homeId",
        home_team_name as "homeTeam",
        home_score as "homeScore",
        away_team_id as "awayId",
        away_team_name as "awayTeam",
        away_score as "awayScore",
        is_conference_game as "isConferenceGame",
        home_fgm, home_fga, home_tpm, home_tpa, home_ftm, home_fta,
        home_orb, home_drb, home_trb, home_ast, home_stl, home_blk, home_tov, home_pf,
        away_fgm, away_fga, away_tpm, away_tpa, away_ftm, away_fta,
        away_orb, away_drb, away_trb, away_ast, away_stl, away_blk, away_tov, away_pf
      FROM games 
      ${whereClause}
      ORDER BY game_date ASC
    `, [teamid]);

    const games = result.rows.map(row => ({
      gameId: row.gameId,
      gameDate: row.gameDate,
      homeId: row.homeId,
      homeTeam: row.homeTeam,
      homeScore: row.homeScore,
      awayId: row.awayId,
      awayTeam: row.awayTeam,
      awayScore: row.awayScore,
      isConferenceGame: row.isConferenceGame,
      homeStats: {
        fgm: row.home_fgm, fga: row.home_fga,
        tpm: row.home_tpm, tpa: row.home_tpa,
        ftm: row.home_ftm, fta: row.home_fta,
        orb: row.home_orb, drb: row.home_drb, trb: row.home_trb,
        ast: row.home_ast, stl: row.home_stl, blk: row.home_blk,
        tov: row.home_tov, pf: row.home_pf,
      },
      awayStats: {
        fgm: row.away_fgm, fga: row.away_fga,
        tpm: row.away_tpm, tpa: row.away_tpa,
        ftm: row.away_ftm, fta: row.away_fta,
        orb: row.away_orb, drb: row.away_drb, trb: row.away_trb,
        ast: row.away_ast, stl: row.away_stl, blk: row.away_blk,
        tov: row.away_tov, pf: row.away_pf,
      }
    }));

    return NextResponse.json({ games });
  } catch (error) {
    console.error('Database error:', error);
    return NextResponse.json({ error: 'Failed to fetch games' }, { status: 500 });
  }
}
