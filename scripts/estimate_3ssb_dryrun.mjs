// scripts/estimate_3ssb_dryrun.mjs
//
// DRY RUN: Computes estimated minutes for broken games and prints a report.
// Does NOT write to the database.
//
// Default: processes ALL broken games (team_mp < 150) in one run.
// Optional: GAME_UUID env var to drill into a single game.
//
// Detection rule: team_mp < 150 → broken.
// Method (single, simple): HISTORICAL — for each player in the broken game,
//   compute their average min% across their non-broken games (team_mp >= 150),
//   multiply by 160, then normalize so team total = 160 exactly.
//
// Players with no qualifying history get a fallback: leftover minutes split
// evenly among them.
//
// Why historical for everyone (instead of rescaling partial-data games):
//   In the partial-data games, some players had mp logged and others didn't,
//   even though they clearly played (have pts/reb/etc). Rescaling would lock
//   the unlogged players at 0 minutes forever, which is wrong.
//
// Usage:
//   node scripts/estimate_3ssb_dryrun.mjs                  # all broken games
//   GAME_UUID=234683 node scripts/estimate_3ssb_dryrun.mjs # one game

import pg from 'pg';
const { Client } = pg;

const FULL_GAME_TEAM_MP = 160;
const BROKEN_MP_THRESHOLD = 150;
const LEAGUE = 'adidas 3SSB 17U';
const SEASON = '2026';
const GAME_UUID = process.env.GAME_UUID;

async function estimateForTeam(client, gameUuid, team) {
  const playersRes = await client.query(
    `SELECT pg.id AS player_game_id, pg.player_id, p.full_name,
            pg.pts, pg.mp AS current_mp
     FROM adidas_3ssb_player_games pg
     JOIN adidas_3ssb_players p ON p.id = pg.player_id
     WHERE pg.game_uuid = $1 AND pg.team = $2
     ORDER BY pg.pts DESC`,
    [gameUuid, team]
  );
  const players = playersRes.rows;
  if (players.length === 0) return null;

  const estimates = [];
  const unknown = [];

  for (const p of players) {
    const histRes = await client.query(
      `SELECT pg.mp::numeric / NULLIF(tg.mp, 0)::numeric AS min_pct
       FROM adidas_3ssb_player_games pg
       JOIN adidas_3ssb_team_games tg
         ON tg.game_uuid = pg.game_uuid
        AND tg.team = pg.team
        AND tg.league = pg.league
        AND tg.season = pg.season
       WHERE pg.player_id = $1
         AND pg.league = $2
         AND pg.season = $3
         AND tg.mp >= $4`,
      [p.player_id, LEAGUE, SEASON, BROKEN_MP_THRESHOLD]
    );

    const validPcts = histRes.rows
      .map(r => parseFloat(r.min_pct))
      .filter(v => Number.isFinite(v) && v > 0);

    if (validPcts.length === 0) {
      unknown.push(p);
      continue;
    }

    const avgPct = validPcts.reduce((a, b) => a + b, 0) / validPcts.length;
    estimates.push({
      ...p,
      historyGames: validPcts.length,
      avgPct,
      rawEstimate: avgPct * FULL_GAME_TEAM_MP,
    });
  }

  if (unknown.length > 0) {
    const knownSum = estimates.reduce((a, b) => a + b.rawEstimate, 0);
    const remaining = Math.max(0, FULL_GAME_TEAM_MP - knownSum);
    const perUnknown = remaining / unknown.length;
    for (const p of unknown) {
      estimates.push({
        ...p,
        historyGames: 0,
        avgPct: null,
        rawEstimate: perUnknown,
        fallback: true,
      });
    }
  }

  const rawSum = estimates.reduce((a, b) => a + b.rawEstimate, 0);
  const scale = rawSum > 0 ? FULL_GAME_TEAM_MP / rawSum : 1;
  const normalized = estimates.map(e => ({
    ...e,
    finalMp: Math.round(e.rawEstimate * scale),
  }));
  const intSum = normalized.reduce((a, b) => a + b.finalMp, 0);
  const diff = FULL_GAME_TEAM_MP - intSum;
  if (diff !== 0) {
    const target = [...normalized].sort((a, b) => b.finalMp - a.finalMp)[0];
    target.finalMp += diff;
    target.roundCorrection = diff;
  }

  return { players: normalized, rawSum, scale };
}

function printTable(team, currentTeamMp, result) {
  console.log(`\n--- ${team} (current team_mp: ${currentTeamMp}) ---`);
  const sorted = [...result.players].sort((a, b) => b.finalMp - a.finalMp);
  console.log(`\n  ${'Player'.padEnd(28)} ${'Pts'.padStart(4)} ${'CurrMP'.padStart(7)} ${'Hist'.padStart(5)} ${'AvgMin%'.padStart(8)} ${'RawMP'.padStart(7)} ${'FinalMP'.padStart(8)} Notes`);
  console.log(`  ${'-'.repeat(28)} ${'-'.repeat(4)} ${'-'.repeat(7)} ${'-'.repeat(5)} ${'-'.repeat(8)} ${'-'.repeat(7)} ${'-'.repeat(8)} -----`);
  for (const p of sorted) {
    const name = p.full_name.length > 28 ? p.full_name.slice(0,27) + '…' : p.full_name;
    const histStr = p.historyGames > 0 ? `${p.historyGames}g` : '—';
    const pctStr = p.avgPct != null ? `${(p.avgPct * 100).toFixed(1)}%` : '(fallback)';
    const rawStr = p.rawEstimate.toFixed(1);
    const notes = [];
    if (p.fallback) notes.push('NO HISTORY → fallback');
    if (p.roundCorrection) notes.push(`${p.roundCorrection > 0 ? '+' : ''}${p.roundCorrection} round-fix`);
    console.log(`  ${name.padEnd(28)} ${String(p.pts).padStart(4)} ${String(p.current_mp).padStart(7)} ${histStr.padStart(5)} ${pctStr.padStart(8)} ${rawStr.padStart(7)} ${String(p.finalMp).padStart(8)} ${notes.join(', ')}`);
  }
  const finalSum = sorted.reduce((a, b) => a + b.finalMp, 0);
  console.log(`  ${'-'.repeat(28)} ${'-'.repeat(4)} ${'-'.repeat(7)} ${'-'.repeat(5)} ${'-'.repeat(8)} ${'-'.repeat(7)} ${'-'.repeat(8)}`);
  console.log(`  ${'TOTAL'.padEnd(28)} ${' '.repeat(4)} ${' '.repeat(7)} ${' '.repeat(5)} ${' '.repeat(8)} ${result.rawSum.toFixed(1).padStart(7)} ${String(finalSum).padStart(8)}  (target: ${FULL_GAME_TEAM_MP})`);
  console.log(`  Normalization scale: ${result.scale.toFixed(4)}x`);
}

async function processGame(client, gameUuid) {
  const gameRes = await client.query(
    `SELECT team, opponent, game_date, pts, opp_pts, mp
     FROM adidas_3ssb_team_games
     WHERE league = $1 AND season = $2 AND game_uuid = $3
     ORDER BY team`,
    [LEAGUE, SEASON, gameUuid]
  );

  if (gameRes.rowCount === 0) {
    console.log(`\nNo game found with uuid ${gameUuid}`);
    return null;
  }

  const dateStr = gameRes.rows[0].game_date.toISOString().slice(0,10);
  const matchupStr = gameRes.rows.map(g => `${g.team} (${g.pts})`).join(' vs ');

  console.log(`\n${'='.repeat(80)}`);
  console.log(`Game ${gameUuid} | ${dateStr} | ${matchupStr}`);
  console.log(`${'='.repeat(80)}`);

  const summary = { gameUuid, dateStr, teams: [] };

  for (const g of gameRes.rows) {
    const result = await estimateForTeam(client, gameUuid, g.team);
    if (!result) {
      console.log(`  No player rows for ${g.team}, skipping`);
      continue;
    }

    printTable(g.team, g.mp, result);

    summary.teams.push({
      team: g.team,
      currentMp: g.mp,
      scale: result.scale,
      players: result.players.length,
      fallbacks: result.players.filter(p => p.fallback).length,
    });
  }

  return summary;
}

async function main() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error('ERROR: DATABASE_URL env var is required');
    process.exit(1);
  }

  const client = new Client({ connectionString: dbUrl });
  await client.connect();

  try {
    await client.query('BEGIN');

    let uuids;
    if (GAME_UUID) {
      uuids = [GAME_UUID];
      console.log(`\n=== DRY RUN: single game ${GAME_UUID} ===`);
    } else {
      const brokenRes = await client.query(
        `SELECT DISTINCT game_uuid, game_date
         FROM adidas_3ssb_team_games
         WHERE league = $1 AND season = $2 AND mp < $3
         ORDER BY game_date, game_uuid`,
        [LEAGUE, SEASON, BROKEN_MP_THRESHOLD]
      );
      uuids = brokenRes.rows.map(r => r.game_uuid);
      console.log(`\n=== DRY RUN: all ${uuids.length} broken games (team_mp < ${BROKEN_MP_THRESHOLD}) ===`);
    }

    const summaries = [];
    for (const uuid of uuids) {
      const s = await processGame(client, uuid);
      if (s) summaries.push(s);
    }

    console.log(`\n\n${'='.repeat(80)}`);
    console.log('SUMMARY');
    console.log('='.repeat(80));
    console.log(`\n  ${'UUID'.padEnd(8)} ${'Date'.padEnd(11)} ${'Team'.padEnd(32)} ${'CurrMP'.padStart(7)} ${'Scale'.padStart(7)} ${'Plyrs'.padStart(6)} ${'Fbk'.padStart(4)}`);
    console.log(`  ${'-'.repeat(8)} ${'-'.repeat(11)} ${'-'.repeat(32)} ${'-'.repeat(7)} ${'-'.repeat(7)} ${'-'.repeat(6)} ${'-'.repeat(4)}`);
    for (const s of summaries) {
      for (const t of s.teams) {
        const teamName = t.team.length > 32 ? t.team.slice(0,31) + '…' : t.team;
        const scaleStr = t.scale != null ? t.scale.toFixed(3) : '—';
        const fbkStr = t.fallbacks > 0 ? String(t.fallbacks) : '—';
        console.log(`  ${s.gameUuid.padEnd(8)} ${s.dateStr.padEnd(11)} ${teamName.padEnd(32)} ${String(t.currentMp).padStart(7)} ${scaleStr.padStart(7)} ${String(t.players).padStart(6)} ${fbkStr.padStart(4)}`);
      }
    }

    const totalTeamRows = summaries.reduce((a, s) => a + s.teams.length, 0);
    const totalFallbacks = summaries.reduce((a, s) => a + s.teams.reduce((b, t) => b + t.fallbacks, 0), 0);
    console.log(`\n  Total: ${summaries.length} games, ${totalTeamRows} team rows, ${totalFallbacks} player(s) needed fallback`);

    console.log(`\n=== END DRY RUN — no rows modified ===\n`);
  } finally {
    try { await client.query('ROLLBACK'); } catch (_) {}
    await client.end();
  }
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
