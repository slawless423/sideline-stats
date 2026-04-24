// app/admin/ingest-hs-mens/page.tsx
//
// Minimal admin page: paste JSON, enter token, submit.
// Token is kept in memory only (not persisted) — paste each session.

'use client';

import { useState } from 'react';

const ACCENT = '#3B9EFF';
const NAVY   = '#0D1F3C';
const MUTED  = '#6B7E9A';

export default function IngestHsMensPage() {
  const [token, setToken]     = useState('');
  const [payload, setPayload] = useState('');
  const [busy, setBusy]       = useState(false);
  const [result, setResult]   = useState<{ ok: boolean; text: string } | null>(null);

  async function handleSubmit() {
    setBusy(true);
    setResult(null);
    try {
      // Pre-validate JSON before sending
      let parsed: unknown;
      try {
        parsed = JSON.parse(payload);
      } catch (e: any) {
        setResult({ ok: false, text: `Invalid JSON: ${e.message}` });
        setBusy(false);
        return;
      }

      const res = await fetch('/api/admin/ingest-hs-mens', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify(parsed),
      });

      const data = await res.json();
      if (!res.ok) {
        setResult({ ok: false, text: `Error ${res.status}: ${data.error ?? 'Unknown error'}` });
      } else {
        setResult({ ok: true, text: JSON.stringify(data, null, 2) });
        setPayload(''); // clear payload on success so you don't double-submit
      }
    } catch (err: any) {
      setResult({ ok: false, text: `Network error: ${err.message}` });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '32px 24px', fontFamily: 'Outfit, system-ui, sans-serif', color: NAVY }}>
      <h1 style={{ fontSize: 28, fontWeight: 600, marginBottom: 8 }}>Ingest Box Score — Boys HS (EYBL)</h1>
      <p style={{ color: MUTED, marginBottom: 24, fontSize: 14 }}>
        Paste the JSON returned from Claude and hit submit. Each submission adds one game to running totals.
      </p>

      <label style={{ display: 'block', fontSize: 13, fontWeight: 500, marginBottom: 6 }}>
        Ingest Token
      </label>
      <input
        type="password"
        value={token}
        onChange={e => setToken(e.target.value)}
        placeholder="Paste INGEST_TOKEN"
        style={{
          width: '100%',
          padding: '10px 12px',
          fontSize: 14,
          border: '1px solid #D4DEED',
          borderRadius: 6,
          marginBottom: 20,
          fontFamily: 'DM Mono, monospace',
        }}
      />

      <label style={{ display: 'block', fontSize: 13, fontWeight: 500, marginBottom: 6 }}>
        Box Score JSON
      </label>
      <textarea
        value={payload}
        onChange={e => setPayload(e.target.value)}
        placeholder='{ "league": "EYBL Scholastic", "season": "2026", "game": {...}, "teams": [...] }'
        rows={20}
        style={{
          width: '100%',
          padding: '12px',
          fontSize: 13,
          fontFamily: 'DM Mono, monospace',
          border: '1px solid #D4DEED',
          borderRadius: 6,
          resize: 'vertical',
          marginBottom: 16,
        }}
      />

      <button
        onClick={handleSubmit}
        disabled={busy || !token || !payload}
        style={{
          background: busy || !token || !payload ? '#A8C8F0' : ACCENT,
          color: 'white',
          border: 'none',
          padding: '12px 24px',
          fontSize: 15,
          fontWeight: 500,
          borderRadius: 6,
          cursor: busy || !token || !payload ? 'not-allowed' : 'pointer',
        }}
      >
        {busy ? 'Ingesting...' : 'Submit'}
      </button>

      {result && (
        <div style={{
          marginTop: 24,
          padding: 16,
          border: `1px solid ${result.ok ? '#6BCF7F' : '#E06A6A'}`,
          background: result.ok ? '#EFFBF1' : '#FDECEC',
          borderRadius: 6,
        }}>
          <div style={{ fontWeight: 600, marginBottom: 8, color: result.ok ? '#2A7A3A' : '#A63A3A' }}>
            {result.ok ? '✓ Success' : '✗ Failed'}
          </div>
          <pre style={{ fontSize: 12, fontFamily: 'DM Mono, monospace', whiteSpace: 'pre-wrap', margin: 0 }}>
            {result.text}
          </pre>
        </div>
      )}
    </div>
  );
}
