'use client';

import Link from "next/link";
import { useEffect, useState } from "react";
import SiteNavigation from "@/components/SiteNavigation";

type Team = {
  teamId: string;
  team: string;
  conference: string;
  games: number;
  wins: number;
  losses: number;
  rawO: number;
  rawD: number;
  rawEM: number;
  rawT: number;
};

type SortKey = 'rawEM' | 'rawO' | 'rawD' | 'rawT';
type SortOrder = 'asc' | 'desc';

export default function HomePage() {
  const [teams, setTeams] = useState<Team[]>([]);
  const [sortedTeams, setSortedTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatedDate, setUpdatedDate] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>('rawEM');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');

  useEffect(() => {
    fetch('/api/teams')
      .then(res => res.json())
      .then(data => {
        setTeams(data.rows);
        setSortedTeams(data.rows);
        setUpdatedDate(data.updated 
          ? new Date(data.updated).toLocaleDateString("en-US", {
              month: "long",
              day: "numeric",
              year: "numeric",
            })
          : null
        );
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    const sorted = [...teams].sort((a, b) => {
      const aVal = a[sortKey];
      const bVal = b[sortKey];
      
      // Def Efficiency - lower is better
      if (sortKey === 'rawD') {
        return sortOrder === 'asc' ? aVal - bVal : bVal - aVal;
      }
      // All others - higher is better
      return sortOrder === 'asc' ? aVal - bVal : bVal - aVal;
    });

    setSortedTeams(sorted);
  }, [teams, sortKey, sortOrder]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      // Default sort order
      if (key === 'rawD') {
        setSortOrder('asc'); // Lower is better
      } else {
        setSortOrder('desc'); // Higher is better
      }
    }
  };

  const SortableHeader = ({ label, sortKey: key }: { label: string; sortKey: SortKey }) => (
    <th 
      onClick={() => handleSort(key)}
      style={{ 
        padding: "10px 12px", 
        textAlign: "right",
        cursor: "pointer",
        userSelect: "none",
        background: sortKey === key ? "#1e293b" : "#2d3748",
        fontWeight: 700,
      }}
    >
      {label} {sortKey === key && (sortOrder === 'desc' ? '↓' : '↑')}
    </th>
  );

  if (loading) {
    return (
      <>
        <SiteNavigation 
          currentDivision="womens-d1"
          currentPage="rankings"
          divisionPath="/"
        />
        <div style={{ padding: 40, textAlign: "center" }}>Loading...</div>
      </>
    );
  }

  return (
    <>
      <SiteNavigation 
        currentDivision="womens-d1"
        currentPage="rankings"
        divisionPath="/"
      />
      
      <main style={{ maxWidth: 1200, margin: "0 auto", padding: 20 }}>
        {updatedDate && (
          <p style={{ color: "#666", marginBottom: 24 }}>
            Data through {updatedDate}
          </p>
        )}

        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
            <thead>
              <tr style={{ background: "#2d3748", color: "#fff" }}>
                <th style={{ padding: "10px 12px", textAlign: "left" }}>Rank</th>
                <th style={{ padding: "10px 12px", textAlign: "left" }}>Team</th>
                <th style={{ padding: "10px 12px", textAlign: "left" }}>Conference</th>
                <th style={{ padding: "10px 12px", textAlign: "right" }}>Record</th>
                <SortableHeader label="Efficiency Margin" sortKey="rawEM" />
                <SortableHeader label="Off Efficiency" sortKey="rawO" />
                <SortableHeader label="Def Efficiency" sortKey="rawD" />
                <SortableHeader label="Tempo" sortKey="rawT" />
              </tr>
            </thead>
            <tbody>
              {sortedTeams.map((row, idx) => (
                <tr
                  key={row.teamId}
                  style={{
                    borderBottom: "1px solid #e5e7eb",
                    background: idx % 2 === 0 ? "#fff" : "#f9fafb",
                  }}
                >
                  <td style={{ padding: "10px 12px" }}>{idx + 1}</td>
                  <td style={{ padding: "10px 12px" }}>
                    <Link
                      href={`/team/${row.teamId}`}
                      style={{ color: "#2563eb", textDecoration: "none", fontWeight: 600 }}
                    >
                      {row.team}
                    </Link>
                  </td>
                  <td style={{ padding: "10px 12px", textTransform: "uppercase", fontSize: 12, color: "#666" }}>
                    {row.conference || "—"}
                  </td>
                  <td style={{ padding: "10px 12px", textAlign: "right" }}>
                    {row.wins != null && row.losses != null ? `${row.wins}-${row.losses}` : "—"}
                  </td>
                  <td style={{ padding: "10px 12px", textAlign: "right", fontWeight: 600 }}>
                    {row.rawEM != null ? row.rawEM.toFixed(1) : "—"}
                  </td>
                  <td style={{ padding: "10px 12px", textAlign: "right" }}>
                    {row.rawO != null ? row.rawO.toFixed(1) : "—"}
                  </td>
                  <td style={{ padding: "10px 12px", textAlign: "right" }}>
                    {row.rawD != null ? row.rawD.toFixed(1) : "—"}
                  </td>
                  <td style={{ padding: "10px 12px", textAlign: "right" }}>
                    {row.rawT != null ? row.rawT.toFixed(1) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </main>
    </>
  );
}
