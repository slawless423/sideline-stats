// scripts/estimate_3ssb_dryrun.mjs
//
// DRY RUN: Computes estimated minutes for ONE broken game and prints a report.
// Does NOT write to the database. Wraps everything in a transaction that
// always ROLLBACKs at the end (no schema changes, no row changes).
//
// Usage:
//   GAME_UUID=234683 node scripts/estimate_3ssb_dryrun.mjs
//
// Pick any of the 4 broken games:
//   234683 — Brookwood Lu Dort Elite vs One Time Legends (4/24)
//   234702 — Atlanta Celtics vs Mass Rivals (4/25)
//   234722 — ASAK Elite vs Dream Vision (4/25)
//   235789 — MBJ Elite vs TJ Ford Elite (4/26)

import pg from 'pg';
const { Client } = pg;

const FULL_GAME_TEAM_MP = 160;
const LEAGUE = 'adidas 3SSB 17U';
const SEASON = '2026';
const GAME_UUID = process.env.GAME_UUID;

if (!GAME_UUID) {
  console.error('ERROR: GAME_UUID env var is required');
  console.error('Try one of: 234683, 234702, 234722, 235789');
  process.exit(1);
}

async function estimateForTeam(client, gameUuid, team) {
  const playersRes = await client.query(
    `SELECT pg.id AS player_game_id, pg.player_id, p.full_name,
            pg.pts, pg.fga, pg.fta
     FROM adidas_3ssb_player_games pg
     JOIN adidas_3ssb_players p ON p.id = pg.player_id
     WHERE pg.game_uuid = $1 AND pg.team = $2
     ORDER BY pg.pts DESC`,
    [gameUuid, team]
  );
  const players = playersRes.rows;

  if (players.length === 0) {
    console.log(`  No player rows found for ${team}`);
    return null;
  }

  const estimates = [];
  const unknown = [];

  for (const p of players) {
    const histRes = await client.query(
      `SELECT pg.game_uuid,
              pg.mp AS player_mp,
              tg.mp AS team_mp,
              pg.mp::numeric / NULLIF(tg.mp, 0)::numeric AS min_pct
       FROM adidas_3ssb_player_games pg
       JOIN adidas_3ssb_team_games tg
         ON tg.game_uuid = pg.game_uuid
        AND tg.team = pg.team
        AND tg.league = pg.league
        AND tg.season = pg.season
       WHERE pg.player_id = $1
         AND pg.league = $2
         AND pg.season = $3
         AND tg.mp > 0
       ORDER BY pg.game_uuid`,
      [p.player_id, LEAGUE, SEASON]
    );

    const validRows = histRes.rows
      .map(r => ({
        gameUuid: r.game_uuid,
        playerMp: r.player_mp,
        teamMp: r.team_mp,
        minPct: parseFloat(r.min_pct),
      }))
      .filter(r => Number.isFinite(r.minPct) && r.minPct > 0);

    if (validRows.length === 0) {
      unknown.push(p);
      continue;
    }

    const avgPct = validRows.reduce((a, b) => a + b.minPct, 0) / validRows.length;
    estimates.push({
      ...p,
      historyGames: validRows.length,
      avgPct,
      rawEstimate: avgPct * FULL_GAME_TEAM_MP,
      historyDetail: validRows,
    });
  }

  // Fallback for unknowns
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
        historyDetail: [],
        fallback: true,
      });
    }
  }

  // Normalize
  const rawSum = estimates.reduce((a, b) => a + b.rawEstimate, 0);
  const scale = rawSum > 0 ? FULL_GAME_TEAM_MP / rawSum : 1;
  const normalized = estimates.map(e => ({
    ...e,
    finalMp: Math.round(e.rawEstimate * scale),
  }));

  // Round-off correction
  const intSum = normalized.reduce((a, b) => a + b.finalMp, 0);
  const diff = FULL_GAME_TEAM_MP - intSum;
  if (diff !== 0) {
    const target = [...normalized].sort((a, b) => b.finalMp - a.finalMp)[0];
    target.finalMp += diff;
    target.roundCorrection = diff;
  }

  return { players: normalized, rawSum, scale };
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
    // Wrap in a transaction we'll always roll back, just to be paranoid
    await client.query('BEGIN');

    // Get game info
    const gameRes = await client.query(
      `SELECT team, opponent, game_date, pts, opp_pts, mp
       FROM adidas_3ssb_team_games
       WHERE league = $1 AND season = $2 AND game_uuid = $3
       ORDER BY team`,
      [LEAGUE, SEASON, GAME_UUID]
    );

    if (gameRes.rowCount === 0) {
      console.log(`No game found with uuid ${GAME_UUID}`);
      return;
    }

    console.log(`\n=== DRY RUN: Game ${GAME_UUID} ===`);
    for (const g of gameRes.rows) {
      console.log(`  ${g.game_date} | ${g.team} (${g.pts}) vs ${g.opponent} (${g.opp_pts}) — current team_mp: ${g.mp}`);
    }

    if (gameRes.rows[0].mp !== 0) {
      console.log(`\n⚠️  This game's team_mp is NOT 0 — it doesn't need estimating.`);
      console.log(`   Pick a broken game: 234683, 234702, 234722, or 235789.`);
      return;
    }

    // Process each team's perspective
    for (const g of gameRes.rows) {
      console.log(`\n--- ${g.team} ---`);
      const result = await estimateForTeam(client, GAME_UUID, g.team);
      if (!result) continue;

      // Sort by final mp desc for display
      const sorted = [...result.players].sort((a, b) => b.finalMp - a.finalMp);

      console.log(`\n  ${'Player'.padEnd(28)} ${'Pts'.padStart(4)} ${'Hist'.padStart(5)} ${'AvgMin%'.padStart(8)} ${'RawMP'.padStart(7)} ${'FinalMP'.padStart(8)} Notes`);
      console.log(`  ${'-'.repeat(28)} ${'-'.repeat(4)} ${'-'.repeat(5)} ${'-'.repeat(8)} ${'-'.repeat(7)} ${'-'.repeat(8)} -----`);
      for (const p of sorted) {
        const name = p.full_name.length > 28 ? p.full_name.slice(0, 27) + '…' : p.full_name;
        const histStr = p.historyGames > 0 ? `${p.historyGames}g` : '—';
        const pctStr = p.avgPct != null ? `${(p.avgPct * 100).toFixed(1)}%` : '(fallback)';
        const rawStr = p.rawEstimate.toFixed(1);
        const notes = [];
        if (p.fallback) notes.push('NO HISTORY → fallback');
        if (p.roundCorrection) notes.push(`+${p.roundCorrection} round-fix`);
        console.log(
          `  ${name.padEnd(28)} ${String(p.pts).padStart(4)} ${histStr.padStart(5)} ${pctStr.padStart(8)} ${rawStr.padStart(7)} ${String(p.finalMp).padStart(8)} ${notes.join(', ')}`
        );
      }

      const finalSum = sorted.reduce((a, b) => a + b.finalMp, 0);
      console.log(`  ${'-'.repeat(28)} ${'-'.repeat(4)} ${'-'.repeat(5)} ${'-'.repeat(8)} ${'-'.repeat(7)} ${'-'.repeat(8)}`);
      console.log(`  ${'TOTAL'.padEnd(28)} ${' '.repeat(4)} ${' '.repeat(5)} ${' '.repeat(8)} ${result.rawSum.toFixed(1).padStart(7)} ${String(finalSum).padStart(8)}  (target: ${FULL_GAME_TEAM_MP})`);
      console.log(`  Normalization scale: ${result.scale.toFixed(4)}x`);
    }

    console.log(`\n=== END DRY RUN — no rows modified ===\n`);
  } catch (err) {
    console.error('\nError:', err.message);
    throw err;
  } finally {
    // Always roll back — this is dry-run only
    try { await client.query('ROLLBACK'); } catch (_) {}
    await client.end();
  }
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
