import Link from "next/link";
import { headers } from 'next/headers';

async function fetchTeams() {
  const headersList = await headers();
  const host = headersList.get('host');
  const protocol = process.env.NODE_ENV === 'development' ? 'http' : 'https';
  
  const res = await fetch(`${protocol}://${host}/api/teams`, {
    cache: 'no-store'
  });
  
  if (!res.ok) {
    throw new Error('Failed to fetch teams');
  }
  
  return res.json();
}

export default async function HomePage() {
  const { rows, updated } = await fetchTeams();

  const updatedDate = updated
    ? new Date(updated).toLocaleDateString("en-US", {
        month: "long",
        day: "numeric",
        year: "numeric",
      })
    : null;

  return (
    <main style={{ maxWidth: 1200, margin: "0 auto", padding: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <h1 style={{ fontSize: 32, fontWeight: 800, marginBottom: 0 }}>
          Sideline Stats - Beta
        </h1>
        <Link 
          href="/players" 
          style={{ 
            padding: "10px 20px", 
            background: "#4f46e5", 
            color: "#fff", 
            textDecoration: "none", 
            borderRadius: 6,
            fontWeight: 600,
            fontSize: 14,
          }}
        >
          Player Database
        </Link>
      </div>
      {updatedDate && (
        <p style={{ color: "#666", marginBottom: 24 }}>
          Data through {updatedDate}
        </p>
      )}

      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
          <thead>
            <tr style={{ background: "#2d3748", color: "#fff" }}>
              <th style={{ padding: "10px 12px", textAlign: "left" }}>Rank</th>
              <th style={{ padding: "10px 12px", textAlign: "left" }}>Team</th>
              <th style={{ padding: "10px 12px", textAlign: "left" }}>Conference</th>
              <th style={{ padding: "10px 12px", textAlign: "right" }}>Record</th>
              <th style={{ padding: "10px 12px", textAlign: "right" }}>EM</th>
              <th style={{ padding: "10px 12px", textAlign: "right" }}>O</th>
              <th style={{ padding: "10px 12px", textAlign: "right" }}>D</th>
              <th style={{ padding: "10px 12px", textAlign: "right" }}>T</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row: any, idx: number) => (
              <tr
                key={row.teamId}
                style={{
                  borderBottom: "1px solid #e5e7eb",
                  background: idx % 2 === 0 ? "#fff" : "#f9fafb",
                }}
              >
                <td style={{ padding: "10px 12px" }}>{idx + 1}</td>
                <td style={{ padding: "10px 12px" }}>
                  <Link
                    href={`/team/${row.teamId}`}
                    style={{ color: "#2563eb", textDecoration: "none", fontWeight: 600 }}
                  >
                    {row.team}
                  </Link>
                </td>
                <td style={{ padding: "10px 12px", textTransform: "uppercase", fontSize: 12, color: "#666" }}>
                  {row.conference || "—"}
                </td>
                <td style={{ padding: "10px 12px", textAlign: "right" }}>
                  {row.wins != null && row.losses != null ? `${row.wins}-${row.losses}` : "—"}
                </td>
                <td style={{ padding: "10px 12px", textAlign: "right", fontWeight: 600 }}>
                  {row.rawEM != null ? row.rawEM.toFixed(1) : "—"}
                </td>
                <td style={{ padding: "10px 12px", textAlign: "right" }}>
                  {row.rawO != null ? row.rawO.toFixed(1) : "—"}
                </td>
                <td style={{ padding: "10px 12px", textAlign: "right" }}>
                  {row.rawD != null ? row.rawD.toFixed(1) : "—"}
                </td>
                <td style={{ padding: "10px 12px", textAlign: "right" }}>
                  {row.rawT != null ? row.rawT.toFixed(1) : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
