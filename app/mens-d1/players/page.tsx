'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import SiteNavigation from '@/components/SiteNavigation';

const ACCENT = "#4f46e5";
const ACCENT_LIGHT = "#f5f5ff";

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
  { label: 'ORtg',    key: 'ortg'     },
  { label: '%Min',    key: 'minPct'   },
  { label: '%Usage',  key: 'usagePct' },
  { label: '%Shots',  key: 'shotPct'  },
  { label: 'eFG%',   key: 'efg'      },
  { label: 'TS%',    key: 'ts'       },
  { label: 'OR%',    key: 'orbPct'   },
  { label: 'DR%',    key: 'drbPct'   },
  { label: 'ARate',   key: 'aRate'    },
  { label: 'TORate',  key: 'toRate'   },
  { label: 'Blk%',   key: 'blkPct'   },
  { label: 'Stl%',   key: 'stlPct'   },
  { label: 'FTRate',  key: 'ftRate'   },
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

const PER_GAME_COLS: { label: string; key: SortKey }[] = [
  { label: 'PPG',  key: 'ppg'   },
  { label: 'RPG',  key: 'rpg'   },
  { label: 'ORB',  key: 'orbpg' },
  { label: 'DRB',  key: 'drbpg' },
  { label: 'APG',  key: 'apg'   },
  { label: 'SPG',  key: 'spg'   },
  { label: 'BPG',  key: 'bpg'   },
  { label: 'MPG',  key: 'mpg'   },
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
  { label: 'PTS/40', key: 'p40'   },
  { label: 'REB/40', key: 'r40'   },
  { label: 'ORB/40', key: 'orb40' },
  { label: 'DRB/40', key: 'drb40' },
  { label: 'AST/40', key: 'a40'   },
  { label: 'STL/40', key: 's40'   },
  { label: 'BLK/40', key: 'b40'   },
  { label: 'FC/40',  key: 'fc40'  },
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
  if (!inches || inches === 0) return "—";
  const feet = Math.floor(inches / 12);
  const remaining = inches % 12;
  return `${feet}'${remaining}"`;
}

export default function MensD1PlayersPage() {
  const [players, setPlayers] = useState<Player[]>([]);
  const [teamStats, setTeamStats] = useState<Map<string, TeamStats>>(new Map());
  const [filteredPlayers, setFilteredPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);
  const [statMode, setStatMode] = useState<StatMode>('advanced');
  const [sortKey, setSortKey] = useState<SortKey>('usagePct');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
  const [searchTerm, setSearchTerm] = useState('');
  const [minMinutes, setMinMinutes] = useState(100);

  useEffect(() => {
    Promise.all([
      fetch(`/api/mens-d1/players?minMinutes=${minMinutes}`).then(res => res.json()),
      fetch('/api/mens-d1/teams/stats').then(res => res.json()),
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

    const Team_ORB_pct = team.orb / (team.orb + opp_drb);
    const Team_Scoring_Poss = team.fgm +
      (1 - Math.pow(1 - team.ftm / team.fta, 2)) * team.fta * 0.4;
    const Team_Play_pct = Team_Scoring_Poss / (team.fga + team.fta * 0.4 + team.tov);
    const Team_ORB_Weight =
      ((1 - Team_ORB_pct) * Team_Play_pct) /
      ((1 - Team_ORB_pct) * Team_Play_pct + Team_ORB_pct * (1 - Team_Play_pct));

    const minPct = teamMinutes > 0 ? (p.minutes / teamMinutes) * 100 * 5 : 0;
    const teamPossTotal = team.fga + 0.44 * team.fta + team.tov;
    const usagePct = 100 * (p.fga + 0.44 * p.fta + p.tov) /
      (teamPossTotal / teamMinutes * p.minutes) / 5;
    const shotPct = team.fga > 0 && p.minutes > 0
      ? (p.fga / team.fga) / (p.minutes / teamMinutes) / 5 * 100 : 0;
    const efg = p.fga > 0 ? ((p.fgm + 0.5 * p.tpm) / p.fga) * 100 : 0;
    const ts = (p.fga + 0.475 * p.fta) > 0
      ? (p.points / (2 * (p.fga + 0.475 * p.fta))) * 100 : 0;
    const orbPct = p.minutes > 0 && (team.orb + opp_drb) > 0
      ? (p.orb / p.minutes) * (teamMinutes / 5) / (team.orb + opp_drb) * 100 : 0;
    const drbPct = p.minutes > 0 && (drb + team.opp_orb) > 0
      ? (p.drb / p.minutes) * (teamMinutes / 5) / (drb + team.opp_orb) * 100 : 0;
    const aRateDenom = ((p.minutes / (teamMinutes / 5)) * team.fgm) - p.fgm;
    const aRate = aRateDenom > 0 ? (p.ast / aRateDenom) * 100 : 0;
    const playerPossSimple = p.fga + 0.44 * p.fta + p.tov;
    const toRate = playerPossSimple > 0 ? (p.tov / playerPossSimple) * 100 : 0;
    const oppPoss = team.opp_fga - team.opp_orb + team.opp_tov + 0.475 * team.opp_fta;
    const opp2PA = team.opp_fga - team.opp_tpa;
    const blkPct = (p.minutes * opp2PA) > 0
      ? 100 * (p.blk * (teamMinutes / 5)) / (p.minutes * opp2PA) : 0;
    const stlPct = (p.minutes * oppPoss) > 0
      ? 100 * (p.stl * (teamMinutes / 5)) / (p.minutes * oppPoss) : 0;
    const fc40 = p.minutes > 0 ? p.pf * (40 / p.minutes) : 0;
    const ftRate = p.fga > 0 ? (p.fta / p.fga) * 100 : 0;
    const ftPct = p.fta > 0 ? (p.ftm / p.fta) * 100 : 0;
    const twoPct = twoPA > 0 ? (twoPM / twoPA) * 100 : 0;
    const threePct = p.tpa > 0 ? (p.tpm / p.tpa) * 100 : 0;
    const fgPct = p.fga > 0 ? (p.fgm / p.fga) * 100 : 0;

    const qAST = ((p.minutes / (teamMinutes / 5)) *
      (1.14 * ((team.ast - p.ast) / team.fgm))) +
      ((((team.ast / teamMinutes) * p.minutes * 5 - p.ast) /
        ((team.fgm / teamMinutes) * p.minutes * 5 - p.fgm)) *
        (1 - p.minutes / (teamMinutes / 5)));
    const FG_Part = p.fgm * (1 - 0.5 * ((p.points - p.ftm) / (2 * p.fga)) * qAST);
    const AST_Part = 0.5 *
      (((team.points - team.ftm) - (p.points - p.ftm)) / (2 * (team.fga - p.fga))) * p.ast;
    const FT_Part = (1 - Math.pow(1 - p.ftm / p.fta, 2)) * 0.4 * p.fta;
    const ORB_Part_sc = p.orb * Team_ORB_Weight * Team_Play_pct;
    const ScPoss = (FG_Part + AST_Part + FT_Part) *
      (1 - (team.orb / Team_Scoring_Poss) * Team_ORB_Weight * Team_Play_pct) + ORB_Part_sc;
    const FGxPoss = (p.fga - p.fgm) * (1 - 1.07 * Team_ORB_pct);
    const FTxPoss = Math.pow(1 - p.ftm / p.fta, 2) * 0.4 * p.fta;
    const TotPoss = ScPoss + FGxPoss + FTxPoss + p.tov;
    const PProd_FG_Part = 2 * (p.fgm + 0.5 * p.tpm) *
      (1 - 0.5 * ((p.points - p.ftm) / (2 * p.fga)) * qAST);
    const PProd_AST_Part = 2 *
      ((team.fgm - p.fgm + 0.5 * (team.tpm - p.tpm)) / (team.fgm - p.fgm)) *
      0.5 * (((team.points - team.ftm) - (p.points - p.ftm)) / (2 * (team.fga - p.fga))) * p.ast;
    const PProd_ORB_Part = p.orb * Team_ORB_Weight * Team_Play_pct *
      (team.points / (team.fgm +
        (1 - Math.pow(1 - team.ftm / team.fta, 2)) * 0.4 * team.fta));
    const PProd = (PProd_FG_Part + PProd_AST_Part + p.ftm) *
      (1 - (team.orb / Team_Scoring_Poss) * Team_ORB_Weight * Team_Play_pct) + PProd_ORB_Part;
    const ortg = TotPoss > 0 ? 100 * PProd / TotPoss : 0;

    const g = p.games || 1;
    const m = p.minutes || 1;
    const ppg   = p.points / g;
    const rpg   = p.trb / g;
    const orbpg = p.orb / g;
    const drbpg = p.drb / g;
    const apg   = p.ast / g;
    const spg   = p.stl / g;
    const bpg   = p.blk / g;
    const mpg   = p.minutes / g;
    const p40   = p.points / m * 40;
    const r40   = p.trb    / m * 40;
    const orb40 = p.orb    / m * 40;
    const drb40 = p.drb    / m * 40;
    const a40   = p.ast    / m * 40;
    const s40   = p.stl    / m * 40;
    const b40   = p.blk    / m * 40;

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
    a.download = `mens-d1_players_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const SortableHeader = ({ label, sk }: { label: string; sk: SortKey }) => (
    <th onClick={() => handleSort(sk)} style={{
      padding: "6px 6px", textAlign: "right", cursor: "pointer", userSelect: "none",
      background: sortKey === sk ? ACCENT : "transparent",
      color: sortKey === sk ? "#fff" : "inherit", fontWeight: 700, fontSize: 10,
    }}>
      {label} {sortKey === sk && (sortOrder === 'desc' ? '↓' : '↑')}
    </th>
  );

  if (loading) {
    return <div style={{ padding: 40, textAlign: "center" }}>Loading players...</div>;
  }

  return (
    <>
      <SiteNavigation currentDivision="mens-d1" currentPage="players" divisionPath="/mens-d1" />
      <main style={{ maxWidth: "100%", margin: "0 auto", padding: 20 }}>
        <div style={{ marginBottom: 24 }}>
          <h2 style={{ fontSize: 24, fontWeight: 700, marginBottom: 8 }}>Player Database</h2>
          <p style={{ color: "#666", marginBottom: 16 }}>{players.length} players</p>
          <div style={{ display: "flex", gap: 12, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
            <input
              type="text"
              placeholder="Search by player name or team..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{ padding: "8px 12px", border: "1px solid #ddd", borderRadius: 6, flex: 1, minWidth: 250 }}
            />
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <label style={{ fontSize: 14, color: "#666" }}>Min Minutes:</label>
              <select
                value={minMinutes}
                onChange={(e) => setMinMinutes(Number(e.target.value))}
                style={{ padding: "8px 12px", border: "1px solid #ddd", borderRadius: 6 }}
              >
                <option value="0">All Players</option>
                <option value="50">50+</option>
                <option value="100">100+</option>
                <option value="200">200+</option>
                <option value="300">300+</option>
              </select>
            </div>
            {/* Stat mode toggle */}
            <div style={{ display: 'flex', borderRadius: 6, overflow: 'hidden', border: '1px solid #ddd', marginLeft: 'auto' }}>
              {(['advanced', 'perGame', 'per40'] as StatMode[]).map(mode => (
                <button
                  key={mode}
                  onClick={() => setStatMode(mode)}
                  style={{
                    padding: '7px 16px', fontSize: 12, fontWeight: 600, cursor: 'pointer',
                    border: 'none', outline: 'none',
                    background: statMode === mode ? ACCENT : '#fff',
                    color: statMode === mode ? '#fff' : '#666',
                    transition: 'background 0.15s, color 0.15s',
                  }}
                >
                  {mode === 'advanced' ? 'Advanced' : mode === 'perGame' ? 'Per Game' : 'Per 40'}
                </button>
              ))}
            </div>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <p style={{ fontSize: 12, color: "#666", margin: 0 }}>
              Click column headers to sort. Showing {sortedPlayers.length} players.
            </p>
            <button
              onClick={exportCSV}
              style={{
                padding: "6px 14px", background: ACCENT, color: "#fff",
                border: "none", borderRadius: 6, fontSize: 12, fontWeight: 600,
                cursor: "pointer", display: "flex", alignItems: "center", gap: 6,
              }}
            >
              ↓ Export CSV
            </button>
          </div>
        </div>

        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, whiteSpace: "nowrap" }}>
            <thead>
              <tr style={{ borderBottom: `2px solid ${ACCENT}`, background: ACCENT_LIGHT }}>
                <th onClick={() => handleSort('name')} style={{ padding: "6px 6px", textAlign: "left", position: "sticky", left: 0, background: ACCENT_LIGHT, zIndex: 2, cursor: "pointer" }}>
                  Player {sortKey === 'name' && (sortOrder === 'desc' ? '↓' : '↑')}
                </th>
                <th onClick={() => handleSort('team')} style={{ padding: "6px 6px", textAlign: "left", cursor: "pointer" }}>
                  Team {sortKey === 'team' && (sortOrder === 'desc' ? '↓' : '↑')}
                </th>
                <th style={{ padding: "6px 6px", textAlign: "center" }}>Yr</th>
                <th style={{ padding: "6px 6px", textAlign: "center" }}>Ht</th>
                <SortableHeader label="G" sk="games" />
                <SortableHeader label="S" sk="starts" />
                {activeCols.map(col => (
                  <SortableHeader key={col.key} label={col.label} sk={col.key} />
                ))}
              </tr>
            </thead>
            <tbody>
              {sortedPlayers.map((p, idx) => {
                const stats = calculatePlayerStats(p);
                if (!stats) return null;
                return (
                  <tr key={p.playerId} style={{ borderBottom: "1px solid #e8f2fc", background: idx % 2 === 0 ? "#fff" : "#EAF4FF" }}>
                    <td style={{ padding: "4px 6px", fontWeight: 600, position: "sticky", left: 0, background: idx % 2 === 0 ? "#fff" : "#EAF4FF", zIndex: 1, maxWidth: 150, overflow: "hidden", textOverflow: "ellipsis" }}>
                      {p.firstName} {p.lastName}
                    </td>
                    <td style={{ padding: "4px 6px", maxWidth: 110, overflow: "hidden", textOverflow: "ellipsis", background: idx % 2 === 0 ? "#fff" : "#EAF4FF" }}>
                      <Link href={`/mens-d1/team/${p.teamId}`} style={{ color: ACCENT, textDecoration: "none" }}>
                        {p.teamName}
                      </Link>
                    </td>
                    <td style={{ padding: "4px 6px", textAlign: "center", background: idx % 2 === 0 ? "#fff" : "#EAF4FF" }}>{p.year || "—"}</td>
                    <td style={{ padding: "4px 6px", textAlign: "center", background: idx % 2 === 0 ? "#fff" : "#EAF4FF" }}>{formatHeight(p.height)}</td>
                    <td style={{ padding: "4px 6px", textAlign: "right", background: idx % 2 === 0 ? "#fff" : "#EAF4FF" }}>{p.games}</td>
                    <td style={{ padding: "4px 6px", textAlign: "right", background: idx % 2 === 0 ? "#fff" : "#EAF4FF" }}>{p.starts || 0}</td>
                    {activeCols.map(col => {
                      const val = (stats as any)[col.key];
                      return (
                        <td key={col.key} style={{
                          padding: "4px 6px", textAlign: "right",
                          fontWeight: sortKey === col.key ? 700 : 400,
                        }}>
                          {val != null ? (['twopm','twopa','tpm','tpa','ftm','fta'].includes(col.key) ? Math.round(Number(val)) : Number(val).toFixed(1)) : '—'}
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
