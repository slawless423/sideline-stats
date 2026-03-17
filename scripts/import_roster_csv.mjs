/**
 * import_roster_csv.mjs — Sideline Stats
 * Reads a filled roster CSV and updates height + year in the DB.
 *
 * USAGE:
 *   POSTGRES_URL=your_url node scripts/import_roster_csv.mjs --file missing_rosters_2026-02-27.csv
 *
 * FLAGS:
 *   --file <path>    path to filled CSV (required)
 *   --dry-run        preview changes without writing to DB
 *
 * CSV FORMAT (must match output of generate_missing_roster_csv.mjs):
 *   division,team_name,first_name,last_name,height,year
 *
 * HEIGHT FORMATS ACCEPTED:
 *   72          → 72 inches (stored as-is)
 *   6-0         → 72 inches
 *   6'0"        → 72 inches
 *   6'0         → 72 inches
 *   6 0         → 72 inches
 *
 * YEAR FORMATS ACCEPTED:
 *   Fr, Freshman, 1         → Fr
 *   So, Sophomore, 2        → So
 *   Jr, Junior, 3           → Jr
 *   Sr, Senior, 4           → Sr
 *   Grad, Graduate, 5       → Grad
 *   RS Fr, Redshirt Fr, etc → RS Fr
 *   RS So, Redshirt So, etc → RS So
 */
import pg from 'pg';
import fs from 'fs';
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
const FILE    = getArg('--file');
const DRY_RUN = args.includes('--dry-run');
if (!FILE) {
  console.error('❌ Error: --file <path> is required');
  console.error('   Example: node scripts/import_roster_csv.mjs --file missing_rosters_2026-02-27.csv');
  process.exit(1);
}
if (!fs.existsSync(FILE)) {
  console.error(`❌ Error: File not found: ${FILE}`);
  process.exit(1);
}
// ─── PARSERS ───────────────────────────────────────────────────────────────────
function parseHeight(raw) {
  if (!raw || raw.trim() === '') return null;
  const s = raw.trim();
  // Already an integer (inches)
  if (/^\d+$/.test(s)) {
    const n = parseInt(s, 10);
    return n >= 48 && n <= 96 ? n : null; // sanity check: 4'0" to 8'0"
  }
  // Formats: 6-0, 6'0", 6'0, 6 0, 6ft 0in, etc.
  const match = s.match(/(\d+)['\-\s](\d+)/);
  if (match) {
    const feet = parseInt(match[1], 10);
    const inches = parseInt(match[2], 10);
    if (feet >= 4 && feet <= 8 && inches >= 0 && inches <= 11) {
      return feet * 12 + inches;
    }
  }
  return null;
}
function parseYear(raw) {
  if (!raw || raw.trim() === '') return null;
  const s = raw.trim().toLowerCase();
  // Redshirt variants first
  if (/rs\s*fr|redshirt\s*fr|r-fr/.test(s)) return 'RS Fr';
  if (/rs\s*so|redshirt\s*so|r-so/.test(s)) return 'RS So';
  if (/rs\s*jr|redshirt\s*jr|r-jr/.test(s)) return 'RS Jr';
  if (/rs\s*sr|redshirt\s*sr|r-sr/.test(s)) return 'RS Sr';
  // Standard
  if (/^(fr|freshman|1st|1)$/.test(s)) return 'Fr';
  if (/^(so|sophomore|2nd|2)$/.test(s)) return 'So';
  if (/^(jr|junior|3rd|3)$/.test(s)) return 'Jr';
  if (/^(sr|senior|4th|4)$/.test(s)) return 'Sr';
  if (/^(grad|graduate|5th|5|gr)$/.test(s)) return 'Grad';
  return null;
}
// ─── NAME NORMALIZER ───────────────────────────────────────────────────────────
function normalizeName(name) {
  if (!name) return '';
  // Strip suffix after comma: "Raye, Jr." → "Raye", "Smith, III" → "Smith"
  return name.replace(/,\s*(Jr\.?|Sr\.?|II|III|IV|V)$/i, '').trim();
}
// ─── CSV PARSER ────────────────────────────────────────────────────────────────
function parseCSV(content) {
  const lines = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  if (lines.length < 2) return [];
  const header = lines[0].split(',').map(h => h.trim().toLowerCase());
  const pidIdx  = header.indexOf('player_id');
  const divIdx   = header.indexOf('division');
  const teamIdx  = header.indexOf('team_name');
  const fIdx     = header.indexOf('first_name');
  const lIdx     = header.indexOf('last_name');
  const htIdx    = header.indexOf('height');
  const yrIdx    = header.indexOf('year');
  if ([divIdx, teamIdx, fIdx, lIdx, htIdx, yrIdx].some(i => i === -1)) {
    console.error('❌ CSV is missing required columns. Expected: division,team_name,first_name,last_name,height,year');
    process.exit(1);
  }
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    // Handle quoted fields
    const fields = splitCSVLine(line);
    if (fields.length < 6) continue;
    rows.push({
      player_id:  pidIdx !== -1 ? (fields[pidIdx]?.trim() ?? '') : '',
      division:   fields[divIdx]?.trim()  ?? '',
      team_name:  fields[teamIdx]?.trim() ?? '',
      first_name: fields[fIdx]?.trim()    ?? '',
      last_name:  fields[lIdx]?.trim()    ?? '',
      height_raw: fields[htIdx]?.trim()   ?? '',
      year_raw:   fields[yrIdx]?.trim()   ?? '',
    });
  }
  return rows;
}
function splitCSVLine(line) {
  const fields = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i+1] === '"') { current += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (ch === ',' && !inQuotes) {
      fields.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  fields.push(current);
  return fields;
}
// ─── MAIN ──────────────────────────────────────────────────────────────────────
async function run() {
  console.log(`🏀 Roster CSV Importer — Sideline Stats`);
  if (DRY_RUN) console.log('   DRY RUN — no changes will be written\n');

  // Read file — try utf8 first, fall back to latin1 if encoding corruption detected
  let content = fs.readFileSync(FILE, 'utf8');
  if (content.includes('Ã')) {
    console.log('   ⚠️  Detected encoding issues, re-reading as latin1...');
    content = fs.readFileSync(FILE, 'latin1');
  }

  const rawRows = parseCSV(content);
  console.log(`📄 Parsed ${rawRows.length} rows from ${FILE}`);
  let updated = 0;
  let skipped = 0;
  let noMatch = 0;
  let parseErrors = 0;
  const noMatchRows = [];
  for (const row of rawRows) {
    const height = parseHeight(row.height_raw);
    const year   = parseYear(row.year_raw);
    // Skip rows where neither field is being set
    if (height === null && year === null) {
      skipped++;
      continue;
    }
    // Track parse errors (had a value but couldn't parse it)
    if (row.height_raw && height === null) {
      console.warn(`  ⚠️  Could not parse height: "${row.height_raw}" for ${row.first_name} ${row.last_name} (${row.team_name})`);
      parseErrors++;
    }
    if (row.year_raw && year === null) {
      console.warn(`  ⚠️  Could not parse year: "${row.year_raw}" for ${row.first_name} ${row.last_name} (${row.team_name})`);
      parseErrors++;
    }

    const firstName = normalizeName(row.first_name);
    const lastName  = normalizeName(row.last_name);

    if (DRY_RUN) {
      console.log(`  [DRY RUN] ${row.division} | ${row.team_name} | ${firstName} ${lastName} → height=${height ?? '(unchanged)'} year=${year ?? '(unchanged)'}`);
      updated++;
      continue;
    }

    let res;
    if (row.player_id) {
      // Primary path: look up by player_id (exact, no name ambiguity)
      res = await pool.query(`
        UPDATE players
        SET
          height = CASE WHEN $1::int IS NOT NULL THEN $1::int ELSE height END,
          year   = CASE WHEN $2::text IS NOT NULL THEN $2::text ELSE year  END
        WHERE player_id = $3
        RETURNING player_id
      `, [height, year, row.player_id.replace(/_jr\.$/, ',jr.')
                               .replace(/_sr\.$/, ',sr.')
                               .replace(/_ii$/, ',ii')
                               .replace(/_iii$/, ',iii')
                               .replace(/_iv$/, ',iv')]);
    } else {
      // Fallback: match by division + team + name (old CSVs without player_id)
      res = await pool.query(`
        UPDATE players
        SET
          height = CASE WHEN $1::int IS NOT NULL THEN $1::int ELSE height END,
          year   = CASE WHEN $2::text IS NOT NULL THEN $2::text ELSE year  END
        WHERE
          LOWER(first_name) = LOWER($3)
          AND LOWER(last_name) = LOWER($4)
          AND division = $5
          AND LOWER(team_name) = LOWER($6)
        RETURNING player_id
      `, [height, year, firstName, lastName, row.division, row.team_name]);
    }
    if (res.rowCount === 0) {
      noMatch++;
      noMatchRows.push(`${row.division} | ${row.team_name} | ${firstName} ${lastName}`);
    } else {
      updated++;
    }
  }
  console.log(`\n✅ Complete.`);
  console.log(`   Updated:      ${updated}`);
  console.log(`   Skipped:      ${skipped} (no height or year provided)`);
  console.log(`   No DB match:  ${noMatch}`);
  if (parseErrors > 0) console.log(`   Parse errors: ${parseErrors}`);
  if (noMatchRows.length > 0) {
    console.log(`\n⚠️  No DB match found for:`);
    noMatchRows.forEach(r => console.log(`   ${r}`));
  }
  await pool.end();
}
run().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
