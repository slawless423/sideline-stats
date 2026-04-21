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
 * SUPPORTED CSV FORMATS (auto-detected from header):
 *
 * 1) COLLEGE / TRANSFERS:
 *    division,team_name,first_name,last_name,height,year
 *    Writes to: players table. Height stored as int inches. Year as text.
 *
 * 2) WOMENS HS (detected by 'grad_year' column):
 *    player_id,league,team,season,first_name,last_name,full_name,height,grad_year
 *    Writes to: hs_players_womens table. Height stored as "6'3\"" text. Grad year as int.
 *
 * HEIGHT FORMATS ACCEPTED (college):
 *   72          → 72 inches (stored as-is)
 *   6-0         → 72 inches
 *   6'0"        → 72 inches
 *   6'0         → 72 inches
 *   6 0         → 72 inches
 *
 * HEIGHT FORMATS ACCEPTED (HS — normalized to "6'3\"" format):
 *   6'3"        → 6'3"
 *   6-3         → 6'3"
 *   6 3         → 6'3"
 *   75          → 6'3" (inches converted to ft'in" format)
 *
 * YEAR FORMATS ACCEPTED (college):
 *   Fr, Freshman, 1         → Fr
 *   So, Sophomore, 2        → So
 *   Jr, Junior, 3           → Jr
 *   Sr, Senior, 4           → Sr
 *   Grad, Graduate, 5       → Grad
 *   RS Fr, Redshirt Fr, etc → RS Fr
 *   RS So, Redshirt So, etc → RS So
 *
 * GRAD YEAR FORMAT (HS):
 *   Integer between 2025 and 2035 (e.g. 2028)
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

// HS height parser — normalizes various input formats to canonical "6'3\"" string.
// Returns a string like 6'3" or null if unparseable.
function parseHSHeight(raw) {
  if (!raw || raw.trim() === '') return null;
  const s = raw.trim();

  // Plain integer — treat as inches, convert to ft'in"
  if (/^\d+$/.test(s)) {
    const n = parseInt(s, 10);
    if (n >= 48 && n <= 96) {
      const feet = Math.floor(n / 12);
      const inches = n % 12;
      return `${feet}'${inches}"`;
    }
    return null;
  }

  // Formats: 6-0, 6'0", 6'0, 6 0, 6ft 0in, etc.
  const match = s.match(/(\d+)['\-\s](\d+)/);
  if (match) {
    const feet = parseInt(match[1], 10);
    const inches = parseInt(match[2], 10);
    if (feet >= 4 && feet <= 8 && inches >= 0 && inches <= 11) {
      return `${feet}'${inches}"`;
    }
  }
  return null;
}

// HS grad_year parser — integer between 2025 and 2035.
function parseGradYear(raw) {
  if (!raw || raw.trim() === '') return null;
  const s = raw.trim();
  if (!/^\d+$/.test(s)) return null;
  const n = parseInt(s, 10);
  return n >= 2025 && n <= 2035 ? n : null;
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
  if (lines.length < 2) return { format: 'college', rows: [] };
  const header = lines[0].split(',').map(h => h.trim().toLowerCase());

  // Auto-detect format: HS has 'grad_year' column, college has 'year'
  const isHS = header.includes('grad_year');
  if (isHS) {
    return parseHSCSV(lines, header);
  }

  // ── College / transfers format ──
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
  return { format: 'college', rows };
}

function parseHSCSV(lines, header) {
  const pidIdx    = header.indexOf('player_id');
  const leagueIdx = header.indexOf('league');
  const teamIdx   = header.indexOf('team');
  const seasonIdx = header.indexOf('season');
  const fIdx      = header.indexOf('first_name');
  const lIdx      = header.indexOf('last_name');
  const fnIdx     = header.indexOf('full_name');
  const htIdx     = header.indexOf('height');
  const gyIdx     = header.indexOf('grad_year');

  if ([pidIdx, leagueIdx, teamIdx, fnIdx, htIdx, gyIdx].some(i => i === -1)) {
    console.error('❌ HS CSV is missing required columns. Expected: player_id,league,team,season,first_name,last_name,full_name,height,grad_year');
    process.exit(1);
  }

  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const fields = splitCSVLine(line);
    if (fields.length < 9) continue;
    rows.push({
      player_id:     fields[pidIdx]?.trim()    ?? '',
      league:        fields[leagueIdx]?.trim() ?? '',
      team:          fields[teamIdx]?.trim()   ?? '',
      season:        fields[seasonIdx]?.trim() ?? '',
      first_name:    fIdx  !== -1 ? (fields[fIdx]?.trim()  ?? '') : '',
      last_name:     lIdx  !== -1 ? (fields[lIdx]?.trim()  ?? '') : '',
      full_name:     fields[fnIdx]?.trim()     ?? '',
      height_raw:    fields[htIdx]?.trim()     ?? '',
      grad_year_raw: fields[gyIdx]?.trim()     ?? '',
    });
  }
  return { format: 'hs', rows };
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

  const parsed = parseCSV(content);
  console.log(`📄 Parsed ${parsed.rows.length} rows from ${FILE} (format: ${parsed.format})`);

  if (parsed.format === 'hs') {
    await runHSImport(parsed.rows);
  } else {
    await runCollegeImport(parsed.rows);
  }

  await pool.end();
}

async function runCollegeImport(rawRows) {
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
}

async function runHSImport(rawRows) {
  let updated = 0;
  let skipped = 0;
  let noMatch = 0;
  let parseErrors = 0;
  const noMatchRows = [];

  for (const row of rawRows) {
    const height    = parseHSHeight(row.height_raw);
    const gradYear  = parseGradYear(row.grad_year_raw);

    if (height === null && gradYear === null) {
      skipped++;
      continue;
    }

    if (row.height_raw && height === null) {
      console.warn(`  ⚠️  Could not parse height: "${row.height_raw}" for ${row.full_name} (${row.team}, ${row.league})`);
      parseErrors++;
    }
    if (row.grad_year_raw && gradYear === null) {
      console.warn(`  ⚠️  Could not parse grad_year: "${row.grad_year_raw}" for ${row.full_name} (${row.team}, ${row.league})`);
      parseErrors++;
    }

    if (!row.player_id) {
      console.warn(`  ⚠️  Row missing player_id: ${row.full_name} (${row.team}, ${row.league}) — skipping`);
      noMatch++;
      noMatchRows.push(`${row.league} | ${row.team} | ${row.full_name} (no player_id)`);
      continue;
    }

    if (DRY_RUN) {
      console.log(`  [DRY RUN] ${row.league} | ${row.team} | ${row.full_name} → height=${height ?? '(unchanged)'} grad_year=${gradYear ?? '(unchanged)'}`);
      updated++;
      continue;
    }

    const res = await pool.query(`
      UPDATE hs_players_womens
      SET
        height    = CASE WHEN $1::text IS NOT NULL THEN $1::text ELSE height    END,
        grad_year = CASE WHEN $2::int  IS NOT NULL THEN $2::int  ELSE grad_year END
      WHERE id = $3
      RETURNING id
    `, [height, gradYear, parseInt(row.player_id, 10)]);

    if (res.rowCount === 0) {
      noMatch++;
      noMatchRows.push(`${row.league} | ${row.team} | ${row.full_name} (id=${row.player_id} not found)`);
    } else {
      updated++;
    }
  }
  console.log(`\n✅ Complete.`);
  console.log(`   Updated:      ${updated}`);
  console.log(`   Skipped:      ${skipped} (no height or grad_year provided)`);
  console.log(`   No DB match:  ${noMatch}`);
  if (parseErrors > 0) console.log(`   Parse errors: ${parseErrors}`);
  if (noMatchRows.length > 0) {
    console.log(`\n⚠️  No DB match found for:`);
    noMatchRows.forEach(r => console.log(`   ${r}`));
  }
}

run().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
