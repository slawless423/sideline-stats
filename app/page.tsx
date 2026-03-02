'use client';

import Link from 'next/link';
import { useState } from 'react';

// ── Brand Tokens ──────────────────────────────────────────────
const NAVY   = "#0D1F3C";
const BLUE   = "#1B4B8A";
const SKY    = "#2E7DD1";
const ACCENT = "#3B9EFF";
const ICE    = "#A8C8F0";
const FROST  = "#E8F2FC";
const MUTED  = "#6B7E9A";
const INK    = "#0A0F1C";

const DIVISIONS = [
  { id: 'womens-d1', label: "Women's D1", path: '/womens-d1', enabled: true,  stats: '363 Teams · 5,400+ Players' },
  { id: 'mens-d1',   label: "Men's D1",   path: '/mens-d1',   enabled: true,  stats: '365 Teams · 5,500+ Players' },
  { id: 'womens-d2', label: "Women's D2", path: '/womens-d2', enabled: true, stats: '290+ Teams · 3,800+ Players' },
  { id: 'mens-d2',   label: "Men's D2",   path: '/mens-d2',   enabled: true,  stats: '290+ Teams · 4,200+ Players' },
  { id: 'womens-d3', label: "Women's D3", path: '/womens-d3', enabled: false, stats: 'Coming Soon' },
  { id: 'mens-d3',   label: "Men's D3",   path: '/mens-d3',   enabled: false, stats: 'Coming Soon' },
];

const CARD_BULLETS = [
  'Team Stats',
  'Player Database',
  'Recruiting / Transfers Database',
];

function Wordmark() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', lineHeight: 1 }}>
      <span style={{ fontFamily: "'Outfit', sans-serif", fontWeight: 800, fontSize: 28, color: '#fff', letterSpacing: '-0.02em', lineHeight: 1 }}>
        Sideline
      </span>
      <div style={{ width: '100%', height: 2, background: ICE, margin: '6px 0' }} />
      <span style={{ fontFamily: "'Outfit', sans-serif", fontWeight: 300, fontSize: 28, color: ICE, letterSpacing: '0.18em', textTransform: 'uppercase' as const, lineHeight: 1 }}>
        Stats
      </span>
    </div>
  );
}

function ContactForm() {
  const [submitted, setSubmitted] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', message: '' });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
  };

  const inputStyle = {
    width: '100%',
    padding: '12px 16px',
    fontFamily: "'Outfit', sans-serif",
    fontSize: 15,
    color: INK,
    background: '#fff',
    border: `1px solid ${ICE}`,
    borderRadius: 8,
    outline: 'none',
    boxSizing: 'border-box' as const,
  };

  if (submitted) {
    return (
      <div style={{ textAlign: 'center', padding: '48px 0' }}>
        <div style={{ fontSize: 40, marginBottom: 16 }}>✓</div>
        <div style={{ fontFamily: "'Outfit', sans-serif", fontWeight: 700, fontSize: 22, color: NAVY, marginBottom: 8 }}>Message sent!</div>
        <div style={{ fontFamily: "'Outfit', sans-serif", color: MUTED, fontSize: 15 }}>We'll get back to you as soon as possible.</div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <div>
          <label style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, letterSpacing: '0.15em', textTransform: 'uppercase' as const, color: MUTED, display: 'block', marginBottom: 8 }}>Name</label>
          <input style={inputStyle} placeholder="Your name" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required />
        </div>
        <div>
          <label style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, letterSpacing: '0.15em', textTransform: 'uppercase' as const, color: MUTED, display: 'block', marginBottom: 8 }}>Email</label>
          <input style={inputStyle} type="email" placeholder="your@email.com" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} required />
        </div>
      </div>
      <div>
        <label style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, letterSpacing: '0.15em', textTransform: 'uppercase' as const, color: MUTED, display: 'block', marginBottom: 8 }}>Message</label>
        <textarea style={{ ...inputStyle, minHeight: 140, resize: 'vertical' as const }} placeholder="Your message..." value={form.message} onChange={e => setForm({ ...form, message: e.target.value })} required />
      </div>
      <button type="submit" style={{
        padding: '14px 32px',
        background: ACCENT,
        color: '#fff',
        border: 'none',
        borderRadius: 8,
        fontFamily: "'Outfit', sans-serif",
        fontSize: 15,
        fontWeight: 700,
        cursor: 'pointer',
        alignSelf: 'flex-start',
        letterSpacing: '0.01em',
      }}>
        Send Message →
      </button>
    </form>
  );
}

export default function LandingPage() {
  return (
    <>
      <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800&family=DM+Mono:wght@400;500&display=swap" rel="stylesheet" />

      <div style={{ fontFamily: "'Outfit', sans-serif", color: INK, background: '#fff', display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>

        {/* ── ABOVE THE FOLD ── */}
        <div style={{
          background: NAVY,
          position: 'relative',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          minHeight: '100vh',
        }}>
          {/* Subtle grid overlay */}
          <div style={{
            position: 'absolute', inset: 0,
            backgroundImage: `linear-gradient(rgba(43,125,209,0.07) 1px, transparent 1px), linear-gradient(90deg, rgba(43,125,209,0.07) 1px, transparent 1px)`,
            backgroundSize: '40px 40px',
            pointerEvents: 'none',
          }} />

          {/* Nav */}
          <div style={{ maxWidth: 1200, width: '100%', margin: '0 auto', padding: '24px 40px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'relative', boxSizing: 'border-box' }}>
            <Wordmark />
            <nav style={{ display: 'flex', gap: 32, alignItems: 'center' }}>
              <a href="#contact" style={{ fontFamily: "'Outfit', sans-serif", color: ICE, fontSize: 14, fontWeight: 500, textDecoration: 'none', letterSpacing: '0.01em' }}>Contact</a>
            </nav>
          </div>

          {/* ── TWO-COLUMN MAIN ── */}
          <div style={{
            flex: 1,
            maxWidth: 1200,
            width: '100%',
            margin: '0 auto',
            padding: '40px 40px 60px',
            display: 'grid',
            gridTemplateColumns: '1fr 1.6fr',
            gap: 64,
            alignItems: 'start',
            position: 'relative',
            boxSizing: 'border-box',
          }}>

            {/* LEFT — About / Description */}
            <div style={{ position: 'sticky', top: 40 }}>
              <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, letterSpacing: '0.2em', textTransform: 'uppercase', color: SKY, marginBottom: 20 }}>
                College Basketball Analytics
              </div>

              <h1 style={{ fontFamily: "'Outfit', sans-serif", fontWeight: 800, fontSize: 44, letterSpacing: '-0.03em', lineHeight: 1.05, color: '#fff', marginBottom: 24 }}>
                The Numbers Behind College Basketball.
              </h1>

              <p style={{ fontFamily: "'Outfit', sans-serif", fontSize: 15, lineHeight: 1.75, color: ICE, marginBottom: 20, fontWeight: 400 }}>
                Whether you're a coach, scout, analyst, or a fan who loves the numbers — Sideline Stats gives you scouting and recruiting tools to surface the insights that give you an edge before anyone else is looking.
              </p>

              <p style={{ fontFamily: "'Outfit', sans-serif", fontSize: 15, lineHeight: 1.75, color: `${ICE}99`, fontWeight: 400, marginBottom: 36 }}>
                Sideline Stats organizes team and player metrics for all levels of college basketball, especially those that rarely get this level of attention.
              </p>

              {/* Mini stats */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                {[
                  { value: '1,000+', label: 'Teams Tracked' },
                  { value: '15,000+', label: 'Players' },
                  { value: 'Daily', label: 'Data Updates' },
                ].map(stat => (
                  <div key={stat.label} style={{ background: 'rgba(255,255,255,0.05)', borderRadius: 12, padding: '16px 18px', border: `1px solid rgba(168,200,240,0.15)` }}>
                    <div style={{ fontFamily: "'Outfit', sans-serif", fontWeight: 800, fontSize: 26, color: '#fff', letterSpacing: '-0.02em', marginBottom: 4 }}>
                      {stat.value}
                    </div>
                    <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: MUTED }}>
                      {stat.label}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* RIGHT — Division Cards */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              {DIVISIONS.map(div => (
                <div key={div.id} style={{
                  background: div.enabled ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.025)',
                  borderRadius: 14,
                  padding: '24px 22px',
                  border: `1px solid ${div.enabled ? 'rgba(168,200,240,0.2)' : 'rgba(168,200,240,0.08)'}`,
                  opacity: div.enabled ? 1 : 0.55,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 12,
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <h3 style={{ fontFamily: "'Outfit', sans-serif", fontWeight: 800, fontSize: 17, color: '#fff', letterSpacing: '-0.01em', margin: 0 }}>
                      {div.label}
                    </h3>
                    {!div.enabled && (
                      <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 8, letterSpacing: '0.12em', textTransform: 'uppercase', color: MUTED, background: 'rgba(255,255,255,0.05)', padding: '3px 7px', borderRadius: 4, whiteSpace: 'nowrap' }}>
                        Soon
                      </span>
                    )}
                  </div>

                  {/* Bullets */}
                  <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 6, flex: 1 }}>
                    {CARD_BULLETS.map(bullet => (
                      <li key={bullet} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ width: 4, height: 4, borderRadius: '50%', background: div.enabled ? ACCENT : MUTED, flexShrink: 0 }} />
                        <span style={{ fontFamily: "'Outfit', sans-serif", fontSize: 13, color: div.enabled ? `${ICE}cc` : `${MUTED}99`, lineHeight: 1.4 }}>
                          {bullet}
                        </span>
                      </li>
                    ))}
                  </ul>

                  <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: div.enabled ? SKY : MUTED, letterSpacing: '0.05em' }}>
                    {div.stats}
                  </div>

                  {div.enabled ? (
                    <Link href={div.path} style={{
                      display: 'block',
                      padding: '9px 16px',
                      background: ACCENT,
                      color: '#fff',
                      textDecoration: 'none',
                      borderRadius: 7,
                      fontFamily: "'Outfit', sans-serif",
                      fontWeight: 700,
                      fontSize: 13,
                      textAlign: 'center',
                    }}>
                      View Stats →
                    </Link>
                  ) : (
                    <div style={{
                      padding: '9px 16px',
                      background: 'rgba(255,255,255,0.04)',
                      color: MUTED,
                      borderRadius: 7,
                      fontFamily: "'Outfit', sans-serif",
                      fontWeight: 600,
                      fontSize: 13,
                      textAlign: 'center',
                      cursor: 'not-allowed',
                    }}>
                      Coming Soon
                    </div>
                  )}
                </div>
              ))}
            </div>

          </div>
        </div>

        {/* ── CONTACT ── */}
        <div id="contact" style={{ background: FROST, padding: '80px 40px' }}>
          <div style={{ maxWidth: 720, margin: '0 auto' }}>
            <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, letterSpacing: '0.25em', textTransform: 'uppercase', color: SKY, marginBottom: 12 }}>
              Contact
            </div>
            <h2 style={{ fontFamily: "'Outfit', sans-serif", fontWeight: 800, fontSize: 40, letterSpacing: '-0.02em', color: NAVY, marginBottom: 12 }}>
              Get in Touch
            </h2>
            <p style={{ fontFamily: "'Outfit', sans-serif", fontSize: 16, color: MUTED, marginBottom: 40, lineHeight: 1.7 }}>
              Have a question, feedback, or want to collaborate? We'd love to hear from you.
            </p>
            <ContactForm />
          </div>
        </div>

        {/* ── FOOTER ── */}
        <div style={{ background: NAVY, padding: '32px 40px' }}>
          <div style={{ maxWidth: 1200, margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, letterSpacing: '0.15em', textTransform: 'uppercase', color: `${ICE}60` }}>
              © {new Date().getFullYear()} Sideline Stats · All rights reserved
            </div>
            <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, letterSpacing: '0.15em', textTransform: 'uppercase', color: `${ICE}60` }}>
              Beta
            </div>
          </div>
        </div>

      </div>
    </>
  );
}
