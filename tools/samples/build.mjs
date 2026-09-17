#!/usr/bin/env node
/**
 * tools/samples/build.mjs — cut the fetched recordings into the game's multisample bank.   (P27)
 *
 *   DQ_SAMPLE_CACHE=/dir node tools/samples/build.mjs [instrumentId ...]      (fetch.mjs first)
 *
 * For every source file: decode to mono float (ffmpeg) -> trim leading silence -> MEASURE the root (the name gives
 * the octave — spec.mjs sets each source's octave convention, a harmonic sieve reports disagreements — guided YIN
 * gives the cents; timpani use their principal tone) ->
 * sustains: search a loop by normalised cross-correlation over the crossfade window, bake an equal-gain (or
 * equal-power, when the match is weak) crossfade into the file, cut at the loop end -> one-shots: cut + fade ->
 * normalise the peak to -1 dBFS (-1.5 for MP3) and store the gain that restores equal loudness per zone ->
 * encode FLAC (loops, sample-accurate) or MP3 (one-shots) -> vendor/samples/<lib>/<instrument>/...
 * Then writes vendor/samples/manifest.json (only the instruments rebuilt are replaced) and copies each library's
 * licence file.
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { LIBS, INSTRUMENTS } from './spec.mjs';
import { resolve, noteMidi, CACHE } from './fetch.mjs';
import * as D from './dsp.mjs';

const run = promisify(execFile);
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const OUT = path.join(ROOT, 'vendor/samples');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'dq5-smp-'));
let tmpSeq = 0;
const NAMES = ['C', 'Cs', 'D', 'Ds', 'E', 'F', 'Fs', 'G', 'Gs', 'A', 'As', 'B'];
const nm = (m) => NAMES[((Math.round(m) % 12) + 12) % 12] + (Math.floor(Math.round(m) / 12) - 1);
const REF = 0.1; // every zone's loudness * gain = REF

async function decode(file, sr) {
  const { stdout } = await run('ffmpeg', ['-v', 'error', '-i', file, '-ac', '1', '-ar', String(sr), '-f', 'f32le', '-'], { encoding: 'buffer', maxBuffer: 1 << 30 });
  const x = new Float32Array(stdout.buffer, stdout.byteOffset, stdout.byteLength >> 2);
  return Float32Array.from(x);
}
function wav16(file, y, sr) {
  const n = y.length, b = Buffer.alloc(44 + n * 2);
  b.write('RIFF', 0); b.writeUInt32LE(36 + n * 2, 4); b.write('WAVEfmt ', 8); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22);
  b.writeUInt32LE(sr, 24); b.writeUInt32LE(sr * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(n * 2, 40);
  let seed = 12345; const rnd = () => { seed = (seed * 1103515245 + 12345) >>> 0; return seed / 4294967296; };
  for (let i = 0; i < n; i++) { const d = (rnd() - rnd()) / 32768; b.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round((y[i] + d) * 32767))), 44 + i * 2); }
  fs.writeFileSync(file, b);
}
async function pool(items, n, fn) { const out = new Array(items.length); let k = 0; await Promise.all(Array.from({ length: n }, async () => { for (;;) { const i = k++; if (i >= items.length) return; out[i] = await fn(items[i], i); } })); return out; }

async function processFile(job) {
  const { inst, src } = job;
  const sr = inst.sr || 44100;
  let x = await decode(job.local, sr);
  const on = D.onset(x, sr, inst.kind === 'shot' ? -30 : -36, inst.kind === 'shot' ? 0.001 : 0.003);
  x = x.subarray(on);
  const named = noteMidi(job.groups.n, src.oct || 0);
  const mode = inst.pitch || 'yin';
  let p = null;
  if (mode === 'yin' && named != null) p = D.pitch(x, sr, named, { t0: inst.kind === 'shot' ? 0.05 : 0.3, t1: inst.kind === 'shot' ? 0.45 : null });
  else if (mode === 'timp') p = D.timpPitch(x, sr);
  else if (mode === 'peak') p = D.peakPitch(x, sr);
  else if (mode === 'named' && named != null) p = { midi: named, ap: 0, octave: 0 };
  if (p && p.sieve) console.log(`  ~ ${inst.id} ${path.basename(job.local)}: harmonic sieve suggests ${p.sieve > 0 ? '+' : ''}${p.sieve} octave (kept the name; YIN ap ${p.ap.toFixed(3)})`);
  const root = p ? p.midi : null;
  let y, ls = 0, le = 0, info = {};
  if (inst.kind === 'loop') {
    const L = D.makeLoop(x, sr, inst.loop);
    y = L.y; ls = L.ls; le = L.le; info = { ncc: +L.ncc.toFixed(3), envDb: +L.envDb.toFixed(2), seam: +L.seam.toFixed(2) };
  } else y = D.makeShot(x, sr, inst.len, inst.fade);
  // head fade-in (1 ms) so no file starts on a step
  const fi = Math.round(0.001 * sr); for (let i = 0; i < fi && i < y.length; i++) y[i] *= i / fi;
  const loud = inst.kind === 'loop' ? D.rms(y, ls, le) : D.maxWindowRms(y, sr);
  const pk = D.peakAbs(y) || 1;
  const target = inst.kind === 'loop' ? 0.891 : 0.84;
  const scale = target / pk;
  for (let i = 0; i < y.length; i++) y[i] *= scale;
  const gain = REF / ((loud || 1e-6) * scale);
  const layer = src.layer ? src.layer(job.groups.v) : 0;
  const rr = src.rr ? src.rr(job.groups.r) : 0;
  const label = root != null ? nm(root) : 'x';
  const ext = inst.kind === 'loop' ? 'flac' : 'mp3';
  const tag = path.basename(job.local).replace(/\.[^.]+$/, '').replace(/[^A-Za-z0-9]+/g, '').replace(/^(Sum|Rode|NT5)/, '').slice(0, 24) + (job.groups.v && job.lib === 'iowa' ? job.groups.v : '');
  const rel = `${job.lib}/${inst.id}/${label}-v${layer}${rr ? '-r' + rr : ''}-${tag}.${ext}`;
  return { job, root, named, ap: p ? +p.ap.toFixed(3) : null, octFix: p ? p.octave : 0, y, sr, ls, le, gain, layer, rr, rel, info, loudDb: +(20 * Math.log10(loud)).toFixed(1) };
}

async function encode(z) {
  const wav = path.join(TMP, `${tmpSeq++}.wav`);
  wav16(wav, z.y, z.sr);
  const dest = path.join(OUT, z.rel);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  if (z.rel.endsWith('.flac')) await run('flac', ['--best', '-s', '-f', '-o', dest, wav]);
  else await run('lame', ['-S', '--noreplaygain', '-m', 'm', '-V', '5', wav, dest]);
  fs.unlinkSync(wav);
  return fs.statSync(dest).size;
}

async function buildInstrument(inst, jobs) {
  const t0 = Date.now();
  const res = (await pool(jobs, 6, async (j) => { try { return await processFile(j); } catch (e) { console.log(`  ! ${inst.id} ${path.basename(j.local)}: ${e.message}`); return null; } })).filter(Boolean);
  // pick zones: per layer, roots at least `step` semitones apart (keep all round-robins of a kept root)
  const zones = [];
  for (let l = 0; l < (inst.layers || 1); l++) {
    const ofL = res.filter((z) => z.layer === l).sort((a, b) => (a.root ?? 0) - (b.root ?? 0) || a.rr - b.rr);
    let last = -1e9;
    const keptRoots = [];
    for (const z of ofL) {
      if (z.root == null) { zones.push(z); continue; }
      const near = keptRoots.find((r) => Math.abs(r - z.root) < 0.5);
      if (near != null) { if (z.rr > 0) zones.push(z); continue; }
      if (z.root - last < (inst.step ?? 2) - 0.3) continue;
      keptRoots.push(z.root); last = z.root; zones.push(z);
    }
  }
  for (const z of res) {
    const mis = z.named != null && z.root != null ? z.root - z.named : 0;
    if (Math.abs(mis) > 0.6 && !(inst.pitch === 'peak' && Math.abs(((mis % 12) + 12) % 12) < 0.6 || inst.pitch === 'peak' && Math.abs(((mis % 12) + 12) % 12 - 12) < 0.6)) console.log(`  ? ${inst.id} ${path.basename(z.job.local)} named ${nm(z.named)} measured ${z.root.toFixed(2)} (${nm(z.root)}) ap ${z.ap}`);
  }
  let bytes = 0;
  const sizes = await pool(zones, 6, encode);
  sizes.forEach((s) => { bytes += s; });
  // lo/hi per layer: halfway between neighbouring roots
  const out = zones.map((z) => ({
    f: z.rel, r: z.root != null ? +z.root.toFixed(3) : null, l: z.layer, rr: z.rr, sr: z.sr, n: z.y.length,
    ...(inst.kind === 'loop' ? { ls: z.ls, le: z.le } : {}), g: +z.gain.toFixed(4),
  }));
  const loops = zones.filter((z) => z.info.ncc != null);
  const worst = loops.reduce((w, z) => (!w || z.info.ncc < w.info.ncc ? z : w), null);
  const roots = [...new Set(out.filter((z) => z.r != null).map((z) => Math.round(z.r)))].sort((a, b) => a - b);
  let maxGap = 0; for (let i = 1; i < roots.length; i++) maxGap = Math.max(maxGap, roots[i] - roots[i - 1]);
  console.log(`${inst.id.padEnd(14)} ${String(zones.length).padStart(3)} zones  ${(bytes / 1048576).toFixed(2)} MB  roots ${roots.length ? nm(roots[0]) + '..' + nm(roots[roots.length - 1]) : '-'}  max gap ${maxGap}  ${worst ? `worst loop ncc ${worst.info.ncc} env ${worst.info.envDb} dB seam ${worst.info.seam} (${path.basename(worst.rel)})` : ''}  ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  const libs = [...new Set(zones.map((z) => z.job.lib))];
  return {
    label: inst.label, short: inst.short || inst.id, kind: inst.kind, layers: inst.layers || 1, libs, bytes, maxGap,
    zones: out,
    loops: Object.fromEntries(loops.map((z) => [z.rel, z.info])),
  };
}

async function main() {
  const ids = process.argv.slice(2);
  const all = await resolve(ids);
  const manPath = path.join(OUT, 'manifest.json');
  const man = fs.existsSync(manPath) ? JSON.parse(fs.readFileSync(manPath, 'utf8')) : { instruments: {} };
  const loopReport = {};
  for (const inst of INSTRUMENTS) {
    if (ids.length && !ids.includes(inst.id)) continue;
    const jobs = all.filter((j) => j.inst.id === inst.id && fs.existsSync(j.local));
    if (!jobs.length) { console.log(`${inst.id}: no source files in cache`); continue; }
    // remove previous output of this instrument
    for (const lib of Object.keys(LIBS)) fs.rmSync(path.join(OUT, lib, inst.id), { recursive: true, force: true });
    const r = await buildInstrument(inst, jobs);
    loopReport[inst.id] = r.loops; delete r.loops;
    man.instruments[inst.id] = r;
  }
  // licences
  for (const [lib, L] of Object.entries(LIBS)) {
    const used = Object.values(man.instruments).some((i) => i.libs.includes(lib));
    if (!used) continue;
    fs.mkdirSync(path.join(OUT, lib), { recursive: true });
    if (lib === 'iowa') {
      const html = fs.readFileSync(path.join(CACHE, 'iowa', 'LICENSE.html'), 'utf8').replace(/<script[\s\S]*?<\/script>/g, '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ');
      const m = /The University of Iowa Musical Instrument Samples \(MIS\) are created by[\s\S]*?without restrictions\./.exec(html);
      if (!m) throw new Error('Iowa terms sentence not found on the MIS page — refusing to vendor Iowa samples');
      fs.writeFileSync(path.join(OUT, lib, 'LICENSE.txt'), `University of Iowa Musical Instrument Samples — terms of use\nSource: ${L.home} (retrieved ${new Date().toISOString().slice(0, 10)})\n\n"${m[0]}"\n`);
    } else fs.copyFileSync(path.join(CACHE, lib, 'LICENSE'), path.join(OUT, lib, 'LICENSE'));
  }
  man.version = 2;
  man.generated = new Date().toISOString();
  man.libraries = Object.fromEntries(Object.entries(LIBS).map(([k, L]) => [k, { name: L.name, by: L.by, home: L.home, license: L.license, licenseFile: `${k}/${k === 'iowa' ? 'LICENSE.txt' : 'LICENSE'}`, commit: L.sha || null }]));
  man.totalBytes = Object.values(man.instruments).reduce((s, i) => s + i.bytes, 0);
  fs.writeFileSync(manPath, JSON.stringify(man));
  fs.writeFileSync(path.join(CACHE, 'loop-report.json'), JSON.stringify(loopReport, null, 1));
  // measure the real directory
  let du = 0; const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else du += fs.statSync(p).size; } };
  walk(OUT);
  console.log(`manifest: ${Object.keys(man.instruments).length} instruments, zones ${(man.totalBytes / 1048576).toFixed(2)} MB; vendor/samples on disk ${(du / 1048576).toFixed(2)} MB`);
  fs.rmSync(TMP, { recursive: true, force: true });
}

main().catch((e) => { console.error(e); process.exit(1); });
