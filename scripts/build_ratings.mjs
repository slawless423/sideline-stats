import fs from "node:fs/promises";

const NCAA_API_BASE = "https://ncaa-api.henrygd.me";
const SEASON_START = "2025-11-01";
const BOX_DELAY_MS = 400;
const REQUEST_TIMEOUT_MS = 20000;
const REQUEST_RETRIES = 3;
const BOX_CONCURRENCY = 4;
const MIN_TEAMS_REQUIRED = 300;

console.log("START incremental_update", new Date().toISOString());

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
        if ([428, 502].includes(res.status) && attempt < REQUEST_RETRIES) {
          await sleep(2000 * (attempt + 1));
          continue;
        }
        throw new Error(`Fetch failed ${res.status} for ${path}`);
      }

      return await res.json();
    } catch (e) {
      const msg = String(e?.message ?? e);
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

// Load existing team aggregates from ratings.json
async function loadExistingTeamAgg() {
  try {
    const data = await fs.readFile("public/data/team_stats.json", "utf8");
    const parsed = JSON.parse(data);
    const teamAgg = new Map();
    
    for (const team of (parsed.teams || [])) {
      teamAgg.set(team.teamId, {
        team: team.teamName,
        ptsFor: team.points,
        ptsAgainst: team.opp_points,
        poss: 0, // Will recalculate
        games: team.games,
        fga: team.fga,
        orb: team.orb,
        tov: team.tov,
        fta: team.fta,
      });
    }
    
    console.log(`Loaded ${teamAgg.size} teams from team_stats.json`);
    return teamAgg;
  } catch {
    // Fall back to ratings.json if team_stats.json doesn't exist
    try {
      const data = await fs.readFile("public/data/ratings.json", "utf8");
      const parsed = JSON.parse(data);
      const teamAgg = new Map();
      
      for (const row of (parsed.rows || [])) {
        // Reverse-engineer poss from adjO and adjT
        const p = (row.adjT ?? 70) * Math.max(1, row.games ?? 1);
        teamAgg.set(row.teamId, {
          team: row.team,
          ptsFor: ((row.adjO ?? 100) / 100) * p,
          ptsAgainst: ((row.adjD ?? 100) / 100) * p,
          poss: p,
          games: row.games ?? 0,
          fga: 0,
          orb: 0,
          tov: 0,
          fta: 0,
        });
      }
      
      console.log(`Loaded ${teamAgg.size} teams from ratings.json (fallback)`);
      return teamAgg;
    } catch {
      console.log("No existing data found - starting fresh");
      return new Map();
    }
  }
}

// Load known game IDs to avoid double-counting
async function loadKnownGameIds() {
  try {
    const data = await fs.readFile("public/data/games_cache.json", "utf8");
    const parsed = JSON.parse(data);
    // Handle both formats: array of IDs or object with game_ids array
    if (Array.isArray(parsed)) return new Set(parsed.map(String));
    if (Array.isArray(parsed.game_ids)) return new Set(parsed.game_ids.map(String));
    return new Set();
  } catch {
    return new Set();
  }
}

// Save successfully parsed game IDs to cache
// IMPORTANT: Only call this with games we actually parsed successfully
// Never add game IDs just from scoreboards - only add after successful boxscore parse
async function saveKnownGameIds(newlyParsedIds) {
  try {
    const data = await fs.readFile("public/data/games_cache.json", "utf8");
    const parsed = JSON.parse(data);
    const existingIds = Array.isArray(parsed.game_ids) ? parsed.game_ids : [];
    const updatedIds = [...new Set([...existingIds, ...newlyParsedIds])];

    await fs.writeFile(
      "public/data/games_cache.json",
      JSON.stringify({ ...parsed, game_ids: updatedIds, total_games: updatedIds.length }, null, 2),
      "utf8"
    );
    console.log(`Cache updated: ${updatedIds.length} total parsed games`);
  } catch {
    await fs.writeFile(
      "public/data/games_cache.json",
      JSON.stringify({ game_ids: [...newlyParsedIds], total_games: newlyParsedIds.length }, null, 2),
      "utf8"
    );
  }
}

async function main() {
  const today = new Date();

  // IMPORTANT: Check YESTERDAY and TWO DAYS AGO
  // Why? Games are listed in the morning scoreboard BEFORE they're played.
  // If our script runs at 6 AM EST and games tip off at 7 PM EST,
  // the game IDs appear in yesterday's scoreboard but boxscores aren't ready yet.
  // By checking 2 days back, we always catch evening games from the day before.
  const datesToCheck = [
    fmtDate(new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - 1))),
    fmtDate(new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - 2))),
  ];

  console.log(`Checking dates: ${datesToCheck.join(", ")}`);

  // Load existing team data
  const teamAgg = await loadExistingTeamAgg();

  // CRITICAL: knownGameIds = games we SUCCESSFULLY PARSED (not just scheduled)
  // This prevents us from skipping evening games that appeared in the scoreboard
  // before they were actually played
  const knownGameIds = await loadKnownGameIds();
  console.log(`Already have ${knownGameIds.size} successfully parsed games in cache`);

  // Collect all game IDs from both dates
  const allGameIds = new Set();

  for (const dateStr of datesToCheck) {
    const [Y, M, D] = dateStr.split("-");
    const scoreboardPath = `/scoreboard/basketball-women/d1/${Y}/${M}/${D}/all-conf`;

    try {
      const scoreboard = await fetchJson(scoreboardPath);
      const gameIds = extractGameIds(scoreboard);
      console.log(`Found ${gameIds.length} games on ${dateStr}`);
      gameIds.forEach(gid => allGameIds.add(gid));
    } catch (e) {
      console.error(`Failed to fetch scoreboard for ${dateStr}:`, e.message);
    }
  }

  // Only process games we haven't successfully parsed yet
  const newGameIds = [...allGameIds].filter(gid => !knownGameIds.has(gid));

  console.log(`Total unique games found: ${allGameIds.size}`);
  console.log(`New games to process: ${newGameIds.length}`);

  if (newGameIds.length === 0) {
    console.log("No new games found - ratings already up to date!");
    process.exit(0);
  }

  // Fetch box scores for new games
  let newGamesProcessed = 0;
  let failed = 0;
  const processedGameIds = [];

  const boxscoreFetches = await mapLimit(newGameIds, BOX_CONCURRENCY, async (gid) => {
    try {
      const box = await fetchJson(`/game/${gid}/boxscore`, true);
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

    const lines = parseWbbBoxscoreRobust(gid, box);
    if (!lines) {
      console.log(`Failed to parse game ${gid}`);
      failed++;
      continue;
    }

    // Update team aggregates with new game data
    const [home, away] = lines;

    for (const line of [home, away]) {
      const cur = teamAgg.get(line.teamId) ?? {
        team: line.team, ptsFor: 0, ptsAgainst: 0, poss: 0, games: 0,
        fga: 0, orb: 0, tov: 0, fta: 0,
      };

      const opp = line === home ? away : home;
      const p = poss(line.fga, line.orb, line.tov, line.fta);

      cur.team = line.team;
      cur.ptsFor += line.pts;
      cur.ptsAgainst += opp.pts;
      cur.poss += p;
      cur.games += 1;
      cur.fga += line.fga;
      cur.orb += line.orb;
      cur.tov += line.tov;
      cur.fta += line.fta;

      teamAgg.set(line.teamId, cur);
    }

    processedGameIds.push(gid);
    newGamesProcessed++;
  }

  console.log(`Successfully processed ${newGamesProcessed} new games, ${failed} failed`);

  // Calculate final ratings
  const rows = [...teamAgg.entries()].map(([teamId, t]) => {
    const p = Math.max(1, t.poss);
    const adjO = (t.ptsFor / p) * 100;
    const adjD = (t.ptsAgainst / p) * 100;
    const adjEM = adjO - adjD;
    const adjT = p / Math.max(1, t.games);
    return { teamId, team: t.team, games: t.games, adjO, adjD, adjEM, adjT };
  });

  rows.sort((a, b) => b.adjEM - a.adjEM);

  if (rows.length < MIN_TEAMS_REQUIRED) {
    throw new Error(`BAD RUN: only ${rows.length} teams. Refusing to overwrite ratings.json`);
  }

  // Save updated ratings
  await fs.mkdir("public/data", { recursive: true });
  await fs.writeFile(
    "public/data/ratings.json",
    JSON.stringify({
      generated_at_utc: new Date().toISOString(),
      season_start: SEASON_START,
      rows,
    }, null, 2),
    "utf8"
  );

  // Update known game IDs cache
  await saveKnownGameIds(processedGameIds);

  console.log(`\n✅ Updated ratings.json with ${rows.length} teams`);
  console.log(`✅ Added ${newGamesProcessed} new games`);
  
  if (failed > 0) {
    console.log(`⚠️  ${failed} games failed - check logs`);
  }
}

main().catch((e) => {
  console.error("FATAL", e);
  process.exit(1);
});
