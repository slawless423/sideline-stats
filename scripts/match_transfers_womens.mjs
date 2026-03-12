import fs from "node:fs/promises";
import pg from "pg";

const { Pool } = pg;

// ===== SCHOOL NAME ALIAS MAP =====
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
  "Albany": "UAlbany",

  // D2
  "Alaska": "Alas. Anchorage",
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
  "Central Oklahoma": "Central Okla.",
  "Concordia Irvine": "CUI",
  "Delta State": "Delta St.",
  "District of Columbia": "Dist. Columbia",
  "Elizabeth City State": "Elizabeth City St.",
  "Emporia State": "Emporia St.",
  "Frostburg State": "Frostburg St.",
  "Georgia Southwestern": "Ga. Southwestern",
  "Indianapolis": "UIndy",
  "Kentucky State": "Kentucky St.",
  "Kentucky Wesleyan": "Ky. Wesleyan",
  "Lake Superior State": "Lake Superior St.",
  "LeMoyne–Owen": "LeMoyne-Owen",
  "LeMoyne-Owen": "LeMoyne-Owen",
  "Lees–McRae": "Lees-McRae",
  "Lees-McRae": "Lees-McRae",
  "Maryville": "Maryville (MO)",
  "Metro State": "MSU Denver",
  "Midwestern State": "Midwestern St.",
  "Mississippi College": "Mississippi Col.",
  "Montana State Billings": "Mont. St. Billings",
  "Northeastern State": "Northeastern St.",
  "Northern State": "Northern St.",
  "Northwestern Oklahoma State": "Northwestern Okla.",
  "Parkside": "Wis.-Parkside",
  "Pitt-Johnstown": "Pitt.-Johnstown",
  "Pittsburg State": "Pittsburg St.",
  "Saginaw Valley State": "Saginaw Valley",
  "Salem": "Salem (WV)",
  "Savannah State": "Savannah St.",
  "South Dakota School of Mines": "South Dakota Mines",
  "Southern Arkansas": "Southern Ark.",
  "Southern Connecticut State": "Southern Conn. St.",
  "Southern New Hampshire": "Southern N.H.",
  "Southwest Minnesota State": "Southwest Minn. St.",
  "Sul Ross State": "Sul Ross St.",
  "Texas A&M International": "Tex. A&M Int'l",
  "Texas A&M-Kingsville": "Tex. A&M-Kingsville",
  "Texas–Permian Basin": "UT Permian Basin",
  "Texas-Permian Basin": "UT Permian Basin",
  "Truman State": "Truman St.",
  "USCB": "USC Beaufort",
  "USC Beaufort": "USC Beaufort",
  "Wayne State (MI)": "Wayne St. (MI)",
  "West Texas A&M": "West Tex. A&M",
  "West Virginia State": "West Virginia St.",
  "West Virginia Wesleyan": "West Va. Wesleyan",
  "Western Colorado": "Western Colo.",
  "Western Oregon": "Western Ore.",
  "Western Washington": "Western Wash.",
  "Westminster": "Westminster (UT)",
  "Wilmington": "Wilmington (DE)",
  "Winona State": "Winona St.",
  "Saint Michael's": "Saint Michael's",
};

const NO_STATS_SCHOOLS = new Set([]);

const SKIP_SCHOOLS = new Set([]);

function cleanStr(s) {
  if (!s) return "";
  return s
    .normalize("NFC")
    .replace(/\xc2/g, "")
    .replace(/\xa0/g, " ")
    .replace(/\u2013/g, "-")
    .replace(/\u2014/g, "-")
    .replace(/\s+/g, " ")
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
  return { dbName: cleaned, skip: false, noStats: NO_STATS_SCHOOLS.has(cleaned) };
}

function formatHeight(inches) {
  if (inches === null || inches === undefined) return null;
  const n = Number(inches);
  if (isNaN(n) || n <= 0) return null;
  const feet = Math.floor(n / 12);
  const remaining = n % 12;
  return `${feet}'${remaining}"`;
}

async function main() {
  let overrides = [];
  try {
    const raw = await fs.readFile("scripts/transfer_overrides_womens.json", "utf8");
    overrides = JSON.parse(raw);
    console.log(`Loaded ${overrides.length} manual overrides`);
  } catch {
    console.log("No transfer_overrides_womens.json found - starting fresh");
    await fs.writeFile("scripts/transfer_overrides_womens.json", JSON.stringify([], null, 2), "utf8");
  }

  const overrideMap = new Map();
  for (const o of overrides) {
    const key = `${normalizeName(o.transfer_name)}|${normalizeName(o.previous_school)}`;
    overrideMap.set(key, o.player_id);
  }

  const { default: XLSX } = await import("xlsx");
  const wb = XLSX.readFile("scripts/Women.xlsx", { codepage: 65001 });
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
    .filter(t => {
      const { skip } = resolveSchool(t.previousSchool);
      return !skip;
    });

  console.log(`Loaded ${transfers.length} transfers from Excel`);

  if (!process.env.POSTGRES_URL) {
    console.error("No POSTGRES_URL set");
    process.exit(1);
  }

  const pool = new Pool({
    connectionString: process.env.POSTGRES_URL,
    ssl: { rejectUnauthorized: false },
  });

  const { rows: dbPlayers } = await pool.query(`
    SELECT player_id, first_name, last_name, team_name, division,
           position, year, height, games, starts, minutes,
           fgm, fga, tpm, tpa, ftm, fta,
           orb, drb, trb, ast, stl, blk, tov, pf, points
    FROM players
    WHERE division IN ('womens-d1', 'womens-d2')
  `);
  console.log(`Loaded ${dbPlayers.length} players from DB`);

  const playerIndex = new Map();
  for (const p of dbPlayers) {
    const nameKey = normalizeName(p.first_name + p.last_name);
    const teamKey = normalizeName(p.team_name);
    const key = `${nameKey}|${teamKey}`;
    if (!playerIndex.has(key)) playerIndex.set(key, []);
    playerIndex.get(key).push(p);
  }

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

    const transferDiv = t.division === "Women's D1" ? "D1 Women" : "D2 Women";
    const dbDivision = t.division === "Women's D1" ? "womens-d1" : "womens-d2";

    const base = {
      name: t.name,
      previousSchool: cleanStr(t.previousSchool),
      newSchool: t.newSchool ? cleanStr(t.newSchool) : null,
      division: transferDiv,
    };

    const overrideKey = `${normalizeName(t.name)}|${normalizeName(t.previousSchool)}`;
    if (overrideMap.has(overrideKey)) {
      const playerId = overrideMap.get(overrideKey);
      const player = dbPlayers.find(p => p.player_id === playerId);
      const displayName = player ? `${player.first_name} ${player.last_name}` : t.name;
      results.push({ ...base, name: displayName, previousSchool: player?.team_name || base.previousSchool, matchStatus: "override", player: player || null });
      continue;
    }

    if (noStats || !prevDbName) {
      results.push({ ...base, matchStatus: "no_stats", player: null });
      needsReview.push({ ...base, issue: "School not in DB yet - no stats available" });
      continue;
    }

    const nameKey = normalizeName(t.name.replace(/,.*/, ""));
    const teamKey = normalizeName(prevDbName);
    const exactMatches = playerIndex.get(`${nameKey}|${teamKey}`) || [];

    if (exactMatches.length === 1) {
      const player = exactMatches[0];
      const displayName = `${player.first_name} ${player.last_name}`;
      results.push({ ...base, name: displayName, previousSchool: player.team_name, matchStatus: "confident", player });
      continue;
    }

    if (exactMatches.length > 1) {
      const player = exactMatches[0];
      const displayName = `${player.first_name} ${player.last_name}`;
      results.push({ ...base, name: displayName, previousSchool: player.team_name, matchStatus: "fuzzy", player });
      needsReview.push({ ...base, issue: `Multiple players named ${t.name} at ${prevDbName}`, candidates: exactMatches.map(p => p.player_id) });
      continue;
    }

    const nameOnlyMatches = nameOnlyIndex.get(nameKey) || [];
    const divMatches = nameOnlyMatches.filter(p => p.division === dbDivision);

    if (divMatches.length === 1) {
      const player = divMatches[0];
      const displayName = `${player.first_name} ${player.last_name}`;
      results.push({ ...base, name: displayName, previousSchool: player.team_name, matchStatus: "fuzzy", player });
      needsReview.push({
        ...base,
        issue: `Name matched but school differs: Excel="${t.previousSchool}" DB="${player.team_name}"`,
        suggestedPlayerId: player.player_id,
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

    results.push({ ...base, matchStatus: "unmatched", player: null });
    needsReview.push({ ...base, issue: `No player found named ${t.name} from ${t.previousSchool}` });
  }

  // Write to womens_transfers table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS womens_transfers (
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
      height TEXT,
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

  await pool.query("DELETE FROM womens_transfers");

  let written = 0;
  for (const r of results) {
    const p = r.player;
    await pool.query(`
      INSERT INTO womens_transfers (
        player_id, name, previous_school, new_school, division, match_status,
        team_name, position, year, height, games, starts, minutes,
        fgm, fga, tpm, tpa, ftm, fta,
        orb, drb, trb, ast, stl, blk, tov, pf, points
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28)
      ON CONFLICT (name, previous_school) DO UPDATE SET
        player_id = EXCLUDED.player_id,
        new_school = EXCLUDED.new_school,
        match_status = EXCLUDED.match_status,
        team_name = EXCLUDED.team_name,
        position = EXCLUDED.position,
        year = EXCLUDED.year,
        height = EXCLUDED.height,
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
      p?.height ? formatHeight(p.height) : null,
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

  console.log(`\n✅ Wrote ${written} transfers to womens_transfers table`);

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

  if (needsReview.length > 0) {
    await fs.writeFile(
      "scripts/transfer_review_womens.json",
      JSON.stringify(needsReview, null, 2),
      "utf8"
    );
    console.log(`\n📝 Review file written to scripts/transfer_review_womens.json`);
    console.log(`   For each fuzzy match, verify and add to scripts/transfer_overrides_womens.json:`);
    console.log(`   { "transfer_name": "...", "previous_school": "...", "player_id": "..." }`);
  }

  await pool.end();
  console.log("\n🎉 Done!");
}

main().catch(e => {
  console.error("FATAL", e);
  process.exit(1);
});
