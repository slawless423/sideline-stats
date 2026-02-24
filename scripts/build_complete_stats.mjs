import fs from "node:fs/promises";
import * as db from "./db_writer.mjs";

const NCAA_API_BASE = "https://ncaa-api.henrygd.me";
const SEASON_START = "2025-11-01";
const BOX_DELAY_MS = 400;
const REQUEST_TIMEOUT_MS = 20000;
const REQUEST_RETRIES = 3;
const BOX_CONCURRENCY = 4;
const RETRY_428_DELAY_MS = 2000;
const MIN_TEAMS_REQUIRED = 300;

console.log("START build_complete_stats", new Date().toISOString());

// ===== UTILITY FUNCTIONS =====

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

async function fetchJson(path, isBoxscore = false) {
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
        if (res.status === 502 || res.status === 428) {
          if (attempt < REQUEST_RETRIES) {
            await sleep(RETRY_428_DELAY_MS * (attempt + 1));
            continue;
          }
        }

        if (isBoxscore && (globalThis.__BOX_HTTP_FAILS__ ?? 0) < 10) {
          globalThis.__BOX_HTTP_FAILS__ = (globalThis.__BOX_HTTP_FAILS__ ?? 0) + 1;
          console.log("BOX HTTP FAIL", res.status, path);
        }

        const retryable = [429, 500, 502, 503, 504].includes(res.status);
        if (retryable && attempt < REQUEST_RETRIES) {
          await sleep(400 * (attempt + 1));
          continue;
        }
        throw new Error(`Fetch failed ${res.status} for ${path}`);
      }

      return await res.json();
    } catch (e) {
      const msg = String(e?.message ?? e);
      const isTimeout =
        msg.includes("AbortError") ||
        msg.toLowerCase().includes("aborted") ||
        msg.toLowerCase().includes("timeout");

      if ((isTimeout || msg.includes("ECONNRESET") || msg.includes("ENOTFOUND")) && attempt < REQUEST_RETRIES) {
        await sleep(500 * (attempt + 1));
        continue;
      }
      if (isTimeout) throw new Error(`Fetch timed out after ${REQUEST_TIMEOUT_MS}ms for ${path}`);
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

function poss(fga, orb, tov, fta) {
  return Math.max(1, fga - orb + tov + 0.475 * fta);
}

function pick(obj, keys) {
  for (const k of keys) {
    if (obj && obj[k] != null) return obj[k];
  }
  return null;
}

// ===== ENHANCED STAT EXTRACTION =====

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
      if (stats.points || stats.fga || stats.fta) {
        out.push({ teamId: String(teamId), stats });
      }

      const nested = pick(x, ["teamStats", "team_stats", "statistics", "stats", "totals"]);
      if (nested && typeof nested === "object") {
        const nestedStats = extractCompleteStats(nested);
        if (nestedStats.points || nestedStats.fga || nestedStats.fta) {
          out.push({ teamId: String(teamId), stats: nestedStats });
        }
      }
    }

    Object.values(x).forEach(walk);
  };

  walk(root);
  return out;
}

function extractPlayers(gameJson) {
  const result = [];
  
  const walk = (x) => {
    if (Array.isArray(x)) {
      x.forEach(walk);
    } else if (x && typeof x === 'object') {
      if (x.playerStats && Array.isArray(x.playerStats) && x.playerStats.length > 0) {
        const teamId = pick(x, ["teamId", "team_id", "id"]);
        if (teamId) {
          result.push({
            teamId: String(teamId),
            players: x.playerStats
          });
        }
      }
      Object.values(x).forEach(walk);
    }
  };
  
  walk(gameJson);
  return result;
}

function findTeamsMeta(gameJson) {
  const candidates = [
    gameJson?.teams,
    gameJson?.game?.teams,
    gameJson?.meta?.teams,
    gameJson?.header?.teams,
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
      if (ok.length >= 2) {
        found = ok;
        return;
      }
      x.forEach(walk);
      return;
    }
    if (x && typeof x === "object") Object.values(x).forEach(walk);
  };
  walk(gameJson);
  return found;
}

function nameFromMeta(t) {
  return String(
    pick(t, ["nameShort", "name_short", "shortName", "nameFull", "name_full", "fullName", "name"]) ?? "Team"
  );
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

// ===== PARSE COMPLETE GAME DATA =====

function parseCompleteGameData(gameId, gameJson, gameDate) {
  const teamsArr = findTeamsMeta(gameJson);
  if (!teamsArr || teamsArr.length < 2) return null;

  const withHomeFlag = teamsArr.map((t) => ({
    t,
    id: String(pick(t, ["teamId", "team_id", "id"])),
    home: isHomeFromMeta(t),
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
    const score = 
      (s.points || 0) + 
      (s.fga || 0) + 
      (s.fta || 0) + 
      (s.blk || 0) * 100 +
      (s.stl || 0) * 100 +
      (s.ast || 0) * 10 +
      (s.orb || 0) + 
      (s.tov || 0);
    const prev = bestById.get(key);
    if (!prev || score > prev.score) bestById.set(key, { stats: c.stats, score });
  }

  const homeStats = bestById.get(homeId)?.stats ?? null;
  const awayStats = bestById.get(awayId)?.stats ?? null;
  if (!homeStats || !awayStats) return null;

  const playerData = extractPlayers(gameJson);

  return {
    gameId,
    date: gameDate,
    home: {
      teamId: homeId,
      teamName: nameFromMeta(homeMeta),
      stats: homeStats,
    },
    away: {
      teamId: awayId,
      teamName: nameFromMeta(awayMeta),
      stats: awayStats,
    },
    players: playerData,
  };
}

// ===== MAIN SCRAPING LOGIC =====

async function main() {
  const today = new Date();
  const end = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  const start = toDate(SEASON_START);

  const allGames = [];
  const seenGameIds = new Set();

  let days = 0;
  let totalGamesFound = 0;
  let totalBoxesFetched = 0;
  let totalBoxesParsed = 0;
  let totalBoxesFailed = 0;

  console.log("Scraping complete game data (team + player stats)...\n");

  for (let dt = start; dt <= end; dt = addDays(dt, 1)) {
    days++;
    const d = fmtDate(dt);
    const [Y, M, D] = d.split("-");
    const scoreboardPath = `/scoreboard/basketball-women/d1/${Y}/${M}/${D}/all-conf`;

    if (days % 7 === 1) console.log("DATE", d);

    let scoreboard;
    try {
      scoreboard = await fetchJson(scoreboardPath, false);
    } catch (e) {
      if ((globalThis.__SCOREBOARD_FAILS__ ?? 0) < 50) {
        globalThis.__SCOREBOARD_FAILS__ = (globalThis.__SCOREBOARD_FAILS__ ?? 0) + 1;
        console.log("SCOREBOARD FETCH FAILED for", d);
      }
      continue;
    }

    const gameIds = extractGameIds(scoreboard).filter((gid) => !seenGameIds.has(gid));

    const conferenceMap = new Map();
    if (scoreboard.games && Array.isArray(scoreboard.games)) {
      for (const gameObj of scoreboard.games) {
        const confInfo = extractConferenceFromGame(gameObj);
        if (confInfo.gameId) {
          conferenceMap.set(confInfo.gameId, confInfo);
        }
      }
      if (days % 7 === 1 && conferenceMap.size > 0) {
        console.log(`Extracted conference for ${conferenceMap.size} games on ${d}`);
      }
    }

    if (gameIds.length) console.log("games on", d, "=", gameIds.length);
    if (!gameIds.length) continue;

    for (const gid of gameIds) seenGameIds.add(gid);
    totalGamesFound += gameIds.length;

    const boxscoreFetches = await mapLimit(gameIds, BOX_CONCURRENCY, async (gid) => {
      try {
        const box = await fetchJson(`/game/${gid}/boxscore`, true);
        await sleep(BOX_DELAY_MS);
        return { gid, box, date: d };
      } catch (e) {
        if ((globalThis.__BOX_FAILS__ ?? 0) < 10) {
          globalThis.__BOX_FAILS__ = (globalThis.__BOX_FAILS__ ?? 0) + 1;
          console.log("boxscore fetch failed for gid:", gid);
        }
        await sleep(BOX_DELAY_MS);
        return { gid, box: null, date: d };
      }
    });

    for (const { gid, box, date } of boxscoreFetches) {
      if (!box) {
        totalBoxesFailed++;
        continue;
      }

      totalBoxesFetched++;

      if (totalBoxesFetched === 1) {
        await fs.mkdir("public/data", { recursive: true });
        await fs.writeFile(
          "public/data/sample_boxscore.json",
          JSON.stringify(box, null, 2),
          "utf8"
        );
        console.log(`Saved sample boxscore for game ${gid} to public/data/sample_boxscore.json`);
      }

      const gameData = parseCompleteGameData(gid, box, date);
      if (!gameData) {
        totalBoxesFailed++;
        continue;
      }

      const confInfo = conferenceMap.get(gid);
      if (confInfo) {
        gameData.home.conference = confInfo.homeConf;
        gameData.away.conference = confInfo.awayConf;
        gameData.isConferenceGame = confInfo.isConferenceGame;
      }

      totalBoxesParsed++;
      allGames.push(gameData);
    }
  }

  console.log(
    "\n=== SCRAPING COMPLETE ===",
    "\ndays=", days,
    "\ngamesFound=", totalGamesFound,
    "\nboxesParsed=", totalBoxesParsed,
    "\nboxesFailed=", totalBoxesFailed,
    "\nsuccessRate=", totalGamesFound > 0 ? ((totalBoxesParsed / totalGamesFound) * 100).toFixed(1) + "%" : "0%"
  );

  console.log("\nProcessing team and player statistics...");

  const teamSeasonStats = new Map();
  const playerSeasonStats = new Map();
  const gamesLog = [];

  for (const game of allGames) {
    const { home, away } = game;

    const gameLogEntry = {
      gameId: game.gameId,
      date: game.date,
      division: 'womens-d1',
      homeTeam: home.teamName,
      homeId: home.teamId,
      homeScore: home.stats.points,
      homeConf: home.conference,
      homeStats: {
        fgm: home.stats.fgm, fga: home.stats.fga,
        tpm: home.stats.tpm, tpa: home.stats.tpa,
        ftm: home.stats.ftm, fta: home.stats.fta,
        orb: home.stats.orb, drb: home.stats.drb, trb: home.stats.trb,
        ast: home.stats.ast, stl: home.stats.stl, blk: home.stats.blk,
        tov: home.stats.tov, pf: home.stats.pf,
      },
      awayTeam: away.teamName,
      awayId: away.teamId,
      awayScore: away.stats.points,
      awayConf: away.conference,
      awayStats: {
        fgm: away.stats.fgm, fga: away.stats.fga,
        tpm: away.stats.tpm, tpa: away.stats.tpa,
        ftm: away.stats.ftm, fta: away.stats.fta,
        orb: away.stats.orb, drb: away.stats.drb, trb: away.stats.trb,
        ast: away.stats.ast, stl: away.stats.stl, blk: away.stats.blk,
        tov: away.stats.tov, pf: away.stats.pf,
      },
      isConferenceGame: game.isConferenceGame,
      players: [],
    };

    if (game.players && Array.isArray(game.players)) {
      for (const playerData of game.players) {
        if (!playerData.teamId || !playerData.players) continue;
        
        const teamId = String(playerData.teamId);
        const simplifiedPlayers = playerData.players.map((p) => ({
          playerId: `${teamId}_${p.number || 0}_${p.firstName}_${p.lastName}`,
          division: 'womens-d1',
          firstName: p.firstName || "",
          lastName: p.lastName || "",
          number: p.number || "",
          minutes: parseFloat(p.minutesPlayed || p.minutes || 0),
          fgm: parseInt(p.fieldGoalsMade || 0),
          fga: parseInt(p.fieldGoalsAttempted || 0),
          tpm: parseInt(p.threePointsMade || 0),
          tpa: parseInt(p.threePointsAttempted || 0),
          ftm: parseInt(p.freeThrowsMade || 0),
          fta: parseInt(p.freeThrowsAttempted || 0),
          orb: parseInt(p.offensiveRebounds || 0),
          drb: Math.max(0, parseInt(p.totalRebounds || 0) - parseInt(p.offensiveRebounds || 0)),
          trb: parseInt(p.totalRebounds || 0),
          ast: parseInt(p.assists || 0),
          stl: parseInt(p.steals || 0),
          blk: parseInt(p.blockedShots || 0),
          tov: parseInt(p.turnovers || 0),
          pf: parseInt(p.personalFouls || 0),
          points: parseInt(p.points || 0),
        }));

        gameLogEntry.players.push({
          teamId,
          players: simplifiedPlayers,
        });
      }
    }

    gamesLog.push(gameLogEntry);

    for (const team of [home, away]) {
      const oppStats = team === home ? away.stats : home.stats;
      
      if (!teamSeasonStats.has(team.teamId)) {
        teamSeasonStats.set(team.teamId, {
          teamId: team.teamId,
          teamName: team.teamName,
          conference: team.conference,
          games: 0, wins: 0, losses: 0,
          points: 0, opp_points: 0,
          fgm: 0, fga: 0, tpm: 0, tpa: 0, ftm: 0, fta: 0,
          orb: 0, drb: 0, trb: 0, ast: 0, stl: 0, blk: 0, tov: 0, pf: 0,
          opp_fgm: 0, opp_fga: 0, opp_tpm: 0, opp_tpa: 0, opp_ftm: 0, opp_fta: 0,
          opp_orb: 0, opp_drb: 0, opp_trb: 0, opp_ast: 0, opp_stl: 0, opp_blk: 0, opp_tov: 0, opp_pf: 0,
        });
      }

      const stats = teamSeasonStats.get(team.teamId);
      stats.games++;
      
      if (team.stats.points > oppStats.points) stats.wins++;
      else stats.losses++;

      stats.points += team.stats.points;
      stats.fgm += team.stats.fgm; stats.fga += team.stats.fga;
      stats.tpm += team.stats.tpm; stats.tpa += team.stats.tpa;
      stats.ftm += team.stats.ftm; stats.fta += team.stats.fta;
      stats.orb += team.stats.orb; stats.trb += team.stats.trb;
      stats.drb += Math.max(0, team.stats.trb - team.stats.orb);
      stats.ast += team.stats.ast; stats.stl += team.stats.stl;
      stats.blk += team.stats.blk; stats.tov += team.stats.tov; stats.pf += team.stats.pf;

      stats.opp_points += oppStats.points;
      stats.opp_fgm += oppStats.fgm; stats.opp_fga += oppStats.fga;
      stats.opp_tpm += oppStats.tpm; stats.opp_tpa += oppStats.tpa;
      stats.opp_ftm += oppStats.ftm; stats.opp_fta += oppStats.fta;
      stats.opp_orb += oppStats.orb; stats.opp_trb += oppStats.trb;
      stats.opp_drb += Math.max(0, oppStats.trb - oppStats.orb);
      stats.opp_ast += oppStats.ast; stats.opp_stl += oppStats.stl;
      stats.opp_blk += oppStats.blk; stats.opp_tov += oppStats.tov; stats.opp_pf += oppStats.pf;
    }

    if (game.players && Array.isArray(game.players)) {
      for (const playerData of game.players) {
        if (!playerData.teamId || !playerData.players) continue;

        const teamId = String(playerData.teamId);
        const teamName = teamId === home.teamId ? home.teamName : away.teamName;

        for (const p of playerData.players) {
          const playerId = `${teamId}_${p.number || 0}_${p.firstName}_${p.lastName}`;

          if (!playerSeasonStats.has(playerId)) {
            playerSeasonStats.set(playerId, {
              playerId, teamId, teamName,
              division: 'womens-d1',
              firstName: p.firstName || "",
              lastName: p.lastName || "",
              number: p.number || "",
              position: p.position || "",
              year: p.year || "",
              games: 0, starts: 0, minutes: 0,
              fgm: 0, fga: 0, tpm: 0, tpa: 0, ftm: 0, fta: 0,
              orb: 0, drb: 0, trb: 0, ast: 0, stl: 0, blk: 0, tov: 0, pf: 0, points: 0,
            });
          }

          const pStats = playerSeasonStats.get(playerId);
          const mins = parseFloat(p.minutesPlayed || p.minutes || 0);
          
          if (mins > 0 || parseInt(p.points || 0) > 0) {
            pStats.games++;
            if (p.starter === true || p.starter === "true") pStats.starts++;
            pStats.minutes += mins;
            pStats.fgm += parseInt(p.fieldGoalsMade || 0);
            pStats.fga += parseInt(p.fieldGoalsAttempted || 0);
            pStats.tpm += parseInt(p.threePointsMade || 0);
            pStats.tpa += parseInt(p.threePointsAttempted || 0);
            pStats.ftm += parseInt(p.freeThrowsMade || 0);
            pStats.fta += parseInt(p.freeThrowsAttempted || 0);
            pStats.orb += parseInt(p.offensiveRebounds || 0);
            pStats.trb += parseInt(p.totalRebounds || 0);
            pStats.drb += Math.max(0, parseInt(p.totalRebounds || 0) - parseInt(p.offensiveRebounds || 0));
            pStats.ast += parseInt(p.assists || 0);
            pStats.stl += parseInt(p.steals || 0);
            pStats.blk += parseInt(p.blockedShots || 0);
            pStats.tov += parseInt(p.turnovers || 0);
            pStats.pf += parseInt(p.personalFouls || 0);
            pStats.points += parseInt(p.points || 0);
          }
        }
      }
    }
  }

  const ratingsRows = [];
  for (const [teamId, stats] of teamSeasonStats) {
    const offPoss = Math.max(1, stats.fga - stats.orb + stats.tov + 0.475 * stats.fta);
    const defPoss = Math.max(1, stats.opp_fga - stats.opp_orb + stats.opp_tov + 0.475 * stats.opp_fta);

    const adjO = (stats.points / offPoss) * 100;
    const adjD = (stats.opp_points / defPoss) * 100;
    const adjEM = adjO - adjD;
    const adjT = offPoss / Math.max(1, stats.games);

    ratingsRows.push({
      teamId,
      team: stats.teamName,
      conference: stats.conference,
      games: stats.games,
      adjO, adjD, adjEM, adjT,
    });
  }

  ratingsRows.sort((a, b) => b.adjEM - a.adjEM);

  const D1_CONFERENCES = new Set([
    'acc', 'big-12', 'big-ten', 'sec', 'pac-12', 'big-east',
    'american', 'aac', 'wcc', 'mwc', 'mountain-west', 'atlantic-10', 'a-10',
    'mvc', 'mac', 'cusa', 'sun-belt', 'sunbelt', 'colonial', 'caa',
    'horizon', 'maac', 'ovc', 'patriot', 'southland', 'summit-league',
    'wac', 'big-sky', 'big-south', 'southern', 'socon',
    'big-west', 'ivy-league', 'meac', 'nec', 'northeast', 'swac',
    'asun', 'america-east', 'americaeast'
  ]);

  const d1Rows = ratingsRows.filter(r => {
    if (!r.conference) return false;
    const conf = String(r.conference).toLowerCase().trim();
    return D1_CONFERENCES.has(conf);
  });
  
  console.log(`Total teams in database: ${ratingsRows.length}`);
  console.log(`D1 teams (in D1 conferences): ${d1Rows.length}`);
  console.log(`Non-D1 teams filtered out: ${ratingsRows.length - d1Rows.length}`);

  await fs.mkdir("public/data", { recursive: true });

  await fs.writeFile(
    "public/data/ratings.json",
    JSON.stringify({ generated_at_utc: new Date().toISOString(), season_start: SEASON_START, rows: d1Rows }, null, 2),
    "utf8"
  );
  console.log(`✅ WROTE public/data/ratings.json (${d1Rows.length} D1 teams)`);

  const d1TeamStats = Array.from(teamSeasonStats.values()).filter(t => t.conference && t.conference !== "—");
  await fs.writeFile(
    "public/data/team_stats.json",
    JSON.stringify({ generated_at_utc: new Date().toISOString(), teams: d1TeamStats }, null, 2),
    "utf8"
  );
  console.log(`✅ WROTE public/data/team_stats.json (${d1TeamStats.length} D1 teams)`);

  await fs.writeFile(
    "public/data/games.json",
    JSON.stringify({ generated_at_utc: new Date().toISOString(), games: gamesLog }, null, 2),
    "utf8"
  );
  console.log(`✅ WROTE public/data/games.json (${gamesLog.length} games)`);

  const d1TeamIds = new Set(d1Rows.map(r => r.teamId));
  const d1Players = Array.from(playerSeasonStats.values())
    .filter(p => d1TeamIds.has(p.teamId))
    .filter(p => p.games > 0);
  
  await fs.writeFile(
    "public/data/player_stats.json",
    JSON.stringify({ generated_at_utc: new Date().toISOString(), players: d1Players }, null, 2),
    "utf8"
  );
  console.log(`✅ WROTE public/data/player_stats.json (${d1Players.length} D1 players)`);

  const successfullyParsedIds = allGames.map(g => g.gameId);
  await fs.writeFile(
    "public/data/games_cache.json",
    JSON.stringify({
      generated_at_utc: new Date().toISOString(),
      note: "Contains ONLY successfully parsed game IDs - not scheduled games",
      total_games: successfullyParsedIds.length,
      game_ids: successfullyParsedIds,
    }, null, 2),
    "utf8"
  );
  console.log(`✅ WROTE public/data/games_cache.json (${successfullyParsedIds.length} successfully parsed games)`);

  console.log("\n🎉 ALL DATA FILES CREATED!");
  console.log(`📊 Summary:`);
  console.log(`   - ${ratingsRows.length} teams rated`);
  console.log(`   - ${successfullyParsedIds.length} games with full boxscore data`);
  console.log(`   - ${totalBoxesFailed} games failed (no boxscore available)`);
  
  // ===== WRITE TO DATABASE =====
  if (process.env.POSTGRES_URL) {
    console.log("\n📊 Writing data to database...");
    
    try {
      db.initDb();
      
      await db.clearDivisionData('womens-d1');
      
      console.log("Writing teams...");
      for (const [teamId, teamStat] of teamSeasonStats) {
        const row = ratingsRows.find(r => r.teamId === teamId);
        if (row && teamStat) {
          await db.upsertTeam({
            teamId: row.teamId,
            teamName: row.team,
            conference: row.conference,
            division: 'womens-d1',
            games: row.games,
            wins: teamStat.wins,
            losses: teamStat.losses,
            adjO: row.adjO,
            adjD: row.adjD,
            adjEM: row.adjEM,
            adjT: row.adjT,
            points: teamStat.points, opp_points: teamStat.opp_points,
            fgm: teamStat.fgm, fga: teamStat.fga,
            tpm: teamStat.tpm, tpa: teamStat.tpa,
            ftm: teamStat.ftm, fta: teamStat.fta,
            orb: teamStat.orb, drb: teamStat.drb, trb: teamStat.trb,
            ast: teamStat.ast, stl: teamStat.stl, blk: teamStat.blk,
            tov: teamStat.tov, pf: teamStat.pf,
            opp_fgm: teamStat.opp_fgm, opp_fga: teamStat.opp_fga,
            opp_tpm: teamStat.opp_tpm, opp_tpa: teamStat.opp_tpa,
            opp_ftm: teamStat.opp_ftm, opp_fta: teamStat.opp_fta,
            opp_orb: teamStat.opp_orb, opp_drb: teamStat.opp_drb, opp_trb: teamStat.opp_trb,
            opp_ast: teamStat.opp_ast, opp_stl: teamStat.opp_stl, opp_blk: teamStat.opp_blk,
            opp_tov: teamStat.opp_tov, opp_pf: teamStat.opp_pf,
          });
        }
      }
      console.log(`✅ Wrote ${teamSeasonStats.size} teams to database`);
      
      console.log("Writing games...");
      for (const game of gamesLog) {
        await db.insertGame(game);
      }
      console.log(`✅ Wrote ${gamesLog.length} games to database`);
      
      console.log("Writing players...");
      for (const player of d1Players) {
        await db.upsertPlayer(player);
      }
      console.log(`✅ Wrote ${d1Players.length} players to database`);
      
      // Batch insert player game stats - collect all rows first then insert in bulk
      console.log("Writing player game stats...");
      const playerGameRows = [];
      for (const game of gamesLog) {
        if (game.players && Array.isArray(game.players)) {
          for (const teamData of game.players) {
            for (const p of teamData.players) {
              playerGameRows.push({
                gameId: game.gameId,
                playerId: p.playerId,
                teamId: teamData.teamId,
                division: p.division || 'womens-d1',
                minutes: p.minutes,
                fgm: p.fgm, fga: p.fga,
                tpm: p.tpm, tpa: p.tpa,
                ftm: p.ftm, fta: p.fta,
                orb: p.orb, drb: p.drb, trb: p.trb,
                ast: p.ast, stl: p.stl, blk: p.blk,
                tov: p.tov, pf: p.pf, points: p.points,
              });
            }
          }
        }
      }
      const playerGameCount = await db.insertPlayerGamesBatch(playerGameRows);
      console.log(`✅ Wrote ${playerGameCount} player game records to database`);
      
      await db.closeDb();
      console.log("\n🎉 DATABASE UPDATED!");
      
    } catch (err) {
      console.error("❌ Database write failed:", err);
      console.log("Continuing with JSON files only...");
    }
  } else {
    console.log("\n⚠️  No POSTGRES_URL found - skipping database write");
  }
}

main().catch((e) => {
  console.error("FATAL", e);
  process.exit(1);
});
