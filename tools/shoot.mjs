/**
 * shoot.mjs — the inspection harness. Loads the REAL running game in a real
 * headless Chromium with WebGL, drives it with scripted input, captures
 * screenshots + console/network errors, and writes a JSON report.
 *
 * Usage:
 *   node tools/shoot.mjs --script scenarios/foo.json --out shots/foo
 *   node tools/shoot.mjs --out shots/quick                 (default scenario)
 *
 * Flags: --url --out --script --width --height --headed --timeout --video --keep-title --keep-saves
 *
 * Scenario JSON: { "name": "...", "steps": [ ...step... ] }
 * Steps:
 *   {"wait": 800}                                  sleep ms
 *   {"waitFor": "window.__DQ && __DQ.ready", "timeout": 20000}
 *   {"eval": "__DQ.goto('battle')"}                run JS in page (awaited)
 *   {"key": "ArrowUp", "hold": 600}                hold a key
 *   {"tap": "Enter", "times": 320, "hold":130, "gap":190, "until":"expr"}   hold+tap a key N times,
 *                                                stopping early when `until` goes true. `press` is NOT a tap:
 *                                                keydown and keyup in the same millisecond, and poll() clears
 *                                                keyTaps inside itself, so it is seen or missed at random.
 *   {"press": "Enter", "times": 2, "delay": 250}   down/up, no hold (unreliable; prefer `tap`)
 *   {"shot": "01-title"}                           screenshot
 *   {"burst": {"name":"walk","count":8,"interval":90}}   animation strip
 *   {"assert": "expr", "msg": "..."}               record a failed assertion
 *   {"note": "text"}                               annotate the report
 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf('--' + k); return i >= 0 ? argv[i + 1] : d; };
const flag = (k) => argv.includes('--' + k);

const OUT = path.resolve(arg('out', 'shots/run'));

// A scenario that presses keys on the TITLE screen is not measuring the game. The title is its own scene and
// it swallows the input, so every assertion after it fails for a reason that has nothing to do with the code
// under test — and a title-swallowed run LOOKS like a product bug (the camera appears frozen, the boy pinned
// against a wall that he never walked into). Unless a scenario says otherwise, boot past it. The alternative
// flag, `?title=0`, is title.js's own documented switch for exactly this.
//
// --keep-title is the way back, AND THE FLAG IS EASY TO FORGET: without it the title never enters the scene
// stack at all, so `__DQ.title()` returns `{ok:false}` (not a describe() with no `phase`) and every
// waitFor on `__DQ.title().phase === ...` times out even though the title screen rendered perfectly in
// shot 01. The beat still plays — the boot falls through to the field — so the run looks half-right and the
// failing waits read as product bugs. P25B lost two full runs to this.
const SKIP_TITLE = !flag('keep-title');
// 8123, not 8177, and the digits were the bug: a server left listening on 8177 serves an OLD BUILD of the game with
// no /build-id.json, so a run that forgot --url measured yesterday's code and said so with total confidence. Two full
// afternoons of phantom bugs came from that one character. The dev server's own port is the default for that reason.
let URL_ = arg('url', 'http://localhost:8123/index.html');
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
  // "Failed to load resource: the server responded with a status of 404" names no file, and a 404 that cannot be
  // traced costs a whole run to find. Console messages carry the location of what logged them, so keep it.
  const where = m.location && m.location();
  const at = where && where.url ? ` @ ${where.url}:${where.lineNumber}:${where.columnNumber}` : '';
  if (t === 'error') report.consoleErrors.push(txt + at);
  else if (t === 'warning') report.consoleWarnings.push(txt + at);
});
page.on('pageerror', e => report.pageErrors.push(String(e && e.stack || e)));
page.on('requestfailed', r => {
  const f = r.failure(); if (f && /aborted/i.test(f.errorText)) return;
  report.failedRequests.push(`${r.url()} :: ${f ? f.errorText : '?'}`);
});
// A 404 is a `console.error` in the browser, not a failed request, so the block above never sees it. Without this a
// missing asset is reported only as a status code and the run cannot say which file was missing.
page.on('response', r => { if (r.status() >= 400) report.failedRequests.push(`${r.status()} ${r.url()}`); });

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
  // A fresh browser context has empty localStorage, but this one may be REUSED across runs (`--url` on a page
  // that outlives the process), and a save left on disk changes what the title menu does: with a tale written, the
  // cursor opens on "Carry On", so the same keypress goes to the slot list instead of "A New Tale". Every run of a
  // scenario therefore has to begin from no saves at all, or it is not testing the path it was written for.
  if (!flag('keep-saves')) {
    await page.evaluate(() => { try { localStorage.clear(); } catch (_) {} });
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 45000 });
  }
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
        // A SCENARIO MUST NOT BE ABLE TO HANG THE HARNESS. `eval` is awaited inside one big try/catch, so a step
        // whose promise never settles — a `storyPlay` awaiting a dialogue nobody is going to dismiss — hangs the whole
        // run past the global timeout, because the deadline is only checked BETWEEN steps. Node then sits in kevent
        // with no timer of its own, so nothing prints and no report.json is written: a dead run looks exactly like a
        // slow one, and the evidence is gone with it.
        //
        // So each eval races its own deadline and the SLOW ONE LOSES. Playwright cannot cancel a promise already
        // handed to the page — `page.evaluate` has no AbortSignal — but the race settles, the step is recorded as
        // failed, and the run goes on to the steps after it. `rest` is the page-side job, deliberately NOT awaited:
        // if it ever settles it drops its result in the scratchpad rather than resurrecting a race that has moved on.
        const budget = Number(step.timeout) || GLOBAL_TIMEOUT;
        const slow = Symbol('eval overran');
        const rest = page.evaluate(`(async()=>{ const v = await (${step.eval}); window.__DQ.lastEval = v; return v; })()`)
          .catch((e) => ({ __err: String(e && e.message || e) }));
        const v = await Promise.race([rest, new Promise((r) => setTimeout(() => r(slow), budget))]);
        if (v === slow) {
          report.ok = false;
          report.evals.push({ expr: step.eval, value: { ok: false, why: `the eval did not finish within ${budget}ms` } });
          report.notes.push(`STEP TIMED OUT after ${budget}ms :: ${step.eval.slice(0, 200)}`);
          continue;
        }
        if (v && typeof v === 'object' && v.__err) {
          report.ok = false;
          report.evals.push({ expr: step.eval, value: { ok: false, why: v.__err } });
          report.notes.push(`EVAL THREW :: ${v.__err}`);
          continue;
        }
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
      // `key` is one hold. A storybook is a minute of thumb, so scenarios that have to READ a beat to the end
      // want the same key many times over. Written as `key` steps this is hundreds of near-identical lines — and
      // the first time it was written that way, the loop was typed once instead of 320 times and the scenario
      // sat and timed out looking exactly like a hung cutscene. So it is a verb, and the count is a number.
      // Use `hold` + `gap`, NOT `press`: a keyboard.press() is a keydown and keyup in the same millisecond and
      // poll() reads-and-clears keyTaps inside itself, so whether it is seen at all is a coin flip.
      if (step.tap) {
        const hold = step.hold == null ? 130 : step.hold;
        const gap = step.gap == null ? 190 : step.gap;
        const times = step.times || 1;
        report.taps = (report.taps || 0) + times;
        for (let i = 0; i < times; i++) {
          if (step.until && await page.evaluate(`!!(${step.until})`).catch(() => false)) { report.tapsDone = i; break; }
          await page.keyboard.down(step.tap);
          await page.waitForTimeout(hold);
          await page.keyboard.up(step.tap);
          await page.waitForTimeout(gap);
        }
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

  // WAS THIS EVEN THE CODE ON DISK? A server left listening on an old port serves an OLD BUILD, and every assertion in
  // the scenario then describes yesterday's game with total confidence — the failure mode that hid a chapter beat for
  // two afternoons while P25D read green. The build id is a sha over index.html + src/** + vendor/**, so the page's
  // copy and this file's copy agreeing is the only proof that a green run means anything.
  report.build = await page.evaluate(() => (window.__DQ && window.__DQ.buildId) || null).catch(() => null);
  let disk = null;
  try {
    // the same function the server computes at boot (tools/buildid.test.mjs holds the two to each other), so the
    // number in the page and the number here are comparable without wondering whether they came from one recipe
    disk = execFileSync(process.execPath, [path.resolve(path.dirname(new URL(import.meta.url).pathname), 'buildid.mjs')],
      { encoding: 'utf8', timeout: 20000 }).trim().split(/\s+/).pop() || null;
  } catch (_) { disk = null; }
  if (disk) {
    if (!report.build) {
      report.build = { ok: false, why: 'the page reported no build id — a server that predates the build-id work, or not this game' };
      report.ok = false;
    } else if (report.build !== disk) {
      report.build = { ok: false, served: report.build, disk, why: 'the server is serving a DIFFERENT build than the one on disk' };
      report.ok = false;
    } else report.build = { ok: true, id: report.build, files: null };
  }
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
