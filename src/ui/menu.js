/**
 * menu.js — the Dragon Quest field command menu.                            (P13, owner: src/ui/menu.js)
 *
 * Press Menu (Tab / C / Start / the touch ☰) on the field and the command window unrolls at the top left, with
 * the party window beside it and the gold window under it — then everything else nests off that one window:
 *
 *   Talk     closes the menu and talks to whatever the hero faces (ctx.talk)
 *   Spells   whose magic → which spell (MP, one plain line of what it does) → who to cast it on
 *   Status   one page per character: a little 3D portrait, level, EXP to the next one, every stat, kit and spells
 *   Items    the bag AND each person's pockets → Use / Hand over / Equip / Throw away
 *   Equip    five slots, every thing that fits, and what each one does to your numbers (▲ green / ▼ red)
 *   Tactics  how each friend fights when you are not telling them (DATA-SHAPES §5 `tactic`)
 *   Search   closes the menu and searches the ground at his feet (ctx.search)
 *   Misc     how fast the words come, bigger words, music, sounds, touch buttons, and the tale's secret code
 *
 * Every window can be left with Cancel, one window at a time; Menu closes the lot. ONE press of Confirm always
 * advances — nothing ever needs two. Nothing traps you.
 *
 * ONE PARTY, ONE BAG. There is no second copy of the party here. `Roster` in src/battle/scene.js (P14) holds the
 * family, the wagon, the gold and the bag and saves them through the F5 keys; the menu reads and writes THAT, so
 * the sword you put on Bram is the sword he swings in the next fight, and a herb you hand to Bobble is gone from
 * the bag. Items and spells come from the same tables the battle runs on (tests/battle/data.js — docs/DATA-SHAPES
 * calls it "a working, complete example of every shape"); `Menu.useData({items, spells})` swaps in
 * src/data/items.js and src/data/spells.js the day P21 and P20 land. Stats, learnsets, EXP and level caps are
 * src/data/growth.js (P19); Attack and Defence come out of src/battle/formulas.js `derive` (P14/P19).
 * What the menu adds of its own: POCKETS (what each person carries, kept on the member so it saves with them).
 *
 * __DQ: state().menu = {open, stage, path, windows, party, gold, bag, pockets, settings, portrait};
 *       extras __DQ.menuOpen(), __DQ.menuPick('items'), __DQ.menuChoose('m-bag','herb'), __DQ.menuWindows(),
 *       __DQ.menuPath(), __DQ.pocket('hero','herb',2). Party and gold themselves belong to P14's __DQ hooks.
 *
 * PLUGIN: main.js imports this file once and calls install(ctx), so it is live in /index.html with no shared-file
 * edit.
 */
import * as THREE from 'three';
import { UI, h } from './window.js';
import { MessageBox } from './text.js';
import { Text } from './text.js';
import { Scenes } from '../engine/states.js';
import { Debug, reportError } from '../engine/debug.js';
import { Bus } from '../engine/events.js';
import { Save } from '../engine/save.js';
import { Roster } from '../battle/scene.js';
import DATA from '../../tests/battle/data.js';
import { Input } from '../engine/input.js';
import { Audio } from '../audio/audio.js';
import { Sfx } from '../audio/sfx.js';
import { Chars } from '../art/chars.js';
import { Monsters } from '../art/monsters.js';
import { PAL, C3 } from '../art/palette.js';
import { derive } from '../battle/formulas.js';
import {
  CHARACTERS, PERSONALITIES,
  statsFor, spellsKnownAt, learnsetFor, mpOverrides, capFor, expForLevel, expToNext,
} from '../data/growth.js';

// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
// THE TABLES — CANON §6 items and CANON §7 spells, in the docs/DATA-SHAPES §3/§4 shape.
// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
/**
 * The item and spell tables. docs/DATA-SHAPES calls tests/battle/data.js "a working, complete example of every
 * shape" and the battle scene (P14) already runs on it, so the menu reads the SAME tables: what a herb does in a
 * fight is what it does here. `Menu.useData({items, spells})` swaps in src/data/items.js and spells.js the day
 * P21 and P20 land.
 */
/** A one-line, child-sized description for the things the tables do not describe themselves. */
const ITEM_WORDS = {
  herb: 'A green leaf that stops a graze stinging.',
  strong_herb: 'A fatter leaf. Stops rather more stinging.',
  fresh_herb: 'Picked this morning, somewhere kinder than here.',
  nutcake: 'Tastes of nuts. Puts a little magic back.',
  honeycake: 'Tastes of honey. Puts a lot of magic back.',
  antidote_drop: 'One drop, and the green goes out of you.',
  wake_me_up: 'Smells like a shout.',
  angels_kiss: 'Wakes a friend who has run right out of standing up.',
  sunbottle: 'A summer afternoon, corked.',
  retreat_bell: 'Ring it and you are outside, blinking.',
  homing_feather: 'Blow it and the wind takes you to a church.',
  whiff_powder: 'Monsters sneeze and decide to be elsewhere.',
  seed_of_life: 'Eat it and you are a little harder to knock over, for ever.',
  pot_lid: 'It was a pot lid this morning. Now it is a shield.',
  straw_hat: 'Keeps the sun off. Keeps almost nothing else off.',
  wayfarers_clothes: 'Clothes for walking a long way in.',
  cypress_stick: 'A stick. A good one, but a stick.',
};

export const SLOT_LIST = [
  ['weapon', 'Weapon'], ['armour', 'Armour'], ['shield', 'Shield'], ['helm', 'Hat'], ['accessory', 'Trinket'],
];

/** DQV Tactics (DATA-SHAPES §5), in words a six-year-old can choose between. */
export const TACTICS = [
  ['orders', 'Follow my orders', 'I say what they do, every turn.'],
  ['wisely', 'Fight wisely', 'Picks sensibly. Heals when somebody is hurt.'],
  ['no_mercy', 'Give it everything', 'Hits as hard as it can, and never mind the magic.'],
  ['watch_back', 'Watch our backs', 'Keeps everybody standing before anything else.'],
  ['no_magic', 'No magic, thank you', 'Saves its magic for when you ask.'],
];

// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
// THE ROSTER — the party, the bag, the pockets, the gold and the settings the menu reads and writes.
// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
const POCKET_MAX = 12;
const BAG_MAX = 64;

let ITEMS = (DATA && DATA.items) || {};
let SPELLS = (DATA && DATA.spells) || {};
function stampIds() {
  for (const [k, v] of Object.entries(ITEMS)) if (v && v.id == null) v.id = k;
  for (const [k, v] of Object.entries(SPELLS)) if (v && v.id == null) v.id = k;
}
stampIds();

const item = (id) => (id && ITEMS[id]) || null;
const spell = (id) => (id && SPELLS[id]) || null;
const itemName = (id) => (item(id) ? item(id).name : String(id || '\u2014'));
const isKey = (it) => !!(it && (it.kind === 'key' || it.key || it.noSell));
const fieldSpell = (sp) => !!(sp && (sp.field === true || sp.school === 'field'));

/**
 * THE ONE PARTY. `Roster` in src/battle/scene.js (P14) already holds the family, the wagon, the gold and the bag,
 * saves them through the F5 keys and publishes them in __DQ.state().party / .gold. The menu does not keep a second
 * copy of any of that: it reads and writes that roster, so what you equip is what walks into the next fight.
 */
function frontParty() { try { return Roster.ensure() || []; } catch (e) { reportError('menu roster', e); return []; } }
function allMembers() { return frontParty().concat(Array.isArray(Roster.wagon) ? Roster.wagon : []); }
const findMember = (id) => allMembers().find(m => m.id === id) || null;

/** The shared bag is a {id: count} map on the roster; the menu shows it as an ordered list. */
function bagMap() { if (!Roster.bag || typeof Roster.bag !== 'object') Roster.bag = {}; return Roster.bag; }
function bagItems() { return Object.entries(bagMap()).filter(([, n]) => n > 0).map(([id, n]) => ({ id, n })); }
function bagCount(id) { return bagMap()[id] || 0; }
function bagAdd(id, n = 1) {
  if (!item(id)) return 0;
  const m = bagMap();
  if (!m[id] && Object.keys(m).length >= BAG_MAX) return 0;
  m[id] = (m[id] || 0) + n;
  return n;
}
function bagTake(id, n = 1) {
  const m = bagMap();
  const took = Math.min(n, m[id] || 0);
  if (!took) return 0;
  m[id] -= took;
  if (m[id] <= 0) delete m[id];
  return took;
}

/** Pockets: what one person carries. DQV's per-character bag; kept on the member, so it saves with the party. */
function pocketsOf(m) { if (!Array.isArray(m.pockets)) m.pockets = []; return m.pockets; }
function countIn(list, id) { const e = list.find(x => x.id === id); return e ? e.n : 0; }
function addTo(list, id, n = 1, max = BAG_MAX) {
  if (!item(id)) return 0;
  const e = list.find(x => x.id === id);
  if (e) { e.n += n; return n; }
  if (list.length >= max) return 0;
  list.push({ id, n });
  return n;
}
function takeFrom(list, id, n = 1) {
  const i = list.findIndex(x => x.id === id);
  if (i < 0) return 0;
  const e = list[i];
  const took = Math.min(n, e.n);
  e.n -= took;
  if (e.n <= 0) list.splice(i, 1);
  return took;
}

/** Every place a thing can be: the shared bag first, then each person's pockets. */
function containers() {
  const out = [{
    key: 'bag', label: 'The bag', member: null, max: BAG_MAX,
    items: bagItems, size: () => bagItems().length, count: bagCount, add: bagAdd, take: bagTake,
  }];
  for (const m of allMembers()) {
    out.push({
      key: m.id, label: m.name + '\u2019s pockets', member: m, max: POCKET_MAX,
      items: () => pocketsOf(m).map(e => ({ id: e.id, n: e.n })),
      size: () => pocketsOf(m).length,
      count: (id) => countIn(pocketsOf(m), id),
      add: (id, n = 1) => addTo(pocketsOf(m), id, n, POCKET_MAX),
      take: (id, n = 1) => takeFrom(pocketsOf(m), id, n),
    });
  }
  return out;
}

/** Everything the party owns that can be worn, wherever it is. */
function ownedEquipment() {
  const out = new Map();
  for (const c of containers()) {
    for (const e of c.items()) {
      const it = item(e.id);
      if (!it || !it.slot) continue;
      const row = out.get(e.id) || { id: e.id, n: 0 };
      row.n += e.n;
      out.set(e.id, row);
    }
  }
  return Array.from(out.values());
}
function fits(it, m) {
  if (!it || !it.slot || !m) return false;
  if (m.kind !== 'family') return false;                  // guests and monsters fight with what they have
  if (it.who === 'anyone' || it.who == null) return true;
  return [].concat(it.who).includes(m.charId || m.id);
}

function gearOf(m) {
  const g = { power: 0, def: 0, mdef: 0, agi: 0, wis: 0, luck: 0, resil: 0, maxHp: 0, maxMp: 0 };
  if (!m) return g;
  if (m.gear) Object.assign(g, m.gear);                          // guests walk in with a fixed kit
  for (const [slot] of SLOT_LIST) {
    const it = item(m.equip && m.equip[slot]);
    if (!it) continue;
    for (const k of Object.keys(g)) if (Number.isFinite(+it[k])) g[k] += +it[k];
  }
  return g;
}
function maxOf(m) {
  try { return derive(statsFor(m), gearOf(m)); }
  catch (e) { reportError('menu stats', e); return { maxHp: 1, maxMp: 0, atk: 0, def: 0, mag: 0, mdef: 0, spd: 1, luck: 0 }; }
}
const alive = (m) => m && m.hp > 0;
const clampHp = (m) => { const mx = maxOf(m); m.hp = Math.max(0, Math.min(mx.maxHp, m.hp)); m.mp = Math.max(0, Math.min(mx.maxMp, m.mp)); };

const SETTINGS = { speed: 35, scale: 1, music: 0.75, sfx: 0.9, touch: 'auto' };
const SETTINGS_KEY = 'dqv.settings';

// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
// SETTINGS — read once at install, applied to the live systems, written back on every change.
// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
function loadSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) Object.assign(SETTINGS, JSON.parse(raw) || {});
  } catch (_) { /* private mode: the defaults are fine */ }
}
function saveSettings() {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(SETTINGS)); } catch (_) {}
}
function applySettings() {
  try { Text.setSpeed(SETTINGS.speed); } catch (e) { reportError('menu settings (speed)', e); }
  try { UI.setScale(SETTINGS.scale); } catch (e) { reportError('menu settings (scale)', e); }
  try { Audio.setVolume('music', SETTINGS.music); } catch (e) { reportError('menu settings (music)', e); }
  try { Audio.setVolume('sfx', SETTINGS.sfx); Audio.setVolume('ui', Math.min(1, SETTINGS.sfx * 0.95)); }
  catch (e) { reportError('menu settings (sfx)', e); }
  try { if (Input && typeof Input.setTouchMode === 'function') Input.setTouchMode(SETTINGS.touch); } catch (_) {}
}

const VOL_STEPS = [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1];
const nearestVol = (v) => VOL_STEPS.reduce((b, s, i) => (Math.abs(s - v) < Math.abs(VOL_STEPS[b] - v) ? i : b), 0);

const OPTIONS = {
  speed: { label: 'How fast the words come', values: [[22, 'Gentle'], [35, 'Normal'], [55, 'Quick'], [400, 'All at once']] },
  scale: { label: 'Bigger words', values: [[1, 'Normal'], [1.12, 'Bigger'], [1.26, 'Biggest']] },
  music: { label: 'Music', bar: true },
  sfx: { label: 'Sounds', bar: true },
  touch: { label: 'Touch buttons', values: [['auto', 'When needed'], ['on', 'Always'], ['off', 'Never']] },
};

/** Ten little blocks, the lit ones gold — a volume a child can read across a room. */
function volBar(n) {
  const wrap = h('span.dq-vol');
  for (let i = 0; i < 10; i++) wrap.appendChild(h('i.dq-volstep' + (i < n ? '.dq-on' : '')));
  return wrap;
}
function optionValue(key) {
  const o = OPTIONS[key];
  if (o.bar) return volBar(nearestVol(SETTINGS[key]));
  const v = o.values.find(([val]) => val === SETTINGS[key]) || o.values[0];
  return v[1];
}
function optionStep(key, dir) {
  const o = OPTIONS[key];
  if (o.bar) {
    const i = Math.max(0, Math.min(10, nearestVol(SETTINGS[key]) + dir));
    SETTINGS[key] = VOL_STEPS[i];
  } else {
    const vals = o.values.map(([v]) => v);
    let i = vals.indexOf(SETTINGS[key]);
    if (i < 0) i = 0;
    i = (i + dir + vals.length) % vals.length;
    SETTINGS[key] = vals[i];
  }
  applySettings();
  saveSettings();
  return optionValue(key);
}

// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
// LITTLE 3D PORTRAIT — one small renderer, built the first time Status opens, torn down when it closes.
// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
const PORTRAIT = { renderer: null, scene: null, camera: null, subject: null, t: 0, off: null, err: null, frames: 0 };

/**
 * Which body stands in the portrait frame. Monster friends have their own models (Bobble and Pip are named
 * species in src/art/monsters.js); the family that P07 has not built yet borrows the nearest honest look —
 * Rowan wears his father's cut-down cloak, so he borrows the boy; Linnet borrows Willow's plait and grazed knees.
 * NEEDS P07: real looks for rowan, linnet, elowen, bertie and grown Willow and Sera.
 */
const STANDIN = {
  willow_grown: { id: 'willow' }, willow_child: { id: 'willow' }, sera_child: { id: 'sera' },
  rowan: { id: 'hero', age: 6 }, linnet: { id: 'willow' }, elowen: { id: 'villager', variant: 'nun' },
  bertie: { id: 'villager', variant: 'guard' }, pru: { id: 'villager', variant: 'child' },
  quiddle: { id: 'villager', variant: 'merchant' },
};
function portraitLook(m) {
  if (!m) return null;
  const id = m.charId || m.id;
  if (m.kind === 'monster') {
    const key = Monsters.has(id) ? id : (Monsters.has(m.species) ? m.species : null);
    return key ? { kind: 'monster', species: key } : { kind: 'none', initial: (m.name || '?')[0] };
  }
  if (id === 'hero') return { kind: 'char', id: 'hero', age: 6 };
  if (Chars.list().includes(id)) return { kind: 'char', id };
  if (STANDIN[id]) return { kind: 'char', ...STANDIN[id] };
  return { kind: 'char', id: 'villager', variant: 'farmer' };
}

function portraitEl() {
  const box = h('div.dq-portrait');
  const canvas = document.createElement('canvas');
  canvas.className = 'dq-portrait-canvas';
  box.appendChild(canvas);
  return { box, canvas };
}

function portraitBuild(canvas) {
  if (PORTRAIT.renderer) return true;
  try {
    const dpr = Math.min(2, (typeof devicePixelRatio === 'number' ? devicePixelRatio : 1) || 1);
    const rend = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
    rend.setPixelRatio(dpr);
    rend.setSize(300, 360, false);
    rend.outputColorSpace = THREE.SRGBColorSpace;
    const scene = new THREE.Scene();
    scene.background = null;                                    // the window's own gradient shows through
    const hemi = new THREE.HemisphereLight(C3(PAL.sky.upper), C3(PAL.ui.winTop), 1.05);
    scene.add(hemi);
    const key = new THREE.DirectionalLight(0xfff0d8, 1.35);
    key.position.set(2.2, 3.4, 2.6);
    scene.add(key);
    const rim = new THREE.DirectionalLight(C3(PAL.sky.horizon), 0.55);
    rim.position.set(-2.4, 1.4, -2.0);
    scene.add(rim);
    const camera = new THREE.PerspectiveCamera(26, 300 / 360, 0.1, 40);
    PORTRAIT.renderer = rend; PORTRAIT.scene = scene; PORTRAIT.camera = camera; PORTRAIT.err = null;
    return true;
  } catch (e) {
    PORTRAIT.err = String(e && e.message || e);
    reportError('menu portrait', e);
    return false;
  }
}

function portraitShow(m) {
  if (!PORTRAIT.scene) return false;
  portraitClear();
  const look = portraitLook(m);
  if (!look || look.kind === 'none') return false;
  try {
    let subj = null;
    const monster = look.kind === 'monster';
    if (monster) {
      subj = Monsters.build(look.species);
      try { subj.play('idle'); } catch (_) {}
    } else {
      subj = Chars.build(look.id, { age: look.age, variant: look.variant });
      try { subj.play('idle'); } catch (_) {}
      try { subj.setFacing(0.42, true); } catch (_) {}
    }
    PORTRAIT.scene.add(subj.root);
    PORTRAIT.subject = subj;
    // frame from what is really there: a person from the waist up, a creature whole
    const box = new THREE.Box3().setFromObject(subj.root);
    const size = box.getSize(new THREE.Vector3());
    const H = Math.max(0.2, size.y || subj.height || 1.6);
    const W = Math.max(0.2, Math.max(size.x, size.z));
    const y0 = Number.isFinite(box.min.y) ? box.min.y : 0;
    const aimY = monster ? y0 + H * 0.52 : y0 + H * 0.74;
    const span = monster ? Math.max(H, W) * 1.25 : H * 0.62;      // how much of it the frame should hold
    const dist = (span / 2) / Math.tan((PORTRAIT.camera.fov * Math.PI / 180) / 2) * 1.12;
    PORTRAIT.camera.position.set(dist * 0.22, aimY + H * 0.06, dist);
    PORTRAIT.camera.lookAt(0, aimY, 0);
    PORTRAIT.aimY = aimY;
    PORTRAIT.t = 0;
    return true;
  } catch (e) { reportError('menu portrait show', e); return false; }
}

function portraitClear() {
  const s = PORTRAIT.subject;
  PORTRAIT.subject = null;
  if (!s) return;
  try { s.dispose(); } catch (e) { reportError('menu portrait dispose', e); }
}

function portraitTick(dt) {
  const p = PORTRAIT;
  if (!p.renderer || !p.subject) return;
  try {
    p.t += dt;
    if (p.subject.update) p.subject.update(dt);
    const sway = Math.sin(p.t * 0.55) * 0.14;
    p.subject.root.rotation.y = sway;
    p.renderer.render(p.scene, p.camera);
    p.frames++;
  } catch (e) { reportError('menu portrait tick', e); p.subject = null; }
}

function portraitDestroy() {
  portraitClear();
  if (PORTRAIT.off) { try { PORTRAIT.off(); } catch (_) {} PORTRAIT.off = null; }
  const r = PORTRAIT.renderer;
  PORTRAIT.renderer = null; PORTRAIT.scene = null; PORTRAIT.camera = null;
  if (!r) return;
  try { r.dispose(); r.forceContextLoss(); } catch (_) {}
}

// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
// content helpers
// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
const N = (v) => h('span.dq-num', String(v));
function statRow(label, value, cls = '') {
  return h('div.dq-row' + (cls ? '.' + cls : ''), [h('span.dq-grow', label), value instanceof Node ? value : N(value)]);
}
function hpText(m, withMax = true) {
  const mx = maxOf(m);
  const frac = mx.maxHp ? m.hp / mx.maxHp : 1;
  const cls = m.hp <= 0 ? 'dq-c-red' : frac <= 0.2 ? 'dq-c-red' : frac <= 0.45 ? 'dq-c-orange' : '';
  return h('span.dq-num' + (cls ? '.' + cls : ''), withMax ? `${m.hp}/${mx.maxHp}` : String(m.hp));
}
function mpText(m, withMax = true) {
  const mx = maxOf(m);
  return h('span.dq-num', withMax ? `${m.mp}/${mx.maxMp}` : String(m.mp));
}

const FRONT_MAX = 4;
/** The party window: one narrow column per member who walks, the one you are working on lit up. */
function partyCols(highlightId = null) {
  const cols = [];
  const all = allMembers();
  const front = all.slice(0, FRONT_MAX);
  front.forEach((m, i) => {
    if (i) cols.push(h('span.dq-vdiv'));
    const col = h('div.dq-col' + (m.id === highlightId ? '.dq-pick' : ''), [
      h('div.dq-pname', [m.name, m.kind === 'guest' ? h('span.dq-guest', 'guest') : null]),
      statRow(UI.label('HP'), hpText(m, false)),
      statRow(UI.label('MP'), mpText(m, false)),
      statRow(UI.label('Lv'), m.kind === 'guest' ? h('span.dq-num.dq-c-grey', '—') : N(m.lvl)),
    ]);
    cols.push(col);
  });
  if (!cols.length) cols.push(h('div.dq-col', h('div.dq-pname', 'Nobody at all')));
  const riding = all.slice(FRONT_MAX);
  if (riding.length) {
    cols.push(h('span.dq-vdiv'));
    cols.push(h('div.dq-col.dq-wagon', [
      h('div.dq-pname.dq-small', 'In the wagon'),
      ...riding.slice(0, 4).map(m => h('div.dq-note' + (m.id === highlightId ? '.dq-c-gold' : ''), m.name)),
      riding.length > 4 ? h('div.dq-note', `and ${riding.length - 4} more`) : null,
    ]));
  }
  return h('div.dq-cols', cols);
}

function goldContent() {
  return h('div.dq-goldrow', [h('span.dq-grow', UI.label('G')), h('span.dq-num.dq-c-gold', String(Roster.gold))]);
}

// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
// THE SCENE
// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
const TOP_IDS = ['m-cmd', 'm-party', 'm-gold'];
const CMD = [
  { id: 'talk', label: 'Talk' }, { id: 'items', label: 'Items' },
  { id: 'spells', label: 'Spells' }, { id: 'equip', label: 'Equip' },
  { id: 'status', label: 'Status' }, { id: 'tactics', label: 'Tactics' },
  { id: 'search', label: 'Search' }, { id: 'misc', label: 'Misc' },
];

function menuScene() {
  let gen = 0, ctx = {}, stage = 'closed', path = [], after = null, box = null;
  const owned = new Set();
  const live = (g) => g === gen && stage !== 'leaving';

  // ── window plumbing ───────────────────────────────────────────────────────────────────────────────────────
  function track(w) { owned.add(w); return w; }
  const mkWin = (o) => track(UI.window({ destroyOnClose: true, ...o }));
  const mkMenu = (o) => track(UI.menu({ destroyOnClose: true, ...o }));
  function closeWin(w) { if (w && !w.destroyed) { owned.delete(w); return w.close(); } return Promise.resolve(); }
  function killAll(instant = false) {
    const list = Array.from(owned);
    owned.clear();
    return Promise.all(list.map(w => (w && !w.destroyed ? w.close(instant ? { instant: true } : undefined) : null)))
      .catch((e) => reportError('menu close', e));
  }
  const at = (...p) => { path = p; stage = p[p.length - 1] || 'command'; };

  function msg() {
    if (!box || box.destroyed) box = new MessageBox({ id: 'm-say' });
    return box;
  }
  async function say(g, markup, o = {}) {
    try {
      await msg().say(markup, { voice: 'narrator', ...o });
      if (!live(g)) return false;
      await msg().close();
    } catch (e) { reportError('menu say', e); }
    return live(g);
  }

  // ── the three top windows ─────────────────────────────────────────────────────────────────────────────────
  let cmd = null, party = null, gold = null;
  function refreshTop(highlight = null) {
    try {
      if (party && !party.destroyed) party.setContent(partyCols(highlight));
      if (gold && !gold.destroyed) gold.setContent(goldContent());
    } catch (e) { reportError('menu refresh', e); }
  }

  async function openTop(g, initial) {
    cmd = mkMenu({
      id: 'm-cmd', left: 34, top: 30, columns: 2, colGap: 34, origin: '0% 0%', minWidth: 330,
      items: CMD, initial, destroyOnClose: false,
    });
    party = mkWin({ id: 'm-party', right: 26, top: 30, slim: true, origin: '100% 0%', className: 'dq-party',
      content: partyCols(), destroyOnClose: false });
    gold = mkWin({ id: 'm-gold', left: 34, top: 258, width: 250, slim: true, origin: '0% 0%',
      content: goldContent(), destroyOnClose: false });
    try { Sfx.play('map_open', { vol: 0.5 }); } catch (_) {}
    cmd.open(); await UI.wait(0.05); if (!live(g)) return false;
    party.open(); await UI.wait(0.04); if (!live(g)) return false;
    gold.open();
    return true;
  }

  // ── ITEMS ─────────────────────────────────────────────────────────────────────────────────────────────────
  function bagRows(c) {
    const rows = [];
    const entries = c.items();
    if (!entries.length) return [{ id: 'empty', label: 'Nothing at all', disabled: true, color: 'grey' }];
    for (const e of entries) {
      const it = item(e.id);
      if (!it) continue;
      const wornBy = allMembers().find(m => m.equip && Object.values(m.equip).includes(e.id));
      rows.push({
        id: e.id, label: it.name, data: e,
        right: it.slot ? (wornBy ? 'E' : '') : (e.n > 1 ? '×' + e.n : ''),
        color: isKey(it) ? 'gold' : undefined,
      });
    }
    return rows;
  }
  const itemWords = (it) => (it ? (it.blurb || ITEM_WORDS[it.id] || describeGear(it)) : '');
  function describeGear(it) {
    if (!it.slot) return 'Useful, one way or another.';
    const bits = [];
    if (it.power) bits.push(`+${it.power} Attack`);
    if (it.def) bits.push(`+${it.def} Defence`);
    if (it.mdef) bits.push(`+${it.mdef} against magic`);
    if (it.agi) bits.push(`${it.agi > 0 ? '+' : ''}${it.agi} Speed`);
    if (it.wis) bits.push(`+${it.wis} Wisdom`);
    if (it.luck) bits.push(`+${it.luck} Luck`);
    if (it.maxHp) bits.push(`+${it.maxHp} Max HP`);
    const who = it.who && it.who !== 'anyone' ? ` Only ${[].concat(it.who).map(id => (CHARACTERS[id] || { name: id }).name).join(' or ')} can hold it.` : '';
    return (bits.join(', ') || 'It is a thing you can wear.') + '.' + who;
  }

  async function flowItems(g) {
    at('command', 'items');
    let whoseIdx = 0;
    for (;;) {
      const cs = containers();
      const whose = mkMenu({
        id: 'm-whose', title: 'Whose?', left: 34, top: 360, width: 300, maxRows: 5, origin: '0% 0%', initial: whoseIdx,
        items: cs.map(c => ({ id: c.key, label: c.key === 'bag' ? 'The bag' : c.member.name, right: String(c.size()) })),
      });
      const pick = await whose.choose();
      if (!live(g)) return false;
      if (!pick) { await closeWin(whose); at('command'); return true; }
      whoseIdx = pick.index;
      const c = cs.find(x => x.key === pick.id);
      refreshTop(c.member ? c.member.id : null);
      const back = await flowBag(g, c, whose);
      if (!live(g)) return false;
      refreshTop(null);
      if (back === 'out') { await closeWin(whose); at('command'); return true; }
      await closeWin(whose);
    }
  }

  async function flowBag(g, c, whoseWin) {
    at('command', 'items', 'bag');
    const blurb = mkWin({ id: 'm-blurb', left: 348, bottom: 24, width: 890, slim: true, origin: '0% 100%',
      className: 'dq-blurb', content: ' ' });
    blurb.open();
    const setBlurb = (it) => { try { blurb.setContent(itemWords(it) || ' '); } catch (_) {} };
    const list = mkMenu({
      id: 'm-bag', title: c.key === 'bag' ? 'The bag' : c.member.name, left: 348, top: 360, width: 470, maxRows: 5,
      origin: '0% 0%', items: bagRows(c), onChange: (i) => setBlurb(item(i.id)),
    });
    setBlurb(item((c.items()[0] || {}).id));
    try {
      for (;;) {
        const chosen = await list.choose();
        if (!live(g)) return 'dead';
        if (!chosen) return 'back';
        const it = item(chosen.id);
        if (!it) continue;
        const done = await flowItemActions(g, c, it, list, setBlurb);
        if (!live(g)) return 'dead';
        if (done === 'out') return 'out';
        const now = c.items();
        list.setItems(bagRows(c), Math.min(chosen.index, Math.max(0, now.length - 1)));
        setBlurb(item((now[Math.min(chosen.index, now.length - 1)] || {}).id));
        refreshTop(c.member ? c.member.id : null);
      }
    } finally {
      await closeWin(list); await closeWin(blurb);
      void whoseWin;
    }
  }

  async function flowItemActions(g, c, it, listWin, setBlurb) {
    at('command', 'items', 'use');
    const canEquip = !!it.slot;
    const acts = mkMenu({
      id: 'm-itemact', left: 838, top: 360, slim: true, origin: '0% 0%', minWidth: 210,
      items: [
        { id: 'use', label: 'Use', disabled: !usable(it) },
        { id: 'equip', label: 'Wear it', disabled: !canEquip },
        { id: 'give', label: 'Hand over', disabled: containers().length < 2 },
        { id: 'toss', label: 'Throw away', disabled: isKey(it) },
      ],
      onDisabled: () => { try { setBlurb({ blurb: refuseWhy(it, c) }); } catch (_) {} },
    });
    try {
      for (;;) {
        const a = await acts.choose();
        if (!live(g)) return 'dead';
        if (!a) return 'back';
        if (a.id === 'use') { const r = await useItem(g, c, it); if (!live(g)) return 'dead'; if (r) return 'used'; continue; }
        if (a.id === 'equip') { const r = await equipFromBag(g, c, it); if (!live(g)) return 'dead'; if (r) return 'used'; continue; }
        if (a.id === 'give') { const r = await handOver(g, c, it); if (!live(g)) return 'dead'; if (r) return 'used'; continue; }
        if (a.id === 'toss') {
          const ask = mkMenu({ id: 'm-sure', left: 838, top: 520, origin: '0% 0%', slim: true, minWidth: 220,
            items: [{ id: 'yes', label: 'Throw it away' }, { id: 'no', label: 'Keep it' }], initial: 'no' });
          const pick = await ask.choose();
          await closeWin(ask);
          if (!live(g)) return 'dead';
          if (!pick || pick.id !== 'yes') continue;
          c.take(it.id, 1);
          await say(g, `${it.name} is put down gently in the grass,{n}and left behind.`);
          return 'used';
        }
      }
    } finally { await closeWin(acts); void listWin; }
  }

  const usable = (it) => !!(it.field !== false && (isKey(it) || it.blurb || (it.battle && ['heal', 'mp', 'cure', 'revive'].includes(it.battle.effect)) || it.kind === 'consumable'));
  function refuseWhy(it, c) {
    if (isKey(it)) return 'This one is too important to throw away.';
    if (!it.slot) return 'Nobody can wear that.';
    void c;
    return 'Not just now.';
  }

  /** Use an item out of battle. A refusal never costs you the item. */
  async function useItem(g, c, it) {
    const eff = it.battle && it.battle.effect;
    if (it.kind === 'key' || (!eff && !it.slot)) {
      const words = it.blurb || ITEM_WORDS[it.id] || 'Nothing happens, but it was nice to hold.';
      await say(g, `${heroName()} turns the ${it.name} over in his hands.{n}{grey}${words}{/grey}`);
      return true;
    }
    if (eff === 'heal' || eff === 'mp' || eff === 'cure' || eff === 'revive') {
      const target = await pickMember(g, 'On whom?', (m) => (eff === 'revive' ? !alive(m) : true));
      if (!live(g)) return false;
      if (!target) return false;
      const mx = maxOf(target);
      if (eff === 'heal') {
        if (target.hp >= mx.maxHp) { await say(g, `${target.name} is already {green}in the pink{/green}.{n}The ${it.name} goes back in.`); return false; }
        const amt = it.battle.amount === 'full' ? mx.maxHp : (it.battle.amount || 0);
        const before = target.hp;
        target.hp = Math.min(mx.maxHp, target.hp + amt);
        c.take(it.id, 1);
        try { Sfx.play('heal'); } catch (_) {}
        await say(g, `${target.name} eats the ${it.name}.{wait:250}{n}{green}+${target.hp - before}{/green} hit points.`);
        return true;
      }
      if (eff === 'mp') {
        if (target.mp >= mx.maxMp) { await say(g, `${target.name} has all the magic he can hold.`); return false; }
        const before = target.mp;
        target.mp = Math.min(mx.maxMp, target.mp + (it.battle.amount || 0));
        c.take(it.id, 1);
        try { Sfx.play('heal'); } catch (_) {}
        await say(g, `${target.name} eats the ${it.name}.{wait:250}{n}{blue}+${target.mp - before}{/blue} magic.`);
        return true;
      }
      if (eff === 'cure') {
        const has = (it.battle.statuses || []).some(s => target.status && target.status[s]);
        if (!has) { await say(g, `There is nothing wrong with ${target.name}{n}that a ${it.name} can put right.`); return false; }
        for (const s of it.battle.statuses) delete target.status[s];
        c.take(it.id, 1);
        await say(g, `${target.name} looks a great deal better.`);
        return true;
      }
      if (eff === 'revive') {
        if (alive(target)) { await say(g, `${target.name} is standing up perfectly well already.`); return false; }
        target.hp = Math.max(1, Math.round(mx.maxHp * (it.battle.pct || 0.5)));
        c.take(it.id, 1);
        await say(g, `${target.name} opens one eye.{wait:300}{n}{gold}"Was I asleep?"{/gold}`);
        return true;
      }
    }
    if (it.slot) return equipFromBag(g, c, it);
    await say(g, `Now is not the moment for the ${it.name}.`);
    return false;
  }

  async function handOver(g, from, it) {
    const others = containers().filter(c => c.key !== from.key);
    const to = mkMenu({ id: 'm-to', title: 'To whom?', left: 838, top: 520, origin: '0% 0%', minWidth: 240,
      items: others.map(c => ({ id: c.key, label: c.key === 'bag' ? 'The bag' : c.member.name, right: `${c.size()}/${c.max}` })) });
    try {
      const pick = await to.choose();
      if (!live(g) || !pick) return false;
      const dest = others.find(c => c.key === pick.id);
      if (dest.size() >= dest.max && !dest.count(it.id)) {
        await say(g, `${dest.key === 'bag' ? 'The bag' : dest.member.name + '’s pockets'} could not hold one thing more.`);
        return false;
      }
      from.take(it.id, 1);
      dest.add(it.id, 1);
      try { Sfx.play('item_get', { vol: 0.7 }); } catch (_) {}
      await say(g, `${it.name} goes to ${dest.key === 'bag' ? 'the bag' : dest.member.name}.`);
      return true;
    } finally { await closeWin(to); }
  }

  async function equipFromBag(g, c, it) {
    const who = allMembers().filter(m => fits(it, m));
    if (!who.length) {
      await say(g, `Nobody here can hold the ${it.name}.{n}{grey}${describeGear(it)}{/grey}`);
      return false;
    }
    const m = who.length === 1 ? who[0] : await pickMember(g, 'Who wears it?', (x) => fits(it, x));
    if (!live(g) || !m) return false;
    const slot = it.slot;
    const old = m.equip[slot];
    m.equip[slot] = it.id;
    c.take(it.id, 1);
    if (old) bagAdd(old, 1);
    clampHp(m);
    try { Sfx.play('confirm'); } catch (_) {}
    await say(g, `${m.name} puts on the {gold}${it.name}{/gold}.` + (old ? `{n}The ${itemName(old)} goes back in the bag.` : ''));
    return true;
  }

  // ── EQUIP ─────────────────────────────────────────────────────────────────────────────────────────────────
  function kitRows(m) {
    return SLOT_LIST.map(([slot, label]) => ({
      id: slot, label, right: m.equip && m.equip[slot] ? itemName(m.equip[slot]) : '—',
      color: m.equip && m.equip[slot] ? undefined : 'grey',
    }));
  }
  function statPanel(m, cand, slot) {
    const now = maxOf(m);
    let next = now;
    if (cand !== undefined) {
      const ghost = { ...m, equip: { ...m.equip, [slot]: cand } };
      next = maxOf(ghost);
    }
    const ROWS = [['atk', 'Attack'], ['def', 'Defence'], ['mdef', 'Magic'], ['spd', 'Speed'],
      ['luck', 'Luck'], ['maxHp', 'Max HP'], ['maxMp', 'Max MP']];
    const rows = ROWS.map(([k, label]) => {
      const a = now[k] | 0, b = next[k] | 0;
      const d = b - a;
      const val = h('span.dq-num', String(a));
      const arrow = d === 0 ? null
        : h('span.dq-arrow.' + (d > 0 ? 'dq-c-green' : 'dq-c-red'), (d > 0 ? '▲ ' : '▼ ') + String(b));
      return h('div.dq-row', [h('span.dq-grow', label), val, arrow]);
    });
    return h('div', [h('div.dq-pname', m.name), ...rows]);
  }

  async function flowEquip(g, preset = null) {
    at('command', 'equip');
    for (;;) {
      const m = preset || await pickMember(g, 'Who?', (x) => x.kind === 'family');
      preset = null;
      if (!live(g)) return false;
      if (!m) { at('command'); return true; }
      refreshTop(m.id);
      const out = await equipOne(g, m);
      refreshTop(null);
      if (!live(g)) return false;
      if (out === 'out') { at('command'); return true; }
      if (allMembers().filter(x => x.kind === 'family').length <= 1) { at('command'); return true; }
    }
  }

  async function equipOne(g, m) {
    at('command', 'equip', 'slots');
    const slots = mkMenu({ id: 'm-slots', title: m.name, left: 34, top: 360, width: 524, fontSize: 27, origin: '0% 0%', items: kitRows(m) });
    const panel = mkWin({ id: 'm-stats', title: 'Numbers', left: 994, top: 360, width: 262, className: 'dq-numbers', origin: '0% 0%',
      content: statPanel(m, undefined, null) });
    panel.open();
    try {
      for (;;) {
        const s = await slots.choose();
        if (!live(g)) return 'dead';
        if (!s) return 'back';
        const slot = s.id;
        const cands = ownedEquipment(m.id).map(r => item(r.id)).filter(it => it && it.slot === slot && fits(it, m));
        const rows = [{ id: '__off', label: 'Take it off', disabled: !m.equip[slot] }]
          .concat(cands.map(it => ({
            id: it.id, label: it.name,
            note: m.equip[slot] === it.id ? 'worn' : undefined,
            right: it.slot === 'weapon' ? `+${it.power || 0}` : (it.def ? `+${it.def}` : ''),
          })));
        const list = mkMenu({
          id: 'm-kit', title: SLOT_LIST.find(x => x[0] === slot)[1], left: 576, top: 360, width: 400, maxRows: 5, fontSize: 26, origin: '0% 0%',
          items: rows,
          onChange: (i) => { try { panel.setContent(statPanel(m, i.id === '__off' ? null : i.id, slot)); } catch (_) {} },
        });
        const first = rows[1] || rows[0];
        try { panel.setContent(statPanel(m, first.id === '__off' ? null : first.id, slot)); } catch (_) {}
        const c = await list.choose(cands.length ? { initial: Math.min(1, rows.length - 1) } : {});
        if (!live(g)) { await closeWin(list); return 'dead'; }
        if (c) {
          const old = m.equip[slot];
          if (c.id === '__off') {
            if (old) { bagAdd(old, 1); delete m.equip[slot]; try { Sfx.play('cancel'); } catch (_) {} }
          } else if (old !== c.id) {
            const src = containers().find(x => x.count(c.id) > 0);
            if (src) src.take(c.id, 1);
            if (old) bagAdd(old, 1);
            m.equip[slot] = c.id;
            try { Sfx.play('confirm'); } catch (_) {}
          }
          clampHp(m);
          slots.setItems(kitRows(m), slot);
          refreshTop(m.id);
        }
        await closeWin(list);
        try { panel.setContent(statPanel(m, undefined, null)); } catch (_) {}
        if (!live(g)) return 'dead';
      }
    } finally { await closeWin(slots); await closeWin(panel); }
  }

  // ── SPELLS ────────────────────────────────────────────────────────────────────────────────────────────────
  function spellRows(m) {
    const known = spellsKnownAt(m).map(id => spell(id)).filter(Boolean);
    const mpo = mpOverrides(m);
    const field = known.filter(fieldSpell);
    if (!field.length) return { rows: [{ id: 'none', label: 'No magic out here yet', disabled: true, color: 'grey' }], mpo };
    return {
      rows: field.map(sp => ({ id: sp.id, label: sp.name, right: `${mpo[sp.id] ?? sp.mp} MP`,
        disabled: m.mp < (mpo[sp.id] ?? sp.mp) })), mpo,
    };
  }

  async function flowSpells(g) {
    at('command', 'spells');
    for (;;) {
      const m = await pickMember(g, 'Whose magic?', () => true);
      if (!live(g)) return false;
      if (!m) { at('command'); return true; }
      refreshTop(m.id);
      const out = await spellsOf(g, m);
      refreshTop(null);
      if (!live(g)) return false;
      if (out === 'out') { at('command'); return true; }
    }
  }

  async function spellsOf(g, m) {
    at('command', 'spells', 'list');
    const { rows, mpo } = spellRows(m);
    const blurb = mkWin({ id: 'm-blurb', left: 348, bottom: 24, width: 890, slim: true, origin: '0% 100%',
      className: 'dq-blurb', content: ' ' });
    blurb.open();
    const list = mkMenu({
      id: 'm-spells', title: m.name, left: 348, top: 360, width: 430, maxRows: 5, origin: '0% 0%', items: rows,
      onChange: (i) => { const sp = spell(i.id); try { blurb.setContent(sp ? `${sp.name} — ${sp.blurb || 'a spell.'}` : ' '); } catch (_) {} },
      onDisabled: (i) => { const sp = spell(i.id); try { blurb.setContent(sp ? `${m.name} hasn’t the magic left for ${sp.name}.` : ' '); } catch (_) {} },
    });
    const first = spell(rows[0].id);
    try { blurb.setContent(first ? `${first.name} — ${first.blurb || 'a spell.'}` : 'Magic comes later. It always does.'); } catch (_) {}
    try {
      for (;;) {
        const s = await list.choose();
        if (!live(g)) return 'dead';
        if (!s) return 'back';
        const sp = spell(s.id);
        if (!sp) continue;
        await castField(g, m, sp, mpo[sp.id] ?? sp.mp);
        if (!live(g)) return 'dead';
        const r = spellRows(m);
        list.setItems(r.rows, Math.min(s.index, r.rows.length - 1));
        refreshTop(m.id);
      }
    } finally { await closeWin(list); await closeWin(blurb); }
  }

  async function castField(g, caster, sp, cost) {
    if (caster.mp < cost) { await say(g, `${caster.name} hasn’t the magic left for {gold}${sp.name}{/gold}.`); return; }
    const wis = statsFor(caster).wis;
    const spend = () => { caster.mp = Math.max(0, caster.mp - cost); try { Sfx.play('spell_cast'); } catch (_) {} };
    if (sp.kind === 'heal' || sp.kind === 'fullheal' || sp.kind === 'cure' || sp.kind === 'revive') {
      const target = await pickMember(g, 'On whom?', (m) => (sp.kind === 'revive' ? !alive(m) : true));
      if (!live(g) || !target) return;
      const mx = maxOf(target);
      if (sp.kind === 'heal' || sp.kind === 'fullheal') {
        if (target.hp >= mx.maxHp) { await say(g, `${target.name} is already {green}in the pink{/green}.{n}The spell stays where it is.`); return; }
        const amt = sp.kind === 'fullheal' ? mx.maxHp : Math.round((sp.base || 0) + (sp.k || 0) * wis);
        const before = target.hp;
        target.hp = Math.min(mx.maxHp, target.hp + amt);
        spend();
        try { Sfx.play('heal'); } catch (_) {}
        await say(g, `${caster.name} casts {gold}${sp.name}{/gold}.{wait:280}{n}${target.name} is {green}+${target.hp - before}{/green} better.`);
        return;
      }
      if (sp.kind === 'cure') {
        const has = (sp.cures || []).some(s2 => target.status && target.status[s2]);
        if (!has) { await say(g, `There is nothing wrong with ${target.name}{n}that ${sp.name} could put right.`); return; }
        for (const s2 of sp.cures) delete target.status[s2];
        spend();
        await say(g, `${caster.name} casts {gold}${sp.name}{/gold}.{n}${target.name} stops looking green.`);
        return;
      }
      if (sp.kind === 'revive') {
        if (alive(target)) { await say(g, `${target.name} is up and about already.`); return; }
        target.hp = Math.max(1, Math.round(mx.maxHp * (sp.pct || 0.5)));
        spend();
        await say(g, `${caster.name} casts {gold}${sp.name}{/gold}.{wait:300}{n}${target.name} sits up, cross about something.`);
        return;
      }
    }
    if (sp.kind === 'healAll') {
      const hurt = allMembers().filter(m => alive(m) && m.hp < maxOf(m).maxHp);
      if (!hurt.length) { await say(g, 'Everybody is {green}in the pink{/green} already.'); return; }
      const amt = Math.round((sp.base || 0) + (sp.k || 0) * wis);
      for (const m of hurt) { m.hp = Math.min(maxOf(m).maxHp, m.hp + amt); }
      spend();
      try { Sfx.play('heal'); } catch (_) {}
      await say(g, `${caster.name} casts {gold}${sp.name}{/gold}.{wait:280}{n}Everybody feels {green}a great deal better{/green}.`);
      return;
    }
    // the field-only ones
    const LINES = {
      lanternlight: 'A small warm light settles over the party{n}like a hand on your shoulder.',
      sniff: 'Nothing buried anywhere near here.{n}{grey}Somebody has been before you.{/grey}',
      whistle_down: 'A low whistle goes out over the grass.{n}{grey}The monsters keep their heads down for a while.{/grey}',
      homeward: 'There is no church to fly home to yet.{n}{grey}The spell waits, politely.{/grey}',
    };
    if (sp.id === 'homeward') { await say(g, LINES.homeward); return; }      // refused: costs nothing
    spend();
    await say(g, `${caster.name} casts {gold}${sp.name}{/gold}.{wait:280}{n}` + (LINES[sp.id] || 'Something happens, quietly.'));
  }

  // ── STATUS ────────────────────────────────────────────────────────────────────────────────────────────────
  function statusContent(m, canvasHost) {
    const st = statsFor(m);
    const mx = maxOf(m);
    const guest = m.kind === 'guest';
    const cap = capFor(m);
    const toNext = guest ? 0 : expToNext(m.lvl, m.exp ?? expForLevel(m.lvl));
    const pers = PERSONALITIES[(CHARACTERS[m.charId || m.id] || {}).growth] || null;
    const kind = m.kind === 'monster' ? 'a friend from the wild'
      : guest ? 'walking with you for now'
        : (pers ? pers.name : 'one of the family');
    const look = portraitLook(m);
    if (canvasHost && canvasHost.classList) canvasHost.classList.toggle('dq-nobody', !look || look.kind === 'none');
    if (canvasHost) canvasHost.dataset.initial = (m.name || '?')[0];
    const left = h('div.dq-col.dq-statleft', [
      canvasHost,
      h('div.dq-pname.dq-big', m.name),
      h('div.dq-note.dq-center', kind),
    ]);
    const known = spellsKnownAt(m).map(id => spell(id)).filter(Boolean);
    const nextSpell = guest ? null : (learnsetFor(m).find(([, l]) => l > m.lvl) || null);
    const mid = h('div.dq-col', [
      statRow('Level', guest ? h('span.dq-num.dq-c-grey', '—') : N(`${m.lvl}${m.lvl >= cap ? ' (top)' : ''}`)),
      statRow('Hit points', hpText(m)),
      statRow('Magic points', mpText(m)),
      UI.divider(),
      statRow('Might', st.might),
      statRow('Nimbleness', st.nimble),
      statRow('Resilience', st.resil),
      statRow('Wisdom', st.wis),
      statRow('Luck', st.luck),
      UI.divider(),
      statRow('Attack', mx.atk),
      statRow('Defence', mx.def),
    ]);
    const family = m.kind === 'family';
    const kitRowsOut = family
      ? SLOT_LIST.map(([slot, label]) =>
        statRow(label, h('span.dq-num' + (m.equip && m.equip[slot] ? '' : '.dq-c-grey'),
          m.equip && m.equip[slot] ? itemName(m.equip[slot]) : '\u2014')))
      : [h('div.dq-note', m.kind === 'monster'
        ? 'Fights with teeth, shell and strong opinions.'
        : 'Walked in with his own kit, and will not be talked out of it.'),
      statRow('Attack from it', gearOf(m).power || 0),
      statRow('Guard from it', gearOf(m).def || 0)];
    const right = h('div.dq-col', [
      h('div.dq-header', family ? 'Wearing' : 'Kit'),
      ...kitRowsOut,
      UI.divider(),
      h('div.dq-header', 'Magic'),
      known.length
        ? h('div.dq-spelllist', known.map(sp => h('div.dq-row', [h('span.dq-grow', sp.name), h('span.dq-num.dq-c-blue', `${sp.mp}`)])))
        : h('div.dq-note', guest ? 'Keeps his own counsel.' : 'None yet.'),
      nextSpell ? h('div.dq-note', `${(spell(nextSpell[0]) || { name: nextSpell[0] }).name} at level ${nextSpell[1]}.`) : null,
      UI.divider(),
      statRow('Next level', guest ? h('span.dq-num.dq-c-grey', '—') : N(toNext ? `${toNext} EXP` : 'the very top')),
      statRow('In a fight', h('span.dq-num.dq-c-gold', (TACTICS.find(t => t[0] === (m.tactic || 'wisely')) || TACTICS[1])[1])),
    ]);
    const foot = h('div.dq-statfoot', allMembers().length > 1
      ? '\u25c0 \u25b6 somebody else   \u00b7   Cancel to go back'
      : 'Cancel to go back');
    return h('div', [h('div.dq-cols', [left, h('span.dq-vdiv'), mid, h('span.dq-vdiv'), right]), foot]);
  }

  async function flowStatus(g, startId = null) {
    at('command', 'status');
    const who = allMembers();
    let i = Math.max(0, who.findIndex(m => m.id === startId));
    const { box: pbox, canvas } = portraitEl();
    const ok = portraitBuild(canvas);
    if (ok && !PORTRAIT.off) PORTRAIT.off = UI.onUpdate((dt) => portraitTick(dt));
    const win = mkWin({
      id: 'm-status', title: 'Status', left: 70, top: 120, width: 1140, origin: '50% 0%', className: 'dq-status',
      content: statusContent(who[i], pbox),
    });
    const show = () => {
      const m = who[i];
      if (ok) portraitShow(m);
      try { win.setContent(statusContent(m, pbox)); } catch (e) { reportError('menu status', e); }
      refreshTop(m.id);
    };
    show();
    try {
      for (;;) {
        const btn = await win.untilButton(['confirm', 'cancel', 'left', 'right']);
        if (!live(g)) return false;
        if (btn === 'cancel' || btn === 'confirm' || btn == null) break;
        const d = btn === 'right' ? 1 : -1;
        if (who.length > 1) { i = (i + d + who.length) % who.length; show(); }
      }
    } finally {
      await closeWin(win);
      portraitClear();
      refreshTop(null);
    }
    at('command');
    return live(g);
  }

  // ── TACTICS ───────────────────────────────────────────────────────────────────────────────────────────────
  const tacticLabel = (t) => (TACTICS.find(x => x[0] === t) || TACTICS[1])[1];
  function tacticRows() {
    return allMembers().map(m => ({
      id: m.id, label: m.name, right: m.id === leaderId() ? 'gives the orders' : tacticLabel(m.tactic || 'wisely'),
      disabled: m.id === leaderId(), color: m.id === leaderId() ? 'grey' : undefined,
    }));
  }
  const leaderId = () => {
    const fam = frontParty().find(m => m.kind === 'family');
    return fam ? fam.id : (frontParty()[0] ? frontParty()[0].id : null);
  };

  async function flowTactics(g) {
    at('command', 'tactics');
    const blurb = mkWin({ id: 'm-blurb', left: 348, bottom: 24, width: 890, slim: true, origin: '0% 100%',
      className: 'dq-blurb', content: 'Bram always takes your orders. The others can think for themselves.' });
    blurb.open();
    const who = mkMenu({ id: 'm-tacwho', title: 'How we fight', left: 34, top: 360, width: 460, origin: '0% 0%',
      items: tacticRows(),
      onDisabled: () => { try { blurb.setContent('Bram does exactly what you say. That is what being the hero is.'); } catch (_) {} } });
    try {
      for (;;) {
        const m0 = await who.choose();
        if (!live(g)) return false;
        if (!m0) { at('command'); return true; }
        const m = findMember(m0.id);
        if (!m) continue;
        refreshTop(m.id);
        const list = mkMenu({ id: 'm-tac', title: m.name, left: 520, top: 360, width: 430, origin: '0% 0%',
          items: TACTICS.filter(([t]) => t !== 'orders' || m.id === leaderId()).map(([t, label]) => ({ id: t, label })),
          initial: m.tactic || 'wisely',
          onChange: (i) => { const row = TACTICS.find(x => x[0] === i.id); try { blurb.setContent(row ? row[2] : ' '); } catch (_) {} } });
        const row0 = TACTICS.find(x => x[0] === (m.tactic || 'wisely'));
        try { blurb.setContent(row0 ? row0[2] : ' '); } catch (_) {}
        const t = await list.choose();
        await closeWin(list);
        refreshTop(null);
        if (!live(g)) return false;
        if (t) {
          m.tactic = t.id;
          who.setItems(tacticRows(), m.id);
          try { blurb.setContent(`${m.name}: ${tacticLabel(m.tactic)}.`); } catch (_) {}
        }
      }
    } finally { await closeWin(who); await closeWin(blurb); }
  }

  // ── MISC (settings + the escape hatch) ────────────────────────────────────────────────────────────────────
  function miscRows() {
    return [
      { id: 'speed', label: OPTIONS.speed.label, right: optionValue('speed') },
      { id: 'scale', label: OPTIONS.scale.label, right: optionValue('scale') },
      { id: 'music', label: OPTIONS.music.label, right: optionValue('music') },
      { id: 'sfx', label: OPTIONS.sfx.label, right: optionValue('sfx') },
      { id: 'touch', label: OPTIONS.touch.label, right: optionValue('touch') },
      '-',
      { id: 'code', label: 'The tale’s secret code', color: 'gold' },
    ];
  }

  async function flowMisc(g) {
    at('command', 'misc');
    const blurb = mkWin({ id: 'm-blurb', left: 348, bottom: 24, width: 890, slim: true, origin: '0% 100%',
      className: 'dq-blurb', content: 'Left and right change a setting. Confirm tries the next one.' });
    blurb.open();
    const list = mkMenu({
      id: 'm-misc', title: 'Misc', left: 348, top: 360, width: 600, origin: '0% 0%', items: miscRows(),
      onChange: (i) => { try { blurb.setContent(MISC_WORDS[i.id] || ' '); } catch (_) {} },
    });
    // left / right nudge the highlighted setting without leaving the row: one press, one change
    const tweak = (dir) => {
      const it = list.item;
      if (!it || !OPTIONS[it.id]) return false;
      optionStep(it.id, dir);
      list.setItems(miscRows(), it.index);
      try { UI.sound('cursor'); } catch (_) {}
      try { blurb.setContent(MISC_WORDS[it.id] || ' '); } catch (_) {}
      return true;
    };
    list.handle = (btn) => {
      if (btn === 'left' && tweak(-1)) return true;
      if (btn === 'right' && tweak(1)) return true;
      return UI.Menu.prototype.handle.call(list, btn);
    };
    try {
      for (;;) {
        const s = await list.choose();
        if (!live(g)) return false;
        if (!s) { at('command'); return true; }
        if (OPTIONS[s.id]) { tweak(1); continue; }                 // confirm = "show me the next one"
        if (s.id === 'code') { await flowCode(g); if (!live(g)) return false; }
      }
    } finally { await closeWin(list); await closeWin(blurb); }
  }

  const MISC_WORDS = {
    speed: 'How quickly the words appear when somebody talks.',
    scale: 'Makes every word in the game bigger.',
    music: 'How loud the music is.',
    sfx: 'How loud the clangs, blips and footsteps are.',
    touch: 'The buttons drawn on the screen for fingers.',
    code: 'A line of letters that holds your whole tale. Keep it somewhere safe.',
  };

  async function flowCode(g) {
    at('command', 'misc', 'code');
    const pick = mkMenu({ id: 'm-code', title: 'The secret code', left: 348, top: 550, width: 430, origin: '0% 0%',
      items: [{ id: 'copy', label: 'Copy the code' }, { id: 'paste', label: 'Paste a code in' }] });
    try {
      const c = await pick.choose();
      if (!live(g) || !c) return;
      const slot = (Save.lastSlot && Save.lastSlot()) || 'auto';
      if (c.id === 'copy') {
        let res = null;
        try { res = await Save.copyCode(slot); } catch (e) { reportError('menu copyCode', e); }
        if (!live(g)) return;
        if (res && res.ok && res.method !== 'manual') { await say(g, (Save.words && Save.words.exported) || 'The code is copied.'); return; }
        const code = (res && res.code) || (Save.exportCode(slot) || {}).code || '';
        await showCode(g, code);
        return;
      }
      let text = '';
      try { if (navigator.clipboard && navigator.clipboard.readText) text = await navigator.clipboard.readText(); } catch (_) { text = ''; }
      if (!live(g)) return;
      if (!text) { text = await askForCode(g); if (!live(g)) return; }
      if (!text) return;
      let r = null;
      try { r = Save.importCode(slot, text); } catch (e) { reportError('menu importCode', e); }
      await say(g, r && r.ok ? ((Save.words && Save.words.imported) || 'The code worked.')
        : ((Save.words && Save.words.badCode) || 'That code is muddled. Nothing was changed.'));
    } finally { await closeWin(pick); }
  }

  async function showCode(g, code) {
    const w = mkWin({ id: 'm-codebox', centerX: true, top: 200, width: 1000, origin: '50% 0%', className: 'dq-code',
      title: 'Your tale, in letters', content: h('div.dq-codetext', code || '(nothing written down yet)') });
    await w.untilButton(['confirm', 'cancel']);
    await closeWin(w);
    return live(g);
  }

  /** No clipboard? Then a real text box, with the game's own buttons held back while it has the keys. */
  function askForCode(g) {
    return new Promise((res) => {
      let done = false;
      const input = document.createElement('input');
      input.type = 'text';
      input.className = 'dq-codeinput';
      input.placeholder = 'paste the code here and press Enter';
      const w = mkWin({ id: 'm-paste', centerX: true, top: 240, width: 980, origin: '50% 0%', className: 'dq-code',
        title: 'Paste the code', interactive: true, content: input });
      const finish = (value) => {
        if (done) return;
        done = true;
        try { Input.block('menu.paste', false); } catch (_) {}
        closeWin(w);
        res(live(g) ? value : '');
      };
      input.addEventListener('keydown', (e) => {
        e.stopPropagation();
        if (e.key === 'Enter') finish(input.value.trim());
        if (e.key === 'Escape') finish('');
      });
      w.open().then(() => {
        try { Input.block('menu.paste', true); } catch (_) {}
        try { input.focus(); } catch (_) {}
      });
    });
  }

  // ── shared: "who?" ────────────────────────────────────────────────────────────────────────────────────────
  async function pickMember(g, title, filter = () => true) {
    const list = allMembers().filter(filter);
    if (!list.length) { await say(g, 'There is nobody here for that.'); return null; }
    if (list.length === 1) return list[0];
    const w = mkMenu({ id: 'm-who', title, left: 838, top: 520, origin: '0% 0%', minWidth: 250,
      items: list.map(m => ({ id: m.id, label: m.name, right: `${m.hp}/${maxOf(m).maxHp}` })),
      onChange: (i) => refreshTop(i.id) });
    refreshTop(list[0].id);
    const pick = await w.choose();
    await closeWin(w);
    refreshTop(null);
    if (!live(g)) return null;
    return pick ? findMember(pick.id) : null;
  }

  // ── the top loop ──────────────────────────────────────────────────────────────────────────────────────────
  function leave(then = null) {
    if (stage === 'leaving') return;
    stage = 'leaving';
    after = then;
    gen++;
    try { if (box && !box.destroyed) box.close({ instant: true }); } catch (_) {}
    killAll().then(() => { if (Scenes.top() === 'menu') Scenes.pop(); });
  }

  async function flow(g) {
    let initial = 'talk';
    if (!(await openTop(g, initial))) return;
    for (;;) {
      at('command');
      refreshTop(null);
      const it = await cmd.choose({ initial });
      if (!live(g)) return;
      if (!it) { leave(); return; }
      initial = it.id;
      if (it.id === 'talk') { leave(ctx.talk); return; }
      if (it.id === 'search') { leave(ctx.search); return; }
      try {
        if (it.id === 'items') { if (!(await flowItems(g))) return; }
        else if (it.id === 'equip') { if (!(await flowEquip(g))) return; }
        else if (it.id === 'spells') { if (!(await flowSpells(g))) return; }
        else if (it.id === 'status') { if (!(await flowStatus(g))) return; }
        else if (it.id === 'tactics') { if (!(await flowTactics(g))) return; }
        else if (it.id === 'misc') { if (!(await flowMisc(g))) return; }
      } catch (e) { reportError(`menu "${it.id}"`, e); at('command'); }
      if (!live(g)) return;
    }
  }

  const describe = () => ({
    open: stage !== 'closed',
    stage,
    path: path.slice(),
    windows: Array.from(owned).filter(w => w && !w.destroyed && w.state !== 'closed').map(w => w.id),
    party: allMembers().map(m => ({ id: m.id, name: m.name, lvl: m.lvl, hp: m.hp, maxHp: maxOf(m).maxHp, mp: m.mp, tactic: m.tactic })),
    gold: Roster.gold,
    bag: bagItems().map(e => `${itemName(e.id)}${e.n > 1 ? ' x' + e.n : ''}`),
    pockets: Object.fromEntries(allMembers().map(m => [m.id, pocketsOf(m).map(e => itemName(e.id))])),
    settings: { ...SETTINGS },
    portrait: PORTRAIT.renderer ? { live: !!PORTRAIT.subject, frames: PORTRAIT.frames, error: PORTRAIT.err } : null,
  });

  return {
    opaque: false,
    updateBelow: true,
    enter(c = {}) {
      ctx = c || {};
      after = null;
      stage = 'command';
      path = ['command'];
      const g = ++gen;
      Debug.provide('menu', describe);
      Bus.emit('menu.open', {});
      flow(g).catch((e) => reportError('menu flow', e));
    },
    exit() {
      gen++;
      stage = 'closed';
      path = [];
      for (const w of Array.from(owned)) { try { if (!w.destroyed) w.destroy(); } catch (e) { reportError('menu destroy', e); } }
      owned.clear();
      cmd = party = gold = null;
      portraitDestroy();
      try { if (box && !box.destroyed) box.destroy(); } catch (_) {}
      box = null;
      try { Input.block('menu.paste', false); } catch (_) {}
      Debug.provide('menu', () => closedState());
      Bus.emit('menu.close', {});
      const fn = after; after = null;
      if (typeof fn === 'function') { try { fn(); } catch (e) { reportError('menu after', e); } }
    },
    update() {},
    render() {},
    onInput(btn) {
      if (btn === 'menu') { leave(); return true; }
      if (UI.input(btn)) return true;
      return true;                     // modal: the field under the menu never sees a button
    },
  };
}

const closedState = () => ({
  open: false, stage: 'closed', path: [], windows: [],
  party: allMembers().map(m => ({ id: m.id, name: m.name, lvl: m.lvl, hp: m.hp, maxHp: maxOf(m).maxHp, mp: m.mp, tactic: m.tactic })),
  gold: Roster.gold,
  bag: bagItems().map(e => `${itemName(e.id)}${e.n > 1 ? ' x' + e.n : ''}`),
  pockets: Object.fromEntries(allMembers().map(m => [m.id, pocketsOf(m).map(e => itemName(e.id))])),
  settings: { ...SETTINGS },
});

const heroName = () => { const m = findMember('hero'); return m ? m.name : 'Bram'; };

// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
// the menu's own styles (the F4 window supplies everything else)
// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
const CSS = `
.dq-party .dq-cols > .dq-col{padding: 0 calc(12 * var(--u))}
.dq-party .dq-col{min-width: calc(132 * var(--u))}
.dq-guest{margin-left: calc(10 * var(--u)); font-size: .58em; letter-spacing:.1em; color: var(--dq-label);
  text-transform: uppercase; vertical-align: calc(2 * var(--u))}
.dq-party .dq-col.dq-pick .dq-pname{color: var(--dq-gold)}
.dq-party .dq-col.dq-pick{background: color-mix(in srgb, var(--dq-ink) 9%, transparent); border-radius: calc(9 * var(--u))}
.dq-goldrow{display:flex; align-items:baseline; gap: calc(12 * var(--u))}
.dq-win.dq-blurb{padding: calc(9 * var(--u)) calc(20 * var(--u)); font-size: calc(23 * var(--u)); color: var(--dq-ink);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis}
.dq-statfoot{margin-top: calc(10 * var(--u)); padding-top: calc(8 * var(--u)); text-align:center;
  font-size: calc(21 * var(--u)); color: var(--dq-label); border-top: calc(1.6 * var(--u)) solid var(--dq-hair)}
.dq-arrow{margin-left: calc(12 * var(--u)); font-size: .82em; font-variant-numeric: tabular-nums}
.dq-win.dq-numbers{font-size: calc(24 * var(--u))}
.dq-numbers .dq-row{min-height: calc(34 * var(--u)); line-height: calc(34 * var(--u))}
.dq-status .dq-col{padding: 0 calc(22 * var(--u))}
.dq-status .dq-row{min-height: calc(36 * var(--u))}
.dq-statleft{text-align:center; min-width: calc(262 * var(--u))}
.dq-party .dq-col.dq-wagon{min-width: calc(112 * var(--u))}
.dq-party .dq-col.dq-wagon .dq-note{display:block; font-size: calc(19 * var(--u)); line-height:1.35}
.dq-statleft .dq-pname{font-size: calc(36 * var(--u)); color: var(--dq-title-ink)}
.dq-center{text-align:center}
.dq-spelllist{max-height: calc(176 * var(--u)); overflow:hidden}
.dq-portrait{
  position:relative; width: calc(230 * var(--u)); height: calc(276 * var(--u)); margin: 0 auto calc(6 * var(--u));
  border-radius: calc(12 * var(--u));
  background: radial-gradient(120% 90% at 50% 18%, var(--dq-win-sheen), transparent 70%),
              linear-gradient(180deg, color-mix(in srgb, var(--pal-sky-horizon) 55%, transparent), transparent 78%);
  box-shadow: inset 0 0 0 calc(1.6 * var(--u)) var(--dq-hair);
  overflow:hidden;
}
.dq-portrait::after{
  content:""; position:absolute; left:26%; right:26%; bottom: calc(16 * var(--u)); height: calc(14 * var(--u));
  border-radius:50%; background: radial-gradient(50% 50%, var(--dq-ink-shadow), transparent 72%); opacity:.5;
}
.dq-portrait-canvas{position:absolute; inset:0; width:100%; height:100%; display:block}
.dq-portrait.dq-nobody::before{content: attr(data-initial); position:absolute; inset:0; display:flex; align-items:center;
  justify-content:center; font-size: calc(120 * var(--u)); color: var(--dq-title-ink); opacity:.5}
.dq-vol{display:inline-flex; gap: calc(3 * var(--u)); align-items:center}
.dq-vol > i{
  width: calc(11 * var(--u)); height: calc(20 * var(--u)); border-radius: calc(3 * var(--u));
  background: color-mix(in srgb, var(--dq-ink) 18%, transparent);
  box-shadow: inset 0 0 0 calc(1.2 * var(--u)) var(--dq-hair);
}
.dq-vol > i.dq-on{background: var(--dq-gold); box-shadow: 0 calc(1.5 * var(--u)) 0 var(--dq-ink-shadow)}
.dq-code .dq-codetext{
  white-space: normal; word-break: break-all; font-size: calc(19 * var(--u)); line-height:1.5; color: var(--dq-ink);
  max-height: calc(260 * var(--u)); overflow:hidden;
}
.dq-codeinput{
  width:100%; font: inherit; font-size: calc(22 * var(--u)); padding: calc(8 * var(--u)) calc(12 * var(--u));
  border-radius: calc(8 * var(--u)); border: calc(2 * var(--u)) solid var(--dq-hair);
  background: color-mix(in srgb, var(--dq-ink) 8%, transparent); color: var(--dq-ink); pointer-events:auto;
}
`;
let styled = false;
function installCss() {
  if (styled || typeof document === 'undefined') return;
  styled = true;
  try {
    const el = document.createElement('style');
    el.id = 'dq-menu-css';
    el.textContent = CSS;
    document.head.appendChild(el);
  } catch (e) { reportError('menu css', e); }
}

// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
// public API
// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
export const Menu = {
  get items() { return ITEMS; },
  get spells() { return SPELLS; },
  settings: SETTINGS,
  TACTICS,
  SLOT_LIST,

  /** P21 / P20: hand the real tables over and every window reads them at once. */
  useData({ items, spells } = {}) {
    if (items && typeof items === 'object') ITEMS = items;
    if (spells && typeof spells === 'object') SPELLS = spells;
    stampIds();
    return { items: Object.keys(ITEMS).length, spells: Object.keys(SPELLS).length };
  },

  party: frontParty,
  members: allMembers,
  bag: bagItems,
  pockets: (id) => { const m = findMember(id); return m ? pocketsOf(m).slice() : []; },
  equipped: (id) => { const m = findMember(id); return m ? { ...m.equip } : null; },
  numbers: (id) => { const m = findMember(id); return m ? maxOf(m) : null; },
  applySettings,
  /** Set one Misc option by hand (demos, tests, P33): Menu.setOption('scale', 1.26). */
  setOption(key, value) {
    if (!OPTIONS[key]) return { ok: false, reason: `no setting "${key}"`, settings: Object.keys(OPTIONS) };
    SETTINGS[key] = value;
    applySettings();
    saveSettings();
    return { ok: true, key, value, label: OPTIONS[key].bar ? Math.round(value * 10) : String(value) };
  },
};

let registered = false;
export function registerFieldMenu() {
  if (registered) return;
  registered = true;
  installCss();
  Scenes.register('menu', menuScene);
  Debug.provide('menu', () => closedState());
  Debug.expose('menuOpen', (open = true) => {
    if (open === false) { if (Scenes.top() === 'menu') Scenes.pop(); return { ok: true, open: false }; }
    if (Scenes.top() === 'menu') return { ok: true, open: true, already: true };
    Scenes.push('menu', {});
    return { ok: true, open: Scenes.top() === 'menu' };
  });
  Debug.expose('menuPath', () => { try { return window.__DQ.state().menu.path; } catch (_) { return []; } });
  /** Drive the menu the way a child does: __DQ.menuPick('items') puts the cursor there and presses Confirm. */
  Debug.expose('menuPick', (id) => menuChoose('m-cmd', id));
  /** The same for ANY open menu window: __DQ.menuChoose('m-bag', 'herb'). */
  Debug.expose('menuChoose', (winId, id) => menuChoose(winId, id));
  /** Back out to the command window, then pick something there: __DQ.menuTo('spells'). */
  Debug.expose('menuTo', async (id) => {
    for (let i = 0; i < 12; i++) {
      const w = UI.focused;
      if (w && w.id === 'm-cmd') break;
      if (!w) break;
      UI.input('cancel');
      await new Promise((r) => setTimeout(r, 190));
    }
    if (!UI.focused || UI.focused.id !== 'm-cmd') {
      if (Scenes.top() !== 'menu') Scenes.push('menu', {});
      await new Promise((r) => setTimeout(r, 500));
    }
    return id === undefined ? { ok: true, at: UI.focused ? UI.focused.id : null } : menuChoose('m-cmd', id);
  });
  Debug.expose('menuWindows', () => UI.all().filter(w => w.state !== 'closed')
    .map(w => ({ id: w.id, kind: w.kind, focused: w.focused, items: w.items ? w.items.filter(x => !x.divider).map(x => x.id) : null })));
  /** Give a person something to carry: __DQ.pocket('hero', 'herb', 2). */
  Debug.expose('pocket', (who, itemId, n = 1) => {
    const m = findMember(who);
    if (!m) return { ok: false, reason: `nobody called "${who}"`, party: allMembers().map(x => x.id) };
    if (!item(itemId)) return { ok: false, reason: `no such thing as "${itemId}"` };
    const got = addTo(pocketsOf(m), itemId, Math.max(1, n | 0), POCKET_MAX);
    return { ok: !!got, who: m.id, item: itemId, pockets: pocketsOf(m).map(e => e.id) };
  });
}

function menuChoose(winId, id) {
  const w = UI.get(winId);
  if (!w || w.destroyed || !w.items || (w.state !== 'open' && w.state !== 'opening')) {
    return { ok: false, reason: `no open menu "${winId}"`, open: UI.all().filter(x => x.state !== 'closed').map(x => x.id) };
  }
  // drive it the way a child does: only the window that has the cursor takes a button
  if (UI.focused && UI.focused !== w) {
    return { ok: false, reason: `"${winId}" has not got the cursor`, focused: UI.focused.id };
  }
  const it = w.items.find(x => x.id === id || x.label === id || x.index === id);
  if (!it) return { ok: false, reason: `no entry "${id}" in ${winId}`, items: w.items.map(x => x.id) };
  w.setIndex(it.index, { snap: true });
  w.confirm();
  return { ok: true, window: winId, picked: it.id };
}

/** Plugin entry (main.js): register the field menu scene, apply the saved settings, hook __DQ. */
export function install(ctx = {}) {
  void ctx;
  loadSettings();
  registerFieldMenu();
  applySettings();
}

export default registerFieldMenu;
