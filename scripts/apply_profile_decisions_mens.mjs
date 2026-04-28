// scripts/apply_profile_decisions_mens.mjs
//
// Reads data/profile_decisions_men.csv and applies each row's decision to
// lib/recruiting/unified_profiles_men.json.
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
//   SPLIT   — break each source row in the entry into its own single-source
//             profile in the profiles array.
//   SKIP    — leave the entry in pending_review (unchanged).
//   blank   — same as SKIP.
//
// After applying, writes the updated JSON back. Optionally clears processed
// rows from the CSV (controlled by CLEAR_PROCESSED_ROWS env var, default true).
//
// Run locally:
//   node scripts/apply_profile_decisions_mens.mjs

import { readFile, writeFile } from 'node:fs/promises';

const JSON_PATH = 'lib/recruiting/unified_profiles_men.json';
const CSV_PATH = 'data/profile_decisions_men.csv';
const CLEAR_PROCESSED_ROWS = process.env.CLEAR_PROCESSED_ROWS !== 'false';

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
  // Trailing field/row
  if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row); }
  if (rows.length === 0) return { headers: [], records: [] };
  const headers = rows[0];
  const records = rows.slice(1)
    .filter(r => r.some(f => f && f.length > 0)) // skip blank lines
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

  // Sanity-check headers
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

  const remaining = [];
  const processedCandidateIds = new Set();
  let approveCount = 0;
  let splitCount = 0;
  let skipCount = 0;
  let unknownCount = 0;

  for (const entry of pending) {
    const decision = decisionsByCandidateId.get(entry.candidate_id);
    const action = (decision?.decision ?? '').trim().toUpperCase();

    if (action === 'APPROVE') {
      // Build canonical values: prefer overrides, then suggested, then derive from sources
      const gradYearOverride = decision.grad_year_override?.trim();
      const heightOverride = decision.height_inches_override?.trim();
      const gradYear = gradYearOverride
        ? parseInt(gradYearOverride, 10)
        : (entry.suggested_grad_year ?? null);
      const heightInches = heightOverride
        ? parseInt(heightOverride, 10)
        : (entry.suggested_height_inches ?? null);

      profiles.push({
        unified_id: uniqueSlug(entry.display_name, gradYear, heightInches),
        display_name: entry.display_name,
        grad_year: Number.isFinite(gradYear) ? gradYear : null,
        height_inches: Number.isFinite(heightInches) ? heightInches : null,
        sources: entry.sources,
        match_confidence: 'manually_confirmed',
      });
      processedCandidateIds.add(entry.candidate_id);
      approveCount++;
      continue;
    }

    if (action === 'SPLIT') {
      // Each source becomes its own single-source profile.
      for (const src of entry.sources) {
        // Use whatever metadata that source had
        const srcGradYear = src.grad_year ?? null;
        const srcHeightInches = parseHeightInches(src.height);
        profiles.push({
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

    // Unknown decision value — log and keep entry pending
    console.warn(`Unknown decision for ${entry.candidate_id}: ${decision.decision}. Keeping pending.`);
    remaining.push(entry);
    unknownCount++;
  }

  // Sort outputs for stable diffs
  profiles.sort((a, b) => a.unified_id.localeCompare(b.unified_id));
  remaining.sort((a, b) => a.candidate_id.localeCompare(b.candidate_id));

  const updated = {
    generated_at: data.generated_at,
    profiles,
    pending_review: remaining,
  };
  await writeFile(JSON_PATH, JSON.stringify(updated, null, 2) + '\n');

  // Optionally clear processed rows from CSV. Keeps SKIPs and unknowns,
  // drops APPROVE/SPLIT rows that have been applied.
  if (CLEAR_PROCESSED_ROWS) {
    const remainingRecords = records.filter(r => !processedCandidateIds.has(r.candidate_id));
    await writeFile(CSV_PATH, writeCSV(headers, remainingRecords));
  }

  console.log('');
  console.log('=== Apply Summary ===');
  console.log(`APPROVE: ${approveCount}`);
  console.log(`SPLIT:   ${splitCount}`);
  console.log(`SKIP:    ${skipCount}`);
  if (unknownCount > 0) console.log(`UNKNOWN: ${unknownCount} (kept pending — check spelling)`);
  console.log('');
  console.log(`Wrote ${JSON_PATH}`);
  if (CLEAR_PROCESSED_ROWS) console.log(`Updated ${CSV_PATH} (removed ${approveCount + splitCount} processed rows)`);
}

// Helper for SPLIT — parse height string ("6'7\"") to inches
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

main().catch(err => {
  console.error(err);
  process.exit(1);
});
