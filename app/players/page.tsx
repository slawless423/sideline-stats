'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

const ACCENT = "#4f46e5";
const ACCENT_LIGHT = "#f5f5ff";

type Player = {
  playerId: string;
  firstName: string;
  lastName: string;
  teamName: string;
  teamId: string;
  year: string;
  position: string;
  number: number;
  games: number;
  starts: number;
  minutes: number;
  fgm: number;
  fga: number;
  tpm: number;
  tpa: number;
  ftm: number;
  fta: number;
  orb: number;
  drb: number;
  trb: number;
  ast: number;
  stl: number;
  blk: number;
  tov: number;
  pf: number;
  points: number;
};

type SortKey = keyof Player | 'ppg' | 'rpg' | 'apg' | 'fgPct' | 'tpPct' | 'ftPct' | 'efg' | 'ts';
type SortOrder = 'asc' | 'desc';

export default function PlayersPage() {
  const [players, setPlayers] = useState<Player[]>([]);
  const [filteredPlayers, setFilteredPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortKey, setSortKey] = useState<SortKey>('points');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
  const [searchTerm, setSearchTerm] = useState('');
  const [minMinutes, setMinMinutes] = useState(100);

  useEffect(() => {
    fetch(`/api/players?minMinutes=${minMinutes}`)
      .then(res => res.json())
      .then(data => {
        setPlayers(data.players);
        setFilteredPlayers(data.players);
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

  const calculateStat = (p: Player, key: SortKey): number => {
    switch (key) {
      case 'ppg': return p.games > 0 ? p.points / p.games : 0;
      case 'rpg': return p.games > 0 ? p.trb / p.games : 0;
      case 'apg': return p.games > 0 ? p.ast / p.games : 0;
      case 'fgPct': return p.fga > 0 ? (p.fgm / p.fga) * 100 : 0;
      case 'tpPct': return p.tpa > 0 ? (p.tpm / p.tpa) * 100 : 0;
      case 'ftPct': return p.fta > 0 ? (p.ftm / p.fta) * 100 : 0;
      case 'efg': return p.fga > 0 ? ((p.fgm + 0.5 * p.tpm) / p.fga) * 100 : 0;
      case 'ts': {
        const denom = p.fga + 0.44 * p.fta;
        return denom > 0 ? (p.points / (2 * denom)) * 100 : 0;
      }
      default: return Number(p[key as keyof Player]) || 0;
    }
  };

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortOrder('desc');
    }
  };

  const sortedPlayers = [...filteredPlayers].sort((a, b) => {
    const aVal = calculateStat(a, sortKey);
    const bVal = calculateStat(b, sortKey);
    return sortOrder === 'asc' ? aVal - bVal : bVal - aVal;
  });

  const SortableHeader = ({ label, sortKey: key }: { label: string; sortKey: SortKey }) => (
    <th 
      onClick={() => handleSort(key)}
      style={{ 
        padding: "8px 6px", 
        textAlign: "right", 
        cursor: "pointer",
        userSelect: "none",
        background: sortKey === key ? ACCENT : "transparent",
        color: sortKey === key ? "#fff" : "inherit",
        fontWeight: 700,
      }}
    >
      {label} {sortKey === key && (sortOrder === 'desc' ? '↓' : '↑')}
    </th>
  );

  if (loading) {
    return <div style={{ padding: 40, textAlign: "center" }}>Loading players...</div>;
  }

  return (
    <main style={{ maxWidth: 1400, margin: "0 auto", padding: 20 }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 32, fontWeight: 800, marginBottom: 8 }}>Player Database</h1>
        <p style={{ color: "#666", marginBottom: 16 }}>{players.length} players</p>
        
        <div style={{ display: "flex", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
          <input
            type="text"
            placeholder="Search by player name or team..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{ 
              padding: "8px 12px", 
              border: "1px solid #ddd", 
              borderRadius: 6,
              flex: 1,
              minWidth: 250,
            }}
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
        </div>

        <p style={{ fontSize: 12, color: "#666" }}>
          Click column headers to sort. Showing {sortedPlayers.length} players.
        </p>
      </div>

      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
          <thead>
            <tr style={{ borderBottom: `2px solid ${ACCENT}` }}>
              <th style={{ padding: "8px 6px", textAlign: "left", position: "sticky", left: 0, background: "#fff", zIndex: 2 }}>Player</th>
              <th style={{ padding: "8px 6px", textAlign: "left" }}>Team</th>
              <th style={{ padding: "8px 6px", textAlign: "center" }}>Yr</th>
              <SortableHeader label="G" sortKey="games" />
              <SortableHeader label="Min" sortKey="minutes" />
              <SortableHeader label="PPG" sortKey="ppg" />
              <SortableHeader label="RPG" sortKey="rpg" />
              <SortableHeader label="APG" sortKey="apg" />
              <SortableHeader label="FG%" sortKey="fgPct" />
              <SortableHeader label="3P%" sortKey="tpPct" />
              <SortableHeader label="FT%" sortKey="ftPct" />
              <SortableHeader label="eFG%" sortKey="efg" />
              <SortableHeader label="TS%" sortKey="ts" />
              <SortableHeader label="ORB" sortKey="orb" />
              <SortableHeader label="DRB" sortKey="drb" />
              <SortableHeader label="TRB" sortKey="trb" />
              <SortableHeader label="AST" sortKey="ast" />
              <SortableHeader label="STL" sortKey="stl" />
              <SortableHeader label="BLK" sortKey="blk" />
              <SortableHeader label="TOV" sortKey="tov" />
              <SortableHeader label="PTS" sortKey="points" />
            </tr>
          </thead>
          <tbody>
            {sortedPlayers.map((p) => {
              const ppg = p.games > 0 ? p.points / p.games : 0;
              const rpg = p.games > 0 ? p.trb / p.games : 0;
              const apg = p.games > 0 ? p.ast / p.games : 0;
              const fgPct = p.fga > 0 ? (p.fgm / p.fga) * 100 : 0;
              const tpPct = p.tpa > 0 ? (p.tpm / p.tpa) * 100 : 0;
              const ftPct = p.fta > 0 ? (p.ftm / p.fta) * 100 : 0;
              const efg = p.fga > 0 ? ((p.fgm + 0.5 * p.tpm) / p.fga) * 100 : 0;
              const ts = (p.fga + 0.44 * p.fta) > 0 ? (p.points / (2 * (p.fga + 0.44 * p.fta))) * 100 : 0;

              return (
                <tr key={p.playerId} style={{ borderBottom: "1px solid #f0f0f0" }}>
                  <td style={{ padding: "6px", fontWeight: 600, position: "sticky", left: 0, background: "#fff", zIndex: 1 }}>
                    {p.firstName} {p.lastName}
                  </td>
                  <td style={{ padding: "6px" }}>
                    <Link href={`/team/${p.teamId}`} style={{ color: ACCENT, textDecoration: "none" }}>
                      {p.teamName}
                    </Link>
                  </td>
                  <td style={{ padding: "6px", textAlign: "center" }}>{p.year || "—"}</td>
                  <td style={{ padding: "6px", textAlign: "right" }}>{p.games}</td>
                  <td style={{ padding: "6px", textAlign: "right" }}>{parseFloat(p.minutes.toString()).toFixed(1)}</td>
                  <td style={{ padding: "6px", textAlign: "right" }}>{ppg.toFixed(1)}</td>
                  <td style={{ padding: "6px", textAlign: "right" }}>{rpg.toFixed(1)}</td>
                  <td style={{ padding: "6px", textAlign: "right" }}>{apg.toFixed(1)}</td>
                  <td style={{ padding: "6px", textAlign: "right" }}>{fgPct.toFixed(1)}</td>
                  <td style={{ padding: "6px", textAlign: "right" }}>{tpPct.toFixed(1)}</td>
                  <td style={{ padding: "6px", textAlign: "right" }}>{ftPct.toFixed(1)}</td>
                  <td style={{ padding: "6px", textAlign: "right" }}>{efg.toFixed(1)}</td>
                  <td style={{ padding: "6px", textAlign: "right" }}>{ts.toFixed(1)}</td>
                  <td style={{ padding: "6px", textAlign: "right" }}>{p.orb}</td>
                  <td style={{ padding: "6px", textAlign: "right" }}>{p.drb}</td>
                  <td style={{ padding: "6px", textAlign: "right" }}>{p.trb}</td>
                  <td style={{ padding: "6px", textAlign: "right" }}>{p.ast}</td>
                  <td style={{ padding: "6px", textAlign: "right" }}>{p.stl}</td>
                  <td style={{ padding: "6px", textAlign: "right" }}>{p.blk}</td>
                  <td style={{ padding: "6px", textAlign: "right" }}>{p.tov}</td>
                  <td style={{ padding: "6px", textAlign: "right", fontWeight: 600 }}>{p.points}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </main>
  );
}
