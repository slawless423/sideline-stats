import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const NCAA_API_BASE = "https://ncaa-api.henrygd.me";
const SCOREBOARD_URL =
  "https://www.ncaa.com/scoreboard/basketball-women/d1/2026/02/12/all-conf";

function toInt(x: any, d = 0) {
  const n = parseInt(String(x ?? ""), 10);
  return Number.isFinite(n) ? n : d;
}

function poss(fga: number, orb: number, tov: number, fta: number) {
  return Math.max(1, fga - orb + tov + 0.475 * fta);
}

function extractGameIds(obj: any): string[] {
  const ids = new Set<string>();
  const walk = (x: any) => {
    if (Array.isArray(x)) return x.forEach(walk);
    if (x && typeof x === "object") return Object.values(x).forEach(walk);
    if (typeof x === "string") {
      const matches = x.match(/\/game\/(\d+)/g);
      if (matches) for (const m of matches) ids.add(m.replace("/game/", ""));
    }
  };
  walk(obj);
  return Array.from(ids);
}

async function fetchJson(pathOrUrl: string) {
  const url = pathOrUrl.startsWith("http")
    ? pathOrUrl
    : `${NCAA_API_BASE}${pathOrUrl}`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`Fetch failed ${res.status} for ${url}`);
  return res.json();
}

/**
 * Parses the exact WBB boxscore shape you pasted:
 * - teams[] contains team meta + isHome
 * - teamBoxscore[] contains teamStats totals
 */
function parseWbbBoxscore(gameJson: any) {
  const teamsArr: any[] = Array.isArray(gameJson?.teams) ? gameJson.teams : [];
  const boxArr: any[] = Array.isArray(gameJson?.teamBoxscore) ? gameJson.teamBoxscore : [];

  if (teamsArr.length < 2 || boxArr.length < 2) return null;

  const metaById = new Map<string, any>();
  for (const t of teamsArr) {
    metaById.set(String(t.teamId), t);
  }

  const totalsById = new Map<string, any>();
  for (const b of boxArr) {
    const id = String(b.teamId);
    totalsById.set(id, b.teamStats ?? {});
  }

  const homeMeta = teamsArr.find(t => t.isHome === true) ?? teamsArr[0];
  const awayMeta = teamsArr.find(t => t.isHome === false) ?? teamsArr[1];

  const homeId = String(homeMeta.teamId);
  const awayId = String(awayMeta.teamId);

  const hStats = totalsById.get(homeId) ?? {};
  const aStats = totalsById.get(awayId) ?? {};

  const home = {
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

export async function GET() {
  // 1) Fetch scoreboard JSON
  const u = new URL(SCOREBOARD_URL);
  const scoreboard = await fetchJson(`${NCAA_API_BASE}${u.pathname}`);
  const gameIds = extractGameIds(scoreboard);

  // 2) Pull each game boxscore, parse totals
  const teamRows: any[] = [];
  for (const gid of gameIds) {
    try {
      const box = await fetchJson(`/game/${gid}/boxscore`);
      const parsed = parseWbbBoxscore(box);
      if (parsed) teamRows.push(...parsed);
    } catch (e) {
      // skip games we can’t parse in MVP
      continue;
    }
  }

  // 3) Compute per-team ORtg for the day (MVP)
  const byTeam = new Map<string, { team: string; sumOrtg: number; n: number }>();

  for (const r of teamRows) {
    const p = poss(r.fga, r.orb, r.tov, r.fta);
    const ortg = (r.pts / p) * 100;

    const cur = byTeam.get(r.teamId) ?? { team: r.team, sumOrtg: 0, n: 0 };
    cur.team = r.team;
    cur.sumOrtg += ortg;
    cur.n += 1;
    byTeam.set(r.teamId, cur);
  }

  const rows = Array.from(byTeam.entries())
    .map(([teamId, t]) => {
      const adjO = t.sumOrtg / Math.max(1, t.n);
      const adjD = 0; // next step: add defense + opponent adjustment
      const adjEM = adjO - adjD;
      return { team: t.team, teamId, adjO, adjD, adjEM };
    })
    .sort((a, b) => b.adjEM - a.adjEM);

  return NextResponse.json({ date: "2026-02-12", rows });
}
