import Link from "next/link";
import { headers } from 'next/headers';

// Fetch functions using API routes
async function fetchAllTeams() {
  const headersList = await headers();
  const host = headersList.get('host');
  const protocol = process.env.NODE_ENV === 'development' ? 'http' : 'https';
  
  const res = await fetch(`${protocol}://${host}/api/teams`, { cache: 'no-store' });
  if (!res.ok) throw new Error('Failed to fetch teams');
  return res.json();
}

async function fetchTeam(teamId: string) {
  const headersList = await headers();
  const host = headersList.get('host');
  const protocol = process.env.NODE_ENV === 'development' ? 'http' : 'https';
  
  const res = await fetch(`${protocol}://${host}/api/teams/${teamId}`, { cache: 'no-store' });
  if (!res.ok) return null;
  return res.json();
}

async function fetchTeamGames(teamId: string) {
  const headersList = await headers();
  const host = headersList.get('host');
  const protocol = process.env.NODE_ENV === 'development' ? 'http' : 'https';
  
  const res = await fetch(`${protocol}://${host}/api/teams/${teamId}/games`, { cache: 'no-store' });
  if (!res.ok) return { games: [] };
  return res.json();
}

async function fetchTeamPlayers(teamId: string) {
  const headersList = await headers();
  const host = headersList.get('host');
  const protocol = process.env.NODE_ENV === 'development' ? 'http' : 'https';
  
  const res = await fetch(`${protocol}://${host}/api/teams/${teamId}/players`, { cache: 'no-store' });
  if (!res.ok) return { players: [] };
  return res.json();
}

export default async function TeamPage({
  params,
}: {
  params: Promise<{ teamid: string }>;
}) {
  const { teamid: teamId } = await params;
  
  const [teamsData, team, gamesData, playersData] = await Promise.all([
    fetchAllTeams(),
    fetchTeam(teamId),
    fetchTeamGames(teamId),
    fetchTeamPlayers(teamId),
  ]);

  if (!team) {
    return (
      <main style={{ maxWidth: 1200, margin: "0 auto", padding: 20 }}>
        <Link href="/" style={{ color: "#2563eb", textDecoration: "none" }}>← Back to rankings</Link>
        <h1 style={{ fontSize: 28, fontWeight: 800, marginTop: 12 }}>Team not found</h1>
      </main>
    );
  }

  const rank = teamsData.rows.findIndex((r: any) => r.teamId === teamId) + 1;

  return (
    <main style={{ maxWidth: 1200, margin: "0 auto", padding: 20 }}>
      <Link href="/" style={{ color: "#2563eb", textDecoration: "none", marginBottom: 16, display: "inline-block" }}>
        ← Back to rankings
      </Link>

      {/* HEADER */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 32, fontWeight: 800, marginBottom: 8 }}>
          {team.teamName}
        </h1>
        <div style={{ color: "#666", fontSize: 14 }}>
          {team.conference?.toUpperCase()} • #{rank} of {teamsData.rows.length} teams
        </div>
        <div style={{ marginTop: 12, fontSize: 14 }}>
          <span style={{ background: "#e5e7eb", padding: "4px 12px", borderRadius: 4, marginRight: 8 }}>
            {team.wins}-{team.losses}
          </span>
        </div>
      </div>

      {/* STATS CARDS */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 16, marginBottom: 32 }}>
        <div style={{ background: "#f9fafb", padding: 20, borderRadius: 8, border: "1px solid #e5e7eb" }}>
          <div style={{ fontSize: 12, color: "#666", marginBottom: 4, textTransform: "uppercase" }}>Off. Efficiency</div>
          <div style={{ fontSize: 32, fontWeight: 800 }}>{team.adjO?.toFixed(1) || "—"}</div>
        </div>
        <div style={{ background: "#f9fafb", padding: 20, borderRadius: 8, border: "1px solid #e5e7eb" }}>
          <div style={{ fontSize: 12, color: "#666", marginBottom: 4, textTransform: "uppercase" }}>Def. Efficiency</div>
          <div style={{ fontSize: 32, fontWeight: 800 }}>{team.adjD?.toFixed(1) || "—"}</div>
        </div>
        <div style={{ background: "#f9fafb", padding: 20, borderRadius: 8, border: "1px solid #e5e7eb" }}>
          <div style={{ fontSize: 12, color: "#666", marginBottom: 4, textTransform: "uppercase" }}>Raw Margin</div>
          <div style={{ fontSize: 32, fontWeight: 800 }}>+{team.adjEM?.toFixed(1) || "—"}</div>
        </div>
        <div style={{ background: "#f9fafb", padding: 20, borderRadius: 8, border: "1px solid #e5e7eb" }}>
          <div style={{ fontSize: 12, color: "#666", marginBottom: 4, textTransform: "uppercase" }}>Tempo</div>
          <div style={{ fontSize: 32, fontWeight: 800 }}>{team.adjT?.toFixed(1) || "—"}</div>
        </div>
      </div>

      {/* GAME LOG */}
      <div style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 16, background: "#2d3748", color: "#fff", padding: "8px 12px" }}>
          Game Log
        </h2>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
            <thead>
              <tr style={{ borderBottom: "2px solid #2d3748" }}>
                <th style={{ padding: "8px 12px", textAlign: "left" }}>Date</th>
                <th style={{ padding: "8px 12px", textAlign: "left" }}>Opponent</th>
                <th style={{ padding: "8px 12px", textAlign: "center" }}>Location</th>
                <th style={{ padding: "8px 12px", textAlign: "center" }}>Result</th>
                <th style={{ padding: "8px 12px", textAlign: "right" }}>Score</th>
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
                  <tr key={game.gameId} style={{ borderBottom: "1px solid #e5e7eb" }}>
                    <td style={{ padding: "8px 12px" }}>
                      {new Date(game.date).toLocaleDateString('en-US', { month: 'numeric', day: 'numeric' })}
                    </td>
                    <td style={{ padding: "8px 12px" }}>{opponent}</td>
                    <td style={{ padding: "8px 12px", textAlign: "center" }}>
                      {isHome ? "vs" : "@"}
                    </td>
                    <td style={{ padding: "8px 12px", textAlign: "center", fontWeight: 600, color: won ? "#16a34a" : "#dc2626" }}>
                      {won ? "W" : "L"}
                    </td>
                    <td style={{ padding: "8px 12px", textAlign: "right" }}>
                      {ourScore}-{theirScore}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* PLAYER STATS */}
      {playersData.players.length > 0 && (
        <div>
          <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 16, background: "#2d3748", color: "#fff", padding: "8px 12px" }}>
            Player Stats
          </h2>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
              <thead>
                <tr style={{ borderBottom: "2px solid #2d3748" }}>
                  <th style={{ padding: "8px 12px", textAlign: "left" }}>Player</th>
                  <th style={{ padding: "8px 12px", textAlign: "right" }}>G</th>
                  <th style={{ padding: "8px 12px", textAlign: "right" }}>Min</th>
                  <th style={{ padding: "8px 12px", textAlign: "right" }}>Pts</th>
                  <th style={{ padding: "8px 12px", textAlign: "right" }}>FG%</th>
                  <th style={{ padding: "8px 12px", textAlign: "right" }}>3P%</th>
                  <th style={{ padding: "8px 12px", textAlign: "right" }}>Reb</th>
                  <th style={{ padding: "8px 12px", textAlign: "right" }}>Ast</th>
                </tr>
              </thead>
              <tbody>
                {playersData.players.map((p: any) => {
                  const fgPct = p.fga > 0 ? ((p.fgm / p.fga) * 100).toFixed(1) : "—";
                  const tpPct = p.tpa > 0 ? ((p.tpm / p.tpa) * 100).toFixed(1) : "—";
                  
                  return (
                    <tr key={p.playerId} style={{ borderBottom: "1px solid #e5e7eb" }}>
                      <td style={{ padding: "8px 12px", fontWeight: 600 }}>
                        {p.firstName} {p.lastName}
                      </td>
                      <td style={{ padding: "8px 12px", textAlign: "right" }}>{p.games}</td>
                      <td style={{ padding: "8px 12px", textAlign: "right" }}>{p.minutes.toFixed(1)}</td>
                      <td style={{ padding: "8px 12px", textAlign: "right" }}>{p.points}</td>
                      <td style={{ padding: "8px 12px", textAlign: "right" }}>{fgPct}</td>
                      <td style={{ padding: "8px 12px", textAlign: "right" }}>{tpPct}</td>
                      <td style={{ padding: "8px 12px", textAlign: "right" }}>{p.trb}</td>
                      <td style={{ padding: "8px 12px", textAlign: "right" }}>{p.ast}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </main>
  );
}
