/**
 * buildid.test.mjs — the build id is only worth anything if the same tree always gives the same answer, and if an
 * edited file always gives a DIFFERENT one. If either half fails, the number on the title card is decoration and the
 * person reading it is worse off than if there were no number at all. So both are checked here, per RUN, on the real
 * files (the sandbox writes and removes its own; it never touches yours).
 *
 * Run: node tools/buildid.test.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CLI = path.join(HERE, 'buildid.mjs');
let pass = 0, fail = 0;
const ok = (name) => { pass++; console.log('  ok   ' + name); };
const bad = (name, e) => { fail++; console.log('  FAIL ' + name + '\n       ' + (e && e.message || e)); };
// Every check is async and AWAITED. An earlier version of this file had a synchronous check() calling an async
// load(): the checks threw on undefined, the script raced on to the end and deleted the sandbox, and then the
// pending imports landed — ENOENT, from a directory this file had itself removed three lines earlier. A test that
// deletes its own fixture out from under its own pending reads is worse than no test.
const check = async (name, fn) => { try { await fn(); ok(name); } catch (e) { bad(name, e); } };

const sandbox = path.join(os.tmpdir(), 'dqv-buildid-' + process.pid);
const SANDBOX_CLI = path.join(sandbox, 'tools', 'buildid.mjs');
const write = (rel, body) => { const p = path.join(sandbox, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, body); };
const drop = (rel) => fs.rmSync(path.join(sandbox, rel), { force: true });
// Run the sandbox's copy of the CLI as a REAL CHILD PROCESS, and pass `cwd` instead of a path argument. A `node -e`
// string holding a variable that resolves to a file path gets its argument mangled, and a sandbox path under
// os.tmpdir() does not match the `-e` path guard — so a sandbox CLI run from inside a `node -e` inherits an argument
// that does not exist, prints nothing, and throws nothing. execFileSync then reported a bare "Command failed" with no
// child output, and the failure looked like "the CLI printed an empty footer" — a different bug entirely, which sent
// the fixing in the wrong direction twice before the cause was found. With `cwd` there is no path argument to mangle,
// and stderr comes back attached to the child's message.
const cliSandbox = (...a) => execFileSync(process.execPath, ['tools/buildid.mjs', ...a], { encoding: 'utf8', cwd: sandbox }).trim();
// The sandbox's OWN tools/buildid.mjs is not a hashed input (BUILD_INPUTS does not include tools/), but it lives in a
// sandbox/ tree, so the BARE form prints just the id while --list prints id + footer. Read the footer off the END,
// and only on --list / --json runs.
const listFooter = () => cliSandbox('--list').split('\n').pop();
const checkList = (name, fn) => check(name, () => {
  try { fn(); }
  catch (e) { throw new Error(e.message + `\n       --list footer was: "${listFooter()}"`); }
});

// The sandbox runs buildInfo() with ROOT pointed at it. buildid.mjs derives ROOT from its own location, so a copy of
// the module is placed in the sandbox's tools/ — the same module, the same code path the real tree uses, and no
// monkey-patching of path/fs that could make the test pass for the wrong reason.
fs.rmSync(sandbox, { recursive: true, force: true });
write('tools/buildid.mjs', fs.readFileSync(CLI, 'utf8'));
write('index.html', '<!doctype html><title>one</title>');
write('src/main.js', 'export const VERSION = "0.3.0-seams";\n');
write('src/deep/a.js', 'export const a = 1;\n');
write('vendor/three/three.module.js', 'export const THREE = {};\n');
write('docs/notes.md', '# not game code\n');
write('scenarios/foo.json', '{"name":"not game code"}\n');
write('src/.DS_Store', 'junk\n');

const { buildId, buildInfo } = await import(SANDBOX_CLI);
const before = () => buildId();

console.log('\n=== build id — a sandbox tree ===');

await check('stable across runs — the same tree twice is the same 8 chars', () => {
  const a = before(), b = before();
  assert.strictEqual(a, b, `${a} != ${b}`);
  assert.match(a, /^[0-9a-f]{8}$/, `not 8 hex chars: "${a}"`);
});

await check('a new file changes the id (a file added since the last build)', () => {
  const was = before();
  write('src/deep/b.js', 'export const b = 2;\n');
  assert.notStrictEqual(before(), was, 'adding src/deep/b.js did not move the id');
  drop('src/deep/b.js');
});

await check('an edit changes the id, and reverting it returns the id', () => {
  const was = before();
  write('src/main.js', 'export const VERSION = "0.3.1-seams";\n');
  assert.notStrictEqual(before(), was, 'changing a version string did not move the id');
  write('src/main.js', 'export const VERSION = "0.3.0-seams";\n');
  assert.strictEqual(before(), was, 'reverting the file did not return the id');
});

await check('file ORDER does not change the id (a hash over readdir order is a coin flip)', () => {
  const was = before();
  write('src/zzz.js', 'export const z = 1;\n');
  write('src/aaa.js', 'export const x = 1;\n');
  const got = before();
  // Reversing creation order must not change the id — but two new files DID change it, and that is the point: the
  // test needs a name set that has ALREADY been hashed, or it cannot tell "order" from "content".
  assert.ok(got !== was, 'two new files did not move the id at all');
  const once = got;
  write('src/aaa.js', 'export const x = 1;\n');   // rewrite in the opposite order
  assert.strictEqual(before(), once, 'rewriting the same files in a different order moved the id');
  drop('src/zzz.js'); drop('src/aaa.js');
  assert.strictEqual(before(), was, 'removing them again did not return the id');
});

await check('a change of CONTENTS changes the id (not just file names)', () => {
  const was = before();
  write('src/deep/a.js', 'export const a = 2;\n');
  assert.notStrictEqual(before(), was);
  write('src/deep/a.js', 'export const a = 1;\n');
});

await check('a RENAMED file changes the id (paths are part of the hash, not just bytes)', () => {
  const was = before();
  fs.renameSync(path.join(sandbox, 'src/deep/a.js'), path.join(sandbox, 'src/deep/renamed.js'));
  assert.notStrictEqual(before(), was);
  fs.renameSync(path.join(sandbox, 'src/deep/renamed.js'), path.join(sandbox, 'src/deep/a.js'));
});

await check('.DS_Store never moves the id (macOS must not decide what build this is)', () => {
  const was = before();
  write('src/.DS_Store', 'something else entirely ' + Date.now());
  assert.strictEqual(before(), was, 'writing src/.DS_Store moved the id');
});

await check('docs/, scenarios/ and tools/ do NOT move the id (a test must not renumber the game)', () => {
  const was = before();
  write('docs/notes.md', '# edited at ' + Date.now() + '\n');
  write('scenarios/foo.json', '{"name":"edited ' + Date.now() + '"}');
  write('tools/whatever.mjs', '// a new tool\n');
  write('tests/new-test.mjs', '// a new test\n');
  assert.strictEqual(before(), was, 'editing docs/, scenarios/, tools/ or tests/ moved the id');
});

await check('vendor/three IS in the id (the importmap loads it; a different three is a different game)', () => {
  const was = before();
  write('vendor/three/three.module.js', 'export const THREE = { revised: true };\n');
  assert.notStrictEqual(before(), was);
  write('vendor/three/three.module.js', 'export const THREE = {};\n');
});

await check('a file in vendor/ OUTSIDE three is not in the id (41 MB of unused assets must not be hashed)', () => {
  const was = before();
  write('vendor/other/thing.js', 'export const t = ' + Date.now() + ';\n');
  assert.strictEqual(before(), was, 'vendor/other moved the id — BUILD_INPUTS has grown by accident');
  drop('vendor/other/thing.js');
});

await check('index.html IS in the id (the importmap and the script tag are code)', () => {
  const was = before();
  write('index.html', '<!doctype html><title>two</title>');
  assert.notStrictEqual(before(), was);
  write('index.html', '<!doctype html><title>one</title>');
});

await check('a missing listed path is skipped, not fatal (vendor/three may be absent)', () => {
  const was = before();
  // Removing a file is an EDIT, so the id must move — a listed input that silently stopped contributing would be
  // the far worse bug: the game would boot against a three.module.js that is no longer the one the id vouches for.
  drop('vendor/three/three.module.js');
  assert.notStrictEqual(before(), was, 'deleting a hashed file did not move the id');
  assert.ok(!buildInfo().manifest.some((m) => m.path.startsWith('vendor/three/')), 'a deleted file is still in the manifest');
  write('vendor/three/three.module.js', 'export const THREE = {};\n');
  assert.strictEqual(before(), was, 'putting it back did not return the id');
});

await check('an input path that does not exist is skipped, not fatal', () => {
  const was = before();
  fs.rmSync(path.join(sandbox, 'vendor'), { recursive: true, force: true });
  // with vendor/ gone the tree is smaller, so the id legitimately differs; what must not happen is a THROW
  const info = buildInfo();
  assert.ok(info.files > 0 && info.id, 'removing vendor/ left no files at all');
  write('vendor/three/three.module.js', 'export const THREE = {};\n');
  assert.strictEqual(before(), was, 'restoring vendor/ did not return the id');
});

await checkList('--list and --json agree with the bare id, and both are parseable', () => {
  const id = before();
  const info = buildInfo();
  assert.ok(listFooter().includes(id), 'the --list footer does not contain the id');
  assert.strictEqual(info.manifest.length, info.files, 'manifest length and file count disagree');
  assert.strictEqual(cliSandbox(), id, 'the bare CLI form printed a different id than the module');
  const j = JSON.parse(cliSandbox('--json'));
  assert.strictEqual(j.id, id, '--json printed a different id than the bare form');
  assert.ok(j.manifest.every((m) => typeof m.hash === 'string' && m.hash.length === 64), 'a manifest hash is not a sha256');
});

await check('every sandbox file is a real temp file and the sandbox goes away', () => {
  fs.rmSync(sandbox, { recursive: true, force: true });
  assert.ok(!fs.existsSync(sandbox), 'the sandbox survived its own teardown');
});

// The sandbox and the REAL tree: same function, same answer. This is the assertion the whole feature rests on —
// the number on the title card is computed by the server, and the number you compare it against in a terminal is
// computed by the CLI, and if those two ever disagree the id is worse than nothing.
console.log('\n=== the real tree ===');
const real = await import(CLI);
const realId = real.buildId();

await check('server and CLI agree on the real tree', () => {
  const fromCli = execFileSync(process.execPath, [CLI], { encoding: 'utf8' }).trim();
  assert.match(realId, /^[0-9a-f]{8}$/, `not 8 hex chars: "${realId}"`);
  assert.strictEqual(fromCli, realId, `the CLI printed ${fromCli}, the module returned ${realId}`);
  const info = real.buildInfo();
  assert.ok(info.files > 50, `only ${info.files} files in the hash — the tree is not being walked`);
  ok(`both say ${realId} (${info.files} files, ${(info.bytes / 1048576).toFixed(1)} MB)`);
});

await check('the real tree is not hashing node_modules, shots, docs, scenarios or tests', () => {
  const { manifest } = real.buildInfo();
  const out = manifest.filter((m) => /^(node_modules|shots|docs|scenarios|tests)\//.test(m.path));
  assert.strictEqual(out.length, 0, `${out.length} out-of-scope files in the hash, e.g. ${out[0] && out[0].path}`);
  assert.ok(manifest.some((m) => m.path === 'index.html'), 'index.html missing from the hash');
  assert.ok(manifest.some((m) => m.path.startsWith('src/')), 'no src/ files in the hash');
  assert.ok(manifest.some((m) => m.path.startsWith('vendor/three/')), 'vendor/three missing from the hash');
});

await check('the real tree is fast enough to hash at server start', () => {
  const t = process.hrtime.bigint();
  real.buildId();
  const ms = Number(process.hrtime.bigint() - t) / 1e6;
  assert.ok(ms < 250, `took ${ms.toFixed(0)}ms — over budget for a server-start cost`);
});

console.log(`\n${fail ? 'FAILED' : 'all green'} — ${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
