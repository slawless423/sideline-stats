/**
 * ESPN Roster Scraper - Sideline Stats
 * 
 * Pulls height + class year for all D1 Men's & Women's players from ESPN's
 * unofficial JSON API, then updates your players table.
 * 
 * HOW IT WORKS:
 *   1. Reads all distinct (team_name, division) pairs from your DB
 *   2. Looks up the ESPN team ID via a mapping (built from ESPN's teams page)
 *   3. Hits ESPN's JSON roster API — no HTML scraping needed
 *   4. Matches players by first_name + last_name, updates height + year
 * 
 * USAGE:
 *   POSTGRES_URL=your_url node scrape_espn_rosters.mjs
 * 
 *   Optional flags:
 *     --division womens-d1   (only run one division)
 *     --dry-run              (print matches without writing to DB)
 *     --resume-from "Team Name"  (skip teams until you hit this one)
 * 
 * RATE LIMIT: 1 request/sec. Full run ~350 teams = ~6 minutes.
 */

import pg from 'pg';
const { Pool } = pg;

// ─── CONFIG ────────────────────────────────────────────────────────────────────

const DELAY_MS = 1000;
const DRY_RUN = process.argv.includes('--dry-run');
const DIVISION_FILTER = (() => {
  const idx = process.argv.indexOf('--division');
  return idx !== -1 ? process.argv[idx + 1] : null;
})();
const RESUME_FROM = (() => {
  const idx = process.argv.indexOf('--resume-from');
  return idx !== -1 ? process.argv[idx + 1].toLowerCase() : null;
})();

const pool = new Pool({
  connectionString: process.env.POSTGRES_URL,
  ssl: process.env.POSTGRES_URL?.includes('localhost') ? false : { rejectUnauthorized: false }
});

// ─── ESPN TEAM ID MAP ──────────────────────────────────────────────────────────
// Maps your DB team_name values → ESPN team IDs.
// Covers both womens-d1 and mens-d1 (most share the same ESPN ID).
// 
// KEY FORMAT: lowercase, spaces normalized, common words removed
// We do fuzzy matching at runtime so this doesn't need to be perfect.

const ESPN_ID_MAP = {
  // ACC
  'boston college': 103,
  'california': 25,
  'cal': 25,
  'clemson': 228,
  'duke': 150,
  'florida state': 52,
  'georgia tech': 59,
  'louisville': 97,
  'miami': 2390,
  'nc state': 152,
  'north carolina': 153,
  'unc': 153,
  'notre dame': 87,
  'pittsburgh': 221,
  'pitt': 221,
  'smu': 2567,
  'stanford': 24,
  'syracuse': 183,
  'virginia': 258,
  'virginia tech': 259,
  'wake forest': 154,
  // ASUN
  'austin peay': 2046,
  'bellarmine': 91,
  'central arkansas': 2110,
  'eastern kentucky': 2198,
  'florida gulf coast': 526,
  'fgcu': 526,
  'jacksonville': 294,
  'lipscomb': 288,
  'north alabama': 2453,
  'north florida': 2454,
  'unf': 2454,
  'queens university': 2511,
  'queens': 2511,
  'stetson': 56,
  'west georgia': 2698,
  // America East
  'binghamton': 2066,
  'bryant': 2803,
  'maine': 311,
  'njit': 2885,
  'new hampshire': 160,
  'albany': 399,
  'ualbany': 399,
  'umbc': 2378,
  'umass lowell': 2349,
  'vermont': 261,
  // American
  'charlotte': 2429,
  'east carolina': 151,
  'ecu': 151,
  'florida atlantic': 2226,
  'fau': 2226,
  'memphis': 235,
  'north texas': 249,
  'unt': 249,
  'rice': 242,
  'south florida': 58,
  'usf': 58,
  'temple': 218,
  'tulane': 2655,
  'tulsa': 202,
  'uab': 5,
  'utsa': 2636,
  'wichita state': 2724,
  // A-10
  'davidson': 2166,
  'dayton': 2168,
  'duquesne': 2184,
  'fordham': 2230,
  'george mason': 2244,
  'george washington': 45,
  'gwu': 45,
  'la salle': 2325,
  'loyola chicago': 2350,
  'rhode island': 227,
  'uri': 227,
  'richmond': 257,
  "saint joseph's": 2603,
  'st. josephs': 2603,
  'saint josephs': 2603,
  'saint louis': 139,
  'slu': 139,
  'umass': 2663,
  'massachusetts': 2663,
  'vcu': 2479,
  'xavier': 2670,
  // Big 12
  'arizona': 12,
  'arizona state': 9,
  'baylor': 239,
  'byu': 252,
  'cincinnati': 2132,
  'colorado': 38,
  'houston': 248,
  'iowa state': 66,
  'kansas': 2305,
  'kansas state': 2253,
  'oklahoma': 201,
  'oklahoma state': 197,
  'tcu': 2628,
  'texas': 251,
  'texas tech': 44,
  'ucf': 2116,
  'utah': 254,
  'west virginia': 277,
  // Big East
  'butler': 2086,
  'connecticut': 41,
  'uconn': 41,
  'creighton': 156,
  'depaul': 2204,
  'georgetown': 46,
  'marquette': 269,
  'providence': 2507,
  'seton hall': 2550,
  "st. john's": 2599,
  'st johns': 2599,
  'villanova': 222,
  'xavier': 2670,
  // Big Sky
  'eastern washington': 331,
  'idaho': 70,
  'idaho state': 304,
  'montana': 149,
  'montana state': 147,
  'northern arizona': 2464,
  'nau': 2464,
  'northern colorado': 2459,
  'portland state': 305,
  'sacramento state': 2561,
  'sac state': 2561,
  'weber state': 2710,
  // Big South
  'campbell': 2121,
  'charleston southern': 2127,
  'coastal carolina': 324,
  'gardner-webb': 2239,
  'high point': 2272,
  'longwood': 2399,
  'presbyterian': 2575,
  'radford': 2579,
  'unc asheville': 2427,
  'unca': 2427,
  'usc upstate': 2649,
  'winthrop': 2681,
  // Big Ten
  'illinois': 356,
  'indiana': 84,
  'iowa': 2294,
  'maryland': 166,
  'michigan': 130,
  'michigan state': 127,
  'minnesota': 135,
  'nebraska': 158,
  'northwestern': 77,
  'ohio state': 194,
  'penn state': 213,
  'purdue': 2509,
  'rutgers': 164,
  'usc': 30,
  'ucla': 26,
  'oregon': 2483,
  'oregon state': 2084,
  'washington': 264,
  'washington state': 265,
  'wisconsin': 275,
  // Big West
  'cal poly': 13,
  'cal state fullerton': 2239,
  'csuf': 2239,
  'cal state northridge': 2463,
  'csun': 2463,
  'hawaii': 62,
  'long beach state': 578,
  'uc davis': 2067,
  'uc irvine': 2252,
  'uc riverside': 2578,
  'uc santa barbara': 2540,
  'ucsb': 2540,
  'utah state': 328,
  // CAAC / CAA
  'college of charleston': 232,
  'delaware': 231,
  'drexel': 2182,
  'elon': 2193,
  'hofstra': 2278,
  'monmouth': 2450,
  'northeastern': 2462,
  'stony brook': 2603,
  'townson': 2633,
  'towson': 2633,
  'william & mary': 2729,
  'william mary': 2729,
  'uncw': 350,
  'unc wilmington': 350,
  // CUSA
  'fiu': 2229,
  'florida international': 2229,
  'kennesaw state': 2306,
  'la tech': 2329,
  'louisiana tech': 2329,
  'liberty': 2335,
  'middle tennessee': 2393,
  'mtsu': 2393,
  'new mexico state': 166,
  'nmsu': 166,
  'sam houston': 2592,
  'sam houston state': 2592,
  'utep': 2638,
  'western kentucky': 2710,
  'wku': 2710,
  // Horizon
  'cleveland state': 2139,
  'detroit mercy': 2172,
  'green bay': 2263,
  'uwgb': 2263,
  'iupui': 85,
  'milwaukee': 270,
  'uw-milwaukee': 270,
  'northern kentucky': 2466,
  'nku': 2466,
  'oakland': 2439,
  'purdue fort wayne': 2870,
  'robert morris': 2543,
  'wright state': 2750,
  'youngstown state': 2752,
  // Ivy
  'brown': 225,
  'columbia': 171,
  'cornell': 172,
  'dartmouth': 334,
  'harvard': 108,
  'penn': 219,
  'pennsylvania': 219,
  'princeton': 163,
  'yale': 43,
  // MAAC
  'canisius': 2136,
  'fairfield': 2217,
  'iona': 314,
  'manhattan': 2363,
  'marist': 2373,
  'niagara': 315,
  'quinnipiac': 2520,
  'rider': 2535,
  'saint peters': 2590,
  "saint peter's": 2590,
  'siena': 2561,
  // MAC
  'akron': 2006,
  'ball state': 2050,
  'bowling green': 189,
  'buffalo': 2084,
  'central michigan': 2117,
  'eastern michigan': 2197,
  'kent state': 2309,
  'miami oh': 193,
  'miami (oh)': 193,
  'northern illinois': 2459,
  'niu': 2459,
  'ohio': 195,
  'toledo': 2649,
  'western michigan': 2720,
  // MEAC
  'coppin state': 2158,
  'delaware state': 2169,
  'florida a&m': 2221,
  'famu': 2221,
  'howard': 47,
  'morgan state': 2453,
  'norfolk state': 2455,
  'north carolina at': 2448,
  'ncat': 2448,
  'nc a&t': 2448,
  'north carolina central': 2450,
  'nccu': 2450,
  'south carolina state': 2596,
  // Mountain West
  'air force': 2005,
  'boise state': 68,
  'colorado state': 36,
  'fresno state': 278,
  'nevada': 2440,
  'new mexico': 167,
  'san diego state': 21,
  'sdsu': 21,
  'san jose state': 23,
  'sjsu': 23,
  'unlv': 2439,
  'utah state': 328,
  'wyoming': 2751,
  // MVC
  'bradley': 71,
  'drake': 2181,
  'evansville': 339,
  'illinois state': 318,
  'indiana state': 319,
  'missouri state': 2623,
  'northern iowa': 2271,
  'uni': 2271,
  'southern illinois': 79,
  'siu': 79,
  'ust': 2628,
  'valparaiso': 2674,
  // NEC
  'central connecticut': 2115,
  'ccsu': 2115,
  'fairleigh dickinson': 2218,
  'liu': 2335,
  'long island university': 2335,
  'merrimack': 2853,
  'mount st. marys': 2429,
  'mount st marys': 2429,
  'sacred heart': 2566,
  'st. francis ny': 2598,
  'saint francis': 2598,
  'st. francis pa': 2597,
  'wagner': 2685,
  // OVC
  'belmont': 2057,
  'eastern illinois': 2193,
  'jacksonville state': 55,
  'little rock': 2106,
  'ualr': 2106,
  'morehead state': 2454,
  'murray state': 93,
  'se missouri state': 2601,
  'semo': 2601,
  'southern indiana': 2871,
  'tennessee martin': 2630,
  'ut martin': 2630,
  'tennessee state': 2629,
  'tennessee tech': 2631,
  // Patriot
  'american university': 44,
  'army': 349,
  'bucknell': 2746,
  'colgate': 2155,
  'holy cross': 107,
  'lafayette': 322,
  'lehigh': 322,
  'loyola maryland': 2330,
  'navy': 2426,
  // SEC
  'alabama': 333,
  'arkansas': 8,
  'auburn': 2,
  'florida': 57,
  'georgia': 61,
  'kentucky': 96,
  'lsu': 99,
  'mississippi': 145,
  'ole miss': 145,
  'mississippi state': 344,
  'miss state': 344,
  'missouri': 142,
  'mizzou': 142,
  'south carolina': 2579,
  'tennessee': 2633,
  'texas a&m': 245,
  'vanderbilt': 238,
  // SoCon
  'citadel': 2134,
  'east tennessee state': 2199,
  'etsu': 2199,
  'furman': 231,
  'mercer': 2382,
  'samford': 2582,
  'unc greensboro': 2428,
  'uncg': 2428,
  'utm': 2630,
  'vmI': 2724,
  'western carolina': 2717,
  'wofford': 2749,
  // Southland
  'abilene christian': 2000,
  'houston christian': 2287,
  'hcu': 2287,
  'incarnate word': 2352,
  'uiw': 2352,
  'lamar': 2321,
  'mcneese': 2383,
  'mcneese state': 2383,
  'nicholls': 2440,
  'nicholls state': 2440,
  'northwestern state': 2466,
  'se louisiana': 2600,
  'southeastern louisiana': 2600,
  'tarleton state': 2630,
  'texas a&m corpus christi': 2637,
  'tamucc': 2637,
  // Summit
  'denver': 2172,
  'north dakota': 2459,
  'nd': 2459,
  'north dakota state': 2455,
  'ndsu': 2455,
  'omaha': 2437,
  'nebraska omaha': 2437,
  'oral roberts': 2491,
  'south dakota': 2597,
  'south dakota state': 2593,
  'sdsu': 2593,
  'st. thomas mn': 2873,
  // Sun Belt
  'appalachian state': 2026,
  'app state': 2026,
  'arkansas state': 2032,
  'georgia southern': 2247,
  'georgia state': 2248,
  'james madison': 2294,
  'jmu': 2294,
  'louisiana': 309,
  'ul lafayette': 309,
  'louisiana monroe': 2376,
  'ulm': 2376,
  'marshall': 276,
  'old dominion': 2490,
  'odu': 2490,
  'southern miss': 2608,
  'usm': 2608,
  'texas state': 326,
  'troy': 2653,
  'utah state': 328,
  // SWAC
  'alabama a&m': 2006,
  'alabama state': 2010,
  'alcorn state': 2016,
  'arkansas pine bluff': 2029,
  'uapb': 2029,
  'bethune-cookman': 2065,
  'grambling': 2755,
  'grambling state': 2755,
  'jackson state': 297,
  'mississippi valley state': 2432,
  'mvsu': 2432,
  'prairie view': 2504,
  'prairie view a&m': 2504,
  'southern': 2582,
  'southern university': 2582,
  'texas southern': 2640,
  // WAC
  'cal baptist': 2856,
  'cbu': 2856,
  'grand canyon': 2253,
  'gcu': 2253,
  'new mexico state': 166,
  'seattle': 2615,
  'abilene christian': 2000,
  'dixie state': 3101,
  'utah valley': 3101,
  // WCC
  'gonzaga': 2250,
  'loyola marymount': 2344,
  'lmu': 2344,
  'pacific': 279,
  'pepperdine': 279,
  'portland': 2501,
  'san diego': 301,
  'san francisco': 301,
  'santa clara': 312,
  'saint marys': 2608,
  "saint mary's": 2608,
};

// ─── HELPERS ───────────────────────────────────────────────────────────────────

const sleep = ms => new Promise(r => setTimeout(r, ms));

function normalizeName(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9 &]/g, ' ')
    .replace(/\b(university|college|state|the)\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function findESPNId(dbTeamName) {
  const normalized = normalizeName(dbTeamName);

  // Direct match
  if (ESPN_ID_MAP[normalized] !== undefined) return ESPN_ID_MAP[normalized];

  // Try progressively looser matches
  for (const [key, id] of Object.entries(ESPN_ID_MAP)) {
    if (normalized === key) return id;
  }
  for (const [key, id] of Object.entries(ESPN_ID_MAP)) {
    if (normalized.includes(key) || key.includes(normalized)) return id;
  }

  // Last resort: word overlap
  const words = normalized.split(' ').filter(w => w.length > 3);
  let bestScore = 0;
  let bestId = null;
  for (const [key, id] of Object.entries(ESPN_ID_MAP)) {
    const keyWords = key.split(' ');
    const matches = words.filter(w => keyWords.includes(w)).length;
    if (matches > bestScore) {
      bestScore = matches;
      bestId = id;
    }
  }
  if (bestScore >= 1) return bestId;

  return null;
}

// ─── ESPN API ──────────────────────────────────────────────────────────────────

async function fetchESPNRoster(espnId, league) {
  const url = `https://site.api.espn.com/apis/site/v2/sports/basketball/${league}/teams/${espnId}/roster`;
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (research; sideline-stats)' }
    });
    if (!res.ok) {
      console.log(`    ⚠️  HTTP ${res.status}`);
      return [];
    }
    const data = await res.json();
    return parseESPNRoster(data);
  } catch (err) {
    console.log(`    ❌ ${err.message}`);
    return [];
  }
}

function parseESPNRoster(data) {
  const players = [];
  const athletes = data?.athletes ?? [];

  // ESPN returns athletes grouped by position group
  // Each group has an "items" array of athletes
  const items = Array.isArray(athletes)
    ? athletes.flatMap(group => group.items ?? [group])
    : [];

  for (const athlete of items) {
    const fullName = athlete.fullName ?? athlete.displayName ?? '';
    if (!fullName) continue;

    const nameParts = fullName.trim().split(' ');
    const firstName = nameParts[0];
    const lastName = nameParts.slice(1).join(' ') || '';

    // height comes as inches (integer) in ESPN API
    const heightIn = athlete.height ?? null;

    // year / experience
    const experienceText = athlete.experience?.displayValue
      ?? athlete.experience?.abbreviation
      ?? null;

    // ESPN uses: 'FR', 'SO', 'JR', 'SR', 'GR'
    const year = normalizeYear(experienceText);

    players.push({ firstName, lastName, heightIn, year });
  }
  return players;
}

function normalizeYear(raw) {
  if (!raw) return null;
  const u = raw.toUpperCase().trim();
  if (u === 'FR' || u === 'FRESHMAN') return 'Fr';
  if (u === 'SO' || u === 'SOPHOMORE') return 'So';
  if (u === 'JR' || u === 'JUNIOR') return 'Jr';
  if (u === 'SR' || u === 'SENIOR') return 'Sr';
  if (u === 'GR' || u === 'GRADUATE') return 'Gr';
  return null;
}

// ─── DATABASE ──────────────────────────────────────────────────────────────────

async function ensureHeightColumn() {
  await pool.query(`ALTER TABLE players ADD COLUMN IF NOT EXISTS height INTEGER`);
}

async function getDBTeams(division) {
  const res = await pool.query(
    `SELECT DISTINCT team_name FROM players WHERE division = $1 ORDER BY team_name`,
    [division]
  );
  return res.rows.map(r => r.team_name);
}

async function updatePlayers(players, teamName, division) {
  let updated = 0;
  for (const { firstName, lastName, heightIn, year } of players) {
    if (!heightIn && !year) continue;

    const res = await pool.query(`
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
    `, [heightIn, year, firstName, lastName, division, teamName]);
    updated += res.rowCount;
  }
  return updated;
}

// ─── MAIN ──────────────────────────────────────────────────────────────────────

async function runDivision(division) {
  const league = division === 'womens-d1'
    ? 'womens-college-basketball'
    : 'mens-college-basketball';

  const teams = await getDBTeams(division);
  console.log(`\n📋 ${division}: ${teams.length} teams in DB`);

  let resuming = !!RESUME_FROM;
  let totalUpdated = 0;
  let noMatch = [];

  for (let i = 0; i < teams.length; i++) {
    const teamName = teams[i];

    // Resume support
    if (resuming) {
      if (teamName.toLowerCase().includes(RESUME_FROM)) resuming = false;
      else continue;
    }

    const espnId = findESPNId(teamName);
    const prefix = `  [${i + 1}/${teams.length}] ${teamName}`;

    if (!espnId) {
      noMatch.push(teamName);
      console.log(`${prefix} — ⚠️  no ESPN ID match`);
      continue;
    }

    process.stdout.write(`${prefix} (ESPN ${espnId})... `);
    const players = await fetchESPNRoster(espnId, league);

    if (players.length === 0) {
      console.log('0 players');
    } else {
      if (DRY_RUN) {
        console.log(`${players.length} players (dry run — not writing)`);
      } else {
        const updated = await updatePlayers(players, teamName, division);
        totalUpdated += updated;
        console.log(`${players.length} ESPN players → ${updated} DB rows updated`);
      }
    }

    await sleep(DELAY_MS);
  }

  if (noMatch.length > 0) {
    console.log(`\n⚠️  Teams with no ESPN ID match (need manual mapping):`);
    noMatch.forEach(t => console.log(`   - ${t}`));
  }

  return totalUpdated;
}

async function main() {
  console.log(`🏀 ESPN Roster Scraper — Sideline Stats`);
  if (DRY_RUN) console.log(`   DRY RUN: no DB writes`);
  if (DIVISION_FILTER) console.log(`   Division filter: ${DIVISION_FILTER}`);

  if (!DRY_RUN) await ensureHeightColumn();

  const divisions = DIVISION_FILTER
    ? [DIVISION_FILTER]
    : ['womens-d1', 'mens-d1'];

  let grand = 0;
  for (const div of divisions) {
    grand += await runDivision(div);
  }

  console.log(`\n✅ Complete. Total DB rows updated: ${grand}`);
  await pool.end();
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
