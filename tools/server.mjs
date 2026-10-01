// Minimal static dev server. Usage: node tools/server.mjs [port]
//
// It also computes the BUILD ID (tools/buildid.mjs) once at start and serves it at /build-id.json. The game reads
// that at boot and prints it, so a number on screen can be matched against a number in a terminal — which is the
// only honest answer to "is the code I have open the code you just edited". Every response already says
// cache-control: no-store, so a stale BUILDING is never the browser's fault; a stale EDITOR is, and that is
// exactly what the id is for.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildInfo } from './buildid.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.argv[2] || process.env.PORT || 8123);
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml', '.wav': 'audio/wav', '.ogg': 'audio/ogg', '.mp3': 'audio/mpeg',
  '.woff2': 'font/woff2', '.ico': 'image/x-icon', '.glsl': 'text/plain; charset=utf-8',
};

// The build id is computed ONCE, here, at server start: 600 files / 19 MB is ~0.2 s and it must not be paid per
// request. The consequence, stated plainly: after you edit a file the served id is stale until the server restarts
// (it watches nothing). That is deliberate — a moving id is worse than no id, because then a screenshot and a
// terminal could disagree for reasons nobody could reconstruct. Restart to renumber. /build-id.json?v=<anything>
// cannot get around it: `req.url.split('?')` above drops the query before the route test, so a cache-buster is
// just a cache-buster.
let BUILD = null;
try {
  BUILD = buildInfo();
  BUILD.json = JSON.stringify(BUILD);
} catch (e) {
  BUILD = { id: null, label: 'no-build-id', files: 0, bytes: 0, json: JSON.stringify({ id: null, error: String(e) }) };
  console.warn('[build] ' + BUILD.json);
}
// The id is computed ONCE at server start and recomputed when — and only when — the tree has actually moved, so a
// save + reload renumbers without a restart.
//
// HOW IT DETECTS THAT, and the first version of this did not work. It compared fs.statSync(ROOT/src).mtimeMs against
// the value latched at start, and never renumbered anything: a DIRECTORY's mtime changes when an entry is created,
// deleted or renamed — it does NOT change when a file inside it is edited in place. Saving a line in
// src/engine/debug.js leaves src/ and every parent directory's mtime exactly where it was. The game kept printing an
// id that had been stale since the last restart, and the stamp's entire claim is that it is current. So the check
// walks src/ for the newest FILE mtime instead — 1 ms over 600 files, measured, and it moves on a content edit, on
// a create, on a delete and on a rename, which is exactly the set of things that can change the hash.
//
// Deliberately NOT watched: vendor/three. It is 19 MB, it is versioned and it does not change by hand, so walking it
// would spend 18 of the 19 MB to learn nothing. If you ever do swap three, restart the server — the one case the
// cheap check cannot see, said out loud rather than left to be discovered.
let NEWEST = 0;
try {
  NEWEST = newestMtime(path.join(ROOT, 'src'));
} catch (_) { NEWEST = 0; }

/** Newest file mtime under dir, or 0. Symlinks are not followed — a link out of the tree must not decide this. */
function newestMtime(dir) {
  let newest = 0;
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (_) { return 0; }
  for (const e of entries) {
    if (e.name === '.DS_Store') continue;
    if (e.isSymbolicLink()) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { const m = newestMtime(p); if (m > newest) newest = m; continue; }
    try { const m = fs.statSync(p).mtimeMs; if (m > newest) newest = m; } catch (_) {}
  }
  return newest;
}

// DELETE vendor/three and this server would 500 on /build-id.json, the game falls back to `no-build-id`, and the
// title card prints a label with nothing behind it — one missing dependency and the feature is gone. So the
// recompute is inside a try, and a failure keeps serving the id already held: an old id is a lie you can SEE (compare
// it with the CLI), a missing id is a label with nothing at all to compare.

http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/build-id.json') {
    if (BUILD.id) {
      let newest = 0;
      try { newest = newestMtime(path.join(ROOT, 'src')); } catch (_) {}
      if (newest && newest !== NEWEST) {
        try {
          const next = buildInfo();
          next.json = JSON.stringify(next);
          BUILD = next;
          NEWEST = newest;
          console.log(`  src/ changed · build is now ${BUILD.id} (${BUILD.files} files)`);
        } catch (e) { console.warn('[build] recompute failed, still serving ' + BUILD.id); }
      }
    }
    res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'access-control-allow-origin': '*' });
    res.end(BUILD.json);
    return;
  }
  if (p.endsWith('/')) p += 'index.html';
  const file = path.join(ROOT, p);
  if (!file.startsWith(ROOT)) { res.writeHead(403).end('forbidden'); return; }
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404, {'content-type':'text/plain'}).end('404 ' + p); return; }
    res.writeHead(200, {
      'content-type': TYPES[path.extname(file)] || 'application/octet-stream',
      'cache-control': 'no-store',
      'access-control-allow-origin': '*',
    });
    res.end(buf);
  });
}).listen(PORT, () => {
  const where = BUILD.id ? `build ${BUILD.id} (${BUILD.files} files, ${(BUILD.bytes / 1024 / 1024).toFixed(1)} MB)` : 'build id FAILED';
  console.log(`serving ${ROOT} on http://localhost:${PORT}`);
  console.log(`  ${where}  ·  node tools/buildid.mjs prints the same number`);
});
