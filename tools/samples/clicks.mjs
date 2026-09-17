#!/usr/bin/env node
/**
 * tools/samples/clicks.mjs — find clicks in a rendered WAV (P27 verification: sample loop seams, note starts/stops).
 *   node tools/samples/clicks.mjs file.wav [--db 6] [--frac 0.5] [--skip 0.1,3.45,...] [--skipw 0.15]
 * A click is broadband: in a 512-sample STFT (hop 128), bins power-averaged into ~520 Hz groups from 150 Hz to 12 kHz,
 * a frame where at least --frac of the groups jump --db above their own average over the surrounding ±50 ms. Musical onsets do that too, so --skip lists known
 * onset/offset times to ignore (±--skipw s). Prints candidate times; exit code 1 if any.
 */
import fs from 'node:fs';
import { fft } from './dsp.mjs';
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args.splice(i, 2)[1] : d; };
const DB = +opt("db", 6), FRAC = +opt("frac", 0.5), SKIPW = +opt('skipw', 0.15);
const SKIP = String(opt('skip', '')).split(',').filter(Boolean).map(Number);
const f = args[0];
const b = fs.readFileSync(f); let o = 12, fmt, data;
while (o < b.length) { const id = b.toString('ascii', o, o + 4), sz = b.readUInt32LE(o + 4); if (id === 'fmt ') fmt = { ch: b.readUInt16LE(o + 10), sr: b.readUInt32LE(o + 12) }; if (id === 'data') data = b.subarray(o + 8, o + 8 + sz); o += 8 + sz + (sz & 1); }
const n = data.length / (fmt.ch * 2); const x = new Float32Array(n);
for (let i = 0; i < n; i++) { let s = 0; for (let c = 0; c < fmt.ch; c++) s += data.readInt16LE((i * fmt.ch + c) * 2); x[i] = s / fmt.ch / 32768; }
const N = 512, H = 128, sr = fmt.sr;
// power-average the bins into ~520 Hz groups (a single bin of noise wobbles +-6 dB frame to frame; a group does not)
const k0 = Math.floor(150 * N / sr), GB = 6, G = Math.floor((Math.min(N / 2 - 1, Math.floor(12000 * N / sr)) - k0) / GB);
const win = new Float64Array(N).map((_, i) => 0.5 - 0.5 * Math.cos(2 * Math.PI * i / (N - 1)));
const F = Math.floor((n - N) / H);
const S = new Float32Array(F * G); const frameLvl = new Float32Array(F);
const re = new Float64Array(N), im = new Float64Array(N);
for (let t = 0; t < F; t++) {
  let l = 0;
  for (let i = 0; i < N; i++) { const v = x[t * H + i]; re[i] = v * win[i]; im[i] = 0; l += v * v; }
  frameLvl[t] = l / N;
  fft(re, im);
  for (let g = 0; g < G; g++) { let p = 0; for (let j = 0; j < GB; j++) { const kk = k0 + g * GB + j; p += re[kk] * re[kk] + im[kk] * im[kk]; } S[t * G + g] = 10 * Math.log10(p / GB + 1e-14); }
}
const R = Math.round(0.05 * sr / H), X = 2;
const hits = [];
for (let t = R; t < F - R; t++) {
  const time = (t * H + N / 2) / sr;
  if (frameLvl[t] < 1e-8 || SKIP.some((q) => Math.abs(q - time) < SKIPW)) continue;
  let cnt = 0;
  for (let g = 0; g < G; g++) {
    let sum = 0, m = 0;
    for (let u = t - R; u <= t + R; u++) { if (Math.abs(u - t) <= X) continue; sum += S[u * G + g]; m++; }
    if (S[t * G + g] > sum / m + DB) cnt++;
  }
  if (cnt / G >= FRAC) { hits.push(time); t += R; }
}
console.log(`${f}: ${hits.length} click candidates${hits.length ? ' at ' + hits.slice(0, 24).map((v) => v.toFixed(3) + 's').join(', ') : ''}`);
process.exitCode = hits.length ? 1 : 0;
