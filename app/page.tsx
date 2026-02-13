import { headers } from "next/headers";

type Row = {
  team: string;
  teamId: string;
  adjO: number;
  adjD: number;
  adjEM: number;
};

async function getRatings() {
  const h = await headers();
  const host = h.get("host");
  const proto = h.get("x-forwarded-proto") ?? "https";
  const res = await fetch(`${proto}://${host}/api/ratings`, { cache: "no-store" });
  return res.json();
}

export default async function Home() {
  const data = await getRatings();

  return (
    <main style={{ padding: 24, fontFamily: "system-ui" }}>
      <h1 style={{ fontSize: 28, fontWeight: 700 }}>Women’s KenPom (Beta)</h1>
      <p style={{ opacity: 0.8 }}>Date: {data.date}</p>

      <table style={{ borderCollapse: "collapse", width: "100%", marginTop: 12 }}>
        <thead>
          <tr>
            {["Rk", "Team", "AdjO", "AdjD", "AdjEM"].map((h) => (
              <th key={h} style={{ textAlign: "left", padding: 10, borderBottom: "1px solid #ddd" }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {(data.rows as Row[]).map((r, i) => (
            <tr key={r.teamId}>
              <td style={{ padding: 10, borderBottom: "1px solid #f0f0f0" }}>{i + 1}</td>
              <td style={{ padding: 10, borderBottom: "1px solid #f0f0f0" }}>{r.team}</td>
              <td style={{ padding: 10, borderBottom: "1px solid #f0f0f0" }}>{r.adjO.toFixed(1)}</td>
              <td style={{ padding: 10, borderBottom: "1px solid #f0f0f0" }}>{r.adjD.toFixed(1)}</td>
              <td style={{ padding: 10, borderBottom: "1px solid #f0f0f0" }}>{r.adjEM.toFixed(1)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}
