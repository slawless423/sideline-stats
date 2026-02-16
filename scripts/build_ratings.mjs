import fs from "node:fs/promises";

const NCAA_API_BASE = "https://ncaa-api.henrygd.me";
const BOX_DELAY_MS = 400;
const REQUEST_TIMEOUT_MS = 20000;
const REQUEST_RETRIES = 3;
const BOX_CONCURRENCY = 4;

console.log("START incremental_update", new Date().toISOString());

function fmtDate(dt) {
  const y = dt.getUTCFullYear();
  const m = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const d = String(dt.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
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
        },
      });

      clearTimeout(t);

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

function toInt(x, d = 0) {
  const n = parseInt(String(x ?? ""), 10);
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

function normalizeStats(raw) {
  const points = toInt(pick(raw, ["points", "pts", "score"]), 0);
  const fga = toInt(pick(raw, ["fieldGoalsAttempted", "fga", "fgAttempts"]), 0);
  const fta = toInt(pick(raw, ["freeThrowsAttempted", "fta", "ftAttempts"]), 0);
  const orb = toInt(pick(raw, ["offensiveRebounds", "oreb", "offReb"]), 0);
  const tov = toInt(pick(raw, ["turnovers", "tov", "to"]), 0);

  const hasSignal = points || fga || fta || orb || tov;
  if (!hasSignal) return null;

  return { points, fga, fta, orb, tov };
}

function deepCollectTeamStatCandidates(root) {
  const out = [];

  const walk = (x) => {
    if (Array.isArray(x)) return x.forEach(walk);
    if (!x || typeof x !== "object") return;

    const teamId = pick(x, ["teamId", "team_id", "id"]);
    if (teamId != null) {
      const direct = normalizeStats(x);
      if (direct) out.push({ teamId: String(teamId), stats: direct });

      const nested = pick(x, ["teamStats", "team_stats", "statistics", "stats", "totals"]);
      if (nested && typeof nested === "object") {
        const n = normalizeStats(nested);
        if (n) out.push({ teamId: String(teamId), stats: n });
      }
    }

    Object.values(x).forEach(walk);
  };

  walk(root);
  return out;
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
  return null;
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

function parseWbbBoxscoreRobust(gameId, gameJson) {
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

  const candidates = deepCollectTeamStatCandidates(gameJson);
  if (!candidates.length) return null;

  const bestById = new Map();
  for (const c of candidates) {
    const key = String(c.teamId);
    const score = (c.stats?.fga ?? 0) + (c.stats?.fta ?? 0);
    const prev = bestById.get(key);
    if (!prev || score > prev.score) bestById.set(key, { stats: c.stats, score });
  }

  const h = bestById.get(homeId)?.stats ?? null;
  const a = bestById.get(awayId)?.stats ?? null;
  if (!h || !a) return null;

  return [
    {
      gameId, team: nameFromMeta(homeMeta), teamId: homeId,
      opp: nameFromMeta(awayMeta), oppId: awayId,
      pts: h.points, fga: h.fga, fta: h.fta, orb: h.orb, tov: h.tov,
    },
    {
      gameId, team: nameFromMeta(awayMeta), teamId: awayId,
      opp: nameFromMeta(homeMeta), oppId: homeId,
      pts: a.points, fga: a.fga, fta: a.fta, orb: a.orb, tov: a.tov,
    }
  ];
}

async function loadManualGames() {
  try {
    const data = await fs.readFile("public/data/manual_games.json", "utf8");
    const parsed = JSON.parse(data);
    return parsed.games || [];
  } catch {
    return [];
  }
}

async function loadHistoricalGames() {
  // Load all previously scraped games from a cache file
  try {
    const data = await fs.readFile("public/data/games_cache.json", "utf8");
    return JSON.parse(data);
  } catch {
    return [];
  }
}

async function saveGamesCache(games) {
  await fs.writeFile("public/data/games_cache.json", JSON.stringify(games, null, 2), "utf8");
}

async function main() {
  const yesterday = new Date();
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  const yesterdayStr = fmtDate(yesterday);

  console.log(`Fetching games from ${yesterdayStr}...`);

  const [Y, M, D] = yesterdayStr.split("-");
  const scoreboardPath = `/scoreboard/basketball-women/d1/${Y}/${M}/${D}/all-conf`;

  let scoreboard;
  try {
    scoreboard = await fetchJson(scoreboardPath);
  } catch (e) {
    console.error("Failed to fetch scoreboard:", e.message);
    process.exit(1);
  }

  const gameIds = extractGameIds(scoreboard);
  console.log(`Found ${gameIds.length} games on ${yesterdayStr}`);

  if (gameIds.length === 0) {
    console.log("No games yesterday - nothing to update");
    process.exit(0);
  }

  const newGames = [];
  let failed = 0;

  for (const gid of gameIds) {
    try {
      const box = await fetchJson(`/game/${gid}/boxscore`, true);
      await sleep(BOX_DELAY_MS);

      const lines = parseWbbBoxscoreRobust(gid, box);
      if (lines) {
        newGames.push({ gameId: gid, teams: lines });
      } else {
        console.log(`Failed to parse game ${gid}`);
        failed++;
      }
    } catch (e) {
      console.log(`Failed to fetch game ${gid}:`, e.message);
      failed++;
    }
  }

  console.log(`Successfully scraped ${newGames.length} games, ${failed} failed`);

  // Load historical games and merge
  const historicalGames = await loadHistoricalGames();
  const manualGames = await loadManualGames();

  // Combine all games
  const allGameLines = [];

  // Add historical
  for (const g of historicalGames) {
    if (g.teams) allGameLines.push(...g.teams);
  }

  // Add new
  for (const g of newGames) {
    allGameLines.push(...g.teams);
  }

  // Add manual
  for (const game of manualGames) {
    if (!game.gameId || !game.homeTeam?.stats || !game.awayTeam?.stats) continue;

    allGameLines.push({
      gameId: game.gameId, team: game.homeTeam.name, teamId: String(game.homeTeam.teamId),
      opp: game.awayTeam.name, oppId: String(game.awayTeam.teamId),
      pts: game.homeTeam.stats.points, fga: game.homeTeam.stats.fga,
      fta: game.homeTeam.stats.fta, orb: game.homeTeam.stats.orb, tov: game.homeTeam.stats.tov,
    });

    allGameLines.push({
      gameId: game.gameId, team: game.awayTeam.name, teamId: String(game.awayTeam.teamId),
      opp: game.homeTeam.name, oppId: String(game.homeTeam.teamId),
      pts: game.awayTeam.stats.points, fga: game.awayTeam.stats.fga,
      fta: game.awayTeam.stats.fta, orb: game.awayTeam.stats.orb, tov: game.awayTeam.stats.tov,
    });
  }

  // Calculate ratings
  const teamAgg = new Map();

  for (const line of allGameLines) {
    const p = poss(line.fga, line.orb, line.tov, line.fta);

    const cur = teamAgg.get(line.teamId) ?? {
      team: line.team, ptsFor: 0, ptsAgainst: 0, poss: 0, games: 0
    };

    cur.team = line.team;
    cur.ptsFor += line.pts;
    cur.games += 1;
    cur.poss += p;

    // Find opponent's points
    const oppLine = allGameLines.find(l => l.gameId === line.gameId && l.teamId === line.oppId);
    if (oppLine) cur.ptsAgainst += oppLine.pts;

    teamAgg.set(line.teamId, cur);
  }

  const rows = [...teamAgg.entries()].map(([teamId, t]) => {
    const adjO = (t.ptsFor / Math.max(1, t.poss)) * 100;
    const adjD = (t.ptsAgainst / Math.max(1, t.poss)) * 100;
    const adjEM = adjO - adjD;
    const adjT = t.poss / Math.max(1, t.games);
    return { teamId, team: t.team, games: t.games, adjO, adjD, adjEM, adjT };
  });

  rows.sort((a, b) => b.adjEM - a.adjEM);

  // Save updated ratings
  const out = {
    generated_at_utc: new Date().toISOString(),
    rows,
  };

  await fs.mkdir("public/data", { recursive: true });
  await fs.writeFile("public/data/ratings.json", JSON.stringify(out, null, 2), "utf8");

  // Update cache with new games
  await saveGamesCache([...historicalGames, ...newGames]);

  console.log(`✅ Updated ratings with ${newGames.length} new games`);
  console.log(`✅ Total teams: ${rows.length}`);

  if (failed > 0) {
    console.log(`⚠️  ${failed} games failed - may need manual entry`);
  }
}

main().catch((e) => {
  console.error("FATAL", e);
  process.exit(1);
});
