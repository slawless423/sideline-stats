import Link from "next/link";
import { headers } from 'next/headers';

const ACCENT = "#2d3748";
const ACCENT_LIGHT = "#f7f8fa";
const ACCENT_BORDER = "#d0d5de";

// Types
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

// API fetch functions
async function fetchAPI(path: string) {
  const headersList = await headers();
  const host = headersList.get('host');
  const protocol = process.env.NODE_ENV === 'development' ? 'http' : 'https';
  const res = await fetch(`${protocol}://${host}${path}`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Failed to fetch ${path}`);
  return res.json();
}

// Calculate Four Factors
function calcFourFactors(stats: TeamStats) {
  const poss = Math.max(1, stats.fga - stats.orb + stats.tov + 0.475 * stats.fta);
  const oppPoss = Math.max(1, stats.opp_fga - stats.opp_orb + stats.opp_tov + 0.475 * stats.opp_fta);

  return {
    off: {
      efg: stats.fga > 0 ? ((stats.fgm + 0.5 * stats.tpm) / stats.fga) * 100 : 0,
      tov: poss > 0 ? (stats.tov / poss) * 100 : 0,
      orb: (stats.orb + stats.opp_drb) > 0 ? (stats.orb / (stats.orb + stats.opp_drb)) * 100 : 0,
      ftr: stats.fga > 0 ? (stats.fta / stats.fga) * 100 : 0,
      two: (stats.fga - stats.tpa) > 0 ? ((stats.fgm - stats.tpm) / (stats.fga - stats.tpa)) * 100 : 0,
      three: stats.tpa > 0 ? (stats.tpm / stats.tpa) * 100 : 0,
      ft: stats.fta > 0 ? (stats.ftm / stats.fta) * 100 : 0,
      threePaRate: stats.fga > 0 ? (stats.tpa / stats.fga) * 100 : 0,
      blk: (stats.opp_fga - stats.opp_tpa) > 0 ? (stats.blk / (stats.opp_fga - stats.opp_tpa)) * 100 : 0,
      stl: oppPoss > 0 ? (stats.stl / oppPoss) * 100 : 0,
      ast: poss > 0 ? (stats.ast / poss) * 100 : 0,
    },
    def: {
      efg: stats.opp_fga > 0 ? ((stats.opp_fgm + 0.5 * stats.opp_tpm) / stats.opp_fga) * 100 : 0,
      tov: oppPoss > 0 ? (stats.opp_tov / oppPoss) * 100 : 0,
      orb: (stats.opp_orb + stats.drb) > 0 ? (stats.opp_orb / (stats.opp_orb + stats.drb)) * 100 : 0,
      ftr: stats.opp_fga > 0 ? (stats.opp_fta / stats.opp_fga) * 100 : 0,
      two: (stats.opp_fga - stats.opp_tpa) > 0 ? ((stats.opp_fgm - stats.opp_tpm) / (stats.opp_fga - stats.opp_tpa)) * 100 : 0,
      three: stats.opp_tpa > 0 ? (stats.opp_tpm / stats.opp_tpa) * 100 : 0,
      ft: stats.opp_fta > 0 ? (stats.opp_ftm / stats.opp_fta) * 100 : 0,
      threePaRate: stats.opp_fga > 0 ? (stats.opp_tpa / stats.opp_fga) * 100 : 0,
      blk: (stats.fga - stats.tpa) > 0 ? (stats.opp_blk / (stats.fga - stats.tpa)) * 100 : 0,
      stl: poss > 0 ? (stats.opp_stl / poss) * 100 : 0,
      ast: oppPoss > 0 ? (stats.opp_ast / oppPoss) * 100 : 0,
    },
  };
}

// Ranking helper
function rankOf(allStats: TeamStats[], value: number | null, statExtractor: (s: TeamStats) => number | null, higherIsBetter: boolean) {
  if (value === null) return null;
  const vals = allStats.map(statExtractor).filter(v => v !== null) as number[];
  const sorted = [...vals].sort((a, b) => higherIsBetter ? b - a : a - b);
  const idx = sorted.findIndex(v => Math.abs(v - value) < 0.001);
  return { rank: idx + 1, of: sorted.length };
}

export default async function TeamPage({
  params,
  searchParams,
}: {
  params: Promise<{ teamid: string }>;
  searchParams: Promise<{ conf?: string; d1?: string }>;
}) {
  const { teamid: teamId } = await params;
  const { conf, d1 } = await searchParams;
  const confOnly = conf === "true";
  const d1Only = d1 === "true";

  const [teamsData, teamData, gamesData, playersData, allTeamStatsData] = await Promise.all([
    fetchAPI('/api/teams'),
    (confOnly || d1Only) 
      ? fetchAPI(`/api/teams/${teamId}/filtered?conf=${confOnly}&d1=${d1Only}`)
      : fetchAPI(`/api/teams/${teamId}`),
    fetchAPI(`/api/teams/${teamId}/games?conf=${confOnly}&d1=${d1Only}`),
    fetchAPI(`/api/teams/${teamId}/players`),
    fetchAPI('/api/teams/stats'),
  ]);
  
  const team = {
    ...teamData,
    // Calculate simple efficiency ratings for filtered stats
    adjO: (confOnly || d1Only) && teamData.games > 0
      ? (teamData.points / teamData.games) * 100 / ((teamData.fga - teamData.orb + teamData.tov + 0.475 * teamData.fta) / teamData.games)
      : teamData.adjO,
    adjD: (confOnly || d1Only) && teamData.games > 0  
      ? (teamData.opp_points / teamData.games) * 100 / ((teamData.opp_fga - teamData.opp_orb + teamData.opp_tov + 0.475 * teamData.opp_fta) / teamData.games)
      : teamData.adjD,
  };
  
  if (team.adjO && team.adjD) {
    team.adjEM = team.adjO - team.adjD;
  }

  if (!team) {
    return (
      <main style={{ maxWidth: 1200, margin: "0 auto", padding: 20 }}>
        <Link href="/" style={{ color: "#2563eb" }}>← Back</Link>
        <h1>Team not found</h1>
      </main>
    );
  }

  const rank = teamsData.rows.findIndex((r: any) => r.teamId === teamId) + 1;
  const allTeamStats: TeamStats[] = allTeamStatsData.teams;
  const ff = calcFourFactors(team);

  // Calculate league averages
  const leagueAvg = allTeamStats.length > 0 ? calcFourFactors(
    allTeamStats.reduce((acc, t) => {
      Object.keys(t).forEach(k => {
        if (typeof (t as any)[k] === 'number' && k !== 'teamId') {
          (acc as any)[k] = ((acc as any)[k] || 0) + (t as any)[k];
        }
      });
      return acc;
    }, {} as any)
  ) : null;

  if (leagueAvg) {
    const count = allTeamStats.length;
    Object.keys(leagueAvg.off).forEach(k => {
      (leagueAvg.off as any)[k] = (leagueAvg.off as any)[k] / count;
      (leagueAvg.def as any)[k] = (leagueAvg.def as any)[k] / count;
    });
  }

  const fmt = (val: number | null) => (val !== null && isFinite(val) ? val.toFixed(1) : "—");

  const confOnlyUrl = confOnly 
    ? (d1Only ? `/team/${teamId}?d1=true` : `/team/${teamId}`)
    : (d1Only ? `/team/${teamId}?conf=true&d1=true` : `/team/${teamId}?conf=true`);
  
  const d1OnlyUrl = d1Only
    ? (confOnly ? `/team/${teamId}?conf=true` : `/team/${teamId}`)
    : (confOnly ? `/team/${teamId}?conf=true&d1=true` : `/team/${teamId}?d1=true`);

  return (
    <main style={{ maxWidth: 1200, margin: "0 auto", padding: 20 }}>
      <Link href="/" style={{ color: "#2563eb", marginBottom: 16, display: "inline-block" }}>← Back to rankings</Link>

      {/* HEADER */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 32, fontWeight: 800 }}>{team.teamName}</h1>
        <div style={{ color: "#666" }}>
          {team.conference?.toUpperCase()} • #{rank} of {teamsData.rows.length}
        </div>
        <div style={{ marginTop: 8 }}>
          <span style={{ background: "#e5e7eb", padding: "4px 12px", borderRadius: 4 }}>
            {team.wins}-{team.losses}
          </span>
        </div>
      </div>

      {/* STATS CARDS */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 16, marginBottom: 24 }}>
        <StatCard title="Off. Efficiency" value={team.adjO} />
        <StatCard title="Def. Efficiency" value={team.adjD} />
        <StatCard title="Raw Margin" value={team.adjEM} prefix="+" />
        <StatCard title="Tempo" value={team.adjT} />
      </div>

      {/* TOGGLES */}
      <div style={{ display: "flex", gap: 12, marginBottom: 24 }}>
        <ToggleLink href={confOnlyUrl} checked={confOnly} label="Conference games only" />
        <ToggleLink href={d1OnlyUrl} checked={d1Only} label="D1 opponents only" />
      </div>

      {/* TWO COLUMN LAYOUT */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24, marginBottom: 32 }}>
        {/* SCOUTING REPORT */}
        <div>
          <SectionTitle title="Team Scouting Report" />
          <StatsTable
            title="Four Factors"
            rows={[
              { label: "Eff. FG%", off: ff.off.efg, def: ff.def.efg, avg: leagueAvg?.off.efg },
              { label: "TO%", off: ff.off.tov, def: ff.def.tov, avg: leagueAvg?.off.tov },
              { label: "OR%", off: ff.off.orb, def: ff.def.orb, avg: leagueAvg?.off.orb },
              { label: "FTA/FGA", off: ff.off.ftr, def: ff.def.ftr, avg: leagueAvg?.off.ftr },
            ]}
          />
          <StatsTable
            title="Shooting"
            rows={[
              { label: "2P%", off: ff.off.two, def: ff.def.two, avg: leagueAvg?.off.two },
              { label: "3P%", off: ff.off.three, def: ff.def.three, avg: leagueAvg?.off.three },
              { label: "FT%", off: ff.off.ft, def: ff.def.ft, avg: leagueAvg?.off.ft },
            ]}
          />
          <StatsTable
            title="Other Stats"
            rows={[
              { label: "3PA/FGA", off: ff.off.threePaRate, def: ff.def.threePaRate, avg: leagueAvg?.off.threePaRate },
              { label: "Block%", off: ff.off.blk, def: ff.def.blk, avg: leagueAvg?.off.blk },
              { label: "Steal%", off: ff.off.stl, def: ff.def.stl, avg: leagueAvg?.off.stl },
              { label: "Assist%", off: ff.off.ast, def: ff.def.ast, avg: leagueAvg?.off.ast },
            ]}
          />
        </div>

        {/* GAME LOG */}
        <div>
          <SectionTitle title="Game Log" />
          <div style={{ maxHeight: 600, overflowY: "auto", border: `1px solid ${ACCENT_BORDER}`, borderTop: "none" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
              <thead style={{ position: "sticky", top: 0, background: ACCENT_LIGHT, zIndex: 1 }}>
                <tr>
                  <th style={{ padding: "6px 8px", textAlign: "left", borderBottom: `2px solid ${ACCENT}` }}>Date</th>
                  <th style={{ padding: "6px 8px", textAlign: "left", borderBottom: `2px solid ${ACCENT}` }}>Opponent</th>
                  <th style={{ padding: "6px 8px", textAlign: "center", borderBottom: `2px solid ${ACCENT}` }}>Loc</th>
                  <th style={{ padding: "6px 8px", textAlign: "center", borderBottom: `2px solid ${ACCENT}` }}>Result</th>
                  <th style={{ padding: "6px 8px", textAlign: "right", borderBottom: `2px solid ${ACCENT}` }}>Score</th>
                </tr>
              </thead>
              <tbody>
                {gamesData.games.map((game: any) => {
                  const isHome = game.homeId === teamId;
                  const opponent = isHome ? game.awayTeam : game.homeTeam;
                  const ourScore = isHome ? game.homeScore : game.awayScore;
                  const theirScore = isHome ? game.awayScore : game.homeScore;
                  const won = ourScore > theirScore;
                  
                  return (
                    <tr key={game.gameId} style={{ borderBottom: "1px solid #f0f0f0" }}>
                      <td style={{ padding: "6px 8px" }}>
                        {new Date(game.date).toLocaleDateString('en-US', { month: 'numeric', day: 'numeric' })}
                      </td>
                      <td style={{ padding: "6px 8px" }}>{opponent}</td>
                      <td style={{ padding: "6px 8px", textAlign: "center" }}>{isHome ? "vs" : "@"}</td>
                      <td style={{ padding: "6px 8px", textAlign: "center", fontWeight: 600, color: won ? "#16a34a" : "#dc2626" }}>
                        {won ? "W" : "L"}
                      </td>
                      <td style={{ padding: "6px 8px", textAlign: "right" }}>{ourScore}-{theirScore}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* PLAYER STATS */}
      {playersData.players.length > 0 && (
        <div style={{ marginBottom: 32 }}>
          <SectionTitle title="Player Stats" />
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
              <thead>
                <tr style={{ borderBottom: `2px solid ${ACCENT}` }}>
                  <th style={{ padding: "6px 8px", textAlign: "left" }}>Player</th>
                  <th style={{ padding: "6px 8px", textAlign: "right" }}>G</th>
                  <th style={{ padding: "6px 8px", textAlign: "right" }}>Min</th>
                  <th style={{ padding: "6px 8px", textAlign: "right" }}>Pts</th>
                  <th style={{ padding: "6px 8px", textAlign: "right" }}>FG%</th>
                  <th style={{ padding: "6px 8px", textAlign: "right" }}>3P%</th>
                  <th style={{ padding: "6px 8px", textAlign: "right" }}>FT%</th>
                  <th style={{ padding: "6px 8px", textAlign: "right" }}>Reb</th>
                  <th style={{ padding: "6px 8px", textAlign: "right" }}>Ast</th>
                  <th style={{ padding: "6px 8px", textAlign: "right" }}>Stl</th>
                  <th style={{ padding: "6px 8px", textAlign: "right" }}>Blk</th>
                </tr>
              </thead>
              <tbody>
                {playersData.players.map((p: any) => (
                  <tr key={p.playerId} style={{ borderBottom: "1px solid #f0f0f0" }}>
                    <td style={{ padding: "6px 8px", fontWeight: 600 }}>{p.firstName} {p.lastName}</td>
                    <td style={{ padding: "6px 8px", textAlign: "right" }}>{p.games}</td>
                    <td style={{ padding: "6px 8px", textAlign: "right" }}>{parseFloat(p.minutes).toFixed(1)}</td>
                    <td style={{ padding: "6px 8px", textAlign: "right" }}>{p.points}</td>
                    <td style={{ padding: "6px 8px", textAlign: "right" }}>{p.fga > 0 ? ((p.fgm / p.fga) * 100).toFixed(1) : "—"}</td>
                    <td style={{ padding: "6px 8px", textAlign: "right" }}>{p.tpa > 0 ? ((p.tpm / p.tpa) * 100).toFixed(1) : "—"}</td>
                    <td style={{ padding: "6px 8px", textAlign: "right" }}>{p.fta > 0 ? ((p.ftm / p.fta) * 100).toFixed(1) : "—"}</td>
                    <td style={{ padding: "6px 8px", textAlign: "right" }}>{p.trb}</td>
                    <td style={{ padding: "6px 8px", textAlign: "right" }}>{p.ast}</td>
                    <td style={{ padding: "6px 8px", textAlign: "right" }}>{p.stl}</td>
                    <td style={{ padding: "6px 8px", textAlign: "right" }}>{p.blk}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </main>
  );
}

// Helper components
function StatCard({ title, value, prefix = "" }: { title: string; value: number | null; prefix?: string }) {
  return (
    <div style={{ background: ACCENT_LIGHT, padding: 20, borderRadius: 8, border: `1px solid ${ACCENT_BORDER}` }}>
      <div style={{ fontSize: 12, color: "#666", marginBottom: 4, textTransform: "uppercase" }}>{title}</div>
      <div style={{ fontSize: 32, fontWeight: 800 }}>
        {value !== null && isFinite(value) ? `${prefix}${value.toFixed(1)}` : "—"}
      </div>
    </div>
  );
}

function ToggleLink({ href, checked, label }: { href: string; checked: boolean; label: string }) {
  return (
    <Link href={href} style={{ textDecoration: "none", flex: 1 }}>
      <div style={{
        display: "flex", alignItems: "center", gap: 8, padding: "10px 12px",
        background: ACCENT_LIGHT, border: `1px solid ${ACCENT_BORDER}`,
        borderRadius: 6, cursor: "pointer"
      }}>
        <input type="checkbox" checked={checked} readOnly style={{ marginRight: 4 }} />
        <span>{label}</span>
      </div>
    </Link>
  );
}

function SectionTitle({ title }: { title: string }) {
  return (
    <div style={{
      fontSize: 12, fontWeight: 800, textTransform: "uppercase",
      letterSpacing: 0.5, color: "#fff", background: ACCENT,
      padding: "6px 10px", marginBottom: 0
    }}>
      {title}
    </div>
  );
}

function StatsTable({ title, rows }: { title: string; rows: Array<{ label: string; off: number; def: number; avg?: number | null }> }) {
  return (
    <div style={{ marginBottom: 16, border: "1px solid #e0e0e0" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
        <thead>
          <tr style={{ background: "#f0f0f0" }}>
            <th style={{ fontSize: 11, fontWeight: 700, padding: "8px 10px", textAlign: "left", width: "50%" }}>{title}</th>
            <th style={{ fontSize: 11, fontWeight: 700, padding: "8px 10px", textAlign: "right", width: "25%" }}>Off</th>
            <th style={{ fontSize: 11, fontWeight: 700, padding: "8px 10px", textAlign: "right", width: "25%" }}>Def</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} style={{ borderBottom: i === rows.length - 1 ? "none" : "1px solid #f0f0f0" }}>
              <td style={{ padding: "6px 10px" }}>{row.label}</td>
              <td style={{ padding: "6px 10px", textAlign: "right" }}>{isFinite(row.off) ? row.off.toFixed(1) : "—"}</td>
              <td style={{ padding: "6px 10px", textAlign: "right" }}>{isFinite(row.def) ? row.def.toFixed(1) : "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
