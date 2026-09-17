/**
 * instruments.js — the synthesised orchestra (MUSIC-BIBLE §1) + reverb impulse responses (§2.1/§2.2).  (P27)
 *
 * `strings` and `horns` are sample players over multisamples GROWN at boot from instrument models (growZone, below).
 * Every voice is `VOICES[name](K, n, out) -> handle` where
 *   K   = the per-context kit (shared noise buffer, LFO bank, periodic waves)       — makeKit(ctx, {quality})
 *   n   = {t, dur, f, m, vel, gain, pan, send, long, spb, o, rng, path:[[sec,freq]], ci}
 *   out = {bus, send, long}  (AudioNodes to feed)
 *   handle = {t0, end, level(t), release(t, rt), cleanup()}
 * No node is reused. Oscillators stop at their own `end`. Envelopes use only linear ramps + setTarget releases so
 * automation never jumps (no clicks). Shared LFOs are disconnected from each note on cleanup (no leaks).
 */

// base amplitude per voice at vel=1 (calibrated from single-note offline renders — see demos/P27.html __DQ.calib)
export const LEVEL = {
  horns: 0.75, hornsSynth: 0.15, hornSolo: 0.49, strings: 0.66, stringsSynth: 0.205, violin: 0.54, flute: 0.28, oboe: 0.83, harpsi: 0.21, harp: 0.69,
  timp: 0.57, snare: 0.46, cymbal: 0.32, pizz: 0.46, celesta: 0.32, organ: 0.195, twinkle: 0.45, pad: 0.17,
  vox: 0.157, bell: 0.32, tri: 0.16,
};
export const SEND = {
  horns: 0.30, hornsSynth: 0.30, hornSolo: 0.42, strings: 0.45, stringsSynth: 0.45, violin: 0.50, flute: 0.40, oboe: 0.45, harpsi: 0.28, harp: 0.50,
  timp: 0.55, snare: 0.22, cymbal: 0.60, pizz: 0.30, celesta: 0.55, organ: 0.65, twinkle: 0.18, pad: 0.70,
  vox: 0.50, bell: 0.60, tri: 0.50,
};
export const SEAT = {
  flute: 0.15, oboe: -0.15, hornSolo: -0.40, horns: 0, violin: 0.22, harp: 0.45, harpsi: -0.25, celesta: 0.35,
  timp: -0.15, snare: 0.10, cymbal: 0.20, organ: 0, pizz: -0.20, twinkle: 0.30, pad: 0, vox: 0.05, bell: -0.10, tri: 0.30,
};
export const seatPan = (voice, m) => {
  if (voice === 'strings' || voice === 'stringsSynth') return m >= 67 ? 0.25 : m >= 55 ? 0 : -0.30;
  return SEAT[voice] ?? 0;
};
export const HUM = {
  hornSolo: [0.009, 0.06], violin: [0.009, 0.06], flute: [0.009, 0.06], oboe: [0.009, 0.06], vox: [0.009, 0.05],
  horns: [0.0045, 0.03], strings: [0.0045, 0.03], hornsSynth: [0.0045, 0.03], stringsSynth: [0.0045, 0.03], pad: [0.0045, 0.03], pizz: [0.0045, 0.03], harp: [0.0045, 0.04],
  celesta: [0.004, 0.03], organ: [0.002, 0.0], twinkle: [0, 0], harpsi: [0.005, 0.03],
  timp: [0.003, 0.04], snare: [0.003, 0.05], cymbal: [0.003, 0.03], tri: [0.003, 0.03], bell: [0.003, 0.02],
};

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const cents = (c) => Math.pow(2, c / 1200);

// ------------------------------------------------------------------------------------------------ kit
export function makeKit(ctx, { quality = 'high', seed = 1234 } = {}) {
  const offline = typeof OfflineAudioContext !== 'undefined' && ctx instanceof OfflineAudioContext;
  const K = { ctx, quality, sr: ctx.sampleRate, nyq: ctx.sampleRate / 2, offline };
  // live: grow the string and brass multisamples in a Worker now; offline renders grow each zone on first use
  if (!offline) { try { Bank.startWorker(ctx); } catch (e) { /* the oscillator fallbacks keep playing */ } }
  let s = seed >>> 0;
  const rnd = () => { s = (s + 0x6d2b79f5) >>> 0; let x = s; x = Math.imul(x ^ (x >>> 15), x | 1); x ^= x + Math.imul(x ^ (x >>> 7), x | 61); return ((x ^ (x >>> 14)) >>> 0) / 4294967296; };
  const len = Math.floor(ctx.sampleRate * 2.5);
  K.noise = ctx.createBuffer(1, len, ctx.sampleRate);
  const nd = K.noise.getChannelData(0); for (let i = 0; i < len; i++) nd[i] = rnd() * 2 - 1;
  K.rnd = rnd;

  const lfos = new Map();
  K.lfo = (rate) => {
    let o = lfos.get(rate);
    if (!o) { o = ctx.createOscillator(); o.frequency.value = rate; o.start(0); lfos.set(rate, o); }
    return o;
  };
  const scaled = (src, depth) => { const g = ctx.createGain(); g.gain.value = depth; src.connect(g); return g; };
  K.drift = [0.11, 0.137, 0.163, 0.19].map((r, i) => { const o = ctx.createOscillator(); o.frequency.value = r; o.start(i * 0.7 + 0.01); return scaled(o, 3); });
  K.shimmer = scaled(K.lfo(0.7), 0.04);
  K.tremulant = scaled(K.lfo(0.9), 1.5);
  // solo-horn vibrato: 4.8 Hz whose depth is itself modulated +-2/12 by a 0.3 Hz LFO
  K.vibHS = ctx.createGain(); K.vibHS.gain.value = 1; K.lfo(4.8).connect(K.vibHS); scaled(K.lfo(0.3), 0.167).connect(K.vibHS.gain);

  const pw = (fn, n = 64) => { const re = new Float32Array(n), im = new Float32Array(n); fn(re, im); return ctx.createPeriodicWave(re, im, { disableNormalization: true }); };
  const waves = {};
  K.wave = (name) => waves[name] || (waves[name] = ({
    // 25% pulse (the twinkle): b_n = 2/(n pi) * sin(n pi d) ... cosine form keeps it centred
    pulse25: () => pw((re, im) => { for (let k = 1; k < 64; k++) im[k] = (2 / (k * Math.PI)) * Math.sin(k * Math.PI * 0.25) * 0.9; }),
    // harpsichord: 0.6 saw + 0.4 square in one oscillator
    harpsi: () => pw((re, im) => { for (let k = 1; k < 64; k++) im[k] = 0.6 * (2 / (k * Math.PI)) * (k % 2 ? 1 : -1) + (k % 2 ? 0.4 * 4 / (k * Math.PI) : 0); }),
    // organ ranks relative to f/2: 16' h1 .30, 8' triangle h2, 5 1/3' h3 .18, 2 2/3' h6 .22, mixture h12 .10
    organA: () => pw((re, im) => { im[1] = 0.30; im[3] = 0.18; im[6] = 0.22; im[12] = 0.10;
      for (let j = 0, h = 2; h < 64; j++, h += 4) im[h] += (8 / (Math.PI * Math.PI)) * ((j % 2 ? -1 : 1) / ((2 * j + 1) ** 2)); }),
    // relative to 2f: 4' triangle h1 .55, 2' h2 .30
    organB: () => pw((re, im) => { im[2] = 0.30; for (let j = 0, h = 1; h < 64; j++, h += 2) im[h] += 0.55 * (8 / (Math.PI * Math.PI)) * ((j % 2 ? -1 : 1) / ((2 * j + 1) ** 2)); }),
    // pedal organ: heavier 16'
    organP: () => pw((re, im) => { im[1] = 0.34; im[3] = 0.12; im[4] = 0.32; im[6] = 0.08;
      for (let j = 0, h = 2; h < 64; j++, h += 4) im[h] += (8 / (Math.PI * Math.PI)) * ((j % 2 ? -1 : 1) / ((2 * j + 1) ** 2)); }),
  })[name]());
  return K;
}

// ------------------------------------------------------------------------------------------------ helpers
const G = (ctx, v = 1) => { const g = ctx.createGain(); g.gain.value = v; return g; };
const O = (ctx, type, f, det = 0) => {
  const o = ctx.createOscillator();
  if (typeof type === 'string') o.type = type; else o.setPeriodicWave(type);
  o.frequency.value = f; if (det) o.detune.value = det; return o;
};
const BQ = (ctx, type, f, Q = 0.707, dB = 0) => { const b = ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = Q; if (dB) b.gain.value = dB; return b; };
const noiseSrc = (K, t, dur, loop = false) => {
  const s = K.ctx.createBufferSource(); s.buffer = K.noise;
  if (loop) { s.loop = true; s.start(t, K.rnd() * 2); s.stop(t + dur); } else s.start(t, K.rnd() * 2, dur + 0.01);
  return s;
};
/** start a periodic oscillator a random fraction of a period early (its envelope is still silent), so unison voices never phase-align */
const startRP = (K, o, t, end) => { const f = Math.max(20, o.frequency.value); o.start(Math.max(0, t - K.rnd() / f)); o.stop(end); };
const hold = (p, t) => { try { if (p.cancelAndHoldAtTime) p.cancelAndHoldAtTime(t); else { p.cancelScheduledValues(t); } } catch (e) { /* ignore */ } };

/** linear A, linear D to S, optional swell to S*sw at tOff, exponential release. returns release-start time */
function envASR(p, t, tOff, peak, A, D, S, R, sw = 1) {
  const tA = t + A, tD = Math.min(tA + D, Math.max(tA, tOff));
  p.setValueAtTime(0, t);
  p.linearRampToValueAtTime(peak, tA);
  const at = tD > tA + 1e-4 ? peak + (peak * S - peak) * ((tD - tA) / D) : peak;
  if (tD > tA + 1e-4) p.linearRampToValueAtTime(at, tD);
  const rel = Math.max(tOff, tD);
  if (rel > tD + 0.02 && sw !== 1) p.linearRampToValueAtTime(at * sw, rel);
  p.setTargetAtTime(0, rel + 0.001, R / 5);
  return rel;
}
/** percussive: linear A then exponential decay with time-constant tau; optional damp at tOff */
function envPerc(p, t, peak, A, tau, tOff = null, R = 0.1) {
  p.setValueAtTime(0, t);
  p.linearRampToValueAtTime(peak, t + A);
  p.setTargetAtTime(0, t + A, tau);
  if (tOff != null && tOff > t + A + 0.005) { p.setTargetAtTime(0, tOff, R / 5); }
}

function finish(K, n, out, node, end, srcs, amps, lvl, extra) {
  const { ctx } = K;
  const p = ctx.createStereoPanner(); p.pan.value = clamp(n.pan || 0, -1, 1);
  node.connect(p); p.connect(out.bus);
  let s = null, l = null;
  if (n.send > 0 && out.send) { s = G(ctx, n.send); p.connect(s); s.connect(out.send); }
  if (n.long > 0 && out.long) { l = G(ctx, n.long); p.connect(l); l.connect(out.long); }
  const h = {
    t0: n.t, end, peak: lvl.peak, voice: n.voice,
    level(t) {
      if (t >= h.end) return 0;
      if (t <= n.t) return lvl.peak;
      return lvl.tau ? lvl.peak * Math.exp(-(t - n.t) / lvl.tau) : lvl.peak * (lvl.S ?? 1);
    },
    release(t, rt = 0.04) {
      for (const a of amps) { hold(a, t); try { a.setTargetAtTime(0, t, rt / 4); } catch (e) { /* ignore */ } }
      const stopT = t + rt * 2 + 0.02;
      for (const o of srcs) { try { o.stop(stopT); } catch (e) { /* ignore */ } }
      h.end = Math.min(h.end, stopT);
    },
    cleanup() { try { p.disconnect(); if (s) s.disconnect(); if (l) l.disconnect(); if (extra) extra(); } catch (e) { /* ignore */ } },
  };
  return h;
}
const disc = (src, dst) => { try { src.disconnect(dst); } catch (e) { /* ignore */ } };

/** apply a legato pitch path to oscillators: [[sec, freq]] ; glide 40 ms when <= 3 semitones */
function applyPath(n, oscs, ratios, extra) {
  if (!n.path) return;
  let prev = n.f;
  for (let i = 1; i < n.path.length; i++) {
    const [sec, f] = n.path[i]; const ts = n.t + sec;
    const semis = Math.abs(12 * Math.log2(f / prev));
    oscs.forEach((o, k) => {
      const r = ratios[k];
      if (semis <= 3.01 && semis > 0) { o.frequency.setValueAtTime(prev * r, ts - 0.02); o.frequency.exponentialRampToValueAtTime(f * r, ts + 0.02); }
      else o.frequency.setValueAtTime(f * r, ts);
    });
    if (extra) extra(ts, f, prev, semis);
    prev = f;
  }
}

// ------------------------------------------------------------------------------------------------ voices
export const VOICES = {};

// 1.1 HORN SECTION (oscillator fallback) — four detuned saws + a bore triangle, formant low-pass, the brass honk.
// Only sounds while the grown multisamples for a zone are still being made (live, first second after boot).
VOICES.hornsSynth = (K, n, out) => {
  const { ctx } = K; const { t, f, vel } = n; const low = K.quality === 'low';
  const A = Math.min(0.045, n.dur * 0.5), D = 0.12, S = 0.72, R = n.o?.rel ?? 0.22;
  const tOff = t + Math.max(n.dur, A + 0.01);
  const end = tOff + R * 1.6 + 0.05;
  const peak = LEVEL.horns * vel * n.gain;
  const gL = G(ctx, 0), gC = G(ctx, 0), gR = G(ctx, 0);
  const mer = ctx.createChannelMerger(2);
  gL.connect(mer, 0, 0); gR.connect(mer, 0, 1); gC.connect(mer, 0, 0); gC.connect(mer, 0, 1);
  const spread = n.o?.tight ? 0.003 : 0.011;
  [[gC, 0], [gL, K.rnd() * spread], [gR, K.rnd() * spread]].forEach(([g, d]) => { g.gain.setValueAtTime(0, t + d); g.gain.linearRampToValueAtTime(1, t + d + 0.02); });
  const dets = low ? [-9, 0, 9] : [-14, -5, 6, 15];
  const dest = low ? [gL, gC, gR] : [gL, gC, gC, gR];
  const vib = n.dur > 0.45 ? G(ctx, 0) : null;
  const lip = 14 + 16 * vel; // the lip "blat": a little flat, snapping up
  const oscs = [];
  dets.forEach((d, i) => {
    const o = O(ctx, 'sawtooth', f);
    o.detune.setValueAtTime(d - lip, t); o.detune.linearRampToValueAtTime(d, t + 0.055);
    K.drift[i].connect(o.detune); if (vib) vib.connect(o.detune);
    o.connect(dest[i]); startRP(K, o, t, end); oscs.push(o);
  });
  const bore = O(ctx, 'triangle', f / 2); const bg = G(ctx, f < 250 ? 0.18 : 0.35); bore.connect(bg); bg.connect(gC); startRP(K, bore, t, end); oscs.push(bore);
  if (vib) { vib.gain.setValueAtTime(0, t + 0.35); vib.gain.linearRampToValueAtTime(9, t + 0.75); K.lfo(5.2).connect(vib); vib.connect(bore.detune); }
  const kt = clamp(Math.pow(f / 350, 0.5), 0.75, 2.4);
  const vs = 1 + 0.35 * (vel - 0.6) + 0.9 * Math.max(0, vel - 0.72);
  const hz = (x) => Math.min(x * kt * vs, 15000);
  const lp = BQ(ctx, 'lowpass', hz(380), 2.2);
  const tF = Math.max(tOff, t + 0.1);
  lp.frequency.setValueAtTime(hz(380), t);
  lp.frequency.exponentialRampToValueAtTime(hz(2100), t + 0.10);
  lp.frequency.setTargetAtTime(hz(1250), t + 0.10, 0.28 / 3);
  lp.frequency.setTargetAtTime(hz(500), tF, 0.2 / 3);
  lp.frequency.setValueAtTime(hz(500), end); // pin: a finished automation lets the biquad stop recomputing per sample
  const pk = BQ(ctx, 'peaking', 900, 1.1, 6);
  const amp = G(ctx, 0);
  envASR(amp.gain, t, tOff, peak, A, D, S, R, n.o?.swell ?? 1);
  mer.connect(lp); lp.connect(pk); pk.connect(amp);
  return finish(K, n, out, amp, end, oscs, [amp.gain], { peak, S }, () => {
    oscs.forEach((o, i) => { if (i < dets.length) disc(K.drift[i], o.detune); });
    if (vib) disc(K.lfo(5.2), vib);
  });
};

// 1.2 SOLO HORN — rounder, later peak, breath on attack
VOICES.hornSolo = (K, n, out) => {
  const { ctx } = K; const { t, f, vel } = n;
  const A = Math.min(0.08, n.dur * 0.5), D = 0.2, S = 0.65, R = n.o?.rel ?? 0.35;
  const tOff = t + Math.max(n.dur, A + 0.01), end = tOff + R * 1.6 + 0.05;
  const peak = LEVEL.hornSolo * vel * n.gain;
  const mix = G(ctx, 1);
  const vib = n.dur > 0.4 ? G(ctx, 0) : null;
  const specs = [['sawtooth', -4, 0.5], ['sawtooth', 4, 0.5], ['sine', 0, 0.5]];
  const oscs = specs.map(([type, d, g]) => {
    const o = O(ctx, type, f, d); const gg = G(ctx, g);
    o.detune.setValueAtTime(d - 15, t); o.detune.linearRampToValueAtTime(d, t + 0.07);
    o.connect(gg); gg.connect(mix); if (vib) vib.connect(o.detune); startRP(K, o, t, end); return o;
  });
  applyPath(n, oscs, [1, 1, 1]);
  if (vib) { vib.gain.setValueAtTime(0, t + 0.3); vib.gain.linearRampToValueAtTime(12, t + 0.62); K.vibHS.connect(vib); }
  const kt = clamp(Math.pow(f / 260, 0.45), 0.8, 1.9) * (0.8 + 0.45 * vel);
  const lp = BQ(ctx, 'lowpass', 300 * kt, 1.4);
  lp.frequency.setValueAtTime(300 * kt, t);
  lp.frequency.linearRampToValueAtTime(1500 * kt, t + 0.14);
  lp.frequency.setTargetAtTime(900 * kt, t + 0.14, 0.5 / 3);
  lp.frequency.setTargetAtTime(400 * kt, Math.max(tOff, t + 0.15), 0.1);
  lp.frequency.setValueAtTime(400 * kt, end);
  const amp = G(ctx, 0);
  envASR(amp.gain, t, tOff, peak, A, D, S, R, n.o?.swell ?? 1.06);
  mix.connect(lp); lp.connect(amp);
  // breath burst
  const nz = noiseSrc(K, t, 0.07), bp = BQ(ctx, 'bandpass', 1800, 3), ng = G(ctx, 0);
  ng.gain.setValueAtTime(0, t); ng.gain.linearRampToValueAtTime(peak * 0.22, t + 0.012); ng.gain.linearRampToValueAtTime(0, t + 0.06);
  nz.connect(bp); bp.connect(ng); ng.connect(amp);
  return finish(K, n, out, amp, end, [...oscs, nz], [amp.gain], { peak, S }, () => { if (vib) disc(K.vibHS, vib); });
};

// 1.3 STRINGS (oscillator fallback) — five saws, slow bow filter, late vibrato, shimmer, swell; tremolo via o.trem
VOICES.stringsSynth = (K, n, out) => {
  const { ctx } = K; const { t, f, vel } = n; const low = K.quality === 'low';
  const dur = n.dur;
  let A = n.o?.attack ?? clamp(0.4 * (n.spb || 0.5), 0.12, 0.45);
  A = Math.min(A, Math.max(0.03, dur * 0.45));
  const D = 0.25, S = 0.85, R = n.o?.rel ?? clamp(dur * 0.8, 0.18, 0.55);
  const tOff = t + Math.max(dur, A + 0.01), end = tOff + R * 1.6 + 0.05;
  const peak = LEVEL.strings * vel * n.gain;
  const gL = G(ctx, 1), gC = G(ctx, 1), gR = G(ctx, 1);
  const mer = ctx.createChannelMerger(2);
  gL.connect(mer, 0, 0); gR.connect(mer, 0, 1); gC.connect(mer, 0, 0); gC.connect(mer, 0, 1);
  const vib = dur > 0.5 && !n.o?.trem ? G(ctx, 0) : null;
  const spec = [[1, -11, gL, 1], [1, 0, gC, 1], [1, 11, gR, 1]];
  if (!low && f >= 170) { spec.push([0.5, -7, gL, 0.30], [0.5, 7, gR, 0.30]); }
  const oscs = [], ratios = [];
  spec.forEach(([r, d, g, lv], i) => {
    const o = O(ctx, 'sawtooth', f * r, d); K.drift[i % 4].connect(o.detune); if (vib) vib.connect(o.detune);
    if (lv !== 1) { const gg = G(ctx, lv); o.connect(gg); gg.connect(g); } else o.connect(g);
    startRP(K, o, t, end); oscs.push(o); ratios.push(r);
  });
  const kt = clamp(Math.pow(f / 440, 0.3), 0.8, 1.45) * (0.78 + 0.45 * vel);
  const hp = BQ(ctx, 'highpass', Math.min(120, f * 0.55), 0.5);
  const lp = BQ(ctx, 'lowpass', 700 * kt, 0.8);
  const tS = t + Math.min(0.35, Math.max(0.05, dur * 0.6));
  lp.frequency.setValueAtTime(700 * kt, t);
  lp.frequency.linearRampToValueAtTime(3200 * kt, tS);
  lp.frequency.setTargetAtTime(2400 * kt, tS, 0.15);
  if (!n.path && tOff > tS + 0.8) lp.frequency.setValueAtTime(2400 * kt, tS + 0.75);
  lp.frequency.setTargetAtTime(800 * kt, Math.max(tOff, tS + 0.01) + (!n.path && tOff > tS + 0.8 ? 0.001 : 0), 0.5 / 3);
  lp.frequency.setValueAtTime(800 * kt, end);
  applyPath(n, oscs, ratios, (ts) => { lp.frequency.setTargetAtTime(3000 * kt, ts, 0.03); lp.frequency.setTargetAtTime(2400 * kt, ts + 0.1, 0.12); });
  const amp = G(ctx, 0);
  if (n.o?.trem) {
    const st = n.o.trem; const pS = peak * S;
    amp.gain.setValueAtTime(0, t);
    let k = 0;
    for (let ts = t; ts < tOff - 0.02; ts += st, k++) {
      const r = 1 + (K.rnd() * 2 - 1) * 0.12;
      amp.gain.linearRampToValueAtTime(pS * r, ts + 0.012);
      amp.gain.linearRampToValueAtTime(pS * r * 0.42, Math.min(ts + st - 0.004, tOff));
    }
    amp.gain.setTargetAtTime(0, tOff, 0.04 / 5);
  } else envASR(amp.gain, t, tOff, peak, A, D, S, R, n.o?.swell ?? (dur >= 1.2 ? 1.14 : 1));
  if (vib) { vib.gain.setValueAtTime(0, t + 0.4); vib.gain.linearRampToValueAtTime(7, t + 0.8); K.lfo(5.6).connect(vib); }
  const sh = G(ctx, 1); K.shimmer.connect(sh.gain);
  mer.connect(hp); hp.connect(lp); lp.connect(amp); amp.connect(sh);
  return finish(K, n, out, sh, end, oscs, [amp.gain], { peak, S }, () => {
    oscs.forEach((o, i) => disc(K.drift[i % 4], o.detune)); disc(K.shimmer, sh.gain); if (vib) disc(K.lfo(5.6), vib);
  });
};

// 1.4 SOLO VIOLIN — pitch-tracking resonant low-pass, body resonators, wide late vibrato, portamento
VOICES.violin = (K, n, out) => {
  const { ctx } = K; const { t, f, vel } = n;
  const A = Math.min(0.10, n.dur * 0.4), D = 0.18, S = 0.80, R = n.o?.rel ?? 0.40;
  const tOff = t + Math.max(n.dur, A + 0.01), end = tOff + R * 1.6 + 0.05;
  const peak = LEVEL.violin * vel * n.gain;
  const mix = G(ctx, 1);
  const vib = n.dur > 0.3 ? G(ctx, 0) : null;
  const oscs = [['sawtooth', 0, 0.5], ['sawtooth', 6, 0.5], ['square', 0, 0.063]].map(([ty, d, g]) => {
    const o = O(ctx, ty, f, d); const gg = G(ctx, g); o.connect(gg); gg.connect(mix); if (vib) vib.connect(o.detune);
    startRP(K, o, t, end); return o;
  });
  const cut = (x) => clamp(x * 4.5, 900, 5200) * (0.8 + 0.3 * vel);
  const lp = BQ(ctx, 'lowpass', Math.max(300, f * 1.4), 3.0);
  lp.frequency.setValueAtTime(Math.max(300, f * 1.4), t);
  lp.frequency.setTargetAtTime(cut(f), t, 0.18 / 3);
  const b1 = BQ(ctx, 'peaking', 460, 2, 5), b2 = BQ(ctx, 'peaking', 1150, 2.5, 4);
  const amp = G(ctx, 0);
  envASR(amp.gain, t, tOff, peak, A, D, S, R, n.o?.swell ?? (n.dur > 1.5 ? 1.1 : 1));
  if (vib) { vib.gain.setValueAtTime(0, t + 0.22); vib.gain.linearRampToValueAtTime(18, t + 0.55); K.lfo(6.1).connect(vib); }
  applyPath(n, oscs, [1, 1, 1], (ts, nf) => {
    lp.frequency.setTargetAtTime(cut(nf), ts, 0.03);
    if (vib) { vib.gain.setTargetAtTime(4, ts, 0.02); vib.gain.setTargetAtTime(18, ts + 0.22, 0.1); }
  });
  lp.frequency.setTargetAtTime(Math.max(400, f), tOff, R / 3);
  lp.frequency.setValueAtTime(Math.max(400, f), end);
  mix.connect(lp); lp.connect(b1); b1.connect(b2); b2.connect(amp);
  return finish(K, n, out, amp, end, oscs, [amp.gain], { peak, S }, () => { if (vib) disc(K.lfo(6.1), vib); });
};

// 1.5 FLUTE — sines + always-on breath noise, scoop, late vibrato
VOICES.flute = (K, n, out) => {
  const { ctx } = K; const { t, f, vel } = n;
  const A = Math.min(0.07, n.dur * 0.4), D = 0.10, S = 0.90, R = n.o?.rel ?? 0.18;
  const tOff = t + Math.max(n.dur, A + 0.01), end = tOff + R * 1.6 + 0.05;
  const peak = LEVEL.flute * vel * n.gain;
  const lowness = 1 - clamp((f - 262) / 900, 0, 1); // low flute is reedier
  const tone = G(ctx, 1);
  const vib = n.dur > 0.35 ? G(ctx, 0) : null;
  const oscs = [['sine', 1, 1], ['sine', 2, 0.12 + 0.16 * lowness], ['triangle', 3, 0.05 + 0.05 * lowness]]
    .filter(([, r]) => f * r < K.nyq * 0.9)
    .map(([ty, r, g]) => {
      const o = O(ctx, ty, f * r); const gg = G(ctx, g); o.connect(gg); gg.connect(tone);
      o.detune.setValueAtTime(-22, t); o.detune.linearRampToValueAtTime(0, t + 0.09);
      if (vib) vib.connect(o.detune); o.start(t); o.stop(end); return o;
    });
  applyPath(n, oscs, [1, 2, 3].slice(0, oscs.length));
  if (vib) { vib.gain.setValueAtTime(0, t + 0.25); vib.gain.linearRampToValueAtTime(14, t + 0.55); K.lfo(5.0).connect(vib); }
  const amp = G(ctx, 0);
  envASR(amp.gain, t, tOff, peak, A, D, S, R, n.o?.swell ?? 1.04);
  tone.connect(amp);
  const nz = noiseSrc(K, t, end - t, true), bp = BQ(ctx, 'bandpass', Math.min(f * 2, 12000), 6), bg = G(ctx, 0);
  bg.gain.setValueAtTime(0, t); bg.gain.linearRampToValueAtTime(peak * 0.22 * 1.6, t + Math.max(0.01, A * 0.6));
  bg.gain.linearRampToValueAtTime(peak * 0.05 * 1.6, t + A + 0.08);
  bg.gain.setTargetAtTime(0, tOff, R / 5);
  nz.connect(bp); bp.connect(bg);
  const lp = BQ(ctx, 'lowpass', 5500, 0.7);
  amp.connect(lp); bg.connect(lp);
  return finish(K, n, out, lp, end, [...oscs, nz], [amp.gain, bg.gain], { peak, S }, () => { if (vib) disc(K.lfo(5.0), vib); });
};

// 1.6 OBOE — square+saw through a nasal band-pass and formant peaks (plus a little body so low notes speak)
VOICES.oboe = (K, n, out) => {
  const { ctx } = K; const { t, f, vel } = n;
  const A = Math.min(0.055, n.dur * 0.4), D = 0.14, S = 0.78, R = n.o?.rel ?? 0.25;
  const tOff = t + Math.max(n.dur, A + 0.01), end = tOff + R * 1.6 + 0.05;
  const peak = LEVEL.oboe * vel * n.gain;
  const mix = G(ctx, 1);
  const vib = n.dur > 0.4 ? G(ctx, 0) : null;
  const oscs = [['square', 0, 0.55], ['sawtooth', 3, 0.45]].map(([ty, d, g]) => {
    const o = O(ctx, ty, f, d); const gg = G(ctx, g); o.connect(gg); gg.connect(mix); if (vib) vib.connect(o.detune);
    o.detune.setValueAtTime(d - 10, t); o.detune.linearRampToValueAtTime(d, t + 0.05);
    if (n.o?.falter) { o.detune.setValueAtTime(d, t + n.dur * 0.35); o.detune.linearRampToValueAtTime(d - 28, tOff); }
    startRP(K, o, t, end); return o;
  });
  applyPath(n, oscs, [1, 1]);
  const bp = BQ(ctx, 'bandpass', 1100, 2.4);
  bp.frequency.setValueAtTime(1100, t); bp.frequency.linearRampToValueAtTime(1600, t + 0.12);
  const lp = BQ(ctx, 'lowpass', 3800, 0.7);
  const f1 = BQ(ctx, 'peaking', 1400, 3, 5), f2 = BQ(ctx, 'peaking', 2900, 4, 2.5);
  const body = BQ(ctx, 'lowpass', Math.max(700, f * 2.2), 0.6), bodyG = G(ctx, 0.28);
  const amp = G(ctx, 0);
  envASR(amp.gain, t, tOff, peak, A, D, S, R, n.o?.falter ? 0.55 : (n.o?.swell ?? 1.05));
  if (vib) { const vd = n.o?.falter ? 5 : 11; vib.gain.setValueAtTime(0, t + 0.3); vib.gain.linearRampToValueAtTime(vd, t + 0.62); K.lfo(5.4).connect(vib); }
  mix.connect(bp); bp.connect(lp); lp.connect(f1); f1.connect(f2); f2.connect(amp);
  mix.connect(body); body.connect(bodyG); bodyG.connect(amp);
  return finish(K, n, out, amp, end, oscs, [amp.gain], { peak, S }, () => { if (vib) disc(K.lfo(5.4), vib); });
};

// 1.7 HARPSICHORD — plucked, no sustain, second choir beating, pluck-off click
VOICES.harpsi = (K, n, out) => {
  const { ctx } = K; const { t, f, vel } = n;
  const Dk = 0.9 * clamp(Math.pow(261 / f, 0.35), 0.7, 1.7);
  const tOff = t + Math.max(n.dur, 0.03);
  const ringEnd = t + Dk * 2.2;
  const end = Math.min(ringEnd, tOff + 0.12 * 1.6) + 0.05;
  const peak = LEVEL.harpsi * vel * n.gain;
  const a = O(ctx, K.wave('harpsi'), f), b = O(ctx, 'sawtooth', f * 2.005), bg = G(ctx, 0.28);
  const mix = G(ctx, 1); a.connect(mix); b.connect(bg); bg.connect(mix);
  a.start(t); b.start(t); a.stop(end); b.stop(end);
  const hp = BQ(ctx, 'highpass', 220, 0.7);
  const lp = BQ(ctx, 'lowpass', 4800, 1);
  lp.frequency.setValueAtTime(Math.min(4800 * (0.8 + 0.4 * vel), 14000), t);
  lp.frequency.setTargetAtTime(900, t + 0.002, 0.45 / 3);
  lp.frequency.setValueAtTime(900, t + 1.0);
  const amp = G(ctx, 0);
  amp.gain.setValueAtTime(0, t); amp.gain.linearRampToValueAtTime(peak, t + 0.002);
  amp.gain.setTargetAtTime(0, t + 0.002, Dk / 3.5);
  const srcs = [a, b];
  if (tOff < ringEnd - 0.05) {
    amp.gain.setTargetAtTime(0, tOff, 0.12 / 5);
    const nz = noiseSrc(K, tOff, 0.012), nh = BQ(ctx, 'highpass', 3000, 0.7), ng = G(ctx, 0);
    ng.gain.setValueAtTime(0, tOff); ng.gain.linearRampToValueAtTime(peak * 0.1, tOff + 0.002); ng.gain.linearRampToValueAtTime(0, tOff + 0.008);
    nz.connect(nh); nh.connect(ng); ng.connect(lp); srcs.push(nz);
  }
  mix.connect(hp); hp.connect(amp); amp.connect(lp);
  return finish(K, n, out, lp, end, srcs, [amp.gain], { peak, tau: Dk / 3.5 });
};

// 1.8 HARP — triangle + two sine partials each decaying at its own rate, sagging low-pass, a string twang
VOICES.harp = (K, n, out) => {
  const { ctx } = K; const { t, f, vel } = n;
  const Dn = f <= 98 ? 2.4 : f >= 1046 ? 0.7 : 2.4 + (0.7 - 2.4) * (Math.log2(f / 98) / Math.log2(1046 / 98));
  const damp = n.o?.damp ? t + Math.max(n.dur, 0.05) : null;
  const end = (damp ? Math.min(damp + 0.25 * 1.6, t + Dn * 2) : t + Dn * 2) + 0.05;
  const peak = LEVEL.harp * vel * n.gain;
  const sum = G(ctx, 1);
  const parts = [['triangle', 1, 0.7, Dn / 3.2], ['sine', 2, 0.2, Dn / 5], ['sine', 3, 0.1, Dn / 9.6]].filter(([, r]) => f * r < K.nyq * 0.9);
  const oscs = [], amps = [];
  parts.forEach(([ty, r, g, tau]) => {
    const o = O(ctx, ty, f * r), a = G(ctx, 0);
    envPerc(a.gain, t, peak * g, 0.004, tau, damp, 0.25);
    o.connect(a); a.connect(sum); o.start(t); o.stop(end); oscs.push(o); amps.push(a.gain);
  });
  const nz = noiseSrc(K, t, 0.02), nb = BQ(ctx, 'bandpass', Math.min(f * 4, 9000), 2), ng = G(ctx, 0);
  ng.gain.setValueAtTime(0, t); ng.gain.linearRampToValueAtTime(peak * 0.12, t + 0.002); ng.gain.linearRampToValueAtTime(0, t + 0.014);
  nz.connect(nb); nb.connect(ng); ng.connect(sum); oscs.push(nz);
  const lp = BQ(ctx, 'lowpass', 6000, 0.7);
  lp.frequency.setValueAtTime(6000, t); lp.frequency.setTargetAtTime(1600, t + 0.01, 0.4);
  lp.frequency.setValueAtTime(1600, t + 2.2);
  sum.connect(lp);
  return finish(K, n, out, lp, end, oscs, amps, { peak, tau: Dn / 3.2 });
};

// 1.9 TIMPANI — sagging sine, inharmonic head partials, felt stick; rolls use short strokes
VOICES.timp = (K, n, out) => {
  const { ctx } = K; const { t, f, vel } = n;
  const roll = n.o?.roll || n.dur < 0.16;
  const D = roll ? 0.45 : (n.o?.d ?? 1.4);
  const damp = n.o?.damp ? t + n.dur : null;
  const end = (damp ? Math.min(t + D * 2.4, damp + 0.3) : t + D * 2.4) + 0.05;
  const peak = LEVEL.timp * vel * n.gain;
  const sum = G(ctx, 1);
  const body = O(ctx, 'sine', f * cents(roll ? 20 : 45));
  body.frequency.setValueAtTime(f * cents(roll ? 20 : 45), t);
  body.frequency.exponentialRampToValueAtTime(f * cents(roll ? -10 : -45), t + 0.35);
  const parts = [[body, 1, D / 3], [O(ctx, 'sine', f * 1.5), 0.30, D / 4.5], [O(ctx, 'sine', f * 1.99), 0.22, D / 5.5],
    [O(ctx, 'sine', f * 2.44), 0.12, D / 6.5], [O(ctx, 'sine', f * 2.83), 0.12, D / 7], [O(ctx, 'sine', f * 0.72), roll ? 0 : 0.18, 0.05]].filter((p) => p[1] > 0);
  const oscs = [], amps = [];
  parts.forEach(([o, g, tau]) => { const a = G(ctx, 0); envPerc(a.gain, t, peak * g, 0.006, tau, damp, 0.3); o.connect(a); a.connect(sum); o.start(t); o.stop(end); oscs.push(o); amps.push(a.gain); });
  const nz = noiseSrc(K, t, 0.2), bp = BQ(ctx, 'bandpass', 220, 1.2), ng = G(ctx, 0);
  ng.gain.setValueAtTime(0, t); ng.gain.linearRampToValueAtTime(peak * 0.45 * 2.2, t + 0.002); ng.gain.setTargetAtTime(0, t + 0.004, roll ? 0.012 : 0.045);
  const nz2 = noiseSrc(K, t, 0.03), bp2 = BQ(ctx, 'bandpass', 900, 0.7), ng2 = G(ctx, 0);
  ng2.gain.setValueAtTime(0, t); ng2.gain.linearRampToValueAtTime(peak * 0.22, t + 0.001); ng2.gain.setTargetAtTime(0, t + 0.002, 0.008);
  nz.connect(bp); bp.connect(ng); ng.connect(sum); nz2.connect(bp2); bp2.connect(ng2); ng2.connect(sum);
  return finish(K, n, out, sum, end, [...oscs, nz, nz2], amps, { peak, tau: D / 3 });
};

// 1.10 SNARE — band-passed noise + a triangle shell
VOICES.snare = (K, n, out) => {
  const { ctx } = K; const { t, vel } = n;
  const D = n.o?.d ?? 0.13, end = t + D * 2.2 + 0.05;
  const peak = LEVEL.snare * vel * n.gain;
  const nz = noiseSrc(K, t, end - t), hp = BQ(ctx, 'highpass', 1600, 0.7), bp = BQ(ctx, 'bandpass', 3400, 0.9);
  const a = G(ctx, 0); envPerc(a.gain, t, peak, 0.001, D / 3.2);
  nz.connect(hp); hp.connect(bp); bp.connect(a);
  const sh = O(ctx, 'triangle', 185), sg = G(ctx, 0); envPerc(sg.gain, t, peak * 0.25 * 1.6, 0.001, 0.045 / 3);
  sh.connect(sg); sh.start(t); sh.stop(Math.min(end, t + 0.25));
  const sum = G(ctx, 1); a.connect(sum); sg.connect(sum);
  return finish(K, n, out, sum, end, [nz, sh], [a.gain, sg.gain], { peak, tau: D / 3.2 });
};

// 1.11 CYMBAL — high-passed noise with metallic ring peaks (+ a low wash for body); o.choke
VOICES.cymbal = (K, n, out) => {
  const { ctx } = K; const { t, vel } = n;
  const D = n.o?.choke ? 0.35 : (n.o?.d ?? 2.6);
  const end = t + D * 1.9 + 0.05;
  const peak = LEVEL.cymbal * vel * n.gain;
  const nz = noiseSrc(K, t, end - t, true);
  const hp = BQ(ctx, 'highpass', 5000, 0.7), p1 = BQ(ctx, 'peaking', 3900, 8, 5), p2 = BQ(ctx, 'peaking', 6800, 8, 5), p3 = BQ(ctx, 'peaking', 9500, 8, 5);
  const a = G(ctx, 0);
  a.gain.setValueAtTime(0, t); a.gain.linearRampToValueAtTime(peak, t + 0.002);
  a.gain.setTargetAtTime(peak * 0.55, t + 0.002, 0.04);
  a.gain.setTargetAtTime(0, t + 0.12, D / 4);
  nz.connect(hp); hp.connect(p1); p1.connect(p2); p2.connect(p3); p3.connect(a);
  const wb = BQ(ctx, 'bandpass', 2600, 0.6), w = G(ctx, 0);
  envPerc(w.gain, t, peak * 0.5, 0.003, D / 6);
  nz.connect(wb); wb.connect(w);
  const sum = G(ctx, 1); a.connect(sum); w.connect(sum);
  return finish(K, n, out, sum, end, [nz], [a.gain, w.gain], { peak, tau: D / 4 });
};

// 1.12 PIZZICATO — the gentle bass
VOICES.pizz = (K, n, out) => {
  const { ctx } = K; const { t, f, vel } = n;
  const D = 0.30 * clamp(Math.pow(196 / f, 0.4), 0.7, 1.8);
  const end = t + D * 2 + 0.05;
  const peak = LEVEL.pizz * vel * n.gain;
  const a = O(ctx, 'triangle', f), b = O(ctx, 'sawtooth', f), bg = G(ctx, 0.35), mix = G(ctx, 1);
  a.connect(mix); b.connect(bg); bg.connect(mix); a.start(t); b.start(t); a.stop(end); b.stop(end);
  const lp = BQ(ctx, 'lowpass', 2600, 2.5);
  lp.frequency.setValueAtTime(2600 * (0.7 + 0.5 * vel), t); lp.frequency.setTargetAtTime(400, t + 0.003, 0.16 / 3); lp.frequency.setValueAtTime(400, t + 0.35);
  const amp = G(ctx, 0); envPerc(amp.gain, t, peak, 0.003, D / 3.2, n.o?.damp ? t + n.dur : null, 0.08);
  mix.connect(lp); lp.connect(amp);
  const nz = noiseSrc(K, t, 0.015), bp = BQ(ctx, 'bandpass', 900, 1.5), ng = G(ctx, 0);
  ng.gain.setValueAtTime(0, t); ng.gain.linearRampToValueAtTime(peak * 0.10 * 2, t + 0.002); ng.gain.linearRampToValueAtTime(0, t + 0.01);
  nz.connect(bp); bp.connect(ng); ng.connect(amp);
  return finish(K, n, out, amp, end, [a, b, nz], [amp.gain], { peak, tau: D / 3.2 });
};

// 1.13 CELESTA — bell partials, highs decaying 3x faster
VOICES.celesta = (K, n, out) => {
  const { ctx } = K; const { t, f, vel } = n;
  const D = 1.1 * clamp(Math.pow(523 / f, 0.3), 0.7, 1.5);
  const end = t + D * 2.1 + 0.05;
  const peak = LEVEL.celesta * vel * n.gain;
  const sum = G(ctx, 1), oscs = [], amps = [];
  [[1, 1, D / 3], [4.02, 0.30, D / 9], [10.1, 0.08, D / 9]].forEach(([r, g, tau]) => {
    if (f * r > K.nyq * 0.9) return;
    const o = O(ctx, 'sine', f * r), a = G(ctx, 0); envPerc(a.gain, t, peak * g, 0.004, tau);
    o.connect(a); a.connect(sum); o.start(t); o.stop(end); oscs.push(o); amps.push(a.gain);
  });
  const hp = BQ(ctx, 'highpass', 400, 0.7); sum.connect(hp);
  return finish(K, n, out, hp, end, oscs, amps, { peak, tau: D / 3 });
};

// 1.14 CHURCH ORGAN — all ranks folded into two periodic waves, chiff, tremulant on the 4'/2'
VOICES.organ = (K, n, out) => {
  const { ctx } = K; const { t, f, vel } = n; const pedal = !!n.o?.pedal;
  const R = n.o?.rel ?? 0.55;
  const tOff = t + Math.max(n.dur, 0.1), end = tOff + R * 1.6 + 0.05;
  const peak = LEVEL.organ * vel * n.gain;
  const a = O(ctx, K.wave(pedal ? 'organP' : 'organA'), f / 2, (K.rnd() - 0.5) * 2.4);
  const oscs = [a];
  const mer = ctx.createChannelMerger(2);
  const ga = G(ctx, 1); a.connect(ga); ga.connect(mer, 0, 0); ga.connect(mer, 0, 1);
  if (!pedal && f * 4 < K.nyq * 0.8) {
    const b = O(ctx, K.wave('organB'), f * 2, -1 + (K.rnd() - 0.5) * 1.5); K.tremulant.connect(b.detune);
    const side = (Math.round(n.m || 0) % 2) ? 0 : 1;
    const gb1 = G(ctx, 0.75), gb2 = G(ctx, 0.25); b.connect(gb1); b.connect(gb2);
    gb1.connect(mer, 0, side); gb2.connect(mer, 0, 1 - side);
    oscs.push(b);
  }
  oscs.forEach((o) => startRP(K, o, t, end));
  const lp = BQ(ctx, 'lowpass', 4200, 0.6);
  const amp = G(ctx, 0);
  const A = Math.min(0.09, n.dur * 0.5);
  amp.gain.setValueAtTime(0, t); amp.gain.linearRampToValueAtTime(peak, t + A);
  if (n.o?.swell) amp.gain.linearRampToValueAtTime(peak * n.o.swell, tOff);
  amp.gain.setTargetAtTime(0, tOff, R / 5);
  mer.connect(lp); lp.connect(amp);
  const nz = noiseSrc(K, t, 0.035), bp = BQ(ctx, 'bandpass', Math.min(f * 3, 9000), 3), ng = G(ctx, 0);
  ng.gain.setValueAtTime(0, t); ng.gain.linearRampToValueAtTime(peak * 0.06 * 4, t + 0.006); ng.gain.linearRampToValueAtTime(0, t + 0.025);
  nz.connect(bp); bp.connect(ng); ng.connect(amp);
  return finish(K, n, out, amp, end, [...oscs, nz], [amp.gain], { peak, S: 1 }, () => { if (oscs[1]) disc(K.tremulant, oscs[1].detune); });
};

// 1.15 CHIPTUNE TWINKLE — raw 25% pulse, NES 60 Hz arpeggio, wide vibrato. The wink.
VOICES.twinkle = (K, n, out) => {
  const { ctx } = K; const { t, f, vel } = n;
  const tOff = t + Math.max(n.dur, 0.02), end = tOff + 0.05 * 1.6 + 0.03;
  const peak = LEVEL.twinkle * vel * n.gain;
  const o = O(ctx, K.wave('pulse25'), f);
  const arp = n.o?.arp;
  if (arp && arp.length) { for (let k = 0, ts = t; ts < tOff; k++, ts = t + k / 60) o.frequency.setValueAtTime(f * Math.pow(2, arp[k % arp.length] / 12), ts); }
  const vib = n.dur > 0.12 ? G(ctx, 0) : null;
  if (vib) { vib.gain.setValueAtTime(0, t + 0.1); vib.gain.linearRampToValueAtTime(25, t + 0.2); K.lfo(7).connect(vib); vib.connect(o.detune); }
  const amp = G(ctx, 0);
  envASR(amp.gain, t, tOff, peak, 0.001, 0.06, 0.45, 0.05);
  o.connect(amp); o.start(t); o.stop(end);
  return finish(K, n, out, amp, end, [o], [amp.gain], { peak, S: 0.45 }, () => { if (vib) disc(K.lfo(7), vib); });
};

// 1.16 CHOIR PAD — three saws through an "ah" formant; slow and never loud
VOICES.pad = (K, n, out) => {
  const { ctx } = K; const { t, f, vel } = n;
  const A = Math.min(n.o?.attack ?? 0.9, Math.max(0.05, n.dur * 0.45)), D = 0.4, S = 0.85, R = n.o?.rel ?? 1.2;
  const tOff = t + Math.max(n.dur, A + 0.01), end = tOff + R * 1.6 + 0.05;
  const peak = LEVEL.pad * vel * n.gain;
  const gL = G(ctx, 1), gC = G(ctx, 1), gR = G(ctx, 1), mer = ctx.createChannelMerger(2);
  gL.connect(mer, 0, 0); gR.connect(mer, 0, 1); gC.connect(mer, 0, 0); gC.connect(mer, 0, 1);
  const vib = n.dur > 0.8 ? G(ctx, 0) : null;
  if (vib) { vib.gain.setValueAtTime(0, t + 0.6); vib.gain.linearRampToValueAtTime(6, t + 1.4); K.lfo(4.9).connect(vib); }
  const oscs = [[-9, gL], [0, gC], [9, gR]].map(([d, g], i) => { const o = O(ctx, 'sawtooth', f, d); K.drift[i].connect(o.detune); if (vib) vib.connect(o.detune); o.connect(g); startRP(K, o, t, end); return o; });
  applyPath(n, oscs, [1, 1, 1]);
  const lp = BQ(ctx, 'lowpass', 1400, 0.7), p1 = BQ(ctx, 'peaking', 730, 5, 7), p2 = BQ(ctx, 'peaking', 1090, 6, 6), p3 = BQ(ctx, 'peaking', 2440, 7, 5);
  const amp = G(ctx, 0); envASR(amp.gain, t, tOff, peak, A, D, S, R, n.o?.swell ?? 1);
  mer.connect(lp); lp.connect(p1); p1.connect(p2); p2.connect(p3); p3.connect(amp);
  return finish(K, n, out, amp, end, oscs, [amp.gain], { peak, S }, () => { oscs.forEach((o, i) => disc(K.drift[i], o.detune)); if (vib) disc(K.lfo(4.9), vib); });
};

// VOX — a single wordless voice (Queen Elowen's lullaby): "oo" formants, breath, a singer's vibrato and slurs
VOICES.vox = (K, n, out) => {
  const { ctx } = K; const { t, f, vel } = n;
  const A = Math.min(0.14, n.dur * 0.4), D = 0.25, S = 0.88, R = n.o?.rel ?? 0.45;
  const tOff = t + Math.max(n.dur, A + 0.01), end = tOff + R * 1.6 + 0.05;
  const peak = LEVEL.vox * vel * n.gain;
  const mix = G(ctx, 1); const vib = G(ctx, 0);
  const oscs = [['sawtooth', 0, 0.45], ['triangle', 4, 0.55]].map(([ty, d, g]) => {
    const o = O(ctx, ty, f, d); const gg = G(ctx, g); o.connect(gg); gg.connect(mix);
    o.detune.setValueAtTime(d - 30, t); o.detune.linearRampToValueAtTime(d, t + 0.12);
    vib.connect(o.detune); startRP(K, o, t, end); return o;
  });
  vib.gain.setValueAtTime(0, t + 0.28); vib.gain.linearRampToValueAtTime(22, t + 0.7); K.lfo(5.3).connect(vib);
  applyPath(n, oscs, [1, 1], (ts) => { vib.gain.setTargetAtTime(6, ts, 0.03); vib.gain.setTargetAtTime(22, ts + 0.3, 0.12); });
  const hp = BQ(ctx, 'highpass', 150, 0.7), f1 = BQ(ctx, 'peaking', 450, 4, 11), f2 = BQ(ctx, 'peaking', 950, 5, 6), f3 = BQ(ctx, 'peaking', 2700, 5, 5), lp = BQ(ctx, 'lowpass', 3200, 0.7);
  const amp = G(ctx, 0); envASR(amp.gain, t, tOff, peak, A, D, S, R, n.o?.swell ?? 1.08);
  mix.connect(hp); hp.connect(f1); f1.connect(f2); f2.connect(f3); f3.connect(lp); lp.connect(amp);
  const nz = noiseSrc(K, t, end - t, true), nb = BQ(ctx, 'bandpass', 2800, 1), ng = G(ctx, 0);
  envASR(ng.gain, t, tOff, peak * 0.05, 0.05, 0.1, 0.5, R);
  nz.connect(nb); nb.connect(ng);
  const sum = G(ctx, 1); amp.connect(sum); ng.connect(sum);
  return finish(K, n, out, sum, end, [...oscs, nz], [amp.gain, ng.gain], { peak, S }, () => disc(K.lfo(5.3), vib));
};

// BELL — a church bell (hum, prime, tierce, quint, nominal...). o.wrong detunes the tierce: "ringing wrong".
VOICES.bell = (K, n, out) => {
  const { ctx } = K; const { t, f, vel } = n;
  const peak = LEVEL.bell * vel * n.gain;
  const L = n.o?.len ?? 1;
  const parts = [[0.5, 0.45, 3.2], [1, 0.6, 2.4], [n.o?.wrong ? 1.13 : 1.19, 0.38, 1.6], [1.5, 0.22, 1.3], [2, 0.4, 1.0], [2.52, 0.15, 0.6], [3.0, 0.12, 0.45], [4.07, 0.08, 0.3]];
  const end = t + 3.2 * L * 2.2 + 0.05;
  const sum = G(ctx, 1), oscs = [], amps = [];
  parts.forEach(([r, g, tau]) => {
    if (f * r > K.nyq * 0.9) return;
    const o = O(ctx, 'sine', f * r, (K.rnd() - 0.5) * 4), a = G(ctx, 0); envPerc(a.gain, t, peak * g, 0.003, tau * L);
    o.connect(a); a.connect(sum); o.start(t); o.stop(end); oscs.push(o); amps.push(a.gain);
  });
  const nz = noiseSrc(K, t, 0.02), bp = BQ(ctx, 'bandpass', Math.min(f * 3, 9000), 1), ng = G(ctx, 0);
  ng.gain.setValueAtTime(0, t); ng.gain.linearRampToValueAtTime(peak * 0.25, t + 0.002); ng.gain.linearRampToValueAtTime(0, t + 0.015);
  nz.connect(bp); bp.connect(ng); ng.connect(sum);
  return finish(K, n, out, sum, end, [...oscs, nz], amps, { peak, tau: 2.4 * L });
};

// TRIANGLE (percussion) — the single ping on the befriending fanfare
VOICES.tri = (K, n, out) => {
  const { ctx } = K; const { t, vel } = n; const f = n.f || 1480;
  const peak = LEVEL.tri * vel * n.gain;
  const end = t + 1.8 * 2.2 + 0.05;
  const sum = G(ctx, 1), oscs = [], amps = [];
  [[1, 1, 1.4], [2.76, 0.5, 0.9], [5.40, 0.35, 0.55], [8.93, 0.2, 0.3]].forEach(([r, g, tau]) => {
    if (f * r > K.nyq * 0.9) return;
    const o = O(ctx, 'sine', f * r), a = G(ctx, 0); envPerc(a.gain, t, peak * g, 0.002, tau / 2.2);
    o.connect(a); a.connect(sum); o.start(t); o.stop(end); oscs.push(o); amps.push(a.gain);
  });
  return finish(K, n, out, sum, end, oscs, amps, { peak, tau: 0.6 });
};

// ------------------------------------------------------------------------------------------------ grown multisamples
/*
 * THE SECTIONS. A string section and a brass section are the two sounds a child's ear checks first, and no stack of
 * detuned oscillators through a low-pass passes that check. So the `strings` and `horns` voices are sample players —
 * multisampled one zone every minor third, a sustain (attack head + seamless 1.6 s loop) and staccatos, two
 * dynamic layers per sample (soft / loud) that crossfade phase-coherently — and every sample is GROWN here at boot,
 * from a model of the instrument, not downloaded:
 *   strings: 8 players seated across the stereo field, each a bowed string (Helmholtz sawtooth, corner-rounded by the
 *            bow, per-instrument harmonic scatter) with its own detune, drift, bow-pressure wander and a vibrato that
 *            starts late; slip-synchronised bow noise and an onset scratch; all through a body with real resonances
 *            (air mode, the B1-/B1+ corpus pair, the nasal dip, the bridge hill) scaled from violin down to bass.
 *            Harmonics sweeping through those resonances under vibrato give the shimmer recorded strings have.
 *   brass:   6 players, near-sine at piano steepening to a bright cuivré spectrum at forte (the loud layer), lip scoops
 *            and staggered tongued attacks in the head, breath buzz, bell formants.
 * growZone is self-contained so it runs in a Worker (live: the whole bank grows in ~1 s off the main thread) or
 * synchronously (OfflineAudioContext renders). Until a zone exists live, the oscillator fallback voices sound instead.
 */
export function growZone(job) {
  const t0 = (typeof performance !== 'undefined' ? performance : Date).now();
  const kind = job.kind, root = job.root, art = job.art || 'sus', SR = job.sr || 24000;
  const STR = kind === 'str', SUS = art === 'sus';
  let seed = ((job.seed || 0x5eed1) ^ Math.imul(root + 11, 2654435761) ^ (STR ? 0x13579 : 0x2468a) ^ (SUS ? 0 : 0x5a5a5)) >>> 0;
  const rnd = () => { seed = (seed + 0x6d2b79f5) >>> 0; let t = seed; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const gauss = () => (rnd() + rnd() + rnd() + rnd() - 2) * 1.732;
  const TAU = Math.PI * 2;
  const B = 16; // control block (frames)
  const q16 = (sec) => Math.max(B, Math.round(sec * SR / B) * B);
  const f0 = 440 * Math.pow(2, (root - 69) / 12);
  const H = q16(SUS ? (STR ? 0.40 : 0.32) : (STR ? 0.56 : 0.52));
  const L = SUS ? q16(1.6) : 0;
  const N = H + 2 * L; // the loop is rendered twice so every filter reaches its periodic steady state
  const Lsec = L / SR;
  const lerpTab = (tab, x) => { if (x <= tab[0][0]) return tab[0][1]; for (let i = 1; i < tab.length; i++) if (x <= tab[i][0]) { const [a, va] = tab[i - 1], [b, vb] = tab[i]; return va + (vb - va) * (x - a) / (b - a); } return tab[tab.length - 1][1]; };

  const fft = (re, im) => { const m = re.length; for (let i = 1, j = 0; i < m; i++) { let bit = m >> 1; for (; j & bit; bit >>= 1) j ^= bit; j ^= bit;
    if (i < j) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; } }
    for (let len = 2; len <= m; len <<= 1) { const ang = -TAU / len, wr = Math.cos(ang), wi = Math.sin(ang);
      for (let i = 0; i < m; i += len) { let cr = 1, ci = 0; for (let j = 0; j < len / 2; j++) { const a = i + j, b = a + len / 2; const vr = re[b] * cr - im[b] * ci, vi = re[b] * ci + im[b] * cr;
        re[b] = re[a] - vr; im[b] = im[a] - vi; re[a] += vr; im[a] += vi; const t = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = t; } } } };
  const TS = 2048, TM = TS - 1;
  /** one period: x[k] = sum a_n sin(n 2pi k/TS + ph_n), RMS 0.5 */
  const table = (amps, phs) => {
    const re = new Float64Array(TS), im = new Float64Array(TS);
    let e = 0;
    for (let n = 1; n < amps.length && n < TS / 2; n++) { const a = amps[n]; if (!a) continue; re[n] = a * Math.sin(phs[n]) * 0.5; im[n] = -a * Math.cos(phs[n]) * 0.5; re[TS - n] = re[n]; im[TS - n] = -im[n]; e += a * a / 2; }
    fft(re, im);
    const out = new Float32Array(TS); const k = 0.5 / Math.sqrt(e || 1);
    for (let i = 0; i < TS; i++) out[i] = re[(TS - i) & TM] * k;
    return out;
  };

  // register -> section character (violins ... violas ... celli ... basses)
  const nMax = Math.max(1, Math.floor(10500 / (f0 * 1.03)));
  const bs = STR ? lerpTab([[33, 0.30], [43, 0.40], [50, 0.52], [57, 0.76], [64, 1], [127, 1]], root) : 1;
  const P = STR ? 8 : 6;
  const specLoud = new Float64Array(nMax + 1), specSoft = new Float64Array(nMax + 1);
  const hillHz = 2600 * Math.pow(bs, 0.55), radLo = 260 * bs;
  for (let n = 1; n <= nMax; n++) {
    const f = n * f0;
    if (STR) {
      // body radiation climbs ~+4.5 dB/oct from the air mode to the bridge hill
      const rad = Math.pow(Math.max(1, Math.min(f, hillHz) / radLo), 0.75) / Math.pow(Math.max(1, Math.min(f0, hillHz) / radLo), 0.75);
      // Helmholtz bridge force ~1/n, corner-rounded by the bow; soft bowing rounds the corner much earlier
      specLoud[n] = rad * (1 / n) / Math.sqrt(1 + Math.pow(n / 22, 2)) / (1 + Math.pow(f / 8500, 2.5));
      specSoft[n] = rad * (1 / n) / (1 + Math.pow(n / 7, 2)) / (1 + Math.pow(f / 2000, 2.4));
    } else {
      // brass: piano is round with a warm 2nd/3rd; forte steepens into the bright buzzy cuivre spectrum
      specLoud[n] = Math.pow(n, -0.22) / (1 + Math.pow(f / 3300, 2.0));
      specSoft[n] = Math.pow(n, -0.6) / (1 + Math.pow(f / 1000, 2.6));
    }
  }

  // noise tables, periodic over the loop
  const NZ = SUS ? L : H;
  const noiseTab = (hpHz, lpHz) => {
    const w = new Float32Array(NZ); for (let i = 0; i < NZ; i++) w[i] = rnd() * 2 - 1;
    const ah = Math.exp(-TAU * hpHz / SR), al = 1 - Math.exp(-TAU * lpHz / SR);
    let lpS = 0, hpS = 0, prev = 0;
    const out = new Float32Array(NZ);
    for (let pass = 0; pass < 2; pass++) for (let i = 0; i < NZ; i++) { const x = w[i]; hpS = ah * (hpS + x - prev); prev = x; lpS += al * (hpS - lpS); out[i] = lpS; }
    let ss = 0; for (let i = 0; i < NZ; i++) ss += out[i] * out[i]; const k = 0.5 / Math.sqrt(ss / NZ || 1);
    for (let i = 0; i < NZ; i++) out[i] *= k;
    return out;
  };
  const nzLoud = noiseTab(STR ? 700 : 900, STR ? 11000 : 7000), nzSoft = noiseTab(STR ? 500 : 700, STR ? 3500 : 2500);
  const PULSE = new Float32Array(257); for (let i = 0; i <= 256; i++) { const x = Math.min(i, 256 - i) / 256; PULSE[i] = Math.exp(-Math.pow(x / (STR ? 0.07 : 0.1), 2)); }

  // players
  const outL = [new Float64Array(N), new Float64Array(N)];
  const outS = [new Float64Array(N), new Float64Array(N)];
  const tl = (i) => (i < H ? i : H + ((i - H) % (L || 1)));
  const nLoud = STR ? 0.085 : 0.018, nSoft = STR ? 0.028 : 0.007;
  for (let p = 0; p < P; p++) {
    const pan = Math.max(-1, Math.min(1, -0.8 + 1.6 * (p + 0.5) / P + (rnd() - 0.5) * 0.2));
    const gl = Math.cos((pan + 1) * Math.PI / 4), gr = Math.sin((pan + 1) * Math.PI / 4);
    const det = gauss() * (STR ? 4.5 : 2.6);
    const kv = STR ? [9, 10, 11][Math.floor(rnd() * 3)] : 9 + Math.floor(rnd() * 2);
    const vph = rnd() * TAU, vwob = 0.25 + 0.5 * rnd(), vwk = 1 + Math.floor(rnd() * 2), vwph = rnd() * TAU;
    const vdep = !SUS ? 0 : STR ? (root < 52 ? 7 + 4 * rnd() : 9 + 6 * rnd()) : (rnd() < 0.35 ? 1.5 + 2 * rnd() : 0);
    const vOn = STR ? 0.13 + 0.08 * rnd() : 0.2, vFull = H / SR;
    const d1 = gauss() * (STR ? 2.2 : 1.4), d1p = rnd() * TAU, d2 = gauss() * (STR ? 1.2 : 0.7), d2p = rnd() * TAU;
    const a1 = (STR ? 0.05 : 0.025) * (0.5 + rnd()), a1k = 1 + Math.floor(rnd() * 2), a1p = rnd() * TAU;
    const a2 = (STR ? 0.03 : 0.015) * (0.5 + rnd()), a2k = 3 + Math.floor(rnd() * 3), a2p = rnd() * TAU;
    const onset = rnd() * (STR ? (SUS ? 0.03 : 0.012) : 0.02);
    const atk = STR ? (SUS ? 0.06 + 0.05 * rnd() : 0.012 + 0.006 * rnd()) : (SUS ? 0.028 + 0.02 * rnd() : 0.014 + 0.006 * rnd());
    const scoop = STR ? -(3 + 7 * rnd()) : -(16 + 22 * rnd()), scTau = STR ? 0.035 : 0.014 + 0.012 * rnd();
    const noff = Math.floor(rnd() * NZ);
    const amps = [new Float64Array(nMax + 1), new Float64Array(nMax + 1)], phs = new Float64Array(nMax + 1);
    for (let n = 1; n <= nMax; n++) {
      const jit = Math.pow(10, gauss() * 1.8 / 20);
      amps[0][n] = specSoft[n] * jit; amps[1][n] = specLoud[n] * jit;
      phs[n] = (STR ? 0 : Math.PI / 2) + gauss() * (STR ? 0.5 : 0.25);
    }
    const tabS = table(amps[0], phs), tabL = table(amps[1], phs);
    const nb = N / B + 1;
    const inc = new Float64Array(nb), amp = new Float64Array(nb), nzk = new Float64Array(nb);
    for (let j = 0; j < nb; j++) {
      const i = tl(Math.min(j * B, N)); const t = i / SR; const tc = i >= H ? (i - H) / SR : t;
      const ph = TAU * tc / (Lsec || 1);
      let c = det + d1 * Math.sin(ph + d1p) + d2 * Math.sin(2 * ph + d2p);
      let vd = vdep; if (i < H) { const x = (t - vOn) / Math.max(0.01, vFull - vOn); vd *= x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x); }
      if (vd) c += vd * Math.sin(kv * ph + vph + vwob * Math.sin(vwk * ph + vwph));
      const ts = t - onset;
      if (i < H && ts > -0.01) c += scoop * Math.exp(-Math.max(0, ts) / scTau);
      inc[j] = f0 * Math.pow(2, c / 1200) / SR;
      let a = 1 + a1 * Math.sin(a1k * ph + a1p) + a2 * Math.sin(a2k * ph + a2p) + (vd ? 0.0125 * vd * Math.sin(kv * ph + vph) : 0);
      let nk = 1;
      if (i < H) {
        if (ts <= 0) { a = 0; nk = 0; } else {
          const r = Math.min(1, ts / atk); a *= SUS ? r * r * (3 - 2 * r) : Math.sin(r * Math.PI / 2);
          nk = 1 + (STR ? 3.5 : 5) * Math.exp(-ts / (STR ? 0.035 : 0.018));
          if (!SUS) { const hold = STR ? 0.045 : 0.06, tau = STR ? 0.085 : 0.11; if (ts > hold) a *= Math.exp(-(ts - hold) / tau); nk *= STR ? 1.3 : 1; }
        }
      }
      amp[j] = a; nzk[j] = nk;
    }
    if (SUS) { // close the loop: a whole number of cycles
      const j0 = H / B, j1 = (H + L) / B; let S = 0;
      for (let j = j0; j < j1; j++) S += B * inc[j] + (inc[j + 1] - inc[j]) * (B - 1) / 2;
      const kS = Math.max(1, Math.round(S)) / S; for (let j = 0; j < nb; j++) inc[j] *= kS;
    }
    let phase = rnd();
    const oLl = outL[0], oLr = outL[1], oSl = outS[0], oSr = outS[1];
    for (let j = 0; j < N / B; j++) {
      const i0 = j * B; const di = (inc[j + 1] - inc[j]) / B, da = (amp[j + 1] - amp[j]) / B, dn = (nzk[j + 1] - nzk[j]) / B;
      let ic = inc[j], ac = amp[j], nc = nzk[j];
      if (ac === 0 && amp[j + 1] === 0) { for (let k = 0; k < B; k++) { phase += ic; ic += di; } continue; }
      const tb = tl(i0);
      for (let k = 0; k < B; k++) {
        phase += ic; ic += di;
        const fr = phase - Math.floor(phase), x = fr * TS, xi = x | 0, xf = x - xi, i1 = (xi + 1) & TM;
        const vS = tabS[xi] + xf * (tabS[i1] - tabS[xi]), vL = tabL[xi] + xf * (tabL[i1] - tabL[xi]);
        const ni = (tb + k + noff) % NZ, pu = 0.3 + PULSE[(fr * 256) | 0];
        const sL = (vL + nzLoud[ni] * nLoud * nc * pu) * ac, sS = (vS + nzSoft[ni] * nSoft * nc * pu) * ac;
        const idx = i0 + k;
        oLl[idx] += sL * gl; oLr[idx] += sL * gr; oSl[idx] += sS * gl; oSr[idx] += sS * gr;
        ac += da; nc += dn;
      }
    }
  }

  // body / bell: the same filters on both layers so the dynamic crossfade stays phase-coherent
  const biq = (type, f, Q, dB) => {
    f = Math.min(f, SR * 0.45);
    const A = Math.pow(10, (dB || 0) / 40), w = TAU * f / SR, cw = Math.cos(w), sw = Math.sin(w), al = sw / (2 * Q);
    let b0, b1, b2, a0, a1, a2;
    if (type === 'pk') { b0 = 1 + al * A; b1 = -2 * cw; b2 = 1 - al * A; a0 = 1 + al / A; a1 = -2 * cw; a2 = 1 - al / A; }
    else if (type === 'lp') { b0 = (1 - cw) / 2; b1 = 1 - cw; b2 = b0; a0 = 1 + al; a1 = -2 * cw; a2 = 1 - al; }
    else { b0 = (1 + cw) / 2; b1 = -(1 + cw); b2 = b0; a0 = 1 + al; a1 = -2 * cw; a2 = 1 - al; }
    return [b0 / a0, b1 / a0, b2 / a0, a1 / a0, a2 / a0];
  };
  const bodySpec = (sh) => {
    const s = bs * sh, hill = Math.pow(bs, 0.55) * sh;
    if (STR) return [
      ['hp', 185 * s, 0.75], ['pk', 275 * s, 6, 6], ['pk', 405 * s, 5, 2.5], ['pk', 470 * s, 8, 7], ['pk', 555 * s, 8, 8],
      ['pk', 760 * s, 6, 3], ['pk', 1000 * s, 7, 3.5], ['pk', 1320 * s, 1.6, -5 * Math.pow(bs, 1.5)], ['pk', 1750 * s, 5, 2.5],
      ['pk', 2550 * hill, 1.0, 7.5], ['pk', 3350 * hill, 3.5, 2.5], ['lp', 10500, 0.6],
    ];
    return [['hp', 70, 0.7], ['pk', 480 * sh, 1.1, 2], ['pk', 1150 * sh, 1.5, 3.5], ['pk', 2700 * sh, 2.2, 2], ['lp', 9000, 0.6]];
  };
  const runFilters = (x, spec) => {
    for (const [ty, f, Q, dB] of spec) {
      const [b0, b1, b2, a1, a2] = biq(ty, f, Q, dB);
      let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
      for (let i = 0; i < x.length; i++) { const xi = x[i]; const y = b0 * xi + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2; x2 = x1; x1 = xi; y2 = y1; y1 = y; x[i] = y; }
    }
  };
  for (let ch = 0; ch < 2; ch++) { const sp = bodySpec(ch ? 1.022 : 0.978); runFilters(outL[ch], sp); runFilters(outS[ch], sp); }

  // head + steady loop, equal-RMS layers (both at SR: a half-rate soft layer measured -35 dB resampling images at 8-11 kHz)
  const M = H + L;
  const pick = (x) => { const o = new Float32Array(M); for (let i = 0; i < H; i++) o[i] = x[i]; for (let i = 0; i < L; i++) o[H + i] = x[H + L + i]; return o; };
  const loud = [pick(outL[0]), pick(outL[1])], soft = [pick(outS[0]), pick(outS[1])];
  const rmsOf = (arrs, a, b) => { let s = 0, n = 0; for (const x of arrs) for (let i = a; i < b; i++) { s += x[i] * x[i]; n++; } return Math.sqrt(s / Math.max(1, n)); };
  const refA = SUS ? H : Math.round(0.01 * SR), refB = SUS ? M : Math.round(0.16 * SR);
  const kL = 0.25 / (rmsOf(loud, refA, refB) || 1), kS = 0.25 / (rmsOf(soft, refA, refB) || 1);
  for (const x of loud) for (let i = 0; i < M; i++) x[i] *= kL;
  for (const x of soft) for (let i = 0; i < M; i++) x[i] *= kS;
  const ms = (typeof performance !== 'undefined' ? performance : Date).now() - t0;
  return { kind, root, art, sr: SR, H, L, loud, soft, ms };
}

/** The bank: zone roots every minor third across each section's written range; live growth in a Worker, sync offline. */
export const ZONES = { str: [34, 97], brass: [46, 88] };
const SMP_SR = 24000;
export const Bank = (() => {
  const zones = new Map();
  const stats = { zones: 0, total: 0, sync: 0, worker: 0, ms: 0, bytes: 0, errors: 0, workerOk: null };
  const jobs = [];
  for (const kind of Object.keys(ZONES)) for (const art of ['sus', 'stac']) for (let r = ZONES[kind][0]; r <= ZONES[kind][1]; r += art === 'stac' ? 6 : 3) jobs.push({ kind, art, root: r });
  stats.total = jobs.length;
  let worker = null, busy = null, queue = [], started = false;
  // sustains: a zone every minor third (<= 1 semitone of stretch); staccatos, which never sustain long enough to expose it, every tritone
  const rootOf = (kind, m, art = 'sus') => { const [lo, hi] = ZONES[kind]; const st = art === 'stac' ? 6 : 3; return lo + st * Math.max(0, Math.min(Math.floor((hi - lo) / st), Math.round((m - lo) / st))); };
  const key = (kind, art, root) => `${kind}:${art}:${root}`;
  const mkBuf = (ctx, chans, sr) => {
    let b;
    try { b = new AudioBuffer({ numberOfChannels: 2, length: chans[0].length, sampleRate: sr }); } catch (e) { b = ctx.createBuffer(2, chans[0].length, sr); }
    b.copyToChannel(chans[0], 0); b.copyToChannel(chans[1], 1);
    return b;
  };
  function adopt(raw, ctx) {
    const k = key(raw.kind, raw.art, raw.root);
    if (zones.has(k)) return zones.get(k);
    const z = { kind: raw.kind, art: raw.art, root: raw.root, loud: mkBuf(ctx, raw.loud, raw.sr), soft: mkBuf(ctx, raw.soft, raw.sr),
      loopStart: raw.L ? raw.H / raw.sr : 0, loopEnd: raw.L ? (raw.H + raw.L) / raw.sr : 0, dur: raw.loud[0].length / raw.sr };
    zones.set(k, z);
    stats.zones = zones.size; stats.ms += raw.ms || 0; stats.bytes += (raw.loud[0].length + raw.soft[0].length) * 8;
    return z;
  }
  let ctxRef = null;
  function pumpWorker() {
    if (!worker || busy) return;
    while (queue.length && zones.has(key(queue[0].kind, queue[0].art, queue[0].root))) queue.shift();
    const job = queue.shift(); if (!job) return;
    busy = job;
    worker.postMessage({ ...job, sr: SMP_SR });
  }
  function startWorker(ctx) {
    ctxRef = ctxRef || ctx;
    if (started) return; started = true;
    queue = jobs.slice().sort((a, b) => (a.art === b.art ? 0 : a.art === 'sus' ? -1 : 1) || Math.abs(a.root - 64) - Math.abs(b.root - 64));
    try {
      if (typeof Worker === 'undefined' || typeof Blob === 'undefined' || typeof URL === 'undefined') throw new Error('no Worker');
      const src = `const growZone = ${growZone.toString()};\nonmessage = (e) => { try { const r = growZone(e.data); postMessage(r, [r.loud[0].buffer, r.loud[1].buffer, r.soft[0].buffer, r.soft[1].buffer]); } catch (err) { postMessage({ error: String(err && err.message || err), job: e.data }); } };`;
      const url = URL.createObjectURL(new Blob([src], { type: 'text/javascript' }));
      worker = new Worker(url);
      worker.onmessage = (e) => {
        const r = e.data; busy = null;
        if (r && r.error) { stats.errors++; } else { try { adopt(r, ctxRef); stats.worker++; stats.workerOk = true; } catch (err) { stats.errors++; } }
        pumpWorker();
      };
      worker.onerror = (e) => { stats.workerOk = false; stats.errors++; try { e.preventDefault(); } catch (_) { /* ignore */ } worker = null; busy = null; idleGrow(); };
      pumpWorker();
    } catch (e) { stats.workerOk = false; worker = null; idleGrow(); }
  }
  /** no Worker: grow one zone per idle slice on the main thread */
  function idleGrow() {
    const step = () => {
      while (queue.length && zones.has(key(queue[0].kind, queue[0].art, queue[0].root))) queue.shift();
      const job = queue.shift(); if (!job) return;
      try { adopt(growZone({ ...job, sr: SMP_SR }), ctxRef); stats.sync++; } catch (e) { stats.errors++; }
      if (typeof requestIdleCallback === 'function') requestIdleCallback(step, { timeout: 500 }); else setTimeout(step, 30);
    };
    if (typeof requestIdleCallback === 'function') requestIdleCallback(step, { timeout: 500 }); else setTimeout(step, 30);
  }
  return {
    rootOf, stats,
    /** the zone for a note: grown synchronously when `sync` (offline renders); live returns null until the worker delivers it */
    zone(ctx, kind, art, m, sync) {
      const r = rootOf(kind, m, art); const k = key(kind, art, r);
      const z = zones.get(k); if (z) return z;
      if (sync) { const nz = adopt(growZone({ kind, art, root: r, sr: SMP_SR }), ctx); stats.sync++; return nz; }
      this.prioritize([k]);
      return null;
    },
    /** keys ('str:sus:64') needed by a list of {voice, m, d} events */
    keysFor(events) {
      const ks = new Set();
      for (const e of events) {
        if (e.m == null) continue;
        const kind = e.voice === 'strings' ? 'str' : e.voice === 'horns' ? 'brass' : null; if (!kind) continue;
        ks.add(key(kind, 'sus', rootOf(kind, e.m))); ks.add(key(kind, 'stac', rootOf(kind, e.m, 'stac')));
      }
      return [...ks];
    },
    ready(keys) { return keys.every((k) => zones.has(k)); },
    prioritize(keys) {
      if (!started) return;
      const front = [];
      for (const k of keys) { if (zones.has(k)) continue; const [kind, art, root] = k.split(':'); front.push({ kind, art, root: +root }); }
      if (!front.length) return;
      const set = new Set(keys); queue = [...front, ...queue.filter((j) => !set.has(key(j.kind, j.art, j.root)))];
      pumpWorker();
    },
    startWorker,
    state() { return { zones: stats.zones, total: stats.total, sync: stats.sync, worker: stats.worker, workerOk: stats.workerOk, errors: stats.errors, growMs: Math.round(stats.ms), mb: +(stats.bytes / 1048576).toFixed(1) }; },
  };
})();

const brightOf = (vel, lo, span) => clamp((vel - lo) / span, 0, 1);
/** the two dynamic layers of a zone as looping buffer sources, crossfaded by `bright` (0 soft .. 1 loud) */
function layerPair(K, Z, n, t, end, offset) {
  const { ctx } = K;
  const rate = Math.pow(2, (n.m - Z.root) / 12);
  const gS = G(ctx, 0), gL = G(ctx, 0), mix = G(ctx, 1);
  const srcs = [[Z.soft, gS], [Z.loud, gL]].map(([buf, g]) => {
    const s = ctx.createBufferSource(); s.buffer = buf; s.playbackRate.value = rate;
    if (Z.loopEnd) { s.loop = true; s.loopStart = Z.loopStart; s.loopEnd = Z.loopEnd; }
    s.connect(g); g.connect(mix); s.start(t, Math.min(offset, Z.dur * 0.5)); s.stop(end); return s;
  });
  /** brightness automation helpers: both gains always sum to 1 (equal-RMS, phase-coherent layers) */
  const set = (v, at) => { gL.gain.setValueAtTime(v, at); gS.gain.setValueAtTime(1 - v, at); };
  const target = (v, at, tau) => { gL.gain.setTargetAtTime(v, at, tau); gS.gain.setTargetAtTime(1 - v, at, tau); };
  const ramp = (v, at) => { gL.gain.linearRampToValueAtTime(v, at); gS.gain.linearRampToValueAtTime(1 - v, at); };
  if (n.path) {
    let prev = n.f;
    for (let i = 1; i < n.path.length; i++) {
      const [sec, f] = n.path[i]; const ts = t + sec; const semis = Math.abs(12 * Math.log2(f / prev));
      for (const s of srcs) {
        const r0 = rate * prev / n.f, r1 = rate * f / n.f;
        if (semis <= 3.01 && semis > 0) { s.playbackRate.setValueAtTime(r0, ts - 0.02); s.playbackRate.exponentialRampToValueAtTime(r1, ts + 0.02); } else s.playbackRate.setValueAtTime(r1, ts);
      }
      prev = f;
    }
  }
  return { srcs, mix, set, target, ramp, gains: [gS.gain, gL.gain] };
}

// 1.1 HORN SECTION — grown brass multisamples: tongued, staggered, lip-scooped attacks; brightness rides the dynamic
VOICES.horns = (K, n, out) => {
  const short = n.art === 'staccato' || (n.art === 'marcato' && n.dur < 0.3) || n.dur < 0.16;
  const Z = Bank.zone(K.ctx, 'brass', short ? 'stac' : 'sus', n.m, K.offline);
  if (!Z) return VOICES.hornsSynth(K, n, out);
  const { ctx } = K; const { t, vel } = n;
  const b = Math.pow(brightOf(vel, 0.18, 0.74), 1.2); // p .08 · mf .47 · f .74 · ff .96
  const A = short ? 0.004 : Math.min(n.o?.attack ?? 0.012, n.dur * 0.4), D = short ? 0.05 : 0.14, S = short ? 0.9 : 0.74 + 0.16 * (1 - b), R = n.o?.rel ?? (short ? 0.12 : 0.22);
  const tOff = t + Math.max(n.dur, A + 0.01);
  const end = (short ? Math.min(t + Z.dur, tOff + R * 1.6) : tOff + R * 1.6) + 0.05;
  const peak = LEVEL.horns * vel * n.gain;
  const L = layerPair(K, Z, n, t, end, 0);
  // the brass bite: the attack flares brighter than the held tone, more so the harder it is played
  const bA = Math.min(1, b + 0.16 + 0.22 * b);
  L.set(bA, t); L.target(b * 0.94, t + 0.03, short ? 0.05 : 0.09);
  const sw = n.o?.swell ?? 1;
  if (sw > 1 && tOff > t + 0.5) { L.set(b * 0.94, t + 0.45); L.ramp(Math.min(1, b + 0.55 * (sw - 1)), tOff); }
  const lp = BQ(ctx, 'lowpass', 1200 + 1800 * b, 0.6);
  lp.frequency.setValueAtTime(1200 + 1800 * b, t);
  lp.frequency.exponentialRampToValueAtTime(16000, t + (short ? 0.03 : 0.07));
  lp.frequency.setTargetAtTime(1300 + 1800 * b, Math.max(tOff, t + 0.08), R / 3);
  lp.frequency.setValueAtTime(1300 + 1800 * b, end);
  const amp = G(ctx, 0);
  envASR(amp.gain, t, tOff, peak, A, D, S, R, sw);
  L.mix.connect(lp); lp.connect(amp);
  return finish(K, n, out, amp, end, L.srcs, [amp.gain], { peak, S });
};

// 1.3 STRINGS (section) — grown string multisamples: bow scratch, body resonances, late vibrato, swell; o.trem tremolo
VOICES.strings = (K, n, out) => {
  const trem = n.o?.trem;
  const short = !trem && (n.art === 'staccato' || n.dur < 0.14);
  const Z = Bank.zone(K.ctx, 'str', short ? 'stac' : 'sus', n.m, K.offline);
  if (!Z) return VOICES.stringsSynth(K, n, out);
  const { ctx } = K; const { t, vel } = n; const dur = n.dur;
  const b = Math.pow(brightOf(vel, 0.14, 0.8), 1.4); // p .06 · mp .26 · mf .45 · f .70 · ff .92
  // a bow change inside a line speaks quickly (the grown onset does the rest); pads and long notes still swell in slowly
  let A = n.o?.attack ?? clamp(Math.min(0.4 * (n.spb || 0.5), 0.3 * dur), 0.05, 0.45);
  A = short ? 0.004 : Math.min(A, Math.max(0.03, dur * 0.45));
  if (trem) A = 0.01;
  const D = 0.25, S = short ? 0.95 : 0.85, R = n.o?.rel ?? (short ? 0.1 : clamp(dur * 0.8, 0.18, 0.55));
  const tOff = t + Math.max(dur, A + 0.01);
  const end = (short ? Math.min(t + Z.dur, tOff + R * 1.6) : tOff + R * 1.6) + 0.05;
  const peak = LEVEL.strings * vel * n.gain;
  // a slow bow starts past the onset scratch (the sampler's start offset); a quick one keeps the bite
  const L = layerPair(K, Z, n, t, end, !short && A >= 0.15 ? 0.05 : 0);
  const bA = Math.min(1, b + (short ? 0.28 : 0.12));
  L.set(bA, t); L.target(b, t + Math.min(0.12, Math.max(0.03, A)), 0.15);
  const sw = n.o?.swell ?? (dur >= 1.2 ? 1.14 : 1);
  const tSw = t + Math.max(A + 0.4, 0.5);
  if (sw > 1 && tOff > tSw + 0.1) { L.set(b, tSw); L.ramp(Math.min(1, b + 0.9 * (sw - 1)), tOff); }
  const lp = BQ(ctx, 'lowpass', 16000, 0.5);
  if (!short && A > 0.08) { lp.frequency.setValueAtTime(1800 + 3200 * b, t); lp.frequency.exponentialRampToValueAtTime(16000, t + A); }
  lp.frequency.setTargetAtTime(2200 + 2400 * b, Math.max(tOff, t + A + 0.01), R / 3);
  lp.frequency.setValueAtTime(2200 + 2400 * b, end);
  const amp = G(ctx, 0);
  if (trem) {
    const st = trem; const pS = peak * S;
    amp.gain.setValueAtTime(0, t);
    for (let k = 0, ts = t; ts < tOff - 0.02; ts += st, k++) {
      const r = 1 + (K.rnd() * 2 - 1) * 0.12;
      amp.gain.linearRampToValueAtTime(pS * r, ts + 0.012);
      amp.gain.linearRampToValueAtTime(pS * r * 0.42, Math.min(ts + st - 0.004, tOff));
    }
    amp.gain.setTargetAtTime(0, tOff, 0.04 / 5);
  } else envASR(amp.gain, t, tOff, peak, A, D, S, R, sw);
  const sh = G(ctx, 1); K.shimmer.connect(sh.gain);
  L.mix.connect(lp); lp.connect(amp); amp.connect(sh);
  return finish(K, n, out, sh, end, L.srcs, [amp.gain], { peak, S }, () => disc(K.shimmer, sh.gain));
};

// ------------------------------------------------------------------------------------------------ reverb
export const IR_SPECS = {
  HALL: { seconds: 2.6, decayExp: 2.4, tiltHz: 7000, taps: [[11, 0.35], [17, 0.28], [23, 0.24], [31, 0.19], [43, 0.14], [59, 0.10]] },
  ROOM: { seconds: 1.1, decayExp: 3.1, tiltHz: 5200, taps: [[7, 0.40], [13, 0.30], [19, 0.22], [27, 0.15]] },
  CHAPEL: { seconds: 4.2, decayExp: 1.7, tiltHz: 4200, taps: [[23, 0.30], [37, 0.26], [53, 0.22], [71, 0.18], [97, 0.13], [127, 0.09]] },
};
const irCache = new Map();
/** Generated impulse response (MUSIC-BIBLE §2.1). Cached per name+sampleRate as raw Float32Arrays. */
export function makeIR(ctx, name) {
  const sr = ctx.sampleRate, key = name + '@' + sr;
  let data = irCache.get(key);
  if (!data) {
    const spec = IR_SPECS[name] || IR_SPECS.HALL;
    const n = Math.floor(sr * spec.seconds);
    let seed = 0x9e3779b9 ^ name.length * 7919;
    const rnd = () => { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return ((seed >>> 0) / 4294967296); };
    data = [0, 1].map((ch) => {
      const buf = new Float32Array(n); let lp = 0;
      for (let i = 0; i < n; i++) {
        const tt = i / n;
        let s = (rnd() * 2 - 1) * Math.pow(1 - tt, spec.decayExp);
        s *= 1 - 0.25 * ch;
        const fc = spec.tiltHz * (1 - 0.75 * tt);
        const a = 1 - Math.exp(-2 * Math.PI * fc / sr);
        lp += a * (s - lp);
        buf[i] = lp;
      }
      for (const [ms, g] of spec.taps) { const idx = Math.round(ms / 1000 * sr) + ch * 13; if (idx < n) buf[idx] += g * (rnd() < 0.5 ? -1 : 1); }
      let mean = 0; const W = 512, run = new Float32Array(n);
      for (let i = 0; i < n; i++) { mean += (buf[i] - mean) / W; run[i] = mean; }
      let ss = 0; for (let i = 0; i < n; i++) { buf[i] -= run[i]; ss += buf[i] * buf[i]; }
      const rms = Math.sqrt(ss / n) || 1; const k = 0.06 / rms;
      for (let i = 0; i < n; i++) buf[i] *= k;
      // fade the last 30 ms so the IR itself never clicks
      const fl = Math.floor(sr * 0.03); for (let i = 0; i < fl; i++) buf[n - 1 - i] *= i / fl;
      return buf;
    });
    irCache.set(key, data);
  }
  const b = ctx.createBuffer(2, data[0].length, sr);
  b.getChannelData(0).set(data[0]); b.getChannelData(1).set(data[1]);
  return b;
}

/**
 * Cheap reverb for quality 'low' (§2.2's job, rebuilt): four damped feedback combs at 29.7/37.1/41.3/53.9 ms, each its own
 * loop (a cross-coupled Hadamard matrix measured unstable in Chromium's cycle handling), gains set for RT60 ≈ 2.1 s
 * including the render quantum Chromium adds to every cycle, plus two early taps. Lines 1+2 → L, 3+4 → R (3 inverted).
 */
export function makeFDN(ctx) {
  const input = G(ctx, 1), output = G(ctx, 1);
  const pre = ctx.createDelay(0.1); pre.delayTime.value = 0.012; input.connect(pre);
  const q = 128 / ctx.sampleRate, RT60 = 2.1;
  const mer = ctx.createChannelMerger(2);
  [0.0297, 0.0371, 0.0413, 0.0539].forEach((d, i) => {
    const dl = ctx.createDelay(0.1); dl.delayTime.value = d;
    const lp = BQ(ctx, 'lowpass', 4500, -3);
    const fb = G(ctx, Math.pow(10, -3 * (d + q) / RT60));
    pre.connect(dl); dl.connect(lp); lp.connect(fb); fb.connect(dl);
    const o = G(ctx, (i === 2 ? -1 : 1) * 0.16); lp.connect(o); o.connect(mer, 0, i < 2 ? 0 : 1);
  });
  [[0.019, 0.22, 0], [0.027, 0.18, 1]].forEach(([d, g, ch]) => { const t = ctx.createDelay(0.1); t.delayTime.value = d; const tg = G(ctx, g); pre.connect(t); t.connect(tg); tg.connect(mer, 0, ch); });
  mer.connect(output);
  return { input, output };
}
