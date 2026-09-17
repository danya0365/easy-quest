#!/usr/bin/env node
/**
 * tools/samples/bands.mjs — octave-band energy of rendered cues, to compare a render against another (P27 verification).
 *   node tools/samples/bands.mjs shots/P27-r3/overworld.wav shots/P27-s1/overworld.wav [--seconds 30]
 * Prints, per file, level in each octave band (dB relative to the file's total), plus the absolute RMS, and for pairs
 * the difference (second - first). A 16-bit PCM WAV reader + a Hann-windowed FFT; no dependencies.
 */
import fs from 'node:fs';
import { fft } from './dsp.mjs';
const args = process.argv.slice(2);
const si = args.indexOf('--seconds'); const SECS = si >= 0 ? +args.splice(si, 2)[1] : 30;
const BANDS = [63, 125, 250, 500, 1000, 2000, 4000, 8000];
function readWav(f) {
  const b = fs.readFileSync(f); let o = 12, fmt = null, data = null;
  while (o < b.length) { const id = b.toString('ascii', o, o + 4), sz = b.readUInt32LE(o + 4); if (id === 'fmt ') fmt = { ch: b.readUInt16LE(o + 10), sr: b.readUInt32LE(o + 12), bits: b.readUInt16LE(o + 22) }; if (id === 'data') data = b.subarray(o + 8, o + 8 + sz); o += 8 + sz + (sz & 1); }
  const n = Math.min(data.length / (fmt.ch * 2), SECS * fmt.sr); const x = new Float32Array(n);
  for (let i = 0; i < n; i++) { let s = 0; for (let c = 0; c < fmt.ch; c++) s += data.readInt16LE((i * fmt.ch + c) * 2); x[i] = s / fmt.ch / 32768; }
  return { x, sr: fmt.sr };
}
function bands(f) {
  const { x, sr } = readWav(f); const N = 8192; const pow = new Float64Array(N / 2); let frames = 0;
  const win = new Float64Array(N).map((_, i) => 0.5 - 0.5 * Math.cos(2 * Math.PI * i / (N - 1)));
  for (let s = 0; s + N <= x.length; s += N / 2) { const re = new Float64Array(N), im = new Float64Array(N); for (let i = 0; i < N; i++) re[i] = x[s + i] * win[i]; fft(re, im); for (let k = 0; k < N / 2; k++) pow[k] += re[k] * re[k] + im[k] * im[k]; frames++; }
  let tot = 0; for (let k = 1; k < N / 2; k++) tot += pow[k];
  const out = BANDS.map((fc) => { let e = 0; for (let k = Math.floor(fc / Math.SQRT2 * N / sr); k < Math.min(N / 2, Math.ceil(fc * Math.SQRT2 * N / sr)); k++) e += pow[k]; return 10 * Math.log10(e / tot + 1e-12); });
  let ss = 0; for (const v of x) ss += v * v;
  return { rms: 10 * Math.log10(ss / x.length + 1e-12), out };
}
const res = args.map((f) => ({ f, ...bands(f) }));
console.log('file'.padEnd(46), 'rms  ', BANDS.map((b) => String(b).padStart(6)).join(''));
for (const r of res) console.log(r.f.slice(-46).padEnd(46), r.rms.toFixed(1).padStart(5), r.out.map((v) => v.toFixed(1).padStart(6)).join(''));
if (res.length === 2) console.log('difference (2nd - 1st)'.padEnd(46), (res[1].rms - res[0].rms).toFixed(1).padStart(5), res[1].out.map((v, i) => (v - res[0].out[i]).toFixed(1).padStart(6)).join(''));
