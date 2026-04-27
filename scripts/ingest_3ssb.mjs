// scripts/ingest_3ssb.mjs
//
// adidas 3SSB ingest for boys 17U.
// Pulls from The Passport REST API, writes to Neon.
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
// Stats rule note:
//   3SSB FOLLOWS the standard rule (no exception needed) — Passport publishes
//   team and opponent totals directly in each box score, so we read them
//   straight from the box score's team-totals object rather than summing
//   player rows.

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
  // Keep only this division's completed games
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

// Convert Passport player row to our schema field names.
// Passport gives separate twoPoint*/threePoint*/fieldGoal* objects with made/missed/attempted/percentage.
function normalizePlayerRow(p) {
  const stats = p.stats || {};

  // Field goals (combined 2 + 3)
  const fg = stats.fieldGoals || {};
  const tp = stats.threePoint || {};
  const ft = stats.freeThrow || {};
  const reb = stats.rebounds || {};

  return {
    playerNumber: String(p.playerNumber || ''),  // stable Passport ID
    playerName: p.firstName && p.lastName
      ? `${p.firstName} ${p.lastName}`.trim()
      : (p.firstName || p.lastName || '').trim(),
    minutes: Math.round(stats.minutes ?? 0),
    pts: stats.points ?? 0,
    reb: reb.total ?? 0,
    oreb: reb.offensive ?? 0,
    dreb: reb.defensive ?? 0,
    ast: stats.assists ?? 0,
    stl: stats.steals ?? 0,
    blk: stats.blocks ?? 0,
    tov: stats.turnovers ?? 0,
    pf: stats.fouls ?? 0,
    fgm: fg.made ?? 0,
    fga: fg.attempted ?? 0,
    fg3m: tp.made ?? 0,
    fg3a: tp.attempted ?? 0,
    ftm: ft.made ?? 0,
    fta: ft.attempted ?? 0,
    isPresent: p.isPresent !== false,
  };
}

// Convert Passport team-totals object into our team stat shape.
// THIS IS THE KEY DIFFERENCE FROM THE EYBL PIPELINE — we use the team-totals
// row directly from Passport, not a sum of player rows.
function normalizeTeamTotals(teamObj) {
  const stats = teamObj?.stats || {};
  const fg = stats.fieldGoals || {};
  const tp = stats.threePoint || {};
  const ft = stats.freeThrow || {};
  const reb = stats.rebounds || {};

  return {
    mp: 0, // Passport doesn't expose team-level minutes; we fall back to summing players if needed
    pts: stats.points ?? 0,
    reb: reb.total ?? 0,
    oreb: reb.offensive ?? 0,
    dreb: reb.defensive ?? 0,
    ast: stats.assists ?? 0,
    stl: stats.steals ?? 0,
    blk: stats.blocks ?? 0,
    tov: stats.turnovers ?? 0,
    pf: stats.fouls ?? 0,
    fgm: fg.made ?? 0,
    fga: fg.attempted ?? 0,
    fg3m: tp.made ?? 0,
    fg3a: tp.attempted ?? 0,
    ftm: ft.made ?? 0,
    fta: ft.attempted ?? 0,
  };
}

// ---------- AGGREGATION STATE ----------

// Per-player season totals, keyed by Passport playerNumber (stable across games).
// Each entry tracks the player's identity (name + team) and accumulated stats.
const playerAgg = new Map();
// Per-team season totals, keyed by team name.
const teamAgg = new Map();
// Schedule rows to insert (one per team-perspective per game).
const scheduleRows = [];

function getPlayerAgg(playerNumber, playerName, teamName) {
  if (!playerAgg.has(playerNumber)) {
    playerAgg.set(playerNumber, {
      playerNumber, playerName, teamName,
      gp: 0, mp: 0,
      fgm: 0, fga: 0, fg3m: 0, fg3a: 0, ftm: 0, fta: 0,
      oreb: 0, dreb: 0, reb: 0, ast: 0, stl: 0, blk: 0, tov: 0, pts: 0, pf: 0,
    });
  }
  return playerAgg.get(playerNumber);
}

function getTeamAgg(teamName) {
  if (!teamAgg.has(teamName)) {
    teamAgg.set(teamName, {
      teamName,
      gp: 0, mp: 0,
      fgm: 0, fga: 0, fg3m: 0, fg3a: 0, ftm: 0, fta: 0,
      oreb: 0, dreb: 0, reb: 0, ast: 0, stl: 0, blk: 0, tov: 0, pts: 0, pf: 0,
      opp_fgm: 0, opp_fga: 0, opp_fg3m: 0, opp_fg3a: 0, opp_ftm: 0, opp_fta: 0,
      opp_oreb: 0, opp_dreb: 0, opp_reb: 0, opp_ast: 0, opp_stl: 0, opp_blk: 0,
      opp_tov: 0, opp_pts: 0, opp_pf: 0,
    });
  }
  return teamAgg.get(teamName);
}

// ---------- PROCESS ONE GAME ----------

async function processGame(scheduleRow) {
  const awayName = scheduleRow.awayTeam?.name;
  const homeName = scheduleRow.homeTeam?.name;
  const awayScore = scheduleRow.awayTeam?.score;
  const homeScore = scheduleRow.homeTeam?.score;
  const gameDate = scheduleRow.gameInfo?.startTime
    ? scheduleRow.gameInfo.startTime.slice(0, 10)
    : null;

  console.log(`  ${gameDate || '(no date)'} | ${awayName} (${awayScore}) @ ${homeName} (${homeScore})`);

  let box;
  try {
    box = await fetchBoxScore(scheduleRow.id);
  } catch (err) {
    console.warn(`    SKIP: box score fetch failed: ${err.message}`);
    return;
  }

  const home = box.homeTeam;
  const away = box.awayTeam;

  if (!home || !away) {
    console.warn(`    SKIP: missing team data in box score`);
    return;
  }

  // Roster validation: Passport's home/away in box score should match schedule
  if (home.name !== homeName || away.name !== awayName) {
    console.warn(`    SKIP: team name mismatch — schedule (${awayName} @ ${homeName}) vs box (${away.name} @ ${home.name})`);
    return;
  }

  // Player rows (filter to only those who actually played)
  const awayRoster = (away.roster || []).map(normalizePlayerRow).filter(r => r.isPresent && r.playerNumber);
  const homeRoster = (home.roster || []).map(normalizePlayerRow).filter(r => r.isPresent && r.playerNumber);

  if (awayRoster.length === 0 || homeRoster.length === 0) {
    console.warn(`    SKIP: empty rosters (away: ${awayRoster.length}, home: ${homeRoster.length})`);
    return;
  }

  // Aggregate player stats
  for (const p of awayRoster) {
    const agg = getPlayerAgg(p.playerNumber, p.playerName, awayName);
    agg.gp   += 1;
    agg.mp   += p.minutes;
    agg.fgm  += p.fgm;   agg.fga  += p.fga;
    agg.fg3m += p.fg3m;  agg.fg3a += p.fg3a;
    agg.ftm  += p.ftm;   agg.fta  += p.fta;
    agg.oreb += p.oreb;  agg.dreb += p.dreb;  agg.reb += p.reb;
    agg.ast  += p.ast;   agg.stl  += p.stl;   agg.blk += p.blk;
    agg.tov  += p.tov;   agg.pts  += p.pts;   agg.pf  += p.pf;
  }
  for (const p of homeRoster) {
    const agg = getPlayerAgg(p.playerNumber, p.playerName, homeName);
    agg.gp   += 1;
    agg.mp   += p.minutes;
    agg.fgm  += p.fgm;   agg.fga  += p.fga;
    agg.fg3m += p.fg3m;  agg.fg3a += p.fg3a;
    agg.ftm  += p.ftm;   agg.fta  += p.fta;
    agg.oreb += p.oreb;  agg.dreb += p.dreb;  agg.reb += p.reb;
    agg.ast  += p.ast;   agg.stl  += p.stl;   agg.blk += p.blk;
    agg.tov  += p.tov;   agg.pts  += p.pts;   agg.pf  += p.pf;
  }

  // Aggregate team totals — DIRECTLY from Passport's team.stats (NOT summed from players).
  // This is the standard rule, not the EYBL exception.
  const awayTeamTotals = normalizeTeamTotals(away);
  const homeTeamTotals = normalizeTeamTotals(home);

  // Approximate team minutes by summing roster minutes (Passport doesn't expose team-level mp)
  awayTeamTotals.mp = awayRoster.reduce((s, r) => s + r.minutes, 0);
  homeTeamTotals.mp = homeRoster.reduce((s, r) => s + r.minutes, 0);

  const awayTeam = getTeamAgg(awayName);
  awayTeam.gp += 1;
  awayTeam.mp   += awayTeamTotals.mp;
  awayTeam.fgm  += awayTeamTotals.fgm;   awayTeam.fga  += awayTeamTotals.fga;
  awayTeam.fg3m += awayTeamTotals.fg3m;  awayTeam.fg3a += awayTeamTotals.fg3a;
  awayTeam.ftm  += awayTeamTotals.ftm;   awayTeam.fta  += awayTeamTotals.fta;
  awayTeam.oreb += awayTeamTotals.oreb;  awayTeam.dreb += awayTeamTotals.dreb;
  awayTeam.reb  += awayTeamTotals.reb;   awayTeam.ast  += awayTeamTotals.ast;
  awayTeam.stl  += awayTeamTotals.stl;   awayTeam.blk  += awayTeamTotals.blk;
  awayTeam.tov  += awayTeamTotals.tov;   awayTeam.pts  += awayTeamTotals.pts;
  awayTeam.pf   += awayTeamTotals.pf;
  awayTeam.opp_fgm  += homeTeamTotals.fgm;   awayTeam.opp_fga  += homeTeamTotals.fga;
  awayTeam.opp_fg3m += homeTeamTotals.fg3m;  awayTeam.opp_fg3a += homeTeamTotals.fg3a;
  awayTeam.opp_ftm  += homeTeamTotals.ftm;   awayTeam.opp_fta  += homeTeamTotals.fta;
  awayTeam.opp_oreb += homeTeamTotals.oreb;  awayTeam.opp_dreb += homeTeamTotals.dreb;
  awayTeam.opp_reb  += homeTeamTotals.reb;   awayTeam.opp_ast  += homeTeamTotals.ast;
  awayTeam.opp_stl  += homeTeamTotals.stl;   awayTeam.opp_blk  += homeTeamTotals.blk;
  awayTeam.opp_tov  += homeTeamTotals.tov;   awayTeam.opp_pts  += homeTeamTotals.pts;
  awayTeam.opp_pf   += homeTeamTotals.pf;

  const homeTeam = getTeamAgg(homeName);
  homeTeam.gp += 1;
  homeTeam.mp   += homeTeamTotals.mp;
  homeTeam.fgm  += homeTeamTotals.fgm;   homeTeam.fga  += homeTeamTotals.fga;
  homeTeam.fg3m += homeTeamTotals.fg3m;  homeTeam.fg3a += homeTeamTotals.fg3a;
  homeTeam.ftm  += homeTeamTotals.ftm;   homeTeam.fta  += homeTeamTotals.fta;
  homeTeam.oreb += homeTeamTotals.oreb;  homeTeam.dreb += homeTeamTotals.dreb;
  homeTeam.reb  += homeTeamTotals.reb;   homeTeam.ast  += homeTeamTotals.ast;
  homeTeam.stl  += homeTeamTotals.stl;   homeTeam.blk  += homeTeamTotals.blk;
  homeTeam.tov  += homeTeamTotals.tov;   homeTeam.pts  += homeTeamTotals.pts;
  homeTeam.pf   += homeTeamTotals.pf;
  homeTeam.opp_fgm  += awayTeamTotals.fgm;   homeTeam.opp_fga  += awayTeamTotals.fga;
  homeTeam.opp_fg3m += awayTeamTotals.fg3m;  homeTeam.opp_fg3a += awayTeamTotals.fg3a;
  homeTeam.opp_ftm  += awayTeamTotals.ftm;   homeTeam.opp_fta  += awayTeamTotals.fta;
  homeTeam.opp_oreb += awayTeamTotals.oreb;  homeTeam.opp_dreb += awayTeamTotals.dreb;
  homeTeam.opp_reb  += awayTeamTotals.reb;   homeTeam.opp_ast  += awayTeamTotals.ast;
  homeTeam.opp_stl  += awayTeamTotals.stl;   homeTeam.opp_blk  += awayTeamTotals.blk;
  homeTeam.opp_tov  += awayTeamTotals.tov;   homeTeam.opp_pts  += awayTeamTotals.pts;
  homeTeam.opp_pf   += awayTeamTotals.pf;

  // Schedule rows (one per perspective)
  scheduleRows.push({
    team: awayName, opponent: homeName,
    teamScore: awayScore, opponentScore: homeScore,
    isHome: false,
    gameUuid: String(box.gameNumber || ''),
    scheduleId: scheduleRow.id,
    gameDate,
  });
  scheduleRows.push({
    team: homeName, opponent: awayName,
    teamScore: homeScore, opponentScore: awayScore,
    isHome: true,
    gameUuid: String(box.gameNumber || ''),
    scheduleId: scheduleRow.id,
    gameDate,
  });
}

// ---------- DB WRITE ----------

async function writeToDb(client) {
  console.log(`\nWriting to database...`);

  const delSched = await client.query(
    `DELETE FROM adidas_3ssb_team_schedule WHERE league = $1 AND season = $2`,
    [league, SEASON]
  );
  console.log(`  Deleted ${delSched.rowCount} old schedule rows`);

  const delTeam = await client.query(
    `DELETE FROM adidas_3ssb_team_stats WHERE league = $1 AND season = $2`,
    [league, SEASON]
  );
  console.log(`  Deleted ${delTeam.rowCount} old team_stats rows`);

  const delPlayer = await client.query(
    `DELETE FROM adidas_3ssb_player_stats
     WHERE season = $1 AND player_id IN (
       SELECT id FROM adidas_3ssb_players WHERE league = $2 AND season = $1
     )`,
    [SEASON, league]
  );
  console.log(`  Deleted ${delPlayer.rowCount} old player_stats rows`);

  // Insert schedule rows
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

  // Insert team stats
  for (const t of teamAgg.values()) {
    await client.query(
      `INSERT INTO adidas_3ssb_team_stats
         (team, league, season, gp, mp,
          fgm, fga, fg3m, fg3a, ftm, fta,
          oreb, dreb, reb, ast, stl, blk, tov, pts, pf,
          opp_fgm, opp_fga, opp_fg3m, opp_fg3a, opp_ftm, opp_fta,
          opp_oreb, opp_dreb, opp_reb, opp_ast, opp_stl, opp_blk,
          opp_tov, opp_pts, opp_pf)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,
               $21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,$33,$34,$35)`,
      [
        t.teamName, league, SEASON, t.gp, t.mp,
        t.fgm, t.fga, t.fg3m, t.fg3a, t.ftm, t.fta,
        t.oreb, t.dreb, t.reb, t.ast, t.stl, t.blk, t.tov, t.pts, t.pf,
        t.opp_fgm, t.opp_fga, t.opp_fg3m, t.opp_fg3a, t.opp_ftm, t.opp_fta,
        t.opp_oreb, t.opp_dreb, t.opp_reb, t.opp_ast, t.opp_stl, t.opp_blk,
        t.opp_tov, t.opp_pts, t.opp_pf,
      ]
    );
  }
  console.log(`  Inserted ${teamAgg.size} team_stats rows`);

  // Upsert players (preserve manually-added height/grad_year).
  // Identity is Passport playerNumber (stable across games).
  let newPlayers = 0;
  let existingPlayers = 0;
  for (const p of playerAgg.values()) {
    const fullName = p.playerName;
    const [firstName, ...rest] = fullName.split(' ');
    const lastName = rest.join(' ');

    const existing = await client.query(
      `SELECT id FROM adidas_3ssb_players
       WHERE cerebro_player_id = $1 AND league = $2 AND season = $3
       LIMIT 1`,
      [p.playerNumber, league, SEASON]
    );

    let playerId;
    if (existing.rowCount > 0) {
      playerId = existing.rows[0].id;
      existingPlayers += 1;
    } else {
      const inserted = await client.query(
        `INSERT INTO adidas_3ssb_players
           (full_name, first_name, last_name, team, league, season, cerebro_player_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7)
         RETURNING id`,
        [fullName, firstName, lastName, p.teamName, league, SEASON, p.playerNumber]
      );
      playerId = inserted.rows[0].id;
      newPlayers += 1;
    }

    await client.query(
      `INSERT INTO adidas_3ssb_player_stats
         (player_id, season, gp, mp,
          fgm, fga, fg3m, fg3a, ftm, fta,
          oreb, dreb, reb, ast, stl, blk, tov, pts, pf)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)`,
      [
        playerId, SEASON, p.gp, p.mp,
        p.fgm, p.fga, p.fg3m, p.fg3a, p.ftm, p.fta,
        p.oreb, p.dreb, p.reb, p.ast, p.stl, p.blk, p.tov, p.pts, p.pf,
      ]
    );
  }
  console.log(`  Players: ${newPlayers} new inserted, ${existingPlayers} existing preserved`);
  console.log(`  Inserted ${playerAgg.size} player_stats rows`);
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

  console.log(`\nAggregation complete:`);
  console.log(`  ${teamAgg.size} unique teams`);
  console.log(`  ${playerAgg.size} unique players`);
  console.log(`  ${scheduleRows.length} schedule rows`);

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
