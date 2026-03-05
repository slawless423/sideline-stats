'use client';

import { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import SiteNavigation from '@/components/SiteNavigation';

const ACCENT  = "#3B9EFF";
const NAVY    = "#0D1F3C";
const SKY     = "#2E7DD1";
const ICE     = "#A8C8F0";
const FROST   = "#E8F2FC";
const MUTED   = "#6B7E9A";

// ── Types ─────────────────────────────────────────────────────

type StatMode = 'advanced' | 'perGame' | 'per40';

type TransferPlayer = {
  playerId: string;
  firstName: string;
  lastName: string;
  teamId: string;
  teamName: string;
  division: 'womens-d1' | 'womens-d2';
  conference: string;
  year: string;
  height: number | null;
  position: string;
  games: number;
  starts: number;
  minutes: number;
  fgm: number; fga: number;
  tpm: number; tpa: number;
  ftm: number; fta: number;
  orb: number; drb: number; trb: number;
  ast: number; stl: number; blk: number;
  tov: number; pf: number; points: number;
};

type TeamStats = {
  games: number;
  fga: number; fgm: number; tpm: number;
  orb: number; tov: number; fta: number; ftm: number;
  ast: number; points: number;
  opp_fga: number; opp_tpa: number; opp_tpm: number;
  opp_orb: number; opp_tov: number; opp_fta: number; opp_ftm: number;
  opp_points: number;
  trb: number; opp_trb: number;
};

type SortKey =
  | 'name' | 'team' | 'division' | 'games'
  | 'ortg' | 'usagePct' | 'efg' | 'ts' | 'orbPct' | 'drbPct'
  | 'aRate' | 'toRate' | 'blkPct' | 'stlPct' | 'ftRate'
  | 'ppg' | 'rpg' | 'apg' | 'spg' | 'bpg'
  | 'fgPct' | 'tpPct' | 'ftPct' | 'mpg'
  | 'p40' | 'r40' | 'a40' | 's40' | 'b40' | 'min40';

// ── Helpers ───────────────────────────────────────────────────

function formatHeight(inches: number | null | undefined): string {
  if (!inches || inches === 0) return "—";
  const feet = Math.floor(inches / 12);
  const rem  = inches % 12;
  return `${feet}'${rem}"`;
}

function divLabel(div: string) {
  return div === 'womens-d1' ? 'D1' : 'D2';
}

// ── Stat Calculator ───────────────────────────────────────────

function calcStats(p: TransferPlayer, team: TeamStats | undefined) {
  if (!team) return null;

  const teamMinutes = team.games * 200;
  const opp_drb     = team.opp_trb - team.opp_orb;
  const drb         = team.trb - team.orb;

  const Team_ORB_pct      = team.orb / (team.orb + opp_drb);
  const Team_Scoring_Poss = team.fgm + (1 - Math.pow(1 - team.ftm / team.fta, 2)) * team.fta * 0.4;
  const Team_Play_pct     = Team_Scoring_Poss / (team.fga + team.fta * 0.4 + team.tov);
  const Team_ORB_Weight   =
    ((1 - Team_ORB_pct) * Team_Play_pct) /
    ((1 - Team_ORB_pct) * Team_Play_pct + Team_ORB_pct * (1 - Team_Play_pct));

  const teamPossTotal = team.fga + 0.44 * team.fta + team.tov;
  const usagePct = 100 * (p.fga + 0.44 * p.fta + p.tov) /
    (teamPossTotal / teamMinutes * p.minutes) / 5;
  const efg    = p.fga > 0 ? ((p.fgm + 0.5 * p.tpm) / p.fga) * 100 : 0;
  const ts     = (p.fga + 0.475 * p.fta) > 0 ? (p.points / (2 * (p.fga + 0.475 * p.fta))) * 100 : 0;
  const orbPct = p.minutes > 0 && (team.orb + opp_drb) > 0
    ? (p.orb / p.minutes) * (teamMinutes / 5) / (team.orb + opp_drb) * 100 : 0;
  const drbPct = p.minutes > 0 && (drb + team.opp_orb) > 0
    ? (p.drb / p.minutes) * (teamMinutes / 5) / (drb + team.opp_orb) * 100 : 0;
  const aRateDenom = ((p.minutes / (teamMinutes / 5)) * team.fgm) - p.fgm;
  const aRate  = aRateDenom > 0 ? (p.ast / aRateDenom) * 100 : 0;
  const playerPoss = p.fga + 0.44 * p.fta + p.tov;
  const toRate = playerPoss > 0 ? (p.tov / playerPoss) * 100 : 0;
  const oppPoss = team.opp_fga - team.opp_orb + team.opp_tov + 0.475 * team.opp_fta;
  const opp2PA  = team.opp_fga - team.opp_tpa;
  const blkPct  = (p.minutes * opp2PA) > 0
    ? 100 * (p.blk * (teamMinutes / 5)) / (p.minutes * opp2PA) : 0;
  const stlPct  = (p.minutes * oppPoss) > 0
    ? 100 * (p.stl * (teamMinutes / 5)) / (p.minutes * oppPoss) : 0;
  const ftRate  = p.fga > 0 ? (p.fta / p.fga) * 100 : 0;

  const qAST = ((p.minutes / (teamMinutes / 5)) *
    (1.14 * ((team.ast - p.ast) / team.fgm))) +
    ((((team.ast / teamMinutes) * p.minutes * 5 - p.ast) /
      ((team.fgm / teamMinutes) * p.minutes * 5 - p.fgm)) *
      (1 - p.minutes / (teamMinutes / 5)));
  const FG_Part   = p.fgm * (1 - 0.5 * ((p.points - p.ftm) / (2 * p.fga)) * qAST);
  const AST_Part  = 0.5 * (((team.points - team.ftm) - (p.points - p.ftm)) / (2 * (team.fga - p.fga))) * p.ast;
  const FT_Part   = (1 - Math.pow(1 - p.ftm / p.fta, 2)) * 0.4 * p.fta;
  const ORB_Part  = p.orb * Team_ORB_Weight * Team_Play_pct;
  const ScPoss    = (FG_Part + AST_Part + FT_Part) *
    (1 - (team.orb / Team_Scoring_Poss) * Team_ORB_Weight * Team_Play_pct) + ORB_Part;
  const FGxPoss   = (p.fga - p.fgm) * (1 - 1.07 * Team_ORB_pct);
  const FTxPoss   = Math.pow(1 - p.ftm / p.fta, 2) * 0.4 * p.fta;
  const TotPoss   = ScPoss + FGxPoss + FTxPoss + p.tov;
  const PProd_FG  = 2 * (p.fgm + 0.5 * p.tpm) *
    (1 - 0.5 * ((p.points - p.ftm) / (2 * p.fga)) * qAST);
  const PProd_AST = 2 *
    ((team.fgm - p.fgm + 0.5 * (team.tpm - p.tpm)) / (team.fgm - p.fgm)) *
    0.5 * (((team.points - team.ftm) - (p.points - p.ftm)) / (2 * (team.fga - p.fga))) * p.ast;
  const PProd_ORB = p.orb * Team_ORB_Weight * Team_Play_pct *
    (team.points / (team.fgm + (1 - Math.pow(1 - team.ftm / team.fta, 2)) * 0.4 * team.fta));
  const PProd = (PProd_FG + PProd_AST + p.ftm) *
    (1 - (team.orb / Team_Scoring_Poss) * Team_ORB_Weight * Team_Play_pct) + PProd_ORB;
  const ortg = TotPoss > 0 ? 100 * PProd / TotPoss : 0;

  // Per game
  const g   = p.games || 1;
  const ppg = p.points / g;
  const rpg = p.trb / g;
  const apg = p.ast / g;
  const spg = p.stl / g;
  const bpg = p.blk / g;
  const mpg = p.minutes / g;
  const fgPct = p.fga > 0 ? (p.fgm / p.fga) * 100 : 0;
  const tpPct = p.tpa > 0 ? (p.tpm / p.tpa) * 100 : 0;
  const ftPct = p.fta > 0 ? (p.ftm / p.fta) * 100 : 0;

  // Per 40
  const m = p.minutes || 1;
  const p40 = p.points / m * 40;
  const r40 = p.trb    / m * 40;
  const a40 = p.ast    / m * 40;
  const s40 = p.stl    / m * 40;
  const b40 = p.blk    / m * 40;

  return {
    ortg, usagePct, efg, ts, orbPct, drbPct, aRate, toRate, blkPct, stlPct, ftRate,
    ppg, rpg, apg, spg, bpg, mpg, fgPct, tpPct, ftPct,
    p40, r40, a40, s40, b40,
  };
}

// ── Stat Mode Column Definitions ─────────────────────────────

const ADVANCED_COLS: { label: string; key: SortKey }[] = [
  { label: 'ORtg',   key: 'ortg'     },
  { label: '%Usage', key: 'usagePct' },
  { label: 'eFG%',   key: 'efg'      },
  { label: 'TS%',    key: 'ts'       },
  { label: 'OR%',    key: 'orbPct'   },
  { label: 'DR%',    key: 'drbPct'   },
  { label: 'ARate',  key: 'aRate'    },
  { label: 'TORate', key: 'toRate'   },
  { label: 'Blk%',  key: 'blkPct'   },
  { label: 'Stl%',  key: 'stlPct'   },
  { label: 'FTRate', key: 'ftRate'   },
];

const PER_GAME_COLS: { label: string; key: SortKey }[] = [
  { label: 'PPG', key: 'ppg'   },
  { label: 'RPG', key: 'rpg'   },
  { label: 'APG', key: 'apg'   },
  { label: 'SPG', key: 'spg'   },
  { label: 'BPG', key: 'bpg'   },
  { label: 'MPG', key: 'mpg'   },
  { label: 'FG%', key: 'fgPct' },
  { label: '3P%', key: 'tpPct' },
  { label: 'FT%', key: 'ftPct' },
];

const PER_40_COLS: { label: string; key: SortKey }[] = [
  { label: 'PTS/40', key: 'p40'   },
  { label: 'REB/40', key: 'r40'   },
  { label: 'AST/40', key: 'a40'   },
  { label: 'STL/40', key: 's40'   },
  { label: 'BLK/40', key: 'b40'   },
  { label: 'FG%',    key: 'fgPct' },
  { label: '3P%',    key: 'tpPct' },
  { label: 'FT%',    key: 'ftPct' },
];

// ── Main Page ─────────────────────────────────────────────────

export default function WomensRecruitingPage() {
  const [players, setPlayers]       = useState<TransferPlayer[]>([]);
  const [teamStats, setTeamStats]   = useState<Map<string, TeamStats>>(new Map());
  const [loading, setLoading]       = useState(true);
  const [statMode, setStatMode]     = useState<StatMode>('advanced');
  const [divFilter, setDivFilter]   = useState<'all' | 'womens-d1' | 'womens-d2'>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [sortKey, setSortKey]       = useState<SortKey>('usagePct');
  const [sortOrder, setSortOrder]   = useState<'asc' | 'desc'>('desc');

  useEffect(() => {
    // When data is available, fetch from API:
    // Promise.all([
    //   fetch('/api/recruiting/womens/transfers').then(r => r.json()),
    //   fetch('/api/womens-d1/teams/stats').then(r => r.json()),
    //   fetch('/api/womens-d2/teams/stats').then(r => r.json()),
    // ]).then(([transferData, d1Teams, d2Teams]) => { ... });
    setLoading(false);
  }, []);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortOrder(o => o === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortOrder('desc'); }
  };

  const activeCols = statMode === 'advanced' ? ADVANCED_COLS : statMode === 'perGame' ? PER_GAME_COLS : PER_40_COLS;

  const filteredPlayers = useMemo(() => {
    return players.filter(p => {
      if (divFilter !== 'all' && p.division !== divFilter) return false;
      if (searchTerm) {
        const name = `${p.firstName} ${p.lastName}`.toLowerCase();
        if (!name.includes(searchTerm.toLowerCase()) && !p.teamName.toLowerCase().includes(searchTerm.toLowerCase())) return false;
      }
      return true;
    });
  }, [players, divFilter, searchTerm]);

  const sortedPlayers = useMemo(() => {
    return [...filteredPlayers].sort((a, b) => {
      if (sortKey === 'name') {
        const an = `${a.lastName} ${a.firstName}`, bn = `${b.lastName} ${b.firstName}`;
        return sortOrder === 'asc' ? an.localeCompare(bn) : bn.localeCompare(an);
      }
      if (sortKey === 'team') return sortOrder === 'asc' ? a.teamName.localeCompare(b.teamName) : b.teamName.localeCompare(a.teamName);
      if (sortKey === 'division') return sortOrder === 'asc' ? a.division.localeCompare(b.division) : b.division.localeCompare(a.division);
      if (sortKey === 'games') return sortOrder === 'asc' ? a.games - b.games : b.games - a.games;

      const as = calcStats(a, teamStats.get(a.teamId));
      const bs = calcStats(b, teamStats.get(b.teamId));
      if (!as || !bs) return 0;
      const av = as[sortKey as keyof typeof as] as number ?? 0;
      const bv = bs[sortKey as keyof typeof bs] as number ?? 0;
      return sortOrder === 'asc' ? av - bv : bv - av;
    });
  }, [filteredPlayers, sortKey, sortOrder, teamStats]);

  const exportCSV = () => {
    const activeCols = statMode === 'advanced' ? ADVANCED_COLS : statMode === 'perGame' ? PER_GAME_COLS : PER_40_COLS;
    const headers = ['Player', 'Team', 'Division', 'Year', 'Height', 'G',
      ...activeCols.map(c => c.label)];
    const rows = sortedPlayers.map(p => {
      const stats = calcStats(p, teamStats.get(p.teamId));
      const ht = !p.height || p.height === 0 ? '' : `${Math.floor(p.height / 12)}'${p.height % 12}"`;
      if (!stats) return Array(headers.length).fill('');
      return [
        `${p.firstName} ${p.lastName}`,
        p.teamName,
        divLabel(p.division),
        p.year || '',
        ht,
        p.games,
        ...activeCols.map(c => {
          const val = stats[c.key as keyof typeof stats] as number | undefined;
          return val != null ? val.toFixed(1) : '';
        }),
      ];
    });
    const csv = [headers, ...rows]
      .map(row => row.map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `womens-transfers_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const SortableHeader = ({ label, sk }: { label: string; sk: SortKey }) => (
    <th
      onClick={() => handleSort(sk)}
      style={{
        padding: '6px 8px', textAlign: 'right', cursor: 'pointer', userSelect: 'none',
        fontWeight: 700, fontSize: 10, whiteSpace: 'nowrap',
        background: sortKey === sk ? ACCENT : 'transparent',
        color: sortKey === sk ? '#fff' : 'inherit',
        transition: 'background 0.15s',
      }}
    >
      {label} {sortKey === sk && (sortOrder === 'desc' ? '↓' : '↑')}
    </th>
  );

  // ── Empty State ──────────────────────────────────────────────

  const EmptyState = () => (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      padding: '80px 20px', gap: 16,
    }}>
      <div style={{
        width: 64, height: 64, borderRadius: '50%',
        background: FROST, display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 28,
      }}>
        📋
      </div>
      <div style={{ textAlign: 'center' }}>
        <h3 style={{ fontSize: 18, fontWeight: 700, color: NAVY, margin: '0 0 8px' }}>
          Transfer Portal Coming Soon
        </h3>
        <p style={{ fontSize: 14, color: MUTED, maxWidth: 380, lineHeight: 1.6, margin: 0 }}>
          Women's transfer portal data is being compiled. Check back soon — players and their season stats will appear here once available.
        </p>
      </div>
    </div>
  );

  return (
    <>
      <SiteNavigation currentDivision="womens-d1" currentPage="recruiting" divisionPath="/womens-d1" />
      <main style={{ maxWidth: '100%', margin: '0 auto', padding: 20 }}>

        {/* ── Sub-nav: Transfers tab ── */}
        <div style={{ display: 'flex', gap: 0, borderBottom: `2px solid ${FROST}`, marginBottom: 24 }}>
          <div style={{
            padding: '10px 20px',
            fontFamily: "'Outfit', sans-serif",
            fontSize: 14, fontWeight: 700,
            color: SKY,
            borderBottom: `3px solid ${ACCENT}`,
            marginBottom: -2,
            letterSpacing: '0.01em',
          }}>
            Transfers
          </div>
        </div>

        {/* ── Controls bar ── */}
        <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap', alignItems: 'center' }}>

          {/* Search */}
          <input
            type="text"
            placeholder="Search player or team..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            style={{
              padding: '8px 12px', border: `1px solid ${ICE}`, borderRadius: 6,
              fontSize: 13, flex: 1, minWidth: 200, outline: 'none',
              fontFamily: "'Outfit', sans-serif",
            }}
          />

          {/* Division filter */}
          <div style={{ display: 'flex', borderRadius: 6, overflow: 'hidden', border: `1px solid ${ICE}` }}>
            {(['all', 'womens-d1', 'womens-d2'] as const).map(val => (
              <button
                key={val}
                onClick={() => setDivFilter(val)}
                style={{
                  padding: '7px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer',
                  fontFamily: "'Outfit', sans-serif", border: 'none', outline: 'none',
                  background: divFilter === val ? NAVY : '#fff',
                  color: divFilter === val ? '#fff' : MUTED,
                  transition: 'background 0.15s, color 0.15s',
                }}
              >
                {val === 'all' ? 'All' : val === 'womens-d1' ? 'D1' : 'D2'}
              </button>
            ))}
          </div>

          {/* Stat mode toggle */}
          <div style={{ display: 'flex', borderRadius: 6, overflow: 'hidden', border: `1px solid ${ICE}`, marginLeft: 'auto' }}>
            {([
              { key: 'advanced', label: 'Advanced' },
              { key: 'perGame',  label: 'Per Game'  },
              { key: 'per40',    label: 'Per 40'    },
            ] as { key: StatMode; label: string }[]).map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setStatMode(key)}
                style={{
                  padding: '7px 16px', fontSize: 12, fontWeight: 600, cursor: 'pointer',
                  fontFamily: "'Outfit', sans-serif", border: 'none', outline: 'none',
                  background: statMode === key ? ACCENT : '#fff',
                  color: statMode === key ? '#fff' : MUTED,
                  transition: 'background 0.15s, color 0.15s',
                }}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Export */}
          <button
            onClick={exportCSV}
            disabled={players.length === 0}
            style={{
              padding: '7px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer',
              fontFamily: "'Outfit', sans-serif", border: `1px solid ${ICE}`,
              borderRadius: 6, background: '#fff', color: NAVY,
              opacity: players.length === 0 ? 0.4 : 1,
              display: 'flex', alignItems: 'center', gap: 6,
            }}
          >
            ↓ Export CSV
          </button>
        </div>

        {/* ── Table or Empty State ── */}
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: MUTED }}>Loading...</div>
        ) : players.length === 0 ? (
          <EmptyState />
        ) : (
          <>
            <p style={{ fontSize: 12, color: MUTED, marginBottom: 12 }}>
              Showing {sortedPlayers.length} of {players.length} transfers
            </p>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11, whiteSpace: 'nowrap' }}>
                <thead>
                  <tr style={{ borderBottom: `2px solid ${ACCENT}`, background: FROST }}>
                    <th
                      onClick={() => handleSort('name')}
                      style={{ padding: '6px 8px', textAlign: 'left', cursor: 'pointer', fontWeight: 700, fontSize: 10, position: 'sticky', left: 0, background: FROST, zIndex: 2 }}
                    >
                      Player {sortKey === 'name' && (sortOrder === 'desc' ? '↓' : '↑')}
                    </th>
                    <th
                      onClick={() => handleSort('team')}
                      style={{ padding: '6px 8px', textAlign: 'left', cursor: 'pointer', fontWeight: 700, fontSize: 10 }}
                    >
                      Team {sortKey === 'team' && (sortOrder === 'desc' ? '↓' : '↑')}
                    </th>
                    <th
                      onClick={() => handleSort('division')}
                      style={{ padding: '6px 8px', textAlign: 'center', cursor: 'pointer', fontWeight: 700, fontSize: 10 }}
                    >
                      Div {sortKey === 'division' && (sortOrder === 'desc' ? '↓' : '↑')}
                    </th>
                    <th style={{ padding: '6px 8px', textAlign: 'center', fontWeight: 700, fontSize: 10 }}>Yr</th>
                    <th style={{ padding: '6px 8px', textAlign: 'center', fontWeight: 700, fontSize: 10 }}>Ht</th>
                    <SortableHeader label="G" sk="games" />
                    {activeCols.map(col => (
                      <SortableHeader key={col.key} label={col.label} sk={col.key} />
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sortedPlayers.map((p, idx) => {
                    const stats = calcStats(p, teamStats.get(p.teamId));
                    if (!stats) return null;
                    return (
                      <tr
                        key={p.playerId}
                        style={{ borderBottom: '1px solid #f0f0f0', background: idx % 2 === 0 ? '#fff' : '#fafafa' }}
                      >
                        <td style={{ padding: '5px 8px', fontWeight: 600, position: 'sticky', left: 0, background: idx % 2 === 0 ? '#fff' : '#fafafa', zIndex: 1 }}>
                          {p.firstName} {p.lastName}
                        </td>
                        <td style={{ padding: '5px 8px' }}>
                          <Link href={`/${p.division}/team/${p.teamId}`} style={{ color: ACCENT, textDecoration: 'none' }}>
                            {p.teamName}
                          </Link>
                        </td>
                        <td style={{ padding: '5px 8px', textAlign: 'center' }}>
                          <span style={{
                            display: 'inline-block', padding: '2px 6px', borderRadius: 4, fontSize: 10, fontWeight: 700,
                            background: p.division === 'womens-d1' ? NAVY : SKY, color: '#fff',
                          }}>
                            {divLabel(p.division)}
                          </span>
                        </td>
                        <td style={{ padding: '5px 8px', textAlign: 'center' }}>{p.year || '—'}</td>
                        <td style={{ padding: '5px 8px', textAlign: 'center' }}>{formatHeight(p.height)}</td>
                        <td style={{ padding: '5px 8px', textAlign: 'right' }}>{p.games}</td>
                        {activeCols.map(col => {
                          const val = stats[col.key as keyof typeof stats] as number | undefined;
                          return (
                            <td key={col.key} style={{
                              padding: '5px 8px', textAlign: 'right',
                              fontWeight: col.key === 'usagePct' || col.key === 'ortg' || col.key === 'ppg' || col.key === 'p40' ? 600 : 400,
                            }}>
                              {val != null ? val.toFixed(1) : '—'}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </main>
    </>
  );
}
