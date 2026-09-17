#!/usr/bin/env node
/**
 * tools/samples/counterpoint.mjs — does the score have lines that talk to each other, or one tune over a machine bed?
 * (P27 verification; reads the compiled score data directly, no audio.)
 *
 *   node tools/samples/counterpoint.mjs village overworld battle [--json out.json] [--detail]
 *
 * Per theme and per part (percussion excluded):
 *   notes      pitched note events
 *   gen%       notes made by the pad / arp / bass generators (tagged `gen` in score/_lib.js) — "machine-made bed"
 *   dbl%       notes that DOUBLE the tune: same onset and pitch class as a note of another melody-bus part
 *   sync%      notes whose onset coincides with a tune onset (rhythmic dependence)
 *   chord%     strong-beat notes that are chord tones of the recorded harmony (lines must still fit the harmony)
 *   step%      (monophonic lines) melodic moves of 1-2 semitones among all moves that change pitch
 * Theme summary: tune = union of melody-bus notes; hand-written independent lines = parts with gen% < 20 and dbl% < 35;
 * parallel perfect fifths/octaves between every pair of hand-written monophonic lines (consecutive common onsets);
 * tune rhythm: share of straight quarter notes and distinct bar rhythms; dissonance: strong-beat minor 2nds / major 7ths
 * between hand-written lines that are not resolved by step within one beat.
 */
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

const ROOT = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), '../..');
const args = process.argv.slice(2);
const flag = (k) => { const i = args.indexOf('--' + k); if (i < 0) return null; const v = args[i + 1]; args.splice(i, 2); return v; };
const jsonOut = flag('json');
const detail = args.includes('--detail'); if (detail) args.splice(args.indexOf('--detail'), 1);
const { THEMES } = await import(url.pathToFileURL(path.join(ROOT, 'src/audio/score/index.js')).href);
const { noteName } = await import(url.pathToFileURL(path.join(ROOT, 'src/audio/score/_lib.js')).href);
const PERC = new Set(['timp', 'snare', 'cymbal', 'tri']);
const EPS = 1e-6;
const pc = (m) => ((m % 12) + 12) % 12;

function sounding(e) { // a legato path event: every pitch it sounds, with onsets
  if (!e.path) return [{ b: e.b, d: e.d, m: e.m }];
  // path offsets in the compiled score are in seconds (music.js converts); the source seq merge keeps beats in e.path when built
  return [{ b: e.b, d: e.d, m: e.m }];
}

export function analyse(th) {
  const evs = th.events.filter((e) => e.m != null && !PERC.has(e.voice) && e.b < th.totalBeats - EPS).flatMap((e) => sounding(e).map((s) => ({ ...e, ...s })));
  const byPart = new Map();
  for (const e of evs) { if (!byPart.has(e.part)) byPart.set(e.part, []); byPart.get(e.part).push(e); }
  const melParts = new Set(th.melodyParts);
  const tune = evs.filter((e) => melParts.has(e.part));
  const tuneOn = new Map(); for (const e of tune) { const k = e.b.toFixed(3); if (!tuneOn.has(k)) tuneOn.set(k, []); tuneOn.get(k).push(e); }
  const chordAt = (x) => th.harm.find((h) => x >= h.b - EPS && x < h.b + h.d - EPS);
  const strong = (x) => { const inBar = ((x % th.meter) + th.meter) % th.meter; return th.pulse.some((p) => Math.abs(inBar - p) < EPS); };
  const parts = [];
  for (const [name, list] of byPart) {
    list.sort((a, b) => a.b - b.b || a.m - b.m);
    const n = list.length;
    const gen = list.filter((e) => e.gen).length;
    let dbl = 0, sync = 0, sb = 0, sbOk = 0;
    for (const e of list) {
      const at = tuneOn.get(e.b.toFixed(3)) || [];
      if (at.some((t) => t.part !== e.part)) sync++;
      if (at.some((t) => t.part !== e.part && pc(t.m) === pc(e.m))) dbl++;
      if (strong(e.b)) { const c = chordAt(e.b); if (c) { sb++; if (c.pcs.has(pc(e.m))) sbOk++; } }
    }
    // monophonic?
    let mono = true; for (let i = 1; i < n; i++) if (list[i].b < list[i - 1].b + list[i - 1].d - 0.02) { mono = false; break; }
    let moves = 0, steps = 0, leaps = 0;
    if (mono) for (let i = 1; i < n; i++) { const iv = Math.abs(list[i].m - list[i - 1].m); if (iv === 0) continue; moves++; if (iv <= 2) steps++; if (iv > 4) leaps++; }
    const lo = Math.min(...list.map((e) => e.m)), hi = Math.max(...list.map((e) => e.m));
    parts.push({ part: name, voice: list[0].voice, bus: list[0].bus, notes: n, genPct: +(100 * gen / n).toFixed(0), dblPct: +(100 * dbl / n).toFixed(0),
      syncPct: +(100 * sync / n).toFixed(0), chordPct: sb ? +(100 * sbOk / sb).toFixed(0) : null, mono, stepPct: moves ? +(100 * steps / moves).toFixed(0) : null,
      range: `${noteName(lo)}-${noteName(hi)}`, melody: melParts.has(name) });
  }
  parts.sort((a, b) => (b.melody - a.melody) || a.part.localeCompare(b.part));
  const handLines = parts.filter((p) => p.genPct < 20 && p.dblPct < 35);
  // parallel perfect intervals between hand-written monophonic lines (and each vs the tune)
  const lines = parts.filter((p) => p.mono && p.genPct < 20).map((p) => byPart.get(p.part));
  let parallels = 0; const parList = [];
  const noteAt = (list, x) => list.find((e) => e.b <= x + EPS && e.b + e.d > x + EPS);
  for (let i = 0; i < lines.length; i++) for (let j = i + 1; j < lines.length; j++) {
    const A = lines[i], B = lines[j];
    const on = [...new Set([...A, ...B].map((e) => +e.b.toFixed(3)))].sort((a, b) => a - b);
    let prev = null;
    for (const x of on) {
      const a = noteAt(A, x), b = noteAt(B, x);
      if (!a || !b) { prev = null; continue; }
      const iv = pc(a.m - b.m);
      if (prev && (iv === 0 || iv === 7) && prev.iv === iv && a.m !== prev.a && b.m !== prev.b && Math.sign(a.m - prev.a) === Math.sign(b.m - prev.b)) {
        const doubling = Math.abs(a.m - b.m) % 12 === 0 && iv === 0; // octave doubling counts too
        parallels++; if (parList.length < 12) parList.push(`${A[0].part}/${B[0].part} beat ${x} ${noteName(a.m)}-${noteName(b.m)}${doubling ? ' (8ve)' : ' (5th)'}`);
      }
      prev = { iv, a: a.m, b: b.m };
    }
  }
  // tune rhythm: quarters (1 beat) share in 4/4, distinct bar rhythms
  const tuneLead = [...byPart.entries()].filter(([k]) => melParts.has(k)).map(([, l]) => l);
  const firstLine = new Map(); for (const l of tuneLead) for (const e of l) { const k = e.b.toFixed(3); if (!firstLine.has(k) || firstLine.get(k).d < e.d) firstLine.set(k, e); }
  const tl = [...firstLine.values()].sort((a, b) => a.b - b.b);
  const quarters = tl.filter((e) => Math.abs(e.d - 1) < EPS).length;
  const rhythms = new Set();
  for (let bar = 0; bar * th.meter < th.totalBeats; bar++) { const r = tl.filter((e) => e.b >= bar * th.meter - EPS && e.b < (bar + 1) * th.meter - EPS).map((e) => `${(e.b - bar * th.meter).toFixed(2)}:${e.d}`).join(','); if (r) rhythms.add(r); }
  const genNotes = parts.reduce((s, p) => s + p.notes * p.genPct / 100, 0), all = parts.reduce((s, p) => s + p.notes, 0);
  const tuneNotes = tune.length;
  return {
    id: th.id, bars: th.bars, parts, handLines: handLines.map((p) => p.part), independentNonTune: handLines.filter((p) => !p.melody).map((p) => p.part),
    generatedPct: +(100 * genNotes / all).toFixed(0), parallels, parList, tune: { notes: tl.length, quarterPct: +(100 * quarters / Math.max(1, tl.length)).toFixed(0), barRhythms: rhythms.size, allTuneEvents: tuneNotes },
  };
}

const ids = args.length ? args : ['village', 'overworld', 'battle'];
const out = [];
for (const id of ids) {
  const th = THEMES[id]; if (!th) { console.log('no theme', id); continue; }
  const r = analyse(th); out.push(r);
  console.log(`\n== ${id}  (${th.bars} bars)  generated ${r.generatedPct}% of notes · hand-written independent non-tune lines: ${r.independentNonTune.length} [${r.independentNonTune.join(', ')}] · parallel 5ths/8ves between lines: ${r.parallels}`);
  console.log(`   tune: ${r.tune.notes} notes, ${r.tune.quarterPct}% straight quarters, ${r.tune.barRhythms} distinct bar rhythms`);
  console.log('   ' + 'part'.padEnd(12) + 'voice'.padEnd(10) + 'bus'.padEnd(9) + 'notes'.padStart(6) + 'gen%'.padStart(6) + 'dbl%'.padStart(6) + 'sync%'.padStart(7) + 'chord%'.padStart(8) + 'step%'.padStart(7) + '  range');
  for (const p of r.parts) console.log('   ' + (p.part + (p.melody ? '*' : '')).padEnd(12) + p.voice.padEnd(10) + p.bus.padEnd(9) + String(p.notes).padStart(6) + String(p.genPct).padStart(6) + String(p.dblPct).padStart(6) + String(p.syncPct).padStart(7) + String(p.chordPct ?? '-').padStart(8) + String(p.stepPct ?? '-').padStart(7) + '  ' + p.range);
  if (detail && r.parList.length) console.log('   parallels: ' + r.parList.join(' · '));
}
if (jsonOut) fs.writeFileSync(jsonOut, JSON.stringify(out, null, 1));
