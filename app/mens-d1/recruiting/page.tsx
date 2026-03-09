'use client';

import { useEffect, useState, useMemo } from 'react';
import SiteNavigation from '@/components/SiteNavigation';

const ACCENT  = "#3B9EFF";
const NAVY    = "#0D1F3C";
const SKY     = "#2E7DD1";
const ICE     = "#A8C8F0";
const FROST   = "#E8F2FC";
const MUTED   = "#6B7E9A";

type StatMode = 'advanced' | 'perGame' | 'per40';

type Transfer = {
  playerId: string | null;
  name: string;
  previousSchool: string;
  newSchool: string | null;
  division: 'D1 Men' | 'D2 Men';
  matchStatus: string;
  teamName: string | null;
  position: string | null;
  year: string | null;
  height: string | null;
  games: number | null;
  starts: number | null;
  minutes: number | null;
  fgm: number | null; fga: number | null;
  tpm: number | null; tpa: number | null;
  ftm: number | null; fta: number | null;
  orb: number | null; drb: number | null; trb: number | null;
  ast: number | null; stl: number | null; blk: number | null;
  tov: number | null; pf: number | null; points: number | null;
};

type TeamRow = {
  teamId: string; teamName: string; division: string; games: number;
  fgm: number; fga: number; tpm: number; tpa: number; ftm: number; fta: number;
  orb: number; drb: number; trb: number; ast: number; stl: number; blk: number;
  tov: number; pf: number; points: number;
  opp_fgm: number; opp_fga: number; opp_tpm: number; opp_tpa: number;
  opp_ftm: number; opp_fta: number; opp_orb: number; opp_drb: number; opp_trb: number;
  opp_ast: number; opp_stl: number; opp_blk: number; opp_tov: number;
  opp_pf: number; opp_points: number;
};

type SortKey =
  | 'name' | 'previousSchool' | 'newSchool' | 'division' | 'games'
  | 'ortg' | 'usagePct' | 'minPct' | 'shotsPct' | 'efg' | 'ts'
  | 'orbPct' | 'drbPct' | 'aRate' | 'toRate' | 'blkPct' | 'stlPct' | 'ftRate'
  | 'twopm' | 'twopa' | 'twopPct' | 'tpm' | 'tpa' | 'tpPct' | 'ftm' | 'fta' | 'ftPct'
  | 'ppg' | 'rpg' | 'orbpg' | 'drbpg' | 'apg' | 'spg' | 'bpg' | 'mpg' | 'fgPct'
  | 'p40' | 'r40' | 'orb40' | 'drb40' | 'a40' | 's40' | 'b40' | 'fc40'
  | 'twopm40' | 'twopa40' | 'twopPct40' | 'tpm40' | 'tpa40' | 'tpPct40' | 'ftm40' | 'fta40' | 'ftPct40';

function hasStats(t: Transfer): boolean {
  return t.games != null && t.games > 0 && t.minutes != null && t.minutes > 0;
}

function divLabel(div: string) { return div === 'D1 Men' ? 'D1' : 'D2'; }

function calcStats(t: Transfer, team: TeamRow | undefined) {
  if (!team || !hasStats(t)) return null;
  const p = {
    games: t.games!, minutes: t.minutes!,
    fgm: t.fgm!, fga: t.fga!, tpm: t.tpm!, tpa: t.tpa!,
    ftm: t.ftm!, fta: t.fta!, orb: t.orb!, drb: t.drb!, trb: t.trb!,
    ast: t.ast!, stl: t.stl!, blk: t.blk!, tov: t.tov!, pf: t.pf!, points: t.points!,
  };
  const teamMinutes = team.games * 200;
  const opp_drb = team.opp_trb - team.opp_orb;
  const drb = team.trb - team.orb;
  const Team_ORB_pct = team.orb / (team.orb + opp_drb);
  const Team_Scoring_Poss = team.fgm + (1 - Math.pow(1 - team.ftm / team.fta, 2)) * team.fta * 0.4;
  const Team_Play_pct = Team_Scoring_Poss / (team.fga + team.fta * 0.4 + team.tov);
  const Team_ORB_Weight = ((1 - Team_ORB_pct) * Team_Play_pct) / ((1 - Team_ORB_pct) * Team_Play_pct + Team_ORB_pct * (1 - Team_Play_pct));
  const teamPossTotal = team.fga + 0.44 * team.fta + team.tov;
  const usagePct = 100 * (p.fga + 0.44 * p.fta + p.tov) / (teamPossTotal / teamMinutes * p.minutes) / 5;
  const minPct = 100 * p.minutes / teamMinutes * 5;
  const shotsPct = (team.fga + 0.44 * team.fta) > 0 ? 100 * (p.fga + 0.44 * p.fta) / ((teamMinutes / 5 / p.minutes) * (team.fga + 0.44 * team.fta)) : 0;
  const efg = p.fga > 0 ? ((p.fgm + 0.5 * p.tpm) / p.fga) * 100 : 0;
  const ts = (p.fga + 0.475 * p.fta) > 0 ? (p.points / (2 * (p.fga + 0.475 * p.fta))) * 100 : 0;
  const orbPct = p.minutes > 0 && (team.orb + opp_drb) > 0 ? (p.orb / p.minutes) * (teamMinutes / 5) / (team.orb + opp_drb) * 100 : 0;
  const drbPct = p.minutes > 0 && (drb + team.opp_orb) > 0 ? (p.drb / p.minutes) * (teamMinutes / 5) / (drb + team.opp_orb) * 100 : 0;
  const aRateDenom = ((p.minutes / (teamMinutes / 5)) * team.fgm) - p.fgm;
  const aRate = aRateDenom > 0 ? (p.ast / aRateDenom) * 100 : 0;
  const playerPoss = p.fga + 0.44 * p.fta + p.tov;
  const toRate = playerPoss > 0 ? (p.tov / playerPoss) * 100 : 0;
  const oppPoss = team.opp_fga - team.opp_orb + team.opp_tov + 0.475 * team.opp_fta;
  const opp2PA = team.opp_fga - team.opp_tpa;
  const blkPct = (p.minutes * opp2PA) > 0 ? 100 * (p.blk * (teamMinutes / 5)) / (p.minutes * opp2PA) : 0;
  const stlPct = (p.minutes * oppPoss) > 0 ? 100 * (p.stl * (teamMinutes / 5)) / (p.minutes * oppPoss) : 0;
  const ftRate = p.fga > 0 ? (p.fta / p.fga) * 100 : 0;
  const twopm = p.fgm - p.tpm;
  const twopa = p.fga - p.tpa;
  const twopPct = twopa > 0 ? (twopm / twopa) * 100 : 0;
  const tpPct = p.tpa > 0 ? (p.tpm / p.tpa) * 100 : 0;
  const ftPct = p.fta > 0 ? (p.ftm / p.fta) * 100 : 0;
  const qAST = ((p.minutes / (teamMinutes / 5)) * (1.14 * ((team.ast - p.ast) / team.fgm))) +
    ((((team.ast / teamMinutes) * p.minutes * 5 - p.ast) / ((team.fgm / teamMinutes) * p.minutes * 5 - p.fgm)) * (1 - p.minutes / (teamMinutes / 5)));
  const FG_Part = p.fgm * (1 - 0.5 * ((p.points - p.ftm) / (2 * p.fga)) * qAST);
  const AST_Part = 0.5 * (((team.points - team.ftm) - (p.points - p.ftm)) / (2 * (team.fga - p.fga))) * p.ast;
  const FT_Part = (1 - Math.pow(1 - p.ftm / p.fta, 2)) * 0.4 * p.fta;
  const ORB_Part = p.orb * Team_ORB_Weight * Team_Play_pct;
  const ScPoss = (FG_Part + AST_Part + FT_Part) * (1 - (team.orb / Team_Scoring_Poss) * Team_ORB_Weight * Team_Play_pct) + ORB_Part;
  const FGxPoss = (p.fga - p.fgm) * (1 - 1.07 * Team_ORB_pct);
  const FTxPoss = Math.pow(1 - p.ftm / p.fta, 2) * 0.4 * p.fta;
  const TotPoss = ScPoss + FGxPoss + FTxPoss + p.tov;
  const PProd_FG = 2 * (p.fgm + 0.5 * p.tpm) * (1 - 0.5 * ((p.points - p.ftm) / (2 * p.fga)) * qAST);
  const PProd_AST = 2 * ((team.fgm - p.fgm + 0.5 * (team.tpm - p.tpm)) / (team.fgm - p.fgm)) *
    0.5 * (((team.points - team.ftm) - (p.points - p.ftm)) / (2 * (team.fga - p.fga))) * p.ast;
  const PProd_ORB = p.orb * Team_ORB_Weight * Team_Play_pct *
    (team.points / (team.fgm + (1 - Math.pow(1 - team.ftm / team.fta, 2)) * 0.4 * team.fta));
  const PProd = (PProd_FG + PProd_AST + p.ftm) * (1 - (team.orb / Team_Scoring_Poss) * Team_ORB_Weight * Team_Play_pct) + PProd_ORB;
  const ortg = TotPoss > 0 ? 100 * PProd / TotPoss : 0;
  const g = p.games || 1;
  const m = p.minutes || 1;
  return {
    ortg, usagePct, minPct, shotsPct, efg, ts, orbPct, drbPct, aRate, toRate, blkPct, stlPct, ftRate,
    twopm, twopa, twopPct, tpm: p.tpm, tpa: p.tpa, tpPct, ftm: p.ftm, fta: p.fta, ftPct,
    ppg: p.points/g, rpg: p.trb/g, orbpg: p.orb/g, drbpg: p.drb/g,
    apg: p.ast/g, spg: p.stl/g, bpg: p.blk/g, mpg: p.minutes/g,
    fgPct: p.fga > 0 ? (p.fgm/p.fga)*100 : 0,
    p40: p.points/m*40, r40: p.trb/m*40, orb40: p.orb/m*40, drb40: p.drb/m*40,
    a40: p.ast/m*40, s40: p.stl/m*40, b40: p.blk/m*40, fc40: p.pf/m*40,
    twopm40: twopm/m*40, twopa40: twopa/m*40, twopPct40: twopPct,
    tpm40: p.tpm/m*40, tpa40: p.tpa/m*40, tpPct40: tpPct,
    ftm40: p.ftm/m*40, fta40: p.fta/m*40, ftPct40: ftPct,
  };
}

const ADVANCED_COLS: { label: string; key: SortKey }[] = [
  { label: 'ORtg',   key: 'ortg'     }, { label: '%Usage', key: 'usagePct' },
  { label: '%Min',   key: 'minPct'   }, { label: '%Shots', key: 'shotsPct' },
  { label: 'eFG%',   key: 'efg'      }, { label: 'TS%',    key: 'ts'       },
  { label: 'OR%',    key: 'orbPct'   }, { label: 'DR%',    key: 'drbPct'   },
  { label: 'ARate',  key: 'aRate'    }, { label: 'TORate', key: 'toRate'   },
  { label: 'Blk%',   key: 'blkPct'  }, { label: 'Stl%',   key: 'stlPct'  },
  { label: 'FTRate', key: 'ftRate'   }, { label: '2PM',    key: 'twopm'    },
  { label: '2PA',    key: 'twopa'    }, { label: '2P%',    key: 'twopPct'  },
  { label: '3PM',    key: 'tpm'      }, { label: '3PA',    key: 'tpa'      },
  { label: '3P%',    key: 'tpPct'   }, { label: 'FTM',    key: 'ftm'      },
  { label: 'FTA',    key: 'fta'      }, { label: 'FT%',    key: 'ftPct'    },
];

const PER_GAME_COLS: { label: string; key: SortKey }[] = [
  { label: 'PPG',  key: 'ppg'     }, { label: 'RPG',  key: 'rpg'     },
  { label: 'ORB',  key: 'orbpg'   }, { label: 'DRB',  key: 'drbpg'   },
  { label: 'APG',  key: 'apg'     }, { label: 'SPG',  key: 'spg'     },
  { label: 'BPG',  key: 'bpg'     }, { label: 'MPG',  key: 'mpg'     },
  { label: 'FG%',  key: 'fgPct'   }, { label: '2PM',  key: 'twopm'   },
  { label: '2PA',  key: 'twopa'   }, { label: '2P%',  key: 'twopPct' },
  { label: '3PM',  key: 'tpm'     }, { label: '3PA',  key: 'tpa'     },
  { label: '3P%',  key: 'tpPct'  }, { label: 'FTM',  key: 'ftm'     },
  { label: 'FTA',  key: 'fta'     }, { label: 'FT%',  key: 'ftPct'   },
];

const PER_40_COLS: { label: string; key: SortKey }[] = [
  { label: 'PTS/40', key: 'p40'       }, { label: 'REB/40', key: 'r40'       },
  { label: 'ORB/40', key: 'orb40'     }, { label: 'DRB/40', key: 'drb40'     },
  { label: 'AST/40', key: 'a40'       }, { label: 'STL/40', key: 's40'       },
  { label: 'BLK/40', key: 'b40'       }, { label: 'FC/40',  key: 'fc40'      },
  { label: 'FG%',    key: 'fgPct'     }, { label: '2PM',    key: 'twopm40'   },
  { label: '2PA',    key: 'twopa40'   }, { label: '2P%',    key: 'twopPct40' },
  { label: '3PM',    key: 'tpm40'     }, { label: '3PA',    key: 'tpa40'     },
  { label: '3P%',    key: 'tpPct40'  }, { label: 'FTM',    key: 'ftm40'     },
  { label: 'FTA',    key: 'fta40'     }, { label: 'FT%',    key: 'ftPct40'   },
];

const INTEGER_KEYS = new Set(['twopm','twopa','tpm','tpa','ftm','fta']);

export default function MensTransfersPage() {
  const [transfers, setTransfers]   = useState<Transfer[]>([]);
  const [teamMap, setTeamMap]       = useState<Map<string, TeamRow>>(new Map());
  const [loading, setLoading]       = useState(true);
  const [statMode, setStatMode]     = useState<StatMode>('advanced');
  const [divFilter, setDivFilter]   = useState<'all' | 'D1 Men' | 'D2 Men'>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [sortKey, setSortKey]       = useState<SortKey>('usagePct');
  const [sortOrder, setSortOrder]   = useState<'asc' | 'desc'>('desc');

  useEffect(() => {
    fetch('/api/recruiting/mens/transfers')
      .then(r => r.json())
      .then(({ transfers, teams }) => {
        setTransfers(transfers ?? []);
        const map = new Map<string, TeamRow>();
        for (const t of (teams ?? [])) map.set(t.teamName, t);
        setTeamMap(map);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortOrder(o => o === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortOrder('desc'); }
  };

  const activeCols = statMode === 'advanced' ? ADVANCED_COLS : statMode === 'perGame' ? PER_GAME_COLS : PER_40_COLS;

  const filtered = useMemo(() => transfers.filter(t => {
    if (divFilter !== 'all' && t.division !== divFilter) return false;
    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      if (!t.name.toLowerCase().includes(q) &&
          !t.previousSchool.toLowerCase().includes(q) &&
          !(t.newSchool ?? '').toLowerCase().includes(q)) return false;
    }
    return true;
  }), [transfers, divFilter, searchTerm]);

  const sorted = useMemo(() => [...filtered].sort((a, b) => {
    if (sortKey === 'name') return sortOrder === 'asc' ? a.name.localeCompare(b.name) : b.name.localeCompare(a.name);
    if (sortKey === 'previousSchool') return sortOrder === 'asc' ? a.previousSchool.localeCompare(b.previousSchool) : b.previousSchool.localeCompare(a.previousSchool);
    if (sortKey === 'newSchool') { const an = a.newSchool??'', bn = b.newSchool??''; return sortOrder==='asc'?an.localeCompare(bn):bn.localeCompare(an); }
    if (sortKey === 'division') return sortOrder==='asc'?a.division.localeCompare(b.division):b.division.localeCompare(a.division);
    if (sortKey === 'games') { const ag=a.games??0,bg=b.games??0; return sortOrder==='asc'?ag-bg:bg-ag; }
    const as_ = calcStats(a, teamMap.get(a.teamName??''));
    const bs_ = calcStats(b, teamMap.get(b.teamName??''));
    if (!as_ && !bs_) return 0;
    if (!as_) return 1;
    if (!bs_) return -1;
    const av = (as_ as Record<string,number>)[sortKey]??0;
    const bv = (bs_ as Record<string,number>)[sortKey]??0;
    return sortOrder==='asc'?av-bv:bv-av;
  }), [filtered, sortKey, sortOrder, teamMap]);

  const SortableHeader = ({ label, sk, align='right' }: { label: string; sk: SortKey; align?: 'left'|'right'|'center' }) => (
    <th onClick={() => handleSort(sk)} style={{
      padding: '6px 8px', textAlign: align, cursor: 'pointer', userSelect: 'none',
      fontWeight: 700, fontSize: 10, whiteSpace: 'nowrap',
      background: sortKey===sk ? ACCENT : 'transparent',
      color: sortKey===sk ? '#fff' : 'inherit', transition: 'background 0.15s',
    }}>
      {label} {sortKey===sk && (sortOrder==='desc'?'↓':'↑')}
    </th>
  );

  const withStats = transfers.filter(hasStats).length;
  const withoutStats = transfers.length - withStats;

  return (
    <>
      <SiteNavigation currentDivision="mens-d1" currentPage="recruiting" divisionPath="/mens-d1" />
      <main style={{ maxWidth: '100%', margin: '0 auto', padding: 20 }}>
        <div style={{ display: 'flex', gap: 0, borderBottom: `2px solid ${FROST}`, marginBottom: 24 }}>
          <div style={{ padding: '10px 20px', fontFamily: "'Outfit', sans-serif", fontSize: 14, fontWeight: 700, color: SKY, borderBottom: `3px solid ${ACCENT}`, marginBottom: -2, letterSpacing: '0.01em' }}>
            Transfers
          </div>
        </div>

        <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap', alignItems: 'center' }}>
          <input type="text" placeholder="Search player, previous school, or destination..." value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            style={{ padding: '8px 12px', border: `1px solid ${ICE}`, borderRadius: 6, fontSize: 13, flex: 1, minWidth: 200, outline: 'none', fontFamily: "'Outfit', sans-serif" }} />

          <div style={{ display: 'flex', borderRadius: 6, overflow: 'hidden', border: `1px solid ${ICE}` }}>
            {(['all','D1 Men','D2 Men'] as const).map(val => (
              <button key={val} onClick={() => setDivFilter(val)} style={{
                padding: '7px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer',
                fontFamily: "'Outfit', sans-serif", border: 'none', outline: 'none',
                background: divFilter===val ? NAVY : '#fff', color: divFilter===val ? '#fff' : MUTED,
                transition: 'background 0.15s, color 0.15s',
              }}>{val==='all'?'All':val}</button>
            ))}
          </div>

          <div style={{ display: 'flex', borderRadius: 6, overflow: 'hidden', border: `1px solid ${ICE}`, marginLeft: 'auto' }}>
            {([{key:'advanced',label:'Advanced'},{key:'perGame',label:'Per Game'},{key:'per40',label:'Per 40'}] as {key:StatMode;label:string}[]).map(({key,label}) => (
              <button key={key} onClick={() => setStatMode(key)} style={{
                padding: '7px 16px', fontSize: 12, fontWeight: 600, cursor: 'pointer',
                fontFamily: "'Outfit', sans-serif", border: 'none', outline: 'none',
                background: statMode===key ? ACCENT : '#fff', color: statMode===key ? '#fff' : MUTED,
                transition: 'background 0.15s, color 0.15s',
              }}>{label}</button>
            ))}
          </div>
        </div>

        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: MUTED }}>Loading...</div>
        ) : (
          <>
            <p style={{ fontSize: 12, color: MUTED, marginBottom: 12 }}>
              Showing {sorted.length} of {transfers.length} transfers
              {withoutStats > 0 && <span style={{ marginLeft: 8, color: MUTED }}>· {withStats} with stats, {withoutStats} stats pending</span>}
            </p>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11, whiteSpace: 'nowrap' }}>
                <thead>
                  <tr style={{ borderBottom: `2px solid ${ACCENT}`, background: FROST }}>
                    <SortableHeader label="Player" sk="name" align="left" />
                    <SortableHeader label="From" sk="previousSchool" align="left" />
                    <SortableHeader label="To" sk="newSchool" align="left" />
                    <SortableHeader label="Div" sk="division" align="center" />
                    <th style={{ padding: '6px 8px', textAlign: 'center', fontWeight: 700, fontSize: 10 }}>Yr</th>
                    <th style={{ padding: '6px 8px', textAlign: 'center', fontWeight: 700, fontSize: 10 }}>Ht</th>
                    <SortableHeader label="G" sk="games" />
                    {activeCols.map(col => <SortableHeader key={col.key} label={col.label} sk={col.key} />)}
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((t, idx) => {
                    const stats = calcStats(t, teamMap.get(t.teamName??''));
                    const bg = idx%2===0 ? '#fff' : '#fafafa';
                    return (
                      <tr key={`${t.name}-${t.previousSchool}`} style={{ borderBottom: '1px solid #f0f0f0', background: bg }}>
                        <td style={{ padding: '5px 8px', fontWeight: 600, position: 'sticky', left: 0, background: bg, zIndex: 1, minWidth: 160, maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {t.name}
                        </td>
                        <td style={{ padding: '5px 8px', color: MUTED, minWidth: 150, maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {t.previousSchool || '—'}
                        </td>
                        <td style={{ padding: '5px 8px', minWidth: 120, maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {t.newSchool ? (
                            <span style={{ display: 'inline-block', padding: '1px 6px', borderRadius: 4, fontSize: 10, fontWeight: 600, background: '#e8f5e9', color: '#2e7d32' }}>
                              {t.newSchool}
                            </span>
                          ) : (
                            <span style={{ color: MUTED, fontSize: 10 }}>Uncommitted</span>
                          )}
                        </td>
                        <td style={{ padding: '5px 8px', textAlign: 'center' }}>
                          <span style={{ display: 'inline-block', padding: '2px 6px', borderRadius: 4, fontSize: 10, fontWeight: 700, background: t.division==='D1 Men' ? NAVY : SKY, color: '#fff' }}>
                            {divLabel(t.division)}
                          </span>
                        </td>
                        <td style={{ padding: '5px 8px', textAlign: 'center' }}>{t.year || '—'}</td>
                        <td style={{ padding: '5px 8px', textAlign: 'center' }}>{t.height || '—'}</td>
                        <td style={{ padding: '5px 8px', textAlign: 'right' }}>{t.games ?? '—'}</td>
                        {activeCols.map(col => {
                          const val = stats ? (stats as Record<string,number>)[col.key] : undefined;
                          return (
                            <td key={col.key} style={{
                              padding: '5px 8px', textAlign: 'right',
                              fontWeight: col.key==='usagePct'||col.key==='ortg'||col.key==='ppg'||col.key==='p40' ? 600 : 400,
                              color: !stats ? MUTED : 'inherit',
                            }}>
                              {val!=null ? (INTEGER_KEYS.has(col.key) ? Math.round(val) : val.toFixed(1)) : '—'}
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
