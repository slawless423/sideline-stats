import { NextResponse } from 'next/server';
import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.POSTGRES_URL,
  ssl: { rejectUnauthorized: false }
});

const D1_CONFERENCES = [
  'acc', 'big-12', 'big-ten', 'sec', 'pac-12', 'big-east',
  'american', 'aac', 'wcc', 'mwc', 'mountain-west', 'atlantic-10', 'a-10',
  'mvc', 'mac', 'cusa', 'sun-belt', 'sunbelt', 'colonial', 'caa',
  'horizon', 'maac', 'ovc', 'patriot', 'southland', 'summit-league',
  'wac', 'big-sky', 'big-south', 'southern', 'socon',
  'big-west', 'ivy-league', 'meac', 'nec', 'northeast', 'swac',
  'asun', 'america-east', 'americaeast'
];

export async function GET(
  request: Request,
  { params }: { params: Promise<{ teamId: string }> }
) {
  const { teamId } = await params;
  const { searchParams } = new URL(request.url);
  const confOnly = searchParams.get('conf') === 'true';
  const d1Only = searchParams.get('d1') === 'true';

  try {
    // Get team info and conference
    const teamInfo = await pool.query('SELECT team_name, conference FROM teams WHERE team_id = $1', [teamId]);
    const teamName = teamInfo.rows[0]?.team_name || '';
    const conference = teamInfo.rows[0]?.conference || '';
    
    // Build subquery to get list of game IDs that match filters
    let gameFilterSubquery = `
      SELECT game_id FROM games 
      WHERE (home_team_id = '${teamId}' OR away_team_id = '${teamId}')
    `;
    
    if (confOnly && conference) {
      gameFilterSubquery += `
        AND (
          (home_team_id = '${teamId}' AND away_team_id IN (SELECT team_id FROM teams WHERE conference = '${conference}'))
          OR
          (away_team_id = '${teamId}' AND home_team_id IN (SELECT team_id FROM teams WHERE conference = '${conference}'))
        )
      `;
    }
    
    if (d1Only) {
      const confList = D1_CONFERENCES.map(c => `'${c}'`).join(',');
      gameFilterSubquery += `
        AND home_team_id IN (SELECT team_id FROM teams WHERE conference IN (${confList}))
        AND away_team_id IN (SELECT team_id FROM teams WHERE conference IN (${confList}))
      `;
    }

    // Aggregate stats from filtered games
    const result = await pool.query(`
      SELECT
        COUNT(*) as games,
        SUM(CASE 
          WHEN home_team_id = '${teamId}' AND home_score > away_score THEN 1
          WHEN away_team_id = '${teamId}' AND away_score > home_score THEN 1
          ELSE 0
        END) as wins,
        SUM(CASE 
          WHEN home_team_id = '${teamId}' AND home_score < away_score THEN 1
          WHEN away_team_id = '${teamId}' AND away_score < home_score THEN 1
          ELSE 0
        END) as losses,
        
        SUM(CASE WHEN home_team_id = '${teamId}' THEN home_score ELSE away_score END) as points,
        SUM(CASE WHEN home_team_id = '${teamId}' THEN away_score ELSE home_score END) as opp_points,
        
        SUM(CASE WHEN home_team_id = '${teamId}' THEN home_fgm ELSE away_fgm END) as fgm,
        SUM(CASE WHEN home_team_id = '${teamId}' THEN home_fga ELSE away_fga END) as fga,
        SUM(CASE WHEN home_team_id = '${teamId}' THEN home_tpm ELSE away_tpm END) as tpm,
        SUM(CASE WHEN home_team_id = '${teamId}' THEN home_tpa ELSE away_tpa END) as tpa,
        SUM(CASE WHEN home_team_id = '${teamId}' THEN home_ftm ELSE away_ftm END) as ftm,
        SUM(CASE WHEN home_team_id = '${teamId}' THEN home_fta ELSE away_fta END) as fta,
        SUM(CASE WHEN home_team_id = '${teamId}' THEN home_orb ELSE away_orb END) as orb,
        SUM(CASE WHEN home_team_id = '${teamId}' THEN home_drb ELSE away_drb END) as drb,
        SUM(CASE WHEN home_team_id = '${teamId}' THEN home_trb ELSE away_trb END) as trb,
        SUM(CASE WHEN home_team_id = '${teamId}' THEN home_ast ELSE away_ast END) as ast,
        SUM(CASE WHEN home_team_id = '${teamId}' THEN home_stl ELSE away_stl END) as stl,
        SUM(CASE WHEN home_team_id = '${teamId}' THEN home_blk ELSE away_blk END) as blk,
        SUM(CASE WHEN home_team_id = '${teamId}' THEN home_tov ELSE away_tov END) as tov,
        SUM(CASE WHEN home_team_id = '${teamId}' THEN home_pf ELSE away_pf END) as pf,
        
        SUM(CASE WHEN home_team_id = '${teamId}' THEN away_fgm ELSE home_fgm END) as opp_fgm,
        SUM(CASE WHEN home_team_id = '${teamId}' THEN away_fga ELSE home_fga END) as opp_fga,
        SUM(CASE WHEN home_team_id = '${teamId}' THEN away_tpm ELSE home_tpm END) as opp_tpm,
        SUM(CASE WHEN home_team_id = '${teamId}' THEN away_tpa ELSE home_tpa END) as opp_tpa,
        SUM(CASE WHEN home_team_id = '${teamId}' THEN away_ftm ELSE home_ftm END) as opp_ftm,
        SUM(CASE WHEN home_team_id = '${teamId}' THEN away_fta ELSE home_fta END) as opp_fta,
        SUM(CASE WHEN home_team_id = '${teamId}' THEN away_orb ELSE home_orb END) as opp_orb,
        SUM(CASE WHEN home_team_id = '${teamId}' THEN away_drb ELSE home_drb END) as opp_drb,
        SUM(CASE WHEN home_team_id = '${teamId}' THEN away_trb ELSE home_trb END) as opp_trb,
        SUM(CASE WHEN home_team_id = '${teamId}' THEN away_ast ELSE home_ast END) as opp_ast,
        SUM(CASE WHEN home_team_id = '${teamId}' THEN away_stl ELSE home_stl END) as opp_stl,
        SUM(CASE WHEN home_team_id = '${teamId}' THEN away_blk ELSE home_blk END) as opp_blk,
        SUM(CASE WHEN home_team_id = '${teamId}' THEN away_tov ELSE home_tov END) as opp_tov,
        SUM(CASE WHEN home_team_id = '${teamId}' THEN away_pf ELSE home_pf END) as opp_pf
      FROM games
      WHERE game_id IN (${gameFilterSubquery})
    `);

    if (!result.rows[0] || result.rows[0].games === 0 || result.rows[0].games === '0') {
      return NextResponse.json({ 
        error: 'No games found',
        teamId,
        teamName,
        conference,
        games: 0
      }, { status: 404 });
    }

    const row = result.rows[0];
    
    return NextResponse.json({
      teamId,
      teamName,
      conference,
      games: parseInt(row.games) || 0,
      wins: parseInt(row.wins) || 0,
      losses: parseInt(row.losses) || 0,
      points: parseInt(row.points) || 0,
      opp_points: parseInt(row.opp_points) || 0,
      fgm: parseInt(row.fgm) || 0,
      fga: parseInt(row.fga) || 0,
      tpm: parseInt(row.tpm) || 0,
      tpa: parseInt(row.tpa) || 0,
      ftm: parseInt(row.ftm) || 0,
      fta: parseInt(row.fta) || 0,
      orb: parseInt(row.orb) || 0,
      drb: parseInt(row.drb) || 0,
      trb: parseInt(row.trb) || 0,
      ast: parseInt(row.ast) || 0,
      stl: parseInt(row.stl) || 0,
      blk: parseInt(row.blk) || 0,
      tov: parseInt(row.tov) || 0,
      pf: parseInt(row.pf) || 0,
      opp_fgm: parseInt(row.opp_fgm) || 0,
      opp_fga: parseInt(row.opp_fga) || 0,
      opp_tpm: parseInt(row.opp_tpm) || 0,
      opp_tpa: parseInt(row.opp_tpa) || 0,
      opp_ftm: parseInt(row.opp_ftm) || 0,
      opp_fta: parseInt(row.opp_fta) || 0,
      opp_orb: parseInt(row.opp_orb) || 0,
      opp_drb: parseInt(row.opp_drb) || 0,
      opp_trb: parseInt(row.opp_trb) || 0,
      opp_ast: parseInt(row.opp_ast) || 0,
      opp_stl: parseInt(row.opp_stl) || 0,
      opp_blk: parseInt(row.opp_blk) || 0,
      opp_tov: parseInt(row.opp_tov) || 0,
      opp_pf: parseInt(row.opp_pf) || 0,
      adjO: null,
      adjD: null,
      adjEM: null,
      adjT: null,
    });
  } catch (error) {
    console.error('Database error:', error);
    return NextResponse.json({ error: 'Failed to fetch filtered stats', details: String(error) }, { status: 500 });
  }
}

export {};
