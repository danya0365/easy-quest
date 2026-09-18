/**
 * spells.js — the 28 spells of CANON §7, in the docs/DATA-SHAPES §3 shape.            (P20, owner: src/data/spells.js)
 *
 *   import { SPELLS, spell, list, bySchool, SCHOOLS, fxFor } from '../data/spells.js';
 *
 * THE RULE (DATA-SHAPES §1): `SPELLS` is a plain object keyed by id, with NO functions inside it — everything here
 * survives `JSON.stringify` and can go straight into a save or a worker. The helpers below are module exports, not
 * data fields. Names are CANON §7 and are law; ids are snake_case and never change (saves store them).
 *
 * Numbers are the SYSTEMS-BIBLE §1.6/§1.7 coefficients as balanced end to end by the P14 simulator
 * (tests/battle/balance.js + tests/battle/journey.mjs). They are copied from the engine's own working fixture
 * (tests/battle/data.js) so the fight a child plays here is the fight the simulator measured. If a number here and
 * the engine disagree, the engine is the bug — report it.
 *
 * WHAT P20 ADDS on top of the fixture: every spell now carries
 *   fx:    the src/art/fx.js effect id the presentation plays  (FX.play(sp.fx, {at, scale, dir}))
 *   sfx:   the src/audio/sfx.js id that goes with it
 *   words: the line the message box says while it is cast ("%ACTOR% casts Scorcha!") — CANON §10 tokens
 * so the battle presenter needs no table of its own: read the spell, play its fx, play its sfx, print its words.
 *
 * Who learns what, and at which level, is src/data/growth.js (`CHARACTERS[id].learn`), never this file.
 */

// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
// the table
// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════

/** The eight schools, in the order menus and the level-up card show them. */
export const SCHOOLS = Object.freeze(['fire', 'wind', 'ice', 'lightning', 'healing', 'revive', 'support', 'control', 'field']);

/** Human names for the schools (P13's Spells window groups by these). */
export const SCHOOL_NAMES = Object.freeze({
  fire: 'Fire', wind: 'Wind', ice: 'Ice', lightning: 'Lightning', healing: 'Healing',
  revive: 'Waking', support: 'Helping', control: 'Mischief', field: 'Out and about',
});

const sp = (id, name, mp, tier, kind, extra = {}) => ({
  id, name, mp, tier, kind, target: 'enemy', battle: true, field: false, ...extra,
});

export const SPELLS = Object.fromEntries([
  // ── Fire: one enemy, the straightforward attacking line ──────────────────────────────────────────────────
  sp('scorcha', 'Scorcha', 2, 1, 'damage', {
    school: 'fire', element: 'fire', base: 8, k: 0.35,
    fx: 'fire_burst', sfx: 'fire', words: '%ACTOR% casts Scorcha!',
    blurb: 'a little puff of fire at one monster.' }),
  sp('scorchalot', 'Scorchalot', 4, 2, 'damage', {
    school: 'fire', element: 'fire', base: 22, k: 0.42,
    fx: 'fire_burst', fxScale: 1.35, sfx: 'fire', words: '%ACTOR% casts Scorchalot!',
    blurb: 'a proper blaze at one monster.' }),
  sp('kascorcha', 'Kascorcha', 10, 3, 'damage', {
    school: 'fire', element: 'fire', base: 55, k: 0.60,
    fx: 'fire_big', sfx: 'fire', words: '%ACTOR% casts Kascorcha!',
    blurb: 'an enormous roaring fire at one monster.' }),

  // ── Wind: every enemy at once ────────────────────────────────────────────────────────────────────────────
  sp('whiffle', 'Whiffle', 3, 1, 'damage', {
    school: 'wind', element: 'wind', base: 6, k: 0.28, target: 'enemies',
    fx: 'wind_slash', sfx: 'wind', words: '%ACTOR% casts Whiffle!',
    blurb: 'a gust that buffets every monster.' }),
  sp('whiffler', 'Whiffler', 6, 2, 'damage', {
    school: 'wind', element: 'wind', base: 16, k: 0.36, target: 'enemies',
    fx: 'wind_slash', fxScale: 1.3, sfx: 'wind', words: '%ACTOR% casts Whiffler!',
    blurb: 'a howling wind at every monster.' }),
  sp('kawhiffle', 'Kawhiffle', 14, 3, 'damage', {
    school: 'wind', element: 'wind', base: 34, k: 0.48, target: 'enemies',
    fx: 'wind_slash', fxScale: 1.7, sfx: 'wind', words: '%ACTOR% casts Kawhiffle!',
    blurb: 'a gale that tears the air open.' }),

  // ── Ice: one, then all, then all rather harder ───────────────────────────────────────────────────────────
  sp('nip', 'Nip', 3, 1, 'damage', {
    school: 'ice', element: 'ice', base: 10, k: 0.30,
    fx: 'ice_shards', sfx: 'ice', words: '%ACTOR% casts Nip!',
    blurb: 'a sharp little frost at one monster.' }),
  sp('nipper', 'Nipper', 8, 2, 'damage', {
    school: 'ice', element: 'ice', base: 20, k: 0.42, target: 'enemies',
    fx: 'ice_shards', fxScale: 1.3, sfx: 'ice', words: '%ACTOR% casts Nipper!',
    blurb: 'a flurry of ice at every monster.' }),
  sp('kanip', 'Kanip', 16, 3, 'damage', {
    school: 'ice', element: 'ice', base: 40, k: 0.55, target: 'enemies',
    fx: 'frost', sfx: 'ice', words: '%ACTOR% casts Kanip!',
    blurb: 'freezes the whole battlefield.' }),

  // ── Lightning: late, expensive, half-ignores armour ──────────────────────────────────────────────────────
  sp('zapple', 'Zapple', 8, 3, 'damage', {
    school: 'lightning', element: 'lightning', base: 45, k: 0.55, pierce: 0.5,
    fx: 'lightning', sfx: 'lightning', words: '%ACTOR% casts Zapple!',
    blurb: 'a bolt of lightning at one monster.' }),
  sp('kazapple', 'Kazapple', 20, 4, 'damage', {
    school: 'lightning', element: 'lightning', base: 60, k: 0.70, pierce: 0.5, target: 'enemies',
    fx: 'lightning', fxScale: 1.5, sfx: 'lightning', words: '%ACTOR% casts Kazapple!',
    blurb: 'lightning on every monster at once.' }),

  // ── Healing ──────────────────────────────────────────────────────────────────────────────────────────────
  sp('mend', 'Mend', 2, 1, 'heal', {
    school: 'healing', base: 18, k: 0.30, target: 'ally', field: true,
    fx: 'heal_sparkle', sfx: 'heal', words: '%ACTOR% casts Mend!',
    blurb: 'heals a friend a little.' }),
  sp('mendmore', 'Mendmore', 5, 2, 'heal', {
    school: 'healing', base: 45, k: 0.45, target: 'ally', field: true,
    fx: 'heal_sparkle', fxScale: 1.3, sfx: 'heal', words: '%ACTOR% casts Mendmore!',
    blurb: 'heals a friend rather a lot.' }),
  sp('mendall', 'Mendall', 12, 3, 'healAll', {
    school: 'healing', base: 35, k: 0.35, target: 'allies', field: true,
    fx: 'heal_sparkle', fxScale: 1.2, sfx: 'heal', words: '%ACTOR% casts Mendall!',
    blurb: 'heals the whole party.' }),
  sp('fullmend', 'Fullmend', 9, 3, 'fullheal', {
    school: 'healing', target: 'ally', field: true,
    fx: 'holy_light', sfx: 'heal', words: '%ACTOR% casts Fullmend!',
    blurb: 'heals a friend all the way.' }),

  // ── Waking the worn-out up ───────────────────────────────────────────────────────────────────────────────
  sp('rouse', 'Rouse', 8, 3, 'revive', {
    school: 'revive', pct: 0.5, target: 'fallen', field: true,
    fx: 'holy_light', fxScale: 1.2, sfx: 'level_up_sparkle', words: '%ACTOR% casts Rouse!',
    blurb: 'wakes a worn-out friend. Always works.' }),

  // ── Helping and hindering ────────────────────────────────────────────────────────────────────────────────
  sp('sweeten', 'Sweeten', 2, 1, 'cure', {
    school: 'support', cures: ['poison'], target: 'ally', field: true,
    fx: 'heal_sparkle', fxScale: 0.8, sfx: 'heal', words: '%ACTOR% casts Sweeten!',
    blurb: 'cures poison.' }),
  sp('wobble', 'Wobble', 3, 1, 'debuff', {
    school: 'support', buff: { stat: 'def', mult: 0.75, turns: 6 }, land: { normal: 0.9, boss: 0.55 },
    fx: 'debuff_aura', sfx: 'debuff', words: '%ACTOR% casts Wobble!',
    blurb: "makes one monster's defence go wobbly." }),
  sp('wakey', 'Wakey', 4, 2, 'cure', {
    school: 'support', cures: ['sleep', 'dazzle', 'root', 'confuse', 'hiccup'], target: 'ally',
    fx: 'chime_ring', sfx: 'buff', words: '%ACTOR% casts Wakey!',
    blurb: 'wakes, unmuddles and unsticks a friend.' }),
  sp('bolster', 'Bolster', 4, 2, 'buff', {
    school: 'support', buff: { stat: 'def', step: 0.25, max: 1.5, turns: 5 }, target: 'allies',
    fx: 'buff_aura', sfx: 'buff', words: '%ACTOR% casts Bolster!',
    blurb: 'the whole party gets sturdier.' }),
  sp('bluster', 'Bluster', 5, 2, 'buff', {
    school: 'support', buff: { stat: 'atk', step: 0.25, max: 1.5, turns: 5 }, target: 'allies',
    fx: 'buff_aura', fxScale: 1.15, sfx: 'buff', words: '%ACTOR% casts Bluster!',
    blurb: 'the whole party hits harder.' }),

  // ── Mischief ─────────────────────────────────────────────────────────────────────────────────────────────
  sp('snoozle', 'Snoozle', 4, 2, 'sleep', {
    school: 'control', turns: [2, 4], target: 'enemies',
    fx: 'sleep_z', sfx: 'debuff', words: '%ACTOR% casts Snoozle!',
    blurb: 'sends the monsters to sleep.' }),
  sp('tanglefoot', 'Tanglefoot', 5, 2, 'root', {
    school: 'control', turns: [1, 3], chance: 0.9,
    fx: 'root_vines', sfx: 'debuff', words: '%ACTOR% casts Tanglefoot!',
    blurb: "ties one monster's feet in vines." }),

  // ── Out and about (the field spells) ─────────────────────────────────────────────────────────────────────
  sp('lanternlight', 'Lanternlight', 3, 1, 'field', {
    school: 'field', battle: false, field: true, target: 'party',
    fx: 'lantern_glow', sfx: 'buff', words: '%ACTOR% casts Lanternlight!',
    blurb: 'lights up a dark cave.' }),
  sp('sniff', 'Sniff', 2, 1, 'field', {
    school: 'field', battle: false, field: true, target: 'party',
    fx: 'chest_sparkle', sfx: 'level_up_sparkle', words: '%ACTOR% casts Sniff!',
    blurb: 'sniffs out hidden treasure nearby.' }),
  sp('scarper', 'Scarper', 4, 2, 'escape', {
    school: 'field', target: 'party',
    fx: 'warp_swirl', sfx: 'flee', words: '%ACTOR% casts Scarper!',
    blurb: 'everybody leaves the fight at once.' }),
  sp('whistle_down', 'Whistle Down', 3, 2, 'field', {
    school: 'field', battle: false, field: true, target: 'party', encounterMult: 0.5, steps: 200,
    fx: 'wind_slash', fxScale: 0.8, sfx: 'wind', words: '%ACTOR% casts Whistle Down!',
    blurb: 'the monsters keep their heads down for a while.' }),
  sp('homeward', 'Homeward', 8, 3, 'field', {
    school: 'field', battle: false, field: true, target: 'party',
    fx: 'warp_swirl', fxScale: 1.4, sfx: 'level_up_sparkle', words: '%ACTOR% casts Homeward!',
    blurb: 'whisks everyone to a church.' }),
].map((s) => [s.id, s]));

// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
// helpers (module exports, never fields on the data)
// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════

/** One spell by id, or null. Unknown ids never throw — a save from an older build just loses that entry. */
export function spell(id) { return (id && Object.prototype.hasOwnProperty.call(SPELLS, id)) ? SPELLS[id] : null; }

/** Every spell as an array, in table order (fire → field). */
export function list() { return Object.values(SPELLS); }

/** Every id. */
export function ids() { return Object.keys(SPELLS); }

/** The spells of one school, in table order. */
export function bySchool(school) { return list().filter((s) => s.school === school); }

/** The spells a menu may show in a fight / on the field. */
export function battleSpells() { return list().filter((s) => s.battle !== false); }
export function fieldSpells() { return list().filter((s) => s.field === true); }

/** The src/art/fx.js effect id for a spell (and the scale it wants), for the presentation layer. */
export function fxFor(id) {
  const s = spell(id);
  if (!s) return null;
  return { fx: s.fx || 'screen_flash', scale: s.fxScale || 1, sfx: s.sfx || 'spell_cast', element: s.element || null };
}

/** Is this spell one that heals / helps rather than hurts? (targets a friend) */
export function isKind(id, kind) { const s = spell(id); return !!s && s.kind === kind; }

/** A short sanity check any test or demo can print: 28 spells, every CANON §7 name present. */
export function audit() {
  const missing = [];
  for (const s of list()) {
    if (!s.name || !s.school || !s.kind) missing.push(s.id + ':shape');
    if (!s.fx) missing.push(s.id + ':fx');
    if (!s.blurb) missing.push(s.id + ':blurb');
  }
  const schools = {};
  for (const s of list()) schools[s.school] = (schools[s.school] || 0) + 1;
  return { count: list().length, schools, problems: missing };
}

export default SPELLS;
