import pg from 'pg';
const { Pool } = pg;

// Database connection pool
let pool = null;

export function initDb() {
  if (pool) return pool;
  
  pool = new Pool({
    connectionString: process.env.POSTGRES_URL,
    ssl: { rejectUnauthorized: false }
  });
  
  return pool;
}

export async function closeDb() {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

// Clear all data (for fresh rebuild)
export async function clearAllData() {
  const db = initDb();
  
  await db.query('DELETE FROM player_games');
  await db.query('DELETE FROM players');
  await db.query('DELETE FROM games');
  await db.query('DELETE FROM teams');
  
  console.log('✅ Cleared all existing data');
}

// Clear data for specific division only
export async function clearDivisionData(division) {
  const db = initDb();
  
  await db.query('DELETE FROM player_games WHERE division = $1', [division]);
  await db.query('DELETE FROM players WHERE division = $1', [division]);
  await db.query('DELETE FROM games WHERE division = $1', [division]);
  await db.query('DELETE FROM teams WHERE division = $1', [division]);
  
  console.log(`✅ Cleared existing data for division: ${division}`);
}

// Insert or update team
export async function upsertTeam(team) {
  const db = initDb();
  
  const query = `
    INSERT INTO teams (
      team_id, team_name, conference, division, games, wins, losses,
      adj_o, adj_d, adj_em, adj_t,
      points, opp_points,
      fgm, fga, tpm, tpa, ftm, fta,
      orb, drb, trb, ast, stl, blk, tov, pf,
      opp_fgm, opp_fga, opp_tpm, opp_tpa, opp_ftm, opp_fta,
      opp_orb, opp_drb, opp_trb, opp_ast, opp_stl, opp_blk, opp_tov, opp_pf,
      updated_at
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11,
      $12, $13, $14, $15, $16, $17, $18, $19,
      $20, $21, $22, $23, $24, $25, $26, $27,
      $28, $29, $30, $31, $32, $33,
      $34, $35, $36, $37, $38, $39, $40, $41,
      CURRENT_TIMESTAMP
    )
    ON CONFLICT (team_id) DO UPDATE SET
      team_name = EXCLUDED.team_name,
      conference = EXCLUDED.conference,
      division = EXCLUDED.division,
      games = EXCLUDED.games,
      wins = EXCLUDED.wins,
      losses = EXCLUDED.losses,
      adj_o = EXCLUDED.adj_o,
      adj_d = EXCLUDED.adj_d,
      adj_em = EXCLUDED.adj_em,
      adj_t = EXCLUDED.adj_t,
      points = EXCLUDED.points,
      opp_points = EXCLUDED.opp_points,
      fgm = EXCLUDED.fgm,
      fga = EXCLUDED.fga,
      tpm = EXCLUDED.tpm,
      tpa = EXCLUDED.tpa,
      ftm = EXCLUDED.ftm,
      fta = EXCLUDED.fta,
      orb = EXCLUDED.orb,
      drb = EXCLUDED.drb,
      trb = EXCLUDED.trb,
      ast = EXCLUDED.ast,
      stl = EXCLUDED.stl,
      blk = EXCLUDED.blk,
      tov = EXCLUDED.tov,
      pf = EXCLUDED.pf,
      opp_fgm = EXCLUDED.opp_fgm,
      opp_fga = EXCLUDED.opp_fga,
      opp_tpm = EXCLUDED.opp_tpm,
      opp_tpa = EXCLUDED.opp_tpa,
      opp_ftm = EXCLUDED.opp_ftm,
      opp_fta = EXCLUDED.opp_fta,
      opp_orb = EXCLUDED.opp_orb,
      opp_drb = EXCLUDED.opp_drb,
      opp_trb = EXCLUDED.opp_trb,
      opp_ast = EXCLUDED.opp_ast,
      opp_stl = EXCLUDED.opp_stl,
      opp_blk = EXCLUDED.opp_blk,
      opp_tov = EXCLUDED.opp_tov,
      opp_pf = EXCLUDED.opp_pf,
      updated_at = CURRENT_TIMESTAMP
  `;
  
  await db.query(query, [
    team.teamId, team.teamName, team.conference, team.division || null, team.games, team.wins, team.losses,
    team.adjO, team.adjD, team.adjEM, team.adjT,
    team.points, team.opp_points,
    team.fgm, team.fga, team.tpm, team.tpa, team.ftm, team.fta,
    team.orb, team.drb, team.trb, team.ast, team.stl, team.blk, team.tov, team.pf,
    team.opp_fgm, team.opp_fga, team.opp_tpm, team.opp_tpa, team.opp_ftm, team.opp_fta,
    team.opp_orb, team.opp_drb, team.opp_trb, team.opp_ast, team.opp_stl, team.opp_blk, team.opp_tov, team.opp_pf
  ]);
}

// Insert game
export async function insertGame(game) {
  const db = initDb();
  
  const query = `
    INSERT INTO games (
      game_id, game_date, division,
      home_team_id, home_team_name, home_score, home_conference,
      away_team_id, away_team_name, away_score, away_conference,
      is_conference_game,
      home_fgm, home_fga, home_tpm, home_tpa, home_ftm, home_fta,
      home_orb, home_drb, home_trb, home_ast, home_stl, home_blk, home_tov, home_pf,
      away_fgm, away_fga, away_tpm, away_tpa, away_ftm, away_fta,
      away_orb, away_drb, away_trb, away_ast, away_stl, away_blk, away_tov, away_pf
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12,
      $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26,
      $27, $28, $29, $30, $31, $32, $33, $34, $35, $36, $37, $38, $39, $40
    )
    ON CONFLICT (game_id) DO NOTHING
  `;
  
  await db.query(query, [
    game.gameId, game.date, game.division || null,
    game.homeId, game.homeTeam, game.homeScore, game.homeConf,
    game.awayId, game.awayTeam, game.awayScore, game.awayConf,
    game.isConferenceGame,
    game.homeStats.fgm, game.homeStats.fga, game.homeStats.tpm, game.homeStats.tpa,
    game.homeStats.ftm, game.homeStats.fta, game.homeStats.orb, game.homeStats.drb,
    game.homeStats.trb, game.homeStats.ast, game.homeStats.stl, game.homeStats.blk,
    game.homeStats.tov, game.homeStats.pf,
    game.awayStats.fgm, game.awayStats.fga, game.awayStats.tpm, game.awayStats.tpa,
    game.awayStats.ftm, game.awayStats.fta, game.awayStats.orb, game.awayStats.drb,
    game.awayStats.trb, game.awayStats.ast, game.awayStats.stl, game.awayStats.blk,
    game.awayStats.tov, game.awayStats.pf
  ]);
}

// Insert or update player
export async function upsertPlayer(player) {
  const db = initDb();
  
  const query = `
    INSERT INTO players (
      player_id, team_id, team_name, division,
      first_name, last_name, number, position, year,
      games, starts, minutes,
      fgm, fga, tpm, tpa, ftm, fta,
      orb, drb, trb, ast, stl, blk, tov, pf, points,
      updated_at
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12,
      $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27,
      CURRENT_TIMESTAMP
    )
    ON CONFLICT (player_id) DO UPDATE SET
      division = EXCLUDED.division,
      games = EXCLUDED.games,
      starts = EXCLUDED.starts,
      minutes = EXCLUDED.minutes,
      fgm = EXCLUDED.fgm,
      fga = EXCLUDED.fga,
      tpm = EXCLUDED.tpm,
      tpa = EXCLUDED.tpa,
      ftm = EXCLUDED.ftm,
      fta = EXCLUDED.fta,
      orb = EXCLUDED.orb,
      drb = EXCLUDED.drb,
      trb = EXCLUDED.trb,
      ast = EXCLUDED.ast,
      stl = EXCLUDED.stl,
      blk = EXCLUDED.blk,
      tov = EXCLUDED.tov,
      pf = EXCLUDED.pf,
      points = EXCLUDED.points,
      updated_at = CURRENT_TIMESTAMP
  `;
  
  await db.query(query, [
    player.playerId, player.teamId, player.teamName, player.division || null,
    player.firstName, player.lastName, 
    player.number && !isNaN(parseInt(player.number)) ? parseInt(player.number) : null, 
    player.position, player.year,
    player.games, player.starts, player.minutes,
    player.fgm, player.fga, player.tpm, player.tpa, player.ftm, player.fta,
    player.orb, player.drb, player.trb, player.ast, player.stl, player.blk, player.tov, player.pf, player.points
  ]);
}

// Insert player game stats
export async function insertPlayerGame(gameId, playerId, teamId, stats) {
  const db = initDb();
  
  const query = `
    INSERT INTO player_games (
      game_id, player_id, team_id, division,
      minutes, fgm, fga, tpm, tpa, ftm, fta,
      orb, drb, trb, ast, stl, blk, tov, pf, points
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20
    )
    ON CONFLICT (game_id, player_id) DO NOTHING
  `;
  
  await db.query(query, [
    gameId, playerId, teamId, stats.division || null,
    stats.minutes, stats.fgm, stats.fga, stats.tpm, stats.tpa, stats.ftm, stats.fta,
    stats.orb, stats.drb, stats.trb, stats.ast, stats.stl, stats.blk, stats.tov, stats.pf, stats.points
  ]);
}
