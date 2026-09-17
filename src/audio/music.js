/**
 * music.js — the symphonic score (MUSIC-BIBLE), sequenced live and played by REAL RECORDED multisampled instruments
 * (sampler.js + vendor/samples). (P27, owner: src/audio/music.js, instruments.js, sampler.js, score/*)
 *
 *   Music.init({ctx, output, reverbSend, setSpace, quality}?)  inject a context/bus, or omit to build our own
 *   Music.play(themeId, {fade=1.2, at, startBeat, resume, bloom})  crossfade; seamless beat-clock loops
 *   Music.stop({fade})                 Music.duck(amount, ms)   (ms = hold; omitted = stay ducked; amount>=1 restores)
 *   Music.stinger(id, opts)            battle_start · victory · level_up · item_get · join · inn · sad_sting
 *   Music.themes() -> [{id,title,bpm,bars,kind,key,loopSec,introSec}]
 *   Music.renderOffline(id, seconds, {raw, quality}) -> Promise<AudioBuffer>   same graph, OfflineAudioContext
 *   Music.state() -> {theme, loading, bar, beat, iteration, voices, ducked, ctxState, quality, space, steals, missed, sampler}
 *
 * Samples load lazily per theme: Music.play(id) fetches + decodes that theme's instruments first and starts the theme
 * the moment they are ready (the old theme keeps playing meanwhile; the new one crossfades in). The fanfare/battle
 * instruments are warmed in the background after the first play so stingers are instant. renderOffline awaits every
 * instrument the cue needs before rendering, so an offline render never has a sample dropout.
 *
 * Graph (§2.3, standalone):
 *   voice ─► part bus (per performance) ─► perf.dry ─► THEME_SUM ─► DUCK ─► MUSIC ─► [output | MASTER]
 *   voice ─► send ─► perf.send ─► space.inTheme (ducked) ─► predelay ─► HP180 ─► convolver ─► LP ─► verb ─► MUSIC
 *   stinger perfs ─► STING_SUM ─► MUSIC (never ducked)
 *   MASTER = compressor(-14, knee 8, 3:1, 6 ms, 180 ms) ─► masterGain ─► limiter ─► destination
 * Loops (§5.3): a beat clock that never resets; a note whose tail crosses the seam simply keeps ringing.
 */
import { makeKit, VOICES, SEND, HUM, seatPan, makeIR, makeFDN, instrumentsFor } from './instruments.js';
import { Sampler } from './sampler.js';
import { THEMES, ALIASES, STINGER_THEME, STINGER_IDS } from './score/index.js';
import { mtof } from './score/_lib.js';

const BUS_LEVEL = { melody: 0.95, counter: 0.62, harmony: 0.55, bass: 0.70, perc: 0.66 };
const SPACE = {
  HALL: { ir: 'HALL', pre: 0.018, lp: 9500, ext: 'hall', wet: 1.1 },
  ROOM: { ir: 'ROOM', pre: 0.008, lp: 8500, ext: 'room' },
  CHAPEL: { ir: 'CHAPEL', pre: 0.034, lp: 8000, ext: 'chapel' },
  DUNGEON: { ir: 'HALL', pre: 0.042, lp: 3400, ext: 'cave', wet: 1.2 },
};
const CAP = { high: 64, med: 44, low: 26 }; // a sampled note is a buffer source + gains: far cheaper than an oscillator stack
/** voices whose consecutive notes in a single-line part are slurred (the new note skips its attack, the old one crossfades out) */
const LEGATO = new Set(['strings', 'violin', 'flute', 'oboe', 'clarinet', 'bassoon', 'hornSolo']);
/** warmed after the first play: every stinger and the battle theme */
const WARM = ['battle_start', 'battle', 'victory', 'levelup', 'befriend', 'item_get', 'sad_sting', 'inn.sleep'];
const MAX_WAIT = 8; // seconds a requested theme may wait for its samples before starting anyway
const LOOKAHEAD = 0.15, PUMP_MS = 25;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const ART = { staccato: 0.5, marcato: 0.78, tenuto: 0.96, legato: 1.0 };
/** Loudness follows the marking more steeply than the bible's linear gains (pp .18 ... ff .92): an orchestra's ff is not
 * 1.4 dB above its f. Normalised at mf so single-voice calibration holds; ff +2.2 dB, p -3.6 dB, pp -6.2 dB extra. */
const dynLoud = (vel) => Math.pow(Math.max(0.02, vel) / 0.6, 0.6);

function report(where, e) {
  try {
    const msg = `[music] ${where}: ${e && e.message ? e.message : e}`;
    if (typeof window !== 'undefined') { window.__DQ = window.__DQ || {}; (window.__DQ.errors ||= []).push(msg); }
    console.warn(msg);
  } catch (_) { /* never throw from the error path */ }
}
function hash(str) { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
function rng32(seed) { let s = seed >>> 0; return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function eqCurve(from, to, n = 64) {
  const c = new Float32Array(n);
  for (let i = 0; i < n; i++) { const x = i / (n - 1); c[i] = to > from ? from + (to - from) * Math.sin(x * Math.PI / 2) : to + (from - to) * Math.cos(x * Math.PI / 2); }
  return c;
}
function rampParam(p, t, dur, to, eq = true) {
  try {
    const from = p.value;
    if (p.cancelAndHoldAtTime) p.cancelAndHoldAtTime(t); else { p.cancelScheduledValues(t); p.setValueAtTime(from, t); }
    if (dur < 0.03) { p.setTargetAtTime(to, t, Math.max(0.004, dur / 3)); return; }
    if (eq) p.setValueCurveAtTime(eqCurve(from, to), t + 0.0005, dur); else p.linearRampToValueAtTime(to, t + dur);
  } catch (e) {
    try { p.cancelScheduledValues(t); p.setTargetAtTime(to, t, Math.max(0.01, dur / 4)); } catch (_) { report('ramp', e); }
  }
}

export function createMusic() {
  let E = null;

  // -------------------------------------------------------------------------------------------- init / mixer
  function init(opts = {}) {
    if (E && !opts.ctx) return api;
    try {
      let ctx = opts.ctx;
      if (!ctx) {
        const AC = typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext);
        if (!AC) { report('init', 'Web Audio unavailable'); return api; }
        ctx = new AC({ latencyHint: 'interactive' });
      }
      const offline = typeof OfflineAudioContext !== 'undefined' && ctx instanceof OfflineAudioContext;
      const quality = opts.quality || 'high';
      const g = (v) => { const n = ctx.createGain(); n.gain.value = v; return n; };
      E = {
        ctx, offline, quality, kit: makeKit(ctx, { quality }), perfs: [], handles: [], current: null, steals: 0,
        spaces: {}, injectedSend: opts.reverbSend || null, setSpaceCb: opts.setSpace || null, space: null,
        duckLevel: 1, lastPump: 0, timer: null, lastPositions: {}, raw: !!opts.raw, verbMul: opts.verbMul, busMul: opts.busMul,
      };
      E.music = g(0.85);
      E.hp = ctx.createBiquadFilter(); E.hp.type = 'highpass'; E.hp.frequency.value = 38; E.hp.Q.value = 0.7;
      // the recording's "presence": sampled sections recorded at a distance read a little veiled next to a game's SFX,
      // so the music bus gets a gentle lift at 2.5 kHz and an air shelf above 6 kHz (an orchestral mastering move)
      const pres = ctx.createBiquadFilter(); pres.type = 'peaking'; pres.frequency.value = 2600; pres.Q.value = 0.7; pres.gain.value = 1.5;
      const air = ctx.createBiquadFilter(); air.type = 'highshelf'; air.frequency.value = 6000; air.gain.value = 3;
      E.themeSum = g(1); E.duck = g(1); E.stingSum = g(1);
      E.themeSum.connect(E.duck); E.duck.connect(E.music); E.stingSum.connect(E.music);
      if (E.injectedSend) { E.sendDuck = g(1); E.sendDuck.connect(E.injectedSend); }
      E.music.connect(E.hp);
      E.hp.connect(pres); pres.connect(air);
      const tail = air;
      if (opts.output) tail.connect(opts.output);
      else if (opts.raw) tail.connect(ctx.destination);
      else {
        const comp = ctx.createDynamicsCompressor();
        // gentler than the bible's -14 dB 3:1: that setting ate the score's dynamics (an ff restatement measured +0.6 dB)
        comp.threshold.value = -10; comp.knee.value = 8; comp.ratio.value = 2.2; comp.attack.value = 0.012; comp.release.value = 0.25;
        const master = g(opts.masterGain ?? 0.80);
        const lim = ctx.createDynamicsCompressor();
        lim.threshold.value = -1.5; lim.knee.value = 0; lim.ratio.value = 20; lim.attack.value = 0.001; lim.release.value = 0.08;
        tail.connect(comp); comp.connect(master); master.connect(lim); lim.connect(ctx.destination);
        E.comp = comp; E.master = master;
      }
      if (!offline) {
        E.timer = setInterval(() => pump(), PUMP_MS);
        if (typeof window !== 'undefined') {
          const resume = () => { if (ctx.state === 'suspended') ctx.resume().catch(() => {}); };
          for (const ev of ['pointerdown', 'keydown', 'touchstart']) window.addEventListener(ev, resume, { passive: true });
        }
      }
    } catch (e) { report('init', e); }
    return api;
  }
  const ensure = () => { if (!E) init(); return !!E; };

  /** the reverb chain for a space, built lazily (the IR is generated on first use, off the critical path live) */
  function space(name) {
    name = SPACE[name] ? name : 'HALL';
    if (E.injectedSend) return { inTheme: E.sendDuck, inSting: E.injectedSend };
    let s = E.spaces[name];
    if (s) return s;
    const { ctx } = E; const spec = SPACE[name];
    const g = (v) => { const n = ctx.createGain(); n.gain.value = v; return n; };
    s = { inTheme: g(E.duckLevel), inSting: g(1), sum: g(1) };
    s.inTheme.connect(s.sum); s.inSting.connect(s.sum);
    const pre = ctx.createDelay(0.2); pre.delayTime.value = spec.pre;
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 180;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = spec.lp;
    const verb = g(0.9 * (spec.wet ?? 1) * (E.verbMul ?? 1));
    s.sum.connect(pre); pre.connect(hp); lp.connect(verb); verb.connect(E.music);
    if (E.quality === 'low') { const f = makeFDN(ctx); hp.connect(f.input); f.output.connect(lp); }
    else {
      const conv = ctx.createConvolver(); hp.connect(conv); conv.connect(lp);
      const build = () => { try { conv.buffer = makeIR(ctx, spec.ir); } catch (e) { report('ir', e); } };
      if (E.offline || typeof requestIdleCallback !== 'function') build(); else requestIdleCallback(build, { timeout: 300 });
    }
    E.spaces[name] = s;
    return s;
  }

  // -------------------------------------------------------------------------------------------- performances
  function newPerf(th, at, { sting = false, fadeIn = 0, startBeat = 0 } = {}) {
    const { ctx } = E;
    const g = (v) => { const n = ctx.createGain(); n.gain.value = v; return n; };
    const p = {
      id: th.id, th, sting, idx: 0, iter: 0, t0: at, stopAt: null, killAt: null, done: false, exhausted: false,
      dry: g(fadeIn > 0 ? 0 : 1), send: g(fadeIn > 0 ? 0 : 1), buses: {}, muted: new Set(), seed: hash(th.id),
      createdAt: ctx.currentTime, startAt: at, last: {},
    };
    for (const [b, lv] of Object.entries(BUS_LEVEL)) { p.buses[b] = g(lv * (E.busMul?.[b] ?? 1)); p.buses[b].connect(p.dry); }
    p.dry.connect(sting ? E.stingSum : E.themeSum);
    const sp = space(th.space);
    p.send.connect(sting ? sp.inSting : sp.inTheme);
    if (E.quality !== 'low') { const ch = space('CHAPEL'); p.long = g(1); p.long.connect(sting ? ch.inSting : ch.inTheme); }
    if (fadeIn > 0) { rampParam(p.dry.gain, at, fadeIn, 1); rampParam(p.send.gain, at, fadeIn, 1); }
    if (startBeat > 0) {
      const sb = startBeat % Math.max(1, th.introBeats + th.loopBeats || th.totalBeats);
      p.t0 = at - th.time(sb);
      p.idx = th.events.findIndex((e) => e.b >= sb - 1e-6); if (p.idx < 0) p.idx = th.events.length;
    }
    E.perfs.push(p);
    return p;
  }

  function eventTime(p, e) {
    const th = p.th;
    return p.t0 + th.time(e.b) + (th.kind === 'loop' && e.b >= th.introBeats - 1e-6 ? p.iter * th.loopSec : 0);
  }

  function pumpPerf(p, now, horizon) {
    if (p.exhausted) return;
    const th = p.th, evs = th.events;
    for (let guard = 0; guard < 4000; guard++) {
      if (p.idx >= evs.length) {
        if (th.kind === 'loop' && th.firstLoop < evs.length) { p.iter++; p.idx = th.firstLoop; continue; }
        p.exhausted = true; break;
      }
      const e = evs[p.idx];
      const t = eventTime(p, e);
      if (p.stopAt != null && t >= p.stopAt) { p.exhausted = true; break; }
      if (t > now + horizon) break;
      p.idx++;
      if (t < now - 0.08 || p.muted.has(e.part)) continue; // stale (throttled tab) or a track muted by an error
      try { playEvent(p, e, t); } catch (err) { p.muted.add(e.part); report(`${th.id}/${e.part}`, err); }
    }
  }

  function playEvent(p, e, t) {
    const th = p.th, { ctx } = E;
    const voice = VOICES[e.voice]; if (!voice) throw new Error('no voice ' + e.voice);
    if (E.quality === 'low' && e.voice === 'pad') return;
    const r = rng32(p.seed ^ Math.imul(e.i + 1, 2654435761) ^ Math.imul(p.iter + 1, 40503));
    const [ht, hg] = HUM[e.voice] || [0.003, 0.02];
    let ts = t + (r() * 2 - 1) * ht + (e.sec || 0);
    if (e.ci && e.voice === 'harpsi') ts += e.ci * (0.004 + r() * 0.005);
    if (e.ci && e.o?.strum) ts += e.ci * e.o.strum;
    const spb = th.time(e.b + 1) - th.time(e.b);
    if (e.jit) ts += r() * e.jit * spb;
    ts = Math.max(ts, ctx.currentTime + 0.002);
    let dur = th.time(e.b + e.d) - th.time(e.b);
    const art = e.art != null ? (typeof e.art === 'number' ? e.art : ART[e.art] ?? 0.92) : (e.voice === 'strings' || e.voice === 'pad' || e.voice === 'organ' ? 1.0 : e.d >= 1 ? 0.94 : 0.86);
    dur = dur * art + (art >= 1 ? 0.02 : 0);
    let vel = e.v * (1 + (r() * 2 - 1) * hg) * (1 + (r() * 2 - 1) * (e.jitV || 0));
    if (th.loopDb && p.iter > 0) vel *= Math.pow(10, Math.min(p.iter * th.loopDb.per, th.loopDb.max) / 20);
    vel = clamp(vel, 0.02, 1.15);
    const n = {
      t: ts, dur: Math.max(0.02, dur), m: e.m, f: e.m != null ? mtof(e.m) : 0, vel, gain: (e.g ?? 1) * th.gain * dynLoud(vel), art: e.art,
      pan: e.pan ?? seatPan(e.voice, e.m ?? 60), send: (e.send ?? SEND[e.voice] ?? 0.3) + th.sendAdd,
      long: e.voice === 'celesta' ? 0.25 : 0, spb, o: e.o, voice: e.voice, ci: e.ci, bus: e.bus,
    };
    if (e.path) n.path = e.path.map(([off, m]) => [th.time(e.b + off) - th.time(e.b), mtof(m)]);
    // legato: a single-line part whose previous note ends where this one starts
    const mono = th.mono || (th.mono = monoParts(th));
    const last = p.last[e.part];
    if (LEGATO.has(e.voice) && mono.has(e.part) && last && !last.h.stolen && Math.abs(last.tEnd - (t + (e.sec || 0))) < 0.03 &&
        dur >= 0.12 && e.art !== 'staccato' && e.art !== 'marcato' && !e.o?.trem && Math.abs((last.m ?? 0) - (e.m ?? 0)) <= 12) {
      n.legato = true; E.legatoCount = (E.legatoCount || 0) + 1;
      last.h.release(Math.max(E.ctx.currentTime + 0.001, ts + 0.035), 0.09);
    }
    budget(ts);
    const h = voice(E.kit, n, { bus: p.buses[e.bus] || p.buses.harmony, send: p.send, long: p.long });
    h.perf = p; h.vol = vel * n.gain;
    E.handles.push(h);
    p.last[e.part] = { h, tEnd: t + (e.sec || 0) + (th.time(e.b + e.d) - th.time(e.b)), m: e.m };
  }

  /** voice stealing: oldest-and-quietest first (§1, §5.4). Stolen notes and inaudible tails don't count as voices. */
  function budget(ts) {
    const cap = CAP[E.quality] || 30;
    const now = E.ctx.currentTime;
    const live = [];
    for (const h of E.handles) if (!h.stolen && h.end > ts && h.t0 <= ts + 0.2 && h.level(ts) > 0.002) live.push(h);
    const over = live.length - cap + 1;
    if (over <= 0) return;
    const score = (h) => h.level(ts) * (h.vol || 1) / (1 + Math.max(0, ts - h.t0)) * (h.t0 > now + 0.01 ? 4 : 1);
    live.sort((a, b) => score(a) - score(b));
    for (let i = 0; i < over; i++) {
      const v = live[i]; v.stolen = true; E.steals++;
      v.release(Math.max(now + 0.001, Math.min(ts, v.t0 > ts ? ts : ts) - 0.01), 0.05);
    }
  }

  /** parts that never sound two notes at once (and so may slur) */
  function monoParts(th) {
    const byPart = new Map(), poly = new Set();
    for (const e of th.events) {
      const prev = byPart.get(e.part);
      if (prev && e.b < prev.b + prev.d - 1e-6) poly.add(e.part);
      if (!prev || e.b + e.d > prev.b + prev.d) byPart.set(e.part, e);
    }
    return new Set([...byPart.keys()].filter((k) => !poly.has(k)));
  }

  function pump() {
    if (!E) return;
    const now = E.ctx.currentTime;
    if (E.pending) {
      const pd = E.pending;
      if (!Sampler.missing(E.ctx, pd.need).length || now - pd.since > MAX_WAIT) { E.pending = null; start(pd.id, { ...pd.opts, waited: now - pd.since }); }
    }
    const wall = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const gap = E.lastPump ? (wall - E.lastPump) / 1000 : 0;
    E.lastPump = wall;
    const horizon = E.offline ? 0.45 : clamp(gap * 1.5 + 0.05, LOOKAHEAD, 1.5);
    for (const p of E.perfs) {
      try {
        pumpPerf(p, now, horizon);
        if (p.killAt != null && now >= p.killAt && !p.killed) {
          p.killed = true;
          for (const h of E.handles) if (h.perf === p && h.end > now) h.release(now + 0.001, 0.03);
        }
      } catch (e) { report('pump', e); }
    }
    // retire finished notes and performances
    if (E.handles.length) {
      const keep = [];
      for (const h of E.handles) { if (h.end + 0.15 < now) h.cleanup(); else keep.push(h); }
      E.handles = keep;
    }
    for (const p of E.perfs) {
      if (p.done) continue;
      const tailEnd = p.exhausted && !E.handles.some((h) => h.perf === p);
      if (tailEnd && (p.killed || p.stopAt != null || p.th.kind !== 'loop')) {
        if (now > (p.lastRetire ??= now) + 4.5) { // let the reverb tail finish before disconnecting
          p.done = true;
          try { p.dry.disconnect(); p.send.disconnect(); if (p.long) p.long.disconnect(); } catch (_) { /* ignore */ }
          if (E.current === p) E.current = null;
        }
      }
    }
    E.perfs = E.perfs.filter((p) => !p.done);
  }

  // -------------------------------------------------------------------------------------------- transport
  function positionOf(p, now) {
    if (!p) return null;
    const th = p.th; const el = now - p.t0;
    if (el < 0) return { beat: 0, iter: 0 };
    let base = 0, span = el;
    if (th.kind === 'loop' && el >= th.introSec + th.loopSec) { const k = Math.floor((el - th.introSec) / th.loopSec); span = el - k * th.loopSec; }
    let lo = 0, hi = th.totalBeats + 16;
    for (let i = 0; i < 40; i++) { const mid = (lo + hi) / 2; if (th.time(mid) <= span) lo = mid; else hi = mid; }
    base = lo;
    return { beat: base, iter: th.kind === 'loop' && el > th.introSec ? Math.floor((el - th.introSec) / th.loopSec) : 0 };
  }

  function stopPerf(p, at, fade, { bloom = false } = {}) {
    if (!p || p.stopAt != null) return;
    const pos = positionOf(p, at); if (pos) E.lastPositions[p.id] = pos.beat;
    if (bloom) { rampParam(p.send.gain, at, 0.2, 1.8, false); rampParam(p.send.gain, at + 0.2, Math.max(0.05, fade - 0.2), 0); }
    else rampParam(p.send.gain, at, fade, 0);
    rampParam(p.dry.gain, at, fade, 0);
    p.stopAt = at + fade;
    p.killAt = at + fade + 0.02;
  }

  /** instruments a theme needs (cached on the compiled theme) */
  const needOf = (th) => th.need || (th.need = instrumentsFor(th.events));

  function play(id, opts = {}) {
    if (!ensure()) return false;
    try {
      id = ALIASES[id] || id;
      const th = THEMES[id];
      if (!th && id !== 'silence') { report('play', 'unknown theme ' + id); return false; }
      const cur = E.current;
      if (cur && cur.id === id && cur.stopAt == null) { E.pending = null; return true; }
      if (th && !E.offline) {
        const need = needOf(th);
        Sampler.load(E.ctx, need).then(() => { if (!E.warmed) { E.warmed = true; warm(); } });
        if (Sampler.missing(E.ctx, need).length && !opts.noHold) {
          if (E.pending?.id === id) return true;
          E.pending = { id, opts, need, since: E.ctx.currentTime };
          return true;
        }
      }
      E.pending = null;
      return start(id, opts);
    } catch (e) { report('play', e); return false; }
  }

  /** load the stinger + battle instruments in the background, one theme at a time */
  function warm() {
    const ids = [];
    for (const tid of WARM) if (THEMES[tid]) ids.push(...needOf(THEMES[tid]));
    const uniq = [...new Set(ids)];
    let k = 0;
    const next = () => { if (k >= uniq.length || !E) return; Sampler.load(E.ctx, [uniq[k++]]).then(next); };
    next();
  }

  function start(id, opts = {}) {
    try {
      const th = THEMES[id];
      const { ctx } = E; const now = ctx.currentTime;
      const cur = E.current;
      if (cur && cur.id === id && cur.stopAt == null) return true;
      const at = opts.at ?? now + 0.05;
      const enter = (th && th.enter) || {};
      let fade = opts.fade ?? enter.fade ?? 1.2;
      if (id === 'silence') { E.pending = null; if (cur) stopPerf(cur, at, fade); E.current = { id: 'silence', th: null, silence: true }; return true; }
      let t0 = at, fadeIn = cur && !cur.silence && fade > 0.05 ? fade : 0;
      if (cur && !cur.silence) {
        if (enter.gap != null) { const fo = opts.fade ?? enter.fadeOut ?? 1.2; stopPerf(cur, at, fo); t0 = at + fo + enter.gap; fadeIn = 0; }
        else stopPerf(cur, at, fade, { bloom: opts.bloom });
      }
      if (enter.gap != null && opts.fade === 0) t0 = at;
      // a theme that waited for its samples over silence eases in rather than landing mid-phrase at full level
      if (!cur && opts.waited > 0.35 && !fadeIn && enter.gap == null) fadeIn = 0.6;
      const startBeat = opts.resume ? (E.lastPositions[id] || 0) : (opts.startBeat || 0);
      const p = newPerf(th, t0, { fadeIn, startBeat });
      E.current = p;
      if (E.setSpaceCb) { try { E.setSpaceCb(SPACE[th.space]?.ext || 'hall'); } catch (e) { report('setSpace', e); } }
      E.space = th.space;
      pump();
      return true;
    } catch (e) { report('play', e); return false; }
  }

  function stop(opts = {}) {
    if (!E) return;
    E.pending = null;
    const at = E.ctx.currentTime + 0.02;
    const fade = opts.fade ?? 1.2;
    for (const p of E.perfs) if (!p.sting || opts.all) stopPerf(p, at, fade);
    E.current = null;
  }

  function duck(amount = 0.55, ms) {
    if (!ensure()) return;
    const t = E.ctx.currentTime + 0.005;
    const targets = [E.duck.gain, ...Object.values(E.spaces).map((s) => s.inTheme.gain)];
    if (E.sendDuck) targets.push(E.sendDuck.gain);
    const to = clamp(amount, 0, 1);
    for (const prm of targets) rampParam(prm, t, to >= 1 ? 0.40 : 0.12, to, false);
    E.duckLevel = to;
    if (to < 1 && ms > 0) {
      const back = t + 0.12 + ms / 1000;
      for (const prm of targets) { try { prm.setValueAtTime(to, back); prm.linearRampToValueAtTime(1, back + 0.40); } catch (e) { report('duck', e); } }
      E.duckUntil = back + 0.4;
    } else E.duckUntil = null;
  }

  /** hard cut of the current theme: dry bus -> 0 over `dur`, reverb tail keeps ringing */
  function cut(at, dur = 0.06) { const c = E.current; if (c && !c.silence) stopPerf(c, at, dur); }

  function sting(themeId, at) {
    const th = THEMES[themeId]; if (!th) { report('stinger', 'no stinger theme ' + themeId); return null; }
    const p = newPerf(th, at, { sting: true });
    pump();
    return p;
  }

  function stinger(id, opts = {}) {
    if (!ensure()) return null;
    try {
      const { ctx } = E; const now = ctx.currentTime; const t = now + 0.03;
      const len = (tid) => THEMES[tid]?.lengthSec ?? 1;
      switch (id) {
        case 'battle_start': {
          cut(t, 0.06);
          sting('battle_start', t);
          const next = opts.then === undefined ? 'battle' : opts.then;
          if (next) { E.current = null; play(next, { at: t + 0.55, fade: 0, noHold: true }); }
          return { id, duration: 0.55 };
        }
        case 'victory': {
          cut(t, 0.06); E.current = null;
          play('victory', { at: t + 0.06 + 0.25, fade: 0, noHold: true });
          return { id, duration: 0.31 + len('victory') };
        }
        case 'level_up': case 'item_get': case 'join': case 'sad_sting': {
          const tid = STINGER_THEME[id]; const d = len(tid);
          const depth = { level_up: 0, item_get: 0.15, join: 0, sad_sting: 0.2 }[id];
          if (E.current && !E.current.silence) duck(depth, (d + 0.3) * 1000);
          sting(tid, t + (depth === 0 ? 0.12 : 0.02));
          return { id, duration: d };
        }
        case 'inn': {
          if (E.current && !E.current.silence) stopPerf(E.current, t, 0.6);
          E.current = { id: 'silence', th: null, silence: true };
          sting('inn.sleep', t + 0.6);
          return { id, duration: 0.6 + len('inn.sleep') };
        }
        default: {
          if (THEMES[id]) { sting(id, t); return { id, duration: len(id) }; }
          report('stinger', 'unknown stinger ' + id); return null;
        }
      }
    } catch (e) { report('stinger', e); return null; }
  }

  function themes() {
    return Object.values(THEMES).map((th) => ({ id: th.id, title: th.title, bpm: th.bpm, bars: th.bars, kind: th.kind, key: th.key,
      meter: th.meter, sig: th.sig, loopSec: +th.loopSec.toFixed(2), introSec: +th.introSec.toFixed(2), lengthSec: +th.lengthSec.toFixed(2), stinger: !!th.stingerOnly }));
  }

  function state() {
    if (!E) return { theme: null, bar: 0, beat: 0, voices: 0, ducked: 1, ctxState: 'none', quality: null };
    const now = E.ctx.currentTime; const c = E.current;
    const pos = c && c.th ? positionOf(c, now) : null;
    return {
      theme: E.pending ? E.pending.id : c ? c.id : null,
      loading: E.pending ? { id: E.pending.id, waiting: +(now - E.pending.since).toFixed(2), missing: Sampler.missing(E.ctx, E.pending.need) } : null,
      playing: c ? c.id : null,
      bar: pos ? Math.floor(pos.beat / c.th.meter) + 1 : 0,
      beat: pos ? +((pos.beat % c.th.meter) + 1).toFixed(2) : 0,
      iteration: pos ? pos.iter : 0,
      voices: E.handles.filter((h) => h.t0 <= now && h.end > now).length,
      ducked: E.duckUntil != null && now > E.duckUntil ? 1 : +E.duckLevel.toFixed(2), ctxState: E.ctx.state, quality: E.quality, space: E.space, steals: E.steals,
      missed: E.kit.missed, legato: E.legatoCount || 0,
      sampler: Sampler.state(),
      performances: E.perfs.map((p) => ({ id: p.id, sting: p.sting, stopping: p.stopAt != null })),
    };
  }

  async function renderOffline(id, seconds = 20, opts = {}) {
    const OAC = typeof window !== 'undefined' && (window.OfflineAudioContext || window.webkitOfflineAudioContext);
    if (!OAC) throw new Error('OfflineAudioContext unavailable');
    const sr = opts.sampleRate || 44100;
    const off = new OAC(2, Math.max(256, Math.ceil(seconds * sr)), sr);
    const m = createMusic();
    m.init({ ctx: off, quality: opts.quality || (E && E.quality) || 'high', raw: opts.raw, masterGain: opts.masterGain, verbMul: opts.verbMul, busMul: opts.busMul });
    // every sample the cue can touch is decoded BEFORE the render starts: no dropouts, same buffers as live
    const sid0 = String(id).replace(/^sting:/, '');
    const cues = new Set([ALIASES[sid0] || sid0, STINGER_THEME[sid0]]);
    if (sid0 === 'battle_start') cues.add('battle');
    let need = [];
    if (opts.script || opts.loadAll) { const man = await Sampler.manifest(); need = Object.keys(man.instruments); }
    else for (const c of cues) if (c && THEMES[c]) need.push(...instrumentsFor(THEMES[c].events));
    await Sampler.load(off, need);
    const step = 0.2;
    for (let k = 1; k * step < seconds - 0.01; k++) {
      off.suspend(k * step).then(() => { try { m._pump(); } catch (e) { report('offline pump', e); } off.resume(); });
    }
    // 'sting:inn' / 'sting:victory' force the stinger; bare ids that are also real themes (inn, victory) play the theme
    const sid = String(id);
    if (sid.startsWith('sting:')) m.stinger(sid.slice(6));
    else if (STINGER_IDS.includes(sid) && !THEMES[sid] || ['battle_start', 'item_get', 'sad_sting'].includes(sid)) m.stinger(sid);
    else m.play(sid, { fade: 0, at: 0.02, startBeat: opts.startBeat });
    if (opts.script) opts.script(m, off);
    m._pump();
    const buf = await off.startRendering();
    const st = m.state();
    buf.__steals = st.steals; buf.__missed = st.missed; buf.__legato = st.legato;
    if (st.missed) report('renderOffline', `${st.missed} notes had no decoded sample (${id})`);
    return buf;
  }

  const api = {
    init, play, stop, duck, stinger, themes, state, renderOffline,
    get ctx() { return E ? E.ctx : null; },
    get quality() { return E ? E.quality : null; },
    setQuality(q) { if (E) { E.quality = q; E.kit.quality = q; } },
    _pump: pump,
    _engine: () => E,
  };
  return api;
}

export const Music = createMusic();
export default Music;
