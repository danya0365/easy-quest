#!/usr/bin/env node
/**
 * tools/samples/loopcheck.mjs — audit every baked sustain loop in vendor/samples (P27).
 *   node tools/samples/loopcheck.mjs [instrumentId ...] [--worst 20] [--json out.json]
 * Per loop zone (decoded with ffmpeg at the file's own rate):
 *   swing  max-min of the 60 ms RMS envelope inside [ls, le) — a swell that repeats every loop length
 *   wrap   level of the loop's last 100 ms vs its first 100 ms (dB) — a step you hear at every wrap
 *   seam   |y[ls] - y[le-1]| / median |sample step| inside the loop — a click candidate when large
 * Prints a summary (how many exceed 1.5 dB wrap / 6 dB swing / seam 8x) and the worst offenders.
 */
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const run = promisify(execFile);
const ROOT = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), '../..');
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args.splice(i, 2)[1] : d; };
const WORST = +opt('worst', 15), JSON_OUT = opt('json', null);
const man = JSON.parse(fs.readFileSync(path.join(ROOT, 'vendor/samples/manifest.json'), 'utf8'));
const ids = args.length ? args : Object.keys(man.instruments);

export async function decodeFile(file, sr) {
  const { stdout } = await run('ffmpeg', ['-v', 'error', '-i', file, '-ac', '1', '-ar', String(sr), '-f', 'f32le', '-'], { encoding: 'buffer', maxBuffer: 1 << 30 });
  return Float32Array.from(new Float32Array(stdout.buffer, stdout.byteOffset, stdout.byteLength >> 2));
}
export function measureLoop(y, sr, ls, le) {
  const L = le - ls, W = Math.round(0.06 * sr), H = Math.round(0.02 * sr);
  const at = (i) => y[ls + (((i % L) + L) % L)];
  const env = [];
  for (let i = 0; i < L; i += H) { let s = 0; for (let j = 0; j < W; j++) { const v = at(i + j); s += v * v; } env.push(10 * Math.log10(s / W + 1e-12)); }
  const swing = Math.max(...env) - Math.min(...env);
  // slow swell: 250 ms windows (a vibrato's tremble averages out; a bow swell or breath dip does not)
  const W2 = Math.min(Math.round(0.25 * sr), L), env2 = [];
  for (let i = 0; i < L; i += H) { let s = 0; for (let j = 0; j < W2; j++) { const v = at(i + j); s += v * v; } env2.push(10 * Math.log10(s / W2 + 1e-12)); }
  const slow = Math.max(...env2) - Math.min(...env2);
  const R = Math.min(Math.round(0.1 * sr), Math.floor(L / 3));
  let a = 0, b = 0; for (let j = 0; j < R; j++) { a += y[ls + j] ** 2; b += y[le - R + j] ** 2; }
  const wrap = 10 * Math.log10((b + 1e-12) / (a + 1e-12));
  const steps = []; for (let i = ls; i < le - 1; i += 7) steps.push(Math.abs(y[i + 1] - y[i]));
  steps.sort((p, q) => p - q);
  const med = steps[Math.floor(steps.length / 2)] || 1e-9;
  const seam = Math.abs(y[ls] - y[le - 1]) / med;
  return { swing: +swing.toFixed(1), slow: +slow.toFixed(1), wrap: +wrap.toFixed(2), seam: +seam.toFixed(1), loopSec: +(L / sr).toFixed(2) };
}

const rows = [];
for (const id of ids) {
  const ins = man.instruments[id]; if (!ins || ins.kind !== 'loop') continue;
  await Promise.all(ins.zones.map(async (z) => {
    const y = await decodeFile(path.join(ROOT, 'vendor/samples', z.f), z.sr);
    rows.push({ id, f: z.f, r: z.r, l: z.l, ...measureLoop(y, z.sr, z.ls, z.le), flat: !!z.flat });
  }));
}
const n = rows.length;
const cnt = (fn) => rows.filter(fn).length;
console.log(`${n} loops · slow swell (250 ms) > 3 dB: ${cnt((r) => r.slow > 3)} > 6 dB: ${cnt((r) => r.slow > 6)} · wrap > 1.5 dB: ${cnt((r) => Math.abs(r.wrap) > 1.5)} · swing(60 ms) > 6 dB: ${cnt((r) => r.swing > 6)} · swing > 3 dB: ${cnt((r) => r.swing > 3)} · seam > 8x: ${cnt((r) => r.seam > 8)} · median swing ${rows.map((r) => r.swing).sort((a, b) => a - b)[Math.floor(n / 2)]} dB`);
const by = {};
for (const r of rows) { (by[r.id] ||= []).push(r); }
for (const [id, rs] of Object.entries(by)) console.log(`  ${id.padEnd(14)} loops ${String(rs.length).padStart(3)}  worst swing ${Math.max(...rs.map((r) => r.swing)).toFixed(1).padStart(5)} dB  worst |wrap| ${Math.max(...rs.map((r) => Math.abs(r.wrap))).toFixed(1).padStart(4)} dB  worst seam ${Math.max(...rs.map((r) => r.seam)).toFixed(1).padStart(5)}x  loop ${Math.min(...rs.map((r) => r.loopSec))}-${Math.max(...rs.map((r) => r.loopSec))} s`);
console.log('worst swings:'); rows.sort((a, b) => b.slow - a.slow).slice(0, WORST).forEach((r) => console.log(`  slow ${r.slow} dB  swing ${r.swing} dB  wrap ${r.wrap}  seam ${r.seam}x  ${r.f}`));
console.log('worst seams:'); rows.sort((a, b) => b.seam - a.seam).slice(0, 6).forEach((r) => console.log(`  ${r.seam}x  ${r.f}`));
if (JSON_OUT) fs.writeFileSync(JSON_OUT, JSON.stringify(rows, null, 1));
