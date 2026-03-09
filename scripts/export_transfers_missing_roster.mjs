// export_transfers_missing_roster.mjs
// Queries the transfers table for matched players missing height or year,
// outputs rosters/transfers_missing_roster.csv ready for import_roster_csv workflow.
//
// Usage: node scripts/export_transfers_missing_roster.mjs

import pg from 'pg';
import { writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const { Pool } = pg;
const __dirname = dirname(fileURLToPath(import.meta.url));

async function main() {
  if (!process.env.POSTGRES_URL) {
    console.error('No POSTGRES_URL set');
    process.exit(1);
  }

  const pool = new Pool({
    connectionString: process.env.POSTGRES_URL,
    ssl: { rejectUnauthorized: false },
  });

  console.log('Querying transfers table for players missing height or year...');

  const { rows } = await pool.query(`
    SELECT name, previous_school, new_school, division, height, year, player_id, match_status
    FROM transfers
    WHERE (height IS NULL OR height = '' OR year IS NULL OR year = '')
      AND match_status != 'unmatched'
    ORDER BY division, previous_school, name
  `);

  await pool.end();

  console.log(`Found ${rows.length} transfer players missing height or year.\n`);

  if (rows.length === 0) {
    console.log('Nothing to export — all matched transfers have height and year.');
    return;
  }

  const missingBoth   = rows.filter(r => (!r.height || r.height === '') && (!r.year || r.year === ''));
  const missingHtOnly = rows.filter(r => (!r.height || r.height === '') && r.year && r.year !== '');
  const missingYrOnly = rows.filter(r => r.height && r.height !== '' && (!r.year || r.year === ''));
  console.log(`  Missing both:   ${missingBoth.length}`);
  console.log(`  Missing height: ${missingHtOnly.length}`);
  console.log(`  Missing year:   ${missingYrOnly.length}\n`);

  const divMap = {
    'D1 Men':   'mens-d1',
    'D2 Men':   'mens-d2',
    'D1 Women': 'womens-d1',
    'D2 Women': 'womens-d2',
  };

  const q = (v) => (v.includes(',') ? `"${v}"` : v);

  const csvLines = ['division,team_name,first_name,last_name,height,year'];

  for (const r of rows) {
    const nameParts = r.name.trim().split(/\s+/);
    const firstName = nameParts[0] || '';
    const lastName  = nameParts.slice(1).join(' ') || '';
    const division  = divMap[r.division] || r.division;
    const teamName  = r.previous_school || '';
    const height    = r.height || '';
    const year      = r.year   || '';

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
