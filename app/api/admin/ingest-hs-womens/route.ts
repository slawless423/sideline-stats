// app/api/admin/ingest-hs-womens/route.ts
//
// Ingests a single box score (2 teams, ~20 players) into the women's HS tables.
// Additive upserts: each call adds to running totals in hs_player_stats_womens
// and hs_team_stats_womens, and inserts/updates identity rows in hs_players_womens.
// Also inserts the game record into hs_games_womens for schedule tracking
// (ON CONFLICT DO NOTHING — re-submitting the same game won't duplicate).
//
// Auth: Bearer token in Authorization header, matched against INGEST_TOKEN env var.

import { NextRequest, NextResponse } from 'next/server';
import { Pool } from 'pg';

const pool = new Pool({ connectionString: process.env.POSTGRES_URL });

// ─── Types ────────────────────────────────────────────────────────────────────

type PlayerLine = {
  name: string;
  jersey?: number | null;
  grad_year?: number | null;
  height?: string | null;
  mp: number;
  fgm: number; fga: number;
  fg3m: number; fg3a: number;
  ftm: number; fta: number;
  oreb: number; dreb: number; reb: number;
  ast: number; stl: number; blk: number;
  tov: number; pf: number; pts: number;
};

type TeamTotals = {
  mp: number;
  fgm: number; fga: number;
  fg3m: number; fg3a: number;
  ftm: number; fta: number;
  oreb: number; dreb: number; reb: number;
  ast: number; stl: number; blk: number;
  tov: number; pf: number; pts: number;
};

type TeamBlock = {
  team: string;
  team_totals: TeamTotals;
  players: PlayerLine[];
};

type GameBlock = {
  date: string;
  time?: string;
  home_team: string;
  away_team: string;
  home_score: number;
  away_score: number;
  overtime?: boolean;
};

type BoxScorePayload = {
  league: string;
  season: string;
  game: GameBlock;
  teams: TeamBlock[];
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const STAT_FIELDS = ['mp','fgm','fga','fg3m','fg3a','ftm','fta','oreb','dreb','reb','ast','stl','blk','tov','pf','pts'] as const;
const OPP_FIELDS  = ['fgm','fga','fg3m','fg3a','ftm','fta','oreb','dreb','reb','ast','stl','blk','tov','pf','pts'] as const;

function splitName(fullName: string): { first_name: string; last_name: string } {
  const parts = fullName.trim().split(/\s+/);
  const suffixes = new Set(['Jr.', 'Sr.', 'Jr', 'Sr', 'II', 'III', 'IV']);
  if (parts.length === 1) return { first_name: parts[0], last_name: '' };
  const last = suffixes.has(parts[parts.length - 1])
    ? parts[parts.length - 2]
    : parts[parts.length - 1];
  const firstEnd = suffixes.has(parts[parts.length - 1]) ? parts.length - 2 : parts.length - 1;
  const first_name = parts.slice(0, firstEnd).join(' ');
  return { first_name: first_name || parts[0], last_name: last };
}

type ValidationResult =
  | { ok: true; payload: BoxScorePayload }
  | { ok: false; error: string };

function validatePayload(body: unknown): ValidationResult {
  if (!body || typeof body !== 'object') return { ok: false, error: 'Body must be an object' };
  const b = body as Partial<BoxScorePayload>;
  if (!b.league || typeof b.league !== 'string') return { ok: false, error: 'Missing/invalid league' };
  if (!b.season || typeof b.season !== 'string') return { ok: false, error: 'Missing/invalid season' };

  // Validate game block (required for schedule tracking)
  if (!b.game || typeof b.game !== 'object') return { ok: false, error: 'Missing game block' };
  const g = b.game as Partial<GameBlock>;
  if (!g.date || typeof g.date !== 'string') return { ok: false, error: 'Missing/invalid game.date' };
  if (!g.home_team || typeof g.home_team !== 'string') return { ok: false, error: 'Missing/invalid game.home_team' };
  if (!g.away_team || typeof g.away_team !== 'string') return { ok: false, error: 'Missing/invalid game.away_team' };
  if (typeof g.home_score !== 'number' || !Number.isFinite(g.home_score)) return { ok: false, error: 'Missing/invalid game.home_score' };
  if (typeof g.away_score !== 'number' || !Number.isFinite(g.away_score)) return { ok: false, error: 'Missing/invalid game.away_score' };

  if (!Array.isArray(b.teams) || b.teams.length !== 2) return { ok: false, error: 'teams must be an array of exactly 2 entries' };
  for (const t of b.teams) {
    if (!t.team || typeof t.team !== 'string') return { ok: false, error: 'Each team needs a team name' };
    if (!t.team_totals || typeof t.team_totals !== 'object') return { ok: false, error: `Team ${t.team} is missing team_totals` };
    for (const f of STAT_FIELDS) {
      const v = (t.team_totals as any)[f];
      if (v === undefined || v === null || typeof v !== 'number' || !Number.isFinite(v)) {
        return { ok: false, error: `Team ${t.team} has invalid team_totals.${f}` };
      }
    }
    if (!Array.isArray(t.players) || t.players.length === 0) return { ok: false, error: `Team ${t.team} has no players` };
    for (const p of t.players) {
      if (!p.name || typeof p.name !== 'string') return { ok: false, error: `Team ${t.team} has a player missing a name` };
      for (const f of STAT_FIELDS) {
        const v = (p as any)[f];
        if (v === undefined || v === null || typeof v !== 'number' || !Number.isFinite(v)) {
          return { ok: false, error: `Player ${p.name} on ${t.team} has invalid ${f}` };
        }
      }
    }
  }
  return { ok: true, payload: b as BoxScorePayload };
}

// ─── Route handler ────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  // Auth
  const auth = req.headers.get('authorization') || '';
  const expected = process.env.INGEST_TOKEN;
  if (!expected) {
    return NextResponse.json({ error: 'INGEST_TOKEN not configured on server' }, { status: 500 });
  }
  if (auth !== `Bearer ${expected}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Parse + validate
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const v = validatePayload(body);
  if (v.ok === false) {
    return NextResponse.json({ error: v.error }, { status: 400 });
  }
  const { league, season, game, teams } = v.payload;

  // Team stats come directly from the payload (authoritative totals from the PDF).
  // Each team's totals are also written as their opponent's opp_* stats.
  const byTeam = teams.map(t => ({ team: t.team, totals: t.team_totals }));

  const summary = {
    league,
    season,
    teams: [] as Array<{ team: string; playersInserted: number; playersUpdated: number }>,
  };

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // ── Schedule tracking: insert game record ──
    // ON CONFLICT DO NOTHING means re-submitting the same game won't create
    // a duplicate schedule row, even though stats upserts will double-count.
    await client.query(`
      INSERT INTO hs_games_womens
        (league, season, game_date, game_time,
         home_team, away_team, home_score, away_score, overtime)
      VALUES ($1, $2, $3::date, $4, $5, $6, $7, $8, $9)
      ON CONFLICT (league, season, game_date, game_time, home_team, away_team)
      DO NOTHING
    `, [
      league,
      season,
      game.date,
      game.time ?? null,
      game.home_team,
      game.away_team,
      game.home_score,
      game.away_score,
      game.overtime ?? false,
    ]);

    // ── Team stats: additive upsert, including opponent cross-write ──
    for (let i = 0; i < teams.length; i++) {
      const self = byTeam[i];
      const opp  = byTeam[1 - i];

      await client.query(`
        INSERT INTO hs_team_stats_womens
          (team, league, season, gp,
           fgm, fga, fg3m, fg3a, ftm, fta, oreb, dreb, reb, ast, stl, blk, tov, pf, pts,
           opp_fgm, opp_fga, opp_fg3m, opp_fg3a, opp_ftm, opp_fta,
           opp_oreb, opp_dreb, opp_reb, opp_ast, opp_stl, opp_blk, opp_tov, opp_pf, opp_pts)
        VALUES ($1,$2,$3,1,
                $4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,
                $19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,$33)
        ON CONFLICT (team, league, season) DO UPDATE SET
          gp       = hs_team_stats_womens.gp + 1,
          fgm      = hs_team_stats_womens.fgm      + EXCLUDED.fgm,
          fga      = hs_team_stats_womens.fga      + EXCLUDED.fga,
          fg3m     = hs_team_stats_womens.fg3m     + EXCLUDED.fg3m,
          fg3a     = hs_team_stats_womens.fg3a     + EXCLUDED.fg3a,
          ftm      = hs_team_stats_womens.ftm      + EXCLUDED.ftm,
          fta      = hs_team_stats_womens.fta      + EXCLUDED.fta,
          oreb     = hs_team_stats_womens.oreb     + EXCLUDED.oreb,
          dreb     = hs_team_stats_womens.dreb     + EXCLUDED.dreb,
          reb      = hs_team_stats_womens.reb      + EXCLUDED.reb,
          ast      = hs_team_stats_womens.ast      + EXCLUDED.ast,
          stl      = hs_team_stats_womens.stl      + EXCLUDED.stl,
          blk      = hs_team_stats_womens.blk      + EXCLUDED.blk,
          tov      = hs_team_stats_womens.tov      + EXCLUDED.tov,
          pf       = hs_team_stats_womens.pf       + EXCLUDED.pf,
          pts      = hs_team_stats_womens.pts      + EXCLUDED.pts,
          opp_fgm  = hs_team_stats_womens.opp_fgm  + EXCLUDED.opp_fgm,
          opp_fga  = hs_team_stats_womens.opp_fga  + EXCLUDED.opp_fga,
          opp_fg3m = hs_team_stats_womens.opp_fg3m + EXCLUDED.opp_fg3m,
          opp_fg3a = hs_team_stats_womens.opp_fg3a + EXCLUDED.opp_fg3a,
          opp_ftm  = hs_team_stats_womens.opp_ftm  + EXCLUDED.opp_ftm,
          opp_fta  = hs_team_stats_womens.opp_fta  + EXCLUDED.opp_fta,
          opp_oreb = hs_team_stats_womens.opp_oreb + EXCLUDED.opp_oreb,
          opp_dreb = hs_team_stats_womens.opp_dreb + EXCLUDED.opp_dreb,
          opp_reb  = hs_team_stats_womens.opp_reb  + EXCLUDED.opp_reb,
          opp_ast  = hs_team_stats_womens.opp_ast  + EXCLUDED.opp_ast,
          opp_stl  = hs_team_stats_womens.opp_stl  + EXCLUDED.opp_stl,
          opp_blk  = hs_team_stats_womens.opp_blk  + EXCLUDED.opp_blk,
          opp_tov  = hs_team_stats_womens.opp_tov  + EXCLUDED.opp_tov,
          opp_pf   = hs_team_stats_womens.opp_pf   + EXCLUDED.opp_pf,
          opp_pts  = hs_team_stats_womens.opp_pts  + EXCLUDED.opp_pts
      `, [
        self.team, league, season,
        self.totals.fgm, self.totals.fga, self.totals.fg3m, self.totals.fg3a,
        self.totals.ftm, self.totals.fta, self.totals.oreb, self.totals.dreb, self.totals.reb,
        self.totals.ast, self.totals.stl, self.totals.blk, self.totals.tov, self.totals.pf, self.totals.pts,
        opp.totals.fgm, opp.totals.fga, opp.totals.fg3m, opp.totals.fg3a,
        opp.totals.ftm, opp.totals.fta, opp.totals.oreb, opp.totals.dreb, opp.totals.reb,
        opp.totals.ast, opp.totals.stl, opp.totals.blk, opp.totals.tov, opp.totals.pf, opp.totals.pts,
      ]);
    }

    // ── Players + player stats ──
    for (const teamBlock of teams) {
      let inserted = 0;
      let updated  = 0;

      for (const p of teamBlock.players) {
        const { first_name, last_name } = splitName(p.name);

        // Upsert player identity. Only overwrite grad_year/height if the incoming
        // payload provides them — don't null out existing values.
        const playerRes = await client.query(`
          INSERT INTO hs_players_womens
            (full_name, first_name, last_name, team, league, season, grad_year, height)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
          ON CONFLICT (full_name, team, league, season) DO UPDATE SET
            first_name = EXCLUDED.first_name,
            last_name  = EXCLUDED.last_name,
            grad_year  = COALESCE(EXCLUDED.grad_year, hs_players_womens.grad_year),
            height     = COALESCE(EXCLUDED.height,    hs_players_womens.height)
          RETURNING id, (xmax = 0) AS inserted
        `, [
          p.name, first_name, last_name, teamBlock.team, league, season,
          p.grad_year ?? null, p.height ?? null,
        ]);

        const playerId = playerRes.rows[0].id as number;
        if (playerRes.rows[0].inserted) inserted++; else updated++;

        // Additive upsert on stats — each call adds one game + this game's line
        await client.query(`
          INSERT INTO hs_player_stats_womens
            (player_id, season, gp, mp,
             fgm, fga, fg3m, fg3a, ftm, fta,
             oreb, dreb, reb, ast, stl, blk, tov, pf, pts)
          VALUES ($1, $2, 1, $3, $4, $5, $6, $7, $8, $9,
                  $10, $11, $12, $13, $14, $15, $16, $17, $18)
          ON CONFLICT (player_id, season) DO UPDATE SET
            gp   = hs_player_stats_womens.gp   + 1,
            mp   = hs_player_stats_womens.mp   + EXCLUDED.mp,
            fgm  = hs_player_stats_womens.fgm  + EXCLUDED.fgm,
            fga  = hs_player_stats_womens.fga  + EXCLUDED.fga,
            fg3m = hs_player_stats_womens.fg3m + EXCLUDED.fg3m,
            fg3a = hs_player_stats_womens.fg3a + EXCLUDED.fg3a,
            ftm  = hs_player_stats_womens.ftm  + EXCLUDED.ftm,
            fta  = hs_player_stats_womens.fta  + EXCLUDED.fta,
            oreb = hs_player_stats_womens.oreb + EXCLUDED.oreb,
            dreb = hs_player_stats_womens.dreb + EXCLUDED.dreb,
            reb  = hs_player_stats_womens.reb  + EXCLUDED.reb,
            ast  = hs_player_stats_womens.ast  + EXCLUDED.ast,
            stl  = hs_player_stats_womens.stl  + EXCLUDED.stl,
            blk  = hs_player_stats_womens.blk  + EXCLUDED.blk,
            tov  = hs_player_stats_womens.tov  + EXCLUDED.tov,
            pf   = hs_player_stats_womens.pf   + EXCLUDED.pf,
            pts  = hs_player_stats_womens.pts  + EXCLUDED.pts
        `, [
          playerId, season, p.mp,
          p.fgm, p.fga, p.fg3m, p.fg3a, p.ftm, p.fta,
          p.oreb, p.dreb, p.reb, p.ast, p.stl, p.blk, p.tov, p.pf, p.pts,
        ]);
      }

      summary.teams.push({ team: teamBlock.team, playersInserted: inserted, playersUpdated: updated });
    }

    await client.query('COMMIT');
    return NextResponse.json({ ok: true, summary });
  } catch (err: any) {
    await client.query('ROLLBACK');
    console.error('Ingest error:', err);
    return NextResponse.json({ error: err.message ?? 'Ingest failed' }, { status: 500 });
  } finally {
    client.release();
  }
}
