import { NextRequest, NextResponse } from 'next/server';
import { Pool } from 'pg';
// @ts-ignore
import PDFDocument from 'pdfkit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const pool = new Pool({ connectionString: process.env.POSTGRES_URL });

// ── Advanced stat calc (mirrors frontend calcHSStats) ─────────────────────────

function calcAdv(p: any, team: any) {
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
  const g = p.gp || 1;
  return {
    ortg, minPct, usagePct, shotsPct, efg, ts, orbPct, drbPct,
    aRate, toRate, blkPct, stlPct, ftRate,
    twopm, twopa, twopPct, fg3m: p.fg3m, fg3a: p.fg3a, tpPct,
    ftm: p.ftm, fta: p.fta, ftPct,
    ppg: p.pts / g, rpg: p.reb / g, apg: p.ast / g,
    spg: p.stl / g, bpg: p.blk / g, mpg: p.mp / g,
  };
}

function fmt(val: number | null | undefined, dec = 1): string {
  if (val == null || isNaN(val)) return '—';
  return val.toFixed(dec);
}

function avgStats(rawPlayers: any[], teamMap: Map<string, any>): Record<string, number> {
  // Aggregate all raw counting stats across qualified players
  const tot = {
    gp: 0, mp: 0, pts: 0, fgm: 0, fga: 0, fg3m: 0, fg3a: 0,
    ftm: 0, fta: 0, oreb: 0, dreb: 0, reb: 0, ast: 0, stl: 0, blk: 0, tov: 0,
  };
  for (const p of rawPlayers) {
    for (const k of Object.keys(tot) as (keyof typeof tot)[]) {
      tot[k] += Number(p[k]) || 0;
    }
  }

  // Build a fake "team" row by summing all team stats for teams that have qualified players
  const teamsInAvg = new Set(rawPlayers.map(p => p.team));
  const aggTeam: any = {
    gp: 0, fgm: 0, fga: 0, fg3m: 0, fg3a: 0, ftm: 0, fta: 0,
    oreb: 0, dreb: 0, reb: 0, ast: 0, stl: 0, blk: 0, tov: 0, pts: 0,
    opp_fga: 0, opp_fg3a: 0, opp_ftm: 0, opp_fta: 0,
    opp_oreb: 0, opp_dreb: 0, opp_reb: 0, opp_tov: 0,
  };
  for (const teamName of teamsInAvg) {
    const t = teamMap.get(teamName);
    if (!t) continue;
    for (const k of Object.keys(aggTeam)) aggTeam[k] += Number(t[k]) || 0;
  }

  // Use the same calcAdv formula on the aggregated "average player"
  const avgPlayer = {
    gp: rawPlayers.length,
    mp: tot.mp / rawPlayers.length,
    pts: tot.pts / rawPlayers.length,
    fgm: tot.fgm / rawPlayers.length,
    fga: tot.fga / rawPlayers.length,
    fg3m: tot.fg3m / rawPlayers.length,
    fg3a: tot.fg3a / rawPlayers.length,
    ftm: tot.ftm / rawPlayers.length,
    fta: tot.fta / rawPlayers.length,
    oreb: tot.oreb / rawPlayers.length,
    dreb: tot.dreb / rawPlayers.length,
    reb: tot.reb / rawPlayers.length,
    ast: tot.ast / rawPlayers.length,
    stl: tot.stl / rawPlayers.length,
    blk: tot.blk / rawPlayers.length,
    tov: tot.tov / rawPlayers.length,
  };

  // Scale team to per-player basis too
  const n = teamsInAvg.size;
  const scaledTeam = { ...aggTeam };
  for (const k of Object.keys(scaledTeam)) scaledTeam[k] = scaledTeam[k] / n;

  const adv = calcAdv(avgPlayer, scaledTeam);
  return adv || {};
}

// ── Column definitions ────────────────────────────────────────────────────────

const COLS = [
  { label: '%Min',    key: 'minPct',    dec: 1 },
  { label: 'ORtg',   key: 'ortg',      dec: 1 },
  { label: '%Usg',   key: 'usagePct',  dec: 1 },
  { label: '%Shots', key: 'shotsPct',  dec: 1 },
  { label: 'eFG%',   key: 'efg',       dec: 1 },
  { label: 'TS%',    key: 'ts',        dec: 1 },
  { label: 'OR%',    key: 'orbPct',    dec: 1 },
  { label: 'DR%',    key: 'drbPct',    dec: 1 },
  { label: 'ARate',  key: 'aRate',     dec: 1 },
  { label: 'TORate', key: 'toRate',    dec: 1 },
  { label: 'Blk%',   key: 'blkPct',   dec: 1 },
  { label: 'Stl%',   key: 'stlPct',   dec: 1 },
  { label: 'FTRate', key: 'ftRate',    dec: 1 },
  { label: '2P%',    key: 'twopPct',  dec: 1 },
  { label: '3P%',    key: 'tpPct',    dec: 1 },
  { label: 'FT%',    key: 'ftPct',    dec: 1 },
];

// ── PDF generation ────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const league = searchParams.get('league') || 'EYBL Scholastic';
  const season = searchParams.get('season') || '2026';

  let client;
  try {
    client = await pool.connect();
  } catch (err) {
    return new NextResponse(JSON.stringify({ error: 'DB connection failed', detail: String(err) }), { status: 500 });
  }
  try {
    const [playersRes, teamsRes] = await Promise.all([
      client.query(`
        SELECT p.id, p.full_name, p.team, p.height, p.grad_year,
               s.gp, s.mp, s.pts, s.fgm, s.fga, s.fg3m, s.fg3a,
               s.ftm, s.fta, s.oreb, s.dreb, s.reb, s.ast, s.stl, s.blk, s.tov
        FROM eybl_players p
        JOIN eybl_player_stats s ON s.player_id = p.id
        WHERE p.league = $1 AND p.season = $2 AND s.gp > 0
        ORDER BY p.team, s.mp DESC
      `, [league, season]),
      client.query(`
        SELECT team, gp, fgm, fga, fg3m, fg3a, ftm, fta,
               oreb, dreb, reb, ast, stl, blk, tov, pts,
               opp_fgm, opp_fga, opp_fg3m, opp_fg3a, opp_ftm, opp_fta,
               opp_oreb, opp_dreb, opp_reb, opp_ast, opp_stl, opp_blk, opp_tov, opp_pts
        FROM eybl_team_stats
        WHERE league = $1 AND season = $2
      `, [league, season]),
    ]);

    const players = playersRes.rows;
    const teamMap = new Map(teamsRes.rows.map(t => [t.team, t]));
    const teams = [...new Set(players.map(p => p.team))].sort();

    // Calculate all advanced stats
    const playerStats = players.map(p => ({
      ...p,
      adv: calcAdv(p, teamMap.get(p.team)),
    }));

    // League averages (players with stats only, mp >= 50)
    const qualifiedRaw = playerStats.filter(p => p.adv && p.mp >= 50);
    const leagueAvg = avgStats(qualifiedRaw, teamMap as Map<string, any>);

    // Build PDF - autoFirstPage:false prevents the initial blank page
    const doc = new PDFDocument({
      size: 'LETTER',
      layout: 'landscape',
      margins: { top: 36, bottom: 36, left: 36, right: 36 },
      autoFirstPage: false,
    });

    const NAVY   = '#0D1F3C';
    const ACCENT = '#3B9EFF';
    const FROST  = '#E8F2FC';
    const ICE    = '#A8C8F0';
    const MUTED  = '#6B7E9A';
    const W = 792 - 72; // page width minus margins
    const PAGE_H = 612;
    const MARGIN = 36;

    const NAME_W = 110;
    const META_W = 38; // ht, class, g
    const STAT_W = (W - NAME_W - META_W * 3) / COLS.length;

    function drawTeamPage(teamName: string, isFirst: boolean) {
      doc.addPage();

      const teamPlayers = playerStats
        .filter(p => p.team === teamName)
        .sort((a, b) => (b.mp || 0) - (a.mp || 0));

      let y = MARGIN;

      // ── Header bar ──
      doc.rect(MARGIN, y, W, 28).fill(NAVY);

      // Wordmark: "Sideline" bold + divider + "STATS" light
      doc.fillColor('#fff').fontSize(11).font('Helvetica-Bold')
        .text('Sideline', MARGIN + 8, y + 4, { continued: false });
      doc.moveTo(MARGIN + 8, y + 17).lineTo(MARGIN + 58, y + 17)
        .strokeColor(ACCENT).lineWidth(1).stroke();
      doc.fillColor(ICE).fontSize(8).font('Helvetica')
        .text('S T A T S', MARGIN + 8, y + 19, { continued: false });

      // Team name and league/season on right
      doc.fillColor('#fff').fontSize(12).font('Helvetica-Bold')
        .text(teamName, MARGIN + 72, y + 5, { width: W - 72 - 120 });
      doc.fillColor(ICE).fontSize(8).font('Helvetica')
        .text(`${league}  ·  ${season}`, MARGIN + 72, y + 19, { width: W - 72 - 120 });

      // Date top right
      const today = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
      doc.fillColor(ICE).fontSize(7).font('Helvetica')
        .text(today, MARGIN, y + 10, { width: W - 8, align: 'right' });

      y += 32;

      // Column headers
      doc.rect(MARGIN, y, W, 16).fill(FROST);
      doc.fillColor(NAVY).fontSize(7).font('Helvetica-Bold');

      let x = MARGIN;
      doc.text('Player', x + 2, y + 5, { width: NAME_W - 4 });
      x += NAME_W;
      doc.text('Ht', x, y + 5, { width: META_W, align: 'center' });
      x += META_W;
      doc.text('Cls', x, y + 5, { width: META_W, align: 'center' });
      x += META_W;
      doc.text('G', x, y + 5, { width: META_W, align: 'center' });
      x += META_W;
      for (const col of COLS) {
        doc.text(col.label, x, y + 5, { width: STAT_W, align: 'right' });
        x += STAT_W;
      }
      y += 18;

      // Player rows
      let rowIdx = 0;
      for (const p of teamPlayers) {
        if (y > PAGE_H - MARGIN - 30) break; // safety cutoff
        const bg = rowIdx % 2 === 0 ? '#ffffff' : FROST;
        doc.rect(MARGIN, y, W, 14).fill(bg);
        doc.fillColor('#000').fontSize(7).font('Helvetica');

        x = MARGIN;
        doc.text(p.full_name, x + 2, y + 3, { width: NAME_W - 4, ellipsis: true });
        x += NAME_W;
        doc.text(p.height || '—', x, y + 3, { width: META_W, align: 'center' });
        x += META_W;
        doc.text(p.grad_year ? String(p.grad_year) : '—', x, y + 3, { width: META_W, align: 'center' });
        x += META_W;
        doc.text(String(p.gp), x, y + 3, { width: META_W, align: 'center' });
        x += META_W;

        for (const col of COLS) {
          const val = p.adv ? (p.adv as any)[col.key] : null;
          doc.text(fmt(val, col.dec), x, y + 3, { width: STAT_W, align: 'right' });
          x += STAT_W;
        }

        y += 14;
        rowIdx++;
      }

      // League average row
      doc.rect(MARGIN, y, W, 16).fill(NAVY);
      doc.fillColor('#fff').fontSize(7).font('Helvetica-Bold');
      x = MARGIN;
      doc.text('League Average', x + 2, y + 5, { width: NAME_W - 4 });
      x += NAME_W + META_W * 3;
      for (const col of COLS) {
        doc.text(fmt(leagueAvg[col.key], col.dec), x, y + 5, { width: STAT_W, align: 'right' });
        x += STAT_W;
      }

      // ── Footer ──
      const footerY = PAGE_H - MARGIN - 8;
      doc.moveTo(MARGIN, footerY - 4).lineTo(MARGIN + W, footerY - 4)
        .strokeColor(FROST).lineWidth(0.5).stroke();
      doc.fillColor(ACCENT).fontSize(7).font('Helvetica-Bold')
        .text('SIDELINE STATS', MARGIN, footerY, { width: 80, lineBreak: false });
      doc.fillColor(MUTED).fontSize(7).font('Helvetica')
        .text('sideline-stats.com', MARGIN + 82, footerY, { width: 120, lineBreak: false });
      doc.fillColor(MUTED).fontSize(7).font('Helvetica')
        .text(`Page ${(teams as string[]).indexOf(teamName) + 1} of ${teams.length}`, MARGIN, footerY, { width: W, align: 'right', lineBreak: false });
    }

    (teams as string[]).forEach((team, i) => drawTeamPage(team, false));

    const pdfBuffer = await new Promise<Buffer>((resolve, reject) => {
      const chunks: Buffer[] = [];
      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);
      doc.end();
    });

    const filename = `${league.replace(/\s+/g, '_')}_${season}.pdf`;
    return new NextResponse(pdfBuffer.buffer as ArrayBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (err) {
    console.error('PDF generation error:', err);
    return new NextResponse(JSON.stringify({ error: String(err) }), { status: 500 });
  } finally {
    client?.release();
  }
}
