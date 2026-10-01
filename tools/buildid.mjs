/**
 * buildid.mjs — WHAT CODE IS THIS? A build number that moves when the code moves.
 *
 * The problem this exists for: "the code I have open is the code you just edited?" A hand-written version string
 * cannot answer that. `0.3.0-seams` stays 0.3.0-seams through a hundred edits, so seeing it in the corner of the
 * title says nothing at all. What CAN answer it is a fingerprint of the actual bytes — the same question git
 * asks with `git stash`/`git diff`, reduced to one line you can read across a room.
 *
 * So: hash the game tree, take 8 hex chars, and show THAT. Two people looking at the same build id are provably
 * running the same source; two different ids mean one of them has a stale file open, and no argument settles it.
 *
 * ── what goes into the hash ───────────────────────────────────────────────────────────────────────────────────
 * Only what the running game is made of: index.html, src/**, vendor/three/**. Nothing else. Deliberately excluded:
 *   · vendor/** except three  — the importmap maps bare "three" to /vendor/three/. Hashing 41 MB of assets nobody
 *                                imports would make every boot pay for it, and those files never change by hand.
 *   · docs/, scenarios/, tests/, tools/, shots/, node_modules/ — ours, not the game's. A change to a SCENARIO must
 *                                not renumber the game; that would turn this into a lie the moment he runs a test.
 *   · docs/progress.json, *.md  — same reason. The build id answers "is the code I have open current", and a
 *                                progress note is not code.
 * There is exactly one thing here that has to be true and is worth the care: the hash must be the SAME function
 * when the dev server computes it at boot and when you compute it by hand in a shell. tools/buildid.test.mjs
 * checks that (server vs CLI, same tree ⇒ same id), so the number on the title and the number in your terminal
 * can be compared without wondering whether they came from the same recipe.
 *
 * ── how it stays cheap ───────────────────────────────────────────────────────────────────────────────────────
 * 602 files / 19 MB in ~0.2 s, computed ONCE at server start and served from a variable — never per request. The
 * endpoint re-checks src/ for the newest file mtime (1 ms) and recomputes only when that has moved, so a save +
 * reload renumbers without a restart. It deliberately does NOT recompute per request: an id that changes while
 * you are mid-reload is worse than one that lags, because then a screenshot and a terminal can disagree for
 * reasons nobody can reconstruct.
 *
 * Usage:  node tools/buildid.mjs          print "8c7d4268"
 *         node tools/buildid.mjs --json   the same, machine-readable, with every file's digest
 *         node tools/buildid.mjs --list   every input file, with its digest
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** The tree the hash covers. Edit this and you have changed what "the same build" means — which is why it is here
 *  and not inlined at the call site. */
export const BUILD_INPUTS = [
  'index.html',
  'src',
  'vendor/three',
];

/** Ignored anywhere in the tree: editor droppings, macOS metadata, build output. A .DS_Store must never be
 *  allowed to change the build id — that is the whole point of the id. */
const IGNORED = /(^|[/\\])\.DS_Store$|(^|[/\\])\._|(^|[/\\])Thumbs\.db$|\.swp$|(^|[/\\])node_modules[/\\]/;

/** Stable order, because a hash over "files in whatever order the disk gave them" is not a hash of the code. */
function walk(rel, out) {
  const abs = path.join(ROOT, rel);
  let st;
  try { st = fs.statSync(abs); } catch (_) { return out; }   // a listed path that does not exist is not an input
  if (st.isFile()) { out.push(rel); return out; }
  if (!st.isDirectory()) return out;
  for (const name of fs.readdirSync(abs).sort()) {
    const child = rel ? `${rel}/${name}` : name;
    if (IGNORED.test(child)) continue;
    walk(child, out);
  }
  return out;
}

/** Every input file, sorted, relative to the project root with forward slashes. */
export function buildInputs() {
  const files = [];
  for (const rel of BUILD_INPUTS) walk(rel, files);
  return files.sort();
}

/**
 * The whole build id, computed from scratch: sha256 over "<path>\0<filehash>\0…" for every input, in sorted
 * order, plus a RECIPE line so the id also moves if this file's rules change. Hashed twice (inner per file,
 * outer over the manifest) — that is what lets a two-file swap inside one file show up.
 * @returns {{id: string, label: string, files: number, bytes: number, manifest: {path: string, hash: string}[]}}
 */
export function buildInfo() {
  const files = buildInputs();
  const manifest = [];
  let bytes = 0;
  for (const rel of files) {
    const buf = fs.readFileSync(path.join(ROOT, rel));
    bytes += buf.length;
    manifest.push({ path: rel, hash: crypto.createHash('sha256').update(buf).digest('hex') });
  }
  const h = crypto.createHash('sha256');
  h.update(`dqv-build-v1 recipes=${BUILD_INPUTS.join(',')}\n`);
  for (const m of manifest) h.update(`${m.path}\0${m.hash}\n`);
  const id = h.digest('hex').slice(0, 8);
  return { id, label: id, files: manifest.length, bytes, manifest };
}

/** The 8-char id on its own — what the title card and the debug panel print. */
export function buildId() {
  return buildInfo().id;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const argv = process.argv.slice(2);
  const info = buildInfo();
  if (argv.includes('--list')) {
    for (const m of info.manifest) console.log(`${m.hash.slice(0, 8)}  ${m.path}`);
    console.log(`--- ${info.files} files, ${(info.bytes / 1024 / 1024).toFixed(1)} MB, build ${info.id}`);
  } else if (argv.includes('--json')) {
    console.log(JSON.stringify(info, null, 2));
  } else {
    console.log(info.id);
  }
}
