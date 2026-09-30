/**
 * shoot.mjs — the inspection harness. Loads the REAL running game in a real
 * headless Chromium with WebGL, drives it with scripted input, captures
 * screenshots + console/network errors, and writes a JSON report.
 *
 * Usage:
 *   node tools/shoot.mjs --script scenarios/foo.json --out shots/foo
 *   node tools/shoot.mjs --out shots/quick                 (default scenario)
 *
 * Flags: --url --out --script --width --height --headed --timeout --video
 *
 * Scenario JSON: { "name": "...", "steps": [ ...step... ] }
 * Steps:
 *   {"wait": 800}                                  sleep ms
 *   {"waitFor": "window.__DQ && __DQ.ready", "timeout": 20000}
 *   {"eval": "__DQ.goto('battle')"}                run JS in page (awaited)
 *   {"key": "ArrowUp", "hold": 600}                hold a key
 *   {"press": "Enter", "times": 2, "delay": 250}   tap a key
 *   {"shot": "01-title"}                           screenshot
 *   {"burst": {"name":"walk","count":8,"interval":90}}   animation strip
 *   {"assert": "expr", "msg": "..."}               record a failed assertion
 *   {"note": "text"}                               annotate the report
 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf('--' + k); return i >= 0 ? argv[i + 1] : d; };
const flag = (k) => argv.includes('--' + k);

const OUT = path.resolve(arg('out', 'shots/run'));

// A scenario that presses keys on the TITLE screen is not measuring the game. The title is its own scene and
// it swallows the input, so every assertion after it fails for a reason that has nothing to do with the code
// under test — and a title-swallowed run LOOKS like a product bug (the camera appears frozen, the boy pinned
// against a wall that he never walked into). Unless a scenario says otherwise, boot past it. The alternative
// flag, `?title=0`, is title.js's own documented switch for exactly this.
const SKIP_TITLE = !flag('keep-title');
let URL_ = arg('url', 'http://localhost:8177/');
if (SKIP_TITLE && /(^|[?&])title=(?!0\b)/.test(URL_) === false && !/[?&]skiptitle/.test(URL_)) {
  URL_ += (URL_.includes('?') ? '&' : '?') + 'title=0';
}
const W = Number(arg('width', 1280)), H = Number(arg('height', 720));
const GLOBAL_TIMEOUT = Number(arg('timeout', 180000));

fs.mkdirSync(OUT, { recursive: true });

let scenario = { name: 'default', steps: [
  { waitFor: 'window.__DQ && window.__DQ.ready', timeout: 30000 },
  { wait: 900 }, { shot: '01-boot' },
  { press: 'Enter', times: 2, delay: 700 }, { wait: 1200 }, { shot: '02-after-enter' },
  { key: 'ArrowDown', hold: 900 }, { shot: '03-walk' },
  { wait: 600 }, { shot: '04-idle' },
]};
const sp = arg('script');
if (sp) scenario = JSON.parse(fs.readFileSync(sp, 'utf8'));

const report = {
  scenario: scenario.name || path.basename(sp || 'default'),
  url: URL_, viewport: { w: W, h: H },
  shots: [], notes: [], assertions: [], evals: [],
  consoleErrors: [], consoleWarnings: [], pageErrors: [], failedRequests: [],
  perf: null, finalState: null, ok: true, fatal: null,
};

const t0 = Date.now();
const browser = await chromium.launch({
  headless: !flag('headed'),
  args: [
    '--use-angle=metal', '--enable-unsafe-webgpu', '--ignore-gpu-blocklist',
    '--enable-gpu', '--enable-webgl', '--autoplay-policy=no-user-gesture-required',
    '--mute-audio',
  ],
});
const ctx = await browser.newContext({
  viewport: { width: W, height: H }, deviceScaleFactor: 1,
  // A scenario that fails on a probe it JUST installed is usually the server's HTTP cache serving the
  // previous scenario file: the eval succeeds, the next step still sees the old one. Every run must
  // measure the scenario on disk now, so nothing is cached at all.
  bypassCSP: true,
  ...(flag('video') ? { recordVideo: { dir: path.join(OUT, 'video'), size: { width: W, height: H } } } : {}),
});
const page = await ctx.newPage();

page.on('console', m => {
  const t = m.type(), txt = m.text();
  if (t === 'error') report.consoleErrors.push(txt);
  else if (t === 'warning') report.consoleWarnings.push(txt);
});
page.on('pageerror', e => report.pageErrors.push(String(e && e.stack || e)));
page.on('requestfailed', r => {
  const f = r.failure(); if (f && /aborted/i.test(f.errorText)) return;
  report.failedRequests.push(`${r.url()} :: ${f ? f.errorText : '?'}`);
});

let shotN = 0;
const shot = async (name) => {
  const file = `${String(++shotN).padStart(2, '0')}-${String(name).replace(/[^\w.-]+/g, '_')}.png`;
  await page.screenshot({ path: path.join(OUT, file) });
  report.shots.push(file);
  return file;
};

try {
  await page.context().setExtraHTTPHeaders({ 'cache-control': 'no-cache', pragma: 'no-cache' });
  await page.route('**/*', route => route.continue({ headers: { ...route.request().headers(), 'cache-control': 'no-cache', pragma: 'no-cache' } }));
  await page.goto(URL_, { waitUntil: 'domcontentloaded', timeout: 45000 });
  report.url = URL_;   // the title flag may have been appended above, so the report must say which page ran
  // Instrument frame timing.
  await page.addInitScript(() => {});
  await page.evaluate(() => {
    window.__fps = { frames: 0, long: 0, last: performance.now(), start: performance.now() };
    const loop = () => {
      const n = performance.now(), dt = n - window.__fps.last;
      window.__fps.last = n; window.__fps.frames++;
      if (dt > 50) window.__fps.long++;
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  });

  for (const step of scenario.steps || []) {
    if (Date.now() - t0 > GLOBAL_TIMEOUT) { report.notes.push('GLOBAL TIMEOUT — remaining steps skipped'); break; }
    try {
      if (step.wait != null) await page.waitForTimeout(step.wait);
      if (step.waitFor) {
        await page.waitForFunction(step.waitFor, null, { timeout: step.timeout || 30000, polling: 100 });
      }
      if (step.eval) {
        const v = await page.evaluate(`(async()=>{ return await (${step.eval}); })()`);
        if (v !== undefined && v !== null) {
          const full = JSON.stringify(v);
          report.evals.push({ expr: step.eval, value: v });
          // A value holding a function (a probe that closes over the page) serialises to the string
          // "[object Object]" and the measurement is lost. Give the page one more chance to describe
          // itself IN the page, where its fields are still readable.
          const viaPage = full.includes('[object Object]')
            ? await page.evaluate(`(()=>{ try { return JSON.stringify(${step.eval}); } catch (e) { return null; } })()`).catch(() => null)
            : null;
          const shown = viaPage || full;
          report.notes.push(`eval ${step.eval} -> ${shown.length > 4000 ? shown.slice(0, 4000) + ' …[full value in report.json evals]' : shown}`);
        }
      }
      if (step.key) {
        await page.keyboard.down(step.key);
        await page.waitForTimeout(step.hold || 400);
        await page.keyboard.up(step.key);
      }
      if (step.press) {
        for (let i = 0; i < (step.times || 1); i++) {
          await page.keyboard.press(step.press);
          await page.waitForTimeout(step.delay || 200);
        }
      }
      if (step.shot) await shot(step.shot);
      if (step.burst) {
        const b = step.burst;
        for (let i = 0; i < (b.count || 6); i++) {
          await shot(`${b.name || 'burst'}-f${i}`);
          await page.waitForTimeout(b.interval || 100);
        }
      }
      if (step.assert) {
        const ok = await page.evaluate(`!!(${step.assert})`).catch(() => false);
        report.assertions.push({ expr: step.assert, msg: step.msg || '', pass: !!ok });
        if (!ok) report.ok = false;
      }
      if (step.note) report.notes.push(step.note);
    } catch (e) {
      report.notes.push(`STEP FAILED ${JSON.stringify(step).slice(0, 200)} :: ${e.message}`);
      report.ok = false;
    }
  }

  report.perf = await page.evaluate(() => {
    const f = window.__fps || {};
    const secs = (performance.now() - (f.start || 0)) / 1000;
    return { avgFps: +(f.frames / Math.max(secs, .001)).toFixed(1), longFrames: f.long || 0, seconds: +secs.toFixed(1) };
  }).catch(() => null);
  report.finalState = await page.evaluate(() =>
    (window.__DQ && typeof window.__DQ.state === 'function') ? window.__DQ.state() : null
  ).catch(() => null);
} catch (e) {
  report.fatal = String(e && e.stack || e);
  report.ok = false;
  try { await shot('FATAL'); } catch {}
}

if (report.pageErrors.length || report.consoleErrors.length || report.fatal) report.ok = false;

await ctx.close(); await browser.close();
fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 2));

const short = (a, n = 6) => a.slice(0, n).map(s => '   - ' + String(s).split('\n')[0].slice(0, 220)).join('\n');
console.log(`\n=== ${report.scenario} === ok=${report.ok}  shots=${report.shots.length}  dir=${OUT}`);
if (report.perf) console.log(`perf: ${report.perf.avgFps} fps avg, ${report.perf.longFrames} long frames over ${report.perf.seconds}s`);
if (report.fatal) console.log('FATAL:\n' + report.fatal.slice(0, 1500));
if (report.pageErrors.length) console.log(`pageErrors (${report.pageErrors.length}):\n` + short(report.pageErrors));
if (report.consoleErrors.length) console.log(`consoleErrors (${report.consoleErrors.length}):\n` + short(report.consoleErrors));
if (report.failedRequests.length) console.log(`failedRequests (${report.failedRequests.length}):\n` + short(report.failedRequests));
const bad = report.assertions.filter(a => !a.pass);
if (bad.length) console.log(`FAILED ASSERTIONS (${bad.length}):\n` + short(bad.map(a => `${a.expr} — ${a.msg}`)));
if (report.notes.length) console.log(`notes:\n` + short(report.notes, 25));
console.log('screenshots:\n' + report.shots.map(s => '   ' + path.join(OUT, s)).join('\n'));
process.exit(report.ok ? 0 : 1);
