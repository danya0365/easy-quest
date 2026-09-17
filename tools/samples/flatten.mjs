#!/usr/bin/env node
/**
 * tools/samples/flatten.mjs — take the slow swell out of every baked sustain loop, in place.   (P27)
 *   node tools/samples/flatten.mjs [instrumentId ...] [--force] [--dry]
 *
 * A 1-2 s loop cut from a real sustain keeps whatever the player did in that second: a bow swell, a breath dip, a
 * crescendo. Looped, it becomes a mechanical 6-18 dB wobble every loop length (loopcheck.mjs: 88 of 269 loops).
 * For each loop zone:
 *   env(i)  circular RMS over a 400 ms Hann window centred on i (circular = the loop is periodic, so is the curve;
 *           400 ms averages over vibrato — the tremble of a bow or a breath stays, only the slow swell goes)
 *   gain(i) = mean loop RMS / env(i), limited to ±8 dB, applied to the loop body (so gain(le) = gain(ls): the seam
 *           stays sample-continuous), ramped in from 1.0 over the 150 ms before ls, and copied into the resampler guard
 * The file is re-encoded (FLAC, 16-bit, TPDF dither — same as build.mjs), the peak kept <= 0.891, and the zone's
 * loudness gain `g` recomputed from the new loop RMS so every zone still plays at the common loudness.
 * Zones are marked `flat: 1` in manifest.json (skipped next time unless --force).
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import url from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const run = promisify(execFile);
const ROOT = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), '../..');
const OUT = path.join(ROOT, 'vendor/samples');
const args = process.argv.slice(2);
const FORCE = args.includes('--force'), DRY = args.includes('--dry');
const ids = args.filter((a) => !a.startsWith('--'));
const REF = 0.1, PEAK = 0.891, WIN = 0.4, LIM = Math.pow(10, 8 / 20), HEAD = 0.15;
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'dq5-flat-'));

async function decode(file, sr) {
  const { stdout } = await run('ffmpeg', ['-v', 'error', '-i', file, '-ac', '1', '-ar', String(sr), '-f', 'f32le', '-'], { encoding: 'buffer', maxBuffer: 1 << 30 });
  return Float32Array.from(new Float32Array(stdout.buffer, stdout.byteOffset, stdout.byteLength >> 2));
}
function wav16(file, y, sr) {
  const n = y.length, b = Buffer.alloc(44 + n * 2);
  b.write('RIFF', 0); b.writeUInt32LE(36 + n * 2, 4); b.write('WAVEfmt ', 8); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22);
  b.writeUInt32LE(sr, 24); b.writeUInt32LE(sr * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(n * 2, 40);
  let seed = 12345; const rnd = () => { seed = (seed * 1103515245 + 12345) >>> 0; return seed / 4294967296; };
  for (let i = 0; i < n; i++) { const d = (rnd() - rnd()) / 32768; b.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round((y[i] + d) * 32767))), 44 + i * 2); }
  fs.writeFileSync(file, b);
}
const rms = (y, a, b) => { let s = 0; for (let i = a; i < b; i++) s += y[i] * y[i]; return Math.sqrt(s / Math.max(1, b - a)); };

export function flattenLoop(y, sr, ls, le) {
  const L = le - ls;
  const W = Math.max(64, Math.min(Math.round(WIN * sr), L)); const half = W >> 1;
  const hann = new Float64Array(W); let hs = 0; for (let j = 0; j < W; j++) { hann[j] = 0.5 - 0.5 * Math.cos(2 * Math.PI * (j + 0.5) / W); hs += hann[j]; }
  // circular power of the loop body, then a Hann-weighted circular moving average (computed on a hop, interpolated)
  const P = new Float64Array(L); for (let i = 0; i < L; i++) P[i] = y[ls + i] * y[ls + i];
  const H = Math.max(1, Math.round(0.005 * sr)); const K = Math.ceil(L / H);
  const env = new Float64Array(K + 1);
  for (let k = 0; k < K; k++) { const c = k * H; let s = 0; for (let j = 0; j < W; j++) s += hann[j] * P[(((c - half + j) % L) + L) % L]; env[k] = Math.sqrt(s / hs); }
  env[K] = env[0];
  const mean = rms(y, ls, le);
  const g = new Float64Array(L);
  for (let i = 0; i < L; i++) { const x = i / H, k = Math.floor(x), fr = x - k; const e = env[k] * (1 - fr) + env[Math.min(K, k + 1)] * fr; g[i] = Math.min(LIM, Math.max(1 / LIM, mean / Math.max(e, 1e-9))); }
  // wrap-continuity of g: the interpolation ends at env[K]=env[0]; blend the last hop into g[0] exactly
  const out = Float32Array.from(y);
  for (let i = 0; i < L; i++) out[ls + i] = y[ls + i] * g[i];
  const R = Math.min(ls, Math.round(HEAD * sr));
  for (let i = 0; i < R; i++) { const t = (i + 1) / R; const w = 0.5 - 0.5 * Math.cos(Math.PI * t); out[ls - R + i] = y[ls - R + i] * (1 + (g[0] - 1) * w); }
  for (let i = le; i < y.length; i++) out[i] = out[ls + ((i - le) % L)]; // the resampler guard is the loop's own start
  return { y: out, gMin: Math.min(...g), gMax: Math.max(...g) };
}

async function main() {
  const manPath = path.join(OUT, 'manifest.json');
  const man = JSON.parse(fs.readFileSync(manPath, 'utf8'));
  let done = 0, bytes0 = 0, bytes1 = 0;
  for (const [id, ins] of Object.entries(man.instruments)) {
    if (ins.kind !== 'loop' || (ids.length && !ids.includes(id))) continue;
    let instBytes = 0;
    await Promise.all(ins.zones.map(async (z, k) => {
      const file = path.join(OUT, z.f);
      const size0 = fs.statSync(file).size;
      if (z.flat && !FORCE) { instBytes += size0; return; }
      const y = await decode(file, z.sr);
      const { y: out, gMin, gMax } = flattenLoop(y, z.sr, z.ls, z.le);
      let pk = 0; for (const v of out) pk = Math.max(pk, Math.abs(v));
      const sc = pk > PEAK ? PEAK / pk : 1;
      if (sc !== 1) for (let i = 0; i < out.length; i++) out[i] *= sc;
      const loud = rms(out, z.ls, z.le);
      const gNew = REF / Math.max(loud, 1e-6);
      if (!DRY) {
        const wav = path.join(TMP, `${id}-${k}.wav`); wav16(wav, out, z.sr);
        await run('flac', ['--best', '-s', '-f', '-o', file, wav]); fs.unlinkSync(wav);
        z.g = +gNew.toFixed(4); z.flat = 1;
      }
      const size1 = DRY ? size0 : fs.statSync(file).size;
      bytes0 += size0; bytes1 += size1; instBytes += size1; done++;
      if (gMax / gMin > 2.5) console.log(`  ${z.f}: gain ${(20 * Math.log10(gMin)).toFixed(1)}..${(20 * Math.log10(gMax)).toFixed(1)} dB`);
    }));
    if (!DRY) ins.bytes = instBytes;
  }
  if (!DRY) { man.totalBytes = Object.values(man.instruments).reduce((s, i) => s + i.bytes, 0); fs.writeFileSync(manPath, JSON.stringify(man)); }
  console.log(`flattened ${done} loops; ${(bytes0 / 1048576).toFixed(2)} MB -> ${(bytes1 / 1048576).toFixed(2)} MB${DRY ? ' (dry run)' : ''}`);
  fs.rmSync(TMP, { recursive: true, force: true });
}
if (import.meta.url === `file://${process.argv[1]}`) main().catch((e) => { console.error(e); process.exit(1); });
