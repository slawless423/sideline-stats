import fs from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import pg from "pg";

const { Pool } = pg;

// ===== SCHOOL NAME ALIAS MAP =====
// Maps Excel school names -> DB team_name values
const SCHOOL_ALIASES = {
  // D1
  "Arkansas–Pine Bluff": "Ark.-Pine Bluff",
  "Arkansas-Pine Bluff": "Ark.-Pine Bluff",
  "Ball State": "Ball St.",
  "Boise State": "Boise St.",
  "Colorado State": "Colorado St.",
  "Florida State": "Florida St.",
  "Fresno State": "Fresno St.",
  "Georgia State": "Georgia St.",
  "Idaho State": "Idaho St.",
  "Illinois State": "Illinois St.",
  "Indiana State": "Indiana St.",
  "Iowa State": "Iowa St.",
  "Kansas State": "Kansas St.",
  "Kent State": "Kent St.",
  "Michigan State": "Michigan St.",
  "Mississippi State": "Mississippi St.",
  "Missouri State": "Missouri St.",
  "Montana State": "Montana St.",
  "New Mexico State": "New Mexico St.",
  "North Dakota State": "North Dakota St.",
  "Ohio State": "Ohio St.",
  "Oklahoma State": "Oklahoma St.",
  "Oregon State": "Oregon St.",
  "Penn State": "Penn St.",
  "Portland State": "Portland St.",
  "Sacramento State": "Sacramento St.",
  "San Diego State": "San Diego St.",
  "San Jose State": "San Jose St.",
  "South Carolina State": "South Carolina St.",
  "South Dakota State": "South Dakota St.",
  "Tennessee State": "Tennessee St.",
  "Tennessee Tech": "Tennessee Tech",
  "Texas State": "Texas St.",
  "Utah State": "Utah St.",
  "Washington State": "Washington St.",
  "Weber State": "Weber St.",
  "Wyoming": "Wyoming",
  "Purdue Fort Wayne": "Purdue Fort Wayne",
  "East Texas A&M": "East Texas A&M",
  "Little Rock": "Little Rock",
  "North Texas": "North Texas",
  "Kansas City": "Kansas City",
  "Saint Louis": "Saint Louis",
  "San Diego": "San Diego",
  "SIUE": "SIUE",
  "UIC": "UIC",
  "Lipscomb": "Lipscomb",

  // D2 - full name -> abbreviated DB name
  "Alaska": "Alas. Anchorage", // flag as fuzzy - could be either Alaska campus
  "Albany State": "Albany St. (GA)",
  "American International": "American Int'l",
  "Angelo State": "Angelo St.",
  "Arkansas–Fort Smith": "Ark.-Fort Smith",
  "Arkansas-Fort Smith": "Ark.-Fort Smith",
  "Auburn–Montgomery": "AUM",
  "Auburn-Montgomery": "AUM",
  "Augustana": "Augustana (SD)",
  "Bemidji State": "Bemidji St.",
  "Cal State Los Angeles": "Cal State LA",
  "Cal State Monterey Bay": "Cal St. Monterey Bay",
  "Central State": "Central St. (OH)",
  "Chadron State": "Chadron St.",
  "Clayton State": "Clayton St.",
  "Colorado Christian": "Colo. Christian",
  "Colorado Colorado Springs": "UCCS",
  "Columbus State": "Columbus St.",
  "Delta State": "Delta St.",
  "District of Columbia": "Dist. Columbia",
  "Elizabeth City State": "Elizabeth City St.",
  "Frostburg State": "Frostburg St.",
  "Georgia Southwestern": "Ga. Southwestern",
  "Kentucky State": "Kentucky St.",
  "LeMoyne–Owen": "LeMoyne-Owen",
  "LeMoyne-Owen": "LeMoyne-Owen",
  "Lees–McRae": "Lees-McRae",
  "Lees-McRae": "Lees-McRae",
  "Maryville": "Maryville (MO)",
  "Metro State": "MSU Denver",
  "Midwestern State": "Midwestern St.",
  "Mississippi College": "Mississippi Col.",
  "Montana State Billings": "Mont. St. Billings",
  "Northern State": "Northern St.",
  "Northwestern Oklahoma State": "Northwestern Okla.",
  "Parkside": "Wis.-Parkside",
  "Pitt-Johnstown": "Pitt.-Johnstown",
  "Pittsburg State": "Pittsburg St.",
  "Salem": "Salem (WV)",
  "South Dakota School of Mines": "South Dakota Mines",
  "Southern Arkansas": "Southern Ark.",
  "Southern Connecticut State": "Southern Conn. St.",
  "Southern New Hampshire": "Southern N.H.",
  "Southwest Minnesota State": "Southwest Minn. St.",
  "Sul Ross State": "Sul Ross St.",
  "Texas A&M International": "Tex. A&M Int'l",
  "Texas–Permian Basin": "UT Permian Basin",
  "Texas-Permian Basin": "UT Permian Basin",
  "Truman State": "Truman St.",
  "USCB": "USC Beaufort", // not in DB yet
  "USC Beaufort": "USC Beaufort", // not in DB yet
  "West Texas A&M": "West Tex. A&M",
  "Western Colorado": "Western Colo.",
  "Western Oregon": "Western Ore.",
  "Westminster": "Westminster (UT)",
  "Wilmington": "Wilmington (DE)",
  "Winona State": "Winona St.",
  "Saint Michael's": "Saint Michael's",

  // Schools not in DB yet (no stats available)
  "Bloomfield": null,        // left D2
  "Life University": null,   // NAIA
  "South Plains College": null, // not D2
  "Jamestown": "Jamestown",  // D2 but no players in DB yet
  "Middle Georgia": "Middle Georgia", // D2 but no players in DB yet
  "Roosevelt": "Roosevelt",  // D2 but no players in DB yet
};

// Schools with no stats (skip matching, mark as no-stats)
const NO_STATS_SCHOOLS = new Set([
  "Jamestown", "Middle Georgia", "Roosevelt", "USC Beaufort",
]);

// Schools to skip entirely
const SKIP_SCHOOLS = new Set([
  "Bloomfield", "Life University", "South Plains College",
]);

function cleanStr(s) {
  if (!s) return "";
  return s
    .replace(/\xc2/g, "")     // strip bare Â (UTF-8 artifact)
    .replace(/\xa0/g, " ")    // non-breaking space -> space
    .replace(/\u2013/g, "-")  // em-dash -> hyphen
    .replace(/\s+/g, " ")     // collapse whitespace
    .trim();
}

function normalizeName(s) {
  return cleanStr(s).toLowerCase().replace(/[^a-z0-9]/g, "");
}

function resolveSchool(excelName) {
  const cleaned = cleanStr(excelName);
  if (SKIP_SCHOOLS.has(cleaned)) return { dbName: null, skip: true };
  if (cleaned in SCHOOL_ALIASES) {
    const mapped = SCHOOL_ALIASES[cleaned];
    return { dbName: mapped, skip: false, noStats: NO_STATS_SCHOOLS.has(mapped) };
  }
  // Direct match
  return { dbName: cleaned, skip: false, noStats: NO_STATS_SCHOOLS.has(cleaned) };
}

function splitName(fullName) {
  const cleaned = cleanStr(fullName);
  // Handle "Last, Jr." suffix cases
  const parts = cleaned.split(" ");
  if (parts.length < 2) return { first: cleaned, last: "" };
  const last = parts[parts.length - 1];
  const first = parts.slice(0, parts.length - 1).join(" ");
  return { first, last };
}

async function main() {
  // Load overrides file
  let overrides = [];
  try {
    const raw = await fs.readFile("scripts/transfer_overrides.json", "utf8");
    overrides = JSON.parse(raw);
    console.log(`Loaded ${overrides.length} manual overrides`);
  } catch {
    console.log("No transfer_overrides.json found - starting fresh");
    await fs.writeFile("scripts/transfer_overrides.json", JSON.stringify([], null, 2), "utf8");
  }

  const overrideMap = new Map();
  for (const o of overrides) {
    const key = `${normalizeName(o.transfer_name)}|${normalizeName(o.previous_school)}`;
    overrideMap.set(key, o.player_id);
  }

  // Load Excel
  const { default: XLSX } = await import("xlsx");
  const wb = XLSX.readFile("scripts/Book2.xlsx");
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1 }).slice(1);

  const transfers = rows
    .filter(r => r[0] && r[1])
    .map(r => ({
      division: cleanStr(String(r[0])),
      name: cleanStr(String(r[1])),
      previousSchool: cleanStr(String(r[2] || "")),
      newSchool: cleanStr(String(r[3] || "")),
    }))
    .filter(t => !SKIP_SCHOOLS.has(resolveSchool(t.previousSchool).dbName === null ? t.previousSchool : ""));

  console.log(`Loaded ${transfers.length} transfers from Excel`);

  // Connect to DB
  if (!process.env.POSTGRES_URL) {
    console.error("No POSTGRES_URL set");
    process.exit(1);
  }

  const pool = new Pool({
    connectionString: process.env.POSTGRES_URL,
    ssl: { rejectUnauthorized: false },
  });

  // Load all players from DB for mens-d1 and mens-d2
  const { rows: dbPlayers } = await pool.query(`
    SELECT player_id, first_name, last_name, team_name, division,
           position, year, games, starts, minutes,
           fgm, fga, tpm, tpa, ftm, fta,
           orb, drb, trb, ast, stl, blk, tov, pf, points
    FROM players
    WHERE division IN ('mens-d1', 'mens-d2')
  `);
  console.log(`Loaded ${dbPlayers.length} players from DB`);

  // Index players by normalized name+team for fast lookup
  const playerIndex = new Map();
  for (const p of dbPlayers) {
    const nameKey = `${normalizeName(p.first_name + p.last_name)}`;
    const teamKey = normalizeName(p.team_name);
    const key = `${nameKey}|${teamKey}`;
    if (!playerIndex.has(key)) playerIndex.set(key, []);
    playerIndex.get(key).push(p);
  }

  // Also index by name only (for fuzzy school matching)
  const nameOnlyIndex = new Map();
  for (const p of dbPlayers) {
    const nameKey = normalizeName(p.first_name + p.last_name);
    if (!nameOnlyIndex.has(nameKey)) nameOnlyIndex.set(nameKey, []);
    nameOnlyIndex.get(nameKey).push(p);
  }

  const results = [];
  const needsReview = [];

  for (const t of transfers) {
    const { dbName: prevDbName, skip, noStats } = resolveSchool(t.previousSchool);

    if (skip) continue;

    const transferDiv = t.division === "Men's D1" ? "D1 Men" : "D2 Men";
    const dbDivision = t.division === "Men's D1" ? "mens-d1" : "mens-d2";

    const base = {
      name: t.name,
      previousSchool: t.previousSchool,
      newSchool: t.newSchool || null,
      division: transferDiv,
    };

    // Check override first
    const overrideKey = `${normalizeName(t.name)}|${normalizeName(t.previousSchool)}`;
    if (overrideMap.has(overrideKey)) {
      const playerId = overrideMap.get(overrideKey);
      const player = dbPlayers.find(p => p.player_id === playerId);
      results.push({ ...base, matchStatus: "override", player: player || null });
      continue;
    }

    // No stats available for this school yet
    if (noStats || !prevDbName) {
      results.push({ ...base, matchStatus: "no_stats", player: null });
      needsReview.push({ ...base, issue: "School not in DB yet - no stats available" });
      continue;
    }

    // Try exact name + school match
    const nameKey = normalizeName(t.name.replace(/,.*/, "")); // strip suffixes like Jr.
    const teamKey = normalizeName(prevDbName);
    const exactMatches = playerIndex.get(`${nameKey}|${teamKey}`) || [];

    if (exactMatches.length === 1) {
      results.push({ ...base, matchStatus: "confident", player: exactMatches[0] });
      continue;
    }

    if (exactMatches.length > 1) {
      // Multiple players with same name at same school - very rare, flag for review
      results.push({ ...base, matchStatus: "fuzzy", player: exactMatches[0] });
      needsReview.push({ ...base, issue: `Multiple players named ${t.name} at ${prevDbName}`, candidates: exactMatches.map(p => p.player_id) });
      continue;
    }

    // Try name-only match (school name might differ)
    const nameOnlyMatches = nameOnlyIndex.get(nameKey) || [];
    const divMatches = nameOnlyMatches.filter(p => p.division === dbDivision);

    if (divMatches.length === 1) {
      results.push({ ...base, matchStatus: "fuzzy", player: divMatches[0] });
      needsReview.push({
        ...base,
        issue: `Name matched but school differs: Excel="${t.previousSchool}" DB="${divMatches[0].team_name}"`,
        suggestedPlayerId: divMatches[0].player_id,
      });
      continue;
    }

    if (divMatches.length > 1) {
      results.push({ ...base, matchStatus: "unmatched", player: null });
      needsReview.push({
        ...base,
        issue: `Multiple players named ${t.name} across division, school unclear`,
        candidates: divMatches.map(p => `${p.player_id} (${p.team_name})`),
      });
      continue;
    }

    // No match found
    results.push({ ...base, matchStatus: "unmatched", player: null });
    needsReview.push({ ...base, issue: `No player found named ${t.name} from ${t.previousSchool}` });
  }

  // Write to transfers table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS transfers (
      id SERIAL PRIMARY KEY,
      player_id TEXT,
      name TEXT NOT NULL,
      previous_school TEXT,
      new_school TEXT,
      division TEXT,
      match_status TEXT,
      team_name TEXT,
      position TEXT,
      year TEXT,
      games INTEGER,
      starts INTEGER,
      minutes NUMERIC,
      fgm INTEGER, fga INTEGER,
      tpm INTEGER, tpa INTEGER,
      ftm INTEGER, fta INTEGER,
      orb INTEGER, drb INTEGER, trb INTEGER,
      ast INTEGER, stl INTEGER, blk INTEGER,
      tov INTEGER, pf INTEGER, points INTEGER,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(name, previous_school)
    )
  `);

  // Clear and repopulate
  await pool.query("DELETE FROM transfers");

  let written = 0;
  for (const r of results) {
    const p = r.player;
    await pool.query(`
      INSERT INTO transfers (
        player_id, name, previous_school, new_school, division, match_status,
        team_name, position, year, games, starts, minutes,
        fgm, fga, tpm, tpa, ftm, fta,
        orb, drb, trb, ast, stl, blk, tov, pf, points
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27)
      ON CONFLICT (name, previous_school) DO UPDATE SET
        player_id = EXCLUDED.player_id,
        new_school = EXCLUDED.new_school,
        match_status = EXCLUDED.match_status,
        team_name = EXCLUDED.team_name,
        position = EXCLUDED.position,
        year = EXCLUDED.year,
        games = EXCLUDED.games, starts = EXCLUDED.starts, minutes = EXCLUDED.minutes,
        fgm = EXCLUDED.fgm, fga = EXCLUDED.fga,
        tpm = EXCLUDED.tpm, tpa = EXCLUDED.tpa,
        ftm = EXCLUDED.ftm, fta = EXCLUDED.fta,
        orb = EXCLUDED.orb, drb = EXCLUDED.drb, trb = EXCLUDED.trb,
        ast = EXCLUDED.ast, stl = EXCLUDED.stl, blk = EXCLUDED.blk,
        tov = EXCLUDED.tov, pf = EXCLUDED.pf, points = EXCLUDED.points,
        updated_at = CURRENT_TIMESTAMP
    `, [
      p?.player_id || null,
      r.name, r.previousSchool, r.newSchool, r.division, r.matchStatus,
      p?.team_name || null, p?.position || null, p?.year || null,
      p?.games || null, p?.starts || null, p?.minutes || null,
      p?.fgm || null, p?.fga || null,
      p?.tpm || null, p?.tpa || null,
      p?.ftm || null, p?.fta || null,
      p?.orb || null, p?.drb || null, p?.trb || null,
      p?.ast || null, p?.stl || null, p?.blk || null,
      p?.tov || null, p?.pf || null, p?.points || null,
    ]);
    written++;
  }

  console.log(`\n✅ Wrote ${written} transfers to database`);

  // Summary
  const confident = results.filter(r => r.matchStatus === "confident").length;
  const fuzzy = results.filter(r => r.matchStatus === "fuzzy").length;
  const unmatched = results.filter(r => r.matchStatus === "unmatched").length;
  const noStats = results.filter(r => r.matchStatus === "no_stats").length;
  const overrideCount = results.filter(r => r.matchStatus === "override").length;

  console.log(`\n📊 Match Summary:`);
  console.log(`   ✅ Confident: ${confident}`);
  console.log(`   ⚠️  Fuzzy:     ${fuzzy}`);
  console.log(`   ❓ Unmatched: ${unmatched}`);
  console.log(`   📭 No stats:  ${noStats}`);
  console.log(`   🔒 Override:  ${overrideCount}`);
  console.log(`   📋 Needs review: ${needsReview.length}`);

  // Write review file
  if (needsReview.length > 0) {
    await fs.writeFile(
      "scripts/transfer_review.json",
      JSON.stringify(needsReview, null, 2),
      "utf8"
    );
    console.log(`\n📝 Review file written to scripts/transfer_review.json`);
    console.log(`   For each fuzzy match, verify and add to scripts/transfer_overrides.json:`);
    console.log(`   { "transfer_name": "...", "previous_school": "...", "player_id": "..." }`);
  }

  await pool.end();
  console.log("\n🎉 Done!");
}

main().catch(e => {
  console.error("FATAL", e);
  process.exit(1);
});
