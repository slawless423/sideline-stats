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
  conf?: string;
  conference?: string;
  [k: string]: any;
};

function n(x: any): number | null {
  const v = Number(x);
  return Number.isFinite(v) ? v : null;
}

function rankOf(rows: Row[], value: number | null, key: keyof Row, higherIsBetter: boolean) {
  if (value === null) return null;

  const vals = rows
    .map((r) => n(r[key]))
    .filter((v): v is number => v !== null);

  if (!vals.length) return null;

  // rank 1 = best
  const sorted = [...vals].sort((a, b) => (higherIsBetter ? b - a : a - b));

  // handle ties: rank is first index of value + 1
  const idx = sorted.findIndex((v) => v === value);
  const rank = idx === -1 ? null : idx + 1;

  const pct = rank === null ? null : Math.round((rank / sorted.length) * 100); // lower is better here (top 1% etc)
  return { rank, of: sorted.length, percentile: pct };
}

function formatUpdated(x: string | null) {
  if (!x) return "—";
  // if it's ISO-like, keep; otherwise just show raw
  return x;
}

function dist(a: { em: number | null; o: number | null; d: number | null; t: number | null }, b: { em: number | null; o: number | null; d: number | null; t: number | null }) {
  // simple normalized distance (weights favor EM)
  const parts: number[] = [];

  const add = (x: number | null, y: number | null, w: number) => {
    if (x === null || y === null) return;
    parts.push(w * Math.abs(x - y));
  };

  add(a.em, b.em, 3.0);
  add(a.o, b.o, 1.0);
  add(a.d, b.d, 1.0);
  add(a.t, b.t, 0.5);

  if (!parts.length) return Infinity;
  return parts.reduce((s, v) => s + v, 0);
}

async function loadRatings(): Promise<{ updated: string | null; rows: Row[] }> {
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

const styles = {
  page: { padding: 24, fontFamily: "system-ui" as const, maxWidth: 1100, margin: "0 auto" },
  topRow: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, flexWrap: "wrap" as const },
  h1: { fontSize: 34, fontWeight: 850, marginTop: 10, marginBottom: 6, letterSpacing: -0.3 },
  sub: { opacity: 0.75, marginTop: 0, marginBottom: 0 },
  grid: { display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 12, marginTop: 16 },
  card: { border: "1px solid #eee", borderRadius: 14, padding: 14, background: "#fff" },
  label: { opacity: 0.7, fontSize: 12, marginBottom: 6 },
  value: { fontSize: 22, fontWeight: 750, lineHeight: 1.1 },
  meta: { opacity: 0.7, fontSize: 12, marginTop: 6 },
  sectionTitle: { fontSize: 14, fontWeight: 800, marginTop: 18, marginBottom: 10, letterSpacing: 0.2 },
  twoCol: { display: "grid", gridTemplateColumns: "1.2fr 0.8fr", gap: 12, marginTop: 10 },
  table: { width: "100%", borderCollapse: "collapse" as const, fontSize: 13 },
  th: { textAlign: "left" as const, opacity: 0.7, fontWeight: 700, padding: "8px 6px", borderBottom: "1px solid #eee" },
  td: { padding: "8px 6px", borderBottom: "1px solid #f2f2f2", verticalAlign: "top" as const },
  badge: { display: "inline-block", border: "1px solid #eee", borderRadius: 999, padding: "4px 10px", fontSize: 12, opacity: 0.9 },
  smallLink: { fontSize: 13, textDecoration: "underline", textUnderlineOffset: 2 },
};

function MetricCard({
  title,
  value,
  rankObj,
  suffix,
}: {
  title: string;
  value: number | null;
  rankObj: { rank: number; of: number; percentile: number } | null;
  suffix?: string;
}) {
  return (
    <div style={styles.card}>
      <div style={styles.label}>{title}</div>
      <div style={styles.value}>
        {value === null ? "—" : `${value.toFixed(1)}${suffix ?? ""}`}
      </div>
      <div style={styles.meta}>
        {rankObj ? (
          <>
            Rank <b>#{rankObj.rank}</b> of {rankObj.of} • Top{" "}
            <b>{rankObj.percentile}%</b>
          </>
        ) : (
          "—"
        )}
      </div>
    </div>
  );
}

export default async function TeamPage({ params }: { params: { teamId: string } }) {
  const { teamId } = params;
  const data = await loadRatings();
  const row = data.rows.find((r) => String(r.teamId) === String(teamId));

  if (!row) {
    return (
      <main style={styles.page}>
        <Link href="/">← Back</Link>
        <h1 style={{ fontSize: 28, fontWeight: 800, marginTop: 12 }}>Team not found</h1>
        <p style={{ opacity: 0.8 }}>TeamId: {teamId}</p>
      </main>
    );
  }

  const adjO = n(row.adjO);
  const adjD = n(row.adjD);
  const adjEM = n(row.adjEM);
  const adjT = n(row.adjT);
  const games = Number.isFinite(Number(row.games)) ? Number(row.games) : null;

  const conf = (row.conf ?? row.conference ?? "—") as string;

  // Ranks computed from the same dataset (no new files needed)
  const emRank = rankOf(data.rows, adjEM, "adjEM", true);
  const oRank = rankOf(data.rows, adjO, "adjO", true);
  const dRank = rankOf(data.rows, adjD, "adjD", false); // lower AdjD is better
  const tRank = rankOf(data.rows, adjT, "adjT", true);

  // Similar teams (simple distance on EM/O/D/T)
  const me = { em: adjEM, o: adjO, d: adjD, t: adjT };
  const similar = data.rows
    .filter((r) => String(r.teamId) !== String(row.teamId))
    .map((r) => {
      const other = { em: n(r.adjEM), o: n(r.adjO), d: n(r.adjD), t: n(r.adjT) };
      return { r, score: dist(me, other) };
    })
    .filter((x) => Number.isFinite(x.score))
    .sort((a, b) => a.score - b.score)
    .slice(0, 6);

  return (
    <main style={styles.page}>
      <div style={styles.topRow}>
        <div>
          <Link href="/">← Back to ratings</Link>
          <h1 style={styles.h1}>{row.team}</h1>
          <p style={styles.sub}>
            <span style={styles.badge}>TeamId: {row.teamId}</span>{" "}
            <span style={{ marginLeft: 8 }} />
            <span style={styles.badge}>Conference: {conf}</span>{" "}
            <span style={{ marginLeft: 8 }} />
            <span style={styles.badge}>Updated: {formatUpdated(data.updated)}</span>
          </p>
        </div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          {emRank?.rank ? <span style={styles.badge}>Overall rank: #{emRank.rank}</span> : null}
          {games !== null ? <span style={styles.badge}>Games: {games}</span> : null}
        </div>
      </div>

      {/* Strength profile */}
      <div style={styles.grid}>
        <MetricCard title="AdjO" value={adjO} rankObj={oRank} />
        <MetricCard title="AdjD" value={adjD} rankObj={dRank} />
        <MetricCard title="AdjEM" value={adjEM} rankObj={emRank} />
        <MetricCard title="Tempo" value={adjT} rankObj={tRank} />
      </div>

      <div style={styles.twoCol}>
        {/* Notes / Identity */}
        <div style={styles.card}>
          <div style={{ fontWeight: 800, marginBottom: 6 }}>Team identity (auto)</div>
          <div style={{ opacity: 0.85, fontSize: 14, lineHeight: 1.5 }}>
            {adjEM === null ? (
              <>Add AdjEM to enable identity text.</>
            ) : (
              <>
                <b>{row.team}</b> profiles as{" "}
                <b>{adjEM >= 15 ? "elite" : adjEM >= 8 ? "strong" : adjEM >= 2 ? "solid" : "developing"}</b>{" "}
                overall.
                {adjO !== null && adjD !== null ? (
                  <>
                    {" "}
                    Strength leans{" "}
                    <b>
                      {adjO - (adjD ? 100 - (adjD - 100) : 0) >= 0 ? "offense" : "defense"}
                    </b>{" "}
                    (AdjO {adjO.toFixed(1)} / AdjD {adjD.toFixed(1)}).
                  </>
                ) : null}
                {adjT !== null ? <> Tempo is {adjT.toFixed(1)}.</> : null}
              </>
            )}
          </div>

          <div style={{ marginTop: 12, fontSize: 13, opacity: 0.8 }}>
            Next easy win: add “last 5 games” splits once you generate a per-team game log.
          </div>
        </div>

        {/* Similar teams */}
        <div style={styles.card}>
          <div style={{ fontWeight: 800, marginBottom: 8 }}>Similar teams</div>
          {similar.length === 0 ? (
            <div style={{ opacity: 0.8, fontSize: 14 }}>
              Not enough data to compute similarity.
            </div>
          ) : (
            <div style={{ display: "grid", gap: 8 }}>
              {similar.map(({ r }, i) => (
                <div key={String(r.teamId)} style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                  <div>
                    <Link style={styles.smallLink} href={`/teams/${r.teamId}`}>
                      {i + 1}. {r.team}
                    </Link>
                    <div style={{ fontSize: 12, opacity: 0.7 }}>
                      AdjEM {n(r.adjEM)?.toFixed(1) ?? "—"} • AdjO {n(r.adjO)?.toFixed(1) ?? "—"} • AdjD{" "}
                      {n(r.adjD)?.toFixed(1) ?? "—"}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Roadmap card (kept from your original, but made more concrete) */}
      <div style={{ marginTop: 12, padding: 14, border: "1px solid #eee", borderRadius: 14 }}>
        <div style={{ fontWeight: 800, marginBottom: 6 }}>Next upgrades</div>
        <ul style={{ margin: 0, paddingLeft: 18, opacity: 0.9, lineHeight: 1.6 }}>
          <li>
            Add a <b>game log</b> per team (date, opponentId, score, location). Then we can compute:
            last-5 trend, home/away splits, upset index.
          </li>
          <li>
            Add <b>rank fields</b> (oRank, dRank, emRank, tRank) to your nightly build so ranks don’t need to be
            computed on page load.
          </li>
          <li>
            Add <b>four factors</b> once you have possession/shot data (even approximations are fine).
          </li>
        </ul>
      </div>
    </main>
  );
}
