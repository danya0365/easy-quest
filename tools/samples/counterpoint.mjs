#!/usr/bin/env node
/**
 * tools/samples/counterpoint.mjs — does the score have lines that talk to each other, or one tune over a machine bed?
 * (P27 verification. The analysis itself lives in src/audio/score/_lib.js `counterpointOf`, so the harness, the demo
 * and this tool all report the same numbers; this file is just a printer.)
 *
 *   node tools/samples/counterpoint.mjs village overworld battle [--json out.json] [--detail]
 *
 * Per part: notes · gen% (made by the pad/arp/bass generators — the "machine-made bed") · dbl% (same onset AND pitch
 * class as another melody-bus part: doubling the tune) · sync% (onsets shared with the tune) · chord% (strong-beat
 * chord tones) · step% (share of stepwise motion, monophonic lines only) · range.
 * Per theme: generated share, independent hand-written lines, parallel fifths/octaves between adjacent lines, lines
 * two instruments play in unison/octaves (one voice, not two), notes written past the loop end, tune rhythm variety.
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
const { counterpointOf } = await import(url.pathToFileURL(path.join(ROOT, 'src/audio/score/_lib.js')).href);

const ids = args.length ? args : ['village', 'overworld', 'battle'];
const out = [];
for (const id of ids) {
  const th = THEMES[id]; if (!th) { console.log('no theme', id); continue; }
  const r = counterpointOf(th); out.push(r);
  console.log(`\n== ${id}  (${r.bars} bars)  generated ${r.generatedPct}% of notes · independent hand-written lines besides the tune: ${r.independent} [${r.independentParts.join(', ')}]`);
  console.log(`   worst doubling of the tune by a non-tune line ${r.maxDoubling}% · bass steps ${r.bassStepPct}% · parallel 5ths/8ves ${r.parallels} · notes past the loop end ${r.overrun}`
    + (r.doubled.length ? ` · one line on two instruments: ${r.doubled.join(', ')}` : ''));
  console.log(`   tune: ${r.tune.notes} notes, ${r.tune.quarterPct}% straight quarters, ${r.tune.barRhythms} distinct bar rhythms`);
  console.log('   ' + 'part'.padEnd(13) + 'voice'.padEnd(10) + 'bus'.padEnd(9) + 'notes'.padStart(6) + 'gen%'.padStart(6) + 'dbl%'.padStart(6) + 'sync%'.padStart(7) + 'chord%'.padStart(8) + 'step%'.padStart(7) + '  range');
  for (const p of r.parts) console.log('   ' + (p.part + (p.melody ? '*' : '')).padEnd(13) + p.voice.padEnd(10) + p.bus.padEnd(9) + String(p.notes).padStart(6) + String(p.genPct).padStart(6) + String(p.dblPct).padStart(6) + String(p.syncPct).padStart(7) + String(p.chordPct ?? '-').padStart(8) + String(p.stepPct ?? '-').padStart(7) + '  ' + p.range);
  if (detail && r.parList.length) console.log('   parallels: ' + r.parList.join(' · '));
}
if (jsonOut) fs.writeFileSync(jsonOut, JSON.stringify(out, null, 1));
