import fs from "node:fs/promises";
import { initDb, insertGame, upsertTeam, upsertPlayer, insertPlayerGamesBatch, closeDb } from './db_writer.mjs';

const NCAA_API_BASE = "https://ncaa-api.henrygd.me";
const DIVISION = "mens-d2";
const SEASON_START = "2025-11-14";
const BOX_DELAY_MS = 400;
const REQUEST_TIMEOUT_MS = 20000;
const REQUEST_RETRIES = 3;
const BOX_CONCURRENCY = 4;
const MIN_TEAMS_REQUIRED = 200;

const dbEnabled = !!process.env.POSTGRES_URL;
if (dbEnabled) {
  console.log("Database connection enabled");
  initDb();
} else {
  console.log("No POSTGRES_URL - skipping database writes");
}

console.log("START build_mens_d2_ratings (incremental)", new Date().toISOString());

// ===== UTILITY FUNCTIONS =====

function fmtDate(dt) {
  const y = dt.getUTCFullYear();
  const m = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const d = String(dt.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
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
          "Accept-Language": "en-US,en;q=0.9",
          "Referer": "https://www.ncaa.com/",
          "Origin": "https://www.ncaa.com/",
        },
      });

      if (!res.ok) {
        if ([428, 502].includes(res.status) && attempt < REQUEST_RETRIES) {
          await sleep(2000 * (attempt + 1));
          continue;
        }
        throw new Error(`Fetch failed ${res.status} for ${path}`);
      }

      return await res.json();
    } catch (e) {
      if (attempt < REQUEST_RETRIES) {
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
    const gameId = game.gameID || game.gameId;
    return {
      gameId: String(gameId),
      homeConf,
      awayConf,
      isConferenceGame: homeConf && awayConf && homeConf === awayConf,
    };
  } catch {
    return {};
  }
}

function toInt(x, d = 0) {
  const n = parseInt(String(x ?? ""), 10);
  return Number.isFinite(n) ? n : d;
}

function toFloat(x, d = 0) {
  const n = parseFloat(String(x ?? ""));
  return Number.isFinite(n) ? n : d;
}

function pick(obj, keys) {
  for (const k of keys) {
    if (obj && obj[k] != null) return obj[k];
  }
  return null;
}

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
    minutes: toFloat(pick(raw, ["minutesPlayed", "minutes", "mins", "min"]), 0),
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
  const candidates = [
    gameJson?.teams, gameJson?.game?.teams,
    gameJson?.meta?.teams, gameJson?.header?.teams,
  ].filter(Array.isArray);
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

function parseBoxscore(gameId, gameJson, gameDate, confInfo) {
  const teamsArr = findTeamsMeta(gameJson);
  if (!teamsArr || teamsArr.length < 2) return null;

  const withHomeFlag = teamsArr.map((t) => ({
    t, id: String(pick(t, ["teamId", "team_id", "id"])), home: isHomeFromMeta(t),
  }));

  const homeMeta = withHomeFlag.find((x) => x.home === true)?.t ?? withHomeFlag[0]?.t;
  const awayMeta = withHomeFlag.find((x) => x.home === false)?.t ?? withHomeFlag[1]?.t;
  const homeId = String(pick(homeMeta, ["teamId", "team_id", "id"]));
  const awayId = String(pick(awayMeta, ["teamId", "team_id", "id"]));

  const candidates = deepCollectTeamStats(gameJson);
  if (!candidates.length) return null;

  const bestById = new Map();
  for (const c of candidates) {
    const key = String(c.teamId);
    const s = c.stats;
    const score = (s.points || 0) + (s.fga || 0) + (s.fta || 0)
      + (s.blk || 0) * 100 + (s.stl || 0) * 100 + (s.ast || 0) * 10 + (s.orb || 0) + (s.tov || 0);
    const prev = bestById.get(key);
    if (!prev || score > prev.score) bestById.set(key, { stats: c.stats, score });
  }

  const homeStats = bestById.get(homeId)?.stats ?? null;
  const awayStats = bestById.get(awayId)?.stats ?? null;
  if (!homeStats || !awayStats) return null;

  return {
    gameId, date: gameDate,
    home: { teamId: homeId, teamName: nameFromMeta(homeMeta), stats: homeStats, conference: confInfo?.homeConf ?? null },
    away: { teamId: awayId, teamName: nameFromMeta(awayMeta), stats: awayStats, conference: confInfo?.awayConf ?? null },
    isConferenceGame: confInfo?.isConferenceGame ?? false,
    players: extractPlayers(gameJson),
  };
}

// ===== CACHE & FILE HELPERS =====

async function loadKnownGameIds() {
  try {
    const data = await fs.readFile("public/data/mens_d2_games_cache.json", "utf8");
    const parsed = JSON.parse(data);
    if (Array.isArray(parsed)) return new Set(parsed.map(String));
    if (Array.isArray(parsed.game_ids)) return new Set(parsed.game_ids.map(String));
    return new Set();
  } catch {
    return new Set();
  }
}

async function saveKnownGameIds(newlyParsedIds) {
  try {
    const data = await fs.readFile("public/data/mens_d2_games_cache.json", "utf8");
    const parsed = JSON.parse(data);
    const existingIds = Array.isArray(parsed.game_ids) ? parsed.game_ids : [];
    const updatedIds = [...new Set([...existingIds, ...newlyParsedIds])];
    await fs.writeFile(
      "public/data/mens_d2_games_cache.json",
      JSON.stringify({ ...parsed, game_ids: updatedIds, total_games: updatedIds.length }, null, 2),
      "utf8"
    );
    console.log(`Cache updated: ${updatedIds.length} total parsed games`);
  } catch {
    await fs.writeFile(
      "public/data/mens_d2_games_cache.json",
      JSON.stringify({ game_ids: [...newlyParsedIds], total_games: newlyParsedIds.length }, null, 2),
      "utf8"
    );
  }
}

async function loadExistingTeamStats() {
  try {
    const data = await fs.readFile("public/data/mens_d2_team_stats.json", "utf8");
    const parsed = JSON.parse(data);
    const teamMap = new Map();
    for (const t of (parsed.teams || [])) teamMap.set(t.teamId, { ...t });
    console.log(`Loaded ${teamMap.size} teams from mens_d2_team_stats.json`);
    return teamMap;
  } catch {
    console.log("No existing mens_d2_team_stats.json - starting fresh");
    return new Map();
  }
}

async function loadExistingPlayerStats() {
  try {
    const data = await fs.readFile("public/data/mens_d2_player_stats.json", "utf8");
    const parsed = JSON.parse(data);
    const playerMap = new Map();
    for (const p of (parsed.players || [])) playerMap.set(p.playerId, { ...p });
    console.log(`Loaded ${playerMap.size} players from mens_d2_player_stats.json`);
    return playerMap;
  } catch {
    console.log("No existing mens_d2_player_stats.json - starting fresh");
    return new Map();
  }
}

// ===== MAIN =====

async function main() {
  const today = new Date();

  const datesToCheck = [
    fmtDate(new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - 1))),
    fmtDate(new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - 2))),
  ];

  console.log(`Checking dates: ${datesToCheck.join(", ")}`);

  const teamSeasonStats = await loadExistingTeamStats();
  const playerSeasonStats = await loadExistingPlayerStats();
  const knownGameIds = await loadKnownGameIds();
  console.log(`Already have ${knownGameIds.size} successfully parsed games in cache`);

  const allGameIds = new Set();
  const gameIdToDate = new Map();
  const conferenceMap = new Map();

  for (const dateStr of datesToCheck) {
    const [Y, M, D] = dateStr.split("-");
    const scoreboardPath = `/scoreboard/basketball-men/d2/${Y}/${M}/${D}/all-conf`;

    try {
      const scoreboard = await fetchJson(scoreboardPath);
      const gameIds = extractGameIds(scoreboard);
      console.log(`Found ${gameIds.length} games on ${dateStr}`);
      gameIds.forEach(gid => {
        allGameIds.add(gid);
        gameIdToDate.set(gid, dateStr);
      });

      if (scoreboard.games && Array.isArray(scoreboard.games)) {
        for (const gameObj of scoreboard.games) {
          const confInfo = extractConferenceFromGame(gameObj);
          if (confInfo.gameId) conferenceMap.set(confInfo.gameId, confInfo);
        }
      }
    } catch (e) {
      console.error(`Failed to fetch scoreboard for ${dateStr}:`, e.message);
    }
  }

  const newGameIds = [...allGameIds].filter(gid => !knownGameIds.has(gid));
  console.log(`Total unique games found: ${allGameIds.size}`);
  console.log(`New games to process: ${newGameIds.length}`);

  if (newGameIds.length === 0) {
    console.log("No new games found - already up to date!");
    if (dbEnabled) await closeDb();
    process.exit(0);
  }

  let newGamesProcessed = 0;
  let failed = 0;
  const processedGameIds = [];
  const newGamesForDb = [];
  const newPlayerGameRows = [];

  const boxscoreFetches = await mapLimit(newGameIds, BOX_CONCURRENCY, async (gid) => {
    try {
      const box = await fetchJson(`/game/${gid}/boxscore`);
      await sleep(BOX_DELAY_MS);
      return { gid, box };
    } catch (e) {
      console.log(`Failed to fetch game ${gid}:`, e.message);
      failed++;
      return { gid, box: null };
    }
  });

  for (const { gid, box } of boxscoreFetches) {
    if (!box) continue;

    const confInfo = conferenceMap.get(gid);
    const gameDate = gameIdToDate.get(gid) || fmtDate(today);
    const gameData = parseBoxscore(gid, box, gameDate, confInfo);

    if (!gameData) {
      console.log(`Failed to parse game ${gid}`);
      failed++;
      continue;
    }

    const { home, away } = gameData;

    newGamesForDb.push({
      gameId: gameData.gameId,
      date: gameData.date,
      division: DIVISION,
      homeId: home.teamId,
      homeTeam: home.teamName,
      homeScore: home.stats.points,
      homeConf: home.conference,
      awayId: away.teamId,
      awayTeam: away.teamName,
      awayScore: away.stats.points,
      awayConf: away.conference,
      isConferenceGame: gameData.isConferenceGame,
      homeStats: {
        fgm: home.stats.fgm, fga: home.stats.fga,
        tpm: home.stats.tpm, tpa: home.stats.tpa,
        ftm: home.stats.ftm, fta: home.stats.fta,
        orb: home.stats.orb, drb: Math.max(0, home.stats.trb - home.stats.orb), trb: home.stats.trb,
        ast: home.stats.ast, stl: home.stats.stl, blk: home.stats.blk,
        tov: home.stats.tov, pf: home.stats.pf,
      },
      awayStats: {
        fgm: away.stats.fgm, fga: away.stats.fga,
        tpm: away.stats.tpm, tpa: away.stats.tpa,
        ftm: away.stats.ftm, fta: away.stats.fta,
        orb: away.stats.orb, drb: Math.max(0, away.stats.trb - away.stats.orb), trb: away.stats.trb,
        ast: away.stats.ast, stl: away.stats.stl, blk: away.stats.blk,
        tov: away.stats.tov, pf: away.stats.pf,
      },
    });

    // Update team season stats
    for (const side of [home, away]) {
      const opp = side === home ? away : home;
      const existing = teamSeasonStats.get(side.teamId);

      if (!existing) {
        teamSeasonStats.set(side.teamId, {
          teamId: side.teamId, teamName: side.teamName, conference: side.conference,
          games: 1,
          wins: side.stats.points > opp.stats.points ? 1 : 0,
          losses: side.stats.points > opp.stats.points ? 0 : 1,
          points: side.stats.points, opp_points: opp.stats.points,
          fgm: side.stats.fgm, fga: side.stats.fga,
          tpm: side.stats.tpm, tpa: side.stats.tpa,
          ftm: side.stats.ftm, fta: side.stats.fta,
          orb: side.stats.orb, drb: Math.max(0, side.stats.trb - side.stats.orb), trb: side.stats.trb,
          ast: side.stats.ast, stl: side.stats.stl, blk: side.stats.blk, tov: side.stats.tov, pf: side.stats.pf,
          opp_fgm: opp.stats.fgm, opp_fga: opp.stats.fga,
          opp_tpm: opp.stats.tpm, opp_tpa: opp.stats.tpa,
          opp_ftm: opp.stats.ftm, opp_fta: opp.stats.fta,
          opp_orb: opp.stats.orb, opp_drb: Math.max(0, opp.stats.trb - opp.stats.orb), opp_trb: opp.stats.trb,
          opp_ast: opp.stats.ast, opp_stl: opp.stats.stl, opp_blk: opp.stats.blk, opp_tov: opp.stats.tov, opp_pf: opp.stats.pf,
        });
      } else {
        existing.games++;
        if (!existing.conference && side.conference) existing.conference = side.conference;
        if (side.stats.points > opp.stats.points) existing.wins++; else existing.losses++;
        existing.points += side.stats.points; existing.opp_points += opp.stats.points;
        existing.fgm += side.stats.fgm; existing.fga += side.stats.fga;
        existing.tpm += side.stats.tpm; existing.tpa += side.stats.tpa;
        existing.ftm += side.stats.ftm; existing.fta += side.stats.fta;
        existing.orb += side.stats.orb; existing.trb += side.stats.trb;
        existing.drb += Math.max(0, side.stats.trb - side.stats.orb);
        existing.ast += side.stats.ast; existing.stl += side.stats.stl; existing.blk += side.stats.blk;
        existing.tov += side.stats.tov; existing.pf += side.stats.pf;
        existing.opp_fgm += opp.stats.fgm; existing.opp_fga += opp.stats.fga;
        existing.opp_tpm += opp.stats.tpm; existing.opp_tpa += opp.stats.tpa;
        existing.opp_ftm += opp.stats.ftm; existing.opp_fta += opp.stats.fta;
        existing.opp_orb += opp.stats.orb; existing.opp_trb += opp.stats.trb;
        existing.opp_drb += Math.max(0, opp.stats.trb - opp.stats.orb);
        existing.opp_ast += opp.stats.ast; existing.opp_stl += opp.stats.stl; existing.opp_blk += opp.stats.blk;
        existing.opp_tov += opp.stats.tov; existing.opp_pf += opp.stats.pf;
      }
    }

    // Update player stats and collect game rows - only for known D2 teams
    if (gameData.players && Array.isArray(gameData.players)) {
      for (const playerData of gameData.players) {
        if (!playerData.teamId || !playerData.players) continue;
        const teamId = String(playerData.teamId);
        if (!teamSeasonStats.has(teamId)) continue;
        const teamName = teamId === home.teamId ? home.teamName : away.teamName;

        for (const p of playerData.players) {
          const playerId = buildPlayerId(teamId, p);
          const mins = parseFloat(p.minutesPlayed || p.minutes || 0);
          if (mins <= 0 && parseInt(p.points || 0) <= 0) continue;

          const pg = {
            fgm: parseInt(p.fieldGoalsMade || 0),
            fga: parseInt(p.fieldGoalsAttempted || 0),
            tpm: parseInt(p.threePointsMade || 0),
            tpa: parseInt(p.threePointsAttempted || 0),
            ftm: parseInt(p.freeThrowsMade || 0),
            fta: parseInt(p.freeThrowsAttempted || 0),
            orb: parseInt(p.offensiveRebounds || 0),
            trb: parseInt(p.totalRebounds || 0),
            drb: Math.max(0, parseInt(p.totalRebounds || 0) - parseInt(p.offensiveRebounds || 0)),
            ast: parseInt(p.assists || 0),
            stl: parseInt(p.steals || 0),
            blk: parseInt(p.blockedShots || 0),
            tov: parseInt(p.turnovers || 0),
            pf: parseInt(p.personalFouls || 0),
            points: parseInt(p.points || 0),
          };

          const existing = playerSeasonStats.get(playerId);
          if (!existing) {
            playerSeasonStats.set(playerId, {
              playerId, teamId, teamName, division: DIVISION,
              firstName: p.firstName || "", lastName: p.lastName || "",
              number: p.number || "", position: p.position || "", year: p.year || "",
              games: 1, starts: (p.starter === true || p.starter === "true") ? 1 : 0,
              minutes: mins, ...pg,
            });
          } else {
            existing.games++;
            if (p.starter === true || p.starter === "true") existing.starts++;
            existing.minutes += mins;
            for (const key of ['fgm','fga','tpm','tpa','ftm','fta','orb','drb','trb','ast','stl','blk','tov','pf','points']) {
              existing[key] += pg[key];
            }
          }

          newPlayerGameRows.push({
            gameId: gid, playerId, teamId, division: DIVISION, minutes: mins, ...pg,
          });
        }
      }
    }

    processedGameIds.push(gid);
    newGamesProcessed++;
  }

  console.log(`Successfully processed ${newGamesProcessed} new games, ${failed} failed`);

  // ===== WRITE TO DATABASE =====
  if (dbEnabled) {
    console.log(`Writing ${newGamesForDb.length} new games to database...`);
    for (const game of newGamesForDb) {
      try { await insertGame(game); } catch { /* ON CONFLICT DO NOTHING */ }
    }
    console.log(`✅ Wrote ${newGamesForDb.length} games`);

    if (newPlayerGameRows.length > 0) {
      console.log(`Writing ${newPlayerGameRows.length} player game records...`);
      const inserted = await insertPlayerGamesBatch(newPlayerGameRows);
      console.log(`✅ Wrote ${inserted} player game records`);
    }

    const updatedPlayerIds = new Set(newPlayerGameRows.map(r => r.playerId));
    const playersToUpdate = [...playerSeasonStats.values()].filter(p => updatedPlayerIds.has(p.playerId));
    console.log(`Updating ${playersToUpdate.length} player season totals...`);
    for (const player of playersToUpdate) {
      try { await upsertPlayer(player); } catch (err) { console.error(`Failed to upsert player ${player.playerId}:`, err.message); }
    }
    console.log(`✅ Updated ${playersToUpdate.length} players`);

    const teamsToUpdate = [...teamSeasonStats.values()].filter(t =>
      newGamesForDb.some(g => g.homeId === t.teamId || g.awayId === t.teamId)
    );
    console.log(`Updating ${teamsToUpdate.length} team records...`);
    for (const t of teamsToUpdate) {
      const offPoss = Math.max(1, t.fga - t.orb + t.tov + 0.475 * t.fta);
      const defPoss = Math.max(1, t.opp_fga - t.opp_orb + t.opp_tov + 0.475 * t.opp_fta);
      try {
        await upsertTeam({
          teamId: t.teamId, teamName: t.teamName, conference: t.conference, division: DIVISION,
          games: t.games, wins: t.wins, losses: t.losses,
          adjO: (t.points / offPoss) * 100,
          adjD: (t.opp_points / defPoss) * 100,
          adjEM: ((t.points / offPoss) - (t.opp_points / defPoss)) * 100,
          adjT: offPoss / Math.max(1, t.games),
          points: t.points, opp_points: t.opp_points,
          fgm: t.fgm, fga: t.fga, tpm: t.tpm, tpa: t.tpa, ftm: t.ftm, fta: t.fta,
          orb: t.orb, drb: t.drb, trb: t.trb, ast: t.ast, stl: t.stl, blk: t.blk, tov: t.tov, pf: t.pf,
          opp_fgm: t.opp_fgm, opp_fga: t.opp_fga, opp_tpm: t.opp_tpm, opp_tpa: t.opp_tpa,
          opp_ftm: t.opp_ftm, opp_fta: t.opp_fta,
          opp_orb: t.opp_orb, opp_drb: t.opp_drb, opp_trb: t.opp_trb,
          opp_ast: t.opp_ast, opp_stl: t.opp_stl, opp_blk: t.opp_blk, opp_tov: t.opp_tov, opp_pf: t.opp_pf,
        });
      } catch (err) { console.error(`Failed to update team ${t.teamId}:`, err.message); }
    }
    console.log(`✅ Updated ${teamsToUpdate.length} teams`);

    await closeDb();
    console.log("✅ Database updates complete");
  }

  // ===== SAVE JSON FILES =====
  await fs.mkdir("public/data", { recursive: true });

  const ratingsRows = [];
  for (const [teamId, stats] of teamSeasonStats) {
    const offPoss = Math.max(1, stats.fga - stats.orb + stats.tov + 0.475 * stats.fta);
    const defPoss = Math.max(1, stats.opp_fga - stats.opp_orb + stats.opp_tov + 0.475 * stats.opp_fta);
    ratingsRows.push({
      teamId, team: stats.teamName, conference: stats.conference, games: stats.games,
      adjO: (stats.points / offPoss) * 100,
      adjD: (stats.opp_points / defPoss) * 100,
      adjEM: ((stats.points / offPoss) - (stats.opp_points / defPoss)) * 100,
      adjT: offPoss / Math.max(1, stats.games),
    });
  }
  ratingsRows.sort((a, b) => b.adjEM - a.adjEM);

  if (ratingsRows.length < MIN_TEAMS_REQUIRED) {
    throw new Error(`BAD RUN: only ${ratingsRows.length} teams. Refusing to overwrite JSON files.`);
  }

  await fs.writeFile(
    "public/data/mens_d2_ratings.json",
    JSON.stringify({ generated_at_utc: new Date().toISOString(), season_start: SEASON_START, rows: ratingsRows }, null, 2),
    "utf8"
  );
  console.log(`✅ Updated mens_d2_ratings.json (${ratingsRows.length} teams)`);

  await fs.writeFile(
    "public/data/mens_d2_team_stats.json",
    JSON.stringify({ generated_at_utc: new Date().toISOString(), teams: [...teamSeasonStats.values()] }, null, 2),
    "utf8"
  );
  console.log(`✅ Updated mens_d2_team_stats.json`);

  const allPlayers = [...playerSeasonStats.values()].filter(p => p.games > 0);
  await fs.writeFile(
    "public/data/mens_d2_player_stats.json",
    JSON.stringify({ generated_at_utc: new Date().toISOString(), players: allPlayers }, null, 2),
    "utf8"
  );
  console.log(`✅ Updated mens_d2_player_stats.json (${allPlayers.length} players)`);

  await saveKnownGameIds(processedGameIds);

  console.log(`\n✅ Done! Processed ${newGamesProcessed} new games, ${failed} failed`);
  if (failed > 0) console.log(`⚠️  ${failed} games failed - check logs`);
}

main().catch((e) => {
  console.error("FATAL", e);
  process.exit(1);
});
