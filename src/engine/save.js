/**
 * save.js — the book of tales: save slots, the subsystem registry, playtime, autosave, and storage that survives
 * abuse.                                                                            (F5, owner: src/engine/save.js)
 *
 *   import { Save } from './engine/save.js';
 *
 * ── Subsystems contribute their own state ────────────────────────────────────────────────────────────────────
 *   Save.register('party', {
 *     save()            -> JSON-safe data (cycles, NaN, Maps, Sets, typed arrays are cleaned, never thrown on)
 *     load(data, info)  <- a fresh deep copy of what save() returned; info = {slot, source, v, from}
 *     reset?()          called on Save.newGame(), when a save has no data for this key, or when load() throws
 *     summary?(data)    -> partial slot summary {hero, level, party:[{name,lvl}], place, placeName, gold}
 *     version?: 1       per-key data version; bump it and add migrate() when YOUR shape changes
 *     migrate?(data, fromVersion) -> data in the current shape
 *     order?: 50        load order (low first). Defaults: chapter 0, flags 10, gold 20, inventory 30, party 40,
 *                       everything else 50, map 90, pos 95 — so the map loads after the party it will show.
 *   })  -> returns an unregister function.
 *   Registering late is fine: data loaded before a key had a handler is held and delivered the moment it registers,
 *   and carried forward untouched by every write until then (a half-built game never erases data it can't read).
 *
 * ── Slots ────────────────────────────────────────────────────────────────────────────────────────────────────
 *   Slots are 1, 2, 3 and 'auto'. Storage is localStorage['dqv.save.<slot>'] with the ARCHITECTURE shape
 *   {v, at, playtime, chapter, flags, party, inventory, gold, map, pos} plus {game, seq, kv, meta, sum}.
 *   Save.write(slot, {reason})   -> {ok, slot, bytes, backup, summary} | {ok:false, reason:'full'|'blocked'|...}
 *   Save.load(slot)              -> {ok, slot, source, status, failed:[keys], repairs, migratedFrom}
 *   Save.read(slot)              -> the resolved slot WITHOUT applying it: {status, source, body, summary}
 *   Save.slots()                 -> [summary x4] for the title screen (1, 2, 3, auto). READ-ONLY: never writes.
 *   Save.summary(slot)           -> {slot, label, status, loadable, hero, level, chapter, act, place, placeName,
 *                                    playtime, playtimeText, at, party:[{name,lvl}], gold, copies:{page,copy,spare}}
 *   Save.latest()                -> the most recently written loadable summary, or null ("Carry On")
 *   Save.hasAny()                -> true if any slot is loadable
 *   Save.clear(slot)             -> tears the page out but keeps it in an undo drawer
 *   Save.undoClear(slot)         -> puts it back (only into an empty slot)
 *   Save.copySlot(from, to)      -> copies a tale (the target's old page is backed up first)
 *   Save.snapshot()              -> the body a write would store right now (no storage touched)
 *
 * ── Title screen / game flow ─────────────────────────────────────────────────────────────────────────────────
 *   Save.newGame()               reset every subsystem, playtime 0, clock running; autosave (if enabled) may now fire
 *   Save.endGame()               back to the title: clock stops, autosave disarmed
 *   Save.continueInfo()          {any, latest, slots}
 *   Save.words                   default in-voice strings (VOICE-BIBLE R7: no "error", no "OK")
 *
 * ── Playtime ─────────────────────────────────────────────────────────────────────────────────────────────────
 *   Save.playtime() -> seconds (float)   Save.setPlaytime(s)   Save.addPlaytime(s)
 *   Save.clock.start() / .stop() / .running     counts real, visible time only (hidden tabs and sleeps don't count)
 *   Save.formatPlaytime(s) -> "3:07" (h:mm)
 *
 * ── Autosave ─────────────────────────────────────────────────────────────────────────────────────────────────
 *   Save.enableAutosave({events:['map.enter'], minGapMs:1500, veto?(reason)=>bool})   (SYSTEMS-BIBLE §6.1.5)
 *   Save.disableAutosave()       Save.autosave(reason)   writes slot 'auto'; never while loading or outside a game;
 *                                repeated triggers inside minGapMs collapse into one trailing write.
 *
 * ── The escape hatch ─────────────────────────────────────────────────────────────────────────────────────────
 *   Save.exportCode(slot) -> {ok, code}   a single-line "DQV-TALE:..." code (base64 of the checksummed page)
 *   Save.copyCode(slot)   -> Promise<{ok, code, method:'clipboard'|'execCommand'|'manual'}>
 *   Save.importCode(slot, text) -> {ok, summary} | {ok:false, reason}   accepts the code OR raw save JSON; the
 *                                slot's current page goes to the spare drawer first, so importing never destroys it.
 *
 * ── How a page can never be destroyed (the write) ───────────────────────────────────────────────────────────
 *   Each slot keeps up to three copies:   dqv.save.N        the page (latest)
 *                                         dqv.save.N.copy   a second copy of the latest page (written FIRST)
 *                                         dqv.save.N.bak    the spare: the previous good page
 *   write:  1. serialise + checksum (CRC-32) + verify the round trip, before storage is touched
 *           2. spare := the best good page currently in the slot (never a bad page over a good spare)
 *           3. copy  := new page (read back and compared)
 *           4. page  := new page (read back and compared)
 *           A crash between any two steps leaves a readable slot: the reader picks the newest good page/copy by
 *           `seq`, then the spare, then a salvageable page. If step 4 fails, step 3 is rolled back and the old
 *           page stays in place. On a full disk: undo drawers and rescue copies are freed, then it retries once.
 *   read:   never throws, never writes. Unparseable, wrong-checksum, wrong-type and future-version pages are
 *           graded, never deleted. A bad page that gets overwritten is kept at dqv.save.N.broken for rescue.
 *   No storage at all (private mode, blocked site data): an in-memory shelf is used and Save.backend says so.
 *
 * ── Versions ─────────────────────────────────────────────────────────────────────────────────────────────────
 *   Save.VERSION = 2. v0 = anything without `v` (prototype saves), v1 = the bare ARCHITECTURE shape, v2 adds
 *   game/seq/kv/meta/sum. Migrations run in order on read; pages from a newer build are shown but never loaded or
 *   silently overwritten (writing over one keeps it as the spare).
 *
 * ── Debug ────────────────────────────────────────────────────────────────────────────────────────────────────
 *   Save.init() (called lazily by everything) adds __DQ.state().save and __DQ.saves(), __DQ.saveGame(slot),
 *   __DQ.loadGame(slot). Events: save.write save.load save.clear save.undo save.import save.newgame save.endgame
 *   save.autosave save.recovered save.external. Handled corruption is NOT an error; only a throwing subsystem
 *   handler goes to __DQ.errors.
 */
import { Bus } from './events.js';
import { Debug, reportError } from './debug.js';

export const VERSION = 2;
const GAME_ID = 'dqv';
const PREFIX = 'dqv.save.';
const SLOT_IDS = [1, 2, 3, 'auto'];
const POINTER_KEY = PREFIX + 'last';
const CODE_PREFIX = 'DQV-TALE:';
const RESERVED = new Set(['v', 'game', 'at', 'seq', 'playtime', 'kv', 'meta', 'sum', '__proto__', 'constructor', 'prototype']);
const CONTRACT_KEYS = ['chapter', 'flags', 'party', 'inventory', 'gold', 'map', 'pos'];
const DEFAULT_ORDER = { chapter: 0, flags: 10, gold: 20, inventory: 30, party: 40, map: 90, pos: 95 };
const MAX_PLAYTIME = 9999 * 3600;
const MAX_GOLD = 9999999;
const MAX_DEPTH = 64;
const BIG_PAGE = 1_000_000;
const GOOD = new Set(['A', 'B']);       // A: checksum verified. B: no checksum (older format), structure sound.

/** Display names for summaries (CANON §2). A summary written by the game stores its own placeName too. */
export const PLACE_NAMES = {
  aldenmoor: 'Aldenmoor', puddlewick: 'Puddlewick', hollybank: 'Hollybank Cottage', saltmarrow: 'Saltmarrow',
  contented_herring: 'The Contented Herring', cobwell_manor: 'Cobwell Manor', gogglestone_caves: 'Gogglestone Caves',
  coddleston: 'Coddleston Castle', grey_ruins: 'The Grey Ruins', stone_garden: 'The Stone Garden',
  bellhollow_abbey: 'Bellhollow Abbey', bellhollow_belfry: 'Bellhollow Belfry', wagonwrights_rest: "Wagonwright's Rest",
  quiet_quarry: 'The Quiet Quarry', whistling_caves: 'The Whistling Caves', parchmouth: 'Parchmouth',
  port_pelican: 'Port Pelican', quaggerton: 'Quaggerton', marbleford: 'Marbleford', fairweather_hall: 'Fairweather Hall',
  marbleford_chapel: 'Marbleford Chapel', sighing_grotto: 'The Sighing Grotto', ambergarde: 'Ambergarde',
  ambergarde_keep: 'Ambergarde Keep', coldcomfort: 'Coldcomfort', glasswing_grotto: 'The Glasswing Grotto',
  highfeather: 'Highfeather', whistfell_abbey: 'Whistfell Abbey', whistfell_undercroft: 'The Whistfell Undercroft',
  quiet_deep: 'The Quiet Deep',
};
export const ACT_NAMES = { 1: 'Act I', 2: 'Act II', 3: 'Act III' };

/** In-voice defaults (VOICE-BIBLE §5 79-85 + new lines in the same hand). The integrator may move these to strings.js. */
export const WORDS = {
  label: { 1: 'Tale 1', 2: 'Tale 2', 3: 'Tale 3', auto: 'Autosave' },
  status: {
    ok: 'Safe and sound.',
    copy: 'Read from the second copy. All there.',
    backup: 'Smudged. The spare page is fine.',
    mended: 'A bit torn, but patched up.',
    future: 'Written in a newer book.',
    broken: 'Too smudged to read. Kept, just in case.',
    empty: 'An empty page.',
  },
  confirm: 'Write the tale down here?',
  done: 'Written down, and safe.',
  over: "There's a tale here already. / Shall we write over it?",
  full: 'The book is full to the covers. / Your old page is still safe.',
  blocked: "The ink won't take on this shelf. / Copy the tale's code to keep it.",
  loadEmpty: 'Nothing is written here yet.',
  loadBroken: 'Too smudged to read, even the spare. / It is kept safe in case it can be rescued.',
  loadFuture: 'This tale was written in a newer book. / We will not scribble on it.',
  cleared: 'Page torn out. / Changed your mind? Put it back.',
  undone: 'Page tucked back in. Good as new.',
  exported: "The tale's secret code is copied. / Keep it somewhere safe.",
  imported: 'The code worked. / The tale is back in the book.',
  badCode: 'That code is muddled. / Nothing was changed.',
  memory: "This book can't be kept after closing. / Copy the tale's code to be safe.",
  auto: 'The page that writes itself.',
};

// ── tiny helpers ─────────────────────────────────────────────────────────────────────────────────────────────
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const fin = (v) => typeof v === 'number' && Number.isFinite(v);
let lastStamp = 0;
/** Wall-clock ms, strictly increasing within a session (so "most recent tale" never ties). */
const nowMs = () => (lastStamp = Math.max(Date.now(), lastStamp + 1));
const perfNow = () => (typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now());

let CRC_TABLE = null;
/** CRC-32 over UTF-16 code units (both bytes). 8 hex chars. */
export function crc32(str) {
  if (!CRC_TABLE) {
    CRC_TABLE = new Int32Array(256);
    for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; CRC_TABLE[n] = c; }
  }
  let c = -1;
  for (let i = 0; i < str.length; i++) {
    const u = str.charCodeAt(i);
    c = CRC_TABLE[(c ^ u) & 255] ^ (c >>> 8);
    c = CRC_TABLE[(c ^ (u >>> 8)) & 255] ^ (c >>> 8);
  }
  return ((c ^ -1) >>> 0).toString(16).padStart(8, '0');
}

/** Deep clean to JSON-safe data. Never throws: cycles, functions, symbols and bad numbers are dropped/nulled. */
function clean(v, anc = [], depth = 0) {
  if (v === null) return null;
  const t = typeof v;
  if (t === 'string' || t === 'boolean') return v;
  if (t === 'number') return Number.isFinite(v) ? v : null;
  if (t === 'bigint') { const n = Number(v); return Number.isFinite(n) ? n : null; }
  if (t !== 'object') return undefined; // undefined, function, symbol
  if (depth > MAX_DEPTH || anc.includes(v)) return null;
  let pushed = false;
  try {
    if (typeof v.toJSON === 'function' && !(v instanceof Date)) v = v.toJSON();
    if (v instanceof Date) return Number.isFinite(v.getTime()) ? v.toISOString() : null;
    if (v === null || typeof v !== 'object') return clean(v, anc, depth + 1);
    if (anc.includes(v)) return null;
    anc.push(v); pushed = true;
    let out;
    if (Array.isArray(v) || ArrayBuffer.isView(v)) {
      out = [];
      for (let i = 0; i < v.length; i++) { const c = clean(v[i], anc, depth + 1); out.push(c === undefined ? null : c); }
    } else if (v instanceof Map) {
      out = [];
      for (const [k, val] of v) { const c = clean(val, anc, depth + 1); out.push([clean(k, anc, depth + 1) ?? null, c === undefined ? null : c]); }
    } else if (v instanceof Set) {
      out = [];
      for (const val of v) { const c = clean(val, anc, depth + 1); out.push(c === undefined ? null : c); }
    } else {
      out = {};
      for (const k of Object.keys(v)) {
        if (k === '__proto__') continue;
        const c = clean(v[k], anc, depth + 1);
        if (c !== undefined) out[k] = c;
      }
    }
    anc.pop();
    return out;
  } catch (_) {
    if (pushed) anc.pop();
    return null; // a getter that throws, a revoked proxy...
  }
}

const deepCopy = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));
/** deepCopy that falls back to the original reference (a pathologically deep value) instead of throwing. */
const softCopy = (v) => { try { return deepCopy(v); } catch (_) { return v; } };

// base64 of UTF-8, both directions, without deprecated escape()/unescape()
function b64encode(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}
function b64decode(b64) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
}

// ── storage backends ─────────────────────────────────────────────────────────────────────────────────────────
function memoryStorage() {
  const m = new Map();
  return {
    memory: true,
    get length() { return m.size; },
    key(i) { return Array.from(m.keys())[i] ?? null; },
    getItem(k) { return m.has(String(k)) ? m.get(String(k)) : null; },
    setItem(k, v) { m.set(String(k), String(v)); },
    removeItem(k) { m.delete(String(k)); },
    clear() { m.clear(); },
  };
}

let store = null;
let backend = 'none';
const fallbackShelf = memoryStorage();

function pickStorage() {
  try {
    const ls = typeof window !== 'undefined' ? window.localStorage : null;
    if (ls) { ls.getItem(POINTER_KEY); return { s: ls, name: 'localStorage' }; } // readable is enough; writes are checked each time
  } catch (_) { /* SecurityError: site data blocked */ }
  return { s: fallbackShelf, name: 'memory' };
}

const isQuota = (e) => !!e && (e.name === 'QuotaExceededError' || e.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
  e.code === 22 || e.code === 1014 || /quota|exceed/i.test(String(e.message || '')));

function sget(k) { try { const v = store.getItem(k); return typeof v === 'string' ? v : null; } catch (_) { return null; } }
/** true | 'full' | 'blocked' | 'verify' */
function sset(k, v) {
  try {
    store.setItem(k, v);
    let back = null;
    try { back = store.getItem(k); } catch (_) { return 'verify'; }
    return back === v ? true : 'verify';
  } catch (e) { return isQuota(e) ? 'full' : 'blocked'; }
}
function sdel(k) { try { store.removeItem(k); return true; } catch (_) { return false; } }
function skeys() {
  const out = [];
  try { const n = store.length; for (let i = 0; i < n; i++) { const k = store.key(i); if (typeof k === 'string') out.push(k); } } catch (_) {}
  return out;
}

const keysFor = (slot) => {
  const base = PREFIX + slot;
  return { page: base, copy: base + '.copy', bak: base + '.bak', undo: base + '.undo', broken: base + '.broken' };
};

function normSlot(slot) {
  if (slot === 'auto' || slot === 'autosave') return 'auto';
  const n = typeof slot === 'string' && /^\s*[123]\s*$/.test(slot) ? Number(slot) : slot;
  return n === 1 || n === 2 || n === 3 ? n : null;
}

// ── migrations (global format) ───────────────────────────────────────────────────────────────────────────────
const MIGRATIONS = {
  /** v0: anything written before the contract (prototype saves): {hero|name, level|lvl, gold, flags, time|playTime,
   *  location|mapId|map, x, z, items}. Best effort: whatever is recognisable is kept, nothing else is invented. */
  0(d) {
    const out = { v: 1 };
    const heroName = typeof d.hero === 'string' ? d.hero : (isObj(d.hero) && typeof d.hero.name === 'string') ? d.hero.name
      : typeof d.name === 'string' ? d.name : null;
    const lvl = fin(d.level) ? d.level : fin(d.lvl) ? d.lvl : (isObj(d.hero) && fin(d.hero.level)) ? d.hero.level : (isObj(d.hero) && fin(d.hero.lvl)) ? d.hero.lvl : 1;
    // a random JSON object is not a tale: insist on at least two things a save would have
    const signs = [heroName != null, Array.isArray(d.party), isObj(d.flags), fin(d.gold),
      typeof (d.map ?? d.mapId ?? d.location) === 'string', fin(d.level ?? d.lvl), fin(d.playtime ?? d.playTime ?? d.time)].filter(Boolean).length;
    if (signs < 2) throw new Error('not a tale');
    out.at = fin(d.at) ? d.at : fin(d.savedAt) ? d.savedAt : fin(d.date) ? d.date : 0;
    const t = fin(d.playtime) ? d.playtime : fin(d.playTime) ? d.playTime : fin(d.time) ? d.time : 0;
    out.playtime = t > 360000 ? t / 1000 : t; // prototypes counted milliseconds
    out.chapter = fin(d.chapter) ? d.chapter : fin(d.act) ? d.act : 1;
    out.flags = isObj(d.flags) ? d.flags : {};
    out.party = Array.isArray(d.party) ? d.party : heroName ? [{ id: 'hero', name: heroName, lvl }] : [];
    out.inventory = Array.isArray(d.inventory) ? d.inventory : Array.isArray(d.items) ? d.items : [];
    out.gold = fin(d.gold) ? d.gold : 0;
    out.map = typeof d.map === 'string' ? d.map : typeof d.mapId === 'string' ? d.mapId : typeof d.location === 'string' ? d.location : null;
    out.pos = isObj(d.pos) ? d.pos : (fin(d.x) && fin(d.z)) ? { x: d.x, z: d.z } : null;
    return out;
  },
  /** v1 -> v2: the bare ARCHITECTURE shape gains game/seq/kv (meta and sum are rebuilt on write). */
  1(d) {
    const out = {};
    for (const k of Object.keys(d)) if (k !== '__proto__' && k !== 'sum' && k !== 'meta') out[k] = d[k];
    out.v = 2; out.game = GAME_ID; out.seq = fin(d.seq) ? d.seq : 0; out.kv = isObj(d.kv) ? d.kv : {};
    return out;
  },
};

function migrate(d, from) {
  let cur = d;
  for (let v = from; v < VERSION; v++) {
    const fn = MIGRATIONS[v];
    if (!fn) throw new Error(`no migration from v${v}`);
    cur = fn(cur);
    cur.v = v + 1;
  }
  return cur;
}

/** Repair only what Save owns or what the contract makes unambiguous. Returns the list of repairs. */
function sanitize(body) {
  const rep = [];
  if (body.game !== GAME_ID) body.game = GAME_ID;
  if (!fin(body.at) || body.at < 0) { if (body.at !== undefined) rep.push('at'); body.at = 0; }
  if (!fin(body.seq) || body.seq < 0) { if (body.seq !== undefined) rep.push('seq'); body.seq = 0; }
  if (!fin(body.playtime) || body.playtime < 0) { if (body.playtime !== undefined) rep.push('playtime'); body.playtime = 0; }
  if (body.playtime > MAX_PLAYTIME) { body.playtime = MAX_PLAYTIME; rep.push('playtime'); }
  if (!isObj(body.kv)) { if (body.kv !== undefined) rep.push('kv'); body.kv = {}; }
  if (body.chapter !== undefined) {
    const c = Math.round(Number(body.chapter));
    if (!(c >= 1 && c <= 3)) { body.chapter = 1; rep.push('chapter'); } else if (c !== body.chapter) { body.chapter = c; rep.push('chapter'); }
  }
  if (body.flags !== undefined && !isObj(body.flags)) { body.flags = {}; rep.push('flags'); }
  for (const k of ['party', 'inventory']) {
    if (body[k] !== undefined && body[k] !== null && typeof body[k] !== 'object') { body[k] = []; rep.push(k); }
  }
  if (body.gold !== undefined && body.gold !== null && !isObj(body.gold)) {
    const g = body.gold;
    if (!fin(g) || g < 0) { body.gold = 0; rep.push('gold'); }
    else if (g > MAX_GOLD || g !== Math.floor(g)) { body.gold = Math.min(MAX_GOLD, Math.floor(g)); rep.push('gold'); }
  }
  if (body.map !== undefined && body.map !== null && typeof body.map !== 'string') { body.map = null; rep.push('map'); }
  if (body.pos !== undefined && body.pos !== null && !(isObj(body.pos) && fin(body.pos.x) && fin(body.pos.z))) { body.pos = null; rep.push('pos'); }
  if (body.meta !== undefined && !isObj(body.meta)) { delete body.meta; rep.push('meta'); }
  return rep;
}

// ── page evaluation ──────────────────────────────────────────────────────────────────────────────────────────
const evalCache = new Map(); // raw string -> candidate (immutable use only; load() deep-copies)
const SUM_RE = /,"sum":"([0-9a-f]{8})"\}\s*$/;

/**
 * Grade a stored string. Grades: A verified, B sound but unverified (older format), C salvageable (bad checksum
 * or repaired fields), F from a newer build (good, not loadable), D unusable.
 */
function evaluate(raw) {
  if (typeof raw !== 'string') return null;
  const hit = evalCache.get(raw);
  if (hit) return hit;
  const c = { raw, bytes: raw.length, grade: 'D', sum: 'none', v: null, seq: -1, at: 0, body: null, meta: null, problems: [], repairs: [], migratedFrom: null };
  try {
    const m = SUM_RE.exec(raw);
    if (m) c.sum = crc32(raw.slice(0, m.index) + '}') === m[1] ? 'ok' : 'bad';
    let parsed;
    try { parsed = JSON.parse(raw); } catch (_) { c.problems.push('unreadable'); return remember(raw, c); }
    if (!isObj(parsed)) { c.problems.push('not a page'); return remember(raw, c); }
    if (parsed.game !== undefined && parsed.game !== GAME_ID) { c.problems.push('another game'); return remember(raw, c); }
    const v = parsed.v === undefined ? 0 : parsed.v;
    if (!Number.isInteger(v) || v < 0) { c.problems.push('bad version'); return remember(raw, c); }
    c.v = v;
    c.seq = fin(parsed.seq) ? parsed.seq : 0;
    c.at = fin(parsed.at) ? parsed.at : 0;
    if (v > VERSION) {
      if (isObj(parsed.meta)) {
        c.meta = { hero: null, level: null, chapter: null, place: null, placeName: null, party: [], gold: null };
        try { mergeMeta(c.meta, parsed.meta); } catch (_) {}
        if (fin(parsed.meta.playtime) && parsed.meta.playtime >= 0) c.meta.playtime = Math.min(MAX_PLAYTIME, parsed.meta.playtime);
      }
      c.grade = c.sum === 'bad' ? 'D' : 'F';
      if (c.sum === 'bad') c.problems.push('smudged future page');
      return remember(raw, c);
    }
    let body;
    try { body = migrate(parsed, v); } catch (e) { c.problems.push('migration failed: ' + (e && e.message)); return remember(raw, c); }
    if (!isObj(body)) { c.problems.push('migration lost the page'); return remember(raw, c); }
    if (v < VERSION) c.migratedFrom = v;
    const storedMeta = isObj(parsed.meta) ? parsed.meta : null;
    c.repairs = sanitize(body);
    c.body = body;
    c.seq = body.seq; c.at = body.at;
    if (c.sum === 'bad') { c.grade = 'C'; c.problems.push('checksum'); }
    else if (c.repairs.length) { c.grade = 'C'; c.problems.push('repaired: ' + c.repairs.join(',')); }
    else c.grade = c.sum === 'ok' ? 'A' : 'B';
    c.meta = summarizeBody(body, c.grade === 'A' ? storedMeta : null);
  } catch (e) {
    c.grade = 'D'; c.problems.push('evaluation failed');
  }
  return remember(raw, c);
}
function remember(raw, c) {
  if (evalCache.size > 48) evalCache.delete(evalCache.keys().next().value);
  evalCache.set(raw, c);
  return c;
}

/** Summary fields derived from a body (+ what the writer stored, when the page is verified). */
function summarizeBody(body, stored) {
  const meta = { hero: null, level: null, chapter: 1, place: null, placeName: null, party: [], gold: null };
  try {
    const p = body.party;
    const members = Array.isArray(p) ? p : isObj(p) ? (Array.isArray(p.members) ? p.members : Array.isArray(p.active) ? p.active : Array.isArray(p.walking) ? p.walking : []) : [];
    const named = members.filter(isObj).map(m => ({
      id: typeof m.id === 'string' ? m.id : null,
      name: typeof m.name === 'string' ? m.name.slice(0, 16) : typeof m.id === 'string' ? m.id : '?',
      lvl: fin(m.lvl) ? m.lvl : fin(m.level) ? m.level : null,
    }));
    const hero = named.find(m => m.id === 'hero') || named[0] || null;
    if (hero) { meta.hero = hero.name; meta.level = hero.lvl; }
    meta.party = named.slice(0, 4).map(({ name, lvl }) => ({ name, lvl }));
    if (fin(body.chapter)) meta.chapter = body.chapter;
    if (typeof body.map === 'string') { meta.place = body.map; meta.placeName = PLACE_NAMES[body.map] || prettyId(body.map); }
    if (fin(body.gold)) meta.gold = body.gold; else if (isObj(body.gold) && fin(body.gold.carried)) meta.gold = body.gold.carried;
    // handler summary hooks (the owners know their own shapes best)
    for (const h of handlers.values()) {
      if (typeof h.summary !== 'function' || body[h.key] === undefined) continue;
      try { mergeMeta(meta, h.summary(deepCopy(body[h.key]), body)); }
      catch (e) { reportError(`Save: "${h.key}" summary()`, e); }
    }
    if (stored) mergeMeta(meta, stored);
  } catch (_) { /* summaries are best effort */ }
  return meta;
}
function mergeMeta(meta, part) {
  if (!isObj(part)) return;
  if (typeof part.hero === 'string') meta.hero = part.hero.slice(0, 16);
  if (fin(part.level)) meta.level = part.level;
  if (fin(part.chapter) && part.chapter >= 1 && part.chapter <= 3) meta.chapter = Math.round(part.chapter);
  if (typeof part.place === 'string') meta.place = part.place;
  if (typeof part.placeName === 'string') meta.placeName = part.placeName.slice(0, 40);
  if (fin(part.gold)) meta.gold = part.gold;
  if (Array.isArray(part.party)) meta.party = part.party.filter(isObj).slice(0, 4).map(m => ({ name: String(m.name ?? '?').slice(0, 16), lvl: fin(m.lvl) ? m.lvl : null }));
}
const prettyId = (id) => String(id).replace(/[_-]+/g, ' ').replace(/\b\w/g, ch => ch.toUpperCase()).slice(0, 40);

/** Read every copy of a slot and decide which one is the tale. Read-only. */
function resolve(slot) {
  const k = keysFor(slot);
  const rawPage = sget(k.page), rawCopy = sget(k.copy), rawBak = sget(k.bak);
  const page = evaluate(rawPage), copy = evaluate(rawCopy), bak = evaluate(rawBak);
  const tag = (c, where) => (c ? { c, where } : null);
  const all = [tag(page, 'page'), tag(copy, 'copy'), tag(bak, 'backup')].filter(Boolean);
  let chosen = null;
  const fresh = all.filter(x => x.where !== 'backup' && GOOD.has(x.c.grade)).sort((a, b) => (b.c.seq - a.c.seq) || (a.where === 'page' ? -1 : 1));
  if (fresh.length) chosen = fresh[0];
  if (!chosen) chosen = all.find(x => x.where !== 'backup' && x.c.grade === 'F') || null;
  if (!chosen && bak && GOOD.has(bak.grade)) chosen = { c: bak, where: 'backup' };
  if (!chosen) chosen = all.filter(x => x.c.grade === 'C').sort((a, b) => b.c.seq - a.c.seq)[0] || null;
  if (!chosen && bak && bak.grade === 'F') chosen = { c: bak, where: 'backup' };
  let status;
  if (!chosen) status = all.length ? 'broken' : 'empty';
  else if (chosen.c.grade === 'F') status = 'future';
  else if (chosen.c.grade === 'C') status = 'mended';
  else if (chosen.where === 'backup') status = 'backup';
  else if (chosen.where === 'copy' && !(page && GOOD.has(page.grade) && page.seq === chosen.c.seq)) status = 'copy';
  else status = 'ok';
  const pageGood = !!(page && (GOOD.has(page.grade) || page.grade === 'F'));
  return {
    slot, status, chosen: chosen ? chosen.c : null, source: chosen ? chosen.where : null,
    page, copy, bak, keys: k,
    copies: { page: pageGood, copy: !!(copy && (GOOD.has(copy.grade) || copy.grade === 'F')), spare: !!(bak && (GOOD.has(bak.grade) || bak.grade === 'F')) },
    loadable: ['ok', 'copy', 'backup', 'mended'].includes(status),
  };
}

export function formatPlaytime(s) {
  const t = fin(s) && s > 0 ? Math.floor(s) : 0;
  const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60);
  return `${h}:${String(m).padStart(2, '0')}`;
}

function summaryOf(r) {
  const c = r.chosen;
  const meta = c ? (c.meta || {}) : {};
  const playtime = c && c.body ? c.body.playtime : 0;
  return {
    slot: r.slot, label: WORDS.label[r.slot], exists: r.status !== 'empty', status: r.status, source: r.source,
    loadable: r.loadable, words: WORDS.status[r.status],
    hero: meta.hero ?? null, level: meta.level ?? null, chapter: meta.chapter ?? null,
    act: meta.chapter ? ACT_NAMES[meta.chapter] || null : null,
    place: meta.place ?? null, placeName: meta.placeName ?? null, gold: meta.gold ?? null,
    party: Array.isArray(meta.party) ? meta.party : [],
    playtime: c && c.body ? playtime : (c && c.meta && fin(c.meta.playtime) ? c.meta.playtime : null),
    playtimeText: c ? formatPlaytime(c.body ? playtime : (c.meta && c.meta.playtime)) : null,
    at: c ? c.at : null, v: c ? c.v : null, migratedFrom: c ? c.migratedFrom : null, seq: c ? c.seq : null,
    bytes: c ? c.bytes : 0, copies: r.copies, problems: c ? c.problems.slice() : [],
  };
}

// ── registry ─────────────────────────────────────────────────────────────────────────────────────────────────
const handlers = new Map();   // key -> {key, save, load, reset, summary, version, migrate, order}
const orphans = new Map();    // key -> {data, kv}  loaded data no handler has claimed yet
let loadedBody = null;        // the body most recently loaded/written (for carry-forward when a save() throws)

const sortedHandlers = () => Array.from(handlers.values()).sort((a, b) => a.order - b.order || (a.key < b.key ? -1 : 1));

function deliver(h, data, from, info) {
  try {
    let d = deepCopy(data);
    if (fin(from) && from < h.version && typeof h.migrate === 'function') d = h.migrate(d, from);
    h.load(d, info);
    return true;
  } catch (e) {
    reportError(`Save: "${h.key}" load()`, e);
    if (typeof h.reset === 'function') { try { h.reset(); } catch (e2) { reportError(`Save: "${h.key}" reset()`, e2); } }
    return false;
  }
}

// ── playtime clock ───────────────────────────────────────────────────────────────────────────────────────────
const clockState = { base: 0, running: false, last: 0, timer: 0 };
function clockBeat() {
  const n = perfNow();
  let d = n - clockState.last;
  clockState.last = n;
  if (!clockState.running) return;
  let hidden = false;
  try { hidden = typeof document !== 'undefined' && document.hidden; } catch (_) {}
  if (hidden || !(d > 0)) return;
  if (d > 1000) d = 1000; // a sleep or a stalled tab is not play
  clockState.base = Math.min(MAX_PLAYTIME, clockState.base + d / 1000);
}
const clock = {
  get running() { return clockState.running; },
  start() {
    if (clockState.running) return true;
    clockState.running = true; clockState.last = perfNow();
    if (!clockState.timer && typeof setInterval === 'function') clockState.timer = setInterval(clockBeat, 250);
    return true;
  },
  stop() {
    if (clockState.running) clockBeat();
    clockState.running = false;
    if (clockState.timer) { clearInterval(clockState.timer); clockState.timer = 0; }
    return false;
  },
};

// ── autosave ─────────────────────────────────────────────────────────────────────────────────────────────────
const auto = { enabled: false, events: [], minGapMs: 1500, veto: null, offs: [], lastAt: 0, timer: 0, count: 0, skipped: 0, lastReason: null, lastResult: null };

// ── module state ─────────────────────────────────────────────────────────────────────────────────────────────
let inited = false;
let inGame = false;
let loading = false;
let writing = false;
let currentSlot = null;
const stats = { writes: 0, failedWrites: 0, loads: 0, failedLoads: 0, recovered: 0, lastResult: null };

function ensure() {
  if (inited) return;
  inited = true;
  const p = pickStorage();
  store = p.s; backend = p.name;
  try {
    Debug.provide('save', () => Save.state());
    Debug.expose('saves', () => Save.slots());
    Debug.expose('saveGame', (slot = currentSlot || 1) => Save.write(slot, { reason: 'debug' }));
    Debug.expose('loadGame', (slot) => Save.load(slot));
  } catch (e) { reportError('Save.init debug', e); }
  try {
    if (typeof addEventListener === 'function') {
      addEventListener('storage', (ev) => {
        try { if (ev && typeof ev.key === 'string' && ev.key.startsWith(PREFIX)) Bus.emit('save.external', { key: ev.key }); } catch (_) {}
      });
    }
  } catch (_) {}
  if (backend === 'memory') Bus.emit('save.nostorage', { words: WORDS.memory });
}

function result(r) {
  const { summary, ...rest } = r;
  stats.lastResult = { ...rest, at: Date.now() };
  return r;
}

function fail(op, slot, reason, extra = {}) {
  const words = { full: WORDS.full, blocked: WORDS.blocked, empty: WORDS.loadEmpty, broken: WORDS.loadBroken, future: WORDS.loadFuture, badcode: WORDS.badCode }[reason] || null;
  return result({ ok: false, op, slot, reason, words, ...extra });
}

/** Build the body a write would store. */
function collect(seq) {
  const body = { v: VERSION, game: GAME_ID, at: nowMs(), seq, playtime: Math.round(clockTime() * 10) / 10, kv: {} };
  const partial = [];
  for (const k of CONTRACT_KEYS) body[k] = undefined; // keep the contract's key order at the top of the page
  for (const h of sortedHandlers()) {
    let data;
    try {
      data = clean(h.save());
    } catch (e) {
      reportError(`Save: "${h.key}" save()`, e);
      partial.push(h.key);
      data = loadedBody && loadedBody[h.key] !== undefined ? loadedBody[h.key] : undefined; // carry the last known good
    }
    if (data !== undefined) { body[h.key] = data; body.kv[h.key] = h.version; }
  }
  for (const [key, o] of orphans) {
    if (handlers.has(key)) continue;
    body[key] = o.data;
    if (fin(o.kv)) body.kv[key] = o.kv;
  }
  const defaults = { chapter: 1, flags: {}, party: [], inventory: [], gold: 0, map: null, pos: null };
  for (const k of CONTRACT_KEYS) if (body[k] === undefined) body[k] = defaults[k];
  const repairs = sanitize(body); // a subsystem's odd value (gold 12.5, chapter 7) must never block saving
  if (repairs.length) reportError('Save.write', new Error(`repaired before writing: ${repairs.join(', ')}`));
  body.meta = summarizeBody(body, null);
  body.meta.playtime = body.playtime;
  if (partial.length) body.meta.partial = partial;
  return body;
}

function serialize(body) {
  const b = { ...body };
  delete b.sum;
  const s = JSON.stringify(b);
  return s.slice(0, -1) + ',"sum":"' + crc32(s) + '"}';
}

function clockTime() { if (clockState.running) clockBeat(); return clockState.base; }

/** Free space for a write: rescue copies, then undo drawers. Never a page, a copy or a spare. */
function freeSpace() {
  let n = 0;
  for (const k of skeys()) if (k.startsWith(PREFIX) && k.endsWith('.broken')) { sdel(k); n++; }
  for (const k of skeys()) if (k.startsWith(PREFIX) && k.endsWith('.undo')) { sdel(k); n++; }
  return n;
}
function trySet(k, v) {
  let r = sset(k, v);
  if (r === 'full' && freeSpace() > 0) r = sset(k, v);
  return r;
}

/** Commit a serialised page to a slot, keeping every good page it replaces. See the header for the order. */
function commit(slot, raw, opts = {}) {
  const cur = resolve(slot);
  const k = cur.keys;
  const best = cur.chosen && (GOOD.has(cur.chosen.grade) || cur.chosen.grade === 'F') ? cur.chosen : null;
  // 0. a bad page about to be written over is kept for rescue (best effort)
  if (cur.page && !GOOD.has(cur.page.grade) && cur.page.grade !== 'F' && cur.page.raw !== (best && best.raw)) sset(k.broken, cur.page.raw);
  // 1. the spare := the best good page in the slot
  let backup = false;
  if (best) {
    if (cur.bak && cur.bak.raw === best.raw) backup = true;
    else backup = trySet(k.bak, best.raw) === true;
  }
  if (opts.simulateCrash === 'backup') return { ok: false, crashed: 'backup' };
  // 2. the copy := new
  const oldCopy = cur.copy ? cur.copy.raw : null;
  const c = trySet(k.copy, raw);
  if (c === 'blocked') return { ok: false, reason: 'blocked' };
  if (opts.simulateCrash === 'copy') return { ok: false, crashed: 'copy' };
  // 3. the page := new
  const p = trySet(k.page, raw);
  if (p !== true) {
    // roll back the copy so a failed write can't win the next read; the old page is untouched (setItem is all-or-nothing)
    if (c === true) { if (oldCopy == null || sset(k.copy, oldCopy) !== true) sdel(k.copy); }
    if (cur.page && sget(k.page) !== cur.page.raw) sset(k.page, cur.page.raw);
    return { ok: false, reason: p === 'full' ? 'full' : 'blocked' };
  }
  return { ok: true, backup, copy: c === true, bytes: raw.length };
}

// ── public API ───────────────────────────────────────────────────────────────────────────────────────────────
export const Save = {
  VERSION,
  SLOTS: SLOT_IDS.slice(),
  PLACE_NAMES,
  ACT_NAMES,
  words: WORDS,
  clock,
  formatPlaytime,
  crc32,

  init() { ensure(); return Save; },
  get backend() { ensure(); return backend; },
  get inGame() { return inGame; },
  get currentSlot() { return currentSlot; },

  /** Swap the storage (tests, the demo's "blocked shelf"). Pass null to go back to the real one. */
  useStorage(s) {
    ensure();
    if (s && typeof s.getItem === 'function' && typeof s.setItem === 'function') { store = s; backend = s.memory ? 'memory' : 'custom'; }
    else { const p = pickStorage(); store = p.s; backend = p.name; }
    evalCache.clear();
    return backend;
  },
  memoryStorage,

  // registry
  register(key, handler) {
    ensure();
    const k = String(key || '');
    if (!k || RESERVED.has(k)) { reportError('Save.register', new Error(`"${k}" is not a usable save key`)); return () => false; }
    if (!handler || typeof handler.save !== 'function' || typeof handler.load !== 'function') {
      reportError('Save.register', new Error(`"${k}" needs save() and load()`)); return () => false;
    }
    const h = {
      key: k, save: handler.save.bind(handler), load: handler.load.bind(handler),
      reset: typeof handler.reset === 'function' ? handler.reset.bind(handler) : null,
      summary: typeof handler.summary === 'function' ? handler.summary.bind(handler) : null,
      migrate: typeof handler.migrate === 'function' ? handler.migrate.bind(handler) : null,
      version: Number.isInteger(handler.version) && handler.version > 0 ? handler.version : 1,
      order: fin(handler.order) ? handler.order : (DEFAULT_ORDER[k] ?? 50),
    };
    handlers.set(k, h);
    evalCache.clear(); // summaries may now use this handler's summary()
    if (orphans.has(k)) {
      const o = orphans.get(k);
      orphans.delete(k);
      deliver(h, o.data, fin(o.kv) ? o.kv : 1, { slot: currentSlot, source: 'late', v: VERSION });
    }
    return () => (handlers.get(k) === h ? Save.unregister(k) : false);
  },
  unregister(key) { const ok = handlers.delete(String(key)); if (ok) evalCache.clear(); return ok; },
  registered() { return sortedHandlers().map(h => h.key); },

  // playtime
  playtime() { return clockTime(); },
  setPlaytime(s) { clockTime(); clockState.base = fin(Number(s)) ? Math.max(0, Math.min(MAX_PLAYTIME, Number(s))) : 0; return clockState.base; },
  addPlaytime(s) { return Save.setPlaytime(clockTime() + (Number(s) || 0)); },

  // game flow
  newGame() {
    ensure();
    orphans.clear(); loadedBody = null; currentSlot = null;
    for (const h of sortedHandlers()) if (h.reset) { try { h.reset(); } catch (e) { reportError(`Save: "${h.key}" reset()`, e); } }
    Save.setPlaytime(0); clock.start(); inGame = true;
    Bus.emit('save.newgame', {});
    return true;
  },
  endGame() {
    clock.stop(); inGame = false;
    if (auto.timer) { clearTimeout(auto.timer); auto.timer = 0; }
    Bus.emit('save.endgame', {});
    return true;
  },

  snapshot() { ensure(); try { return collect(0); } catch (e) { reportError('Save.snapshot', e); return null; } },

  write(slot, opts = {}) {
    ensure();
    const s = normSlot(slot);
    if (s == null) return fail('write', slot, 'noslot');
    if (writing) return fail('write', s, 'busy');
    writing = true;
    try {
      const cur = resolve(s);
      const seq = Math.max(0, ...[cur.page, cur.copy, cur.bak].map(c => (c && fin(c.seq) ? c.seq : 0))) + 1;
      let raw, body;
      try {
        body = collect(seq);
        raw = serialize(body);
      } catch (e) { reportError('Save.write collect', e); stats.failedWrites++; return fail('write', s, 'unwritable'); }
      const check = evaluate(raw);
      if (!check || check.grade !== 'A') { stats.failedWrites++; return fail('write', s, 'unwritable', { problems: check ? check.problems : [] }); }
      if (raw.length > BIG_PAGE) reportError('Save.write', new Error(`page for slot ${s} is ${raw.length} chars — is a subsystem saving something huge?`));
      const r = commit(s, raw, opts);
      if (!r.ok) {
        stats.failedWrites++;
        if (r.crashed) return result({ ok: false, op: 'write', slot: s, reason: 'crashed', simulated: r.crashed });
        return fail('write', s, r.reason);
      }
      stats.writes++;
      loadedBody = body;
      if (s !== 'auto') { currentSlot = s; sset(POINTER_KEY, String(s)); }
      const summary = Save.summary(s);
      const out = result({ ok: true, op: 'write', slot: s, bytes: r.bytes, backup: r.backup, copy: r.copy, seq, reason: opts.reason || 'manual', words: WORDS.done, partial: body.meta.partial || [], summary });
      Bus.emit('save.write', { slot: s, bytes: r.bytes, reason: out.reason });
      return out;
    } catch (e) {
      reportError('Save.write', e);
      stats.failedWrites++;
      return fail('write', s, 'unwritable');
    } finally { writing = false; }
  },

  read(slot) {
    ensure();
    const s = normSlot(slot);
    if (s == null) return { ok: false, reason: 'noslot', slot };
    try {
      const r = resolve(s);
      return { ok: r.loadable, slot: s, status: r.status, source: r.source, body: r.chosen && r.chosen.body ? deepCopy(r.chosen.body) : null, summary: summaryOf(r) };
    } catch (e) { reportError('Save.read', e); return { ok: false, slot: s, status: 'broken', reason: 'broken' }; }
  },

  load(slot, opts = {}) {
    ensure();
    const s = normSlot(slot);
    if (s == null) return fail('load', slot, 'noslot');
    let r;
    try { r = resolve(s); } catch (e) { reportError('Save.load resolve', e); stats.failedLoads++; return fail('load', s, 'broken'); }
    if (!r.loadable) { stats.failedLoads++; return fail('load', s, r.status === 'empty' ? 'empty' : r.status === 'future' ? 'future' : 'broken', { status: r.status }); }
    const c = r.chosen, body = c.body;
    loading = true;
    const failed = [], missing = [];
    try {
      if (!isObj(body.kv)) body.kv = {};
      orphans.clear();
      const info = { slot: s, source: r.source, v: VERSION, from: c.migratedFrom ?? VERSION };
      for (const h of sortedHandlers()) {
        if (body[h.key] === undefined) {
          missing.push(h.key);
          if (h.reset) { try { h.reset(); } catch (e) { reportError(`Save: "${h.key}" reset()`, e); } }
          continue;
        }
        const from = fin(body.kv[h.key]) ? body.kv[h.key] : 1;
        if (!deliver(h, body[h.key], from, info)) failed.push(h.key);
      }
      for (const key of Object.keys(body)) {
        if (RESERVED.has(key) || handlers.has(key)) continue;
        orphans.set(key, { data: softCopy(body[key]), kv: body.kv[key] });
      }
      loadedBody = softCopy(body);
      Save.setPlaytime(body.playtime);
      if (opts.clock !== false) clock.start();
      inGame = true;
      currentSlot = s === 'auto' ? currentSlot : s;
    } catch (e) {
      reportError('Save.load', e);
      stats.failedLoads++;
      return fail('load', s, 'broken', { status: 'broken', failed });
    } finally { loading = false; }
    stats.loads++;
    if (r.status !== 'ok') { stats.recovered++; Bus.emit('save.recovered', { slot: s, status: r.status, source: r.source }); }
    const out = result({ ok: true, op: 'load', slot: s, status: r.status, source: r.source, failed, missing, repairs: c.repairs.slice(), migratedFrom: c.migratedFrom, words: WORDS.status[r.status], summary: summaryOf(r) });
    Bus.emit('save.load', { slot: s, status: r.status, source: r.source });
    return out;
  },

  summary(slot) {
    ensure();
    const s = normSlot(slot);
    if (s == null) return null;
    try { return summaryOf(resolve(s)); }
    catch (e) { reportError('Save.summary', e); return { slot: s, label: WORDS.label[s], exists: true, status: 'broken', loadable: false, words: WORDS.status.broken, party: [], copies: {}, problems: ['summary failed'] }; }
  },
  slots() { return SLOT_IDS.map(s => Save.summary(s)); },
  latest() {
    const list = Save.slots().filter(x => x && x.loadable);
    list.sort((a, b) => (b.at || 0) - (a.at || 0));
    return list[0] || null;
  },
  hasAny() { return Save.slots().some(x => x && x.loadable); },
  lastSlot() { const s = normSlot(sget(POINTER_KEY)); return s; },
  continueInfo() { const slots = Save.slots(); const latest = Save.latest(); return { any: !!latest, latest, slots }; },

  clear(slot) {
    ensure();
    const s = normSlot(slot);
    if (s == null) return fail('clear', slot, 'noslot');
    const r = resolve(s);
    const k = r.keys;
    let undo = false;
    const keep = r.chosen ? r.chosen.raw : (r.page ? r.page.raw : null);
    if (keep != null) undo = sset(k.undo, keep) === true;
    for (const key of [k.page, k.copy, k.bak, k.broken]) sdel(key);
    if (currentSlot === s) currentSlot = null;
    Bus.emit('save.clear', { slot: s, undo });
    return result({ ok: true, op: 'clear', slot: s, undo, words: WORDS.cleared });
  },
  canUndoClear(slot) { ensure(); const s = normSlot(slot); return s != null && sget(keysFor(s).undo) != null && resolve(s).status === 'empty'; },
  undoClear(slot) {
    ensure();
    const s = normSlot(slot);
    if (s == null) return fail('undo', slot, 'noslot');
    const k = keysFor(s);
    const raw = sget(k.undo);
    if (raw == null) return fail('undo', s, 'nothing');
    if (resolve(s).status !== 'empty') return fail('undo', s, 'occupied');
    const w = trySet(k.page, raw);
    if (w !== true) return fail('undo', s, w === 'full' ? 'full' : 'blocked');
    sset(k.copy, raw);
    sdel(k.undo);
    Bus.emit('save.undo', { slot: s });
    return result({ ok: true, op: 'undo', slot: s, words: WORDS.undone, summary: Save.summary(s) });
  },

  copySlot(from, to) {
    ensure();
    const a = normSlot(from), b = normSlot(to);
    if (a == null || b == null || a === b) return fail('copy', to, 'noslot');
    const r = resolve(a);
    if (!r.loadable) return fail('copy', b, r.status === 'empty' ? 'empty' : 'broken');
    return commitBody(b, r.chosen.body, 'copy');
  },

  // escape hatch
  exportCode(slot) {
    ensure();
    const s = normSlot(slot);
    if (s == null) return { ok: false, reason: 'noslot' };
    try {
      const r = resolve(s);
      if (!r.chosen) return { ok: false, reason: r.status === 'empty' ? 'empty' : 'broken', words: r.status === 'empty' ? WORDS.loadEmpty : WORDS.loadBroken };
      const raw = r.chosen.grade === 'F' ? r.chosen.raw : serialize({ ...r.chosen.body, meta: { ...(r.chosen.meta || {}), playtime: r.chosen.body.playtime } });
      return { ok: true, slot: s, code: CODE_PREFIX + b64encode(raw), status: r.status, words: WORDS.exported };
    } catch (e) { reportError('Save.exportCode', e); return { ok: false, reason: 'unwritable' }; }
  },
  async copyCode(slot) {
    const ex = Save.exportCode(slot);
    if (!ex.ok) return ex;
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(ex.code);
        return { ...ex, method: 'clipboard' };
      }
    } catch (_) { /* permission denied / insecure context: fall through */ }
    try {
      if (typeof document !== 'undefined' && document.body) {
        const ta = document.createElement('textarea');
        ta.value = ex.code; ta.setAttribute('readonly', '');
        ta.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0';
        document.body.appendChild(ta); ta.select();
        let ok = false;
        try { ok = document.execCommand && document.execCommand('copy'); } catch (_) { ok = false; }
        ta.remove();
        if (ok) return { ...ex, method: 'execCommand' };
      }
    } catch (_) {}
    return { ...ex, method: 'manual' }; // the caller shows the code for copying by hand
  },
  decodeCode(text) {
    try {
      let t = String(text == null ? '' : text).trim();
      if (!t) return null;
      if (t[0] !== '{') {
        t = t.replace(/\s+/g, '');
        const i = t.toUpperCase().indexOf(CODE_PREFIX);
        if (i >= 0) t = t.slice(i + CODE_PREFIX.length);
        t = t.replace(/-/g, '+').replace(/_/g, '/');
        if (!/^[A-Za-z0-9+/]*={0,2}$/.test(t)) return null;
        while (t.length % 4) t += '=';
        t = b64decode(t);
      }
      return t;
    } catch (_) { return null; }
  },
  importCode(slot, text) {
    ensure();
    const s = normSlot(slot);
    if (s == null) return fail('import', slot, 'noslot');
    const raw = Save.decodeCode(text);
    const c = raw == null ? null : evaluate(raw);
    if (!c || !c.body || !['A', 'B', 'C'].includes(c.grade)) return fail('import', s, c && c.grade === 'F' ? 'future' : 'badcode');
    const out = commitBody(s, c.body, 'import', c.body.at);
    if (out.ok) { out.words = WORDS.imported; out.repairs = c.repairs.slice(); Bus.emit('save.import', { slot: s }); }
    return out;
  },

  // autosave
  enableAutosave(opts = {}) {
    ensure();
    Save.disableAutosave();
    auto.enabled = true;
    auto.events = Array.isArray(opts.events) ? opts.events.map(String) : ['map.enter'];
    auto.minGapMs = fin(opts.minGapMs) ? Math.max(0, opts.minGapMs) : 1500;
    auto.veto = typeof opts.veto === 'function' ? opts.veto : null;
    auto.offs = auto.events.map(evt => Bus.on(evt, (payload, name) => Save.autosave(name || evt)));
    return true;
  },
  disableAutosave() {
    for (const off of auto.offs) { try { off(); } catch (_) {} }
    auto.offs = []; auto.enabled = false;
    if (auto.timer) { clearTimeout(auto.timer); auto.timer = 0; }
    return false;
  },
  autosave(reason = 'autosave') {
    ensure();
    if (!inGame || loading) { auto.skipped++; return { ok: false, reason: inGame ? 'loading' : 'notingame' }; }
    try { if (auto.veto && auto.veto(reason)) { auto.skipped++; return { ok: false, reason: 'vetoed' }; } }
    catch (e) { reportError('Save autosave veto', e); }
    const wait = auto.lastAt + auto.minGapMs - Date.now();
    if (wait > 0) {
      auto.lastReason = reason;
      if (!auto.timer) auto.timer = setTimeout(() => { auto.timer = 0; Save.autosave(auto.lastReason || reason); }, wait + 5);
      return { ok: true, deferred: true };
    }
    auto.lastAt = Date.now();
    const r = Save.write('auto', { reason });
    auto.count++; auto.lastReason = reason; auto.lastResult = { ok: r.ok, reason: r.reason, at: auto.lastAt };
    Bus.emit('save.autosave', { ok: r.ok, reason });
    return r;
  },

  /** Everything the debug API and a critic need, JSON-safe. */
  state() {
    ensure();
    let slots = [];
    try {
      slots = Save.slots().map(x => x && ({ slot: x.slot, status: x.status, source: x.source, hero: x.hero, level: x.level,
        act: x.act, place: x.placeName, playtime: x.playtimeText, copies: x.copies, v: x.v, migratedFrom: x.migratedFrom, bytes: x.bytes }));
    } catch (e) { reportError('Save.state', e); }
    return {
      backend, version: VERSION, inGame, slot: currentSlot, loading, playtime: Math.round(clockTime() * 10) / 10,
      playtimeText: formatPlaytime(clockTime()), clock: clockState.running,
      registered: Save.registered(), orphans: Array.from(orphans.keys()),
      autosave: { enabled: auto.enabled, events: auto.events.slice(), count: auto.count, skipped: auto.skipped, lastReason: auto.lastReason, last: auto.lastResult },
      writes: stats.writes, failedWrites: stats.failedWrites, loads: stats.loads, failedLoads: stats.failedLoads, recovered: stats.recovered,
      last: stats.lastResult, slots,
    };
  },

  /** Raw storage keys for a slot (the demo's ledger and its mischief buttons use these). */
  keys(slot) { const s = normSlot(slot); return s == null ? null : keysFor(s); },
  /** Low-level access to the current shelf, for tests and the demo only. */
  rawGet(key) { ensure(); return sget(String(key)); },
  rawSet(key, value) { ensure(); evalCache.clear(); return sset(String(key), String(value)); },
  rawDel(key) { ensure(); return sdel(String(key)); },
  rawKeys() { ensure(); return skeys(); },
  /** Grade a raw string the way a read would (test/diagnostic). */
  inspect(raw) { const c = evaluate(raw); return c ? { grade: c.grade, sum: c.sum, v: c.v, seq: c.seq, problems: c.problems.slice(), repairs: c.repairs.slice(), migratedFrom: c.migratedFrom } : null; },
  serializeForTest(body) { return serialize(body); },
};

/** Re-serialise an existing body into a slot (copy / import) with a fresh seq. */
function commitBody(slot, body, reason, at) {
  try { return commitBodyUnsafe(slot, body, reason, at); }
  catch (e) { reportError(`Save.${reason}`, e); return fail(reason, slot, 'unwritable'); }
}
function commitBodyUnsafe(slot, body, reason, at) {
  const cur = resolve(slot);
  const seq = Math.max(0, ...[cur.page, cur.copy, cur.bak].map(c => (c && fin(c.seq) ? c.seq : 0))) + 1;
  const b = deepCopy(body);
  b.v = VERSION; b.game = GAME_ID; b.seq = seq; b.at = fin(at) && at > 0 ? at : nowMs();
  if (!isObj(b.kv)) b.kv = {};
  b.meta = summarizeBody(b, null); b.meta.playtime = b.playtime;
  let raw;
  try { raw = serialize(b); } catch (e) { reportError(`Save.${reason}`, e); return fail(reason, slot, 'unwritable'); }
  const r = commit(slot, raw);
  if (!r.ok) return fail(reason, slot, r.reason || 'blocked');
  stats.writes++;
  const summary = Save.summary(slot);
  Bus.emit('save.write', { slot, bytes: r.bytes, reason });
  return result({ ok: true, op: reason, slot, bytes: r.bytes, backup: r.backup, words: WORDS.done, summary });
}

// Belt and braces: no public call may ever throw into the game. Every method is individually careful; this catches
// whatever they missed (a hostile Proxy in a handler, a stack overflow on a pathological page...).
for (const key of Object.keys(Save)) {
  const d = Object.getOwnPropertyDescriptor(Save, key);
  if (!d || typeof d.value !== 'function' || key === 'memoryStorage') continue;
  const fn = d.value;
  Save[key] = function guarded(...args) {
    try {
      const out = fn.apply(Save, args);
      if (out && typeof out.then === 'function') return out.catch((e) => { reportError(`Save.${key}`, e); return { ok: false, reason: 'broken' }; });
      return out;
    } catch (e) {
      reportError(`Save.${key}`, e);
      return { ok: false, reason: 'broken' };
    }
  };
}

export default Save;
