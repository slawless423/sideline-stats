// scripts/estimate_3ssb_missing_minutes.mjs
//
// Backfill missing minutes for adidas 3SSB games with broken minute tracking.
//
// Detection: team_mp < 150 → broken.
// Method: HISTORICAL — for each player in the broken game, compute their
//   average min% across non-broken games (team_mp >= 150), multiply by 160,
//   normalize so team total = 160 exactly. Players with no qualifying history
//   get a fallback: leftover minutes split evenly among them.
//
// All updated rows get mp_estimated = TRUE.
//
// Prerequisite: 02_add_mp_estimated.sql has been run.
// Re-run safety: idempotent — re-running re-computes and overwrites.
//
// Usage:
//   node scripts/estimate_3ssb_missing_minutes.mjs

import pg from 'pg';
const { Client } = pg;

const FULL_GAME_TEAM_MP = 160;
const BROKEN_MP_THRESHOLD = 150;
const LEAGUE = 'adidas 3SSB 17U';
const SEASON = '2026';

async function estimateForTeam(client, gameUuid, team) {
  const playersRes = await client.query(
    `SELECT pg.id AS player_game_id, pg.player_id, p.full_name
     FROM adidas_3ssb_player_games pg
     JOIN adidas_3ssb_players p ON p.id = pg.player_id
     WHERE pg.game_uuid = $1 AND pg.team = $2`,
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
    estimates.push({ ...p, rawEstimate: avgPct * FULL_GAME_TEAM_MP });
  }

  if (unknown.length > 0) {
    const knownSum = estimates.reduce((a, b) => a + b.rawEstimate, 0);
    const remaining = Math.max(0, FULL_GAME_TEAM_MP - knownSum);
    const perUnknown = remaining / unknown.length;
    for (const p of unknown) {
      estimates.push({ ...p, rawEstimate: perUnknown });
    }
  }

  const rawSum = estimates.reduce((a, b) => a + b.rawEstimate, 0);
  let normalized;
  if (rawSum > 0) {
    const scale = FULL_GAME_TEAM_MP / rawSum;
    normalized = estimates.map(e => ({ ...e, finalMp: Math.round(e.rawEstimate * scale) }));
  } else {
    const even = Math.round(FULL_GAME_TEAM_MP / estimates.length);
    normalized = estimates.map(e => ({ ...e, finalMp: even }));
  }

  const intSum = normalized.reduce((a, b) => a + b.finalMp, 0);
  const diff = FULL_GAME_TEAM_MP - intSum;
  if (diff !== 0) {
    const target = [...normalized].sort((a, b) => b.finalMp - a.finalMp)[0];
    target.finalMp += diff;
  }

  return { players: normalized };
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

    const brokenRes = await client.query(
      `SELECT team, opponent, game_uuid, game_date, mp
       FROM adidas_3ssb_team_games
       WHERE league = $1 AND season = $2 AND mp < $3
       ORDER BY game_date, game_uuid, team`,
      [LEAGUE, SEASON, BROKEN_MP_THRESHOLD]
    );
    const broken = brokenRes.rows;
    console.log(`\nFound ${broken.length} broken team-game rows (team_mp < ${BROKEN_MP_THRESHOLD}):`);
    for (const r of broken) {
      console.log(`  ${r.game_date.toISOString().slice(0,10)} | ${r.game_uuid} | ${r.team.padEnd(35)} (currently ${r.mp} mp)`);
    }
    if (broken.length === 0) {
      console.log('Nothing to do.');
      await client.query('COMMIT');
      return;
    }

    let totalPlayerUpdates = 0;
    let totalTeamUpdates = 0;

    for (const game of broken) {
      console.log(`\nProcessing ${game.team} @ game ${game.game_uuid}...`);

      const result = await estimateForTeam(client, game.game_uuid, game.team);
      if (!result) {
        console.log(`  WARN: no player rows found, skipping`);
        continue;
      }

      for (const n of result.players) {
        await client.query(
          `UPDATE adidas_3ssb_player_games
           SET mp = $1, mp_estimated = TRUE
           WHERE id = $2`,
          [n.finalMp, n.player_game_id]
        );
        totalPlayerUpdates += 1;
      }

      const checkSum = result.players.reduce((a, b) => a + b.finalMp, 0);
      console.log(`  Updated ${result.players.length} player rows, sum mp = ${checkSum}`);

      await client.query(
        `UPDATE adidas_3ssb_team_games
         SET mp = $1, mp_estimated = TRUE
         WHERE game_uuid = $2 AND team = $3 AND league = $4 AND season = $5`,
        [FULL_GAME_TEAM_MP, game.game_uuid, game.team, LEAGUE, SEASON]
      );
      totalTeamUpdates += 1;

      const sorted = [...result.players].sort((a, b) => b.finalMp - a.finalMp);
      const top = sorted.slice(0, 3).map(n => `${n.full_name}: ${n.finalMp}`).join(', ');
      console.log(`  Top minutes: ${top}`);
    }

    const oppSyncRes = await client.query(
      `UPDATE adidas_3ssb_team_games tg_a
       SET opp_mp = tg_b.mp
       FROM adidas_3ssb_team_games tg_b
       WHERE tg_a.game_uuid = tg_b.game_uuid
         AND tg_a.team = tg_b.opponent
         AND tg_a.league = tg_b.league
         AND tg_a.season = tg_b.season
         AND tg_a.league = $1
         AND tg_a.season = $2
         AND tg_a.mp_estimated = TRUE`,
      [LEAGUE, SEASON]
    );
    console.log(`\nSynced opp_mp on ${oppSyncRes.rowCount} estimated team_games rows`);

    console.log(`\nRecomputing team_stats and player_stats from per-game tables...`);

    await client.query(
      `DELETE FROM adidas_3ssb_team_stats WHERE league = $1 AND season = $2`,
      [LEAGUE, SEASON]
    );
    await client.query(
      `INSERT INTO adidas_3ssb_team_stats
         (team, league, season, gp, mp,
          fgm, fga, fg3m, fg3a, ftm, fta,
          oreb, dreb, reb, ast, stl, blk, tov, pts, pf,
          opp_fgm, opp_fga, opp_fg3m, opp_fg3a, opp_ftm, opp_fta,
          opp_oreb, opp_dreb, opp_reb, opp_ast, opp_stl, opp_blk,
          opp_tov, opp_pts, opp_pf)
       SELECT
         team, league, season,
         COUNT(*)::int, SUM(mp)::int,
         SUM(fgm)::int, SUM(fga)::int, SUM(fg3m)::int, SUM(fg3a)::int,
         SUM(ftm)::int, SUM(fta)::int,
         SUM(oreb)::int, SUM(dreb)::int, SUM(reb)::int,
         SUM(ast)::int, SUM(stl)::int, SUM(blk)::int,
         SUM(tov)::int, SUM(pts)::int, SUM(pf)::int,
         SUM(opp_fgm)::int, SUM(opp_fga)::int, SUM(opp_fg3m)::int, SUM(opp_fg3a)::int,
         SUM(opp_ftm)::int, SUM(opp_fta)::int,
         SUM(opp_oreb)::int, SUM(opp_dreb)::int, SUM(opp_reb)::int,
         SUM(opp_ast)::int, SUM(opp_stl)::int, SUM(opp_blk)::int,
         SUM(opp_tov)::int, SUM(opp_pts)::int, SUM(opp_pf)::int
       FROM adidas_3ssb_team_games
       WHERE league = $1 AND season = $2
       GROUP BY team, league, season`,
      [LEAGUE, SEASON]
    );

    await client.query(
      `DELETE FROM adidas_3ssb_player_stats
       WHERE season = $1 AND player_id IN (
         SELECT id FROM adidas_3ssb_players WHERE league = $2 AND season = $1
       )`,
      [SEASON, LEAGUE]
    );
    await client.query(
      `INSERT INTO adidas_3ssb_player_stats
         (player_id, season, gp, mp,
          fgm, fga, fg3m, fg3a, ftm, fta,
          oreb, dreb, reb, ast, stl, blk, tov, pts, pf)
       SELECT
         pg.player_id, pg.season,
         COUNT(*)::int, SUM(pg.mp)::int,
         SUM(pg.fgm)::int, SUM(pg.fga)::int, SUM(pg.fg3m)::int, SUM(pg.fg3a)::int,
         SUM(pg.ftm)::int, SUM(pg.fta)::int,
         SUM(pg.oreb)::int, SUM(pg.dreb)::int, SUM(pg.reb)::int,
         SUM(pg.ast)::int, SUM(pg.stl)::int, SUM(pg.blk)::int,
         SUM(pg.tov)::int, SUM(pg.pts)::int, SUM(pg.pf)::int
       FROM adidas_3ssb_player_games pg
       WHERE pg.league = $1 AND pg.season = $2
       GROUP BY pg.player_id, pg.season`,
      [LEAGUE, SEASON]
    );

    console.log(`Recomputed team_stats and player_stats.`);

    await client.query('COMMIT');

    console.log(`\n✅ Done.`);
    console.log(`   Player rows updated: ${totalPlayerUpdates}`);
    console.log(`   Team rows updated:   ${totalTeamUpdates}`);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('\n❌ Rolled back:', err.message);
    throw err;
  } finally {
    await client.end();
  }
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
