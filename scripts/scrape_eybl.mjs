// scripts/scrape_eybl.mjs
// Scrapes all EYBL Scholastic box scores for a given season and
// upserts season-total player + team stats into Neon.
//
// Usage: node scripts/scrape_eybl.mjs
// Env:   DATABASE_URL  (Neon connection string)

import puppeteer from 'puppeteer';
import * as cheerio from 'cheerio';
import pkg from 'pg';
const { Pool } = pkg;

// ─── Config ───────────────────────────────────────────────────────────────────

const SEASON      = '2025-26';
const SEASON_YEAR = '2025';         // matches ?year= param on the site
const LEAGUE      = 'EYBL Scholastic';
const BASE_URL    = 'https://nikeeyblscholastic.com';
const STATS_URL   = `${BASE_URL}/stats.aspx?path=mbball&year=${SEASON_YEAR}`;

// ─── DB ───────────────────────────────────────────────────────────────────────

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseNum(str) {
  const n = parseInt((str || '').trim(), 10);
  return isNaN(n) ? 0 : n;
}

function parseBoxscoreTable($, table) {
  // DataTables renders player name as <th scope="row"> in tbody.
  // The thead has all columns including 'player', but tbody <td> cells
  // skip the name column. So we build a td-only header list for indexing.

  const allHeaders = [];
  $(table).find('thead th, thead td').each((_, th) => {
    allHeaders.push($(th).text().trim().toLowerCase());
  });

  // Build td-only headers by removing 'player'/'name' entry
  const tdHeaders = allHeaders.filter(h => h !== 'player' && h !== 'name');

  const colIndex = (names) => {
    for (const name of names) {
      const i = tdHeaders.findIndex(h => h === name);
      if (i !== -1) return i;
    }
    return -1;
  };

  // td cell indexes (player name is in <th>, not counted here)
  // Format 1 td cols: ## | GS | MIN | FG | 3PT | FT | ORB-DRB | REB | PF | A | TO | BLK | STL | PTS
  // Format 2 td cols: ## | GS | FGM-FGA | 3FGM-3FGA | FTM-FTA | OFF-DEF | TOT | PF | A | TO | BLK | STL | MIN
  const iFg     = colIndex(['fg', 'fgm-fga']);
  const i3pt    = colIndex(['3pt', '3fg', '3fgm-3fga']);
  const iFt     = colIndex(['ft', 'ftm-fta']);
  const iOrbDrb = colIndex(['orb-drb', 'off-def']);
  const iReb    = colIndex(['reb', 'tot']);
  const iPts    = colIndex(['pts', 'tp']);
  const iAst    = colIndex(['a', 'ast']);
  const iTo     = colIndex(['to', 'tov']);
  const iBlk    = colIndex(['blk']);
  const iStl    = colIndex(['stl']);
  const iMin    = colIndex(['min']);

  const players = [];

  $(table).find('tbody tr').each((_, tr) => {
    // Name is in <th scope="row">
    const nameEl = $(tr).find('th[scope="row"]');
    const rawName = nameEl.length ? nameEl.text().trim() : '';
    // Strip any leading jersey number e.g. "1 Felesi,Anthony" → "Felesi,Anthony"
    const name = rawName.replace(/^\d+\s+/, '').trim();

    if (!name) return;
    if (/^totals?$/i.test(name)) return;
    if (/^team$/i.test(name)) return;
    if (/^\*?$/.test(name)) return;
    if (/^\d+$/.test(name)) return;
    // All player names are in "LastName,FirstName" format — skip anything without a comma
    // (catches team name totals rows like "Utah Prep", "CIA Bella Vista" etc.)
    if (!name.includes(',')) {
      if (name.length > 2) console.log(`  Skipping no-comma name: "${name}"`);
      return;
    }

    const cells = $(tr).find('td');
    if (cells.length < 5) return;

    const splitFrac = (str, part) => {
      const [a, b] = (str || '0-0').split('-').map(s => parseNum(s));
      return part === 0 ? (a || 0) : (b || 0);
    };

    const fgStr     = iFg     !== -1 ? $(cells[iFg]).text().trim()      : '0-0';
    const fg3Str    = i3pt    !== -1 ? $(cells[i3pt]).text().trim()     : '0-0';
    const ftStr     = iFt     !== -1 ? $(cells[iFt]).text().trim()      : '0-0';
    const orbDrbStr = iOrbDrb !== -1 ? $(cells[iOrbDrb]).text().trim()  : '0-0';

    players.push({
      name,
      fgm:  splitFrac(fgStr,     0),
      fga:  splitFrac(fgStr,     1),
      fg3m: splitFrac(fg3Str,    0),
      fg3a: splitFrac(fg3Str,    1),
      ftm:  splitFrac(ftStr,     0),
      fta:  splitFrac(ftStr,     1),
      oreb: splitFrac(orbDrbStr, 0),
      dreb: splitFrac(orbDrbStr, 1),
      reb:  iReb !== -1 ? parseNum($(cells[iReb]).text()) : 0,
      pts:  iPts !== -1 ? parseNum($(cells[iPts]).text()) : 0,
      ast:  iAst !== -1 ? parseNum($(cells[iAst]).text()) : 0,
      tov:  iTo  !== -1 ? parseNum($(cells[iTo]).text())  : 0,
      blk:  iBlk !== -1 ? parseNum($(cells[iBlk]).text()) : 0,
      stl:  iStl !== -1 ? parseNum($(cells[iStl]).text()) : 0,
      mp:   iMin !== -1 ? parseNum($(cells[iMin]).text()) : 0,
    });
  });

  return players;
}

// ─── Step 1: Get all box score URLs from the stats page ───────────────────────

async function fetchBoxScoreUrls() {
  console.log('Fetching box score URL list...');
  const res = await fetch(STATS_URL);
  const html = await res.text();
  const $ = cheerio.load(html);

  const urls = [];
  $('a[href*="boxscore.aspx"]').each((_, a) => {
    const href = $(a).attr('href');
    if (href) {
      const full = href.startsWith('http') ? href : `${BASE_URL}/${href.replace(/^\//, '')}`;
      if (!urls.includes(full)) urls.push(full);
    }
  });

  console.log(`Found ${urls.length} box score URLs`);
  return urls;
}

// ─── Step 2: Scrape a single box score with Puppeteer ────────────────────────

async function scrapeBoxScore(page, url) {
  await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
  await new Promise(r => setTimeout(r, 2000)); // let JS finish rendering

  // Wait for at least one box score table to appear
  try {
    await page.waitForSelector('h3.sub-heading', { timeout: 20000 });
    await page.waitForSelector('table.sidearm-table', { timeout: 20000 });
  } catch {
    console.warn(`  Timeout waiting for tables on ${url}`);
    return null;
  }

  const html = await page.content();
  const $ = cheerio.load(html);

  // Sidearm box score structure (confirmed from DevTools inspection):
  // <section>
  //   <h3 class="sub-heading">Utah Prep 74</h3>
  //   <table class="sidearm-table overall-stats ...">  ← player stats
  //   <table class="sidearm-table ...">               ← team summary (ignore)
  // </section>
  // Two such <section> blocks appear, one per team.

  const teams = [];
  let teamsFound = 0;

  $('section').each((_, section) => {
    if (teamsFound >= 2) return; // only want the first two teams (full game)

    const heading = $(section).find('h3.sub-heading').first();
    if (!heading.length) return;

    const rawName = heading.text().trim().replace(/\s+/g, ' ');
    const teamName = rawName.replace(/\s+\d+$/, '');
    if (!teamName) return;

    // First sidearm-table in the section is the player stats table
    const table = $(section).find('table.sidearm-table').first();
    if (!table.length) return;

    const players = parseBoxscoreTable($, table);
    if (players.length > 0) {
      teams.push({ teamName, players });
      teamsFound++;
    }
  });

  if (teams.length === 0) {
    console.warn(`  Could not parse teams from ${url}`);
    return null;
  }

  return teams; // [{teamName, players: [...]}, ...]
}

// ─── Step 3: Accumulate totals in memory ─────────────────────────────────────

// playerMap: `${normalizedName}|${teamName}` → { ...statTotals, gp }
// teamMap:   `${teamName}` → { ...statTotals, gp }

function addStats(target, src) {
  const fields = ['fgm','fga','fg3m','fg3a','ftm','fta','oreb','dreb','reb','pts','ast','tov','blk','stl','mp'];
  for (const f of fields) target[f] = (target[f] || 0) + (src[f] || 0);
}

function emptyStats() {
  return {
    gp:0, fgm:0, fga:0, fg3m:0, fg3a:0, ftm:0, fta:0, oreb:0, dreb:0, reb:0, pts:0, ast:0, tov:0, blk:0, stl:0, mp:0,
    opp_fgm:0, opp_fga:0, opp_fg3m:0, opp_fg3a:0, opp_ftm:0, opp_fta:0,
    opp_oreb:0, opp_dreb:0, opp_reb:0, opp_ast:0, opp_stl:0, opp_blk:0, opp_tov:0, opp_pts:0,
  };
}

function normalizeName(name) {
  // Handles "Smith,John" → "John Smith" and "Medlock, Jr.,Carlos" → "Carlos Medlock Jr."
  // Format is typically "LastName,FirstName" or "LastName, Suffix.,FirstName"
  const parts = name.split(',').map(s => s.trim()).filter(Boolean);
  if (parts.length >= 2) {
    const last = parts[0];
    const first = parts[parts.length - 1];
    const suffix = parts.length === 3 ? parts[1] : '';
    const full = suffix ? `${first} ${last} ${suffix}` : `${first} ${last}`;
    return full.toLowerCase().replace(/\s+/g, ' ').trim();
  }
  return name.toLowerCase().replace(/\s+/g, ' ').trim();
}

function buildNameParts(normalizedName) {
  // "carlos medlock jr." → { fullName, firstName, lastName }
  const words = normalizedName.split(' ').filter(Boolean);
  const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
  const suffixes = ['jr.', 'sr.', 'jr', 'sr', 'ii', 'iii', 'iv'];
  
  // Check if last word is a suffix
  const hasSuffix = words.length > 2 && suffixes.includes(words[words.length - 1]);
  
  let firstName, lastName, suffix;
  if (hasSuffix) {
    suffix = cap(words[words.length - 1]);
    firstName = words.slice(0, -2).map(cap).join(' ') || cap(words[0]);
    lastName = cap(words[words.length - 2]);
  } else {
    firstName = words.slice(0, -1).map(cap).join(' ') || cap(words[0]);
    lastName = cap(words[words.length - 1]);
    suffix = '';
  }
  
  const fullName = suffix
    ? `${firstName} ${lastName} ${suffix}`
    : `${firstName} ${lastName}`;

  return { fullName, firstName, lastName };
}

// ─── Step 4: Upsert into Neon ─────────────────────────────────────────────────

async function upsertToDb(playerMap, teamMap) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // ── Team stats ──
    for (const [teamName, stats] of Object.entries(teamMap)) {
      await client.query(`
        INSERT INTO eybl_team_stats
          (team, league, season, gp,
           fgm, fga, fg3m, fg3a, ftm, fta, oreb, dreb, reb, ast, stl, blk, tov, pts,
           opp_fgm, opp_fga, opp_fg3m, opp_fg3a, opp_ftm, opp_fta,
           opp_oreb, opp_dreb, opp_reb, opp_ast, opp_stl, opp_blk, opp_tov, opp_pts)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,
                $19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32)
        ON CONFLICT (team, league, season) DO UPDATE SET
          gp=$4, fgm=$5, fga=$6, fg3m=$7, fg3a=$8, ftm=$9, fta=$10,
          oreb=$11, dreb=$12, reb=$13, ast=$14, stl=$15, blk=$16, tov=$17, pts=$18,
          opp_fgm=$19, opp_fga=$20, opp_fg3m=$21, opp_fg3a=$22, opp_ftm=$23, opp_fta=$24,
          opp_oreb=$25, opp_dreb=$26, opp_reb=$27, opp_ast=$28, opp_stl=$29, opp_blk=$30,
          opp_tov=$31, opp_pts=$32
      `, [
        teamName, LEAGUE, SEASON,
        stats.gp, stats.fgm, stats.fga, stats.fg3m, stats.fg3a,
        stats.ftm, stats.fta, stats.oreb, stats.dreb, stats.reb,
        stats.ast, stats.stl, stats.blk, stats.tov, stats.pts,
        stats.opp_fgm, stats.opp_fga, stats.opp_fg3m, stats.opp_fg3a,
        stats.opp_ftm, stats.opp_fta, stats.opp_oreb, stats.opp_dreb, stats.opp_reb,
        stats.opp_ast, stats.opp_stl, stats.opp_blk, stats.opp_tov, stats.opp_pts,
      ]);
    }

    console.log(`Upserted ${Object.keys(teamMap).length} team stat rows`);

    // ── Player stats ──
    let playerCount = 0;
    for (const [key, stats] of Object.entries(playerMap)) {
      const [normalizedName, teamName] = key.split('|||');
      const { fullName, firstName, lastName } = buildNameParts(normalizedName);
      try {

      // Upsert player
      const playerRes = await client.query(`
        INSERT INTO eybl_players (full_name, first_name, last_name, team, league, season)
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (full_name, team, league, season) DO UPDATE SET
          first_name = EXCLUDED.first_name,
          last_name  = EXCLUDED.last_name
        RETURNING id
      `, [fullName, firstName, lastName, teamName, LEAGUE, SEASON]);

      const playerId = playerRes.rows[0].id;

      // Upsert player stats
      await client.query(`
        INSERT INTO eybl_player_stats
          (player_id, season, gp, mp, fgm, fga, fg3m, fg3a, ftm, fta, oreb, dreb, reb, ast, stl, blk, tov, pts)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
        ON CONFLICT (player_id, season) DO UPDATE SET
          gp=$3, mp=$4, fgm=$5, fga=$6, fg3m=$7, fg3a=$8, ftm=$9, fta=$10,
          oreb=$11, dreb=$12, reb=$13, ast=$14, stl=$15, blk=$16, tov=$17, pts=$18
      `, [
        playerId, SEASON,
        stats.gp, stats.mp, stats.fgm, stats.fga, stats.fg3m, stats.fg3a,
        stats.ftm, stats.fta, stats.oreb, stats.dreb, stats.reb,
        stats.ast, stats.stl, stats.blk, stats.tov, stats.pts
      ]);

      playerCount++;
      } catch (playerErr) {
        console.error(`  Failed to upsert player "${fullName}" (${teamName}):`, playerErr.message);
      }
    }

    await client.query('COMMIT');
    console.log(`Upserted ${playerCount} player stat rows`);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const boxScoreUrls = await fetchBoxScoreUrls();

  if (boxScoreUrls.length === 0) {
    console.error('No box score URLs found. Exiting.');
    process.exit(1);
  }

  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  const page = await browser.newPage();
  await page.setUserAgent(
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36'
  );

  const playerMap = {}; // `${normalizedName}|||${teamName}` → stats
  const teamMap   = {}; // teamName → stats

  for (let i = 0; i < boxScoreUrls.length; i++) {
    const url = boxScoreUrls[i];
    console.log(`[${i + 1}/${boxScoreUrls.length}] ${url}`);

    let teams;
    try {
      teams = await scrapeBoxScore(page, url);
    } catch (err) {
      console.warn(`  Error scraping: ${err.message}`);
      continue;
    }

    if (!teams) continue;

    // Each box score has exactly 2 teams — accumulate each team's stats
    // as the opponent stats for the other team
    for (const { teamName, players } of teams) {
      if (!teamName || players.length === 0) continue;
      if (!teamMap[teamName]) teamMap[teamName] = emptyStats();
      teamMap[teamName].gp += 1;
      for (const p of players) addStats(teamMap[teamName], p);

      // Accumulate player totals
      for (const p of players) {
        const key = `${normalizeName(p.name)}|||${teamName}`;
        if (!playerMap[key]) playerMap[key] = emptyStats();
        playerMap[key].gp += 1;
        addStats(playerMap[key], p);
      }
    }

    // Cross-accumulate opponent stats — Team A's stats → Team B's opp stats and vice versa
    if (teams.length === 2) {
      const [teamA, teamB] = teams;
      if (teamA.teamName && teamB.teamName && teamA.players.length > 0 && teamB.players.length > 0) {
        const oppFields = ['fgm','fga','fg3m','fg3a','ftm','fta','oreb','dreb','reb','pts','ast','tov','blk','stl'];
        // Sum teamA players → add to teamB's opp totals
        for (const p of teamA.players) {
          for (const f of oppFields) {
            teamMap[teamB.teamName][`opp_${f}`] = (teamMap[teamB.teamName][`opp_${f}`] || 0) + (p[f] || 0);
          }
        }
        // Sum teamB players → add to teamA's opp totals
        for (const p of teamB.players) {
          for (const f of oppFields) {
            teamMap[teamA.teamName][`opp_${f}`] = (teamMap[teamA.teamName][`opp_${f}`] || 0) + (p[f] || 0);
          }
        }
      }
    }

    // Small delay to be polite
    await new Promise(r => setTimeout(r, 1000));
  }

  await browser.close();

  console.log(`\nAccumulated stats for ${Object.keys(playerMap).length} players across ${Object.keys(teamMap).length} teams`);
  console.log('Writing to database...');

  await upsertToDb(playerMap, teamMap);
  await pool.end();

  console.log('Done.');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
