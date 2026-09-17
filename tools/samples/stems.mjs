#!/usr/bin/env node
/**
 * tools/samples/stems.mjs — render a cue's buses separately, so the counterpoint can be heard (and measured) alone.
 *   node tools/samples/stems.mjs --ids village,overworld,battle --seconds 60 --out shots/P27-s7/stems
 * Writes <id>-<bus>.wav for melody / counter / harmony / bass / perc plus <id>-melody+counter.wav (the two lines that
 * are supposed to talk to each other), and prints each stem's RMS so the balance is on the record.   (P27)
 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf('--' + k); return i >= 0 ? argv[i + 1] : d; };
const URL_ = arg('url', 'http://localhost:8177/demos/P27.html');
const IDS = String(arg('ids', 'village,overworld,battle')).split(',').filter(Boolean);
const SECS = +arg('seconds', 60);
const OUT = path.resolve(arg('out', 'shots/P27-stems'));
fs.mkdirSync(OUT, { recursive: true });
const BUSES = ['melody', 'counter', 'harmony', 'bass', 'perc'];
const MIXES = [...BUSES.map((b) => [b, [b]]), ['melody+counter', ['melody', 'counter']]];
const browser = await chromium.launch({ headless: true, args: ['--autoplay-policy=no-user-gesture-required', '--mute-audio'] });
const page = await browser.newPage();
await page.goto(URL_, { waitUntil: 'domcontentloaded' });
await page.waitForFunction('window.__DQ && window.__DQ.ready && typeof window.__DQ.renderAudio === "function"', null, { timeout: 30000 });
for (const id of IDS) {
  for (const [name, on] of MIXES) {
    const r = await page.evaluate(async ({ id, on, SECS, BUSES }) => {
      const busMul = {}; for (const b of BUSES) busMul[b] = on.includes(b) ? 1 : 0;
      const buf = await window.__DQ.renderAudio(id, SECS, { busMul });
      const n = buf.length, L = buf.getChannelData(0), R = buf.numberOfChannels > 1 ? buf.getChannelData(1) : L;
      let ss = 0, pk = 0;
      const bytes = new DataView(new ArrayBuffer(44 + n * 4));
      const ws = (o, s) => [...s].forEach((c, i) => bytes.setUint8(o + i, c.charCodeAt(0)));
      ws(0, 'RIFF'); bytes.setUint32(4, 36 + n * 4, true); ws(8, 'WAVEfmt '); bytes.setUint32(16, 16, true); bytes.setUint16(20, 1, true); bytes.setUint16(22, 2, true);
      bytes.setUint32(24, buf.sampleRate, true); bytes.setUint32(28, buf.sampleRate * 4, true); bytes.setUint16(32, 4, true); bytes.setUint16(34, 16, true);
      ws(36, 'data'); bytes.setUint32(40, n * 4, true);
      for (let i = 0; i < n; i++) {
        const l = Math.max(-1, Math.min(1, L[i])), rr = Math.max(-1, Math.min(1, R[i]));
        bytes.setInt16(44 + i * 4, l * 32767, true); bytes.setInt16(46 + i * 4, rr * 32767, true);
        const v = (l + rr) / 2; ss += v * v; if (Math.abs(v) > pk) pk = Math.abs(v);
      }
      let bin = ''; const u8 = new Uint8Array(bytes.buffer);
      for (let i = 0; i < u8.length; i += 32768) bin += String.fromCharCode.apply(null, u8.subarray(i, i + 32768));
      return { wav: btoa(bin), rms: +(10 * Math.log10(ss / n + 1e-12)).toFixed(1), peak: +(20 * Math.log10(pk + 1e-9)).toFixed(1) };
    }, { id, on, SECS, BUSES });
    fs.writeFileSync(path.join(OUT, `${id}-${name}.wav`), Buffer.from(r.wav, 'base64'));
    console.log(`${id} ${name.padEnd(15)} rms ${String(r.rms).padStart(6)} dBFS  peak ${String(r.peak).padStart(6)} dBFS  ${path.join(OUT, `${id}-${name}.wav`)}`);
  }
}
await browser.close();
