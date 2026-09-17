#!/usr/bin/env node
/**
 * tools/samples/evalpage.mjs — run an async JS snippet (a file exporting nothing: its body is `async () => {...}` source)
 * inside the P27 demo page and print the JSON it returns. For quick in-browser audio experiments.   (P27)
 *   node tools/samples/evalpage.mjs snippet.js [--url http://localhost:8177/demos/P27.html]
 */
import { chromium } from 'playwright';
import fs from 'node:fs';
const argv = process.argv.slice(2);
const i = argv.indexOf('--url'); const URL_ = i >= 0 ? argv.splice(i, 2)[1] : 'http://localhost:8177/demos/P27.html';
const src = fs.readFileSync(argv[0], 'utf8');
const browser = await chromium.launch({ headless: true, args: ['--autoplay-policy=no-user-gesture-required', '--mute-audio'] });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e))); page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(m.type() + ': ' + m.text()); });
await page.goto(URL_, { waitUntil: 'domcontentloaded' });
await page.waitForFunction('window.__DQ && window.__DQ.ready', null, { timeout: 30000 });
const out = await page.evaluate(`(${src})()`).catch((e) => ({ error: String(e) }));
console.log(typeof out === 'string' ? out : JSON.stringify(out, null, 1));
if (errors.length) console.log('page messages:', errors.slice(0, 10));
await browser.close();
