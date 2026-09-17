/**
 * sampler.js — the multisample player: real recorded instruments for the score.            (P27, owner: this file)
 *
 * Samples live in vendor/samples/<library>/<instrument>/ and are described by vendor/samples/manifest.json
 * (built by tools/samples/build.mjs): per instrument a list of zones
 *   {f: file, r: measured root (fractional MIDI) | null, l: velocity layer, rr: round robin, sr, n: frames,
 *    ls/le: baked loop start/end in frames (sustains only), g: gain that brings the zone to the common loudness}
 *
 *   Sampler.manifest()                     -> Promise<manifest>   (fetched once)
 *   Sampler.load(ctx, ids)                 -> Promise             decode every zone of those instruments (cached per
 *                                                                 sample rate; the same buffers serve every context
 *                                                                 of that rate, live or OfflineAudioContext)
 *   Sampler.ready(ctx, id) / missing(ctx, ids)                   synchronous readiness
 *   Sampler.state()                        -> {instruments:{id:{status, zones, loaded, mb}}, mb, errors}
 *   Sampler.onChange(fn)                   progress callback (demo loading bars)
 *   Sampler.note(ctx, id, p, dest)         -> handle | null       one sampled note into `dest`
 *   Sampler.plan(id, m, vel, lo, hi, prefer) -> [file]           the zone file(s) note() would pick (lazy per-zone loading)
 *   Sampler.loadFiles(ctx, files)          -> Promise             decode just those zones (in the order given)
 *   Sampler.missingFiles(ctx, files)       -> [file]              synchronous
 *
 * A note (p): {t, dur, m, amp, vel (0..1.15 picks/crossfades layers), rel, attack, swell, detune (cents),
 *   offset (s into the sample), legato (bool: skip the attack, short fade-in), ring (one-shot rings past dur),
 *   damp (one-shot is damped at note-off), path [[sec, midi]] (slurred line: crossfaded legato segments),
 *   prefer (k-th nearest zone within 2.6 semitones: section players on different samples), bend [[sec, cents]]}
 * Pitch: playbackRate from the nearest root (ties prefer shifting DOWN, which sounds more natural).
 * Layers: ONE layer per note — the one nearest the velocity position. (Summing two unaligned takes of the same pitch
 * phase-beats: a held clarinet swung 10 dB. Loudness follows `amp`; the layer only chooses the timbre.)
 * Fallback: if the chosen zone is not decoded yet (lazy per-zone loading), the nearest DECODED zone of the instrument
 * plays instead (same layer first) — a note is only lost when nothing of that instrument has arrived.
 * Handle: {t0, end, level(t), release(t, rt), cleanup()} — the contract music.js's voice budget uses.
 * Never throws for a missing buffer: returns null (the caller decides; offline renders wait for load()).
 */

const BASE = (() => { try { return new URL('../../vendor/samples/', import.meta.url).href; } catch (_) { return '/vendor/samples/'; } })();

let manifestP = null, manifest = null;
const bytes = new Map();      // file -> Promise<ArrayBuffer>
const decoded = new Map();    // `${sr}|${file}` -> AudioBuffer
const decoding = new Map();   // `${sr}|${file}` -> Promise<AudioBuffer|null>
const insts = new Map();      // id -> prepared lookup tables
const status = new Map();     // `${sr}|${id}` -> {status, loaded, zones}
const listeners = new Set();
let errors = 0, mbLoaded = 0, fallbacks = 0;
const rrCounts = new WeakMap(); // ctx -> Map (renders are deterministic)

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const emit = () => { for (const fn of listeners) { try { fn(api.state()); } catch (_) { /* ignore */ } } };

function report(where, e) {
  errors++;
  try {
    const msg = `[sampler] ${where}: ${e && e.message ? e.message : e}`;
    if (typeof window !== 'undefined') { window.__DQ = window.__DQ || {}; (window.__DQ.errors ||= []).push(msg); }
    console.warn(msg);
  } catch (_) { /* never throw from the error path */ }
}

function loadManifest() {
  if (!manifestP) {
    manifestP = fetch(BASE + 'manifest.json').then((r) => { if (!r.ok) throw new Error('manifest ' + r.status); return r.json(); })
      .then((m) => { manifest = m; for (const [id, inst] of Object.entries(m.instruments)) insts.set(id, prepare(id, inst)); return m; })
      .catch((e) => { report('manifest', e); manifestP = null; throw e; });
  }
  return manifestP;
}

/** lookup tables: per layer, roots ascending with their round robins; unpitched layers keep their rr list */
function prepare(id, inst) {
  const layers = [];
  for (let l = 0; l < inst.layers; l++) {
    const zs = inst.zones.filter((z) => z.l === l);
    const roots = new Map();
    for (const z of zs) { const k = z.r == null ? 'x' : z.r.toFixed(2); if (!roots.has(k)) roots.set(k, { r: z.r, rr: [] }); roots.get(k).rr.push(z); }
    layers.push([...roots.values()].sort((a, b) => (a.r ?? 0) - (b.r ?? 0)));
  }
  // an empty layer borrows its neighbour so a layer index is always playable
  for (let l = 0; l < layers.length; l++) if (!layers[l].length) layers[l] = layers[l - 1]?.length ? layers[l - 1] : layers.find((x) => x.length) || [];
  const pitched = inst.zones.some((z) => z.r != null);
  const rs = inst.zones.filter((z) => z.r != null).map((z) => z.r);
  const byFile = new Map(inst.zones.map((z) => [z.f, z]));
  for (const z of inst.zones) fileInst.set(z.f, id);
  return { id, kind: inst.kind, layers, pitched, lo: rs.length ? Math.min(...rs) : 0, hi: rs.length ? Math.max(...rs) : 0, zones: inst.zones, bytes: inst.bytes, byFile };
}

function fetchBytes(f) {
  let p = bytes.get(f);
  if (!p) {
    p = fetch(BASE + f).then((r) => { if (!r.ok) throw new Error(r.status + ' ' + f); return r.arrayBuffer(); })
      .then((ab) => { mbLoaded += ab.byteLength / 1048576; return ab; });
    p.catch(() => bytes.delete(f));
    bytes.set(f, p);
  }
  return p;
}

function decodeZone(ctx, z) {
  const key = ctx.sampleRate + '|' + z.f;
  if (decoded.has(key)) return Promise.resolve(decoded.get(key));
  let p = decoding.get(key);
  if (!p) {
    p = fetchBytes(z.f).then((ab) => new Promise((res, rej) => {
      // decodeAudioData detaches its input: always hand it a copy so another sample rate can decode the same bytes
      const copy = ab.slice(0);
      const ok = (buf) => { decoded.set(key, buf); res(buf); };
      try { const r = ctx.decodeAudioData(copy, ok, rej); if (r && r.then) r.then(ok, rej); } catch (e) { rej(e); }
    })).catch((e) => { report('decode ' + z.f, e); decoding.delete(key); return null; });
    decoding.set(key, p);
  }
  return p;
}

function stat(ctx, id) {
  const key = ctx.sampleRate + '|' + id;
  let s = status.get(key);
  if (!s) { const I = insts.get(id); s = { status: 'idle', loaded: 0, zones: I ? I.zones.length : 0, p: null, want: new Set(), have: new Set() }; status.set(key, s); }
  return s;
}
const fileInst = new Map(); // file -> instrument id
function refresh(s) {
  s.loaded = s.have.size;
  if (s.p && s.status !== 'error') return; // a whole-instrument load reports itself
  let pending = 0; for (const f of s.want) if (!s.have.has(f)) pending++;
  s.status = !s.want.size ? 'idle' : pending ? 'loading' : 'ready';
}

async function loadOne(ctx, id) {
  await loadManifest();
  const I = insts.get(id);
  if (!I) { report('load', 'no instrument ' + id); return; }
  const s = stat(ctx, id);
  if (s.p) return s.p;
  s.status = 'loading'; s.zones = I.zones.length;
  for (const z of I.zones) s.want.add(z.f);
  emit();
  s.p = Promise.all(I.zones.map((z) => decodeZone(ctx, z).then((b) => { if (b) { s.have.add(z.f); s.loaded = s.have.size; } emit(); return b; })))
    .then((bufs) => { s.status = bufs.every(Boolean) ? 'ready' : 'error'; s.full = true; emit(); });
  return s.p;
}

/** decode a list of zone files (in order, a few at a time) for ctx's sample rate; never rejects */
async function loadFiles(ctx, files) {
  await loadManifest();
  const list = [...new Set(files)].filter((f) => fileInst.has(f));
  const todo = [];
  for (const f of list) {
    const id = fileInst.get(f); const s = stat(ctx, id);
    s.want.add(f);
    if (decoded.has(ctx.sampleRate + '|' + f)) { s.have.add(f); continue; }
    todo.push(f);
  }
  for (const id of new Set(list.map((f) => fileInst.get(f)))) refresh(stat(ctx, id));
  emit();
  let k = 0;
  const worker = async () => {
    for (;;) {
      const f = todo[k++]; if (f == null) return;
      const id = fileInst.get(f); const z = insts.get(id).byFile.get(f); const s = stat(ctx, id);
      const b = await decodeZone(ctx, z);
      if (b) s.have.add(f); else if (!s.p) s.status = 'error';
      refresh(s); emit();
    }
  };
  await Promise.all(Array.from({ length: 6 }, worker));
}

const cents = (c) => Math.pow(2, c / 1200);

/** nearest zone group for midi m in a layer; `prefer` walks to the k-th nearest (section players on different samples) */
function pickRoot(layer, m, prefer = 0) {
  if (!layer.length) return null;
  if (layer.length === 1 || layer[0].r == null) return layer[0];
  const cost = (g) => { const d = m - g.r; return Math.abs(d) + (d > 0 ? 0.3 : 0); };
  const sorted = prefer ? layer.slice().sort((a, b) => cost(a) - cost(b)) : null;
  if (sorted) { const alt = sorted[Math.min(prefer, sorted.length - 1)]; return Math.abs(m - alt.r) <= 2.6 ? alt : sorted[0]; }
  let best = layer[0], bc = cost(best);
  for (let i = 1; i < layer.length; i++) { const c = cost(layer[i]); if (c < bc) { bc = c; best = layer[i]; } }
  return best;
}
function pickRR(ctx, I, g) {
  if (g.rr.length === 1) return g.rr[0];
  let rrCount = rrCounts.get(ctx); if (!rrCount) { rrCount = new Map(); rrCounts.set(ctx, rrCount); }
  const k = I.id + (g.r ?? 'x');
  const n = (rrCount.get(k) || 0) + 1; rrCount.set(k, n);
  return g.rr[n % g.rr.length];
}

/** velocity -> the ONE layer nearest the velocity position (see header: summed layers phase-beat) */
function layerOf(I, vel, lo = 0.22, hi = 0.86) {
  const N = I.layers.length;
  if (N === 1) return 0;
  const x = clamp((vel - lo) / (hi - lo), 0, 1) * (N - 1);
  return clamp(Math.round(x), 0, N - 1);
}
/** the layer position before rounding (planning keeps both neighbours when a humanised velocity could cross) */
function layerPos(I, vel, lo = 0.22, hi = 0.86) {
  const N = I.layers.length;
  return N === 1 ? 0 : clamp((vel - lo) / (hi - lo), 0, 1) * (N - 1);
}
const bufOf = (ctx, z) => decoded.get(ctx.sampleRate + '|' + z.f);
/** the zone to play: the chosen one if decoded, else the nearest decoded zone (same layer first, then any layer) */
function zoneFor(ctx, I, l, m, prefer) {
  const g = pickRoot(I.layers[l], m, prefer); if (!g) return null;
  const z = pickRR(ctx, I, g);
  if (bufOf(ctx, z)) return z;
  const order = [l, ...I.layers.map((_, k) => k).filter((k) => k !== l).sort((a, b) => Math.abs(a - l) - Math.abs(b - l))];
  for (const k of order) {
    let best = null, bd = Infinity;
    for (const grp of I.layers[k]) for (const zz of grp.rr) {
      if (!bufOf(ctx, zz)) continue;
      const d = grp.r == null ? 0 : Math.abs(m - grp.r);
      if (d < bd) { bd = d; best = zz; }
    }
    if (best) { fallbacks++; return best; }
  }
  return null;
}

/**
 * One sampled note (or a slurred path of them) into `dest`. Returns a handle or null when buffers are missing.
 */
function note(ctx, id, p, dest) {
  const I = insts.get(id);
  if (!I) return null;
  if (p.path && p.path.length > 1) return pathNote(ctx, I, p, dest);
  const out = ctx.createGain(); out.gain.value = 0;
  out.connect(dest);
  const t = p.t, dur = Math.max(0.01, p.dur);
  const tOff = t + dur;
  const rel = p.rel ?? 0.25;
  const srcs = [], gains = [];
  let bufEnd = t, looped = false;
  const mix = [{ l: layerOf(I, p.vel ?? 0.6, p.layerLo, p.layerHi), w: 1 }];
  for (const { l, w } of mix) {
    const z = zoneFor(ctx, I, l, p.m ?? 60, p.prefer || 0);
    const buf = z && bufOf(ctx, z);
    if (!buf) return cleanupPartial(out, srcs);
    const s = ctx.createBufferSource(); s.buffer = buf;
    const rate = z.r == null ? cents(p.detune || 0) : Math.pow(2, ((p.m ?? z.r) - z.r) / 12) * cents(p.detune || 0);
    s.playbackRate.value = rate;
    if (p.bend) { s.playbackRate.setValueAtTime(rate, t); p.bend.forEach(([sec, c], k) => { if (k === 0) s.playbackRate.setValueAtTime(rate * cents(c), t + sec); else s.playbackRate.linearRampToValueAtTime(rate * cents(c), t + sec); }); }
    const loopable = z.le != null && z.le > z.ls;
    if (loopable) { s.loop = true; s.loopStart = z.ls / z.sr; s.loopEnd = z.le / z.sr; looped = true; }
    const zg = ctx.createGain(); zg.gain.value = z.g * w;
    s.connect(zg); zg.connect(out);
    let off = p.offset || 0;
    if (p.legato && loopable) off = Math.max(off, Math.min(z.ls / z.sr * 0.8, 0.3));
    off = Math.min(off, buf.duration * 0.9);
    s.start(Math.max(t, ctx.currentTime), off);
    srcs.push(s); gains.push(zg.gain);
    if (!loopable) bufEnd = Math.max(bufEnd, t + (buf.duration - off) / rate);
  }
  if (!srcs.length) { try { out.disconnect(); } catch (_) { /* ignore */ } return null; }
  const amp = p.amp ?? 1;
  const G = out.gain;
  const atk = p.legato ? Math.max(0.05, p.attack || 0) : (p.attack || 0);
  if (atk > 0.004) { G.setValueAtTime(0, t); G.linearRampToValueAtTime(amp, t + Math.min(atk, dur * 0.9 + 0.02)); }
  else G.setValueAtTime(amp, t);
  const sw = p.swell ?? 1;
  if (sw !== 1 && tOff > t + atk + 0.05) {
    G.setValueAtTime(amp, Math.max(t + atk, t + 0.01));
    // big crescendi (rolls) are even in decibels, small swells are a gentle linear lean
    if (sw > 1.6 || sw < 0.6) G.exponentialRampToValueAtTime(Math.max(1e-4, amp * sw), tOff); else G.linearRampToValueAtTime(amp * sw, tOff);
  }
  let end;
  if (looped) {
    G.setTargetAtTime(0, Math.max(tOff, t + 0.005), Math.max(0.004, rel / 4));
    end = tOff + rel * 1.6 + 0.02;
  } else if (p.ring && !p.damp) end = bufEnd + 0.02;
  else {
    const offAt = Math.min(tOff, bufEnd);
    G.setTargetAtTime(0, Math.max(offAt, t + 0.005), Math.max(0.004, rel / 4));
    end = Math.min(bufEnd, offAt + rel * 1.6) + 0.02;
  }
  for (const s of srcs) { try { s.stop(end); } catch (_) { /* ignore */ } }
  const peak = amp * Math.max(1, sw);
  const tau = looped ? 0 : p.tau ?? Math.max(0.2, (bufEnd - t) / 4);
  const h = {
    t0: t, end, peak, srcs, out,
    level(tt) { if (tt >= h.end) return 0; if (tt <= t || !tau) return peak; return peak * Math.exp(-(tt - t) / tau); },
    release(tt, rt = 0.04) {
      try { if (G.cancelAndHoldAtTime) G.cancelAndHoldAtTime(tt); else G.cancelScheduledValues(tt); G.setTargetAtTime(0, tt, Math.max(0.003, rt / 4)); } catch (_) { /* ignore */ }
      const st = tt + rt * 2 + 0.02;
      for (const s of srcs) { try { s.stop(st); } catch (_) { /* ignore */ } }
      h.end = Math.min(h.end, st);
    },
    cleanup() { try { out.disconnect(); } catch (_) { /* ignore */ } },
  };
  return h;
}
function cleanupPartial(out, srcs) { for (const s of srcs) { try { s.stop(); } catch (_) { /* ignore */ } } try { out.disconnect(); } catch (_) { /* ignore */ } return null; }

/** a slurred line: one segment per path point; later segments start past their attack and crossfade (~70 ms) */
function pathNote(ctx, I, p, dest) {
  const segs = [];
  const pts = p.path;
  for (let i = 0; i < pts.length; i++) {
    const [sec, m] = pts[i];
    const next = i + 1 < pts.length ? pts[i + 1][0] : p.dur;
    const first = i === 0, last = i === pts.length - 1;
    const x = 0.035;
    const seg = note(ctx, I.id, {
      ...p, path: null, t: p.t + sec - (first ? 0 : x), dur: Math.max(0.03, next - sec + (first ? 0 : x) + (last ? 0 : 0.01)), m,
      legato: !first, attack: first ? p.attack : 0.07, rel: last ? p.rel : 0.07, swell: last ? p.swell : 1,
      // a small slur slides (portamento) into the next note just before the crossfade; times are from this segment's start
      bend: !last && p.portamento && Math.abs(pts[i + 1][1] - m) <= 2.01 ? [[next - sec + (first ? 0 : x) - 0.03, 0], [next - sec + (first ? 0 : x) + 0.03, (pts[i + 1][1] - m) * 100]] : null,
    }, dest);
    if (!seg) { for (const s of segs) s.release(ctx.currentTime, 0.02); return null; }
    segs.push(seg);
  }
  const h = {
    t0: p.t, end: Math.max(...segs.map((s) => s.end)), peak: Math.max(...segs.map((s) => s.peak)),
    level(tt) { let v = 0; for (const s of segs) v = Math.max(v, s.level(tt)); return v; },
    release(tt, rt) { for (const s of segs) s.release(tt, rt); h.end = Math.min(h.end, tt + (rt ?? 0.04) * 2 + 0.02); },
    cleanup() { for (const s of segs) s.cleanup(); },
  };
  return h;
}

const api = {
  BASE,
  manifest: loadManifest,
  get loaded() { return manifest; },
  /** decode every zone of these instruments for ctx's sample rate; never rejects */
  load(ctx, ids) {
    const list = [...new Set(ids)].filter(Boolean);
    return Promise.all(list.map((id) => loadOne(ctx, id).catch((e) => report('load ' + id, e)))).then(() => undefined);
  },
  ready(ctx, id) { const s = status.get(ctx.sampleRate + '|' + id); return !!s && s.status === 'ready'; },
  missing(ctx, ids) { return [...new Set(ids)].filter((id) => !api.ready(ctx, id)); },
  has(id) { return insts.has(id); },
  range(id) { const I = insts.get(id); return I ? [I.lo, I.hi] : null; },
  note,
  loadFiles,
  missingFiles(ctx, files) { return [...new Set(files)].filter((f) => !decoded.has(ctx.sampleRate + '|' + f)); },
  /** zone files a note would use: every round robin of the nearest root, in each layer the velocity could land on */
  plan(id, m, vel = 0.6, lo, hi, prefer = 0, margin = 0.12) {
    const I = insts.get(id); if (!I) return [];
    const x = layerPos(I, vel, lo, hi); const ls = new Set([clamp(Math.round(x - margin), 0, I.layers.length - 1), clamp(Math.round(x + margin), 0, I.layers.length - 1)]);
    const out = [];
    for (const l of ls) { const g = pickRoot(I.layers[l], m ?? 60, prefer); if (g) for (const z of g.rr) out.push(z.f); }
    return out;
  },
  get fallbacks() { return fallbacks; },
  onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },
  state() {
    const out = {};
    for (const [key, s] of status) {
      const [sr, id] = key.split('|');
      const prev = out[id];
      if (!prev || sr >= prev.sr) out[id] = { status: s.status, loaded: s.loaded, wanted: s.want.size, zones: s.zones, sr: +sr, mb: +((insts.get(id)?.bytes || 0) / 1048576).toFixed(2) };
    }
    return { manifest: !!manifest, instruments: out, mbFetched: +mbLoaded.toFixed(2), errors, fallbacks, totalMb: manifest ? +(manifest.totalBytes / 1048576).toFixed(2) : null };
  },
};

export const Sampler = api;
export default Sampler;
