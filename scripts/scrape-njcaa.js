/**
 * NJCAA D1 Basketball Stats Scraper
 *
 * Usage:
 *   node scrape-njcaa.js --gender womens
 *   node scrape-njcaa.js --gender mens
 *
 * Creates two tables per gender:
 *   njcaa_{gender}_d1_players     — one row per player
 *   njcaa_{gender}_d1_team_totals — team + opponent totals per school (for advanced stat formulas)
 *
 * Requires: puppeteer, pg, dotenv
 * Env var:  DATABASE_URL
 */

const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());
const { Pool } = require('pg');
require('dotenv').config();

// ── CLI args ──────────────────────────────────────────────────────────────────
const argList = process.argv.slice(2);
const getArg = (name) => {
  const i = argList.indexOf(`--${name}`);
  return i !== -1 ? argList[i + 1] : null;
};

const GENDER = getArg('gender');
if (!GENDER || !['mens', 'womens'].includes(GENDER)) {
  console.error('Usage: node scrape-njcaa.js --gender mens|womens');
  process.exit(1);
}

const SPORT_SLUG    = GENDER === 'womens' ? 'wbkb' : 'mbkb';
const SEASON        = '2025-26';
const DIVISION      = 'div1';
const BASE          = 'https://njcaastats.prestosports.com';
const TEAMS_URL     = `${BASE}/sports/${SPORT_SLUG}/teams-page`;
const DELAY_MS      = 1500;

const TABLE_PLAYERS = `njcaa_${GENDER}_d1_players`;
const TABLE_TOTALS  = `njcaa_${GENDER}_d1_team_totals`;

// ── DB ────────────────────────────────────────────────────────────────────────
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

const sleep = ms => new Promise(r => setTimeout(r, ms));

// ── ENSURE TABLES ─────────────────────────────────────────────────────────────
async function ensureTables() {
  // Player stats table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ${TABLE_PLAYERS} (
      id          SERIAL PRIMARY KEY,
      player_id   TEXT NOT NULL UNIQUE,
      team_slug   TEXT NOT NULL,
      team_name   TEXT NOT NULL,
      season      TEXT NOT NULL,
      jersey      TEXT,
      name        TEXT NOT NULL,
      gp          INTEGER,
      gs          INTEGER,
      min         INTEGER,
      min_avg     NUMERIC(5,1),
      fg          INTEGER,
      fga         INTEGER,
      fg_pct      NUMERIC(5,1),
      fg3         INTEGER,
      fg3a        INTEGER,
      fg3_pct     NUMERIC(5,1),
      ft          INTEGER,
      fta         INTEGER,
      ft_pct      NUMERIC(5,1),
      reb_off     INTEGER,
      reb_def     INTEGER,
      reb_tot     INTEGER,
      reb_avg     NUMERIC(5,1),
      pf          INTEGER,
      dq          INTEGER,
      ast         INTEGER,
      ast_avg     NUMERIC(5,1),
      to_stat     INTEGER,
      to_avg      NUMERIC(5,1),
      ast_to      NUMERIC(5,1),
      blk         INTEGER,
      blk_avg     NUMERIC(5,1),
      stl         INTEGER,
      stl_avg     NUMERIC(5,1),
      pts         INTEGER,
      pts_avg     NUMERIC(5,1),
      updated_at  TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  // Team totals table — stores both team and opponent rows per school
  // These are never displayed; they exist solely to power advanced stat formulas
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ${TABLE_TOTALS} (
      id          SERIAL PRIMARY KEY,
      team_slug   TEXT NOT NULL,
      team_name   TEXT NOT NULL,
      season      TEXT NOT NULL,
      row_type    TEXT NOT NULL CHECK (row_type IN ('team', 'opponent')),
      gp          INTEGER,
      min         INTEGER,
      fg          INTEGER,
      fga         INTEGER,
      fg_pct      NUMERIC(5,1),
      fg3         INTEGER,
      fg3a        INTEGER,
      fg3_pct     NUMERIC(5,1),
      ft          INTEGER,
      fta         INTEGER,
      ft_pct      NUMERIC(5,1),
      reb_off     INTEGER,
      reb_def     INTEGER,
      reb_tot     INTEGER,
      pf          INTEGER,
      dq          INTEGER,
      ast         INTEGER,
      to_stat     INTEGER,
      ast_to      NUMERIC(5,1),
      blk         INTEGER,
      stl         INTEGER,
      pts         INTEGER,
      updated_at  TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE (team_slug, season, row_type)
    );
  `);

  console.log(`✓ Tables ready: ${TABLE_PLAYERS}, ${TABLE_TOTALS}`);
}

// ── TEAM LISTS (hardcoded to avoid JS-rendered teams page in CI) ─────────────
const WOMENS_D1_TEAMS = [
  { slug: 'albanytechnicalcollege', name: 'Albany Technical College' },
  { slug: 'alleganycollegeofmaryland', name: 'Allegany College of Maryland' },
  { slug: 'andrewcollege', name: 'Andrew College' },
  { slug: 'angelinacollege', name: 'Angelina College' },
  { slug: 'arizonawesterncollege', name: 'Arizona Western College' },
  { slug: 'bartoncommunitycollege', name: 'Barton Community College' },
  { slug: 'batonrougecommunitycollege', name: 'Baton Rouge Community College' },
  { slug: 'bishopstatecommunitycollege', name: 'Bishop State Community College' },
  { slug: 'blinncollege', name: 'Blinn College' },
  { slug: 'butlercommunitycollegeks', name: 'Butler Community College - KS' },
  { slug: 'calhouncommunitycollege', name: 'Calhoun Community College' },
  { slug: 'caspercollege', name: 'Casper College' },
  { slug: 'centralarizonacollege', name: 'Central Arizona College' },
  { slug: 'centralgeorgiatechnicalcollege', name: 'Central Georgia Technical College' },
  { slug: 'centralwyomingcollege', name: 'Central Wyoming College' },
  { slug: 'chattanoogastatecommunitycollege', name: 'Chattanooga State Community College' },
  { slug: 'chipolacollege', name: 'Chipola  College' },
  { slug: 'ciscocollege', name: 'Cisco College' },
  { slug: 'clarendoncollege', name: 'Clarendon College' },
  { slug: 'clevelandstatecommunitycollege', name: 'Cleveland State Community College' },
  { slug: 'cloudcountycommunitycollege', name: 'Cloud County Community College' },
  { slug: 'coahomacommunitycollege', name: 'Coahoma Community College' },
  { slug: 'coastalalabamasouth', name: 'Coastal Alabama - South' },
  { slug: 'coastalbendcollege', name: 'Coastal Bend College' },
  { slug: 'cochisecollege', name: 'Cochise College' },
  { slug: 'coffeyvillecommunitycollege', name: 'Coffeyville Community College' },
  { slug: 'colbycommunitycollege', name: 'Colby Community College' },
  { slug: 'collegeofsouthernidaho', name: 'College of Southern Idaho' },
  { slug: 'collegeofsouthernnevada', name: 'College of Southern Nevada' },
  { slug: 'collincountycommunitycollege', name: 'Collin County Community College' },
  { slug: 'coloradonorthwesterncommunitycollege', name: 'Colorado Northwestern Community College' },
  { slug: 'columbiastatecommunitycollege', name: 'Columbia State Community College' },
  { slug: 'communitychristiancollege', name: 'Community Christian College' },
  { slug: 'connorsstatecollege', name: 'Connors State College' },
  { slug: 'copiahlincolncommunitycollege', name: 'Copiah-Lincoln Community College' },
  { slug: 'cowleycountycommunitycollege', name: 'Cowley County Community College' },
  { slug: 'crowdercollege', name: 'Crowder College' },
  { slug: 'dawsoncommunitycollege', name: 'Dawson Community College' },
  { slug: 'daytonastatecollege', name: 'Daytona State College' },
  { slug: 'delgadocommunitycollege', name: 'Delgado Community College' },
  { slug: 'denmarktechnicalcollege', name: 'Denmark Technical College' },
  { slug: 'dodgecitycommunitycollege', name: 'Dodge City Community College' },
  { slug: 'dyersburgstatecommunitycollege', name: 'Dyersburg State Community College' },
  { slug: 'eastcentralcommunitycollege', name: 'East Central Community College' },
  { slug: 'eastgeorgiastatecollege', name: 'East Georgia State College' },
  { slug: 'eastmississippicommunitycollege', name: 'East Mississippi Community College' },
  { slug: 'easternarizonacollege', name: 'Eastern Arizona College' },
  { slug: 'easternfloridastatecollege', name: 'Eastern Florida State College' },
  { slug: 'easternoklahomastatecollege', name: 'Eastern Oklahoma State College' },
  { slug: 'easternwyomingcollege', name: 'Eastern Wyoming College' },
  { slug: 'floridasouthwesternstatecollege', name: 'Florida SouthWestern State College' },
  { slug: 'forthaystechnorthwest', name: 'Fort Hays Tech Northwest' },
  { slug: 'frankphillipscollege', name: 'Frank Phillips College' },
  { slug: 'gadsdenstatecommunitycollege', name: 'Gadsden State Community College' },
  { slug: 'gardencitycommunitycollege', name: 'Garden City Community College' },
  { slug: 'gillettecollege', name: 'Gillette College' },
  { slug: 'graysoncollege', name: 'Grayson College' },
  { slug: 'gulfcoaststatecollege', name: 'Gulf Coast State College' },
  { slug: 'harfordcommunitycollege', name: 'Harford Community College' },
  { slug: 'harrystrumancollege', name: 'Harry S. Truman College' },
  { slug: 'highlandcommunitycollegeillinois', name: 'Highland Community College - Illinois' },
  { slug: 'hillcollege', name: 'Hill College' },
  { slug: 'hillsboroughcommunitycollege', name: 'Hillsborough Community College' },
  { slug: 'hindscommunitycollege', name: 'Hinds Community College' },
  { slug: 'holmescommunitycollege', name: 'Holmes Community College' },
  { slug: 'howardcollege', name: 'Howard College' },
  { slug: 'hutchinsoncommunitycollege', name: 'Hutchinson Community College' },
  { slug: 'independencecommunitycollege', name: 'Independence Community College' },
  { slug: 'itawambacommunitycollege', name: 'Itawamba Community College' },
  { slug: 'jacksonstatecommunitycollege', name: 'Jackson State Community College' },
  { slug: 'johnalogancollege', name: 'John A. Logan College' },
  { slug: 'jonescollege', name: 'Jones College' },
  { slug: 'kennedykingcollege', name: 'Kennedy-King College' },
  { slug: 'kilgorecollege', name: 'Kilgore College' },
  { slug: 'lakeregionstatecollegend', name: 'Lake Region State College - ND' },
  { slug: 'lamarcommunitycollege', name: 'Lamar Community College' },
  { slug: 'laramiecountycommunitycollege', name: 'Laramie County Community College' },
  { slug: 'lawsonstatecommunitycollege', name: 'Lawson State Community College' },
  { slug: 'lincolntrailcollege', name: 'Lincoln Trail College' },
  { slug: 'louisianastateuniversityeunice', name: 'Louisiana State University Eunice' },
  { slug: 'malcolmxcollege', name: 'Malcolm X College' },
  { slug: 'mccookcommunitycollege', name: 'McCook Community College' },
  { slug: 'mclennancommunitycollege', name: 'McLennan Community College' },
  { slug: 'meridiancommunitycollege', name: 'Meridian Community College' },
  { slug: 'miamidadecollege', name: 'Miami Dade College' },
  { slug: 'midlandcollege', name: 'Midland College' },
  { slug: 'milescommunitycollege', name: 'Miles Community College' },
  { slug: 'mineralareacollege', name: 'Mineral Area College' },
  { slug: 'mississippideltacommunitycollege', name: 'Mississippi Delta Community College' },
  { slug: 'mississippigulfcoastcommunitycollege', name: 'Mississippi Gulf Coast Community College' },
  { slug: 'moberlyareacommunitycollege', name: 'Moberly Area Community College' },
  { slug: 'monroeuniversity', name: 'Monroe University' },
  { slug: 'motlowstatecommunitycollege', name: 'Motlow State Community College' },
  { slug: 'murraystatecollege', name: 'Murray State College' },
  { slug: 'newmexicojuniorcollege', name: 'New Mexico Junior College' },
  { slug: 'northdakotastatecollegeofscience', name: 'North Dakota State College of Science' },
  { slug: 'northidahocollege', name: 'North Idaho College' },
  { slug: 'northplattecommunitycollege', name: 'North Platte Community College' },
  { slug: 'northeastmississippicommunitycollege', name: 'Northeast Mississippi Community College' },
  { slug: 'northeasternjuniorcollege', name: 'Northeastern Junior College' },
  { slug: 'northeasternoklahomaamcollege', name: 'Northeastern Oklahoma AM College' },
  { slug: 'northernoklahomacollegeenid', name: 'Northern Oklahoma College-Enid' },
  { slug: 'northernoklahomacollegetonkawa', name: 'Northern Oklahoma College-Tonkawa' },
  { slug: 'northwestcollege', name: 'Northwest College' },
  { slug: 'northwestfloridastatecollege', name: 'Northwest Florida State College' },
  { slug: 'northwestmississippicommunitycollege', name: 'Northwest Mississippi Community College' },
  { slug: 'odessacollege', name: 'Odessa College' },
  { slug: 'oliveharveycollege', name: 'Olive-Harvey College' },
  { slug: 'olneycentralcollege', name: 'Olney Central College' },
  { slug: 'oterocollege', name: 'Otero College' },
  { slug: 'panolacollege', name: 'Panola College' },
  { slug: 'parisjuniorcollege', name: 'Paris Junior College' },
  { slug: 'pearlrivercommunitycollege', name: 'Pearl River Community College' },
  { slug: 'pellissippistatecommunitycollege', name: 'Pellissippi State Community College' },
  { slug: 'pensacolastatecollege', name: 'Pensacola State College' },
  { slug: 'prattcommunitycollege', name: 'Pratt Community College' },
  { slug: 'rangercollege', name: 'Ranger College' },
  { slug: 'redlandscommunitycollege', name: 'Redlands Community College' },
  { slug: 'rendlakecollege', name: 'Rend Lake College' },
  { slug: 'richardjdaleycollege', name: 'Richard J. Daley College' },
  { slug: 'roanestatecommunitycollege', name: 'Roane State Community College' },
  { slug: 'saltlakecommunitycollege', name: 'Salt Lake Community College' },
  { slug: 'santafecollege', name: 'Santa Fe College' },
  { slug: 'saukvalleycommunitycollege', name: 'Sauk Valley Community College' },
  { slug: 'seminolestatecollege', name: 'Seminole State College' },
  { slug: 'sewardcounty', name: 'Seward County' },
  { slug: 'shawneecommunitycollege', name: 'Shawnee Community College' },
  { slug: 'sheltonstatecommunitycollege', name: 'Shelton State Community College' },
  { slug: 'snowcollege', name: 'Snow College' },
  { slug: 'southgeorgiatechnicalcollege', name: 'South Georgia Technical College' },
  { slug: 'southplainscollege', name: 'South Plains College' },
  { slug: 'southeastcommunitycollege', name: 'Southeast Community College' },
  { slug: 'southerncrescenttechnicalcollege', name: 'Southern Crescent Technical College' },
  { slug: 'southernunionstatecommunitycollege', name: 'Southern Union State Community College' },
  { slug: 'southernuniversityshreveport', name: 'Southern University-Shreveport' },
  { slug: 'southwestmississippicommunitycollege', name: 'Southwest Mississippi Community College' },
  { slug: 'southwesttennesseecommunitycollege', name: 'Southwest Tennessee Community College' },
  { slug: 'southwesternchristiancollege', name: 'Southwestern Christian College' },
  { slug: 'southwesternillinoiscollege', name: 'Southwestern Illinois College' },
  { slug: 'stpetersburgcollege', name: 'St. Petersburg College' },
  { slug: 'statefaircommunitycollege', name: 'State Fair Community College' },
  { slug: 'tallahasseestatecollege', name: 'Tallahassee State College' },
  { slug: 'templecollege', name: 'Temple College' },
  { slug: 'threeriverscollegemo', name: 'Three Rivers College - MO' },
  { slug: 'trinidadstatecollege', name: 'Trinidad State College' },
  { slug: 'trinityvalleycommunitycollege', name: 'Trinity Valley Community College' },
  { slug: 'tritoncollege', name: 'Triton College' },
  { slug: 'tylerjuniorcollege', name: 'Tyler Junior College' },
  { slug: 'uscsalkehatchie', name: 'USC Salkehatchie' },
  { slug: 'utahstateeastern', name: 'Utah State Eastern' },
  { slug: 'vincennesuniversity', name: 'Vincennes University' },
  { slug: 'volunteerstatecommunitycollege', name: 'Volunteer State Community College' },
  { slug: 'wabashvalleycollege', name: 'Wabash Valley College' },
  { slug: 'wallacestatecommunitycollegehancevil', name: 'Wallace State Community College-Hanceville' },
  { slug: 'waltersstatecommunitycollege', name: 'Walters State Community College' },
  { slug: 'weatherfordcollege', name: 'Weatherford College' },
  { slug: 'westernnebraskacommunitycollege', name: 'Western Nebraska Community College' },
  { slug: 'westernoklahomastatecollege', name: 'Western Oklahoma State College' },
  { slug: 'westerntexascollege', name: 'Western Texas College' },
  { slug: 'westernwyomingcommunitycollege', name: 'Western Wyoming Community College' },
  { slug: 'wilburwrightcollege', name: 'Wilbur Wright College' },
  { slug: 'willistonstatecollege', name: 'Williston State College' },
  { slug: 'yavapaicollege', name: 'Yavapai College' },
];

const MENS_D1_TEAMS = [
  { slug: 'albanytechnicalcollege', name: 'Albany Technical College' },
  { slug: 'alleganycollegeofmaryland', name: 'Allegany College of Maryland' },
  { slug: 'andrewcollege', name: 'Andrew College' },
  { slug: 'angelinacollege', name: 'Angelina College' },
  { slug: 'arizonawesterncollege', name: 'Arizona Western College' },
  { slug: 'baltimorecitycommunitycollege', name: 'Baltimore City Community College' },
  { slug: 'bartoncommunitycollege', name: 'Barton Community College' },
  { slug: 'batonrougecommunitycollege', name: 'Baton Rouge Community College' },
  { slug: 'bishopstatecommunitycollege', name: 'Bishop State Community College' },
  { slug: 'blinncollege', name: 'Blinn College' },
  { slug: 'bossierparishcommunitycollege', name: 'Bossier Parish Community College' },
  { slug: 'brunswickcommunitycollege', name: 'Brunswick Community College' },
  { slug: 'butlercommunitycollegeks', name: 'Butler Community College - KS' },
  { slug: 'caldwellcommunitycollegetechnicali', name: 'Caldwell Community College & Technical Institute' },
  { slug: 'calhouncommunitycollege', name: 'Calhoun Community College' },
  { slug: 'capefearcommunitycollege', name: 'Cape Fear Community College' },
  { slug: 'caspercollege', name: 'Casper College' },
  { slug: 'centralarizonacollege', name: 'Central Arizona College' },
  { slug: 'centralgeorgiatechnicalcollege', name: 'Central Georgia Technical College' },
  { slug: 'centralwyomingcollege', name: 'Central Wyoming College' },
  { slug: 'chattanoogastatecommunitycollege', name: 'Chattanooga State Community College' },
  { slug: 'chipolacollege', name: 'Chipola  College' },
  { slug: 'clarendoncollege', name: 'Clarendon College' },
  { slug: 'clevelandstatecommunitycollege', name: 'Cleveland State Community College' },
  { slug: 'cloudcountycommunitycollege', name: 'Cloud County Community College' },
  { slug: 'coahomacommunitycollege', name: 'Coahoma Community College' },
  { slug: 'coastalalabamasouth', name: 'Coastal Alabama - South' },
  { slug: 'coastalbendcollege', name: 'Coastal Bend College' },
  { slug: 'cochisecollege', name: 'Cochise College' },
  { slug: 'coffeyvillecommunitycollege', name: 'Coffeyville Community College' },
  { slug: 'colbycommunitycollege', name: 'Colby Community College' },
  { slug: 'collegeofsouthernidaho', name: 'College of Southern Idaho' },
  { slug: 'collegeofsouthernnevada', name: 'College of Southern Nevada' },
  { slug: 'collincountycommunitycollege', name: 'Collin County Community College' },
  { slug: 'coloradonorthwesterncommunitycollege', name: 'Colorado Northwestern Community College' },
  { slug: 'columbiastatecommunitycollege', name: 'Columbia State Community College' },
  { slug: 'communitychristiancollege', name: 'Community Christian College' },
  { slug: 'connorsstatecollege', name: 'Connors State College' },
  { slug: 'copiahlincolncommunitycollege', name: 'Copiah-Lincoln Community College' },
  { slug: 'cowleycountycommunitycollege', name: 'Cowley County Community College' },
  { slug: 'dawsoncommunitycollege', name: 'Dawson Community College' },
  { slug: 'daytonastatecollege', name: 'Daytona State College' },
  { slug: 'delgadocommunitycollege', name: 'Delgado Community College' },
  { slug: 'denmarktechnicalcollege', name: 'Denmark Technical College' },
  { slug: 'dodgecitycommunitycollege', name: 'Dodge City Community College' },
  { slug: 'dyersburgstatecommunitycollege', name: 'Dyersburg State Community College' },
  { slug: 'eastcentralcommunitycollege', name: 'East Central Community College' },
  { slug: 'eastgeorgiastatecollege', name: 'East Georgia State College' },
  { slug: 'eastmississippicommunitycollege', name: 'East Mississippi Community College' },
  { slug: 'easternarizonacollege', name: 'Eastern Arizona College' },
  { slug: 'easternfloridastatecollege', name: 'Eastern Florida State College' },
  { slug: 'easternoklahomastatecollege', name: 'Eastern Oklahoma State College' },
  { slug: 'easternwyomingcollege', name: 'Eastern Wyoming College' },
  { slug: 'floridasouthwesternstatecollege', name: 'Florida SouthWestern State College' },
  { slug: 'forthaystechnorthwest', name: 'Fort Hays Tech Northwest' },
  { slug: 'frankphillipscollege', name: 'Frank Phillips College' },
  { slug: 'gadsdenstatecommunitycollege', name: 'Gadsden State Community College' },
  { slug: 'gardencitycommunitycollege', name: 'Garden City Community College' },
  { slug: 'gastoncollege', name: 'Gaston College' },
  { slug: 'georgiahighlandscollege', name: 'Georgia Highlands College' },
  { slug: 'gillettecollege', name: 'Gillette College' },
  { slug: 'gordonstatecollege', name: 'Gordon State College' },
  { slug: 'graysoncollege', name: 'Grayson College' },
  { slug: 'gulfcoaststatecollege', name: 'Gulf Coast State College' },
  { slug: 'hagerstowncommunitycollege', name: 'Hagerstown Community College' },
  { slug: 'harcumcollege', name: 'Harcum College' },
  { slug: 'harfordcommunitycollege', name: 'Harford Community College' },
  { slug: 'harrystrumancollege', name: 'Harry S. Truman College' },
  { slug: 'highlandcommunitycollegeillinois', name: 'Highland Community College - Illinois' },
  { slug: 'hillcollege', name: 'Hill College' },
  { slug: 'hillsboroughcommunitycollege', name: 'Hillsborough Community College' },
  { slug: 'hindscommunitycollege', name: 'Hinds Community College' },
  { slug: 'holmescommunitycollege', name: 'Holmes Community College' },
  { slug: 'howardcollege', name: 'Howard College' },
  { slug: 'hutchinsoncommunitycollege', name: 'Hutchinson Community College' },
  { slug: 'independencecommunitycollege', name: 'Independence Community College' },
  { slug: 'indianhillscommunitycollege', name: 'Indian Hills Community College' },
  { slug: 'indianriverstatecollege', name: 'Indian River State College' },
  { slug: 'itawambacommunitycollege', name: 'Itawamba Community College' },
  { slug: 'jacksonstatecommunitycollege', name: 'Jackson State Community College' },
  { slug: 'johnalogancollege', name: 'John A. Logan College' },
  { slug: 'jonescollege', name: 'Jones College' },
  { slug: 'kankakeecommunitycollege', name: 'Kankakee Community College' },
  { slug: 'kaskaskiacollege', name: 'Kaskaskia College' },
  { slug: 'kennedykingcollege', name: 'Kennedy-King College' },
  { slug: 'kilgorecollege', name: 'Kilgore College' },
  { slug: 'lakelandcollege', name: 'Lake Land College' },
  { slug: 'lakeregionstatecollegend', name: 'Lake Region State College - ND' },
  { slug: 'lamarcommunitycollege', name: 'Lamar Community College' },
  { slug: 'lamarstatecollegeportarthur', name: 'Lamar State College - Port Arthur' },
  { slug: 'laramiecountycommunitycollege', name: 'Laramie County Community College' },
  { slug: 'lawsonstatecommunitycollege', name: 'Lawson State Community College' },
  { slug: 'leecollege', name: 'Lee College' },
  { slug: 'lincolntrailcollege', name: 'Lincoln Trail College' },
  { slug: 'malcolmxcollege', name: 'Malcolm X College' },
  { slug: 'marshalltowncc', name: 'Marshalltown CC' },
  { slug: 'mccookcommunitycollege', name: 'McCook Community College' },
  { slug: 'mclennancommunitycollege', name: 'McLennan Community College' },
  { slug: 'meridiancommunitycollege', name: 'Meridian Community College' },
  { slug: 'miamidadecollege', name: 'Miami Dade College' },
  { slug: 'midlandcollege', name: 'Midland College' },
  { slug: 'milescommunitycollege', name: 'Miles Community College' },
  { slug: 'mineralareacollege', name: 'Mineral Area College' },
  { slug: 'mississippideltacommunitycollege', name: 'Mississippi Delta Community College' },
  { slug: 'mississippigulfcoastcommunitycollege', name: 'Mississippi Gulf Coast Community College' },
  { slug: 'missouristateuniversitywestplains', name: 'Missouri State University - West Plains' },
  { slug: 'moberlyareacommunitycollege', name: 'Moberly Area Community College' },
  { slug: 'monroeuniversity', name: 'Monroe University' },
  { slug: 'motlowstatecommunitycollege', name: 'Motlow State Community College' },
  { slug: 'murraystatecollege', name: 'Murray State College' },
  { slug: 'navarrocollege', name: 'Navarro College' },
  { slug: 'newmexicojuniorcollege', name: 'New Mexico Junior College' },
  { slug: 'newmexicomilitaryinstitute', name: 'New Mexico Military Institute' },
  { slug: 'northdakotastatecollegeofscience', name: 'North Dakota State College of Science' },
  { slug: 'northidahocollege', name: 'North Idaho College' },
  { slug: 'northplattecommunitycollege', name: 'North Platte Community College' },
  { slug: 'northeastcommunitycollege', name: 'Northeast Community College' },
  { slug: 'northeastmississippicommunitycollege', name: 'Northeast Mississippi Community College' },
  { slug: 'northeasternjuniorcollege', name: 'Northeastern Junior College' },
  { slug: 'northeasternoklahomaamcollege', name: 'Northeastern Oklahoma A&M College' },
  { slug: 'northernoklahomacollegeenid', name: 'Northern Oklahoma College-Enid' },
  { slug: 'northernoklahomacollegetonkawa', name: 'Northern Oklahoma College-Tonkawa' },
  { slug: 'northwestcollege', name: 'Northwest College' },
  { slug: 'northwestfloridastatecollege', name: 'Northwest Florida State College' },
  { slug: 'northwestmississippicommunitycollege', name: 'Northwest Mississippi Community College' },
  { slug: 'odessacollege', name: 'Odessa College' },
  { slug: 'oliveharveycollege', name: 'Olive-Harvey College' },
  { slug: 'olneycentralcollege', name: 'Olney Central College' },
  { slug: 'oterocollege', name: 'Otero College' },
  { slug: 'panolacollege', name: 'Panola College' },
  { slug: 'parisjuniorcollege', name: 'Paris Junior College' },
  { slug: 'pearlrivercommunitycollege', name: 'Pearl River Community College' },
  { slug: 'pellissippistatecommunitycollege', name: 'Pellissippi State Community College' },
  { slug: 'pensacolastatecollege', name: 'Pensacola State College' },
  { slug: 'polkstatecollege', name: 'Polk State College' },
  { slug: 'prattcommunitycollege', name: 'Pratt Community College' },
  { slug: 'rangercollege', name: 'Ranger College' },
  { slug: 'redlandscommunitycollege', name: 'Redlands Community College' },
  { slug: 'richardblandcollege', name: 'Richard Bland College' },
  { slug: 'richardjdaleycollege', name: 'Richard J. Daley College' },
  { slug: 'roanestatecommunitycollege', name: 'Roane State Community College' },
  { slug: 'saltlakecommunitycollege', name: 'Salt Lake Community College' },
  { slug: 'santafecollege', name: 'Santa Fe College' },
  { slug: 'saukvalleycommunitycollege', name: 'Sauk Valley Community College' },
  { slug: 'seminolestatecollege', name: 'Seminole State College' },
  { slug: 'sewardcounty', name: 'Seward County' },
  { slug: 'shawneecommunitycollege', name: 'Shawnee Community College' },
  { slug: 'sheltonstatecommunitycollege', name: 'Shelton State Community College' },
  { slug: 'snowcollege', name: 'Snow College' },
  { slug: 'southgeorgiastatecollege', name: 'South Georgia State College' },
  { slug: 'southgeorgiatechnicalcollege', name: 'South Georgia Technical College' },
  { slug: 'southplainscollege', name: 'South Plains College' },
  { slug: 'southeastcommunitycollege', name: 'Southeast Community College' },
  { slug: 'southeasterncommunitycollege', name: 'Southeastern Community College' },
  { slug: 'southerncrescenttechnicalcollege', name: 'Southern Crescent Technical College' },
  { slug: 'southernunionstatecommunitycollege', name: 'Southern Union State Community College' },
  { slug: 'southernuniversityshreveport', name: 'Southern University-Shreveport' },
  { slug: 'southwestmississippicommunitycollege', name: 'Southwest Mississippi Community College' },
  { slug: 'southwesttennesseecommunitycollege', name: 'Southwest Tennessee Community College' },
  { slug: 'southwesternchristiancollege', name: 'Southwestern Christian College' },
  { slug: 'southwesternillinoiscollege', name: 'Southwestern Illinois College' },
  { slug: 'stpetersburgcollege', name: 'St. Petersburg College' },
  { slug: 'statefaircommunitycollege', name: 'State Fair Community College' },
  { slug: 'tallahasseestatecollege', name: 'Tallahassee State College' },
  { slug: 'templecollege', name: 'Temple College' },
  { slug: 'threeriverscollegemo', name: 'Three Rivers College - MO' },
  { slug: 'trinidadstatecollege', name: 'Trinidad State College' },
  { slug: 'trinityvalleycommunitycollege', name: 'Trinity Valley Community College' },
  { slug: 'tritoncollege', name: 'Triton College' },
  { slug: 'tylerjuniorcollege', name: 'Tyler Junior College' },
  { slug: 'uscsalkehatchie', name: 'USC Salkehatchie' },
  { slug: 'utahstateeastern', name: 'Utah State Eastern' },
  { slug: 'vincennesuniversity', name: 'Vincennes University' },
  { slug: 'volunteerstatecommunitycollege', name: 'Volunteer State Community College' },
  { slug: 'wabashvalleycollege', name: 'Wabash Valley College' },
  { slug: 'waketechnicalcommunitycollege', name: 'Wake Technical Community College' },
  { slug: 'wallacestatecommunitycollegehancevil', name: 'Wallace State Community College-Hanceville' },
  { slug: 'waltersstatecommunitycollege', name: 'Walters State Community College' },
  { slug: 'weatherfordcollege', name: 'Weatherford College' },
  { slug: 'westernnebraskacommunitycollege', name: 'Western Nebraska Community College' },
  { slug: 'westernoklahomastatecollege', name: 'Western Oklahoma State College' },
  { slug: 'westerntexascollege', name: 'Western Texas College' },
  { slug: 'westernwyomingcommunitycollege', name: 'Western Wyoming Community College' },
  { slug: 'wilburwrightcollege', name: 'Wilbur Wright College' },
  { slug: 'willistonstatecollege', name: 'Williston State College' },
  { slug: 'yavapaicollege', name: 'Yavapai College' },
];

async function getTeams() {
  const teams = GENDER === 'womens' ? WOMENS_D1_TEAMS : MENS_D1_TEAMS;
  console.log(`
✓ Using ${teams.length} hardcoded ${GENDER} D1 teams`);
  return teams;
}

// ── SHARED STAT PARSER ────────────────────────────────────────────────────────
// Fields are TAB-separated. Column order:
//   GP GS MIN AVG | FG-FGA PCT | 3FG-3FGA PCT | FT-FTA PCT |
//   OFF DEF TOT AVG | PF DQ | A A/G | TO TO/G | A/TO | BLK BLK/G | STL STL/G | PTS AVG
function parseStatFields(parts) {
  const num = s => (s === undefined || s === null || s.trim() === '-' || s.trim() === '') ? null : parseFloat(s.trim());
  const int = s => (s === undefined || s === null || s.trim() === '-' || s.trim() === '') ? null : parseInt(s.trim());
  const madeAtt = s => {
    if (!s || s.trim() === '-' || s.trim() === '') return [null, null];
    const m = s.trim().match(/^(\d+)-(\d+)$/);
    return m ? [parseInt(m[1]), parseInt(m[2])] : [null, null];
  };

  let i = 0;
  const gp      = int(parts[i++]);
  const gs      = int(parts[i++]);
  const min     = int(parts[i++]);
  const min_avg = num(parts[i++]);

  const [fg, fga]   = madeAtt(parts[i++]);
  const fg_pct      = num(parts[i++]);
  const [fg3, fg3a] = madeAtt(parts[i++]);
  const fg3_pct     = num(parts[i++]);

  // FT-FTA can be bare '-' for players with no free throw attempts
  let ft = null, fta = null;
  if (!parts[i] || parts[i].trim() === '-') {
    i++;
  } else {
    [ft, fta] = madeAtt(parts[i++]);
  }
  const ft_pct  = num(parts[i++]);

  const reb_off = int(parts[i++]);
  const reb_def = int(parts[i++]);
  const reb_tot = int(parts[i++]);
  const reb_avg = num(parts[i++]);
  const pf      = int(parts[i++]);
  const dq      = int(parts[i++]);
  const ast     = int(parts[i++]);
  const ast_avg = num(parts[i++]);
  const to_stat = int(parts[i++]);
  const to_avg  = num(parts[i++]);
  const ast_to  = num(parts[i++]);
  const blk     = int(parts[i++]);
  const blk_avg = num(parts[i++]);
  const stl     = int(parts[i++]);
  const stl_avg = num(parts[i++]);
  const pts     = int(parts[i++]);
  const pts_avg = num(parts[i++]);

  return {
    gp, gs, min, min_avg,
    fg, fga, fg_pct,
    fg3, fg3a, fg3_pct,
    ft, fta, ft_pct,
    reb_off, reb_def, reb_tot, reb_avg,
    pf, dq, ast, ast_avg,
    to_stat, to_avg, ast_to,
    blk, blk_avg, stl, stl_avg,
    pts, pts_avg,
  };
}

// ── PARSE FULL STAT PAGE ──────────────────────────────────────────────────────
function parseStatPage(rawText, teamSlug, teamName) {
  const players = [];
  let teamTotal = null;
  let oppTotal  = null;

  const lines = rawText.split('\n').filter(l => l.trim().length > 0);

  for (const line of lines) {
    const trimmed = line.trim();

    // Skip header / metadata lines
    if (
      trimmed.startsWith('Click')           ||
      trimmed.startsWith('2025-26')         ||
      trimmed.startsWith('Record')          ||
      trimmed.includes('3-Point')           ||
      trimmed.startsWith('Conference Only') ||
      trimmed.length < 10
    ) continue;

    // Split on tabs - the format is fully tab-delimited
    const cols = line.split('\t');

    // Team Total row: cols[0]="Total...", cols[1..]=stats
    if (trimmed.startsWith('Total') && !trimmed.startsWith('Total3')) {
      try { teamTotal = parseStatFields(cols.slice(1)); } catch(e) {}
      continue;
    }

    // Opponents row: cols[0]="Opponents...", cols[1..]=stats
    if (trimmed.startsWith('Opponents')) {
      try { oppTotal = parseStatFields(cols.slice(1)); } catch(e) {}
      continue;
    }

    // Player rows: cols[0]=jersey, cols[1]=name(dot-padded), cols[2..]=stats
    if (cols.length < 10) continue;

    const jerseyRaw = cols[0].trim();
    const nameRaw   = cols[1] ? cols[1].replace(/[.]+$/, '').trim() : '';

    // jersey must be empty or digits only; name must start with a letter
    if (!/^[0-9]{0,2}$/.test(jerseyRaw)) continue;
    if (!nameRaw || !/^[A-Za-z]/.test(nameRaw)) continue;

    try {
      const stats = parseStatFields(cols.slice(2));
      if (!nameRaw || stats.gp === null) continue;

      const nameParts = nameRaw.toLowerCase().replace(/[^a-z0-9 ]/g, '').trim().split(/\s+/);
      const player_id = `${teamSlug}_${jerseyRaw}_${nameParts.join('_')}`;

      players.push({ player_id, jersey: jerseyRaw, name: nameRaw, ...stats });
    } catch (e) {
      console.warn(`  skipped: ${trimmed.substring(0, 60)}`);
    }
  }

  return { players, teamTotal, oppTotal };
}
// ── DB UPSERTS ────────────────────────────────────────────────────────────────
async function upsertPlayers(players, teamSlug, teamName) {
  for (const p of players) {
    await pool.query(`
      INSERT INTO ${TABLE_PLAYERS} (
        player_id, team_slug, team_name, season,
        jersey, name,
        gp, gs, min, min_avg,
        fg, fga, fg_pct, fg3, fg3a, fg3_pct, ft, fta, ft_pct,
        reb_off, reb_def, reb_tot, reb_avg,
        pf, dq, ast, ast_avg, to_stat, to_avg, ast_to,
        blk, blk_avg, stl, stl_avg, pts, pts_avg,
        updated_at
      ) VALUES (
        $1,$2,$3,$4,$5,$6,
        $7,$8,$9,$10,
        $11,$12,$13,$14,$15,$16,$17,$18,$19,
        $20,$21,$22,$23,
        $24,$25,$26,$27,$28,$29,$30,
        $31,$32,$33,$34,$35,$36,
        NOW()
      )
      ON CONFLICT (player_id) DO UPDATE SET
        team_slug=EXCLUDED.team_slug, team_name=EXCLUDED.team_name,
        jersey=EXCLUDED.jersey, name=EXCLUDED.name,
        gp=EXCLUDED.gp, gs=EXCLUDED.gs, min=EXCLUDED.min, min_avg=EXCLUDED.min_avg,
        fg=EXCLUDED.fg, fga=EXCLUDED.fga, fg_pct=EXCLUDED.fg_pct,
        fg3=EXCLUDED.fg3, fg3a=EXCLUDED.fg3a, fg3_pct=EXCLUDED.fg3_pct,
        ft=EXCLUDED.ft, fta=EXCLUDED.fta, ft_pct=EXCLUDED.ft_pct,
        reb_off=EXCLUDED.reb_off, reb_def=EXCLUDED.reb_def,
        reb_tot=EXCLUDED.reb_tot, reb_avg=EXCLUDED.reb_avg,
        pf=EXCLUDED.pf, dq=EXCLUDED.dq,
        ast=EXCLUDED.ast, ast_avg=EXCLUDED.ast_avg,
        to_stat=EXCLUDED.to_stat, to_avg=EXCLUDED.to_avg, ast_to=EXCLUDED.ast_to,
        blk=EXCLUDED.blk, blk_avg=EXCLUDED.blk_avg,
        stl=EXCLUDED.stl, stl_avg=EXCLUDED.stl_avg,
        pts=EXCLUDED.pts, pts_avg=EXCLUDED.pts_avg,
        updated_at=NOW()
    `, [
      p.player_id, teamSlug, teamName, SEASON,
      p.jersey, p.name,
      p.gp, p.gs, p.min, p.min_avg,
      p.fg, p.fga, p.fg_pct, p.fg3, p.fg3a, p.fg3_pct, p.ft, p.fta, p.ft_pct,
      p.reb_off, p.reb_def, p.reb_tot, p.reb_avg,
      p.pf, p.dq, p.ast, p.ast_avg, p.to_stat, p.to_avg, p.ast_to,
      p.blk, p.blk_avg, p.stl, p.stl_avg, p.pts, p.pts_avg,
    ]);
  }
}

async function upsertTotalRow(teamSlug, teamName, rowType, stats) {
  if (!stats) return;
  await pool.query(`
    INSERT INTO ${TABLE_TOTALS} (
      team_slug, team_name, season, row_type,
      gp, min,
      fg, fga, fg_pct, fg3, fg3a, fg3_pct, ft, fta, ft_pct,
      reb_off, reb_def, reb_tot,
      pf, dq, ast, to_stat, ast_to,
      blk, stl, pts,
      updated_at
    ) VALUES (
      $1,$2,$3,$4,
      $5,$6,
      $7,$8,$9,$10,$11,$12,$13,$14,$15,
      $16,$17,$18,
      $19,$20,$21,$22,$23,
      $24,$25,$26,
      NOW()
    )
    ON CONFLICT (team_slug, season, row_type) DO UPDATE SET
      team_name=EXCLUDED.team_name,
      gp=EXCLUDED.gp, min=EXCLUDED.min,
      fg=EXCLUDED.fg, fga=EXCLUDED.fga, fg_pct=EXCLUDED.fg_pct,
      fg3=EXCLUDED.fg3, fg3a=EXCLUDED.fg3a, fg3_pct=EXCLUDED.fg3_pct,
      ft=EXCLUDED.ft, fta=EXCLUDED.fta, ft_pct=EXCLUDED.ft_pct,
      reb_off=EXCLUDED.reb_off, reb_def=EXCLUDED.reb_def, reb_tot=EXCLUDED.reb_tot,
      pf=EXCLUDED.pf, dq=EXCLUDED.dq,
      ast=EXCLUDED.ast, to_stat=EXCLUDED.to_stat, ast_to=EXCLUDED.ast_to,
      blk=EXCLUDED.blk, stl=EXCLUDED.stl, pts=EXCLUDED.pts,
      updated_at=NOW()
  `, [
    teamSlug, teamName, SEASON, rowType,
    stats.gp, stats.min,
    stats.fg, stats.fga, stats.fg_pct,
    stats.fg3, stats.fg3a, stats.fg3_pct,
    stats.ft, stats.fta, stats.ft_pct,
    stats.reb_off, stats.reb_def, stats.reb_tot,
    stats.pf, stats.dq, stats.ast, stats.to_stat, stats.ast_to,
    stats.blk, stats.stl, stats.pts,
  ]);
}

// ── MAIN ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`\n🏀 NJCAA Scraper — ${GENDER} ${SEASON} ${DIVISION.toUpperCase()}`);
  console.log('='.repeat(50));

  await ensureTables();

  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const page = await browser.newPage();
  await page.setUserAgent(
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
  );

  try {
    const teams = await getTeams();
    let success = 0, skipped = 0, totalPlayers = 0;

    for (let idx = 0; idx < teams.length; idx++) {
      const team = teams[idx];
      const url  = `${BASE}/sports/${SPORT_SLUG}/${SEASON}/${DIVISION}/teams/${team.slug}?tmpl=teaminfo-network-monospace-json-template`;

      process.stdout.write(`[${idx + 1}/${teams.length}] ${team.name}... `);

      try {
        await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });

        // Wait for Cloudflare challenge to pass - keep checking until real content loads
        let rawText = '';
        for (let attempt = 0; attempt < 10; attempt++) {
          const rawHtml = await page.content();
          // Cloudflare challenge pages contain "Just a moment"
          if (rawHtml.includes('Just a moment') || rawHtml.includes('cf-browser-verification')) {
            await sleep(3000);
            continue;
          }
          // Real content - extract from <pre> tag (PrestoSports monospace template)
          const preMatch = rawHtml.match(/<pre[^>]*>([\s\S]*?)<\/pre>/i);
          if (preMatch) {
            rawText = preMatch[1]
              .replace(/&amp;/g, '&')
              .replace(/&lt;/g, '<')
              .replace(/&gt;/g, '>')
              .replace(/&nbsp;/g, ' ')
              .replace(/&#9;/g, '\t')
              .replace(/<[^>]+>/g, '');
          } else {
            rawText = await page.evaluate(() => document.body.innerText);
          }
          break;
        }

        if (!rawText || rawText.length < 100) {
          console.log('⚠ Empty response, skipping');
          skipped++;
          continue;
        }

        // DEBUG: dump first team's raw text sample then exit
        if (idx === 0) {
          console.log('\n--- RAW SAMPLE (first 1000 chars) ---');
          console.log(JSON.stringify(rawText.substring(0, 1000)));
          console.log('--- END SAMPLE ---\n');
        }

        const { players, teamTotal, oppTotal } = parseStatPage(rawText, team.slug, team.name);

        await upsertPlayers(players, team.slug, team.name);
        await upsertTotalRow(team.slug, team.name, 'team',     teamTotal);
        await upsertTotalRow(team.slug, team.name, 'opponent', oppTotal);

        const flags = [];
        if (!teamTotal) flags.push('no team total');
        if (!oppTotal)  flags.push('no opp total');

        console.log(`✓ ${players.length} players${flags.length ? ' ⚠ ' + flags.join(', ') : ''}`);
        totalPlayers += players.length;
        success++;
      } catch (e) {
        console.log(`✗ Error: ${e.message}`);
        skipped++;
      }

      await sleep(DELAY_MS);
    }

    console.log('\n' + '='.repeat(50));
    console.log(`✅ Done — ${success} teams, ${totalPlayers} players, ${skipped} skipped`);
    console.log(`   Players: ${TABLE_PLAYERS}`);
    console.log(`   Totals:  ${TABLE_TOTALS}`);

  } finally {
    await browser.close();
    await pool.end();
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
