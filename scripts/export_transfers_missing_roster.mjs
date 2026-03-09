// export_transfers_missing_roster.mjs
// Queries the transfers table for players missing height or year,
// outputs a CSV in the same format as the roster import CSV so you
// can fill in the blanks and re-import via import_roster_csv workflow.
//
// Usage: node scripts/export_transfers_missing_roster.mjs
// Output: rosters/transfers_missing_roster.csv  (printed to stdout as well)

import { neon } from '@neondatabase/serverless';
import { writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const sql = neon(process.env.DATABASE_URL);

async function main() {
  console.log('Querying transfers table for players missing height or year...');

  const rows = await sql`
    SELECT
      name,
      previous_school,
      new_school,
      division,
      height,
      year,
      player_id,
      match_status
    FROM transfers
    WHERE (height IS NULL OR height = '' OR year IS NULL OR year = '')
      AND match_status != 'unmatched'
    ORDER BY division, previous_school, name
  `;

  console.log(`Found ${rows.length} transfer players missing height or year.\n`);

  if (rows.length === 0) {
    console.log('Nothing to export — all matched transfers have height and year.');
    return;
  }

  // Log a summary of what's missing
  const missingBoth  = rows.filter(r => (!r.height || r.height === '') && (!r.year || r.year === ''));
  const missingHtOnly = rows.filter(r => (!r.height || r.height === '') && r.year && r.year !== '');
  const missingYrOnly = rows.filter(r => r.height && r.height !== '' && (!r.year || r.year === ''));
  console.log(`  Missing both:   ${missingBoth.length}`);
  console.log(`  Missing height: ${missingHtOnly.length}`);
  console.log(`  Missing year:   ${missingYrOnly.length}\n`);

  // Build CSV — same columns expected by import_roster_csv.mjs
  // division,team_name,first_name,last_name,height,year
  // We split "name" on the first space to get first/last.
  // Players with suffixes (Jr., Sr., III, etc.) keep them in last_name.
  const csvLines = [
    'division,team_name,first_name,last_name,height,year',
  ];

  for (const r of rows) {
    const nameParts = r.name.trim().split(/\s+/);
    const firstName = nameParts[0] ?? '';
    const lastName  = nameParts.slice(1).join(' ') ?? '';

    // Determine division label matching what import_roster_csv expects
    // transfers.division is stored as "D1 Men" / "D2 Men" — map to db division strings
    const divMap: Record<string, string> = {
      'D1 Men': 'mens-d1',
      'D2 Men': 'mens-d2',
      'D1 Women': 'womens-d1',
      'D2 Women': 'womens-d2',
    };
    const division = divMap[r.division] ?? r.division;

    // team_name: use previous_school (that's where the player_id is rooted)
    const teamName = r.previous_school ?? '';

    const height = r.height ?? '';
    const year   = r.year   ?? '';

    // Quote fields that might contain commas (school names like "Davis & Elkins")
    const q = (v: string) => (v.includes(',') ? `"${v}"` : v);

    csvLines.push([
      q(division),
      q(teamName),
      q(firstName),
      q(lastName),
      q(height),
      q(year),
    ].join(','));
  }

  const csv = csvLines.join('\n') + '\n';

  // Write to rosters/ directory
  const outDir  = join(__dirname, '..', 'rosters');
  const outPath = join(outDir, 'transfers_missing_roster.csv');
  mkdirSync(outDir, { recursive: true });
  writeFileSync(outPath, csv, 'utf8');

  console.log(`Wrote ${rows.length} rows to: rosters/transfers_missing_roster.csv`);
  console.log('\nFirst 10 rows preview:');
  csvLines.slice(0, 11).forEach(l => console.log(' ', l));
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
