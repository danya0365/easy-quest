/**
 * audio.js — THE AudioContext, the mixer, the shared reverb.            (P28, owner: src/audio/{audio,sfx}.js)
 *
 *   buses  music ───┐ each bus:  in(volume) ─► duck ─► pulse ─► MASTER_SUM (music, ambience) | FX_SUM (sfx, ui, voice)
 *          ambience─┘
 *          sfx   ─┐    per-bus reverb sends:  send(volume) ─► sendDuck ─► sendPulse ─► REVERB_IN
 *          ui    ─┤    (duck = held ducks for dialogue/fanfares; pulse = sample-accurate transient dips under hits)
 *          voice ─┘
 *   (sfx/ui/voice sends pass a 320 Hz highpass first, so short effects keep a room without a boomy low-mid tail)
 *   REVERB_IN ─► predelay ─► HP 180 ─► convolver A/B (crossfaded on setSpace) ─► LP ─► wet ─► MASTER_SUM
 *   MASTER_SUM ─► glue compressor (-14 dB, knee 8, 3:1) ─┬─► masterGain ─► limiter (-2 dB, 20:1) ─► soft clip ─► out
 *   FX_SUM (x the glue's small-signal gain) ─────────────┘
 *   Effects skip the glue so a hit's snap and decay are not squashed by a compressor riding the score, and a menu blip
 *   is not pulled down while the music drives it; below the glue threshold the two paths are exactly equal in level.
 *
 * Nothing touches `destination` except the end of this chain. The very same builder (`buildMixer`) makes the
 * live graph and the offline graph used by `renderOffline`, so what the probe measures is what the game plays.
 *
 * API
 *   Audio.init()                  create the single AudioContext (idempotent, never throws, never blocks) and arm
 *                                 the first-gesture unlock. Returns Audio.
 *   Audio.ctx                     the AudioContext (getter; lazily inits). null if Web Audio is unavailable.
 *   Audio.bus(name)               input node of bus 'music'|'sfx'|'ui'|'voice'|'ambience'.
 *   Audio.reverbSend              shared reverb input AS SEEN FROM THE MUSIC BUS: its level follows the music
 *                                 volume + ducks, so turning music down also turns down the music's reverb tail.
 *   Audio.sendFor(name)           the same, for any bus (Sfx uses sendFor('sfx') etc).
 *   Audio.reverbIn                raw shared reverb input (not scaled by any bus).
 *   Audio.setVolume(bus, v)       v 0..1 ('master' also accepted). Audio.getVolumes()/setVolumes(obj) for saves.
 *   Audio.duck(bus, amount, ms, holdMs?)  ramp the bus to `amount` (0..1 multiplier) over `ms` (default 120).
 *                                 Ducks stack (the lowest wins). With holdMs it releases itself after holdMs.
 *                                 Returns release(ms=400). Audio.unduck(bus, ms) clears every duck on the bus.
 *   Audio.duckPulse(bus, amount, {at, attack, hold, release})   a short, sample-accurate dip scheduled at context
 *                                 time `at` (default now): ramp to `amount` over attack, hold, recover over release
 *                                 (seconds). Overlapping pulses merge (deepest depth, latest hold end). Used under
 *                                 every battle impact so the hit cuts through the battle theme.
 *   Audio.unlock()                resume the context now (call from inside a gesture handler). Promise<boolean>.
 *   Audio.setSpace(name, ms)      'hall'|'room'|'chapel'|'cave'|'open' — crossfades the shared reverb IR.
 *   Audio.renderOffline(fn(ctx, dest), seconds) -> Promise<AudioBuffer>
 *                                 builds the same mixer in an OfflineAudioContext; `dest` is the offline master
 *                                 input (connect to it directly) and also carries dest.bus(name), dest.reverbSend,
 *                                 dest.sendFor(name), dest.ctx, dest.mixer, dest.duckPulse(bus, amount, {at,...}).
 *   Audio.onUnlock(fn)            fn() once the context is running (immediately if it already is).
 *   Audio.state()                 {ctxState, sampleRate, volumes, ducks, pulses, space, unlocked, peakDb}
 */

export const BUS_NAMES = ['music', 'sfx', 'ui', 'voice', 'ambience'];
/** Buses that go through the glue compressor. The rest (sfx, ui, voice) join after it: see buildMixer. */
const GLUED_BUSES = new Set(['music', 'ambience']);
/** Small-signal gain of the glue compressor below. Chrome adds make-up gain, (full-range gain)^-0.6; measured +4.123 dB. */
const GLUE_SMALL_SIGNAL = Math.pow(10, 4.123 / 20);
export const DEFAULT_VOLUMES = { master: 1.0, music: 0.75, sfx: 0.9, ui: 0.85, voice: 0.8, ambience: 0.7 };

// --- small shared helpers (exported for sfx.js) -------------------------------------------------------------
export function mulberry32(seed) {
  let a = (seed >>> 0) || 0x9e3779b9;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

/**
 * Chrome can garbage-collect nodes of an OfflineAudioContext while it renders if no JS object still references
 * them (observed: whole renders coming back silent under GC pressure). `retainNodes(ctx)` wraps the context's
 * create* methods so every node made on it is held in the returned array; keep that array alive until done.
 */
const CREATE_METHODS = ['createGain', 'createOscillator', 'createBufferSource', 'createBiquadFilter', 'createStereoPanner',
  'createConvolver', 'createDelay', 'createWaveShaper', 'createConstantSource', 'createDynamicsCompressor', 'createPanner',
  'createChannelSplitter', 'createChannelMerger', 'createIIRFilter', 'createAnalyser'];
export function retainNodes(ctx) {
  const nodes = [];
  for (const m of CREATE_METHODS) {
    const f = ctx[m];
    if (typeof f !== 'function') continue;
    ctx[m] = function (...a) { const n = f.apply(ctx, a); nodes.push(n); return n; };
  }
  return nodes;
}
export const _rendering = new Set(); // offline graphs currently rendering (strong references)

export function reportError(where, e) {
  const msg = `[audio] ${where}: ${e && e.message ? e.message : e}`;
  try { if (typeof window !== 'undefined' && window.__DQ && Array.isArray(window.__DQ.errors)) window.__DQ.errors.push(msg); } catch (_) {}
  try { console.warn(msg); } catch (_) {}
}

// --- impulse responses ---------------------------------------------------------------------------------------
// MUSIC-BIBLE §2.1 recipe: decaying noise, tail darkening over time, early-reflection taps, DC removed.
export const SPACES = {
  hall:   { seconds: 2.6, decayExp: 2.4, tiltHz: 7000, predelay: 0.018, lp: 6500, wet: 0.9,
            taps: [[11, .35], [17, .28], [23, .24], [31, .19], [43, .14], [59, .10]] },
  room:   { seconds: 1.1, decayExp: 3.1, tiltHz: 5200, predelay: 0.008, lp: 6500, wet: 0.85,
            taps: [[7, .40], [13, .30], [19, .22], [27, .15]] },
  chapel: { seconds: 4.2, decayExp: 1.7, tiltHz: 4200, predelay: 0.034, lp: 6000, wet: 0.95,
            taps: [[23, .30], [37, .26], [53, .22], [71, .18], [97, .13], [127, .09]] },
  cave:   { seconds: 3.0, decayExp: 2.0, tiltHz: 3600, predelay: 0.042, lp: 3400, wet: 1.0,
            taps: [[29, .42], [47, .34], [71, .26], [103, .2], [149, .12]] },
  open:   { seconds: 1.3, decayExp: 3.6, tiltHz: 6000, predelay: 0.012, lp: 6500, wet: 0.6,
            taps: [[9, .2], [21, .12]] },
};
const irCache = new WeakMap(); // ctx -> {name: AudioBuffer}

export function makeIR(ctx, name = 'hall', seed = 7) {
  let per = irCache.get(ctx); if (!per) irCache.set(ctx, per = {});
  if (per[name]) return per[name];
  const S = SPACES[name] || SPACES.hall;
  const sr = ctx.sampleRate, n = Math.max(1, Math.floor(sr * S.seconds));
  const buf = ctx.createBuffer(2, n, sr);
  const rnd = mulberry32(seed * 7919 + name.length * 131);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    let lp = 0, mean = 0;
    for (let i = 0; i < n; i++) {
      const t = i / n;
      const s = (rnd() * 2 - 1) * Math.pow(1 - t, S.decayExp);
      const fc = S.tiltHz * (1 - 0.75 * t);
      const a = 1 - Math.exp(-2 * Math.PI * fc / sr);
      lp += a * (s - lp);
      d[i] = lp;
      mean += lp;
    }
    for (const [ms, g] of S.taps) {
      const k = Math.round(ms / 1000 * sr) + ch * 13;
      if (k < n) d[k] += g * 0.25 * (rnd() < 0.5 ? -1 : 1);
    }
    mean /= n;
    const fadeIn = Math.min(n, Math.floor(sr * 0.002));
    for (let i = 0; i < n; i++) { d[i] -= mean * (1 - i / n); if (i < fadeIn) d[i] *= i / fadeIn; }
  }
  per[name] = buf;
  return buf;
}

// soft clip: transparent below 0.8, smooth knee up to ±0.985
function softClipCurve() {
  const N = 4097, c = new Float32Array(N), knee = 0.8, ceil = 0.985;
  for (let i = 0; i < N; i++) {
    const x = (i / (N - 1)) * 2 - 1, ax = Math.abs(x);
    let y = ax;
    if (ax > knee) { const over = (ax - knee) / (1 - knee); y = knee + (ceil - knee) * Math.tanh(over * 1.2) / Math.tanh(1.2); }
    c[i] = Math.sign(x) * Math.min(y, ceil);
  }
  return c;
}
let _clipCurve = null;

/** Build the full mixer graph into any BaseAudioContext. `out` defaults to ctx.destination. */
export function buildMixer(ctx, out, volumes = DEFAULT_VOLUMES, space = 'hall') {
  const m = { ctx, buses: {}, sends: {}, space };
  const g = (v = 1) => { const n = ctx.createGain(); n.gain.value = v; return n; };

  m.master = g(1);                                   // MASTER_SUM
  const glue = ctx.createDynamicsCompressor();
  glue.threshold.value = -14; glue.knee.value = 8; glue.ratio.value = 3; glue.attack.value = 0.006; glue.release.value = 0.18;
  m.masterGain = g(0.62 * (volumes.master ?? 1));    // Chrome's compressor adds make-up gain; 0.62 re-levels it
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -2; limiter.knee.value = 0; limiter.ratio.value = 20; limiter.attack.value = 0.001; limiter.release.value = 0.09;
  const clip = ctx.createWaveShaper();
  clip.curve = _clipCurve || (_clipCurve = softClipCurve());
  clip.oversample = '2x';
  m.master.connect(glue); glue.connect(m.masterGain); m.masterGain.connect(limiter); limiter.connect(clip);
  clip.connect(out || ctx.destination);
  m.glue = glue; m.limiter = limiter; m.clip = clip; m.post = clip;
  // EFFECTS SUM: sfx/ui/voice skip the glue. A glue busy with the score would squash every hit's snap and stretch
  // its decay (measured: -10 dB took 44 ms instead of 29), and would pull menu blips down whenever the music drives
  // it. They join after the glue at its exact small-signal gain (Chrome's make-up, +4.123 dB), so an effect below the
  // threshold is exactly as loud as through the glue; the limiter and soft clip still catch every peak.
  m.fxSum = g(GLUE_SMALL_SIGNAL);
  m.fxSum.connect(m.masterGain);

  // shared reverb, two convolvers so a space change crossfades instead of clicking
  const S = SPACES[space] || SPACES.hall;
  m.reverbIn = g(1);
  m.predelay = ctx.createDelay(0.2); m.predelay.delayTime.value = S.predelay;
  const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 180; hp.Q.value = 0.5;
  m.verbLP = ctx.createBiquadFilter(); m.verbLP.type = 'lowpass'; m.verbLP.frequency.value = S.lp; m.verbLP.Q.value = 0.5;
  m.wet = g(S.wet);
  m.reverbIn.connect(m.predelay); m.predelay.connect(hp);
  m.conv = [0, 1].map(() => { const c = ctx.createConvolver(); c.normalize = true; const cg = g(0); hp.connect(c); c.connect(cg); cg.connect(m.verbLP); return { c, g: cg, name: null }; });
  m.verbLP.connect(m.wet); m.wet.connect(m.master);
  m.activeConv = 0;

  for (const name of BUS_NAMES) {
    const v = volumes[name] ?? DEFAULT_VOLUMES[name];
    const bin = g(v), duck = g(1), pulse = g(1), sin = g(v), sduck = g(1), spulse = g(1);
    bin.connect(duck); duck.connect(pulse); pulse.connect(GLUED_BUSES.has(name) ? m.master : m.fxSum);
    sin.connect(sduck); sduck.connect(spulse);
    if (name === 'music' || name === 'ambience') spulse.connect(m.reverbIn);
    else {
      // effects keep their room but not a boomy tail: nothing under ~320 Hz reaches the shared reverb from sfx/ui/voice
      const shp = ctx.createBiquadFilter(); shp.type = 'highpass'; shp.frequency.value = 320; shp.Q.value = 0.6;
      spulse.connect(shp); shp.connect(m.reverbIn);
    }
    m.buses[name] = { in: bin, duck, pulse, sendIn: sin, sendDuck: sduck, sendPulse: spulse, ducks: new Map(), pulseState: { depth: 1, holdEnd: -1, end: -1 } };
  }
  return m;
}

/**
 * Schedule a transient dip on a bus of mixer `m` at context time `t` (seconds). Sample-accurate, so a hit and the
 * music's dip under it line up exactly, live and offline. Overlapping pulses merge: the deeper depth wins and the
 * hold lasts until the later of the two hold ends.
 */
export function schedulePulse(m, name, amount, t, attack = 0.01, hold = 0.15, release = 0.25) {
  const b = m && m.buses[name]; if (!b) return;
  const st = b.pulseState;
  attack = Math.max(0.002, attack); release = Math.max(0.01, release); hold = Math.max(0, hold);
  const live = t < st.end;
  const depth = clamp(live && t < st.holdEnd ? Math.min(st.depth, amount) : amount, 0, 1);
  const holdEnd = Math.max(t + attack + hold, live ? st.holdEnd : -1);
  for (const p of [b.pulse.gain, b.sendPulse.gain]) {
    try {
      if (p.cancelAndHoldAtTime) p.cancelAndHoldAtTime(t);
      else { p.cancelScheduledValues(t); p.setValueAtTime(live ? depth : 1, t); }
      if (!live) p.setValueAtTime(1, t);
      p.linearRampToValueAtTime(depth, t + attack);
      p.setValueAtTime(depth, holdEnd);
      p.linearRampToValueAtTime(1, holdEnd + release);
    } catch (e) { reportError('pulse', e); }
  }
  st.depth = depth; st.holdEnd = holdEnd; st.end = holdEnd + release;
}

function applySpace(m, name, seconds = 0.35) {
  const ctx = m.ctx, S = SPACES[name] || SPACES.hall;
  const now = ctx.currentTime;
  const next = m.conv[0].name === null && m.conv[1].name === null ? 0 : 1 - m.activeConv;
  const A = m.conv[next], B = m.conv[1 - next];
  if (A.name !== name) { A.c.buffer = makeIR(ctx, name); A.name = name; }
  const fade = Math.max(0.005, seconds);
  A.g.gain.cancelScheduledValues(now); A.g.gain.setValueAtTime(A.g.gain.value, now); A.g.gain.linearRampToValueAtTime(1, now + fade);
  if (B !== A) { B.g.gain.cancelScheduledValues(now); B.g.gain.setValueAtTime(B.g.gain.value, now); B.g.gain.linearRampToValueAtTime(0, now + fade); }
  m.predelay.delayTime.setTargetAtTime(S.predelay, now, fade / 3);
  m.verbLP.frequency.setTargetAtTime(S.lp, now, fade / 3);
  m.wet.gain.setTargetAtTime(S.wet, now, fade / 3);
  m.activeConv = next; m.space = name;
}

// --- the singleton ----------------------------------------------------------------------------------------------
const GESTURES = ['pointerdown', 'mousedown', 'touchend', 'keydown'];
let _ctx = null, _mix = null, _analyser = null, _armed = false, _unsupported = false, _unlockCbs = [];
const _vol = { ...DEFAULT_VOLUMES };

function onGesture() { Audio.unlock(); }
function armGestures() {
  if (_armed || typeof window === 'undefined') return;
  _armed = true;
  for (const ev of GESTURES) window.addEventListener(ev, onGesture, { capture: true, passive: true });
}
function disarmGestures() {
  if (!_armed || typeof window === 'undefined') return;
  _armed = false;
  for (const ev of GESTURES) window.removeEventListener(ev, onGesture, { capture: true });
}
function fireUnlocked() {
  const cbs = _unlockCbs; _unlockCbs = [];
  for (const fn of cbs) { try { fn(); } catch (e) { reportError('onUnlock', e); } }
}

export const Audio = {
  BUS_NAMES,

  init() {
    if (_ctx || _unsupported) return Audio;
    try {
      const AC = typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext);
      if (!AC) { _unsupported = true; return Audio; }
      _ctx = new AC({ latencyHint: 'interactive' });
      _mix = buildMixer(_ctx, null, _vol, 'hall');
      _analyser = _ctx.createAnalyser(); _analyser.fftSize = 1024; _analyser.smoothingTimeConstant = 0.5;
      _mix.post.connect(_analyser);
      // generate the IR off the critical path: dry-only for a moment is fine
      const build = () => { try { applySpace(_mix, _mix.space, 0.3); } catch (e) { reportError('reverb', e); } };
      if (typeof requestIdleCallback === 'function') requestIdleCallback(build, { timeout: 400 }); else setTimeout(build, 0);
      _ctx.onstatechange = () => { if (_ctx.state === 'running') { disarmGestures(); fireUnlocked(); } else if (_ctx.state !== 'closed') armGestures(); };
      if (_ctx.state === 'running') fireUnlocked(); else armGestures();
    } catch (e) { _unsupported = !_ctx; reportError('init', e); }
    return Audio;
  },

  get ctx() { if (!_ctx) Audio.init(); return _ctx; },
  get mixer() { if (!_ctx) Audio.init(); return _mix; },
  get ready() { return !!_ctx && _ctx.state === 'running'; },
  get analyser() { if (!_ctx) Audio.init(); return _analyser; },
  /** Sample rate for offline renders: the live context's if one exists (never creates one), else 48000. */
  get sampleRate() { return _ctx ? _ctx.sampleRate : 48000; },

  bus(name) {
    const m = Audio.mixer; if (!m) return null;
    const b = m.buses[name] || m.buses.sfx;
    return b.in;
  },
  sendFor(name) {
    const m = Audio.mixer; if (!m) return null;
    const b = m.buses[name] || m.buses.sfx;
    return b.sendIn;
  },
  get reverbSend() { return Audio.sendFor('music'); },
  get reverbIn() { const m = Audio.mixer; return m ? m.reverbIn : null; },

  unlock() {
    const ctx = Audio.ctx;
    if (!ctx) return Promise.resolve(false);
    try {
      if (ctx.state === 'running') { disarmGestures(); fireUnlocked(); return Promise.resolve(true); }
      // iOS: a one-sample silent buffer started inside the gesture unlocks output
      const b = ctx.createBuffer(1, 1, ctx.sampleRate), s = ctx.createBufferSource();
      s.buffer = b; s.connect(ctx.destination); s.start(0);
      return ctx.resume().then(() => { if (ctx.state === 'running') { disarmGestures(); fireUnlocked(); } return ctx.state === 'running'; })
        .catch(e => { reportError('resume', e); return false; });
    } catch (e) { reportError('unlock', e); return Promise.resolve(false); }
  },

  onUnlock(fn) {
    if (_ctx && _ctx.state === 'running') { try { fn(); } catch (e) { reportError('onUnlock', e); } }
    else _unlockCbs.push(fn);
  },

  setVolume(name, v) {
    v = clamp(Number(v) || 0, 0, 1);
    _vol[name] = v;
    const m = _mix; if (!m) return;
    const t = m.ctx.currentTime;
    if (name === 'master') { m.masterGain.gain.setTargetAtTime(0.62 * v, t, 0.03); return; }
    const b = m.buses[name]; if (!b) return;
    b.in.gain.setTargetAtTime(v, t, 0.03);
    b.sendIn.gain.setTargetAtTime(v, t, 0.03);
  },
  getVolume(name) { return _vol[name]; },
  getVolumes() { return { ..._vol }; },
  setVolumes(obj) { for (const k of Object.keys(obj || {})) if (k in _vol) Audio.setVolume(k, obj[k]); },

  duck(name, amount = 0.55, ms = 120, holdMs) {
    const m = Audio.mixer; if (!m) return () => {};
    const b = m.buses[name]; if (!b) return () => {};
    const token = {};
    b.ducks.set(token, clamp(amount, 0, 1));
    retarget(m, b, ms);
    let released = false;
    const release = (relMs = 400) => { if (released) return; released = true; b.ducks.delete(token); retarget(m, b, relMs); };
    if (holdMs != null) setTimeout(() => release(400), Math.max(0, ms + holdMs));
    return release;
  },
  duckPulse(name, amount = 0.5, o = {}) {
    const m = Audio.mixer; if (!m) return;
    const t = Math.max(m.ctx.currentTime, o.at ?? m.ctx.currentTime);
    schedulePulse(m, name, amount, t, o.attack ?? 0.01, o.hold ?? 0.15, o.release ?? 0.25);
  },
  unduck(name, ms = 400) {
    const m = _mix; if (!m) return;
    const b = m.buses[name]; if (!b) return;
    b.ducks.clear(); retarget(m, b, ms);
  },

  setSpace(name, ms = 350) {
    const m = Audio.mixer; if (!m || !SPACES[name]) return;
    try { applySpace(m, name, ms / 1000); } catch (e) { reportError('setSpace', e); }
  },

  async renderOffline(fn, seconds = 2, opts = {}) {
    const OAC = typeof window !== 'undefined' && (window.OfflineAudioContext || window.webkitOfflineAudioContext);
    if (!OAC) throw new Error('OfflineAudioContext unavailable');
    const sr = opts.sampleRate || (_ctx ? _ctx.sampleRate : 48000);
    // Chrome's DynamicsCompressor starts an offline render fully "clamped" and needs ~its release time to open,
    // which would squash every onset in the first 200 ms. A live context never has that state, so every input
    // is fed through a PREROLL delay and the settled result is sliced out: callers still schedule from t=0.
    const PREROLL = opts.preroll ?? 0.3;
    const pre = Math.round(PREROLL * sr), len = Math.max(256, Math.ceil(seconds * sr));
    const octx = new OAC(2, len + pre, sr);
    const hold = { octx, nodes: retainNodes(octx) };
    _rendering.add(hold);
    const mix = buildMixer(octx, octx.destination, opts.volumes || DEFAULT_VOLUMES, opts.space || 'hall');
    applySpace(mix, opts.space || 'hall', 0.005);
    const delayed = (target) => {
      const inG = octx.createGain();
      if (!pre) { inG.connect(target); return inG; }
      const dl = octx.createDelay(Math.max(1, PREROLL + 0.1)); dl.delayTime.value = pre / sr;
      inG.connect(dl); dl.connect(target); return inG;
    };
    const busIn = {}, sendIn = {};
    for (const n of BUS_NAMES) { busIn[n] = delayed(mix.buses[n].in); sendIn[n] = delayed(mix.buses[n].sendIn); }
    const dest = delayed(mix.master);
    const rawVerb = delayed(mix.reverbIn);
    dest.ctx = octx; dest.mixer = mix;
    dest.bus = (n) => busIn[n] || busIn.sfx;
    dest.sendFor = (n) => sendIn[n] || sendIn.sfx;
    dest.reverbSend = sendIn.music;
    dest.reverbIn = rawVerb;
    dest.duckPulse = (n, amount = 0.5, o = {}) => schedulePulse(mix, n, amount, (o.at ?? 0) + pre / sr, o.attack ?? 0.01, o.hold ?? 0.15, o.release ?? 0.25);
    hold.mix = mix; hold.dest = dest;
    let full;
    try {
      hold.extra = await fn(octx, dest);
      full = await octx.startRendering();
    } finally { _rendering.delete(hold); }
    if (!pre) return full;
    const out = (typeof AudioBuffer === 'function')
      ? new AudioBuffer({ length: len, numberOfChannels: 2, sampleRate: sr })
      : octx.createBuffer(2, len, sr);
    for (let ch = 0; ch < 2; ch++) out.getChannelData(ch).set(full.getChannelData(ch).subarray(pre, pre + len));
    return out;
  },

  /** Instantaneous output peak in dBFS from the live analyser (for meters / state dumps). */
  peakDb() {
    if (!_analyser) return -Infinity;
    const a = new Float32Array(_analyser.fftSize); _analyser.getFloatTimeDomainData(a);
    let p = 0; for (let i = 0; i < a.length; i++) { const v = Math.abs(a[i]); if (v > p) p = v; }
    return 20 * Math.log10(p + 1e-9);
  },

  state() {
    const ducks = {};
    const pulses = {};
    if (_mix) for (const n of BUS_NAMES) {
      const b = _mix.buses[n], d = b.ducks; ducks[n] = d.size ? Math.min(...d.values()) : 1;
      pulses[n] = +b.pulse.gain.value.toFixed(2);
    }
    return {
      ctxState: _ctx ? _ctx.state : (_unsupported ? 'unsupported' : 'none'),
      sampleRate: _ctx ? _ctx.sampleRate : 0,
      unlocked: !!_ctx && _ctx.state === 'running',
      volumes: { ..._vol }, ducks, pulses, space: _mix ? _mix.space : null,
      peakDb: +Audio.peakDb().toFixed(1),
    };
  },
};

function retarget(m, b, ms) {
  const target = b.ducks.size ? Math.min(...b.ducks.values()) : 1;
  const t = m.ctx.currentTime, T = Math.max(0.005, ms / 1000);
  for (const p of [b.duck.gain, b.sendDuck.gain]) {
    try {
      if (p.cancelAndHoldAtTime) p.cancelAndHoldAtTime(t); else { const v = p.value; p.cancelScheduledValues(t); p.setValueAtTime(v, t); }
      p.linearRampToValueAtTime(target, t + T);
    } catch (e) { reportError('duck', e); }
  }
}

export default Audio;
