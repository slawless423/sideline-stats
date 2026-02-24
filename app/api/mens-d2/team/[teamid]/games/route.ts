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
  try {
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
        home_fgm as "homeFgm", home_fga as "homeFga",
        home_tpm as "homeTpm", home_tpa as "homeTpa",
        home_ftm as "homeFtm", home_fta as "homeFta",
        home_orb as "homeOrb", home_drb as "homeDrb", home_trb as "homeTrb",
        home_ast as "homeAst", home_stl as "homeStl", home_blk as "homeBlk",
        home_tov as "homeTov", home_pf as "homePf",
        away_fgm as "awayFgm", away_fga as "awayFga",
        away_tpm as "awayTpm", away_tpa as "awayTpa",
        away_ftm as "awayFtm", away_fta as "awayFta",
        away_orb as "awayOrb", away_drb as "awayDrb", away_trb as "awayTrb",
        away_ast as "awayAst", away_stl as "awayStl", away_blk as "awayBlk",
        away_tov as "awayTov", away_pf as "awayPf"
      FROM games 
      WHERE (home_team_id = $1 OR away_team_id = $1)
        AND division = 'mens-d2'
      ORDER BY game_date ASC
    `, [teamid]);
    return NextResponse.json({ games: result.rows });
  } catch (error) {
    console.error('Database error:', error);
    return NextResponse.json({ error: 'Failed to fetch games' }, { status: 500 });
  }
}
