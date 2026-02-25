'use client';

import Link from 'next/link';
import { useState } from 'react';

const ACCENT = "#4f46e5";
const NAV_BG = "#1e293b";

type Division = {
  id: string;
  label: string;
  path: string;
  enabled: boolean;
};

const ALL_DIVISIONS: Division[] = [
  { id: 'womens-d1', label: "Women's D1", path: '/', enabled: true },
  { id: 'womens-d2', label: "Women's D2", path: '/womens-d2', enabled: false },
  { id: 'womens-d3', label: "Women's D3", path: '/womens-d3', enabled: false },
  { id: 'mens-d1', label: "Men's D1", path: '/mens-d1', enabled: true },
  { id: 'mens-d2', label: "Men's D2", path: '/mens-d2', enabled: true },
  { id: 'mens-d3', label: "Men's D3", path: '/mens-d3', enabled: false },
];

function DivisionSwitcher({ currentDivision }: { currentDivision: string }) {
  const [isOpen, setIsOpen] = useState(false);
  
  const current = ALL_DIVISIONS.find(d => d.id === currentDivision);
  const womensDivisions = ALL_DIVISIONS.filter(d => d.id.startsWith('womens'));
  const mensDivisions = ALL_DIVISIONS.filter(d => d.id.startsWith('mens'));

  return (
    <div style={{ position: 'relative' }}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        style={{
          padding: '8px 16px',
          background: ACCENT,
          color: '#fff',
          border: 'none',
          borderRadius: 6,
          fontSize: 14,
          fontWeight: 600,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
        }}
      >
        {current?.label || 'Select Division'}
        <span style={{ fontSize: 10 }}>{isOpen ? '▲' : '▼'}</span>
      </button>
      
      {isOpen && (
        <>
          <div 
            onClick={() => setIsOpen(false)}
            style={{
              position: 'fixed',
              top: 0, left: 0, right: 0, bottom: 0,
              zIndex: 999,
            }}
          />
          
          <div style={{
            position: 'absolute',
            top: '100%',
            right: 0,
            marginTop: 8,
            background: '#fff',
            border: '1px solid #e5e7eb',
            borderRadius: 6,
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
            minWidth: 180,
            zIndex: 1000,
            overflow: 'hidden',
          }}>
            <div style={{ padding: '8px 12px', background: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                Women's
              </div>
            </div>
            {womensDivisions.map(div => (
              <Link
                key={div.id}
                href={div.enabled ? div.path : '#'}
                style={{
                  display: 'block',
                  padding: '10px 16px',
                  color: div.enabled ? (div.id === currentDivision ? ACCENT : '#1f2937') : '#9ca3af',
                  textDecoration: 'none',
                  fontSize: 14,
                  fontWeight: div.id === currentDivision ? 600 : 400,
                  background: div.id === currentDivision ? '#f0f0ff' : '#fff',
                  borderBottom: '1px solid #f3f4f6',
                  cursor: div.enabled ? 'pointer' : 'not-allowed',
                  opacity: div.enabled ? 1 : 0.5,
                }}
                onClick={(e) => { if (div.enabled) { setIsOpen(false); } else { e.preventDefault(); } }}
              >
                {div.label}
                {!div.enabled && <span style={{ fontSize: 11, marginLeft: 6 }}>(Coming Soon)</span>}
              </Link>
            ))}
            
            <div style={{ padding: '8px 12px', background: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                Men's
              </div>
            </div>
            {mensDivisions.map(div => (
              <Link
                key={div.id}
                href={div.enabled ? div.path : '#'}
                style={{
                  display: 'block',
                  padding: '10px 16px',
                  color: div.enabled ? (div.id === currentDivision ? ACCENT : '#1f2937') : '#9ca3af',
                  textDecoration: 'none',
                  fontSize: 14,
                  fontWeight: div.id === currentDivision ? 600 : 400,
                  background: div.id === currentDivision ? '#f0f0ff' : '#fff',
                  cursor: div.enabled ? 'pointer' : 'not-allowed',
                  opacity: div.enabled ? 1 : 0.5,
                }}
                onClick={(e) => { if (div.enabled) { setIsOpen(false); } else { e.preventDefault(); } }}
              >
                {div.label}
                {!div.enabled && <span style={{ fontSize: 11, marginLeft: 6 }}>(Coming Soon)</span>}
              </Link>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function SectionNav({ currentPage, divisionPath }: { currentPage: string; divisionPath: string; }) {
  const pages = [
    { id: 'rankings', label: 'Rankings', path: divisionPath === '/' ? '/' : divisionPath },
    { id: 'players', label: 'Players', path: divisionPath === '/' ? '/players' : `${divisionPath}/players` },
  ];

  return (
    <div style={{ display: 'flex', gap: 4, borderBottom: '2px solid #e5e7eb' }}>
      {pages.map(page => (
        <Link
          key={page.id}
          href={page.path}
          style={{
            padding: '12px 20px',
            color: currentPage === page.id ? ACCENT : '#6b7280',
            textDecoration: 'none',
            fontSize: 14,
            fontWeight: currentPage === page.id ? 700 : 500,
            borderBottom: currentPage === page.id ? `3px solid ${ACCENT}` : '3px solid transparent',
            marginBottom: -2,
            transition: 'all 0.2s',
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
  divisionPath 
}: { 
  currentDivision: string;
  currentPage: string;
  divisionPath: string;
}) {
  return (
    <div style={{ marginBottom: 24 }}>
      <div style={{ background: NAV_BG, padding: '12px 20px', marginBottom: 16 }}>
        <div style={{
          maxWidth: 1200,
          margin: '0 auto',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}>
          <Link href="/" style={{ textDecoration: 'none' }}>
            <div style={{ color: '#fff', fontWeight: 700, fontSize: 20 }}>
              Sideline Stats - Beta
            </div>
          </Link>
          <DivisionSwitcher currentDivision={currentDivision} />
        </div>
      </div>

      <div style={{ maxWidth: 1200, margin: '0 auto', paddingLeft: 20, paddingRight: 20 }}>
        <SectionNav currentPage={currentPage} divisionPath={divisionPath} />
      </div>
    </div>
  );
}
