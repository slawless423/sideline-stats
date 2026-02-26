import Link from "next/link";
import { headers } from 'next/headers';
import SiteNavigation from '@/components/SiteNavigation';

const ACCENT = "#2d3748";
const ACCENT_LIGHT = "#f7f8fa";
const ACCENT_BORDER = "#d0d5de";

type TeamStats = {
  teamId: string; teamName: string; conference?: string;
  games: number; wins: number; losses: number;
  points: number; opp_points: number;
  fgm: number; fga: number; tpm: number; tpa: number; ftm: number; fta: number;
  orb: number; drb: number; trb: number; ast: number; stl: number; blk: number; tov: number; pf: number;
  opp_fgm: number; opp_fga: number; opp_tpm: number; opp_tpa: number; opp_ftm: number; opp_fta: number;
  opp_orb: number; opp_drb: number; opp_trb: number; opp_ast: number; opp_stl: number; opp_blk: number; opp_tov: number; opp_pf: number;
  adjO?: number; adjD?: number; adjEM?: number; adjT?: number;
};

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
    if (result[f] !== undefined && result[f] !== null) result[f] = Number(result[f]);
  }
  return result;
}

async function fetchAPI(path: string) {
  const headersList = await headers();
  const host = headersList.get('host');
  const protocol = process.env.NODE_ENV === 'development' ? 'http' : 'https';
  const res = await fetch(`${protocol}://${host}${path}`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Failed to fetch ${path}`);
  return res.json();
}

function buildStatsFromGames(games: any[], teamId: string, teamName: string, conference: string | undefined): TeamStats & { adjO: number; adjD: number; adjEM: number; adjT: number } {
  const s = {
    teamId, teamName, conference,
    games: 0, wins: 0, losses: 0, points: 0, opp_points: 0,
    fgm: 0, fga: 0, tpm: 0, tpa: 0, ftm: 0, fta: 0,
    orb: 0, drb: 0, trb: 0, ast: 0, stl: 0, blk: 0, tov: 0, pf: 0,
    opp_fgm: 0, opp_fga: 0, opp_tpm: 0, opp_tpa: 0, opp_ftm: 0, opp_fta: 0,
    opp_orb: 0, opp_drb: 0, opp_trb: 0, opp_ast: 0, opp_stl: 0, opp_blk: 0, opp_tov: 0, opp_pf: 0,
  };

  for (const g of games) {
    const isHome = g.homeId === teamId;
    const ourScore = Number(isHome ? g.homeScore : g.awayScore);
    const theirScore = Number(isHome ? g.awayScore : g.homeScore);
    s.games++;
    if (ourScore > theirScore) s.wins++; else s.losses++;
    s.points += ourScore; s.opp_points += theirScore;
    const us = isHome ? g.homeStats : g.awayStats;
    const them = isHome ? g.awayStats : g.homeStats;
    if (us) {
      s.fgm += Number(us.fgm)||0; s.fga += Number(us.fga)||0;
      s.tpm += Number(us.tpm)||0; s.tpa += Number(us.tpa)||0;
      s.ftm += Number(us.ftm)||0; s.fta += Number(us.fta)||0;
      s.orb += Number(us.orb)||0; s.drb += Number(us.drb)||0; s.trb += Number(us.trb)||0;
      s.ast += Number(us.ast)||0; s.stl += Number(us.stl)||0; s.blk += Number(us.blk)||0;
      s.tov += Number(us.tov)||0; s.pf += Number(us.pf)||0;
    }
    if (them) {
      s.opp_fgm += Number(them.fgm)||0; s.opp_fga += Number(them.fga)||0;
      s.opp_tpm += Number(them.tpm)||0; s.opp_tpa += Number(them.tpa)||0;
      s.opp_ftm += Number(them.ftm)||0; s.opp_fta += Number(them.fta)||0;
      s.opp_orb += Number(them.orb)||0; s.opp_drb += Number(them.drb)||0; s.opp_trb += Number(them.trb)||0;
      s.opp_ast += Number(them.ast)||0; s.opp_stl += Number(them.stl)||0; s.opp_blk += Number(them.blk)||0;
      s.opp_tov += Number(them.tov)||0; s.opp_pf += Number(them.pf)||0;
    }
  }

  const offPoss = Math.max(1, s.fga - s.orb + s.tov + 0.475 * s.fta);
  const defPoss = Math.max(1, s.opp_fga - s.opp_orb + s.opp_tov + 0.475 * s.opp_fta);
  const adjO = (s.points / offPoss) * 100;
  const adjD = (s.opp_points / defPoss) * 100;
  return { ...s, adjO, adjD, adjEM: adjO - adjD, adjT: offPoss / Math.max(1, s.games) };
}

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

export default async function WomensD1TeamPage({
  params,
  searchParams,
}: {
  params: Promise<{ teamid: string }>;
  searchParams: Promise<{ conf?: string }>;
}) {
  const { teamid: teamId } = await params;
  const { conf } = await searchParams;
  const confOnly = conf === "true";

  const [teamsData, teamApiData, gamesData, playersData, allTeamStatsData] = await Promise.all([
    fetchAPI('/api/teams'),
    fetchAPI(`/api/teams/${teamId}`),
    fetchAPI(`/api/teams/${teamId}/games?conf=${confOnly}`),
    fetchAPI(`/api/teams/${teamId}/players${confOnly ? '?conf=true' : ''}`),
    fetchAPI('/api/teams/stats'),
  ]);

  const rawTeam = teamApiData.team ?? teamApiData;
  const fullTeamData = coerceTeamStats(rawTeam);

  const allGames: any[] = gamesData.games ?? [];
  const filteredGames = confOnly ? allGames.filter((g: any) => g.isConferenceGame) : allGames;

  const team = confOnly && filteredGames.length > 0
    ? buildStatsFromGames(filteredGames, teamId, fullTeamData.teamName, fullTeamData.conference)
    : { ...fullTeamData, adjO: fullTeamData.adjO ?? 0, adjD: fullTeamData.adjD ?? 0, adjEM: fullTeamData.adjEM ?? 0, adjT: fullTeamData.adjT ?? 0 };

  if (!team.teamName) {
    return (
      <main style={{ maxWidth: 1200, margin: "0 auto", padding: 20 }}>
        <Link href="/mens-d1" style={{ color: "#2563eb" }}>← Back</Link>
        <h1>Team not found</h1>
      </main>
    );
  }

  const rank = teamsData.rows.findIndex((r: any) => r.teamId === teamId) + 1;
  const allTeamStats: TeamStats[] = (allTeamStatsData.teams ?? []).map(coerceTeamStats);
  const ff = calcFourFactors(team);
  const allTeamFactors = allTeamStats.map(t => ({ teamId: t.teamId, ff: calcFourFactors(t) }));

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
      efg: allTeamFactors.reduce((s, t) => s + t.ff.off.efg, 0) / allTeamFactors.length,
      tov: allTeamFactors.reduce((s, t) => s + t.ff.off.tov, 0) / allTeamFactors.length,
      orb: allTeamFactors.reduce((s, t) => s + t.ff.off.orb, 0) / allTeamFactors.length,
      ftr: allTeamFactors.reduce((s, t) => s + t.ff.off.ftr, 0) / allTeamFactors.length,
      two: allTeamFactors.reduce((s, t) => s + t.ff.off.two, 0) / allTeamFactors.length,
      three: allTeamFactors.reduce((s, t) => s + t.ff.off.three, 0) / allTeamFactors.length,
      ft: allTeamFactors.reduce((s, t) => s + t.ff.off.ft, 0) / allTeamFactors.length,
      threePaRate: allTeamFactors.reduce((s, t) => s + t.ff.off.threePaRate, 0) / allTeamFactors.length,
      blk: allTeamFactors.reduce((s, t) => s + t.ff.off.blk, 0) / allTeamFactors.length,
      stl: allTeamFactors.reduce((s, t) => s + t.ff.off.stl, 0) / allTeamFactors.length,
      ast: allTeamFactors.reduce((s, t) => s + t.ff.off.ast, 0) / allTeamFactors.length,
    },
    def: {
      efg: allTeamFactors.reduce((s, t) => s + t.ff.def.efg, 0) / allTeamFactors.length,
      tov: allTeamFactors.reduce((s, t) => s + t.ff.def.tov, 0) / allTeamFactors.length,
      orb: allTeamFactors.reduce((s, t) => s + t.ff.def.orb, 0) / allTeamFactors.length,
      ftr: allTeamFactors.reduce((s, t) => s + t.ff.def.ftr, 0) / allTeamFactors.length,
      two: allTeamFactors.reduce((s, t) => s + t.ff.def.two, 0) / allTeamFactors.length,
      three: allTeamFactors.reduce((s, t) => s + t.ff.def.three, 0) / allTeamFactors.length,
      ft: allTeamFactors.reduce((s, t) => s + t.ff.def.ft, 0) / allTeamFactors.length,
      threePaRate: allTeamFactors.reduce((s, t) => s + t.ff.def.threePaRate, 0) / allTeamFactors.length,
      blk: allTeamFactors.reduce((s, t) => s + t.ff.def.blk, 0) / allTeamFactors.length,
      stl: allTeamFactors.reduce((s, t) => s + t.ff.def.stl, 0) / allTeamFactors.length,
      ast: allTeamFactors.reduce((s, t) => s + t.ff.def.ast, 0) / allTeamFactors.length,
    }
  };

  const confOnlyUrl = confOnly ? `/team/${teamId}` : `/mens-d1/team/${teamId}?conf=true`;

  return (
    <div>
      <SiteNavigation currentDivision="womens-d1" currentPage="rankings" divisionPath="/" />
      <main style={{ maxWidth: 1200, margin: "0 auto", padding: 20 }}>

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

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 16, marginBottom: 24 }}>
          <StatCard title="Off. Efficiency" value={team.adjO ?? null} rank={teamsData.rows.filter((r: any) => Number(r.rawO) > (team.adjO ?? 0)).length + 1} />
          <StatCard title="Def. Efficiency" value={team.adjD ?? null} rank={teamsData.rows.filter((r: any) => Number(r.rawD) < (team.adjD ?? 999)).length + 1} />
          <StatCard title="Raw Margin" value={team.adjEM ?? null} prefix="+" rank={teamsData.rows.filter((r: any) => Number(r.rawEM) > (team.adjEM ?? 0)).length + 1} />
          <StatCard title="Tempo" value={team.adjT ?? null} rank={teamsData.rows.filter((r: any) => Number(r.rawT) > (team.adjT ?? 0)).length + 1} />
        </div>

        <div style={{ display: "flex", gap: 12, marginBottom: 24 }}>
          <ToggleLink href={confOnlyUrl} checked={confOnly} label="Conference games only" />
        </div>

        {confOnly && filteredGames.length === 0 && (
          <div style={{ padding: 16, background: "#fef3c7", border: "1px solid #f59e0b", borderRadius: 6, marginBottom: 24 }}>
            No conference games found for this team.
          </div>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24, marginBottom: 32 }}>
          <div>
            <SectionTitle title={`Team Scouting Report${confOnly ? " (Conf. only)" : ""}`} />
            <StatsTable title="Four Factors" rows={[
              { label: "Eff. FG%", off: ff.off.efg, def: ff.def.efg, offRank: confOnly ? undefined : rankings.off.efg, defRank: confOnly ? undefined : rankings.def.efg, offAvg: d1Avg.off.efg, defAvg: d1Avg.def.efg },
              { label: "TO%", off: ff.off.tov, def: ff.def.tov, offRank: confOnly ? undefined : rankings.off.tov, defRank: confOnly ? undefined : rankings.def.tov, offAvg: d1Avg.off.tov, defAvg: d1Avg.def.tov },
              { label: "OR%", off: ff.off.orb, def: ff.def.orb, offRank: confOnly ? undefined : rankings.off.orb, defRank: confOnly ? undefined : rankings.def.orb, offAvg: d1Avg.off.orb, defAvg: d1Avg.def.orb },
              { label: "FTA/FGA", off: ff.off.ftr, def: ff.def.ftr, offRank: confOnly ? undefined : rankings.off.ftr, defRank: confOnly ? undefined : rankings.def.ftr, offAvg: d1Avg.off.ftr, defAvg: d1Avg.def.ftr },
            ]} />
            <StatsTable title="Shooting" rows={[
              { label: "2P%", off: ff.off.two, def: ff.def.two, offRank: confOnly ? undefined : rankings.off.two, defRank: confOnly ? undefined : rankings.def.two, offAvg: d1Avg.off.two, defAvg: d1Avg.def.two },
              { label: "3P%", off: ff.off.three, def: ff.def.three, offRank: confOnly ? undefined : rankings.off.three, defRank: confOnly ? undefined : rankings.def.three, offAvg: d1Avg.off.three, defAvg: d1Avg.def.three },
              { label: "FT%", off: ff.off.ft, def: ff.def.ft, offRank: confOnly ? undefined : rankings.off.ft, defRank: confOnly ? undefined : rankings.def.ft, offAvg: d1Avg.off.ft, defAvg: d1Avg.def.ft },
            ]} />
            <StatsTable title="Other Stats" rows={[
              { label: "3PA/FGA", off: ff.off.threePaRate, def: ff.def.threePaRate, offRank: confOnly ? undefined : rankings.off.threePaRate, defRank: confOnly ? undefined : rankings.def.threePaRate, offAvg: d1Avg.off.threePaRate, defAvg: d1Avg.def.threePaRate },
              { label: "Block%", off: ff.off.blk, def: ff.def.blk, offRank: confOnly ? undefined : rankings.off.blk, defRank: confOnly ? undefined : rankings.def.blk, offAvg: d1Avg.off.blk, defAvg: d1Avg.def.blk },
              { label: "Steal%", off: ff.off.stl, def: ff.def.stl, offRank: confOnly ? undefined : rankings.off.stl, defRank: confOnly ? undefined : rankings.def.stl, offAvg: d1Avg.off.stl, defAvg: d1Avg.def.stl },
              { label: "Assist%", off: ff.off.ast, def: ff.def.ast, offRank: confOnly ? undefined : rankings.off.ast, defRank: confOnly ? undefined : rankings.def.ast, offAvg: d1Avg.off.ast, defAvg: d1Avg.def.ast },
            ]} />
          </div>

          <div>
            <SectionTitle title={`Game Log${confOnly ? " (Conf. only)" : ""}`} />
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
                  {filteredGames.map((game: any) => {
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

        {playersData.players && playersData.players.length > 0 && (
          <PlayerStats players={playersData.players} team={team} />
        )}

        <div style={{ marginBottom: 32 }}>
          <SectionTitle title={`Team Totals${confOnly ? " (Conf. only)" : ""}`} />
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
                {[
                  { label: "Games", val: team.games, opp: "—" },
                  { label: "Points", val: team.points, opp: team.opp_points },
                  { label: "2PM-2PA", val: `${team.fgm - team.tpm}-${team.fga - team.tpa}`, opp: `${team.opp_fgm - team.opp_tpm}-${team.opp_fga - team.opp_tpa}` },
                  { label: "3PM-3PA", val: `${team.tpm}-${team.tpa}`, opp: `${team.opp_tpm}-${team.opp_tpa}` },
                  { label: "FTM-FTA", val: `${team.ftm}-${team.fta}`, opp: `${team.opp_ftm}-${team.opp_fta}` },
                  { label: "Offensive Rebounds", val: team.orb, opp: team.opp_orb },
                  { label: "Defensive Rebounds", val: team.trb - team.orb, opp: team.opp_trb - team.opp_orb },
                  { label: "Total Rebounds", val: team.trb, opp: team.opp_trb },
                  { label: "Assists", val: team.ast, opp: team.opp_ast },
                  { label: "Steals", val: team.stl, opp: team.opp_stl },
                  { label: "Blocks", val: team.blk, opp: team.opp_blk },
                  { label: "Turnovers", val: team.tov, opp: team.opp_tov },
                  { label: "Personal Fouls", val: team.pf, opp: team.opp_pf },
                ].map((row, i, arr) => (
                  <tr key={row.label} style={{ borderBottom: i < arr.length - 1 ? "1px solid #f0f0f0" : "none" }}>
                    <td style={{ padding: "6px 8px" }}>{row.label}</td>
                    <td style={{ padding: "6px 8px", textAlign: "right" }}>{row.val}</td>
                    <td style={{ padding: "6px 8px", textAlign: "right" }}>{row.opp}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </div>
  );
}

function PlayerStats({ players, team }: { players: any[]; team: any }) {
  const teamMinutes = team.games * 200;
  const opp_drb = team.opp_trb - team.opp_orb;
  const drb = team.trb - team.orb;

  // ── Derived team values for Dean Oliver ORtg ──────────────────────
  const Team_ORB_pct = team.orb / (team.orb + opp_drb);
  const Team_Scoring_Poss = team.fgm +
    (1 - Math.pow(1 - team.ftm / team.fta, 2)) * team.fta * 0.4;
  const Team_Play_pct = Team_Scoring_Poss / (team.fga + team.fta * 0.4 + team.tov);
  const Team_ORB_Weight =
    ((1 - Team_ORB_pct) * Team_Play_pct) /
    ((1 - Team_ORB_pct) * Team_Play_pct + Team_ORB_pct * (1 - Team_Play_pct));

  const calcStats = (p: any) => {
    const pg = {
      minutes: Number(p.minutes)||0, fgm: Number(p.fgm)||0, fga: Number(p.fga)||0,
      tpm: Number(p.tpm)||0, tpa: Number(p.tpa)||0, ftm: Number(p.ftm)||0, fta: Number(p.fta)||0,
      orb: Number(p.orb)||0, drb: Number(p.drb)||0, ast: Number(p.ast)||0,
      stl: Number(p.stl)||0, blk: Number(p.blk)||0, tov: Number(p.tov)||0,
      pf: Number(p.pf)||0, points: Number(p.points)||0,
    };

    const twoPA = pg.fga - pg.tpa;
    const twoPM = pg.fgm - pg.tpm;

    // %Min
    const minPct = teamMinutes > 0 ? (pg.minutes / teamMinutes) * 100 * 5 : 0;

    // Usage % (BBRef formula)
    const teamPossTotal = team.fga + 0.44 * team.fta + team.tov;
    const usagePct = teamPossTotal > 0 && pg.minutes > 0
      ? 100 * (pg.fga + 0.44 * pg.fta + pg.tov) / (teamPossTotal / teamMinutes * pg.minutes) / 5
      : 0;

    // Shot %
    const shotPct = team.fga > 0 && pg.minutes > 0
      ? (pg.fga / team.fga) / (pg.minutes / teamMinutes) / 5 * 100 : 0;

    // eFG%
    const efg = pg.fga > 0 ? ((pg.fgm + 0.5 * pg.tpm) / pg.fga) * 100 : 0;

    // TS% (0.475, matches BBRef/KenPom)
    const ts = (pg.fga + 0.475 * pg.fta) > 0
      ? (pg.points / (2 * (pg.fga + 0.475 * pg.fta))) * 100 : 0;

    // Rebound %
    const orPct = pg.minutes > 0 && (team.orb + opp_drb) > 0
      ? (pg.orb / pg.minutes) * (teamMinutes / 5) / (team.orb + opp_drb) * 100 : 0;
    const drPct = pg.minutes > 0 && (drb + team.opp_orb) > 0
      ? (pg.drb / pg.minutes) * (teamMinutes / 5) / (drb + team.opp_orb) * 100 : 0;

    // Assist Rate (BBRef)
    const aRateDenom = ((pg.minutes / (teamMinutes / 5)) * team.fgm) - pg.fgm;
    const aRate = aRateDenom > 0 ? (pg.ast / aRateDenom) * 100 : 0;

    // TO Rate (BBRef)
    const playerPossSimple = pg.fga + 0.44 * pg.fta + pg.tov;
    const toRate = playerPossSimple > 0 ? (pg.tov / playerPossSimple) * 100 : 0;

    // Block % / Steal %
    const oppPoss = Math.max(1, team.opp_fga - team.opp_orb + team.opp_tov + 0.475 * team.opp_fta);
    const opp2PA = team.opp_fga - team.opp_tpa;
    const blkPct = pg.minutes > 0 && opp2PA > 0
      ? 100 * (pg.blk * (teamMinutes / 5)) / (pg.minutes * opp2PA) : 0;
    const stlPct = pg.minutes > 0
      ? 100 * (pg.stl * (teamMinutes / 5)) / (pg.minutes * oppPoss) : 0;

    // FC/40
    const fc40 = pg.minutes > 0 ? pg.pf * (40 / pg.minutes) : 0;

    // FT Rate
    const ftRate = pg.fga > 0 ? (pg.fta / pg.fga) * 100 : 0;

    // Shooting %
    const ftPct = pg.fta > 0 ? (pg.ftm / pg.fta) * 100 : 0;
    const twoPct = twoPA > 0 ? (twoPM / twoPA) * 100 : 0;
    const threePct = pg.tpa > 0 ? (pg.tpm / pg.tpa) * 100 : 0;

    // Dean Oliver Individual ORtg
    let ortg = 0;
    if (pg.fga > 0 && pg.fta > 0 && pg.minutes > 0) {
      const qAST = ((pg.minutes / (teamMinutes / 5)) *
        (1.14 * ((team.ast - pg.ast) / team.fgm))) +
        ((((team.ast / teamMinutes) * pg.minutes * 5 - pg.ast) /
          ((team.fgm / teamMinutes) * pg.minutes * 5 - pg.fgm)) *
          (1 - pg.minutes / (teamMinutes / 5)));

      const FG_Part = pg.fgm * (1 - 0.5 * ((pg.points - pg.ftm) / (2 * pg.fga)) * qAST);
      const AST_Part = 0.5 *
        (((team.points - team.ftm) - (pg.points - pg.ftm)) / (2 * (team.fga - pg.fga))) * pg.ast;
      const FT_Part = (1 - Math.pow(1 - pg.ftm / pg.fta, 2)) * 0.4 * pg.fta;
      const ORB_Part_sc = pg.orb * Team_ORB_Weight * Team_Play_pct;

      const ScPoss = (FG_Part + AST_Part + FT_Part) *
        (1 - (team.orb / Team_Scoring_Poss) * Team_ORB_Weight * Team_Play_pct) + ORB_Part_sc;

      const FGxPoss = (pg.fga - pg.fgm) * (1 - 1.07 * Team_ORB_pct);
      const FTxPoss = Math.pow(1 - pg.ftm / pg.fta, 2) * 0.4 * pg.fta;
      const TotPoss = ScPoss + FGxPoss + FTxPoss + pg.tov;

      const PProd_FG_Part = 2 * (pg.fgm + 0.5 * pg.tpm) *
        (1 - 0.5 * ((pg.points - pg.ftm) / (2 * pg.fga)) * qAST);
      const PProd_AST_Part = 2 *
        ((team.fgm - pg.fgm + 0.5 * (team.tpm - pg.tpm)) / (team.fgm - pg.fgm)) *
        0.5 * (((team.points - team.ftm) - (pg.points - pg.ftm)) / (2 * (team.fga - pg.fga))) * pg.ast;
      const PProd_ORB_Part = pg.orb * Team_ORB_Weight * Team_Play_pct *
        (team.points / (team.fgm +
          (1 - Math.pow(1 - team.ftm / team.fta, 2)) * 0.4 * team.fta));

      const PProd = (PProd_FG_Part + PProd_AST_Part + pg.ftm) *
        (1 - (team.orb / Team_Scoring_Poss) * Team_ORB_Weight * Team_Play_pct) + PProd_ORB_Part;

      ortg = TotPoss > 0 ? 100 * PProd / TotPoss : 0;
    }

    return {
      minPct, ortg, usagePct, shotPct, efg, ts, orPct, drPct,
      aRate, toRate, blkPct, stlPct, fc40, ftRate, ftPct, twoPct, threePct,
      twoPM, twoPA, ftm: pg.ftm, fta: pg.fta, tpm: pg.tpm, tpa: pg.tpa,
    };
  };

  return (
    <div style={{ marginBottom: 32 }}>
      <div style={{ fontSize: 12, fontWeight: 800, textTransform: "uppercase", letterSpacing: 0.5, color: "#fff", background: ACCENT, padding: "6px 10px" }}>
        Player Stats
      </div>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 10, whiteSpace: "nowrap" }}>
          <thead>
            <tr style={{ borderBottom: `2px solid ${ACCENT}`, background: ACCENT_LIGHT }}>
              <th style={{ padding: "6px 4px", textAlign: "left", position: "sticky", left: 0, background: ACCENT_LIGHT, zIndex: 1 }}>Player</th>
              <th style={{ padding: "6px 4px", textAlign: "center" }}>Yr</th>
              <th style={{ padding: "6px 4px", textAlign: "right" }}>G</th>
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
              <th style={{ padding: "6px 4px", textAlign: "right" }}>FTRate</th>
              <th style={{ padding: "6px 4px", textAlign: "right" }}>FTM-A</th>
              <th style={{ padding: "6px 4px", textAlign: "right" }}>FT%</th>
              <th style={{ padding: "6px 4px", textAlign: "right" }}>2PM-A</th>
              <th style={{ padding: "6px 4px", textAlign: "right" }}>2P%</th>
              <th style={{ padding: "6px 4px", textAlign: "right" }}>3PM-A</th>
              <th style={{ padding: "6px 4px", textAlign: "right" }}>3P%</th>
            </tr>
          </thead>
          <tbody>
            {players.map((p: any) => {
              const stats = calcStats(p);
              return (
                <tr key={p.playerId} style={{ borderBottom: "1px solid #f0f0f0" }}>
                  <td style={{ padding: "6px 4px", fontWeight: 600, position: "sticky", left: 0, background: "#fff", zIndex: 1 }}>
                    {p.firstName} {p.lastName}
                  </td>
                  <td style={{ padding: "6px 4px", textAlign: "center" }}>{p.year || "—"}</td>
                  <td style={{ padding: "6px 4px", textAlign: "right" }}>{p.games}</td>
                  <td style={{ padding: "6px 4px", textAlign: "right" }}>{stats.minPct.toFixed(1)}</td>
                  <td style={{ padding: "6px 4px", textAlign: "right" }}>{stats.ortg > 0 ? stats.ortg.toFixed(1) : "—"}</td>
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
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 12px", background: ACCENT_LIGHT, border: `1px solid ${ACCENT_BORDER}`, borderRadius: 6, cursor: "pointer" }}>
        <input type="checkbox" checked={checked} readOnly style={{ marginRight: 4 }} />
        <span>{label}</span>
      </div>
    </Link>
  );
}

function SectionTitle({ title }: { title: string }) {
  return (
    <div style={{ fontSize: 12, fontWeight: 800, textTransform: "uppercase", letterSpacing: 0.5, color: "#fff", background: ACCENT, padding: "6px 10px", marginBottom: 0 }}>
      {title}
    </div>
  );
}

function StatsTable({ title, rows }: { title: string; rows: Array<{ label: string; off: number; def: number; offRank?: number; defRank?: number; offAvg?: number; defAvg?: number }> }) {
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
                {row.offAvg != null && row.defAvg != null ? ((row.offAvg + row.defAvg) / 2).toFixed(1) : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
