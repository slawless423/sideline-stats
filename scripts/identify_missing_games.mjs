import fs from "node:fs/promises";

const NCAA_API_BASE = "https://ncaa-api.henrygd.me";
const SEASON_START = "2025-11-01";

console.log("START find_all_missing_games", new Date().toISOString());

function toDate(s) {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}
function fmtDate(dt) {
  const y = dt.getUTCFullYear();
  const m = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const d = String(dt.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
function addDays(dt, days) {
  const x = new Date(dt);
  x.setUTCDate(x.getUTCDate() + days);
  return x;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchJson(path) {
  const url = `${NCAA_API_BASE}${path}`;
  
  try {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 10000);
    
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "baseline-analytics-bot",
        "Accept": "application/json",
      },
    });
    
    clearTimeout(t);
    
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

function extractGameIds(obj) {
  const ids = new Set();
  const walk = (x) => {
    if (Array.isArray(x)) return x.forEach(walk);
    if (x && typeof x === "object") return Object.values(x).forEach(walk);
    if (typeof x === "string") {
      const matches = x.match(/\/game\/(\d+)/g);
      if (matches) matches.forEach((m) => ids.add(m.replace("/game/", "")));
    }
  };
  walk(obj);
  return [...ids];
}

async function main() {
  const today = new Date();
  const end = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  const start = toDate(SEASON_START);

  // Step 1: Get ALL game IDs from scoreboards
  console.log("Step 1: Collecting ALL game IDs from scoreboards...");
  const allGames = new Map(); // gameId -> date

  for (let dt = start; dt <= end; dt = addDays(dt, 1)) {
    const d = fmtDate(dt);
    const [Y, M, D] = d.split("-");
    const scoreboardPath = `/scoreboard/basketball-women/d1/${Y}/${M}/${D}/all-conf`;

    const scoreboard = await fetchJson(scoreboardPath);
    if (!scoreboard) continue;

    const gameIds = extractGameIds(scoreboard);
    for (const gid of gameIds) {
      allGames.set(gid, d);
    }
    
    await sleep(50);
  }

  console.log(`Found ${allGames.size} total games from scoreboards`);

  // Step 2: Load the successfully parsed games from ratings.json  
  console.log("\nStep 2: Loading successfully parsed games from your latest ratings.json...");
  
  // We need to reconstruct which games were successfully parsed
  // The ratings.json doesn't store individual game IDs, so we'll need to fetch boxscores
  // for all games and check which ones work
  
  console.log("\nStep 3: Testing each game to find which ones fail...");
  const successfulGames = new Set();
  const failedGames = [];
  
  let tested = 0;
  const allGameIds = [...allGames.keys()];
  
  for (const gid of allGameIds) {
    tested++;
    if (tested % 100 === 0) console.log(`Tested ${tested}/${allGameIds.length} games...`);
    
    try {
      const box = await fetchJson(`/game/${gid}/boxscore`);
      await sleep(200); // Slower to avoid rate limits
      
      if (box) {
        successfulGames.add(gid);
      } else {
        failedGames.push({
          gameId: gid,
          date: allGames.get(gid),
          reason: "No boxscore data"
        });
      }
    } catch (e) {
      failedGames.push({
        gameId: gid,
        date: allGames.get(gid),
        reason: String(e.message || e)
      });
    }
  }

  console.log(`\n=== RESULTS ===`);
  console.log(`Total games: ${allGames.size}`);
  console.log(`Successful: ${successfulGames.size}`);
  console.log(`Failed: ${failedGames.length}`);

  // Create comprehensive missing games file
  const missingGames = failedGames.map(game => ({
    gameId: game.gameId,
    date: game.date,
    ncaaUrl: `https://www.ncaa.com/game/${game.gameId}`,
    espnUrl: `https://www.espn.com/womens-college-basketball/game/_/gameId/${game.gameId}`,
    homeTeam: "TO_BE_FILLED",
    awayTeam: "TO_BE_FILLED",
    status: "NEEDS_MANUAL_ENTRY",
    reason: game.reason
  }));

  // Save comprehensive JSON
  await fs.mkdir("public/data", { recursive: true });
  await fs.writeFile(
    "public/data/all_missing_games.json",
    JSON.stringify({ 
      total_missing: missingGames.length,
      games: missingGames 
    }, null, 2),
    "utf8"
  );

  // Save CSV for easy viewing
  const csvLines = [
    "gameId,date,ncaaUrl,espnUrl,status"
  ];
  for (const game of missingGames) {
    csvLines.push(
      `${game.gameId},${game.date},${game.ncaaUrl},${game.espnUrl},${game.status}`
    );
  }
  await fs.writeFile(
    "public/data/all_missing_games.csv",
    csvLines.join("\n"),
    "utf8"
  );

  console.log(`\n✅ Created public/data/all_missing_games.json`);
  console.log(`✅ Created public/data/all_missing_games.csv`);
  console.log(`\nAll ${missingGames.length} missing games identified!`);
  console.log("\nNext: Use these game IDs to create manual_games.json template");
}

main().catch((e) => {
  console.error("FATAL", e);
  process.exit(1);
});
