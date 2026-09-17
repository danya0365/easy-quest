/**
 * tools/samples/dsp.mjs — the signal processing the sample build needs, dependency-free.   (P27)
 * fft · pitch (harmonic-sieve octave check + guided YIN) · timpani principal tone · onset/trim · loudness ·
 * loop search (FFT normalised cross-correlation over the crossfade window) + baked crossfade loop.
 */
const TAU = Math.PI * 2;
export const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
export const ftom = (f) => 69 + 12 * Math.log2(f / 440);

/** in-place radix FFT on Float64Arrays (length power of two); inverse when inv */
export function fft(re, im, inv = false) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1; for (; j & bit; bit >>= 1) j ^= bit; j ^= bit;
    if (i < j) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (inv ? TAU : -TAU) / len, wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let j = 0; j < len / 2; j++) {
        const a = i + j, b = a + len / 2;
        const vr = re[b] * cr - im[b] * ci, vi = re[b] * ci + im[b] * cr;
        re[b] = re[a] - vr; im[b] = im[a] - vi; re[a] += vr; im[a] += vi;
        const t = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = t;
      }
    }
  }
  if (inv) for (let i = 0; i < n; i++) { re[i] /= n; im[i] /= n; }
}
const pow2 = (n) => { let p = 1; while (p < n) p <<= 1; return p; };

/** magnitude spectrum of x[i0 .. i0+N) with a Hann window */
export function spectrum(x, i0, N) {
  const re = new Float64Array(N), im = new Float64Array(N);
  for (let i = 0; i < N; i++) re[i] = (x[i0 + i] || 0) * (0.5 - 0.5 * Math.cos(TAU * i / (N - 1)));
  fft(re, im);
  const mag = new Float64Array(N / 2);
  for (let i = 0; i < N / 2; i++) mag[i] = Math.hypot(re[i], im[i]);
  return mag;
}
function peakNear(mag, sr, N, f, tol = 0.03) {
  const k0 = Math.max(1, Math.floor(f * (1 - tol) * N / sr)), k1 = Math.min(mag.length - 1, Math.ceil(f * (1 + tol) * N / sr));
  let m = 0; for (let k = k0; k <= k1; k++) if (mag[k] > m) m = mag[k];
  return m;
}

/** RMS envelope, hop seconds */
export function envelope(x, sr, hop = 0.01) {
  const H = Math.max(1, Math.round(hop * sr)); const out = new Float64Array(Math.floor(x.length / H));
  for (let j = 0; j < out.length; j++) { let s = 0; for (let i = j * H; i < (j + 1) * H; i++) s += x[i] * x[i]; out[j] = Math.sqrt(s / H); }
  return out;
}
const median = (a) => { const b = Array.from(a).sort((p, q) => p - q); return b.length ? b[Math.floor(b.length / 2)] : 0; };

/** first sample above peak*10^(dB/20), minus a pre-roll */
export function onset(x, sr, dB = -36, pre = 0.003) {
  let pk = 0; for (let i = 0; i < x.length; i++) pk = Math.max(pk, Math.abs(x[i]));
  const th = pk * Math.pow(10, dB / 20);
  for (let i = 0; i < x.length; i++) if (Math.abs(x[i]) >= th) return Math.max(0, i - Math.round(pre * sr));
  return 0;
}

/**
 * Measured root (fractional MIDI) near a named note. Octave: harmonic sieve on the steady part (a true fundamental
 * has its odd harmonics; a subharmonic name has energy at f/2 and 3f/2). Cents: YIN restricted to ±1 semitone.
 * Returns {midi, ap (YIN aperiodicity, lower = more periodic), octave: -1|0|1 correction}
 */
export function pitch(x, sr, guess, { t0 = 0.3, t1 = null } = {}) {
  const i0 = Math.min(Math.round(t0 * sr), Math.max(0, x.length - 8192));
  const iEnd = t1 ? Math.min(x.length, Math.round(t1 * sr)) : x.length;
  let seg = guess < 48 ? 65536 : 32768;
  while (seg > iEnd - i0 && seg > 4096) seg >>= 1;
  const mag = spectrum(x, i0, seg);
  let f = mtof(guess), oct = 0;
  const P = (q) => peakNear(mag, sr, seg, q);
  const trust = true; // names decide the octave; the sieve only reports (it misreads 16' organ stops, weak-fundamental bassoons)
  for (let k = 0; k < 2; k++) { // named too high: strong subharmonics
    const base = P(f), sub = P(f / 2), sub3 = P(1.5 * f);
    if (f / 2 > 25 && sub > 0.3 * base && sub3 > 0.2 * base) { f /= 2; oct--; } else break;
  }
  for (let k = 0; k < 2 && oct === 0; k++) { // named too low: no odd harmonics
    const h1 = P(f), h2 = P(2 * f), h3 = P(3 * f), h4 = P(4 * f);
    if (h1 < 0.08 * h2 && h3 < 0.08 * Math.max(h2, h4)) { f *= 2; oct++; } else break;
  }
  const sieveOct = oct;
  if (trust) { f = mtof(guess); oct = 0; }
  // guided YIN
  const tauMin = Math.floor(sr / (f * Math.pow(2, 1 / 12))), tauMax = Math.ceil(sr / (f * Math.pow(2, -1 / 12)));
  const W = Math.max(2048, tauMax * 3);
  const res = [], aps = [];
  const frames = 9;
  const span = Math.max(0, Math.min(iEnd, x.length) - i0 - W - tauMax - 1);
  for (let fr = 0; fr < frames; fr++) {
    const s = i0 + Math.floor(span * fr / Math.max(1, frames - 1));
    if (s + W + tauMax >= x.length) break;
    const d = new Float64Array(tauMax + 2);
    for (let tau = 1; tau <= tauMax + 1; tau++) { let acc = 0; for (let i = 0; i < W; i++) { const q = x[s + i] - x[s + i + tau]; acc += q * q; } d[tau] = acc; }
    let run = 0; const cm = new Float64Array(tauMax + 2); cm[0] = 1;
    for (let tau = 1; tau <= tauMax + 1; tau++) { run += d[tau]; cm[tau] = run > 0 ? d[tau] * tau / run : 1; }
    let bt = tauMin; for (let tau = tauMin; tau <= tauMax; tau++) if (cm[tau] < cm[bt]) bt = tau;
    const a = cm[bt - 1] ?? cm[bt], b = cm[bt], c = cm[bt + 1] ?? cm[bt];
    const den = a - 2 * b + c; const off = den > 0 ? 0.5 * (a - c) / den : 0;
    res.push(sr / (bt + off)); aps.push(b);
  }
  if (!res.length) return { midi: ftom(f), ap: 1, octave: oct, sieve: sieveOct };
  return { midi: ftom(median(res)), ap: median(aps), octave: oct, sieve: sieveOct };
}

function peaksIn(mag, sr, N, lo, hi) {
  const pk = [];
  for (let k = Math.max(2, Math.floor(lo * N / sr)); k < Math.min(mag.length - 2, Math.ceil(hi * N / sr)); k++) {
    if (mag[k] > mag[k - 1] && mag[k] >= mag[k + 1]) {
      const a = mag[k - 1], b = mag[k], c = mag[k + 1]; const den = a - 2 * b + c; const off = den < 0 ? 0.5 * (a - c) / den : 0;
      pk.push({ f: (k + off) * sr / N, m: b });
    }
  }
  return pk;
}

/**
 * timpani principal tone. The strongest partial is often the (2,1) mode a fifth above, or the (3,1) mode an octave
 * above, so: take the strongest peak p in 55..400 Hz 50 ms after the strike and walk down to p/1.5 or p/2 when a
 * real peak sits there (>= -20 dB) with its own fifth-mode partner.
 */
export function timpPitch(x, sr) {
  const i0 = onset(x, sr) + Math.round(0.05 * sr); const N = 65536;
  const mag = spectrum(x, i0, N);
  const pk = peaksIn(mag, sr, N, 50, 420).sort((a, b) => b.m - a.m);
  if (!pk.length) return { midi: null, ap: 1, octave: 0 };
  const top = pk[0];
  const near = (f, tol = 0.035) => pk.find((q) => Math.abs(q.f / f - 1) < tol && q.m >= top.m * 0.1);
  let prin = top.f;
  for (const r of [2, 1.5]) {
    const c = near(top.f / r);
    if (c && near(c.f * 1.5, 0.05) && c.f >= 55) { prin = Math.min(prin, c.f); }
  }
  return { midi: ftom(prin), ap: 0, octave: 0 };
}

/** tuned percussion (glockenspiel): the strongest partial in lo..hi Hz, 20 ms after the strike */
export function peakPitch(x, sr, lo = 400, hi = 9000) {
  const i0 = onset(x, sr) + Math.round(0.02 * sr); const N = 16384;
  const mag = spectrum(x, i0, N);
  const pk = peaksIn(mag, sr, N, lo, hi).sort((a, b) => b.m - a.m);
  return { midi: pk.length ? ftom(pk[0].f) : null, ap: 0, octave: 0 };
}

export function rms(x, a = 0, b = x.length) { let s = 0; for (let i = a; i < b; i++) s += x[i] * x[i]; return Math.sqrt(s / Math.max(1, b - a)); }
export function maxWindowRms(x, sr, win = 0.05, upTo = 0.5) {
  const W = Math.round(win * sr), H = Math.round(W / 4), end = Math.min(x.length, Math.round(upTo * sr));
  let m = 0; for (let i = 0; i + W <= end; i += H) m = Math.max(m, rms(x, i, i + W));
  return m || rms(x);
}
export const peakAbs = (x) => { let p = 0; for (let i = 0; i < x.length; i++) p = Math.max(p, Math.abs(x[i])); return p; };

/**
 * Find and bake a sustain loop. x starts at the onset. P = {from,to,min,max,xf} in seconds.
 * Returns {y (Float32Array, length = loop end), ls, le, ncc, envDb, seam}.
 */
export function makeLoop(x, sr, P) {
  const X = Math.round(P.xf * sr);
  const env = envelope(x, sr, 0.01);
  const a = Math.floor(P.from * 100), b = Math.floor(env.length * 0.85);
  const med = median(env.slice(a, Math.max(a + 1, b)));
  let endF = env.length - 1; while (endF > a && env[endF] < 0.55 * med) endF--;
  const tEnd = (endF + 1) * 0.01;
  let minL = P.min, maxL = P.max;
  if (P.from + minL > tEnd - 0.02) { minL = Math.max(0.25, tEnd - 0.02 - P.from); maxL = Math.max(minL + 0.05, maxL); }
  let best = null;
  const lsCands = [];
  const lsHi = Math.max(P.from, Math.min(P.to, tEnd - minL - 0.02));
  for (let k = 0; k < 10; k++) lsCands.push(P.from + (lsHi - P.from) * k / 9);
  for (const s of lsCands) {
    const ls = Math.max(X + 1, Math.round(s * sr));
    const r0 = ls + Math.round(minL * sr) - X, r1 = Math.min(x.length, ls + Math.round(maxL * sr), Math.round(tEnd * sr));
    if (r1 - r0 < X + 16) continue;
    const L = r1 - r0, NF = pow2(L + X);
    const ar = new Float64Array(NF), ai = new Float64Array(NF), br = new Float64Array(NF), bi = new Float64Array(NF);
    for (let i = 0; i < L; i++) ar[i] = x[r0 + i];
    for (let i = 0; i < X; i++) br[i] = x[ls - X + i];
    fft(ar, ai); fft(br, bi);
    for (let i = 0; i < NF; i++) { const r = ar[i] * br[i] + ai[i] * bi[i], im = ai[i] * br[i] - ar[i] * bi[i]; ar[i] = r; ai[i] = im; }
    fft(ar, ai, true);
    let Et = 0; for (let i = 0; i < X; i++) Et += x[ls - X + i] ** 2;
    const pre = new Float64Array(L + 1); for (let i = 0; i < L; i++) pre[i + 1] = pre[i] + x[r0 + i] ** 2;
    for (let k = 0; k + X <= L; k++) {
      const Er = pre[k + X] - pre[k]; if (Er <= 0 || Et <= 0) continue;
      const ncc = ar[k] / Math.sqrt(Et * Er);
      const le = r0 + k + X;
      const envPen = Math.abs(Math.log(Er / Et)) * 0.5;
      const score = ncc - 0.9 * envPen + 0.03 * (le - ls) / sr;
      if (!best || score > best.score) best = { score, ncc, ls, le, envDb: 10 * Math.log10(Er / Et) };
    }
  }
  if (!best) throw new Error('no loop candidate');
  const { ls, le } = best;
  const y = new Float32Array(le);
  for (let i = 0; i < le; i++) y[i] = x[i];
  const eqp = best.ncc < 0.6;
  for (let i = 0; i < X; i++) {
    const t = (i + 1) / X;
    const wIn = eqp ? Math.sin(t * Math.PI / 2) : 0.5 - 0.5 * Math.cos(t * Math.PI);
    const wOut = eqp ? Math.cos(t * Math.PI / 2) : 1 - wIn;
    y[le - X + i] = x[le - X + i] * wOut + x[ls - X + i] * wIn;
  }
  // seam: the wrap step y[le-1] -> y[ls] vs the typical step inside the loop
  let dsum = 0; for (let i = ls; i < le - 1; i++) dsum += Math.abs(y[i + 1] - y[i]);
  const typ = dsum / Math.max(1, le - 1 - ls);
  const seam = Math.abs(y[ls] - y[le - 1]) / (typ || 1e-9);
  // guard: the loop's own continuation after loopEnd. decodeAudioData resamples (32 kHz file -> 44.1/48 kHz context);
  // without real samples past the loop end the resampler's filter sees a cliff and every wrap ticks.
  const GUARD = Math.min(Math.round(0.03 * sr), le - ls);
  const yg = new Float32Array(le + GUARD);
  yg.set(y);
  for (let i = 0; i < GUARD; i++) yg[le + i] = y[ls + i];
  return { y: yg, ls, le, ncc: best.ncc, envDb: best.envDb, seam };
}

/** one-shot: cut at len or where it falls 60 dB under its peak, cosine fade-out */
export function makeShot(x, sr, len, fade) {
  const env = envelope(x, sr, 0.01);
  let pk = 0, pki = 0; env.forEach((v, i) => { if (v > pk) { pk = v; pki = i; } });
  let end = env.length; for (let i = env.length - 1; i > pki; i--) if (env[i] > pk * 0.001) { end = i + 1; break; }
  const n = Math.min(x.length, Math.round(len * sr), Math.round((end * 0.01 + 0.05) * sr));
  const y = new Float32Array(n); for (let i = 0; i < n; i++) y[i] = x[i];
  const F = Math.min(Math.round(fade * sr), Math.floor(n * 0.6));
  for (let i = 0; i < F; i++) y[n - 1 - i] *= 0.5 - 0.5 * Math.cos(Math.PI * i / F);
  return y;
}
