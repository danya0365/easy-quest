#!/usr/bin/env node
/**
 * tools/samples/loopmatch.mjs — does a loop come back the same way it started?   (P27 verification)
 *   node tools/samples/loopmatch.mjs --ids village,overworld,battle [--window 6]
 * Renders intro + two full loops of each cue, then compares the 20 ms RMS envelope of the loop's first `window`
 * seconds on pass 1 against the same stretch on pass 2 (and the seam itself). A loop that drops its opening notes,
 * or that starts late, shows up as a low correlation and a large early-difference; a seamless one is ~0.9+.
 * Also prints the biggest sample-to-sample step within 50 ms of the seam against the median step AND against the
 * music's own loudest step (99.9th percentile): a cymbal crash written across the seam steps as hard as a click
 * would, so only a seam step well above the music's own transients (>2x) is a real click.
 */
import { chromium } from 'playwright';
const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf('--' + k); return i >= 0 ? argv[i + 1] : d; };
const URL_ = arg('url', 'http://localhost:8177/demos/P27.html');
const IDS = String(arg('ids', 'village,overworld,battle')).split(',').filter(Boolean);
const WIN = +arg('window', 6);
const browser = await chromium.launch({ headless: true, args: ['--autoplay-policy=no-user-gesture-required', '--mute-audio'] });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e))); page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto(URL_, { waitUntil: 'domcontentloaded' });
await page.waitForFunction('window.__DQ && window.__DQ.ready && typeof window.__DQ.renderAudio === "function"', null, { timeout: 30000 });
let bad = 0;
for (const id of IDS) {
  const r = await page.evaluate(async ({ id, WIN }) => {
    const { THEMES } = await import('/src/audio/score/index.js');
    const th = THEMES[id]; if (!th || th.kind !== 'loop') return { error: 'not a loop' };
    const secs = th.introSec + th.loopSec * 2 + 2;
    const b = await window.__DQ.renderAudio(id, Math.min(secs, 200));
    const sr = b.sampleRate, L = b.getChannelData(0), R = b.numberOfChannels > 1 ? b.getChannelData(1) : L;
    const mono = new Float32Array(b.length);
    for (let i = 0; i < b.length; i++) mono[i] = (L[i] + R[i]) / 2;
    const h = Math.round(0.02 * sr);
    const env = (t0, dur) => { const out = []; for (let i = Math.round(t0 * sr); i + h < Math.round((t0 + dur) * sr); i += h) { let s = 0; for (let j = 0; j < h; j++) s += mono[i + j] * mono[i + j]; out.push(Math.sqrt(s / h)); } return out; };
    const a = env(th.introSec, WIN), c = env(th.introSec + th.loopSec, WIN);
    const n = Math.min(a.length, c.length);
    let sa = 0, sc = 0; for (let i = 0; i < n; i++) { sa += a[i]; sc += c[i]; }
    const ma = sa / n, mc = sc / n;
    let cov = 0, va = 0, vc = 0;
    for (let i = 0; i < n; i++) { cov += (a[i] - ma) * (c[i] - mc); va += (a[i] - ma) ** 2; vc += (c[i] - mc) ** 2; }
    const corr = cov / Math.sqrt(va * vc);
    // mean absolute level difference (dB) — steadier than a correlation on a texture that barely varies
    let dsum = 0; for (let i = 0; i < n; i++) dsum += Math.abs(20 * Math.log10((c[i] + 1e-9) / (a[i] + 1e-9)));
    const meanDiffDb = dsum / n;
    // the first 1.5 s of the loop: how much quieter is pass 2 than pass 1 (a dropped pickup shows here)
    const k = Math.round(1.5 / 0.02);
    let ea = 0, ec = 0; for (let i = 0; i < k && i < n; i++) { ea += a[i] ** 2; ec += c[i] ** 2; }
    const headDb = 10 * Math.log10((ec + 1e-12) / (ea + 1e-12));
    // click at the seam
    const seam = Math.round((th.introSec + th.loopSec) * sr);
    const steps = []; for (let i = seam - Math.round(0.05 * sr); i < seam + Math.round(0.05 * sr); i++) steps.push(Math.abs(mono[i + 1] - mono[i]));
    const all = []; for (let i = Math.round(sr * 1); i < b.length - 1; i += 37) all.push(Math.abs(mono[i + 1] - mono[i]));
    all.sort((p, q) => p - q);
    const med = all[Math.floor(all.length / 2)] || 1e-9;
    // a crash or a marcato entry steps just as hard as a click would: compare the seam with the music's own loudest steps
    const p999 = all[Math.floor(all.length * 0.999)] || 1e-9;
    return { corr: +corr.toFixed(3), meanDiffDb: +meanDiffDb.toFixed(2), headDb: +headDb.toFixed(2), seamStepRatio: +(Math.max(...steps) / med).toFixed(1),
      seamVsLoudestMusicStep: +(Math.max(...steps) / p999).toFixed(2), loopSec: +th.loopSec.toFixed(2), missed: b.__missed, steals: b.__steals, fallbacks: b.__fallbacks };
  }, { id, WIN }).catch((e) => ({ error: String(e) }));
  if (r.error) { console.log(`✗ ${id}: ${r.error}`); bad++; continue; }
  const ok = r.meanDiffDb < 2.5 && r.headDb > -2.5 && r.seamVsLoudestMusicStep <= 2;
  if (!ok) bad++;
  console.log(`${ok ? '✓' : '⚠'} ${id}: loop ${r.loopSec}s · pass2 vs pass1 over the loop's first ${WIN}s: mean |Δ| ${r.meanDiffDb} dB (corr ${r.corr}) · its first 1.5 s ${r.headDb >= 0 ? '+' : ''}${r.headDb} dB on the repeat · biggest step at the seam ${r.seamStepRatio}x the median, ${r.seamVsLoudestMusicStep}x the music's own loudest step · missed ${r.missed} steals ${r.steals} fallbacks ${r.fallbacks}`);
}
if (errors.length) { console.log('page errors:', errors.slice(0, 5)); bad++; }
await browser.close();
process.exit(bad ? 1 : 0);
