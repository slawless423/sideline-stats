// scripts/match_recruiting_profiles_mens.mjs
//
// Runs against the public mens HS recruiting API, groups players who appear in
// multiple leagues by name + grad year + height, and writes a unified-profiles
// JSON file at lib/recruiting/unified_profiles_men.json.
//
// Matching rules:
//   AUTO-LINK:
//     - Same normalized name + same grad_year + same height across all sources
//     - Same name + populated grad_year + populated height in only one source,
//       others have nulls in those fields (gaps, no conflicts)
//   FLAG FOR REVIEW:
//     - Same name across sources but grad_year conflicts
//     - Same name across sources but height conflicts
//     - Same name + grad_year, but only one source has height
//     - Same name + height, but only one source has grad_year
//     - Same name only, both year and height missing
//   SINGLE-SOURCE:
//     - Player only in one league — auto-creates a profile with no flag
//
// Manual confirmations are preserved across runs: if a profile already exists
// in the JSON with `match_confidence: "manually_confirmed"`, the script will
// not re-flag those sources for review.
//
// Run locally:
//   SITE_URL=https://sideline-stats.com node scripts/match_recruiting_profiles_mens.mjs
//
// Or via the GitHub workflow at .github/workflows/match-recruiting-profiles-mens.yml

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';

const SITE_URL = process.env.SITE_URL || 'https://sideline-stats.com';
const ENDPOINT = `${SITE_URL}/api/recruiting/mens/highschool`;
const OUTPUT_PATH = 'lib/recruiting/unified_profiles_men.json';
const DECISIONS_CSV_PATH = 'data/profile_decisions_men.csv';

// ---------- Normalization helpers ----------

function normalizeName(raw) {
  if (!raw) return '';
  return raw
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // strip accents
    .replace(/[.,'"`]/g, '')                          // strip punctuation
    .replace(/\b(jr|sr|ii|iii|iv|v)\b/g, '')          // strip suffixes
    .replace(/\s+/g, ' ')                             // collapse whitespace
    .trim();
}

function parseHeightToInches(raw) {
  if (raw == null) return null;
  if (typeof raw === 'number' && Number.isFinite(raw)) return Math.round(raw);
  if (typeof raw !== 'string') return null;
  const s = raw.trim();
  if (!s) return null;
  // Match formats like 6'7", 6'7, 6-7, 6 ft 7
  const m = s.match(/(\d+)\s*['\-\s]\s*(?:ft\s*)?(\d{1,2})/i);
  if (m) {
    const ft = parseInt(m[1], 10);
    const inch = parseInt(m[2], 10);
    if (Number.isFinite(ft) && Number.isFinite(inch) && inch < 12) {
      return ft * 12 + inch;
    }
  }
  // Bare integer = already inches
  const bare = parseInt(s, 10);
  if (Number.isFinite(bare) && bare > 50 && bare < 100) return bare;
  return null;
}

function normalizeGradYear(raw) {
  if (raw == null) return null;
  const n = parseInt(raw, 10);
  if (!Number.isFinite(n)) return null;
  if (n < 1990 || n > 2100) return null;
  return n;
}

function slugify(name, gradYear, heightInches) {
  const base = name
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  const yr = gradYear ?? 'na';
  const ht = heightInches ?? 'na';
  return `${base}-${yr}-${ht}`;
}

// ---------- Fetch ----------

async function fetchPlayers() {
  console.log(`Fetching ${ENDPOINT}`);
  const res = await fetch(ENDPOINT, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; SidelineStatsMatcher/1.0)',
      'Accept': 'application/json',
    },
  });
  if (!res.ok) {
    throw new Error(`Fetch failed: ${res.status} ${res.statusText}`);
  }
  const data = await res.json();
  if (!data || !Array.isArray(data.players)) {
    throw new Error('Response did not contain a players array');
  }
  console.log(`Got ${data.players.length} player rows`);
  return data.players;
}

// ---------- Matching ----------

// Build a lookup of source pointers that are already manually confirmed,
// so we don't re-flag them.
function buildConfirmedSourceSet(existing) {
  const set = new Set();
  for (const profile of existing.profiles ?? []) {
    if (profile.match_confidence === 'manually_confirmed') {
      for (const src of profile.sources ?? []) {
        set.add(`${src.league}::${src.player_id}`);
      }
    }
  }
  return set;
}

// Group rows by normalized name. Same player across leagues = same group.
function groupByName(rows) {
  const groups = new Map();
  for (const row of rows) {
    const key = row._norm_name;
    if (!key) continue; // skip rows we can't even identify
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  return groups;
}

// Decide if a set of rows under one name forms a clean auto-match.
// Returns { ok: true, canonical: { gradYear, height } } if clean,
// or { ok: false, reason: '...' } if it should be flagged.
function evaluateCleanMatch(rows) {
  // Collect distinct non-null values
  const years = new Set();
  const heights = new Set();
  for (const r of rows) {
    if (r._grad_year != null) years.add(r._grad_year);
    if (r._height_inches != null) heights.add(r._height_inches);
  }

  const yearVals = [...years];
  const heightVals = [...heights];

  if (yearVals.length > 1) {
    return { ok: false, reason: `grad_year conflicts (${yearVals.join(' vs ')})` };
  }
  if (heightVals.length > 1) {
    return { ok: false, reason: `height conflicts (${heightVals.map(h => h + '"').join(' vs ')})` };
  }

  // Single source, no need to flag — just record what we have
  if (rows.length === 1) {
    return {
      ok: true,
      canonical: {
        gradYear: yearVals[0] ?? null,
        height: heightVals[0] ?? null,
      },
      single: true,
    };
  }

  // Multiple sources, no conflicts. Now check for "is one source missing data
  // the others have?"
  const allYearsPresent = rows.every(r => r._grad_year != null);
  const allHeightsPresent = rows.every(r => r._height_inches != null);

  if (allYearsPresent && allHeightsPresent) {
    // All sources fully populated and consistent. Auto-link with high confidence.
    return {
      ok: true,
      canonical: {
        gradYear: yearVals[0],
        height: heightVals[0],
      },
    };
  }

  // Some sources have gaps. Per agreed rules: flag for review.
  const reasons = [];
  if (!allYearsPresent && yearVals.length === 1) {
    reasons.push(`grad_year missing in ${rows.filter(r => r._grad_year == null).length} source(s)`);
  } else if (!allYearsPresent && yearVals.length === 0) {
    reasons.push('grad_year missing everywhere');
  }
  if (!allHeightsPresent && heightVals.length === 1) {
    reasons.push(`height missing in ${rows.filter(r => r._height_inches == null).length} source(s)`);
  } else if (!allHeightsPresent && heightVals.length === 0) {
    reasons.push('height missing everywhere');
  }

  return {
    ok: false,
    reason: reasons.join('; ') || 'incomplete data across sources',
    suggestedCanonical: {
      gradYear: yearVals[0] ?? null,
      height: heightVals[0] ?? null,
    },
  };
}

function sourcesFromRows(rows) {
  // Sort: oldest season first, then alphabetical by league for ties
  const sorted = [...rows].sort((a, b) => {
    const sa = String(a.season ?? '');
    const sb = String(b.season ?? '');
    if (sa !== sb) return sa.localeCompare(sb);
    return String(a.league ?? '').localeCompare(String(b.league ?? ''));
  });
  return sorted.map(r => ({
    league: r.league,
    season: r.season,
    player_id: r.id,
    team: r.team,
    display_name: r.full_name,
    grad_year: r.grad_year,
    height: r.height,
  }));
}

// ---------- Main ----------

async function main() {
  // Load existing JSON to preserve manual confirmations
  let existing;
  try {
    const raw = await readFile(OUTPUT_PATH, 'utf-8');
    existing = JSON.parse(raw);
  } catch (e) {
    console.log(`No existing ${OUTPUT_PATH}, starting fresh`);
    existing = { generated_at: null, profiles: [], pending_review: [] };
  }
  const confirmedSourceKeys = buildConfirmedSourceSet(existing);
  console.log(`Preserving ${confirmedSourceKeys.size} previously-confirmed source row(s)`);

  // Fetch and normalize
  const rawRows = await fetchPlayers();
  const rows = rawRows.map(r => ({
    ...r,
    _norm_name: normalizeName(r.full_name),
    _grad_year: normalizeGradYear(r.grad_year),
    _height_inches: parseHeightToInches(r.height),
    _source_key: `${r.league}::${r.id}`,
  }));

  // Pull out rows already pinned to manually-confirmed profiles.
  // Those keep their existing profile entry untouched and are excluded from
  // the matching pass.
  const confirmedProfiles = (existing.profiles ?? []).filter(
    p => p.match_confidence === 'manually_confirmed'
  );
  const remaining = rows.filter(r => !confirmedSourceKeys.has(r._source_key));

  // Group remaining rows by normalized name
  const groups = groupByName(remaining);

  const profiles = [...confirmedProfiles];
  const pendingReview = [];
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

  for (const [normName, groupRows] of groups) {
    if (!normName) continue;
    const evaluation = evaluateCleanMatch(groupRows);
    const displayName = groupRows[0].full_name; // best-effort display name
    const sources = sourcesFromRows(groupRows);

    if (evaluation.ok) {
      profiles.push({
        unified_id: uniqueSlug(displayName, evaluation.canonical.gradYear, evaluation.canonical.height),
        display_name: displayName,
        grad_year: evaluation.canonical.gradYear,
        height_inches: evaluation.canonical.height,
        sources,
        match_confidence: evaluation.single ? 'single' : 'exact',
      });
    } else {
      // Flag for review. Pre-fill suggested canonical values where possible.
      pendingReview.push({
        candidate_id: uniqueSlug(displayName, evaluation.suggestedCanonical?.gradYear ?? null, evaluation.suggestedCanonical?.height ?? null),
        display_name: displayName,
        suggested_grad_year: evaluation.suggestedCanonical?.gradYear ?? null,
        suggested_height_inches: evaluation.suggestedCanonical?.height ?? null,
        reason: evaluation.reason,
        sources,
      });
    }
  }

  // Sort outputs for stable diffs
  profiles.sort((a, b) => a.unified_id.localeCompare(b.unified_id));
  pendingReview.sort((a, b) => a.candidate_id.localeCompare(b.candidate_id));

  const output = {
    generated_at: new Date().toISOString(),
    profiles,
    pending_review: pendingReview,
  };

  await mkdir(dirname(OUTPUT_PATH), { recursive: true });
  await writeFile(OUTPUT_PATH, JSON.stringify(output, null, 2) + '\n');

  // Emit a CSV alongside the JSON for the human-review workflow.
  // Only includes pending_review rows. Each row prefilled with what the
  // script knows, plus blank columns for the user's decision and overrides.
  const csvRows = [
    ['candidate_id', 'display_name', 'reason', 'sources_summary', 'suggested_grad_year', 'suggested_height_inches', 'decision', 'grad_year_override', 'height_inches_override', 'notes'],
  ];
  for (const entry of pendingReview) {
    const sourcesSummary = entry.sources.map(s =>
      `${s.league} / ${s.team ?? '?'} (id ${s.player_id})`
    ).join('; ');
    csvRows.push([
      entry.candidate_id,
      entry.display_name,
      entry.reason,
      sourcesSummary,
      entry.suggested_grad_year ?? '',
      entry.suggested_height_inches ?? '',
      '', // decision (APPROVE / SPLIT / SKIP)
      '', // grad_year_override
      '', // height_inches_override
      '', // notes
    ]);
  }
  const csv = csvRows.map(r =>
    r.map(v => {
      const s = String(v ?? '');
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    }).join(',')
  ).join('\n') + '\n';

  await mkdir(dirname(DECISIONS_CSV_PATH), { recursive: true });
  await writeFile(DECISIONS_CSV_PATH, csv);

  console.log('');
  console.log('=== Summary ===');
  console.log(`Profiles total:        ${profiles.length}`);
  console.log(`  - manually confirmed: ${profiles.filter(p => p.match_confidence === 'manually_confirmed').length}`);
  console.log(`  - exact (multi-src):  ${profiles.filter(p => p.match_confidence === 'exact').length}`);
  console.log(`  - single-source:      ${profiles.filter(p => p.match_confidence === 'single').length}`);
  console.log(`Pending review:        ${pendingReview.length}`);
  console.log('');
  console.log(`Wrote ${OUTPUT_PATH}`);
  console.log(`Wrote ${DECISIONS_CSV_PATH}`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
