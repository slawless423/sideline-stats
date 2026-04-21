import { NextRequest, NextResponse } from 'next/server';
import { Pool } from 'pg';
// @ts-ignore
import PDFDocument from 'pdfkit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const pool = new Pool({ connectionString: process.env.POSTGRES_URL });

function calcAdv(p: any, team: any) {
  if (!team || p.gp === 0 || p.mp === 0) return null;
  // Use actual team minutes from DB (handles OT correctly).
  const teamMinutes = team.mp;
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
    aRate, toRate, blkPct, stlPct, ftRate, twopPct, tpPct, ftPct,
    ppg: p.pts / g, rpg: p.reb / g, apg: p.ast / g,
    spg: p.stl / g, bpg: p.blk / g, mpg: p.mp / g,
  };
}

function fmt(val: number | null | undefined, dec = 1): string {
  if (val == null || isNaN(val) || !isFinite(val)) return '—';
  return val.toFixed(dec);
}

function avgStats(rawPlayers: any[], teamMap: Map<string, any>): Record<string, number> {
  const tot: any = { gp:0,mp:0,pts:0,fgm:0,fga:0,fg3m:0,fg3a:0,ftm:0,fta:0,oreb:0,dreb:0,reb:0,ast:0,stl:0,blk:0,tov:0 };
  for (const p of rawPlayers) for (const k of Object.keys(tot)) tot[k] += Number(p[k]) || 0;
  const teamsInAvg = new Set(rawPlayers.map((p: any) => p.team));
  const aggTeam: any = { gp:0,mp:0,fgm:0,fga:0,fg3m:0,fg3a:0,ftm:0,fta:0,oreb:0,dreb:0,reb:0,ast:0,stl:0,blk:0,tov:0,pts:0,opp_fga:0,opp_fg3a:0,opp_ftm:0,opp_fta:0,opp_oreb:0,opp_dreb:0,opp_reb:0,opp_tov:0 };
  for (const teamName of teamsInAvg) {
    const t = teamMap.get(teamName as string);
    if (t) for (const k of Object.keys(aggTeam)) aggTeam[k] += Number(t[k]) || 0;
  }
  const n = rawPlayers.length;
  const nt = teamsInAvg.size;
  const avgPlayer = Object.fromEntries(Object.keys(tot).map(k => [k, k === 'gp' ? n : tot[k] / n]));
  const scaledTeam = Object.fromEntries(Object.keys(aggTeam).map(k => [k, aggTeam[k] / nt]));
  return calcAdv(avgPlayer, scaledTeam) || {};
}

const COLS = [
  { label: '%Min', key: 'minPct' }, { label: 'ORtg', key: 'ortg' },
  { label: '%Usg', key: 'usagePct' }, { label: '%Shots', key: 'shotsPct' },
  { label: 'eFG%', key: 'efg' }, { label: 'TS%', key: 'ts' },
  { label: 'OR%', key: 'orbPct' }, { label: 'DR%', key: 'drbPct' },
  { label: 'ARate', key: 'aRate' }, { label: 'TORate', key: 'toRate' },
  { label: 'Blk%', key: 'blkPct' }, { label: 'Stl%', key: 'stlPct' },
  { label: 'FTRate', key: 'ftRate' }, { label: '2P%', key: 'twopPct' },
  { label: '3P%', key: 'tpPct' }, { label: 'FT%', key: 'ftPct' },
];

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const league = searchParams.get('league') || '17U EYBL';
  const season = searchParams.get('season') || '2026';

  let client;
  try { client = await pool.connect(); }
  catch (err) { return new NextResponse(JSON.stringify({ error: String(err) }), { status: 500 }); }

  try {
    const [playersRes, teamsRes] = await Promise.all([
      client.query(`
        SELECT p.id, p.full_name, p.team, p.height, p.grad_year,
               s.gp, s.mp, s.pts, s.fgm, s.fga, s.fg3m, s.fg3a,
               s.ftm, s.fta, s.oreb, s.dreb, s.reb, s.ast, s.stl, s.blk, s.tov
        FROM hs_players_womens p
        JOIN hs_player_stats_womens s ON s.player_id = p.id
        WHERE p.league = $1 AND p.season = $2 AND s.gp > 0
        ORDER BY p.team, s.mp DESC
      `, [league, season]),
      client.query(`
        SELECT team, gp, mp, fgm, fga, fg3m, fg3a, ftm, fta,
               oreb, dreb, reb, ast, stl, blk, tov, pts,
               opp_fgm, opp_fga, opp_fg3m, opp_fg3a, opp_ftm, opp_fta,
               opp_oreb, opp_dreb, opp_reb, opp_ast, opp_stl, opp_blk, opp_tov, opp_pts
        FROM hs_team_stats_womens WHERE league = $1 AND season = $2
      `, [league, season]),
    ]);

    const players = playersRes.rows;
    const teamMap = new Map(teamsRes.rows.map((t: any) => [t.team, t]));
    const teams = [...new Set(players.map((p: any) => p.team))].sort() as string[];
    const playerStats = players.map((p: any) => ({ ...p, adv: calcAdv(p, teamMap.get(p.team)) }));
    // HS minimum is 5 games (matches frontend threshold)
    const qualifiedRaw = playerStats.filter((p: any) => p.adv && p.gp >= 5);
    const leagueAvg = avgStats(qualifiedRaw, teamMap as Map<string, any>);

    const NAVY  = '#0D1F3C';
    const FROST = '#E8F2FC';
    const MUTED = '#6B7E9A';
    const ACCENT = '#3B9EFF';
    const M = 36;
    const W = 792 - M * 2;
    const NAME_W = 110;
    const META_W = 38;
    const STAT_W = (W - NAME_W - META_W * 3) / COLS.length;
    const ROW_H = 14;
    const COL_H = 16;
    const HDR_H = 22;

    const doc = new PDFDocument({
      size: 'LETTER', layout: 'landscape',
      margins: { top: M, bottom: M, left: M, right: M },
      autoFirstPage: false,
    });

    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));

    for (const teamName of teams) {
      doc.addPage();
      let y = M;

      // Team header
      doc.rect(M, y, W, HDR_H).fill(NAVY);
      doc.fillColor('#fff').fontSize(8).font('Helvetica-Bold')
        .text('SIDELINE', M + 8, y + 4, { width: 60 });
      doc.fillColor('#aac8f0').fontSize(6).font('Helvetica')
        .text('S T A T S', M + 8, y + 13, { width: 60 });
      doc.fillColor('#fff').fontSize(11).font('Helvetica-Bold')
        .text(`${teamName}`, M + 72, y + 6, { width: W / 2 });
      doc.fontSize(8).font('Helvetica').fillColor('#aac8f0')
        .text(`${league} · ${season}`, M + W / 2, y + 8, { width: W / 2 - 8, align: 'right' });
      y += HDR_H + 2;

      // Column headers
      doc.rect(M, y, W, COL_H).fill(FROST);
      doc.fillColor(NAVY).fontSize(7).font('Helvetica-Bold');
      let x = M;
      doc.text('Player', x + 2, y + 5, { width: NAME_W - 4 });
      x += NAME_W;
      for (const lbl of ['Ht', 'Cls', 'G']) {
        doc.text(lbl, x, y + 5, { width: META_W, align: 'center' });
        x += META_W;
      }
      for (const col of COLS) {
        doc.text(col.label, x, y + 5, { width: STAT_W, align: 'right' });
        x += STAT_W;
      }
      y += COL_H + 2;

      // Player rows
      const teamPlayers = playerStats
        .filter((p: any) => p.team === teamName)
        .sort((a: any, b: any) => (b.mp || 0) - (a.mp || 0));

      let rowIdx = 0;
      for (const p of teamPlayers) {
        const bg = rowIdx % 2 === 0 ? '#ffffff' : FROST;
        doc.rect(M, y, W, ROW_H).fill(bg);
        doc.fillColor('#000').fontSize(7).font('Helvetica');
        x = M;
        doc.text(p.full_name, x + 2, y + 3, { width: NAME_W - 4 });
        x += NAME_W;
        doc.text(p.height || '—', x, y + 3, { width: META_W, align: 'center' });
        x += META_W;
        doc.text(p.grad_year ? String(p.grad_year) : '—', x, y + 3, { width: META_W, align: 'center' });
        x += META_W;
        doc.text(String(p.gp), x, y + 3, { width: META_W, align: 'center' });
        x += META_W;
        for (const col of COLS) {
          const val = p.adv ? (p.adv as any)[col.key] : null;
          doc.text(fmt(val), x, y + 3, { width: STAT_W, align: 'right' });
          x += STAT_W;
        }
        y += ROW_H;
        rowIdx++;
      }

      // League average row
      y += 2;
      doc.rect(M, y, W, COL_H).fill(NAVY);
      doc.fillColor('#fff').fontSize(7).font('Helvetica-Bold');
      x = M;
      doc.text('League Average', x + 2, y + 5, { width: NAME_W - 4 });
      x += NAME_W + META_W * 3;
      for (const col of COLS) {
        doc.text(fmt(leagueAvg[col.key]), x, y + 5, { width: STAT_W, align: 'right' });
        x += STAT_W;
      }
      y += COL_H + 8;

      // Branding line below stats
      doc.fillColor(ACCENT).fontSize(7).font('Helvetica-Bold')
        .text('SIDELINE STATS', M, y, { continued: true });
      doc.fillColor(MUTED).font('Helvetica')
        .text(`  ·  sideline-stats.com  ·  info@sideline-stats.com  ·  ${league} ${season}  ·  ${teams.indexOf(teamName) + 1} of ${teams.length}`, { });
    }

    const pdfBuffer = await new Promise<Buffer>((resolve, reject) => {
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
