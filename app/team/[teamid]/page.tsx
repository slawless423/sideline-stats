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
  
  // Calculate DRB from TRB - ORB since database has drb=0
  const drb = stats.trb - stats.orb;
  const opp_drb = stats.opp_trb - stats.opp_orb;

  return {
    off: {
      efg: stats.fga > 0 ? ((stats.fgm + 0.5 * stats.tpm) / stats.fga) * 100 : 0,
      tov: poss > 0 ? (stats.tov / poss) * 100 : 0,
      orb: (stats.orb + opp_drb) > 0 ? (stats.orb / (stats.orb + opp_drb)) * 100 : 0,
      ftr: stats.fga > 0 ? (stats.fta / stats.fga) * 100 : 0,
      two: (stats.fga - stats.tpa) > 0 ? ((stats.fgm - stats.tpm) / (stats.fga - stats.tpa)) * 100 : 0,
      three: stats.tpa > 0 ? (stats.tpm / stats.tpa) * 100 : 0,
      ft: stats.fta > 0 ? (stats.ftm / stats.fta) * 100 : 0,
      threePaRate: stats.fga > 0 ? (stats.tpa / stats.fga) * 100 : 0,
      blk: (stats.fga - stats.tpa) > 0 ? (stats.opp_blk / (stats.fga - stats.tpa)) * 100 : 0,
      stl: poss > 0 ? (stats.opp_stl / poss) * 100 : 0,
      ast: stats.fgm > 0 ? (stats.ast / stats.fgm) * 100 : 0,
    },
    def: {
      efg: stats.opp_fga > 0 ? ((stats.opp_fgm + 0.5 * stats.opp_tpm) / stats.opp_fga) * 100 : 0,
      tov: oppPoss > 0 ? (stats.opp_tov / oppPoss) * 100 : 0,
      orb: (stats.opp_orb + drb) > 0 ? (stats.opp_orb / (stats.opp_orb + drb)) * 100 : 0,
      ftr: stats.opp_fga > 0 ? (stats.opp_fta / stats.opp_fga) * 100 : 0,
      two: (stats.opp_fga - stats.opp_tpa) > 0 ? ((stats.opp_fgm - stats.opp_tpm) / (stats.opp_fga - stats.opp_tpa)) * 100 : 0,
      three: stats.opp_tpa > 0 ? (stats.opp_tpm / stats.opp_tpa) * 100 : 0,
      ft: stats.opp_fta > 0 ? (stats.opp_ftm / stats.opp_fta) * 100 : 0,
      threePaRate: stats.opp_fga > 0 ? (stats.opp_tpa / stats.opp_fga) * 100 : 0,
      blk: (stats.opp_fga - stats.opp_tpa) > 0 ? (stats.blk / (stats.opp_fga - stats.opp_tpa)) * 100 : 0,
      stl: oppPoss > 0 ? (stats.stl / oppPoss) * 100 : 0,
      ast: stats.opp_fgm > 0 ? (stats.opp_ast / stats.opp_fgm) * 100 : 0,
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
    // Calculate simple efficiency ratings and tempo for filtered stats
    adjO: (confOnly || d1Only) && teamData.games > 0
      ? (teamData.points / teamData.games) * 100 / ((teamData.fga - teamData.orb + teamData.tov + 0.475 * teamData.fta) / teamData.games)
      : teamData.adjO,
    adjD: (confOnly || d1Only) && teamData.games > 0  
      ? (teamData.opp_points / teamData.games) * 100 / ((teamData.opp_fga - teamData.opp_orb + teamData.opp_tov + 0.475 * teamData.opp_fta) / teamData.games)
      : teamData.adjD,
    adjT: (confOnly || d1Only) && teamData.games > 0
      ? ((teamData.fga - teamData.orb + teamData.tov + 0.475 * teamData.fta) + (teamData.opp_fga - teamData.opp_orb + teamData.opp_tov + 0.475 * teamData.opp_fta)) / (2 * teamData.games)
      : teamData.adjT,
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

  // Calculate Four Factors for all teams for ranking
  const allTeamFactors = allTeamStats.map(t => ({
    teamId: t.teamId,
    ff: calcFourFactors(t)
  }));

  // Ranking helper
  const getRank = (value: number, allValues: number[], higherIsBetter: boolean) => {
    const sorted = [...allValues].sort((a, b) => higherIsBetter ? b - a : a - b);
    const idx = sorted.findIndex(v => Math.abs(v - value) < 0.001);
    return idx + 1;
  };

  // Calculate rankings
  const rankings = {
    off: {
      efg: getRank(ff.off.efg, allTeamFactors.map(t => t.ff.off.efg), true),
      tov: getRank(ff.off.tov, allTeamFactors.map(t => t.ff.off.tov), false),
      orb: getRank(ff.off.orb, allTeamFactors.map(t => t.ff.off.orb), true),
      ftr: getRank(ff.off.ftr, allTeamFactors.map(t => t.ff.off.ftr), true),
      two: getRank(ff.off.two, allTeamFactors.map(t => t.ff.off.two), true),
      three: getRank(ff.off.three, allTeamFactors.map(t => t.ff.off.three), true),
      ft: getRank(ff.off.ft, allTeamFactors.map(t => t.ff.off.ft), true),
      threePaRate: getRank(ff.off.threePaRate, allTeamFactors.map(t => t.ff.off.threePaRate), true),
      blk: getRank(ff.off.blk, allTeamFactors.map(t => t.ff.off.blk), true),
      stl: getRank(ff.off.stl, allTeamFactors.map(t => t.ff.off.stl), true),
      ast: getRank(ff.off.ast, allTeamFactors.map(t => t.ff.off.ast), true),
    },
    def: {
      efg: getRank(ff.def.efg, allTeamFactors.map(t => t.ff.def.efg), false),
      tov: getRank(ff.def.tov, allTeamFactors.map(t => t.ff.def.tov), true),
      orb: getRank(ff.def.orb, allTeamFactors.map(t => t.ff.def.orb), false),
      ftr: getRank(ff.def.ftr, allTeamFactors.map(t => t.ff.def.ftr), false),
      two: getRank(ff.def.two, allTeamFactors.map(t => t.ff.def.two), false),
      three: getRank(ff.def.three, allTeamFactors.map(t => t.ff.def.three), false),
      ft: getRank(ff.def.ft, allTeamFactors.map(t => t.ff.def.ft), false),
      threePaRate: getRank(ff.def.threePaRate, allTeamFactors.map(t => t.ff.def.threePaRate), false),
      blk: getRank(ff.def.blk, allTeamFactors.map(t => t.ff.def.blk), true),
      stl: getRank(ff.def.stl, allTeamFactors.map(t => t.ff.def.stl), true),
      ast: getRank(ff.def.ast, allTeamFactors.map(t => t.ff.def.ast), false),
    }
  };

  // Calculate D1 averages
  const d1Avg = {
    off: {
      efg: allTeamFactors.reduce((sum, t) => sum + t.ff.off.efg, 0) / allTeamFactors.length,
      tov: allTeamFactors.reduce((sum, t) => sum + t.ff.off.tov, 0) / allTeamFactors.length,
      orb: allTeamFactors.reduce((sum, t) => sum + t.ff.off.orb, 0) / allTeamFactors.length,
      ftr: allTeamFactors.reduce((sum, t) => sum + t.ff.off.ftr, 0) / allTeamFactors.length,
      two: allTeamFactors.reduce((sum, t) => sum + t.ff.off.two, 0) / allTeamFactors.length,
      three: allTeamFactors.reduce((sum, t) => sum + t.ff.off.three, 0) / allTeamFactors.length,
      ft: allTeamFactors.reduce((sum, t) => sum + t.ff.off.ft, 0) / allTeamFactors.length,
      threePaRate: allTeamFactors.reduce((sum, t) => sum + t.ff.off.threePaRate, 0) / allTeamFactors.length,
      blk: allTeamFactors.reduce((sum, t) => sum + t.ff.off.blk, 0) / allTeamFactors.length,
      stl: allTeamFactors.reduce((sum, t) => sum + t.ff.off.stl, 0) / allTeamFactors.length,
      ast: allTeamFactors.reduce((sum, t) => sum + t.ff.off.ast, 0) / allTeamFactors.length,
    },
    def: {
      efg: allTeamFactors.reduce((sum, t) => sum + t.ff.def.efg, 0) / allTeamFactors.length,
      tov: allTeamFactors.reduce((sum, t) => sum + t.ff.def.tov, 0) / allTeamFactors.length,
      orb: allTeamFactors.reduce((sum, t) => sum + t.ff.def.orb, 0) / allTeamFactors.length,
      ftr: allTeamFactors.reduce((sum, t) => sum + t.ff.def.ftr, 0) / allTeamFactors.length,
      two: allTeamFactors.reduce((sum, t) => sum + t.ff.def.two, 0) / allTeamFactors.length,
      three: allTeamFactors.reduce((sum, t) => sum + t.ff.def.three, 0) / allTeamFactors.length,
      ft: allTeamFactors.reduce((sum, t) => sum + t.ff.def.ft, 0) / allTeamFactors.length,
      threePaRate: allTeamFactors.reduce((sum, t) => sum + t.ff.def.threePaRate, 0) / allTeamFactors.length,
      blk: allTeamFactors.reduce((sum, t) => sum + t.ff.def.blk, 0) / allTeamFactors.length,
      stl: allTeamFactors.reduce((sum, t) => sum + t.ff.def.stl, 0) / allTeamFactors.length,
      ast: allTeamFactors.reduce((sum, t) => sum + t.ff.def.ast, 0) / allTeamFactors.length,
    }
  };

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
        <StatCard title="Off. Efficiency" value={team.adjO} rank={teamsData.rows.filter((r: any) => r.adjO > team.adjO).length + 1} />
        <StatCard title="Def. Efficiency" value={team.adjD} rank={teamsData.rows.filter((r: any) => r.adjD < team.adjD).length + 1} />
        <StatCard title="Raw Margin" value={team.adjEM} prefix="+" rank={teamsData.rows.filter((r: any) => r.adjEM > team.adjEM).length + 1} />
        <StatCard title="Tempo" value={team.adjT} rank={teamsData.rows.filter((r: any) => r.adjT > team.adjT).length + 1} />
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
              { label: "Eff. FG%", off: ff.off.efg, def: ff.def.efg, offRank: rankings.off.efg, defRank: rankings.def.efg, offAvg: d1Avg.off.efg, defAvg: d1Avg.def.efg },
              { label: "TO%", off: ff.off.tov, def: ff.def.tov, offRank: rankings.off.tov, defRank: rankings.def.tov, offAvg: d1Avg.off.tov, defAvg: d1Avg.def.tov },
              { label: "OR%", off: ff.off.orb, def: ff.def.orb, offRank: rankings.off.orb, defRank: rankings.def.orb, offAvg: d1Avg.off.orb, defAvg: d1Avg.def.orb },
              { label: "FTA/FGA", off: ff.off.ftr, def: ff.def.ftr, offRank: rankings.off.ftr, defRank: rankings.def.ftr, offAvg: d1Avg.off.ftr, defAvg: d1Avg.def.ftr },
            ]}
          />
          <StatsTable
            title="Shooting"
            rows={[
              { label: "2P%", off: ff.off.two, def: ff.def.two, offRank: rankings.off.two, defRank: rankings.def.two, offAvg: d1Avg.off.two, defAvg: d1Avg.def.two },
              { label: "3P%", off: ff.off.three, def: ff.def.three, offRank: rankings.off.three, defRank: rankings.def.three, offAvg: d1Avg.off.three, defAvg: d1Avg.def.three },
              { label: "FT%", off: ff.off.ft, def: ff.def.ft, offRank: rankings.off.ft, defRank: rankings.def.ft, offAvg: d1Avg.off.ft, defAvg: d1Avg.def.ft },
            ]}
          />
          <StatsTable
            title="Other Stats"
            rows={[
              { label: "3PA/FGA", off: ff.off.threePaRate, def: ff.def.threePaRate, offRank: rankings.off.threePaRate, defRank: rankings.def.threePaRate, offAvg: d1Avg.off.threePaRate, defAvg: d1Avg.def.threePaRate },
              { label: "Block%", off: ff.off.blk, def: ff.def.blk, offRank: rankings.off.blk, defRank: rankings.def.blk, offAvg: d1Avg.off.blk, defAvg: d1Avg.def.blk },
              { label: "Steal%", off: ff.off.stl, def: ff.def.stl, offRank: rankings.off.stl, defRank: rankings.def.stl, offAvg: d1Avg.off.stl, defAvg: d1Avg.def.stl },
              { label: "Assist%", off: ff.off.ast, def: ff.def.ast, offRank: rankings.off.ast, defRank: rankings.def.ast, offAvg: d1Avg.off.ast, defAvg: d1Avg.def.ast },
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
        <PlayerStatsKenPom players={playersData.players} team={team} />
      )}
    </main>
  );
}

// Player stats component with KenPom advanced metrics
function PlayerStatsKenPom({ players, team }: { players: any[]; team: any }) {
  // Calculate team totals for percentages
  const teamMinutes = team.games * 200; // 5 players * 40 minutes
  const teamPoss = team.fga - team.orb + team.tov + 0.475 * team.fta;
  const opp_drb = team.opp_trb - team.opp_orb;
  const drb = team.trb - team.orb;
  
  const calculatePlayerStats = (p: any) => {
    const minPct = teamMinutes > 0 ? (p.minutes / teamMinutes) * 100 * 5 : 0;
    const twoPA = p.fga - p.tpa;
    const twoPM = p.fgm - p.tpm;
    
    // Usage %
    const playerPoss = p.fga + 0.44 * p.fta + p.tov;
    const usagePct = teamPoss > 0 ? (playerPoss / teamPoss) * 100 : 0;
    
    // Shot %
    const shotPct = team.fga > 0 ? (p.fga / team.fga) * 100 : 0;
    
    // eFG% and TS%
    const efg = p.fga > 0 ? ((p.fgm + 0.5 * p.tpm) / p.fga) * 100 : 0;
    const ts = (p.fga + 0.44 * p.fta) > 0 ? (p.points / (2 * (p.fga + 0.44 * p.fta))) * 100 : 0;
    
    // Rebound % (per minute rates scaled to team)
    const orPct = p.minutes > 0 && (team.orb + opp_drb) > 0 
      ? (p.orb / p.minutes) * (teamMinutes / 5) / (team.orb + opp_drb) * 100 : 0;
    const drPct = p.minutes > 0 && (drb + team.opp_orb) > 0
      ? (p.drb / p.minutes) * (teamMinutes / 5) / (drb + team.opp_orb) * 100 : 0;
    
    // Assist/TO Rate (per 100 possessions)
    const playerPoss100 = p.minutes > 0 ? (teamPoss / teamMinutes) * p.minutes : 0;
    const aRate = playerPoss100 > 0 ? (p.ast / playerPoss100) * 100 : 0;
    const toRate = playerPoss100 > 0 ? (p.tov / playerPoss100) * 100 : 0;
    
    // Block/Steal % (actual KenPom formulas)
    // Total opponent stats
    const oppPoss = team.opp_fga - team.opp_orb + team.opp_tov + 0.475 * team.opp_fta;
    const opp2PA = team.opp_fga - team.opp_tpa;
    
    // Blk% = 100 × (BLK × (Tm MP/5)) / (MP × (Opp FGA - Opp 3PA))
    const blkPct = (p.minutes * opp2PA) > 0 
      ? 100 * (p.blk * (teamMinutes / 5)) / (p.minutes * opp2PA) 
      : 0;
    
    // Stl% = 100 × (STL × (Tm MP/5)) / (MP × Opp Poss)
    const stlPct = (p.minutes * oppPoss) > 0 
      ? 100 * (p.stl * (teamMinutes / 5)) / (p.minutes * oppPoss) 
      : 0;
    
    // Per 40
    const per40 = p.minutes > 0 ? 40 / p.minutes : 0;
    const fc40 = p.pf * per40;
    
    // FT Rate
    const ftRate = p.fga > 0 ? (p.fta / p.fga) * 100 : 0;
    
    // Shooting %s
    const ftPct = p.fta > 0 ? (p.ftm / p.fta) * 100 : 0;
    const twoPct = twoPA > 0 ? (twoPM / twoPA) * 100 : 0;
    const threePct = p.tpa > 0 ? (p.tpm / p.tpa) * 100 : 0;
    
    // ORtg (simplified)
    const ortg = playerPoss > 0 ? (p.points / playerPoss) * 100 : 0;
    
    return {
      minPct, ortg, usagePct, shotPct, efg, ts, orPct, drPct,
      aRate, toRate, blkPct, stlPct, fc40, ftRate, ftPct, twoPct, threePct,
      twoPM, twoPA, ftm: p.ftm, fta: p.fta, tpm: p.tpm, tpa: p.tpa,
    };
  };

  return (
    <div style={{ marginBottom: 32 }}>
      <div style={{
        fontSize: 12, fontWeight: 800, textTransform: "uppercase",
        letterSpacing: 0.5, color: "#fff", background: ACCENT,
        padding: "6px 10px"
      }}>
        Player Stats
      </div>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 10, whiteSpace: "nowrap" }}>
          <thead>
            <tr style={{ borderBottom: `2px solid ${ACCENT}`, background: ACCENT_LIGHT }}>
              <th style={{ padding: "6px 4px", textAlign: "left", position: "sticky", left: 0, background: ACCENT_LIGHT, zIndex: 1 }}>Player</th>
              <th style={{ padding: "6px 4px", textAlign: "center" }}>Ht</th>
              <th style={{ padding: "6px 4px", textAlign: "center" }}>Yr</th>
              <th style={{ padding: "6px 4px", textAlign: "right" }}>G</th>
              <th style={{ padding: "6px 4px", textAlign: "right" }}>S</th>
              <th style={{ padding: "6px 4px", textAlign: "right" }}>%Min</th>
              <th style={{ padding: "6px 4px", textAlign: "right" }}>ORtg</th>
              <th style={{ padding: "6px 4px", textAlign: "right" }}>%Poss</th>
              <th style={{ padding: "6px 4px", textAlign: "right" }}>%Shot</th>
              <th style={{ padding: "6px 4px", textAlign: "right" }}>eFG%</th>
              <th style={{ padding: "6px 4px", textAlign: "right" }}>TS%</th>
              <th style={{ padding: "6px 4px", textAlign: "right" }}>OR%</th>
              <th style={{ padding: "6px 4px", textAlign: "right" }}>DR%</th>
              <th style={{ padding: "6px 4px", textAlign: "right" }}>ARate</th>
              <th style={{ padding: "6px 4px", textAlign: "right" }}>TORate</th>
              <th style={{ padding: "6px 4px", textAlign: "right" }}>Blk%</th>
              <th style={{ padding: "6px 4px", textAlign: "right" }}>Stl%</th>
              <th style={{ padding: "6px 4px", textAlign: "right" }}>FC/40</th>
              <th style={{ padding: "6px 4px", textAlign: "right" }}>FD/40</th>
              <th style={{ padding: "6px 4px", textAlign: "right" }}>FTRate</th>
              <th style={{ padding: "6px 4px", textAlign: "right" }}>FTM-A</th>
              <th style={{ padding: "6px 4px", textAlign: "right" }}>Pct</th>
              <th style={{ padding: "6px 4px", textAlign: "right" }}>2PM-A</th>
              <th style={{ padding: "6px 4px", textAlign: "right" }}>Pct</th>
              <th style={{ padding: "6px 4px", textAlign: "right" }}>3PM-A</th>
              <th style={{ padding: "6px 4px", textAlign: "right" }}>Pct</th>
            </tr>
          </thead>
          <tbody>
            {players.map((p: any) => {
              const stats = calculatePlayerStats(p);
              return (
                <tr key={p.playerId} style={{ borderBottom: "1px solid #f0f0f0" }}>
                  <td style={{ padding: "6px 4px", fontWeight: 600, position: "sticky", left: 0, background: "#fff", zIndex: 1 }}>
                    {p.firstName} {p.lastName}
                  </td>
                  <td style={{ padding: "6px 4px", textAlign: "center" }}>—</td>
                  <td style={{ padding: "6px 4px", textAlign: "center" }}>{p.year || "—"}</td>
                  <td style={{ padding: "6px 4px", textAlign: "right" }}>{p.games}</td>
                  <td style={{ padding: "6px 4px", textAlign: "right" }}>{p.starts || 0}</td>
                  <td style={{ padding: "6px 4px", textAlign: "right" }}>{stats.minPct.toFixed(1)}</td>
                  <td style={{ padding: "6px 4px", textAlign: "right" }}>{stats.ortg.toFixed(1)}</td>
                  <td style={{ padding: "6px 4px", textAlign: "right" }}>{stats.usagePct.toFixed(1)}</td>
                  <td style={{ padding: "6px 4px", textAlign: "right" }}>{stats.shotPct.toFixed(1)}</td>
                  <td style={{ padding: "6px 4px", textAlign: "right" }}>{stats.efg.toFixed(1)}</td>
                  <td style={{ padding: "6px 4px", textAlign: "right" }}>{stats.ts.toFixed(1)}</td>
                  <td style={{ padding: "6px 4px", textAlign: "right" }}>{stats.orPct.toFixed(1)}</td>
                  <td style={{ padding: "6px 4px", textAlign: "right" }}>{stats.drPct.toFixed(1)}</td>
                  <td style={{ padding: "6px 4px", textAlign: "right" }}>{stats.aRate.toFixed(1)}</td>
                  <td style={{ padding: "6px 4px", textAlign: "right" }}>{stats.toRate.toFixed(1)}</td>
                  <td style={{ padding: "6px 4px", textAlign: "right" }}>{stats.blkPct.toFixed(1)}</td>
                  <td style={{ padding: "6px 4px", textAlign: "right" }}>{stats.stlPct.toFixed(1)}</td>
                  <td style={{ padding: "6px 4px", textAlign: "right" }}>{stats.fc40.toFixed(1)}</td>
                  <td style={{ padding: "6px 4px", textAlign: "right" }}>—</td>
                  <td style={{ padding: "6px 4px", textAlign: "right" }}>{stats.ftRate.toFixed(1)}</td>
                  <td style={{ padding: "6px 4px", textAlign: "right" }}>{stats.ftm}-{stats.fta}</td>
                  <td style={{ padding: "6px 4px", textAlign: "right" }}>{stats.ftPct.toFixed(1)}</td>
                  <td style={{ padding: "6px 4px", textAlign: "right" }}>{stats.twoPM}-{stats.twoPA}</td>
                  <td style={{ padding: "6px 4px", textAlign: "right" }}>{stats.twoPct.toFixed(1)}</td>
                  <td style={{ padding: "6px 4px", textAlign: "right" }}>{stats.tpm}-{stats.tpa}</td>
                  <td style={{ padding: "6px 4px", textAlign: "right" }}>{stats.threePct.toFixed(1)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// Helper components
function StatCard({ title, value, prefix = "", rank }: { title: string; value: number | null; prefix?: string; rank?: number }) {
  return (
    <div style={{ background: ACCENT_LIGHT, padding: 20, borderRadius: 8, border: `1px solid ${ACCENT_BORDER}` }}>
      <div style={{ fontSize: 12, color: "#666", marginBottom: 4, textTransform: "uppercase" }}>{title}</div>
      <div style={{ fontSize: 32, fontWeight: 800 }}>
        {value !== null && isFinite(value) ? `${prefix}${value.toFixed(1)}` : "—"}
      </div>
      {rank && <div style={{ fontSize: 12, color: "#666", marginTop: 4 }}>#{rank}</div>}
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

function StatsTable({ title, rows }: { 
  title: string; 
  rows: Array<{ 
    label: string; 
    off: number; 
    def: number; 
    offRank?: number; 
    defRank?: number;
    offAvg?: number;
    defAvg?: number;
  }> 
}) {
  return (
    <div style={{ marginBottom: 16, border: "1px solid #e0e0e0" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
        <thead>
          <tr style={{ background: "#f0f0f0" }}>
            <th style={{ fontSize: 11, fontWeight: 700, padding: "8px 10px", textAlign: "left", width: "40%" }}>{title}</th>
            <th style={{ fontSize: 11, fontWeight: 700, padding: "8px 10px", textAlign: "right", width: "20%" }}>Off</th>
            <th style={{ fontSize: 11, fontWeight: 700, padding: "8px 10px", textAlign: "right", width: "20%" }}>Def</th>
            <th style={{ fontSize: 11, fontWeight: 700, padding: "8px 10px", textAlign: "right", width: "20%" }}>D1 Avg</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} style={{ borderBottom: i === rows.length - 1 ? "none" : "1px solid #f0f0f0" }}>
              <td style={{ padding: "6px 10px" }}>{row.label}</td>
              <td style={{ padding: "6px 10px", textAlign: "right" }}>
                {isFinite(row.off) ? row.off.toFixed(1) : "—"}
                {row.offRank && <span style={{ color: "#666", fontSize: 10, marginLeft: 4 }}>#{row.offRank}</span>}
              </td>
              <td style={{ padding: "6px 10px", textAlign: "right" }}>
                {isFinite(row.def) ? row.def.toFixed(1) : "—"}
                {row.defRank && <span style={{ color: "#666", fontSize: 10, marginLeft: 4 }}>#{row.defRank}</span>}
              </td>
              <td style={{ padding: "6px 10px", textAlign: "right", color: "#666" }}>
                {row.offAvg && row.defAvg ? ((row.offAvg + row.defAvg) / 2).toFixed(1) : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
