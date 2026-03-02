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
  {
    id: 'womens-d1',
    label: "Women's D1",
    description: "Full KenPom-style ratings, advanced metrics, and player analytics for all 363 Division I women's programs.",
    path: '/',
    enabled: true,
    stats: '363 Teams · 5,400+ Players',
  },
  {
    id: 'mens-d1',
    label: "Men's D1",
    description: "Comprehensive efficiency ratings, tempo-adjusted stats, and player tracking for all Division I men's programs.",
    path: '/mens-d1',
    enabled: true,
    stats: '362 Teams · 5,500+ Players',
  },
  {
    id: 'mens-d2',
    label: "Men's D2",
    description: "Advanced analytics brought to Division II men's basketball — a level rarely covered at this depth.",
    path: '/mens-d2',
    enabled: true,
    stats: '290+ Teams · 4,200+ Players',
  },
  {
    id: 'womens-d2',
    label: "Women's D2",
    description: "In-depth statistics and ratings for Women's Division II college basketball.",
    path: '/womens-d2',
    enabled: false,
    stats: 'Coming Soon',
  },
  {
    id: 'mens-d3',
    label: "Men's D3",
    description: "Advanced analytics for Men's Division III — the largest division in college basketball.",
    path: '/mens-d3',
    enabled: false,
    stats: 'Coming Soon',
  },
  {
    id: 'womens-d3',
    label: "Women's D3",
    description: "Bringing data-driven insights to Women's Division III college basketball.",
    path: '/womens-d3',
    enabled: false,
    stats: 'Coming Soon',
  },
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
    // Placeholder — wire up to your email service
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

      <div style={{ fontFamily: "'Outfit', sans-serif", color: INK, background: '#fff' }}>

        {/* ── HERO ── */}
        <div style={{
          background: NAVY,
          position: 'relative',
          overflow: 'hidden',
          padding: '0 0 80px',
        }}>
          {/* Subtle grid overlay */}
          <div style={{
            position: 'absolute', inset: 0,
            backgroundImage: `linear-gradient(rgba(43,125,209,0.07) 1px, transparent 1px), linear-gradient(90deg, rgba(43,125,209,0.07) 1px, transparent 1px)`,
            backgroundSize: '40px 40px',
            pointerEvents: 'none',
          }} />

          {/* Abstract court lines */}
          <div style={{ position: 'absolute', right: -60, top: '50%', transform: 'translateY(-50%)', opacity: 0.08, pointerEvents: 'none' }}>
            <svg width="500" height="500" viewBox="0 0 400 400" fill="none">
              <circle cx="200" cy="200" r="160" stroke="#2E7DD1" strokeWidth="1.5"/>
              <circle cx="200" cy="200" r="90" stroke="#2E7DD1" strokeWidth="1"/>
              <line x1="200" y1="0" x2="200" y2="400" stroke="#2E7DD1" strokeWidth="1"/>
              <line x1="0" y1="200" x2="400" y2="200" stroke="#2E7DD1" strokeWidth="0.5"/>
              <rect x="80" y="120" width="240" height="160" stroke="#2E7DD1" strokeWidth="0.75"/>
              <path d="M80 160 Q160 200 80 240" stroke="#2E7DD1" strokeWidth="1"/>
            </svg>
          </div>

          {/* Nav */}
          <div style={{ maxWidth: 1200, margin: '0 auto', padding: '24px 40px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'relative' }}>
            <Wordmark />
            <nav style={{ display: 'flex', gap: 32, alignItems: 'center' }}>
              <a href="#divisions" style={{ fontFamily: "'Outfit', sans-serif", color: ICE, fontSize: 14, fontWeight: 500, textDecoration: 'none', letterSpacing: '0.01em' }}>Divisions</a>
              <a href="#about" style={{ fontFamily: "'Outfit', sans-serif", color: ICE, fontSize: 14, fontWeight: 500, textDecoration: 'none', letterSpacing: '0.01em' }}>About</a>
              <a href="#contact" style={{ fontFamily: "'Outfit', sans-serif", color: ICE, fontSize: 14, fontWeight: 500, textDecoration: 'none', letterSpacing: '0.01em' }}>Contact</a>
            </nav>
          </div>

          {/* Hero content */}
          <div style={{ maxWidth: 1200, margin: '0 auto', padding: '64px 40px 0', position: 'relative' }}>
            <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, letterSpacing: '0.25em', textTransform: 'uppercase', color: SKY, marginBottom: 24 }}>
              Women's & Men's · D1 · D2 · D3
            </div>
            <h1 style={{ fontFamily: "'Outfit', sans-serif", fontWeight: 800, fontSize: 72, letterSpacing: '-0.03em', lineHeight: 0.95, color: '#fff', marginBottom: 28, maxWidth: 700 }}>
              The Numbers<br />Behind the <em style={{ color: ACCENT, fontStyle: 'italic' }}>Game.</em>
            </h1>
            <p style={{ fontFamily: "'Outfit', sans-serif", fontSize: 18, lineHeight: 1.7, color: ICE, maxWidth: 540, marginBottom: 40, fontWeight: 400 }}>
              KenPom-style ratings, advanced efficiency metrics, and deep player analytics for college basketball divisions that rarely get this level of attention.
            </p>
            <a href="#divisions" style={{
              display: 'inline-block',
              padding: '14px 32px',
              background: ACCENT,
              color: '#fff',
              textDecoration: 'none',
              borderRadius: 8,
              fontFamily: "'Outfit', sans-serif",
              fontWeight: 700,
              fontSize: 15,
              letterSpacing: '0.01em',
            }}>
              Explore Divisions →
            </a>
          </div>
        </div>

        {/* ── DIVISION CARDS ── */}
        <div id="divisions" style={{ background: FROST, padding: '80px 40px' }}>
          <div style={{ maxWidth: 1200, margin: '0 auto' }}>
            <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, letterSpacing: '0.25em', textTransform: 'uppercase', color: SKY, marginBottom: 12 }}>
              Divisions
            </div>
            <h2 style={{ fontFamily: "'Outfit', sans-serif", fontWeight: 800, fontSize: 40, letterSpacing: '-0.02em', color: NAVY, marginBottom: 48 }}>
              Pick Your Division
            </h2>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 24 }}>
              {DIVISIONS.map(div => (
                <div key={div.id} style={{
                  background: '#fff',
                  borderRadius: 16,
                  padding: '32px 28px',
                  border: `1px solid ${div.enabled ? `${ICE}80` : '#e5e7eb'}`,
                  opacity: div.enabled ? 1 : 0.65,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 16,
                  boxShadow: div.enabled ? '0 4px 20px rgba(13,31,60,0.06)' : 'none',
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <h3 style={{ fontFamily: "'Outfit', sans-serif", fontWeight: 800, fontSize: 20, color: NAVY, letterSpacing: '-0.01em' }}>
                      {div.label}
                    </h3>
                    {!div.enabled && (
                      <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, letterSpacing: '0.15em', textTransform: 'uppercase', color: MUTED, background: FROST, padding: '4px 8px', borderRadius: 4 }}>
                        Coming Soon
                      </span>
                    )}
                  </div>
                  <p style={{ fontFamily: "'Outfit', sans-serif", fontSize: 14, lineHeight: 1.6, color: MUTED, flex: 1 }}>
                    {div.description}
                  </p>
                  <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: div.enabled ? SKY : MUTED, letterSpacing: '0.05em' }}>
                    {div.stats}
                  </div>
                  {div.enabled ? (
                    <Link href={div.path} style={{
                      display: 'inline-block',
                      padding: '10px 20px',
                      background: NAVY,
                      color: '#fff',
                      textDecoration: 'none',
                      borderRadius: 8,
                      fontFamily: "'Outfit', sans-serif",
                      fontWeight: 600,
                      fontSize: 14,
                      textAlign: 'center',
                    }}>
                      View Rankings →
                    </Link>
                  ) : (
                    <div style={{
                      padding: '10px 20px',
                      background: '#f3f4f6',
                      color: '#9ca3af',
                      borderRadius: 8,
                      fontFamily: "'Outfit', sans-serif",
                      fontWeight: 600,
                      fontSize: 14,
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

        {/* ── ABOUT ── */}
        <div id="about" style={{ background: '#fff', padding: '80px 40px' }}>
          <div style={{ maxWidth: 1200, margin: '0 auto', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 80, alignItems: 'center' }}>
            <div>
              <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, letterSpacing: '0.25em', textTransform: 'uppercase', color: SKY, marginBottom: 12 }}>
                About
              </div>
              <h2 style={{ fontFamily: "'Outfit', sans-serif", fontWeight: 800, fontSize: 40, letterSpacing: '-0.02em', color: NAVY, marginBottom: 24, lineHeight: 1.1 }}>
                What is Sideline Stats?
              </h2>
              <p style={{ fontFamily: "'Outfit', sans-serif", fontSize: 16, lineHeight: 1.8, color: MUTED, marginBottom: 20 }}>
                Sideline Stats brings KenPom-style advanced analytics to the divisions of college basketball that have historically been underserved by data. We track efficiency ratings, tempo-adjusted stats, and player-level metrics across Women's and Men's D1, D2, and D3.
              </p>
              <p style={{ fontFamily: "'Outfit', sans-serif", fontSize: 16, lineHeight: 1.8, color: MUTED }}>
                Whether you're a coach, scout, analyst, or just a fan who loves the numbers — Sideline Stats gives you the tools to understand the game at a deeper level.
              </p>
            </div>

            {/* Stat highlights */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
              {[
                { value: '1,000+', label: 'Teams Tracked' },
                { value: '15,000+', label: 'Players in Database' },
                { value: '3', label: 'Active Divisions' },
                { value: 'Daily', label: 'Data Updates' },
              ].map(stat => (
                <div key={stat.label} style={{ background: FROST, borderRadius: 16, padding: '28px 24px', border: `1px solid ${ICE}60` }}>
                  <div style={{ fontFamily: "'Outfit', sans-serif", fontWeight: 800, fontSize: 36, color: NAVY, letterSpacing: '-0.02em', marginBottom: 8 }}>
                    {stat.value}
                  </div>
                  <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', color: MUTED }}>
                    {stat.label}
                  </div>
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
