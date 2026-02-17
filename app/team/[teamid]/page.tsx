import Link from "next/link";
import { headers } from "next/headers";

// ===== TYPES =====
type RatingRow = {
  teamId: string;
  team: string;
  conference?: string;
  games: number;
  adjO: number;
  adjD: number;
  adjEM: number;
  adjT: number;
  [k: string]: any;
};

type TeamStats = {
  teamId: string;
  teamName: string;
  conference?: string;
  games: number;
  wins: number;
  losses: number;
  points: number;
  opp_points: number;
  fgm: number;
  fga: number;
  tpm: number;
  tpa: number;
  ftm: number;
  fta: number;
  orb: number;
  drb: number;
  trb: number;
  ast: number;
  stl: number;
  blk: number;
  tov: number;
  pf: number;
  opp_fgm: number;
  opp_fga: number;
  opp_tpm: number;
  opp_tpa: number;
  opp_ftm: number;
  opp_fta: number;
  opp_orb: number;
  opp_drb: number;
  opp_trb: number;
  opp_ast: number;
  opp_stl: number;
  opp_blk: number;
  opp_tov: number;
  opp_pf: number;
};

type Game = {
  gameId: string;
  date: string;
  homeTeam: string;
  homeId: string;
  homeScore: number;
  homeConf?: string;
  awayTeam: string;
  awayId: string;
  awayScore: number;
  awayConf?: string;
  isConferenceGame?: boolean;
};

// ===== DATA LOADING =====
async function loadRatings(): Promise<{ updated: string | null; rows: RatingRow[] }> {
  const h = await headers();
  const host = h.get("host");
  const proto = h.get("x-forwarded-proto") ?? "https";
  const url = `${proto}://${host}/data/ratings.json`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`Failed to load ratings.json (${res.status})`);
  const payload = await res.json();
  const rows: RatingRow[] = payload?.rows ?? [];
  const updated = payload?.generated_at_utc ?? null;
  return { updated, rows };
}

async function loadTeamStats(): Promise<TeamStats[]> {
  try {
    const h = await headers();
    const host = h.get("host");
    const proto = h.get("x-forwarded-proto") ?? "https";
    const url = `${proto}://${host}/data/team_stats.json`;
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return [];
    const payload = await res.json();
    return payload?.teams ?? [];
  } catch {
    return [];
  }
}

async function loadGames(): Promise<Game[]> {
  try {
    const h = await headers();
    const host = h.get("host");
    const proto = h.get("x-forwarded-proto") ?? "https";
    const url = `${proto}://${host}/data/games.json`;
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return [];
    const payload = await res.json();
    return payload?.games ?? [];
  } catch {
    return [];
  }
}

// ===== MATH HELPERS =====
function n(x: any): number | null {
  const v = Number(x);
  return Number.isFinite(v) ? v : null;
}

function pct(num: number, den: number): number | null {
  if (!den) return null;
  return (num / den) * 100;
}

function poss(fga: number, orb: number, tov: number, fta: number): number {
  return Math.max(1, fga - orb + tov + 0.475 * fta);
}

// Four Factors calculations
function calcFourFactors(s: TeamStats) {
  const offPoss = poss(s.fga, s.orb, s.tov, s.fta);
  const defPoss = poss(s.opp_fga, s.opp_orb, s.opp_tov, s.opp_fta);

  return {
    // OFFENSE
    off: {
      efg: s.fga > 0 ? ((s.fgm - s.tpm + 1.5 * s.tpm) / s.fga) * 100 : null,
      tov: offPoss > 0 ? (s.tov / offPoss) * 100 : null,
      orb: (s.orb + s.opp_drb) > 0 ? (s.orb / (s.orb + s.opp_drb)) * 100 : null,
      ftrate: s.fga > 0 ? (s.fta / s.fga) * 100 : null,
      twopm: s.fgm - s.tpm,
      twopa: s.fga - s.tpa,
      two: (s.fga - s.tpa) > 0 ? ((s.fgm - s.tpm) / (s.fga - s.tpa)) * 100 : null,
      three: pct(s.tpm, s.tpa),
      ft: pct(s.ftm, s.fta),
      blk: (s.opp_fga - s.opp_tpa) > 0 ? (s.blk / (s.opp_fga - s.opp_tpa)) * 100 : null,
      stl: offPoss > 0 ? (s.opp_stl / offPoss) * 100 : null,
      ast: s.fgm > 0 ? (s.ast / s.fgm) * 100 : null,
      threePaRate: s.fga > 0 ? (s.tpa / s.fga) * 100 : null,
    },
    // DEFENSE (opponent's offense against us)
    def: {
      efg: s.opp_fga > 0 ? ((s.opp_fgm - s.opp_tpm + 1.5 * s.opp_tpm) / s.opp_fga) * 100 : null,
      tov: defPoss > 0 ? (s.opp_tov / defPoss) * 100 : null,
      orb: (s.opp_orb + s.drb) > 0 ? (s.opp_orb / (s.opp_orb + s.drb)) * 100 : null,
      ftrate: s.opp_fga > 0 ? (s.opp_fta / s.opp_fga) * 100 : null,
      two: (s.opp_fga - s.opp_tpa) > 0 ? ((s.opp_fgm - s.opp_tpm) / (s.opp_fga - s.opp_tpa)) * 100 : null,
      three: pct(s.opp_tpm, s.opp_tpa),
      ft: pct(s.opp_ftm, s.opp_fta),
      blk: (s.fga - s.tpa) > 0 ? (s.opp_blk / (s.fga - s.tpa)) * 100 : null,
      stl: defPoss > 0 ? (s.stl / defPoss) * 100 : null,
      ast: s.opp_fgm > 0 ? (s.opp_ast / s.opp_fgm) * 100 : null,
      threePaRate: s.opp_fga > 0 ? (s.opp_tpa / s.opp_fga) * 100 : null,
    },
  };
}

function rankOf(
  allStats: TeamStats[],
  value: number | null,
  statExtractor: (s: TeamStats) => number | null,
  higherIsBetter: boolean
): { rank: number; of: number } | null {
  if (value === null) return null;
  const vals = allStats.map(statExtractor).filter((v): v is number => v !== null);
  if (!vals.length) return null;
  const sorted = [...vals].sort((a, b) => (higherIsBetter ? b - a : a - b));
  const idx = sorted.findIndex((v) => Math.abs(v - value) < 0.001);
  return idx === -1 ? null : { rank: idx + 1, of: sorted.length };
}

// ===== STYLES =====
const ACCENT = "#2d3748";
const ACCENT_LIGHT = "#f7f8fa";
const ACCENT_BORDER = "#d0d5de";

const S = {
  page: {
    padding: "24px 20px",
    fontFamily: "system-ui, -apple-system, sans-serif",
    maxWidth: 1200,
    margin: "0 auto",
    color: "#111",
  } as React.CSSProperties,
  back: {
    fontSize: 13,
    color: ACCENT,
    textDecoration: "none",
    fontWeight: 600,
    opacity: 0.8,
  } as React.CSSProperties,
  header: {
    borderTop: `4px solid ${ACCENT}`,
    paddingTop: 16,
    marginTop: 12,
    marginBottom: 20,
  } as React.CSSProperties,
  teamName: {
    fontSize: 32,
    fontWeight: 900,
    letterSpacing: -0.5,
    color: "#111",
    marginBottom: 4,
  } as React.CSSProperties,
  teamMeta: {
    fontSize: 13,
    color: "#666",
    marginBottom: 10,
  } as React.CSSProperties,
  badges: {
    display: "flex",
    gap: 8,
    flexWrap: "wrap" as const,
    marginBottom: 16,
  } as React.CSSProperties,
  badge: {
    background: ACCENT_LIGHT,
    border: `1px solid ${ACCENT_BORDER}`,
    padding: "3px 10px",
    borderRadius: 4,
    fontSize: 12,
    color: ACCENT,
    fontWeight: 600,
  } as React.CSSProperties,
  coreGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(4, 1fr)",
    gap: 10,
    margin: "16px 0",
  } as React.CSSProperties,
  coreCard: {
    background: ACCENT_LIGHT,
    border: `1px solid ${ACCENT_BORDER}`,
    borderRadius: 8,
    padding: "12px 14px",
  } as React.CSSProperties,
  cardLabel: {
    fontSize: 11,
    color: "#666",
    fontWeight: 600,
    marginBottom: 4,
    textTransform: "uppercase" as const,
    letterSpacing: 0.3,
  } as React.CSSProperties,
  cardValue: {
    fontSize: 22,
    fontWeight: 800,
    color: "#111",
    lineHeight: 1.1,
  } as React.CSSProperties,
  cardRank: {
    fontSize: 11,
    color: ACCENT,
    fontWeight: 700,
    marginTop: 4,
  } as React.CSSProperties,
  twoCol: {
    display: "grid",
    gridTemplateColumns: "1fr 1.2fr",
    gap: 24,
    marginTop: 20,
  } as React.CSSProperties,
  sectionTitle: {
    fontSize: 12,
    fontWeight: 800,
    textTransform: "uppercase" as const,
    letterSpacing: 0.5,
    color: "#fff",
    background: ACCENT,
    padding: "6px 10px",
    marginBottom: 0,
  } as React.CSSProperties,
  table: {
    width: "100%",
    borderCollapse: "collapse" as const,
    fontSize: 12.5,
  } as React.CSSProperties,
  th: {
    textAlign: "left" as const,
    padding: "6px 8px",
    fontSize: 10,
    fontWeight: 700,
    color: ACCENT,
    borderBottom: `2px solid ${ACCENT}`,
    background: ACCENT_LIGHT,
  } as React.CSSProperties,
  thRight: {
    textAlign: "right" as const,
    padding: "6px 8px",
    fontSize: 10,
    fontWeight: 700,
    color: ACCENT,
    borderBottom: `2px solid ${ACCENT}`,
    background: ACCENT_LIGHT,
  } as React.CSSProperties,
  td: {
    padding: "6px 8px",
    borderBottom: "1px solid #f5f5f5",
    color: "#444",
    fontSize: 12,
  } as React.CSSProperties,
  tdRight: {
    padding: "6px 8px",
    borderBottom: "1px solid #f5f5f5",
    textAlign: "right" as const,
    fontWeight: 600,
    color: "#111",
    fontSize: 12,
  } as React.CSSProperties,
  tdAvg: {
    padding: "6px 8px",
    borderBottom: "1px solid #f5f5f5",
    textAlign: "right" as const,
    color: "#999",
    fontSize: 11,
  } as React.CSSProperties,
  rank: {
    fontSize: 9,
    color: ACCENT,
    fontWeight: 700,
    marginLeft: 3,
    opacity: 0.8,
  } as React.CSSProperties,
  toggle: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "10px 12px",
    background: ACCENT_LIGHT,
    border: `1px solid ${ACCENT_BORDER}`,
    borderRadius: 6,
    marginBottom: 16,
  } as React.CSSProperties,
  toggleInput: {
    accentColor: ACCENT,
    width: 16,
    height: 16,
    cursor: "pointer",
  } as React.CSSProperties,
  toggleLabel: {
    fontSize: 13,
    color: "#333",
    fontWeight: 600,
    cursor: "pointer",
  } as React.CSSProperties,
};

// ===== COMPONENTS =====
function fmt(v: number | null, decimals = 1): string {
  if (v === null) return "—";
  return v.toFixed(decimals);
}

function RankSpan({ r }: { r: { rank: number; of: number } | null }) {
  if (!r) return null;
  return <span style={S.rank}>#{r.rank}</span>;
}

function StatRow({
  label,
  offVal,
  defVal,
  avgVal,
  offRank,
  defRank,
  decimals = 1,
}: {
  label: string;
  offVal: number | null;
  defVal: number | null;
  avgVal: number | null;
  offRank?: { rank: number; of: number } | null;
  defRank?: { rank: number; of: number } | null;
  decimals?: number;
}) {
  return (
    <tr>
      <td style={S.td}>{label}</td>
      <td style={S.tdRight}>
        {fmt(offVal, decimals)}
        {offRank && <RankSpan r={offRank} />}
      </td>
      <td style={S.tdRight}>
        {fmt(defVal, decimals)}
        {defRank && <RankSpan r={defRank} />}
      </td>
      <td style={S.tdAvg}>{fmt(avgVal, decimals)}</td>
    </tr>
  );
}

function SectionHeader({ title }: { title: string }) {
  return (
    <tr>
      <td
        colSpan={4}
        style={{
          padding: "6px 8px",
          fontSize: 10,
          fontWeight: 800,
          textTransform: "uppercase",
          letterSpacing: 0.8,
          color: "#888",
          background: "#fafafa",
          borderBottom: "1px solid #eee",
          borderTop: "1px solid #eee",
        }}
      >
        {title}
      </td>
    </tr>
  );
}

// Calculate league averages
function calcLeagueAverages(allTeamStats: TeamStats[]) {
  if (!allTeamStats.length) return null;

  const avgStats: TeamStats = allTeamStats.reduce(
    (acc, t) => {
      const keys = Object.keys(t) as (keyof TeamStats)[];
      keys.forEach((k) => {
        if (typeof t[k] === "number" && k !== "teamId") {
          (acc as any)[k] = ((acc as any)[k] ?? 0) + (t[k] as number);
        }
      });
      return acc;
    },
    { teamId: "avg", teamName: "Average" } as any
  );

  const count = allTeamStats.length;
  const keys = Object.keys(avgStats) as (keyof TeamStats)[];
  keys.forEach((k) => {
    if (typeof (avgStats as any)[k] === "number" && k !== "teamId") {
      (avgStats as any)[k] = (avgStats as any)[k] / count;
    }
  });

  return calcFourFactors(avgStats);
}

// ===== MAIN PAGE =====
export default async function TeamPage({
  params,
  searchParams,
}: {
  params: Promise<{ teamid: string }>;
  searchParams: Promise<{ conf?: string }>;
}) {
  const { teamid: teamId } = await params;
  const { conf } = await searchParams;
  const confOnly = conf === "true";

  const [{ updated, rows }, allTeamStats, allGames] = await Promise.all([
    loadRatings(),
    loadTeamStats(),
    loadGames(),
  ]);

  const row = rows.find((r) => String(r.teamId) === String(teamId));
  const teamStats = allTeamStats.find((t) => String(t.teamId) === String(teamId));

  if (!row) {
    return (
      <main style={S.page}>
        <Link href="/" style={S.back}>← Back to ratings</Link>
        <h1 style={{ fontSize: 28, fontWeight: 800, marginTop: 12 }}>Team not found</h1>
        <p style={{ opacity: 0.8, marginTop: 8 }}>TeamId: {teamId}</p>
      </main>
    );
  }

  const conf = row.conference ?? teamStats?.conference ?? "—";

  // Filter games for this team
  const teamGames = allGames
    .filter((g) => g.homeId === teamId || g.awayId === teamId)
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  // Build EM rank map
  const emRankMap = new Map(rows.map((r, i) => [r.teamId, i + 1]));

  const adjO = n(row.adjO);
  const adjD = n(row.adjD);
  const adjEM = n(row.adjEM);
  const adjT = n(row.adjT);

  const emRank = rows.findIndex(r => r.teamId === teamId) + 1;
  const oRank = [...rows].sort((a, b) => (b.adjO ?? 0) - (a.adjO ?? 0)).findIndex(r => r.teamId === teamId) + 1;
  const dRank = [...rows].sort((a, b) => (a.adjD ?? 0) - (b.adjD ?? 0)).findIndex(r => r.teamId === teamId) + 1;
  const tRank = [...rows].sort((a, b) => (b.adjT ?? 0) - (a.adjT ?? 0)).findIndex(r => r.teamId === teamId) + 1;

  const ff = teamStats ? calcFourFactors(teamStats) : null;
  const leagueAvg = calcLeagueAverages(allTeamStats);

  const wins = teamStats?.wins ?? 0;
  const losses = teamStats?.losses ?? 0;

  const updatedDate = updated
    ? new Date(updated).toLocaleDateString("en-US", {
        month: "long",
        day: "numeric",
        year: "numeric",
      })
    : null;

  const confOnlyUrl = confOnly ? `/team/${teamId}` : `/team/${teamId}?conf=true`;

  return (
    <main style={S.page}>
      <Link href="/" style={S.back}>← Back to ratings</Link>

      {/* HEADER */}
      <div style={S.header}>
        <div style={S.teamName}>{row.team}</div>
        <div style={S.teamMeta}>
          {conf !== "—" ? `${conf.toUpperCase()} • ` : ""}
          #{emRank} of {rows.length} teams
          {updatedDate ? ` • Data through ${updatedDate}` : ""}
        </div>
        <div style={S.badges}>
          {wins + losses > 0 && (
            <span style={S.badge}>{wins}-{losses}</span>
          )}
          {row.games > 0 && (
            <span style={S.badge}>{row.games} games</span>
          )}
          {conf !== "—" && (
            <span style={S.badge}>{conf.toUpperCase()}</span>
          )}
        </div>
      </div>

      {/* CORE RATINGS */}
      <div style={S.coreGrid}>
        <div style={S.coreCard}>
          <div style={S.cardLabel}>Off. Efficiency</div>
          <div style={S.cardValue}>{fmt(adjO)}</div>
          <div style={S.cardRank}>#{oRank} of {rows.length}</div>
        </div>
        <div style={S.coreCard}>
          <div style={S.cardLabel}>Def. Efficiency</div>
          <div style={S.cardValue}>{fmt(adjD)}</div>
          <div style={S.cardRank}>#{dRank} of {rows.length}</div>
        </div>
        <div style={S.coreCard}>
          <div style={S.cardLabel}>Raw Margin</div>
          <div style={S.cardValue}>{adjEM !== null ? (adjEM > 0 ? "+" : "") + fmt(adjEM) : "—"}</div>
          <div style={S.cardRank}>#{emRank} of {rows.length}</div>
        </div>
        <div style={S.coreCard}>
          <div style={S.cardLabel}>Tempo</div>
          <div style={S.cardValue}>{fmt(adjT)}</div>
          <div style={S.cardRank}>#{tRank} of {rows.length}</div>
        </div>
      </div>

      {/* CONFERENCE TOGGLE */}
      <div style={S.toggle}>
        <input
          type="checkbox"
          id="conf-toggle"
          checked={confOnly}
          style={S.toggleInput}
        />
        <label htmlFor="conf-toggle" style={S.toggleLabel}>
          <a href={confOnlyUrl} style={{ color: "inherit", textDecoration: "none" }}>
            Conference games only
          </a>
        </label>
      </div>

      {/* TWO COLUMN LAYOUT */}
      <div style={S.twoCol}>
        {/* LEFT: SCOUTING REPORT */}
        <div>
          {ff ? (
            <>
              <div style={S.sectionTitle}>Scouting Report</div>
              <table style={S.table}>
                <thead>
                  <tr>
                    <th style={S.th}>Category</th>
                    <th style={S.thRight}>Off</th>
                    <th style={S.thRight}>Def</th>
                    <th style={{ ...S.thRight, color: "#999", fontWeight: 600 }}>Avg</th>
                  </tr>
                </thead>
                <tbody>
                  <SectionHeader title="Four Factors" />
                  <StatRow
                    label="Eff. FG%"
                    offVal={ff.off.efg}
                    defVal={ff.def.efg}
                    avgVal={leagueAvg?.off.efg ?? null}
                    offRank={rankOf(allTeamStats, ff.off.efg, (s) => calcFourFactors(s).off.efg, true)}
                    defRank={rankOf(allTeamStats, ff.def.efg, (s) => calcFourFactors(s).def.efg, false)}
                  />
                  <StatRow
                    label="TO%"
                    offVal={ff.off.tov}
                    defVal={ff.def.tov}
                    avgVal={leagueAvg?.off.tov ?? null}
                    offRank={rankOf(allTeamStats, ff.off.tov, (s) => calcFourFactors(s).off.tov, false)}
                    defRank={rankOf(allTeamStats, ff.def.tov, (s) => calcFourFactors(s).def.tov, true)}
                  />
                  <StatRow
                    label="OR%"
                    offVal={ff.off.orb}
                    defVal={ff.def.orb}
                    avgVal={leagueAvg?.off.orb ?? null}
                    offRank={rankOf(allTeamStats, ff.off.orb, (s) => calcFourFactors(s).off.orb, true)}
                    defRank={rankOf(allTeamStats, ff.def.orb, (s) => calcFourFactors(s).def.orb, false)}
                  />
                  <StatRow
                    label="FTA/FGA"
                    offVal={ff.off.ftrate}
                    defVal={ff.def.ftrate}
                    avgVal={leagueAvg?.off.ftrate ?? null}
                    offRank={rankOf(allTeamStats, ff.off.ftrate, (s) => calcFourFactors(s).off.ftrate, true)}
                    defRank={rankOf(allTeamStats, ff.def.ftrate, (s) => calcFourFactors(s).def.ftrate, false)}
                  />

                  <SectionHeader title="Shooting" />
                  <StatRow
                    label="2P%"
                    offVal={ff.off.two}
                    defVal={ff.def.two}
                    avgVal={leagueAvg?.off.two ?? null}
                    offRank={rankOf(allTeamStats, ff.off.two, (s) => calcFourFactors(s).off.two, true)}
                    defRank={rankOf(allTeamStats, ff.def.two, (s) => calcFourFactors(s).def.two, false)}
                  />
                  <StatRow
                    label="3P%"
                    offVal={ff.off.three}
                    defVal={ff.def.three}
                    avgVal={leagueAvg?.off.three ?? null}
                    offRank={rankOf(allTeamStats, ff.off.three, (s) => calcFourFactors(s).off.three, true)}
                    defRank={rankOf(allTeamStats, ff.def.three, (s) => calcFourFactors(s).def.three, false)}
                  />
                  <StatRow
                    label="FT%"
                    offVal={ff.off.ft}
                    defVal={ff.def.ft}
                    avgVal={leagueAvg?.off.ft ?? null}
                    offRank={rankOf(allTeamStats, ff.off.ft, (s) => calcFourFactors(s).off.ft, true)}
                    defRank={rankOf(allTeamStats, ff.def.ft, (s) => calcFourFactors(s).def.ft, false)}
                  />

                  <SectionHeader title="Style" />
                  <StatRow
                    label="3PA/FGA"
                    offVal={ff.off.threePaRate}
                    defVal={ff.def.threePaRate}
                    avgVal={leagueAvg?.off.threePaRate ?? null}
                    offRank={rankOf(allTeamStats, ff.off.threePaRate, (s) => calcFourFactors(s).off.threePaRate, true)}
                    defRank={rankOf(allTeamStats, ff.def.threePaRate, (s) => calcFourFactors(s).def.threePaRate, false)}
                  />

                  <SectionHeader title="Misc" />
                  <StatRow
                    label="Block%"
                    offVal={ff.off.blk}
                    defVal={ff.def.blk}
                    avgVal={leagueAvg?.off.blk ?? null}
                    offRank={rankOf(allTeamStats, ff.off.blk, (s) => calcFourFactors(s).off.blk, true)}
                    defRank={rankOf(allTeamStats, ff.def.blk, (s) => calcFourFactors(s).def.blk, true)}
                  />
                  <StatRow
                    label="Steal%"
                    offVal={ff.off.stl}
                    defVal={ff.def.stl}
                    avgVal={leagueAvg?.off.stl ?? null}
                    offRank={rankOf(allTeamStats, ff.off.stl, (s) => calcFourFactors(s).off.stl, false)}
                    defRank={rankOf(allTeamStats, ff.def.stl, (s) => calcFourFactors(s).def.stl, true)}
                  />
                  <StatRow
                    label="Assist%"
                    offVal={ff.off.ast}
                    defVal={ff.def.ast}
                    avgVal={leagueAvg?.off.ast ?? null}
                    offRank={rankOf(allTeamStats, ff.off.ast, (s) => calcFourFactors(s).off.ast, true)}
                    defRank={rankOf(allTeamStats, ff.def.ast, (s) => calcFourFactors(s).def.ast, false)}
                  />
                </tbody>
              </table>
            </>
          ) : (
            <div style={{ padding: 20, background: ACCENT_LIGHT, borderRadius: 8, textAlign: "center" }}>
              <div style={{ fontWeight: 700, marginBottom: 6 }}>Stats unavailable</div>
              <div style={{ fontSize: 12, color: "#666" }}>Run build_complete_stats.mjs</div>
            </div>
          )}
        </div>

        {/* RIGHT: GAME LOG */}
        <div>
          <div style={S.sectionTitle}>Game Log</div>
          <div style={{ maxHeight: 600, overflowY: "auto", border: `1px solid ${ACCENT_BORDER}`, borderRadius: "0 0 6px 6px" }}>
            <table style={S.table}>
              <thead style={{ position: "sticky", top: 0, background: ACCENT_LIGHT, zIndex: 1 }}>
                <tr>
                  <th style={S.th}>Date</th>
                  <th style={S.th}>Opponent</th>
                  <th style={S.th}>Loc</th>
                  <th style={S.th}>Result</th>
                  <th style={S.thRight}>Score</th>
                </tr>
              </thead>
              <tbody>
                {teamGames.map((g) => {
                  const isHome = g.homeId === teamId;
                  const opp = isHome ? g.awayTeam : g.homeTeam;
                  const oppId = isHome ? g.awayId : g.homeId;
                  const oppRank = emRankMap.get(oppId);
                  const ourScore = isHome ? g.homeScore : g.awayScore;
                  const oppScore = isHome ? g.awayScore : g.homeScore;
                  const won = ourScore > oppScore;
                  const loc = isHome ? "H" : "A";

                  return (
                    <tr key={g.gameId}>
                      <td style={S.td}>{new Date(g.date).toLocaleDateString("en-US", { month: "numeric", day: "numeric" })}</td>
                      <td style={S.td}>
                        {isHome ? "vs" : "@"} {opp}
                        {oppRank && <span style={{ ...S.rank, marginLeft: 4 }}>{oppRank}</span>}
                      </td>
                      <td style={S.td}>{loc}</td>
                      <td style={{ ...S.td, fontWeight: 700, color: won ? "#16a34a" : "#dc2626" }}>{won ? "W" : "L"}</td>
                      <td style={S.tdRight}>{ourScore}-{oppScore}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div style={{ marginTop: 24, fontSize: 11, color: "#aaa", textAlign: "center" }}>
        womens-kenpom • {updatedDate ?? ""}
      </div>
    </main>
  );
}
