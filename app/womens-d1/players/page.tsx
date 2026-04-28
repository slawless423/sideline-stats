'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import SiteNavigation from '@/components/SiteNavigation';

const ACCENT = "#3B9EFF";
const NAVY   = "#0D1F3C";
const SKY    = "#2E7DD1";
const ICE    = "#A8C8F0";
const FROST  = "#E8F2FC";
const MUTED  = "#6B7E9A";

type StatMode = 'advanced' | 'perGame' | 'per40';

type Player = {
  playerId: string;
  firstName: string;
  lastName: string;
  teamName: string;
  teamId: string;
  year: string;
  height: number | null;
  position: string;
  number: number;
  games: number;
  starts: number;
  minutes: number;
  fgm: number; fga: number; tpm: number; tpa: number;
  ftm: number; fta: number; orb: number; drb: number;
  trb: number; ast: number; stl: number; blk: number;
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

type SortKey = 'name' | 'team' | 'games' | 'starts' | 'minPct' | 'ortg' | 'usagePct' | 'shotPct' |
  'efg' | 'ts' | 'orbPct' | 'drbPct' | 'aRate' | 'toRate' | 'blkPct' | 'stlPct' | 'ftRate' |
  'ftPct' | 'twoPct' | 'threePct' | 'ppg' | 'rpg' | 'orbpg' | 'drbpg' | 'apg' | 'spg' | 'bpg' | 'mpg' |
  'p40' | 'r40' | 'orb40' | 'drb40' | 'a40' | 's40' | 'b40' | 'fc40' | 'fgPct' |
  'twopm' | 'twopa' | 'tpm' | 'tpa' | 'ftm' | 'fta';
type SortOrder = 'asc' | 'desc';

const ADVANCED_COLS: { label: string; key: SortKey }[] = [
  { label: '%Min',    key: 'minPct'   },
  { label: 'ORtg',    key: 'ortg'     },
  { label: '%Usage',  key: 'usagePct' },
  { label: '%Shots',  key: 'shotPct'  },
  { label: 'eFG%',    key: 'efg'      },
  { label: 'TS%',     key: 'ts'       },
  { label: 'OR%',     key: 'orbPct'   },
  { label: 'DR%',     key: 'drbPct'   },
  { label: 'ARate',   key: 'aRate'    },
  { label: 'TORate',  key: 'toRate'   },
  { label: 'Blk%',    key: 'blkPct'   },
  { label: 'Stl%',    key: 'stlPct'   },
  { label: 'FTRate',  key: 'ftRate'   },
  { label: '2PM',     key: 'twopm'    },
  { label: '2PA',     key: 'twopa'    },
  { label: '2P%',     key: 'twoPct'   },
  { label: '3PM',     key: 'tpm'      },
  { label: '3PA',     key: 'tpa'      },
  { label: '3P%',     key: 'threePct' },
  { label: 'FTM',     key: 'ftm'      },
  { label: 'FTA',     key: 'fta'      },
  { label: 'FT%',     key: 'ftPct'    },
];

const PER_GAME_COLS: { label: string; key: SortKey }[] = [
  { label: 'PPG',  key: 'ppg'      },
  { label: 'RPG',  key: 'rpg'      },
  { label: 'ORB',  key: 'orbpg'    },
  { label: 'DRB',  key: 'drbpg'    },
  { label: 'APG',  key: 'apg'      },
  { label: 'SPG',  key: 'spg'      },
  { label: 'BPG',  key: 'bpg'      },
  { label: 'MPG',  key: 'mpg'      },
  { label: 'FG%',  key: 'fgPct'    },
  { label: '2PM',  key: 'twopm'    },
  { label: '2PA',  key: 'twopa'    },
  { label: '2P%',  key: 'twoPct'   },
  { label: '3PM',  key: 'tpm'      },
  { label: '3PA',  key: 'tpa'      },
  { label: '3P%',  key: 'threePct' },
  { label: 'FTM',  key: 'ftm'      },
  { label: 'FTA',  key: 'fta'      },
  { label: 'FT%',  key: 'ftPct'    },
];

const PER_40_COLS: { label: string; key: SortKey }[] = [
  { label: 'PTS/40', key: 'p40'      },
  { label: 'REB/40', key: 'r40'      },
  { label: 'ORB/40', key: 'orb40'    },
  { label: 'DRB/40', key: 'drb40'    },
  { label: 'AST/40', key: 'a40'      },
  { label: 'STL/40', key: 's40'      },
  { label: 'BLK/40', key: 'b40'      },
  { label: 'FC/40',  key: 'fc40'     },
  { label: 'FG%',    key: 'fgPct'    },
  { label: '2PM',    key: 'twopm'    },
  { label: '2PA',    key: 'twopa'    },
  { label: '2P%',    key: 'twoPct'   },
  { label: '3PM',    key: 'tpm'      },
  { label: '3PA',    key: 'tpa'      },
  { label: '3P%',    key: 'threePct' },
  { label: 'FTM',    key: 'ftm'      },
  { label: 'FTA',    key: 'fta'      },
  { label: 'FT%',    key: 'ftPct'    },
];

function formatHeight(inches: number | null | undefined): string {
  if (!inches || inches === 0) return '—';
  const feet = Math.floor(inches / 12);
  const remaining = inches % 12;
  return `${feet}'${remaining}"`;
}

export default function WomensD1PlayersPage() {
  const [players, setPlayers] = useState<Player[]>([]);
  const [teamStats, setTeamStats] = useState<Map<string, TeamStats>>(new Map());
  const [filteredPlayers, setFilteredPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);
  const [statMode, setStatMode] = useState<StatMode>('advanced');
  const [sortKey, setSortKey] = useState<SortKey>('minPct');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
  const [searchTerm, setSearchTerm] = useState('');
  const [minMinutes, setMinMinutes] = useState(100);

  useEffect(() => {
    Promise.all([
      fetch(`/api/womens-d1/players?minMinutes=${minMinutes}`).then(res => res.json()),
      fetch('/api/womens-d1/teams/stats').then(res => res.json()),
    ]).then(([playersData, teamsData]) => {
      setPlayers(playersData.players);
      setFilteredPlayers(playersData.players);
      const statsMap = new Map();
      teamsData.teams.forEach((t: any) => {
        statsMap.set(t.teamId, {
          games: t.games,
          fga: t.fga, fgm: t.fgm, tpm: t.tpm,
          orb: t.orb, tov: t.tov, fta: t.fta, ftm: t.ftm,
          ast: t.ast, points: t.points,
          opp_fga: t.opp_fga, opp_tpa: t.opp_tpa, opp_tpm: t.opp_tpm,
          opp_orb: t.opp_orb, opp_tov: t.opp_tov, opp_fta: t.opp_fta,
          opp_ftm: t.opp_ftm, opp_points: t.opp_points,
          trb: t.trb, opp_trb: t.opp_trb,
        });
      });
      setTeamStats(statsMap);
      setLoading(false);
    });
  }, [minMinutes]);

  useEffect(() => {
    const filtered = players.filter(p => {
      const fullName = `${p.firstName} ${p.lastName}`.toLowerCase();
      const team = p.teamName.toLowerCase();
      const search = searchTerm.toLowerCase();
      return fullName.includes(search) || team.includes(search);
    });
    setFilteredPlayers(filtered);
  }, [searchTerm, players]);

  const calculatePlayerStats = (p: Player) => {
    const team = teamStats.get(p.teamId);
    if (!team) return null;

    const teamMinutes = team.games * 200;
    const opp_drb = team.opp_trb - team.opp_orb;
    const drb = team.trb - team.orb;
    const twoPA = p.fga - p.tpa;
    const twoPM = p.fgm - p.tpm;

    // %Min — used as ORtg gate
    const minPct = teamMinutes > 0 ? (p.minutes / teamMinutes) * 100 * 5 : 0;

    // Team-level Dean Oliver factors with NaN guards
    const Team_ORB_pct = (team.orb + opp_drb) > 0
      ? team.orb / (team.orb + opp_drb) : 0;
    const team_ftm_rate = team.fta > 0 ? team.ftm / team.fta : 0;
    const Team_Scoring_Poss = team.fgm +
      (1 - Math.pow(1 - team_ftm_rate, 2)) * team.fta * 0.4;
    const teamPlayDenom = team.fga + team.fta * 0.4 + team.tov;
    const Team_Play_pct = teamPlayDenom > 0
      ? Team_Scoring_Poss / teamPlayDenom : 0;
    const orbWeightDenom =
      (1 - Team_ORB_pct) * Team_Play_pct + Team_ORB_pct * (1 - Team_Play_pct);
    const Team_ORB_Weight = orbWeightDenom > 0
      ? ((1 - Team_ORB_pct) * Team_Play_pct) / orbWeightDenom : 0;

    // Per-game-style rates
    const teamPossTotal = team.fga + 0.44 * team.fta + team.tov;
    const usagePct = (teamMinutes > 0 && p.minutes > 0 && teamPossTotal > 0)
      ? 100 * (p.fga + 0.44 * p.fta + p.tov) /
        (teamPossTotal / teamMinutes * p.minutes) / 5
      : null;
    const shotPct = (team.fga > 0 && p.minutes > 0 && teamMinutes > 0)
      ? (p.fga / team.fga) / (p.minutes / teamMinutes) / 5 * 100 : null;

    // Shooting percentages — null when no attempts
    const efg = p.fga > 0 ? ((p.fgm + 0.5 * p.tpm) / p.fga) * 100 : null;
    const ts = (p.fga + 0.475 * p.fta) > 0
      ? (p.points / (2 * (p.fga + 0.475 * p.fta))) * 100 : null;
    const orbPct = (p.minutes > 0 && (team.orb + opp_drb) > 0)
      ? (p.orb / p.minutes) * (teamMinutes / 5) / (team.orb + opp_drb) * 100 : null;
    const drbPct = (p.minutes > 0 && (drb + team.opp_orb) > 0)
      ? (p.drb / p.minutes) * (teamMinutes / 5) / (drb + team.opp_orb) * 100 : null;
    const aRateDenom = ((p.minutes / (teamMinutes / 5)) * team.fgm) - p.fgm;
    const aRate = aRateDenom > 0 ? (p.ast / aRateDenom) * 100 : null;
    const playerPossSimple = p.fga + 0.44 * p.fta + p.tov;
    const toRate = playerPossSimple > 0 ? (p.tov / playerPossSimple) * 100 : null;
    const oppPoss = team.opp_fga - team.opp_orb + team.opp_tov + 0.475 * team.opp_fta;
    const opp2PA = team.opp_fga - team.opp_tpa;
    const blkPct = (p.minutes * opp2PA) > 0
      ? 100 * (p.blk * (teamMinutes / 5)) / (p.minutes * opp2PA) : null;
    const stlPct = (p.minutes * oppPoss) > 0
      ? 100 * (p.stl * (teamMinutes / 5)) / (p.minutes * oppPoss) : null;
    const fc40 = p.minutes > 0 ? p.pf * (40 / p.minutes) : null;
    const ftRate = p.fga > 0 ? (p.fta / p.fga) * 100 : null;
    const ftPct = p.fta > 0 ? (p.ftm / p.fta) * 100 : null;
    const twoPct = twoPA > 0 ? (twoPM / twoPA) * 100 : null;
    const threePct = p.tpa > 0 ? (p.tpm / p.tpa) * 100 : null;
    const fgPct = p.fga > 0 ? (p.fgm / p.fga) * 100 : null;

    // ORtg — Dean Oliver with full NaN guards on every sub-term
    let ortg: number | null = null;
    if (
      minPct >= 5 &&
      p.minutes > 0 && teamMinutes > 0 &&
      p.fga > 0 && team.fgm > 0 && team.fga > 0 &&
      Team_Scoring_Poss > 0 && teamPossTotal > 0
    ) {
      const minShare = p.minutes / (teamMinutes / 5); // == minPct/100
      const teamFgmExPlayer = team.fgm - p.fgm;
      const teamFgaExPlayer = team.fga - p.fga;
      const teamPtsExPlayerNoFt = (team.points - team.ftm) - (p.points - p.ftm);
      const player_ftm_rate = p.fta > 0 ? p.ftm / p.fta : 0;

      // qAST — both branches need their own divide guards
      const qAstA = team.fgm > 0
        ? minShare * (1.14 * ((team.ast - p.ast) / team.fgm))
        : 0;
      const qAstBNum = (team.ast / teamMinutes) * p.minutes * 5 - p.ast;
      const qAstBDen = (team.fgm / teamMinutes) * p.minutes * 5 - p.fgm;
      const qAstB = qAstBDen > 0
        ? (qAstBNum / qAstBDen) * (1 - minShare)
        : 0;
      const qAST = qAstA + qAstB;

      // FG_Part — guarded on p.fga
      const FG_Part = p.fga > 0
        ? p.fgm * (1 - 0.5 * ((p.points - p.ftm) / (2 * p.fga)) * qAST)
        : 0;
      // AST_Part — guarded on (team.fga - p.fga)
      const AST_Part = teamFgaExPlayer > 0
        ? 0.5 * (teamPtsExPlayerNoFt / (2 * teamFgaExPlayer)) * p.ast
        : 0;
      // FT_Part — guarded on p.fta (defaults to 0, NOT 0.7)
      const FT_Part = p.fta > 0
        ? (1 - Math.pow(1 - player_ftm_rate, 2)) * 0.4 * p.fta
        : 0;
      const ORB_Part_sc = p.orb * Team_ORB_Weight * Team_Play_pct;

      const orbScale = Team_Scoring_Poss > 0
        ? (team.orb / Team_Scoring_Poss) * Team_ORB_Weight * Team_Play_pct
        : 0;
      const ScPoss = (FG_Part + AST_Part + FT_Part) * (1 - orbScale) + ORB_Part_sc;
      const FGxPoss = (p.fga - p.fgm) * (1 - 1.07 * Team_ORB_pct);
      const FTxPoss = p.fta > 0
        ? Math.pow(1 - player_ftm_rate, 2) * 0.4 * p.fta
        : 0;
      const TotPoss = ScPoss + FGxPoss + FTxPoss + p.tov;

      const PProd_FG_Part = p.fga > 0
        ? 2 * (p.fgm + 0.5 * p.tpm) *
          (1 - 0.5 * ((p.points - p.ftm) / (2 * p.fga)) * qAST)
        : 0;
      const PProd_AST_Part = (teamFgmExPlayer > 0 && teamFgaExPlayer > 0)
        ? 2 * ((teamFgmExPlayer + 0.5 * (team.tpm - p.tpm)) / teamFgmExPlayer) *
          0.5 * (teamPtsExPlayerNoFt / (2 * teamFgaExPlayer)) * p.ast
        : 0;
      const teamPtsPerScPoss = Team_Scoring_Poss > 0
        ? team.points / Team_Scoring_Poss
        : 0;
      const PProd_ORB_Part = p.orb * Team_ORB_Weight * Team_Play_pct *
        teamPtsPerScPoss;
      const PProd = (PProd_FG_Part + PProd_AST_Part + p.ftm) *
        (1 - orbScale) + PProd_ORB_Part;

      if (TotPoss > 0 && Number.isFinite(PProd) && Number.isFinite(TotPoss)) {
        const computed = 100 * PProd / TotPoss;
        if (Number.isFinite(computed)) ortg = computed;
      }
    }

    // Per-game / per-40 — explicit > 0 guards, null when zero
    const ppg   = p.games   > 0 ? p.points  / p.games   : null;
    const rpg   = p.games   > 0 ? p.trb     / p.games   : null;
    const orbpg = p.games   > 0 ? p.orb     / p.games   : null;
    const drbpg = p.games   > 0 ? p.drb     / p.games   : null;
    const apg   = p.games   > 0 ? p.ast     / p.games   : null;
    const spg   = p.games   > 0 ? p.stl     / p.games   : null;
    const bpg   = p.games   > 0 ? p.blk     / p.games   : null;
    const mpg   = p.games   > 0 ? p.minutes / p.games   : null;
    const p40   = p.minutes > 0 ? p.points  / p.minutes * 40 : null;
    const r40   = p.minutes > 0 ? p.trb     / p.minutes * 40 : null;
    const orb40 = p.minutes > 0 ? p.orb     / p.minutes * 40 : null;
    const drb40 = p.minutes > 0 ? p.drb     / p.minutes * 40 : null;
    const a40   = p.minutes > 0 ? p.ast     / p.minutes * 40 : null;
    const s40   = p.minutes > 0 ? p.stl     / p.minutes * 40 : null;
    const b40   = p.minutes > 0 ? p.blk     / p.minutes * 40 : null;

    return {
      minPct, ortg, usagePct, shotPct, efg, ts, orbPct, drbPct,
      aRate, toRate, blkPct, stlPct, fc40, ftRate, ftPct, twoPct, threePct,
      fgPct, ppg, rpg, orbpg, drbpg, apg, spg, bpg, mpg,
      p40, r40, orb40, drb40, a40, s40, b40,
      twopm: p.fgm - p.tpm, twopa: p.fga - p.tpa,
      tpm: p.tpm, tpa: p.tpa, ftm: p.ftm, fta: p.fta,
    };
  };

  const handleSort = (key: SortKey) => {
    if (sortKey === key) { setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc'); }
    else { setSortKey(key); setSortOrder('desc'); }
  };

  const activeCols = statMode === 'advanced' ? ADVANCED_COLS : statMode === 'perGame' ? PER_GAME_COLS : PER_40_COLS;

  const sortedPlayers = [...filteredPlayers].sort((a, b) => {
    if (sortKey === 'name') {
      const aName = `${a.lastName} ${a.firstName}`;
      const bName = `${b.lastName} ${b.firstName}`;
      return sortOrder === 'asc' ? aName.localeCompare(bName) : bName.localeCompare(aName);
    }
    if (sortKey === 'team') {
      return sortOrder === 'asc' ? a.teamName.localeCompare(b.teamName) : b.teamName.localeCompare(a.teamName);
    }
    if (sortKey === 'games') return sortOrder === 'asc' ? a.games - b.games : b.games - a.games;
    if (sortKey === 'starts') return sortOrder === 'asc' ? a.starts - b.starts : b.starts - a.starts;
    const aStats = calculatePlayerStats(a);
    const bStats = calculatePlayerStats(b);
    if (!aStats || !bStats) return 0;
    const aVal = (aStats as any)[sortKey] ?? 0;
    const bVal = (bStats as any)[sortKey] ?? 0;
    return sortOrder === 'asc' ? aVal - bVal : bVal - aVal;
  });

  const exportCSV = () => {
    const exportCols = statMode === 'advanced' ? ADVANCED_COLS : statMode === 'perGame' ? PER_GAME_COLS : PER_40_COLS;
    const headers = ['Player', 'Team', 'Year', 'Height', 'G', 'S', ...exportCols.map(c => c.label)];
    const rows = sortedPlayers.map(p => {
      const stats = calculatePlayerStats(p);
      const ht = !p.height || p.height === 0 ? '' : `${Math.floor(p.height / 12)}'${p.height % 12}"`;
      if (!stats) return Array(headers.length).fill('');
      return [
        `${p.firstName} ${p.lastName}`,
        p.teamName, p.year || '', ht, p.games, p.starts || 0,
        ...exportCols.map(c => {
          const val = (stats as any)[c.key];
          return val != null ? Number(val).toFixed(1) : '';
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
    a.download = `womens-d1_players_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const SortableHeader = ({ label, sk, align = 'right' }: { label: string; sk: SortKey; align?: 'left' | 'right' | 'center' }) => (
    <th onClick={() => handleSort(sk)} style={{
      padding: '6px 8px', textAlign: align, cursor: 'pointer', userSelect: 'none',
      fontWeight: 700, fontSize: 10, whiteSpace: 'nowrap',
      background: sortKey === sk ? ACCENT : 'transparent',
      color: sortKey === sk ? '#fff' : 'inherit',
      transition: 'background 0.15s',
    }}>
      {label} {sortKey === sk && (sortOrder === 'desc' ? '↓' : '↑')}
    </th>
  );

  if (loading) {
    return <div style={{ padding: 40, textAlign: 'center', fontFamily: "'Outfit', sans-serif" }}>Loading players...</div>;
  }

  return (
    <>
      <SiteNavigation currentDivision="womens-d1" currentPage="players" divisionPath="/womens-d1" />
      <main style={{ maxWidth: '100%', margin: '0 auto', padding: 20 }}>

        {/* ── Controls bar ── */}
        <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>

          {/* Search */}
          <input
            type="text"
            placeholder="Search by player name or team..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            style={{
              padding: '8px 12px', border: `1px solid ${ICE}`, borderRadius: 6,
              fontSize: 13, flex: 1, minWidth: 250, outline: 'none',
              fontFamily: "'Outfit', sans-serif",
            }}
          />

          {/* Min Minutes */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <label style={{ fontSize: 13, color: MUTED, fontFamily: "'Outfit', sans-serif", fontWeight: 600 }}>
              Min Minutes:
            </label>
            <select
              value={minMinutes}
              onChange={e => setMinMinutes(Number(e.target.value))}
              style={{
                padding: '8px 12px', border: `1px solid ${ICE}`, borderRadius: 6,
                fontSize: 13, outline: 'none', fontFamily: "'Outfit', sans-serif",
                color: NAVY, background: '#fff', cursor: 'pointer',
              }}
            >
              <option value="0">All Players</option>
              <option value="50">50+</option>
              <option value="100">100+</option>
              <option value="200">200+</option>
              <option value="300">300+</option>
            </select>
          </div>

          {/* Stat mode toggle */}
          <div style={{ display: 'flex', borderRadius: 6, overflow: 'hidden', border: `1px solid ${ICE}`, marginLeft: 'auto' }}>
            {(['advanced', 'perGame', 'per40'] as StatMode[]).map(mode => (
              <button
                key={mode}
                onClick={() => setStatMode(mode)}
                style={{
                  padding: '7px 16px', fontSize: 12, fontWeight: 600, cursor: 'pointer',
                  fontFamily: "'Outfit', sans-serif", border: 'none', outline: 'none',
                  background: statMode === mode ? NAVY : '#fff',
                  color: statMode === mode ? '#fff' : MUTED,
                  transition: 'background 0.15s, color 0.15s',
                }}
              >
                {mode === 'advanced' ? 'Advanced' : mode === 'perGame' ? 'Per Game' : 'Per 40'}
              </button>
            ))}
          </div>
        </div>

        {/* ── Count + Export row ── */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <p style={{ fontSize: 12, color: MUTED, margin: 0, fontFamily: "'Outfit', sans-serif" }}>
            Showing {sortedPlayers.length} players
          </p>
          <button
            onClick={exportCSV}
            style={{
              padding: '6px 14px', background: ACCENT, color: '#fff',
              border: 'none', borderRadius: 6, fontSize: 12, fontWeight: 600,
              cursor: 'pointer', fontFamily: "'Outfit', sans-serif",
              display: 'flex', alignItems: 'center', gap: 6,
            }}
          >
            ↓ Export CSV
          </button>
        </div>

        {/* ── Table ── */}
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, whiteSpace: 'nowrap' }}>
            <thead>
              <tr style={{ background: NAVY, color: '#fff' }}>
                <th
                  onClick={() => handleSort('name')}
                  style={{
                    padding: '6px 8px', textAlign: 'left', position: 'sticky', left: 0,
                    background: NAVY, zIndex: 2, cursor: 'pointer', userSelect: 'none',
                    fontWeight: 700, fontSize: 10, whiteSpace: 'nowrap', minWidth: 150,
                  }}
                >
                  Player {sortKey === 'name' && (sortOrder === 'desc' ? '↓' : '↑')}
                </th>
                <th
                  onClick={() => handleSort('team')}
                  style={{
                    padding: '6px 8px', textAlign: 'left', cursor: 'pointer', userSelect: 'none',
                    fontWeight: 700, fontSize: 10, whiteSpace: 'nowrap',
                    background: sortKey === 'team' ? ACCENT : 'transparent',
                    transition: 'background 0.15s',
                  }}
                >
                  Team {sortKey === 'team' && (sortOrder === 'desc' ? '↓' : '↑')}
                </th>
                <th style={{ padding: '6px 8px', textAlign: 'center', fontWeight: 700, fontSize: 10 }}>Yr</th>
                <th style={{ padding: '6px 8px', textAlign: 'center', fontWeight: 700, fontSize: 10 }}>Ht</th>
                <SortableHeader label="G"  sk="games"  />
                <SortableHeader label="S"  sk="starts" />
                {activeCols.map(col => (
                  <SortableHeader key={col.key} label={col.label} sk={col.key} />
                ))}
              </tr>
            </thead>
            <tbody>
              {sortedPlayers.map((p, idx) => {
                const stats = calculatePlayerStats(p);
                if (!stats) return null;
                const bg = idx % 2 === 0 ? '#fff' : '#EAF4FF';
                return (
                  <tr key={p.playerId} style={{ borderBottom: '1px solid #e8f2fc' }}>
                    <td style={{
                      padding: '5px 8px', fontWeight: 600, position: 'sticky', left: 0,
                      background: bg, zIndex: 1, maxWidth: 150,
                      overflow: 'hidden', textOverflow: 'ellipsis',
                      fontFamily: "'Outfit', sans-serif",
                    }}>
                      {p.firstName} {p.lastName}
                    </td>
                    <td style={{ padding: '5px 8px', maxWidth: 110, overflow: 'hidden', textOverflow: 'ellipsis', background: bg }}>
                      <Link href={`/womens-d1/team/${p.teamId}`} style={{ color: SKY, textDecoration: 'none' }}>
                        {p.teamName}
                      </Link>
                    </td>
                    <td style={{ padding: '5px 8px', textAlign: 'center', background: bg }}>{p.year || '—'}</td>
                    <td style={{ padding: '5px 8px', textAlign: 'center', background: bg }}>{formatHeight(p.height)}</td>
                    <td style={{ padding: '5px 8px', textAlign: 'right', background: bg }}>{p.games}</td>
                    <td style={{ padding: '5px 8px', textAlign: 'right', background: bg }}>{p.starts || 0}</td>
                    {activeCols.map(col => {
                      const val = (stats as any)[col.key];
                      const isActiveSort = sortKey === col.key;
                      return (
                        <td key={col.key} style={{
                          padding: '5px 8px', textAlign: 'right',
                          fontWeight: isActiveSort ? 700 : 400,
                          background: bg,
                        }}>
                          {val != null
                            ? (['twopm','twopa','tpm','tpa','ftm','fta'].includes(col.key)
                                ? Math.round(Number(val))
                                : Number(val).toFixed(1))
                            : '—'}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </main>
    </>
  );
}
