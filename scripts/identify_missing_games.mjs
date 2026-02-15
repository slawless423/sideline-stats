import fs from "node:fs/promises";

const NCAA_API_BASE = "https://ncaa-api.henrygd.me";
const SEASON_START = "2025-11-01";

console.log("START identify_missing_games", new Date().toISOString());

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

function pick(obj, keys) {
  for (const k of keys) {
    if (obj && obj[k] != null) return obj[k];
  }
  return null;
}

function findTeamsMeta(gameJson) {
  const candidates = [
    gameJson?.teams,
    gameJson?.game?.teams,
    gameJson?.meta?.teams,
    gameJson?.header?.teams,
  ].filter(Array.isArray);

  for (const arr of candidates) {
    const filtered = arr.filter((t) => t && (t.teamId != null || t.id != null));
    if (filtered.length >= 2) return filtered;
  }
  return null;
}

function nameFromMeta(t) {
  return String(
    pick(t, ["nameShort", "name_short", "shortName", "nameFull", "name_full", "fullName", "name"]) ?? "Unknown"
  );
}

async function main() {
  const today = new Date();
  const end = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  const start = toDate(SEASON_START);

  const allGameIds = new Set();
  const successfulGameIds = new Set();
  const gameMetadata = new Map(); // gameId -> {date, teams}

  console.log("Step 1: Collecting all game IDs from scoreboards...");
  
  // Collect all game IDs
  for (let dt = start; dt <= end; dt = addDays(dt, 1)) {
    const d = fmtDate(dt);
    const [Y, M, D] = d.split("-");
    const scoreboardPath = `/scoreboard/basketball-women/d1/${Y}/${M}/${D}/all-conf`;

    const scoreboard = await fetchJson(scoreboardPath);
    if (!scoreboard) continue;

    const gameIds = extractGameIds(scoreboard);
    for (const gid of gameIds) {
      allGameIds.add(gid);
      gameMetadata.set(gid, { date: d, homeTeam: null, awayTeam: null });
    }
    
    await sleep(100);
  }

  console.log(`Found ${allGameIds.size} total games`);
  console.log("\nStep 2: Testing which games have valid boxscores...");

  let tested = 0;
  for (const gid of allGameIds) {
    tested++;
    if (tested % 100 === 0) console.log(`Tested ${tested}/${allGameIds.size} games...`);

    const box = await fetchJson(`/game/${gid}/boxscore`);
    await sleep(200);

    if (box) {
      // Try to parse team names
      const teams = findTeamsMeta(box);
      if (teams && teams.length >= 2) {
        const meta = gameMetadata.get(gid);
        meta.homeTeam = nameFromMeta(teams[0]);
        meta.awayTeam = nameFromMeta(teams[1]);
        gameMetadata.set(gid, meta);
        successfulGameIds.add(gid);
      } else {
        successfulGameIds.add(gid); // Has data but couldn't parse teams
      }
    }
  }

  // Find missing games
  const missingGameIds = [...allGameIds].filter(gid => !successfulGameIds.has(gid));

  console.log(`\n=== RESULTS ===`);
  console.log(`Total games: ${allGameIds.size}`);
  console.log(`Successful: ${successfulGameIds.size}`);
  console.log(`Missing: ${missingGameIds.length}`);

  // Create output files
  const missingGames = missingGameIds.map(gid => {
    const meta = gameMetadata.get(gid);
    return {
      gameId: gid,
      date: meta.date,
      homeTeam: meta.homeTeam || "Unknown",
      awayTeam: meta.awayTeam || "Unknown",
      ncaaUrl: `https://www.ncaa.com/game/${gid}`,
      status: "NEEDS_MANUAL_ENTRY"
    };
  });

  // Save as JSON
  await fs.mkdir("public/data", { recursive: true });
  await fs.writeFile(
    "public/data/missing_games.json",
    JSON.stringify(missingGames, null, 2),
    "utf8"
  );

  // Save as CSV for easy viewing
  const csvLines = [
    "gameId,date,homeTeam,awayTeam,ncaaUrl,status"
  ];
  for (const game of missingGames) {
    csvLines.push(
      `${game.gameId},${game.date},${game.homeTeam},${game.awayTeam},${game.ncaaUrl},${game.status}`
    );
  }
  await fs.writeFile(
    "public/data/missing_games.csv",
    csvLines.join("\n"),
    "utf8"
  );

  console.log(`\n✅ Created public/data/missing_games.json`);
  console.log(`✅ Created public/data/missing_games.csv`);
  console.log(`\nNext step: Manually fill in box scores for these ${missingGameIds.length} games`);
}

main().catch((e) => {
  console.error("FATAL", e);
  process.exit(1);
});
