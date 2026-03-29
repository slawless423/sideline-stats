/**
 * NJCAA D1 Basketball Stats Scraper
 *
 * Usage:
 *   node scrape-njcaa.js --gender womens
 *   node scrape-njcaa.js --gender mens
 *
 * Creates two tables per gender:
 *   njcaa_{gender}_d1_players     — one row per player
 *   njcaa_{gender}_d1_team_totals — team + opponent totals per school (for advanced stat formulas)
 *
 * Requires: puppeteer, pg, dotenv
 * Env var:  DATABASE_URL
 */

const puppeteer = require('puppeteer');
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
  console.error('Usage: node scrape-njcaa.js --gender mens|womens');
  process.exit(1);
}

const SPORT_SLUG    = GENDER === 'womens' ? 'wbkb' : 'mbkb';
const SEASON        = '2025-26';
const DIVISION      = 'div1';
const BASE          = 'https://njcaastats.prestosports.com';
const TEAMS_URL     = `${BASE}/sports/${SPORT_SLUG}/teams-page`;
const DELAY_MS      = 1500;

const TABLE_PLAYERS = `njcaa_${GENDER}_d1_players`;
const TABLE_TOTALS  = `njcaa_${GENDER}_d1_team_totals`;

// ── DB ────────────────────────────────────────────────────────────────────────
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

const sleep = ms => new Promise(r => setTimeout(r, ms));

// ── ENSURE TABLES ─────────────────────────────────────────────────────────────
async function ensureTables() {
  // Player stats table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ${TABLE_PLAYERS} (
      id          SERIAL PRIMARY KEY,
      player_id   TEXT NOT NULL UNIQUE,
      team_slug   TEXT NOT NULL,
      team_name   TEXT NOT NULL,
      season      TEXT NOT NULL,
      jersey      TEXT,
      name        TEXT NOT NULL,
      gp          INTEGER,
      gs          INTEGER,
      min         INTEGER,
      min_avg     NUMERIC(5,1),
      fg          INTEGER,
      fga         INTEGER,
      fg_pct      NUMERIC(5,1),
      fg3         INTEGER,
      fg3a        INTEGER,
      fg3_pct     NUMERIC(5,1),
      ft          INTEGER,
      fta         INTEGER,
      ft_pct      NUMERIC(5,1),
      reb_off     INTEGER,
      reb_def     INTEGER,
      reb_tot     INTEGER,
      reb_avg     NUMERIC(5,1),
      pf          INTEGER,
      dq          INTEGER,
      ast         INTEGER,
      ast_avg     NUMERIC(5,1),
      to_stat     INTEGER,
      to_avg      NUMERIC(5,1),
      ast_to      NUMERIC(5,1),
      blk         INTEGER,
      blk_avg     NUMERIC(5,1),
      stl         INTEGER,
      stl_avg     NUMERIC(5,1),
      pts         INTEGER,
      pts_avg     NUMERIC(5,1),
      updated_at  TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  // Team totals table — stores both team and opponent rows per school
  // These are never displayed; they exist solely to power advanced stat formulas
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ${TABLE_TOTALS} (
      id          SERIAL PRIMARY KEY,
      team_slug   TEXT NOT NULL,
      team_name   TEXT NOT NULL,
      season      TEXT NOT NULL,
      row_type    TEXT NOT NULL CHECK (row_type IN ('team', 'opponent')),
      gp          INTEGER,
      min         INTEGER,
      fg          INTEGER,
      fga         INTEGER,
      fg_pct      NUMERIC(5,1),
      fg3         INTEGER,
      fg3a        INTEGER,
      fg3_pct     NUMERIC(5,1),
      ft          INTEGER,
      fta         INTEGER,
      ft_pct      NUMERIC(5,1),
      reb_off     INTEGER,
      reb_def     INTEGER,
      reb_tot     INTEGER,
      pf          INTEGER,
      dq          INTEGER,
      ast         INTEGER,
      to_stat     INTEGER,
      ast_to      NUMERIC(5,1),
      blk         INTEGER,
      stl         INTEGER,
      pts         INTEGER,
      updated_at  TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE (team_slug, season, row_type)
    );
  `);

  console.log(`✓ Tables ready: ${TABLE_PLAYERS}, ${TABLE_TOTALS}`);
}

// ── GET TEAM SLUGS ────────────────────────────────────────────────────────────
async function getTeams(page) {
  console.log(`\nLoading teams page: ${TEAMS_URL}`);
  await page.goto(TEAMS_URL, { waitUntil: 'networkidle2', timeout: 30000 });
  await page.waitForSelector('[data-team-name]', { timeout: 15000 });

  const teams = await page.evaluate((division) => {
    return Array.from(document.querySelectorAll('[data-team-name]')).map(row => {
      const profileUrl = row.getAttribute('data-profile-url') || '';
      if (!profileUrl.includes(`/${division}/`)) return null;
      const slugMatch = profileUrl.match(/\/teams\/([^?/]+)/);
      return {
        slug: slugMatch ? slugMatch[1] : null,
        name: row.getAttribute('data-team-name'),
      };
    }).filter(t => t && t.slug);
  }, DIVISION);

  console.log(`✓ Found ${teams.length} teams`);
  return teams;
}

// ── SHARED STAT PARSER ────────────────────────────────────────────────────────
// Parses a stats string into the full set of counting stat fields.
// Column order (from header):
//   GP GS MIN AVG | FG-FGA PCT | 3FG-3FGA PCT | FT-FTA PCT |
//   OFF DEF TOT AVG | PF DQ | A A/G | TO TO/G | A/TO | BLK BLK/G | STL STL/G | PTS AVG
function parseStatFields(parts) {
  const num = s => (s === undefined || s === '-') ? null : parseFloat(s);
  const int = s => (s === undefined || s === '-') ? null : parseInt(s);
  const madeAtt = s => {
    if (!s || s === '-') return [null, null];
    const m = s.match(/^(\d+)-(\d+)$/);
    return m ? [parseInt(m[1]), parseInt(m[2])] : [null, null];
  };

  let i = 0;
  const gp      = int(parts[i++]);
  const gs      = int(parts[i++]);
  const min     = int(parts[i++]);
  const min_avg = num(parts[i++]);

  const [fg, fga]   = madeAtt(parts[i++]);
  const fg_pct      = num(parts[i++]);
  const [fg3, fg3a] = madeAtt(parts[i++]);
  const fg3_pct     = num(parts[i++]);

  // FT-FTA can be bare '-' for players/rows with no free throw attempts
  let ft = null, fta = null;
  if (parts[i] === '-') {
    i++;
  } else {
    [ft, fta] = madeAtt(parts[i++]);
  }
  const ft_pct  = num(parts[i++]);

  const reb_off = int(parts[i++]);
  const reb_def = int(parts[i++]);
  const reb_tot = int(parts[i++]);
  const reb_avg = num(parts[i++]);
  const pf      = int(parts[i++]);
  const dq      = int(parts[i++]);
  const ast     = int(parts[i++]);
  const ast_avg = num(parts[i++]);
  const to_stat = int(parts[i++]);
  const to_avg  = num(parts[i++]);
  const ast_to  = num(parts[i++]);
  const blk     = int(parts[i++]);
  const blk_avg = num(parts[i++]);
  const stl     = int(parts[i++]);
  const stl_avg = num(parts[i++]);
  const pts     = int(parts[i++]);
  const pts_avg = num(parts[i++]);

  return {
    gp, gs, min, min_avg,
    fg, fga, fg_pct,
    fg3, fg3a, fg3_pct,
    ft, fta, ft_pct,
    reb_off, reb_def, reb_tot, reb_avg,
    pf, dq, ast, ast_avg,
    to_stat, to_avg, ast_to,
    blk, blk_avg, stl, stl_avg,
    pts, pts_avg,
  };
}

// ── PARSE FULL STAT PAGE ──────────────────────────────────────────────────────
function parseStatPage(rawText, teamSlug, teamName) {
  const players = [];
  let teamTotal   = null;
  let oppTotal    = null;

  const lines = rawText.split('\n').map(l => l.trim()).filter(Boolean);

  for (const line of lines) {
    // Skip header / metadata lines
    if (
      line.startsWith('Click')     ||
      line.startsWith('2025-26')   ||
      line.startsWith('Record')    ||
      line.startsWith('#')         ||
      line.includes('3-Point')     ||
      line.length < 20
    ) continue;

    // ── Team Total row ──────────────────────────────────────────────────────
    // e.g. "Total...............31 31 4503 145 725-1664 43.6 ..."
    if (line.startsWith('Total') && !line.startsWith('Total3')) {
      const statStr = line.replace(/^Total\.*/i, '').trim();
      const parts   = statStr.split(/\s+/);
      try {
        teamTotal = parseStatFields(parts);
      } catch (e) {
        console.warn(`  ⚠ Could not parse Total row`);
      }
      continue;
    }

    // ── Opponents row ───────────────────────────────────────────────────────
    // e.g. "Opponents...........31 31 4503 145 878-1989 44.1 ..."
    if (line.startsWith('Opponents')) {
      const statStr = line.replace(/^Opponents\.*/i, '').trim();
      const parts   = statStr.split(/\s+/);
      try {
        oppTotal = parseStatFields(parts);
      } catch (e) {
        console.warn(`  ⚠ Could not parse Opponents row`);
      }
      continue;
    }

    // ── Skip Conference Only rows ───────────────────────────────────────────
    if (line.startsWith('Conference Only')) continue;

    // ── Player rows ─────────────────────────────────────────────────────────
    // e.g. "2Brennan Wansley.....16 15 376 23.5 89-179 49.7 ..."
    const playerMatch = line.match(/^(\d{0,2})\s*([A-Za-z][A-Za-z'\s.-]+?)\.*\s{2,}(.+)$/);
    if (!playerMatch) continue;

    const jersey  = playerMatch[1].trim();
    const name    = playerMatch[2].replace(/\.+$/, '').trim();
    const statStr = playerMatch[3].trim();
    const parts   = statStr.split(/\s+/);

    try {
      const stats = parseStatFields(parts);
      if (!name || stats.gp === null) continue;

      const nameParts = name.toLowerCase().replace(/[^a-z0-9 ]/g, '').trim().split(/\s+/);
      const player_id = `${teamSlug}_${jersey}_${nameParts.join('_')}`;

      players.push({ player_id, jersey, name, ...stats });
    } catch (e) {
      console.warn(`  ⚠ Skipped player line: ${line.substring(0, 70)}`);
    }
  }

  return { players, teamTotal, oppTotal };
}

// ── DB UPSERTS ────────────────────────────────────────────────────────────────
async function upsertPlayers(players, teamSlug, teamName) {
  for (const p of players) {
    await pool.query(`
      INSERT INTO ${TABLE_PLAYERS} (
        player_id, team_slug, team_name, season,
        jersey, name,
        gp, gs, min, min_avg,
        fg, fga, fg_pct, fg3, fg3a, fg3_pct, ft, fta, ft_pct,
        reb_off, reb_def, reb_tot, reb_avg,
        pf, dq, ast, ast_avg, to_stat, to_avg, ast_to,
        blk, blk_avg, stl, stl_avg, pts, pts_avg,
        updated_at
      ) VALUES (
        $1,$2,$3,$4,$5,$6,
        $7,$8,$9,$10,
        $11,$12,$13,$14,$15,$16,$17,$18,$19,
        $20,$21,$22,$23,
        $24,$25,$26,$27,$28,$29,$30,
        $31,$32,$33,$34,$35,$36,
        NOW()
      )
      ON CONFLICT (player_id) DO UPDATE SET
        team_slug=EXCLUDED.team_slug, team_name=EXCLUDED.team_name,
        jersey=EXCLUDED.jersey, name=EXCLUDED.name,
        gp=EXCLUDED.gp, gs=EXCLUDED.gs, min=EXCLUDED.min, min_avg=EXCLUDED.min_avg,
        fg=EXCLUDED.fg, fga=EXCLUDED.fga, fg_pct=EXCLUDED.fg_pct,
        fg3=EXCLUDED.fg3, fg3a=EXCLUDED.fg3a, fg3_pct=EXCLUDED.fg3_pct,
        ft=EXCLUDED.ft, fta=EXCLUDED.fta, ft_pct=EXCLUDED.ft_pct,
        reb_off=EXCLUDED.reb_off, reb_def=EXCLUDED.reb_def,
        reb_tot=EXCLUDED.reb_tot, reb_avg=EXCLUDED.reb_avg,
        pf=EXCLUDED.pf, dq=EXCLUDED.dq,
        ast=EXCLUDED.ast, ast_avg=EXCLUDED.ast_avg,
        to_stat=EXCLUDED.to_stat, to_avg=EXCLUDED.to_avg, ast_to=EXCLUDED.ast_to,
        blk=EXCLUDED.blk, blk_avg=EXCLUDED.blk_avg,
        stl=EXCLUDED.stl, stl_avg=EXCLUDED.stl_avg,
        pts=EXCLUDED.pts, pts_avg=EXCLUDED.pts_avg,
        updated_at=NOW()
    `, [
      p.player_id, teamSlug, teamName, SEASON,
      p.jersey, p.name,
      p.gp, p.gs, p.min, p.min_avg,
      p.fg, p.fga, p.fg_pct, p.fg3, p.fg3a, p.fg3_pct, p.ft, p.fta, p.ft_pct,
      p.reb_off, p.reb_def, p.reb_tot, p.reb_avg,
      p.pf, p.dq, p.ast, p.ast_avg, p.to_stat, p.to_avg, p.ast_to,
      p.blk, p.blk_avg, p.stl, p.stl_avg, p.pts, p.pts_avg,
    ]);
  }
}

async function upsertTotalRow(teamSlug, teamName, rowType, stats) {
  if (!stats) return;
  await pool.query(`
    INSERT INTO ${TABLE_TOTALS} (
      team_slug, team_name, season, row_type,
      gp, min,
      fg, fga, fg_pct, fg3, fg3a, fg3_pct, ft, fta, ft_pct,
      reb_off, reb_def, reb_tot,
      pf, dq, ast, to_stat, ast_to,
      blk, stl, pts,
      updated_at
    ) VALUES (
      $1,$2,$3,$4,
      $5,$6,
      $7,$8,$9,$10,$11,$12,$13,$14,$15,
      $16,$17,$18,
      $19,$20,$21,$22,$23,
      $24,$25,$26,
      NOW()
    )
    ON CONFLICT (team_slug, season, row_type) DO UPDATE SET
      team_name=EXCLUDED.team_name,
      gp=EXCLUDED.gp, min=EXCLUDED.min,
      fg=EXCLUDED.fg, fga=EXCLUDED.fga, fg_pct=EXCLUDED.fg_pct,
      fg3=EXCLUDED.fg3, fg3a=EXCLUDED.fg3a, fg3_pct=EXCLUDED.fg3_pct,
      ft=EXCLUDED.ft, fta=EXCLUDED.fta, ft_pct=EXCLUDED.ft_pct,
      reb_off=EXCLUDED.reb_off, reb_def=EXCLUDED.reb_def, reb_tot=EXCLUDED.reb_tot,
      pf=EXCLUDED.pf, dq=EXCLUDED.dq,
      ast=EXCLUDED.ast, to_stat=EXCLUDED.to_stat, ast_to=EXCLUDED.ast_to,
      blk=EXCLUDED.blk, stl=EXCLUDED.stl, pts=EXCLUDED.pts,
      updated_at=NOW()
  `, [
    teamSlug, teamName, SEASON, rowType,
    stats.gp, stats.min,
    stats.fg, stats.fga, stats.fg_pct,
    stats.fg3, stats.fg3a, stats.fg3_pct,
    stats.ft, stats.fta, stats.ft_pct,
    stats.reb_off, stats.reb_def, stats.reb_tot,
    stats.pf, stats.dq, stats.ast, stats.to_stat, stats.ast_to,
    stats.blk, stats.stl, stats.pts,
  ]);
}

// ── MAIN ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`\n🏀 NJCAA Scraper — ${GENDER} ${SEASON} ${DIVISION.toUpperCase()}`);
  console.log('='.repeat(50));

  await ensureTables();

  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const page = await browser.newPage();
  await page.setUserAgent(
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
  );

  try {
    const teams = await getTeams(page);
    let success = 0, skipped = 0, totalPlayers = 0;

    for (let idx = 0; idx < teams.length; idx++) {
      const team = teams[idx];
      const url  = `${BASE}/sports/${SPORT_SLUG}/${SEASON}/${DIVISION}/teams/${team.slug}?tmpl=teaminfo-network-monospace-json-template`;

      process.stdout.write(`[${idx + 1}/${teams.length}] ${team.name}... `);

      try {
        await page.goto(url, { waitUntil: 'networkidle2', timeout: 20000 });
        const rawText = await page.evaluate(() => document.body.innerText);

        if (!rawText || rawText.length < 100) {
          console.log('⚠ Empty response, skipping');
          skipped++;
          continue;
        }

        const { players, teamTotal, oppTotal } = parseStatPage(rawText, team.slug, team.name);

        await upsertPlayers(players, team.slug, team.name);
        await upsertTotalRow(team.slug, team.name, 'team',     teamTotal);
        await upsertTotalRow(team.slug, team.name, 'opponent', oppTotal);

        const flags = [];
        if (!teamTotal) flags.push('no team total');
        if (!oppTotal)  flags.push('no opp total');

        console.log(`✓ ${players.length} players${flags.length ? ' ⚠ ' + flags.join(', ') : ''}`);
        totalPlayers += players.length;
        success++;
      } catch (e) {
        console.log(`✗ Error: ${e.message}`);
        skipped++;
      }

      await sleep(DELAY_MS);
    }

    console.log('\n' + '='.repeat(50));
    console.log(`✅ Done — ${success} teams, ${totalPlayers} players, ${skipped} skipped`);
    console.log(`   Players: ${TABLE_PLAYERS}`);
    console.log(`   Totals:  ${TABLE_TOTALS}`);

  } finally {
    await browser.close();
    await pool.end();
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
