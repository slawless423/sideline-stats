/**
 * ESPN Roster Scraper v3 — Sideline Stats
 * Pulls height + class year for all D1 Men's & Women's players.
 *
 * All ESPN IDs verified from espn.com/mens-college-basketball/team/_/id/{ID}/
 * NO fuzzy matching — direct lookup only to prevent cross-team collisions.
 *
 * USAGE:
 *   POSTGRES_URL=your_url node scripts/scrape_espn_rosters.mjs
 *
 * FLAGS:
 *   --division womens-d1     only run one division
 *   --dry-run                print without writing to DB
 */

import pg from 'pg';
const { Pool } = pg;

const DELAY_MS = 1000;
const DRY_RUN = process.argv.includes('--dry-run');
const DIVISION_FILTER = (() => {
  const idx = process.argv.indexOf('--division');
  return idx !== -1 ? process.argv[idx + 1] : null;
})();

const pool = new Pool({
  connectionString: process.env.POSTGRES_URL,
  ssl: process.env.POSTGRES_URL?.includes('localhost') ? false : { rejectUnauthorized: false }
});

// ─── ESPN TEAM ID MAP ──────────────────────────────────────────────────────────
// Keys = lowercase normalized DB team_name  →  Value = ESPN team ID
// All IDs confirmed from ESPN URLs. No fuzzy matching.

const ESPN_ID_MAP = {
  // ── A ──
  'a&m-corpus christi': 2637,
  'abilene christian': 2000,
  'air force': 2005,
  'akron': 2006,
  'alabama': 333,
  'alabama a&m': 2009,
  'alabama st.': 2010,
  'alcorn': 2016,
  'american': 44,
  'app state': 2026,
  'arizona': 12,
  'arizona st.': 9,
  'ark.-pine bluff': 2029,
  'arkansas': 8,
  'arkansas st.': 2032,
  'army west point': 349,
  'auburn': 2,
  'austin peay': 2046,

  // ── B ──
  'byu': 252,
  'ball st.': 2050,
  'baylor': 239,
  'bellarmine': 91,
  'belmont': 2057,
  'bethune-cookman': 2065,
  'binghamton': 2066,
  'boise st.': 68,
  'boston college': 103,
  'boston u.': 2051,
  'bowling green': 189,
  'bradley': 71,
  'brown': 225,
  'bryant': 2803,
  'bucknell': 2746,
  'buffalo': 2084,
  'butler': 2086,

  // ── C ──
  'csu bakersfield': 2934,
  'csun': 2463,
  'cal poly': 13,
  'cal st. fullerton': 2239,
  'california': 25,
  'california baptist': 2856,
  'campbell': 2121,
  'canisius': 2136,
  'central ark.': 2110,
  'central conn. st.': 2115,
  'central mich.': 2117,
  'charleston so.': 2127,
  'charlotte': 2429,
  'chattanooga': 236,
  'chicago st.': 2130,
  'cincinnati': 2132,
  'clemson': 228,
  'cleveland st.': 2139,
  'coastal carolina': 324,
  'col. of charleston': 232,
  'colgate': 2155,
  'colorado': 38,
  'colorado st.': 36,
  'columbia': 171,
  'coppin st.': 2158,
  'cornell': 172,
  'creighton': 156,

  // ── D ──
  'dartmouth': 334,
  'davidson': 2166,
  'dayton': 2168,
  'depaul': 2204,
  'delaware': 2191,
  'delaware st.': 2169,
  'denver': 2172,
  'detroit mercy': 2170,
  'drake': 2181,
  'drexel': 2182,
  'duke': 150,
  'duquesne': 2184,

  // ── E ──
  'etsu': 2199,
  'east carolina': 151,
  'east texas a&m': 2392,
  'eastern ill.': 2210,
  'eastern ky.': 2198,
  'eastern mich.': 2197,
  'eastern wash.': 331,
  'elon': 2205,
  'evansville': 339,

  // ── F ──
  'fdu': 161,
  'fgcu': 526,
  'fiu': 2229,
  'fairfield': 2217,
  'fla. atlantic': 2226,
  'florida': 57,
  'florida a&m': 2221,
  'florida st.': 52,
  'fordham': 2230,
  'fresno st.': 278,
  'furman': 231,

  // ── G ──
  'ga. southern': 2247,
  'gardner-webb': 2241,
  'george mason': 2244,
  'george washington': 45,
  'georgetown': 46,
  'georgia': 61,
  'georgia st.': 2248,
  'georgia tech': 59,
  'gonzaga': 2250,
  'grambling': 2755,
  'grand canyon': 2253,
  'green bay': 2263,

  // ── H ──
  'hampton': 2261,
  'harvard': 108,
  'hawaii': 62,
  'high point': 2272,
  'hofstra': 2278,
  'holy cross': 107,
  'houston': 248,
  'houston christian': 2287,
  'howard': 47,

  // ── I ──
  'iu indy': 85,
  'idaho': 70,
  'idaho st.': 304,
  'illinois': 356,
  'illinois st.': 318,
  'indiana': 84,
  'indiana st.': 319,
  'iona': 314,
  'iowa': 2294,
  'iowa st.': 66,

  // ── J ──
  'jackson st.': 297,
  'jacksonville': 294,
  'jacksonville st.': 55,
  'james madison': 2775,

  // ── K ──
  'kansas': 2305,
  'kansas city': 2388,
  'kansas st.': 2306,
  'kennesaw st.': 338,
  'kent st.': 2309,
  'kentucky': 96,

  // ── L ──
  'liu': 112358,
  'lmu (ca)': 2344,
  'lsu': 99,
  'la salle': 2325,
  'lafayette': 322,
  'lamar university': 2321,
  'le moyne': 2330,
  'lehigh': 2329,
  'liberty': 2916,
  'lindenwood': 2815,
  'lipscomb': 288,
  'little rock': 2106,
  'long beach st.': 578,
  'longwood': 2399,
  'louisiana': 309,
  'louisiana tech': 2348,
  'louisville': 97,
  'loyola chicago': 2350,
  'loyola maryland': 2418,

  // ── M ──
  'maine': 311,
  'manhattan': 2363,
  'marist': 2373,
  'marquette': 269,
  'marshall': 276,
  'maryland': 120,
  'massachusetts': 2663,
  'mcneese': 2383,
  'memphis': 235,
  'mercer': 2382,
  'mercyhurst': 2385,
  'merrimack': 2853,
  'miami (fl)': 2390,
  'miami (oh)': 193,
  'michigan': 130,
  'michigan st.': 127,
  'middle tenn.': 2393,
  'milwaukee': 270,
  'minnesota': 135,
  'mississippi st.': 344,
  'mississippi val.': 2432,
  'missouri': 142,
  'missouri st.': 2623,
  'monmouth': 2450,
  'montana': 149,
  'montana st.': 147,
  'morehead st.': 2413,
  'morgan st.': 2415,
  "mount st. mary's": 2427,
  'murray st.': 93,

  // ── N ──
  'n.c. a&t': 2448,
  'n.c. central': 2428,
  'nc state': 152,
  'niu': 2459,
  'njit': 2885,
  'navy': 2426,
  'nebraska': 158,
  'nevada': 2440,
  'new hampshire': 160,
  'new haven': 2441,
  'new mexico': 167,
  'new mexico st.': 166,
  'new orleans': 2443,
  'niagara': 315,
  'nicholls': 2446,
  'norfolk st.': 2455,
  'north ala.': 2453,
  'north carolina': 153,
  'north dakota': 2460,
  'north dakota st.': 2449,
  'north florida': 2454,
  'north texas': 249,
  'northeastern': 2462,
  'northern ariz.': 2464,
  'northern colo.': 2458,
  'northern ky.': 94,
  'northwestern': 77,
  'northwestern st.': 2466,
  'notre dame': 87,

  // ── O ──
  'oakland': 2473,
  'ohio': 195,
  'ohio st.': 194,
  'oklahoma': 201,
  'oklahoma st.': 197,
  'old dominion': 2490,
  'ole miss': 145,
  'omaha': 2437,
  'oral roberts': 2491,
  'oregon': 2483,
  'oregon st.': 204,

  // ── P ──
  'pacific': 279,
  'penn': 219,
  'penn st.': 213,
  'pepperdine': 2492,
  'pittsburgh': 221,
  'portland': 2501,
  'portland st.': 305,
  'prairie view': 2504,
  'presbyterian': 2575,
  'princeton': 163,
  'providence': 2507,
  'purdue': 2509,
  'purdue fort wayne': 2870,

  // ── Q ──
  'queens (nc)': 2511,
  'quinnipiac': 2520,

  // ── R ──
  'radford': 2515,
  'rhode island': 227,
  'rice': 242,
  'richmond': 257,
  'rider': 2535,
  'robert morris': 2543,
  'rutgers': 164,

  // ── S ──
  'sfa': 2617,
  'siue': 2565,
  'smu': 2567,
  'sacramento st.': 16,
  'sacred heart': 2566,
  'saint francis': 2598,
  "saint joseph's": 2603,
  'saint louis': 139,
  "saint mary's (ca)": 2608,
  "saint peter's": 2590,
  'sam houston': 2592,
  'samford': 2576,
  'san diego': 301,
  'san diego st.': 21,
  'san francisco': 2539,
  'san jose st.': 23,
  'santa clara': 312,
  'seattle u': 2615,
  'seton hall': 2550,
  'siena': 2561,
  'south alabama': 6,
  'south carolina': 2579,
  'south carolina st.': 2596,
  'south dakota': 2597,
  'south dakota st.': 2593,
  'south fla.': 58,
  'southeast mo. st.': 2546,
  'southeastern la.': 2600,
  'southern california': 30,
  'southern ill.': 79,
  'southern ind.': 88,
  'southern miss.': 2572,
  'southern u.': 2582,
  'southern utah': 253,
  'st. bonaventure': 179,
  "st. john's (ny)": 2599,
  'st. thomas (mn)': 2873,
  'stanford': 24,
  'stetson': 56,
  'stonehill': 284,
  'stony brook': 2619,
  'syracuse': 183,

  // ── T ──
  'tcu': 2628,
  'tarleton st.': 2748,
  'temple': 218,
  'tennessee': 2633,
  'tennessee st.': 2629,
  'tennessee tech': 2631,
  'texas': 251,
  'texas a&m': 245,
  'texas southern': 2640,
  'texas st.': 326,
  'texas tech': 2641,
  'the citadel': 2134,
  'toledo': 2649,
  'towson': 2651,
  'troy': 2653,
  'tulane': 2655,
  'tulsa': 202,

  // ── U ──
  'uab': 5,
  'ualbany': 399,
  'uc davis': 2067,
  'uc irvine': 2252,
  'uc riverside': 2578,
  'uc san diego': 28,
  'uc santa barbara': 2540,
  'ucf': 2116,
  'ucla': 26,
  'uconn': 41,
  'uic': 82,
  'uiw': 2352,
  'ulm': 2376,
  'umbc': 2378,
  'umes': 2379,
  'umass lowell': 2349,
  'unc asheville': 2427,
  'unc greensboro': 2430,
  'uncw': 350,
  'uni': 2271,
  'unlv': 2439,
  'usc upstate': 2908,
  'ut arlington': 250,
  'ut martin': 2630,
  'utep': 2638,
  'utrgv': 292,
  'utsa': 2636,
  'utah': 254,
  'utah st.': 328,
  'utah tech': 2869,
  'utah valley': 3101,

  // ── V ──
  'vcu': 2479,
  'vmi': 2678,
  'valparaiso': 2674,
  'vanderbilt': 238,
  'vermont': 261,
  'villanova': 222,
  'virginia': 258,
  'virginia tech': 259,

  // ── W ──
  'wagner': 2685,
  'wake forest': 154,
  'washington': 264,
  'washington st.': 265,
  'weber st.': 2692,
  'west ga.': 2698,
  'west virginia': 277,
  'western caro.': 2717,
  'western ill.': 2710,
  'western ky.': 2758,
  'western mich.': 2720,
  'wichita st.': 2724,
  'william & mary': 2729,
  'winthrop': 2681,
  'wisconsin': 275,
  'wofford': 2749,
  'wright st.': 2750,
  'wyoming': 2751,

  // ── X / Y ──
  'xavier': 2670,
  'yale': 43,
  'youngstown st.': 2752,
};

// ─── HELPERS ───────────────────────────────────────────────────────────────────

const sleep = ms => new Promise(r => setTimeout(r, ms));

function normalizeName(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9 &.'()\-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function findESPNId(dbTeamName) {
  const n = normalizeName(dbTeamName);
  return ESPN_ID_MAP[n] ?? null;
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

// ─── ESPN API ──────────────────────────────────────────────────────────────────

async function fetchESPNRoster(espnId, league) {
  const url = `https://site.api.espn.com/apis/site/v2/sports/basketball/${league}/teams/${espnId}/roster`;
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (research; sideline-stats)' }
    });
    if (!res.ok) {
      process.stdout.write(`    ⚠️  HTTP ${res.status}\n`);
      return [];
    }
    const data = await res.json();
    return parseESPNRoster(data);
  } catch (err) {
    process.stdout.write(`    ❌ ${err.message}\n`);
    return [];
  }
}

function parseESPNRoster(data) {
  const players = [];
  const athletes = data?.athletes ?? [];
  const items = Array.isArray(athletes)
    ? athletes.flatMap(group => group.items ?? [group])
    : [];

  for (const athlete of items) {
    const fullName = athlete.fullName ?? athlete.displayName ?? '';
    if (!fullName) continue;
    const nameParts = fullName.trim().split(' ');
    const firstName = nameParts[0];
    const lastName = nameParts.slice(1).join(' ') || '';
    const heightIn = athlete.height ?? null;
    const experienceText = athlete.experience?.displayValue
      ?? athlete.experience?.abbreviation ?? null;
    const year = normalizeYear(experienceText);
    players.push({ firstName, lastName, heightIn, year });
  }
  return players;
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
  const misses = [];
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
    if (res.rowCount === 0) misses.push(`${firstName} ${lastName}`);
    updated += res.rowCount;
  }
  if (updated === 0 && misses.length > 0) {
    const dbRes = await pool.query(
      `SELECT first_name, last_name FROM players WHERE division = $1 AND LOWER(team_name) = LOWER($2) LIMIT 5`,
      [division, teamName]
    );
    if (dbRes.rows.length === 0) {
      process.stdout.write(` [NO DB PLAYERS for "${teamName}"]`);
    } else {
      const espnSample = misses.slice(0, 3).join(', ');
      const dbSample = dbRes.rows.map(r => `${r.first_name} ${r.last_name}`).join(', ');
      process.stdout.write(` [ESPN: ${espnSample} | DB: ${dbSample}]`);
    }
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

  let totalUpdated = 0;
  let noMatch = [];

  for (let i = 0; i < teams.length; i++) {
    const teamName = teams[i];
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
    } else if (DRY_RUN) {
      console.log(`${players.length} players (dry run)`);
    } else {
      const updated = await updatePlayers(players, teamName, division);
      totalUpdated += updated;
      console.log(`${players.length} ESPN players → ${updated} DB rows updated`);
    }

    await sleep(DELAY_MS);
  }

  if (noMatch.length > 0) {
    console.log(`\n⚠️  No ESPN ID match for:`);
    noMatch.forEach(t => console.log(`   - ${t}`));
  }

  return totalUpdated;
}

async function main() {
  console.log(`🏀 ESPN Roster Scraper v3 — Sideline Stats`);
  if (DRY_RUN) console.log(`   DRY RUN: no DB writes`);

  if (!DRY_RUN) await ensureHeightColumn();

  const divisions = DIVISION_FILTER ? [DIVISION_FILTER] : ['womens-d1', 'mens-d1'];
  let grand = 0;
  for (const div of divisions) grand += await runDivision(div);

  console.log(`\n✅ Complete. Total DB rows updated: ${grand}`);
  await pool.end();
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
