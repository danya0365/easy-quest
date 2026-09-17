#!/usr/bin/env node
/**
 * tools/samples/netprobe.mjs — what a player on a slow line actually hears when a theme starts.   (P27)
 *   node tools/samples/netprobe.mjs --id overworld [--mbps 8] [--url ...]
 * Throttles the page's network with CDP, plays the theme cold, and reports: how long until it starts, how many notes
 * fell on a sample that had not arrived (missed), how many played from a neighbouring zone instead (fallbacks),
 * and how many MB the theme pulled. `--mbps 0` leaves the network alone (localhost baseline).
 */
import { chromium } from 'playwright';
const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf('--' + k); return i >= 0 ? argv[i + 1] : d; };
const URL_ = arg('url', 'http://localhost:8177/demos/P27.html');
const IDS = String(arg('id', 'overworld')).split(',');
const MBPS = +arg('mbps', 8);
const browser = await chromium.launch({ headless: true, args: ['--autoplay-policy=no-user-gesture-required', '--mute-audio'] });
for (const id of IDS) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Network.enable');
  if (MBPS > 0) await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 60, downloadThroughput: MBPS * 1e6 / 8, uploadThroughput: MBPS * 1e6 / 8 });
  await page.goto(URL_, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction('window.__DQ && window.__DQ.ready', null, { timeout: 60000 });
  const t0 = Date.now();
  await page.evaluate((id) => { window.__DQ.play(id, { fade: 0.2 }); }, id);
  const started = await page.waitForFunction(`__DQ.state().audio.playing === ${JSON.stringify(id)}`, null, { timeout: 60000 }).then(() => Date.now() - t0).catch(() => -1);
  await page.waitForTimeout(6000);
  const st = await page.evaluate(() => ({ audio: window.__DQ.state().audio, samples: window.__DQ.samples() }));
  console.log(`${id} @ ${MBPS || 'no'} Mbps: first sound after ${started < 0 ? 'NEVER' : (started / 1000).toFixed(2) + ' s'} · missed ${st.audio.missed} · fallbacks ${st.audio.fallbacks} · voices ${st.audio.voices} · fetched ${st.samples.mbFetched} MB of ${st.samples.totalMb} MB · sampler errors ${st.samples.errors}`);
  if (errors.length) console.log('  page errors:', errors.slice(0, 4));
  await ctx.close();
}
await browser.close();
