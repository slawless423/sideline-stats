// scripts/ingest_eybl_nike.mjs
//
// Nike EYBL ingest for boys divisions (17U / 16U / 15U).
// Pulls from Cerebro/Passport tRPC APIs, writes to Neon.
//
// Usage (locally or in GitHub Action):
//   LEAGUE=17U node scripts/ingest_eybl_nike.mjs
//   LEAGUE=16U node scripts/ingest_eybl_nike.mjs
//   LEAGUE=15U node scripts/ingest_eybl_nike.mjs
//
// Required env vars:
//   DATABASE_URL  - Neon connection string
//   LEAGUE        - one of: 17U, 16U, 15U
//   SEASON        - optional, defaults to '2026'
//
// CRITICAL STATS RULE NOTE:
//   Nike EYBL has an APPROVED EXCEPTION to the team-totals rule.
//   Team and opponent stats are derived by summing player rows because Nike
//   does not publish team-level box score data anywhere accessible.
//   Known biases: team rebounds and team turnovers undercounted, pace biased
//   low, ORtg biased high relative to other divisions.

import pg from 'pg';

const { Client } = pg;

// ---------- CONFIG ----------

const SEASON = process.env.SEASON || '2026';
const LEAGUE_ARG = (process.env.LEAGUE || '').toUpperCase();

const NIKE_EVENT_ID = 260104; // 2026 Nike Elite Youth Session (full season)

const DIVISIONS = {
  '17U': { divisionId: 1321116, divisionName: 'EYBL', league: 'EYBL 17U' },
  '16U': { divisionId: 1321118, divisionName: 'E16',  league: 'EYBL 16U' },
  '15U': { divisionId: 1321117, divisionName: 'E15',  league: 'EYBL 15U' },
};

if (!DIVISIONS[LEAGUE_ARG]) {
  console.error(`ERROR: LEAGUE env var must be one of: ${Object.keys(DIVISIONS).join(', ')}`);
  console.error(`Got: "${process.env.LEAGUE}"`);
  process.exit(1);
}

const { divisionId, divisionName, league } = DIVISIONS[LEAGUE_ARG];

console.log(`\n=== Nike EYBL Ingest ===`);
console.log(`League: ${league}`);
console.log(`Season: ${SEASON}`);
console.log(`Nike eventId: ${NIKE_EVENT_ID}`);
console.log(`Nike divisionId: ${divisionId} (${divisionName})`);
console.log(`========================\n`);

// ---------- TRPC HELPERS ----------

const TRPC_BASE = 'https://cerebro-widget.vercel.app/api/trpc';

// tRPC requires the input wrapped as {"0":{"json":{...}}} and URL-encoded.
// The optional `meta` parameter is required by tRPC's superjson transformer when
// the input contains null values (it tells the server which fields are intentionally null).
function buildTrpcUrl(procedure, input, meta = null) {
  const payload = { json: input };
  if (meta) payload.meta = meta;
  const wrapped = { '0': payload };
  const encoded = encodeURIComponent(JSON.stringify(wrapped));
  return `${TRPC_BASE}/${procedure}?batch=1&input=${encoded}`;
}

// For batched two-team stats lookup, we send {"0":{...},"1":{...}}.
function buildBatchedStatsUrl(gameId, teamIdA, teamIdB) {
  const wrapped = {
    '0': { json: { gameId, teamId: teamIdA } },
    '1': { json: { gameId, teamId: teamIdB } },
  };
  const encoded = encodeURIComponent(JSON.stringify(wrapped));
  return `${TRPC_BASE}/RouterCerebroGame.GameXStatisticsList,RouterCerebroGame.GameXStatisticsList?batch=1&input=${encoded}`;
}

async function trpcGet(url, label) {
  const res = await fetch(url, {
    headers: { 'accept': 'application/json' },
  });
  if (!res.ok) {
    throw new Error(`${label} failed: ${res.status} ${res.statusText}`);
  }
  return res.json();
}

// ---------- API: SCHEDULE ----------

async function fetchSchedule() {
  console.log('Fetching schedule...');
  const url = buildTrpcUrl('RouterExposureSchedule.ScheduleList', {
    eventId: NIKE_EVENT_ID,
    divisionId,
    teamId: null,
    gameId: null,
    page: 1,
    pageSize: 1000,
  }, {
    values: {
      teamId: ['undefined'],
      gameId: ['undefined'],
    },
    v: 1,
  });

  const data = await trpcGet(url, 'Schedule');
  const games = data?.[0]?.result?.data?.json?.schedule || [];
  console.log(`  Schedule returned ${games.length} games (raw)`);
  return games;
}

// Filter schedule to only completed games (have scores).
function filterCompleted(rawGames) {
  // DEBUG: peek at first 3 games to see actual field shape
  if (rawGames.length > 0) {
    console.log(`  DEBUG: first game keys = ${JSON.stringify(Object.keys(rawGames[0]))}`);
    console.log(`  DEBUG: first AwayTeam keys = ${JSON.stringify(Object.keys(rawGames[0].AwayTeam || {}))}`);
    console.log(`  DEBUG: first 3 games (away score / home score):`);
    for (let i = 0; i < Math.min(3, rawGames.length); i += 1) {
      const g = rawGames[i];
      console.log(`    ${g.Date} ${g.AwayTeam?.Name} (${g.AwayTeam?.Score}) @ ${g.HomeTeam?.Name} (${g.HomeTeam?.Score})`);
    }
  }
  const completed = rawGames.filter(g =>
    g.AwayTeam?.Score != null && g.HomeTeam?.Score != null
  );
  console.log(`  ${completed.length} completed games (with final scores)`);
  return completed;
}

// ---------- API: GAME UUID LOOKUP ----------

async function lookupGameUuid(scheduleRow) {
  const url = buildTrpcUrl('RouterRelationsGame.RelationsGameRead', {
    overallId: String(NIKE_EVENT_ID),
    awayTeam: scheduleRow.AwayTeam.Name,
    homeTeam: scheduleRow.HomeTeam.Name,
    division: divisionName,
    date: scheduleRow.Date, // already in M/D/YYYY format
  });

  const data = await trpcGet(url, `UUID lookup for game ${scheduleRow.Id}`);
  const json = data?.[0]?.result?.data?.json;
  if (!json) return null;

  return {
    gameUuid: json.id,
    teamOneUuid: json.team_one_id,
    teamTwoUuid: json.team_two_id,
    teamOneName: json.team_game?.[0]?.team?.name,
    teamTwoName: json.team_game?.[1]?.team?.name,
  };
}

// ---------- API: PLAYER STATS ----------

async function fetchBothTeamsStats(gameUuid, teamIdA, teamIdB) {
  const url = buildBatchedStatsUrl(gameUuid, teamIdA, teamIdB);
  const data = await trpcGet(url, `Stats for game ${gameUuid}`);
  const teamAStats = data?.[0]?.result?.data?.json?.statistics || [];
  const teamBStats = data?.[1]?.result?.data?.json?.statistics || [];
  return { teamAStats, teamBStats };
}

// ---------- STAT NORMALIZATION ----------

// Convert Nike player row to our schema field names.
function normalizePlayerRow(p) {
  const fga = p.fga ?? 0;
  const threePa = p.threePa ?? 0;
  return {
    playerName: p.playerName,
    minutes: p.minutes ?? 0,
    pts: p.pts ?? 0,
    reb: p.reb ?? 0,
    oreb: p.orb ?? 0,
    dreb: p.drb ?? 0,
    ast: p.ast ?? 0,
    stl: p.stl ?? 0,
    blk: p.blk ?? 0,
    tov: p.tov ?? 0,
    pf: p.pf ?? 0,
    fgm: p.fgm ?? 0,
    fga,
    fg3m: p.threePm ?? 0,
    fg3a: threePa,
    ftm: p.ftm ?? 0,
    fta: p.fta ?? 0,
  };
}

// Sum array of normalized player rows into a totals object.
function sumPlayerRows(rows) {
  const totals = {
    mp: 0, pts: 0, reb: 0, oreb: 0, dreb: 0,
    ast: 0, stl: 0, blk: 0, tov: 0, pf: 0,
    fgm: 0, fga: 0, fg3m: 0, fg3a: 0, ftm: 0, fta: 0,
  };
  for (const r of rows) {
    totals.mp   += r.minutes;
    totals.pts  += r.pts;
    totals.reb  += r.reb;
    totals.oreb += r.oreb;
    totals.dreb += r.dreb;
    totals.ast  += r.ast;
    totals.stl  += r.stl;
    totals.blk  += r.blk;
    totals.tov  += r.tov;
    totals.pf   += r.pf;
    totals.fgm  += r.fgm;
    totals.fga  += r.fga;
    totals.fg3m += r.fg3m;
    totals.fg3a += r.fg3a;
    totals.ftm  += r.ftm;
    totals.fta  += r.fta;
  }
  return totals;
}

// ---------- AGGREGATION STATE ----------

// Per-player season totals, keyed by `${full_name}|${team}`.
const playerAgg = new Map();
// Per-team season totals, keyed by team name.
const teamAgg = new Map();
// Schedule rows to insert (one per team-perspective per game).
const scheduleRows = [];

function getPlayerAgg(playerName, teamName) {
  const key = `${playerName}|${teamName}`;
  if (!playerAgg.has(key)) {
    playerAgg.set(key, {
      playerName, teamName,
      gp: 0, mp: 0,
      fgm: 0, fga: 0, fg3m: 0, fg3a: 0, ftm: 0, fta: 0,
      oreb: 0, dreb: 0, reb: 0, ast: 0, stl: 0, blk: 0, tov: 0, pts: 0, pf: 0,
    });
  }
  return playerAgg.get(key);
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
  const awayName = scheduleRow.AwayTeam.Name;
  const homeName = scheduleRow.HomeTeam.Name;
  const awayScore = scheduleRow.AwayTeam.Score;
  const homeScore = scheduleRow.HomeTeam.Score;
  const gameDate = scheduleRow.Date; // M/D/YYYY

  console.log(`  ${gameDate} | ${awayName} (${awayScore}) @ ${homeName} (${homeScore})`);

  // Step 1: lookup UUIDs
  const lookup = await lookupGameUuid(scheduleRow);
  if (!lookup) {
    console.warn(`    SKIP: UUID lookup failed`);
    return;
  }
  const { gameUuid, teamOneUuid, teamTwoUuid, teamOneName, teamTwoName } = lookup;

  // Step 2: fetch player stats for both teams
  const { teamAStats, teamBStats } = await fetchBothTeamsStats(
    gameUuid, teamOneUuid, teamTwoUuid
  );

  // Map UUID-keyed stats back to away/home using teamOne/teamTwo names from lookup.
  // Nike's name casing in UUID lookup may differ from schedule (e.g. "MOKAN Elite" vs "Mokan Elite").
  // We use the schedule's casing as canonical for our DB.
  const t1NameLower = (teamOneName || '').toLowerCase();
  const awayNameLower = awayName.toLowerCase();

  const awayPlayerRows = (t1NameLower === awayNameLower ? teamAStats : teamBStats).map(normalizePlayerRow);
  const homePlayerRows = (t1NameLower === awayNameLower ? teamBStats : teamAStats).map(normalizePlayerRow);

  if (awayPlayerRows.length === 0 || homePlayerRows.length === 0) {
    console.warn(`    SKIP: missing player stats (away: ${awayPlayerRows.length}, home: ${homePlayerRows.length})`);
    return;
  }

  // Step 3: aggregate into player totals
  for (const p of awayPlayerRows) {
    const agg = getPlayerAgg(p.playerName, awayName);
    agg.gp   += 1;
    agg.mp   += Math.round(p.minutes);
    agg.fgm  += p.fgm;   agg.fga  += p.fga;
    agg.fg3m += p.fg3m;  agg.fg3a += p.fg3a;
    agg.ftm  += p.ftm;   agg.fta  += p.fta;
    agg.oreb += p.oreb;  agg.dreb += p.dreb;  agg.reb += p.reb;
    agg.ast  += p.ast;   agg.stl  += p.stl;   agg.blk += p.blk;
    agg.tov  += p.tov;   agg.pts  += p.pts;   agg.pf  += p.pf;
  }
  for (const p of homePlayerRows) {
    const agg = getPlayerAgg(p.playerName, homeName);
    agg.gp   += 1;
    agg.mp   += Math.round(p.minutes);
    agg.fgm  += p.fgm;   agg.fga  += p.fga;
    agg.fg3m += p.fg3m;  agg.fg3a += p.fg3a;
    agg.ftm  += p.ftm;   agg.fta  += p.fta;
    agg.oreb += p.oreb;  agg.dreb += p.dreb;  agg.reb += p.reb;
    agg.ast  += p.ast;   agg.stl  += p.stl;   agg.blk += p.blk;
    agg.tov  += p.tov;   agg.pts  += p.pts;   agg.pf  += p.pf;
  }

  // Step 4: aggregate into team totals (sum player rows = approved exception)
  const awayTotals = sumPlayerRows(awayPlayerRows);
  const homeTotals = sumPlayerRows(homePlayerRows);

  const awayTeam = getTeamAgg(awayName);
  awayTeam.gp += 1;
  awayTeam.mp   += awayTotals.mp;
  awayTeam.fgm  += awayTotals.fgm;   awayTeam.fga  += awayTotals.fga;
  awayTeam.fg3m += awayTotals.fg3m;  awayTeam.fg3a += awayTotals.fg3a;
  awayTeam.ftm  += awayTotals.ftm;   awayTeam.fta  += awayTotals.fta;
  awayTeam.oreb += awayTotals.oreb;  awayTeam.dreb += awayTotals.dreb;
  awayTeam.reb  += awayTotals.reb;   awayTeam.ast  += awayTotals.ast;
  awayTeam.stl  += awayTotals.stl;   awayTeam.blk  += awayTotals.blk;
  awayTeam.tov  += awayTotals.tov;   awayTeam.pts  += awayTotals.pts;
  awayTeam.pf   += awayTotals.pf;
  // opp = home totals
  awayTeam.opp_fgm  += homeTotals.fgm;   awayTeam.opp_fga  += homeTotals.fga;
  awayTeam.opp_fg3m += homeTotals.fg3m;  awayTeam.opp_fg3a += homeTotals.fg3a;
  awayTeam.opp_ftm  += homeTotals.ftm;   awayTeam.opp_fta  += homeTotals.fta;
  awayTeam.opp_oreb += homeTotals.oreb;  awayTeam.opp_dreb += homeTotals.dreb;
  awayTeam.opp_reb  += homeTotals.reb;   awayTeam.opp_ast  += homeTotals.ast;
  awayTeam.opp_stl  += homeTotals.stl;   awayTeam.opp_blk  += homeTotals.blk;
  awayTeam.opp_tov  += homeTotals.tov;   awayTeam.opp_pts  += homeTotals.pts;
  awayTeam.opp_pf   += homeTotals.pf;

  const homeTeam = getTeamAgg(homeName);
  homeTeam.gp += 1;
  homeTeam.mp   += homeTotals.mp;
  homeTeam.fgm  += homeTotals.fgm;   homeTeam.fga  += homeTotals.fga;
  homeTeam.fg3m += homeTotals.fg3m;  homeTeam.fg3a += homeTotals.fg3a;
  homeTeam.ftm  += homeTotals.ftm;   homeTeam.fta  += homeTotals.fta;
  homeTeam.oreb += homeTotals.oreb;  homeTeam.dreb += homeTotals.dreb;
  homeTeam.reb  += homeTotals.reb;   homeTeam.ast  += homeTotals.ast;
  homeTeam.stl  += homeTotals.stl;   homeTeam.blk  += homeTotals.blk;
  homeTeam.tov  += homeTotals.tov;   homeTeam.pts  += homeTotals.pts;
  homeTeam.pf   += homeTotals.pf;
  // opp = away totals
  homeTeam.opp_fgm  += awayTotals.fgm;   homeTeam.opp_fga  += awayTotals.fga;
  homeTeam.opp_fg3m += awayTotals.fg3m;  homeTeam.opp_fg3a += awayTotals.fg3a;
  homeTeam.opp_ftm  += awayTotals.ftm;   homeTeam.opp_fta  += awayTotals.fta;
  homeTeam.opp_oreb += awayTotals.oreb;  homeTeam.opp_dreb += awayTotals.dreb;
  homeTeam.opp_reb  += awayTotals.reb;   homeTeam.opp_ast  += awayTotals.ast;
  homeTeam.opp_stl  += awayTotals.stl;   homeTeam.opp_blk  += awayTotals.blk;
  homeTeam.opp_tov  += awayTotals.tov;   homeTeam.opp_pts  += awayTotals.pts;
  homeTeam.opp_pf   += awayTotals.pf;

  // Step 5: build schedule rows (one per perspective)
  const isoDate = parseDateMDYToISO(gameDate);
  scheduleRows.push({
    team: awayName, opponent: homeName,
    teamScore: awayScore, opponentScore: homeScore,
    isHome: false, gameUuid, scheduleId: scheduleRow.Id, gameDate: isoDate,
  });
  scheduleRows.push({
    team: homeName, opponent: awayName,
    teamScore: homeScore, opponentScore: awayScore,
    isHome: true, gameUuid, scheduleId: scheduleRow.Id, gameDate: isoDate,
  });
}

function parseDateMDYToISO(mdy) {
  // "4/24/2026" -> "2026-04-24"
  const [m, d, y] = mdy.split('/').map(Number);
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

// ---------- DB WRITE ----------

async function writeToDb(client) {
  console.log(`\nWriting to database...`);

  // 1. Delete existing rows for this league + season
  const delSchedule = await client.query(
    `DELETE FROM eybl_team_schedule WHERE league = $1 AND season = $2`,
    [league, SEASON]
  );
  console.log(`  Deleted ${delSchedule.rowCount} old schedule rows`);

  const delTeamStats = await client.query(
    `DELETE FROM eybl_team_stats WHERE league = $1 AND season = $2`,
    [league, SEASON]
  );
  console.log(`  Deleted ${delTeamStats.rowCount} old team_stats rows`);

  // For player_stats we need to delete by joining through eybl_players.
  const delPlayerStats = await client.query(
    `DELETE FROM eybl_player_stats
     WHERE season = $1 AND player_id IN (
       SELECT id FROM eybl_players WHERE league = $2 AND season = $1
     )`,
    [SEASON, league]
  );
  console.log(`  Deleted ${delPlayerStats.rowCount} old player_stats rows`);

  // 2. Insert schedule rows
  for (const r of scheduleRows) {
    await client.query(
      `INSERT INTO eybl_team_schedule
         (team, league, season, game_date, opponent, team_score, opponent_score, is_home, game_uuid, schedule_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       ON CONFLICT (team, league, season, game_date, opponent) DO NOTHING`,
      [r.team, league, SEASON, r.gameDate, r.opponent, r.teamScore, r.opponentScore, r.isHome, r.gameUuid, r.scheduleId]
    );
  }
  console.log(`  Inserted ${scheduleRows.length} schedule rows`);

  // 3. Insert team stats
  for (const t of teamAgg.values()) {
    await client.query(
      `INSERT INTO eybl_team_stats
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

  // 4. Upsert players (preserve manually-added height/grad_year)
  let newPlayers = 0;
  let existingPlayers = 0;
  for (const p of playerAgg.values()) {
    const fullName = p.playerName;
    const [firstName, ...rest] = fullName.split(' ');
    const lastName = rest.join(' ');

    const existing = await client.query(
      `SELECT id FROM eybl_players
       WHERE full_name = $1 AND team = $2 AND league = $3 AND season = $4
       LIMIT 1`,
      [fullName, p.teamName, league, SEASON]
    );

    let playerId;
    if (existing.rowCount > 0) {
      playerId = existing.rows[0].id;
      existingPlayers += 1;
    } else {
      const inserted = await client.query(
        `INSERT INTO eybl_players (full_name, first_name, last_name, team, league, season)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id`,
        [fullName, firstName, lastName, p.teamName, league, SEASON]
      );
      playerId = inserted.rows[0].id;
      newPlayers += 1;
    }

    // Insert player_stats row
    await client.query(
      `INSERT INTO eybl_player_stats
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

  // 1. Pull schedule, filter completed
  const rawGames = await fetchSchedule();
  const completed = filterCompleted(rawGames);

  if (completed.length === 0) {
    console.log('No completed games found. Exiting.');
    return;
  }

  // 2. Process each game (sequential, polite to API)
  console.log(`\nProcessing ${completed.length} games...`);
  for (let i = 0; i < completed.length; i += 1) {
    try {
      await processGame(completed[i]);
    } catch (err) {
      console.error(`  ERROR on game ${completed[i].Id}: ${err.message}`);
    }
  }

  console.log(`\nAggregation complete:`);
  console.log(`  ${teamAgg.size} unique teams`);
  console.log(`  ${playerAgg.size} unique players`);
  console.log(`  ${scheduleRows.length} schedule rows`);

  // 3. Write to Neon
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
