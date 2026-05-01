// scripts/ingest_3ssb.mjs
//
// adidas 3SSB ingest for boys 17U.
// Pulls from The Passport REST API, writes to Neon at PER-GAME grain.
//
// Usage (locally or in GitHub Action):
//   LEAGUE=17U EVENT_ID=262708 node scripts/ingest_3ssb.mjs
//
// Required env vars:
//   DATABASE_URL  - Neon connection string
//   LEAGUE        - one of: 17U  (16U / 15U not yet supported)
//   EVENT_ID      - Passport exposureEventId (e.g. 262708 for Session I 2026)
//   SEASON        - optional, defaults to '2026'
//
// Schema (run 01_schema.sql first):
//   adidas_3ssb_players          identity table (preserves manually-added height/grad_year/etc.)
//   adidas_3ssb_team_schedule    one row per team-perspective per game
//   adidas_3ssb_team_games       NEW: per-game team box totals (Passport team-totals row, NOT summed players)
//   adidas_3ssb_player_games     NEW: per-game player box rows
//   adidas_3ssb_team_stats       season aggregates, DERIVED from team_games at end of ingest
//   adidas_3ssb_player_stats     season aggregates, DERIVED from player_games at end of ingest
//
// Stats rule note:
//   3SSB FOLLOWS the standard rule (no exception needed) — Passport publishes
//   team and opponent totals directly in each box score, so we read them
//   straight from the box score's team-totals object rather than summing
//   player rows.
//
// Re-run safety:
//   This script DELETEs everything for (league, season) at the start of writeToDb,
//   then re-inserts. Safe to run repeatedly.

import pg from 'pg';

const { Client } = pg;

// ---------- CONFIG ----------

const SEASON = process.env.SEASON || '2026';
const LEAGUE_ARG = (process.env.LEAGUE || '').toUpperCase();
const EVENT_ID = process.env.EVENT_ID;

const DIVISIONS = {
  '17U': { divisionName: '17U', league: 'adidas 3SSB 17U' },
};

if (!DIVISIONS[LEAGUE_ARG]) {
  console.error(`ERROR: LEAGUE env var must be one of: ${Object.keys(DIVISIONS).join(', ')}`);
  console.error(`Got: "${process.env.LEAGUE}"`);
  process.exit(1);
}

if (!EVENT_ID) {
  console.error('ERROR: EVENT_ID env var is required (Passport exposureEventId)');
  process.exit(1);
}

const { divisionName, league } = DIVISIONS[LEAGUE_ARG];

console.log(`\n=== adidas 3SSB Ingest ===`);
console.log(`League: ${league}`);
console.log(`Season: ${SEASON}`);
console.log(`Passport exposureEventId: ${EVENT_ID}`);
console.log(`Division filter: ${divisionName}`);
console.log(`==========================\n`);

// ---------- API HELPERS ----------

const PASSPORT_BASE = 'https://api.the-passport.com/api';

async function passportGet(url, label) {
  const res = await fetch(url, { headers: { 'accept': 'application/json' } });
  if (!res.ok) {
    throw new Error(`${label} failed: ${res.status} ${res.statusText}`);
  }
  return res.json();
}

async function fetchSchedule() {
  console.log('Fetching schedule...');
  const url = `${PASSPORT_BASE}/events/exposure/games-with-ratings?exposureEventId=${EVENT_ID}&limit=1000`;
  const data = await passportGet(url, 'Schedule');
  const games = data?.data || [];
  console.log(`  Schedule returned ${games.length} games (raw, all divisions)`);
  return games;
}

function filterTargetGames(rawGames) {
  const filtered = rawGames.filter(g =>
    g.division?.name === divisionName &&
    g.homeTeam?.score != null &&
    g.awayTeam?.score != null
  );
  console.log(`  ${filtered.length} ${divisionName} completed games`);
  return filtered;
}

async function fetchBoxScore(gameId) {
  const url = `${PASSPORT_BASE}/games/exposure/${gameId}`;
  return passportGet(url, `Box score ${gameId}`);
}

// ---------- STAT NORMALIZATION ----------

function normalizePlayerRow(p) {
  const stats = p.stats || {};
  return {
    playerNumber: String(p.playerNumber || ''),
    playerName: p.firstName && p.lastName
      ? `${p.firstName} ${p.lastName}`.trim()
      : (p.firstName || p.lastName || '').trim(),
    minutes: Math.round(stats.minutes ?? 0),
    pts: stats.points ?? 0,
    reb: stats.rebounds ?? 0,
    oreb: stats.offensiveRebounds ?? 0,
    dreb: stats.defensiveRebounds ?? 0,
    ast: stats.assists ?? 0,
    stl: stats.steals ?? 0,
    blk: stats.blocks ?? 0,
    tov: stats.turnovers ?? 0,
    pf: stats.fouls ?? 0,
    fgm: stats.fieldGoalsMade ?? 0,
    fga: stats.fieldGoalsAttempted ?? 0,
    fg3m: stats.threePointMade ?? 0,
    fg3a: stats.threePointAttempted ?? 0,
    ftm: stats.freeThrowMade ?? 0,
    fta: stats.freeThrowAttempted ?? 0,
    isPresent: p.isPresent !== false,
  };
}

// Convert Passport team-totals object into our team stat shape.
// THIS IS THE KEY DIFFERENCE FROM THE EYBL PIPELINE — we use the team-totals
// row directly from Passport, not a sum of player rows.
function normalizeTeamTotals(teamObj) {
  const stats = teamObj?.stats || {};
  return {
    mp: Math.round(stats.minutes ?? 0),
    pts: stats.points ?? 0,
    reb: stats.rebounds ?? 0,
    oreb: stats.offensiveRebounds ?? 0,
    dreb: stats.defensiveRebounds ?? 0,
    ast: stats.assists ?? 0,
    stl: stats.steals ?? 0,
    blk: stats.blocks ?? 0,
    tov: stats.turnovers ?? 0,
    pf: stats.fouls ?? 0,
    fgm: stats.fieldGoalsMade ?? 0,
    fga: stats.fieldGoalsAttempted ?? 0,
    fg3m: stats.threePointMade ?? 0,
    fg3a: stats.threePointAttempted ?? 0,
    ftm: stats.freeThrowMade ?? 0,
    fta: stats.freeThrowAttempted ?? 0,
  };
}

// ---------- COLLECTION STATE ----------
//
// Per-game rows we'll insert. No more season-aggregate accumulation in JS —
// season totals get derived from these rows in the DB at the end.

const scheduleRows  = []; // existing schedule shape, one per team-perspective
const teamGameRows  = []; // NEW: per-game team box totals, one per team-perspective
const playerGameRows = []; // NEW: per-game player rows
const playerIdentities = new Map(); // playerNumber -> { playerName, teamName } (most recent seen)

// ---------- PROCESS ONE GAME ----------

async function processGame(scheduleRow) {
  const awayName = scheduleRow.awayTeam?.name;
  const homeName = scheduleRow.homeTeam?.name;
  const awayScore = scheduleRow.awayTeam?.score;
  const homeScore = scheduleRow.homeTeam?.score;

  let box;
  try {
    box = await fetchBoxScore(scheduleRow.id);
  } catch (err) {
    console.warn(`    SKIP: box score fetch failed: ${err.message}`);
    return;
  }

  const gameDate = box?.gameInfo?.startTime
    ? box.gameInfo.startTime.slice(0, 10)
    : null;

  console.log(`  ${gameDate || '(no date)'} | ${awayName} (${awayScore}) @ ${homeName} (${homeScore})`);

  if (!gameDate) {
    console.warn(`    SKIP: no game date in box score`);
    return;
  }

  const home = box.homeTeam;
  const away = box.awayTeam;

  if (!home || !away) {
    console.warn(`    SKIP: missing team data in box score`);
    return;
  }

  // Player rows (filter to only those who actually played)
  const awayRoster = (away.roster || []).map(normalizePlayerRow).filter(r => r.isPresent && r.playerNumber);
  const homeRoster = (home.roster || []).map(normalizePlayerRow).filter(r => r.isPresent && r.playerNumber);

  if (awayRoster.length === 0 || homeRoster.length === 0) {
    console.warn(`    SKIP: empty rosters (away: ${awayRoster.length}, home: ${homeRoster.length})`);
    return;
  }

  // Team totals — DIRECTLY from Passport's team.stats (NOT summed from players).
  const awayTeamTotals = normalizeTeamTotals(away);
  const homeTeamTotals = normalizeTeamTotals(home);

  const gameUuid = String(box.gameNumber || '');

  // ---- Schedule rows (one per perspective) ----
  scheduleRows.push({
    team: awayName, opponent: homeName,
    teamScore: awayScore, opponentScore: homeScore,
    isHome: false,
    gameUuid, scheduleId: scheduleRow.id, gameDate,
  });
  scheduleRows.push({
    team: homeName, opponent: awayName,
    teamScore: homeScore, opponentScore: awayScore,
    isHome: true,
    gameUuid, scheduleId: scheduleRow.id, gameDate,
  });

  // ---- Team_games rows (one per perspective) ----
  teamGameRows.push({
    team: awayName, opponent: homeName,
    isHome: false,
    gameUuid, scheduleId: scheduleRow.id, gameDate,
    self: awayTeamTotals, opp: homeTeamTotals,
  });
  teamGameRows.push({
    team: homeName, opponent: awayName,
    isHome: true,
    gameUuid, scheduleId: scheduleRow.id, gameDate,
    self: homeTeamTotals, opp: awayTeamTotals,
  });

  // ---- Player_games rows ----
  for (const p of awayRoster) {
    playerIdentities.set(p.playerNumber, { playerName: p.playerName, teamName: awayName });
    playerGameRows.push({
      playerNumber: p.playerNumber,
      team: awayName, opponent: homeName,
      isHome: false,
      gameUuid, scheduleId: scheduleRow.id, gameDate,
      stats: p,
    });
  }
  for (const p of homeRoster) {
    playerIdentities.set(p.playerNumber, { playerName: p.playerName, teamName: homeName });
    playerGameRows.push({
      playerNumber: p.playerNumber,
      team: homeName, opponent: awayName,
      isHome: true,
      gameUuid, scheduleId: scheduleRow.id, gameDate,
      stats: p,
    });
  }
}

// ---------- DB WRITE ----------

async function writeToDb(client) {
  console.log(`\nWriting to database...`);

  // ---- Wipe existing data for this (league, season) ----
  // Order matters: delete dependents first.
  // player_games and team_games key off (league, season).
  // player_stats keys off player_id, so delete via subquery.
  // schedule keys off (league, season).
  // players is the identity table, deleted last.

  await client.query(
    `DELETE FROM adidas_3ssb_team_games WHERE league = $1 AND season = $2`,
    [league, SEASON]
  );
  await client.query(
    `DELETE FROM adidas_3ssb_player_games WHERE league = $1 AND season = $2`,
    [league, SEASON]
  );
  await client.query(
    `DELETE FROM adidas_3ssb_team_schedule WHERE league = $1 AND season = $2`,
    [league, SEASON]
  );
  await client.query(
    `DELETE FROM adidas_3ssb_team_stats WHERE league = $1 AND season = $2`,
    [league, SEASON]
  );
  await client.query(
    `DELETE FROM adidas_3ssb_player_stats
     WHERE season = $1 AND player_id IN (
       SELECT id FROM adidas_3ssb_players WHERE league = $2 AND season = $1
     )`,
    [SEASON, league]
  );
  // Players table — keep manually-added height/grad_year by NOT deleting if
  // the row already exists. We only insert new ones below.
  console.log(`  Wiped existing rows for ${league} / ${SEASON}`);

  // ---- Schedule ----
  for (const r of scheduleRows) {
    await client.query(
      `INSERT INTO adidas_3ssb_team_schedule
         (team, league, season, game_date, opponent, team_score, opponent_score, is_home, game_uuid, schedule_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       ON CONFLICT (team, league, season, game_date, opponent) DO NOTHING`,
      [r.team, league, SEASON, r.gameDate, r.opponent, r.teamScore, r.opponentScore, r.isHome, r.gameUuid, r.scheduleId]
    );
  }
  console.log(`  Inserted ${scheduleRows.length} schedule rows`);

  // ---- Team_games ----
  for (const r of teamGameRows) {
    const s = r.self;
    const o = r.opp;
    await client.query(
      `INSERT INTO adidas_3ssb_team_games
         (team, opponent, league, season, game_date, game_uuid, schedule_id, is_home,
          mp, fgm, fga, fg3m, fg3a, ftm, fta, oreb, dreb, reb,
          ast, stl, blk, tov, pts, pf,
          opp_mp, opp_fgm, opp_fga, opp_fg3m, opp_fg3a, opp_ftm, opp_fta,
          opp_oreb, opp_dreb, opp_reb, opp_ast, opp_stl, opp_blk,
          opp_tov, opp_pts, opp_pf)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,
               $9,$10,$11,$12,$13,$14,$15,$16,$17,$18,
               $19,$20,$21,$22,$23,$24,
               $25,$26,$27,$28,$29,$30,$31,
               $32,$33,$34,$35,$36,$37,
               $38,$39,$40)
       ON CONFLICT (team, league, season, game_uuid) DO NOTHING`,
      [
        r.team, r.opponent, league, SEASON, r.gameDate, r.gameUuid, r.scheduleId, r.isHome,
        s.mp, s.fgm, s.fga, s.fg3m, s.fg3a, s.ftm, s.fta, s.oreb, s.dreb, s.reb,
        s.ast, s.stl, s.blk, s.tov, s.pts, s.pf,
        o.mp, o.fgm, o.fga, o.fg3m, o.fg3a, o.ftm, o.fta,
        o.oreb, o.dreb, o.reb, o.ast, o.stl, o.blk,
        o.tov, o.pts, o.pf,
      ]
    );
  }
  console.log(`  Inserted ${teamGameRows.length} team_games rows`);

  // ---- Players (identity) ----
  // Upsert by cerebro_player_id. Preserves any manually-added height/grad_year.
  const playerNumberToId = new Map();
  let newPlayers = 0;
  let existingPlayers = 0;
  for (const [playerNumber, identity] of playerIdentities) {
    const fullName = identity.playerName;
    const [firstName, ...rest] = fullName.split(' ');
    const lastName = rest.join(' ');

    const existing = await client.query(
      `SELECT id FROM adidas_3ssb_players
       WHERE cerebro_player_id = $1 AND league = $2 AND season = $3
       LIMIT 1`,
      [playerNumber, league, SEASON]
    );

    let playerId;
    if (existing.rowCount > 0) {
      playerId = existing.rows[0].id;
      existingPlayers += 1;
      // Update team in case the player switched teams between sessions
      await client.query(
        `UPDATE adidas_3ssb_players SET team = $1 WHERE id = $2`,
        [identity.teamName, playerId]
      );
    } else {
      const inserted = await client.query(
        `INSERT INTO adidas_3ssb_players
           (full_name, first_name, last_name, team, league, season, cerebro_player_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7)
         RETURNING id`,
        [fullName, firstName, lastName, identity.teamName, league, SEASON, playerNumber]
      );
      playerId = inserted.rows[0].id;
      newPlayers += 1;
    }
    playerNumberToId.set(playerNumber, playerId);
  }
  console.log(`  Players: ${newPlayers} new inserted, ${existingPlayers} existing preserved`);

  // ---- Player_games ----
  for (const r of playerGameRows) {
    const playerId = playerNumberToId.get(r.playerNumber);
    if (!playerId) {
      console.warn(`    WARN: no player id for ${r.playerNumber}, skipping player_game row`);
      continue;
    }
    const s = r.stats;
    await client.query(
      `INSERT INTO adidas_3ssb_player_games
         (player_id, team, opponent, league, season, game_date, game_uuid, schedule_id, is_home,
          mp, fgm, fga, fg3m, fg3a, ftm, fta, oreb, dreb, reb,
          ast, stl, blk, tov, pts, pf)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,
               $10,$11,$12,$13,$14,$15,$16,$17,$18,$19,
               $20,$21,$22,$23,$24,$25)
       ON CONFLICT (player_id, game_uuid) DO NOTHING`,
      [
        playerId, r.team, r.opponent, league, SEASON, r.gameDate, r.gameUuid, r.scheduleId, r.isHome,
        s.minutes, s.fgm, s.fga, s.fg3m, s.fg3a, s.ftm, s.fta,
        s.oreb, s.dreb, s.reb, s.ast, s.stl, s.blk, s.tov, s.pts, s.pf,
      ]
    );
  }
  console.log(`  Inserted ${playerGameRows.length} player_games rows`);

  // ---- Derive team_stats from team_games ----
  // Single source of truth: aggregate per-game rows back into season totals.
  await client.query(
    `INSERT INTO adidas_3ssb_team_stats
       (team, league, season, gp, mp,
        fgm, fga, fg3m, fg3a, ftm, fta,
        oreb, dreb, reb, ast, stl, blk, tov, pts, pf,
        opp_fgm, opp_fga, opp_fg3m, opp_fg3a, opp_ftm, opp_fta,
        opp_oreb, opp_dreb, opp_reb, opp_ast, opp_stl, opp_blk,
        opp_tov, opp_pts, opp_pf)
     SELECT
       team, league, season,
       COUNT(*)::int AS gp,
       SUM(mp)::int,
       SUM(fgm)::int, SUM(fga)::int, SUM(fg3m)::int, SUM(fg3a)::int,
       SUM(ftm)::int, SUM(fta)::int,
       SUM(oreb)::int, SUM(dreb)::int, SUM(reb)::int,
       SUM(ast)::int, SUM(stl)::int, SUM(blk)::int,
       SUM(tov)::int, SUM(pts)::int, SUM(pf)::int,
       SUM(opp_fgm)::int, SUM(opp_fga)::int, SUM(opp_fg3m)::int, SUM(opp_fg3a)::int,
       SUM(opp_ftm)::int, SUM(opp_fta)::int,
       SUM(opp_oreb)::int, SUM(opp_dreb)::int, SUM(opp_reb)::int,
       SUM(opp_ast)::int, SUM(opp_stl)::int, SUM(opp_blk)::int,
       SUM(opp_tov)::int, SUM(opp_pts)::int, SUM(opp_pf)::int
     FROM adidas_3ssb_team_games
     WHERE league = $1 AND season = $2
     GROUP BY team, league, season`,
    [league, SEASON]
  );
  const teamStatsCount = await client.query(
    `SELECT COUNT(*)::int AS c FROM adidas_3ssb_team_stats WHERE league = $1 AND season = $2`,
    [league, SEASON]
  );
  console.log(`  Derived ${teamStatsCount.rows[0].c} team_stats rows from team_games`);

  // ---- Derive player_stats from player_games ----
  await client.query(
    `INSERT INTO adidas_3ssb_player_stats
       (player_id, season, gp, mp,
        fgm, fga, fg3m, fg3a, ftm, fta,
        oreb, dreb, reb, ast, stl, blk, tov, pts, pf)
     SELECT
       pg.player_id, pg.season,
       COUNT(*)::int AS gp,
       SUM(pg.mp)::int,
       SUM(pg.fgm)::int, SUM(pg.fga)::int, SUM(pg.fg3m)::int, SUM(pg.fg3a)::int,
       SUM(pg.ftm)::int, SUM(pg.fta)::int,
       SUM(pg.oreb)::int, SUM(pg.dreb)::int, SUM(pg.reb)::int,
       SUM(pg.ast)::int, SUM(pg.stl)::int, SUM(pg.blk)::int,
       SUM(pg.tov)::int, SUM(pg.pts)::int, SUM(pg.pf)::int
     FROM adidas_3ssb_player_games pg
     WHERE pg.league = $1 AND pg.season = $2
     GROUP BY pg.player_id, pg.season`,
    [league, SEASON]
  );
  const playerStatsCount = await client.query(
    `SELECT COUNT(*)::int AS c FROM adidas_3ssb_player_stats WHERE season = $1
       AND player_id IN (SELECT id FROM adidas_3ssb_players WHERE league = $2 AND season = $1)`,
    [SEASON, league]
  );
  console.log(`  Derived ${playerStatsCount.rows[0].c} player_stats rows from player_games`);
}

// ---------- MAIN ----------

async function main() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error('ERROR: DATABASE_URL env var is required');
    process.exit(1);
  }

  const rawGames = await fetchSchedule();
  const target = filterTargetGames(rawGames);

  if (target.length === 0) {
    console.log('No games found for this division/event. Exiting.');
    return;
  }

  console.log(`\nProcessing ${target.length} games...`);
  for (let i = 0; i < target.length; i += 1) {
    try {
      await processGame(target[i]);
    } catch (err) {
      console.error(`  ERROR on game ${target[i].id}: ${err.message}`);
    }
  }

  console.log(`\nCollection complete:`);
  console.log(`  ${scheduleRows.length} schedule rows`);
  console.log(`  ${teamGameRows.length} team_games rows`);
  console.log(`  ${playerGameRows.length} player_games rows`);
  console.log(`  ${playerIdentities.size} unique players`);

  const client = new Client({ connectionString: dbUrl });
  await client.connect();
  try {
    await client.query('BEGIN');
    await writeToDb(client);
    await client.query('COMMIT');
    console.log('\n✅ Database write committed.');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('\n❌ Database write rolled back:', err.message);
    throw err;
  } finally {
    await client.end();
  }

  console.log('\nDone.\n');
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
