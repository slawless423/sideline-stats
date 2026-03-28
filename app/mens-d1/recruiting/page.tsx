'use client';

import { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import SiteNavigation from '@/components/SiteNavigation';

const ACCENT  = "#3B9EFF";
const NAVY    = "#0D1F3C";
const SKY     = "#2E7DD1";
const ICE     = "#A8C8F0";
const FROST   = "#E8F2FC";
const MUTED   = "#6B7E9A";

type StatMode = 'advanced' | 'perGame' | 'per40';
type ActiveTab = 'transfers' | 'highschool';

// ── Transfer types (unchanged) ────────────────────────────────────────────────

type Transfer = {
  playerId: string | null;
  name: string;
  previousSchool: string;
  newSchool: string | null;
  division: 'D1 Men' | 'D2 Men';
  matchStatus: string;
  teamName: string | null;
  position: string | null;
  year: string | null;
  height: string | null;
  games: number | null;
  starts: number | null;
  minutes: number | null;
  fgm: number | null; fga: number | null;
  tpm: number | null; tpa: number | null;
  ftm: number | null; fta: number | null;
  orb: number | null; drb: number | null; trb: number | null;
  ast: number | null; stl: number | null; blk: number | null;
  tov: number | null; pf: number | null; points: number | null;
};

type TeamRow = {
  teamId: string; teamName: string; division: string; games: number;
  fgm: number; fga: number; tpm: number; tpa: number; ftm: number; fta: number;
  orb: number; drb: number; trb: number; ast: number; stl: number; blk: number;
  tov: number; pf: number; points: number;
  opp_fgm: number; opp_fga: number; opp_tpm: number; opp_tpa: number;
  opp_ftm: number; opp_fta: number; opp_orb: number; opp_drb: number; opp_trb: number;
  opp_ast: number; opp_stl: number; opp_blk: number; opp_tov: number;
  opp_pf: number; opp_points: number;
};

// ── High School types ─────────────────────────────────────────────────────────

type HSPlayer = {
  id: number;
  full_name: string;
  team: string;
  league: string;
  season: string;
  grad_year: number | null;
  height: string | null;
  gp: number;
  mp: number;
  pts: number;
  fgm: number; fga: number;
  fg3m: number; fg3a: number;
  ftm: number; fta: number;
  oreb: number; dreb: number; reb: number;
  ast: number; stl: number; blk: number;
  tov: number;
};

type HSTeamStats = {
  team: string;
  league: string;
  season: string;
  gp: number;
  fgm: number; fga: number;
  fg3m: number; fg3a: number;
  ftm: number; fta: number;
  oreb: number; dreb: number; reb: number;
  ast: number; stl: number; blk: number;
  tov: number; pts: number;
  opp_fgm: number; opp_fga: number;
  opp_fg3m: number; opp_fg3a: number;
  opp_ftm: number; opp_fta: number;
  opp_oreb: number; opp_dreb: number; opp_reb: number;
  opp_ast: number; opp_stl: number; opp_blk: number;
  opp_tov: number; opp_pts: number;
};

type HSSortKey =
  | 'name' | 'team' | 'league' | 'season' | 'grad_year' | 'gp'
  | 'ortg' | 'usagePct' | 'minPct' | 'shotsPct' | 'efg' | 'ts' | 'orbPct' | 'drbPct'
  | 'aRate' | 'toRate' | 'blkPct' | 'stlPct' | 'ftRate'
  | 'twopm' | 'twopa' | 'twopPct' | 'fg3m' | 'fg3a' | 'tpPct' | 'ftm' | 'fta' | 'ftPct' | 'fgPct' | 'height'
  | 'ppg' | 'rpg' | 'orbpg' | 'drbpg' | 'apg' | 'spg' | 'bpg' | 'mpg'
  | 'p40' | 'r40' | 'orb40' | 'drb40' | 'a40' | 's40' | 'b40' | 'totalMin'
  | 'twopm40' | 'twopa40' | 'twopPct40' | 'fg3m40' | 'fg3a40' | 'tpPct40' | 'ftm40' | 'fta40' | 'ftPct40';

type TransferSortKey =
  | 'name' | 'previousSchool' | 'newSchool' | 'division' | 'games'
  | 'ortg' | 'usagePct' | 'minPct' | 'shotsPct' | 'efg' | 'ts'
  | 'orbPct' | 'drbPct' | 'aRate' | 'toRate' | 'blkPct' | 'stlPct' | 'ftRate'
  | 'twopm' | 'twopa' | 'twopPct' | 'tpm' | 'tpa' | 'tpPct' | 'ftm' | 'fta' | 'ftPct'
  | 'ppg' | 'rpg' | 'orbpg' | 'drbpg' | 'apg' | 'spg' | 'bpg' | 'mpg' | 'fgPct'
  | 'p40' | 'r40' | 'orb40' | 'drb40' | 'a40' | 's40' | 'b40' | 'fc40'
  | 'twopm40' | 'twopa40' | 'twopPct40' | 'tpm40' | 'tpa40' | 'tpPct40' | 'ftm40' | 'fta40' | 'ftPct40';

const MIN_MINUTES_OPTIONS = [0, 50, 100, 150, 200, 300];

const HEIGHT_OPTIONS = [
  "5'6\"","5'7\"","5'8\"","5'9\"","5'10\"","5'11\"",
  "6'0\"","6'1\"","6'2\"","6'3\"","6'4\"","6'5\"","6'6\"","6'7\"","6'8\"","6'9\"","6'10\"","6'11\"",
  "7'0\"","7'1\"","7'2\"",
];

function heightToInches(h: string): number {
  const m = h.match(/(\d+)'(\d+)"/);
  if (!m) return 0;
  return parseInt(m[1]) * 12 + parseInt(m[2]);
}

// ── Transfer helpers (unchanged) ──────────────────────────────────────────────

function hasStats(t: Transfer): boolean {
  return t.games != null && t.games > 0 && t.minutes != null && t.minutes > 0;
}
function divLabel(div: string) { return div === 'D1 Men' ? 'D1' : 'D2'; }
function csvField(val: string | number | null | undefined): string {
  const s = val == null ? '' : String(val);
  if (s.includes(',') || s.includes('"') || s.includes('\n')) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function calcStats(t: Transfer, team: TeamRow | undefined) {
  if (!team || !hasStats(t)) return null;
  const p = {
    games: t.games!, minutes: t.minutes!,
    fgm: t.fgm!, fga: t.fga!, tpm: t.tpm!, tpa: t.tpa!,
    ftm: t.ftm!, fta: t.fta!, orb: t.orb!, drb: t.drb!, trb: t.trb!,
    ast: t.ast!, stl: t.stl!, blk: t.blk!, tov: t.tov!, pf: t.pf!, points: t.points!,
  };
  const teamMinutes = team.games * 200;
  const opp_drb = team.opp_trb - team.opp_orb;
  const drb = team.trb - team.orb;
  const Team_ORB_pct = team.orb / (team.orb + opp_drb);
  const Team_Scoring_Poss = team.fgm + (1 - Math.pow(1 - team.ftm / team.fta, 2)) * team.fta * 0.4;
  const Team_Play_pct = Team_Scoring_Poss / (team.fga + team.fta * 0.4 + team.tov);
  const Team_ORB_Weight = ((1 - Team_ORB_pct) * Team_Play_pct) / ((1 - Team_ORB_pct) * Team_Play_pct + Team_ORB_pct * (1 - Team_Play_pct));
  const teamPossTotal = team.fga + 0.44 * team.fta + team.tov;
  const usagePct = 100 * (p.fga + 0.44 * p.fta + p.tov) / (teamPossTotal / teamMinutes * p.minutes) / 5;
  const minPct = 100 * p.minutes / teamMinutes * 5;
  const shotsPct = team.fga > 0 && p.minutes > 0 ? (p.fga / team.fga) / (p.minutes / teamMinutes) / 5 * 100 : 0;
  const efg = p.fga > 0 ? ((p.fgm + 0.5 * p.tpm) / p.fga) * 100 : 0;
  const ts = (p.fga + 0.475 * p.fta) > 0 ? (p.points / (2 * (p.fga + 0.475 * p.fta))) * 100 : 0;
  const orbPct = p.minutes > 0 && (team.orb + opp_drb) > 0 ? (p.orb / p.minutes) * (teamMinutes / 5) / (team.orb + opp_drb) * 100 : 0;
  const drbPct = p.minutes > 0 && (drb + team.opp_orb) > 0 ? (p.drb / p.minutes) * (teamMinutes / 5) / (drb + team.opp_orb) * 100 : 0;
  const aRateDenom = ((p.minutes / (teamMinutes / 5)) * team.fgm) - p.fgm;
  const aRate = aRateDenom > 0 ? (p.ast / aRateDenom) * 100 : 0;
  const playerPoss = p.fga + 0.44 * p.fta + p.tov;
  const toRate = playerPoss > 0 ? (p.tov / playerPoss) * 100 : 0;
  const oppPoss = team.opp_fga - team.opp_orb + team.opp_tov + 0.475 * team.opp_fta;
  const opp2PA = team.opp_fga - team.opp_tpa;
  const blkPct = (p.minutes * opp2PA) > 0 ? 100 * (p.blk * (teamMinutes / 5)) / (p.minutes * opp2PA) : 0;
  const stlPct = (p.minutes * oppPoss) > 0 ? 100 * (p.stl * (teamMinutes / 5)) / (p.minutes * oppPoss) : 0;
  const ftRate = p.fga > 0 ? (p.fta / p.fga) * 100 : 0;
  const twopm = p.fgm - p.tpm; const twopa = p.fga - p.tpa;
  const twopPct = twopa > 0 ? (twopm / twopa) * 100 : 0;
  const tpPct = p.tpa > 0 ? (p.tpm / p.tpa) * 100 : 0;
  const ftPct = p.fta > 0 ? (p.ftm / p.fta) * 100 : 0;
  const fgPct = p.fga > 0 ? (p.fgm / p.fga) * 100 : 0;
  const qAST = ((p.minutes / (teamMinutes / 5)) * (1.14 * ((team.ast - p.ast) / team.fgm))) +
    ((((team.ast / teamMinutes) * p.minutes * 5 - p.ast) / ((team.fgm / teamMinutes) * p.minutes * 5 - p.fgm)) * (1 - p.minutes / (teamMinutes / 5)));
  const FG_Part = p.fgm * (1 - 0.5 * ((p.points - p.ftm) / (2 * p.fga)) * qAST);
  const AST_Part = 0.5 * (((team.points - team.ftm) - (p.points - p.ftm)) / (2 * (team.fga - p.fga))) * p.ast;
  const FT_Part = (1 - Math.pow(1 - p.ftm / p.fta, 2)) * 0.4 * p.fta;
  const ORB_Part = p.orb * Team_ORB_Weight * Team_Play_pct;
  const ScPoss = (FG_Part + AST_Part + FT_Part) * (1 - (team.orb / Team_Scoring_Poss) * Team_ORB_Weight * Team_Play_pct) + ORB_Part;
  const FGxPoss = (p.fga - p.fgm) * (1 - 1.07 * Team_ORB_pct);
  const FTxPoss = Math.pow(1 - p.ftm / p.fta, 2) * 0.4 * p.fta;
  const TotPoss = ScPoss + FGxPoss + FTxPoss + p.tov;
  const PProd_FG = 2 * (p.fgm + 0.5 * p.tpm) * (1 - 0.5 * ((p.points - p.ftm) / (2 * p.fga)) * qAST);
  const PProd_AST = 2 * ((team.fgm - p.fgm + 0.5 * (team.tpm - p.tpm)) / (team.fgm - p.fgm)) *
    0.5 * (((team.points - team.ftm) - (p.points - p.ftm)) / (2 * (team.fga - p.fga))) * p.ast;
  const PProd_ORB = p.orb * Team_ORB_Weight * Team_Play_pct *
    (team.points / (team.fgm + (1 - Math.pow(1 - team.ftm / team.fta, 2)) * 0.4 * team.fta));
  const PProd = (PProd_FG + PProd_AST + p.ftm) * (1 - (team.orb / Team_Scoring_Poss) * Team_ORB_Weight * Team_Play_pct) + PProd_ORB;
  const ortg = TotPoss > 0 ? 100 * PProd / TotPoss : 0;
  const g = p.games || 1; const m = p.minutes || 1;
  return {
    ortg, usagePct, minPct, shotsPct, efg, ts, orbPct, drbPct, aRate, toRate, blkPct, stlPct, ftRate,
    twopm, twopa, twopPct, tpm: p.tpm, tpa: p.tpa, tpPct, ftm: p.ftm, fta: p.fta, ftPct, fgPct,
    ppg: p.points/g, rpg: p.trb/g, orbpg: p.orb/g, drbpg: p.drb/g,
    apg: p.ast/g, spg: p.stl/g, bpg: p.blk/g, mpg: p.minutes/g,
    p40: p.points/m*40, r40: p.trb/m*40, orb40: p.orb/m*40, drb40: p.drb/m*40,
    a40: p.ast/m*40, s40: p.stl/m*40, b40: p.blk/m*40, fc40: p.pf/m*40,
    twopm40: twopm/m*40, twopa40: twopa/m*40, twopPct40: twopPct,
    tpm40: p.tpm/m*40, tpa40: p.tpa/m*40, tpPct40: tpPct,
    ftm40: p.ftm/m*40, fta40: p.fta/m*40, ftPct40: ftPct,
  };
}

// ── High School stat calc ─────────────────────────────────────────────────────
// Identical formulas to calcStats — only field name differences:
//   p.minutes → p.mp | p.points → p.pts | p.tpm → p.fg3m | p.tpa → p.fg3a
//   p.trb → p.reb | team.tpm → team.fg3m | team.opp_trb → team.opp_reb | team.opp_tpa → team.opp_fg3a

function calcHSStats(p: HSPlayer, team: HSTeamStats | undefined) {
  if (!team || p.gp === 0 || p.mp === 0) return null;
  const teamMinutes = team.gp * 200;
  const opp_drb = team.opp_reb - team.opp_oreb;
  const drb = team.reb - team.oreb;
  const Team_ORB_pct = team.oreb / (team.oreb + opp_drb);
  const Team_Scoring_Poss = team.fgm + (1 - Math.pow(1 - team.ftm / team.fta, 2)) * team.fta * 0.4;
  const Team_Play_pct = Team_Scoring_Poss / (team.fga + team.fta * 0.4 + team.tov);
  const Team_ORB_Weight = ((1 - Team_ORB_pct) * Team_Play_pct) / ((1 - Team_ORB_pct) * Team_Play_pct + Team_ORB_pct * (1 - Team_Play_pct));
  const teamPossTotal = team.fga + 0.44 * team.fta + team.tov;
  const usagePct = 100 * (p.fga + 0.44 * p.fta + p.tov) / (teamPossTotal / teamMinutes * p.mp) / 5;
  const minPct = 100 * p.mp / teamMinutes * 5;
  const shotsPct = team.fga > 0 && p.mp > 0 ? (p.fga / team.fga) / (p.mp / teamMinutes) / 5 * 100 : 0;
  const efg = p.fga > 0 ? ((p.fgm + 0.5 * p.fg3m) / p.fga) * 100 : 0;
  const ts = (p.fga + 0.475 * p.fta) > 0 ? (p.pts / (2 * (p.fga + 0.475 * p.fta))) * 100 : 0;
  const orbPct = p.mp > 0 && (team.oreb + opp_drb) > 0 ? (p.oreb / p.mp) * (teamMinutes / 5) / (team.oreb + opp_drb) * 100 : 0;
  const drbPct = p.mp > 0 && (drb + team.opp_oreb) > 0 ? (p.dreb / p.mp) * (teamMinutes / 5) / (drb + team.opp_oreb) * 100 : 0;
  const aRateDenom = ((p.mp / (teamMinutes / 5)) * team.fgm) - p.fgm;
  const aRate = aRateDenom > 0 ? (p.ast / aRateDenom) * 100 : 0;
  const playerPoss = p.fga + 0.44 * p.fta + p.tov;
  const toRate = playerPoss > 0 ? (p.tov / playerPoss) * 100 : 0;
  const oppPoss = team.opp_fga - team.opp_oreb + team.opp_tov + 0.475 * team.opp_fta;
  const opp2PA = team.opp_fga - team.opp_fg3a;
  const blkPct = (p.mp * opp2PA) > 0 ? 100 * (p.blk * (teamMinutes / 5)) / (p.mp * opp2PA) : 0;
  const stlPct = (p.mp * oppPoss) > 0 ? 100 * (p.stl * (teamMinutes / 5)) / (p.mp * oppPoss) : 0;
  const ftRate = p.fga > 0 ? (p.fta / p.fga) * 100 : 0;
  const twopm = p.fgm - p.fg3m; const twopa = p.fga - p.fg3a;
  const twopPct = twopa > 0 ? (twopm / twopa) * 100 : 0;
  const tpPct = p.fg3a > 0 ? (p.fg3m / p.fg3a) * 100 : 0;
  const ftPct = p.fta > 0 ? (p.ftm / p.fta) * 100 : 0;
  const fgPct = p.fga > 0 ? (p.fgm / p.fga) * 100 : 0;
  const qAST = ((p.mp / (teamMinutes / 5)) * (1.14 * ((team.ast - p.ast) / team.fgm))) +
    ((((team.ast / teamMinutes) * p.mp * 5 - p.ast) / ((team.fgm / teamMinutes) * p.mp * 5 - p.fgm)) * (1 - p.mp / (teamMinutes / 5)));
  const FG_Part = p.fgm * (1 - 0.5 * ((p.pts - p.ftm) / (2 * p.fga)) * qAST);
  const AST_Part = 0.5 * (((team.pts - team.ftm) - (p.pts - p.ftm)) / (2 * (team.fga - p.fga))) * p.ast;
  const FT_Part = (1 - Math.pow(1 - p.ftm / p.fta, 2)) * 0.4 * p.fta;
  const ORB_Part = p.oreb * Team_ORB_Weight * Team_Play_pct;
  const ScPoss = (FG_Part + AST_Part + FT_Part) * (1 - (team.oreb / Team_Scoring_Poss) * Team_ORB_Weight * Team_Play_pct) + ORB_Part;
  const FGxPoss = (p.fga - p.fgm) * (1 - 1.07 * Team_ORB_pct);
  const FTxPoss = Math.pow(1 - p.ftm / p.fta, 2) * 0.4 * p.fta;
  const TotPoss = ScPoss + FGxPoss + FTxPoss + p.tov;
  const PProd_FG = 2 * (p.fgm + 0.5 * p.fg3m) * (1 - 0.5 * ((p.pts - p.ftm) / (2 * p.fga)) * qAST);
  const PProd_AST = 2 * ((team.fgm - p.fgm + 0.5 * (team.fg3m - p.fg3m)) / (team.fgm - p.fgm)) *
    0.5 * (((team.pts - team.ftm) - (p.pts - p.ftm)) / (2 * (team.fga - p.fga))) * p.ast;
  const PProd_ORB = p.oreb * Team_ORB_Weight * Team_Play_pct *
    (team.pts / (team.fgm + (1 - Math.pow(1 - team.ftm / team.fta, 2)) * 0.4 * team.fta));
  const PProd = (PProd_FG + PProd_AST + p.ftm) * (1 - (team.oreb / Team_Scoring_Poss) * Team_ORB_Weight * Team_Play_pct) + PProd_ORB;
  const ortg = TotPoss > 0 ? 100 * PProd / TotPoss : 0;
  const g = p.gp || 1; const m = p.mp || 1;
  return {
    ortg, usagePct, minPct, shotsPct, efg, ts, orbPct, drbPct, aRate, toRate, blkPct, stlPct, ftRate,
    twopm, twopa, twopPct, fg3m: p.fg3m, fg3a: p.fg3a, tpPct, ftm: p.ftm, fta: p.fta, ftPct, fgPct,
    ppg: p.pts/g, rpg: p.reb/g, orbpg: p.oreb/g, drbpg: p.dreb/g,
    apg: p.ast/g, spg: p.stl/g, bpg: p.blk/g, mpg: p.mp/g,
    totalMin: p.mp,
    p40: p.pts/m*40, r40: p.reb/m*40, orb40: p.oreb/m*40, drb40: p.dreb/m*40,
    a40: p.ast/m*40, s40: p.stl/m*40, b40: p.blk/m*40,
    twopm40: twopm/m*40, twopa40: twopa/m*40, twopPct40: twopPct,
    fg3m40: p.fg3m/m*40, fg3a40: p.fg3a/m*40, tpPct40: tpPct,
    ftm40: p.ftm/m*40, fta40: p.fta/m*40, ftPct40: ftPct,
  };
}

// ── Column definitions ────────────────────────────────────────────────────────

const ADVANCED_COLS: { label: string; key: TransferSortKey }[] = [
  { label: '%Min', key: 'minPct' }, { label: 'ORtg', key: 'ortg' },
  { label: '%Usg', key: 'usagePct' }, { label: '%Shots', key: 'shotsPct' },
  { label: 'eFG%', key: 'efg' }, { label: 'TS%', key: 'ts' },
  { label: 'OR%', key: 'orbPct' }, { label: 'DR%', key: 'drbPct' },
  { label: 'ARate', key: 'aRate' }, { label: 'TORate', key: 'toRate' },
  { label: 'FTRate', key: 'ftRate' }, { label: '2PM', key: 'twopm' },
  { label: '2PA', key: 'twopa' }, { label: '2P%', key: 'twopPct' },
  { label: '3PM', key: 'tpm' }, { label: '3PA', key: 'tpa' },
  { label: '3P%', key: 'tpPct' }, { label: 'FTM', key: 'ftm' },
  { label: 'FTA', key: 'fta' }, { label: 'FT%', key: 'ftPct' },
];
const PER_GAME_COLS: { label: string; key: TransferSortKey }[] = [
  { label: 'PPG', key: 'ppg' }, { label: 'RPG', key: 'rpg' },
  { label: 'ORB', key: 'orbpg' }, { label: 'DRB', key: 'drbpg' },
  { label: 'APG', key: 'apg' }, { label: 'SPG', key: 'spg' },
  { label: 'BPG', key: 'bpg' }, { label: 'MPG', key: 'mpg' },
  { label: 'FG%', key: 'fgPct' }, { label: '2PM', key: 'twopm' },
  { label: '2PA', key: 'twopa' }, { label: '2P%', key: 'twopPct' },
  { label: '3PM', key: 'tpm' }, { label: '3PA', key: 'tpa' },
  { label: '3P%', key: 'tpPct' }, { label: 'FTM', key: 'ftm' },
  { label: 'FTA', key: 'fta' }, { label: 'FT%', key: 'ftPct' },
];
const PER_40_COLS: { label: string; key: TransferSortKey }[] = [
  { label: 'PTS/40', key: 'p40' }, { label: 'REB/40', key: 'r40' },
  { label: 'ORB/40', key: 'orb40' }, { label: 'DRB/40', key: 'drb40' },
  { label: 'AST/40', key: 'a40' }, { label: 'STL/40', key: 's40' },
  { label: 'BLK/40', key: 'b40' }, { label: 'FC/40', key: 'fc40' },
  { label: 'FG%', key: 'fgPct' }, { label: '2PM', key: 'twopm40' },
  { label: '2PA', key: 'twopa40' }, { label: '2P%', key: 'twopPct40' },
  { label: '3PM', key: 'tpm40' }, { label: '3PA', key: 'tpa40' },
  { label: '3P%', key: 'tpPct40' }, { label: 'FTM', key: 'ftm40' },
  { label: 'FTA', key: 'fta40' }, { label: 'FT%', key: 'ftPct40' },
];

const HS_ADVANCED_COLS: { label: string; key: HSSortKey }[] = [
  { label: '%Min', key: 'minPct' }, { label: 'ORtg', key: 'ortg' },
  { label: '%Usg', key: 'usagePct' }, { label: '%Shots', key: 'shotsPct' },
  { label: 'eFG%', key: 'efg' }, { label: 'TS%', key: 'ts' },
  { label: 'OR%', key: 'orbPct' }, { label: 'DR%', key: 'drbPct' },
  { label: 'ARate', key: 'aRate' }, { label: 'TORate', key: 'toRate' },
  { label: 'Blk%', key: 'blkPct' }, { label: 'Stl%', key: 'stlPct' },
  { label: 'FTRate', key: 'ftRate' }, { label: '2PM', key: 'twopm' },
  { label: '2PA', key: 'twopa' }, { label: '2P%', key: 'twopPct' },
  { label: '3PM', key: 'fg3m' }, { label: '3PA', key: 'fg3a' },
  { label: '3P%', key: 'tpPct' }, { label: 'FTM', key: 'ftm' },
  { label: 'FTA', key: 'fta' }, { label: 'FT%', key: 'ftPct' },
];
const HS_PER_GAME_COLS: { label: string; key: HSSortKey }[] = [
  { label: 'PPG', key: 'ppg' }, { label: 'RPG', key: 'rpg' },
  { label: 'ORB', key: 'orbpg' }, { label: 'DRB', key: 'drbpg' },
  { label: 'APG', key: 'apg' }, { label: 'SPG', key: 'spg' },
  { label: 'BPG', key: 'bpg' }, { label: '2PM', key: 'twopm' },
  { label: '2PA', key: 'twopa' }, { label: '2P%', key: 'twopPct' },
  { label: '3PM', key: 'fg3m' }, { label: '3PA', key: 'fg3a' },
  { label: '3P%', key: 'tpPct' }, { label: 'FTM', key: 'ftm' },
  { label: 'FTA', key: 'fta' }, { label: 'FT%', key: 'ftPct' },
];
const HS_PER_40_COLS: { label: string; key: HSSortKey }[] = [
  { label: 'PTS/40', key: 'p40' }, { label: 'REB/40', key: 'r40' },
  { label: 'ORB/40', key: 'orb40' }, { label: 'DRB/40', key: 'drb40' },
  { label: 'AST/40', key: 'a40' }, { label: 'STL/40', key: 's40' },
  { label: 'BLK/40', key: 'b40' }, { label: '2PM', key: 'twopm40' },
  { label: '2PA', key: 'twopa40' }, { label: '2P%', key: 'twopPct40' },
  { label: '3PM', key: 'fg3m40' }, { label: '3PA', key: 'fg3a40' },
  { label: '3P%', key: 'tpPct40' }, { label: 'FTM', key: 'ftm40' },
  { label: 'FTA', key: 'fta40' }, { label: 'FT%', key: 'ftPct40' },
];

const INTEGER_KEYS = new Set(['twopm','twopa','tpm','tpa','fg3m','fg3a','ftm','fta',
  'twopm40','twopa40','tpm40','tpa40','fg3m40','fg3a40','ftm40','fta40', 'totalMin']);

// ── Main component ────────────────────────────────────────────────────────────

export default function MensRecruitingPage() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('transfers');

  // Transfer state
  const [transfers, setTransfers]   = useState<Transfer[]>([]);
  const [teamMap, setTeamMap]       = useState<Map<string, TeamRow>>(new Map());
  const [transferLoading, setTransferLoading] = useState(true);
  const [divFilter, setDivFilter]   = useState<'all' | 'D1 Men' | 'D2 Men'>('all');
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);

  // HS state
  const [hsPlayers, setHsPlayers]   = useState<HSPlayer[]>([]);
  const [hsTeamMap, setHsTeamMap]   = useState<Map<string, HSTeamStats>>(new Map());
  const [hsLoading, setHsLoading]   = useState(true);
  const [leagueFilter, setLeagueFilter] = useState('all');
  const [seasonFilter, setSeasonFilter] = useState('all');
  const [gradYearFilter, setGradYearFilter] = useState('all');
  const [minHeightFilter, setMinHeightFilter] = useState('');
  const [maxHeightFilter, setMaxHeightFilter] = useState('');
  const [hsFilterOpen, setHsFilterOpen] = useState(false);
  const [hsSortKey, setHsSortKey]   = useState<HSSortKey>('ppg');
  const [hsSortOrder, setHsSortOrder] = useState<'asc' | 'desc'>('desc');

  // Shared state
  const [statMode, setStatMode]     = useState<StatMode>('perGame');
  const [searchTerm, setSearchTerm] = useState('');
  const [minMinutes, setMinMinutes] = useState(0);
  const [transferSortKey, setTransferSortKey] = useState<TransferSortKey>('minPct');
  const [transferSortOrder, setTransferSortOrder] = useState<'asc' | 'desc'>('desc');

  useEffect(() => {
    fetch('/api/recruiting/mens/transfers')
      .then(r => r.json())
      .then(({ transfers, teams, lastUpdated }) => {
        setTransfers(transfers ?? []);
        const map = new Map<string, TeamRow>();
        for (const t of (teams ?? [])) map.set(t.teamName, t);
        setTeamMap(map);
        setLastUpdated(lastUpdated ?? null);
        setTransferLoading(false);
      })
      .catch(() => setTransferLoading(false));
  }, []);

  useEffect(() => {
    fetch('/api/recruiting/mens/highschool')
      .then(r => r.json())
      .then(({ players, teams }) => {
        setHsPlayers(players ?? []);
        const map = new Map<string, HSTeamStats>();
        for (const t of (teams ?? [])) map.set(`${t.team}|||${t.season}`, t);
        setHsTeamMap(map);
        setHsLoading(false);
      })
      .catch(() => setHsLoading(false));
  }, []);

  // Transfer handlers
  const handleTransferSort = (key: TransferSortKey) => {
    if (transferSortKey === key) setTransferSortOrder(o => o === 'asc' ? 'desc' : 'asc');
    else { setTransferSortKey(key); setTransferSortOrder('desc'); }
  };

  // HS handlers
  const handleHsSort = (key: HSSortKey) => {
    if (hsSortKey === key) setHsSortOrder(o => o === 'asc' ? 'desc' : 'asc');
    else { setHsSortKey(key); setHsSortOrder('desc'); }
  };

  const activeCols = statMode === 'advanced' ? ADVANCED_COLS : statMode === 'perGame' ? PER_GAME_COLS : PER_40_COLS;
  const hsActiveCols = statMode === 'advanced' ? HS_ADVANCED_COLS : statMode === 'perGame' ? HS_PER_GAME_COLS : HS_PER_40_COLS;

  // Transfer filtering/sorting
  const filteredTransfers = useMemo(() => transfers.filter(t => {
    if (!hasStats(t)) return false;
    if (divFilter !== 'all' && t.division !== divFilter) return false;
    if (minMinutes > 0 && (t.minutes ?? 0) < minMinutes) return false;
    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      if (!t.name.toLowerCase().includes(q) &&
          !t.previousSchool.toLowerCase().includes(q) &&
          !(t.newSchool ?? '').toLowerCase().includes(q)) return false;
    }
    return true;
  }), [transfers, divFilter, searchTerm, minMinutes]);

  const sortedTransfers = useMemo(() => [...filteredTransfers].sort((a, b) => {
    if (transferSortKey === 'name') return transferSortOrder === 'asc' ? a.name.localeCompare(b.name) : b.name.localeCompare(a.name);
    if (transferSortKey === 'previousSchool') return transferSortOrder === 'asc' ? a.previousSchool.localeCompare(b.previousSchool) : b.previousSchool.localeCompare(a.previousSchool);
    if (transferSortKey === 'newSchool') { const an = a.newSchool??'', bn = b.newSchool??''; return transferSortOrder==='asc'?an.localeCompare(bn):bn.localeCompare(an); }
    if (transferSortKey === 'division') return transferSortOrder==='asc'?a.division.localeCompare(b.division):b.division.localeCompare(a.division);
    if (transferSortKey === 'games') { const ag=a.games??0,bg=b.games??0; return transferSortOrder==='asc'?ag-bg:bg-ag; }
    const as_ = calcStats(a, teamMap.get(a.teamName??''));
    const bs_ = calcStats(b, teamMap.get(b.teamName??''));
    if (!as_ && !bs_) return 0; if (!as_) return 1; if (!bs_) return -1;
    const av = (as_ as Record<string,number>)[transferSortKey]??0;
    const bv = (bs_ as Record<string,number>)[transferSortKey]??0;
    return transferSortOrder==='asc'?av-bv:bv-av;
  }), [filteredTransfers, transferSortKey, transferSortOrder, teamMap]);

  // HS derived values
  const leagues = useMemo(() => ['all', ...Array.from(new Set(hsPlayers.map(p => p.league))).sort()], [hsPlayers]);
  const seasons = useMemo(() => ['all', ...Array.from(new Set(hsPlayers.map(p => p.season))).sort().reverse()], [hsPlayers]);
  const gradYears = useMemo(() => ['all', ...Array.from(new Set(hsPlayers.filter(p => p.grad_year).map(p => String(p.grad_year)))).sort()], [hsPlayers]);

  const hsActiveFilterCount = [
    leagueFilter !== 'all', seasonFilter !== 'all',
    gradYearFilter !== 'all', minHeightFilter !== '', maxHeightFilter !== '',
  ].filter(Boolean).length;

  const filteredHs = useMemo(() => hsPlayers.filter(p => {
    if (p.gp === 0 || p.mp === 0) return false;
    if (minMinutes > 0 && p.mp < minMinutes) return false;
    if (leagueFilter !== 'all' && p.league !== leagueFilter) return false;
    if (seasonFilter !== 'all' && p.season !== seasonFilter) return false;
    if (gradYearFilter !== 'all' && String(p.grad_year) !== gradYearFilter) return false;
    if (minHeightFilter && p.height) {
      if (heightToInches(p.height) < heightToInches(minHeightFilter)) return false;
    }
    if (maxHeightFilter && p.height) {
      if (heightToInches(p.height) > heightToInches(maxHeightFilter)) return false;
    }
    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      if (!p.full_name.toLowerCase().includes(q) && !p.team.toLowerCase().includes(q)) return false;
    }
    return true;
  }), [hsPlayers, leagueFilter, seasonFilter, gradYearFilter, minHeightFilter, maxHeightFilter, searchTerm, minMinutes]);

  const sortedHs = useMemo(() => [...filteredHs].sort((a, b) => {
    if (hsSortKey === 'name') return hsSortOrder==='asc'?a.full_name.localeCompare(b.full_name):b.full_name.localeCompare(a.full_name);
    if (hsSortKey === 'team') return hsSortOrder==='asc'?a.team.localeCompare(b.team):b.team.localeCompare(a.team);
    if (hsSortKey === 'gp') return hsSortOrder==='asc'?a.gp-b.gp:b.gp-a.gp;
    if (hsSortKey === 'grad_year') { const ay=a.grad_year??0,by=b.grad_year??0; return hsSortOrder==='asc'?ay-by:by-ay; }
    if (hsSortKey === 'height') {
      const ah = heightToInches(a.height??''), bh = heightToInches(b.height??'');
      return hsSortOrder==='asc'?ah-bh:bh-ah;
    }
    const as_ = calcHSStats(a, hsTeamMap.get(`${a.team}|||${a.season}`));
    const bs_ = calcHSStats(b, hsTeamMap.get(`${b.team}|||${b.season}`));
    if (!as_ && !bs_) return 0; if (!as_) return 1; if (!bs_) return -1;
    const av = (as_ as Record<string,number>)[hsSortKey]??0;
    const bv = (bs_ as Record<string,number>)[hsSortKey]??0;
    return hsSortOrder==='asc'?av-bv:bv-av;
  }), [filteredHs, hsSortKey, hsSortOrder, hsTeamMap]);

  const exportCSV = () => {
    if (activeTab === 'transfers') {
      const headers = ['Name','From','To','Div','Yr','Ht','G',...activeCols.map(c=>c.label)];
      const rows = sortedTransfers.map(t => {
        const stats = calcStats(t, teamMap.get(t.teamName??''));
        return [csvField(t.name),csvField(t.previousSchool),csvField(t.newSchool??''),csvField(t.division),
          csvField(t.year??''),csvField(t.height??''),csvField(t.games??''),
          ...activeCols.map(c => { const v=stats?(stats as Record<string,number>)[c.key]:undefined; if(v==null)return''; return INTEGER_KEYS.has(c.key)?String(Math.round(v)):v.toFixed(1); })];
      });
      const csv=[headers.map(csvField),...rows].map(r=>r.join(',')).join('\n');
      const blob=new Blob([csv],{type:'text/csv'});const url=URL.createObjectURL(blob);
      const a=document.createElement('a');a.href=url;a.download='transfers.csv';a.click();URL.revokeObjectURL(url);
    } else {
      const headers = ['Name','Team','League','Season','Grad Year','G','MP',...hsActiveCols.map(c=>c.label)];
      const rows = sortedHs.map(p => {
        const stats = calcHSStats(p, hsTeamMap.get(`${p.team}|||${p.season}`));
        return [csvField(p.full_name),csvField(p.team),csvField(p.league),csvField(p.season),
          csvField(p.grad_year??''),csvField(p.gp),csvField(p.mp),
          ...hsActiveCols.map(c => { const v=stats?(stats as Record<string,number>)[c.key]:undefined; if(v==null)return''; return INTEGER_KEYS.has(c.key)?String(Math.round(v)):v.toFixed(1); })];
      });
      const csv=[headers.map(csvField),...rows].map(r=>r.join(',')).join('\n');
      const blob=new Blob([csv],{type:'text/csv'});const url=URL.createObjectURL(blob);
      const a=document.createElement('a');a.href=url;a.download='highschool.csv';a.click();URL.revokeObjectURL(url);
    }
  };

  const withStats = transfers.filter(hasStats).length;

  const tabStyle = (tab: ActiveTab) => ({
    padding: '10px 20px',
    fontFamily: "'Outfit', sans-serif",
    fontSize: 14, fontWeight: 700, cursor: 'pointer',
    color: activeTab === tab ? SKY : MUTED,
    borderBottom: activeTab === tab ? `3px solid ${ACCENT}` : '3px solid transparent',
    marginBottom: -2,
    letterSpacing: '0.01em',
    background: 'none', border: 'none', outline: 'none',
    transition: 'color 0.15s',
  });

  const TransferSortableHeader = ({ label, sk, align='right' }: { label: string; sk: TransferSortKey; align?: 'left'|'right'|'center' }) => (
    <th onClick={() => handleTransferSort(sk)} style={{
      padding: '6px 8px', textAlign: align, cursor: 'pointer', userSelect: 'none',
      fontWeight: 700, fontSize: 10, whiteSpace: 'nowrap',
      background: transferSortKey===sk ? ACCENT : 'transparent',
      color: transferSortKey===sk ? '#fff' : 'inherit', transition: 'background 0.15s',
    }}>
      {label} {transferSortKey===sk && (transferSortOrder==='desc'?'↓':'↑')}
    </th>
  );

  const HSSortableHeader = ({ label, sk, align='right' }: { label: string; sk: HSSortKey; align?: 'left'|'right'|'center' }) => (
    <th onClick={() => handleHsSort(sk)} style={{
      padding: '6px 8px', textAlign: align, cursor: 'pointer', userSelect: 'none',
      fontWeight: 700, fontSize: 10, whiteSpace: 'nowrap',
      background: hsSortKey===sk ? ACCENT : 'transparent',
      color: hsSortKey===sk ? '#fff' : 'inherit', transition: 'background 0.15s',
    }}>
      {label} {hsSortKey===sk && (hsSortOrder==='desc'?'↓':'↑')}
    </th>
  );

  return (
    <>
      <SiteNavigation currentDivision="mens-d1" currentPage="recruiting" divisionPath="/mens-d1" />
      <main style={{ maxWidth: '100%', margin: '0 auto', padding: 20 }}>

        {/* Sub-nav tabs */}
        <div style={{ display: 'flex', gap: 0, borderBottom: `2px solid ${FROST}`, marginBottom: 24 }}>
          <button style={tabStyle('transfers')} onClick={() => setActiveTab('transfers')}>Transfers</button>
          <button style={tabStyle('highschool')} onClick={() => setActiveTab('highschool')}>High School</button>
        </div>

        {/* ── TRANSFERS TAB ── */}
        {activeTab === 'transfers' && (
          <>
            {/* Row 1: Search + Division filter + Stat mode */}
            <div style={{ display: 'flex', gap: 12, marginBottom: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
              <input type="text" placeholder="Search player, previous school, or destination..." value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                style={{ padding: '8px 12px', border: `1px solid ${ICE}`, borderRadius: 6, fontSize: 13, flex: 1, minWidth: 200, outline: 'none', fontFamily: "'Outfit', sans-serif" }} />

              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span style={{ fontSize: 10, color: MUTED, fontFamily: "'Outfit', sans-serif", fontWeight: 600 }}>Division</span>
                <div style={{ display: 'flex', borderRadius: 6, overflow: 'hidden', border: `1px solid ${ICE}` }}>
                  {(['all','D1 Men','D2 Men'] as const).map(val => (
                    <button key={val} onClick={() => setDivFilter(val)} style={{
                      padding: '7px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer',
                      fontFamily: "'Outfit', sans-serif", border: 'none', outline: 'none',
                      background: divFilter===val ? NAVY : '#fff', color: divFilter===val ? '#fff' : MUTED,
                      transition: 'background 0.15s, color 0.15s',
                    }}>{val==='all'?'All':val}</button>
                  ))}
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span style={{ fontSize: 10, color: MUTED, fontFamily: "'Outfit', sans-serif", fontWeight: 600 }}>Stat Mode</span>
                <div style={{ display: 'flex', borderRadius: 6, overflow: 'hidden', border: `1px solid ${ICE}` }}>
                  {([{key:'advanced',label:'Advanced'},{key:'perGame',label:'Per Game'},{key:'per40',label:'Per 40'}] as {key:StatMode;label:string}[]).map(({key,label}) => (
                    <button key={key} onClick={() => setStatMode(key)} style={{
                      padding: '7px 16px', fontSize: 12, fontWeight: 600, cursor: 'pointer',
                      fontFamily: "'Outfit', sans-serif", border: 'none', outline: 'none',
                      background: statMode===key ? ACCENT : '#fff', color: statMode===key ? '#fff' : MUTED,
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
                      background: minMinutes===val ? ACCENT : '#fff', color: minMinutes===val ? '#fff' : MUTED,
                      transition: 'background 0.15s, color 0.15s',
                    }}>{val === 0 ? 'All' : val}</button>
                  ))}
                </div>
              </div>
              <button onClick={exportCSV} style={{
                padding: '7px 16px', fontSize: 12, fontWeight: 600, cursor: 'pointer',
                fontFamily: "'Outfit', sans-serif", border: 'none', borderRadius: 6,
                background: ACCENT, color: '#fff',
              }}>Export to Excel</button>
            </div>

            {transferLoading ? (
              <div style={{ padding: 40, textAlign: 'center', color: MUTED }}>Loading...</div>
            ) : (
              <>
                <p style={{ fontSize: 12, color: MUTED, marginBottom: 4 }}>
                  Showing {sortedTransfers.length} of {withStats} transfers with stats
                </p>
                {lastUpdated && (
                  <p style={{ fontSize: 11, color: MUTED, marginBottom: 12, fontFamily: "'Outfit', sans-serif" }}>
                    Database updated: {new Date(lastUpdated).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
                  </p>
                )}
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11, whiteSpace: 'nowrap' }}>
                    <thead>
                      <tr style={{ borderBottom: `2px solid ${ACCENT}`, background: FROST }}>
                        <TransferSortableHeader label="Player" sk="name" align="left" />
                        <TransferSortableHeader label="From" sk="previousSchool" align="left" />
                        <TransferSortableHeader label="To" sk="newSchool" align="left" />
                        <TransferSortableHeader label="Div" sk="division" align="center" />
                        <th style={{ padding: '6px 8px', textAlign: 'center', fontWeight: 700, fontSize: 10 }}>Yr</th>
                        <th style={{ padding: '6px 8px', textAlign: 'center', fontWeight: 700, fontSize: 10 }}>Ht</th>
                        <TransferSortableHeader label="G" sk="games" />
                        {activeCols.map(col => <TransferSortableHeader key={col.key} label={col.label} sk={col.key as TransferSortKey} />)}
                      </tr>
                    </thead>
                    <tbody>
                      {sortedTransfers.map((t, idx) => {
                        const stats = calcStats(t, teamMap.get(t.teamName??''));
                        const bg = idx%2===0 ? '#fff' : '#fafafa';
                        return (
                          <tr key={`${t.name}-${t.previousSchool}`} style={{ borderBottom: '1px solid #f0f0f0', background: bg }}>
                            <td style={{ padding: '5px 8px', fontWeight: 600, position: 'sticky', left: 0, background: bg, zIndex: 1, minWidth: 140, maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.name}</td>
                            <td style={{ padding: '5px 8px', color: MUTED, minWidth: 130, maxWidth: 130, overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.previousSchool || '—'}</td>
                            <td style={{ padding: '5px 8px', minWidth: 120, maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {t.newSchool ? <span style={{ display: 'inline-block', padding: '1px 6px', borderRadius: 4, fontSize: 10, fontWeight: 600, background: '#e8f5e9', color: '#2e7d32' }}>{t.newSchool}</span>
                                : <span style={{ color: MUTED, fontSize: 10 }}>Uncommitted</span>}
                            </td>
                            <td style={{ padding: '5px 8px', textAlign: 'center' }}>
                              <span style={{ display: 'inline-block', padding: '2px 6px', borderRadius: 4, fontSize: 10, fontWeight: 700, background: t.division==='D1 Men' ? NAVY : SKY, color: '#fff' }}>{divLabel(t.division)}</span>
                            </td>
                            <td style={{ padding: '5px 8px', textAlign: 'center' }}>{t.year || '—'}</td>
                            <td style={{ padding: '5px 8px', textAlign: 'center' }}>{t.height || '—'}</td>
                            <td style={{ padding: '5px 8px', textAlign: 'right' }}>{t.games ?? '—'}</td>
                            {activeCols.map(col => {
                              const val = stats ? (stats as Record<string,number>)[col.key] : undefined;
                              return (
                                <td key={col.key} style={{ padding: '5px 8px', textAlign: 'right', fontWeight: col.key===transferSortKey?600:400, color: !stats?MUTED:'inherit' }}>
                                  {val!=null ? (INTEGER_KEYS.has(col.key) ? Math.round(val) : val.toFixed(1)) : '—'}
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
          </>
        )}

        {/* ── HIGH SCHOOL TAB ── */}
        {activeTab === 'highschool' && (
          <>
            {/* Filter popup overlay */}
            {hsFilterOpen && (
              <div style={{
                position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.3)', zIndex: 1000,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }} onClick={() => setHsFilterOpen(false)}>
                <div style={{
                  background: '#fff', borderRadius: 12, padding: 28, width: 480, maxWidth: '95vw',
                  boxShadow: '0 8px 40px rgba(0,0,0,0.18)', fontFamily: "'Outfit', sans-serif",
                }} onClick={e => e.stopPropagation()}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                    <span style={{ fontSize: 16, fontWeight: 700, color: NAVY }}>Filters</span>
                    <button onClick={() => setHsFilterOpen(false)} style={{
                      background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: MUTED, lineHeight: 1,
                    }}>✕</button>
                  </div>

                  {/* League */}
                  <div style={{ marginBottom: 20 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: MUTED, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>League</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {leagues.map(val => (
                        <button key={val} onClick={() => setLeagueFilter(val)} style={{
                          padding: '6px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer', borderRadius: 6,
                          fontFamily: "'Outfit', sans-serif", border: `1px solid ${leagueFilter===val ? NAVY : ICE}`,
                          background: leagueFilter===val ? NAVY : '#fff', color: leagueFilter===val ? '#fff' : MUTED,
                          transition: 'all 0.15s',
                        }}>{val === 'all' ? 'All' : val}</button>
                      ))}
                    </div>
                  </div>

                  {/* Season */}
                  <div style={{ marginBottom: 20 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: MUTED, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Season</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {seasons.map(val => (
                        <button key={val} onClick={() => setSeasonFilter(val)} style={{
                          padding: '6px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer', borderRadius: 6,
                          fontFamily: "'Outfit', sans-serif", border: `1px solid ${seasonFilter===val ? NAVY : ICE}`,
                          background: seasonFilter===val ? NAVY : '#fff', color: seasonFilter===val ? '#fff' : MUTED,
                          transition: 'all 0.15s',
                        }}>{val === 'all' ? 'All' : val}</button>
                      ))}
                    </div>
                  </div>

                  {/* Grad Year */}
                  <div style={{ marginBottom: 20 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: MUTED, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Grad Year</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {gradYears.map(val => (
                        <button key={val} onClick={() => setGradYearFilter(val)} style={{
                          padding: '6px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer', borderRadius: 6,
                          fontFamily: "'Outfit', sans-serif", border: `1px solid ${gradYearFilter===val ? NAVY : ICE}`,
                          background: gradYearFilter===val ? NAVY : '#fff', color: gradYearFilter===val ? '#fff' : MUTED,
                          transition: 'all 0.15s',
                        }}>{val === 'all' ? 'All' : val}</button>
                      ))}
                    </div>
                  </div>

                  {/* Height Range */}
                  <div style={{ marginBottom: 24 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: MUTED, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Height Range</div>
                    <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 11, color: MUTED, marginBottom: 4 }}>Min</div>
                        <select value={minHeightFilter} onChange={e => setMinHeightFilter(e.target.value)} style={{
                          width: '100%', padding: '8px 10px', border: `1px solid ${ICE}`, borderRadius: 6,
                          fontSize: 13, fontFamily: "'Outfit', sans-serif", outline: 'none', background: '#fff', color: NAVY,
                        }}>
                          <option value="">No minimum</option>
                          {HEIGHT_OPTIONS.map(h => <option key={h} value={h}>{h}</option>)}
                        </select>
                      </div>
                      <div style={{ paddingTop: 20, color: MUTED, fontSize: 13 }}>—</div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 11, color: MUTED, marginBottom: 4 }}>Max</div>
                        <select value={maxHeightFilter} onChange={e => setMaxHeightFilter(e.target.value)} style={{
                          width: '100%', padding: '8px 10px', border: `1px solid ${ICE}`, borderRadius: 6,
                          fontSize: 13, fontFamily: "'Outfit', sans-serif", outline: 'none', background: '#fff', color: NAVY,
                        }}>
                          <option value="">No maximum</option>
                          {HEIGHT_OPTIONS.map(h => <option key={h} value={h}>{h}</option>)}
                        </select>
                      </div>
                    </div>
                  </div>

                  {/* Footer buttons */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <button onClick={() => {
                      setLeagueFilter('all'); setSeasonFilter('all');
                      setGradYearFilter('all'); setMinHeightFilter(''); setMaxHeightFilter('');
                    }} style={{
                      padding: '7px 16px', fontSize: 12, fontWeight: 600, cursor: 'pointer',
                      fontFamily: "'Outfit', sans-serif", border: `1px solid ${ICE}`, borderRadius: 6,
                      background: '#fff', color: MUTED,
                    }}>Clear All</button>
                    <button onClick={() => setHsFilterOpen(false)} style={{
                      padding: '7px 20px', fontSize: 12, fontWeight: 600, cursor: 'pointer',
                      fontFamily: "'Outfit', sans-serif", border: 'none', borderRadius: 6,
                      background: ACCENT, color: '#fff',
                    }}>Apply</button>
                  </div>
                </div>
              </div>
            )}

            {/* Row 1: Search + Filter button + Stat mode */}
            <div style={{ display: 'flex', gap: 12, marginBottom: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <input type="text" placeholder="Search player or team..." value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                style={{ padding: '8px 12px', border: `1px solid ${ICE}`, borderRadius: 6, fontSize: 13, flex: 1, minWidth: 200, outline: 'none', fontFamily: "'Outfit', sans-serif" }} />

              {/* Filter button with active count badge */}
              <button onClick={() => setHsFilterOpen(true)} style={{
                padding: '8px 16px', fontSize: 12, fontWeight: 600, cursor: 'pointer',
                fontFamily: "'Outfit', sans-serif", borderRadius: 6,
                border: `1px solid ${hsActiveFilterCount > 0 ? ACCENT : ICE}`,
                background: hsActiveFilterCount > 0 ? FROST : '#fff',
                color: hsActiveFilterCount > 0 ? ACCENT : MUTED,
                display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap',
              }}>
                ⚙ Filters
                {hsActiveFilterCount > 0 && (
                  <span style={{
                    background: ACCENT, color: '#fff', borderRadius: '50%',
                    width: 18, height: 18, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 10, fontWeight: 700,
                  }}>{hsActiveFilterCount}</span>
                )}
              </button>

              <div style={{ display: 'flex', borderRadius: 6, overflow: 'hidden', border: `1px solid ${ICE}` }}>
                {([{key:'advanced',label:'Advanced'},{key:'perGame',label:'Per Game'},{key:'per40',label:'Per 40'}] as {key:StatMode;label:string}[]).map(({key,label}) => (
                  <button key={key} onClick={() => setStatMode(key)} style={{
                    padding: '7px 16px', fontSize: 12, fontWeight: 600, cursor: 'pointer',
                    fontFamily: "'Outfit', sans-serif", border: 'none', outline: 'none',
                    background: statMode===key ? ACCENT : '#fff', color: statMode===key ? '#fff' : MUTED,
                    transition: 'background 0.15s, color 0.15s',
                  }}>{label}</button>
                ))}
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
                      background: minMinutes===val ? ACCENT : '#fff', color: minMinutes===val ? '#fff' : MUTED,
                      transition: 'background 0.15s, color 0.15s',
                    }}>{val === 0 ? 'All' : val}</button>
                  ))}
                </div>
              </div>
              <button onClick={exportCSV} style={{
                padding: '7px 16px', fontSize: 12, fontWeight: 600, cursor: 'pointer',
                fontFamily: "'Outfit', sans-serif", border: 'none', borderRadius: 6,
                background: ACCENT, color: '#fff',
              }}>Export to Excel</button>
            </div>

            {hsLoading ? (
              <div style={{ padding: 40, textAlign: 'center', color: MUTED }}>Loading...</div>
            ) : (
              <>
                <p style={{ fontSize: 12, color: MUTED, marginBottom: 12 }}>
                  Showing {sortedHs.length} players
                </p>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11, whiteSpace: 'nowrap' }}>
                    <thead>
                      <tr style={{ borderBottom: `2px solid ${ACCENT}`, background: FROST }}>
                        <HSSortableHeader label="Player" sk="name" align="left" />
                        <HSSortableHeader label="Team" sk="team" align="left" />
                        <th style={{ padding: '6px 8px', textAlign: 'center', fontWeight: 700, fontSize: 10 }}>Season</th>
                        <th style={{ padding: '6px 8px', textAlign: 'left', fontWeight: 700, fontSize: 10 }}>League</th>
                        <HSSortableHeader label="Class" sk="grad_year" align="center" />
                        <HSSortableHeader label="Ht" sk="height" align="center" />
                        <HSSortableHeader label="G" sk="gp" />
                        {statMode === 'perGame' && <HSSortableHeader label="MPG" sk="mpg" />}
                        {statMode === 'per40' && <th style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 700, fontSize: 10 }}>MIN</th>}
                        {hsActiveCols.map(col => <HSSortableHeader key={col.key} label={col.label} sk={col.key} />)}
                      </tr>
                    </thead>
                    <tbody>
                      {sortedHs.map((p, idx) => {
                        const stats = calcHSStats(p, hsTeamMap.get(`${p.team}|||${p.season}`));
                        const bg = idx%2===0 ? '#fff' : '#fafafa';
                        return (
                          <tr key={`${p.id}`} style={{ borderBottom: '1px solid #f0f0f0', background: bg }}>
                            <td style={{ padding: '5px 8px', fontWeight: 600, position: 'sticky', left: 0, background: bg, zIndex: 1, minWidth: 140, maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              <Link href={`/mens-d1/recruiting/highschool/${p.id}`} style={{ color: NAVY, textDecoration: 'none' }}
                                onMouseEnter={e => (e.currentTarget.style.color = ACCENT)}
                                onMouseLeave={e => (e.currentTarget.style.color = NAVY)}>
                                {p.full_name}
                              </Link>
                            </td>
                            <td style={{ padding: '5px 8px', color: MUTED, minWidth: 100, maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.team}</td>
                            <td style={{ padding: '5px 8px', textAlign: 'center', color: ACCENT, fontWeight: 600 }}>{p.season}</td>
                            <td style={{ padding: '5px 8px', minWidth: 100 }}>
                              <span style={{ display: 'inline-block', padding: '1px 6px', borderRadius: 4, fontSize: 10, fontWeight: 600, background: FROST, color: NAVY }}>{p.league}</span>
                            </td>
                            <td style={{ padding: '5px 8px', textAlign: 'center' }}>{p.grad_year || '—'}</td>
                            <td style={{ padding: '5px 8px', textAlign: 'center' }}>{p.height || '—'}</td>
                            <td style={{ padding: '5px 8px', textAlign: 'right' }}>{p.gp}</td>
                            {statMode === 'perGame' && (
                              <td style={{ padding: '5px 8px', textAlign: 'right' }}>{p.mp > 0 ? (p.mp / p.gp).toFixed(1) : '—'}</td>
                            )}
                            {statMode === 'per40' && (
                              <td style={{ padding: '5px 8px', textAlign: 'right' }}>{p.mp}</td>
                            )}
                            {hsActiveCols.map(col => {
                              const val = stats ? (stats as Record<string,number>)[col.key] : undefined;
                              return (
                                <td key={col.key} style={{ padding: '5px 8px', textAlign: 'right', fontWeight: col.key===hsSortKey?600:400 }}>
                                  {val!=null ? (INTEGER_KEYS.has(col.key) ? Math.round(val) : val.toFixed(1)) : '—'}
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
          </>
        )}
      </main>
    </>
  );
}
