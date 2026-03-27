'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import SiteNavigation from '@/components/SiteNavigation';

const ACCENT = "#3B9EFF";
const NAVY   = "#0D1F3C";
const SKY    = "#2E7DD1";
const ICE    = "#A8C8F0";
const FROST  = "#E8F2FC";
const MUTED  = "#6B7E9A";

type HSPlayer = {
  id: number;
  full_name: string;
  team: string;
  league: string;
  season: string;
  grad_year: number | null;
  height: string | null;
  gp: number; mp: number; pts: number;
  fgm: number; fga: number;
  fg3m: number; fg3a: number;
  ftm: number; fta: number;
  oreb: number; dreb: number; reb: number;
  ast: number; stl: number; blk: number; tov: number;
};

type HSTeamStats = {
  team: string; league: string; season: string; gp: number;
  fgm: number; fga: number; fg3m: number; fg3a: number;
  ftm: number; fta: number; oreb: number; dreb: number; reb: number;
  ast: number; stl: number; blk: number; tov: number; pts: number;
};

function StatBox({ label, value }: { label: string; value: string | number }) {
  return (
    <div style={{ textAlign: 'center', padding: '12px 16px', background: FROST, borderRadius: 8 }}>
      <div style={{ fontSize: 20, fontWeight: 700, color: NAVY, fontFamily: "'Outfit', sans-serif" }}>{value}</div>
      <div style={{ fontSize: 11, color: MUTED, fontFamily: "'Outfit', sans-serif", marginTop: 2 }}>{label}</div>
    </div>
  );
}

export default function HSPlayerProfile() {
  const params = useParams();
  const playerId = params?.id;

  const [player, setPlayer] = useState<HSPlayer | null>(null);
  const [team, setTeam] = useState<HSTeamStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!playerId) return;
    fetch('/api/recruiting/mens/highschool')
      .then(r => r.json())
      .then(({ players, teams }) => {
        const p = players.find((p: HSPlayer) => String(p.id) === String(playerId));
        if (p) {
          setPlayer(p);
          const t = teams.find((t: HSTeamStats) => t.team === p.team && t.season === p.season);
          setTeam(t ?? null);
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [playerId]);

  if (loading) return (
    <>
      <SiteNavigation currentDivision="mens-d1" currentPage="recruiting" divisionPath="/mens-d1" />
      <main style={{ padding: 40, textAlign: 'center', color: MUTED }}>Loading...</main>
    </>
  );

  if (!player) return (
    <>
      <SiteNavigation currentDivision="mens-d1" currentPage="recruiting" divisionPath="/mens-d1" />
      <main style={{ padding: 40, textAlign: 'center', color: MUTED }}>Player not found.</main>
    </>
  );

  const g = player.gp || 1;
  const m = player.mp || 1;
  const fgPct = player.fga > 0 ? ((player.fgm / player.fga) * 100).toFixed(1) : '—';
  const fg3Pct = player.fg3a > 0 ? ((player.fg3m / player.fg3a) * 100).toFixed(1) : '—';
  const ftPct = player.fta > 0 ? ((player.ftm / player.fta) * 100).toFixed(1) : '—';
  const efg = player.fga > 0 ? (((player.fgm + 0.5 * player.fg3m) / player.fga) * 100).toFixed(1) : '—';
  const ts = (player.fga + 0.475 * player.fta) > 0
    ? ((player.pts / (2 * (player.fga + 0.475 * player.fta))) * 100).toFixed(1) : '—';

  // Usage
  let usagePct = '—';
  if (team && player.mp > 0) {
    const teamMinutes = team.gp * 200;
    const teamPoss = team.fga + 0.44 * team.fta + team.tov;
    const u = 100 * (player.fga + 0.44 * player.fta + player.tov) / (teamPoss / teamMinutes * player.mp) / 5;
    usagePct = u.toFixed(1);
  }

  return (
    <>
      <SiteNavigation currentDivision="mens-d1" currentPage="recruiting" divisionPath="/mens-d1" />
      <main style={{ maxWidth: 900, margin: '0 auto', padding: 24 }}>

        {/* Back link */}
        <Link href="/mens-d1/recruiting" style={{ fontSize: 12, color: MUTED, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 4, marginBottom: 20 }}>
          ← Back to Recruiting
        </Link>

        {/* Header */}
        <div style={{ marginBottom: 28 }}>
          <h1 style={{ fontSize: 28, fontWeight: 800, color: NAVY, fontFamily: "'Outfit', sans-serif", margin: 0 }}>
            {player.full_name}
          </h1>
          <div style={{ display: 'flex', gap: 12, marginTop: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={{ fontSize: 14, color: MUTED, fontFamily: "'Outfit', sans-serif" }}>{player.team}</span>
            <span style={{ width: 4, height: 4, borderRadius: '50%', background: ICE, display: 'inline-block' }} />
            <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 700, background: FROST, color: NAVY, fontFamily: "'Outfit', sans-serif" }}>{player.league}</span>
            <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 700, background: FROST, color: NAVY, fontFamily: "'Outfit', sans-serif" }}>{player.season}</span>
            {player.grad_year && <span style={{ fontSize: 13, color: MUTED, fontFamily: "'Outfit', sans-serif" }}>Class of {player.grad_year}</span>}
            {player.height && <span style={{ fontSize: 13, color: MUTED, fontFamily: "'Outfit', sans-serif" }}>{player.height}</span>}
          </div>
        </div>

        {/* Key stats */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))', gap: 10, marginBottom: 28 }}>
          <StatBox label="PPG" value={(player.pts / g).toFixed(1)} />
          <StatBox label="RPG" value={(player.reb / g).toFixed(1)} />
          <StatBox label="APG" value={(player.ast / g).toFixed(1)} />
          <StatBox label="SPG" value={(player.stl / g).toFixed(1)} />
          <StatBox label="BPG" value={(player.blk / g).toFixed(1)} />
          <StatBox label="MPG" value={(player.mp / g).toFixed(1)} />
          <StatBox label="GP" value={player.gp} />
        </div>

        {/* Shooting */}
        <h2 style={{ fontSize: 14, fontWeight: 700, color: NAVY, fontFamily: "'Outfit', sans-serif", borderBottom: `2px solid ${FROST}`, paddingBottom: 8, marginBottom: 16 }}>Shooting</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))', gap: 10, marginBottom: 28 }}>
          <StatBox label="FG%" value={fgPct} />
          <StatBox label="3P%" value={fg3Pct} />
          <StatBox label="FT%" value={ftPct} />
          <StatBox label="eFG%" value={efg} />
          <StatBox label="TS%" value={ts} />
          <StatBox label="FTRate" value={player.fga > 0 ? ((player.fta / player.fga) * 100).toFixed(1) : '—'} />
        </div>

        {/* Advanced */}
        <h2 style={{ fontSize: 14, fontWeight: 700, color: NAVY, fontFamily: "'Outfit', sans-serif", borderBottom: `2px solid ${FROST}`, paddingBottom: 8, marginBottom: 16 }}>Advanced</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))', gap: 10, marginBottom: 28 }}>
          <StatBox label="%Usg" value={usagePct} />
          <StatBox label="OR%" value={player.oreb > 0 && player.mp > 0 ? ((player.oreb / player.mp) * (team ? team.gp * 200 / 5 : 1) / Math.max(1, (team?.oreb ?? 1) + (team?.dreb ?? 0))).toFixed(1) + '%' : '—'} />
          <StatBox label="TOV/G" value={(player.tov / g).toFixed(1)} />
        </div>

        {/* Season totals table */}
        <h2 style={{ fontSize: 14, fontWeight: 700, color: NAVY, fontFamily: "'Outfit', sans-serif", borderBottom: `2px solid ${FROST}`, paddingBottom: 8, marginBottom: 16 }}>Season Totals</h2>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, fontFamily: "'Outfit', sans-serif" }}>
            <thead>
              <tr style={{ background: FROST, borderBottom: `2px solid ${ACCENT}` }}>
                {['G','MP','PTS','FGM','FGA','3PM','3PA','FTM','FTA','OREB','DREB','REB','AST','STL','BLK','TOV'].map(h => (
                  <th key={h} style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 700, fontSize: 10, color: NAVY }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr style={{ background: '#fff' }}>
                {[player.gp,player.mp,player.pts,player.fgm,player.fga,player.fg3m,player.fg3a,player.ftm,player.fta,player.oreb,player.dreb,player.reb,player.ast,player.stl,player.blk,player.tov].map((v, i) => (
                  <td key={i} style={{ padding: '8px 10px', textAlign: 'right' }}>{v}</td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>

      </main>
    </>
  );
}
