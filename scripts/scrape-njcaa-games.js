/**
 * NJCAA Box Score Scraper — Server Side
 * Reads a pre-collected list of box score URLs and fetches/parses each one.
 *
 * Usage:
 *   node scripts/scrape-njcaa-games.js --gender womens
 *   node scripts/scrape-njcaa-games.js --gender mens
 *
 * Requires: node-fetch, node-html-parser, pg, dotenv
 */

const fetch    = (...args) => import('node-fetch').then(({ default: f }) => f(...args));
const { parse } = require('node-html-parser');
const { Pool } = require('pg');
const fs       = require('fs');
const path     = require('path');
require('dotenv').config();

// ── CLI args ──────────────────────────────────────────────────────────────────
const argList = process.argv.slice(2);
const getArg  = name => { const i = argList.indexOf(`--${name}`); return i !== -1 ? argList[i + 1] : null; };

const GENDER = getArg('gender');
if (!GENDER || !['mens', 'womens'].includes(GENDER)) {
  console.error('Usage: node scripts/scrape-njcaa-games.js --gender mens|womens');
  process.exit(1);
}

const SEASON     = '2025-26';
const DELAY_MS   = 500;
const BATCH_SIZE = 100;

const TABLE_PLAYER_GAMES = `njcaa_${GENDER}_d1_player_games`;
const TABLE_TEAM_GAMES   = `njcaa_${GENDER}_d1_team_games`;
const URLS_FILE          = path.join(__dirname, `njcaa-${GENDER}-urls.json`);

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
};

const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
const sleep = ms => new Promise(r => setTimeout(r, ms));

// ── ENSURE TABLES ─────────────────────────────────────────────────────────────
async function ensureTables() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ${TABLE_PLAYER_GAMES} (
      id                SERIAL PRIMARY KEY,
      player_id         TEXT NOT NULL,
      game_id           TEXT NOT NULL,
      team_name         TEXT NOT NULL,
      season            TEXT NOT NULL,
      jersey            TEXT,
      name              TEXT NOT NULL,
      min               INTEGER,
      min_tracked       BOOLEAN DEFAULT FALSE,
      game_total_min    INTEGER,
      opponent_has_stats BOOLEAN DEFAULT FALSE,
      fg                INTEGER DEFAULT 0,
      fga               INTEGER DEFAULT 0,
      fg3               INTEGER DEFAULT 0,
      fg3a              INTEGER DEFAULT 0,
      ft                INTEGER DEFAULT 0,
      fta               INTEGER DEFAULT 0,
      reb_off           INTEGER DEFAULT 0,
      reb_def           INTEGER DEFAULT 0,
      reb_tot           INTEGER DEFAULT 0,
      ast               INTEGER DEFAULT 0,
      stl               INTEGER DEFAULT 0,
      blk               INTEGER DEFAULT 0,
      to_stat           INTEGER DEFAULT 0,
      pf                INTEGER DEFAULT 0,
      pts               INTEGER DEFAULT 0,
      created_at        TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(player_id, game_id)
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS ${TABLE_TEAM_GAMES} (
      id                SERIAL PRIMARY KEY,
      game_id           TEXT NOT NULL,
      team_name         TEXT NOT NULL,
      row_type          TEXT NOT NULL CHECK (row_type IN ('team', 'opponent')),
      season            TEXT NOT NULL,
      min_tracked       BOOLEAN DEFAULT FALSE,
      game_total_min    INTEGER,
      opponent_has_stats BOOLEAN DEFAULT FALSE,
      fg                INTEGER DEFAULT 0,
      fga               INTEGER DEFAULT 0,
      fg3               INTEGER DEFAULT 0,
      fg3a              INTEGER DEFAULT 0,
      ft                INTEGER DEFAULT 0,
      fta               INTEGER DEFAULT 0,
      reb_off           INTEGER DEFAULT 0,
      reb_def           INTEGER DEFAULT 0,
      reb_tot           INTEGER DEFAULT 0,
      ast               INTEGER DEFAULT 0,
      stl               INTEGER DEFAULT 0,
      blk               INTEGER DEFAULT 0,
      to_stat           INTEGER DEFAULT 0,
      pf                INTEGER DEFAULT 0,
      pts               INTEGER DEFAULT 0,
      created_at        TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(game_id, team_name, row_type)
    );
  `);

  console.log(`✓ Tables ready`);
}

// ── HELPERS ───────────────────────────────────────────────────────────────────
function parseMadeAtt(str) {
  if (!str || str.trim() === '-' || str.trim() === '') return [0, 0];
  const m = str.trim().match(/^(\d+)-(\d+)$/);
  return m ? [parseInt(m[1]), parseInt(m[2])] : [0, 0];
}

function int0(str) {
  if (!str || str.trim() === '-' || str.trim() === '') return 0;
  const n = parseInt(str.trim());
  return isNaN(n) ? 0 : n;
}

function buildPlayerId(teamName, jersey, playerName) {
  const teamSlug  = teamName.toLowerCase().replace(/[^a-z0-9]/g, '');
  const nameParts = playerName.toLowerCase().replace(/[^a-z0-9 ]/g, '').trim().split(/\s+/);
  return `${teamSlug}_${jersey}_${nameParts.join('_')}`;
}

function isMinTracked(playerMins) {
  if (playerMins.length === 0) return false;
  const total = playerMins.reduce((a, b) => a + b, 0);
  return total > playerMins.length * 1.5;
}

function detectGameMinutes(root) {
  if (root.querySelector('a[href="#prd6"]')) return 250;
  if (root.querySelector('a[href="#prd5"]')) return 225;
  return 200;
}

// ── PARSE BOX SCORE ───────────────────────────────────────────────────────────
function parseBoxScore(root, gameId) {
  const playerGames = [];
  const teamGames   = [];
  const gameMin     = detectGameMinutes(root);

  const skipHeadings = ['box score','starters','reserves','totals','play by play',
                        'team stats','scoring','quarter','period','1st','2nd','3rd','4th'];

  let currentTeam  = '';
  let teamMins     = [];
  let teamPlayers  = [];
  let teamTotals   = { fg:0,fga:0,fg3:0,fg3a:0,ft:0,fta:0,reb_off:0,reb_def:0,reb_tot:0,ast:0,stl:0,blk:0,to_stat:0,pf:0,pts:0 };
  const teamsInGame = [];

  function flushTeam() {
    if (teamPlayers.length === 0) return;
    const tracked = isMinTracked(teamMins);

    teamGames.push({
      game_id: gameId, team_name: currentTeam, row_type: 'team',
      min_tracked: tracked, game_total_min: gameMin,
      ...teamTotals,
    });

    teamsInGame.push({ name: currentTeam, hasStats: teamPlayers.length > 0 });

    for (const p of teamPlayers) {
      p.min_tracked    = tracked;
      p.game_total_min = gameMin;
      playerGames.push(p);
    }

    teamMins    = [];
    teamPlayers = [];
    teamTotals  = { fg:0,fga:0,fg3:0,fg3a:0,ft:0,fta:0,reb_off:0,reb_def:0,reb_tot:0,ast:0,stl:0,blk:0,to_stat:0,pf:0,pts:0 };
  }

  const elements = root.querySelectorAll('h2, h3, h4, tr');

  for (const el of elements) {
    const tag = el.tagName.toLowerCase();

    if (['h2','h3','h4'].includes(tag)) {
      const text  = el.text.trim();
      if (!text || text.length < 2) continue;
      const lower = text.toLowerCase();
      if (skipHeadings.some(s => lower.includes(s))) continue;
      flushTeam();
      currentTeam = text;
      continue;
    }

    if (!currentTeam) continue;

    const playerLink = el.querySelector('a.player-name, span.player-name');
    if (!playerLink) continue;

    const jerseyEl = el.querySelector('.uniform');
    const jersey   = jerseyEl ? jerseyEl.text.trim() : '';
    const name     = playerLink.text.trim();

    if (!name || name === 'Team' || name === 'TEAM') continue;

    const tds = el.querySelectorAll('td');
    if (tds.length < 13) continue;

    const firstTd = tds[0]?.text?.trim() || '';
    const lastTd  = tds[12]?.text?.trim() || '';
    if (firstTd.includes('$statNode') || lastTd.includes('$statNode')) continue;
    if (tds.every(td => td.text.trim() === '')) continue;

    const min         = int0(firstTd);
    const [fg,  fga]  = parseMadeAtt(tds[1]?.text);
    const [fg3, fg3a] = parseMadeAtt(tds[2]?.text);
    const [ft,  fta]  = parseMadeAtt(tds[3]?.text);
    const reb_off     = int0(tds[4]?.text);
    const reb_def     = int0(tds[5]?.text);
    const reb_tot     = int0(tds[6]?.text);
    const ast         = int0(tds[7]?.text);
    const stl         = int0(tds[8]?.text);
    const blk         = int0(tds[9]?.text);
    const to_stat     = int0(tds[10]?.text);
    const pf          = int0(tds[11]?.text);
    const pts         = int0(tds[12]?.text);

    teamTotals.fg += fg; teamTotals.fga += fga;
    teamTotals.fg3 += fg3; teamTotals.fg3a += fg3a;
    teamTotals.ft += ft; teamTotals.fta += fta;
    teamTotals.reb_off += reb_off; teamTotals.reb_def += reb_def; teamTotals.reb_tot += reb_tot;
    teamTotals.ast += ast; teamTotals.stl += stl;
    teamTotals.blk += blk; teamTotals.to_stat += to_stat;
    teamTotals.pf += pf; teamTotals.pts += pts;

    teamMins.push(min);
    teamPlayers.push({
      player_id: buildPlayerId(currentTeam, jersey, name),
      team_name: currentTeam, game_id: gameId, season: SEASON,
      jersey, name, min,
      fg, fga, fg3, fg3a, ft, fta,
      reb_off, reb_def, reb_tot,
      ast, stl, blk, to_stat, pf, pts,
    });
  }

  flushTeam();

  const opponentHasStats = teamsInGame.length === 2 && teamsInGame.every(t => t.hasStats);

  for (const p of playerGames) p.opponent_has_stats = opponentHasStats;
  for (const t of teamGames)   t.opponent_has_stats = opponentHasStats;

  if (teamsInGame.length === 2) {
    for (let i = 0; i < Math.min(teamGames.length, 2); i++) {
      const oppIdx = i === 0 ? 1 : 0;
      const opp = teamGames[oppIdx];
      teamGames.push({
        game_id: teamGames[i].game_id, team_name: teamGames[i].team_name,
        row_type: 'opponent', min_tracked: opp.min_tracked,
        game_total_min: gameMin, opponent_has_stats: opponentHasStats,
        fg: opp.fg, fga: opp.fga, fg3: opp.fg3, fg3a: opp.fg3a,
        ft: opp.ft, fta: opp.fta,
        reb_off: opp.reb_off, reb_def: opp.reb_def, reb_tot: opp.reb_tot,
        ast: opp.ast, stl: opp.stl, blk: opp.blk,
        to_stat: opp.to_stat, pf: opp.pf, pts: opp.pts,
      });
    }
  }

  return { playerGames, teamGames };
}

// ── DB UPSERTS ────────────────────────────────────────────────────────────────
async function upsertPlayerGames(games) {
  for (const g of games) {
    if (!g.name || !g.player_id) continue;
    await pool.query(`
      INSERT INTO ${TABLE_PLAYER_GAMES} (
        player_id, game_id, team_name, season, jersey, name,
        min, min_tracked, game_total_min, opponent_has_stats,
        fg, fga, fg3, fg3a, ft, fta,
        reb_off, reb_def, reb_tot,
        ast, stl, blk, to_stat, pf, pts
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25)
      ON CONFLICT (player_id, game_id) DO UPDATE SET
        min_tracked=EXCLUDED.min_tracked, opponent_has_stats=EXCLUDED.opponent_has_stats,
        min=EXCLUDED.min, fg=EXCLUDED.fg, fga=EXCLUDED.fga,
        fg3=EXCLUDED.fg3, fg3a=EXCLUDED.fg3a, ft=EXCLUDED.ft, fta=EXCLUDED.fta,
        reb_off=EXCLUDED.reb_off, reb_def=EXCLUDED.reb_def, reb_tot=EXCLUDED.reb_tot,
        ast=EXCLUDED.ast, stl=EXCLUDED.stl, blk=EXCLUDED.blk,
        to_stat=EXCLUDED.to_stat, pf=EXCLUDED.pf, pts=EXCLUDED.pts
    `, [
      g.player_id, g.game_id, g.team_name, SEASON, g.jersey || '', g.name,
      g.min ?? null, g.min_tracked, g.game_total_min, g.opponent_has_stats,
      g.fg, g.fga, g.fg3, g.fg3a, g.ft, g.fta,
      g.reb_off, g.reb_def, g.reb_tot,
      g.ast, g.stl, g.blk, g.to_stat, g.pf, g.pts,
    ]);
  }
}

async function upsertTeamGames(games) {
  for (const g of games) {
    if (!g.team_name || !g.game_id) continue;
    await pool.query(`
      INSERT INTO ${TABLE_TEAM_GAMES} (
        game_id, team_name, row_type, season,
        min_tracked, game_total_min, opponent_has_stats,
        fg, fga, fg3, fg3a, ft, fta,
        reb_off, reb_def, reb_tot,
        ast, stl, blk, to_stat, pf, pts
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22)
      ON CONFLICT (game_id, team_name, row_type) DO UPDATE SET
        min_tracked=EXCLUDED.min_tracked, opponent_has_stats=EXCLUDED.opponent_has_stats,
        fg=EXCLUDED.fg, fga=EXCLUDED.fga, fg3=EXCLUDED.fg3, fg3a=EXCLUDED.fg3a,
        ft=EXCLUDED.ft, fta=EXCLUDED.fta,
        reb_off=EXCLUDED.reb_off, reb_def=EXCLUDED.reb_def, reb_tot=EXCLUDED.reb_tot,
        ast=EXCLUDED.ast, stl=EXCLUDED.stl, blk=EXCLUDED.blk,
        to_stat=EXCLUDED.to_stat, pf=EXCLUDED.pf, pts=EXCLUDED.pts
    `, [
      g.game_id, g.team_name, g.row_type, SEASON,
      g.min_tracked, g.game_total_min, g.opponent_has_stats,
      g.fg, g.fga, g.fg3, g.fg3a, g.ft, g.fta,
      g.reb_off, g.reb_def, g.reb_tot,
      g.ast, g.stl, g.blk, g.to_stat, g.pf, g.pts,
    ]);
  }
}

// ── MAIN ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`\n🏀 NJCAA Game Scraper — ${GENDER} ${SEASON}`);
  console.log('='.repeat(50));

  // Load URL list
  if (!fs.existsSync(URLS_FILE)) {
    console.error(`URL file not found: ${URLS_FILE}`);
    console.error(`Run the browser URL collector first and save output to ${URLS_FILE}`);
    process.exit(1);
  }

  const urlList = JSON.parse(fs.readFileSync(URLS_FILE, 'utf8'));
  console.log(`✓ Loaded ${urlList.length} box score URLs from ${URLS_FILE}`);

  await ensureTables();

  let gamesFetched = 0, gamesFailed = 0;
  let totalPlayerRows = 0, totalTeamRows = 0;
  let trackedCount = 0, untrackedCount = 0;
  let withOppStats = 0, withoutOppStats = 0;

  for (let i = 0; i < urlList.length; i++) {
    const url    = urlList[i];
    const gameId = url.match(/boxscores\/([^.]+)/)?.[1] || url;

    process.stdout.write(`[${i + 1}/${urlList.length}] ${gameId}... `);

    try {
      const res  = await fetch(url, { headers: HEADERS, timeout: 15000 });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const html = await res.text();
      const root = parse(html);

      const { playerGames, teamGames } = parseBoxScore(root, gameId);

      await upsertPlayerGames(playerGames);
      await upsertTeamGames(teamGames);

      trackedCount    += playerGames.filter(p => p.min_tracked).length;
      untrackedCount  += playerGames.filter(p => !p.min_tracked).length;
      withOppStats    += playerGames.filter(p => p.opponent_has_stats).length;
      withoutOppStats += playerGames.filter(p => !p.opponent_has_stats).length;
      totalPlayerRows += playerGames.length;
      totalTeamRows   += teamGames.length;
      gamesFetched++;

      console.log(`✓ ${playerGames.length} players`);
    } catch (e) {
      console.log(`✗ ${e.message}`);
      gamesFailed++;
    }

    await sleep(DELAY_MS);
  }

  console.log('\n' + '='.repeat(50));
  console.log(`✅ Done — ${gamesFetched} games, ${gamesFailed} failed`);
  console.log(`   Player-game rows: ${totalPlayerRows}`);
  console.log(`   Team-game rows:   ${totalTeamRows}`);
  console.log(`\n   Minutes tracked:   ${trackedCount} player-games`);
  console.log(`   Minutes untracked: ${untrackedCount} player-games`);
  console.log(`   Has opp stats:     ${withOppStats} player-games`);
  console.log(`   No opp stats:      ${withoutOppStats} player-games`);

  await pool.end();
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
