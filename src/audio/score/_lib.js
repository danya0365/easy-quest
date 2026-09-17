/**
 * score/_lib.js — music theory + the score builder every theme file uses.     (P27, owner: src/audio/score/*)
 * Pure data, no Web Audio, importable from node (the harmony checker runs there too).
 *
 * Conventions (MUSIC-BIBLE §0): notes are ["C#4", beats] pairs, 1 beat = a quarter note, "R" = rest,
 * a "~" suffix ties into the previous note of the same pitch. Bars are 0-indexed in code.
 * 6/8 themes use meter:3 (three quarter-beats per bar) and a quarter-note bpm (dotted-quarter x 1.5).
 */

export const DYN = { ppp: 0.10, pp: 0.18, p: 0.30, mp: 0.45, mf: 0.60, f: 0.78, ff: 0.92, fff: 1.0 };
const PCS = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const NAMES = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];

export function midi(n) {
  if (typeof n === 'number') return n;
  if (n == null || n === 'R') return null;
  const m = /^([A-G])([#b]{0,2})(-?\d)~?$/.exec(String(n).trim());
  if (!m) throw new Error('bad note ' + n);
  let pc = PCS[m[1]];
  for (const c of m[2]) pc += c === '#' ? 1 : -1;
  return pc + (Number(m[3]) + 1) * 12;
}
export const noteName = (m) => NAMES[((m % 12) + 12) % 12] + (Math.floor(m / 12) - 1);
export const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
export const dyn = (d) => (typeof d === 'number' ? d : DYN[d] ?? 0.6);

// ---------------------------------------------------------------------------------------------- chords
const Q = {
  '': [0, 4, 7], M: [0, 4, 7], m: [0, 3, 7], 7: [0, 4, 7, 10], m7: [0, 3, 7, 10], maj7: [0, 4, 7, 11],
  dim: [0, 3, 6], dim7: [0, 3, 6, 9], m7b5: [0, 3, 6, 10], aug: [0, 4, 8], sus4: [0, 5, 7], sus2: [0, 2, 7],
  '7sus4': [0, 5, 7, 10], add9: [0, 4, 7, 14], madd9: [0, 3, 7, 14], 6: [0, 4, 7, 9], m6: [0, 3, 7, 9],
  9: [0, 4, 7, 10, 14], '7b9': [0, 4, 7, 10, 13], m9: [0, 3, 7, 10, 14], maj9: [0, 4, 7, 11, 14],
  mb9: [0, 3, 7, 13], 'maj7#11': [0, 4, 7, 11, 18],
};
const pcOf = (s) => { let pc = PCS[s[0]]; for (const c of s.slice(1)) pc += c === '#' ? 1 : -1; return (pc + 12) % 12; };

/** "D", "Em", "A7", "D/F#", "Db(N6)" (neapolitan sixth = major triad, third in bass), "Dm(b9)", "D-add9". */
export function parseChord(sym) {
  const m = /^([A-G][#b]?)([^/]*)(?:\/([A-G][#b]?))?$/.exec(sym.trim());
  if (!m) throw new Error('bad chord ' + sym);
  const root = pcOf(m[1]);
  let q = m[2].replace(/^-/, '');
  let bassIv = 0;
  if (q === '(N6)') { q = ''; bassIv = 4; }
  if (q === 'm(b9)') q = 'mb9';
  const iv = Q[q];
  if (!iv) throw new Error('unknown chord quality ' + sym);
  const bass = m[3] ? pcOf(m[3]) : (root + bassIv) % 12;
  return { sym, root, iv, pcs: new Set(iv.map((i) => (root + i) % 12)), bass, minor: iv[1] === 3 };
}

/** Harmony list from bar symbols: ['D','G|A'] -> [{b,d,sym,...}] (a split bar is shared evenly). */
export function harmony(startBar, syms, meter) {
  const out = [];
  syms.forEach((s, i) => {
    const parts = s.split('|');
    const d = meter / parts.length;
    parts.forEach((p, j) => out.push({ b: (startBar + i) * meter + j * d, d, ...parseChord(p) }));
  });
  return out;
}

/** Pick `n` chord tones (intervals). Triads double the root when n=4; 7ths drop the fifth when n=3. */
function pickIv(ch, n) {
  let iv = ch.iv.map((i) => i % 12);
  iv = [...new Set(iv)];
  if (iv.length > n && iv.length >= 4) iv = iv.filter((i, k) => !(k === 2 && iv.length - 1 >= n)); // drop 5th
  while (iv.length > n) iv.pop();
  while (iv.length < n) iv.push(iv[iv.length % Math.max(1, iv.length)] ?? 0);
  return iv;
}

/** Close-ish voicing of `n` notes inside [lo,hi], smoothest move from `prev`. */
export function voiceChord(ch, n, lo, hi, prev) {
  lo = midi(lo); hi = midi(hi);
  const iv = pickIv(ch, n);
  const perms = [];
  const permute = (arr, acc) => { if (!arr.length) { perms.push(acc); return; } arr.forEach((x, i) => permute(arr.filter((_, j) => j !== i), [...acc, x])); };
  permute(iv, []);
  let best = null, bestScore = Infinity;
  for (const p of perms) {
    for (let start = lo; start < lo + 12; start++) {
      if (((start - ch.root) % 12 + 12) % 12 !== ((p[0] % 12) + 12) % 12) continue;
      const v = [start];
      for (let k = 1; k < p.length; k++) {
        let x = v[k - 1] + 1;
        while (((x - ch.root) % 12 + 12) % 12 !== p[k] % 12) x++;
        v.push(x);
      }
      if (v[v.length - 1] > hi) continue;
      let score;
      if (prev && prev.length === v.length) score = v.reduce((s, x, k) => s + Math.abs(x - prev[k]), 0);
      else score = Math.abs((v[0] + v[v.length - 1]) / 2 - (lo + hi) / 2);
      if (new Set(v).size < v.length) score += 30;
      if (score < bestScore) { bestScore = score; best = v; }
    }
  }
  return best || iv.map((i) => lo + i);
}

/** Chord degree token -> midi at or above `base`: '1','3','5','7','8','9','10','12','15','b3' (minor third regardless). */
export function degree(ch, tok, base) {
  base = midi(base);
  let r = base + ((ch.root - base) % 12 + 12) % 12; // root at/above base
  const third = ch.iv[1], fifth = ch.iv[2] ?? 7, seventh = ch.iv[3] != null && ch.iv[3] < 12 ? ch.iv[3] : 12;
  switch (String(tok)) {
    case 'B': { const bb = base + ((ch.bass - base) % 12 + 12) % 12; return bb; }
    case 'B8': return degree(ch, 'B', base) + 12;
    case '1': return r;
    case '3': return r + third;
    case 'b3': return r + 3;
    case '5': return r + fifth;
    case '7': return r + seventh;
    case '8': return r + 12;
    case '9': return r + 14;
    case '10': return r + 12 + third;
    case '12': return r + 12 + fifth;
    case '14': return r + 12 + seventh;
    case '15': return r + 24;
    case '-5': return r + fifth - 12;
    default: throw new Error('degree token ' + tok);
  }
}

// ---------------------------------------------------------------------------------------------- builder
/**
 * Theme(meta): meta = { id, title, key, bpm, meter, pulse, intro (bars), loop (bars|0 one-shot), bars,
 *   space:'HALL'|'ROOM'|'CHAPEL'|'DUNGEON', gain, sendAdd, tempo:[{bar,bpm,to?,bars?}], kind, tail, enter, loopDb }
 */
export function Theme(meta) {
  const T = {
    ...meta, meter: meta.meter || 4, pulse: meta.pulse || [0], events: [], harm: [], parts: {},
    gain: meta.gain ?? 1, sendAdd: meta.sendAdd || 0, intro: meta.intro || 0,
  };
  T.bar = (bar, beat = 0) => bar * T.meter + beat;
  T.part = (name, cfg) => (T.parts[name] = makePart(T, name, cfg));
  /** Record harmony for analysis and return it for accompaniment generators. */
  T.chords = (bar, syms, record = true) => { const h = harmony(bar, syms, T.meter); if (record) T.harm.push(...h); return h; };

  /** Sustained chords. o: {n, lo, hi, dyn, cresc:[a,b], art, bars(per chord re-articulation), overlap} */
  T.pad = (part, harm, o = {}) => {
    const P = T.parts[part]; let prev = null;
    const d0 = harm[0]?.b ?? 0, d1 = harm.length ? harm[harm.length - 1].b + harm[harm.length - 1].d : 0;
    harm.forEach((c, i) => {
      // merge consecutive identical chords into one held chord unless rearticulate
      if (!o.rearticulate && i > 0 && harm[i - 1].sym === c.sym && harm[i - 1].b + harm[i - 1].d === c.b) return;
      let d = c.d; for (let j = i + 1; !o.rearticulate && j < harm.length && harm[j].sym === c.sym && harm[j].b === c.b + d; j++) d += harm[j].d;
      const v = voiceChord(c, o.n || 3, o.lo || 'D3', o.hi || 'A4', prev); prev = v;
      const vel = o.cresc ? lerp(dyn(o.cresc[0]), dyn(o.cresc[1]), (c.b - d0) / Math.max(1, d1 - d0)) : dyn(o.dyn || 'p');
      v.forEach((m, k) => P.push({ b: c.b + (o.offset || 0), d: d + (o.overlap ?? 0.04) - (o.offset || 0), m, v: vel, ci: k, shape: false, art: o.art, o: o.o, gen: 'pad' }));
    });
  };

  /** Arpeggio. o: {pat:['1','5','8'], step:.5, base:'G2', dyn, len (beats each note rings), gainFall} */
  T.arp = (part, harm, o = {}) => {
    const P = T.parts[part]; const step = o.step || 0.5; const pat = o.pat || ['1', '5', '8', '10', '8', '5'];
    const start = harm[0].b, end = harm[harm.length - 1].b + harm[harm.length - 1].d;
    const cyc = o.cycle ?? T.meter;
    for (let b = start; b < end - 1e-6; b += step) {
      const c = harm.find((h) => b >= h.b - 1e-6 && b < h.b + h.d - 1e-6); if (!c) continue;
      const pos = Math.round(((b - (o.phaseFrom ?? start)) % cyc) / step);
      const tok = pat[pos % pat.length]; if (tok === 'R' || tok == null) continue;
      const vel = o.cresc ? lerp(dyn(o.cresc[0]), dyn(o.cresc[1]), (b - start) / Math.max(1, end - start)) : dyn(o.dyn || 'p');
      const accent = pos % pat.length === 0 ? 1.08 : 1;
      P.push({ b, d: o.len || step * 3, m: degree(c, tok, o.base || 'G2'), v: vel * accent, shape: false, art: o.art, o: o.o, gen: 'arp' });
    }
  };

  /** Bass figures per chord. o: {pat:[[offset, tok, dur, velMul?]...], cycle, base, dyn} — pattern repeats every `cycle` beats. */
  T.bass = (part, harm, o = {}) => {
    const P = T.parts[part]; const cyc = o.cycle || T.meter; const pat = o.pat || [[0, '1', T.meter]];
    const start = harm[0].b, end = harm[harm.length - 1].b + harm[harm.length - 1].d;
    for (let cb = Math.floor(start / cyc) * cyc; cb < end - 1e-6; cb += cyc) {
      for (const [off, tok, dur, vm] of pat) {
        const b = cb + off; if (b < start - 1e-6 || b >= end - 1e-6) continue;
        const c = harm.find((h) => b >= h.b - 1e-6 && b < h.b + h.d - 1e-6); if (!c) continue;
        const vel = o.cresc ? lerp(dyn(o.cresc[0]), dyn(o.cresc[1]), (b - start) / Math.max(1, end - start)) : dyn(o.dyn || 'mp');
        P.push({ b, d: dur, m: degree(c, tok, o.base || 'C2'), v: vel * (vm ?? 1), shape: false, art: o.art, o: o.o, gen: 'bass' });
      }
    }
  };

  T.build = () => {
    const introBeats = T.intro * T.meter;
    const loopBeats = (T.loop || 0) * T.meter;
    const bars = T.bars || T.intro + (T.loop || 0) || Math.ceil(T.events.reduce((m, e) => Math.max(m, e.b + e.d), 0) / T.meter - 1e-6);
    const totalBeats = Math.max(bars * T.meter, introBeats + loopBeats);
    // a note written at or past the loop end belongs to the top of the NEXT pass: fold it to the loop start and mark it
    // `wrap` (music.js skips it on the first pass). Left in place, the engine would schedule it after the loop's own
    // opening notes had gone stale and skip them on every repeat.
    if (loopBeats) for (const e of T.events) if (e.b >= introBeats + loopBeats - 1e-6) { e.b -= loopBeats; e.wrap = true; }
    const events = T.events.slice().sort((a, b) => a.b - b.b || (a.ci || 0) - (b.ci || 0));
    events.forEach((e, i) => { e.i = i; });
    // slurs: a note in a single-line part whose next note starts exactly where it ends (music.js holds it into the join)
    const lastOf = new Map(), poly = new Set();
    for (const e of events) {
      const prev = lastOf.get(e.part);
      if (prev && e.b < prev.b + prev.d - 1e-6) poly.add(e.part);
      if (prev && Math.abs(prev.b + prev.d - e.b) < 1e-6 && e.m != null && prev.m != null && !e.wrap && !prev.wrap) prev.next = e.i;
      if (!prev || e.b + e.d >= prev.b + prev.d - 1e-6) lastOf.set(e.part, e);
    }
    for (const e of events) if (poly.has(e.part)) delete e.next;
    const time = tempoFn(T, totalBeats);
    const firstLoop = events.findIndex((e) => e.b >= introBeats - 1e-6);
    let lastEnd = 0; for (const e of events) lastEnd = Math.max(lastEnd, time(e.b + e.d) + (e.sec || 0));
    return {
      id: T.id, title: T.title, key: T.key, bpm: T.bpm, meter: T.meter, sig: T.sig || `${T.meter}/4`, pulse: T.pulse, space: T.space || 'HALL',
      gain: T.gain, sendAdd: T.sendAdd, kind: T.loop ? 'loop' : (T.kind || 'oneshot'), bars, intro: T.intro, loop: T.loop || 0,
      introBeats, loopBeats, totalBeats, events, firstLoop: firstLoop < 0 ? events.length : firstLoop, harm: T.harm,
      time, introSec: time(introBeats), loopSec: T.loop ? time(introBeats + loopBeats) - time(introBeats) : 0,
      lengthSec: T.loop ? time(introBeats + loopBeats) : lastEnd, tail: T.tail ?? 3, enter: T.enter || null,
      loopDb: T.loopDb || null, melodyParts: Object.values(T.parts).filter((p) => p.cfg.bus === 'melody').map((p) => p.name),
      parts: Object.fromEntries(Object.values(T.parts).map((p) => [p.name, { voice: p.cfg.voice, bus: p.cfg.bus }])),
    };
  };
  return T;
}

const lerp = (a, b, t) => a + (b - a) * Math.max(0, Math.min(1, t));

function makePart(T, name, cfg) {
  cfg = { bus: 'harmony', gain: 1, oct: 0, ...cfg };
  const P = { name, cfg };
  P.push = (e) => {
    if (e.m != null) e.m += (cfg.oct || 0) * 12 + (cfg.tr || 0);
    const o = e.o ? { ...cfg.o, ...e.o } : cfg.o;
    T.events.push({ part: name, voice: cfg.voice, bus: cfg.bus, pan: cfg.pan, send: cfg.send, g: cfg.gain, ...e, o });
  };
  /** A melodic line starting at (bar, beat). o: {dyn, cresc:[a,b], oct, tr, art, legato, accent, o, shape} -> end beat */
  P.seq = (bar, notes, o = {}) => {
    const b0 = T.bar(bar, o.beat || 0);
    const total = notes.reduce((s, [, d]) => s + d, 0);
    let b = b0; let last = null; const out = [];
    notes.forEach(([n, d], k) => {
      if (n === 'R') { b += d; last = null; return; }
      if (String(n).endsWith('~') && last) { last.d += d; b += d; return; }
      let m = midi(n) + (o.oct || 0) * 12 + (o.tr || 0);
      let v = o.cresc ? lerp(dyn(o.cresc[0]), dyn(o.cresc[1]), (b - b0) / Math.max(1, total)) : dyn(o.dyn ?? cfg.dyn ?? 'mf');
      const e = { b, d, m, v, art: o.art, shape: o.shape ?? true, o: o.o, g: (o.gain ?? 1) * cfg.gain, first: !last, lastOf: k === notes.length - 1 };
      out.push(e); last = e; b += d;
    });
    // phrase shaping: downbeats lean, long notes bloom, phrase ends taper, notes after a breath speak
    out.forEach((e, k) => {
      if (!e.shape) return;
      const inBar = ((e.b % T.meter) + T.meter) % T.meter;
      if (Math.abs(inBar) < 1e-6) e.v *= 1.07; else if (T.pulse.some((p) => Math.abs(inBar - p) < 1e-6)) e.v *= 1.03; else e.v *= 0.96;
      if (e.d >= 2) e.v *= 1.03;
      if (e.first) e.v *= 1.03;
      if (k === out.length - 1) e.v *= 0.95;
    });
    if (o.legato) { // merge slurred runs into single events with a pitch path (violin portamento / vox)
      const merged = [];
      for (const e of out) {
        const prev = merged[merged.length - 1];
        const sameBar = o.legato !== 'bar' || Math.floor((e.b + 1e-6) / T.meter) === Math.floor((prev?.b ?? -99) / T.meter + 1e-6);
        if (prev && sameBar && Math.abs(prev.b + prev.d - e.b) < 1e-6) { prev.path.push([e.b - prev.b, e.m]); prev.d += e.d; }
        else merged.push({ ...e, path: [[0, e.m]] });
      }
      merged.forEach((e) => { if (e.path.length === 1) delete e.path; P.push(e); });
    } else out.forEach((e) => P.push(e));
    return b;
  };
  P.note = (beat, n, d, o = {}) => { P.push({ b: beat, d, m: midi(n), v: dyn(o.dyn ?? cfg.dyn ?? 'mf'), ...o, g: (o.gain ?? 1) * cfg.gain }); return P; };
  P.chord = (beat, ns, d, o = {}) => { ns.forEach((n, k) => P.push({ b: beat, d, m: midi(n), v: dyn(o.dyn ?? cfg.dyn ?? 'mf'), ci: k, ...o, g: (o.gain ?? 1) * cfg.gain })); return P; };
  /** unpitched/pitched hits at beats within bars. */
  P.hits = (bars, beats, n, d, o = {}) => { for (const bar of bars) for (const bt of beats) P.note(T.bar(bar, bt), n, d, o); return P; };
  /** roll from beat a to beat b, `rate` strokes per second (needs the local bpm). */
  P.roll = (a, b, n, o = {}) => {
    // sampled percussion rolls are one looped roll recording riding the crescendo (amplitude ~ velocity^1.6)
    if (['timp', 'snare', 'cymbal'].includes(cfg.voice) && !o.strokes) {
      const r0 = dyn(o.from ?? 'pp'), r1 = dyn(o.to ?? 'ff');
      P.push({ b: a, d: b - a, m: midi(n), v: r0, shape: false, o: { roll: { swell: Math.pow(r1 / r0, 1.6) } } });
      return P;
    }
    const spb = 60 / (o.bpm || T.bpm); const step = (o.perBeat ? 1 / o.perBeat : (1 / (o.rate || 14)) / spb);
    const v0 = dyn(o.from ?? 'pp'), v1 = dyn(o.to ?? 'ff');
    let k = 0;
    for (let x = a; x < b - 1e-6; x += step, k++) {
      const alt = o.alt ? (k % 2 ? o.alt : 1) : 1;
      P.push({ b: x, d: step, m: midi(n), v: lerp(v0, v1, (x - a) / (b - a)) * alt, shape: false, jitV: o.jitV ?? 0.15 });
    }
    return P;
  };
  /** harp glissando over chord tones from lo to hi, 38 ms apart, gain falling 1 -> 0.4 */
  P.gliss = (beat, sym, lo, hi, o = {}) => {
    const ch = parseChord(sym); const L = midi(lo), H = midi(hi);
    const ns = []; for (let m = L; m <= H; m++) if (ch.pcs.has(((m % 12) + 12) % 12)) ns.push(m);
    if (o.down) ns.reverse();
    const sp = o.spacing ?? 0.038, v = dyn(o.dyn ?? 'mp');
    ns.forEach((m, k) => P.push({ b: beat, sec: k * sp, d: o.len ?? 2, m, v: v * lerp(1, o.fall ?? 0.4, k / Math.max(1, ns.length - 1)), shape: false }));
    return P;
  };
  return P;
}

/** Tempo map -> time(beat) in seconds from beat 0. meta.tempo: [{bar,bpm},{bar,bpm,to,bars}] */
export function tempoFn(meta, totalBeats) {
  const meter = meta.meter || 4;
  const segs = (meta.tempo && meta.tempo.length ? meta.tempo : [{ bar: 0, bpm: meta.bpm }]).map((s) => ({ ...s, b: s.bar * meter })).sort((a, b) => a.b - b.b);
  const bpmAt = (x) => {
    let cur = segs[0].bpm;
    for (const s of segs) {
      if (x < s.b) break;
      if (s.to != null) { const len = (s.bars || 1) * meter; cur = x < s.b + len ? s.bpm + (s.to - s.bpm) * ((x - s.b) / len) : s.to; } else cur = s.bpm;
    }
    return cur;
  };
  const N = Math.ceil(totalBeats) + 64;
  const T0 = new Float64Array(N + 1), spb = new Float64Array(N);
  for (let i = 0; i < N; i++) { spb[i] = 60 / bpmAt(i + 0.5); T0[i + 1] = T0[i] + spb[i]; }
  return (b) => {
    if (b <= 0) return b * spb[0];
    const i = Math.floor(b);
    if (i >= N) return T0[N] + (b - N) * spb[N - 1];
    return T0[i] + (b - i) * spb[i];
  };
}

// ---------------------------------------------------------------------------------------------- analysis
/**
 * Melody vs harmony on strong beats. Returns {checked, ok, color, app, clash:[...]} where
 *  ok = chord tone, color = 6th/9th on a triad or maj7 on a major chord, app = non-chord tone resolving by step
 *  to a chord tone within 2 beats, clash = everything else (reported with bar/beat/note/chord).
 */
export function checkHarmony(th, opts = {}) {
  const parts = opts.parts || th.melodyParts;
  const mel = th.events.filter((e) => parts.includes(e.part) && e.m != null && e.b < th.totalBeats);
  const res = { id: th.id, checked: 0, ok: 0, color: 0, app: 0, clash: [] };
  for (let bar = 0; bar < th.bars; bar++) {
    for (const p of th.pulse) {
      const x = bar * th.meter + p;
      const cands = mel.filter((e) => e.b <= x + 1e-6 && e.b + e.d > x + 1e-6);
      const ch = th.harm.find((h) => x >= h.b - 1e-6 && x < h.b + h.d - 1e-6);
      if (!ch) continue;
      for (const e of cands) {
        // a path event (legato) sounds its latest pitch at x
        let m = e.m; if (e.path) for (const [off, pm] of e.path) if (e.b + off <= x + 1e-6) m = pm;
        res.checked++;
        const pc = ((m % 12) + 12) % 12; const iv = ((pc - ch.root) % 12 + 12) % 12;
        if (ch.pcs.has(pc)) { res.ok++; continue; }
        const triad = ch.iv.length === 3;
        if ((iv === 2 && !ch.pcs.has((ch.root + 1) % 12) && !ch.pcs.has((ch.root + 3) % 12 === pc ? -1 : -1)) ||
            (iv === 9 && triad && ch.iv[2] === 7) || (iv === 11 && !ch.minor && ch.iv[1] === 4 && triad)) { res.color++; continue; }
        const after = mel.filter((f) => f.part === e.part && f.b > e.b + 1e-6 && f.b <= x + 2 + 1e-6).sort((a, b) => a.b - b.b);
        const next = after.filter((f) => Math.abs(f.b - (after[0]?.b ?? 0)) < 1e-6).sort((a, b) => Math.abs(a.m - m) - Math.abs(b.m - m))[0];
        const nch = next && th.harm.find((h) => next.b >= h.b - 1e-6 && next.b < h.b + h.d - 1e-6);
        if (next && nch && Math.abs(next.m - m) <= 2 && nch.pcs.has(((next.m % 12) + 12) % 12)) { res.app++; continue; }
        res.clash.push(`bar ${bar + 1} beat ${p + 1}: ${noteName(m)} over ${ch.sym} (${e.part})`);
      }
    }
  }
  return res;
}
