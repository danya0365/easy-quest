#!/usr/bin/env node
/**
 * tools/samples/envprobe.mjs — level envelope of offline renders from the P27 demo (held-note warble, slur dips, loading).
 *   node tools/samples/envprobe.mjs --ids note:clarinet:G4:mp:12:60,family.broken --seconds 14 [--from 1.5 --to 11] [--hop 0.1] [--print]
 * For each id: renders through window.__DQ.renderAudio (the same graph as the game), then reports the RMS envelope
 * (hop windows, both channels) between --from and --to: swing (max-min dB), the deepest dips relative to their
 * ±0.5 s neighbourhood, steals/missed counters. --print dumps the envelope.
 */
import { chromium } from 'playwright';
const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf('--' + k); return i >= 0 ? argv[i + 1] : d; };
const URL_ = arg('url', 'http://localhost:8177/demos/P27.html');
const IDS = String(arg('ids', '')).split(',').filter(Boolean);
const SECS = +arg('seconds', 14), FROM = +arg('from', 1.5), TO = +arg('to', SECS - 2), HOP = +arg('hop', 0.1);
const PRINT = argv.includes('--print');
const browser = await chromium.launch({ headless: true, args: ['--autoplay-policy=no-user-gesture-required', '--mute-audio'] });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e))); page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto(URL_, { waitUntil: 'domcontentloaded' });
await page.waitForFunction('window.__DQ && window.__DQ.ready && typeof window.__DQ.renderAudio === "function"', null, { timeout: 30000 });
for (const id of IDS) {
  const r = await page.evaluate(async ({ id, SECS, FROM, TO, HOP }) => {
    const b = await window.__DQ.renderAudio(id, SECS);
    const sr = b.sampleRate, h = Math.floor(sr * HOP);
    const chs = [0, 1].map((c) => b.getChannelData(Math.min(c, b.numberOfChannels - 1)));
    const env = [];
    for (let i = Math.floor(sr * FROM); i + h < Math.floor(sr * TO); i += h) {
      let s = 0; for (const d of chs) for (let j = 0; j < h; j++) s += d[i + j] * d[i + j];
      env.push({ t: +(i / sr).toFixed(2), db: +(10 * Math.log10(s / (h * chs.length) + 1e-12)).toFixed(1) });
    }
    const dbs = env.map((e) => e.db);
    const dips = [];
    const k = Math.round(0.5 / HOP);
    for (let i = k; i < env.length - k; i++) {
      const nb = [...dbs.slice(i - k, i), ...dbs.slice(i + 1, i + k + 1)].sort((a, b) => a - b);
      const med = nb[Math.floor(nb.length / 2)];
      if (dbs[i] < med - 3 && dbs[i] <= dbs[i - 1] && dbs[i] <= dbs[i + 1]) dips.push({ t: env[i].t, depth: +(med - dbs[i]).toFixed(1) });
    }
    return { swing: +(Math.max(...dbs) - Math.min(...dbs)).toFixed(1), max: Math.max(...dbs), min: Math.min(...dbs), dips: dips.sort((a, b) => b.depth - a.depth).slice(0, 8), env, steals: b.__steals, missed: b.__missed, legato: b.__legato };
  }, { id, SECS, FROM, TO, HOP });
  console.log(`${id}: swing ${r.swing} dB (${r.min}..${r.max}) · dips ${r.dips.map((d) => `${d.t}s -${d.depth}`).join(', ') || 'none'} · steals ${r.steals} missed ${r.missed} legato ${r.legato}`);
  if (PRINT) console.log('   ' + r.env.map((e) => `${e.t}:${e.db}`).join(' '));
}
if (errors.length) console.log('page errors:', errors.slice(0, 5));
await browser.close();
