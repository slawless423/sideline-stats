import fs from "node:fs/promises";
import * as db from "./db_writer.mjs";

const NCAA_API_BASE = "https://ncaa-api.henrygd.me";
const DIVISION = "womens-d1";
const SEASON_START = "2025-11-01";
const BOX_DELAY_MS = 400;
const REQUEST_TIMEOUT_MS = 20000;
const REQUEST_RETRIES = 3;
const BOX_CONCURRENCY = 4;
const MIN_TEAMS = 300;

const WOMENS_D1_CONFERENCES = new Set([
  'acc', 'american', 'america-east', 'asun', 'atlantic-10',
  'big-12', 'big-east', 'big-sky', 'big-south', 'big-ten', 'big-west',
  'caa', 'cusa', 'horizon', 'ivy-league', 'maac', 'mac', 'meac',
  'mountain-west', 'mvc', 'nec', 'ovc', 'patriot', 'sec', 'socon',
  'southland', 'summit-league', 'sun-belt', 'swac', 'wac', 'wcc'
]);

function isWD1Conference(conf) {
  return conf && WOMENS_D1_CONFERENCES.has(conf.toLowerCase());
}

console.log("START build_womens_d1_ratings (daily update)", new Date().toISOString());

function toDate(s) {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function fmtDate(dt) {
  const y = dt.getUTCFullYear();
  const m = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const d = String(dt.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function addDays(dt, days) {
  const x = new Date(dt);
  x.setUTCDate(x.getUTCDate() + days);
  return x;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchJson(path) {
  const url = `${NCAA_API_BASE}${path}`;
  for (let attempt = 0; attempt <= REQUEST_RETRIES; attempt++) {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const res = await fetch(url, {
        signal: controller.signal,
        headers: {
          "User-Agent": "baseline-analytics-bot",
          "Accept": "application/json",
          "Referer": "https://www.ncaa.com/",
        },
      });
      if (!res.ok) {
        if ([429, 500, 502, 503, 504].includes(res.status) && attempt < REQUEST_RETRIES) {
          await sleep(400 * (attempt + 1));
          continue;
        }
        throw new Error(`HTTP ${res.status} for ${path}`);
      }
      return await res.json();
    } catch (e) {
      const msg = String(e?.message ?? e);
      if ((msg.includes("AbortError") || msg.includes("aborted") || msg.includes("ECONNRESET")) && attempt < REQUEST_RETRIES) {
        await sleep(500 * (attempt + 1));
        continue;
      }
      throw e;
    } finally {
      clearTimeout(t);
    }
  }
  throw new Error(`Fetch failed after retries for ${path}`);
}

async function mapLimit(items, limit, fn) {
  const results = new Array(items.length);
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const idx = i++;
      if (idx >= items.length) return;
      results[idx] = await fn(items[idx], idx);
    }
  });
  await Promise.all(workers);
  return results;
}

function extractGameIds(obj) {
  const ids = new Set();
  const walk = (x) => {
    if (Array.isArray(x)) return x.forEach(walk);
    if (x && typeof x === "object") return Object.values(x).forEach(walk);
    if (typeof x === "string") {
      const matches = x.match(/\/game\/(\d+)/g);
      if (matches) matches.forEach((m) => ids.add(m.replace("/game/", "")));
    }
  };
  walk(obj);
  return [...ids];
}

function extractConferenceFromGame(gameObj) {
  try {
    const game = gameObj?.game;
    if (!game) return {};
    const homeConf = game.home?.conferences?.[0]?.conferenceSeo || null;
    const awayConf = game.away?.conferences?.[0]?.conferenceSeo || null;
    return {
      gameId: String(game.gameID || game.gameId),
      homeConf,
      awayConf,
      isConferenceGame: homeConf && awayConf && homeConf === awayConf,
    };
  } catch { return {}; }
}

function toInt(x, d = 0) { const n = parseInt(String(x ?? ""), 10); return Number.isFinite(n) ? n : d; }
function toFloat(x, d = 0) { const n = parseFloat(String(x ?? "")); return Number.isFinite(n) ? n : d; }
function pick(obj, keys) { for (const k of keys) { if (obj && obj[k] != null) return obj[k]; } return null; }

function buildPlayerId(teamId, p) {
  const ncaaId = p.id ?? p.ncaaId ?? 0;
  const first = (p.firstName || "").toLowerCase().replace(/\s+/g, "");
  const last = (p.lastName || "").toLowerCase().replace(/\s+/g, "");
  return `${teamId}_${ncaaId}_${first}_${last}`;
}

function extractCompleteStats(raw) {
  return {
    points: toInt(pick(raw, ["points", "pts", "score"]), 0),
    fgm: toInt(pick(raw, ["fieldGoalsMade", "fgm", "fgMade"]), 0),
    fga: toInt(pick(raw, ["fieldGoalsAttempted", "fga", "fgAttempts"]), 0),
    tpm: toInt(pick(raw, ["threePointsMade", "3pm", "threePointersMade", "threePtMade"]), 0),
    tpa: toInt(pick(raw, ["threePointsAttempted", "3pa", "threePointersAttempted", "threePtAttempts"]), 0),
    ftm: toInt(pick(raw, ["freeThrowsMade", "ftm", "ftMade"]), 0),
    fta: toInt(pick(raw, ["freeThrowsAttempted", "fta", "ftAttempts"]), 0),
    orb: toInt(pick(raw, ["offensiveRebounds", "oreb", "offReb", "orb"]), 0),
    drb: toInt(pick(raw, ["defensiveRebounds", "dreb", "defReb", "drb"]), 0),
    trb: toInt(pick(raw, ["totalRebounds", "treb", "rebounds", "reb", "trb"]), 0),
    ast: toInt(pick(raw, ["assists", "ast"]), 0),
    stl: toInt(pick(raw, ["steals", "stl"]), 0),
    blk: toInt(pick(raw, ["blockedShots", "blocks", "blk"]), 0),
    tov: toInt(pick(raw, ["turnovers", "tov", "to"]), 0),
    pf: toInt(pick(raw, ["fouls", "pf", "personalFouls"]), 0),
  };
}

function deepCollectTeamStats(root) {
  const out = [];
  const walk = (x) => {
    if (Array.isArray(x)) return x.forEach(walk);
    if (!x || typeof x !== "object") return;
    const teamId = pick(x, ["teamId", "team_id", "id"]);
    if (teamId != null) {
      const stats = extractCompleteStats(x);
      if (stats.points || stats.fga || stats.fta) out.push({ teamId: String(teamId), stats });
      const nested = pick(x, ["teamStats", "team_stats", "statistics", "stats", "totals"]);
      if (nested && typeof nested === "object") {
        const nestedStats = extractCompleteStats(nested);
        if (nestedStats.points || nestedStats.fga || nestedStats.fta) out.push({ teamId: String(teamId), stats: nestedStats });
      }
    }
    Object.values(x).forEach(walk);
  };
  walk(root);
  return out;
}

function extractPlayers(gameJson) {
  const result = [];
  if (gameJson.teamBoxscore && Array.isArray(gameJson.teamBoxscore)) {
    for (const entry of gameJson.teamBoxscore) {
      const teamId = pick(entry, ["teamId", "team_id", "id"]);
      if (teamId && entry.playerStats && Array.isArray(entry.playerStats) && entry.playerStats.length > 0) {
        result.push({ teamId: String(teamId), players: entry.playerStats });
      }
    }
    if (result.length > 0) return result;
  }
  const walk = (x) => {
    if (Array.isArray(x)) { x.forEach(walk); }
    else if (x && typeof x === "object") {
      if (x.playerStats && Array.isArray(x.playerStats) && x.playerStats.length > 0) {
        const teamId = pick(x, ["teamId", "team_id", "id"]);
        if (teamId) result.push({ teamId: String(teamId), players: x.playerStats });
      }
      Object.values(x).forEach(walk);
    }
  };
  walk(gameJson);
  return result;
}

function findTeamsMeta(gameJson) {
  const candidates = [gameJson?.teams, gameJson?.game?.teams, gameJson?.meta?.teams, gameJson?.header?.teams].filter(Array.isArray);
  for (const arr of candidates) {
    const filtered = arr.filter((t) => t && (t.teamId != null || t.id != null));
    if (filtered.length >= 2) return filtered;
  }
  let found = null;
  const walk = (x) => {
    if (found) return;
    if (Array.isArray(x)) {
      const ok = x.filter((t) => t && typeof t === "object" && (t.teamId != null || t.id != null));
      if (ok.length >= 2) { found = ok; return; }
      x.forEach(walk);
      return;
    }
    if (x && typeof x === "object") Object.values(x).forEach(walk);
  };
  walk(gameJson);
  return found;
}

function nameFromMeta(t) {
  return String(pick(t, ["nameShort", "name_short", "shortName", "nameFull", "name_full", "fullName", "name"]) ?? "Team");
}

function isHomeFromMeta(t) {
  const v = pick(t, ["isHome", "home", "is_home", "homeAway", "home_away"]);
  if (v === true) return true;
  if (v === false) return false;
  if (typeof v === "string") {
    const s = v.toLowerCase();
    if (s === "home" || s === "h") return true;
    if (s === "away" || s === "a") return false;
  }
  return null;
}

function parseCompleteGameData(gameId, gameJson, gameDate) {
  const teamsArr = findTeamsMeta(gameJson);
  if (!teamsArr || teamsArr.length < 2) return null;

  const withHomeFlag = teamsArr.map((t) => ({
    t, id: String(pick(t, ["teamId", "team_id", "id"])), home: isHomeFromMeta(t),
  }));

  let homeMeta = withHomeFlag.find((x) => x.home === true)?.t ?? withHomeFlag[0]?.t;
  let awayMeta = withHomeFlag.find((x) => x.home === false)?.t ?? withHomeFlag[1]?.t;

  const homeId = String(pick(homeMeta, ["teamId", "team_id", "id"]));
  const awayId = String(pick(awayMeta, ["teamId", "team_id", "id"]));

  const candidates = deepCollectTeamStats(gameJson);
  if (!candidates.length) return null;

  const bestById = new Map();
  for (const c of candidates) {
    const key = String(c.teamId);
    const s = c.stats;
    const score = (s.points || 0) + (s.fga || 0) + (s.fta || 0) + (s.blk || 0) * 100 + (s.stl || 0) * 100 + (s.ast || 0) * 10 + (s.orb || 0) + (s.tov || 0);
    const prev = bestById.get(key);
    if (!prev || score > prev.score) bestById.set(key, { stats: c.stats, score });
  }

  const homeStats = bestById.get(homeId)?.stats ?? null;
  const awayStats = bestById.get(awayId)?.stats ?? null;
  if (!homeStats || !awayStats) return null;

  return {
    gameId, date: gameDate,
    home: { teamId: homeId, teamName: nameFromMeta(homeMeta), stats: homeStats },
    away: { teamId: awayId, teamName: nameFromMeta(awayMeta), stats: awayStats },
    players: extractPlayers(gameJson),
  };
}

async function main() {
  // Load existing data
  let existingRatings = { rows: [] };
  let existingTeamStats = { teams: [] };
  let existingPlayerStats = { players: [] };
  let existingGamesCache = { game_ids: [] };

  try { existingRatings = JSON.parse(await fs.readFile("public/data/womens_d1_ratings.json", "utf8")); } catch {}
  try { existingTeamStats = JSON.parse(await fs.readFile("public/data/womens_d1_team_stats.json", "utf8")); } catch {}
  try { existingPlayerStats = JSON.parse(await fs.readFile("public/data/womens_d1_player_stats.json", "utf8")); } catch {}
  try { existingGamesCache = JSON.parse(await fs.readFile("public/data/womens_d1_games_cache.json", "utf8")); } catch {}

  const knownGameIds = new Set(existingGamesCache.game_ids || []);
  console.log(`Loaded ${knownGameIds.size} known game IDs from cache`);

  const teamStatsMap = new Map();
  for (const t of (existingTeamStats.teams || [])) teamStatsMap.set(t.teamId, { ...t });

  const playerStatsMap = new Map();
  for (const p of (existingPlayerStats.players || [])) playerStatsMap.set(p.playerId, { ...p });

  // Check yesterday and 2 days ago
  const today = new Date();
  const datesToCheck = [];
  for (let i = 1; i <= 2; i++) {
    const dt = new Date(today);
    dt.setUTCDate(dt.getUTCDate() - i);
    datesToCheck.push(fmtDate(dt));
  }

  console.log("Checking dates:", datesToCheck);

  const newGameIds = [];
  const conferenceMap = new Map();

  for (const d of datesToCheck) {
    const [Y, M, D] = d.split("-");

    // Fetch both all-conf and all-games to capture every D1 game
    const scoreboardPaths = [
      `/scoreboard/basketball-women/d1/${Y}/${M}/${D}/all-conf`,
      `/scoreboard/basketball-women/d1/${Y}/${M}/${D}/all-games`,
    ];

    const dayGameIds = new Set();

    for (const path of scoreboardPaths) {
      try {
        const scoreboard = await fetchJson(path);
        const gameIds = extractGameIds(scoreboard).filter((gid) => !knownGameIds.has(gid));
        gameIds.forEach(gid => dayGameIds.add(gid));

        if (scoreboard.games && Array.isArray(scoreboard.games)) {
          for (const gameObj of scoreboard.games) {
            const confInfo = extractConferenceFromGame(gameObj);
            if (confInfo.gameId) conferenceMap.set(confInfo.gameId, confInfo);
          }
        }
      } catch (e) {
        console.log(`Failed to fetch ${path}:`, e.message);
      }
    }

    console.log(`${d}: ${dayGameIds.size} new games`);
    for (const gid of dayGameIds) newGameIds.push({ gid, date: d });
  }

  if (newGameIds.length === 0) {
    console.log("No new games to process. Exiting.");
    return;
  }

  console.log(`\nNew games to process: ${newGameIds.length}`);

  // Fetch boxscores
  const newGames = [];
  const successfulGameIds = [];

  const boxResults = await mapLimit(newGameIds, BOX_CONCURRENCY, async ({ gid, date }) => {
    try {
      const box = await fetchJson(`/game/${gid}/boxscore`);
      await sleep(BOX_DELAY_MS);
      return { gid, box, date };
    } catch (e) {
      console.log(`boxscore failed for ${gid}:`, e.message);
      await sleep(BOX_DELAY_MS);
      return { gid, box: null, date };
    }
  });

  for (const { gid, box, date } of boxResults) {
    if (!box) continue;
    const gameData = parseCompleteGameData(gid, box, date);
    if (!gameData) continue;

    const confInfo = conferenceMap.get(gid);
    if (confInfo) {
      gameData.home.conference = confInfo.homeConf;
      gameData.away.conference = confInfo.awayConf;
      gameData.isConferenceGame = confInfo.isConferenceGame;
    }

    newGames.push(gameData);
    successfulGameIds.push(gid);
  }

  console.log(`Successfully parsed ${newGames.length} new games`);

  if (newGames.length === 0) {
    console.log("No games parsed successfully. Exiting.");
    return;
  }

  // Update team stats - only for D1 teams
  for (const game of newGames) {
    const { home, away } = game;
    for (const [team, opp] of [[home, away], [away, home]]) {
      if (!isWD1Conference(team.conference)) continue;

      if (!teamStatsMap.has(team.teamId)) {
        teamStatsMap.set(team.teamId, {
          teamId: team.teamId, teamName: team.teamName, conference: team.conference,
          games: 0, wins: 0, losses: 0, points: 0, opp_points: 0,
          fgm: 0, fga: 0, tpm: 0, tpa: 0, ftm: 0, fta: 0,
          orb: 0, drb: 0, trb: 0, ast: 0, stl: 0, blk: 0, tov: 0, pf: 0,
          opp_fgm: 0, opp_fga: 0, opp_tpm: 0, opp_tpa: 0, opp_ftm: 0, opp_fta: 0,
          opp_orb: 0, opp_drb: 0, opp_trb: 0, opp_ast: 0, opp_stl: 0, opp_blk: 0, opp_tov: 0, opp_pf: 0,
        });
      }
      const s = teamStatsMap.get(team.teamId);
      s.games++;
      if (team.stats.points > opp.stats.points) s.wins++; else s.losses++;
      s.points += team.stats.points;
      s.fgm += team.stats.fgm; s.fga += team.stats.fga;
      s.tpm += team.stats.tpm; s.tpa += team.stats.tpa;
      s.ftm += team.stats.ftm; s.fta += team.stats.fta;
      s.orb += team.stats.orb; s.trb += team.stats.trb;
      s.drb += Math.max(0, team.stats.trb - team.stats.orb);
      s.ast += team.stats.ast; s.stl += team.stats.stl;
      s.blk += team.stats.blk; s.tov += team.stats.tov; s.pf += team.stats.pf;
      s.opp_points += opp.stats.points;
      s.opp_fgm += opp.stats.fgm; s.opp_fga += opp.stats.fga;
      s.opp_tpm += opp.stats.tpm; s.opp_tpa += opp.stats.tpa;
      s.opp_ftm += opp.stats.ftm; s.opp_fta += opp.stats.fta;
      s.opp_orb += opp.stats.orb; s.opp_trb += opp.stats.trb;
      s.opp_drb += Math.max(0, opp.stats.trb - opp.stats.orb);
      s.opp_ast += opp.stats.ast; s.opp_stl += opp.stats.stl;
      s.opp_blk += opp.stats.blk; s.opp_tov += opp.stats.tov; s.opp_pf += opp.stats.pf;
    }
  }

  // Update player stats - only for D1 teams
  for (const game of newGames) {
    if (!game.players) continue;
    for (const playerData of game.players) {
      if (!playerData.teamId || !playerData.players) continue;
      const teamId = String(playerData.teamId);
      const teamName = teamId === game.home.teamId ? game.home.teamName : game.away.teamName;
      const teamConf = teamId === game.home.teamId ? game.home.conference : game.away.conference;

      if (!isWD1Conference(teamConf)) continue;

      for (const p of playerData.players) {
        const playerId = buildPlayerId(teamId, p);
        if (!playerStatsMap.has(playerId)) {
          playerStatsMap.set(playerId, {
            playerId, teamId, teamName, division: DIVISION,
            firstName: p.firstName || "", lastName: p.lastName || "",
            number: p.number || "", position: p.position || "", year: p.year || "",
            games: 0, starts: 0, minutes: 0,
            fgm: 0, fga: 0, tpm: 0, tpa: 0, ftm: 0, fta: 0,
            orb: 0, drb: 0, trb: 0, ast: 0, stl: 0, blk: 0, tov: 0, pf: 0, points: 0,
          });
        }
        const ps = playerStatsMap.get(playerId);
        const mins = parseFloat(p.minutesPlayed || p.minutes || 0);
        if (mins > 0 || parseInt(p.points || 0) > 0) {
          ps.games++;
          if (p.starter === true || p.starter === "true") ps.starts++;
          ps.minutes += mins;
          ps.fgm += parseInt(p.fieldGoalsMade || 0);
          ps.fga += parseInt(p.fieldGoalsAttempted || 0);
          ps.tpm += parseInt(p.threePointsMade || 0);
          ps.tpa += parseInt(p.threePointsAttempted || 0);
          ps.ftm += parseInt(p.freeThrowsMade || 0);
          ps.fta += parseInt(p.freeThrowsAttempted || 0);
          ps.orb += parseInt(p.offensiveRebounds || 0);
          ps.trb += parseInt(p.totalRebounds || 0);
          ps.drb += Math.max(0, parseInt(p.totalRebounds || 0) - parseInt(p.offensiveRebounds || 0));
          ps.ast += parseInt(p.assists || 0);
          ps.stl += parseInt(p.steals || 0);
          ps.blk += parseInt(p.blockedShots || 0);
          ps.tov += parseInt(p.turnovers || 0);
          ps.pf += parseInt(p.personalFouls || 0);
          ps.points += parseInt(p.points || 0);
        }
      }
    }
  }

  // Rebuild ratings
  const ratingsRows = [];
  for (const [teamId, stats] of teamStatsMap) {
    const offPoss = Math.max(1, stats.fga - stats.orb + stats.tov + 0.475 * stats.fta);
    const defPoss = Math.max(1, stats.opp_fga - stats.opp_orb + stats.opp_tov + 0.475 * stats.opp_fta);
    const adjO = (stats.points / offPoss) * 100;
    const adjD = (stats.opp_points / defPoss) * 100;
    ratingsRows.push({
      teamId, team: stats.teamName, conference: stats.conference,
      games: stats.games, adjO, adjD, adjEM: adjO - adjD,
      adjT: offPoss / Math.max(1, stats.games),
    });
  }
  ratingsRows.sort((a, b) => b.adjEM - a.adjEM);

  if (ratingsRows.length < MIN_TEAMS) {
    throw new Error(`BAD RUN: Only ${ratingsRows.length} teams found (expected ${MIN_TEAMS}+). Aborting.`);
  }

  const allPlayers = Array.from(playerStatsMap.values()).filter((p) => p.games > 0);

  // Save JSON files
  await fs.writeFile(
    "public/data/womens_d1_ratings.json",
    JSON.stringify({ generated_at_utc: new Date().toISOString(), season_start: SEASON_START, rows: ratingsRows }, null, 2),
    "utf8"
  );
  console.log(`✅ Updated womens_d1_ratings.json (${ratingsRows.length} teams)`);

  await fs.writeFile(
    "public/data/womens_d1_team_stats.json",
    JSON.stringify({ generated_at_utc: new Date().toISOString(), teams: Array.from(teamStatsMap.values()) }, null, 2),
    "utf8"
  );

  await fs.writeFile(
    "public/data/womens_d1_player_stats.json",
    JSON.stringify({ generated_at_utc: new Date().toISOString(), players: allPlayers }, null, 2),
    "utf8"
  );
  console.log(`✅ Updated womens_d1_player_stats.json (${allPlayers.length} players)`);

  // Update cache
  const updatedGameIds = [...knownGameIds, ...successfulGameIds];
  await fs.writeFile(
    "public/data/womens_d1_games_cache.json",
    JSON.stringify({
      generated_at_utc: new Date().toISOString(),
      note: "Contains ONLY successfully parsed game IDs",
      total_games: updatedGameIds.length,
      game_ids: updatedGameIds,
    }, null, 2),
    "utf8"
  );

  // Write to database
  if (process.env.POSTGRES_URL) {
    console.log("\n📊 Writing to database...");
    db.initDb();

    const gameLogEntries = newGames.map(game => ({
      gameId: game.gameId,
      date: game.date,
      division: DIVISION,
      homeTeam: game.home.teamName,
      homeId: game.home.teamId,
      homeScore: game.home.stats.points,
      homeConf: game.home.conference,
      homeStats: game.home.stats,
      awayTeam: game.away.teamName,
      awayId: game.away.teamId,
      awayScore: game.away.stats.points,
      awayConf: game.away.conference,
      awayStats: game.away.stats,
      isConferenceGame: game.isConferenceGame,
    }));

    for (const game of gameLogEntries) await db.insertGame(game);
    console.log(`✅ Wrote ${gameLogEntries.length} new games`);

    const playerGameRows = [];
    for (const game of newGames) {
      if (!game.players) continue;
      for (const teamData of game.players) {
        const teamConf = teamData.teamId === game.home.teamId ? game.home.conference : game.away.conference;
        if (!isWD1Conference(teamConf)) continue;
        for (const p of teamData.players) {
          const playerId = buildPlayerId(teamData.teamId, p);
          playerGameRows.push({
            gameId: game.gameId, playerId, teamId: teamData.teamId, division: DIVISION,
            minutes: parseFloat(p.minutesPlayed || p.minutes || 0),
            fgm: parseInt(p.fieldGoalsMade || 0), fga: parseInt(p.fieldGoalsAttempted || 0),
            tpm: parseInt(p.threePointsMade || 0), tpa: parseInt(p.threePointsAttempted || 0),
            ftm: parseInt(p.freeThrowsMade || 0), fta: parseInt(p.freeThrowsAttempted || 0),
            orb: parseInt(p.offensiveRebounds || 0),
            drb: Math.max(0, parseInt(p.totalRebounds || 0) - parseInt(p.offensiveRebounds || 0)),
            trb: parseInt(p.totalRebounds || 0),
            ast: parseInt(p.assists || 0), stl: parseInt(p.steals || 0),
            blk: parseInt(p.blockedShots || 0), tov: parseInt(p.turnovers || 0),
            pf: parseInt(p.personalFouls || 0), points: parseInt(p.points || 0),
          });
        }
      }
    }
    const playerGameCount = await db.insertPlayerGamesBatch(playerGameRows);
    console.log(`✅ Wrote ${playerGameCount} player game records`);

    for (const [teamId, stats] of teamStatsMap) {
      const row = ratingsRows.find(r => r.teamId === teamId);
      if (row) await db.upsertTeam({ ...stats, ...row, teamName: stats.teamName, division: DIVISION });
    }
    console.log(`✅ Updated ${teamStatsMap.size} teams`);

    for (const player of allPlayers) await db.upsertPlayer(player);
    console.log(`✅ Updated ${allPlayers.length} players`);

    await db.closeDb();
  }

  console.log(`\n✅ Daily update complete. Processed ${newGames.length} new games.`);
}

main().catch((e) => {
  console.error("FATAL", e);
  process.exit(1);
});
