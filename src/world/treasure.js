/**
 * treasure.js — DISCOVERY: chests that open, containers that can be searched, keys, mimics and secrets.
 *                                                                          (P30, owner: src/world/treasure.js)
 *
 *   import { Treasure } from './world/treasure.js';
 *   Treasure.boot();            // registers every map's treasure layer + the ceremony (called by meadow.chests.js,
 *                               // so the whole system is live in /index.html without a shared-file edit)
 *   Treasure.install(ctx);      // the plugin form, for demos/P30.html and for main.js if it ever wants it
 *
 * WHAT IT DOES
 *   · A chest in the world is a real object: a body, iron straps, a gold clasp and a LID ON A HINGE. Confirm near
 *     it and the lid swings back, the thing inside rises out of the chest turning in the light, a fanfare plays and
 *     the window says what %HERO% has got. Opened chests stay open, for ever, through Save.
 *   · A LOCKED chest wants the Rusty Key. Without it the lid rattles and stays shut; with it the key turns first.
 *   · A MIMIC (MONSTER-BIBLE: the Chestnut) is a chest until you touch it, and then it is a fight.
 *   · Every pot, barrel, crate, sack, hay bale, drawer, shelf, cupboard, woodpile and well in the game can be
 *     SEARCHED. About one in four holds something (gold, an herb, a key, something daft); the rest earn a laugh.
 *     Nothing gives the same reward twice — the ledger below remembers, and Save.register('treasure') keeps it.
 *   · SECRETS: a loose flagstone behind the mill wheel, a hollow in the fallen oak, a stone under the footbridge,
 *     a gap behind the cottage shelf. They are not marked. They are found by searching the right thing.
 *
 * WHERE THE DATA LIVES — the map layers, one file per map (docs/ARCHITECTURE.md "Map layers"):
 *   src/world/maps/<id>.chests.js   default export {chests, props?, lines?}   things that are NEW on that map
 *                                   export `searches`   search behaviour bolted onto props the map already draws
 *                                   export `rewards`    what the map's OWN chest entries hold
 *   Only `meadow` lists a chests layer in maps/index.js (P23's file), so treasure.js registers the other three
 *   itself with Maps.addLayer — which is why it imports them.
 *
 * __DQ: state().treasure = {map, chests, opened, found, gold, keys, seeds, ledger}
 *       __DQ.treasure()            everything on this map, with world positions and whether it has been taken
 *       __DQ.openNear()            open / search whatever the hero is facing
 *       __DQ.treasureGive('rusty_key')   put a key in the pocket (for critics and scenarios)
 *       __DQ.treasureReset()       forget every chest ever opened
 */
import * as THREE from 'three';
import { PAL, C3 } from '../art/palette.js';
import { makeToon, withOutline, makeContactShadow, OUTLINE } from '../art/toon.js';
import { Debug, reportError } from '../engine/debug.js';
import { Save } from '../engine/save.js';
import { Assets } from '../engine/assets.js';
import { Bus } from '../engine/events.js';
import { Sfx } from '../audio/sfx.js';
import { mkCanvas, ctx2 } from '../art/tex.js';
import { Maps } from './map.js';
import { Field } from './field.js';
import { str, container } from '../data/strings.js';
import DATA from '../../tests/battle/data.js';
import pwLayer, { searches as pwSearches, rewards as pwRewards } from './maps/puddlewick.chests.js';
import hbLayer, { searches as hbSearches, rewards as hbRewards } from './maps/hollybank.chests.js';
import innLayer, { searches as innSearches, rewards as innRewards } from './maps/puddlewick_inn.chests.js';

const HERO = 'Bram';
const DEG = Math.PI / 180;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const safe = (where, fn, fallback = null) => { try { return fn(); } catch (e) { reportError('treasure ' + where, e); return fallback; } };

/** Keys are not battle items, so they live here rather than in the bag (nothing else knows their names yet). */
export const KEYS = {
  rusty_key: { name: 'Rusty Key', blurb: 'It opens anything with a keyhole\nand no opinions.' },
};

/**
 * Items a chest may hold. P21's src/data/items.js is the real table when it is there; until then the battle data
 * table is. It is loaded lazily and never awaited, so a mid-edit items.js can never hold up a map load.
 */
let ITEMS21 = null;
safe('items', () => import('../data/items.js').then((m) => { ITEMS21 = m.ITEMS || null; }, () => {}));
const itemDef = (id) => safe('item table', () => (ITEMS21 && ITEMS21[id]) || (DATA && DATA.items && DATA.items[id]), null);
function itemName(id) {
  const it = itemDef(id);
  if (it && it.name) return it.name;
  if (KEYS[id]) return KEYS[id].name;
  return String(id || 'something').replace(/_/g, ' ');
}
const isRealItem = (id) => !!itemDef(id);

// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
// the ledger — what has already been taken, and what is in the pocket
// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
const LED = { taken: {}, searched: {}, keys: {}, seeds: {}, opened: 0, found: 0, gold: 0, socks: 0 };
const fresh = () => { LED.taken = {}; LED.searched = {}; LED.keys = {}; LED.seeds = {}; LED.opened = 0; LED.found = 0; LED.gold = 0; LED.socks = 0; };
const keyOf = (mapId, id) => `${mapId}:${id}`;

// The purse and the bag belong to P14's Roster (the one party, the one bag). It is imported lazily so a map load
// never waits on the battle module; anything found before it arrives is owed and paid the moment it does.
let ROSTER = null, START_BATTLE = null;
const owed = { gold: 0, items: {} };
function loadRoster() {
  return import('../battle/scene.js').then((m) => {
    ROSTER = m.Roster || null; START_BATTLE = m.startBattle || null;
    if (ROSTER) {
      if (owed.gold) { ROSTER.gold = Math.max(0, Math.round((ROSTER.gold || 0) + owed.gold)); owed.gold = 0; }
      for (const [id, n] of Object.entries(owed.items)) { ROSTER.bag = ROSTER.bag || {}; ROSTER.bag[id] = (ROSTER.bag[id] || 0) + n; }
      owed.items = {};
    }
    return ROSTER;
  }, (e) => { reportError('treasure: the bag (src/battle/scene.js) did not load', e); return null; });
}
function giveGold(n) {
  const v = Math.max(0, Math.round(+n || 0));
  if (!v) return 0;
  LED.gold += v;
  if (ROSTER) ROSTER.gold = Math.max(0, Math.round((ROSTER.gold || 0) + v)); else owed.gold += v;
  return v;
}
/** A seed is eaten where it is found and never goes in the bag: it makes the boy permanently bigger inside. */
const SEEDS = {
  seed_of_life: { stat: 'hp', by: 3, ledger: 'life', say: '%HERO% eats it.{n}There is a little more room in\nhim than there was.' },
  seed_of_strength: { stat: 'str', by: 1, ledger: 'strength', say: '%HERO% eats it.{n}Something in his arms decides\nto stay on.' },
  seed_of_swiftness: { stat: 'agi', by: 1, ledger: 'swiftness', say: '%HERO% eats it.{n}His feet have opinions now.' },
  seed_of_wisdom: { stat: 'wis', by: 1, ledger: 'wisdom', say: '%HERO% eats it.{n}He understands one more thing\nthan he did. He cannot say which.' },
};
function eatSeed(id) {
  const s = SEEDS[id];
  if (!s) return null;
  LED.seeds[s.ledger] = (LED.seeds[s.ledger] || 0) + 1;
  // the bonus rides on the member itself, so it saves with the party (P19's growth.js has no permanent hook yet —
  // see the gap filed against P19: statsFor() should add member.seed[stat] on top of the level curve)
  safe('seed', () => {
    const m = ROSTER && ROSTER.ensure && ROSTER.ensure()[0];
    if (!m) return;
    m.seed = m.seed || {};
    m.seed[s.stat] = (m.seed[s.stat] || 0) + s.by;
    if (s.stat === 'hp') { m.seedHp = (m.seedHp || 0) + s.by; if (Number.isFinite(+m.hp)) m.hp = +m.hp + s.by; }
  });
  return s;
}

/**
 * CANON §6: eleven socks are hidden in searchable containers up and down the world, and all eleven make
 * The Sock of Considerable Power. A sock is not an item in the bag — it is a tally, `secret.socks`.
 */
const SOCK_TOTAL = 11;
let FLAGS = null;
safe('flags', () => import('../story/flags.js').then((m) => { FLAGS = (m && (m.Flags || m.default)) || null; }, () => {}));
function takeSock() {
  LED.socks = Math.min(SOCK_TOTAL, (LED.socks || 0) + 1);
  safe('sock flag', () => { if (FLAGS && FLAGS.set) FLAGS.set('secret.socks', LED.socks); });
  if (LED.socks >= SOCK_TOTAL) giveItem('sock_of_considerable_power');
  return LED.socks;
}
function sockPages() {
  const n = LED.socks;
  if (n >= SOCK_TOTAL) {
    return ['%HERO% has got the eleventh {gold}sock{/gold}.'.replace('%HERO%', HERO),
      'Eleven socks. Put together they\nare {gold}The Sock of Considerable\nPower{/gold}, and nobody is to laugh.'];
  }
  return ['%HERO% has got a {gold}sock{/gold}.{n}That is %N% of eleven.'.replace('%HERO%', HERO).replace('%N%', String(n))];
}

function giveItem(id) {
  if (!id) return null;
  if (KEYS[id]) { LED.keys[id] = (LED.keys[id] || 0) + 1; return id; }
  if (SEEDS[id]) { eatSeed(id); return id; }
  if (isRealItem(id)) {
    if (ROSTER) { ROSTER.bag = ROSTER.bag || {}; ROSTER.bag[id] = (ROSTER.bag[id] || 0) + 1; }
    else owed.items[id] = (owed.items[id] || 0) + 1;
  }
  return id;
}
const hasKey = (id) => (LED.keys[id] || 0) > 0;

// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
// art: one chest, with a lid that really opens
// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
const mat = (key, build) => Assets.material('treasure:' + key, build);
const MATS = () => ({
  wood: mat('wood', () => makeToon({ color: C3(PAL.wood.mid) }, 'wood')),
  lid: mat('lid', () => makeToon({ color: C3(PAL.wood.light) }, 'wood')),
  iron: mat('iron', () => makeToon({ color: C3(PAL.paint.iron) }, 'paint')),
  gold: mat('gold', () => makeToon({ color: C3(PAL.paint.gold) }, 'paint')),
  dark: mat('dark', () => new THREE.MeshBasicMaterial({ color: C3(PAL.shadow.contact) })),
  leaf: mat('leaf', () => makeToon({ color: C3(PAL.foliage.light) }, 'canopy')),
  steel: mat('steel', () => makeToon({ color: C3(PAL.stone.light) }, 'stone')),
  cloth: mat('cloth', () => makeToon({ color: C3(PAL.cloth.red) }, 'default')),
});

/** The soft round glint behind a found thing (and the sparkles that fly off it). */
function glintTexture() {
  return Assets.texture('treasure:glint', () => {
    const S = 128, c = mkCanvas(S, S), g = ctx2(c);
    const grad = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.28, 'rgba(255,240,200,0.85)');
    grad.addColorStop(0.62, 'rgba(255,205,90,0.28)');
    grad.addColorStop(1, 'rgba(255,205,90,0)');
    g.fillStyle = grad; g.fillRect(0, 0, S, S);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.needsUpdate = true;
    return t;
  });
}

function chestMesh({ w = 0.86, h = 0.5, d = 0.58 } = {}) {
  const M = MATS();
  const root = new THREE.Group();
  const body = new THREE.Group(); root.add(body);
  const box = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), M.wood);
  box.position.y = h / 2; box.castShadow = true; box.receiveShadow = true;
  withOutline(box, OUTLINE.prop);
  body.add(box);
  // the dark mouth, just under the rim: only ever seen once the lid is back
  const mouth = new THREE.Mesh(new THREE.BoxGeometry(w - 0.12, 0.02, d - 0.12), M.dark);
  mouth.position.y = h - 0.015; body.add(mouth);
  for (const sx of [-1, 1]) {
    const strap = new THREE.Mesh(new THREE.BoxGeometry(0.075, h + 0.012, d + 0.014), M.iron);
    strap.position.set(sx * (w / 2 - 0.13), h / 2, 0); body.add(strap);
  }
  // the lid, hinged along the back edge
  const hinge = new THREE.Group(); hinge.position.set(0, h, -d / 2); root.add(hinge);
  const lid = new THREE.Mesh(new THREE.BoxGeometry(w, 0.13, d), M.lid);
  lid.position.set(0, 0.065, d / 2); lid.castShadow = true;
  withOutline(lid, OUTLINE.prop * 0.8);
  hinge.add(lid);
  for (const sx of [-1, 1]) {
    const s = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.15, d + 0.014), M.iron);
    s.position.set(sx * (w / 2 - 0.13), 0.065, d / 2); hinge.add(s);
  }
  const clasp = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 0.08), M.gold);
  clasp.position.set(0, 0.02, d - 0.01); hinge.add(clasp);
  const lock = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.16, 0.07), M.gold);
  lock.position.set(0, h - 0.08, d / 2 + 0.01); body.add(lock);
  // it must MEET the ground, not sit on top of it
  safe('contact shadow', () => { const sh = makeContactShadow(Math.max(w, d) * 1.35, { opacity: 0.5 }); root.add(sh); });
  return { root, hinge, height: h };
}

/** A little emblem of whatever was inside, to hold up in the light. */
function prizeMesh(kind) {
  const M = MATS();
  const g = new THREE.Group();
  if (kind === 'gold') {
    for (let i = 0; i < 3; i++) {
      const c = new THREE.Mesh(new THREE.CylinderGeometry(0.11 - i * 0.012, 0.11 - i * 0.012, 0.035, 14), M.gold);
      c.position.set((i - 1) * 0.02, i * 0.04, 0); c.rotation.z = (i - 1) * 0.12; g.add(c);
    }
  } else if (kind === 'key') {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.075, 0.022, 8, 16), M.gold); ring.position.y = 0.09; g.add(ring);
    const shaft = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.2, 0.03), M.gold); shaft.position.y = -0.03; g.add(shaft);
    const bit = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.035, 0.03), M.gold); bit.position.set(0.04, -0.1, 0); g.add(bit);
  } else if (kind === 'herb') {
    for (const sx of [-1, 1]) {
      const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.075, 10, 8), M.leaf);
      leaf.scale.set(1, 0.42, 0.62); leaf.position.set(sx * 0.06, 0.05, 0); leaf.rotation.z = sx * 0.6; g.add(leaf);
    }
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.18, 6), M.wood); stem.position.y = -0.05; g.add(stem);
  } else if (kind === 'weapon') {
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.32, 0.018), M.steel); blade.position.y = 0.08; g.add(blade);
    const guard = new THREE.Mesh(new THREE.BoxGeometry(0.19, 0.035, 0.035), M.gold); guard.position.y = -0.09; g.add(guard);
    const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.024, 0.12, 8), M.wood); grip.position.y = -0.16; g.add(grip);
  } else if (kind === 'seed') {
    const s = new THREE.Mesh(new THREE.SphereGeometry(0.1, 12, 10), M.leaf); s.scale.set(0.8, 1.05, 0.8); g.add(s);
    const sprout = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), M.gold); sprout.scale.set(1, 0.4, 0.6); sprout.position.y = 0.11; g.add(sprout);
  } else {                                                          // a wrapped bundle: armour, a hat, anything else
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.19, 0.15, 0.15), M.cloth); g.add(b);
    const tie = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.03, 0.16), M.gold); g.add(tie);
  }
  g.traverse((o) => { if (o.isMesh) o.castShadow = false; });
  return g;
}

const prizeKindOf = (entry) => {
  if (entry.gold) return 'gold';
  const id = entry.item;
  if (!id) return 'bundle';
  if (KEYS[id]) return 'key';
  if (id === 'seed_of_life') return 'seed';
  const it = itemDef(id);
  if (it && it.kind === 'consumable') return 'herb';
  if (it && it.kind === 'weapon') return 'weapon';
  if (it && (it.kind === 'key' || it.key)) return 'key';
  return 'bundle';
};

// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
// the live map
// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
const L = {
  booted: false, map: null, scene: null, group: null,
  chests: [],            // [{def, root, hinge, open, k, glint}]
  searchList: [],        // [{id, prop, entry}] the map's own props this layer made searchable
  fx: [],                // things rising out of a chest
  tasks: [],             // [{at, fn}]
  t: 0, busy: false, searchCount: 0,
};

const SEARCHES = { puddlewick: pwSearches || [], hollybank: hbSearches || [], puddlewick_inn: innSearches || [] };
const REWARDS = { puddlewick: pwRewards || {}, hollybank: hbRewards || {}, puddlewick_inn: innRewards || {} };

const wait = (sec, fn) => L.tasks.push({ at: L.t + sec, fn });

// ── words ────────────────────────────────────────────────────────────────────────────────────────────────────
const pagesOf = (v) => (v == null ? [] : [].concat(v));
function talk(pages, opts = {}) {
  const list = pagesOf(pages).filter(Boolean);
  if (!list.length) return false;
  return Field.talk(Object.assign({ pages: list, voice: 'narrator', name: null }, opts));
}

/**
 * The words for a container that has nothing (left) in it. Its own lines come first — twice, because they are
 * good lines and a child looks twice — and after that the discovery voice's own list for that kind of container
 * (docs/VOICE-BIBLE §3 / strings.js `container`), walked in order so the same pot never repeats itself.
 */
function emptyLine(entry, n) {
  const own = pagesOf(entry.text).filter(Boolean);
  if (own.length && n < 2) return own;
  return [container(entry.kind || 'generic', Math.max(0, n - (own.length ? 2 : 0)), { HERO })];
}

// ── the ceremony ─────────────────────────────────────────────────────────────────────────────────────────────
/**
 * How gold is announced. VOICE-BIBLE §3 no.13 ("found in a boot") is the line for a container that has nothing
 * of its own to say — but it contradicted itself when the page before had just described where the money was
 * (a purse under a footbridge, a cloth under the apples). So: a container with its own written find keeps its
 * own words and gets a plain count, walked in order so no two finds in a row phrase it the same way.
 */
let goldTurn = 0;
const GOLD_LINES = [
  '{gold}%N% gold coins{/gold} go into\nthe purse.',
  '{gold}%N% gold coins{/gold}. The purse is\nheavier, and says so.',
  '%HERO% pockets {gold}%N% gold coins{/gold}.',
  '{gold}%N% gold coins{/gold}, counted twice,\nbecause counting is the best part.',
  '{gold}%N% gold coins{/gold}. He does not\nsay where from.',
];
function goldPage(entry, inChest) {
  const n = entry.gold;
  if (inChest) return str('chest.gold', { N: n });
  const own = pagesOf(entry.found).concat(pagesOf(entry.text)).filter(Boolean).length;
  if (!own) return str('gold.found', { N: n });
  return GOLD_LINES[(goldTurn++) % GOLD_LINES.length].replace(/%N%/g, String(n)).replace(/%HERO%/g, HERO);
}

function rewardPages(entry, inChest = false) {
  const out = [];
  if (entry.gold) out.push(goldPage(entry, inChest));
  if (entry.sock) out.push(...sockPages());
  if (entry.item) {
    const nm = '{gold}' + itemName(entry.item) + '{/gold}';
    out.push(str(KEYS[entry.item] ? 'item.get.key' : 'item.get', { HERO, ITEM: nm }));
    if (SEEDS[entry.item]) out.push(SEEDS[entry.item].say.replace(/%HERO%/g, HERO));
  }
  if (entry.after) out.push(...pagesOf(entry.after));
  return out;
}

/**
 * The moment (DQV-RUBRIC "CEREMONY"): the fanfare lifts, the boy turns to the thing and throws the prize up over
 * his head (P08's `celebrate` clip is exactly that pose), and the camera steps in a step for the beat and comes
 * back. Every part is guarded: a missing stinger, a placeholder hero or a torn-down map can never stop a find.
 */
function celebrate(entry) {
  safe('fanfare', () => import('../audio/music.js').then((m) => {
    const M = m && (m.Music || m.default);
    if (M && typeof M.stinger === 'function') M.stinger('item_get');
  }, () => {}));
  safe('held aloft', () => {
    const w = Field.world();
    const pl = w && w.player;
    if (!pl) return;
    if (Number.isFinite(+entry.x) && Number.isFinite(+entry.z) && pl.faceToward) pl.faceToward(+entry.x, +entry.z);
    const h = pl.hero;
    if (h && h.character && typeof h.character.play === 'function') h.character.play('celebrate');
    else if (h && typeof h.nod === 'function') h.nod();
  });
  safe('camera beat', () => {
    const w = Field.world();
    const rig = w && w.cameraRig;
    if (!rig || typeof rig.zoom !== 'function') return;
    const d0 = +rig.zoom();
    if (!Number.isFinite(d0)) return;
    rig.zoom(Math.max(2.6, d0 - 0.95));
    wait(2.1, () => safe('camera home', () => rig.zoom(d0)));
  });
}

function grant(entry, id) {
  if (entry.gold) giveGold(entry.gold);
  if (entry.sock) takeSock();
  if (entry.item) giveItem(entry.item);
  LED.taken[id] = true; LED.found++;
  celebrate(entry);
  safe('bus', () => Bus.emit('treasure.found', { id, gold: entry.gold || 0, item: entry.item || null, sock: !!entry.sock }));
}

/** Confirm on a chest: the lid, the prize, the fanfare, the window — in that order, with a beat between each. */
function openChest(live, entry) {
  const id = keyOf(L.map ? L.map.id : '?', entry.id);
  if (L.busy) return;
  if (LED.taken[id]) { talk([str('chest.already')]); return; }
  if (entry.locked && !hasKey(entry.locked)) {
    safe('sfx', () => Sfx.play('door_locked'));
    talk([str('door.needkey')]);
    return;
  }
  L.busy = true;
  const run = () => {
    safe('sfx', () => Sfx.play('chest_open'));
    if (live) { live.open = true; live.opening = true; }
    LED.opened++;
    wait(0.42, () => {
      const kind = prizeKindOf(entry);
      spawnPrize(live, entry, kind);
      safe('sfx', () => Sfx.play(entry.gold ? 'gold_coins' : 'item_get'));
      grant(entry, id);
    });
    wait(0.95, () => {
      const head = entry.item
        ? [str('chest.open', { HERO, ITEM: '{gold}' + itemName(entry.item) + '{/gold}' })]
        : ['%HERO% opens the chest.'.replace('%HERO%', HERO)];
      const pages = head.concat(rewardPages(entry, true)).concat(pagesOf(entry.text));
      const ok = talk(pages, { name: entry.name || null, onClose: () => { L.busy = false; } });
      if (!ok) L.busy = false;
    });
  };
  if (entry.locked) {
    safe('sfx', () => Sfx.play('door_open'));
    talk([str('chest.unlock')], { onClose: run });
  } else run();
}

/** The Chestnut: a chest with teeth (MONSTER-BIBLE). It is a fight, not a find. */
function springMimic(live, entry) {
  const id = keyOf(L.map ? L.map.id : '?', entry.id);
  if (L.busy) return;
  L.busy = true;
  safe('sfx', () => Sfx.play('chest_open'));
  if (live) { live.open = true; live.opening = true; live.shake = 1; }
  LED.taken[id] = true;
  wait(0.3, () => {
    talk([
      'The lid comes up on its own.{wait:350}{n}That is not how lids work.',
      'The chest has teeth, and it has\nbeen waiting all morning to\nshow somebody.',
    ], { name: 'the chest', onClose: () => {
      L.busy = false;
      if (START_BATTLE) safe('mimic battle', () => START_BATTLE(['chestnut'], { area: 'long_lane' }));
      else talk(['It thinks better of it, and\ngoes back to being furniture.']);
    } });
  });
}

/** Confirm on a pot, a barrel, a drawer, a shelf, a well: one in four holds something, the rest earn a laugh. */
function search(entry, propText) {
  const id = keyOf(L.map ? L.map.id : '?', entry.id);
  if (L.busy) return;
  const n = LED.searched[id] = (LED.searched[id] || 0) + 1;
  const first = !LED.taken[id] && (entry.gold || entry.item || entry.sock);
  safe('sfx', () => Sfx.play('pot_search'));
  if (!first) {
    const pages = pagesOf(propText).concat(emptyLine(entry, n - 1));
    talk(pages.length ? pages : [str('search.nothing')], { name: entry.name || null });
    return;
  }
  L.busy = true;
  grant(entry, id);
  spawnPrize(null, entry, prizeKindOf(entry));
  safe('sfx', () => Sfx.play(entry.gold ? 'gold_coins' : 'item_get'));
  // the words of the find: prop line (if bolted), then the container's own setup prose, then `found`.
  // Dropping entry.text whenever found existed was P30 #4 — meadow_log_seed / bridge stone lost their setup.
  const head = pagesOf(propText).concat(pagesOf(entry.text)).concat(pagesOf(entry.found));
  const ok = talk(head.concat(rewardPages(entry, false)), { name: entry.name || null, onClose: () => { L.busy = false; } });
  if (!ok) L.busy = false;
}

/**
 * The prize, HELD ALOFT. Dragon Quest puts the thing you found in the hero's fist over his head, big enough to
 * read across the room — so it rises out of his hands, not out of the box: the lid is already open behind him and
 * a 20px emblem hiding inside it was the single least ceremonious frame in the game.
 */
function spawnPrize(live, entry, kind) {
  if (!L.scene) return;
  const at = live ? live.root.position : null;
  const p = Field.player();
  const hero = p && Number.isFinite(+p.x) && Number.isFinite(+p.z);
  const x = hero ? +p.x : (at ? at.x : (Number.isFinite(+entry.x) ? +entry.x : 0));
  const z = hero ? +p.z : (at ? at.z : (Number.isFinite(+entry.z) ? +entry.z : 0));
  const ground = L.map ? safe('walkY', () => L.map.walkY(x, z), 0) : 0;
  const y0 = hero ? (Number.isFinite(+p.y) ? +p.y : ground) + 1.66
    : (at ? at.y + live.height : (Number.isFinite(+entry.y) ? +entry.y : ground) + 0.72);
  const g = new THREE.Group();
  g.position.set(x, y0, z);
  const prize = prizeMesh(kind); g.add(prize);
  const glint = new THREE.Sprite(new THREE.SpriteMaterial({ map: glintTexture(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
  glint.scale.set(1.5, 1.5, 1); glint.renderOrder = 40; g.add(glint);
  const sparks = [];
  for (let i = 0; i < 12; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glintTexture(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
    const a = (i / 12) * Math.PI * 2;
    s.userData.v = new THREE.Vector3(Math.cos(a) * 0.62, 0.7 + (i % 3) * 0.18, Math.sin(a) * 0.62);
    s.scale.setScalar(0.2); s.renderOrder = 41; g.add(s); sparks.push(s);
  }
  L.scene.add(g);
  L.fx.push({ g, prize, glint, sparks, t: 0, life: 2.6, y0 });
}

// ── per-frame ────────────────────────────────────────────────────────────────────────────────────────────────
function tick(dt, t) {
  L.t += dt;
  // a ceremony can never wedge the world: if something ate the window, the chests unlock themselves
  if (L.busy) { L.busyT = (L.busyT || 0) + dt; if (L.busyT > 12) { L.busy = false; L.busyT = 0; } } else L.busyT = 0;
  for (let i = L.tasks.length - 1; i >= 0; i--) {
    if (L.t >= L.tasks[i].at) { const task = L.tasks.splice(i, 1)[0]; safe('task', task.fn); }
  }
  for (const c of L.chests) {
    const want = c.open ? 1 : 0;
    c.k += (want - c.k) * clamp(dt * 7.5, 0, 1);
    if (c.hinge) c.hinge.rotation.x = -c.k * 2.32;
    if (c.shake > 0) { c.shake = Math.max(0, c.shake - dt * 2.2); c.root.position.y = c.baseY + Math.sin(t * 48) * 0.03 * c.shake; }
    if (c.glint) {
      const on = !LED.taken[keyOf(L.map ? L.map.id : '?', c.def.id)] && !c.open;
      c.glint.visible = on;
      if (on) { const p = 0.5 + 0.5 * Math.sin(t * 2.4); c.glint.scale.setScalar(0.3 + p * 0.22); c.glint.material.opacity = 0.35 + p * 0.45; }
    }
  }
  for (let i = L.fx.length - 1; i >= 0; i--) {
    const f = L.fx[i];
    f.t += dt;
    const k = clamp(f.t / 0.55, 0, 1), ease = 1 - (1 - k) * (1 - k);
    f.g.position.y = f.y0 + 0.14 + ease * 0.5;
    f.prize.rotation.y += dt * 3.4;
    f.prize.scale.setScalar(0.7 + ease * 1.95);                 // big enough to read across the room
    const fade = clamp((f.life - f.t) / 0.6, 0, 1);
    f.glint.material.opacity = (0.22 + 0.3 * Math.sin(f.t * 6)) * fade;
    f.glint.scale.setScalar((1.25 + ease * 0.85) * fade);
    for (const s of f.sparks) {
      s.position.addScaledVector(s.userData.v, dt * 0.9);
      s.userData.v.y -= dt * 1.5;
      s.material.opacity = fade * 0.7;
      s.scale.setScalar(0.2 * fade);
    }
    if (f.t >= f.life) { safe('fx dispose', () => { f.g.removeFromParent(); Assets.disposeObject(f.g); }); L.fx.splice(i, 1); }
  }
}

// ── building a map's treasure ────────────────────────────────────────────────────────────────────────────────
/**
 * Nudge a chest to the nearest spot a boy can stand beside, so nothing is ever sunk in a wall or a hedge.
 * The clearance asked for (0.9) is deliberately wider than the collider the chest then adds (CHEST_R = 0.36 —
 * plus the player's own 0.35 that is 0.71), so a chest can never wall up a gap a child was meant to walk through.
 */
const CHEST_R = 0.36;
function placeable(map, x, z, clearance = 0.9) {
  if (map.clear(x, z, clearance)) return { x, z };
  for (let ring = 1; ring <= 4; ring++) {
    const d = ring * 0.35;
    for (let a = 0; a < 12; a++) {
      const th = (a / 12) * Math.PI * 2, qx = x + Math.cos(th) * d, qz = z + Math.sin(th) * d;
      if (map.clear(qx, qz, clearance)) return { x: qx, z: qz };
    }
  }
  return null;
}

function onLoad({ map, scene }) {
  L.map = map; L.scene = scene; L.chests = []; L.fx = []; L.tasks = []; L.busy = false; L.searchable = 0; L.searchList = [];
  const group = new THREE.Group(); group.name = 'treasure';
  L.group = group; scene.add(group);

  // 1. rewards the layer declares for chest entries the BASE map owns (P23's file stays untouched)
  const rew = REWARDS[map.id] || {};
  for (const c of map.chests) if (rew[c.id]) Object.assign(c, rew[c.id]);

  // 2. every chest entry becomes something you can really open
  L.unplaced = [];
  for (const def of map.chests) {
    const kind = def.kind || 'chest';
    const box = kind === 'chest' && def.art !== false;
    let live = null;
    if (box) {
      // `ax/az` pin the art to a spot the map already keeps clear for a chest (the loft in Hollybank); everything
      // else is nudged to the nearest place a boy can stand beside, so nothing is ever sunk in a wall or a hedge.
      const pinned = def.ax != null && def.az != null;
      const spot = pinned ? { x: def.ax, z: def.az } : placeable(map, def.x, def.z);
      if (!spot) L.unplaced.push(def.id);
      else {
        const y = def.y != null ? def.y : map.walkY(spot.x, spot.z);
        const m = chestMesh(def.size || {});
        m.root.position.set(spot.x, y, spot.z);
        m.root.rotation.y = def.rot || 0;
        group.add(m.root);
        const glint = new THREE.Sprite(new THREE.SpriteMaterial({ map: glintTexture(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
        glint.position.set(spot.x, y + m.height + 0.34, spot.z); glint.scale.setScalar(0.4); glint.renderOrder = 38;
        group.add(glint);
        live = { def, root: m.root, hinge: m.hinge, height: m.height, open: false, k: 0, shake: 0, baseY: y, glint };
        L.chests.push(live);
        if (!pinned) {
          safe('collider', () => map.addCollider({ type: 'circle', x: spot.x, z: spot.z, r: CHEST_R, tag: 'chest' }));
          def.x = spot.x; def.z = spot.z;                       // the prompt and the reach follow the chest
          def.promptY = y + m.height + 0.85;
        } else def.promptY = y + m.height + 0.85;
        if (LED.taken[keyOf(map.id, def.id)]) { live.open = true; live.k = 1; m.hinge.rotation.x = -2.32; }
      }
    }
    def.reach = def.reach || (box ? 1.8 : 1.6);
    if (def.mimic) def.talk = (() => { const l = live; return () => springMimic(l, def); })();
    else if (kind === 'chest') def.talk = (() => { const l = live; return () => openChest(l, def); })();
    else def.talk = () => search(def, null);
  }

  // 3. things the map ALREADY draws — a well, a barrel, a dresser, the kegs — become searchable in place
  for (const s of (SEARCHES[map.id] || [])) {
    const p = map.props.find((q) => (s.name ? q.name === s.name : false) || (s.at && q.type === s.type && Math.hypot(q.x - s.at[0], q.z - s.at[1]) < 0.9));
    if (!p) continue;
    const entry = Object.assign({ x: p.x, z: p.z, id: s.id, kind: s.kind || p.type, name: p.name }, s);
    const propText = p.text;
    p.talk = () => { search(entry, propText); };
    p.reach = p.reach || 1.9;
    L.searchList.push({ id: entry.id, prop: p, entry });
    L.searchable = (L.searchable || 0) + 1;
  }
}

function onUnload() {
  L.chests = []; L.fx = []; L.tasks = []; L.busy = false; L.map = null; L.scene = null; L.group = null; L.searchable = 0; L.searchList = [];
}

// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
// boot
// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
const holdsOf = (c) => (c.gold ? c.gold + 'G' : (c.item || (c.sock ? 'sock' : null)));
function describe() {
  const mapId = L.map ? L.map.id : null;
  const row = (c, from) => ({ id: c.id, kind: c.kind || 'chest', from, x: Math.round(c.x * 10) / 10, z: Math.round(c.z * 10) / 10,
    holds: holdsOf(c), locked: c.locked || null, mimic: !!c.mimic, taken: !!LED.taken[keyOf(mapId, c.id)] });
  const list = L.map ? L.map.chests.map((c) => row(c, 'chests')) : [];
  // props the map already draws that this layer made searchable are containers too — a critic counting what a
  // child can rummage in must see them in the same list, or the count is wrong by a well and three barrels.
  const bolted = (L.searchList || []).map((s) => row(Object.assign({}, s.entry, { x: s.prop.x, z: s.prop.z }), 'prop'));
  const here = list.concat(bolted);
  return { map: mapId, containers: here.length, chests: list.length, boxes: L.chests.length, searchable: L.searchable || 0,
    holding: here.filter((c) => c.holds).length, unplaced: (L.unplaced || []).slice(),
    opened: LED.opened, found: LED.found, gold: LED.gold, socks: LED.socks || 0,
    keys: Object.keys(LED.keys), seeds: Object.assign({}, LED.seeds), busy: L.busy, here };
}

export const Treasure = {
  /** Register every map's treasure layer and the ceremony. Safe to call as often as you like. */
  boot(extra = {}) {
    // extras always merge, booted or not: a map layer that loads later than the ignition must still be able to
    // hand over its `searches` / `rewards` tables
    if (extra.searches) Object.assign(SEARCHES, extra.searches);
    if (extra.rewards) Object.assign(REWARDS, extra.rewards);
    if (L.booted) return Treasure;
    L.booted = true;
    // maps/index.js (P23) only lists a chests layer for the meadow; the rest are registered here
    safe('layers', () => {
      Maps.addLayer('puddlewick', 'chests', pwLayer);
      Maps.addLayer('hollybank', 'chests', hbLayer);
      Maps.addLayer('puddlewick_inn', 'chests', innLayer);
    });
    safe('field hooks', () => {
      Field.on('load', onLoad);
      Field.on('unload', onUnload);
      Field.on('render', (alpha, dt, t) => { if (dt > 0) tick(Math.min(0.1, dt), t); });
    });
    safe('save', () => Save.register('treasure', {
      save: () => ({ taken: LED.taken, searched: LED.searched, keys: LED.keys, seeds: LED.seeds, opened: LED.opened, found: LED.found, gold: LED.gold, socks: LED.socks }),
      load: (v) => {
        fresh();
        if (!v || typeof v !== 'object') return;
        LED.taken = Object.assign({}, v.taken || {}); LED.searched = Object.assign({}, v.searched || {});
        LED.keys = Object.assign({}, v.keys || {}); LED.seeds = Object.assign({}, v.seeds || {});
        LED.opened = +v.opened || 0; LED.found = +v.found || 0; LED.gold = +v.gold || 0; LED.socks = +v.socks || 0;
        safe('sock flag', () => { if (FLAGS && FLAGS.set && LED.socks) FLAGS.set('secret.socks', LED.socks); });
      },
      summary: () => ({ found: LED.found }),
      reset: () => fresh(),
    }));
    safe('debug', () => {
      Debug.provide('treasure', describe);
      Debug.expose('treasure', describe);
      Debug.expose('openNear', () => {
        const p = Field.player(); const m = L.map;
        if (!p || !m) return { ok: false, reason: 'the field is not loaded' };
        const yaw = ((p.facingTarget ?? p.facing ?? 0)) * DEG;
        const hit = m.nearestInteractable(p.x, p.z, Math.sin(yaw), Math.cos(yaw), 2.4);
        if (!hit || typeof hit.target.talk !== 'function') return { ok: false, reason: 'nothing within reach' };
        hit.target.talk({ field: Field, map: m });
        return { ok: true, target: hit.target.name || hit.target.id || hit.target.type };
      });
      Debug.expose('treasureGive', (id) => { giveItem(id); return { keys: Object.keys(LED.keys) }; });
      Debug.expose('treasureReset', () => { fresh(); return describe(); });
      /** Open / search a named thing on this map without walking to it (scenarios, critics). */
      Debug.expose('treasureOpen', (id) => {
        const m = L.map; if (!m) return { ok: false, reason: 'no map' };
        const sl = (L.searchList || []).find((q) => q.id === id);
        const c = m.chests.find((q) => q.id === id) || (sl && sl.prop) || m.props.find((q) => q.name === id);
        if (!c || typeof c.talk !== 'function') {
          return { ok: false, reason: `no treasure "${id}" here`,
            has: m.chests.map((q) => q.id).concat((L.searchList || []).map((q) => q.id)) };
        }
        c.talk({ field: Field, map: m });
        return { ok: true, id };
      });
    });
    loadRoster();
    return Treasure;
  },
  /** The plugin form (demos/P30.html, and main.js if it ever adds this file to PLUGINS). */
  install(ctx = {}) { Treasure.boot(ctx.treasure || {}); return Treasure; },
  state: describe,
  ledger: () => Object.assign({}, LED),
  KEYS,
};

export function install(ctx) { return Treasure.install(ctx); }
export default Treasure;
