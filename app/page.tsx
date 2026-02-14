import Link from "next/link";
import { headers } from "next/headers";

type Row = {
  team: string;
  teamId: string;
  games?: number;
  adjO?: number;
  adjD?: number;
  adjEM?: number;
  adjT?: number;
  [k: string]: any;
};

function num(x: any): number | null {
  const n = Number(x);
  return Number.isFinite(n) ? n : null;
}

async function getRatings(): Promise<{ updated: string | null; rows: Row[] }> {
  const h = await headers();
  const host = h.get("host");
  const proto = h.get("x-forwarded-proto") ?? "https";
  const url = `${proto}://${host}/data/ratings.json`;

  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`Failed to load ratings.json (${res.status})`);
  const payload = await res.json();

  const rows: Row[] =
    payload?.rows ??
    payload?.data?.rows ??
    payload?.ratings?.rows ??
    payload?.result?.rows ??
    [];

  const updated =
    payload?.generated_at_utc ??
    payload?.generated_at ??
    payload?.updated_at ??
    payload?.last_updated ??
    null;

  return { updated, rows };
}

export default async function Home() {
  const data = await getRatings();
  const rows = (data.rows ?? []).filter((r) => r?.team);

  return (
    <main style={{ padding: 24, fontFamily: "system-ui" }}>
      <h1 style={{ fontSize: 28, fontWeight: 700 }}>Women’s KenPom (Season-to-date)</h1>
      <p style={{ opacity: 0.8 }}>Updated: {data.updated ? String(data.updated) : "—"}</p>

      <table style={{ borderCollapse: "collapse", width: "100%", marginTop: 12 }}>
        <thead>
          <tr>
            {["Rk", "Team", "G", "AdjO", "AdjD", "AdjEM", "AdjT"].map((col) => (
              <th
                key={col}
                style={{ textAlign: "left", padding: 10, borderBottom: "1px solid #ddd" }}
              >
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => {
            const adjO = num(r.adjO);
            const adjD = num(r.adjD);
            const adjEM = num(r.adjEM);
            const adjT = num(r.adjT);

            return (
              <tr key={r.teamId ?? `${r.team}-${i}`}>
                <td style={{ padding: 10, borderBottom: "1px solid #f0f0f0" }}>{i + 1}</td>
                <td style={{ padding: 10, borderBottom: "1px solid #f0f0f0" }}>
                  <Link href={`/team/${r.teamId}`} style={{ color: "inherit", textDecoration: "none" }}>
                    {r.team}
                  </Link>
                </td>
                <td style={{ padding: 10, borderBottom: "1px solid #f0f0f0" }}>{r.games ?? "—"}</td>
                <td style={{ padding: 10, borderBottom: "1px solid #f0f0f0" }}>
                  {adjO === null ? "—" : adjO.toFixed(1)}
                </td>
                <td style={{ padding: 10, borderBottom: "1px solid #f0f0f0" }}>
                  {adjD === null ? "—" : adjD.toFixed(1)}
                </td>
                <td style={{ padding: 10, borderBottom: "1px solid #f0f0f0" }}>
                  {adjEM === null ? "—" : adjEM.toFixed(1)}
                </td>
                <td style={{ padding: 10, borderBottom: "1px solid #f0f0f0" }}>
                  {adjT === null ? "—" : adjT.toFixed(1)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </main>
  );
}
