'use client';

import { useEffect, useState, useMemo } from 'react';
import SiteNavigation from '@/components/SiteNavigation';

const ACCENT   = "#3B9EFF";
const NAVY     = "#0D1F3C";
const D1_COLOR = "#1a6b3c";
const D2_COLOR = "#7b3f00";

const TEAM_STATES: Record<string, string> = {
  'Albany Technical College': 'GA', 'Allegany College of Maryland': 'MD',
  'Allen County Community College': 'KS', 'Alpena Community College': 'MI',
  'Andrew College': 'GA', 'Angelina College': 'TX',
  'Anne Arundel Community College': 'MD', 'Arizona Western College': 'AZ',
  'Arkansas State Mid-South': 'AR', 'Barton Community College': 'KS',
  'Baton Rouge Community College': 'LA', 'Bay College': 'MI',
  'Bishop State Community College': 'AL', 'Black Hawk College': 'IL',
  'Blackhawk Technical College': 'WI', 'Blinn College': 'TX',
  'Brunswick Community College': 'NC', 'Bryant & Stratton College (VA)': 'VA',
  'Bryant and Stratton College (WI)': 'WI', 'Butler Community College': 'KS',
  'Calhoun Community College': 'AL', 'Cape Fear Community College': 'NC',
  'Carl Sandburg College': 'IL', 'Casper College': 'WY',
  'Catawba Valley Community College': 'NC', 'CCBC Catonsville': 'MD',
  'CCBC Essex': 'MD', 'Cecil College': 'MD', 'Central Arizona College': 'AZ',
  'Central Community College': 'NE', 'Central Georgia Technical College': 'GA',
  'Central Wyoming College': 'WY', 'Chandler-Gilbert Community College': 'AZ',
  'Chattahoochee Valley Community College': 'AL', 'Chattanooga State Community College': 'TN',
  'Chesapeake College': 'MD', 'Chipola College': 'FL', 'Chipola  College': 'FL', 'Cisco College': 'TX',
  'Clarendon College': 'TX', 'Clark State College': 'OH',
  'Cleveland Community College': 'TN', 'Coastal Alabama - North': 'AL',
  'Coastal Alabama - South': 'AL', 'Coastal Bend College': 'TX',
  'Cochise College': 'AZ', 'Coffeyville Community College': 'KS',
  'Colby Community College': 'KS', 'College of DuPage': 'IL',
  'College of Lake County': 'IL', 'College of Southern Idaho': 'ID',
  'College of Southern Maryland': 'MD', 'College of Southern Nevada': 'NV',
  'Collin College': 'TX', 'Colorado Northwestern Community College': 'CO',
  'Columbia State Community College': 'TN', 'Community Christian (Mich.)': 'MI',
  'Community Christian College': 'CA', 'Community College of Beaver County': 'PA',
  'Connors State College': 'OK', 'Copiah-Lincoln Community College': 'MS',
  'County College of Morris': 'NJ', 'Cowley College': 'KS', 'Crowder College': 'MO',
  'Cuyahoga Community College': 'OH', 'Dakota College at Bottineau': 'ND',
  'Danville Area Community College': 'IL', 'Dawson Community College': 'MT',
  'Daytona State College': 'FL', 'Delaware Technical Community College': 'DE',
  'Delgado Community College': 'LA', 'Delta College': 'MI',
  'Denmark Technical College': 'SC', 'Des Moines Area Community College': 'IA',
  'Dodge City Community College': 'KS', 'Dyersburg State Community College': 'TN',
  'East Central Community College': 'MS', 'East Georgia State College': 'GA',
  'East Mississippi Community College': 'MS', 'Eastern Arizona College': 'AZ',
  'Eastern Florida State College': 'FL', 'Eastern Oklahoma State College': 'OK',
  'Eastern Wyoming College': 'WY', 'Edison State': 'OH',
  'Elgin Community College': 'IL', 'Ellsworth Community College': 'IA',
  'Enterprise State Community College': 'AL', 'Essex County College': 'NJ',
  'Fayetteville Technical CC': 'NC', 'Florida SouthWestern State College': 'FL',
  'Florida State College at Jacksonville': 'FL', 'Fort Hays Tech Northwest': 'KS',
  'Fort Scott Community College': 'KS', 'Frank Phillips College': 'TX',
  'Frederick Community College': 'MD', 'Gadsden State Community College': 'AL',
  'Garden City Community College': 'KS', 'Garrett College': 'MD',
  'Gillette College': 'WY', 'Glen Oaks Community College': 'MI',
  'Glendale Community College': 'AZ', 'Gogebic Community College': 'MI',
  'Grand Rapids Community College': 'MI', 'Grayson College': 'TX',
  'Guilford Technical Community College': 'NC', 'Gulf Coast State College': 'FL',
  'Hagerstown Community College': 'MD', 'Harcum College': 'PA',
  'Harford Community College': 'MD', 'Harper College': 'IL',
  'Harry S. Truman College': 'IL', 'Henry Ford College': 'MI',
  'Highland Community College': 'IL', 'Highland Community College - Kansas': 'KS',
  'Hill College': 'TX', 'Hillsborough Community College': 'FL',
  'Hinds Community College': 'MS', 'Hocking College': 'OH',
  'Holmes Community College': 'MS', 'Howard College': 'TX',
  'Howard Community College': 'MD', 'Hutchinson Community College': 'KS',
  'Illinois Central College': 'IL', 'Illinois Valley Community College': 'IL',
  'Independence Community College': 'KS', 'Iowa Central Community College': 'IA',
  'Iowa Lakes Community College': 'IA', 'Iowa Western Community College': 'IA',
  'Itawamba Community College': 'MS', 'Jackson College': 'MI',
  'Jackson State Community College': 'TN', 'Jamestown Community College': 'NY',
  'Jefferson College': 'MO', 'John A. Logan College': 'IL',
  'John Wood Community College': 'IL', 'Johnson County Community College': 'KS',
  'Jones College': 'MS', 'Kalamazoo Valley Community College': 'MI',
  'Kankakee Community College': 'IL', 'Kansas City Kansas Community College': 'KS',
  'Kaskaskia College': 'IL', 'Kellogg Community College': 'MI',
  'Kennedy-King College': 'IL', 'Kilgore College': 'TX',
  'Kirkwood Community College': 'IA', 'Kirtland Community College': 'MI',
  'Kishwaukee College': 'IL', 'Labette Community College': 'KS',
  'Lackawanna College': 'PA', 'Lake Land College': 'IL',
  'Lake Michigan College': 'MI', 'Lake Region State College': 'ND',
  'Lakeland Community College': 'OH', 'Lamar Community College': 'CO',
  'Laramie County Community College': 'WY', 'Lansing Community College': 'MI',
  'Lawson State Community College': 'AL', 'Lewis & Clark Community College': 'IL',
  'Lincoln Land Community College': 'IL', 'Lincoln Trail College': 'IL',
  'Louisiana State University Eunice': 'LA', 'Louisburg College': 'NC',
  'Lurleen B. Wallace Community College': 'AL', 'Macomb Community College': 'MI',
  'Madison College': 'WI', 'Malcolm X College': 'IL',
  'Marian University Ancilla': 'IN', 'Marshalltown CC': 'IA',
  'McCook Community College': 'NE', 'McHenry County College': 'IL',
  'McLennan Community College': 'TX', 'Mercer County Community College': 'NJ',
  'Meridian Community College': 'MS', 'Mesa Community College': 'AZ',
  'Metropolitan Community College': 'MO', 'Miami Dade College': 'FL',
  'Mid Michigan College': 'MI', 'Middlesex College': 'NJ',
  'Midland College': 'TX', 'Miles Community College': 'MT',
  'Milwaukee Area Technical College': 'WI', 'Mineral Area College': 'MO',
  'Mississippi Delta Community College': 'MS', 'Mississippi Gulf Coast Community College': 'MS',
  'Moberly Area Community College': 'MO', 'Monroe Community College': 'NY',
  'Monroe University': 'NY', 'Montcalm Community College': 'MI',
  'Montgomery College (MD)': 'MD', 'Moraine Valley Community College': 'IL',
  'Morton College': 'IL', 'Motlow State Community College': 'TN',
  'Mott Community College': 'MI', 'Murray State College': 'OK',
  'Muskegon Community College': 'MI', 'National Park College': 'AR',
  'Neosho County Community College': 'KS', 'New Mexico Junior College': 'NM',
  'North Arkansas College': 'AR', 'North Central Michigan': 'MI',
  'North Central Missouri College': 'MO', 'North Dakota State College of Science': 'ND',
  'North Idaho College': 'ID', 'North Iowa Area Community College': 'IA',
  'North Platte Community College': 'NE', 'Northeast Community College': 'NE',
  'Northeast Mississippi Community College': 'MS', 'Northeastern Junior College': 'CO',
  'Northeastern Oklahoma AM College': 'OK', 'Northern Oklahoma College-Enid': 'OK',
  'Northern Oklahoma College-Tonkawa': 'OK', 'Northwest College': 'WY',
  'Northwest Florida State College': 'FL', 'Northwest Mississippi Community College': 'MS',
  'Oakland Community College': 'MI', 'Oakton Community College': 'IL',
  'Odessa College': 'TX', 'Olive-Harvey College': 'IL', 'Olney Central College': 'IL',
  'Orange County Community College': 'NY', 'Otero College': 'CO',
  'Palm Beach State College': 'FL', 'Panola College': 'TX',
  'Paris Junior College': 'TX', 'Parkland College': 'IL',
  'Pearl River Community College': 'MS', 'Pellissippi State Community College': 'TN',
  'Pensacola State College': 'FL', 'Phillips Community College - UA': 'AR',
  'Phoenix College': 'AZ', 'Pima Community College': 'AZ',
  'Prairie State College': 'IL', 'Pratt Community College': 'KS',
  "Prince George's Community College": 'MD', 'Ranger College': 'TX',
  'Raritan Valley Community College': 'NJ', 'Redlands Community College': 'OK',
  'Reid State Community College': 'AL', 'Rend Lake College': 'IL',
  'Richard Bland College': 'VA', 'Richard J. Daley College': 'IL',
  'Roane State Community College': 'TN', 'Rock Valley College': 'IL',
  'Rockland Community College': 'NY', 'Salem Community College': 'NJ',
  'Salt Lake Community College': 'UT', 'Santa Fe College': 'FL',
  'Sauk Valley Community College': 'IL', 'Schoolcraft College': 'MI',
  'Scottsdale Community College': 'AZ', 'Seminole State College': 'OK',
  'Seward County Community College': 'KS', 'Shawnee Community College': 'IL',
  'Shelton State Community College': 'AL', 'Shorter College': 'AR',
  'Snead State Community College': 'AL', 'Snow College': 'UT',
  'South Arkansas College': 'AR', 'South Georgia Technical College': 'GA',
  'South Mountain Community College': 'AZ', 'South Plains College': 'TX',
  'South Suburban College': 'IL', 'Southeast Arkansas College': 'AR',
  'Southeast Community College': 'NE', 'Southeastern Community College': 'IA',
  'Southern Arkansas University Tech': 'AR', 'Southern Crescent Technical College': 'GA',
  'Southern Union State Community College': 'AL', 'Southern University-Shreveport': 'LA',
  'Southwest Mississippi Community College': 'MS', 'Southwest Tennessee Community College': 'TN',
  'Southwest Virginia': 'VA', 'Southwestern Christian College': 'TX',
  'Southwestern Community College': 'IA', 'Southwestern Illinois College': 'IL',
  'Southwestern Michigan': 'MI', 'Spoon River College': 'IL',
  'St. Clair County Community College': 'MI', 'St. Louis Community College': 'MO',
  'St. Petersburg College': 'FL', 'State Fair Community College': 'MO',
  'SUNY Niagara': 'NY', 'Tallahassee State College': 'FL', 'Temple College': 'TX',
  'Terra State': 'OH', 'Three Rivers College - MO': 'MO',
  'Trinidad State College': 'CO', 'Trinity Valley Community College': 'TX',
  'Triton College': 'IL', 'Tyler Junior College': 'TX', 'UCNJ': 'NJ',
  'Ulster County Community College': 'NY', 'United Tribes Technical College': 'ND',
  'University of Arkansas Cossatot': 'AR', 'USC Salkehatchie': 'SC',
  'Utah State Eastern': 'UT', 'Vincennes University': 'IN',
  'Volunteer State Community College': 'TN', 'Wabash Valley College': 'IL',
  'Wake Technical Community College': 'NC', 'Wallace Community College-Selma': 'AL',
  'Wallace State Community College-Hanceville': 'AL', 'Walters State Community College': 'TN',
  'Waubonsee Community College': 'IL', 'Wayne County Community College': 'MI',
  'Weatherford College': 'TX', 'Western Nebraska Community College': 'NE',
  'Western Oklahoma State College': 'OK', 'Western Texas College': 'TX',
  'Western Wyoming Community College': 'WY', 'Westchester Community College': 'NY',
  'Westmoreland County Community College': 'PA', 'Wilbur Wright College': 'IL',
  'Williston State College': 'ND', 'WVU Potomac State College': 'WV',
  'Yavapai College': 'AZ',
  'Butler Community College - KS': 'KS',
  'Cleveland State Community College': 'TN',
  'Cloud County Community College': 'KS',
  'Coahoma Community College': 'MS',
  'Collin County Community College': 'TX',
  'Cowley County Community College': 'KS',
  'Highland Community College - Illinois': 'IL',
  'Lake Region State College - ND': 'ND',
  'Seward County': 'KS',
};
const SKY     = "#2E7DD1";
const ICE     = "#A8C8F0";
const FROST   = "#E8F2FC";
const MUTED   = "#6B7E9A";

type StatMode = 'advanced' | 'perGame' | 'per40';

type Player = {
  playerId: string;
  teamName: string;
  jersey: string | null;
  name: string;
  season: string;
  division: string | null;
  year: string | null;
  games: number | null;
  minutes: number | null;
  cleanGames: number | null;
  cleanMin: number | null;
  // All-game stats (for per game)
  fgm: number | null; fga: number | null;
  tpm: number | null; tpa: number | null;
  ftm: number | null; fta: number | null;
  orb: number | null; drb: number | null; trb: number | null;
  ast: number | null; stl: number | null; blk: number | null;
  tov: number | null; pf: number | null; points: number | null;
  // Clean game stats (for advanced + per 40)
  cleanFgm: number | null; cleanFga: number | null;
  cleanTpm: number | null; cleanTpa: number | null;
  cleanFtm: number | null; cleanFta: number | null;
  cleanOrb: number | null; cleanDrb: number | null; cleanTrb: number | null;
  cleanAst: number | null; cleanStl: number | null; cleanBlk: number | null;
  cleanTov: number | null; cleanPf: number | null; cleanPts: number | null;
};

type TeamRow = {
  teamName: string;
  games: number;
  cleanGames: number;
  fgm: number; fga: number; tpm: number; tpa: number; ftm: number; fta: number;
  orb: number; trb: number; ast: number; tov: number; points: number;
  cleanFgm: number; cleanFga: number; cleanTpm: number; cleanFtm: number; cleanFta: number;
  cleanAst: number; cleanPts: number;
  cleanOrb: number; cleanTrb: number; cleanTov: number;
  cleanOppFga: number; cleanOppTpa: number; cleanOppFta: number;
  cleanOppOrb: number; cleanOppTrb: number; cleanOppTov: number;
};

type SortKey =
  | 'name' | 'teamName' | 'games'
  | 'ortg' | 'usagePct' | 'minPct' | 'shotsPct' | 'efg' | 'ts'
  | 'orbPct' | 'drbPct' | 'aRate' | 'toRate' | 'blkPct' | 'stlPct' | 'ftRate'
  | 'twopm' | 'twopa' | 'twopPct' | 'tpm' | 'tpa' | 'tpPct' | 'ftm' | 'fta' | 'ftPct'
  | 'ppg' | 'rpg' | 'orbpg' | 'drbpg' | 'apg' | 'tovpg' | 'spg' | 'bpg' | 'mpg' | 'fgPct'
  | 'twopmPg' | 'twopaPg' | 'twopPctPg' | 'tpmPg' | 'tpaPg' | 'tpPctPg' | 'ftmPg' | 'ftaPg' | 'ftPctPg'
  | 'allTwopm' | 'allTwopa' | 'allTwopPct' | 'allTpm' | 'allTpa' | 'allTpPct' | 'allFtm' | 'allFta' | 'allFtPct'
  | 'totalMin'
  | 'p40' | 'r40' | 'orb40' | 'drb40' | 'a40' | 'tov40' | 's40' | 'b40' | 'fc40' | 'tovpg'
  | 'twopm40' | 'twopa40' | 'twopPct40' | 'tpm40' | 'tpa40' | 'tpPct40' | 'ftm40' | 'fta40' | 'ftPct40';

const MIN_MINUTES_OPTIONS = [0, 50, 100, 150, 200, 300];

function hasStats(p: Player): boolean {
  return p.games != null && p.games > 0 && p.fga != null;
}

function csvField(val: string | number | null | undefined): string {
  const s = val == null ? '' : String(val);
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function calcStats(p: Player, team: TeamRow | undefined) {
  if (!team || !hasStats(p)) return null;

  // ── ALL-GAME stats (used for Per Game) ──────────────────────────────────
  const g   = p.games ?? 1;
  const fgm = p.fgm ?? 0;
  const fga = p.fga ?? 0;
  const tpm = p.tpm ?? 0;
  const tpa = p.tpa ?? 0;
  const ftm = p.ftm ?? 0;
  const fta = p.fta ?? 0;
  const orb = p.orb ?? 0;
  const drb = p.drb ?? 0;
  const trb = p.trb ?? 0;
  const ast = p.ast ?? 0;
  const stl = p.stl ?? 0;
  const blk = p.blk ?? 0;
  const tov = p.tov ?? 0;
  const pf  = p.pf  ?? 0;
  const pts = p.points ?? 0;

  // ── CLEAN stats (used for Advanced + Per 40) ────────────────────────────
  const cg   = p.cleanGames ?? 0;
  const cm   = p.cleanMin ?? 0;
  const cfgm = p.cleanFgm ?? 0;
  const cfga = p.cleanFga ?? 0;
  const ctpm = p.cleanTpm ?? 0;
  const ctpa = p.cleanTpa ?? 0;
  const cftm = p.cleanFtm ?? 0;
  const cfta = p.cleanFta ?? 0;
  const corb = p.cleanOrb ?? 0;
  const cdrb = p.cleanDrb ?? 0;
  const ctrb = p.cleanTrb ?? 0;
  const cast = p.cleanAst ?? 0;
  const cstl = p.cleanStl ?? 0;
  const cblk = p.cleanBlk ?? 0;
  const ctov = p.cleanTov ?? 0;
  const cpf  = p.cleanPf  ?? 0;
  const cpts = p.cleanPts ?? 0;

  const hasClean = cg > 0 && cm > 0;

  // ── Per Game (all games) ─────────────────────────────────────────────────
  const fgPct   = fga > 0 ? (fgm / fga) * 100 : 0;
  const twopm   = fgm - tpm;
  const twopa   = fga - tpa;
  const twopPct = twopa > 0 ? (twopm / twopa) * 100 : 0;
  const tpPct   = tpa > 0 ? (tpm / tpa) * 100 : 0;
  const ftPct   = fta > 0 ? (ftm / fta) * 100 : 0;

  // ── Clean game derived ───────────────────────────────────────────────────
  const c_twopm   = cfgm - ctpm;
  const c_twopa   = cfga - ctpa;
  const c_twopPct = c_twopa > 0 ? (c_twopm / c_twopa) * 100 : 0;
  const c_tpPct   = ctpa > 0 ? (ctpm / ctpa) * 100 : 0;
  const c_ftPct   = cfta > 0 ? (cftm / cfta) * 100 : 0;
  const c_fgPct   = cfga > 0 ? (cfgm / cfga) * 100 : 0;
  const efg       = cfga > 0 ? ((cfgm + 0.5 * ctpm) / cfga) * 100 : 0;
  const ts        = (cfga + 0.475 * cfta) > 0 ? (cpts / (2 * (cfga + 0.475 * cfta))) * 100 : 0;
  const ftRate    = cfga > 0 ? (cfta / cfga) * 100 : 0;

  // ── Advanced (clean games only) ──────────────────────────────────────────
  let ortg = 0, usagePct = 0, minPct = 0, shotsPct = 0;
  let orbPct = 0, drbPct = 0, aRate = 0, toRate = 0, blkPct = 0, stlPct = 0;

  if (hasClean && team.cleanGames > 0) {
    const teamCleanMin  = team.cleanGames * 200;
    const opp_drb       = team.cleanOppTrb - team.cleanOppOrb;
    const team_drb      = team.cleanTrb - team.cleanOrb;
    const Team_ORB_pct  = team.cleanOrb / ((team.cleanOrb + opp_drb) || 1);
    const ftm_rate      = team.cleanFta > 0 ? team.cleanFtm / team.cleanFta : 0.7;
    const Team_Scoring_Poss = team.cleanFga + (1 - Math.pow(1 - ftm_rate, 2)) * team.cleanFta * 0.4;
    const Team_Play_pct = Team_Scoring_Poss / ((team.cleanFga + team.cleanFta * 0.4 + team.cleanTov) || 1);
    const Team_ORB_Weight = ((1 - Team_ORB_pct) * Team_Play_pct) /
      (((1 - Team_ORB_pct) * Team_Play_pct + Team_ORB_pct * (1 - Team_Play_pct)) || 1);

    const teamPossTotal = team.cleanFga + 0.44 * team.cleanFta + team.cleanTov;
    usagePct = teamPossTotal > 0 && cm > 0
      ? 100 * (cfga + 0.44 * cfta + ctov) / (teamPossTotal / teamCleanMin * cm) / 5 : 0;
    minPct   = 100 * cm / teamCleanMin * 5;
    shotsPct = team.cleanFga > 0 && cm > 0
      ? (cfga / team.cleanFga) / (cm / teamCleanMin) / 5 * 100 : 0;

    orbPct = cm > 0 && (team.cleanOrb + opp_drb) > 0
      ? (corb / cm) * (teamCleanMin / 5) / (team.cleanOrb + opp_drb) * 100 : 0;
    drbPct = cm > 0 && (team_drb + team.cleanOppOrb) > 0
      ? (cdrb / cm) * (teamCleanMin / 5) / (team_drb + team.cleanOppOrb) * 100 : 0;

    const aRateDenom = ((cm / (teamCleanMin / 5)) * team.cleanFgm) - cfgm;
    aRate = aRateDenom > 0 ? (cast / aRateDenom) * 100 : 0;

    const playerPoss = cfga + 0.44 * cfta + ctov;
    toRate = playerPoss > 0 ? (ctov / playerPoss) * 100 : 0;

    const oppPoss = team.cleanOppFga - team.cleanOppOrb + team.cleanOppTov + 0.475 * team.cleanOppFta;
    const opp2PA  = team.cleanOppFga - team.cleanOppTpa;
    blkPct = (cm * opp2PA) > 0 ? 100 * (cblk * (teamCleanMin / 5)) / (cm * opp2PA) : 0;
    stlPct = (cm * oppPoss) > 0 ? 100 * (cstl * (teamCleanMin / 5)) / (cm * oppPoss) : 0;

    // ORtg (Dean Oliver) - using clean stats
    const teamFgm_clean = team.cleanFgm;
    const teamPts_clean = team.cleanPts;
    const teamFtm_clean = team.cleanFtm;
    const qAST = ((cm / (teamCleanMin / 5)) * (1.14 * ((teamFgm_clean - cfgm) / (teamFgm_clean || 1)))) +
      ((((team.cleanAst ?? 0) / teamCleanMin * cm * 5 - cast) / (((teamFgm_clean / teamCleanMin) * cm * 5 - cfgm) || 1)) * (1 - cm / (teamCleanMin / 5)));
    const FG_Part  = cfgm * (1 - 0.5 * ((cpts - cftm) / (2 * cfga || 1)) * qAST);
    const AST_Part = 0.5 * ((teamPts_clean - teamFtm_clean - (cpts - cftm)) / (2 * ((team.cleanFga - cfga) || 1))) * cast;
    const FT_Part  = (1 - Math.pow(1 - (cftm / (cfta || 1)), 2)) * 0.4 * cfta;
    const ORB_Part = corb * Team_ORB_Weight * Team_Play_pct;
    const ScPoss   = (FG_Part + AST_Part + FT_Part) * (1 - (team.cleanOrb / Team_Scoring_Poss) * Team_ORB_Weight * Team_Play_pct) + ORB_Part;
    const FGxPoss  = (cfga - cfgm) * (1 - 1.07 * Team_ORB_pct);
    const FTxPoss  = Math.pow(1 - (cftm / (cfta || 1)), 2) * 0.4 * cfta;
    const TotPoss  = ScPoss + FGxPoss + FTxPoss + ctov;
    const PProd_FG  = 2 * (cfgm + 0.5 * ctpm) * (1 - 0.5 * ((cpts - cftm) / (2 * cfga || 1)) * qAST);
    const PProd_AST = 2 * ((teamFgm_clean - cfgm + 0.5 * ((team.cleanTpm ?? 0) - ctpm)) / ((teamFgm_clean - cfgm) || 1)) *
      0.5 * ((teamPts_clean - teamFtm_clean - (cpts - cftm)) / (2 * ((team.cleanFga - cfga) || 1))) * cast;
    const PProd_ORB = corb * Team_ORB_Weight * Team_Play_pct *
      (teamPts_clean / ((team.cleanFga + (1 - Math.pow(1 - ftm_rate, 2)) * 0.4 * team.cleanFta) || 1));
    const PProd = (PProd_FG + PProd_AST + cftm) *
      (1 - (team.cleanOrb / Team_Scoring_Poss) * Team_ORB_Weight * Team_Play_pct) + PProd_ORB;
    ortg = TotPoss > 0 ? 100 * PProd / TotPoss : 0;
  }

  // ── Per 40 (clean games only) ────────────────────────────────────────────
  const cMpg = cg > 0 ? cm / cg : 0;
  const cm40 = cm || 1;

  return {
    // Advanced (clean games) — null if no clean data
    ortg:     hasClean ? ortg     : null,
    usagePct: hasClean ? usagePct : null,
    minPct:   hasClean ? minPct   : null,
    shotsPct: hasClean ? shotsPct : null,
    orbPct:   hasClean ? orbPct   : null,
    drbPct:   hasClean ? drbPct   : null,
    aRate:    hasClean ? aRate    : null,
    toRate:   hasClean ? toRate   : null,
    blkPct:   hasClean ? blkPct   : null,
    stlPct:   hasClean ? stlPct   : null,
    efg, ts, ftRate,
    twopm:   hasClean ? c_twopm   : null,
    twopa:   hasClean ? c_twopa   : null,
    twopPct: hasClean ? c_twopPct : null,
    // All-game shooting for perGame mode
    allTwopm:   twopm,
    allTwopa:   twopa,
    allTwopPct: twopPct,
    allTpm:     tpm,
    allTpa:     tpa,
    allTpPct:   tpPct,
    allFtm:     ftm,
    allFta:     fta,
    allFtPct:   ftPct,
    tpm:     hasClean ? ctpm      : null,
    tpa:     hasClean ? ctpa      : null,
    tpPct:   hasClean ? c_tpPct   : null,
    ftm:     hasClean ? cftm      : null,
    fta:     hasClean ? cfta      : null,
    ftPct:   hasClean ? c_ftPct   : null,
    // Minutes (mode-dependent - handled in column display)
    cleanMinTotal: cm,
    allMinTotal: p.minutes ?? 0,
    // Per Game (all games)
    ppg: pts/g, rpg: trb/g, orbpg: orb/g, drbpg: drb/g,
    apg: ast/g, tovpg: tov/g, spg: stl/g, bpg: blk/g, mpg: (p.minutes ?? 0)/g,
    fgPct,
    // Per Game shooting (all games)
    twopmPg: twopm/g, twopaPg: twopa/g, twopPctPg: twopPct,
    tpmPg: tpm/g, tpaPg: tpa/g, tpPctPg: tpPct,
    ftmPg: ftm/g, ftaPg: fta/g, ftPctPg: ftPct,
    // Per 40 (clean games) — null if no clean data
    p40:      hasClean ? cpts/cm40*40    : null,
    r40:      hasClean ? ctrb/cm40*40    : null,
    orb40:    hasClean ? corb/cm40*40    : null,
    drb40:    hasClean ? cdrb/cm40*40    : null,
    a40:      hasClean ? cast/cm40*40    : null,
    tov40:    hasClean ? (p.cleanTov??0)/cm40*40 : null,
    s40:      hasClean ? cstl/cm40*40    : null,
    b40:      hasClean ? cblk/cm40*40    : null,
    fc40:     hasClean ? cpf/cm40*40     : null,
    twopm40:  hasClean ? c_twopm/cm40*40 : null,
    twopa40:  hasClean ? c_twopa/cm40*40 : null,
    twopPct40: hasClean ? c_twopPct      : null,
    tpm40:    hasClean ? ctpm/cm40*40    : null,
    tpa40:    hasClean ? ctpa/cm40*40    : null,
    tpPct40:  hasClean ? c_tpPct         : null,
    ftm40:    hasClean ? cftm/cm40*40    : null,
    fta40:    hasClean ? cfta/cm40*40    : null,
    ftPct40:  hasClean ? c_ftPct         : null,
  };
}


const ADVANCED_COLS: { label: string; key: SortKey }[] = [
  { label: '%Min',   key: 'minPct'   }, { label: 'ORtg',   key: 'ortg'     },
  { label: '%Usg',   key: 'usagePct' }, { label: '%Shots', key: 'shotsPct' },
  { label: 'eFG%',   key: 'efg'      }, { label: 'TS%',    key: 'ts'       },
  { label: 'OR%',    key: 'orbPct'   }, { label: 'DR%',    key: 'drbPct'   },
  { label: 'ARate',  key: 'aRate'    }, { label: 'TORate', key: 'toRate'   },
  { label: 'Blk%',   key: 'blkPct'  }, { label: 'Stl%',   key: 'stlPct'  },
  { label: 'FTRate', key: 'ftRate'   }, { label: '2PM',    key: 'twopm'    },
  { label: '2PA',    key: 'twopa'    }, { label: '2P%',    key: 'twopPct'  },
  { label: '3PM',    key: 'tpm'      }, { label: '3PA',    key: 'tpa'      },
  { label: '3P%',    key: 'tpPct'   }, { label: 'FTM',    key: 'ftm'      },
  { label: 'FTA',    key: 'fta'      }, { label: 'FT%',    key: 'ftPct'    },
];

const PER_GAME_COLS: { label: string; key: SortKey }[] = [
  { label: 'PPG',  key: 'ppg'      },
  { label: 'RPG',  key: 'rpg'      }, { label: 'ORB',  key: 'orbpg'    },
  { label: 'DRB',  key: 'drbpg'    }, { label: 'APG',  key: 'apg'      },
  { label: 'TOV',  key: 'tovpg'   }, { label: 'SPG',  key: 'spg'      }, { label: 'BPG',  key: 'bpg'      },
  { label: '2PM',  key: 'allTwopm'    }, { label: '2PA',  key: 'allTwopa'    },
  { label: '2P%',  key: 'allTwopPct'  }, { label: '3PM',  key: 'allTpm'      },
  { label: '3PA',  key: 'allTpa'      }, { label: '3P%',  key: 'allTpPct'    },
  { label: 'FTM',  key: 'allFtm'      }, { label: 'FTA',  key: 'allFta'      },
  { label: 'FT%',  key: 'allFtPct'    },
];

const PER_40_COLS: { label: string; key: SortKey }[] = [
  { label: 'PTS/40', key: 'p40'       }, { label: 'REB/40', key: 'r40'       },
  { label: 'ORB/40', key: 'orb40'     }, { label: 'DRB/40', key: 'drb40'     },
  { label: 'AST/40', key: 'a40'       }, { label: 'TOV/40', key: 'tov40'     }, { label: 'STL/40', key: 's40'       },
  { label: 'BLK/40', key: 'b40'       }, { label: 'FC/40',  key: 'fc40'      },
  { label: '2PM',    key: 'twopm'     }, { label: '2PA',    key: 'twopa'     },
  { label: '2P%',    key: 'twopPct40' }, { label: '3PM',    key: 'tpm'       },
  { label: '3PA',    key: 'tpa'       }, { label: '3P%',    key: 'tpPct40'  },
  { label: 'FTM',    key: 'ftm'       }, { label: 'FTA',    key: 'fta'       },
  { label: 'FT%',    key: 'ftPct40'   },
];

const INTEGER_KEYS = new Set(['twopm','twopa','tpm','tpa','ftm','fta','allTwopm','allTwopa','allTpm','allTpa','allFtm','allFta']);

export default function NjcaaWomensDivisionPage() {
  const [players, setPlayers]     = useState<Player[]>([]);
  const [teamMap, setTeamMap]     = useState<Map<string, TeamRow>>(new Map());
  const [loading, setLoading]     = useState(true);
  const [statMode, setStatMode]   = useState<StatMode>('advanced');
  const [divFilter, setDivFilter]   = useState<'all' | 'njcaa-mens-d1' | 'njcaa-mens-d2'>('all');
  const [yearFilter, setYearFilter]  = useState<'all' | 'Fr' | 'So'>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [minMinutes, setMinMinutes] = useState(0);
  const [sortKey, setSortKey]     = useState<SortKey>('totalMin');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  useEffect(() => {
    fetch('/api/recruiting/mens/juco')
      .then(r => r.json())
      .then(({ players, teams }) => {
        setPlayers(players ?? []);
        const map = new Map<string, TeamRow>();
        for (const t of (teams ?? [])) map.set(t.teamName, t);
        setTeamMap(map);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortOrder(o => o === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortOrder('desc'); }
  };

  const activeCols = statMode === 'advanced' ? ADVANCED_COLS : statMode === 'perGame' ? PER_GAME_COLS : PER_40_COLS;

  const filtered = useMemo(() => players.filter(p => {
    if (!hasStats(p)) return false;
    if (divFilter !== 'all' && p.division !== divFilter) return false;
    if (yearFilter !== 'all' && p.year !== yearFilter) return false;
    // Minimum game threshold by mode
    if (statMode === 'perGame') {
      if ((p.games ?? 0) < 5) return false;
    } else {
      // Advanced and Per 40 require clean games
      if ((p.cleanGames ?? 0) < 5) return false;
    }
    if (minMinutes > 0 && (statMode === 'perGame' ? (p.minutes ?? 0) : (p.cleanMin ?? 0)) < minMinutes) return false;
    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      if (!p.name.toLowerCase().includes(q) &&
          !p.teamName.toLowerCase().includes(q)) return false;
    }
    return true;
  }), [players, statMode, divFilter, yearFilter, searchTerm, minMinutes]);

  const sorted = useMemo(() => [...filtered].sort((a, b) => {
    if (sortKey === 'name') return sortOrder === 'asc' ? a.name.localeCompare(b.name) : b.name.localeCompare(a.name);
    if (sortKey === 'teamName') return sortOrder === 'asc' ? a.teamName.localeCompare(b.teamName) : b.teamName.localeCompare(a.teamName);
    if (sortKey === 'games') { const ag = statMode === 'perGame' ? (a.games ?? 0) : (a.cleanGames ?? 0); const bg = statMode === 'perGame' ? (b.games ?? 0) : (b.cleanGames ?? 0); return sortOrder === 'asc' ? ag - bg : bg - ag; }
    if (sortKey === 'totalMin') {
      const am = statMode === 'perGame' ? (a.minutes ?? 0) : (a.cleanMin ?? 0);
      const bm = statMode === 'perGame' ? (b.minutes ?? 0) : (b.cleanMin ?? 0);
      return sortOrder === 'asc' ? am - bm : bm - am;
    }
    const as_ = calcStats(a, teamMap.get(a.teamName));
    const bs_ = calcStats(b, teamMap.get(b.teamName));
    if (!as_ && !bs_) return 0;
    if (!as_) return 1;
    if (!bs_) return -1;
    const av = (as_ as Record<string, number>)[sortKey] ?? 0;
    const bv = (bs_ as Record<string, number>)[sortKey] ?? 0;
    return sortOrder === 'asc' ? av - bv : bv - av;
  }), [filtered, sortKey, sortOrder, teamMap]);

  const SortableHeader = ({ label, sk, align = 'right' }: { label: string; sk: SortKey; align?: 'left' | 'right' | 'center' }) => (
    <th onClick={() => handleSort(sk)} style={{
      padding: '4px 5px', textAlign: align, cursor: 'pointer', userSelect: 'none',
      fontWeight: 700, fontSize: 10, whiteSpace: 'nowrap',
      background: sortKey === sk ? ACCENT : 'transparent',
      color: sortKey === sk ? '#fff' : 'inherit', transition: 'background 0.15s',
    }}>
      {label} {sortKey === sk && (sortOrder === 'desc' ? '↓' : '↑')}
    </th>
  );

  const exportCSV = () => {
    const headers = ['Name', 'Team', '#', 'G', ...activeCols.map(c => c.label)];
    const rows = sorted.map(p => {
      const stats = calcStats(p, teamMap.get(p.teamName));
      return [
        csvField(p.name),
        csvField(p.teamName),
        csvField(p.jersey ?? ''),
        csvField(p.games ?? ''),
        ...activeCols.map(c => {
          const val = stats ? (stats as Record<string, number>)[c.key] : undefined;
          if (val == null) return '';
          return INTEGER_KEYS.has(c.key) ? String(Math.round(val)) : val.toFixed(1);
        }),
      ];
    });
    const csv = [headers.map(csvField), ...rows].map(r => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'njcaa_mens_d1.csv'; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <>
      <SiteNavigation currentDivision="mens-d1" currentPage="recruiting" divisionPath="/mens-d1" />
      <main style={{ maxWidth: '100%', margin: '0 auto', padding: 20 }}>
        <div style={{ display: 'flex', gap: 0, borderBottom: `2px solid ${FROST}`, marginBottom: 24 }}>
          {['Transfers', 'JUCO', 'High School'].map(tab => (
            <a key={tab} href={tab === 'Transfers' ? '/mens-d1/recruiting' : tab === 'JUCO' ? '/mens-d1/recruiting/juco' : '/mens-d1/recruiting/highschool'}
              style={{
                padding: '10px 20px', fontFamily: "'Outfit', sans-serif", fontSize: 14, fontWeight: 700,
                color: tab === 'JUCO' ? SKY : MUTED,
                borderBottom: tab === 'JUCO' ? `3px solid ${ACCENT}` : '3px solid transparent',
                marginBottom: -2, letterSpacing: '0.01em', textDecoration: 'none',
              }}>
              {tab}
            </a>
          ))}
        </div>

        {/* Row 1: Search + Stat mode toggle */}
        <div style={{ display: 'flex', gap: 12, marginBottom: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <input type="text" placeholder="Search player or team..." value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            style={{ padding: '8px 12px', border: `1px solid ${ICE}`, borderRadius: 6, fontSize: 13, flex: 1, minWidth: 200, outline: 'none', fontFamily: "'Outfit', sans-serif" }} />

          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: 10, color: MUTED, fontFamily: "'Outfit', sans-serif", fontWeight: 600 }}>JUCO Division</span>
            <div style={{ display: 'flex', borderRadius: 6, overflow: 'hidden', border: `1px solid ${ICE}` }}>
              {([{key:'all',label:'All'},{key:'njcaa-mens-d1',label:'D1'},{key:'njcaa-mens-d2',label:'D2'}] as {key:'all'|'njcaa-mens-d1'|'njcaa-mens-d2';label:string}[]).map(({key,label}) => (
                <button key={key} onClick={() => setDivFilter(key)} style={{
                  padding: '7px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer',
                  fontFamily: "'Outfit', sans-serif", border: 'none', outline: 'none',
                  background: divFilter===key ? NAVY : '#fff', color: divFilter===key ? '#fff' : MUTED,
                  transition: 'background 0.15s, color 0.15s',
                }}>{label}</button>
              ))}
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: 10, color: MUTED, fontFamily: "'Outfit', sans-serif", fontWeight: 600 }}>Year</span>
            <div style={{ display: 'flex', borderRadius: 6, overflow: 'hidden', border: `1px solid ${ICE}` }}>
              {([{key:'all',label:'All'},{key:'Fr',label:'Fr'},{key:'So',label:'So'}] as {key:'all'|'Fr'|'So';label:string}[]).map(({key,label}) => (
                <button key={key} onClick={() => setYearFilter(key)} style={{
                  padding: '7px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer',
                  fontFamily: "'Outfit', sans-serif", border: 'none', outline: 'none',
                  background: yearFilter===key ? NAVY : '#fff', color: yearFilter===key ? '#fff' : MUTED,
                  transition: 'background 0.15s, color 0.15s',
                }}>{label}</button>
              ))}
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: 10, color: MUTED, fontFamily: "'Outfit', sans-serif", fontWeight: 600 }}>Stat Mode</span>
            <div style={{ display: 'flex', borderRadius: 6, overflow: 'hidden', border: `1px solid ${ICE}` }}>
              {([{ key: 'advanced', label: 'Advanced' }, { key: 'perGame', label: 'Per Game' }, { key: 'per40', label: 'Per 40' }] as { key: StatMode; label: string }[]).map(({ key, label }) => (
                <button key={key} onClick={() => setStatMode(key)} style={{
                  padding: '7px 16px', fontSize: 12, fontWeight: 600, cursor: 'pointer',
                  fontFamily: "'Outfit', sans-serif", border: 'none', outline: 'none',
                  background: statMode === key ? ACCENT : '#fff', color: statMode === key ? '#fff' : MUTED,
                  transition: 'background 0.15s, color 0.15s',
                }}>{label}</button>
              ))}
            </div>
          </div>
        </div>

        {/* Row 2: Min minutes + Export */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 12, color: MUTED, fontFamily: "'Outfit', sans-serif", fontWeight: 600 }}>Min. Minutes:</span>
            <div style={{ display: 'flex', borderRadius: 6, overflow: 'hidden', border: `1px solid ${ICE}` }}>
              {MIN_MINUTES_OPTIONS.map(val => (
                <button key={val} onClick={() => setMinMinutes(val)} style={{
                  padding: '5px 10px', fontSize: 11, fontWeight: 600, cursor: 'pointer',
                  fontFamily: "'Outfit', sans-serif", border: 'none', outline: 'none',
                  background: minMinutes === val ? ACCENT : '#fff', color: minMinutes === val ? '#fff' : MUTED,
                  transition: 'background 0.15s, color 0.15s',
                }}>{val === 0 ? 'All' : val}</button>
              ))}
            </div>
          </div>
          <button onClick={exportCSV} style={{
            padding: '7px 16px', fontSize: 12, fontWeight: 600, cursor: 'pointer',
            fontFamily: "'Outfit', sans-serif", border: 'none', borderRadius: 6,
            background: ACCENT, color: '#fff',
          }}>
            Export to Excel
          </button>
        </div>

        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: MUTED }}>Loading...</div>
        ) : (
          <>
            <p style={{ fontSize: 12, color: MUTED, marginBottom: 12 }}>
              Showing {sorted.length} players
            </p>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11, whiteSpace: 'nowrap' }}>
                <thead>
                  <tr style={{ borderBottom: `2px solid ${ACCENT}`, background: FROST }}>
                    <SortableHeader label="Player" sk="name" align="left" />
                    <SortableHeader label="Team" sk="teamName" align="left" />
                    <th style={{ padding: '4px 5px', textAlign: 'center', fontWeight: 700, fontSize: 10, whiteSpace: 'nowrap', color: MUTED }}>DIV</th>
                    <th style={{ padding: '4px 5px', textAlign: 'center', fontWeight: 700, fontSize: 10, whiteSpace: 'nowrap', color: MUTED }}>YR</th>
                    <SortableHeader label="G" sk="games" />
                    {statMode !== 'perGame' && <SortableHeader label="MIN" sk="totalMin" />}
                    {activeCols.map(col => <SortableHeader key={col.key} label={col.label} sk={col.key} />)}
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((p, idx) => {
                    const stats = calcStats(p, teamMap.get(p.teamName));
                    const bg = idx % 2 === 0 ? '#fff' : '#fafafa';
                    return (
                      <tr key={p.playerId} style={{ borderBottom: '1px solid #f0f0f0', background: bg }}>
                        <td style={{ padding: '5px 8px', fontWeight: 600, position: 'sticky', left: 0, background: bg, zIndex: 1, minWidth: 140, maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {p.name}
                        </td>
                        <td style={{ padding: '5px 8px', color: MUTED, minWidth: 210, maxWidth: 210, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {p.teamName}{TEAM_STATES[p.teamName] ? ` (${TEAM_STATES[p.teamName]})` : ''}
                        </td>
                        <td style={{ padding: '4px 5px', textAlign: 'center' }}>
                          <div style={{ display: 'inline-flex', alignItems: 'center',
                            background: p.division === 'njcaa-mens-d2' ? D2_COLOR : D1_COLOR,
                            borderRadius: 4, padding: '2px 6px' }}>
                            <span style={{ fontSize: 9, fontWeight: 800, color: '#fff', letterSpacing: '0.03em', whiteSpace: 'nowrap' }}>
                              {p.division === 'njcaa-mens-d2' ? 'JUCO-D2' : 'JUCO-D1'}
                            </span>
                          </div>
                        </td>
                        <td style={{ padding: '4px 5px', textAlign: 'center', fontSize: 11 }}>
                          {p.year ?? '—'}
                        </td>
                        <td style={{ padding: '5px 8px', textAlign: 'right' }}>
                          {statMode === 'perGame' ? (p.games ?? '—') : (p.cleanGames ?? '—')}
                        </td>
                        {statMode !== 'perGame' && <td style={{ padding: '5px 8px', textAlign: 'right', fontWeight: sortKey === 'totalMin' ? 600 : 400 }}>
                          {p.cleanMin ?? 0}
                        </td>}
                        {activeCols.map(col => {
                          let val: number | undefined;
                          if (col.key === 'totalMin') {
                            val = statMode === 'perGame' ? (p.minutes ?? 0) : (p.cleanMin ?? 0);
                          } else {
                            val = stats ? (stats as Record<string, number>)[col.key] : undefined;
                          }
                          return (
                            <td key={col.key} style={{
                              padding: '4px 5px', textAlign: 'right',
                              fontWeight: col.key === sortKey ? 600 : 400,
                              color: !stats ? MUTED : 'inherit',
                            }}>
                              {val != null ? (INTEGER_KEYS.has(col.key) || col.key === 'totalMin' ? Math.round(val) : val.toFixed(1)) : '—'}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </main>
    </>
  );
}
