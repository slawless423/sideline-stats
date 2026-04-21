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

type StatMode = 'advanced' | 'perGame' | 'per40';

type HSPlayer = {
  id: number;
  full_name: string;
  team: string;
  league: string;
  season: string;
  grad_year: number | null;
  height: string | null;
  gp: number;
  mp: number;
  pts: number;
  fgm: number; fga: number;
  fg3m: number; fg3a: number;
  ftm: number; fta: number;
  oreb: number; dreb: number; reb: number;
  ast: number; stl: number; blk: number;
  tov: number;
};

type HSTeamStats = {
  team: string;
  league: string;
  season: string;
  gp: number;
  mp: number;
  fgm: number; fga: number;
  fg3m: number; fg3a: number;
  ftm: number; fta: number;
  oreb: number; dreb: number; reb: number;
  ast: number; stl: number; blk: number;
  tov: number; pts: number;
  opp_fgm: number; opp_fga: number;
  opp_fg3m: number; opp_fg3a: number;
  opp_ftm: number; opp_fta: number;
  opp_oreb: number; opp_dreb: number; opp_reb: number;
  opp_ast: number; opp_stl: number; opp_blk: number;
  opp_tov: number; opp_pts: number;
};

type HSSortKey =
  | 'name' | 'team' | 'league' | 'season' | 'grad_year' | 'gp'
  | 'ortg' | 'usagePct' | 'minPct' | 'shotsPct' | 'efg' | 'ts' | 'orbPct' | 'drbPct'
  | 'aRate' | 'toRate' | 'blkPct' | 'stlPct' | 'ftRate'
  | 'twopm' | 'twopa' | 'twopPct' | 'fg3m' | 'fg3a' | 'tpPct' | 'ftm' | 'fta' | 'ftPct' | 'fgPct' | 'height'
  | 'ppg' | 'rpg' | 'orbpg' | 'drbpg' | 'apg' | 'spg' | 'bpg' | 'mpg'
  | 'p40' | 'r40' | 'orb40' | 'drb40' | 'a40' | 's40' | 'b40' | 'totalMin'
  | 'twopm40' | 'twopa40' | 'twopPct40' | 'fg3m40' | 'fg3a40' | 'tpPct40' | 'ftm40' | 'fta40' | 'ftPct40';

const MIN_MINUTES_OPTIONS = [0, 50, 100, 150, 200, 300];

const HEIGHT_OPTIONS = [
  "5'0\"","5'1\"","5'2\"","5'3\"","5'4\"","5'5\"","5'6\"","5'7\"","5'8\"","5'9\"","5'10\"","5'11\"",
  "6'0\"","6'1\"","6'2\"","6'3\"","6'4\"","6'5\"","6'6\"","6'7\"",
];

function heightToInches(h: string): number {
  const m = h.match(/(\d+)'(\d+)"/);
  if (!m) return 0;
  return parseInt(m[1]) * 12 + parseInt(m[2]);
}

function csvField(val: string | number | null | undefined): string {
  const s = val == null ? '' : String(val);
  if (s.includes(',') || s.includes('"') || s.includes('\n')) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

// HS stat calc — uses actual team.mp from DB (not gp * constant), so OT games are handled correctly.
function calcHSStats(p: HSPlayer, team: HSTeamStats | undefined) {
  if (!team || p.gp === 0 || p.mp === 0) return null;
  const teamMinutes = team.mp;
  const opp_drb = team.opp_reb - team.opp_oreb;
  const drb = team.reb - team.oreb;
  const Team_ORB_pct = team.oreb / (team.oreb + opp_drb);
  const Team_Scoring_Poss = team.fgm + (1 - Math.pow(1 - team.ftm / team.fta, 2)) * team.fta * 0.4;
  const Team_Play_pct = Team_Scoring_Poss / (team.fga + team.fta * 0.4 + team.tov);
  const Team_ORB_Weight = ((1 - Team_ORB_pct) * Team_Play_pct) / ((1 - Team_ORB_pct) * Team_Play_pct + Team_ORB_pct * (1 - Team_Play_pct));
  const teamPossTotal = team.fga + 0.44 * team.fta + team.tov;
  const usagePct = 100 * (p.fga + 0.44 * p.fta + p.tov) / (teamPossTotal / teamMinutes * p.mp) / 5;
  const minPct = 100 * p.mp / teamMinutes * 5;
  const shotsPct = team.fga > 0 && p.mp > 0 ? (p.fga / team.fga) / (p.mp / teamMinutes) / 5 * 100 : 0;
  const efg = p.fga > 0 ? ((p.fgm + 0.5 * p.fg3m) / p.fga) * 100 : 0;
  const ts = (p.fga + 0.475 * p.fta) > 0 ? (p.pts / (2 * (p.fga + 0.475 * p.fta))) * 100 : 0;
  const orbPct = p.mp > 0 && (team.oreb + opp_drb) > 0 ? (p.oreb / p.mp) * (teamMinutes / 5) / (team.oreb + opp_drb) * 100 : 0;
  const drbPct = p.mp > 0 && (drb + team.opp_oreb) > 0 ? (p.dreb / p.mp) * (teamMinutes / 5) / (drb + team.opp_oreb) * 100 : 0;
  const aRateDenom = ((p.mp / (teamMinutes / 5)) * team.fgm) - p.fgm;
  const aRate = aRateDenom > 0 ? (p.ast / aRateDenom) * 100 : 0;
  const playerPoss = p.fga + 0.44 * p.fta + p.tov;
  const toRate = playerPoss > 0 ? (p.tov / playerPoss) * 100 : 0;
  const oppPoss = team.opp_fga - team.opp_oreb + team.opp_tov + 0.475 * team.opp_fta;
  const opp2PA = team.opp_fga - team.opp_fg3a;
  const blkPct = (p.mp * opp2PA) > 0 ? 100 * (p.blk * (teamMinutes / 5)) / (p.mp * opp2PA) : 0;
  const stlPct = (p.mp * oppPoss) > 0 ? 100 * (p.stl * (teamMinutes / 5)) / (p.mp * oppPoss) : 0;
  const ftRate = p.fga > 0 ? (p.fta / p.fga) * 100 : 0;
  const twopm = p.fgm - p.fg3m; const twopa = p.fga - p.fg3a;
  const twopPct = twopa > 0 ? (twopm / twopa) * 100 : 0;
  const tpPct = p.fg3a > 0 ? (p.fg3m / p.fg3a) * 100 : 0;
  const ftPct = p.fta > 0 ? (p.ftm / p.fta) * 100 : 0;
  const fgPct = p.fga > 0 ? (p.fgm / p.fga) * 100 : 0;
  const qAST = ((p.mp / (teamMinutes / 5)) * (1.14 * ((team.ast - p.ast) / team.fgm))) +
    ((((team.ast / teamMinutes) * p.mp * 5 - p.ast) / ((team.fgm / teamMinutes) * p.mp * 5 - p.fgm)) * (1 - p.mp / (teamMinutes / 5)));
  const FG_Part = p.fgm * (1 - 0.5 * ((p.pts - p.ftm) / (2 * p.fga)) * qAST);
  const AST_Part = 0.5 * (((team.pts - team.ftm) - (p.pts - p.ftm)) / (2 * (team.fga - p.fga))) * p.ast;
  const FT_Part = (1 - Math.pow(1 - p.ftm / p.fta, 2)) * 0.4 * p.fta;
  const ORB_Part = p.oreb * Team_ORB_Weight * Team_Play_pct;
  const ScPoss = (FG_Part + AST_Part + FT_Part) * (1 - (team.oreb / Team_Scoring_Poss) * Team_ORB_Weight * Team_Play_pct) + ORB_Part;
  const FGxPoss = (p.fga - p.fgm) * (1 - 1.07 * Team_ORB_pct);
  const FTxPoss = Math.pow(1 - p.ftm / p.fta, 2) * 0.4 * p.fta;
  const TotPoss = ScPoss + FGxPoss + FTxPoss + p.tov;
  const PProd_FG = 2 * (p.fgm + 0.5 * p.fg3m) * (1 - 0.5 * ((p.pts - p.ftm) / (2 * p.fga)) * qAST);
  const PProd_AST = 2 * ((team.fgm - p.fgm + 0.5 * (team.fg3m - p.fg3m)) / (team.fgm - p.fgm)) *
    0.5 * (((team.pts - team.ftm) - (p.pts - p.ftm)) / (2 * (team.fga - p.fga))) * p.ast;
  const PProd_ORB = p.oreb * Team_ORB_Weight * Team_Play_pct *
    (team.pts / (team.fgm + (1 - Math.pow(1 - team.ftm / team.fta, 2)) * 0.4 * team.fta));
  const PProd = (PProd_FG + PProd_AST + p.ftm) * (1 - (team.oreb / Team_Scoring_Poss) * Team_ORB_Weight * Team_Play_pct) + PProd_ORB;
  const ortg = TotPoss > 0 ? 100 * PProd / TotPoss : 0;
  const g = p.gp || 1; const m = p.mp || 1;
  return {
    ortg, usagePct, minPct, shotsPct, efg, ts, orbPct, drbPct, aRate, toRate, blkPct, stlPct, ftRate,
    twopm, twopa, twopPct, fg3m: p.fg3m, fg3a: p.fg3a, tpPct, ftm: p.ftm, fta: p.fta, ftPct, fgPct,
    ppg: p.pts/g, rpg: p.reb/g, orbpg: p.oreb/g, drbpg: p.dreb/g,
    apg: p.ast/g, spg: p.stl/g, bpg: p.blk/g, mpg: p.mp/g,
    totalMin: p.mp,
    p40: p.pts/m*40, r40: p.reb/m*40, orb40: p.oreb/m*40, drb40: p.dreb/m*40,
    a40: p.ast/m*40, s40: p.stl/m*40, b40: p.blk/m*40,
    twopm40: twopm, twopa40: twopa, twopPct40: twopPct,
    fg3m40: p.fg3m, fg3a40: p.fg3a, tpPct40: tpPct,
    ftm40: p.ftm, fta40: p.fta, ftPct40: ftPct,
  };
}

const HS_ADVANCED_COLS: { label: string; key: HSSortKey }[] = [
  { label: '%Min', key: 'minPct' }, { label: 'ORtg', key: 'ortg' },
  { label: '%Usg', key: 'usagePct' }, { label: '%Shots', key: 'shotsPct' },
  { label: 'eFG%', key: 'efg' }, { label: 'TS%', key: 'ts' },
  { label: 'OR%', key: 'orbPct' }, { label: 'DR%', key: 'drbPct' },
  { label: 'ARate', key: 'aRate' }, { label: 'TORate', key: 'toRate' },
  { label: 'Blk%', key: 'blkPct' }, { label: 'Stl%', key: 'stlPct' },
  { label: 'FTRate', key: 'ftRate' }, { label: '2PM', key: 'twopm' },
  { label: '2PA', key: 'twopa' }, { label: '2P%', key: 'twopPct' },
  { label: '3PM', key: 'fg3m' }, { label: '3PA', key: 'fg3a' },
  { label: '3P%', key: 'tpPct' }, { label: 'FTM', key: 'ftm' },
  { label: 'FTA', key: 'fta' }, { label: 'FT%', key: 'ftPct' },
];

const HS_PER_GAME_COLS: { label: string; key: HSSortKey }[] = [
  { label: 'PPG', key: 'ppg' }, { label: 'RPG', key: 'rpg' },
  { label: 'ORB', key: 'orbpg' }, { label: 'DRB', key: 'drbpg' },
  { label: 'APG', key: 'apg' }, { label: 'SPG', key: 'spg' },
  { label: 'BPG', key: 'bpg' }, { label: '2PM', key: 'twopm' },
  { label: '2PA', key: 'twopa' }, { label: '2P%', key: 'twopPct' },
  { label: '3PM', key: 'fg3m' }, { label: '3PA', key: 'fg3a' },
  { label: '3P%', key: 'tpPct' }, { label: 'FTM', key: 'ftm' },
  { label: 'FTA', key: 'fta' }, { label: 'FT%', key: 'ftPct' },
];

const HS_PER_40_COLS: { label: string; key: HSSortKey }[] = [
  { label: 'PTS/40', key: 'p40' }, { label: 'REB/40', key: 'r40' },
  { label: 'ORB/40', key: 'orb40' }, { label: 'DRB/40', key: 'drb40' },
  { label: 'AST/40', key: 'a40' }, { label: 'STL/40', key: 's40' },
  { label: 'BLK/40', key: 'b40' }, { label: '2PM', key: 'twopm40' },
  { label: '2PA', key: 'twopa40' }, { label: '2P%', key: 'twopPct40' },
  { label: '3PM', key: 'fg3m40' }, { label: '3PA', key: 'fg3a40' },
  { label: '3P%', key: 'tpPct40' }, { label: 'FTM', key: 'ftm40' },
  { label: 'FTA', key: 'fta40' }, { label: 'FT%', key: 'ftPct40' },
];

const INTEGER_KEYS = new Set(['twopm','twopa','fg3m','fg3a','ftm','fta',
  'twopm40','twopa40','fg3m40','fg3a40','ftm40','fta40', 'totalMin']);

export default function WomensHighSchoolPage() {
  const [hsPlayers, setHsPlayers]   = useState<HSPlayer[]>([]);
  const [hsTeamMap, setHsTeamMap]   = useState<Map<string, HSTeamStats>>(new Map());
  const [loading, setLoading]       = useState(true);
  const [statMode, setStatMode]     = useState<StatMode>('advanced');
  const [searchTerm, setSearchTerm] = useState('');
  const [minMinutes, setMinMinutes] = useState(0);
  const [leagueFilter, setLeagueFilter] = useState('all');
  const [seasonFilter, setSeasonFilter] = useState('all');
  const [gradYearFilter, setGradYearFilter] = useState('all');
  const [minHeightFilter, setMinHeightFilter] = useState('');
  const [maxHeightFilter, setMaxHeightFilter] = useState('');
  const [hsFilterOpen, setHsFilterOpen] = useState(false);
  const [hsSortKey, setHsSortKey]   = useState<HSSortKey>('ppg');
  const [hsSortOrder, setHsSortOrder] = useState<'asc' | 'desc'>('desc');

  useEffect(() => {
    fetch('/api/recruiting/womens/highschool')
      .then(r => r.json())
      .then(({ players, teams }) => {
        setHsPlayers(players ?? []);
        const map = new Map<string, HSTeamStats>();
        for (const t of (teams ?? [])) map.set(`${t.team}|||${t.league}|||${t.season}`, t);
        setHsTeamMap(map);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const handleHsSort = (key: HSSortKey) => {
    if (hsSortKey === key) setHsSortOrder(o => o === 'asc' ? 'desc' : 'asc');
    else { setHsSortKey(key); setHsSortOrder('desc'); }
  };

  const hsActiveCols = statMode === 'advanced' ? HS_ADVANCED_COLS : statMode === 'perGame' ? HS_PER_GAME_COLS : HS_PER_40_COLS;

  const leagues = useMemo(() => ['all', ...Array.from(new Set(hsPlayers.map(p => p.league))).sort()], [hsPlayers]);
  const seasons = useMemo(() => ['all', ...Array.from(new Set(hsPlayers.map(p => p.season))).sort().reverse()], [hsPlayers]);
  const gradYears = useMemo(() => ['all', ...Array.from(new Set(hsPlayers.filter(p => p.grad_year).map(p => String(p.grad_year)))).sort()], [hsPlayers]);

  const hsActiveFilterCount = [
    leagueFilter !== 'all', seasonFilter !== 'all',
    gradYearFilter !== 'all', minHeightFilter !== '', maxHeightFilter !== '',
  ].filter(Boolean).length;

  const filteredHs = useMemo(() => hsPlayers.filter(p => {
    if (p.gp === 0 || p.mp === 0) return false;
    if (minMinutes > 0 && p.mp < minMinutes) return false;
    if (leagueFilter !== 'all' && p.league !== leagueFilter) return false;
    if (seasonFilter !== 'all' && p.season !== seasonFilter) return false;
    if (gradYearFilter !== 'all' && String(p.grad_year) !== gradYearFilter) return false;
    if (minHeightFilter && p.height) {
      if (heightToInches(p.height) < heightToInches(minHeightFilter)) return false;
    }
    if (maxHeightFilter && p.height) {
      if (heightToInches(p.height) > heightToInches(maxHeightFilter)) return false;
    }
    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      if (!p.full_name.toLowerCase().includes(q) && !p.team.toLowerCase().includes(q)) return false;
    }
    return true;
  }), [hsPlayers, leagueFilter, seasonFilter, gradYearFilter, minHeightFilter, maxHeightFilter, searchTerm, minMinutes]);

  const sortedHs = useMemo(() => [...filteredHs].sort((a, b) => {
    if (hsSortKey === 'name') return hsSortOrder==='asc'?a.full_name.localeCompare(b.full_name):b.full_name.localeCompare(a.full_name);
    if (hsSortKey === 'team') return hsSortOrder==='asc'?a.team.localeCompare(b.team):b.team.localeCompare(a.team);
    if (hsSortKey === 'gp') return hsSortOrder==='asc'?a.gp-b.gp:b.gp-a.gp;
    if (hsSortKey === 'grad_year') { const ay=a.grad_year??0,by=b.grad_year??0; return hsSortOrder==='asc'?ay-by:by-ay; }
    if (hsSortKey === 'height') {
      const ah = heightToInches(a.height??''), bh = heightToInches(b.height??'');
      return hsSortOrder==='asc'?ah-bh:bh-ah;
    }
    const as_ = calcHSStats(a, hsTeamMap.get(`${a.team}|||${a.league}|||${a.season}`));
    const bs_ = calcHSStats(b, hsTeamMap.get(`${b.team}|||${b.league}|||${b.season}`));
    if (!as_ && !bs_) return 0; if (!as_) return 1; if (!bs_) return -1;
    const av = (as_ as Record<string,number>)[hsSortKey]??0;
    const bv = (bs_ as Record<string,number>)[hsSortKey]??0;
    return hsSortOrder==='asc'?av-bv:bv-av;
  }), [filteredHs, hsSortKey, hsSortOrder, hsTeamMap]);

  const exportCSV = () => {
    const headers = ['Name','Team','League','Season','Grad Year','G','MP',...hsActiveCols.map(c=>c.label)];
    const rows = sortedHs.map(p => {
      const stats = calcHSStats(p, hsTeamMap.get(`${p.team}|||${p.league}|||${p.season}`));
      return [csvField(p.full_name),csvField(p.team),csvField(p.league),csvField(p.season),
        csvField(p.grad_year??''),csvField(p.gp),csvField(p.mp),
        ...hsActiveCols.map(c => { const v=stats?(stats as Record<string,number>)[c.key]:undefined; if(v==null)return''; return INTEGER_KEYS.has(c.key)?String(Math.round(v)):v.toFixed(1); })];
    });
    const csv=[headers.map(csvField),...rows].map(r=>r.join(',')).join('\n');
    const blob=new Blob([csv],{type:'text/csv'});const url=URL.createObjectURL(blob);
    const a=document.createElement('a');a.href=url;a.download='womens_highschool.csv';a.click();URL.revokeObjectURL(url);
  };

  const HSSortableHeader = ({ label, sk, align='right' }: { label: string; sk: HSSortKey; align?: 'left'|'right'|'center' }) => (
    <th onClick={() => handleHsSort(sk)} style={{
      padding: '6px 8px', textAlign: align, cursor: 'pointer', userSelect: 'none',
      fontWeight: 700, fontSize: 10, whiteSpace: 'nowrap',
      background: hsSortKey===sk ? ACCENT : 'transparent',
      color: hsSortKey===sk ? '#fff' : 'inherit', transition: 'background 0.15s',
    }}>
      {label} {hsSortKey===sk && (hsSortOrder==='desc'?'↓':'↑')}
    </th>
  );

  return (
    <>
      <SiteNavigation currentDivision="womens-d1" currentPage="recruiting" divisionPath="/womens-d1" />
      <main style={{ maxWidth: '100%', margin: '0 auto', padding: 20 }}>

        {/* Sub-nav tabs — same pattern as the transfers page, High School active */}
        <div style={{ display: 'flex', gap: 0, borderBottom: `2px solid ${FROST}`, marginBottom: 24 }}>
          {['Transfers', 'JUCO', 'High School'].map(tab => (
            <a key={tab} href={tab === 'Transfers' ? '/womens-d1/recruiting' : tab === 'JUCO' ? '/womens-d1/recruiting/juco' : '/womens-d1/recruiting/highschool'}
              style={{
                padding: '10px 20px', fontFamily: "'Outfit', sans-serif", fontSize: 14, fontWeight: 700,
                color: tab === 'High School' ? SKY : MUTED,
                borderBottom: tab === 'High School' ? `3px solid ${ACCENT}` : '3px solid transparent',
                marginBottom: -2, letterSpacing: '0.01em', textDecoration: 'none',
              }}>
              {tab}
            </a>
          ))}
        </div>

        {/* Filter popup overlay */}
        {hsFilterOpen && (
          <div style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.3)', zIndex: 1000,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }} onClick={() => setHsFilterOpen(false)}>
            <div style={{
              background: '#fff', borderRadius: 12, padding: 28, width: 480, maxWidth: '95vw',
              boxShadow: '0 8px 40px rgba(0,0,0,0.18)', fontFamily: "'Outfit', sans-serif",
            }} onClick={e => e.stopPropagation()}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                <span style={{ fontSize: 16, fontWeight: 700, color: NAVY }}>Filters</span>
                <button onClick={() => setHsFilterOpen(false)} style={{
                  background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: MUTED, lineHeight: 1,
                }}>✕</button>
              </div>

              {/* League */}
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: MUTED, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>League</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {leagues.map(val => (
                    <button key={val} onClick={() => setLeagueFilter(val)} style={{
                      padding: '6px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer', borderRadius: 6,
                      fontFamily: "'Outfit', sans-serif", border: `1px solid ${leagueFilter===val ? NAVY : ICE}`,
                      background: leagueFilter===val ? NAVY : '#fff', color: leagueFilter===val ? '#fff' : MUTED,
                      transition: 'all 0.15s',
                    }}>{val === 'all' ? 'All' : val}</button>
                  ))}
                </div>
              </div>

              {/* Season */}
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: MUTED, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Season</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {seasons.map(val => (
                    <button key={val} onClick={() => setSeasonFilter(val)} style={{
                      padding: '6px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer', borderRadius: 6,
                      fontFamily: "'Outfit', sans-serif", border: `1px solid ${seasonFilter===val ? NAVY : ICE}`,
                      background: seasonFilter===val ? NAVY : '#fff', color: seasonFilter===val ? '#fff' : MUTED,
                      transition: 'all 0.15s',
                    }}>{val === 'all' ? 'All' : val}</button>
                  ))}
                </div>
              </div>

              {/* Grad Year */}
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: MUTED, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Grad Year</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {gradYears.map(val => (
                    <button key={val} onClick={() => setGradYearFilter(val)} style={{
                      padding: '6px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer', borderRadius: 6,
                      fontFamily: "'Outfit', sans-serif", border: `1px solid ${gradYearFilter===val ? NAVY : ICE}`,
                      background: gradYearFilter===val ? NAVY : '#fff', color: gradYearFilter===val ? '#fff' : MUTED,
                      transition: 'all 0.15s',
                    }}>{val === 'all' ? 'All' : val}</button>
                  ))}
                </div>
              </div>

              {/* Height Range */}
              <div style={{ marginBottom: 24 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: MUTED, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Height Range</div>
                <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 11, color: MUTED, marginBottom: 4 }}>Min</div>
                    <select value={minHeightFilter} onChange={e => setMinHeightFilter(e.target.value)} style={{
                      width: '100%', padding: '8px 10px', border: `1px solid ${ICE}`, borderRadius: 6,
                      fontSize: 13, fontFamily: "'Outfit', sans-serif", outline: 'none', background: '#fff', color: NAVY,
                    }}>
                      <option value="">No minimum</option>
                      {HEIGHT_OPTIONS.map(h => <option key={h} value={h}>{h}</option>)}
                    </select>
                  </div>
                  <div style={{ paddingTop: 20, color: MUTED, fontSize: 13 }}>—</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 11, color: MUTED, marginBottom: 4 }}>Max</div>
                    <select value={maxHeightFilter} onChange={e => setMaxHeightFilter(e.target.value)} style={{
                      width: '100%', padding: '8px 10px', border: `1px solid ${ICE}`, borderRadius: 6,
                      fontSize: 13, fontFamily: "'Outfit', sans-serif", outline: 'none', background: '#fff', color: NAVY,
                    }}>
                      <option value="">No maximum</option>
                      {HEIGHT_OPTIONS.map(h => <option key={h} value={h}>{h}</option>)}
                    </select>
                  </div>
                </div>
              </div>

              {/* Footer buttons */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <button onClick={() => {
                  setLeagueFilter('all'); setSeasonFilter('all');
                  setGradYearFilter('all'); setMinHeightFilter(''); setMaxHeightFilter('');
                }} style={{
                  padding: '7px 16px', fontSize: 12, fontWeight: 600, cursor: 'pointer',
                  fontFamily: "'Outfit', sans-serif", border: `1px solid ${ICE}`, borderRadius: 6,
                  background: '#fff', color: MUTED,
                }}>Clear All</button>
                <button onClick={() => setHsFilterOpen(false)} style={{
                  padding: '7px 20px', fontSize: 12, fontWeight: 600, cursor: 'pointer',
                  fontFamily: "'Outfit', sans-serif", border: 'none', borderRadius: 6,
                  background: ACCENT, color: '#fff',
                }}>Apply</button>
              </div>
            </div>
          </div>
        )}

        {/* Row 1: Search + Filter button + Stat mode */}
        <div style={{ display: 'flex', gap: 12, marginBottom: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <input type="text" placeholder="Search player or team..." value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            style={{ padding: '8px 12px', border: `1px solid ${ICE}`, borderRadius: 6, fontSize: 13, flex: 1, minWidth: 200, outline: 'none', fontFamily: "'Outfit', sans-serif" }} />

          <button onClick={() => setHsFilterOpen(true)} style={{
            padding: '8px 16px', fontSize: 12, fontWeight: 600, cursor: 'pointer',
            fontFamily: "'Outfit', sans-serif", borderRadius: 6,
            border: `1px solid ${hsActiveFilterCount > 0 ? ACCENT : ICE}`,
            background: hsActiveFilterCount > 0 ? FROST : '#fff',
            color: hsActiveFilterCount > 0 ? ACCENT : MUTED,
            display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap',
          }}>
            ⚙ Filters
            {hsActiveFilterCount > 0 && (
              <span style={{
                background: ACCENT, color: '#fff', borderRadius: '50%',
                width: 18, height: 18, display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 10, fontWeight: 700,
              }}>{hsActiveFilterCount}</span>
            )}
          </button>

          <div style={{ display: 'flex', borderRadius: 6, overflow: 'hidden', border: `1px solid ${ICE}` }}>
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

        {/* Row 2: Min minutes + Export */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 12, color: MUTED, fontFamily: "'Outfit', sans-serif", fontWeight: 600 }}>Min. Minutes:</span>
            <div style={{ display: 'flex', borderRadius: 6, overflow: 'hidden', border: `1px solid ${ICE}` }}>
              {MIN_MINUTES_OPTIONS.map(val => (
                <button key={val} onClick={() => setMinMinutes(val)} style={{
                  padding: '5px 10px', fontSize: 11, fontWeight: 600, cursor: 'pointer',
                  fontFamily: "'Outfit', sans-serif", border: 'none', outline: 'none',
                  background: minMinutes===val ? ACCENT : '#fff', color: minMinutes===val ? '#fff' : MUTED,
                  transition: 'background 0.15s, color 0.15s',
                }}>{val === 0 ? 'All' : val}</button>
              ))}
            </div>
          </div>
          <button onClick={exportCSV} style={{
            padding: '7px 16px', fontSize: 12, fontWeight: 600, cursor: 'pointer',
            fontFamily: "'Outfit', sans-serif", border: 'none', borderRadius: 6,
            background: ACCENT, color: '#fff',
          }}>Export to Excel</button>
        </div>

        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: MUTED }}>Loading...</div>
        ) : (
          <>
            <p style={{ fontSize: 12, color: MUTED, marginBottom: 12 }}>
              Showing {sortedHs.length} players
            </p>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11, whiteSpace: 'nowrap' }}>
                <thead>
                  <tr style={{ borderBottom: `2px solid ${ACCENT}`, background: FROST }}>
                    <HSSortableHeader label="Player" sk="name" align="left" />
                    <HSSortableHeader label="Team" sk="team" align="left" />
                    <th style={{ padding: '6px 8px', textAlign: 'center', fontWeight: 700, fontSize: 10 }}>Season</th>
                    <th style={{ padding: '6px 8px', textAlign: 'left', fontWeight: 700, fontSize: 10 }}>League</th>
                    <HSSortableHeader label="Class" sk="grad_year" align="center" />
                    <HSSortableHeader label="Ht" sk="height" align="center" />
                    <HSSortableHeader label="G" sk="gp" />
                    {statMode === 'perGame' && <HSSortableHeader label="MPG" sk="mpg" />}
                    {statMode === 'per40' && <th style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 700, fontSize: 10 }}>MIN</th>}
                    {hsActiveCols.map(col => <HSSortableHeader key={col.key} label={col.label} sk={col.key} />)}
                  </tr>
                </thead>
                <tbody>
                  {sortedHs.map((p, idx) => {
                    const stats = calcHSStats(p, hsTeamMap.get(`${p.team}|||${p.league}|||${p.season}`));
                    const bg = idx%2===0 ? '#fff' : '#fafafa';
                    return (
                      <tr key={`${p.id}`} style={{ borderBottom: '1px solid #f0f0f0', background: bg }}>
                        <td title={p.full_name} style={{ padding: '5px 8px', fontWeight: 600, position: 'sticky', left: 0, background: bg, zIndex: 1, minWidth: 140, maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          <Link href={`/womens-d1/recruiting/highschool/${p.id}`} style={{ color: NAVY, textDecoration: 'none' }}
                            onMouseEnter={e => (e.currentTarget.style.color = ACCENT)}
                            onMouseLeave={e => (e.currentTarget.style.color = NAVY)}>
                            {p.full_name}
                          </Link>
                        </td>
                        <td title={p.team} style={{ padding: '5px 8px', color: MUTED, minWidth: 100, maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.team}</td>
                        <td style={{ padding: '5px 8px', textAlign: 'center', color: ACCENT, fontWeight: 600 }}>{p.season}</td>
                        <td style={{ padding: '5px 8px', minWidth: 100 }}>
                          <a
                            href={`/api/recruiting/womens/highschool/pdf?league=${encodeURIComponent(p.league)}&season=${encodeURIComponent(p.season)}`}
                            download
                            style={{ textDecoration: 'none' }}
                          >
                            <span style={{ display: 'inline-block', padding: '1px 6px', borderRadius: 4, fontSize: 10, fontWeight: 600, background: FROST, color: NAVY, cursor: 'pointer' }}
                              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = ICE; }}
                              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = FROST; }}
                            >{p.league}</span>
                          </a>
                        </td>
                        <td style={{ padding: '5px 8px', textAlign: 'center' }}>{p.grad_year || '—'}</td>
                        <td style={{ padding: '5px 8px', textAlign: 'center' }}>{p.height || '—'}</td>
                        <td style={{ padding: '5px 8px', textAlign: 'right' }}>{p.gp}</td>
                        {statMode === 'perGame' && (
                          <td style={{ padding: '5px 8px', textAlign: 'right' }}>{p.mp > 0 ? (p.mp / p.gp).toFixed(1) : '—'}</td>
                        )}
                        {statMode === 'per40' && (
                          <td style={{ padding: '5px 8px', textAlign: 'right' }}>{p.mp}</td>
                        )}
                        {hsActiveCols.map(col => {
                          const val = stats ? (stats as Record<string,number>)[col.key] : undefined;
                          return (
                            <td key={col.key} style={{ padding: '5px 8px', textAlign: 'right', fontWeight: col.key===hsSortKey?600:400 }}>
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
