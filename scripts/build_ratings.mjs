import fs from "node:fs/promises";

const NCAA_API_BASE = "https://ncaa-api.henrygd.me";
const SEASON_START = "2025-11-01";
const BOX_DELAY_MS = 250; // 4 requests/sec (safe under 5/sec)

// ---- TUNING ----
const REQUEST_TIMEOUT_MS = 20000; // per request
const REQUEST_RETRIES = 2;
const BOX_CONCURRENCY = 8;

// Safety: never overwrite your public ratings with a broken run
const MIN_TEAMS_REQUIRED = 300;

console.log("START build_ratings", new Date().toISOString());

// Helper: YYYY-MM-DD -> Date (UTC)
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
    "Accept-Language": "en-US,en;q=0.9",
    "Referer": "https://www.ncaa.com/",
    "Origin": "https://www.ncaa.com/",
  },
});


if (!res.ok) {
  // DEBUG: show a few boxscore HTTP failures (helps us see if it's 404 vs 403 etc.)
  if (path.includes("/boxscore") && (globalThis.__BOX_HTTP_FAILS__ ?? 0) < 10) {
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

// Concurrency limiter
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

// Extract game IDs robustly
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




// ---- Stat helpers (robust) ----
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
  // handle multiple possible key names
  const points = toInt(pick(raw, ["points", "pts", "score"]), 0);
  const fga = toInt(pick(raw, ["fieldGoalsAttempted", "fga", "fgAttempts"]), 0);
  const fta = toInt(pick(raw, ["freeThrowsAttempted", "fta", "ftAttempts"]), 0);
  const orb = toInt(pick(raw, ["offensiveRebounds", "oreb", "offReb"]), 0);
  const tov = toInt(pick(raw, ["turnovers", "tov", "to"]), 0);

  // if this object clearly isn't totals, return null
  const hasSignal = points || fga || fta || orb || tov;
  if (!hasSignal) return null;

  return { points, fga, fta, orb, tov };
}

function deepCollectTeamStatCandidates(root) {
  // Collect objects that contain a teamId and some stat fields (directly or nested)
  const out = [];

  const walk = (x) => {
    if (Array.isArray(x)) return x.forEach(walk);
    if (!x || typeof x !== "object") return;

    const teamId = pick(x, ["teamId", "team_id", "id"]);
    if (teamId != null) {
      // try common places stats live
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
  // try a few likely locations for team meta
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

  // fallback: deep search for an array of 2+ objects with teamId
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

// Robust boxscore parser:
// 1) find team meta (home/away + ids)
// 2) deep collect stat candidates with teamId
// 3) pick best stats for each teamId
function parseWbbBoxscoreRobust(gameId, gameJson) {
  const teamsArr = findTeamsMeta(gameJson);
  if (!teamsArr || teamsArr.length < 2) return null;

  // pick two teams (home/away if possible)
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

  // choose best stats per team: pick the one with largest (fga+fta) as likely totals
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

  const teamAgg = new Map(); // teamId -> {team, ptsFor, ptsAgainst, poss, games}
  const seenGameIds = new Set();

  let days = 0;
  let totalGamesFound = 0;
  let totalBoxesFetched = 0;
  let totalBoxesParsed = 0;
  let parseFailedSamplesWritten = 0;

  for (let dt = start; dt <= end; dt = addDays(dt, 1)) {
    days++;
    const d = fmtDate(dt);
    const [Y, M, D] = d.split("-");
    const scoreboardPath = `/scoreboard/basketball-women/d1/${Y}/${M}/${D}/all-conf`;

    // weekly progress line
    if (days % 7 === 1) console.log("DATE", d);

    let scoreboard;
    try {
      scoreboard = await fetchJson(scoreboardPath);
    } catch {
      continue;
    }

const gameIds = extractGameIds(scoreboard).filter((gid) => !seenGameIds.has(gid));

if (gameIds.length) console.log("games on", d, "=", gameIds.length);
if (!gameIds.length) continue;

    for (const gid of gameIds) seenGameIds.add(gid);
    totalGamesFound += gameIds.length;

for (const gid of gameIds) {
  let box = null;

  try {
    box = await fetchJson(`/game/${gid}/boxscore`);
    totalBoxesFetched++;
  } catch (e) {
    // show only a few failures so logs don't explode
    if ((globalThis.__BOX_FAILS__ ?? 0) < 10) {
      globalThis.__BOX_FAILS__ = (globalThis.__BOX_FAILS__ ?? 0) + 1;
      console.log("boxscore fetch failed for gid:", gid);
    }
  }

  // IMPORTANT: throttle no matter what
  await sleep(BOX_DELAY_MS);

  if (!box) continue;

  const lines = parseWbbBoxscoreRobust(gid, box);
  if (!lines) {
    // Write ONE sample failed boxscore for debugging (only once)
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
    continue;
  }

  totalBoxesParsed++;

  const a = lines[0];
  const b = lines[1];

  const aPoss = poss(a.fga, a.orb, a.tov, a.fta);
  const bPoss = poss(b.fga, b.orb, b.tov, b.fta);

      // Update A
      {
        const cur = teamAgg.get(a.teamId) ?? { team: a.team, ptsFor: 0, ptsAgainst: 0, poss: 0, games: 0 };
        cur.team = a.team;
        cur.ptsFor += a.pts;
        cur.ptsAgainst += b.pts;
        cur.poss += aPoss;
        cur.games += 1;
        teamAgg.set(a.teamId, cur);
      }

      // Update B
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

  const rows = [...teamAgg.entries()].map(([teamId, t]) => {
    const adjO = (t.ptsFor / Math.max(1, t.poss)) * 100;
    const adjD = (t.ptsAgainst / Math.max(1, t.poss)) * 100;
    const adjEM = adjO - adjD;
    const adjT = t.poss / Math.max(1, t.games);
    return { teamId, team: t.team, games: t.games, adjO, adjD, adjEM, adjT };
  });

  rows.sort((a, b) => b.adjEM - a.adjEM);

  console.log(
    "DONE",
    "days=",
    days,
    "gamesFound=",
    totalGamesFound,
    "boxesFetched=",
    totalBoxesFetched,
    "boxesParsed=",
    totalBoxesParsed,
    "teams=",
    rows.length
  );

  // SAFETY GUARD: do not overwrite if broken
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

  await fs.mkdir("public/data", { recursive: true });
  await fs.writeFile("public/data/ratings.json", JSON.stringify(out, null, 2), "utf8");

  console.log(`WROTE public/data/ratings.json with ${rows.length} teams`);
}

main().catch((e) => {
  console.error("FATAL", e);
  process.exit(1);
});
