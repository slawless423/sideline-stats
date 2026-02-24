import Link from "next/link";
import { headers } from 'next/headers';
import MensD2TeamPageWithNav from '@/components/MensD2TeamPageWithNav';

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
  adjO?: number;
  adjD?: number;
  adjEM?: number;
  adjT?: number;
};

// Coerce all numeric fields from DB (Postgres returns numerics as strings)
function coerceTeamStats(t: any): TeamStats {
  const numFields = [
    'games','wins','losses','points','opp_points',
    'fgm','fga','tpm','tpa','ftm','fta',
    'orb','drb','trb','ast','stl','blk','tov','pf',
    'opp_fgm','opp_fga','opp_tpm','opp_tpa','opp_ftm','opp_fta',
    'opp_orb','opp_drb','opp_trb','opp_ast','opp_stl','opp_blk','opp_tov','opp_pf',
    'adjO','adjD','adjEM','adjT',
  ];
  const result = { ...t };
  for (const f of numFields) {
    if (result[f] !== undefined && result[f] !== null) {
      result[f] = Number(result[f]);
    }
  }
  return result;
}

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

  const [teamsData, teamApiData, gamesData, playersData, allTeamStatsData] = await Promise.all([
    fetchAPI('/api/mens-d2/teams'),
    fetchAPI(`/api/mens-d2/team/${teamId}`),
    fetchAPI(`/api/mens-d2/team/${teamId}/games`),
    fetchAPI(`/api/mens-d2/team/${teamId}/players`),
    fetchAPI('/api/mens-d2/teams/stats'),
  ]);

  // FIX: The API returns { team: {...}, players: [...] } so we must extract .team
  const rawTeam = teamApiData.team ?? teamApiData;
  const teamData = coerceTeamStats(rawTeam);

  const team = {
    ...teamData,
    adjO: (confOnly || d1Only) && teamData.games > 0
      ? (teamData.points / teamData.games) * 100 / ((teamData.fga - teamData.orb + teamData.tov + 0.475 * teamData.fta) / teamData.games)
      : teamData.adjO,
    adjD: (confOnly || d1Only) && teamData.games > 0  
      ? (teamData.opp_points / teamData.games) * 100 / ((teamData.opp_fga - teamData.opp_orb + teamData.opp_tov + 0.475 * teamData.opp_fta) / teamData.games)
      : teamData.adjD,
    adjT: (confOnly || d1Only) && teamData.games > 0
      ? ((teamData.fga - teamData.orb + teamData.tov + 0.475 * teamData.fta) + (teamData.opp_fga - teamData.opp_orb + teamData.opp_tov + 0.475 * teamData.opp_fta)) / (2 * teamData.games)
      : teamData.adjT,
  } as TeamStats & { adjO: number; adjD: number; adjEM: number; adjT: number };

  if (team.adjO && team.adjD) {
    team.adjEM = team.adjO - team.adjD;
  }

  if (!team.teamName) {
    return (
      <main style={{ maxWidth: 1200, margin: "0 auto", padding: 20 }}>
        <Link href="/mens-d2" style={{ color: "#2563eb" }}>← Back</Link>
        <h1>Team not found</h1>
      </main>
    );
  }

  const rank = teamsData.rows.findIndex((r: any) => r.teamId === teamId) + 1;
  const allTeamStats: TeamStats[] = (allTeamStatsData.teams ?? []).map(coerceTeamStats);
  const ff = calcFourFactors(team);

  const allTeamFactors = allTeamStats.map(t => ({
    teamId: t.teamId,
    ff: calcFourFactors(t)
  }));

  const getRank = (value: number, allValues: number[], higherIsBetter: boolean) => {
    const sorted = [...allValues].sort((a, b) => higherIsBetter ? b - a : a - b);
    const idx = sorted.findIndex(v => Math.abs(v - value) < 0.001);
    return idx + 1;
  };

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
      blk: getRank(ff.off.blk, allTeamFactors.map(t => t.ff.off.blk), false),
      stl: getRank(ff.off.stl, allTeamFactors.map(t => t.ff.off.stl), false),
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

  const confOnlyUrl = confOnly 
    ? (d1Only ? `/mens-d2/team/${teamId}?d1=true` : `/mens-d2/team/${teamId}`)
    : (d1Only ? `/mens-d2/team/${teamId}?conf=true&d1=true` : `/mens-d2/team/${teamId}?conf=true`);
  
  const d1OnlyUrl = d1Only
    ? (confOnly ? `/mens-d2/team/${teamId}?conf=true` : `/mens-d2/team/${teamId}`)
    : (confOnly ? `/mens-d2/team/${teamId}?conf=true&d1=true` : `/mens-d2/team/${teamId}?d1=true`);

  return (
    <MensD2TeamPageWithNav>
      <main style={{ maxWidth: 1200, margin: "0 auto", padding: 20 }}>

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
        <StatCard title="Off. Efficiency" value={team.adjO ?? null} rank={teamsData.rows.filter((r: any) => Number(r.adjO) > (team.adjO ?? 0)).length + 1} />
        <StatCard title="Def. Efficiency" value={team.adjD ?? null} rank={teamsData.rows.filter((r: any) => Number(r.adjD) < (team.adjD ?? 999)).length + 1} />
        <StatCard title="Raw Margin" value={team.adjEM ?? null} prefix="+" rank={teamsData.rows.filter((r: any) => Number(r.adjEM) > (team.adjEM ?? 0)).length + 1} />
        <StatCard title="Tempo" value={team.adjT ?? null} rank={teamsData.rows.filter((r: any) => Number(r.adjT) > (team.adjT ?? 0)).length + 1} />
      </div>

      {/* TOGGLES */}
      <div style={{ display: "flex", gap: 12, marginBottom: 24 }}>
        <ToggleLink href={confOnlyUrl} checked={confOnly} label="Conference games only" />
        <ToggleLink href={d1OnlyUrl} checked={d1Only} label="D2 opponents only" />
      </div>

      {/* TWO COLUMN LAYOUT */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24, marginBottom: 32 }}>
        {/* SCOUTING REPORT */}
        <div>
          <SectionTitle title="Team Scouting Report" />
          <StatsTable
            title="Four Factors"
            rows={[
              { label: "Eff. FG%", off: ff.off.efg, def: ff.def.efg, offRank: (confOnly || d1Only) ? undefined : rankings.off.efg, defRank: (confOnly || d1Only) ? undefined : rankings.def.efg, offAvg: d1Avg.off.efg, defAvg: d1Avg.def.efg },
              { label: "TO%", off: ff.off.tov, def: ff.def.tov, offRank: (confOnly || d1Only) ? undefined : rankings.off.tov, defRank: (confOnly || d1Only) ? undefined : rankings.def.tov, offAvg: d1Avg.off.tov, defAvg: d1Avg.def.tov },
              { label: "OR%", off: ff.off.orb, def: ff.def.orb, offRank: (confOnly || d1Only) ? undefined : rankings.off.orb, defRank: (confOnly || d1Only) ? undefined : rankings.def.orb, offAvg: d1Avg.off.orb, defAvg: d1Avg.def.orb },
              { label: "FTA/FGA", off: ff.off.ftr, def: ff.def.ftr, offRank: (confOnly || d1Only) ? undefined : rankings.off.ftr, defRank: (confOnly || d1Only) ? undefined : rankings.def.ftr, offAvg: d1Avg.off.ftr, defAvg: d1Avg.def.ftr },
            ]}
          />
          <StatsTable
            title="Shooting"
            rows={[
              { label: "2P%", off: ff.off.two, def: ff.def.two, offRank: (confOnly || d1Only) ? undefined : rankings.off.two, defRank: (confOnly || d1Only) ? undefined : rankings.def.two, offAvg: d1Avg.off.two, defAvg: d1Avg.def.two },
              { label: "3P%", off: ff.off.three, def: ff.def.three, offRank: (confOnly || d1Only) ? undefined : rankings.off.three, defRank: (confOnly || d1Only) ? undefined : rankings.def.three, offAvg: d1Avg.off.three, defAvg: d1Avg.def.three },
              { label: "FT%", off: ff.off.ft, def: ff.def.ft, offRank: (confOnly || d1Only) ? undefined : rankings.off.ft, defRank: (confOnly || d1Only) ? undefined : rankings.def.ft, offAvg: d1Avg.off.ft, defAvg: d1Avg.def.ft },
            ]}
          />
          <StatsTable
            title="Other Stats"
            rows={[
              { label: "3PA/FGA", off: ff.off.threePaRate, def: ff.def.threePaRate, offRank: (confOnly || d1Only) ? undefined : rankings.off.threePaRate, defRank: (confOnly || d1Only) ? undefined : rankings.def.threePaRate, offAvg: d1Avg.off.threePaRate, defAvg: d1Avg.def.threePaRate },
              { label: "Block%", off: ff.off.blk, def: ff.def.blk, offRank: (confOnly || d1Only) ? undefined : rankings.off.blk, defRank: (confOnly || d1Only) ? undefined : rankings.def.blk, offAvg: d1Avg.off.blk, defAvg: d1Avg.def.blk },
              { label: "Steal%", off: ff.off.stl, def: ff.def.stl, offRank: (confOnly || d1Only) ? undefined : rankings.off.stl, defRank: (confOnly || d1Only) ? undefined : rankings.def.stl, offAvg: d1Avg.off.stl, defAvg: d1Avg.def.stl },
              { label: "Assist%", off: ff.off.ast, def: ff.def.ast, offRank: (confOnly || d1Only) ? undefined : rankings.off.ast, defRank: (confOnly || d1Only) ? undefined : rankings.def.ast, offAvg: d1Avg.off.ast, defAvg: d1Avg.def.ast },
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
                        {new Date(game.gameDate ?? game.date).toLocaleDateString('en-US', { month: 'numeric', day: 'numeric' })}
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
      {playersData.players && playersData.players.length > 0 && (
        <PlayerStatsKenPom players={playersData.players} team={team} />
      )}

      {/* TEAM TOTALS */}
      <div style={{ marginBottom: 32 }}>
        <SectionTitle title="Team Totals" />
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
            <thead>
              <tr style={{ borderBottom: `2px solid ${ACCENT}`, background: ACCENT_LIGHT }}>
                <th style={{ padding: "6px 8px", textAlign: "left" }}>Category</th>
                <th style={{ padding: "6px 8px", textAlign: "right" }}>Team</th>
                <th style={{ padding: "6px 8px", textAlign: "right" }}>Opponent</th>
              </tr>
            </thead>
            <tbody>
              <tr style={{ borderBottom: "1px solid #f0f0f0" }}>
                <td style={{ padding: "6px 8px" }}>Games</td>
                <td style={{ padding: "6px 8px", textAlign: "right" }}>{team.games}</td>
                <td style={{ padding: "6px 8px", textAlign: "right" }}>—</td>
              </tr>
              <tr style={{ borderBottom: "1px solid #f0f0f0" }}>
                <td style={{ padding: "6px 8px" }}>Points</td>
                <td style={{ padding: "6px 8px", textAlign: "right" }}>{team.points}</td>
                <td style={{ padding: "6px 8px", textAlign: "right" }}>{team.opp_points}</td>
              </tr>
              <tr style={{ borderBottom: "1px solid #f0f0f0" }}>
                <td style={{ padding: "6px 8px" }}>2PM-2PA</td>
                <td style={{ padding: "6px 8px", textAlign: "right" }}>{team.fgm - team.tpm}-{team.fga - team.tpa}</td>
                <td style={{ padding: "6px 8px", textAlign: "right" }}>{team.opp_fgm - team.opp_tpm}-{team.opp_fga - team.opp_tpa}</td>
              </tr>
              <tr style={{ borderBottom: "1px solid #f0f0f0" }}>
                <td style={{ padding: "6px 8px" }}>3PM-3PA</td>
                <td style={{ padding: "6px 8px", textAlign: "right" }}>{team.tpm}-{team.tpa}</td>
                <td style={{ padding: "6px 8px", textAlign: "right" }}>{team.opp_tpm}-{team.opp_tpa}</td>
              </tr>
              <tr style={{ borderBottom: "1px solid #f0f0f0" }}>
                <td style={{ padding: "6px 8px" }}>FTM-FTA</td>
                <td style={{ padding: "6px 8px", textAlign: "right" }}>{team.ftm}-{team.fta}</td>
                <td style={{ padding: "6px 8px", textAlign: "right" }}>{team.opp_ftm}-{team.opp_fta}</td>
              </tr>
              <tr style={{ borderBottom: "1px solid #f0f0f0" }}>
                <td style={{ padding: "6px 8px" }}>Offensive Rebounds</td>
                <td style={{ padding: "6px 8px", textAlign: "right" }}>{team.orb}</td>
                <td style={{ padding: "6px 8px", textAlign: "right" }}>{team.opp_orb}</td>
              </tr>
              <tr style={{ borderBottom: "1px solid #f0f0f0" }}>
                <td style={{ padding: "6px 8px" }}>Defensive Rebounds</td>
                <td style={{ padding: "6px 8px", textAlign: "right" }}>{team.trb - team.orb}</td>
                <td style={{ padding: "6px 8px", textAlign: "right" }}>{team.opp_trb - team.opp_orb}</td>
              </tr>
              <tr style={{ borderBottom: "1px solid #f0f0f0" }}>
                <td style={{ padding: "6px 8px" }}>Total Rebounds</td>
                <td style={{ padding: "6px 8px", textAlign: "right" }}>{team.trb}</td>
                <td style={{ padding: "6px 8px", textAlign: "right" }}>{team.opp_trb}</td>
              </tr>
              <tr style={{ borderBottom: "1px solid #f0f0f0" }}>
                <td style={{ padding: "6px 8px" }}>Assists</td>
                <td style={{ padding: "6px 8px", textAlign: "right" }}>{team.ast}</td>
                <td style={{ padding: "6px 8px", textAlign: "right" }}>{team.opp_ast}</td>
              </tr>
              <tr style={{ borderBottom: "1px solid #f0f0f0" }}>
                <td style={{ padding: "6px 8px" }}>Steals</td>
                <td style={{ padding: "6px 8px", textAlign: "right" }}>{team.stl}</td>
                <td style={{ padding: "6px 8px", textAlign: "right" }}>{team.opp_stl}</td>
              </tr>
              <tr style={{ borderBottom: "1px solid #f0f0f0" }}>
                <td style={{ padding: "6px 8px" }}>Blocks</td>
                <td style={{ padding: "6px 8px", textAlign: "right" }}>{team.blk}</td>
                <td style={{ padding: "6px 8px", textAlign: "right" }}>{team.opp_blk}</td>
              </tr>
              <tr style={{ borderBottom: "1px solid #f0f0f0" }}>
                <td style={{ padding: "6px 8px" }}>Turnovers</td>
                <td style={{ padding: "6px 8px", textAlign: "right" }}>{team.tov}</td>
                <td style={{ padding: "6px 8px", textAlign: "right" }}>{team.opp_tov}</td>
              </tr>
              <tr>
                <td style={{ padding: "6px 8px" }}>Personal Fouls</td>
                <td style={{ padding: "6px 8px", textAlign: "right" }}>{team.pf}</td>
                <td style={{ padding: "6px 8px", textAlign: "right" }}>{team.opp_pf}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </main>
    </MensD2TeamPageWithNav>
  );
}

// Player stats component
function PlayerStatsKenPom({ players, team }: { players: any[]; team: any }) {
  const teamMinutes = team.games * 200;
  const teamPoss = team.fga - team.orb + team.tov + 0.475 * team.fta;
  const opp_drb = team.opp_trb - team.opp_orb;
  const drb = team.trb - team.orb;
  
  const calculatePlayerStats = (p: any) => {
    // Coerce player stats to numbers
    const pg = {
      minutes: Number(p.minutes) || 0,
      fgm: Number(p.fgm) || 0,
      fga: Number(p.fga) || 0,
      tpm: Number(p.tpm) || 0,
      tpa: Number(p.tpa) || 0,
      ftm: Number(p.ftm) || 0,
      fta: Number(p.fta) || 0,
      orb: Number(p.orb) || 0,
      drb: Number(p.drb) || 0,
      ast: Number(p.ast) || 0,
      stl: Number(p.stl) || 0,
      blk: Number(p.blk) || 0,
      tov: Number(p.tov) || 0,
      pf: Number(p.pf) || 0,
      points: Number(p.points) || 0,
    };

    const twoPA = pg.fga - pg.tpa;
    const twoPM = pg.fgm - pg.tpm;

    const minPct = teamMinutes > 0 ? (pg.minutes / teamMinutes) * 100 * 5 : 0;
    const playerPoss = pg.fga + 0.44 * pg.fta + pg.tov;
    const usagePct = teamPoss > 0 ? (playerPoss / teamPoss) * 100 : 0;
    const shotPct = team.fga > 0 ? (pg.fga / team.fga) * 100 : 0;
    const efg = pg.fga > 0 ? ((pg.fgm + 0.5 * pg.tpm) / pg.fga) * 100 : 0;
    const ts = (pg.fga + 0.44 * pg.fta) > 0 ? (pg.points / (2 * (pg.fga + 0.44 * pg.fta))) * 100 : 0;

    const orPct = pg.minutes > 0 && (team.orb + opp_drb) > 0
      ? (pg.orb / pg.minutes) * (teamMinutes / 5) / (team.orb + opp_drb) * 100 : 0;
    const drPct = pg.minutes > 0 && (drb + team.opp_orb) > 0
      ? (pg.drb / pg.minutes) * (teamMinutes / 5) / (drb + team.opp_orb) * 100 : 0;

    const teamFGMWhileOnFloor = (team.fgm - pg.fgm) * (pg.minutes / teamMinutes) * 5;
    const aRate = teamFGMWhileOnFloor > 0 ? (pg.ast / teamFGMWhileOnFloor) * 100 : 0;

    const playerPoss100 = pg.minutes > 0 ? (teamPoss / teamMinutes) * pg.minutes : 0;
    const toRate = playerPoss100 > 0 ? (pg.tov / playerPoss100) * 100 : 0;

    const oppPoss = team.opp_fga - team.opp_orb + team.opp_tov + 0.475 * team.opp_fta;
    const opp2PA = team.opp_fga - team.opp_tpa;

    const blkPct = (pg.minutes * opp2PA) > 0
      ? 100 * (pg.blk * (teamMinutes / 5)) / (pg.minutes * opp2PA) : 0;
    const stlPct = (pg.minutes * oppPoss) > 0
      ? 100 * (pg.stl * (teamMinutes / 5)) / (pg.minutes * oppPoss) : 0;

    const per40 = pg.minutes > 0 ? 40 / pg.minutes : 0;
    const fc40 = pg.pf * per40;
    const ftRate = pg.fga > 0 ? (pg.fta / pg.fga) * 100 : 0;
    const ftPct = pg.fta > 0 ? (pg.ftm / pg.fta) * 100 : 0;
    const twoPct = twoPA > 0 ? (twoPM / twoPA) * 100 : 0;
    const threePct = pg.tpa > 0 ? (pg.tpm / pg.tpa) * 100 : 0;

    // Simplified ORtg
    const ortg = playerPoss > 0 ? (pg.points / playerPoss) * 100 : 0;

    return {
      minPct, ortg, usagePct, shotPct, efg, ts, orPct, drPct,
      aRate, toRate, blkPct, stlPct, fc40, ftRate, ftPct, twoPct, threePct,
      twoPM, twoPA, ftm: pg.ftm, fta: pg.fta, tpm: pg.tpm, tpa: pg.tpa,
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
            <th style={{ fontSize: 11, fontWeight: 700, padding: "8px 10px", textAlign: "right", width: "20%" }}>D2 Avg</th>
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
                {row.offAvg != null && row.defAvg != null ? ((row.offAvg + row.defAvg) / 2).toFixed(1) : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
