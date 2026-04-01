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

type Player = {
  playerId: string;
  teamName: string;
  jersey: string | null;
  name: string;
  season: string;
  games: number | null;
  minutes: number | null;
  cleanGames: number | null;
  fgm: number | null; fga: number | null;
  tpm: number | null; tpa: number | null;
  ftm: number | null; fta: number | null;
  orb: number | null; drb: number | null; trb: number | null;
  ast: number | null; stl: number | null; blk: number | null;
  tov: number | null; pf: number | null; points: number | null;
};

type TeamRow = {
  teamName: string;
  games: number;
  cleanGames: number;
  fgm: number; fga: number; tpm: number; tpa: number; ftm: number; fta: number;
  orb: number; trb: number; ast: number; tov: number; points: number;
  cleanFga: number; cleanFta: number; cleanOrb: number; cleanTrb: number; cleanTov: number;
  cleanOppFga: number; cleanOppFta: number; cleanOppOrb: number; cleanOppTrb: number; cleanOppTov: number;
};

type SortKey =
  | 'name' | 'teamName' | 'games'
  | 'ortg' | 'usagePct' | 'minPct' | 'shotsPct' | 'efg' | 'ts'
  | 'orbPct' | 'drbPct' | 'aRate' | 'toRate' | 'blkPct' | 'stlPct' | 'ftRate'
  | 'twopm' | 'twopa' | 'twopPct' | 'tpm' | 'tpa' | 'tpPct' | 'ftm' | 'fta' | 'ftPct'
  | 'ppg' | 'rpg' | 'orbpg' | 'drbpg' | 'apg' | 'spg' | 'bpg' | 'mpg' | 'fgPct'
  | 'p40' | 'r40' | 'orb40' | 'drb40' | 'a40' | 's40' | 'b40' | 'fc40'
  | 'twopm40' | 'twopa40' | 'twopPct40' | 'tpm40' | 'tpa40' | 'tpPct40' | 'ftm40' | 'fta40' | 'ftPct40';

const MIN_MINUTES_OPTIONS = [0, 50, 100, 150, 200, 300];

function hasStats(p: Player): boolean {
  return p.games != null && p.games > 0 && p.fga != null;
}

function csvField(val: string | number | null | undefined): string {
  const s = val == null ? '' : String(val);
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function calcStats(p: Player, team: TeamRow | undefined) {
  if (!team || !hasStats(p)) return null;

  // Use all-game stats for per game / per 40
  const g = p.games ?? 1;
  const fgm = p.fgm ?? 0;
  const fga = p.fga ?? 0;
  const tpm = p.tpm ?? 0;
  const tpa = p.tpa ?? 0;
  const ftm = p.ftm ?? 0;
  const fta = p.fta ?? 0;
  const orb = p.orb ?? 0;
  const drb = p.drb ?? 0;
  const trb = p.trb ?? 0;
  const ast = p.ast ?? 0;
  const stl = p.stl ?? 0;
  const blk = p.blk ?? 0;
  const tov = p.tov ?? 0;
  const pf  = p.pf  ?? 0;
  const pts = p.points ?? 0;

  // Per game / per 40 use all-game minutes
  const totalMin = p.minutes ?? 0;
  const m = totalMin || 1;

  // Advanced stats use clean games only (min_tracked + opponent_has_stats)
  // We use team clean totals and player clean minutes
  const cleanMin = p.cleanGames != null && p.cleanGames > 0 ? p.cleanGames * (totalMin / g) : 0;
  const hasClean = team.cleanGames > 0 && cleanMin > 0;

  // Team totals for advanced stats (clean games only)
  const teamCleanMin = team.cleanGames * 200;
  const opp_drb_clean = team.cleanOppTrb - team.cleanOppOrb;
  const drb_clean     = team.cleanTrb - team.cleanOrb;

  let ortg = 0, usagePct = 0, minPct = 0, shotsPct = 0;
  let orbPct = 0, drbPct = 0, aRate = 0, toRate = 0, blkPct = 0, stlPct = 0;

  if (hasClean) {
    const teamMinutes = teamCleanMin;

    // Scale player clean stats proportionally
    const cleanRatio = cleanMin / totalMin;
    const p_fgm = fgm * cleanRatio;
    const p_fga = fga * cleanRatio;
    const p_tpm = tpm * cleanRatio;
    const p_tpa = tpa * cleanRatio;
    const p_ftm = ftm * cleanRatio;
    const p_fta = fta * cleanRatio;
    const p_orb = orb * cleanRatio;
    const p_drb = drb * cleanRatio;
    const p_ast = ast * cleanRatio;
    const p_stl = stl * cleanRatio;
    const p_blk = blk * cleanRatio;
    const p_tov = tov * cleanRatio;
    const p_pts = pts * cleanRatio;
    const p_pf  = pf  * cleanRatio;

    const Team_ORB_pct = team.cleanOrb / (team.cleanOrb + opp_drb_clean) || 0;
    const Team_Scoring_Poss = team.cleanFga > 0 && team.cleanFta > 0
      ? team.cleanFga + (1 - Math.pow(1 - (team.ftm / team.fta || 0.7), 2)) * team.cleanFta * 0.4
      : 1;
    const Team_Play_pct = Team_Scoring_Poss / ((team.cleanFga + team.cleanFta * 0.4 + team.cleanTov) || 1);
    const Team_ORB_Weight = ((1 - Team_ORB_pct) * Team_Play_pct) /
      (((1 - Team_ORB_pct) * Team_Play_pct) + (Team_ORB_pct * (1 - Team_Play_pct)) || 1);

    const teamPossTotal = team.cleanFga + 0.44 * team.cleanFta + team.cleanTov;
    usagePct = teamPossTotal > 0 && cleanMin > 0
      ? 100 * (p_fga + 0.44 * p_fta + p_tov) / (teamPossTotal / teamMinutes * cleanMin) / 5 : 0;
    minPct   = 100 * cleanMin / teamMinutes * 5;
    shotsPct = team.cleanFga > 0 && cleanMin > 0
      ? (p_fga / team.cleanFga) / (cleanMin / teamMinutes) / 5 * 100 : 0;

    orbPct = cleanMin > 0 && (team.cleanOrb + opp_drb_clean) > 0
      ? (p_orb / cleanMin) * (teamMinutes / 5) / (team.cleanOrb + opp_drb_clean) * 100 : 0;
    drbPct = cleanMin > 0 && (drb_clean + team.cleanOppOrb) > 0
      ? (p_drb / cleanMin) * (teamMinutes / 5) / (drb_clean + team.cleanOppOrb) * 100 : 0;

    const aRateDenom = ((cleanMin / (teamMinutes / 5)) * (team.fgm / team.games * team.cleanGames)) - p_fgm;
    aRate = aRateDenom > 0 ? (p_ast / aRateDenom) * 100 : 0;

    const playerPoss = p_fga + 0.44 * p_fta + p_tov;
    toRate = playerPoss > 0 ? (p_tov / playerPoss) * 100 : 0;

    const oppPoss = team.cleanOppFga - team.cleanOppOrb + team.cleanOppTov + 0.475 * team.cleanOppFta;
    const opp2PA  = team.cleanOppFga - (team.tpm / team.games * team.cleanGames);
    blkPct = (cleanMin * opp2PA) > 0 ? 100 * (p_blk * (teamMinutes / 5)) / (cleanMin * opp2PA) : 0;
    stlPct = (cleanMin * oppPoss) > 0 ? 100 * (p_stl * (teamMinutes / 5)) / (cleanMin * oppPoss) : 0;

    // ORtg (Dean Oliver)
    const qAST = ((cleanMin / (teamMinutes / 5)) * (1.14 * (((team.fgm / team.games * team.cleanGames) - p_fgm) / (team.fgm / team.games * team.cleanGames || 1)))) +
      ((((team.ast / teamMinutes) * cleanMin * 5 - p_ast) / (((team.fgm / teamMinutes) * cleanMin * 5 - p_fgm) || 1)) * (1 - cleanMin / (teamMinutes / 5)));
    const FG_Part  = p_fgm * (1 - 0.5 * ((p_pts - p_ftm) / (2 * p_fga || 1)) * qAST);
    const AST_Part = 0.5 * (((team.points / team.games * team.cleanGames - team.ftm / team.games * team.cleanGames) - (p_pts - p_ftm)) /
      (2 * ((team.cleanFga - p_fga) || 1))) * p_ast;
    const FT_Part  = (1 - Math.pow(1 - (p_ftm / (p_fta || 1)), 2)) * 0.4 * p_fta;
    const ORB_Part = p_orb * Team_ORB_Weight * Team_Play_pct;
    const ScPoss   = (FG_Part + AST_Part + FT_Part) * (1 - (team.cleanOrb / Team_Scoring_Poss) * Team_ORB_Weight * Team_Play_pct) + ORB_Part;
    const FGxPoss  = (p_fga - p_fgm) * (1 - 1.07 * Team_ORB_pct);
    const FTxPoss  = Math.pow(1 - (p_ftm / (p_fta || 1)), 2) * 0.4 * p_fta;
    const TotPoss  = ScPoss + FGxPoss + FTxPoss + p_tov;
    const PProd_FG  = 2 * (p_fgm + 0.5 * p_tpm) * (1 - 0.5 * ((p_pts - p_ftm) / (2 * p_fga || 1)) * qAST);
    const PProd_AST = 2 * ((team.cleanFga > 0 ? (team.fgm / team.games * team.cleanGames - p_fgm + 0.5 * (team.tpm / team.games * team.cleanGames - p_tpm)) /
      ((team.fgm / team.games * team.cleanGames - p_fgm) || 1) : 0)) *
      0.5 * (((team.points / team.games * team.cleanGames - team.ftm / team.games * team.cleanGames) - (p_pts - p_ftm)) /
        (2 * ((team.cleanFga - p_fga) || 1))) * p_ast;
    const PProd_ORB = p_orb * Team_ORB_Weight * Team_Play_pct *
      ((team.points / team.games * team.cleanGames) / (team.cleanFga + (1 - Math.pow(1 - (team.ftm / team.fta || 0.7), 2)) * 0.4 * team.cleanFta || 1));
    const PProd = (PProd_FG + PProd_AST + p_ftm) * (1 - (team.cleanOrb / Team_Scoring_Poss) * Team_ORB_Weight * Team_Play_pct) + PProd_ORB;
    ortg = TotPoss > 0 ? 100 * PProd / TotPoss : 0;
  }

  const efg     = fga > 0 ? ((fgm + 0.5 * tpm) / fga) * 100 : 0;
  const ts      = (fga + 0.475 * fta) > 0 ? (pts / (2 * (fga + 0.475 * fta))) * 100 : 0;
  const ftRate  = fga > 0 ? (fta / fga) * 100 : 0;
  const twopm   = fgm - tpm;
  const twopa   = fga - tpa;
  const twopPct = twopa > 0 ? (twopm / twopa) * 100 : 0;
  const tpPct   = tpa > 0 ? (tpm / tpa) * 100 : 0;
  const ftPct   = fta > 0 ? (ftm / fta) * 100 : 0;
  const fgPct   = fga > 0 ? (fgm / fga) * 100 : 0;

  return {
    ortg, usagePct, minPct, shotsPct, efg, ts,
    orbPct, drbPct, aRate, toRate, blkPct, stlPct, ftRate,
    twopm, twopa, twopPct, tpm, tpa, tpPct, ftm, fta, ftPct, fgPct,
    ppg: pts/g, rpg: trb/g, orbpg: orb/g, drbpg: drb/g,
    apg: ast/g, spg: stl/g, bpg: blk/g, mpg: totalMin/g,
    p40: pts/m*40, r40: trb/m*40, orb40: orb/m*40, drb40: drb/m*40,
    a40: ast/m*40, s40: stl/m*40, b40: blk/m*40, fc40: pf/m*40,
    twopm40: twopm/m*40, twopa40: twopa/m*40, twopPct40: twopPct,
    tpm40: tpm/m*40, tpa40: tpa/m*40, tpPct40: tpPct,
    ftm40: ftm/m*40, fta40: fta/m*40, ftPct40: ftPct,
  };
}

const ADVANCED_COLS: { label: string; key: SortKey }[] = [
  { label: '%Min',   key: 'minPct'   }, { label: 'ORtg',   key: 'ortg'     },
  { label: '%Usg',   key: 'usagePct' }, { label: '%Shots', key: 'shotsPct' },
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

export default function NjcaaWomensDivisionPage() {
  const [players, setPlayers]     = useState<Player[]>([]);
  const [teamMap, setTeamMap]     = useState<Map<string, TeamRow>>(new Map());
  const [loading, setLoading]     = useState(true);
  const [statMode, setStatMode]   = useState<StatMode>('advanced');
  const [searchTerm, setSearchTerm] = useState('');
  const [minMinutes, setMinMinutes] = useState(0);
  const [sortKey, setSortKey]     = useState<SortKey>('minPct');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  useEffect(() => {
    fetch('/api/recruiting/womens/juco')
      .then(r => r.json())
      .then(({ players, teams }) => {
        setPlayers(players ?? []);
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

  const filtered = useMemo(() => players.filter(p => {
    if (!hasStats(p)) return false;
    if (minMinutes > 0 && (p.minutes ?? 0) < minMinutes) return false;
    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      if (!p.name.toLowerCase().includes(q) &&
          !p.teamName.toLowerCase().includes(q)) return false;
    }
    return true;
  }), [players, searchTerm, minMinutes]);

  const sorted = useMemo(() => [...filtered].sort((a, b) => {
    if (sortKey === 'name') return sortOrder === 'asc' ? a.name.localeCompare(b.name) : b.name.localeCompare(a.name);
    if (sortKey === 'teamName') return sortOrder === 'asc' ? a.teamName.localeCompare(b.teamName) : b.teamName.localeCompare(a.teamName);
    if (sortKey === 'games') { const ag = a.games ?? 0, bg = b.games ?? 0; return sortOrder === 'asc' ? ag - bg : bg - ag; }
    const as_ = calcStats(a, teamMap.get(a.teamName));
    const bs_ = calcStats(b, teamMap.get(b.teamName));
    if (!as_ && !bs_) return 0;
    if (!as_) return 1;
    if (!bs_) return -1;
    const av = (as_ as Record<string, number>)[sortKey] ?? 0;
    const bv = (bs_ as Record<string, number>)[sortKey] ?? 0;
    return sortOrder === 'asc' ? av - bv : bv - av;
  }), [filtered, sortKey, sortOrder, teamMap]);

  const SortableHeader = ({ label, sk, align = 'right' }: { label: string; sk: SortKey; align?: 'left' | 'right' | 'center' }) => (
    <th onClick={() => handleSort(sk)} style={{
      padding: '6px 8px', textAlign: align, cursor: 'pointer', userSelect: 'none',
      fontWeight: 700, fontSize: 10, whiteSpace: 'nowrap',
      background: sortKey === sk ? ACCENT : 'transparent',
      color: sortKey === sk ? '#fff' : 'inherit', transition: 'background 0.15s',
    }}>
      {label} {sortKey === sk && (sortOrder === 'desc' ? '↓' : '↑')}
    </th>
  );

  const exportCSV = () => {
    const headers = ['Name', 'Team', '#', 'G', ...activeCols.map(c => c.label)];
    const rows = sorted.map(p => {
      const stats = calcStats(p, teamMap.get(p.teamName));
      return [
        csvField(p.name),
        csvField(p.teamName),
        csvField(p.jersey ?? ''),
        csvField(p.games ?? ''),
        ...activeCols.map(c => {
          const val = stats ? (stats as Record<string, number>)[c.key] : undefined;
          if (val == null) return '';
          return INTEGER_KEYS.has(c.key) ? String(Math.round(val)) : val.toFixed(1);
        }),
      ];
    });
    const csv = [headers.map(csvField), ...rows].map(r => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'njcaa_womens_d1.csv'; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <>
      <SiteNavigation currentDivision="womens-d1" currentPage="recruiting" divisionPath="/womens-d1" />
      <main style={{ maxWidth: '100%', margin: '0 auto', padding: 20 }}>
        <div style={{ display: 'flex', gap: 0, borderBottom: `2px solid ${FROST}`, marginBottom: 24 }}>
          {['Transfers', 'JUCO', 'High School'].map(tab => (
            <a key={tab} href={tab === 'Transfers' ? '/womens-d1/recruiting' : tab === 'JUCO' ? '/womens-d1/recruiting/juco' : '/womens-d1/recruiting/highschool'}
              style={{
                padding: '10px 20px', fontFamily: "'Outfit', sans-serif", fontSize: 14, fontWeight: 700,
                color: tab === 'JUCO' ? SKY : MUTED,
                borderBottom: tab === 'JUCO' ? `3px solid ${ACCENT}` : '3px solid transparent',
                marginBottom: -2, letterSpacing: '0.01em', textDecoration: 'none',
              }}>
              {tab}
            </a>
          ))}
        </div>

        {/* Row 1: Search + Stat mode toggle */}
        <div style={{ display: 'flex', gap: 12, marginBottom: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <input type="text" placeholder="Search player or team..." value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            style={{ padding: '8px 12px', border: `1px solid ${ICE}`, borderRadius: 6, fontSize: 13, flex: 1, minWidth: 200, outline: 'none', fontFamily: "'Outfit', sans-serif" }} />

          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: 10, color: MUTED, fontFamily: "'Outfit', sans-serif", fontWeight: 600 }}>Stat Mode</span>
            <div style={{ display: 'flex', borderRadius: 6, overflow: 'hidden', border: `1px solid ${ICE}` }}>
              {([{ key: 'advanced', label: 'Advanced' }, { key: 'perGame', label: 'Per Game' }, { key: 'per40', label: 'Per 40' }] as { key: StatMode; label: string }[]).map(({ key, label }) => (
                <button key={key} onClick={() => setStatMode(key)} style={{
                  padding: '7px 16px', fontSize: 12, fontWeight: 600, cursor: 'pointer',
                  fontFamily: "'Outfit', sans-serif", border: 'none', outline: 'none',
                  background: statMode === key ? ACCENT : '#fff', color: statMode === key ? '#fff' : MUTED,
                  transition: 'background 0.15s, color 0.15s',
                }}>{label}</button>
              ))}
            </div>
          </div>
        </div>

        {/* Row 2: Min minutes + Export */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 12, color: MUTED, fontFamily: "'Outfit', sans-serif", fontWeight: 600 }}>Min. Minutes:</span>
            <div style={{ display: 'flex', borderRadius: 6, overflow: 'hidden', border: `1px solid ${ICE}` }}>
              {MIN_MINUTES_OPTIONS.map(val => (
                <button key={val} onClick={() => setMinMinutes(val)} style={{
                  padding: '5px 10px', fontSize: 11, fontWeight: 600, cursor: 'pointer',
                  fontFamily: "'Outfit', sans-serif", border: 'none', outline: 'none',
                  background: minMinutes === val ? ACCENT : '#fff', color: minMinutes === val ? '#fff' : MUTED,
                  transition: 'background 0.15s, color 0.15s',
                }}>{val === 0 ? 'All' : val}</button>
              ))}
            </div>
          </div>
          <button onClick={exportCSV} style={{
            padding: '7px 16px', fontSize: 12, fontWeight: 600, cursor: 'pointer',
            fontFamily: "'Outfit', sans-serif", border: 'none', borderRadius: 6,
            background: ACCENT, color: '#fff',
          }}>
            Export to Excel
          </button>
        </div>

        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: MUTED }}>Loading...</div>
        ) : (
          <>
            <p style={{ fontSize: 12, color: MUTED, marginBottom: 12 }}>
              Showing {sorted.length} players
            </p>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11, whiteSpace: 'nowrap' }}>
                <thead>
                  <tr style={{ borderBottom: `2px solid ${ACCENT}`, background: FROST }}>
                    <SortableHeader label="Player" sk="name" align="left" />
                    <SortableHeader label="Team" sk="teamName" align="left" />
                    <th style={{ padding: '6px 8px', textAlign: 'center', fontWeight: 700, fontSize: 10 }}>#</th>
                    <SortableHeader label="G" sk="games" />
                    {activeCols.map(col => <SortableHeader key={col.key} label={col.label} sk={col.key} />)}
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((p, idx) => {
                    const stats = calcStats(p, teamMap.get(p.teamName));
                    const bg = idx % 2 === 0 ? '#fff' : '#fafafa';
                    return (
                      <tr key={p.playerId} style={{ borderBottom: '1px solid #f0f0f0', background: bg }}>
                        <td style={{ padding: '5px 8px', fontWeight: 600, position: 'sticky', left: 0, background: bg, zIndex: 1, minWidth: 140, maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {p.name}
                        </td>
                        <td style={{ padding: '5px 8px', color: MUTED, minWidth: 160, maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {p.teamName}
                        </td>
                        <td style={{ padding: '5px 8px', textAlign: 'center' }}>{p.jersey || '—'}</td>
                        <td style={{ padding: '5px 8px', textAlign: 'right' }}>{p.games ?? '—'}</td>
                        {activeCols.map(col => {
                          const val = stats ? (stats as Record<string, number>)[col.key] : undefined;
                          return (
                            <td key={col.key} style={{
                              padding: '5px 8px', textAlign: 'right',
                              fontWeight: col.key === sortKey ? 600 : 400,
                              color: !stats ? MUTED : 'inherit',
                            }}>
                              {val != null ? (INTEGER_KEYS.has(col.key) ? Math.round(val) : val.toFixed(1)) : '—'}
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
