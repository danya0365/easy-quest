#!/usr/bin/env node
/**
 * tools/samples/fetch.mjs — download ONLY the source recordings spec.mjs names (never a whole library).   (P27)
 *
 *   DQ_SAMPLE_CACHE=/some/dir node tools/samples/fetch.mjs [instrumentId ...]
 *
 * GitHub libraries are resolved against their pinned commit's git tree (one API call, cached) and fetched from
 * raw.githubusercontent.com; Iowa files are listed explicitly. Files already in the cache are skipped.
 * Also saves each library's licence file into the cache (build.mjs copies them into vendor/samples/<lib>/).
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { LIBS, INSTRUMENTS } from './spec.mjs';

export const CACHE = process.env.DQ_SAMPLE_CACHE || path.join(os.tmpdir(), 'dq5-sample-cache');

/** 'C#4' -> 60+1 (scientific), with the source's octave shift; null if the name is not a note */
export function noteMidi(n, oct = 0) {
  const m = /^([A-G])(#|b)?(-?\d)$/.exec(n || ''); if (!m) return null;
  return { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0) + (+m[3] + oct + 1) * 12;
}

const enc = (p) => p.split('/').map(encodeURIComponent).join('/');

async function get(url, dest, tries = 4) {
  for (let k = 0; k < tries; k++) {
    try {
      const r = await fetch(url);
      if (!r.ok) throw new Error(`${r.status} ${url}`);
      const buf = Buffer.from(await r.arrayBuffer());
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.writeFileSync(dest + '.part', buf); fs.renameSync(dest + '.part', dest);
      return buf.length;
    } catch (e) { if (k === tries - 1) throw e; await new Promise((res) => setTimeout(res, 1500 * (k + 1))); }
  }
  return 0;
}

export async function tree(lib) {
  const L = LIBS[lib];
  const f = path.join(CACHE, lib, '_tree.json');
  if (!fs.existsSync(f)) {
    const r = await fetch(`https://api.github.com/repos/${L.git}/git/trees/${L.sha}?recursive=1`, { headers: { 'User-Agent': 'dq5-samples' } });
    if (!r.ok) throw new Error('tree ' + r.status);
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f, await r.text());
  }
  return JSON.parse(fs.readFileSync(f, 'utf8')).tree.filter((t) => t.type === 'blob').map((t) => t.path);
}

/** every (instrument, source, file) the spec selects: [{inst, src, lib, rel, local, match}] */
export async function resolve(ids) {
  const out = [];
  for (const inst of INSTRUMENTS) {
    if (ids.length && !ids.includes(inst.id)) continue;
    for (const src of inst.src) {
      if (src.lib === 'iowa') {
        for (const f of src.files) out.push({ inst, src, lib: 'iowa', rel: f.path, local: path.join(CACHE, 'iowa', path.basename(f.path)), groups: { n: f.n, v: f.v } });
        continue;
      }
      const all = await tree(src.lib);
      const re = new RegExp(src.re);
      for (const p of all) {
        if (!p.startsWith(src.dir + '/')) continue;
        const name = p.slice(src.dir.length + 1);
        if (name.includes('/')) continue;
        const m = re.exec(name); if (!m) continue;
        const g = m.groups || {};
        if (src.layer && src.layer(g.v) < 0) continue;
        if (src.rr && src.rr(g.r) < 0) continue;
        const mm = noteMidi(g.n, src.oct || 0);
        if (mm != null && src.lo != null && (mm < src.lo || mm > src.hi)) continue;
        out.push({ inst, src, lib: src.lib, rel: p, local: path.join(CACHE, src.lib, p), groups: g });
      }
    }
  }
  return out;
}

async function main() {
  const ids = process.argv.slice(2);
  fs.mkdirSync(CACHE, { recursive: true });
  // licences
  for (const [lib, L] of Object.entries(LIBS)) {
    const dest = path.join(CACHE, lib, lib === 'iowa' ? 'LICENSE.html' : 'LICENSE');
    if (fs.existsSync(dest)) continue;
    const url = lib === 'iowa' ? L.home : `https://raw.githubusercontent.com/${L.git}/${L.sha}/LICENSE`;
    await get(url, dest);
  }
  const jobs = (await resolve(ids)).filter((j) => !fs.existsSync(j.local));
  console.log(`fetching ${jobs.length} files into ${CACHE}`);
  let done = 0, bytes = 0, fail = 0;
  const worker = async () => {
    for (;;) {
      const j = jobs.shift(); if (!j) return;
      const url = j.lib === 'iowa' ? LIBS.iowa.base + enc(j.rel) : `https://raw.githubusercontent.com/${LIBS[j.lib].git}/${LIBS[j.lib].sha}/${enc(j.rel)}`;
      try { bytes += await get(url, j.local); } catch (e) { fail++; console.log('  x', j.rel, e.message); }
      if (++done % 20 === 0) console.log(`  ${done} files, ${(bytes / 1048576).toFixed(0)} MB`);
    }
  };
  await Promise.all(Array.from({ length: 8 }, worker));
  console.log(`done: ${done} files, ${(bytes / 1048576).toFixed(0)} MB, ${fail} failed`);
  if (fail) process.exitCode = 1;
}

if (import.meta.url === `file://${process.argv[1]}`) main();
