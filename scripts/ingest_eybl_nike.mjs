// scripts/ingest_eybl_nike.mjs
//
// Nike EYBL ingest for boys divisions (17U / 16U / 15U).
// Pulls from Cerebro/Passport tRPC APIs, writes to Neon.
//
// INCREMENTAL: Re-running this script does NOT delete existing data.
// It only ingests games not yet in eybl_team_schedule.schedule_id, and
// adds new contributions to existing player_stats / team_stats rows.
// This preserves manual data fixes across re-runs.
//
// DEFENSIVE: Detects the Cerebro RelationsGameRead UUID-collision bug
// where same-program teams (e.g. Florida Rebels 16U + 17U) playing the
// same opponent on the same date can return the same UUID for both games.
// Affected games are skipped and logged for manual entry.
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

  // Nike's API filters by relative time. We want games already played, so history='past'.
  // 'today' is required as a reference date in YYYY-MM-DD format.
  const today = new Date().toISOString().slice(0, 10);

  const url = buildTrpcUrl('RouterExposureSchedule.ScheduleList', {
    eventId: NIKE_EVENT_ID,
    divisionId,
    teamId: null,
    gameId: null,
    page: 1,
    pageSize: 1000,
    history: 'past',
    today,
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

  // CRITICAL: Cerebro returns team_one_id/team_two_id (paired with scores)
  // separately from team_game[] (which has names but is in a DIFFERENT order).
  // We MUST look up each team's name by matching UUID, not by array index.
  const teamGame = json.team_game || [];
  const nameByUuid = new Map();
  for (const tg of teamGame) {
    if (tg?.team_id && tg?.team?.name) {
      nameByUuid.set(tg.team_id, tg.team.name);
    }
  }

  return {
    gameUuid: json.id,
    teamOneUuid: json.team_one_id,
    teamTwoUuid: json.team_two_id,
    teamOneName: nameByUuid.get(json.team_one_id),
    teamTwoName: nameByUuid.get(json.team_two_id),
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
// Minutes come from the API as floats (19.7, 32.6 etc) — round to integer for our schema.
function normalizePlayerRow(p) {
  const fga = p.fga ?? 0;
  const threePa = p.threePa ?? 0;
  return {
    playerName: p.playerName,
    minutes: Math.round(p.minutes ?? 0),
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

  // Determine which roster goes with away vs home using UUID matching, NOT team name strings.
  // The previous version compared lookup.team_one_name to schedule.AwayTeam.Name with
  // case-insensitive matching, which failed silently for any whitespace or formatting
  // difference and mis-attributed the entire roster to the wrong team.
  //
  // Each player's `teamId` in the stats response is the UUID they played for in this game.
  // We pair that with the lookup's team_one/two name to identify which schedule team
  // (away or home) the roster belongs to.
  const teamAUuid = teamAStats[0]?.teamId; // UUID this array's players played for
  const teamBUuid = teamBStats[0]?.teamId;

  // Use normalized (lowercase + whitespace-stripped) name comparison to map UUIDs
  // to schedule away/home labels.
  const norm = s => (s || '').toLowerCase().replace(/\s+/g, '');
  const awayNorm = norm(awayName);
  const homeNorm = norm(homeName);
  const t1Norm = norm(teamOneName);
  const t2Norm = norm(teamTwoName);

  // Map team_one/two UUIDs to away/home based on names from the lookup.
  let awayUuid, homeUuid;
  if (t1Norm === awayNorm && t2Norm === homeNorm) {
    awayUuid = teamOneUuid; homeUuid = teamTwoUuid;
  } else if (t1Norm === homeNorm && t2Norm === awayNorm) {
    awayUuid = teamTwoUuid; homeUuid = teamOneUuid;
  } else {
    console.warn(`    SKIP: name mismatch — schedule (${awayName} @ ${homeName}) vs lookup (${teamOneName}, ${teamTwoName})`);
    return;
  }

  // Now assign each stats array to away/home based on its players' teamId UUID.
  let awayPlayerRows, homePlayerRows;
  if (teamAUuid === awayUuid && teamBUuid === homeUuid) {
    awayPlayerRows = teamAStats.map(normalizePlayerRow);
    homePlayerRows = teamBStats.map(normalizePlayerRow);
  } else if (teamAUuid === homeUuid && teamBUuid === awayUuid) {
    awayPlayerRows = teamBStats.map(normalizePlayerRow);
    homePlayerRows = teamAStats.map(normalizePlayerRow);
  } else {
    console.warn(`    SKIP: stats UUID mismatch — teamA=${teamAUuid}, teamB=${teamBUuid}, away=${awayUuid}, home=${homeUuid}`);
    return;
  }

  if (awayPlayerRows.length === 0 || homePlayerRows.length === 0) {
    console.warn(`    SKIP: missing player stats (away: ${awayPlayerRows.length}, home: ${homePlayerRows.length})`);
    return;
  }

  // Step 3: aggregate into player totals
  for (const p of awayPlayerRows) {
    const agg = getPlayerAgg(p.playerName, awayName);
    agg.gp   += 1;
    agg.mp   += p.minutes;
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
    agg.mp   += p.minutes;
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

// Fetch the set of schedule_ids already ingested for this league + season.
// Used to skip games that have already been processed (incremental ingest).
async function fetchExistingScheduleIds(client) {
  const res = await client.query(
    `SELECT DISTINCT schedule_id FROM eybl_team_schedule
     WHERE league = $1 AND season = $2 AND schedule_id IS NOT NULL`,
    [league, SEASON]
  );
  const ids = new Set(res.rows.map(r => Number(r.schedule_id)));
  return ids;
}

// Defensive check for the Cerebro RelationsGameRead bug:
// Same-program teams playing on the same date across different age divisions
// can return the SAME game UUID, causing roster cross-attribution.
// If the UUID we're about to use already exists in eybl_team_schedule for a
// different league on the same date, we have a collision — skip the game.
async function detectUuidCollision(client, gameUuid, gameDate) {
  const res = await client.query(
    `SELECT league FROM eybl_team_schedule
     WHERE game_uuid = $1 AND game_date = $2 AND season = $3 AND league <> $4
     LIMIT 1`,
    [gameUuid, gameDate, SEASON, league]
  );
  return res.rowCount > 0 ? res.rows[0].league : null;
}

// INCREMENTAL DB writer — never deletes prior data, never overwrites.
// - Schedule rows: INSERT, ON CONFLICT skip
// - Team stats: UPSERT — add to existing totals or insert new row
// - Player stats: UPSERT — add to existing player's totals or insert new row
//
// This preserves manual fixes (e.g. fixing the Cerebro UUID bug for
// Florida Rebels vs CP3 4/24/2026) across re-runs and incremental sessions.
async function writeToDbIncremental(client) {
  console.log(`\nWriting to database (incremental)...`);

  // 1. Insert schedule rows. ON CONFLICT skip handles re-runs of the same game.
  let insertedSchedule = 0;
  for (const r of scheduleRows) {
    const result = await client.query(
      `INSERT INTO eybl_team_schedule
         (team, league, season, game_date, opponent, team_score, opponent_score, is_home, game_uuid, schedule_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       ON CONFLICT (team, league, season, game_date, opponent) DO NOTHING`,
      [r.team, league, SEASON, r.gameDate, r.opponent, r.teamScore, r.opponentScore, r.isHome, r.gameUuid, r.scheduleId]
    );
    insertedSchedule += result.rowCount;
  }
  console.log(`  Inserted ${insertedSchedule} new schedule rows (${scheduleRows.length - insertedSchedule} already existed)`);

  // 2. Upsert team_stats. If team already has a row, ADD the new game's contributions.
  let newTeamRows = 0, updatedTeamRows = 0;
  for (const t of teamAgg.values()) {
    const existing = await client.query(
      `SELECT 1 FROM eybl_team_stats
       WHERE team = $1 AND league = $2 AND season = $3
       LIMIT 1`,
      [t.teamName, league, SEASON]
    );

    if (existing.rowCount === 0) {
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
      newTeamRows += 1;
    } else {
      await client.query(
        `UPDATE eybl_team_stats SET
           gp   = gp   + $4,  mp   = mp   + $5,
           fgm  = fgm  + $6,  fga  = fga  + $7,
           fg3m = fg3m + $8,  fg3a = fg3a + $9,
           ftm  = ftm  + $10, fta  = fta  + $11,
           oreb = oreb + $12, dreb = dreb + $13, reb = reb + $14,
           ast  = ast  + $15, stl  = stl  + $16, blk = blk + $17,
           tov  = tov  + $18, pts  = pts  + $19, pf  = pf  + $20,
           opp_fgm  = opp_fgm  + $21, opp_fga  = opp_fga  + $22,
           opp_fg3m = opp_fg3m + $23, opp_fg3a = opp_fg3a + $24,
           opp_ftm  = opp_ftm  + $25, opp_fta  = opp_fta  + $26,
           opp_oreb = opp_oreb + $27, opp_dreb = opp_dreb + $28,
           opp_reb  = opp_reb  + $29, opp_ast  = opp_ast  + $30,
           opp_stl  = opp_stl  + $31, opp_blk  = opp_blk  + $32,
           opp_tov  = opp_tov  + $33, opp_pts  = opp_pts  + $34,
           opp_pf   = opp_pf   + $35
         WHERE team = $1 AND league = $2 AND season = $3`,
        [
          t.teamName, league, SEASON, t.gp, t.mp,
          t.fgm, t.fga, t.fg3m, t.fg3a, t.ftm, t.fta,
          t.oreb, t.dreb, t.reb, t.ast, t.stl, t.blk, t.tov, t.pts, t.pf,
          t.opp_fgm, t.opp_fga, t.opp_fg3m, t.opp_fg3a, t.opp_ftm, t.opp_fta,
          t.opp_oreb, t.opp_dreb, t.opp_reb, t.opp_ast, t.opp_stl, t.opp_blk,
          t.opp_tov, t.opp_pts, t.opp_pf,
        ]
      );
      updatedTeamRows += 1;
    }
  }
  console.log(`  Team stats: ${newTeamRows} new rows, ${updatedTeamRows} updated`);

  // 3. Upsert players + player_stats.
  // For player records: preserve manually-added height/grad_year by only inserting if absent.
  // For player_stats: ADD new game contributions to existing season totals or INSERT new row.
  let newPlayers = 0, existingPlayers = 0;
  let newPlayerStats = 0, updatedPlayerStats = 0;

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

    // Check if a player_stats row already exists.
    const statRow = await client.query(
      `SELECT 1 FROM eybl_player_stats WHERE player_id = $1 AND season = $2 LIMIT 1`,
      [playerId, SEASON]
    );

    if (statRow.rowCount === 0) {
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
      newPlayerStats += 1;
    } else {
      await client.query(
        `UPDATE eybl_player_stats SET
           gp   = gp   + $3,  mp   = mp   + $4,
           fgm  = fgm  + $5,  fga  = fga  + $6,
           fg3m = fg3m + $7,  fg3a = fg3a + $8,
           ftm  = ftm  + $9,  fta  = fta  + $10,
           oreb = oreb + $11, dreb = dreb + $12, reb = reb + $13,
           ast  = ast  + $14, stl  = stl  + $15, blk = blk + $16,
           tov  = tov  + $17, pts  = pts  + $18, pf  = pf  + $19
         WHERE player_id = $1 AND season = $2`,
        [
          playerId, SEASON, p.gp, p.mp,
          p.fgm, p.fga, p.fg3m, p.fg3a, p.ftm, p.fta,
          p.oreb, p.dreb, p.reb, p.ast, p.stl, p.blk, p.tov, p.pts, p.pf,
        ]
      );
      updatedPlayerStats += 1;
    }
  }
  console.log(`  Players: ${newPlayers} new, ${existingPlayers} existing`);
  console.log(`  Player stats: ${newPlayerStats} new rows, ${updatedPlayerStats} updated`);
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

  // 2. Connect to DB and filter out games we've already ingested.
  //    This makes the ingest incremental — re-running won't re-process old games,
  //    and manual data fixes won't be wiped.
  const client = new Client({ connectionString: dbUrl });
  await client.connect();

  let newGames;
  try {
    const existingIds = await fetchExistingScheduleIds(client);
    console.log(`  ${existingIds.size} games already in DB for ${league}`);

    newGames = completed.filter(g => !existingIds.has(Number(g.Id)));
    console.log(`  ${newGames.length} new games to process`);

    if (newGames.length === 0) {
      console.log('\n✅ Nothing new to ingest.\n');
      return;
    }

    // 3. Process each new game (sequential, polite to API).
    //    Detect Cerebro UUID collision bug: if a UUID we get back is already used
    //    in another league for the same date, that's the same-program/same-date bug.
    //    Skip these games and log so they can be manually fixed.
    console.log(`\nProcessing ${newGames.length} games...`);
    const collisions = [];
    for (let i = 0; i < newGames.length; i += 1) {
      const g = newGames[i];
      try {
        // Pre-check: lookup UUID first and bail early if it collides.
        const lookup = await lookupGameUuid(g);
        if (!lookup) {
          console.warn(`  SKIP: UUID lookup failed for ${g.AwayTeam.Name} @ ${g.HomeTeam.Name} ${g.Date}`);
          continue;
        }
        const isoDate = parseDateMDYToISO(g.Date);
        const collidedLeague = await detectUuidCollision(client, lookup.gameUuid, isoDate);
        if (collidedLeague) {
          const msg = `${g.Date} ${g.AwayTeam.Name} @ ${g.HomeTeam.Name} (uuid=${lookup.gameUuid}) collides with ${collidedLeague}`;
          console.warn(`  SKIP (Cerebro bug): ${msg}`);
          collisions.push(msg);
          continue;
        }

        // Safe to process — call the regular flow. processGame() will re-do the lookup
        // but that's a small redundant API call, not worth refactoring around.
        await processGame(g);
      } catch (err) {
        console.error(`  ERROR on game ${g.Id}: ${err.message}`);
      }
    }

    if (collisions.length > 0) {
      console.warn(`\n⚠️  ${collisions.length} game(s) skipped due to Cerebro UUID collision bug:`);
      for (const c of collisions) console.warn(`     ${c}`);
      console.warn('     These games need to be manually entered from the Nike website.');
    }

    console.log(`\nAggregation complete:`);
    console.log(`  ${teamAgg.size} unique teams`);
    console.log(`  ${playerAgg.size} unique players`);
    console.log(`  ${scheduleRows.length} schedule rows`);

    // 4. Write to Neon (incremental — adds to existing data, never deletes).
    await client.query('BEGIN');
    await writeToDbIncremental(client);
    await client.query('COMMIT');
    console.log('\n✅ Database write committed.');
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch (_) {}
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
