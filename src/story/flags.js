/**
 * flags.js — the story's memory: every CANON §4 flag, who is in the party, and which Act it is.
 *                                                                              (P26, owner: src/story/flags.js)
 *
 * Everything in the build already asks `__DQ.flag(name)` / `{set: {'ch1.awake': true}}` (dialogue, npc `when:`,
 * the HUD ribbon, the map layers, the befriending gate). Until this file existed those calls landed in a throwaway
 * bag inside debug.js that nothing saved and nothing validated. Installing Flags makes them real:
 *
 *   Flags.install(ctx)              Debug.implement('flag'), Debug.provide('flags'|'story'), Save 'flags' + 'chapter'
 *   Flags.get(name)                 -> value | null          (null = never set)
 *   Flags.set(name, value = true)   -> value                  emits Bus 'flag.set' {name, value, was}
 *   Flags.on(name, fn)              -> off()                  fn(value, name); name '*' hears everything
 *   Flags.all()                     -> {name: value} (only the ones that are set)
 *   Flags.act()                     -> 1 | 2 | 3              (ch3.start -> 3, ch2.start -> 2)
 *   Flags.has(name) / Flags.clear() / Flags.reset()
 *   Flags.party()                   -> ['bobble', 'pip']      every `party.<id>` that is on
 *   Flags.unknown()                 -> names set that are not in CANON (a typo shows up as data, not as a bug)
 *
 * NAMES ARE LAW (CANON §4 + §6 + the optional beats). A flag not in FLAGS still works — the story must never
 * break over a name — but it is counted in `unknown` so a critic can see the typo.
 */
import { Bus } from '../engine/events.js';
import { Debug, reportError } from '../engine/debug.js';

/** Every flag CANON names, in beat order. The value is `true` unless the table says otherwise. */
export const FLAGS = {
  // ── ACT I ──────────────────────────────────────────────────────────────────────────────────────────────────
  'ch1.awake': 'B1 · you are out of bed in Hollybank',
  'ch1.left_home': 'B2 · Papa gave you 30 G at the lane and you climbed into the wagon',
  'ch1.met_willow': 'B4 · met Willow Pye',
  'ch1.met_sera': 'B4 · met Sera Fairweather',
  'ch1.dare_taken': 'B5 · Willow dared you to Cobwell Manor',
  'ch1.manor_cleared': 'B6 · Mumbleroot beaten, the manor tidied',
  'ch1.ribbon': 'B6 · half of Willow’s ribbon is on your wrist',
  'ch1.farewell': 'B7 · goodbyes on the Saltmarrow quay',
  'ch1.pass_open': 'B8 · Papa shifted the rockfall',
  'ch1.bertie_taken': 'B8 · the Quietlings took Bertie off the moor',
  'ch1.halvard_fallen': 'B9 · the Grey Ruins',
  // ── ACT II ─────────────────────────────────────────────────────────────────────────────────────────────────
  'ch2.start': 'Act II begins (ten years pass)',
  'ch2.quarry_escape': 'B10 · out of the Quiet Quarry',
  'ch2.pip_return': 'B11b · the Sunmane is Pip',
  'ch2.barty_join': 'B12 · Barty kept the fire in',
  'ch2.crest': 'B12 · the Ambergarde Crest',
  'ch2.letter': 'B12 · Papa’s Letter',
  'ch2.wagon': 'B12 · the wagon is mended — wild monsters may join',
  'ch2.willow_grown': 'B13 · Willow runs the Contented Herring',
  'ch2.sera_grown': 'B14 · Sera at Fairweather Hall',
  'ch2.pearl_quest': 'B14 · Rudolpho’s four conditions',
  'ch2.pearl': 'B15 · the Tide Pearl',
  'ch2.bride': 'B16 · "willow" | "sera"',
  'ch2.married': 'B17 · the wedding at Marbleford Chapel',
  'ch2.ship': 'B17 · the Merry Lark',
  'ch2.ambergarde': 'B18 · the court kneels',
  'ch2.sword_failed': 'B18 · Bram cannot draw the Larksteel Sword',
  'ch2.twins_born': 'B18 · Rowan and Linnet',
  'ch2.petrified': 'B19 · the coronation',
  'ch2.belfry_cleared': 'optional · Sexton Sootbell',
  'ch2.bogwallop_beaten': 'optional · Bogwallop the Bulbous',
  // ── ACT III ────────────────────────────────────────────────────────────────────────────────────────────────
  'ch3.start': 'Act III begins (nine years pass)',
  'ch3.awake': 'B20 · Linnet chips Papa free',
  'ch3.sword_drawn': 'B21 · Rowan draws the Larksteel Sword',
  'ch3.old_friends': 'B22 · the unchosen friend meets your children',
  'ch3.shield': 'B22 · the Larksteel Shield',
  'ch3.quarry_freed': 'B22 · the Iron Governess',
  'ch3.cloudstair': 'B23 · the Cloud Stair at Bellhollow',
  'ch3.cloak': 'B23 · the Larkweave Cloak',
  'ch3.sunlark': 'B23 · the Sunlark wakes',
  'ch3.elowen': 'B24 · Queen Elowen wakes',
  'ch3.mortmain_fallen': 'B25 · Mortmain',
  'ch3.malgrim_fallen': 'B25 · Malgrim the Unlit',
  'ch3.spouse_freed': 'B26 · the Stone Garden softens',
  // ── the party (CANON §5) ───────────────────────────────────────────────────────────────────────────────────
  'party.bobble': 'B3 · Bobble the Gloop',
  'party.bobble_return': 'B11 · Bobble waited ten years',
  'party.pip': 'B6 / B11b · Pip',
  'party.digby': 'B10 · Digby the Barrowmole',
  'party.barty': 'B12 · Barty Marrow',
  'party.rowan': 'B20 · Rowan',
  'party.linnet': 'B20 · Linnet',
  'party.elowen': 'B24 · Queen Elowen',
  'party.bogwallop': 'optional · Bogwallop',
  // ── key items and odds and ends (CANON §6, optional beats) ─────────────────────────────────────────────────
  'item.wolfscarf': 'B22 · the Wolfscarf',
  'item.emberbell': 'B22 · the Emberbell',
  'item.stiltboots': 'optional · Quaggerton’s Stilt-Boots',
  'arena.rank1': 'optional · Port Pelican arena',
  'arena.rank2': 'optional · Port Pelican arena',
  'arena.rank3': 'optional · Port Pelican arena',
  'arena.rank4': 'optional · Port Pelican arena',
  'arena.rank5': 'optional · Port Pelican arena',
  'secret.socks': 'a count, 0-11',
  'game.cleared': 'B27 · the epilogue',
};

/** The three Act gates, highest first — `act()` reads them in this order. */
const ACT_GATES = [['ch3.start', 3], ['ch2.start', 2]];

const store = new Map();                 // name -> value (only what has been set)
const watchers = new Map();              // name | '*' -> Set<fn>
const history = [];                      // the last 60 changes, for __DQ and the demo
let installed = false;
let savedTo = false;
let ctxRef = null;

const key = (name) => String(name == null ? '' : name).trim();
const truthy = (v) => !(v === undefined || v === null || v === false || v === 0 || v === '');

function fire(name, value, was) {
  for (const which of [name, '*']) {
    const set = watchers.get(which);
    if (!set) continue;
    for (const fn of Array.from(set)) {
      try { fn(value, name, was); } catch (e) { reportError(`flag watcher "${which}"`, e); }
    }
  }
  try { Bus.emit('flag.set', { name, value, was }); } catch (e) { reportError('flag.set emit', e); }
}

export const Flags = {
  FLAGS,

  /** get(name) -> value | null. get() -> a plain object of everything set (the __DQ.flag() contract). */
  get(name) {
    if (name === undefined) return Flags.all();
    const k = key(name);
    return store.has(k) ? store.get(k) : null;
  },

  set(name, value = true) {
    const k = key(name);
    if (!k) return null;
    const was = store.has(k) ? store.get(k) : null;
    // `false` / null MEANS "not set": a flag is a thing that happened, and un-happening it must not leave a husk
    if (value === false || value === null || value === undefined) store.delete(k);
    else store.set(k, value);
    if (was !== value) fire(k, value === false || value == null ? null : value, was);
    return Flags.get(k);
  },

  has(name) { return truthy(Flags.get(name)); },
  /** Every flag in the list is on (a beat's entry condition, in one call). */
  every(...names) { return names.flat().every((n) => Flags.has(n)); },
  some(...names) { return names.flat().some((n) => Flags.has(n)); },

  all() {
    const out = {};
    for (const [k, v] of store) out[k] = v;
    return out;
  },

  act() {
    for (const [flag, act] of ACT_GATES) if (Flags.has(flag)) return act;
    return 1;
  },
  /** The save's `chapter` field is the Act number (CANON: "the save's chapter field is 1, 2 or 3"). */
  chapter() { return Flags.act(); },

  party() {
    const out = [];
    for (const k of store.keys()) if (k.startsWith('party.') && truthy(store.get(k))) out.push(k.slice(6));
    return out;
  },

  /** Names that are set but are not in CANON — a typo is data, not a crash. */
  unknown() { return Array.from(store.keys()).filter((k) => !Object.prototype.hasOwnProperty.call(FLAGS, k)); },

  on(name, fn) {
    const k = key(name) || '*';
    if (typeof fn !== 'function') return () => {};
    let set = watchers.get(k);
    if (!set) watchers.set(k, set = new Set());
    set.add(fn);
    return () => { const s = watchers.get(k); if (s) s.delete(fn); };
  },

  /** Set several at once ({'ch1.ribbon': true, 'ch2.bride': 'willow'}). */
  setAll(obj = {}) {
    for (const [k, v] of Object.entries(obj)) Flags.set(k, v);
    return Flags.all();
  },

  clear() { const names = Array.from(store.keys()); store.clear(); for (const n of names) fire(n, null, true); return true; },
  reset() { store.clear(); history.length = 0; return true; },

  history(n = 20) { return history.slice(-Math.max(1, n | 0)); },

  describe() {
    const f = Flags.all();
    const beats = Object.keys(FLAGS).filter((k) => truthy(f[k]));
    return {
      act: Flags.act(), chapter: Flags.chapter(), set: beats.length, of: Object.keys(FLAGS).length,
      party: Flags.party(), bride: f['ch2.bride'] || null, unknown: Flags.unknown(),
      flags: f, last: history.slice(-8),
    };
  },

  // ───────────────────────────────────────────────────────────────────────────────────────────────────────────
  install(ctx = {}) {
    if (installed) return Flags;
    installed = true;
    ctxRef = ctx;
    const D = ctx.Debug || Debug;
    const Save = ctx.Save;

    Flags.on('*', (value, name, was) => {
      if (name == null) return;                                  // a save load: one broadcast, nothing to log
      history.push({ name, value: value === true ? 1 : value, was: was === true ? 1 : was });
      if (history.length > 60) history.shift();
    });

    // THE CONTRACT. Everything in the build reaches the story through this one accessor.
    D.implement('flag', (name, value) => {
      if (name === undefined) return Flags.all();
      if (value === undefined) return Flags.get(name);
      return Flags.set(name, value);
    });
    D.provide('flags', () => Flags.all());
    D.expose('flags', (n) => (n === undefined ? Flags.describe() : Flags.get(n)));

    Flags.installSave(Save);
    return Flags;
  },

  /** The F5 side, on its own so a standalone install can hand the shared Save over once it has imported it. */
  installSave(Save) {
    if (savedTo || !Save || typeof Save.register !== 'function') return Flags;
    savedTo = true;
    try {
        Save.register('flags', {
          order: 10,
          save: () => Flags.all(),
          load: (v) => {
            store.clear();
            if (v && typeof v === 'object') for (const [k, val] of Object.entries(v)) if (truthy(val)) store.set(String(k), val);
            // one broadcast, not one per flag: everything that reads flags re-derives from scratch
            const set = watchers.get('*');
            if (set) for (const fn of Array.from(set)) { try { fn(null, null, null); } catch (e) { reportError('flag watcher load', e); } }
            try { Bus.emit('flag.set', { name: null, value: null, loaded: true }); } catch (_) {}
          },
          reset: () => { Flags.reset(); },
          summary: (v) => ({ chapter: v && v['ch3.start'] ? 3 : v && v['ch2.start'] ? 2 : 1 }),
        });
        Save.register('chapter', {
          order: 0,
          save: () => Flags.chapter(),
          load: () => {},                       // the Act is derived from the flags; the number is for the slot card
          reset: () => {},
        });
    } catch (e) { reportError('flags save', e); }
    return Flags;
  },

  get installed() { return installed; },
  get ctx() { return ctxRef; },
};

export default Flags;
