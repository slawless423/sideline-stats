import fs from "node:fs/promises";

const NCAA_API_BASE = "https://ncaa-api.henrygd.me";
const SEASON_START = "2025-11-01";

// PASS 1: Normal processing
const BOX_DELAY_MS = 400;
const REQUEST_TIMEOUT_MS = 20000;
const REQUEST_RETRIES = 3;
const BOX_CONCURRENCY = 4;
const RETRY_428_DELAY_MS = 2000;

// PASS 2: Aggressive retry for failures
const AGGRESSIVE_RETRY_DELAY_MS = 3000; // 3 seconds between attempts
const AGGRESSIVE_RETRY_COUNT = 15; // Try 15 times
const AGGRESSIVE_TIMEOUT_MS = 30000; // 30 second timeout

const MIN_TEAMS_REQUIRED = 300;

console.log("START build_ratings (TWO-PASS)", new Date().toISOString());

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

async function fetchJson(path, isBoxscore = false, useAggressiveRetry = false) {
  const url = `${NCAA_API_BASE}${path}`;
  const timeout = useAggressiveRetry ? AGGRESSIVE_TIMEOUT_MS : REQUEST_TIMEOUT_MS;
  const retries = useAggressiveRetry ? AGGRESSIVE_RETRY_COUNT : REQUEST_RETRIES;

  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), timeout);

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
        // Special handling for 502 and 428 errors
        if (res.status === 502 || res.status === 428) {
          if (attempt < retries) {
            const waitTime = useAggressiveRetry ? AGGRESSIVE_RETRY_DELAY_MS : RETRY_428_DELAY_MS;
            if (useAggressiveRetry && attempt % 3 === 0) {
              console.log(`  Aggressive retry ${attempt + 1}/${retries} for ${path} (${res.status})`);
            }
            await sleep(waitTime * (attempt + 1)); // Exponential backoff
            continue;
          }
        }

        if (isBoxscore && (globalThis.__BOX_HTTP_FAILS__ ?? 0) < 10) {
          globalThis.__BOX_HTTP_FAILS__ = (globalThis.__BOX_HTTP_FAILS__ ?? 0) + 1;
          if (!useAggressiveRetry) {
            console.log("BOX HTTP FAIL", res.status, path);
          }
        }

        const retryable = [429, 500, 502, 503, 504].includes(res.status);
        if (retryable && attempt < retries) {
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

      if ((isTimeout || msg.includes("ECONNRESET") || msg.includes("ENOTFOUND")) && attempt < retries) {
        await sleep(500 * (attempt + 1));
        continue;
      }
      if (isTimeout) throw new Error(`Fetch timed out after ${timeout}ms for ${path}`);
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
    if (!x || typeof x === "object") return;

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

  const home = {
    gameId,
    team: nameFromMeta(homeMeta),
    teamId: homeId,
    opp: nameFromMeta(awayMeta),
    oppId: awayId,
    pts: h.points,
    fga: h.fga,
    fta: h.fta,
    orb: h.orb,
    tov: h.tov,
  };

  const away = {
    gameId,
    team: nameFromMeta(awayMeta),
    teamId: awayId,
    opp: nameFromMeta(homeMeta),
    oppId: homeId,
    pts: a.points,
    fga: a.fga,
    fta: a.fta,
    orb: a.orb,
    tov: a.tov,
  };

  return [home, away];
}

async function main() {
  const today = new Date();
  const end = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  const start = toDate(SEASON_START);

  const teamAgg = new Map();
  const seenGameIds = new Set();
  const failedGameIds = []; // Track failures for Pass 2

  let days = 0;
  let totalGamesFound = 0;
  let totalBoxesFetched = 0;
  let totalBoxesParsed = 0;
  let totalBoxesFailed = 0;

  console.log("=== PASS 1: Normal Processing ===");

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
        console.log("SCOREBOARD FETCH FAILED for", d, "-", String(e.message ?? e).substring(0, 60));
      }
      continue;
    }

    const gameIds = extractGameIds(scoreboard).filter((gid) => !seenGameIds.has(gid));

    if (gameIds.length) console.log("games on", d, "=", gameIds.length);
    if (!gameIds.length) continue;

    for (const gid of gameIds) seenGameIds.add(gid);
    totalGamesFound += gameIds.length;

    const boxscoreFetches = await mapLimit(gameIds, BOX_CONCURRENCY, async (gid) => {
      try {
        const box = await fetchJson(`/game/${gid}/boxscore`, true, false);
        await sleep(BOX_DELAY_MS);
        return { gid, box, success: true };
      } catch (e) {
        if ((globalThis.__BOX_FAILS__ ?? 0) < 10) {
          globalThis.__BOX_FAILS__ = (globalThis.__BOX_FAILS__ ?? 0) + 1;
          console.log("boxscore fetch failed for gid:", gid, String(e.message ?? e).substring(0, 50));
        }
        await sleep(BOX_DELAY_MS);
        failedGameIds.push(gid); // Track for Pass 2
        return { gid, box: null, success: false };
      }
    });

    for (const { gid, box } of boxscoreFetches) {
      if (!box) {
        totalBoxesFailed++;
        continue;
      }

      totalBoxesFetched++;

      const lines = parseWbbBoxscoreRobust(gid, box);
      if (!lines) {
        if (!globalThis.__WROTE_FAILED_SAMPLE__) {
          globalThis.__WROTE_FAILED_SAMPLE__ = true;
          await fs.mkdir("public/data", { recursive: true });
          await fs.writeFile(
            "public/data/boxscore_failed_sample.json",
            JSON.stringify(box, null, 2),
            "utf8"
          );
          console.log("WROTE public/data/boxscore_failed_sample.json for game", gid);
        }
        totalBoxesFailed++;
        failedGameIds.push(gid); // Track parse failures too
        continue;
      }

      totalBoxesParsed++;

      const a = lines[0];
      const b = lines[1];

      const aPoss = poss(a.fga, a.orb, a.tov, a.fta);
      const bPoss = poss(b.fga, b.orb, b.tov, b.fta);

      {
        const cur = teamAgg.get(a.teamId) ?? { team: a.team, ptsFor: 0, ptsAgainst: 0, poss: 0, games: 0 };
        cur.team = a.team;
        cur.ptsFor += a.pts;
        cur.ptsAgainst += b.pts;
        cur.poss += aPoss;
        cur.games += 1;
        teamAgg.set(a.teamId, cur);
      }

      {
        const cur = teamAgg.get(b.teamId) ?? { team: b.team, ptsFor: 0, ptsAgainst: 0, poss: 0, games: 0 };
        cur.team = b.team;
        cur.ptsFor += b.pts;
        cur.ptsAgainst += a.pts;
        cur.poss += bPoss;
        cur.games += 1;
        teamAgg.set(b.teamId, cur);
      }
    }
  }

  const pass1SuccessRate = totalGamesFound > 0 ? ((totalBoxesParsed / totalGamesFound) * 100).toFixed(1) : 0;
  console.log(
    "\nPASS 1 DONE:",
    "gamesFound=", totalGamesFound,
    "boxesParsed=", totalBoxesParsed,
    "failed=", failedGameIds.length,
    "successRate=", pass1SuccessRate + "%"
  );

  // ===== PASS 2: Aggressive Retry for Failures =====
  if (failedGameIds.length > 0) {
    console.log(`\n=== PASS 2: Aggressive Retry (${failedGameIds.length} games) ===`);
    
    let pass2Recovered = 0;
    
    for (let i = 0; i < failedGameIds.length; i++) {
      const gid = failedGameIds[i];
      console.log(`Retrying ${i + 1}/${failedGameIds.length}: game ${gid}`);
      
      try {
        const box = await fetchJson(`/game/${gid}/boxscore`, true, true); // Use aggressive retry
        await sleep(AGGRESSIVE_RETRY_DELAY_MS);
        
        const lines = parseWbbBoxscoreRobust(gid, box);
        if (!lines) {
          console.log(`  ❌ Parse failed for ${gid}`);
          continue;
        }
        
        // Successfully recovered! Update team data
        pass2Recovered++;
        totalBoxesParsed++;
        totalBoxesFailed--;
        
        const a = lines[0];
        const b = lines[1];
        
        const aPoss = poss(a.fga, a.orb, a.tov, a.fta);
        const bPoss = poss(b.fga, b.orb, b.tov, b.fta);
        
        {
          const cur = teamAgg.get(a.teamId) ?? { team: a.team, ptsFor: 0, ptsAgainst: 0, poss: 0, games: 0 };
          cur.team = a.team;
          cur.ptsFor += a.pts;
          cur.ptsAgainst += b.pts;
          cur.poss += aPoss;
          cur.games += 1;
          teamAgg.set(a.teamId, cur);
        }
        
        {
          const cur = teamAgg.get(b.teamId) ?? { team: b.team, ptsFor: 0, ptsAgainst: 0, poss: 0, games: 0 };
          cur.team = b.team;
          cur.ptsFor += b.pts;
          cur.ptsAgainst += a.pts;
          cur.poss += bPoss;
          cur.games += 1;
          teamAgg.set(b.teamId, cur);
        }
        
        console.log(`  ✅ Recovered game ${gid}`);
      } catch (e) {
        console.log(`  ❌ Still failed: ${gid}`);
      }
    }
    
    console.log(`\nPASS 2 DONE: Recovered ${pass2Recovered} out of ${failedGameIds.length} failed games`);
  }

  // Final calculations
  const rows = [...teamAgg.entries()].map(([teamId, t]) => {
    const adjO = (t.ptsFor / Math.max(1, t.poss)) * 100;
    const adjD = (t.ptsAgainst / Math.max(1, t.poss)) * 100;
    const adjEM = adjO - adjD;
    const adjT = t.poss / Math.max(1, t.games);
    return { teamId, team: t.team, games: t.games, adjO, adjD, adjEM, adjT };
  });

  rows.sort((a, b) => b.adjEM - a.adjEM);

  const finalSuccessRate = totalGamesFound > 0 ? ((totalBoxesParsed / totalGamesFound) * 100).toFixed(1) : 0;
  const stillFailed = failedGameIds.length - (pass2Recovered ?? 0);

  console.log(
    "\n=== FINAL RESULTS ===",
    "\ndays=", days,
    "\ngamesFound=", totalGamesFound,
    "\nboxesFetched=", totalBoxesFetched,
    "\nboxesParsed=", totalBoxesParsed,
    "\nboxesFailed=", totalBoxesFailed,
    "\nsuccessRate=", finalSuccessRate + "%",
    "\nteams=", rows.length,
    "\nstill failed after Pass 2=", stillFailed
  );

  if (rows.length < MIN_TEAMS_REQUIRED) {
    throw new Error(
      `BAD RUN: only ${rows.length} teams (need >= ${MIN_TEAMS_REQUIRED}). Refusing to overwrite public/data/ratings.json`
    );
  }

  const out = {
    generated_at_utc: new Date().toISOString(),
    season_start: SEASON_START,
    rows,
  };

  await fs.mkdir("public/data", { recursive: true});
  await fs.writeFile("public/data/ratings.json", JSON.stringify(out, null, 2), "utf8");

  console.log(`\n✅ WROTE public/data/ratings.json with ${rows.length} teams`);
  
  if (stillFailed > 0) {
    console.log(`\n⚠️  WARNING: ${stillFailed} games still failed after aggressive retry`);
    console.log("These games may have no data available in the NCAA API");
  }
}

main().catch((e) => {
  console.error("FATAL", e);
  process.exit(1);
});
