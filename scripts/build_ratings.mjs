import fs from "node:fs/promises";

const NCAA_API_BASE = "https://ncaa-api.henrygd.me";

// Set season start (adjust if you want)
const SEASON_START = "2025-11-01";

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

async function fetchJson(path) {
  const res = await fetch(`${NCAA_API_BASE}${path}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`Fetch failed ${res.status} for ${path}`);
  return res.json();
}

// Parse the WBB boxscore shape you pasted
function parseWbbBoxscore(gameId, gameJson) {
  const teamsArr = Array.isArray(gameJson?.teams) ? gameJson.teams : [];
  const boxArr = Array.isArray(gameJson?.teamBoxscore) ? gameJson.teamBoxscore : [];
  if (teamsArr.length < 2 || boxArr.length < 2) return null;

  const totalsById = new Map();
  for (const b of boxArr) totalsById.set(String(b.teamId), b.teamStats ?? {});

  const homeMeta = teamsArr.find((t) => t.isHome === true) ?? teamsArr[0];
  const awayMeta = teamsArr.find((t) => t.isHome === false) ?? teamsArr[1];

  const homeId = String(homeMeta.teamId);
  const awayId = String(awayMeta.teamId);

  const hStats = totalsById.get(homeId) ?? {};
  const aStats = totalsById.get(awayId) ?? {};

  const home = {
    gameId,
    team: String(homeMeta.nameShort ?? homeMeta.nameFull ?? "Home"),
    teamId: homeId,
    opp: String(awayMeta.nameShort ?? awayMeta.nameFull ?? "Away"),
    oppId: awayId,
    pts: toInt(hStats.points, 0),
    fga: toInt(hStats.fieldGoalsAttempted, 0),
    fta: toInt(hStats.freeThrowsAttempted, 0),
    orb: toInt(hStats.offensiveRebounds, 0),
    tov: toInt(hStats.turnovers, 0),
  };

  const away = {
    gameId,
    team: String(awayMeta.nameShort ?? awayMeta.nameFull ?? "Away"),
    teamId: awayId,
    opp: String(homeMeta.nameShort ?? homeMeta.nameFull ?? "Home"),
    oppId: homeId,
    pts: toInt(aStats.points, 0),
    fga: toInt(aStats.fieldGoalsAttempted, 0),
    fta: toInt(aStats.freeThrowsAttempted, 0),
    orb: toInt(aStats.offensiveRebounds, 0),
    tov: toInt(aStats.turnovers, 0),
  };

  return [home, away];
}

async function main() {
  const today = new Date();
  const end = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));

  const start = toDate(SEASON_START);

  const teamAgg = new Map(); // teamId -> {team, ptsFor, ptsAgainst, poss, games}

  for (let dt = start; dt <= end; dt = addDays(dt, 1)) {
    const d = fmtDate(dt);
    const [Y, M, D] = d.split("-");
    const scoreboardPath = `/scoreboard/basketball-women/d1/${Y}/${M}/${D}/all-conf`;

    let scoreboard;
    try {
      scoreboard = await fetchJson(scoreboardPath);
    } catch {
      continue;
    }

    const gameIds = extractGameIds(scoreboard);
    if (!gameIds.length) continue;

    for (const gid of gameIds) {
      let box;
      try {
        box = await fetchJson(`/game/${gid}/boxscore`);
      } catch {
        continue;
      }

      const lines = parseWbbBoxscore(gid, box);
      if (!lines) continue;

      const a = lines[0];
      const b = lines[1];

      // possessions for each team (we use its own poss for both ORtg and DRtg like we did in the API)
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
    const adjT = t.poss / Math.max(1, t.games); // possessions per game
    return { teamId, team: t.team, games: t.games, adjO, adjD, adjEM, adjT };
  });

  rows.sort((a, b) => b.adjEM - a.adjEM);

  const out = {
    generated_at_utc: new Date().toISOString(),
    season_start: SEASON_START,
    rows,
  };

  await fs.mkdir("public/data", { recursive: true });
  await fs.writeFile("public/data/ratings.json", JSON.stringify(out, null, 2), "utf8");

  console.log(`Wrote public/data/ratings.json with ${rows.length} teams`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
