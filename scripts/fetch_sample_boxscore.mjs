import fs from "node:fs/promises";

const NCAA_API_BASE = "https://ncaa-api.henrygd.me";

// Known working game IDs from previous runs
const GAME_IDS = ["6518189", "6519393", "6529125"];

async function fetchJson(url) {
  const res = await fetch(url, {
    headers: {
      "User-Agent": "baseline-analytics-bot",
      "Accept": "application/json",
    },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function main() {
  for (const gid of GAME_IDS) {
    console.log(`Trying game ${gid}...`);
    try {
      const box = await fetchJson(`${NCAA_API_BASE}/game/${gid}/boxscore`);
      
      await fs.mkdir("public/data", { recursive: true });
      await fs.writeFile(
        "public/data/sample_boxscore.json",
        JSON.stringify(box, null, 2),
        "utf8"
      );
      
      console.log(`✅ Saved sample_boxscore.json for game ${gid}`);
      
      // Print all unique keys found anywhere in the JSON
      const allKeys = new Set();
      const walk = (x) => {
        if (Array.isArray(x)) return x.forEach(walk);
        if (x && typeof x === "object") {
          Object.keys(x).forEach(k => allKeys.add(k));
          Object.values(x).forEach(walk);
        }
      };
      walk(box);
      
      console.log("\nAll keys found in boxscore:");
      console.log([...allKeys].sort().join(", "));
      return;
    } catch (e) {
      console.log(`Failed: ${e.message}`);
    }
  }
  console.log("All games failed!");
}

main().catch(console.error);
