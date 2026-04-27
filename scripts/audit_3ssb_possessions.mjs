// scripts/audit_3ssb_possessions.mjs
//
// Pulls every 3SSB 17U box score from Passport and prints a sorted list of
// games by possessions per team. Lowest-possession games are most likely
// to have bad/missing stats. No DB writes.
//
// Usage:
//   EVENT_ID=262708 node scripts/audit_3ssb_possessions.mjs

const EVENT_ID = process.env.EVENT_ID;
const DIVISION = process.env.DIVISION || '17U';

if (!EVENT_ID) {
  console.error('ERROR: EVENT_ID required');
  process.exit(1);
}

const PASSPORT_BASE = 'https://api.the-passport.com/api';

async function passportGet(url) {
  const res = await fetch(url, { headers: { accept: 'application/json' } });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`);
  return res.json();
}

function calcPoss(stats) {
  const fga = stats.fieldGoalsAttempted ?? 0;
  const fta = stats.freeThrowAttempted ?? 0;
  const orb = stats.offensiveRebounds ?? 0;
  const tov = stats.turnovers ?? 0;
  return fga + 0.44 * fta - orb + tov;
}

async function main() {
  console.log(`Fetching schedule for event ${EVENT_ID}, division ${DIVISION}...`);
  const sched = await passportGet(
    `${PASSPORT_BASE}/events/exposure/games-with-ratings?exposureEventId=${EVENT_ID}&limit=1000`
  );
  const all = sched.data || [];
  const target = all.filter(g =>
    g.division?.name === DIVISION &&
    g.homeTeam?.score != null &&
    g.awayTeam?.score != null
  );
  console.log(`Found ${target.length} ${DIVISION} completed games\n`);

  const rows = [];
  for (let i = 0; i < target.length; i += 1) {
    const g = target[i];
    process.stdout.write(`  [${i + 1}/${target.length}] game ${g.id}...\r`);
    try {
      const box = await passportGet(`${PASSPORT_BASE}/games/exposure/${g.id}`);
      const home = box.homeTeam;
      const away = box.awayTeam;
      const hStats = home?.stats || {};
      const aStats = away?.stats || {};

      const homePoss = calcPoss(hStats);
      const awayPoss = calcPoss(aStats);
      const avgPoss = (homePoss + awayPoss) / 2;
      const homeMin = hStats.minutes ?? 0;
      const awayMin = aStats.minutes ?? 0;

      rows.push({
        gameId: g.id,
        gameNumber: box.gameNumber,
        date: box.gameInfo?.startTime?.slice(0, 10) || '',
        away: away?.name || g.awayTeam?.name,
        home: home?.name || g.homeTeam?.name,
        score: `${aStats.points ?? 0}-${hStats.points ?? 0}`,
        avgPoss: Math.round(avgPoss * 10) / 10,
        homePoss: Math.round(homePoss * 10) / 10,
        awayPoss: Math.round(awayPoss * 10) / 10,
        homeMin: Math.round(homeMin * 10) / 10,
        awayMin: Math.round(awayMin * 10) / 10,
        homeFga: hStats.fieldGoalsAttempted ?? 0,
        awayFga: aStats.fieldGoalsAttempted ?? 0,
        homeTov: hStats.turnovers ?? 0,
        awayTov: aStats.turnovers ?? 0,
      });
    } catch (err) {
      console.error(`\n  ERROR on game ${g.id}: ${err.message}`);
    }
  }
  console.log(`\n\nProcessed ${rows.length} games\n`);

  // Sort by avgPoss ascending (lowest first = most suspicious)
  rows.sort((a, b) => a.avgPoss - b.avgPoss);

  // Stats overview
  const allPoss = rows.map(r => r.avgPoss).sort((a, b) => a - b);
  const median = allPoss[Math.floor(allPoss.length / 2)];
  const mean = allPoss.reduce((s, n) => s + n, 0) / allPoss.length;
  const min = allPoss[0];
  const max = allPoss[allPoss.length - 1];

  console.log(`Possessions-per-team stats across all ${rows.length} games:`);
  console.log(`  Min:    ${min.toFixed(1)}`);
  console.log(`  Median: ${median.toFixed(1)}`);
  console.log(`  Mean:   ${mean.toFixed(1)}`);
  console.log(`  Max:    ${max.toFixed(1)}\n`);

  console.log(`Games sorted by avg possessions per team (lowest first):`);
  console.log(`Threshold for "suspicious" — flag anything below ~75% of median = ${(median * 0.75).toFixed(0)}\n`);

  console.log('Date       | Game ID  | Matchup                                            | AvgPoss  | H/A Min     | H/A FGA | H/A TOV');
  console.log('-----------+----------+----------------------------------------------------+----------+-------------+---------+--------');
  for (const r of rows) {
    const matchup = `${r.away} (${r.score.split('-')[0]}) @ ${r.home} (${r.score.split('-')[1]})`.slice(0, 50).padEnd(50);
    const flag = r.avgPoss < median * 0.75 ? ' ⚠️ ' : '   ';
    console.log(
      `${r.date} | ${String(r.gameId).padEnd(8)} | ${matchup} | ${flag}${r.avgPoss.toString().padStart(5)} | ${r.homeMin.toString().padStart(5)}/${r.awayMin.toString().padEnd(5)} | ${r.homeFga.toString().padStart(3)}/${r.awayFga.toString().padEnd(3)} | ${r.homeTov.toString().padStart(2)}/${r.awayTov.toString().padEnd(2)}`
    );
  }
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
