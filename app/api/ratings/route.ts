import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const NCAA_API_BASE = "https://ncaa-api.henrygd.me";
const SCOREBOARD_URL =
  "https://www.ncaa.com/scoreboard/basketball-women/d1/2026/02/12/all-conf";

function poss(fga: number, orb: number, tov: number, fta: number) {
  return Math.max(1, fga - orb + tov + 0.475 * fta);
}

function toNum(x: any, d = 0) {
  const n = Number(x);
  return Number.isFinite(n) ? n : d;
}

function dig(obj: any, keys: Set<string>): any {
  if (!obj) return undefined;
  if (Array.isArray(obj)) {
    for (const it of obj) {
      const got = dig(it, keys);
      if (got !== undefined) return got;
    }
    return undefined;
  }
  if (typeof obj === "object") {
    for (const [k, v] of Object.entries(obj)) {
      if (keys.has(k)) return v;
      const got = dig(v, keys);
      if (got !== undefined) return got;
    }
  }
  return undefined;
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

function parseAttempts(madeDashAtt: any): number {
  // Handles "25-63" -> 63
  if (typeof madeDashAtt !== "string") return 0;
  const m = madeDashAtt.match(/(\d+)\s*-\s*(\d+)/);
  return m ? Number(m[2]) : 0;
}

function parseTeamFromCommonShape(teamObj: any) {
  // name
  const names = teamObj?.names ?? {};
  const teamName =
    String(names?.short ?? names?.full ?? names?.seo ?? teamObj?.name ?? teamObj?.displayName ?? "Unknown");

  // id
  const teamId =
    String(teamObj?.id ?? teamObj?.teamId ?? names?.seo ?? teamName);

  // points
  const pts = toNum(teamObj?.score ?? teamObj?.points ?? teamObj?.pts ?? teamObj?.finalScore ?? 0);

  // stats: try numeric keys first
  let fga =
    toNum(teamObj?.fga ?? teamObj?.fieldGoalsAttempted ?? teamObj?.fgA ?? 0);

  let fta =
    toNum(teamObj?.fta ?? teamObj?.freeThrowsAttempted ?? teamObj?.ftA ?? 0);

  let orb =
    toNum(teamObj?.orb ?? teamObj?.offensiveRebounds ?? teamObj?.oReb ?? teamObj?.offReb ?? teamObj?.oreb ?? 0);

  let tov =
    toNum(teamObj?.tov ?? teamObj?.turnovers ?? teamObj?.to ?? 0);

  // If attempts are not present, NCAA often has "fg": "25-63" and "ft": "10-12"
  if (!fga) fga = parseAttempts(teamObj?.fg ?? teamObj?.fieldGoals ?? teamObj?.fgmA ?? teamObj?.fgm_fga);
  if (!fta) fta = parseAttempts(teamObj?.ft ?? teamObj?.freeThrows ?? teamObj?.ftmA ?? teamObj?.ftm_fta);

  // Some formats store totals under a nested "teamStats" or "totals"
  const totals = teamObj?.teamStats ?? teamObj?.totals ?? teamObj?.statistics ?? null;
  if (totals) {
    if (!fga) fga = toNum(totals?.fga ?? totals?.fieldGoalsAttempted ?? totals?.fgA ?? 0) || parseAttempts(totals?.fg);
    if (!fta) fta = toNum(totals?.fta ?? totals?.freeThrowsAttempted ?? totals?.ftA ?? 0) || parseAttempts(totals?.ft);
    if (!orb) orb = toNum(totals?.orb ?? totals?.offensiveRebounds ?? totals?.oReb ?? totals?.oreb ?? 0);
    if (!tov) tov = toNum(totals?.tov ?? totals?.turnovers ?? totals?.to ?? 0);
  }

  return { teamName, teamId, pts, fga, fta, orb, tov };
}

function parseTeamTotals(gameJson: any) {
  // NCAA API commonly nests game details under "game"
  const game = gameJson?.game ?? gameJson;

  // most common: game.home / game.away
  let home = game?.home ?? game?.homeTeam ?? dig(game, new Set(["home"])) ?? {};
  let away = game?.away ?? game?.awayTeam ?? dig(game, new Set(["away"])) ?? {};

  // fallback: some shapes have arrays
  if ((!home || !away) && Array.isArray(game?.teams) && game.teams.length >= 2) {
    away = game.teams[0];
    home = game.teams[1];
  }

  const h = parseTeamFromCommonShape(home);
  const a = parseTeamFromCommonShape(away);

  return [
    { team: h.teamName, teamId: h.teamId, opp: a.teamName, oppId: a.teamId, pts: h.pts, fga: h.fga, fta: h.fta, orb: h.orb, tov: h.tov },
    { team: a.teamName, teamId: a.teamId, opp: h.teamName, oppId: h.teamId, pts: a.pts, fga: a.fga, fta: a.fta, orb: a.orb, tov: a.tov },
  ];
}

export async function GET() {
  const u = new URL(SCOREBOARD_URL);
  const scoreboard = await fetchJson(`${NCAA_API_BASE}${u.pathname}`);
  const gameIds = extractGameIds(scoreboard);

  const rowsRaw: any[] = [];
  for (const gid of gameIds) {
    let gj: any;
    try {
      gj = await fetchJson(`/game/${gid}/boxscore`);
    } catch {
      gj = await fetchJson(`/game/${gid}`);
    }
    rowsRaw.push(...parseTeamTotals(gj));
  }

  // compute per-team average ORtg for the day (MVP)
  const byTeam = new Map<string, { team: string; sum: number; n: number }>();

  for (const r of rowsRaw) {
    const p = poss(r.fga, r.orb, r.tov, r.fta);
    const ortg = (r.pts / p) * 100.0;

    const cur = byTeam.get(r.teamId) ?? { team: r.team, sum: 0, n: 0 };
    cur.team = r.team;
    cur.sum += ortg;
    cur.n += 1;
    byTeam.set(r.teamId, cur);
  }

  const rows = Array.from(byTeam.entries())
    .map(([teamId, t]) => {
      const adjO = t.sum / Math.max(1, t.n);
      const adjD = 0; // next step: compute DRtg + opponent-adjust
      const adjEM = adjO - adjD;
      return { team: t.team, teamId, adjO, adjD, adjEM };
    })
    .sort((a, b) => b.adjEM - a.adjEM);

  return NextResponse.json({ date: "2026-02-12", rows });
}
