'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import SiteNavigation from '@/components/SiteNavigation';

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

type TeamStats = {
  games: number;
  fga: number;
  fgm: number;
  tpm: number;
  orb: number;
  tov: number;
  fta: number;
  ftm: number;
  ast: number;
  points: number;
  opp_fga: number;
  opp_tpa: number;
  opp_tpm: number;
  opp_orb: number;
  opp_tov: number;
  opp_fta: number;
  opp_ftm: number;
  opp_points: number;
  trb: number;
  opp_trb: number;
};

type SortKey = 'name' | 'team' | 'games' | 'starts' | 'minPct' | 'ortg' | 'usagePct' | 'shotPct' | 
  'efg' | 'ts' | 'orbPct' | 'drbPct' | 'aRate' | 'toRate' | 'blkPct' | 'stlPct' | 'fc40' | 'ftRate' |
  'ftPct' | '2pPct' | '3pPct' | 'ppg' | 'rpg' | 'apg';
type SortOrder = 'asc' | 'desc';

export default function PlayersPage() {
  const [players, setPlayers] = useState<Player[]>([]);
  const [teamStats, setTeamStats] = useState<Map<string, TeamStats>>(new Map());
  const [filteredPlayers, setFilteredPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortKey, setSortKey] = useState<SortKey>('ppg');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
  const [searchTerm, setSearchTerm] = useState('');
  const [minMinutes, setMinMinutes] = useState(100);

  useEffect(() => {
    Promise.all([
      fetch(`/api/players?minMinutes=${minMinutes}`).then(res => res.json()),
      fetch('/api/teams/stats').then(res => res.json())
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

    // ── Derived team values ──────────────────────────────────────────
    const Team_ORB_pct = team.orb / (team.orb + (team.opp_trb - team.opp_orb));
    const Team_Scoring_Poss = team.fgm +
      (1 - Math.pow(1 - team.ftm / team.fta, 2)) * team.fta * 0.4;
    const Team_Play_pct = Team_Scoring_Poss /
      (team.fga + team.fta * 0.4 + team.tov);
    const Team_ORB_Weight =
      ((1 - Team_ORB_pct) * Team_Play_pct) /
      ((1 - Team_ORB_pct) * Team_Play_pct + Team_ORB_pct * (1 - Team_Play_pct));

    // ── Basic per-game / per-minute ──────────────────────────────────
    const minPct = teamMinutes > 0 ? (p.minutes / teamMinutes) * 100 * 5 : 0;
    const twoPA = p.fga - p.tpa;
    const twoPM = p.fgm - p.tpm;

    // ── Usage % (BBRef formula) ──────────────────────────────────────
    const teamPossTotal = team.fga + 0.44 * team.fta + team.tov;
    const usagePct = 100 * (p.fga + 0.44 * p.fta + p.tov) /
      (teamPossTotal / teamMinutes * p.minutes) / 5;

    // Shot %
    const shotPct = team.fga > 0 ? (p.fga / team.fga) * 100 : 0;

    // ── eFG% ────────────────────────────────────────────────────────
    const efg = p.fga > 0 ? ((p.fgm + 0.5 * p.tpm) / p.fga) * 100 : 0;

    // ── TS% (uses 0.475, matches BBRef/KenPom) ──────────────────────
    const ts = (p.fga + 0.475 * p.fta) > 0
      ? (p.points / (2 * (p.fga + 0.475 * p.fta))) * 100
      : 0;

    // ── Rebound % ───────────────────────────────────────────────────
    const opp_drb = team.opp_trb - team.opp_orb;
    const drb = team.trb - team.orb;
    const orbPct = p.minutes > 0 && (team.orb + opp_drb) > 0
      ? (p.orb / p.minutes) * (teamMinutes / 5) / (team.orb + opp_drb) * 100 : 0;
    const drbPct = p.minutes > 0 && (drb + team.opp_orb) > 0
      ? (p.drb / p.minutes) * (teamMinutes / 5) / (drb + team.opp_orb) * 100 : 0;

    // ── Assist Rate (BBRef: AST / (((MP / (TmMP/5)) * TmFGM) - FGM)) ──
    const aRateDenom = ((p.minutes / (teamMinutes / 5)) * team.fgm) - p.fgm;
    const aRate = aRateDenom > 0 ? (p.ast / aRateDenom) * 100 : 0;

    // ── TO Rate (BBRef: TOV / (FGA + 0.44*FTA + TOV)) ───────────────
    const playerPossSimple = p.fga + 0.44 * p.fta + p.tov;
    const toRate = playerPossSimple > 0 ? (p.tov / playerPossSimple) * 100 : 0;

    // ── Block % / Steal % ────────────────────────────────────────────
    const oppPoss = team.opp_fga - team.opp_orb + team.opp_tov + 0.475 * team.opp_fta;
    const opp2PA = team.opp_fga - team.opp_tpa;
    const blkPct = (p.minutes * opp2PA) > 0
      ? 100 * (p.blk * (teamMinutes / 5)) / (p.minutes * opp2PA) : 0;
    const stlPct = (p.minutes * oppPoss) > 0
      ? 100 * (p.stl * (teamMinutes / 5)) / (p.minutes * oppPoss) : 0;

    // ── FC/40 ────────────────────────────────────────────────────────
    const fc40 = p.minutes > 0 ? p.pf * (40 / p.minutes) : 0;

    // ── FT Rate ──────────────────────────────────────────────────────
    const ftRate = p.fga > 0 ? (p.fta / p.fga) * 100 : 0;

    // ── Shooting % ───────────────────────────────────────────────────
    const ftPct = p.fta > 0 ? (p.ftm / p.fta) * 100 : 0;
    const twoPct = twoPA > 0 ? (twoPM / twoPA) * 100 : 0;
    const threePct = p.tpa > 0 ? (p.tpm / p.tpa) * 100 : 0;

    // ── Dean Oliver Individual ORtg ──────────────────────────────────
    // qAST: estimated % of player's FGM that were assisted
    const qAST = ((p.minutes / (teamMinutes / 5)) *
      (1.14 * ((team.ast - p.ast) / team.fgm))) +
      ((((team.ast / teamMinutes) * p.minutes * 5 - p.ast) /
        ((team.fgm / teamMinutes) * p.minutes * 5 - p.fgm)) *
        (1 - p.minutes / (teamMinutes / 5)));

    // Scoring Possessions components
    const FG_Part = p.fgm * (1 - 0.5 * ((p.points - p.ftm) / (2 * p.fga)) * qAST);
    const AST_Part = 0.5 *
      (((team.points - team.ftm) - (p.points - p.ftm)) / (2 * (team.fga - p.fga))) * p.ast;
    const FT_Part = (1 - Math.pow(1 - p.ftm / p.fta, 2)) * 0.4 * p.fta;
    const ORB_Part_sc = p.orb * Team_ORB_Weight * Team_Play_pct;

    const ScPoss = (FG_Part + AST_Part + FT_Part) *
      (1 - (team.orb / Team_Scoring_Poss) * Team_ORB_Weight * Team_Play_pct) + ORB_Part_sc;

    // Missed shot possessions
    const FGxPoss = (p.fga - p.fgm) * (1 - 1.07 * Team_ORB_pct);
    const FTxPoss = Math.pow(1 - p.ftm / p.fta, 2) * 0.4 * p.fta;

    // Total possessions
    const TotPoss = ScPoss + FGxPoss + FTxPoss + p.tov;

    // Points Produced
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

    // ── Per game ─────────────────────────────────────────────────────
    const ppg = p.games > 0 ? p.points / p.games : 0;
    const rpg = p.games > 0 ? p.trb / p.games : 0;
    const apg = p.games > 0 ? p.ast / p.games : 0;

    return {
      minPct, ortg, usagePct, shotPct, efg, ts,
      orbPct, drbPct, aRate, toRate, blkPct, stlPct,
      fc40, ftRate, ftPct, twoPct, threePct, ppg, rpg, apg,
    };
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
    if (sortKey === 'name') {
      const aName = `${a.lastName} ${a.firstName}`;
      const bName = `${b.lastName} ${b.firstName}`;
      return sortOrder === 'asc' ? aName.localeCompare(bName) : bName.localeCompare(aName);
    }
    if (sortKey === 'team') {
      return sortOrder === 'asc' ? a.teamName.localeCompare(b.teamName) : b.teamName.localeCompare(a.teamName);
    }

    const aStats = calculatePlayerStats(a);
    const bStats = calculatePlayerStats(b);
    if (!aStats || !bStats) return 0;

    const aVal = sortKey === 'games' ? a.games : sortKey === 'starts' ? a.starts : (aStats as any)[sortKey];
    const bVal = sortKey === 'games' ? b.games : sortKey === 'starts' ? b.starts : (bStats as any)[sortKey];

    return sortOrder === 'asc' ? aVal - bVal : bVal - aVal;
  });

  const SortableHeader = ({ label, sortKey: key }: { label: string; sortKey: SortKey }) => (
    <th
      onClick={() => handleSort(key)}
      style={{
        padding: "6px 4px",
        textAlign: "right",
        cursor: "pointer",
        userSelect: "none",
        background: sortKey === key ? ACCENT : "transparent",
        color: sortKey === key ? "#fff" : "inherit",
        fontWeight: 700,
        fontSize: 10,
      }}
    >
      {label} {sortKey === key && (sortOrder === 'desc' ? '↓' : '↑')}
    </th>
  );

  if (loading) {
    return <div style={{ padding: 40, textAlign: "center" }}>Loading players...</div>;
  }

  return (
    <>
      <SiteNavigation
        currentDivision="womens-d1"
        currentPage="players"
        divisionPath="/"
      />

      <main style={{ maxWidth: "100%", margin: "0 auto", padding: 20 }}>
        <div style={{ marginBottom: 24 }}>
          <h2 style={{ fontSize: 24, fontWeight: 700, marginBottom: 8 }}>Player Database</h2>
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
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 10, whiteSpace: "nowrap" }}>
            <thead>
              <tr style={{ borderBottom: `2px solid ${ACCENT}`, background: ACCENT_LIGHT }}>
                <th
                  onClick={() => handleSort('name')}
                  style={{ padding: "6px 4px", textAlign: "left", position: "sticky", left: 0, background: ACCENT_LIGHT, zIndex: 2, cursor: "pointer" }}
                >
                  Player {sortKey === 'name' && (sortOrder === 'desc' ? '↓' : '↑')}
                </th>
                <th
                  onClick={() => handleSort('team')}
                  style={{ padding: "6px 4px", textAlign: "left", cursor: "pointer" }}
                >
                  Team {sortKey === 'team' && (sortOrder === 'desc' ? '↓' : '↑')}
                </th>
                <th style={{ padding: "6px 4px", textAlign: "center" }}>Yr</th>
                <SortableHeader label="G" sortKey="games" />
                <SortableHeader label="S" sortKey="starts" />
                <SortableHeader label="%Min" sortKey="minPct" />
                <SortableHeader label="ORtg" sortKey="ortg" />
                <SortableHeader label="%Poss" sortKey="usagePct" />
                <SortableHeader label="%Shots" sortKey="shotPct" />
                <SortableHeader label="eFG%" sortKey="efg" />
                <SortableHeader label="TS%" sortKey="ts" />
                <SortableHeader label="OR%" sortKey="orbPct" />
                <SortableHeader label="DR%" sortKey="drbPct" />
                <SortableHeader label="ARate" sortKey="aRate" />
                <SortableHeader label="TORate" sortKey="toRate" />
                <SortableHeader label="Blk%" sortKey="blkPct" />
                <SortableHeader label="Stl%" sortKey="stlPct" />
                <SortableHeader label="FC/40" sortKey="fc40" />
                <SortableHeader label="FTRate" sortKey="ftRate" />
                <SortableHeader label="FT%" sortKey="ftPct" />
                <SortableHeader label="2P%" sortKey="2pPct" />
                <SortableHeader label="3P%" sortKey="3pPct" />
                <SortableHeader label="PPG" sortKey="ppg" />
                <SortableHeader label="RPG" sortKey="rpg" />
                <SortableHeader label="APG" sortKey="apg" />
              </tr>
            </thead>
            <tbody>
              {sortedPlayers.map((p) => {
                const stats = calculatePlayerStats(p);
                if (!stats) return null;

                return (
                  <tr key={p.playerId} style={{ borderBottom: "1px solid #f0f0f0" }}>
                    <td style={{ padding: "4px", fontWeight: 600, position: "sticky", left: 0, background: "#fff", zIndex: 1 }}>
                      {p.firstName} {p.lastName}
                    </td>
                    <td style={{ padding: "4px" }}>
                      <Link href={`/team/${p.teamId}`} style={{ color: ACCENT, textDecoration: "none" }}>
                        {p.teamName}
                      </Link>
                    </td>
                    <td style={{ padding: "4px", textAlign: "center" }}>{p.year || "—"}</td>
                    <td style={{ padding: "4px", textAlign: "right" }}>{p.games}</td>
                    <td style={{ padding: "4px", textAlign: "right" }}>{p.starts || 0}</td>
                    <td style={{ padding: "4px", textAlign: "right" }}>{stats.minPct.toFixed(1)}</td>
                    <td style={{ padding: "4px", textAlign: "right" }}>{stats.ortg.toFixed(1)}</td>
                    <td style={{ padding: "4px", textAlign: "right" }}>{stats.usagePct.toFixed(1)}</td>
                    <td style={{ padding: "4px", textAlign: "right" }}>{stats.shotPct.toFixed(1)}</td>
                    <td style={{ padding: "4px", textAlign: "right" }}>{stats.efg.toFixed(1)}</td>
                    <td style={{ padding: "4px", textAlign: "right" }}>{stats.ts.toFixed(1)}</td>
                    <td style={{ padding: "4px", textAlign: "right" }}>{stats.orbPct.toFixed(1)}</td>
                    <td style={{ padding: "4px", textAlign: "right" }}>{stats.drbPct.toFixed(1)}</td>
                    <td style={{ padding: "4px", textAlign: "right" }}>{stats.aRate.toFixed(1)}</td>
                    <td style={{ padding: "4px", textAlign: "right" }}>{stats.toRate.toFixed(1)}</td>
                    <td style={{ padding: "4px", textAlign: "right" }}>{stats.blkPct.toFixed(1)}</td>
                    <td style={{ padding: "4px", textAlign: "right" }}>{stats.stlPct.toFixed(1)}</td>
                    <td style={{ padding: "4px", textAlign: "right" }}>{stats.fc40.toFixed(1)}</td>
                    <td style={{ padding: "4px", textAlign: "right" }}>{stats.ftRate.toFixed(1)}</td>
                    <td style={{ padding: "4px", textAlign: "right" }}>{stats.ftPct.toFixed(1)}</td>
                    <td style={{ padding: "4px", textAlign: "right" }}>{stats.twoPct.toFixed(1)}</td>
                    <td style={{ padding: "4px", textAlign: "right" }}>{stats.threePct.toFixed(1)}</td>
                    <td style={{ padding: "4px", textAlign: "right", fontWeight: 600 }}>{stats.ppg.toFixed(1)}</td>
                    <td style={{ padding: "4px", textAlign: "right" }}>{stats.rpg.toFixed(1)}</td>
                    <td style={{ padding: "4px", textAlign: "right" }}>{stats.apg.toFixed(1)}</td>
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
