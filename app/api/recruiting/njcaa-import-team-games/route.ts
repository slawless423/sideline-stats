import { Pool } from 'pg';
import { NextRequest, NextResponse } from 'next/server';

const pool = new Pool({
  connectionString: process.env.POSTGRES_URL_NON_POOLING,
  ssl: { rejectUnauthorized: false },
});

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, x-import-secret',
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export async function POST(request: NextRequest) {
  try {
    const secret = request.headers.get('x-import-secret');
    if (secret !== process.env.NJCAA_IMPORT_SECRET) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: CORS_HEADERS });
    }

    const { games, gender, season } = await request.json();

    if (!games || !Array.isArray(games) || !gender || !season) {
      return NextResponse.json({ error: 'Invalid payload' }, { status: 400, headers: CORS_HEADERS });
    }

    const table = `njcaa_${gender}_d1_team_games`;

    await pool.query(`
      CREATE TABLE IF NOT EXISTS ${table} (
        id                SERIAL PRIMARY KEY,
        game_id           TEXT NOT NULL,
        team_name         TEXT NOT NULL,
        row_type          TEXT NOT NULL CHECK (row_type IN ('team', 'opponent')),
        season            TEXT NOT NULL,
        min_tracked       BOOLEAN DEFAULT FALSE,
        game_total_min    INTEGER,
        opponent_has_stats BOOLEAN DEFAULT FALSE,
        fg                INTEGER DEFAULT 0,
        fga               INTEGER DEFAULT 0,
        fg3               INTEGER DEFAULT 0,
        fg3a              INTEGER DEFAULT 0,
        ft                INTEGER DEFAULT 0,
        fta               INTEGER DEFAULT 0,
        reb_off           INTEGER DEFAULT 0,
        reb_def           INTEGER DEFAULT 0,
        reb_tot           INTEGER DEFAULT 0,
        ast               INTEGER DEFAULT 0,
        stl               INTEGER DEFAULT 0,
        blk               INTEGER DEFAULT 0,
        to_stat           INTEGER DEFAULT 0,
        pf                INTEGER DEFAULT 0,
        pts               INTEGER DEFAULT 0,
        created_at        TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(game_id, team_name, row_type)
      );
    `);

    let upserted = 0;

    for (const g of games) {
      await pool.query(`
        INSERT INTO ${table} (
          game_id, team_name, row_type, season,
          min_tracked, game_total_min, opponent_has_stats,
          fg, fga, fg3, fg3a, ft, fta,
          reb_off, reb_def, reb_tot,
          ast, stl, blk, to_stat, pf, pts
        ) VALUES (
          $1,$2,$3,$4,
          $5,$6,$7,
          $8,$9,$10,$11,$12,$13,
          $14,$15,$16,
          $17,$18,$19,$20,$21,$22
        )
        ON CONFLICT (game_id, team_name, row_type) DO UPDATE SET
          min_tracked        = EXCLUDED.min_tracked,
          opponent_has_stats = EXCLUDED.opponent_has_stats,
          fg = EXCLUDED.fg, fga = EXCLUDED.fga,
          fg3 = EXCLUDED.fg3, fg3a = EXCLUDED.fg3a,
          ft = EXCLUDED.ft, fta = EXCLUDED.fta,
          reb_off = EXCLUDED.reb_off, reb_def = EXCLUDED.reb_def, reb_tot = EXCLUDED.reb_tot,
          ast = EXCLUDED.ast, stl = EXCLUDED.stl, blk = EXCLUDED.blk,
          to_stat = EXCLUDED.to_stat, pf = EXCLUDED.pf, pts = EXCLUDED.pts
      `, [
        g.game_id, g.team_name, g.row_type, season,
        g.min_tracked, g.game_total_min, g.opponent_has_stats,
        g.fg, g.fga, g.fg3, g.fg3a, g.ft, g.fta,
        g.reb_off, g.reb_def, g.reb_tot,
        g.ast, g.stl, g.blk, g.to_stat, g.pf, g.pts,
      ]);
      upserted++;
    }

    return NextResponse.json({ success: true, upserted }, { headers: CORS_HEADERS });

  } catch (err: any) {
    console.error('NJCAA team games import error:', err);
    return NextResponse.json({ error: err.message }, { status: 500, headers: CORS_HEADERS });
  }
}
