import { Pool } from 'pg';
import { NextRequest } from 'next/server';

const pool = new Pool({
  connectionString: process.env.POSTGRES_URL_NON_POOLING,
  ssl: { rejectUnauthorized: false },
});

export async function POST(request: NextRequest) {
  try {
    // Verify secret
    const secret = request.headers.get('x-import-secret');
    if (secret !== process.env.NJCAA_IMPORT_SECRET) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { players, gender, season } = await request.json();

    if (!players || !Array.isArray(players) || !gender || !season) {
      return Response.json({ error: 'Invalid payload' }, { status: 400 });
    }

    if (!['mens', 'womens'].includes(gender)) {
      return Response.json({ error: 'Invalid gender' }, { status: 400 });
    }

    const table = `njcaa_${gender}_d1_players`;

    // Ensure table exists
    await pool.query(`
      CREATE TABLE IF NOT EXISTS ${table} (
        id          SERIAL PRIMARY KEY,
        player_id   TEXT NOT NULL UNIQUE,
        team_name   TEXT NOT NULL,
        season      TEXT NOT NULL,
        jersey      TEXT,
        name        TEXT NOT NULL,
        gp          INTEGER DEFAULT 0,
        gs          INTEGER DEFAULT 0,
        min         INTEGER DEFAULT 0,
        fg          INTEGER DEFAULT 0,
        fga         INTEGER DEFAULT 0,
        fg3         INTEGER DEFAULT 0,
        fg3a        INTEGER DEFAULT 0,
        ft          INTEGER DEFAULT 0,
        fta         INTEGER DEFAULT 0,
        reb_off     INTEGER DEFAULT 0,
        reb_def     INTEGER DEFAULT 0,
        reb_tot     INTEGER DEFAULT 0,
        ast         INTEGER DEFAULT 0,
        stl         INTEGER DEFAULT 0,
        blk         INTEGER DEFAULT 0,
        to_stat     INTEGER DEFAULT 0,
        pf          INTEGER DEFAULT 0,
        pts         INTEGER DEFAULT 0,
        updated_at  TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    let upserted = 0;

    for (const p of players) {
      await pool.query(`
        INSERT INTO ${table} (
          player_id, team_name, season, jersey, name,
          gp, gs, min,
          fg, fga, fg3, fg3a, ft, fta,
          reb_off, reb_def, reb_tot,
          ast, stl, blk, to_stat, pf, pts,
          updated_at
        ) VALUES (
          $1,$2,$3,$4,$5,
          $6,$7,$8,
          $9,$10,$11,$12,$13,$14,
          $15,$16,$17,
          $18,$19,$20,$21,$22,$23,
          NOW()
        )
        ON CONFLICT (player_id) DO UPDATE SET
          team_name  = EXCLUDED.team_name,
          jersey     = EXCLUDED.jersey,
          name       = EXCLUDED.name,
          gp         = EXCLUDED.gp,
          gs         = EXCLUDED.gs,
          min        = EXCLUDED.min,
          fg         = EXCLUDED.fg,
          fga        = EXCLUDED.fga,
          fg3        = EXCLUDED.fg3,
          fg3a       = EXCLUDED.fg3a,
          ft         = EXCLUDED.ft,
          fta        = EXCLUDED.fta,
          reb_off    = EXCLUDED.reb_off,
          reb_def    = EXCLUDED.reb_def,
          reb_tot    = EXCLUDED.reb_tot,
          ast        = EXCLUDED.ast,
          stl        = EXCLUDED.stl,
          blk        = EXCLUDED.blk,
          to_stat    = EXCLUDED.to_stat,
          pf         = EXCLUDED.pf,
          pts        = EXCLUDED.pts,
          updated_at = NOW()
      `, [
        p.player_id, p.team_name, season, p.jersey, p.name,
        p.gp, p.gs, p.min,
        p.fg, p.fga, p.fg3, p.fg3a, p.ft, p.fta,
        p.reb_off, p.reb_def, p.reb_tot,
        p.ast, p.stl, p.blk, p.to_stat, p.pf, p.pts,
      ]);
      upserted++;
    }

    return Response.json({ success: true, upserted });

  } catch (err: any) {
    console.error('NJCAA import error:', err);
    return Response.json({ error: err.message }, { status: 500 });
  }
}
