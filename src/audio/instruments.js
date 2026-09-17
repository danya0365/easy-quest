/**
 * instruments.js — the orchestra. Every orchestral voice plays REAL RECORDED multisamples through sampler.js
 * (vendor/samples: VSCO 2 CE + VCSL, CC0; the horn's middle register from the University of Iowa MIS).   (P27)
 *
 * Synthesis is kept only where no recording exists: `twinkle` (the deliberate chiptune wink), `pad` (a wordless
 * choir "ah" — there is no CC0 choir multisample) and `vox` (Queen Elowen's wordless voice).
 *
 * Every voice is `VOICES[name](K, n, out) -> handle`
 *   K   = per-context kit (makeKit): ctx, quality, noise + LFOs for the three synth voices
 *   n   = {t, dur, m, f, vel, gain, pan, send, long, spb, o, path:[[sec,freq]], legato, bus, voice}
 *   out = {bus, send, long}
 *   handle = {t0, end, level(t), release(t, rt), cleanup()}
 * INSTRUMENTS_FOR[voice] lists the sample instruments a voice needs (music.js loads them before a theme plays).
 */
import { Sampler } from './sampler.js';

// amplitude per voice at vel=1 (samples are loudness-normalised to RMS 0.1; calibrated against single-note renders)
export const LEVEL = {
  horns: 1.9, hornSolo: 1.5, trumpet: 1.55, trombone: 1.7, tuba: 1.7,
  strings: 2.1, violin: 2.2, flute: 1.9, oboe: 1.6, clarinet: 2.3, bassoon: 2.0,
  harpsi: 1.15, harp: 1.15, timp: 2.6, snare: 1.2, cymbal: 1.35, pizz: 1.9, celesta: 1.0, organ: 1.65,
  bell: 1.7, tri: 0.55, twinkle: 0.45, pad: 0.17, vox: 0.157,
};
export const SEND = {
  horns: 0.30, hornSolo: 0.40, trumpet: 0.26, trombone: 0.30, tuba: 0.26, strings: 0.40, violin: 0.42, flute: 0.38,
  oboe: 0.40, clarinet: 0.38, bassoon: 0.34, harpsi: 0.26, harp: 0.45, timp: 0.45, snare: 0.20, cymbal: 0.45,
  pizz: 0.30, celesta: 0.50, organ: 0.55, twinkle: 0.18, pad: 0.70, vox: 0.50, bell: 0.55, tri: 0.45,
};
export const SEAT = {
  flute: 0.15, oboe: -0.12, clarinet: 0.10, bassoon: -0.08, hornSolo: -0.35, horns: -0.28, trumpet: 0.22, trombone: 0.30,
  tuba: 0.18, violin: 0.22, harp: 0.45, harpsi: -0.25, celesta: 0.35, timp: -0.12, snare: 0.10, cymbal: 0.20, organ: 0,
  pizz: -0.10, twinkle: 0.30, pad: 0, vox: 0.05, bell: -0.10, tri: 0.30,
};
/** strings are seated by register: violins left-centre-right, violas centre, celli and bass right */
export const seatPan = (voice, m) => {
  if (voice === 'strings') return m >= 67 ? -0.28 : m >= 55 ? 0.05 : 0.30;
  return SEAT[voice] ?? 0;
};
export const HUM = {
  hornSolo: [0.009, 0.06], violin: [0.009, 0.06], flute: [0.009, 0.06], oboe: [0.009, 0.06], clarinet: [0.009, 0.06],
  bassoon: [0.008, 0.05], vox: [0.009, 0.05], trumpet: [0.006, 0.05], trombone: [0.006, 0.05], tuba: [0.006, 0.04],
  horns: [0.0045, 0.03], strings: [0.0045, 0.03], pad: [0.0045, 0.03], pizz: [0.0045, 0.03], harp: [0.0045, 0.04],
  celesta: [0.004, 0.03], organ: [0.002, 0.0], twinkle: [0, 0], harpsi: [0.005, 0.03],
  timp: [0.003, 0.04], snare: [0.003, 0.05], cymbal: [0.003, 0.03], tri: [0.003, 0.03], bell: [0.003, 0.02],
};

/** the sample instruments each voice may use (all articulations it can switch to) */
export const INSTRUMENTS_FOR = {
  strings: ['strings', 'strings_spic', 'strings_trem', 'violin'], violin: ['violin'], horns: ['horn'], hornSolo: ['horn'],
  trumpet: ['trumpet'], trombone: ['trombone'], tuba: ['tuba'], flute: ['flute'], oboe: ['oboe'], clarinet: ['clarinet'],
  bassoon: ['bassoon'], harpsi: ['harpsichord'], harp: ['harp'], timp: ['timpani', 'timpani_roll'], snare: ['snare', 'snare_roll'],
  cymbal: ['cymbal', 'cymbal_roll'], pizz: ['pizz'], celesta: ['vibes', 'glock'], organ: ['organ'], bell: ['chimes'], tri: ['triangle'],
  twinkle: [], pad: [], vox: [],
};
export function instrumentsFor(events) {
  const s = new Set();
  for (const e of events) for (const id of INSTRUMENTS_FOR[e.voice] || []) s.add(id);
  return [...s];
}

/**
 * The sample requests a note makes: [[instrument, midi, vel, layerLo, layerHi, prefer]]. Mirrors the voice functions
 * below (keep them in step: a request the plan misses still plays, from the nearest decoded zone, and is counted in
 * Sampler.fallbacks). music.js turns a theme's plan into the zone files to fetch — a theme downloads only what it plays.
 */
export function planNote(n) {
  const v = n.voice, m = n.m ?? 60, vel = clamp(n.vel, 0.02, 1.15);
  switch (v) {
    case 'strings':
      if (m > STR_TOP && !n.o?.trem) return [['violin', m, vel, undefined, undefined, 0], ['violin', m, vel, undefined, undefined, 1]];
      return [[n.o?.trem ? 'strings_trem' : strShort(n) ? 'strings_spic' : 'strings', m, vel]];
    case 'violin': return [['violin', m, vel]];
    case 'horns': case 'hornSolo': return [['horn', hornM(m), vel]];
    case 'trumpet': return [['trumpet', m > 87 ? m - 12 : m, vel]];
    case 'trombone': case 'tuba': case 'flute': case 'oboe': case 'clarinet': case 'bassoon': case 'pizz': case 'harp':
      return [[v, m, vel]];
    case 'harpsi': return [['harpsichord', m, vel]];
    case 'celesta':
      if (m > 89) return [['glock', m, vel, 0.25, 0.9]];
      return m + 12 < 79 ? [['vibes', m, vel, 0.25, 0.9]] : [['vibes', m, vel, 0.25, 0.9], ['glock', m + 12, vel, 0.3, 1.2]];
    case 'bell': return [['chimes', m < 58 ? m + 12 : m, vel]];
    case 'tri': return [['triangle', m, vel]];
    case 'timp': return [[n.o?.roll ? 'timpani_roll' : 'timpani', m, vel]];
    case 'snare': return n.o?.roll ? [['snare_roll', m, vel]] : [['snare', m, vel, 0.15, 0.95]];
    case 'cymbal': return n.o?.roll ? [['cymbal_roll', m, vel]] : [['cymbal', m, vel, 0.15, 0.95]];
    case 'organ': {
      const r = [['organ', m, vel, 0.4, 0.8]];
      if (n.o?.pedal && m - 12 >= 24) r.push(['organ', m - 12, vel, 0.4, 0.8]);
      return r;
    }
    default: return [];
  }
}

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const cents = (c) => Math.pow(2, c / 1200);
const ftom = (f) => 69 + 12 * Math.log2(f / 440);

// ------------------------------------------------------------------------------------------------ kit
export function makeKit(ctx, { quality = 'high', seed = 1234 } = {}) {
  const offline = typeof OfflineAudioContext !== 'undefined' && ctx instanceof OfflineAudioContext;
  const K = { ctx, quality, sr: ctx.sampleRate, nyq: ctx.sampleRate / 2, offline, missed: 0 };
  let s = seed >>> 0;
  const rnd = () => { s = (s + 0x6d2b79f5) >>> 0; let x = s; x = Math.imul(x ^ (x >>> 15), x | 1); x ^= x + Math.imul(x ^ (x >>> 7), x | 61); return ((x ^ (x >>> 14)) >>> 0) / 4294967296; };
  K.rnd = rnd;
  let noise = null;
  Object.defineProperty(K, 'noise', { get() { // only the synth voices need it
    if (!noise) { const len = Math.floor(ctx.sampleRate * 2.5); noise = ctx.createBuffer(1, len, ctx.sampleRate); const d = noise.getChannelData(0); for (let i = 0; i < len; i++) d[i] = rnd() * 2 - 1; }
    return noise;
  } });
  const lfos = new Map();
  K.lfo = (rate) => { let o = lfos.get(rate); if (!o) { o = ctx.createOscillator(); o.frequency.value = rate; o.start(0); lfos.set(rate, o); } return o; };
  let drift = null;
  Object.defineProperty(K, 'drift', { get() {
    if (!drift) drift = [0.11, 0.137, 0.163].map((r, i) => { const o = ctx.createOscillator(); o.frequency.value = r; o.start(i * 0.7 + 0.01); const g = ctx.createGain(); g.gain.value = 3; o.connect(g); return g; });
    return drift;
  } });
  const waves = {};
  K.wave = (name) => waves[name] || (waves[name] = (() => {
    const n = 64, re = new Float32Array(n), im = new Float32Array(n);
    for (let k = 1; k < n; k++) im[k] = (2 / (k * Math.PI)) * Math.sin(k * Math.PI * 0.25) * 0.9; // 25% pulse
    return ctx.createPeriodicWave(re, im, { disableNormalization: true });
  })());
  return K;
}

// ------------------------------------------------------------------------------------------------ plumbing
const G = (ctx, v = 1) => { const g = ctx.createGain(); g.gain.value = v; return g; };
const O = (ctx, type, f, det = 0) => { const o = ctx.createOscillator(); if (typeof type === 'string') o.type = type; else o.setPeriodicWave(type); o.frequency.value = f; if (det) o.detune.value = det; return o; };
const BQ = (ctx, type, f, Q = 0.707, dB = 0) => { const b = ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = Q; if (dB) b.gain.value = dB; return b; };
const disc = (src, dst) => { try { src.disconnect(dst); } catch (e) { /* ignore */ } };

/** pan + dry bus + reverb sends for one note; returns the node a voice feeds */
function channel(K, n, out, panOverride) {
  const { ctx } = K;
  const p = ctx.createStereoPanner(); p.pan.value = clamp(panOverride ?? n.pan ?? 0, -1, 1);
  p.connect(out.bus);
  let s = null, l = null;
  if (n.send > 0 && out.send) { s = G(ctx, n.send); p.connect(s); s.connect(out.send); }
  if (n.long > 0 && out.long) { l = G(ctx, n.long); p.connect(l); l.connect(out.long); }
  return { node: p, dispose() { try { p.disconnect(); if (s) s.disconnect(); if (l) l.disconnect(); } catch (e) { /* ignore */ } } };
}
const silent = (t) => ({ t0: t, end: t, peak: 0, level: () => 0, release() {}, cleanup() {} });

/** several sampler handles (section players, articulation layers) as one voice handle */
function combine(K, t, hs, disposers) {
  const live = hs.filter(Boolean);
  if (!live.length) { K.missed++; for (const d of disposers) d(); return silent(t); }
  const h = {
    t0: t, end: Math.max(...live.map((x) => x.end)), peak: live.reduce((a, x) => a + x.peak, 0),
    level(tt) { let v = 0; for (const x of live) v += x.level(tt); return v; },
    release(tt, rt) { for (const x of live) x.release(tt, rt); h.end = Math.min(h.end, Math.max(...live.map((x) => x.end))); },
    cleanup() { for (const x of live) x.cleanup(); for (const d of disposers) d(); },
  };
  return h;
}

const pathMidi = (n) => (n.path ? n.path.map(([sec, f]) => [sec, ftom(f)]) : null);
const velOf = (n) => clamp(n.vel, 0.02, 1.15);

/**
 * A plain sampled voice: one player, optional tone filter.
 * cfg: {inst, rel, attack(n), ring, damp, tone(n)->Hz|null, legato (allow auto-legato), detune, offset, layerLo, layerHi, tr (semitones)}
 */
function sampled(voice, cfg) {
  return (K, n, out) => {
    const { ctx } = K;
    const inst = typeof cfg.inst === 'function' ? cfg.inst(n) : cfg.inst;
    if (!inst) return silent(n.t);
    const ch = channel(K, n, out);
    let dest = ch.node; let filt = null;
    const hz = cfg.tone ? cfg.tone(n) : null;
    if (hz) { filt = BQ(ctx, 'lowpass', Math.min(hz, K.nyq * 0.95), 0.6); filt.connect(ch.node); dest = filt; }
    // solo recordings carry the room's rumble under the lowest note; cut below the instrument
    let hpf = null;
    if (cfg.hp) { hpf = BQ(ctx, 'highpass', cfg.hp, 0.6); hpf.connect(dest); dest = hpf; }
    const tr = cfg.tr ? cfg.tr(n) : 0;
    const vel = velOf(n);
    const p = {
      t: n.t, dur: n.dur, m: (n.m ?? 60) + tr, vel, amp: LEVEL[voice] * vel * n.gain * (cfg.ampMul ? cfg.ampMul(n) : 1),
      rel: n.o?.rel ?? (typeof cfg.rel === 'function' ? cfg.rel(n) : cfg.rel ?? 0.25),
      attack: n.o?.attack ?? (cfg.attack ? cfg.attack(n) : 0), swell: n.o?.swell ?? (cfg.swell ? cfg.swell(n) : 1),
      ring: cfg.ring, damp: n.o?.damp ?? cfg.damp, detune: (cfg.detune ? cfg.detune(K, n) : 0),
      offset: cfg.offset ? cfg.offset(K, n) : 0, layerLo: cfg.layerLo, layerHi: cfg.layerHi,
      legato: cfg.legato && n.legato, portamento: cfg.portamento,
      path: n.path && cfg.legato ? pathMidi(n).map(([s, m]) => [s, m + tr]) : null,
      bend: cfg.bend ? cfg.bend(n) : null, tau: cfg.tau,
    };
    const h = Sampler.note(ctx, inst, p, dest);
    return combine(K, n.t, [h], [ch.dispose, () => { try { if (filt) filt.disconnect(); if (hpf) hpf.disconnect(); } catch (e) { /* ignore */ } }]);
  };
}

// ------------------------------------------------------------------------------------------------ voices
export const VOICES = {};

// STRINGS (section): sustain with vibrato; spiccato for short notes; bowed tremolo for o.trem; slurs crossfade
const strShort = (n) => !n.o?.trem && (n.art === 'staccato' || n.dur < 0.17 || (n.art === 'marcato' && n.dur < 0.3));
const STR_TOP = 88; // E6: above the section recordings the firsts divide — two solo violins, a little apart
const stringsSection = sampled('strings', {
  inst: (n) => (n.o?.trem ? 'strings_trem' : strShort(n) ? 'strings_spic' : 'strings'),
  rel: (n) => (strShort(n) ? 0.12 : clamp(n.dur * 0.35, 0.18, 0.5)),
  // pads and slow chords bow in; lines speak with the sample's own attack
  attack: (n) => (n.o?.trem || strShort(n) ? 0 : n.bus === 'harmony' || n.bus === 'bass' && n.dur > 1.2 ? clamp(n.dur * 0.18, 0.06, 0.35) : 0),
  swell: (n) => (n.dur >= 1.6 && !n.o?.trem && !strShort(n) ? 1.12 : 1),
  ring: false, legato: true, portamento: true,
  ampMul: (n) => (n.o?.trem ? 0.8 : strShort(n) ? 1.05 : 1),
  offset: (K, n) => (strShort(n) ? K.rnd() * 0.002 : K.rnd() * 0.012),
  detune: (K) => (K.rnd() - 0.5) * 6,
});
VOICES.strings = (K, n, out) => {
  if ((n.m ?? 0) <= STR_TOP || n.o?.trem) return stringsSection(K, n, out);
  const hs = [], ds = [];
  for (let k = 0; k < 2; k++) {
    const ch = channel(K, n, out, clamp((n.pan ?? 0) + (k ? 0.18 : -0.18), -1, 1)); ds.push(ch.dispose);
    hs.push(Sampler.note(K.ctx, 'violin', {
      t: n.t + k * 0.009, dur: n.dur, m: n.m, vel: velOf(n), amp: LEVEL.violin * velOf(n) * n.gain * 0.62, rel: n.o?.rel ?? 0.3,
      attack: n.o?.attack ?? 0, swell: n.o?.swell ?? 1, detune: k ? 2 : -2, prefer: k, offset: K.rnd() * 0.01, legato: n.legato,
    }, ch.node));
  }
  return combine(K, n.t, hs, ds);
};

// SOLO VIOLIN
VOICES.violin = sampled('violin', {
  inst: 'violin', rel: 0.3, hp: 150, ring: false, legato: true, portamento: true,
  swell: (n) => (n.dur > 1.5 ? 1.1 : 1), offset: (K) => K.rnd() * 0.006,
});

// HORN SECTION — the section is WRITTEN as parts (1st-4th horn on their own notes); each note is one real player.
// (Three detuned copies of the same take used to be stacked for width: they phase-beat 5-6 dB every 1.5 s.)
// The recordings are fortissimo takes, darkened by a velocity low-pass (a horn's piano is round, its fortissimo buzzes).
const hornTone = (vel) => 900 + 12000 * Math.pow(clamp((vel - 0.12) / 0.85, 0, 1), 1.8);
const hornM = (m) => ((m ?? 0) > 78 ? m - 12 : m); // a horn cannot play above F5 (the recordings stop there too)
VOICES.horns = (K, n, out) => {
  const { ctx } = K;
  const vel = velOf(n);
  n = { ...n, m: hornM(n.m) };
  const short = n.art === 'staccato' || n.dur < 0.18;
  const ch = channel(K, n, out);
  const lp = BQ(ctx, 'lowpass', hornTone(vel), 0.5); lp.connect(ch.node);
  const hp = BQ(ctx, 'highpass', 70, 0.6); hp.connect(lp); // the anechoic chamber's rumble sits under every horn note
  const h = Sampler.note(ctx, 'horn', {
    t: n.t, dur: Math.max(0.05, n.dur), m: n.m, vel, amp: LEVEL.horns * vel * n.gain * 0.95,
    rel: n.o?.rel ?? (short ? 0.09 : 0.24), attack: n.o?.attack ?? (vel < 0.4 ? 0.05 : 0.0), swell: n.o?.swell ?? 1,
    offset: K.rnd() * 0.004, legato: n.legato,
  }, hp);
  return combine(K, n.t, [h], [ch.dispose, () => { disc(lp); disc(hp); }]);
};

// SOLO HORN — one player, a little rounder
VOICES.hornSolo = sampled('hornSolo', {
  inst: 'horn', rel: 0.32, legato: true, hp: 70, attack: (n) => (velOf(n) < 0.5 ? 0.06 : 0.02),
  tone: (n) => hornTone(velOf(n)) * 0.8, swell: (n) => (n.dur > 1.2 ? 1.08 : 1), offset: (K) => K.rnd() * 0.004,
});

// BRASS
VOICES.trumpet = sampled('trumpet', { inst: 'trumpet', hp: 140, tr: (n) => ((n.m ?? 0) > 87 ? -12 : 0), rel: (n) => (n.dur < 0.2 ? 0.08 : 0.2), offset: (K) => K.rnd() * 0.003, detune: (K) => (K.rnd() - 0.5) * 4 });
// (G3 and B-flat3 are single fortissimo takes: below mf every trombone note is gently darkened so they match their soft neighbours)
VOICES.trombone = sampled('trombone', { inst: 'trombone', tone: (n) => (velOf(n) >= 0.6 ? null : 1800 + 16000 * Math.pow(clamp((velOf(n) - 0.1) / 0.5, 0, 1), 2)), rel: (n) => (n.dur < 0.2 ? 0.1 : 0.25), offset: (K) => K.rnd() * 0.004, detune: (K) => (K.rnd() - 0.5) * 4 });
VOICES.tuba = sampled('tuba', { inst: 'tuba', rel: 0.25, offset: (K) => K.rnd() * 0.004 });

// WOODWINDS
VOICES.flute = sampled('flute', { inst: 'flute', rel: 0.18, hp: 190, legato: true, attack: (n) => (velOf(n) < 0.35 ? 0.04 : 0), offset: (K) => K.rnd() * 0.004 });
VOICES.oboe = sampled('oboe', {
  inst: 'oboe', rel: 0.22, hp: 180, legato: true, offset: (K) => K.rnd() * 0.004,
  // the father's fall: the fourth note sags (o.falter)
  bend: (n) => (n.o?.falter ? [[n.dur * 0.35, 0], [n.dur, -32]] : null), swell: (n) => (n.o?.falter ? 0.6 : n.dur > 1.2 ? 1.05 : 1),
});
VOICES.clarinet = sampled('clarinet', { inst: 'clarinet', rel: 0.2, hp: 110, legato: true, offset: (K) => K.rnd() * 0.004 });
VOICES.bassoon = sampled('bassoon', { inst: 'bassoon', rel: 0.2, legato: true, offset: (K) => K.rnd() * 0.004 });

// PLUCKED / STRUCK
VOICES.pizz = sampled('pizz', { inst: 'pizz', ring: true, rel: 0.12, offset: (K) => K.rnd() * 0.002, tau: 0.25 });
VOICES.harp = sampled('harp', { inst: 'harp', ring: true, rel: 0.3, tau: 0.8 });
VOICES.harpsi = sampled('harpsi', { inst: 'harpsichord', ring: false, rel: 0.12, tau: 0.5 }); // the damper falls at key release
// CELESTA: a vibraphone struck with soft mallets (motor off) up to F6 — pure and round, the celesta's own body — with a
// whisper of glockenspiel an octave up for the steel plate's shimmer; the glockenspiel alone above F6
const celBody = sampled('celesta', { inst: 'vibes', ring: true, rel: 0.4, tau: 0.7, layerLo: 0.25, layerHi: 0.9, ampMul: () => 1.25 });
const celShine = sampled('celesta', { inst: 'glock', ring: true, rel: 0.3, tau: 0.4, tone: () => 7500, layerLo: 0.3, layerHi: 1.2, tr: () => 12, ampMul: () => 0.16 });
const celTop = sampled('celesta', { inst: 'glock', ring: true, rel: 0.4, tau: 0.6, tone: () => 7000, layerLo: 0.25, layerHi: 0.9, ampMul: () => 0.8 });
VOICES.celesta = (K, n, out) => {
  if ((n.m ?? 80) > 89) return celTop(K, n, out);
  const a = celBody(K, n, out);
  if ((n.m ?? 80) + 12 < 79 || K.quality === 'low') return a;
  const b = celShine(K, n, out);
  return { t0: a.t0, end: Math.max(a.end, b.end), peak: a.peak + b.peak, level: (t) => a.level(t) + b.level(t),
    release(t, rt) { a.release(t, rt); b.release(t, rt); }, cleanup() { a.cleanup(); b.cleanup(); } };
};
VOICES.bell = sampled('bell', {
  inst: 'chimes', ring: true, rel: 1.2, tau: 1.6, tr: (n) => ((n.m ?? 62) < 58 ? 12 : 0),
  detune: (K, n) => (n.o?.wrong ? -45 : 0), tone: (n) => (n.o?.wrong ? 3200 : null),
});
VOICES.tri = sampled('tri', { inst: 'triangle', ring: true, tau: 0.7 });

// TIMPANI: hits ring (o.damp stops them); rolls are a looped roll recording riding a crescendo
const timpHit = sampled('timp', { inst: 'timpani', ring: true, tau: 0.45, hp: 38, offset: (K) => K.rnd() * 0.002 });
const timpRoll = sampled('timp', { inst: 'timpani_roll', rel: 0.12, attack: () => 0.06, swell: (n) => n.o.roll.swell, ampMul: () => 0.85 });
VOICES.timp = (K, n, out) => (n.o?.roll ? timpRoll : timpHit)(K, n, out);
const snareHit = sampled('snare', { inst: 'snare', ring: true, tau: 0.08, layerLo: 0.15, layerHi: 0.95, offset: (K) => K.rnd() * 0.001 });
const snareRoll = sampled('snare', { inst: 'snare_roll', rel: 0.06, attack: () => 0.04, swell: (n) => n.o.roll.swell, ampMul: () => 0.7 });
VOICES.snare = (K, n, out) => (n.o?.roll ? snareRoll : snareHit)(K, n, out);
const cymCrash = sampled('cymbal', { inst: 'cymbal', ring: true, tau: 1.0, layerLo: 0.15, layerHi: 0.95 });
const cymChoke = sampled('cymbal', { inst: 'cymbal', damp: true, rel: 0.12, tau: 0.3, layerLo: 0.15, layerHi: 0.95 });
const cymSwell = sampled('cymbal', { inst: 'cymbal_roll', ring: true, tau: 1.5 });
VOICES.cymbal = (K, n, out) => (n.o?.roll ? cymSwell : n.o?.choke ? cymChoke : cymCrash)(K, n, out);

// CHURCH ORGAN: quiet flue registration below mf, full open diapasons above; holds forever, the room empties slowly
const organMan = sampled('organ', { inst: 'organ', rel: 0.5, layerLo: 0.4, layerHi: 0.8, attack: () => 0.02 });
const organ16 = sampled('organ', { inst: 'organ', rel: 0.6, layerLo: 0.4, layerHi: 0.8, attack: () => 0.06, tr: () => -12, ampMul: () => 0.8 });
// o.pedal: the pedal line speaks at 8' and 16' together — the recorded pedal pipes an octave down give the floor its weight
VOICES.organ = (K, n, out) => {
  if (!n.o?.pedal || (n.m ?? 0) - 12 < 24) return organMan(K, n, out);
  const a = organMan(K, { ...n, gain: n.gain * 0.75 }, out), b = organ16(K, n, out);
  return { t0: a.t0, end: Math.max(a.end, b.end), peak: a.peak + b.peak, level: (t) => a.level(t) + b.level(t),
    release(t, rt) { a.release(t, rt); b.release(t, rt); }, cleanup() { a.cleanup(); b.cleanup(); } };
};

// ------------------------------------------------------------------------------------------------ synth (no recording exists)
function finish(K, n, out, node, end, srcs, amps, lvl, extra) {
  const ch = channel(K, n, out);
  node.connect(ch.node);
  const h = {
    t0: n.t, end, peak: lvl.peak,
    level(t) { if (t >= h.end) return 0; if (t <= n.t) return lvl.peak; return lvl.tau ? lvl.peak * Math.exp(-(t - n.t) / lvl.tau) : lvl.peak * (lvl.S ?? 1); },
    release(t, rt = 0.04) {
      for (const a of amps) { try { if (a.cancelAndHoldAtTime) a.cancelAndHoldAtTime(t); else a.cancelScheduledValues(t); a.setTargetAtTime(0, t, rt / 4); } catch (e) { /* ignore */ } }
      const stopT = t + rt * 2 + 0.02;
      for (const o of srcs) { try { o.stop(stopT); } catch (e) { /* ignore */ } }
      h.end = Math.min(h.end, stopT);
    },
    cleanup() { try { node.disconnect(); } catch (e) { /* ignore */ } ch.dispose(); if (extra) extra(); },
  };
  return h;
}
function envASR(p, t, tOff, peak, A, D, S, R, sw = 1) {
  const tA = t + A, tD = Math.min(tA + D, Math.max(tA, tOff));
  p.setValueAtTime(0, t); p.linearRampToValueAtTime(peak, tA);
  const at = tD > tA + 1e-4 ? peak + (peak * S - peak) * ((tD - tA) / D) : peak;
  if (tD > tA + 1e-4) p.linearRampToValueAtTime(at, tD);
  const rel = Math.max(tOff, tD);
  if (rel > tD + 0.02 && sw !== 1) p.linearRampToValueAtTime(at * sw, rel);
  p.setTargetAtTime(0, rel + 0.001, R / 5);
}
const startRP = (K, o, t, end) => { const f = Math.max(20, o.frequency.value); o.start(Math.max(0, t - K.rnd() / f)); o.stop(end); };
function applyPath(n, oscs) {
  if (!n.path) return;
  let prev = n.f;
  for (let i = 1; i < n.path.length; i++) {
    const [sec, f] = n.path[i]; const ts = n.t + sec; const semis = Math.abs(12 * Math.log2(f / prev));
    for (const o of oscs) { if (semis <= 3.01 && semis > 0) { o.frequency.setValueAtTime(prev, ts - 0.02); o.frequency.exponentialRampToValueAtTime(f, ts + 0.02); } else o.frequency.setValueAtTime(f, ts); }
    prev = f;
  }
}

// TWINKLE — raw 25% pulse, NES 60 Hz arpeggio. The wink (MUSIC-BIBLE 1.15): deliberately a chip, not an instrument.
VOICES.twinkle = (K, n, out) => {
  const { ctx } = K; const { t, f } = n;
  const tOff = t + Math.max(n.dur, 0.02), end = tOff + 0.11;
  const peak = LEVEL.twinkle * velOf(n) * n.gain;
  const o = O(ctx, K.wave('pulse25'), f);
  const arp = n.o?.arp;
  if (arp && arp.length) { for (let k = 0, ts = t; ts < tOff; k++, ts = t + k / 60) o.frequency.setValueAtTime(f * Math.pow(2, arp[k % arp.length] / 12), ts); }
  const amp = G(ctx, 0); envASR(amp.gain, t, tOff, peak, 0.001, 0.06, 0.45, 0.05);
  o.connect(amp); o.start(t); o.stop(end);
  return finish(K, n, out, amp, end, [o], [amp.gain], { peak, S: 0.45 });
};

// PAD — the wordless choir "ah" (three saws through vowel formants), always far back and quiet
VOICES.pad = (K, n, out) => {
  const { ctx } = K; const { t, f } = n;
  const A = Math.min(n.o?.attack ?? 0.9, Math.max(0.05, n.dur * 0.45)), R = n.o?.rel ?? 1.2;
  const tOff = t + Math.max(n.dur, A + 0.01), end = tOff + R * 1.6 + 0.05;
  const peak = LEVEL.pad * velOf(n) * n.gain;
  const mer = G(ctx, 1);
  const vib = G(ctx, 0); vib.gain.setValueAtTime(0, t + 0.6); vib.gain.linearRampToValueAtTime(6, t + 1.4); K.lfo(4.9).connect(vib);
  const oscs = [-9, 0, 9].map((d, i) => { const o = O(ctx, 'sawtooth', f, d); K.drift[i].connect(o.detune); vib.connect(o.detune); o.connect(mer); startRP(K, o, t, end); return o; });
  applyPath(n, oscs);
  const lp = BQ(ctx, 'lowpass', 1400, 0.7), p1 = BQ(ctx, 'peaking', 730, 5, 7), p2 = BQ(ctx, 'peaking', 1090, 6, 6), p3 = BQ(ctx, 'peaking', 2440, 7, 5);
  const amp = G(ctx, 0); envASR(amp.gain, t, tOff, peak * 0.66, A, 0.4, 0.85, R, n.o?.swell ?? 1);
  mer.connect(lp); lp.connect(p1); p1.connect(p2); p2.connect(p3); p3.connect(amp);
  return finish(K, n, out, amp, end, oscs, [amp.gain], { peak, S: 0.85 }, () => { oscs.forEach((o, i) => disc(K.drift[i], o.detune)); disc(K.lfo(4.9), vib); });
};

// VOX — Queen Elowen's single wordless voice: "oo" formants, breath, a singer's vibrato and slurs
VOICES.vox = (K, n, out) => {
  const { ctx } = K; const { t, f } = n;
  const A = Math.min(0.14, n.dur * 0.4), R = n.o?.rel ?? 0.45;
  const tOff = t + Math.max(n.dur, A + 0.01), end = tOff + R * 1.6 + 0.05;
  const peak = LEVEL.vox * velOf(n) * n.gain;
  const mix = G(ctx, 1); const vib = G(ctx, 0);
  const oscs = [['sawtooth', 0, 0.45], ['triangle', 4, 0.55]].map(([ty, d, g]) => {
    const o = O(ctx, ty, f, d); const gg = G(ctx, g); o.connect(gg); gg.connect(mix);
    o.detune.setValueAtTime(d - 30, t); o.detune.linearRampToValueAtTime(d, t + 0.12);
    vib.connect(o.detune); startRP(K, o, t, end); return o;
  });
  vib.gain.setValueAtTime(0, t + 0.28); vib.gain.linearRampToValueAtTime(22, t + 0.7); K.lfo(5.3).connect(vib);
  applyPath(n, oscs);
  const hp = BQ(ctx, 'highpass', 150, 0.7), f1 = BQ(ctx, 'peaking', 450, 4, 11), f2 = BQ(ctx, 'peaking', 950, 5, 6), f3 = BQ(ctx, 'peaking', 2700, 5, 5), lp = BQ(ctx, 'lowpass', 3200, 0.7);
  const amp = G(ctx, 0); envASR(amp.gain, t, tOff, peak, A, 0.25, 0.88, R, n.o?.swell ?? 1.08);
  mix.connect(hp); hp.connect(f1); f1.connect(f2); f2.connect(f3); f3.connect(lp); lp.connect(amp);
  const nz = ctx.createBufferSource(); nz.buffer = K.noise; nz.loop = true; nz.start(t, K.rnd() * 2); nz.stop(end);
  const nb = BQ(ctx, 'bandpass', 2800, 1), ng = G(ctx, 0);
  envASR(ng.gain, t, tOff, peak * 0.05, 0.05, 0.1, 0.5, R);
  nz.connect(nb); nb.connect(ng);
  const sum = G(ctx, 1); amp.connect(sum); ng.connect(sum);
  return finish(K, n, out, sum, end, [...oscs, nz], [amp.gain, ng.gain], { peak, S: 0.88 }, () => disc(K.lfo(5.3), vib));
};

// ------------------------------------------------------------------------------------------------ reverb
export const IR_SPECS = {
  HALL: { seconds: 2.6, decayExp: 2.4, tiltHz: 9500, taps: [[11, 0.35], [17, 0.28], [23, 0.24], [31, 0.19], [43, 0.14], [59, 0.10]] },
  ROOM: { seconds: 1.1, decayExp: 3.1, tiltHz: 5200, taps: [[7, 0.40], [13, 0.30], [19, 0.22], [27, 0.15]] },
  CHAPEL: { seconds: 4.2, decayExp: 1.7, tiltHz: 6000, taps: [[23, 0.30], [37, 0.26], [53, 0.22], [71, 0.18], [97, 0.13], [127, 0.09]] },
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
      const fl = Math.floor(sr * 0.03); for (let i = 0; i < fl; i++) buf[n - 1 - i] *= i / fl;
      return buf;
    });
    irCache.set(key, data);
  }
  const b = ctx.createBuffer(2, data[0].length, sr);
  b.getChannelData(0).set(data[0]); b.getChannelData(1).set(data[1]);
  return b;
}

/** Cheap reverb for quality 'low': four damped feedback combs + two early taps (see git history for the derivation). */
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
