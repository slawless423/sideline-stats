/**
 * generate_missing_roster_csv.mjs — Sideline Stats
 * Exports all players missing height OR year to a CSV for manual entry.
 *
 * USAGE:
 *   POSTGRES_URL=your_url node scripts/generate_missing_roster_csv.mjs
 *
 * FLAGS:
 *   --division womens-d1     only export one division (womens-d1, mens-d1, mens-d2, womens-d2)
 *   --team "Alabama St."     only export one team (exact DB name)
 *   --out roster_missing.csv custom output filename (default: missing_rosters_YYYY-MM-DD.csv)
 *
 * OUTPUT:
 *   CSV file with columns:
 *     division, team_name, first_name, last_name, height, year
 *
 *   height = blank if missing (fill in as inches, e.g. 72 for 6'0")
 *            OR as feet-inches string, e.g. 6-0 or 6'0"
 *   year   = blank if missing (fill in as: Fr, So, Jr, Sr, Grad, RS Fr, RS So)
 */

import pg from 'pg';
import fs from 'fs';
import path from 'path';

const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.POSTGRES_URL,
  ssl: process.env.POSTGRES_URL?.includes('localhost') ? false : { rejectUnauthorized: false }
});

// ─── ARGS ──────────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);

function getArg(flag) {
  const idx = args.indexOf(flag);
  return idx !== -1 ? args[idx + 1] : null;
}

const DIVISION_FILTER = getArg('--division');
const TEAM_FILTER     = getArg('--team');
const OUT_FILE        = getArg('--out') ?? `missing_rosters_${new Date().toISOString().slice(0,10)}.csv`;

// ─── VALID DIVISIONS ───────────────────────────────────────────────────────────

const ALL_DIVISIONS = ['womens-d1', 'mens-d1', 'mens-d2', 'womens-d2'];

const divisions = DIVISION_FILTER
  ? [DIVISION_FILTER]
  : ALL_DIVISIONS;

// ─── MAIN ──────────────────────────────────────────────────────────────────────

async function run() {
  const rows = [];

  for (const division of divisions) {
    let query = `
      SELECT division, team_name, first_name, last_name, height, year
      FROM players
      WHERE division = $1
        AND (height IS NULL OR year IS NULL OR year = '' OR height = 0)
      ORDER BY team_name, last_name, first_name
    `;
    const params = [division];

    if (TEAM_FILTER) {
      query = `
        SELECT division, team_name, first_name, last_name, height, year
        FROM players
        WHERE division = $1
          AND LOWER(team_name) = LOWER($2)
          AND (height IS NULL OR year IS NULL OR year = '' OR height = 0)
        ORDER BY last_name, first_name
      `;
      params.push(TEAM_FILTER);
    }

    const res = await pool.query(query, params);
    rows.push(...res.rows);
    console.log(`  ${division}: ${res.rows.length} players missing height/year`);
  }

  if (rows.length === 0) {
    console.log('\n✅ No players missing height or year! Database is complete.');
    await pool.end();
    return;
  }

  // Build CSV
  const header = 'division,team_name,first_name,last_name,height,year';
  const lines = rows.map(r => {
    const div       = csvEscape(r.division);
    const team      = csvEscape(r.team_name);
    const firstName = csvEscape(r.first_name ?? '');
    const lastName  = csvEscape(r.last_name ?? '');
    const height    = r.height && r.height !== 0 ? r.height : '';
    const year      = r.year ?? '';
    return `${div},${team},${firstName},${lastName},${height},${year}`;
  });

  const csv = [header, ...lines].join('\n');
  fs.writeFileSync(OUT_FILE, csv, 'utf8');

  console.log(`\n✅ Exported ${rows.length} players to: ${OUT_FILE}`);
  console.log(`\nInstructions:`);
  console.log(`  1. Open ${OUT_FILE} in Excel or Google Sheets`);
  console.log(`  2. Fill in the 'height' column (inches, e.g. 72 for 6'0") and/or 'year' column`);
  console.log(`     Valid year values: Fr, So, Jr, Sr, Grad, RS Fr, RS So`);
  console.log(`  3. Save as CSV (keep the same filename)`);
  console.log(`  4. Run: node scripts/import_roster_csv.mjs --file ${OUT_FILE}`);

  await pool.end();
}

function csvEscape(val) {
  const s = String(val);
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

run().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
