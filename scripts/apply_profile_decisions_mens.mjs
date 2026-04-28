// scripts/apply_profile_decisions_mens.mjs
//
// Reads data/profile_decisions_men.csv and applies each row's decision to
// lib/recruiting/unified_profiles_men.json.
//
// ALSO: For APPROVE decisions, backfills the canonical grad_year and height
// to the source rows in the eybl_players table where they are null or differ.
// All DB updates run in a single transaction — fail-safe rollback on any error.
//
// Required env: POSTGRES_URL (must be set in GitHub Actions secrets).
//
// CSV schema (must match what match_recruiting_profiles_mens.mjs emits):
//   candidate_id, display_name, reason, sources_summary,
//   suggested_grad_year, suggested_height_inches,
//   decision, grad_year_override, height_inches_override, notes
//
// Decision values:
//   APPROVE — move pending entry to profiles as a single unified profile,
//             match_confidence = "manually_confirmed". Uses overrides if set,
//             otherwise the suggested values from the matching pass.
//             ALSO updates DB source rows to match canonical values.
//   SPLIT   — break each source row in the entry into its own single-source
//             profile. No DB update (each row keeps its existing values).
//   SKIP    — leave the entry in pending_review (unchanged). No DB update.
//   blank   — same as SKIP.
//
// Safety guarantees:
//   - All UPDATEs run inside a single transaction (BEGIN ... COMMIT).
//   - Each UPDATE is keyed on (id, league) for defense in depth.
//   - Only grad_year and height columns are written. Nothing else touched.
//   - JSON is only written AFTER successful DB commit. If DB fails, JSON
//     stays unchanged — system stays consistent.
//   - Idempotent: if DB already matches canonical, no UPDATE is issued.
//
// Run locally:
//   POSTGRES_URL=... node scripts/apply_profile_decisions_mens.mjs

import { readFile, writeFile } from 'node:fs/promises';
import pg from 'pg';

const { Pool } = pg;

const JSON_PATH = 'lib/recruiting/unified_profiles_men.json';
const CSV_PATH = 'data/profile_decisions_men.csv';
const CLEAR_PROCESSED_ROWS = process.env.CLEAR_PROCESSED_ROWS !== 'false';
const DB_TABLE = 'eybl_players';

// ---------- Slug helper (must match the matching script) ----------

function slugify(name, gradYear, heightInches) {
  const base = String(name)
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  const yr = gradYear ?? 'na';
  const ht = heightInches ?? 'na';
  return `${base}-${yr}-${ht}`;
}

// ---------- Height conversion helpers ----------

function parseHeightInches(raw) {
  if (raw == null) return null;
  if (typeof raw === 'number' && Number.isFinite(raw)) return Math.round(raw);
  if (typeof raw !== 'string') return null;
  const s = raw.trim();
  if (!s) return null;
  const m = s.match(/(\d+)\s*['\-\s]\s*(?:ft\s*)?(\d{1,2})/i);
  if (m) {
    const ft = parseInt(m[1], 10);
    const inch = parseInt(m[2], 10);
    if (Number.isFinite(ft) && Number.isFinite(inch) && inch < 12) return ft * 12 + inch;
  }
  const bare = parseInt(s, 10);
  if (Number.isFinite(bare) && bare > 50 && bare < 100) return bare;
  return null;
}

function inchesToHeightString(inches) {
  if (inches == null || !Number.isFinite(inches)) return null;
  const ft = Math.floor(inches / 12);
  const inch = inches % 12;
  return `${ft}'${inch}"`;
}

// ---------- CSV parser (RFC 4180-ish) ----------

function parseCSV(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  let i = 0;
  while (i < text.length) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 2; continue; }
        inQuotes = false; i++; continue;
      }
      field += c; i++; continue;
    }
    if (c === '"') { inQuotes = true; i++; continue; }
    if (c === ',') { row.push(field); field = ''; i++; continue; }
    if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; i++; continue; }
    if (c === '\r') { i++; continue; }
    field += c; i++;
  }
  if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row); }
  if (rows.length === 0) return { headers: [], records: [] };
  const headers = rows[0];
  const records = rows.slice(1)
    .filter(r => r.some(f => f && f.length > 0))
    .map(r => {
      const obj = {};
      headers.forEach((h, idx) => { obj[h] = r[idx] ?? ''; });
      return obj;
    });
  return { headers, records };
}

function csvEscape(v) {
  const s = String(v ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function writeCSV(headers, records) {
  const lines = [headers.join(',')];
  for (const r of records) {
    lines.push(headers.map(h => csvEscape(r[h])).join(','));
  }
  return lines.join('\n') + '\n';
}

// ---------- DB updates ----------

// Plan an UPDATE for one source row. Returns null if no update needed
// (DB already matches canonical), otherwise returns { sql, params, summary }.
function planUpdate(source, canonicalGradYear, canonicalHeightInches) {
  const targetGradYear = Number.isFinite(canonicalGradYear) ? canonicalGradYear : null;
  const targetHeightStr = canonicalHeightInches != null
    ? inchesToHeightString(canonicalHeightInches)
    : null;

  const currentGradYear = source.grad_year ?? null;
  const currentHeightStr = source.height ?? null;

  const setClauses = [];
  const params = [];
  const summary = [];

  if (targetGradYear != null && currentGradYear !== targetGradYear) {
    params.push(targetGradYear);
    setClauses.push(`grad_year = $${params.length}`);
    summary.push(`grad_year ${currentGradYear ?? 'NULL'} -> ${targetGradYear}`);
  }
  if (targetHeightStr != null && currentHeightStr !== targetHeightStr) {
    params.push(targetHeightStr);
    setClauses.push(`height = $${params.length}`);
    summary.push(`height ${currentHeightStr ?? 'NULL'} -> ${targetHeightStr}`);
  }

  if (setClauses.length === 0) return null;

  params.push(source.player_id);
  const idIdx = params.length;
  params.push(source.league);
  const leagueIdx = params.length;

  const sql = `UPDATE ${DB_TABLE} SET ${setClauses.join(', ')} WHERE id = $${idIdx} AND league = $${leagueIdx}`;
  return {
    sql,
    params,
    summary: `id=${source.player_id} league="${source.league}" :: ${summary.join('; ')}`,
  };
}

// ---------- Main ----------

async function main() {
  const jsonText = await readFile(JSON_PATH, 'utf-8');
  const data = JSON.parse(jsonText);

  let csvText;
  try {
    csvText = await readFile(CSV_PATH, 'utf-8');
  } catch (e) {
    console.error(`Could not read ${CSV_PATH}: ${e.message}`);
    process.exit(1);
  }
  const { headers, records } = parseCSV(csvText);

  const required = ['candidate_id', 'decision'];
  for (const r of required) {
    if (!headers.includes(r)) {
      console.error(`CSV is missing required column: ${r}`);
      process.exit(1);
    }
  }

  const pending = data.pending_review ?? [];
  const profiles = data.profiles ?? [];
  const usedSlugs = new Set(profiles.map(p => p.unified_id));

  function uniqueSlug(name, gradYear, heightInches) {
    let base = slugify(name, gradYear, heightInches);
    let candidate = base;
    let i = 2;
    while (usedSlugs.has(candidate)) {
      candidate = `${base}-${i}`;
      i++;
    }
    usedSlugs.add(candidate);
    return candidate;
  }

  const decisionsByCandidateId = new Map();
  for (const rec of records) {
    if (!rec.candidate_id) continue;
    decisionsByCandidateId.set(rec.candidate_id, rec);
  }

  // ---- Plan all changes (in memory, no writes yet) ----
  const remaining = [];
  const processedCandidateIds = new Set();
  const newProfiles = [];
  const dbUpdates = [];

  let approveCount = 0;
  let splitCount = 0;
  let skipCount = 0;
  let unknownCount = 0;

  for (const entry of pending) {
    const decision = decisionsByCandidateId.get(entry.candidate_id);
    const action = (decision?.decision ?? '').trim().toUpperCase();

    if (action === 'APPROVE') {
      const gradYearOverride = decision.grad_year_override?.trim();
      const heightOverride = decision.height_inches_override?.trim();
      const gradYearCanonical = gradYearOverride
        ? parseInt(gradYearOverride, 10)
        : (entry.suggested_grad_year ?? null);
      const heightCanonical = heightOverride
        ? parseInt(heightOverride, 10)
        : (entry.suggested_height_inches ?? null);

      newProfiles.push({
        unified_id: uniqueSlug(entry.display_name, gradYearCanonical, heightCanonical),
        display_name: entry.display_name,
        grad_year: Number.isFinite(gradYearCanonical) ? gradYearCanonical : null,
        height_inches: Number.isFinite(heightCanonical) ? heightCanonical : null,
        sources: entry.sources,
        match_confidence: 'manually_confirmed',
      });

      for (const src of entry.sources) {
        const update = planUpdate(src, gradYearCanonical, heightCanonical);
        if (update) dbUpdates.push(update);
      }

      processedCandidateIds.add(entry.candidate_id);
      approveCount++;
      continue;
    }

    if (action === 'SPLIT') {
      for (const src of entry.sources) {
        const srcGradYear = src.grad_year ?? null;
        const srcHeightInches = parseHeightInches(src.height);
        newProfiles.push({
          unified_id: uniqueSlug(src.display_name ?? entry.display_name, srcGradYear, srcHeightInches),
          display_name: src.display_name ?? entry.display_name,
          grad_year: srcGradYear,
          height_inches: srcHeightInches,
          sources: [src],
          match_confidence: 'manually_confirmed',
        });
      }
      processedCandidateIds.add(entry.candidate_id);
      splitCount++;
      continue;
    }

    if (action === 'SKIP' || action === '') {
      remaining.push(entry);
      skipCount++;
      continue;
    }

    console.warn(`Unknown decision for ${entry.candidate_id}: ${decision.decision}. Keeping pending.`);
    remaining.push(entry);
    unknownCount++;
  }

  console.log('');
  console.log('=== Planned changes ===');
  console.log(`APPROVE: ${approveCount}`);
  console.log(`SPLIT:   ${splitCount}`);
  console.log(`SKIP:    ${skipCount}`);
  if (unknownCount > 0) console.log(`UNKNOWN: ${unknownCount}`);
  console.log(`DB UPDATEs planned: ${dbUpdates.length}`);
  for (const u of dbUpdates) {
    console.log(`  ${u.summary}`);
  }
  console.log('');

  // ---- Execute DB updates in a transaction ----
  if (dbUpdates.length > 0) {
    if (!process.env.POSTGRES_URL) {
      console.error('POSTGRES_URL is not set. Cannot apply DB updates. Aborting.');
      process.exit(1);
    }
    const pool = new Pool({ connectionString: process.env.POSTGRES_URL });
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      console.log('DB transaction started');
      let executed = 0;
      for (const u of dbUpdates) {
        const result = await client.query(u.sql, u.params);
        if (result.rowCount === 0) {
          console.warn(`  No row matched for: ${u.summary} (UPDATE affected 0 rows)`);
        }
        executed++;
      }
      await client.query('COMMIT');
      console.log(`DB transaction committed (${executed} UPDATE statements executed)`);
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      console.error('DB transaction FAILED — rolled back. JSON not written.');
      console.error(err);
      client.release();
      await pool.end();
      process.exit(1);
    }
    client.release();
    await pool.end();
  } else {
    console.log('No DB updates needed.');
  }

  // ---- Write JSON (only reached if DB succeeded) ----
  // Backfill the source row copies inside each new APPROVE'd profile so the
  // JSON mirrors the DB state.
  for (const profile of newProfiles) {
    if (profile.match_confidence !== 'manually_confirmed') continue;
    const canonicalHeightStr = profile.height_inches != null
      ? inchesToHeightString(profile.height_inches)
      : null;
    profile.sources = profile.sources.map(src => ({
      ...src,
      ...(profile.grad_year != null ? { grad_year: profile.grad_year } : {}),
      ...(canonicalHeightStr != null ? { height: canonicalHeightStr } : {}),
    }));
  }

  profiles.push(...newProfiles);
  profiles.sort((a, b) => a.unified_id.localeCompare(b.unified_id));
  remaining.sort((a, b) => a.candidate_id.localeCompare(b.candidate_id));

  const updated = {
    generated_at: data.generated_at,
    profiles,
    pending_review: remaining,
  };
  await writeFile(JSON_PATH, JSON.stringify(updated, null, 2) + '\n');

  if (CLEAR_PROCESSED_ROWS) {
    const remainingRecords = records.filter(r => !processedCandidateIds.has(r.candidate_id));
    await writeFile(CSV_PATH, writeCSV(headers, remainingRecords));
  }

  console.log('');
  console.log('=== Apply Summary ===');
  console.log(`APPROVE:           ${approveCount}`);
  console.log(`SPLIT:             ${splitCount}`);
  console.log(`SKIP:              ${skipCount}`);
  if (unknownCount > 0) console.log(`UNKNOWN:           ${unknownCount}`);
  console.log(`DB UPDATEs run:    ${dbUpdates.length}`);
  console.log('');
  console.log(`Wrote ${JSON_PATH}`);
  if (CLEAR_PROCESSED_ROWS) console.log(`Updated ${CSV_PATH} (removed ${approveCount + splitCount} processed rows)`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
