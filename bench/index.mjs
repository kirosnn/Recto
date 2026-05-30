/**
 * WinDirector — Terminal Benchmark
 *
 * Usage:
 *   node index.mjs [options]
 *
 * Options:
 *   --duration=30      Durée de mesure en secondes (défaut: 30)
 *   --bitrate=20000    Bitrate cible en Kbps (défaut: 20000 = 20 Mbps)
 *   --fps=60           FPS cible (défaut: 60)
 *   --codec=H264       Codec préféré: H264 | VP9 | H265 | auto (défaut: H264)
 *   --quick            Raccourci pour --duration=10
 *
 * Première utilisation:
 *   npm install && npm run setup
 */

import { chromium } from 'playwright';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dir = dirname(fileURLToPath(import.meta.url));

// ── Parse args ────────────────────────────────────────────────────────────────
function arg(flag, fallback) {
  const long  = process.argv.find(a => a.startsWith(`--${flag}=`));
  const short = process.argv.indexOf(`--${flag}`);
  if (long) return long.split('=')[1];
  if (short >= 0) return process.argv[short + 1];
  return fallback;
}
const quick      = process.argv.includes('--quick');
const duration   = quick ? 10 : parseInt(arg('duration', '30'));
const bitrate    = parseInt(arg('bitrate', '20000'));
const fps        = parseInt(arg('fps', '60'));
const codec      = arg('codec', 'H264');
const resolution = arg('resolution', '720'); // '720' | '1080' | '1440'

// ── ANSI helpers ──────────────────────────────────────────────────────────────
const R   = '\x1b[0m';
const B   = '\x1b[1m';
const DIM = '\x1b[2m';
const G   = '\x1b[32m';
const C   = '\x1b[36m';
const Y   = '\x1b[33m';
const RED = '\x1b[31m';
const ACC = '\x1b[38;5;208m'; // orange accent

function color(val, good, ok, bad) {
  if (val >= good) return G;
  if (val >= ok)   return Y;
  return RED;
}

function bar(v, max, w = 10) {
  const n = Math.round(Math.max(0, Math.min(v / max, 1)) * w);
  return '█'.repeat(n) + '░'.repeat(w - n);
}

const HR = `${DIM}${'─'.repeat(54)}${R}`;
const lw = 22; // label column width

function row(label, value, extra = '') {
  const v = typeof value === 'string' ? value : String(value);
  const e = extra ? `  ${DIM}${extra}${R}` : '';
  return `${DIM}${label.padEnd(lw)}${R}${B}${v}${R}${e}`;
}

// ── Scoring ───────────────────────────────────────────────────────────────────
function scoreQuality(results) {
  const targetKbps = results.config.targetBitrateKbps;
  const tFps       = results.config.targetFps;

  const bitrateRatio = results.bitrate.avgKbps / targetKbps;
  const fpsRatio     = results.fps.avgSend / tFps;
  const lossOk       = results.packetLossRate < 0.001 ? 1 : results.packetLossRate < 0.01 ? 0.7 : 0.3;
  const limOk        = results.qualityLimitation === 'none' ? 1
    : results.qualityLimitation === 'bandwidth' ? 0.7 : 0.5;

  return Math.round(((bitrateRatio * 0.35 + fpsRatio * 0.35 + lossOk * 0.15 + limOk * 0.15)) * 100) / 10;
}

function scoreFps(results) {
  return Math.round((results.fps.avgSend / results.config.targetFps) * 100) / 10;
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`\n${B}${ACC}▶ WinDirector — Benchmark WebRTC${R}\n${HR}`);
  console.log(`${DIM}Codec: ${codec}  ·  FPS: ${fps}  ·  Bitrate: ${bitrate/1000} Mbps  ·  Résolution: ${resolution}p  ·  Durée: ${duration}s${R}\n`);

  process.stdout.write(`${DIM}Lancement navigateur…${R}`);

  let browser;
  try {
    browser = await chromium.launch({
      headless: true,
      args: ['--disable-web-security', '--allow-file-access-from-files'],
    });
  } catch {
    console.error(`\n${RED}Playwright introuvable. Exécute d'abord: npm install && npm run setup${R}`);
    process.exit(1);
  }

  const page = await browser.newPage();

  page.on('console', msg => {
    if (msg.type() === 'log') {
      process.stdout.write(`\r${DIM}${msg.text().slice(0, 70).padEnd(72)}${R}`);
    }
  });

  const url = new URL(`file://${resolve(__dir, 'bench.html')}`);
  url.searchParams.set('duration',   String(duration));
  url.searchParams.set('bitrate',    String(bitrate));
  url.searchParams.set('fps',        String(fps));
  url.searchParams.set('codec',      codec);
  url.searchParams.set('resolution', resolution);

  await page.goto(url.href);

  // Click the "Lancer" button if present (required for captureStream)
  try {
    await page.click('#start-btn', { timeout: 3000 });
  } catch {
    // Button may not exist in older bench.html, ignore
  }

  const timeoutMs = (duration + 30) * 1000;
  let results;
  try {
    results = await page.evaluate((ms) => new Promise((res, rej) => {
      window.__benchDone = res;
      setTimeout(() => rej(new Error('Timeout')), ms);
    }), timeoutMs);
  } catch (e) {
    await browser.close();
    console.error(`\n${RED}Erreur pendant le benchmark: ${e.message}${R}`);
    process.exit(1);
  }

  await browser.close();

  if (results.error) {
    console.error(`\n${RED}Erreur: ${results.error}${R}`);
    process.exit(1);
  }

  // ── Format report ─────────────────────────────────────────────────────────
  const { config, codec: detectedCodec, resolution: measuredResolution, encoderImpl,
          bitrate: br, fps: fpsStats, rtt, jitter,
          decodeTime, packetLossRate, qualityLimitation } = results;

  const bitrateAvgMbps = br.avgKbps / 1000;
  const bitrateMaxMbps = br.maxKbps / 1000;
  const bitrateMinMbps = br.minKbps / 1000;
  const bitrateRatio   = br.avgKbps / config.targetBitrateKbps;
  const lossPercent    = (packetLossRate * 100).toFixed(3);
  const isHw           = encoderImpl && !encoderImpl.toLowerCase().includes('software')
                         && !encoderImpl.toLowerCase().includes('openh264')
                         && encoderImpl !== 'unknown';

  const limLabel = qualityLimitation === 'none'      ? `${G}Aucune${R}`
    : qualityLimitation === 'bandwidth' ? `${Y}Bande passante${R}`
    : qualityLimitation === 'cpu'       ? `${Y}CPU${R}`
    : qualityLimitation;

  const qScore  = scoreQuality(results);    // 0-10
  const fScore  = scoreFps(results);        // 0-10
  const qColor  = qScore >= 8 ? G : qScore >= 6 ? Y : RED;
  const fColor  = fScore >= 9.5 ? G : fScore >= 8 ? Y : RED;
  const lColor  = bitrateRatio >= 0.9 ? G : bitrateRatio >= 0.7 ? Y : RED;

  // Shorten codec string
  const codecShort = detectedCodec.replace(/profile-level-id=([0-9a-fA-F]{6})/i, (_, id) => {
    const p = parseInt(id.slice(0, 2), 16);
    return p === 0x64 ? '[H264-High]' : p === 0x4d ? '[H264-Main]' : `[${id}]`;
  }).slice(0, 48);

  console.log(`\n\n${B}Résultats${R}  ${DIM}${duration}s · loopback local · ${new Date().toLocaleString('fr-FR')}${R}`);
  console.log(HR);
  console.log(row('Codec',        codecShort));
  console.log(row('Encodeur',     isHw ? `${G}${encoderImpl} (HW)${R}` : `${DIM}${encoderImpl} (SW)${R}`));
  console.log(row('Résolution',   measuredResolution));
  console.log('');
  console.log(row('Bitrate moyen',  `${lColor}${bitrateAvgMbps.toFixed(2)} Mbps${R}`,
    `cible ${bitrate/1000} Mbps · utilisation ${Math.round(bitrateRatio*100)}%`));
  console.log(row('Bitrate min/max', `${bitrateMinMbps.toFixed(2)} — ${bitrateMaxMbps.toFixed(2)} Mbps`));
  console.log('');
  console.log(row('FPS moyen envoi',  `${color(fpsStats.avgSend, fps*0.98, fps*0.85, 0)}${fpsStats.avgSend.toFixed(1)} fps${R}`,
    `cible ${fps} fps · min ${fpsStats.minSend.toFixed(1)}`));
  console.log(row('FPS moyen reçu',   `${fpsStats.avgRecv.toFixed(1)} fps`));
  console.log('');
  console.log(row('RTT', rtt.avgMs > 0 ? `${rtt.avgMs.toFixed(2)} ms` : 'N/A (loopback)'));
  console.log(row('Jitter',        `${jitter.avgMs.toFixed(3)} ms`));
  console.log(row('Perte paquets', `${parseFloat(lossPercent) > 0.1 ? RED : G}${lossPercent}%${R}`));
  console.log(row('Temps décodage', decodeTime.avgMs > 0 ? `${decodeTime.avgMs.toFixed(2)} ms/frame` : 'N/A'));
  console.log(row('Limitation',    limLabel));
  console.log('');
  console.log(HR);

  const qScoreDisplay = Math.min(10, qScore).toFixed(1);
  const fScoreDisplay = Math.min(10, fScore).toFixed(1);        // fScore is already 0-10
  const bScoreDisplay = Math.min(10, bitrateRatio * 10).toFixed(1);

  console.log(`${DIM}Score qualité   ${R}${qColor}${bar(qScore, 10)}${R}  ${B}${qScoreDisplay}/10${R}`);
  console.log(`${DIM}Score FPS       ${R}${fColor}${bar(fScore, 10)}${R}  ${B}${fScoreDisplay}/10${R}`);  // bar takes 0-10
  console.log(`${DIM}Score bitrate   ${R}${lColor}${bar(bitrateRatio * 10, 10)}${R}  ${B}${bScoreDisplay}/10${R}`);
  console.log(HR);

  // ── Recommendations ────────────────────────────────────────────────────────
  const recs = [];
  if (bitrateRatio < 0.70)
    recs.push(`Bitrate réel (${bitrateAvgMbps.toFixed(1)} Mbps) bien en dessous de la cible — le réseau ou l'encodeur limitent.`);
  if (fpsStats.avgSend < fps * 0.85)
    recs.push(`FPS instable (${fpsStats.avgSend.toFixed(1)}/${fps}) — réduis la résolution ou le bitrate.`);
  if (!isHw && encoderImpl !== 'unknown')
    recs.push(`Encodage logiciel détecté (${encoderImpl}) — active H264/H265 NVENC/AMF/QSV pour réduire la charge CPU.`);
  if (qualityLimitation === 'bandwidth')
    recs.push(`L'encodeur est limité par la bande passante — augmente le bitrate cible ou réduis la résolution.`);
  if (qualityLimitation === 'cpu')
    recs.push(`L'encodeur est limité par le CPU — envisage un codec matériel ou réduis le FPS cible.`);
  if (parseFloat(lossPercent) > 0.1)
    recs.push(`Pertes de paquets (${lossPercent}%) — réseau instable ou congestionné.`);

  if (recs.length) {
    console.log(`\n${B}${ACC}Recommandations${R}`);
    recs.forEach(r => console.log(`  ${DIM}·${R} ${r}`));
  } else {
    console.log(`\n${G}${B}✓ Configuration optimale — aucune limitation détectée.${R}`);
  }

  console.log(`\n${DIM}Note : ce benchmark mesure un loopback local en encodage logiciel.${R}`);
  console.log(`${DIM}En production avec encodeur matériel (NVENC/AMF/QSV), les scores FPS et${R}`);
  console.log(`${DIM}bitrate seront nettement meilleurs. Lancez l'app Recto pour tester en réel.${R}`);
  console.log('');
}

main().catch(e => {
  console.error(`\n${RED}Erreur fatale: ${e.message}${R}\n${e.stack}`);
  process.exit(1);
});
