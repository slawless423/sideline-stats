'use client';

import { useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import SiteNavigation from '@/components/SiteNavigation';

const ACCENT = '#3B9EFF';
const NAVY   = '#0D1F3C';
const SKY    = '#2E7DD1';
const ICE    = '#A8C8F0';
const FROST  = '#E8F2FC';
const MUTED  = '#6B7E9A';

type Source = {
  league: string;
  season: string;
  player_id: number;
  team: string;
  display_name?: string;
  grad_year?: number | null;
  height?: string | null;
};

type Profile = {
  unified_id: string;
  display_name: string;
  grad_year: number | null;
  height_inches: number | null;
  sources: Source[];
  match_confidence: string;
};

type StatRow = {
  id: number;
  full_name: string;
  team: string;
  league: string;
  season: string;
  grad_year: number | null;
  height: string | null;
  gp: number; mp: number; pts: number;
  fgm: number; fga: number;
  fg3m: number; fg3a: number;
  ftm: number; fta: number;
  oreb: number; dreb: number; reb: number;
  ast: number; stl: number; blk: number; tov: number;
};

type TeamRow = {
  team: string; league: string; season: string;
  gp: number; mp: number;
  fgm: number; fga: number; fg3m: number; fg3a: number;
  ftm: number; fta: number;
  oreb: number; dreb: number; reb: number;
  ast: number; stl: number; blk: number; tov: number; pts: number;
  opp_fgm: number; opp_fga: number; opp_fg3m: number; opp_fg3a: number;
  opp_ftm: number; opp_fta: number;
  opp_oreb: number; opp_dreb: number; opp_reb: number;
  opp_ast: number; opp_stl: number; opp_blk: number; opp_tov: number; opp_pts: number;
};

function formatHeightInches(inches: number | null | undefined): string {
  if (inches == null) return '—';
  const ft = Math.floor(inches / 12);
  const inch = inches % 12;
  return `${ft}'${inch}"`;
}

// Format a stat value: null/undefined/non-finite -> "—", otherwise toFixed(1).
// For integer counts (made/attempted), pass `int: true`.
function fmt(v: number | null | undefined, opts?: { int?: boolean }): string {
  if (v == null || !Number.isFinite(v)) return '—';
  if (opts?.int) return String(Math.round(v));
  return v.toFixed(1);
}

// ---------- Stat row computation ----------

// Compute every stat we'd ever want to show for a single (player-row, team-row) pair.
// Returns null fields for stats that can't be computed (matching the same null-aware
// pattern used in the players page after the ORtg fix).
function computeStats(p: StatRow, team: TeamRow | undefined) {
  const twoPA = p.fga - p.fg3a;
  const twoPM = p.fgm - p.fg3m;

  // Per-game / per-40 derived counts. Null when no games / no minutes.
  const ppg   = p.gp > 0 ? p.pts / p.gp : null;
  const rpg   = p.gp > 0 ? p.reb / p.gp : null;
  const orbpg = p.gp > 0 ? p.oreb / p.gp : null;
  const drbpg = p.gp > 0 ? p.dreb / p.gp : null;
  const apg   = p.gp > 0 ? p.ast / p.gp : null;
  const spg   = p.gp > 0 ? p.stl / p.gp : null;
  const bpg   = p.gp > 0 ? p.blk / p.gp : null;
  const mpg   = p.gp > 0 ? p.mp  / p.gp : null;

  const p40   = p.mp > 0 ? p.pts  / p.mp * 40 : null;
  const r40   = p.mp > 0 ? p.reb  / p.mp * 40 : null;
  const orb40 = p.mp > 0 ? p.oreb / p.mp * 40 : null;
  const drb40 = p.mp > 0 ? p.dreb / p.mp * 40 : null;
  const a40   = p.mp > 0 ? p.ast  / p.mp * 40 : null;
  const s40   = p.mp > 0 ? p.stl  / p.mp * 40 : null;
  const b40   = p.mp > 0 ? p.blk  / p.mp * 40 : null;

  // Shooting percentages — null when no attempts
  const fgPct   = p.fga  > 0 ? (p.fgm  / p.fga ) * 100 : null;
  const twoPct  = twoPA  > 0 ? (twoPM  / twoPA ) * 100 : null;
  const threePct = p.fg3a > 0 ? (p.fg3m / p.fg3a) * 100 : null;
  const ftPct   = p.fta  > 0 ? (p.ftm  / p.fta ) * 100 : null;
  const efg     = p.fga  > 0 ? ((p.fgm + 0.5 * p.fg3m) / p.fga) * 100 : null;
  const ts      = (p.fga + 0.475 * p.fta) > 0
    ? (p.pts / (2 * (p.fga + 0.475 * p.fta))) * 100
    : null;

  // Advanced — require team totals
  let minPct: number | null = null;
  let usagePct: number | null = null;
  let shotPct: number | null = null;
  let orPct: number | null = null;
  let drPct: number | null = null;
  let aRate: number | null = null;
  let toRate: number | null = null;
  let blkPct: number | null = null;
  let stlPct: number | null = null;
  let ftRate: number | null = null;
  let ortg: number | null = null;

  if (team && team.mp > 0) {
    const teamMinutes = team.mp;
    const opp_drb = team.opp_reb - team.opp_oreb;
    const drb = team.reb - team.oreb;

    // Team-level Dean Oliver factors with NaN guards
    const Team_ORB_pct = (team.oreb + opp_drb) > 0
      ? team.oreb / (team.oreb + opp_drb) : 0;
    const team_ftm_rate = team.fta > 0 ? team.ftm / team.fta : 0;
    const Team_Scoring_Poss = team.fgm +
      (1 - Math.pow(1 - team_ftm_rate, 2)) * team.fta * 0.4;
    const teamPlayDenom = team.fga + team.fta * 0.4 + team.tov;
    const Team_Play_pct = teamPlayDenom > 0
      ? Team_Scoring_Poss / teamPlayDenom : 0;
    const orbWeightDenom =
      (1 - Team_ORB_pct) * Team_Play_pct + Team_ORB_pct * (1 - Team_Play_pct);
    const Team_ORB_Weight = orbWeightDenom > 0
      ? ((1 - Team_ORB_pct) * Team_Play_pct) / orbWeightDenom : 0;

    minPct = (p.mp / teamMinutes) * 100 * 5;

    const teamPossTotal = team.fga + 0.44 * team.fta + team.tov;
    if (p.mp > 0 && teamPossTotal > 0) {
      usagePct = 100 * (p.fga + 0.44 * p.fta + p.tov) /
        (teamPossTotal / teamMinutes * p.mp) / 5;
    }
    if (team.fga > 0 && p.mp > 0) {
      shotPct = (p.fga / team.fga) / (p.mp / teamMinutes) / 5 * 100;
    }
    if (p.mp > 0 && (team.oreb + opp_drb) > 0) {
      orPct = (p.oreb / p.mp) * (teamMinutes / 5) / (team.oreb + opp_drb) * 100;
    }
    if (p.mp > 0 && (drb + team.opp_oreb) > 0) {
      drPct = (p.dreb / p.mp) * (teamMinutes / 5) / (drb + team.opp_oreb) * 100;
    }
    const aRateDenom = ((p.mp / (teamMinutes / 5)) * team.fgm) - p.fgm;
    if (aRateDenom > 0) aRate = (p.ast / aRateDenom) * 100;
    const playerPossSimple = p.fga + 0.44 * p.fta + p.tov;
    if (playerPossSimple > 0) toRate = (p.tov / playerPossSimple) * 100;
    const oppPoss = team.opp_fga - team.opp_oreb + team.opp_tov + 0.475 * team.opp_fta;
    const opp2PA = team.opp_fga - team.opp_fg3a;
    if ((p.mp * opp2PA) > 0) blkPct = 100 * (p.blk * (teamMinutes / 5)) / (p.mp * opp2PA);
    if ((p.mp * oppPoss) > 0) stlPct = 100 * (p.stl * (teamMinutes / 5)) / (p.mp * oppPoss);
    if (p.fga > 0) ftRate = (p.fta / p.fga) * 100;

    // ORtg — Dean Oliver with full NaN guards on every sub-term, gated on >=5% min
    if (
      minPct >= 5 &&
      p.mp > 0 && teamMinutes > 0 &&
      p.fga > 0 && team.fgm > 0 && team.fga > 0 &&
      Team_Scoring_Poss > 0 && teamPossTotal > 0
    ) {
      const minShare = p.mp / (teamMinutes / 5);
      const teamFgmExPlayer = team.fgm - p.fgm;
      const teamFgaExPlayer = team.fga - p.fga;
      const teamPtsExPlayerNoFt = (team.pts - team.ftm) - (p.pts - p.ftm);
      const player_ftm_rate = p.fta > 0 ? p.ftm / p.fta : 0;

      const qAstA = team.fgm > 0
        ? minShare * (1.14 * ((team.ast - p.ast) / team.fgm))
        : 0;
      const qAstBNum = (team.ast / teamMinutes) * p.mp * 5 - p.ast;
      const qAstBDen = (team.fgm / teamMinutes) * p.mp * 5 - p.fgm;
      const qAstB = qAstBDen > 0
        ? (qAstBNum / qAstBDen) * (1 - minShare)
        : 0;
      const qAST = qAstA + qAstB;

      const FG_Part = p.fga > 0
        ? p.fgm * (1 - 0.5 * ((p.pts - p.ftm) / (2 * p.fga)) * qAST)
        : 0;
      const AST_Part = teamFgaExPlayer > 0
        ? 0.5 * (teamPtsExPlayerNoFt / (2 * teamFgaExPlayer)) * p.ast
        : 0;
      const FT_Part = p.fta > 0
        ? (1 - Math.pow(1 - player_ftm_rate, 2)) * 0.4 * p.fta
        : 0;
      const ORB_Part_sc = p.oreb * Team_ORB_Weight * Team_Play_pct;
      const orbScale = Team_Scoring_Poss > 0
        ? (team.oreb / Team_Scoring_Poss) * Team_ORB_Weight * Team_Play_pct
        : 0;
      const ScPoss = (FG_Part + AST_Part + FT_Part) * (1 - orbScale) + ORB_Part_sc;
      const FGxPoss = (p.fga - p.fgm) * (1 - 1.07 * Team_ORB_pct);
      const FTxPoss = p.fta > 0
        ? Math.pow(1 - player_ftm_rate, 2) * 0.4 * p.fta
        : 0;
      const TotPoss = ScPoss + FGxPoss + FTxPoss + p.tov;

      const PProd_FG_Part = p.fga > 0
        ? 2 * (p.fgm + 0.5 * p.fg3m) *
          (1 - 0.5 * ((p.pts - p.ftm) / (2 * p.fga)) * qAST)
        : 0;
      const PProd_AST_Part = (teamFgmExPlayer > 0 && teamFgaExPlayer > 0)
        ? 2 * ((teamFgmExPlayer + 0.5 * (team.fg3m - p.fg3m)) / teamFgmExPlayer) *
          0.5 * (teamPtsExPlayerNoFt / (2 * teamFgaExPlayer)) * p.ast
        : 0;
      const teamPtsPerScPoss = Team_Scoring_Poss > 0
        ? team.pts / Team_Scoring_Poss
        : 0;
      const PProd_ORB_Part = p.oreb * Team_ORB_Weight * Team_Play_pct * teamPtsPerScPoss;
      const PProd = (PProd_FG_Part + PProd_AST_Part + p.ftm) *
        (1 - orbScale) + PProd_ORB_Part;

      if (TotPoss > 0 && Number.isFinite(PProd) && Number.isFinite(TotPoss)) {
        const computed = 100 * PProd / TotPoss;
        if (Number.isFinite(computed)) ortg = computed;
      }
    }
  }

  return {
    // raw
    gp: p.gp, mp: p.mp, pts: p.pts,
    fgm: p.fgm, fga: p.fga, twoPM, twoPA,
    fg3m: p.fg3m, fg3a: p.fg3a,
    ftm: p.ftm, fta: p.fta,
    oreb: p.oreb, dreb: p.dreb, reb: p.reb,
    ast: p.ast, stl: p.stl, blk: p.blk, tov: p.tov,
    // shooting
    fgPct, twoPct, threePct, ftPct, efg, ts,
    // per game
    ppg, rpg, orbpg, drbpg, apg, spg, bpg, mpg,
    // per 40
    p40, r40, orb40, drb40, a40, s40, b40,
    // advanced
    minPct, ortg, usagePct, shotPct, orPct, drPct, aRate, toRate,
    blkPct, stlPct, ftRate,
  };
}

// ---------- Sort key for stat rows ----------
// Oldest season first, alphabetical by league within season.
function seasonSortKey(season: string): string {
  // Handles "2025-26" and "2026" both
  // For "2025-26", use the leading year
  const m = season.match(/^(\d{4})/);
  return m ? m[1] : season;
}

function compareRows(a: StatRow, b: StatRow): number {
  const sa = seasonSortKey(a.season);
  const sb = seasonSortKey(b.season);
  if (sa !== sb) return sa.localeCompare(sb);
  return a.league.localeCompare(b.league);
}

// ---------- Component ----------

export default function ProfilePage() {
  const params = useParams();
  const slug = params?.slug as string | undefined;

  const [profile, setProfile] = useState<Profile | null>(null);
  const [statRows, setStatRows] = useState<StatRow[]>([]);
  const [teamRows, setTeamRows] = useState<TeamRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!slug) return;
    fetch(`/api/recruiting/mens/profile/${slug}`)
      .then(async r => {
        if (r.status === 404) { setNotFound(true); setLoading(false); return null; }
        return r.json();
      })
      .then(data => {
        if (!data) return;
        setProfile(data.profile);
        setStatRows((data.stat_rows ?? []).sort(compareRows));
        setTeamRows(data.team_rows ?? []);
        setLoading(false);
      })
      .catch(() => { setNotFound(true); setLoading(false); });
  }, [slug]);

  if (loading) return (
    <>
      <SiteNavigation currentDivision="mens-d1" currentPage="recruiting" divisionPath="/mens-d1" />
      <main style={{ padding: 40, textAlign: 'center', color: MUTED, fontFamily: "'Outfit', sans-serif" }}>Loading...</main>
    </>
  );

  if (notFound || !profile) return (
    <>
      <SiteNavigation currentDivision="mens-d1" currentPage="recruiting" divisionPath="/mens-d1" />
      <main style={{ padding: 40, textAlign: 'center', color: MUTED, fontFamily: "'Outfit', sans-serif" }}>Player not found.</main>
    </>
  );

  // Quick lookup for team totals: team|league|season -> TeamRow
  const teamMap = new Map<string, TeamRow>();
  for (const t of teamRows) {
    teamMap.set(`${t.team}|${t.league}|${t.season}`, t);
  }

  return (
    <>
      <SiteNavigation currentDivision="mens-d1" currentPage="recruiting" divisionPath="/mens-d1" />
      <main style={{ maxWidth: 1400, margin: '0 auto', padding: 24, fontFamily: "'Outfit', sans-serif" }}>

        {/* Back link */}
        <Link
          href="/mens-d1/recruiting/highschool"
          style={{ fontSize: 12, color: MUTED, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 4, marginBottom: 20 }}
        >
          ← Back to Recruiting Database
        </Link>

        {/* Header — Name, Height, Grad Year only */}
        <div style={{ marginBottom: 28 }}>
          <h1 style={{ fontSize: 32, fontWeight: 800, color: NAVY, margin: 0 }}>
            {profile.display_name}
          </h1>
          <div style={{ display: 'flex', gap: 16, marginTop: 8, flexWrap: 'wrap', alignItems: 'center', fontSize: 14, color: MUTED }}>
            {profile.height_inches != null && (
              <span>{formatHeightInches(profile.height_inches)}</span>
            )}
            {profile.grad_year != null && (
              <span>Class of {profile.grad_year}</span>
            )}
          </div>
        </div>

        {/* All 4 stat tables stacked: Advanced, Per 40, Per Game, Totals */}
        <SectionHeader>Advanced</SectionHeader>
        <AdvancedTable rows={statRows} teamMap={teamMap} />

        <SectionHeader>Per 40</SectionHeader>
        <Per40Table rows={statRows} teamMap={teamMap} />

        <SectionHeader>Per Game</SectionHeader>
        <PerGameTable rows={statRows} teamMap={teamMap} />

        <SectionHeader>Totals</SectionHeader>
        <TotalsTable rows={statRows} />

      </main>
    </>
  );
}

function SectionHeader({ children }: { children: ReactNode }) {
  return (
    <h2 style={{
      fontSize: 16, fontWeight: 700, color: NAVY, margin: '28px 0 10px 0',
      borderBottom: `2px solid ${FROST}`, paddingBottom: 6,
    }}>
      {children}
    </h2>
  );
}

// ---------- Table primitives ----------

function Th({ children, align = 'right' }: { children: ReactNode; align?: 'left' | 'right' | 'center' }) {
  return (
    <th style={{
      padding: '6px 8px', textAlign: align, fontWeight: 700, fontSize: 10,
      whiteSpace: 'nowrap', color: '#fff', background: NAVY,
    }}>{children}</th>
  );
}

function Td({ children, align = 'right', bg }: { children: ReactNode; align?: 'left' | 'right' | 'center'; bg: string }) {
  return (
    <td style={{ padding: '5px 8px', textAlign: align, background: bg, whiteSpace: 'nowrap' }}>
      {children}
    </td>
  );
}

function TableShell({ children }: { children: ReactNode }) {
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, whiteSpace: 'nowrap' }}>
        {children}
      </table>
    </div>
  );
}

// ---------- Advanced Table ----------

function AdvancedTable({ rows, teamMap }: { rows: StatRow[]; teamMap: Map<string, TeamRow> }) {
  return (
    <TableShell>
      <thead>
        <tr>
          <Th align="left">Season</Th>
          <Th align="left">League</Th>
          <Th align="left">Team</Th>
          <Th>G</Th>
          <Th>%Min</Th>
          <Th>ORtg</Th>
          <Th>%Usg</Th>
          <Th>%Shots</Th>
          <Th>eFG%</Th>
          <Th>TS%</Th>
          <Th>OR%</Th>
          <Th>DR%</Th>
          <Th>ARate</Th>
          <Th>TORate</Th>
          <Th>Blk%</Th>
          <Th>Stl%</Th>
          <Th>FTRate</Th>
          <Th>2PM</Th>
          <Th>2PA</Th>
          <Th>2P%</Th>
          <Th>3PM</Th>
          <Th>3PA</Th>
          <Th>3P%</Th>
          <Th>FTM</Th>
          <Th>FTA</Th>
          <Th>FT%</Th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => {
          const team = teamMap.get(`${r.team}|${r.league}|${r.season}`);
          const s = computeStats(r, team);
          const bg = i % 2 === 0 ? '#fff' : FROST;
          return (
            <tr key={r.id} style={{ borderBottom: '1px solid #e8f2fc' }}>
              <Td align="left" bg={bg}>{r.season}</Td>
              <Td align="left" bg={bg}>{r.league}</Td>
              <Td align="left" bg={bg}>{r.team}</Td>
              <Td bg={bg}>{r.gp}</Td>
              <Td bg={bg}>{fmt(s.minPct)}</Td>
              <Td bg={bg}>{fmt(s.ortg)}</Td>
              <Td bg={bg}>{fmt(s.usagePct)}</Td>
              <Td bg={bg}>{fmt(s.shotPct)}</Td>
              <Td bg={bg}>{fmt(s.efg)}</Td>
              <Td bg={bg}>{fmt(s.ts)}</Td>
              <Td bg={bg}>{fmt(s.orPct)}</Td>
              <Td bg={bg}>{fmt(s.drPct)}</Td>
              <Td bg={bg}>{fmt(s.aRate)}</Td>
              <Td bg={bg}>{fmt(s.toRate)}</Td>
              <Td bg={bg}>{fmt(s.blkPct)}</Td>
              <Td bg={bg}>{fmt(s.stlPct)}</Td>
              <Td bg={bg}>{fmt(s.ftRate)}</Td>
              <Td bg={bg}>{fmt(s.twoPM, { int: true })}</Td>
              <Td bg={bg}>{fmt(s.twoPA, { int: true })}</Td>
              <Td bg={bg}>{fmt(s.twoPct)}</Td>
              <Td bg={bg}>{fmt(s.fg3m, { int: true })}</Td>
              <Td bg={bg}>{fmt(s.fg3a, { int: true })}</Td>
              <Td bg={bg}>{fmt(s.threePct)}</Td>
              <Td bg={bg}>{fmt(s.ftm, { int: true })}</Td>
              <Td bg={bg}>{fmt(s.fta, { int: true })}</Td>
              <Td bg={bg}>{fmt(s.ftPct)}</Td>
            </tr>
          );
        })}
      </tbody>
    </TableShell>
  );
}

// ---------- Per Game Table ----------

function PerGameTable({ rows, teamMap }: { rows: StatRow[]; teamMap: Map<string, TeamRow> }) {
  return (
    <TableShell>
      <thead>
        <tr>
          <Th align="left">Season</Th>
          <Th align="left">League</Th>
          <Th align="left">Team</Th>
          <Th>G</Th>
          <Th>MPG</Th>
          <Th>PPG</Th>
          <Th>RPG</Th>
          <Th>ORB</Th>
          <Th>DRB</Th>
          <Th>APG</Th>
          <Th>SPG</Th>
          <Th>BPG</Th>
          <Th>2PM</Th>
          <Th>2PA</Th>
          <Th>2P%</Th>
          <Th>3PM</Th>
          <Th>3PA</Th>
          <Th>3P%</Th>
          <Th>FTM</Th>
          <Th>FTA</Th>
          <Th>FT%</Th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => {
          const team = teamMap.get(`${r.team}|${r.league}|${r.season}`);
          const s = computeStats(r, team);
          const bg = i % 2 === 0 ? '#fff' : FROST;
          return (
            <tr key={r.id} style={{ borderBottom: '1px solid #e8f2fc' }}>
              <Td align="left" bg={bg}>{r.season}</Td>
              <Td align="left" bg={bg}>{r.league}</Td>
              <Td align="left" bg={bg}>{r.team}</Td>
              <Td bg={bg}>{r.gp}</Td>
              <Td bg={bg}>{fmt(s.mpg)}</Td>
              <Td bg={bg}>{fmt(s.ppg)}</Td>
              <Td bg={bg}>{fmt(s.rpg)}</Td>
              <Td bg={bg}>{fmt(s.orbpg)}</Td>
              <Td bg={bg}>{fmt(s.drbpg)}</Td>
              <Td bg={bg}>{fmt(s.apg)}</Td>
              <Td bg={bg}>{fmt(s.spg)}</Td>
              <Td bg={bg}>{fmt(s.bpg)}</Td>
              <Td bg={bg}>{fmt(s.twoPM, { int: true })}</Td>
              <Td bg={bg}>{fmt(s.twoPA, { int: true })}</Td>
              <Td bg={bg}>{fmt(s.twoPct)}</Td>
              <Td bg={bg}>{fmt(s.fg3m, { int: true })}</Td>
              <Td bg={bg}>{fmt(s.fg3a, { int: true })}</Td>
              <Td bg={bg}>{fmt(s.threePct)}</Td>
              <Td bg={bg}>{fmt(s.ftm, { int: true })}</Td>
              <Td bg={bg}>{fmt(s.fta, { int: true })}</Td>
              <Td bg={bg}>{fmt(s.ftPct)}</Td>
            </tr>
          );
        })}
      </tbody>
    </TableShell>
  );
}

// ---------- Per 40 Table ----------

function Per40Table({ rows, teamMap }: { rows: StatRow[]; teamMap: Map<string, TeamRow> }) {
  return (
    <TableShell>
      <thead>
        <tr>
          <Th align="left">Season</Th>
          <Th align="left">League</Th>
          <Th align="left">Team</Th>
          <Th>G</Th>
          <Th>MIN</Th>
          <Th>PTS/40</Th>
          <Th>REB/40</Th>
          <Th>ORB/40</Th>
          <Th>DRB/40</Th>
          <Th>AST/40</Th>
          <Th>STL/40</Th>
          <Th>BLK/40</Th>
          <Th>2PM</Th>
          <Th>2PA</Th>
          <Th>2P%</Th>
          <Th>3PM</Th>
          <Th>3PA</Th>
          <Th>3P%</Th>
          <Th>FTM</Th>
          <Th>FTA</Th>
          <Th>FT%</Th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => {
          const team = teamMap.get(`${r.team}|${r.league}|${r.season}`);
          const s = computeStats(r, team);
          const bg = i % 2 === 0 ? '#fff' : FROST;
          return (
            <tr key={r.id} style={{ borderBottom: '1px solid #e8f2fc' }}>
              <Td align="left" bg={bg}>{r.season}</Td>
              <Td align="left" bg={bg}>{r.league}</Td>
              <Td align="left" bg={bg}>{r.team}</Td>
              <Td bg={bg}>{r.gp}</Td>
              <Td bg={bg}>{r.mp}</Td>
              <Td bg={bg}>{fmt(s.p40)}</Td>
              <Td bg={bg}>{fmt(s.r40)}</Td>
              <Td bg={bg}>{fmt(s.orb40)}</Td>
              <Td bg={bg}>{fmt(s.drb40)}</Td>
              <Td bg={bg}>{fmt(s.a40)}</Td>
              <Td bg={bg}>{fmt(s.s40)}</Td>
              <Td bg={bg}>{fmt(s.b40)}</Td>
              <Td bg={bg}>{fmt(s.twoPM, { int: true })}</Td>
              <Td bg={bg}>{fmt(s.twoPA, { int: true })}</Td>
              <Td bg={bg}>{fmt(s.twoPct)}</Td>
              <Td bg={bg}>{fmt(s.fg3m, { int: true })}</Td>
              <Td bg={bg}>{fmt(s.fg3a, { int: true })}</Td>
              <Td bg={bg}>{fmt(s.threePct)}</Td>
              <Td bg={bg}>{fmt(s.ftm, { int: true })}</Td>
              <Td bg={bg}>{fmt(s.fta, { int: true })}</Td>
              <Td bg={bg}>{fmt(s.ftPct)}</Td>
            </tr>
          );
        })}
      </tbody>
    </TableShell>
  );
}

// ---------- Totals Table ----------

function TotalsTable({ rows }: { rows: StatRow[] }) {
  return (
    <TableShell>
      <thead>
        <tr>
          <Th align="left">Season</Th>
          <Th align="left">League</Th>
          <Th align="left">Team</Th>
          <Th>G</Th>
          <Th>MP</Th>
          <Th>FGM</Th>
          <Th>FGA</Th>
          <Th>FG%</Th>
          <Th>2PM</Th>
          <Th>2PA</Th>
          <Th>2P%</Th>
          <Th>3PM</Th>
          <Th>3PA</Th>
          <Th>3P%</Th>
          <Th>eFG%</Th>
          <Th>FTM</Th>
          <Th>FTA</Th>
          <Th>FT%</Th>
          <Th>ORB</Th>
          <Th>DRB</Th>
          <Th>TRB</Th>
          <Th>AST</Th>
          <Th>STL</Th>
          <Th>BLK</Th>
          <Th>TOV</Th>
          <Th>PTS</Th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => {
          const s = computeStats(r, undefined);
          const bg = i % 2 === 0 ? '#fff' : FROST;
          return (
            <tr key={r.id} style={{ borderBottom: '1px solid #e8f2fc' }}>
              <Td align="left" bg={bg}>{r.season}</Td>
              <Td align="left" bg={bg}>{r.league}</Td>
              <Td align="left" bg={bg}>{r.team}</Td>
              <Td bg={bg}>{r.gp}</Td>
              <Td bg={bg}>{r.mp}</Td>
              <Td bg={bg}>{r.fgm}</Td>
              <Td bg={bg}>{r.fga}</Td>
              <Td bg={bg}>{fmt(s.fgPct)}</Td>
              <Td bg={bg}>{r.fgm - r.fg3m}</Td>
              <Td bg={bg}>{r.fga - r.fg3a}</Td>
              <Td bg={bg}>{fmt(s.twoPct)}</Td>
              <Td bg={bg}>{r.fg3m}</Td>
              <Td bg={bg}>{r.fg3a}</Td>
              <Td bg={bg}>{fmt(s.threePct)}</Td>
              <Td bg={bg}>{fmt(s.efg)}</Td>
              <Td bg={bg}>{r.ftm}</Td>
              <Td bg={bg}>{r.fta}</Td>
              <Td bg={bg}>{fmt(s.ftPct)}</Td>
              <Td bg={bg}>{r.oreb}</Td>
              <Td bg={bg}>{r.dreb}</Td>
              <Td bg={bg}>{r.reb}</Td>
              <Td bg={bg}>{r.ast}</Td>
              <Td bg={bg}>{r.stl}</Td>
              <Td bg={bg}>{r.blk}</Td>
              <Td bg={bg}>{r.tov}</Td>
              <Td bg={bg}>{r.pts}</Td>
            </tr>
          );
        })}
      </tbody>
    </TableShell>
  );
}
