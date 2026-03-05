'use client';

import Link from 'next/link';
import { useState } from 'react';

// ── Brand Tokens ──────────────────────────────────────────────
const NAVY    = "#0D1F3C";
const BLUE    = "#1B4B8A";
const SKY     = "#2E7DD1";
const ACCENT  = "#3B9EFF";
const ICE     = "#A8C8F0";
const FROST   = "#E8F2FC";
const MUTED   = "#6B7E9A";

type Division = {
  id: string;
  label: string;
  path: string;
  enabled: boolean;
};

const ALL_DIVISIONS: Division[] = [
  { id: 'womens-d1', label: "Women's D1", path: '/womens-d1', enabled: true  },
  { id: 'womens-d2', label: "Women's D2", path: '/womens-d2', enabled: true  },
  { id: 'womens-d3', label: "Women's D3", path: '/womens-d3', enabled: false },
  { id: 'mens-d1',   label: "Men's D1",   path: '/mens-d1',   enabled: true  },
  { id: 'mens-d2',   label: "Men's D2",   path: '/mens-d2',   enabled: true  },
  { id: 'mens-d3',   label: "Men's D3",   path: '/mens-d3',   enabled: false },
];

// Map each division to the gender-shared recruiting path
const RECRUITING_PATH: Record<string, string> = {
  'womens-d1': '/womens-d1/recruiting',
  'womens-d2': '/womens-d1/recruiting', // shared — resolves to same page
  'mens-d1':   '/mens-d1/recruiting',
  'mens-d2':   '/mens-d1/recruiting',   // shared — resolves to same page
};

function Wordmark({ size = 'md' }: { size?: 'sm' | 'md' }) {
  const topSize = size === 'sm' ? 16 : 22;
  const divH    = size === 'sm' ? 1.5 : 2;
  const divMar  = size === 'sm' ? '3px 0' : '5px 0';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', lineHeight: 1 }}>
      <span style={{ fontFamily: "'Outfit', sans-serif", fontWeight: 800, fontSize: topSize, color: '#fff', letterSpacing: '-0.02em', lineHeight: 1 }}>
        Sideline
      </span>
      <div style={{ width: '100%', height: divH, background: ICE, margin: divMar }} />
      <span style={{ fontFamily: "'Outfit', sans-serif", fontWeight: 300, fontSize: topSize, color: ICE, letterSpacing: '0.18em', textTransform: 'uppercase' as const, lineHeight: 1 }}>
        Stats
      </span>
    </div>
  );
}

function DivisionSwitcher({ currentDivision }: { currentDivision: string }) {
  const [isOpen, setIsOpen] = useState(false);
  const current         = ALL_DIVISIONS.find(d => d.id === currentDivision);
  const womensDivisions = ALL_DIVISIONS.filter(d => d.id.startsWith('womens'));
  const mensDivisions   = ALL_DIVISIONS.filter(d => d.id.startsWith('mens'));

  const groupHeader = (label: string) => (
    <div style={{ padding: '8px 14px', background: FROST, borderBottom: `1px solid ${ICE}30` }}>
      <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, fontWeight: 500, color: MUTED, textTransform: 'uppercase' as const, letterSpacing: '0.2em' }}>
        {label}
      </div>
    </div>
  );

  const divLink = (div: Division) => (
    <Link
      key={div.id}
      href={div.enabled ? div.path : '#'}
      style={{
        display: 'block',
        padding: '10px 16px',
        fontFamily: "'Outfit', sans-serif",
        fontSize: 14,
        fontWeight: div.id === currentDivision ? 600 : 400,
        color: div.enabled ? (div.id === currentDivision ? SKY : '#1f2937') : '#9ca3af',
        background: div.id === currentDivision ? FROST : '#fff',
        textDecoration: 'none',
        borderBottom: '1px solid #f3f4f6',
        cursor: div.enabled ? 'pointer' : 'not-allowed',
        opacity: div.enabled ? 1 : 0.5,
      }}
      onClick={e => { if (div.enabled) setIsOpen(false); else e.preventDefault(); }}
    >
      {div.label}
      {!div.enabled && <span style={{ fontSize: 11, marginLeft: 6, color: MUTED }}>(Coming Soon)</span>}
    </Link>
  );

  return (
    <div style={{ position: 'relative' }}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        style={{
          padding: '7px 14px',
          background: BLUE,
          color: '#fff',
          border: `1px solid ${SKY}`,
          borderRadius: 6,
          fontSize: 13,
          fontFamily: "'Outfit', sans-serif",
          fontWeight: 600,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
        }}
      >
        {current?.label || 'Select Division'}
        <span style={{ fontSize: 9, color: ICE }}>{isOpen ? '▲' : '▼'}</span>
      </button>

      {isOpen && (
        <>
          <div onClick={() => setIsOpen(false)} style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 999 }} />
          <div style={{
            position: 'absolute', top: '100%', right: 0, marginTop: 8,
            background: '#fff', border: `1px solid ${FROST}`, borderRadius: 8,
            boxShadow: '0 8px 24px rgba(13,31,60,0.18)', minWidth: 190, zIndex: 1000, overflow: 'hidden',
          }}>
            {groupHeader("Women's")}
            {womensDivisions.map(divLink)}
            {groupHeader("Men's")}
            {mensDivisions.map(divLink)}
          </div>
        </>
      )}
    </div>
  );
}

function SectionNav({ currentPage, divisionPath, currentDivision }: { currentPage: string; divisionPath: string; currentDivision: string }) {
  const recruitingPath = RECRUITING_PATH[currentDivision] ?? `${divisionPath}/recruiting`;

  const pages = [
    { id: 'rankings',   label: 'Rankings',   path: divisionPath },
    { id: 'players',    label: 'Players',     path: `${divisionPath}/players` },
    { id: 'recruiting', label: 'Recruiting',  path: recruitingPath },
  ];

  return (
    <div style={{ display: 'flex', gap: 4, borderBottom: `2px solid ${FROST}` }}>
      {pages.map(page => (
        <Link
          key={page.id}
          href={page.path}
          style={{
            padding: '11px 20px',
            fontFamily: "'Outfit', sans-serif",
            fontSize: 14,
            fontWeight: currentPage === page.id ? 700 : 500,
            color: currentPage === page.id ? SKY : MUTED,
            textDecoration: 'none',
            borderBottom: currentPage === page.id ? `3px solid ${ACCENT}` : '3px solid transparent',
            marginBottom: -2,
            letterSpacing: '0.01em',
          }}
        >
          {page.label}
        </Link>
      ))}
    </div>
  );
}

export default function SiteNavigation({
  currentDivision,
  currentPage,
  divisionPath,
}: {
  currentDivision: string;
  currentPage: string;
  divisionPath: string;
}) {
  return (
    <>
      <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800&family=DM+Mono:wght@400;500&display=swap" rel="stylesheet" />
      <div style={{ marginBottom: 24 }}>
        <div style={{ background: NAVY, padding: '14px 20px', borderBottom: `1px solid ${BLUE}` }}>
          <div style={{ maxWidth: 1200, margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Link href="/" style={{ textDecoration: 'none' }}>
              <Wordmark />
            </Link>
            <DivisionSwitcher currentDivision={currentDivision} />
          </div>
        </div>
        <div style={{ background: '#fff', borderBottom: `1px solid ${FROST}` }}>
          <div style={{ maxWidth: 1200, margin: '0 auto', paddingLeft: 20, paddingRight: 20 }}>
            <SectionNav currentPage={currentPage} divisionPath={divisionPath} currentDivision={currentDivision} />
          </div>
        </div>
      </div>
    </>
  );
}
