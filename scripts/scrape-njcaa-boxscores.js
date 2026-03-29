/**
 * NJCAA D1 Basketball Stats Scraper — Box Score Aggregator
 *
 * Fetches all box scores from the composite schedule, aggregates
 * season totals per player, and stores in the DB.
 *
 * Usage:
 *   node scripts/scrape-njcaa-boxscores.js --gender womens
 *   node scripts/scrape-njcaa-boxscores.js --gender mens
 *
 * Requires: node-fetch, node-html-parser, pg, dotenv
 * Env var:  DATABASE_URL
 */

const fetch = (...args) => import('node-fetch').then(({default: f}) => f(...args));
const { parse } = require('node-html-parser');
const { Pool } = require('pg');
require('dotenv').config();

// ── CLI args ──────────────────────────────────────────────────────────────────
const argList = process.argv.slice(2);
const getArg = (name) => {
  const i = argList.indexOf(`--${name}`);
  return i !== -1 ? argList[i + 1] : null;
};

const GENDER = getArg('gender');
if (!GENDER || !['mens', 'womens'].includes(GENDER)) {
  console.error('Usage: node scripts/scrape-njcaa-boxscores.js --gender mens|womens');
  process.exit(1);
}

const SPORT_SLUG  = GENDER === 'womens' ? 'wbkb' : 'mbkb';
const SEASON      = '2025-26';
const DIVISION    = 'div1';
const BASE        = 'https://njcaastats.prestosports.com';
const DELAY_MS    = 500;

const TABLE = `njcaa_${GENDER}_d1_players`;

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.5',
};

// ── DB ────────────────────────────────────────────────────────────────────────
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

const sleep = ms => new Promise(r => setTimeout(r, ms));

// ── ENSURE TABLE ──────────────────────────────────────────────────────────────
async function ensureTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ${TABLE} (
      id          SERIAL PRIMARY KEY,
      player_id   TEXT NOT NULL UNIQUE,
      team_name   TEXT NOT NULL,
      season      TEXT NOT NULL,
      jersey      TEXT,
      name        TEXT NOT NULL,
      gp          INTEGER DEFAULT 0,
      gs          INTEGER DEFAULT 0,
      min         INTEGER DEFAULT 0,
      fg          INTEGER DEFAULT 0,
      fga         INTEGER DEFAULT 0,
      fg3         INTEGER DEFAULT 0,
      fg3a        INTEGER DEFAULT 0,
      ft          INTEGER DEFAULT 0,
      fta         INTEGER DEFAULT 0,
      reb_off     INTEGER DEFAULT 0,
      reb_def     INTEGER DEFAULT 0,
      reb_tot     INTEGER DEFAULT 0,
      ast         INTEGER DEFAULT 0,
      stl         INTEGER DEFAULT 0,
      blk         INTEGER DEFAULT 0,
      to_stat     INTEGER DEFAULT 0,
      pf          INTEGER DEFAULT 0,
      pts         INTEGER DEFAULT 0,
      updated_at  TIMESTAMPTZ DEFAULT NOW()
    );
  `);
  console.log(`✓ Table ready: ${TABLE}`);
}

// ── FETCH WITH RETRY ──────────────────────────────────────────────────────────
async function fetchHtml(url, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url, { headers: HEADERS, timeout: 15000 });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.text();
    } catch (e) {
      if (i === retries - 1) throw e;
      await sleep(2000 * (i + 1));
    }
  }
}

// ── GET ALL BOX SCORE URLS ────────────────────────────────────────────────────
async function getBoxScoreUrls() {
  console.log(`\nFetching composite schedule...`);

  // Get all game dates from the season schedule
  // PrestoSports composite shows all dates - we fetch without a date param to get the full list
  const scheduleUrl = `${BASE}/sports/${SPORT_SLUG}/${SEASON}/${DIVISION}/composite`;
  const html = await fetchHtml(scheduleUrl);
  const root = parse(html);

  // Extract all box score links
  const links = root.querySelectorAll('a[href*="/boxscores/"]');
  const urls = new Set();
  for (const link of links) {
    const href = link.getAttribute('href');
    if (href && href.includes('.xml')) {
      const fullUrl = href.startsWith('http') ? href : `${BASE}${href}`;
      urls.add(fullUrl);
    }
  }

  console.log(`✓ Found ${urls.size} box scores on current page`);

  // The composite page may only show recent dates - we need to paginate through all dates
  // Find all date links in the date navigation
  const dateLinks = root.querySelectorAll('a[href*="composite?d="]');
  const allDates = new Set();
  for (const link of dateLinks) {
    const href = link.getAttribute('href');
    const dateMatch = href && href.match(/\?d=(\d{4}-\d{2}-\d{2})/);
    if (dateMatch) allDates.add(dateMatch[1]);
  }

  console.log(`  Found ${allDates.size} additional dates to check`);

  // Fetch each date page
  for (const date of allDates) {
    try {
      const dateUrl = `${BASE}/sports/${SPORT_SLUG}/${SEASON}/${DIVISION}/composite?d=${date}`;
      const dateHtml = await fetchHtml(dateUrl);
      const dateRoot = parse(dateHtml);
      const dateLinks = dateRoot.querySelectorAll('a[href*="/boxscores/"]');
      for (const link of dateLinks) {
        const href = link.getAttribute('href');
        if (href && href.includes('.xml')) {
          const fullUrl = href.startsWith('http') ? href : `${BASE}${href}`;
          urls.add(fullUrl);
        }
      }
      process.stdout.write('.');
      await sleep(DELAY_MS);
    } catch (e) {
      process.stdout.write('x');
    }
  }

  console.log(`\n✓ Total box scores found: ${urls.size}`);
  return [...urls];
}

// ── PARSE BOX SCORE ───────────────────────────────────────────────────────────
function parseMadeAtt(str) {
  if (!str || str.trim() === '-' || str.trim() === '') return [0, 0];
  const m = str.trim().match(/^(\d+)-(\d+)$/);
  return m ? [parseInt(m[1]), parseInt(m[2])] : [0, 0];
}

function parseInt0(str) {
  if (!str || str.trim() === '-' || str.trim() === '') return 0;
  const n = parseInt(str.trim());
  return isNaN(n) ? 0 : n;
}

function parseBoxScore(html, url) {
  const root = parse(html);
  const players = [];

  // Each team has a section - find all player rows
  // Team name is in an h3/h4 above the table
  const teamSections = root.querySelectorAll('.boxscore-container, .team-boxscore, table');

  // Find team names - they appear as headings before each table
  // Structure: <h3>Team Name</h3> ... <table>...<tr><th>Player</th>...
  let currentTeam = '';

  // Walk all elements looking for team headings and player rows
  const allElements = root.querySelectorAll('h3, h4, h2, tr');

  for (const el of allElements) {
    const tag = el.tagName.toLowerCase();

    // Team heading
    if (['h2', 'h3', 'h4'].includes(tag)) {
      const text = el.text.trim();
      if (text && text.length > 2 && !text.includes('Box Score') && !text.toLowerCase().includes('starters') && !text.toLowerCase().includes('reserves')) {
        currentTeam = text;
      }
      continue;
    }

    // Player row
    if (tag === 'tr') {
      const playerNameEl = el.querySelector('.player-name, a.player-name');
      if (!playerNameEl) continue;

      const jerseyEl = el.querySelector('.uniform');
      const jersey = jerseyEl ? jerseyEl.text.trim() : '';
      const name = playerNameEl.text.trim();

      // Get all td values
      const tds = el.querySelectorAll('td');
      if (tds.length < 10) continue;

      // Column order: MIN, FGM-A, 3PM-A, FTM-A, OREB, DREB, REB, AST, STL, BLK, TO, PF, PTS
      const min     = parseInt0(tds[0]?.text);
      const [fg, fga]   = parseMadeAtt(tds[1]?.text);
      const [fg3, fg3a] = parseMadeAtt(tds[2]?.text);
      const [ft, fta]   = parseMadeAtt(tds[3]?.text);
      const reb_off = parseInt0(tds[4]?.text);
      const reb_def = parseInt0(tds[5]?.text);
      const reb_tot = parseInt0(tds[6]?.text);
      const ast     = parseInt0(tds[7]?.text);
      const stl     = parseInt0(tds[8]?.text);
      const blk     = parseInt0(tds[9]?.text);
      const to_stat = parseInt0(tds[10]?.text);
      const pf      = parseInt0(tds[11]?.text);
      const pts     = parseInt0(tds[12]?.text);

      // Determine if starter (row is inside a starters section)
      const isStarter = el.closest ? !!el.closest('.starters, [data-section="starters"]') : false;

      players.push({
        jersey, name, team: currentTeam,
        min, fg, fga, fg3, fg3a, ft, fta,
        reb_off, reb_def, reb_tot,
        ast, stl, blk, to_stat, pf, pts,
        gs: isStarter ? 1 : 0,
      });
    }
  }

  return players;
}

// ── AGGREGATE + UPSERT ────────────────────────────────────────────────────────
async function upsertPlayer(p) {
  const nameParts = p.name.toLowerCase().replace(/[^a-z0-9 ]/g, '').trim().split(/\s+/);
  const teamSlug  = p.team.toLowerCase().replace(/[^a-z0-9]/g, '');
  const player_id = `${teamSlug}_${p.jersey}_${nameParts.join('_')}`;

  await pool.query(`
    INSERT INTO ${TABLE} (
      player_id, team_name, season, jersey, name,
      gp, gs, min,
      fg, fga, fg3, fg3a, ft, fta,
      reb_off, reb_def, reb_tot,
      ast, stl, blk, to_stat, pf, pts,
      updated_at
    ) VALUES (
      $1,$2,$3,$4,$5,
      1,$6,$7,
      $8,$9,$10,$11,$12,$13,
      $14,$15,$16,
      $17,$18,$19,$20,$21,$22,
      NOW()
    )
    ON CONFLICT (player_id) DO UPDATE SET
      team_name  = EXCLUDED.team_name,
      jersey     = EXCLUDED.jersey,
      name       = EXCLUDED.name,
      gp         = ${TABLE}.gp + 1,
      gs         = ${TABLE}.gs + EXCLUDED.gs,
      min        = ${TABLE}.min + EXCLUDED.min,
      fg         = ${TABLE}.fg + EXCLUDED.fg,
      fga        = ${TABLE}.fga + EXCLUDED.fga,
      fg3        = ${TABLE}.fg3 + EXCLUDED.fg3,
      fg3a       = ${TABLE}.fg3a + EXCLUDED.fg3a,
      ft         = ${TABLE}.ft + EXCLUDED.ft,
      fta        = ${TABLE}.fta + EXCLUDED.fta,
      reb_off    = ${TABLE}.reb_off + EXCLUDED.reb_off,
      reb_def    = ${TABLE}.reb_def + EXCLUDED.reb_def,
      reb_tot    = ${TABLE}.reb_tot + EXCLUDED.reb_tot,
      ast        = ${TABLE}.ast + EXCLUDED.ast,
      stl        = ${TABLE}.stl + EXCLUDED.stl,
      blk        = ${TABLE}.blk + EXCLUDED.blk,
      to_stat    = ${TABLE}.to_stat + EXCLUDED.to_stat,
      pf         = ${TABLE}.pf + EXCLUDED.pf,
      pts        = ${TABLE}.pts + EXCLUDED.pts,
      updated_at = NOW()
  `, [
    player_id, p.team, SEASON, p.jersey, p.name,
    p.gs, p.min,
    p.fg, p.fga, p.fg3, p.fg3a, p.ft, p.fta,
    p.reb_off, p.reb_def, p.reb_tot,
    p.ast, p.stl, p.blk, p.to_stat, p.pf, p.pts,
  ]);
}

// ── MAIN ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`\n🏀 NJCAA Box Score Scraper — ${GENDER} ${SEASON} ${DIVISION.toUpperCase()}`);
  console.log('='.repeat(55));

  await ensureTable();

  // Clear existing data for clean re-aggregation
  console.log(`Clearing existing ${TABLE} data...`);
  await pool.query(`DELETE FROM ${TABLE} WHERE season = $1`, [SEASON]);

  const boxScoreUrls = await getBoxScoreUrls();

  let success = 0, skipped = 0, totalPlayers = 0;

  for (let idx = 0; idx < boxScoreUrls.length; idx++) {
    const url = boxScoreUrls[idx];
    const gameId = url.match(/boxscores\/([^.]+)/)?.[1] || url;

    process.stdout.write(`[${idx + 1}/${boxScoreUrls.length}] ${gameId}... `);

    try {
      const html = await fetchHtml(url);
      const players = parseBoxScore(html, url);

      for (const p of players) {
        if (p.name && p.team) await upsertPlayer(p);
      }

      console.log(`✓ ${players.length} players`);
      totalPlayers += players.length;
      success++;
    } catch (e) {
      console.log(`✗ ${e.message}`);
      skipped++;
    }

    await sleep(DELAY_MS);
  }

  console.log('\n' + '='.repeat(55));
  console.log(`✅ Done — ${success} games, ${totalPlayers} player-games, ${skipped} skipped`);
  console.log(`   Table: ${TABLE}`);

  await pool.end();
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
