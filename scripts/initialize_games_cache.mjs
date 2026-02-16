import fs from "node:fs/promises";

const NCAA_API_BASE = "https://ncaa-api.henrygd.me";
const SEASON_START = "2025-11-01";

console.log("START initialize_games_cache", new Date().toISOString());
console.log("This will create the cache needed for incremental updates");

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

  console.log("\nCollecting all game IDs from scoreboards to create cache...");
  console.log("This ensures the incremental script knows which games already exist.\n");

  const allGameIds = [];
  let daysProcessed = 0;

  for (let dt = start; dt <= end; dt = addDays(dt, 1)) {
    daysProcessed++;
    const d = fmtDate(dt);
    const [Y, M, D] = d.split("-");
    const scoreboardPath = `/scoreboard/basketball-women/d1/${Y}/${M}/${D}/all-conf`;

    if (daysProcessed % 10 === 0) {
      console.log(`Processed ${daysProcessed} days...`);
    }

    const scoreboard = await fetchJson(scoreboardPath);
    if (!scoreboard) {
      await sleep(100);
      continue;
    }

    const gameIds = extractGameIds(scoreboard);
    for (const gid of gameIds) {
      allGameIds.push(gid);
    }
    
    await sleep(50); // Small delay to be nice to the API
  }

  console.log(`\n✅ Found ${allGameIds.length} total games from season`);
  console.log(`Processing ${daysProcessed} days from ${SEASON_START} to ${fmtDate(end)}`);

  // Save the cache
  const cache = {
    generated_at: new Date().toISOString(),
    season_start: SEASON_START,
    total_games: allGameIds.length,
    game_ids: allGameIds
  };

  await fs.mkdir("public/data", { recursive: true });
  await fs.writeFile(
    "public/data/games_cache.json",
    JSON.stringify(cache, null, 2),
    "utf8"
  );

  console.log("\n✅ CREATED public/data/games_cache.json");
  console.log(`✅ Cache contains ${allGameIds.length} game IDs`);
  console.log("\nYou can now switch to the incremental daily update script!");
  console.log("The incremental script will use this cache to know which games are new.");
}

main().catch((e) => {
  console.error("FATAL", e);
  process.exit(1);
});
