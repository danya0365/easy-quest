/**
 * sfx.js — every sound effect in the game, synthesised live. No samples.        (P28)
 *
 *   Sfx.play(id, {vol, pitch, pan, variant, delay, send, ...soundOpts}) -> handle {id, stop(ms)} | null
 *   Sfx.list()                 -> string[] of canonical ids
 *   Sfx.groups()               -> [{group, ids:[{id, bus, desc, loop}]}]   (for sound boards / settings)
 *   Sfx.render(id, seconds, {variant, every, vol, pitch}) -> Promise<AudioBuffer>  (same graph, offline)
 *   Sfx.renderInto(id, dest, t, opts)  schedule one play into an Audio.renderOffline dest at time t (true-mix renders,
 *                              e.g. battle music on the music bus with hits landing on it; ducks included)
 *   Sfx.ambience(id|null, {fade}) crossfade the one ambience bed (amb_meadow|amb_town|amb_cave|amb_night). A bed is a
 *                              chain of 3 differently seeded variants of a seamless loop, crossfaded, so it never
 *                              repeats exactly (render(id, s, {single:true}) renders one variant looped, for seams)
 *   Sfx.glyph(charId)          text tick in that speaker's voice (rate-limited; call once per typed glyph). Holds the
 *                              music down while text types (the typing duck, 0.7); Sfx.textDone() lets it go at once
 *   Sfx.state()                -> {voices, last:[ids], ambience, played}
 *
 * Every play re-rolls small pitch / level / filter / timing offsets from `variant` (or Math.random when
 * omitted) so repeats never sound robotic. Aliases: gold, whoosh, search, footstep {material}, text {voice}.
 *
 * Menu blips (cursor, confirm, cancel, buzzer) sit at music level, 5+ LU under a hit, and dip the music ~3 dB for 15 ms;
 * glyph ticks a little under them. See MENU & TEXT.
 *
 * Impacts (sword_hit, sword_crit, monster_hurt, player_hurt) open on a sharp, flat-topped snap that peaks 1 ms in,
 * ~9-10 dB over a body that is each one's own pitched sound and falls 10 dB within ~25-37 ms; see BATTLE below. Each
 * schedules a sample-accurate dip on the music bus (`pulse`: ~9 dB for 20 ms, back over 150 ms) so it lands ~6 LU on
 * top of the battle theme.
 */
import { Audio, mulberry32, clamp, reportError, makeIR, retainNodes, _rendering } from './audio.js';

// ---------------------------------------------------------------------------------------------------------------
// tiny music helpers
const SEMI = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
export function nf(name) {
  const m = /^([A-G])([#b]?)(-?\d)$/.exec(name);
  if (!m) return 440;
  const midi = (Number(m[3]) + 1) * 12 + SEMI[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
  return 440 * Math.pow(2, (midi - 69) / 12);
}
function hashStr(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }

// partial sets: [ratio, gain, decayMultiplier, cents]
const CELESTA = [[1, 1, 1], [4.02, 0.3, 0.33], [10.1, 0.08, 0.2]];
const GLINT = [[1, 1, 1], [2.76, 0.5, 0.6], [5.4, 0.25, 0.4]];
const MUSICBOX = [[1, 1, 1], [2, 0.12, 0.5], [3.98, 0.22, 0.3], [6.1, 0.05, 0.2]];
const COIN = [[1, 1, 1], [2.76, 0.55, 0.7], [5.4, 0.3, 0.45], [8.93, 0.12, 0.3]];

// ---------------------------------------------------------------------------------------------------------------
// per-context caches: noise buffers and band-limited pulse waves
const caches = new WeakMap();
function cacheFor(ctx) { ctx = ctx.real || ctx; let c = caches.get(ctx); if (!c) caches.set(ctx, c = { noise: {}, waves: {}, curves: {} }); return c; }
/**
 * Peak shaver for impacts: exactly linear below `knee`, a smooth tanh shoulder above it, never past 1. The input is
 * pre-scaled by 1/range so signals up to `range` are shaped (a WaveShaper clamps its input to ±1).
 */
function kneeCurve(ctx, knee, range) {
  const c = cacheFor(ctx), key = `k${knee.toFixed(2)}|${range}`;
  if (c.curves[key]) return c.curves[key];
  const N = 4097, cv = new Float32Array(N), room = 1 - knee;
  for (let i = 0; i < N; i++) {
    const x = ((i / (N - 1)) * 2 - 1) * range, ax = Math.abs(x);
    cv[i] = Math.sign(x) * (ax <= knee ? ax : knee + room * Math.tanh((ax - knee) / room));
  }
  return (c.curves[key] = cv);
}
/** tanh saturation curve, normalised so full scale stays full scale: the crunch in a crack. */
function driveCurve(ctx, drive) {
  const c = cacheFor(ctx), key = drive.toFixed(2);
  if (c.curves[key]) return c.curves[key];
  const N = 2049, cv = new Float32Array(N), norm = Math.tanh(drive);
  for (let i = 0; i < N; i++) { const x = (i / (N - 1)) * 2 - 1; cv[i] = Math.tanh(x * drive) / norm; }
  return (c.curves[key] = cv);
}

/** A stand-in context that records every node a voice creates, so the voice's whole graph stays referenced
 *  (by the voice, which lives in `active`) until it has finished sounding. */
const REC_METHODS = ['createGain', 'createOscillator', 'createBufferSource', 'createBiquadFilter', 'createStereoPanner', 'createConvolver', 'createDelay', 'createWaveShaper'];
function recorder(ctx, keep) {
  const r = {
    real: ctx,
    get currentTime() { return ctx.currentTime; },
    get sampleRate() { return ctx.sampleRate; },
    get destination() { return ctx.destination; },
    createBuffer: (...a) => ctx.createBuffer(...a),
    createPeriodicWave: (...a) => ctx.createPeriodicWave(...a),
  };
  for (const m of REC_METHODS) r[m] = (...a) => { const n = ctx[m](...a); keep.push(n); return n; };
  return r;
}

/** Seamlessly looping noise (the last X samples are crossfaded into the first X so the wrap never clicks). */
function makeNoise(ctx, color, samples, seed) {
  const X = Math.min(2048, Math.floor(samples / 4));
  const tmp = new Float32Array(samples + X);
  const r = mulberry32(seed);
  if (color === 'pink') {
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (let i = 0; i < tmp.length; i++) {
      const w = r() * 2 - 1;
      b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759; b2 = 0.969 * b2 + w * 0.153852;
      b3 = 0.8665 * b3 + w * 0.3104856; b4 = 0.55 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.016898;
      tmp[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11; b6 = w * 0.115926;
    }
  } else if (color === 'brown') {
    let last = 0;
    for (let i = 0; i < tmp.length; i++) { const w = r() * 2 - 1; last = (last + 0.02 * w) / 1.02; tmp[i] = last * 3.5; }
  } else {
    for (let i = 0; i < tmp.length; i++) tmp[i] = r() * 2 - 1;
  }
  const buf = ctx.createBuffer(1, samples, ctx.sampleRate);
  const d = buf.getChannelData(0);
  d.set(tmp.subarray(0, samples));
  for (let i = 0; i < X; i++) { const k = i / X; d[i] = d[i] * k + tmp[samples + i] * (1 - k); }
  return buf;
}
function getNoise(ctx, color) {
  const c = cacheFor(ctx);
  return c.noise[color] || (c.noise[color] = makeNoise(ctx, color, Math.floor(ctx.sampleRate * 2.5), hashStr(color)));
}
function getWave(ctx, name) {
  const c = cacheFor(ctx);
  if (c.waves[name]) return c.waves[name];
  const H = 40, re = new Float32Array(H + 1), im = new Float32Array(H + 1);
  for (let n = 1; n <= H; n++) {
    const sigma = Math.sin(Math.PI * n / (H + 1)) / (Math.PI * n / (H + 1)); // Lanczos: rounds off the harsh edge
    if (name === 'pulse25' || name === 'pulse12') {
      const D = name === 'pulse25' ? 0.25 : 0.125;
      re[n] = (2 / (n * Math.PI)) * Math.sin(n * Math.PI * D) * sigma;
    } else if (name === 'softsq') {
      im[n] = n % 2 ? (1 / Math.pow(n, 1.5)) * sigma : 0;
    }
  }
  return (c.waves[name] = ctx.createPeriodicWave(re, im, { disableNormalization: false }));
}
const CUSTOM_WAVES = { pulse25: 1, pulse12: 1, softsq: 1 };

// ---------------------------------------------------------------------------------------------------------------
// the voice environment: one per play
function makeEnv(realCtx, busNode, sendNode, d, opts, rng, T) {
  const keep = [];
  const ctx = recorder(realCtx.real || realCtx, keep);
  const E = { ctx, keep, t: T, r: rng, end: T, srcs: [], d, opts, sr: ctx.sampleRate, post: null };
  E.rr = (a, b) => a + (b - a) * rng();
  E.pick = (arr) => arr[Math.floor(rng() * arr.length) % arr.length];
  // d.detune (cents) moves a whole sound off the tempered scale: see MENU & TEXT
  const semis = (opts.pitch != null && opts.pitch > 0 ? 12 * Math.log2(opts.pitch) : 0) + (rng() * 2 - 1) * (d.pj ?? 0.3) + (d.detune ?? 0) / 100;
  E.P = Math.pow(2, semis / 12);
  E.fj = 1 + (rng() * 2 - 1) * (d.fj ?? 0.07);
  E.tj = d.tj ?? 0.004;
  const vol = (opts.vol ?? 1) * (d.gain ?? 1) * (1 + (rng() * 2 - 1) * (d.vj ?? 0.06));
  // The voice sum is fixed at two channels. Left in the default 'max' mode it went stereo only while some layer had
  // its own panner running, so the whole voice jumped +3 dB (the env panner passes stereo at unity but pans mono
  // equal-power) and dropped back when that layer finished. settleLevel() keeps each voice at its old onset level.
  const out = ctx.createGain(); out.gain.value = vol; stereo(out);
  const pan = ctx.createStereoPanner();
  pan.pan.value = clamp((opts.pan ?? d.pan ?? 0) + (rng() * 2 - 1) * (d.panj ?? 0), -1, 1);
  if (d.sat) {
    // impacts: the summed voice through a peak shaver (linear below the knee, so decays stay decays; only the
    // top few dB are rounded off), trimmed above 9 kHz so the shoulder never adds fizz
    const R = 4, pre = ctx.createGain(); pre.gain.value = 1 / R;
    const ws = ctx.createWaveShaper(); ws.curve = kneeCurve(ctx, d.sat, R); ws.oversample = '4x';
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = Math.min(9000, E.sr * 0.45); lp.Q.value = 0.5;
    const mk = ctx.createGain(); mk.gain.value = d.satOut ?? 1; stereo(mk);
    out.connect(pre); pre.connect(ws); ws.connect(lp); lp.connect(mk); mk.connect(pan);
    E.satOut = mk;
    // transients that must stay sharp skip the saturator: route them `to: E.post`
    E.post = ctx.createGain(); E.post.gain.value = vol; stereo(E.post); E.post.connect(pan);
  } else out.connect(pan);
  pan.connect(busNode);
  const sendAmt = (d.send ?? 0) * (opts.send ?? 1);
  let sg = null;
  if (sendNode && sendAmt > 0) { sg = ctx.createGain(); sg.gain.value = sendAmt; pan.connect(sg); sg.connect(sendNode); }
  const dry = ctx.createGain(); dry.gain.value = vol; dry.connect(busNode);
  E.out = out; E.panNode = pan; E.sendGain = sg; E.dry = dry;
  if (!E.post) E.post = out;
  E.nodes = [out, pan, dry, sg, E.post].filter(Boolean);
  E.every = (e, fn) => fn(e);
  return E;
}

const stereo = (node) => { node.channelCount = 2; node.channelCountMode = 'explicit'; node.channelInterpretation = 'speakers'; return node; };
/** After a voice is built: one with no panned layer of its own reached the env panner as mono (-3 dB); keep that level. */
function settleLevel(E) {
  const panned = E.keep.some((n) => n !== E.panNode && n && n.constructor && n.constructor.name === 'StereoPannerNode');
  if (panned) return;
  // after the saturator, never before it: the shaper must keep seeing the level it was tuned on
  (E.satOut || E.out).gain.value *= Math.SQRT1_2;
  if (E.post !== E.out) E.post.gain.value *= Math.SQRT1_2;
}

const clampF = (E, f) => clamp(f, 10, E.sr * 0.48);

function envelope(p, T, o, peak) {
  const a = Math.max(0.0008, o.a ?? 0.002), h = o.h ?? 0, d = Math.max(0.006, o.d ?? 0.1);
  peak = Math.max(1e-4, peak);
  p.setValueAtTime(0, T);
  p.linearRampToValueAtTime(peak, T + a);
  let t = T + a;
  if (h > 0) { t += h; p.setValueAtTime(peak, t); }
  if (o.s) {
    const sl = Math.max(1e-4, peak * o.s);
    t += d; p.exponentialRampToValueAtTime(sl, t);
    t += Math.max(0, o.sd ?? 0.1); p.setValueAtTime(sl, t);
    const r = Math.max(0.006, o.r ?? 0.08);
    t += r; p.exponentialRampToValueAtTime(peak * 5e-4, t);
  } else {
    t += d; p.exponentialRampToValueAtTime(peak * 5e-4, t);
  }
  p.linearRampToValueAtTime(0, t + 0.004);
  return t + 0.004;
}

function filt(E, T, spec) {
  const f = E.ctx.createBiquadFilter();
  f.type = spec.type || 'lowpass';
  const k = (spec.track ? E.P : 1) * (spec.nojit ? 1 : E.fj);
  f.frequency.setValueAtTime(clampF(E, spec.f * k), T);
  if (spec.f1 != null) f.frequency.exponentialRampToValueAtTime(clampF(E, spec.f1 * k), T + (spec.ft ?? 0.1));
  if (spec.fp) for (const [dt, fr] of spec.fp) f.frequency.exponentialRampToValueAtTime(clampF(E, fr * k), T + dt);
  f.Q.value = spec.Q ?? (f.type === 'lowpass' || f.type === 'highpass' ? 0.707 : 1);
  if (spec.gain != null) f.gain.value = spec.gain;
  return f;
}

function lfoInto(E, param, T, end, rate, depth, type = 'sine', delay = 0) {
  const ctx = E.ctx, l = ctx.createOscillator(), lg = ctx.createGain();
  l.type = type; l.frequency.value = rate;
  if (delay > 0) { lg.gain.setValueAtTime(0, T); lg.gain.setValueAtTime(0, T + delay); lg.gain.linearRampToValueAtTime(depth, T + delay + 0.08); }
  else lg.gain.setValueAtTime(depth, T);
  l.connect(lg); lg.connect(param);
  l.start(T); l.stop(end + 0.02);
  E.srcs.push(l);
}

/** chain: filters -> AM stages -> amp -> (pan) -> destination. Returns amp GainNode. */
function chain(E, src, T, o) {
  const ctx = E.ctx;
  let node = src;
  for (const spec of (o.filters || (o.filter ? [o.filter] : []))) { const f = filt(E, T, spec); node.connect(f); node = f; }
  if (o.drive) {
    const pre = ctx.createGain(); pre.gain.value = o.driveIn ?? 1;
    // oversampling costs ~2 ms of latency in Chrome: impact layers pass os:'none' so they stay sample-aligned
    const ws = ctx.createWaveShaper(); ws.curve = driveCurve(ctx, o.drive); ws.oversample = o.os ?? '2x';
    node.connect(pre); pre.connect(ws); node = ws;
    for (const spec of (o.post || [])) { const f = filt(E, T, spec); node.connect(f); node = f; }
  }
  const amp = ctx.createGain();
  node.connect(amp);
  let dst = o.to || E.out;
  if (o.pan != null || o.panSweep) {
    const pn = ctx.createStereoPanner();
    if (o.panSweep) { pn.pan.setValueAtTime(clamp(o.panSweep[0], -1, 1), T); pn.pan.linearRampToValueAtTime(clamp(o.panSweep[1], -1, 1), T + o.panSweep[2]); }
    else pn.pan.value = clamp(o.pan, -1, 1);
    pn.connect(dst); dst = pn;
  }
  let head = dst;
  const ams = o.am ? (Array.isArray(o.am) ? o.am : [o.am]) : [];
  for (let i = ams.length - 1; i >= 0; i--) {
    const g = ctx.createGain(); const depth = clamp(ams[i].depth ?? 0.5, 0, 1);
    g.gain.value = 1 - depth / 2; g.connect(head); head = g;
    ams[i]._node = g; ams[i]._depth = depth;
  }
  amp.connect(head);
  return { amp, ams };
}

function track(E, src, end) { E.srcs.push(src); if (end > E.end) E.end = end; }

/** An oscillator voice with pitch path, filters, vibrato, tremolo and an envelope. Returns its end time. */
export function tone(E, o) {
  const ctx = E.ctx, T = E.t + (o.t || 0);
  const osc = ctx.createOscillator();
  if (CUSTOM_WAVES[o.type]) osc.setPeriodicWave(getWave(ctx, o.type)); else osc.type = o.type || 'sine';
  const P = o.fixed ? 1 : E.P;
  osc.frequency.setValueAtTime(clampF(E, o.f * P), T);
  if (o.f1 != null) osc.frequency.exponentialRampToValueAtTime(clampF(E, o.f1 * P), T + (o.ft ?? 0.1));
  if (o.fp) for (const [dt, fr] of o.fp) osc.frequency.exponentialRampToValueAtTime(clampF(E, fr * P), T + dt);
  if (o.cents) osc.detune.value = o.cents;
  const { amp, ams } = chain(E, osc, T, o);
  const end = o.bed ? T + (o.bedDur || 1) : envelope(amp.gain, T, o, o.g ?? 0.5);
  if (o.bed) amp.gain.value = o.g ?? 0.5;
  if (o.vib) lfoInto(E, osc.detune, T, end, o.vib.rate, o.vib.depth, 'sine', o.vib.delay || 0);
  for (const am of ams) lfoInto(E, am._node.gain, T, end, am.rate, am._depth / 2, am.type || 'sine');
  osc.start(T); osc.stop(end + 0.01);
  track(E, osc, end + 0.01);
  return end;
}

/** A noise voice (white/pink/brown) through filters with an envelope. Returns its end time. */
export function noise(E, o) {
  const ctx = E.ctx, T = E.t + (o.t || 0);
  const src = ctx.createBufferSource();
  const bed = !!o.bed;
  src.buffer = bed ? E.loopNoise(o.color || 'pink') : getNoise(ctx, o.color || 'white');
  src.loop = true;
  if (o.rate) src.playbackRate.value = o.rate;
  const { amp, ams } = chain(E, src, T, o);
  let end;
  if (bed) { amp.gain.value = o.g ?? 0.3; end = T + E.W + E.L; }
  else end = envelope(amp.gain, T, o, o.g ?? 0.5);
  for (const am of ams) lfoInto(E, am._node.gain, T, end, am.rate, am._depth / 2, am.type || 'sine');
  src.start(T, bed ? 0 : E.r() * (src.buffer.duration - 0.6));
  src.stop(end + 0.01);
  track(E, src, end + 0.01);
  return end;
}

/** Additive bell / chime: sine partials that each decay at their own rate. */
export function bell(E, o) {
  const ctx = E.ctx;
  let to = o.to;
  if (o.pan != null) { const pn = ctx.createStereoPanner(); pn.pan.value = clamp(o.pan, -1, 1); pn.connect(o.to || E.out); to = pn; }
  const lim = Math.min(12000, E.sr * 0.45);
  let end = E.t;
  for (const [ratio, pg, dm = 1, cents = 0] of (o.partials || GLINT)) {
    const f = o.f * ratio * (o.fixed ? 1 : E.P);
    if (f > lim) continue;
    end = Math.max(end, tone(E, { t: o.t, type: 'sine', f: o.f * ratio, fixed: o.fixed, cents, a: o.a ?? 0.0015, d: (o.d ?? 0.4) * dm, g: (o.g ?? 0.2) * pg, to }));
  }
  return end;
}

/** A spray of tiny band-passed noise ticks (grit, crackle, crunch, rummage). */
export function grains(E, o) {
  for (let i = 0; i < o.count; i++) {
    const t = (o.t || 0) + (o.even ? (i * o.span) / o.count : E.r() * o.span);
    noise(E, {
      t, color: o.color || 'white', a: 0.0008, d: E.rr(o.dLo, o.dHi), g: E.rr(o.gLo, o.gHi) * (o.fade ? 1 - (t - (o.t || 0)) / (o.span * 1.3) : 1),
      filters: [{ type: 'bandpass', f: E.rr(o.fLo, o.fHi), Q: o.Q ?? 1, nojit: true }],
      pan: o.panj ? E.rr(-o.panj, o.panj) : o.pan, to: o.to,
    });
  }
}

/** Stick-slip hinge creak: a slow sawtooth pulse train ringing wooden resonances, with a wobbly rate. */
export function creak(E, o) {
  const ctx = E.ctx, T = E.t + (o.t || 0), dur = o.dur || 0.3;
  const osc = ctx.createOscillator(); osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(o.f, T);
  osc.frequency.linearRampToValueAtTime(o.f1 ?? o.f * 1.4, T + dur * 0.6);
  osc.frequency.linearRampToValueAtTime((o.f1 ?? o.f) * 0.85, T + dur);
  const sum = ctx.createGain(); sum.gain.value = 1;
  for (const rf of (o.res || [800])) {
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = rf * E.fj; bp.Q.value = o.Q ?? 7;
    osc.connect(bp); bp.connect(sum);
  }
  const amp = ctx.createGain();
  sum.connect(amp);
  let dst = o.to || E.out;
  if (o.pan != null) { const pn = ctx.createStereoPanner(); pn.pan.value = o.pan; pn.connect(dst); dst = pn; }
  amp.connect(dst);
  const end = envelope(amp.gain, T, { a: Math.min(0.04, dur * 0.2), h: dur * 0.45, d: dur * 0.45 }, o.g ?? 0.3);
  lfoInto(E, osc.frequency, T, end, 7.3, (o.f || 40) * 0.18);
  lfoInto(E, osc.frequency, T, end, 13.1, (o.f || 40) * 0.1);
  osc.start(T); osc.stop(end + 0.01);
  track(E, osc, end + 0.01);
  return end;
}

/** A handful of little pentatonic twinkles scattered in time and stereo. */
export function sparkle(E, o) {
  const pent = [0, 2, 4, 7, 9];
  for (let i = 0; i < o.n; i++) {
    const t = (o.t || 0) + E.r() * o.span;
    const base = o.fLo * Math.pow(2, E.r() * Math.log2(o.fHi / o.fLo));
    const midi = Math.round(69 + 12 * Math.log2(base / 440));
    let m = midi; while (!pent.includes(((m - 2) % 12 + 12) % 12)) m--; // snap into D major pentatonic
    bell(E, { t, f: 440 * Math.pow(2, (m - 69) / 12), g: (o.g ?? 0.05) * E.rr(0.5, 1), d: E.rr(0.15, 0.35), pan: E.rr(-0.6, 0.6), partials: [[1, 1, 1], [4.02, 0.22, 0.35]] });
  }
}

// ---------------------------------------------------------------------------------------------------------------
// the registry
const DEFS = new Map();
const ORDER = [];
function S(id, meta, fn) { DEFS.set(id, { id, bus: 'sfx', gain: 1, ...meta, fn }); ORDER.push(id); }
const ALIASES = {
  gold: 'gold_coins', coins: 'gold_coins', whoosh: 'miss', search: 'pot_search', thud: 'bump_wall', bump: 'bump_wall',
  chest: 'chest_open', door: 'door_open', locked: 'door_locked', bell: 'save_church_bell', save: 'save_church_bell',
  cast: 'spell_cast', crit: 'sword_crit', hit: 'sword_hit', defeat: 'monster_defeat', poof: 'monster_defeat',
  levelup: 'level_up_sparkle', inn: 'inn_sleep', wagon: 'wagon_rattle', run: 'flee', flee_fail: 'run_away_fail',
  back: 'cancel', ok: 'confirm', move: 'cursor', cant: 'buzzer', error: 'buzzer',
};
function resolve(id, opts = {}) {
  if (DEFS.has(id)) return DEFS.get(id);
  if (id === 'footstep' || id === 'step') return DEFS.get('footstep_' + (opts.material || 'grass')) || DEFS.get('footstep_grass');
  if (id === 'text' || id === 'glyph') return DEFS.get('text_' + (opts.voice || 'high')) || DEFS.get('text_high');
  if (ALIASES[id]) return DEFS.get(ALIASES[id]);
  return null;
}

// =================================================================================================================
// MENU & TEXT  (ui / voice buses) — bright, short, chunky, the same every time give or take a hair
// LEVEL: a child presses these hundreds of times, over the music, so they sit right up AT music level: cursor, confirm,
// cancel and buzzer peak at about -18 LUFS over 100 ms (the town / battle themes' median is -17 to -19.5), 5+ LU
// under a sword hit (-12.8), with their energy packed into the first 50 ms so each one is a clear "tick" on top of the
// score, not a smear. Each dips the music ~3 dB for 15 ms under its attack (`pulse`), like the hits. A glyph tick sits
// a little under a blip (a line types 35 of them a second, so the running stream lands at about music level), and
// while text types the music ducks (Sfx.glyph), so the chatter always reads. `__DQ.uiCheck()` on the P28 page measures it.
// PITCH: blips and ticks sit a third of a semitone off the tempered scale (`detune`). Too short to hear as out of tune,
// but a tick exactly on a note the score is holding (a G6 tick under a town theme in D) partly cancels against it:
// measured, the same tick lifted the town theme 1.0-1.6 LU on G6 and 2.9-3.6 LU 3% either side.
const BLIP_DIP = [0.7, 0.002, 0.015, 0.05], OFF_SCALE = 35;
S('cursor', { group: 'Menu & text', bus: 'ui', detune: OFF_SCALE, gain: 1.7, pj: 0.08, vj: 0.05, fj: 0.03, minGap: 0.022, poly: 3, pulse: BLIP_DIP, desc: 'menu cursor blip' }, (E) => {
  tone(E, { type: 'pulse25', f: 1318.5, f1: 1245, ft: 0.025, a: 0.001, d: 0.06, g: 0.24, filter: { type: 'lowpass', f: 4400, f1: 2000, ft: 0.04, Q: 0.6 } });
  tone(E, { type: 'sine', f: 1318.5, f1: 1260, ft: 0.025, a: 0.001, d: 0.07, g: 0.34 });
  tone(E, { type: 'triangle', f: 659.3, a: 0.001, d: 0.035, g: 0.2 });
  // a hair of "tk" on the front, so the blip lands like a key, not a whistle
  noise(E, { a: 0.0005, d: 0.006, g: 0.08, filters: [{ type: 'bandpass', f: 3200, Q: 1.2, nojit: true }] });
});

S('confirm', { group: 'Menu & text', bus: 'ui', detune: OFF_SCALE, gain: 1.1, pj: 0.08, vj: 0.05, fj: 0.03, minGap: 0.04, poly: 2, pulse: BLIP_DIP, desc: 'pick it! (with a thunk)' }, (E) => {
  tone(E, { type: 'pulse25', f: 1174.7, a: 0.001, d: 0.045, g: 0.19, filter: { type: 'lowpass', f: 4200, Q: 0.5 } });
  tone(E, { type: 'sine', f: 1174.7, a: 0.001, d: 0.05, g: 0.32 });
  tone(E, { t: 0.036, type: 'pulse25', f: 1760, a: 0.001, d: 0.1, g: 0.12, filter: { type: 'lowpass', f: 4800, f1: 2200, ft: 0.1, Q: 0.5 } });
  tone(E, { t: 0.036, type: 'sine', f: 1760, a: 0.001, d: 0.12, g: 0.2 });
  // the thunk: a round low knock, driven a touch so its upper harmonics still thunk on a telly speaker
  tone(E, { type: 'sine', f: 190, f1: 92, ft: 0.06, a: 0.001, d: 0.08, g: 0.5, drive: 1.8, driveIn: 1.6, post: [{ type: 'lowpass', f: 1400, nojit: true }] });
  noise(E, { a: 0.0008, d: 0.016, g: 0.12, filters: [{ type: 'lowpass', f: 1800 }] });
});

S('cancel', { group: 'Menu & text', bus: 'ui', detune: OFF_SCALE, gain: 1.47, pj: 0.08, vj: 0.05, fj: 0.03, minGap: 0.04, poly: 2, pulse: BLIP_DIP, desc: 'back out, softly' }, (E) => {
  tone(E, { type: 'triangle', f: 987.8, a: 0.001, h: 0.008, d: 0.04, g: 0.3 });
  tone(E, { type: 'pulse25', f: 987.8, a: 0.001, h: 0.006, d: 0.032, g: 0.15, filter: { type: 'lowpass', f: 3400 } });
  noise(E, { a: 0.0005, d: 0.006, g: 0.07, filters: [{ type: 'bandpass', f: 2800, Q: 1.2, nojit: true }] });
  tone(E, { t: 0.038, type: 'triangle', f: 659.3, f1: 622, ft: 0.09, a: 0.001, d: 0.1, g: 0.32 });
  tone(E, { t: 0.038, type: 'pulse25', f: 659.3, f1: 622, ft: 0.09, a: 0.001, d: 0.07, g: 0.1, filter: { type: 'lowpass', f: 2600 } });
  tone(E, { t: 0.038, type: 'sine', f: 160, f1: 110, ft: 0.05, d: 0.05, g: 0.22 });
});

// "bu-bup": a low, buzzy no. Two slightly detuned buzzes beat against each other (~9 Hz roughness), and the tone lives
// in its harmonics (a nasal 700-1100 Hz band), not in a sub, so a telly speaker plays all of it.
S('buzzer', { group: 'Menu & text', bus: 'ui', gain: 0.88, pj: 0.05, vj: 0.04, minGap: 0.2, poly: 1, pulse: BLIP_DIP, desc: "can't do that — bu-bup" }, (E) => {
  for (const [t, k] of [[0, 1], [0.12, 0.9]]) {
    tone(E, { t, type: 'sawtooth', f: 146.8, a: 0.004, h: 0.06, d: 0.035, g: 0.3 * k, filters: [{ type: 'lowpass', f: 2200, Q: 0.6, nojit: true }, { type: 'peaking', f: 900, Q: 1, gain: 7, nojit: true }, { type: 'highpass', f: 260, Q: 0.7, nojit: true }] });
    tone(E, { t, type: 'softsq', f: 155.6, a: 0.004, h: 0.06, d: 0.035, g: 0.34 * k, filters: [{ type: 'lowpass', f: 1800, Q: 0.7, nojit: true }, { type: 'highpass', f: 260, Q: 0.7, nojit: true }] });
    tone(E, { t, type: 'sine', f: 155.6, a: 0.004, h: 0.06, d: 0.035, g: 0.05 * k });
  }
});

// Glyph ticks: a tactile "tk" (a flick of band-passed noise) on a short pitched body that holds ~6 ms before it falls,
// ~20 ms of energy in all. Never a bare sine: a pure tone at a pitch the score is playing can cancel against it.
S('text_high', { group: 'Menu & text', bus: 'voice', detune: OFF_SCALE + 5, gain: 1.2, pj: 0.12, vj: 0.1, fj: 0.02, minGap: 0.018, poly: 3, desc: 'glyph tick — light voices (Willow, Sera, children)' }, (E) => {
  noise(E, { a: 0.0005, d: 0.007, g: 0.14, filters: [{ type: 'bandpass', f: 2600, Q: 1, nojit: true }] });
  tone(E, { type: 'sine', f: 1568, a: 0.001, h: 0.005, d: 0.028, g: 0.3 });
  tone(E, { type: 'pulse25', f: 1568, a: 0.001, h: 0.005, d: 0.02, g: 0.11, filter: { type: 'lowpass', f: 4000 } });
  tone(E, { type: 'triangle', f: 784, a: 0.001, d: 0.016, g: 0.12 });
});

S('text_low', { group: 'Menu & text', bus: 'voice', detune: OFF_SCALE + 5, gain: 1.38, pj: 0.12, vj: 0.1, fj: 0.02, minGap: 0.018, poly: 3, desc: 'glyph tick — deep voices (Halvard, Barty, the Bishop)' }, (E) => {
  noise(E, { a: 0.0005, d: 0.008, g: 0.14, filters: [{ type: 'bandpass', f: 1500, Q: 1, nojit: true }] });
  tone(E, { type: 'triangle', f: 392, a: 0.001, h: 0.006, d: 0.036, g: 0.36 });
  tone(E, { type: 'pulse25', f: 392, a: 0.001, h: 0.005, d: 0.026, g: 0.16, filter: { type: 'lowpass', f: 2400 } });
  tone(E, { type: 'sine', f: 784, a: 0.001, d: 0.022, g: 0.14 });
});

// Monsters gabble: every glyph a little rising "bwip" through a vowel that opens (a moving formant), at a random pitch,
// so it never sounds like a person's tick.
S('text_monster', { group: 'Menu & text', bus: 'voice', gain: 2.2, pj: 1.6, vj: 0.14, minGap: 0.018, poly: 3, desc: 'glyph tick — monster gabble (Bobble, Pip)' }, (E) => {
  const fp = [[0.018, 470], [0.045, 390]];
  noise(E, { a: 0.0006, d: 0.008, g: 0.1, filters: [{ type: 'bandpass', f: 1200, Q: 1, nojit: true }] });
  tone(E, { type: 'pulse25', f: 250, fp, a: 0.003, h: 0.004, d: 0.05, g: 0.34, filters: [{ type: 'bandpass', f: 700, fp: [[0.03, 1700]], Q: 2.2 }] });
  tone(E, { type: 'sine', f: 250, fp, a: 0.003, d: 0.045, g: 0.3 });
  tone(E, { type: 'sine', f: 1500, f1: 2300, ft: 0.02, a: 0.002, d: 0.02, g: 0.07 });
});

S('map_open', { group: 'Menu & text', bus: 'ui', gain: 1.0, send: 0.12, pj: 0.3, desc: 'unfold the map' }, (E) => {
  for (const [t, g] of [[0, 0.5], [0.07, 0.42], [0.15, 0.36]]) {
    grains(E, { t, span: 0.05, count: 9, fLo: 2500, fHi: 6000, Q: 1.4, dLo: 0.004, dHi: 0.012, gLo: g * 0.25, gHi: g * 0.8 });
    noise(E, { t, a: 0.006, d: 0.07, g: g * 0.35, filters: [{ type: 'bandpass', f: 1800, f1: 900, ft: 0.06, Q: 0.7 }] });
  }
  bell(E, { t: 0.2, f: 1174.7, g: 0.14, d: 0.6, partials: CELESTA });
  bell(E, { t: 0.26, f: 1760, g: 0.12, d: 0.7, partials: CELESTA });
});

// =================================================================================================================
// FIELD
S('door_open', { group: 'Field', gain: 1.07, send: 0.07, pj: 0.6, desc: 'latch, creak, swing, bump' }, (E) => {
  noise(E, { a: 0.0008, d: 0.02, g: 0.5, filters: [{ type: 'bandpass', f: 3200, Q: 2 }] });
  tone(E, { type: 'square', f: 1850, a: 0.0008, d: 0.012, g: 0.05, filter: { type: 'lowpass', f: 5000 } });
  tone(E, { t: 0.012, type: 'sine', f: 420, f1: 300, ft: 0.03, d: 0.045, g: 0.25 });
  creak(E, { t: 0.05, dur: 0.34, f: 34, f1: 58, g: 0.55, res: [760, 1480], Q: 7 });
  noise(E, { t: 0.05, color: 'pink', a: 0.12, d: 0.3, g: 0.1, filters: [{ type: 'bandpass', f: 520, Q: 0.7 }] });
  // the bump as it swings to: a low thud, driven so its harmonics carry it on a small speaker, and a wooden knock
  tone(E, { t: 0.43, type: 'sine', f: 120, f1: 70, ft: 0.08, d: 0.14, g: 0.3, drive: 2.2, driveIn: 1.4, post: [{ type: 'lowpass', f: 1100, nojit: true }] });
  tone(E, { t: 0.43, type: 'triangle', f: 260, f1: 180, ft: 0.05, a: 0.001, d: 0.07, g: 0.2 });
  noise(E, { t: 0.43, a: 0.001, d: 0.05, g: 0.4, filters: [{ type: 'bandpass', f: 650, Q: 1.2 }, { type: 'lowpass', f: 1500, nojit: true }] });
});

S('door_locked', { group: 'Field', gain: 1.32, send: 0.05, pj: 0.5, desc: "rattle rattle — it won't budge" }, (E) => {
  [0, 0.075, 0.15].forEach((t, i) => {
    t += E.rr(-0.006, 0.006);
    noise(E, { t, a: 0.0008, d: 0.03, g: 0.45 - i * 0.08, filters: [{ type: 'bandpass', f: 2400, Q: 3 }] });
    tone(E, { t, type: 'sine', f: 1320 * E.rr(0.97, 1.03), a: 0.0008, d: 0.025, g: 0.07 });
    // the door shaking in its frame: a knock with its harmonics (the "dk" a telly still plays)
    tone(E, { t, type: 'sine', f: 170, f1: 130, ft: 0.03, d: 0.05, g: 0.2, drive: 2, driveIn: 1.4, post: [{ type: 'lowpass', f: 1200, nojit: true }] });
    noise(E, { t, a: 0.0008, d: 0.03, g: 0.22 - i * 0.04, filters: [{ type: 'bandpass', f: 720, Q: 1.5 }] });
  });
  // ...and the last heavy shove: THUD
  tone(E, { t: 0.27, type: 'sine', f: 140, f1: 85, ft: 0.1, d: 0.15, g: 0.25, drive: 2.2, driveIn: 1.5, post: [{ type: 'lowpass', f: 1000, nojit: true }] });
  tone(E, { t: 0.27, type: 'triangle', f: 280, f1: 170, ft: 0.08, d: 0.09, g: 0.3 });
  noise(E, { t: 0.27, d: 0.07, g: 0.42, filters: [{ type: 'bandpass', f: 600, Q: 1 }, { type: 'lowpass', f: 1400, nojit: true }] });
});

S('stairs', { group: 'Field', gain: 0.8, send: 0.08, pj: 0.4, desc: 'tap-tap-tap down (opts.up for climbing)' }, (E, o) => {
  const up = !!(o.up || o.dir === 'up'), steps = 5;
  for (let i = 0; i < steps; i++) {
    const t = i * 0.085 + E.rr(-0.006, 0.006);
    const k = up ? i : steps - 1 - i;
    const f = 200 * Math.pow(2, (k * 2) / 12);
    tone(E, { t, type: 'sine', f, f1: f * 0.75, ft: 0.04, d: 0.075, g: 0.5 - i * 0.03 });
    tone(E, { t, type: 'triangle', f: f * 2.1, d: 0.035, g: 0.1 });
    noise(E, { t, a: 0.0008, d: 0.022, g: 0.22, filters: [{ type: 'bandpass', f: 1400, Q: 1.5 }] });
  }
  noise(E, { t: 0.05, color: 'pink', a: 0.15, d: 0.3, g: 0.08, filters: [{ type: 'bandpass', f: up ? 800 : 1400, f1: up ? 1600 : 700, ft: 0.35, Q: 0.8 }] });
});

S('pot_search', { group: 'Field', gain: 0.8, send: 0.06, pj: 0.8, desc: 'rock the pot, rummage inside' }, (E) => {
  for (const [t, g, f] of [[0, 0.4, 560], [0.1, 0.3, 610]]) {
    bell(E, { t, f, g, d: 0.15, partials: [[1, 1, 1], [2.43, 0.5, 0.6], [4.1, 0.25, 0.4]] });
    noise(E, { t, d: 0.012, g: g * 0.6, filters: [{ type: 'bandpass', f: 2200, Q: 1.5 }] });
  }
  grains(E, { t: 0.16, span: 0.28, count: 12, fLo: 1400, fHi: 3200, Q: 2, dLo: 0.006, dHi: 0.02, gLo: 0.08, gHi: 0.25 });
  noise(E, { t: 0.16, color: 'pink', a: 0.05, h: 0.1, d: 0.15, g: 0.08, filters: [{ type: 'bandpass', f: 900, Q: 1.5 }] });
});

S('barrel_search', { group: 'Field', gain: 1.25, send: 0.06, pj: 0.7, desc: 'knock-knock, lid up, rummage' }, (E) => {
  for (const [t, g] of [[0, 0.55], [0.11, 0.4]]) {
    // a hollow knock on the stave: the barrel's low "dom", driven so its overtones ring, and the wood's own ring
    tone(E, { t, type: 'sine', f: 175, f1: 140, ft: 0.05, d: 0.13, g: g * 0.48, drive: 2, driveIn: 1.4, post: [{ type: 'lowpass', f: 1300, nojit: true }] });
    tone(E, { t, type: 'triangle', f: 352, d: 0.06, g: g * 0.45 });
    tone(E, { t, type: 'sine', f: 540 * E.rr(0.97, 1.03), d: 0.05, g: g * 0.22 });
    noise(E, { t, d: 0.03, g: g * 0.55, filters: [{ type: 'bandpass', f: 700, Q: 2.5 }] });
  }
  creak(E, { t: 0.2, dur: 0.14, f: 60, f1: 75, g: 0.18, res: [1100], Q: 8 });
  grains(E, { t: 0.24, span: 0.26, count: 10, fLo: 800, fHi: 2000, Q: 2.5, dLo: 0.008, dHi: 0.025, gLo: 0.08, gHi: 0.22 });
});

S('bump_wall', { group: 'Field', gain: 0.77, pj: 0.6, minGap: 0.14, poly: 1, desc: 'bumf — walked into something' }, (E) => {
  // a round low bump, driven so its harmonics (250-900 Hz) still say "bumf" on a small speaker
  tone(E, { type: 'sine', f: 125, f1: 68, ft: 0.07, a: 0.001, d: 0.1, g: 0.34, drive: 2.4, driveIn: 1.6, post: [{ type: 'lowpass', f: 1000, nojit: true }] });
  tone(E, { type: 'pulse25', f: 88, f1: 60, ft: 0.05, d: 0.06, g: 0.2, filter: { type: 'lowpass', f: 900 } });
  // and the soft "f" of a shoulder meeting plaster: a dull knock in the low mids
  tone(E, { type: 'triangle', f: 260, f1: 150, ft: 0.05, a: 0.001, d: 0.06, g: 0.34 });
  noise(E, { d: 0.04, g: 0.56, filters: [{ type: 'bandpass', f: 520, Q: 0.9 }, { type: 'lowpass', f: 1400, nojit: true }] });
});

S('splash', { group: 'Field', gain: 0.85, send: 0.1, pj: 0.8, desc: 'plunge, spray, droplets' }, (E) => {
  tone(E, { type: 'sine', f: 190, f1: 55, ft: 0.12, a: 0.002, d: 0.16, g: 0.45 });
  noise(E, { a: 0.003, d: 0.3, g: 0.7, filters: [{ type: 'bandpass', f: 1100, Q: 0.6 }, { type: 'lowpass', f: 5000, f1: 900, ft: 0.25 }] });
  noise(E, { t: 0.02, a: 0.01, d: 0.35, g: 0.22, filters: [{ type: 'highpass', f: 3000 }, { type: 'lowpass', f: 9000 }] });
  for (let i = 0; i < 12; i++) {
    const t = E.rr(0.07, 0.6), f = E.rr(800, 2200);
    tone(E, { t, type: 'sine', f, f1: f * 1.5, ft: 0.012, a: 0.001, d: 0.035, g: E.rr(0.06, 0.2) * (1 - t), pan: E.rr(-0.5, 0.5) });
  }
});

S('wagon_rattle', { group: 'Field', gain: 1.12, send: 0.08, pj: 0.5, desc: "Papa's wagon: wheels, boards, hooves, harness bells" }, (E) => {
  const D = 1.9;
  noise(E, { color: 'brown', a: 0.15, h: D - 0.45, d: 0.3, g: 0.22, filters: [{ type: 'lowpass', f: 200 }], am: { rate: 2.35, depth: 0.4 } });
  noise(E, { color: 'pink', a: 0.15, h: D - 0.45, d: 0.3, g: 0.14, filters: [{ type: 'bandpass', f: 420, Q: 0.9 }], am: { rate: 4.7, depth: 0.5 } });
  for (let k = 0; k < 4; k++) {
    for (const [side, off] of [[-0.45, 0], [0.45, 0.19]]) {
      const t = 0.12 + k * 0.43 + off + E.rr(-0.02, 0.02);
      if (t > D - 0.1) continue;
      tone(E, { t, type: 'sine', f: E.rr(160, 190), f1: 110, ft: 0.04, d: 0.08, g: 0.3, pan: side, drive: 2, driveIn: 1.4, post: [{ type: 'lowpass', f: 1200, nojit: true }] });
      noise(E, { t, d: 0.035, g: 0.18, pan: side, filters: [{ type: 'bandpass', f: 900, Q: 2 }] });
    }
  }
  // Parsnip's hooves: clip-clop
  for (let k = 0; k < 7; k++) {
    const t = 0.05 + k * 0.26 + (k % 2 ? 0.03 : 0) + E.rr(-0.012, 0.012);
    const f = k % 2 ? 1150 : 1350;
    noise(E, { t, a: 0.0008, d: 0.04, g: 0.28, pan: 0.2, filters: [{ type: 'bandpass', f, Q: 5 }] });
    tone(E, { t, type: 'sine', f: f / 3, f1: f / 4, ft: 0.02, d: 0.03, g: 0.1, pan: 0.2 });
  }
  grains(E, { t: 0.05, span: D - 0.2, count: 36, fLo: 1100, fHi: 2600, Q: 4, dLo: 0.006, dHi: 0.02, gLo: 0.04, gHi: 0.14, panj: 0.5 });
  creak(E, { t: 0.55, dur: 0.3, f: 42, f1: 60, g: 0.12, res: [1050], Q: 9 });
  creak(E, { t: 1.3, dur: 0.25, f: 50, f1: 38, g: 0.1, res: [900], Q: 9 });
  bell(E, { t: 0.85, f: 3136, g: 0.05, d: 0.3, partials: GLINT, pan: 0.1 });
  bell(E, { t: 0.97, f: 3520, g: 0.04, d: 0.3, partials: GLINT, pan: 0.1 });
});

// =================================================================================================================
// FOOTSTEPS — quiet, varied every single step
const STEP = { group: 'Footsteps', bus: 'sfx', pj: 1.2, vj: 0.15, panj: 0.06, fj: 0.12, minGap: 0.05, poly: 4 };
S('footstep_grass', { ...STEP, gain: 0.62, desc: 'shff' }, (E) => {
  noise(E, { a: 0.006, d: 0.11, g: 0.5, filters: [{ type: 'highpass', f: 900 }, { type: 'lowpass', f: 5200, f1: 2600, ft: 0.08 }] });
  grains(E, { t: 0.004, span: 0.05, count: 5, fLo: 3000, fHi: 7000, Q: 1.2, dLo: 0.003, dHi: 0.008, gLo: 0.05, gHi: 0.15 });
  tone(E, { type: 'sine', f: 95, f1: 60, ft: 0.04, d: 0.05, g: 0.2 });
});
S('footstep_dirt', { ...STEP, gain: 0.7, desc: 'thup, gritty' }, (E) => {
  tone(E, { type: 'sine', f: 115, f1: 62, ft: 0.05, d: 0.07, g: 0.3 });
  // the scuff of a sole on packed earth: a broad, soft band sliding down, and grit
  noise(E, { a: 0.003, d: 0.08, g: 0.5, filters: [{ type: 'bandpass', f: 900, f1: 500, ft: 0.06, Q: 0.7 }, { type: 'highpass', f: 220, nojit: true }] });
  grains(E, { t: 0.004, span: 0.06, count: 8, fLo: 1600, fHi: 4200, Q: 1.3, dLo: 0.003, dHi: 0.008, gLo: 0.06, gHi: 0.18 });
});
S('footstep_stone', { ...STEP, gain: 0.7, send: 0.06, desc: 'tak' }, (E) => {
  noise(E, { a: 0.0006, d: 0.014, g: 0.55, filters: [{ type: 'bandpass', f: 3000, Q: 1.3 }] });
  noise(E, { a: 0.0008, d: 0.05, g: 0.5, filters: [{ type: 'bandpass', f: 820, Q: 7 }] });
  tone(E, { type: 'sine', f: 190, f1: 150, ft: 0.02, d: 0.035, g: 0.35 });
});
S('footstep_wood', { ...STEP, gain: 0.37, send: 0.05, desc: 'tonk, hollow boards' }, (E) => {
  tone(E, { type: 'sine', f: 160, f1: 118, ft: 0.04, d: 0.08, g: 0.42, drive: 1.8, driveIn: 1.3, post: [{ type: 'lowpass', f: 1000, nojit: true }] });
  // the board rings: two hollow, pitched modes (this is what makes it wood and not earth)
  tone(E, { type: 'triangle', f: 330, f1: 300, ft: 0.03, d: 0.07, g: 0.3 });
  tone(E, { type: 'sine', f: 610 * E.rr(0.96, 1.04), a: 0.001, d: 0.06, g: 0.2 });
  noise(E, { a: 0.0008, d: 0.03, g: 0.3, filters: [{ type: 'bandpass', f: 1100, Q: 3 }] });
  if (E.r() < 0.25) creak(E, { t: 0.02, dur: 0.09, f: 70, f1: 90, g: 0.08, res: [1250], Q: 9 });
});
S('footstep_snow', { ...STEP, gain: 1.0, desc: 'crunch' }, (E) => {
  grains(E, { span: 0.1, count: 16, fLo: 2200, fHi: 6500, Q: 1.1, dLo: 0.004, dHi: 0.012, gLo: 0.08, gHi: 0.3, fade: true });
  noise(E, { a: 0.01, d: 0.1, g: 0.25, filters: [{ type: 'lowpass', f: 900 }] });
  tone(E, { type: 'sine', f: 80, f1: 55, ft: 0.05, d: 0.06, g: 0.18 });
});

// =================================================================================================================
// TREASURE
S('chest_open', { group: 'Treasure', gain: 1.0, send: 0.06, pj: 0.3, vj: 0.05, desc: 'ka-chak, creak, GA-CHAN, glint' }, (E) => {
  // the latch: a small iron click with a tiny ring
  noise(E, { a: 0.0005, d: 0.014, g: 0.45, filters: [{ type: 'bandpass', f: 3200, Q: 2 }] });
  bell(E, { f: 1560, g: 0.08, d: 0.07, a: 0.0006, partials: [[1, 1, 1], [2.71, 0.5, 0.6]] });
  noise(E, { t: 0.045, a: 0.0005, d: 0.012, g: 0.3, filters: [{ type: 'bandpass', f: 2500, Q: 2 }] });
  // the hinge: one short stick-slip squeal, pitched and wobbling, kept soft
  creak(E, { t: 0.06, dur: 0.15, f: 170, f1: 260, g: 0.1, res: [950, 1850], Q: 5 });
  // the lid lands: GA-CHAN. A hollow wooden box (its own ringing modes, not a hit), then the iron band clanks
  const t = 0.24;
  lid(E, t, 1);
  lid(E, t + 0.055, 0.35); // ...and settles with a little bounce
  bell(E, { t: t + 0.006, f: 1180, g: 0.13, d: 0.28, a: 0.0006, partials: [[1, 1, 1], [2.43, 0.55, 0.6], [3.93, 0.3, 0.4]] });
  bell(E, { t: t + 0.008, f: 1660, g: 0.06, d: 0.2, a: 0.0006, partials: [[1, 1, 1], [2.71, 0.4, 0.5]] });
  noise(E, { t, a: 0.0005, d: 0.02, g: 0.3, filters: [{ type: 'bandpass', f: 2300, Q: 1.2 }] });
  // and the treasure winks: a warm two-note celesta "ti-rin"
  bell(E, { t: 0.32, f: nf('A6'), g: 0.1, d: 0.6, partials: CELESTA, pan: -0.15 });
  bell(E, { t: 0.4, f: nf('D7'), g: 0.1, d: 0.8, partials: CELESTA, pan: 0.15 });
});

/** A wooden lid landing on a wooden box: the box's hollow modes ringing briefly, a low knock, a puff of dull noise. */
function lid(E, t, k) {
  for (const [f, d, g] of [[176, 0.16, 0.34], [398, 0.11, 0.26], [742, 0.07, 0.16], [1210, 0.045, 0.1]]) {
    // each mode starts a hair apart (a real box's modes never all start in phase): same knock, ~3 dB less peak
    tone(E, { t: t + E.rr(0, 0.0025), type: 'sine', f: f * E.rr(0.97, 1.03), f1: f * 0.94, ft: 0.03, a: 0.0008, d, g: g * k });
  }
  tone(E, { t, type: 'triangle', f: 260, f1: 130, ft: 0.05, a: 0.001, d: 0.1, g: 0.2 * k });
  noise(E, { t, a: 0.0008, d: 0.06, g: 0.3 * k, filters: [{ type: 'bandpass', f: 520, Q: 0.9 }, { type: 'lowpass', f: 1800, nojit: true }] });
}

S('item_get', { group: 'Treasure', gain: 0.6, send: 0.28, pj: 0.05, vj: 0.03, duck: 0.45, desc: 'ta-ta-ta-taaa! (short)' }, (E) => {
  for (const [n, t, len] of [['A5', 0, 0.09], ['D6', 0.09, 0.09], ['F#6', 0.18, 0.09], ['A6', 0.27, 0.5]]) {
    const f = nf(n), long = len > 0.3;
    tone(E, { t, type: 'pulse25', f, a: 0.002, h: len * 0.6, d: len, g: 0.11, filter: { type: 'lowpass', f: 4200, Q: 0.5 }, vib: long ? { rate: 6, depth: 14, delay: 0.12 } : null });
    tone(E, { t, type: 'triangle', f, a: 0.002, h: len * 0.6, d: len, g: 0.26, vib: long ? { rate: 6, depth: 14, delay: 0.12 } : null });
    bell(E, { t, f: f * 2, g: 0.05, d: 0.3, partials: CELESTA });
  }
  tone(E, { t: 0.27, type: 'triangle', f: nf('D4'), a: 0.004, h: 0.2, d: 0.45, g: 0.3 });
  tone(E, { t: 0.27, type: 'triangle', f: nf('A4'), a: 0.004, h: 0.2, d: 0.45, g: 0.13 });
  sparkle(E, { t: 0.3, n: 6, span: 0.35, fLo: 3000, fHi: 6000, g: 0.05 });
});

S('gold_coins', { group: 'Treasure', gain: 1.0, send: 0.08, pj: 0.5, desc: 'a little cascade of gold coins' }, (E) => {
  const n = 5 + Math.floor(E.r() * 3);
  let t = 0;
  for (let i = 0; i < n; i++) {
    const pan = E.rr(-0.35, 0.35), g = 0.3 * (1 - i / (n + 2));
    bell(E, { t, f: E.rr(2300, 3300), g, d: 0.24, a: 0.0008, pan, partials: COIN });
    noise(E, { t, d: 0.006, g: g * 0.8, pan, filters: [{ type: 'highpass', f: 4000 }] });
    t += E.rr(0.035, 0.075) * (1 - i * 0.05);
  }
});

// =================================================================================================================
// BATTLE
// Every impact is SNAP -> BODY -> TAIL, and each has its own pitched body.
//   snap  a tick and a flick of noise clipped together into a dense burst 3.5-4.5 ms long, its top shaved flat (crest
//         ~0.4 dB: the headroom goes on loudness, not on one spike). It slides ~2 dB down while it lasts, so its loudest
//         millisecond is the first, and it is gone a millisecond after it ends.
//   body  starts exactly as the snap ends (the two never pile their peaks on each other), swells in over 1.5 ms and
//         then only falls: -10 dB 25-40 ms after its peak. No hold, no sustain. The body layers meet in a gentle tanh
//         shaper that takes the body's crest down, so the snap stands ~9-10 dB over it in 1 ms RMS and ~5-7 dB in
//         1 ms peaks.
//         sword_hit    a bright driven swish falling 3.0 -> 1.3 kHz over a "kn" thwack (720 -> 290 Hz)
//         monster_hurt a rubbery pulse "bop" (~600 -> 210 Hz) with a smack of hide
//         player_hurt  a heavy square-ish thud (~260 -> 88 Hz, harmonics up to 3.5 kHz so a telly plays it) and a crunch
//   tail  each one's own shape afterwards: the blade's air trailing across the field; the monster's little "pyu"
//         (~70-200 ms); the rattle that holds under the screen shake and then fades. (Their dB envelopes correlate
//         0.79-0.84 with each other, where one shared noise block correlated 0.95-0.975.)
// Level: each peaks about -3.5 to -4 dBFS on its own and lifts the true mix over the battle theme by about 6 LU
// (K-weighted 100 ms windows) against P27's sampled battle theme, whose 100 ms median sits near -19.5 LUFS on this
// mixer. If the theme is re-levelled, retrim the impacts' `gain`s by the same amount. Under each one the music dips
// ~9 dB for the first 20 ms and comes back over 150 ms; audio.js keeps that dip sample-aligned with the snap (the
// effects wait out the glue compressor's 6 ms look-ahead).
const IMPACT = { group: 'Battle', gain: 0.85, send: 0.035, vj: 0.05, fj: 0.08, pulse: [0.35, 0.003, 0.02, 0.15] };
const BODY_A = 0.0015; // a body swells in over 1.5 ms, from the moment its snap ends, and then only falls

/**
 * The snap. `g` level, `len` how long it stays up (seconds), `f` the tick (falls an octave while the snap lasts),
 * `hp`/`nlp` the noise flick's band, `lp` the colour of the clipped burst. Returns when it has gone.
 */
function snap(E, t, o = {}) {
  const ctx = E.ctx, T = E.t + t, f = o.f ?? 1600, len = o.len ?? 0.0035, g = o.g ?? 0.5;
  const pre = ctx.createGain(); pre.gain.value = 10;
  const clip = ctx.createWaveShaper(); clip.curve = driveCurve(ctx, 1.6); clip.oversample = 'none';
  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = o.lp ?? 10000; lp.Q.value = 0.5;
  // the lowpass rounds the clipped edges and puts ringing back on top of them: shave it off again (no oversampling,
  // which would delay the snap against its own gain ramp)
  const shave = ctx.createGain(); shave.gain.value = 3;
  const top = ctx.createWaveShaper(); top.curve = driveCurve(ctx, 3); top.oversample = 'none';
  const out = ctx.createGain();
  out.gain.setValueAtTime(g, T); out.gain.linearRampToValueAtTime(g * 0.8, T + len);
  out.gain.linearRampToValueAtTime(g * 0.15, T + len + 0.001); out.gain.linearRampToValueAtTime(0, T + len + 0.004);
  pre.connect(clip); clip.connect(lp); lp.connect(shave); shave.connect(top); top.connect(out); out.connect(E.out);
  noise(E, { t, a: 0.0002, h: len, d: 0.004, g: 0.3, to: pre, filters: [{ type: 'highpass', f: o.hp ?? 1000, nojit: true }, { type: 'lowpass', f: o.nlp ?? 6000, nojit: true }] });
  tone(E, { t, type: 'sine', f, f1: f * 0.5, ft: len + 0.002, a: 0.0002, h: len, d: 0.004, g: 1, to: pre });
  return T + len + 0.004;
}

/** Where an impact's body layers meet: `inGain` into a tanh shaper of `drive`, trimmed above `lpHz`, then `outGain`. */
function bodyBus(E, drive, inGain, outGain, lpHz = 8000) {
  const ctx = E.ctx, inG = ctx.createGain(); inG.gain.value = inGain;
  const ws = ctx.createWaveShaper(); ws.curve = driveCurve(ctx, drive); ws.oversample = 'none';
  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = Math.min(lpHz, E.sr * 0.45); lp.Q.value = 0.5;
  const outG = ctx.createGain(); outG.gain.value = outGain;
  inG.connect(ws); ws.connect(lp); lp.connect(outG); outG.connect(E.out);
  return inG;
}

/** The sword's body into `bus` (swish, thwack, a faint ring of the blade), plus the air it drags behind it. */
function blade(E, t, bus, k = 1, dir = 1, lo = 1) {
  // every swing a little different: brightness, how long the swish and the air hang on
  const br = E.rr(0.93, 1.08) * lo, a = BODY_A, sd = E.rr(0.15, 0.19), air = E.rr(0.8, 1.1);
  noise(E, { to: bus, t, a, d: sd, g: 0.42 * k, filters: [{ type: 'bandpass', f: 3000 * br, fp: [[0.03, 2100 * br], [0.15, 1300 * br]], Q: 2 }],
    drive: 2.2, driveIn: 5, os: 'none', post: [{ type: 'lowpass', f: 5000, nojit: true }], panSweep: [-0.25 * dir, 0.25 * dir, 0.12] });
  tone(E, { to: bus, t, type: 'triangle', f: 720 * lo, f1: 290 * lo, ft: 0.05, a, d: sd * 0.78, g: 0.17 * k });
  bell(E, { to: bus, t, f: 2350 * br, g: 0.05 * k, d: 0.16, a, partials: [[1, 1, 1], [1.53, 0.5, 0.7], [2.21, 0.3, 0.5]] });
  noise(E, { t: t + 0.0265, color: 'pink', a: 0.015, d: 0.5 * air, g: 0.26 * k * air, filters: [{ type: 'bandpass', f: 2600 * br, f1: 1000, ft: 0.25, Q: 1.6 }], panSweep: [0.2 * dir, 0.5 * dir, 0.25] });
}

S('sword_hit', { ...IMPACT, gain: 0.81, pj: 0.5, poly: 4, desc: 'zush! a sharp snap, a bright swish and a thwack' }, (E) => {
  const dir = E.r() < 0.5 ? -1 : 1, len = 0.0035;
  snap(E, 0, { g: 0.75, len, f: 1800 * E.rr(0.94, 1.06), hp: 1500, nlp: 7000, lp: 12000 });
  blade(E, len, bodyBus(E, 2.5, 1.8, 0.28, 6000), 1, dir);
});

S('sword_crit', { ...IMPACT, send: 0.07, pj: 0.35, poly: 3, pulse: [0.3, 0.003, 0.12, 0.25],
  desc: 'KIN! — then a heavier GASHUN (a terrific whack!)' }, (E) => {
  const dir = E.r() < 0.5 ? -1 : 1;
  // kin: a hard, bright glint of steel (low partials only, nothing shrill above 7 kHz)
  noise(E, { a: 0.0004, d: 0.01, g: 0.3, filters: [{ type: 'highpass', f: 2500 }, { type: 'lowpass', f: 8000 }] });
  bell(E, { f: 1980, g: 0.2, d: 0.42, a: 0.0006, partials: [[1, 1, 1], [1.48, 0.45, 0.6, 7], [2.32, 0.4, 0.45], [3.07, 0.14, 0.3]] });
  tone(E, { type: 'triangle', f: 990, a: 0.0006, d: 0.09, g: 0.1 });
  // 80 ms later: GA — a longer snap and a lower, heavier blade — SHUN, a thud under it that the whole screen feels
  const t = 0.08, len = 0.0045, bus = bodyBus(E, 2.5, 1.8, 0.3, 6000);
  snap(E, t, { g: 0.8, len, f: 1500 * E.rr(0.94, 1.06), hp: 1200, nlp: 7000, lp: 11000 });
  blade(E, t + len, bus, 1.1, dir, 0.85);
  tone(E, { to: bus, t: t + len, type: 'softsq', f: 220, fp: [[0.1, 75]], a: BODY_A, d: 0.28, g: 0.2, filter: { type: 'lowpass', f: 2500 } });
  noise(E, { t: t + 0.03, a: 0.0008, d: 0.12, g: 0.1, filters: [{ type: 'bandpass', f: 900, f1: 500, ft: 0.08, Q: 1 }], drive: 2, driveIn: 2.5, os: 'none', post: [{ type: 'lowpass', f: 2200, nojit: true }] });
});

S('miss', { group: 'Battle', gain: 1.0, pj: 1.5, desc: 'whoosh — swung and missed' }, (E) => {
  noise(E, { color: 'pink', a: 0.08, h: 0.03, d: 0.2, g: 2.2, filters: [{ type: 'bandpass', f: 450, fp: [[0.12, 2300], [0.3, 650]], Q: 2.2 }], panSweep: [-0.45, 0.45, 0.3] });
  noise(E, { a: 0.08, d: 0.18, g: 0.3, filters: [{ type: 'lowpass', f: 900 }] });
});

S('player_hurt', { ...IMPACT, gain: 0.82, pj: 0.9, poly: 3, desc: 'DOSH — the party takes a hit (goes with screen shake)' }, (E) => {
  const len = 0.0045, a = BODY_A, bus = bodyBus(E, 2, 2.2, 0.36), bd = E.rr(0.14, 0.18);
  snap(E, 0, { g: 1.08, len, f: 1600 * E.rr(0.94, 1.06), hp: 800, nlp: 5500, lp: 8000 });
  // the thud: heavy and pitched, square-ish so its harmonics carry it on a small speaker
  const th = E.rr(0.92, 1.09), fp = [[0.09, 88 * th]];
  tone(E, { to: bus, t: len, type: 'softsq', f: 260 * th, fp, a, d: bd, g: 0.34, drive: 1.6, driveIn: 2, os: 'none', post: [{ type: 'lowpass', f: 3500, f1: 1750, ft: 0.1 }] });
  tone(E, { to: bus, t: len, type: 'sine', f: 130, f1: 60, ft: 0.1, a, d: bd, g: 0.136 });
  // the crunch: a gritty band falling with the thud
  const cr = E.rr(0.88, 1.14);
  noise(E, { to: bus, t: len, a, d: 0.1, g: 0.26, filters: [{ type: 'bandpass', f: 1500 * cr, f1: 675 * cr, ft: 0.08, Q: 0.9 }], drive: 2.5, driveIn: 4, os: 'none',
    post: [{ type: 'lowpass', f: 2800, nojit: true }, { type: 'highpass', f: 150, nojit: true }] });
  // the shake: a rattling buzz that holds while the screen shakes (~150 ms), then fades
  const am = { rate: E.rr(19, 25), depth: 0.9, type: 'triangle' }, rh = E.rr(0.1, 0.14);
  noise(E, { t: 0.05, a: 0.03, h: rh, d: 0.12, g: 0.3, filters: [{ type: 'bandpass', f: 620, Q: 1.1 }], am });
  tone(E, { t: 0.05, type: 'triangle', f: 150, f1: 110, ft: 0.25, a: 0.03, h: rh, d: 0.12, g: 0.12, am: { ...am } });
});

S('monster_hurt', { ...IMPACT, gain: 0.81, send: 0.015, pj: 0.9, vj: 0.06, fj: 0.1, poly: 4, desc: 'bshk! a snap, a rubbery bop and a little "pyu"' }, (E) => {
  const len = 0.0045, a = BODY_A, bus = bodyBus(E, 2, 2.2, 0.36);
  snap(E, 0, { g: 1.08, len, f: 2000 * E.rr(0.94, 1.06), hp: 1000, nlp: 6500, lp: 10000 });
  // the bop: a rubbery pulse, quick to fall
  const bop = E.rr(0.9, 1.12);
  tone(E, { to: bus, t: len, type: 'pulse25', f: 600 * bop, fp: [[0.06, 210 * bop]], a, d: E.rr(0.085, 0.115), g: 0.42, drive: 1.8, driveIn: 2.5, os: 'none', post: [{ type: 'lowpass', f: 6000, f1: 2700, ft: 0.08 }] });
  // the smack of hide
  noise(E, { to: bus, t: len, a, d: 0.1, g: 0.3, filters: [{ type: 'bandpass', f: 1600, f1: 800, ft: 0.05, Q: 1.1 }], drive: 2, driveIn: 4, os: 'none', post: [{ type: 'lowpass', f: 3500, nojit: true }] });
  // and once the bop has gone, the monster's little "pyu" (up and down again), kept in the mids for any speaker
  const y = E.rr(0.92, 1.1), yt = E.rr(0.068, 0.085), yd = E.rr(0.095, 0.125), yfp = [[0.03, 1300 * y], [0.14, 620 * y]];
  tone(E, { t: yt, type: 'triangle', f: 950 * y, fp: yfp, a: 0.025, d: yd, g: 0.35 });
  tone(E, { t: yt, type: 'pulse25', f: 950 * y, fp: yfp, a: 0.025, d: yd * 0.68, g: 0.1, filter: { type: 'lowpass', f: 2600 } });
});

S('monster_defeat', { pulse: [0.5, 0.004, 0.25, 0.3], group: 'Battle', gain: 1.72, send: 0.14, pj: 0.4, desc: 'the poof: pop, a vanishing swoosh, three falling notes' }, (E) => {
  // pop: a round upward blip with a snap on it and a "bof" of weight underneath
  const len = 0.003;
  snap(E, 0, { g: 0.3, len, f: 1400, hp: 800, nlp: 4200, lp: 6000 });
  tone(E, { t: len, type: 'sine', f: 300, f1: 1300, ft: 0.035, a: 0.002, d: 0.09, g: 0.4 });
  tone(E, { t: len, type: 'triangle', f: 160, f1: 90, ft: 0.06, a: 0.002, d: 0.14, g: 0.22 });
  // the vanishing swoosh: a puff of air that rises and thins away
  noise(E, { color: 'pink', t: 0.01, a: 0.02, d: 0.42, g: 0.75, filters: [{ type: 'bandpass', f: 700, fp: [[0.12, 2400], [0.4, 3800]], Q: 1.4 }, { type: 'lowpass', f: 6000, nojit: true }] });
  noise(E, { color: 'pink', t: 0.01, a: 0.015, d: 0.35, g: 0.45, filters: [{ type: 'lowpass', f: 2200, f1: 350, ft: 0.3 }] });
  // and three falling notes
  for (const [n, t] of [['A6', 0.08], ['E6', 0.15], ['C#6', 0.22]]) {
    tone(E, { t, type: 'triangle', f: nf(n), a: 0.002, d: 0.24, g: 0.36 });
    tone(E, { t, type: 'pulse25', f: nf(n), a: 0.002, d: 0.1, g: 0.06, filter: { type: 'lowpass', f: 3500 } });
    tone(E, { t, type: 'sine', f: nf(n) * 2, a: 0.002, d: 0.08, g: 0.06 });
  }
});

S('monster_cry_small', { group: 'Battle', gain: 0.78, send: 0.12, pj: 2.2, desc: 'pi-pyo! (Gloops, little things)' }, (E) => {
  const chirp = (t, f, s) => {
    tone(E, { t, type: 'triangle', f, fp: [[0.05 * s, f * 1.7], [0.14 * s, f * 1.25]], a: 0.008, d: 0.16 * s, g: 0.4, vib: { rate: 24, depth: 45 } });
    tone(E, { t, type: 'sine', f: f * 2, fp: [[0.05 * s, f * 3.4], [0.14 * s, f * 2.5]], a: 0.008, d: 0.12 * s, g: 0.07 });
  };
  chirp(0, 720, 1); chirp(0.19, 900, 0.7);
});

S('monster_cry_big', { group: 'Battle', gain: 0.68, send: 0.25, pj: 1.5, desc: 'RAAR (big, round, not scary)' }, (E) => {
  const fp = [[0.16, 145], [0.85, 78]];
  tone(E, { type: 'sawtooth', f: 92, fp, a: 0.06, h: 0.3, d: 0.5, g: 0.5,
    filters: [{ type: 'lowpass', f: 900, fp: [[0.16, 2400], [0.85, 700]], Q: 1.2 }, { type: 'peaking', f: 650, Q: 2, gain: 8 }],
    am: { rate: 31, depth: 0.45 } });
  tone(E, { type: 'sawtooth', f: 92.9, fp: [[0.16, 146.5], [0.85, 79]], a: 0.06, h: 0.3, d: 0.5, g: 0.32, filters: [{ type: 'lowpass', f: 1100, fp: [[0.16, 2000], [0.85, 600]] }] });
  noise(E, { color: 'pink', a: 0.05, h: 0.25, d: 0.45, g: 0.25, filters: [{ type: 'bandpass', f: 500, fp: [[0.16, 1100], [0.85, 400]], Q: 1.5 }], am: { rate: 31, depth: 0.6 } });
  tone(E, { type: 'sine', f: 55, f1: 42, ft: 0.9, a: 0.05, h: 0.3, d: 0.5, g: 0.45 });
});

S('flee', { group: 'Battle', gain: 0.78, send: 0.05, pj: 0.5, desc: 'pitter-patter-whoosh, away!' }, (E) => {
  for (let i = 0; i < 6; i++) {
    const t = i * 0.052, f = 210 * Math.pow(2, (i * 1.5) / 12);
    tone(E, { t, type: 'sine', f, f1: f * 0.7, ft: 0.03, d: 0.05, g: 0.45 });
    noise(E, { t, d: 0.018, g: 0.2, filters: [{ type: 'bandpass', f: 1800, Q: 1.5 }] });
  }
  noise(E, { t: 0.22, color: 'pink', a: 0.06, d: 0.28, g: 0.45, filters: [{ type: 'bandpass', f: 500, f1: 2600, ft: 0.25, Q: 1.8 }], panSweep: [-0.2, 0.8, 0.3] });
});

S('run_away_fail', { group: 'Battle', gain: 0.82, send: 0.06, pj: 0.3, desc: "patter, BONK, womp-womp — couldn't get away" }, (E) => {
  for (let i = 0; i < 4; i++) {
    const t = i * 0.055, f = 210 * Math.pow(2, (i * 1.5) / 12);
    tone(E, { t, type: 'sine', f, f1: f * 0.7, ft: 0.03, d: 0.05, g: 0.42 });
    noise(E, { t, d: 0.018, g: 0.18, filters: [{ type: 'bandpass', f: 1800, Q: 1.5 }] });
  }
  tone(E, { t: 0.26, type: 'sine', f: 230, f1: 95, ft: 0.12, d: 0.18, g: 0.7 });
  tone(E, { t: 0.26, type: 'triangle', f: 460, f1: 300, ft: 0.05, d: 0.06, g: 0.16 });
  noise(E, { t: 0.26, d: 0.05, g: 0.3, filters: [{ type: 'lowpass', f: 1200 }] });
  for (const [t, a, b, h, d, g] of [[0.44, 'A4', 'G#4', 0.06, 0.13, 0.24], [0.62, 'G4', 'D4', 0.12, 0.32, 0.26]]) {
    tone(E, { t, type: 'triangle', f: nf(a), f1: nf(b), ft: h + d * 0.6, a: 0.01, h, d, g, vib: { rate: 5, depth: 20, delay: 0.1 } });
    tone(E, { t, type: 'pulse25', f: nf(a), f1: nf(b), ft: h + d * 0.6, a: 0.01, h, d, g: g * 0.3, filter: { type: 'lowpass', f: 1400 } });
  }
});

// =================================================================================================================
// MAGIC
S('spell_cast', { group: 'Magic', gain: 1.25, send: 0.35, pj: 0.3, desc: 'the rising shimmer before any spell' }, (E) => {
  ['D5', 'E5', 'F#5', 'A5', 'B5', 'D6', 'E6', 'F#6', 'A6', 'B6', 'D7'].forEach((n, i) => {
    const t = i * 0.032, pan = i % 2 ? 0.35 : -0.35;
    tone(E, { t, type: 'triangle', f: nf(n), a: 0.002, d: 0.16, g: 0.2, pan });
    tone(E, { t, type: 'sine', f: nf(n) * 2, a: 0.002, d: 0.08, g: 0.045, pan });
  });
  tone(E, { type: 'sawtooth', f: 180, f1: 1500, ft: 0.42, a: 0.05, h: 0.25, d: 0.25, g: 0.07, filters: [{ type: 'lowpass', f: 1500, f1: 5000, ft: 0.4 }], am: { rate: 26, depth: 0.7 } });
  noise(E, { a: 0.2, d: 0.35, g: 0.06, filters: [{ type: 'highpass', f: 5000 }, { type: 'lowpass', f: 9500 }] });
});

S('fire', { pulse: [0.6, 0.03, 0.45, 0.35], group: 'Magic', gain: 1.0, send: 0.2, pj: 0.8, desc: 'Scorcha: whoomph and crackle' }, (E) => {
  tone(E, { type: 'sine', f: 90, f1: 40, ft: 0.3, a: 0.003, d: 0.35, g: 0.3 });
  // the roar you hear on a small speaker: a driven 400-1000 Hz flame body that swells and settles
  noise(E, { a: 0.03, h: 0.12, d: 0.5, g: 0.28, filters: [{ type: 'bandpass', f: 420, fp: [[0.15, 950], [0.7, 480]], Q: 0.9 }], drive: 2.5, driveIn: 3,
    post: [{ type: 'lowpass', f: 1700, Q: 0.6 }, { type: 'highpass', f: 200, Q: 0.6 }] });
  noise(E, { color: 'pink', a: 0.04, h: 0.15, d: 0.55, g: 0.7, filters: [{ type: 'bandpass', f: 280, fp: [[0.12, 1800], [0.7, 500]], Q: 0.8 }] });
  noise(E, { color: 'brown', a: 0.05, h: 0.25, d: 0.5, g: 0.6, filters: [{ type: 'lowpass', f: 450, fp: [[0.15, 1000], [0.75, 300]] }] });
  grains(E, { t: 0.06, span: 0.7, count: 22, fLo: 2000, fHi: 5500, Q: 1.4, dLo: 0.003, dHi: 0.01, gLo: 0.08, gHi: 0.32, panj: 0.5, fade: true });
});

S('ice', { pulse: [0.65, 0.03, 0.5, 0.35], group: 'Magic', gain: 1.05, send: 0.35, pj: 0.6, desc: 'Nip: crystals chiming, frost crackling' }, (E) => {
  for (let i = 0; i < 7; i++) {
    bell(E, { t: i * 0.055 + E.rr(0, 0.02), f: E.rr(2000, 3900), g: 0.12, d: E.rr(0.25, 0.5), pan: E.rr(-0.5, 0.5), partials: GLINT });
  }
  grains(E, { t: 0.08, span: 0.55, count: 24, fLo: 3500, fHi: 8000, Q: 1.2, dLo: 0.002, dHi: 0.006, gLo: 0.05, gHi: 0.2, panj: 0.6 });
  tone(E, { type: 'sine', f: 1760, f1: 3520, ft: 0.5, a: 0.1, h: 0.1, d: 0.35, g: 0.05 });
  noise(E, { a: 0.12, h: 0.1, d: 0.5, g: 0.08, filters: [{ type: 'highpass', f: 3000 }, { type: 'lowpass', f: 8500 }] });
  bell(E, { t: 0.55, f: 2637, g: 0.22, d: 0.8, partials: GLINT });
});

S('wind', { pulse: [0.65, 0.08, 0.6, 0.4], group: 'Magic', gain: 3.0, send: 0.25, pj: 1, desc: 'Whiffle: a whistling gust across the field' }, (E) => {
  noise(E, { color: 'pink', a: 0.18, h: 0.25, d: 0.55, g: 1.5, filters: [{ type: 'bandpass', f: 600, fp: [[0.35, 1500], [0.95, 750]], Q: 18 }, { type: 'bandpass', f: 600, fp: [[0.35, 1500], [0.95, 750]], Q: 4 }], panSweep: [-0.6, 0.6, 0.9] });
  noise(E, { t: 0.1, color: 'pink', a: 0.18, h: 0.2, d: 0.5, g: 1.0, filters: [{ type: 'bandpass', f: 1100, fp: [[0.4, 2300], [0.9, 1300]], Q: 22 }, { type: 'bandpass', f: 1100, fp: [[0.4, 2300], [0.9, 1300]], Q: 5 }], panSweep: [0.5, -0.5, 0.9] });
  noise(E, { color: 'pink', a: 0.2, h: 0.2, d: 0.6, g: 0.15, filters: [{ type: 'lowpass', f: 650 }] });
  // the gust itself, in the mids: a broad band rushing up and away
  noise(E, { color: 'pink', a: 0.15, h: 0.3, d: 0.5, g: 0.5, filters: [{ type: 'bandpass', f: 520, fp: [[0.4, 1150], [0.9, 620]], Q: 1.2 }], panSweep: [-0.5, 0.5, 0.9] });
});

/** Lightning's own crack: a noisy, crunchy 170-1500 Hz body that holds for a moment (a bolt is a wall of noise). */
function boltCrack(E, t, k = 1, f = 520) {
  const fc = f * E.rr(0.9, 1.1);
  noise(E, { t, a: 0.001, h: 0.015, d: 0.09, s: 0.35, sd: 0, r: 0.3 * k, g: 0.55 * k,
    filters: [{ type: 'bandpass', f: fc * 1.15, fp: [[0.18, fc * 0.7]], Q: 0.9 }], drive: 3, driveIn: 4,
    post: [{ type: 'lowpass', f: 1400, Q: 0.6 }, { type: 'highpass', f: 180, Q: 0.6 }] });
  grains(E, { t, span: 0.1 * k, count: Math.round(9 * k), fLo: 260, fHi: 950, Q: 2.4, dLo: 0.008, dHi: 0.022, gLo: 0.2 * k, gHi: 0.4 * k, fade: true });
}

S('lightning', { pulse: [0.5, 0.01, 0.4, 0.45], group: 'Magic', gain: 1.35, sat: 0.55, satOut: 0.78, send: 0.3, pj: 0.6, desc: 'Zapple: bzzt — CRACK — rumble' }, (E) => {
  tone(E, { type: 'sawtooth', f: 62, a: 0.01, h: 0.03, d: 0.06, g: 0.22, filters: [{ type: 'bandpass', f: 1800, Q: 1.5 }], am: { rate: 47, depth: 0.9 } });
  noise(E, { a: 0.01, h: 0.02, d: 0.06, g: 0.1, filters: [{ type: 'bandpass', f: 3500, Q: 2 }], am: { rate: 53, depth: 0.9 } });
  const t = 0.07;
  noise(E, { t, a: 0.0006, d: 0.07, g: 0.95, filters: [{ type: 'highpass', f: 250 }, { type: 'lowpass', f: 7500 }] });
  boltCrack(E, t, 0.9, 640); // the crack's body in the mids, so the bolt still lands on a small speaker
  noise(E, { t, a: 0.001, d: 0.2, g: 0.55, filters: [{ type: 'bandpass', f: 1400, f1: 500, ft: 0.15, Q: 0.9 }] });
  tone(E, { t, type: 'sine', f: 70, f1: 30, ft: 0.3, d: 0.4, g: 0.8 });
  noise(E, { t: 0.12, color: 'brown', a: 0.06, h: 0.1, d: 1.1, g: 0.75, filters: [{ type: 'lowpass', f: 320, f1: 150, ft: 1 }], am: { rate: 6.5, depth: 0.55 } });
  noise(E, { t: 0.12, color: 'pink', a: 0.05, h: 0.08, d: 0.7, g: 0.16, filters: [{ type: 'bandpass', f: 380, f1: 240, ft: 0.7, Q: 1.2 }], am: { rate: 6.5, depth: 0.5 } });
});

S('heal', { group: 'Magic', gain: 0.85, send: 0.4, pj: 0.2, desc: 'Mend: a warm rising twinkle' }, (E) => {
  ['A5', 'C#6', 'E6', 'A6', 'C#7', 'E7', 'A7'].forEach((n, i) => {
    const t = i * 0.05, pan = (i / 6) * 0.8 - 0.4;
    tone(E, { t, type: 'sine', f: nf(n), a: 0.003, d: 0.35, g: 0.2, pan });
    tone(E, { t, type: 'sine', f: nf(n) * 2.005, a: 0.003, d: 0.12, g: 0.035, pan });
  });
  for (const n of ['A4', 'C#5', 'E5']) tone(E, { type: 'triangle', f: nf(n), a: 0.18, h: 0.15, d: 0.6, g: 0.07, filter: { type: 'lowpass', f: 1800 } });
  noise(E, { t: 0.1, a: 0.2, d: 0.45, g: 0.03, filters: [{ type: 'highpass', f: 6000 }, { type: 'lowpass', f: 10000 }] });
  sparkle(E, { t: 0.25, n: 5, span: 0.4, fLo: 3500, fHi: 6500, g: 0.04 });
});

S('buff', { group: 'Magic', gain: 0.72, send: 0.25, pj: 0.2, desc: 'Bolster / Bluster: tin-tan-TAAN' }, (E) => {
  for (const [n, t, len] of [['D5', 0, 0.07], ['A5', 0.075, 0.07], ['D6', 0.15, 0.3]]) {
    const vib = len > 0.2 ? { rate: 7, depth: 12, delay: 0.08 } : null;
    tone(E, { t, type: 'pulse25', f: nf(n), a: 0.002, h: len * 0.5, d: len, g: 0.13, filter: { type: 'lowpass', f: 3500 }, vib });
    tone(E, { t, type: 'triangle', f: nf(n), a: 0.002, h: len * 0.5, d: len, g: 0.24, vib });
  }
  tone(E, { type: 'sawtooth', f: 140, f1: 560, ft: 0.35, a: 0.04, h: 0.1, d: 0.25, g: 0.1, filters: [{ type: 'bandpass', f: 500, f1: 3200, ft: 0.35, Q: 3 }] });
});

S('debuff', { group: 'Magic', gain: 0.72, send: 0.2, pj: 0.4, desc: 'Wobble: a droopy wah-wah' }, (E) => {
  const vib = { rate: 9, depth: 70 };
  tone(E, { type: 'sawtooth', f: 660, f1: 250, ft: 0.5, a: 0.01, h: 0.2, d: 0.35, g: 0.16, filters: [{ type: 'lowpass', f: 1800, f1: 700, ft: 0.5 }], vib });
  tone(E, { type: 'triangle', f: 330, f1: 125, ft: 0.5, a: 0.01, h: 0.2, d: 0.35, g: 0.25, vib });
  tone(E, { t: 0.5, type: 'sine', f: 180, f1: 105, ft: 0.1, d: 0.15, g: 0.35 });
});

S('poison', { group: 'Magic', gain: 0.72, send: 0.15, pj: 0.8, desc: 'bloop-bloop, feeling green' }, (E) => {
  for (let i = 0; i < 10; i++) {
    const t = E.rr(0, 0.45), f = E.rr(260, 620);
    tone(E, { t, type: 'sine', f, f1: f * 1.9, ft: 0.035, a: 0.002, d: 0.06, g: E.rr(0.12, 0.3), pan: E.rr(-0.4, 0.4) });
  }
  tone(E, { type: 'pulse25', f: 98, a: 0.03, h: 0.2, d: 0.3, g: 0.18, filter: { type: 'lowpass', f: 520 }, vib: { rate: 5.5, depth: 45 } });
  tone(E, { t: 0.05, type: 'triangle', f: nf('E5'), a: 0.01, d: 0.18, g: 0.1 });
  tone(E, { t: 0.22, type: 'triangle', f: nf('D#5'), a: 0.01, d: 0.3, g: 0.1, vib: { rate: 6, depth: 25, delay: 0.05 } });
});

// =================================================================================================================
// CEREMONY
S('level_up_sparkle', { group: 'Ceremony', gain: 1.6, send: 0.45, pj: 0.1, vj: 0.03, desc: 'harp sweep and tumbling stars' }, (E) => {
  ['D5', 'E5', 'F#5', 'A5', 'B5', 'D6', 'E6', 'F#6', 'A6', 'B6', 'D7', 'E7'].forEach((n, i) => {
    tone(E, { t: i * 0.028, type: 'triangle', f: nf(n), a: 0.002, d: 0.32, g: 0.13, pan: -0.3 + 0.05 * i });
  });
  const pent = ['D6', 'E6', 'F#6', 'A6', 'B6', 'D7', 'E7', 'F#7', 'A7', 'B7'];
  for (let i = 0; i < 16; i++) {
    const idx = clamp(Math.floor((i * pent.length) / 16 + E.rr(-1, 1)), 0, pent.length - 1);
    bell(E, { t: 0.3 + i * 0.055 + E.rr(-0.012, 0.012), f: nf(pent[idx]), g: 0.1, d: E.rr(0.25, 0.5), pan: E.rr(-0.6, 0.6), partials: CELESTA });
  }
  noise(E, { t: 0.2, a: 0.3, h: 0.2, d: 0.6, g: 0.03, filters: [{ type: 'highpass', f: 6500 }, { type: 'lowpass', f: 11000 }] });
});

function churchBell(E, t, f, g) {
  // hum, prime, tierce (minor third), quint, nominal, and a couple of shimmer partials
  const P = [[0.5, 0.55, 1.6], [1, 1, 1.2], [1.19, 0.45, 0.9], [1.5, 0.3, 0.55], [2, 0.5, 0.7], [2.51, 0.18, 0.4], [3, 0.15, 0.35], [4.07, 0.08, 0.25]];
  for (const [r, pg, dm] of P) {
    tone(E, { t, type: 'sine', f: f * r, a: 0.003, d: 2.2 * dm, g: g * pg * 0.5 });
    if (r <= 1) tone(E, { t, type: 'sine', f: f * r, cents: 2.8, a: 0.003, d: 2.2 * dm, g: g * pg * 0.35 }); // the slow "wah-wah" beat
  }
  noise(E, { t, a: 0.0008, d: 0.03, g: g * 0.4, filters: [{ type: 'bandpass', f: 2400, Q: 1.5 }] });
}
S('save_church_bell', { group: 'Ceremony', gain: 0.8, send: 0.55, pj: 0.1, vj: 0.03, duck: 0.5, desc: 'ding… dong — your adventure is recorded' }, (E) => {
  churchBell(E, 0, 523.25, 0.5);
  churchBell(E, 0.95, 392, 0.45);
});

S('inn_sleep', { group: 'Ceremony', gain: 0.72, send: 0.5, pj: 0, vj: 0.02, duck: 0.4, desc: 'candle out, a music box winds down' }, (E) => {
  noise(E, { color: 'pink', a: 0.03, d: 0.25, g: 0.25, filters: [{ type: 'bandpass', f: 1300, f1: 800, ft: 0.2, Q: 1 }] });
  for (const n of ['D4', 'F#4', 'A4']) tone(E, { t: 0.2, type: 'triangle', f: nf(n), a: 0.8, h: 0.7, d: 1.3, g: 0.07, filter: { type: 'lowpass', f: 900 } });
  for (const [n, t] of [['A5', 0.3], ['F#5', 0.62], ['D5', 0.96], ['E5', 1.34], ['C#5', 1.78], ['D5', 2.3]]) {
    bell(E, { t, f: nf(n), g: 0.2, d: 1.1, partials: MUSICBOX });
  }
});

// =================================================================================================================
// AMBIENCE — each bed is rendered once into a seamless loop buffer, then played with loop=true on the ambience bus.
// Inside a loop render: noise beds use exactly-L-long noise, LFO rates are whole cycles per loop (E.loopRate), and
// events inside the first W seconds are repeated at +L. After the W-second warm-up the output is exactly periodic,
// so the slice [W, W+L) loops with no seam — reverb tails included.
function birdCall(E, b, t) {
  const g = b.g ?? 1, pan = b.pan ?? 0;
  if (b.kind === 'tweet') {
    const n = 3 + Math.floor(E.r() * 4), gap = E.rr(0.07, 0.1);
    for (let i = 0; i < n; i++) {
      const f = b.f * E.rr(0.94, 1.1), tt = t + i * gap;
      tone(E, { t: tt, type: 'sine', f, fp: [[0.022, f * 1.35], [0.05, f * 1.02]], fixed: true, a: 0.006, d: 0.055, g: 0.05 * g, pan });
      tone(E, { t: tt, type: 'sine', f: f * 2, fp: [[0.022, f * 2.7], [0.05, f * 2.04]], fixed: true, a: 0.006, d: 0.04, g: 0.008 * g, pan });
    }
  } else if (b.kind === 'warble') {
    const dur = E.rr(0.45, 0.75);
    tone(E, { t, type: 'sine', f: b.f, f1: b.f * 0.9, ft: dur, fixed: true, a: 0.03, h: dur - 0.08, d: 0.08, g: 0.035 * g, pan, vib: { rate: E.rr(22, 30), depth: 170 } });
    tone(E, { t: t + dur + 0.05, type: 'sine', f: b.f * 1.1, f1: b.f * 1.6, ft: 0.08, fixed: true, a: 0.01, d: 0.1, g: 0.04 * g, pan });
  } else if (b.kind === 'whistle') {
    let tt = t;
    const steps = [1, 1.125, 1.25, 1.5, 1.333];
    for (let i = 0; i < 3 + Math.floor(E.r() * 2); i++) {
      const f = b.f * E.pick(steps), len = E.rr(0.12, 0.2);
      tone(E, { t: tt, type: 'sine', f: f * 0.92, fp: [[0.04, f], [len, f * E.rr(0.95, 1.08)]], fixed: true, a: 0.02, h: len * 0.5, d: len * 0.6, g: 0.04 * g, pan, vib: { rate: 7, depth: 25 } });
      tt += len + E.rr(0.04, 0.1);
    }
  } else if (b.kind === 'cuckoo') {
    for (const [dt, f] of [[0, b.f], [0.32, b.f * 0.8]]) {
      tone(E, { t: t + dt, type: 'sine', f, fixed: true, a: 0.03, h: 0.1, d: 0.16, g: 0.03 * g, pan, filter: { type: 'lowpass', f: 1500, nojit: true } });
    }
  }
}

function murmurVoice(E, v) {
  // one distant person talking: a buzzy source through two moving formants, gated into syllables
  const ctx = E.ctx, total = E.W + E.L;
  const osc = ctx.createOscillator(); osc.type = 'sawtooth'; osc.frequency.value = v.f0;
  const f1 = ctx.createBiquadFilter(); f1.type = 'bandpass'; f1.Q.value = 5; f1.frequency.value = 600;
  const f2 = ctx.createBiquadFilter(); f2.type = 'bandpass'; f2.Q.value = 6; f2.frequency.value = 1400;
  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1700;
  const gate = ctx.createGain(); gate.gain.value = 0;
  const pn = ctx.createStereoPanner(); pn.pan.value = v.pan;
  osc.connect(f1); osc.connect(f2); f1.connect(lp); f2.connect(lp); lp.connect(gate); gate.connect(pn); pn.connect(E.out);
  osc.start(0); osc.stop(total + 0.01); track(E, osc, total);
  let s = E.rr(0, 1.5);
  while (s < E.L - 0.5) {
    const phraseEnd = Math.min(E.L - 0.4, s + E.rr(1.2, 3.5));
    while (s < phraseEnd) {
      const u = E.rr(0.11, 0.24);
      const p0 = v.f0 * E.rr(0.9, 1.18), p1 = p0 * E.rr(0.85, 1.05);
      const a1 = E.rr(380, 850), b1 = E.rr(380, 850), a2 = E.rr(1000, 2100), b2 = E.rr(1000, 2100), g = v.g * E.rr(0.55, 1);
      E.every(s, (tt) => {
        osc.frequency.setValueAtTime(p0, tt); osc.frequency.exponentialRampToValueAtTime(p1, tt + u);
        f1.frequency.setValueAtTime(a1, tt); f1.frequency.linearRampToValueAtTime(b1, tt + u);
        f2.frequency.setValueAtTime(a2, tt); f2.frequency.linearRampToValueAtTime(b2, tt + u);
        gate.gain.setValueAtTime(0, tt); gate.gain.linearRampToValueAtTime(g, tt + 0.03);
        gate.gain.linearRampToValueAtTime(g * 0.6, tt + u - 0.035); gate.gain.linearRampToValueAtTime(0, tt + u);
      });
      s += u + E.rr(0.005, 0.05);
    }
    s += E.rr(0.6, 2.4);
  }
}

function drip(E, t, f, pan, g) {
  tone(E, { t, type: 'sine', f, f1: f * 1.9, ft: 0.014, fixed: true, a: 0.0008, d: 0.055, g, pan });
  tone(E, { t: t + 0.002, type: 'sine', f: f * 0.5, f1: f * 0.8, ft: 0.02, fixed: true, a: 0.001, d: 0.04, g: g * 0.35, pan });
}

function cricket(E, c) {
  const ctx = E.ctx, total = E.W + E.L;
  const per = E.L / Math.round(E.L / c.period);
  const osc = ctx.createOscillator(); osc.type = 'sine'; osc.frequency.value = c.f;
  const osc2 = ctx.createOscillator(); osc2.type = 'sine'; osc2.frequency.value = c.f * 2;
  const g2 = ctx.createGain(); g2.gain.value = 0.12;
  const gate = ctx.createGain(); gate.gain.value = 0;
  const pn = ctx.createStereoPanner(); pn.pan.value = c.pan;
  osc.connect(gate); osc2.connect(g2); g2.connect(gate); gate.connect(pn); pn.connect(E.out);
  for (const o of [osc, osc2]) { o.start(0); o.stop(total + 0.01); track(E, o, total); }
  const n = Math.round(E.L / per), off = c.off ?? 0.05;
  for (let k = 0; k < n; k++) {
    if (E.r() < (c.rest ?? 0.12)) continue;
    const g = c.g * E.rr(0.75, 1);
    E.every(k * per + off, (t) => {
      for (let p = 0; p < c.pulses; p++) {
        const s = t + p * 0.028;
        gate.gain.setValueAtTime(0, s); gate.gain.linearRampToValueAtTime(g, s + 0.004);
        gate.gain.linearRampToValueAtTime(g * 0.6, s + 0.012); gate.gain.linearRampToValueAtTime(0, s + 0.018);
      }
    });
  }
}

const AMB = { group: 'Ambience', bus: 'ambience', pj: 0, vj: 0, fj: 0, panj: 0 };

S('amb_meadow', { ...AMB, gain: 1.5, send: 0.25, loop: { len: 16, warm: 4, space: 'open' }, desc: 'meadow: breeze in the grass, birds, a far cuckoo' }, (E) => {
  noise(E, { bed: true, color: 'pink', g: 0.12, to: E.dry, filters: [{ type: 'bandpass', f: 1400, Q: 0.5, nojit: true }, { type: 'lowpass', f: 4000, nojit: true }], am: [{ rate: E.loopRate(0.13), depth: 0.6 }, { rate: E.loopRate(0.31), depth: 0.3 }] });
  noise(E, { bed: true, color: 'pink', g: 0.14, to: E.dry, filters: [{ type: 'lowpass', f: 500, nojit: true }], am: [{ rate: E.loopRate(0.07), depth: 0.8 }] });
  const birds = [{ kind: 'tweet', f: 3400, pan: -0.55, g: 1.7, gap: [2.2, 4.2] }, { kind: 'warble', f: 2600, pan: 0.5, g: 2.2, gap: [3.5, 6] }, { kind: 'whistle', f: 1900, pan: 0.15, g: 2.6, gap: [4, 7] }];
  for (const b of birds) {
    let t = E.rr(0.2, 2);
    while (t < E.L - 1.5) { const tt = t; E.every(tt, (x) => birdCall(E, b, x)); t += E.rr(b.gap[0], b.gap[1]); }
  }
  // the far cuckoo and the bumblebee move (or stay away) from one variant of the bed to the next
  const ck = E.rr(7.5, 10.5), ckPan = E.rr(-0.85, -0.5);
  if (E.r() < 0.85) E.every(ck, (t) => birdCall(E, { kind: 'cuckoo', f: 700, pan: ckPan, g: 2.2 }, t));
  if (E.r() < 0.6) E.every(ck + E.rr(3, 4.5), (t) => birdCall(E, { kind: 'cuckoo', f: 690, pan: ckPan, g: 1.8 }, t));
  // a bumblebee drifting past
  if (E.r() < 0.7) E.every(E.rr(2.5, 9), (t) => {
    tone(E, { t, type: 'sawtooth', f: 205, fixed: true, a: 0.9, h: 0.4, d: 1.0, g: 0.018, panSweep: [0.7, -0.4, 2.3], filters: [{ type: 'lowpass', f: 900, nojit: true }], am: { rate: 11, depth: 0.3 }, vib: { rate: 3, depth: 40 } });
  });
});

S('amb_town', { ...AMB, gain: 2.2, send: 0.35, loop: { len: 16, warm: 4, space: 'room' }, desc: 'town square: murmur, the smithy, footsteps, sparrows' }, (E) => {
  noise(E, { bed: true, color: 'pink', g: 0.12, to: E.dry, filters: [{ type: 'lowpass', f: 700, nojit: true }, { type: 'highpass', f: 120, nojit: true }], am: [{ rate: E.loopRate(0.19), depth: 0.35 }] });
  const pitches = [112, 128, 145, 178, 205, 232];
  for (let i = 0; i < 6; i++) murmurVoice(E, { f0: pitches[i] * E.rr(0.95, 1.05), pan: -0.7 + (1.4 * i) / 5, g: E.rr(0.03, 0.045) });
  for (const t0 of [E.rr(0.6, 2.5), E.rr(5.8, 7.8), E.rr(11.2, 12.8)]) {
    if (E.r() < 0.2) continue; // the smith stops for a sip now and then
    E.every(t0, (t) => {
      for (let i = 0; i < 3; i++) {
        bell(E, { t: t + i * 0.42, f: 1850, fixed: true, g: 0.03, d: 0.5, pan: -0.6, partials: [[1, 1, 1], [2.63, 0.6, 0.6], [4.1, 0.4, 0.4], [5.9, 0.2, 0.3]] });
        tone(E, { t: t + i * 0.42, type: 'sine', f: 220, f1: 140, ft: 0.03, fixed: true, d: 0.06, g: 0.03, pan: -0.6 });
      }
    });
  }
  for (const [t0, p0, p1] of [[E.rr(2.8, 4.5), -0.5, 0.5], [E.rr(9.2, 11), 0.6, -0.2]]) {
    E.every(t0, (t) => {
      for (let i = 0; i < 6; i++) {
        const tt = t + i * 0.46, pan = p0 + ((p1 - p0) * i) / 5, g = 0.05 * (1 - Math.abs(i - 2.5) / 5);
        noise(E, { t: tt, a: 0.0006, d: 0.014, g: g * 1.1, pan, filters: [{ type: 'bandpass', f: 3000, Q: 1.3, nojit: true }] });
        noise(E, { t: tt, a: 0.0008, d: 0.05, g, pan, filters: [{ type: 'bandpass', f: 820, Q: 7, nojit: true }] });
      }
    });
  }
  for (const t0 of [E.rr(0.3, 1.5), E.rr(7.5, 9), E.rr(13.5, 14.3)]) E.every(t0, (t) => birdCall(E, { kind: 'tweet', f: 4200 * E.rr(0.92, 1.08), pan: E.rr(0.3, 0.7), g: 0.7 }, t));
  E.every(E.rr(4.4, 6), (t) => {
    noise(E, { t, color: 'brown', a: 1.2, h: 0.5, d: 1.2, g: 0.12, panSweep: [-0.8, 0.8, 2.9], filters: [{ type: 'lowpass', f: 180, nojit: true }] });
    grains(E, { t: t + 0.6, span: 1.6, count: 14, fLo: 900, fHi: 2000, Q: 4, dLo: 0.006, dHi: 0.018, gLo: 0.01, gHi: 0.03 });
  });
  if (E.r() < 0.75) E.every(E.rr(12.6, 13.8), (t) => creak(E, { t, dur: 0.3, f: 40, f1: 55, g: 0.035, res: [800, 1500], Q: 6, pan: 0.4 }));
});

S('amb_cave', { ...AMB, gain: 0.63, send: 0.7, loop: { len: 16, warm: 5, space: 'cave' }, desc: 'cave: deep hush, drips echoing' }, (E) => {
  noise(E, { bed: true, color: 'brown', g: 0.4, to: E.dry, filters: [{ type: 'lowpass', f: 110, nojit: true }], am: [{ rate: E.loopRate(0.09), depth: 0.5 }] });
  noise(E, { bed: true, color: 'pink', g: 0.035, to: E.dry, filters: [{ type: 'bandpass', f: 320, Q: 2.5, nojit: true }], am: [{ rate: E.loopRate(0.23), depth: 0.6 }] });
  const drippers = [{ period: 1.6, f: 1450, pan: -0.4, g: 0.1, off: 0.3 }, { period: 16 / 7, f: 1050, pan: 0.5, g: 0.085, off: 0.9 }, { period: 3.2, f: 1900, pan: 0.1, g: 0.065, off: 2.1 }, { period: 4, f: 820, pan: -0.75, g: 0.06, off: 1.4 }];
  for (const dr of drippers) {
    const n = Math.round(E.L / dr.period);
    for (let k = 0; k < n; k++) {
      if (E.r() < 0.1) continue;
      const e = (dr.off + k * dr.period + E.rr(-0.07, 0.07) + E.L) % E.L;
      const f = dr.f * E.rr(0.97, 1.03), g = dr.g * E.rr(0.7, 1);
      E.every(e, (t) => drip(E, t, f, dr.pan, g));
    }
  }
  if (E.r() < 0.8) E.every(E.rr(5.5, 10), (t) => {
    for (let i = 0; i < 4; i++) {
      noise(E, { t: t + i * 0.09 + E.rr(0, 0.03), a: 0.0008, d: 0.03, g: 0.03 * (1 - i * 0.2), pan: 0.35, filters: [{ type: 'bandpass', f: E.rr(900, 1800), Q: 3, nojit: true }] });
    }
  });
});

S('amb_night', { ...AMB, gain: 2.5, send: 0.3, loop: { len: 12, warm: 3, space: 'open' }, desc: 'night: crickets, a soft owl, a frog far off' }, (E) => {
  noise(E, { bed: true, color: 'pink', g: 0.09, to: E.dry, filters: [{ type: 'lowpass', f: 500, nojit: true }], am: [{ rate: E.loopRate(0.08), depth: 0.7 }] });
  const crickets = [
    { f: 4300, pan: -0.6, period: 0.5, pulses: 3, g: 0.028, off: 0.05 },
    { f: 4700, pan: 0.55, period: 0.6, pulses: 4, g: 0.02, off: 0.21 },
    { f: 3900, pan: 0.1, period: 0.75, pulses: 2, g: 0.018, off: 0.37 },
    { f: 5100, pan: -0.2, period: 0.4, pulses: 3, g: 0.009, off: 0.12, rest: 0.3 },
  ];
  for (const c of crickets) cricket(E, c);
  if (E.r() < 0.85) E.every(E.rr(3.2, 5.8), (t) => {
    for (const [dt, f, h] of [[0, 392, 0.14], [0.55, 380, 0.08], [0.78, 370, 0.2]]) {
      tone(E, { t: t + dt, type: 'sine', f, f1: f * 0.94, ft: h + 0.1, fixed: true, a: 0.05, h, d: 0.22, g: 0.03, pan: 0.65, filter: { type: 'lowpass', f: 900, nojit: true } });
      tone(E, { t: t + dt, type: 'triangle', f: f * 2, fixed: true, a: 0.05, h: h * 0.5, d: 0.15, g: 0.004, pan: 0.65 });
    }
  });
  if (E.r() < 0.8) E.every(E.rr(7.6, 9.4), (t) => {
    for (const dt of [0, 0.34]) {
      tone(E, { t: t + dt, type: 'pulse25', f: 110, fixed: true, a: 0.01, h: 0.1, d: 0.08, g: 0.06, pan: -0.7, filters: [{ type: 'bandpass', f: 750, Q: 3, nojit: true }], am: { rate: 30, depth: 0.9 } });
    }
  });
});

// =================================================================================================================
// loop rendering
const loopCache = new Map(); // `${id}|${variant}|${sr}` -> Promise<AudioBuffer>

function renderLoop(d, sr, variant = 0) {
  const key = `${d.id}|${variant}|${sr}`;
  if (loopCache.has(key)) return loopCache.get(key);
  const job = (async () => {
    const OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    const L = d.loop.len, W = d.loop.warm;
    const octx = new OAC(2, Math.round((W + L) * sr), sr);
    const hold = { octx, nodes: retainNodes(octx) };
    _rendering.add(hold);
    const out = octx.createGain(); out.connect(octx.destination);
    // local reverb, so tails wrap round inside the loop
    const verbIn = octx.createGain();
    const hp = octx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 180;
    const conv = octx.createConvolver(); conv.buffer = makeIR(octx, d.loop.space || 'open');
    const lp = octx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = d.loop.space === 'cave' ? 3400 : 6500;
    verbIn.connect(hp); hp.connect(conv); conv.connect(lp); lp.connect(out);
    const rng = mulberry32(hashStr(d.id) + variant * 7919);
    const E = makeEnv(octx, out, verbIn, { ...d, gain: 1 }, {}, rng, 0);
    E.L = L; E.W = W;
    E.every = (e, fn) => { fn(e); if (e < W) fn(e + L); };
    E.loopRate = (hz) => Math.max(1, Math.round(hz * L)) / L;
    const beds = {};
    E.loopNoise = (color) => beds[color] || (beds[color] = makeNoise(octx, color, Math.round(L * sr), hashStr(d.id + color) + variant));
    let rendered;
    try {
      d.fn(E, {});
      settleLevel(E);
      hold.E = E;
      rendered = await octx.startRendering();
    } finally { _rendering.delete(hold); }
    const n = Math.round(L * sr), off = Math.round(W * sr);
    const res = (typeof AudioBuffer === 'function')
      ? new AudioBuffer({ length: n, numberOfChannels: 2, sampleRate: sr })
      : octx.createBuffer(2, n, sr);
    for (let ch = 0; ch < 2; ch++) res.getChannelData(ch).set(rendered.getChannelData(ch).subarray(off, off + n));
    return res;
  })();
  job.catch(() => loopCache.delete(key));
  loopCache.set(key, job);
  if (loopCache.size > 10) loopCache.delete(loopCache.keys().next().value);
  return job;
}

// =================================================================================================================
// live playback bookkeeping
const MAX_VOICES = 40;
let active = [];              // {id, E, end, handle}
const lastAt = {};            // id -> ctx time of last start
const recent = [];            // last ids played
let played = 0;
let amb = null;               // {id, handle}
let warnedUnknown = {};

function prune(now) { if (active.length) active = active.filter(v => v.end > now); }

function stopVoice(v, ms = 30) {
  try {
    const ctx = v.E.ctx, now = ctx.currentTime, g = v.E.out.gain;
    if (g.cancelAndHoldAtTime) g.cancelAndHoldAtTime(now); else { g.cancelScheduledValues(now); g.setValueAtTime(g.value, now); }
    g.linearRampToValueAtTime(0, now + ms / 1000);
    for (const n of [v.E.dry, v.E.post]) { if (!n || n === v.E.out) continue; n.gain.cancelScheduledValues(now); n.gain.setValueAtTime(n.gain.value, now); n.gain.linearRampToValueAtTime(0, now + ms / 1000); }
    for (const s of v.E.srcs) { try { s.stop(now + ms / 1000 + 0.01); } catch (_) {} }
    if (v.releaseDuck) { v.releaseDuck(300); v.releaseDuck = null; }
    v.end = now;
  } catch (e) { reportError('sfx stop', e); }
}

function scheduleCleanup(E) {
  const ms = Math.max(0, (E.end - E.ctx.currentTime) * 1000) + 300;
  setTimeout(() => { for (const n of E.nodes) { try { n.disconnect(); } catch (_) {} } }, ms);
}

function seedFor(id, variant) {
  return variant != null ? (hashStr(id) ^ Math.imul((variant | 0) + 1, 2654435761)) >>> 0 : (Math.random() * 4294967296) >>> 0;
}

// A bed never repeats exactly: it is a chain of differently seeded variants of the same seamless loop, each one
// crossfaded into the next (equal power, BED_XF seconds). Live and offline use the same scheduler.
const BED_VARIANTS = 3, BED_XF = 2.0;
let _xfIn = null, _xfOut = null;
function xfCurves() {
  if (!_xfIn) {
    const N = 64; _xfIn = new Float32Array(N); _xfOut = new Float32Array(N);
    for (let i = 0; i < N; i++) { const x = i / (N - 1); _xfIn[i] = Math.sin(x * Math.PI / 2); _xfOut[i] = Math.cos(x * Math.PI / 2); }
  }
  return [_xfIn, _xfOut];
}
/**
 * Schedule one segment of a bed at ctx time `t` into `out`: one loop's length of `buf`, entered at `offset` (the loop is
 * seamless, so any rotation of it is too). Returns when the next segment should start (as this one begins to fade).
 */
function bedSegment(ctx, out, buf, t, offset, fadeIn, keep) {
  const [cin, cout] = xfCurves(), X = Math.min(BED_XF, buf.duration / 4);
  const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true;
  const g = ctx.createGain();
  src.connect(g); g.connect(out);
  offset = ((offset % buf.duration) + buf.duration) % buf.duration;
  const dur = buf.duration, end = t + dur;
  if (fadeIn) { g.gain.setValueAtTime(0, t); g.gain.setValueCurveAtTime(cin, t, X); } else g.gain.setValueAtTime(1, t);
  g.gain.setValueCurveAtTime(cout, end - X, X);
  src.start(t, offset); src.stop(end + 0.02);
  if (keep) keep.push({ src, g, end });
  return end - X; // the next segment starts as this one begins to fade
}

/** Never the same variant twice in a row, otherwise a random pick: the chain has no period at all. */
function nextVariant(prev, rnd) { return (prev + 1 + Math.floor(rnd() * (BED_VARIANTS - 1))) % BED_VARIANTS; }

function playLoop(d, opts) {
  const ctx = Audio.ctx; if (!ctx) return null;
  const sr = ctx.sampleRate, keep = [];
  const handle = { id: d.id, loop: true, stopped: false, gain: null, timer: 0, k: 0, nextAt: 0, last: null, next: null,
    stop(ms = 1200) {
      if (handle.stopped) return; handle.stopped = true;
      clearInterval(handle.timer);
      const gain = handle.gain; if (!gain) return;
      const now = ctx.currentTime;
      gain.gain.cancelScheduledValues(now); gain.gain.setValueAtTime(gain.gain.value, now); gain.gain.linearRampToValueAtTime(0, now + ms / 1000);
      for (const sg of keep) { try { sg.src.stop(now + ms / 1000 + 0.05); } catch (_) {} }
      setTimeout(() => { try { gain.disconnect(); } catch (_) {} }, ms + 200);
    } };
  const first = (opts.variant ?? 0) % BED_VARIANTS; // variant 0 is the one Sfx.preload() warms, so the first play is instant
  const bufs = [];
  const want = (v) => (bufs[v] !== undefined ? bufs[v]
    : (bufs[v] = renderLoop(d, sr, v).then((b) => (bufs[v] = b)).catch((e) => { bufs[v] = false; reportError('ambience ' + d.id, e); return null; })));
  const pump = () => {
    try {
      if (handle.stopped) return;
      const now = ctx.currentTime;
      // keep ~4 s of bed scheduled ahead; if the next variant is still rendering, reuse one that is ready
      while (handle.nextAt - now < 4) {
        let v = handle.next, b = bufs[v];
        if (!(b instanceof AudioBuffer)) { want(v); v = first; b = bufs[first]; }
        if (!(b instanceof AudioBuffer)) return;
        const t = Math.max(handle.nextAt, now + 0.02);
        handle.nextAt = bedSegment(ctx, handle.gain, b, t, Math.random() * b.duration, true, keep);
        handle.k++; handle.last = v;
        handle.next = nextVariant(v, Math.random);
        want(handle.next);
      }
      for (let i = keep.length - 1; i >= 0; i--) if (keep[i].end < now - 0.1) { try { keep[i].g.disconnect(); } catch (_) {} keep.splice(i, 1); }
    } catch (e) { reportError('ambience ' + d.id, e); }
  };
  Promise.resolve(want(first)).then((buf) => {
    if (handle.stopped || !(buf instanceof AudioBuffer)) return;
    try {
    const g = ctx.createGain(), now = ctx.currentTime, target = (opts.vol ?? 1) * (d.gain ?? 1);
    g.gain.setValueAtTime(0, now); g.gain.linearRampToValueAtTime(target, now + (opts.fade ?? 1500) / 1000);
    g.connect(Audio.bus(d.bus));
    handle.gain = g;
    handle.nextAt = bedSegment(ctx, g, buf, now + 0.02, opts.offset ?? Math.random() * buf.duration, false, keep);
    handle.k = 1; handle.last = first;
    handle.next = nextVariant(first, Math.random);
    want(handle.next);
    handle.timer = setInterval(pump, 700);
    } catch (e) { reportError('ambience ' + d.id, e); }
  });
  return handle;
}

// The typing duck (see Sfx.glyph). Named hold 'typing' on the music bus.
const TYPING = { depth: 0.7, attackMs: 120, holdMs: 2500, releaseMs: 700 };
let typingTimer = 0;
function typingDuck() {
  try {
    if (!Audio.ctx || Audio.holding('dialogue')) return; // the dialogue duck already has the music down
    Audio.hold('typing', 'music', TYPING.depth, TYPING.attackMs);
    clearTimeout(typingTimer);
    typingTimer = setTimeout(() => { typingTimer = 0; Audio.releaseHold('typing', TYPING.releaseMs); }, TYPING.holdMs);
  } catch (e) { reportError('typing duck', e); }
}

/** A quiet play dips the music less: depth scales with the requested volume. */
function pulseDepth(amount, opts) { const v = clamp(opts.vol ?? 1, 0, 1); return 1 - (1 - amount) * v; }

/** One play of def `d` into an Audio.renderOffline dest at time t, with its music-bus dip (same as live). */
function scheduleInto(d, dest, t, opts, rng) {
  const E = makeEnv(dest.ctx, dest.bus(d.bus), dest.sendFor(d.bus), d, opts, rng, t);
  d.fn(E, opts);
  settleLevel(E);
  if (d.pulse && dest.duckPulse) { const [amt, at, ho, re] = d.pulse; dest.duckPulse('music', pulseDepth(amt, opts), { at: Math.max(0, t - at), attack: at, hold: ho, release: re }); }
  return E;
}

// Who sounds like what when their text types out (CANON char ids).
const SPEAKERS = {
  narrator: ['text_high', 1.0], hero: ['text_high', 1.0], system: ['text_high', 1.0],
  halvard: ['text_low', 0.82], barty: ['text_low', 1.12], mortmain: ['text_low', 0.9], malgrim: ['text_low', 0.62],
  rudolpho: ['text_low', 0.75], quiddle: ['text_low', 1.3], bertie: ['text_low', 1.4],
  willow: ['text_high', 1.0], sera: ['text_high', 1.12], elowen: ['text_high', 1.26], pru: ['text_high', 0.94],
  rowan: ['text_high', 1.18], linnet: ['text_high', 1.33], nettle: ['text_high', 0.8],
  bobble: ['text_monster', 1.15], pip: ['text_monster', 1.6], digby: ['text_monster', 0.85], monster: ['text_monster', 1.0],
};

// =================================================================================================================
/** For measurement: a bare voice environment (no jitter) writing into `out` at time t. */
export const _parts = { snap: (...a) => snap(...a), blade: (...a) => blade(...a) };
export function _testEnv(ctx, out, t = 0) { return makeEnv(ctx, out, null, { gain: 1, pj: 0, vj: 0, fj: 0 }, {}, mulberry32(1), t); }
/** For measurement pages only: register (or replace) a definition at runtime, so a prototype goes through the exact
 *  same play / render / renderInto path as the real library. Never called by the game. */
export function _define(id, meta, fn) { if (!DEFS.has(id)) ORDER.push(id); DEFS.set(id, { id, bus: 'sfx', gain: 1, ...meta, fn }); }
export const _lib = { driveCurve, snap, bodyBus, blade };

export const Sfx = {
  /** Play a sound. Never throws. Returns a handle {id, stop(ms)} or null (locked, rate-limited, unknown). */
  play(id, opts = {}) {
    try {
      const d = resolve(id, opts);
      if (!d) { if (!warnedUnknown[id]) { warnedUnknown[id] = 1; reportError('sfx', `unknown id "${id}"`); } return null; }
      const ctx = Audio.ctx; if (!ctx) return null;
      if (d.loop) return playLoop(d, opts);
      if (ctx.state !== 'running') return null; // don't pile sounds up behind a locked context
      const now = ctx.currentTime;
      if (d.minGap && lastAt[d.id] != null && now - lastAt[d.id] < d.minGap && now >= lastAt[d.id]) return null;
      lastAt[d.id] = now;
      prune(now);
      const mine = active.filter(v => v.id === d.id);
      if (d.poly && mine.length >= d.poly) stopVoice(mine[0], 25);
      if (active.length >= MAX_VOICES) stopVoice(active[0], 25);
      prune(now);
      const E = makeEnv(ctx, Audio.bus(d.bus), Audio.sendFor(d.bus), d, opts, mulberry32(seedFor(d.id, opts.variant)), now + 0.004 + (opts.delay || 0));
      d.fn(E, opts);
      settleLevel(E);
      scheduleCleanup(E);
      const v = { id: d.id, E, end: E.end };
      const handle = { id: d.id, stop: (ms = 60) => stopVoice(v, ms) };
      v.handle = handle;
      active.push(v);
      played++; recent.push(d.id); if (recent.length > 12) recent.shift();
      if (d.pulse) { const [amt, at, ho, re] = d.pulse; Audio.duckPulse('music', pulseDepth(amt, opts), { at: E.t - at, attack: at, hold: ho, release: re }); }
      if (d.duck) {
        const rel = Audio.duck('music', d.duck, 60);
        v.releaseDuck = rel;
        setTimeout(() => { if (v.releaseDuck === rel) { rel(400); v.releaseDuck = null; } }, Math.max(0, (E.end - now) * 1000 - 300));
      }
      return handle;
    } catch (e) { reportError('sfx ' + id, e); return null; }
  },

  /**
   * Text tick in a speaker's voice: Sfx.glyph('halvard'). Unknown speakers get the neutral high tick.
   * While text types, the music is held down (TYPING: to 0.7 over 120 ms, back over 700 ms once no glyph has come for
   * 2.5 s, or at once on Sfx.textDone()). The ticks read over the score even where nothing else ducks it; when the
   * game's dialogue duck (Audio.bindEvents: dialogue.start -> 0.55) is already holding the music, this adds nothing.
   */
  glyph(speaker = 'narrator', opts = {}) {
    const [id, pitch] = SPEAKERS[speaker] || SPEAKERS.narrator;
    if (!opts.noDuck) typingDuck();
    return Sfx.play(id, { ...opts, pitch: (opts.pitch ?? 1) * pitch });
  },
  /** The text has finished (or was skipped / closed): let the typing duck go now. */
  textDone(ms = TYPING.releaseMs) { clearTimeout(typingTimer); typingTimer = 0; Audio.releaseHold('typing', ms); },
  speakers() { return { ...SPEAKERS }; },

  /** Crossfade the single ambience bed. Sfx.ambience(null) fades it out. */
  ambience(id, opts = {}) {
    try {
      if (amb && amb.id === id) return amb.handle;
      if (amb) { amb.handle && amb.handle.stop(opts.fade ?? 1500); amb = null; }
      if (!id) return null;
      const h = Sfx.play(id, { fade: 1500, ...opts });
      if (h) amb = { id, handle: h };
      return h;
    } catch (e) { reportError('ambience', e); return null; }
  },

  /** Pre-render ambience loops so the first play starts instantly. */
  preload(ids = ['amb_meadow', 'amb_town', 'amb_cave', 'amb_night']) {
    const ctx = Audio.ctx; if (!ctx) return Promise.resolve();
    return Promise.all(ids.map(id => { const d = resolve(id); return d && d.loop ? renderLoop(d, ctx.sampleRate, 0).catch(() => null) : null; }));
  },

  stopAll(ms = 60) {
    for (const v of active) stopVoice(v, ms);
    active = [];
    if (amb) { amb.handle && amb.handle.stop(ms); amb = null; }
    Sfx.textDone(300);
  },

  list() { return ORDER.slice(); },
  has(id) { return !!resolve(id); },
  info(id) { const d = resolve(id); return d ? { id: d.id, group: d.group, bus: d.bus, desc: d.desc || '', loop: !!d.loop, loopSeconds: d.loop ? d.loop.len : 0 } : null; },
  groups() {
    const out = [];
    for (const id of ORDER) {
      const i = Sfx.info(id);
      let g = out.find(x => x.group === i.group); if (!g) out.push(g = { group: i.group, ids: [] });
      g.ids.push(i);
    }
    return out;
  },

  /**
   * Render a sound offline through the real mixer. opts.every (seconds) repeats it like live use (text at
   * 1/38 s, footsteps at a walking pace) with a fresh variation each time. Ambience renders its seamless loop,
   * looped for the requested length.
   */
  async render(id, seconds, opts = {}) {
    const d = resolve(id, opts);
    if (!d) throw new Error(`unknown sfx id "${id}"`);
    const sr = opts.sampleRate || Audio.sampleRate || 48000;
    if (d.loop) {
      // the same variant chain the game plays: v0 from its start, crossfading into v1, v2, v0 ...
      // opts.single renders just one variant looped end-to-end (to inspect a loop's own seam)
      const first = opts.variant ?? 0, secs = seconds ?? d.loop.len * 2;
      if (opts.single) {
        const buf = await renderLoop(d, sr, first);
        return Audio.renderOffline((octx, dest) => {
          const src = octx.createBufferSource(); src.buffer = buf; src.loop = true;
          const g = octx.createGain(); g.gain.value = (opts.vol ?? 1) * (d.gain ?? 1);
          src.connect(g); g.connect(dest.bus(d.bus)); src.start(0);
        }, secs, { sampleRate: sr });
      }
      // same order rule as live (never the same variant twice running), seeded so a render is repeatable
      const n = Math.max(1, Math.ceil(secs / Math.max(1, d.loop.len - BED_XF)) + 1), rnd = mulberry32(hashStr(d.id) + first);
      const order = [first % BED_VARIANTS];
      while (order.length < n) order.push(nextVariant(order[order.length - 1], rnd));
      const bufs = {};
      for (const v of new Set(order)) bufs[v] = await renderLoop(d, sr, v);
      return Audio.renderOffline((octx, dest) => {
        const g = octx.createGain(); g.gain.value = (opts.vol ?? 1) * (d.gain ?? 1);
        g.connect(dest.bus(d.bus));
        let t = 0;
        for (let k = 0; t < secs && k < order.length; k++) t = bedSegment(octx, g, bufs[order[k]], t, k ? rnd() * d.loop.len : 0, k > 0, null);
      }, secs, { sampleRate: sr });
    }
    return Audio.renderOffline((octx, dest) => {
      const rng = mulberry32(seedFor(d.id, opts.variant ?? 1));
      const reps = opts.every ? Math.max(1, Math.floor(((seconds ?? 1) - 0.1) / opts.every)) : 1;
      for (let k = 0; k < reps; k++) {
        const kr = mulberry32((rng() * 4294967296) >>> 0);
        scheduleInto(d, dest, 0.01 + k * (opts.every || 0), opts, kr);
      }
    }, seconds ?? 1.5, { sampleRate: sr });
  },

  /**
   * Schedule one play of `id` into an Audio.renderOffline `dest` at time `t` (seconds), exactly as Sfx.play would
   * live, music-bus dip included. For true-mix renders: battle music on dest.bus('music') with hits landing on it.
   */
  renderInto(id, dest, t = 0, opts = {}) {
    const d = resolve(id, opts);
    if (!d || d.loop || !dest || !dest.ctx) return false;
    scheduleInto(d, dest, t, opts, mulberry32(seedFor(d.id, opts.variant)));
    return true;
  },

  state() {
    const ctx = Audio.ctx;
    if (ctx) prune(ctx.currentTime);
    const h = amb && amb.handle;
    return { voices: active.length, played, last: recent.slice(-6), ambience: amb ? amb.id : null, ids: ORDER.length, typingDuck: Audio.holding('typing'),
      bed: h && h.loop ? { segments: h.k, last: h.last ?? null, next: h.next ?? null, scheduledAhead: h.gain && ctx ? +(h.nextAt - ctx.currentTime).toFixed(2) : 0 } : null };
  },
};

export default Sfx;
