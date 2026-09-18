/**
 * recruit.js — the signature Dragon Quest V beat: a monster you just beat asks to come with you, you say yes,
 * you give it a name, and it is yours for the rest of the game.       (P17, owner: src/battle/recruit.js)
 *
 * WHAT THIS FILE IS (docs/MONSTER-BIBLE.md §7)
 *   - the CHANCE maths (delegated to formulas.recruitChance so the rules engine and this agree exactly)
 *   - the NAMES: a per-species default ("Gloop" -> Dollop), eight suggestions, an alphabet you can spell with,
 *     and the duplicate suffix that makes a second Dollop "Dollop II" (children farm this on purpose)
 *   - the JOIN CEREMONY on the field: chime, the befriending fanfare, "X wants to be your friend!", Yes/No,
 *     the naming window, then "X joined the party!" and it is walking behind you.
 *
 * HOW IT GOES LIVE WITHOUT EDITING ANYONE ELSE'S FILE
 *   src/battle/scene.js (P14) already asks the Yes/No question inside the fight and pushes the new friend into
 *   Roster.wagon, then emits `battle.end` on the Bus. We listen for that: if the roster grew a monster, we run
 *   the NAMING and the joining ceremony on the field the moment the fight is over, and re-home anything the
 *   wagon cannot hold into the paddock (MONSTER-BIBLE §7: "the wagon's full? I'll wait in the paddock").
 *   Nothing here throws into the frame loop; every await is guarded.
 *
 *   Recruit.install(ctx, {Party, Companions})      called by src/world/party.js (the P17/P18 plugin entry)
 *   Recruit.chance({...}) -> 0..0.5                MONSTER-BIBLE §7 p = base x kindness x levelGap x charm
 *   Recruit.defaultName(species, n) -> 'Dollop II'
 *   Recruit.suggest(species) -> [8 names]
 *   Recruit.nameWindow({...}) -> Promise<string>   the naming UI (model-less: a big name plate + suggestions)
 *   Recruit.ceremony(member, {species}) -> Promise the whole join beat, reusable by the demo and by __DQ
 *
 * __DQ: recruit(speciesId) forces the whole offer · nameMonster(id) renames one · state().recruit
 */
import { Debug, reportError } from '../engine/debug.js';
import { UI } from '../ui/window.js';
import { Sfx } from '../audio/sfx.js';
import { recruitChance, RECRUIT_GUARANTEE_AFTER, RECRUIT_PITY_BATTLES } from './formulas.js';
import { newCompanion } from '../data/growth.js';
import DATA from '../../tests/battle/data.js';

const guard = (where, fn) => { try { return fn(); } catch (e) { reportError('recruit ' + where, e); return undefined; } };
const sfx = (id, o) => guard('sfx', () => Sfx.play(id, o));

// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
// 1. names — the half of this feature a child actually remembers
// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
/** Per-species: the pre-filled default first, then seven more for the suggestion wheel (MONSTER-BIBLE §7). */
const NAMES = {
  gloop: ['Dollop', 'Splot', 'Wobble', 'Puddle', 'Squish', 'Bloop', 'Jelly', 'Plip'],
  bloop: ['Nurse', 'Fretty', 'Poultice', 'Mercy', 'Bandage', 'Tuttut', 'Sorry', 'Dab'],
  flapjack: ['Pancake', 'Crumpet', 'Flip', 'Batter', 'Syrup', 'Waffle', 'Griddle', 'Toss'],
  peckish: ['Nibbles', 'Crumb', 'Beaky', 'Snack', 'Peck', 'Biscuit', 'Gobble', 'Seed'],
  grumpleroot: ['Turnip', 'Grumps', 'Radish', 'Mutter', 'Clod', 'Swede', 'Digger', 'Sprout'],
  toadstooligan: ['Button', 'Spore', 'Toadly', 'Cap', 'Fungus', 'Hoodlum', 'Truffle', 'Mould'],
  bumbleblunder: ['Buzz', 'Honey', 'Fumble', 'Stripe', 'Combs', 'Whoops', 'Pollen', 'Drone'],
  grumbleglop: ['Grumbo', 'Sulk', 'Mudge', 'Harrumph', 'Lump', 'Glop', 'Moody', 'Splodge'],
  sir_gloopalot: ['Lancelot', 'Sir Pip', 'Gallant', 'Steed', 'Chival', 'Plume', 'Noble', 'Squire'],
  boohoo: ['Sniffles', 'Weepy', 'Hanky', 'Drizzle', 'Sob', 'Puddles', 'Teary', 'Mope'],
  chestnut: ['Nutty', 'Lidbert', 'Hinge', 'Latch', 'Treasure', 'Creak', 'Chester', 'Keyhole'],
  crabbit: ['Pincer', 'Scuttle', 'Nipper', 'Sidle', 'Shelley', 'Claws', 'Rockpool', 'Snip'],
  hoot_couture: ['Plumage', 'Twoo', 'Bonnet', 'Feather', 'Vogue', 'Hoots', 'Ruffle', 'Owlette'],
  batterfly: ['Flutter', 'Pastry', 'Dusty', 'Wingdish', 'Flap', 'Sponge', 'Fritter', 'Cocoon'],
  twiglet: ['Snappy', 'Stick', 'Kindling', 'Twig', 'Bramble', 'Splinter', 'Whittle', 'Birch'],
  glimmergloop: ['Sparkle', 'Glint', 'Shimmer', 'Tinsel', 'Gleam', 'Lustre', 'Prism', 'Twinkle'],
  clankworthy: ['Clanky', 'Hollow', 'Visor', 'Rustworth', 'Empty', 'Tinny', 'Helmet', 'Echo'],
  boulderdash: ['Pebbles', 'Rumble', 'Granite', 'Heavy', 'Crag', 'Tumble', 'Boulder', 'Thud'],
  cactuddle: ['Prickle', 'Hug', 'Spike', 'Cuddles', 'Needles', 'Bristle', 'Thorn', 'Snuggle'],
  dune_buggy: ['Scarab', 'Dune', 'Beetle', 'Sandy', 'Chitin', 'Scurry', 'Burrow', 'Grain'],
  jinglebottom: ['Jingles', 'Belle', 'Tinker', 'Chime', 'Rattle', 'Bauble', 'Peal', 'Clang'],
  barrowmole: ['Digby', 'Tunnel', 'Velvet', 'Mound', 'Snout', 'Burrows', 'Spade', 'Mole'],
  candelabracadabra: ['Wick', 'Taper', 'Flicker', 'Candle', 'Wax', 'Glow', 'Sconce', 'Abra'],
  gloopold: ['Gloopold', 'Majesty', 'Crown', 'Regal', 'Sceptre', 'Grandee', 'Throne', 'Pomp'],
  sir_cumference: ['Rotundo', 'Girth', 'Circle', 'Roundly', 'Barrel', 'Orb', 'Ample', 'Radius'],
  mirthquake: ['Giggles', 'Chuckle', 'Guffaw', 'Titter', 'Wobbles', 'Cackle', 'Snort', 'Mirth'],
  lady_mothbonnet: ['Milady', 'Moth', 'Lacewing', 'Bonnet', 'Dusk', 'Velveteen', 'Powder', 'Lamp'],
  squidgeon: ['Inky', 'Squidge', 'Tentacle', 'Splosh', 'Brine', 'Suction', 'Kraken', 'Bubble'],
  thunderpuff: ['Rumbles', 'Zapp', 'Cloudy', 'Bolt', 'Grumble', 'Static', 'Storm', 'Puff'],
  wyrmsley: ['Jenkins', 'Butler', 'Wyrmsley', 'Service', 'Teapot', 'Valet', 'Silver', 'Cufflink'],
  grimalkitten: ['Mittens', 'Whiskers', 'Grimalkin', 'Purr', 'Sooty', 'Paws', 'Kitten', 'Yowl'],
  hexcalibur: ['Hexy', 'Edge', 'Pommel', 'Blade', 'Scabbard', 'Quillon', 'Hilt', 'Sharp'],
  vesperling: ['Vesper', 'Evensong', 'Dusklight', 'Bellchime', 'Nightly', 'Hymn', 'Candle', 'Compline'],
  hoarfax: ['Foxglove', 'Frostbrush', 'Ninefold', 'Silver', 'Hoarfrost', 'Vixen', 'Snowtail', 'Sly'],
};
/** Anything not in the table gets these, so a species that lands later still names beautifully. */
const GENERIC = ['Pip', 'Tuffet', 'Mooncalf', 'Biscuit', 'Wobbler', 'Cobble', 'Pudding', 'Nibs'];
const ROMAN = ['', '', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];

const pool = (species) => NAMES[String(species || '').toLowerCase()] || GENERIC;
const monOf = (species) => (DATA.monsters && DATA.monsters[species]) || null;

/** The pre-filled default. `n` is how many of this species you already have (1 = the first). */
function defaultName(species, n = 1) {
  const m = monOf(species);
  const base = (m && m.nameSuggest) || pool(species)[0] || (m && m.name) || 'Friend';
  return n > 1 ? `${base} ${ROMAN[n] || n}` : base;
}
/** Eight suggestions for the wheel, rotated by `seed` so the Menu button re-rolls into fresh ones. */
function suggest(species, seed = 0) {
  const p = pool(species), g = GENERIC;
  const all = p.concat(g.filter((x) => !p.includes(x)));
  const out = [];
  for (let i = 0; i < 8; i++) out.push(all[(i + seed * 8) % all.length]);
  return out;
}
/** Never two friends with the same name: Dollop, Dollop II, Dollop III … */
function uniqueName(base, taken = []) {
  const set = new Set(taken.map((t) => String(t).toLowerCase()));
  if (!set.has(String(base).toLowerCase())) return base;
  for (let i = 2; i < 40; i++) {
    const n = `${base} ${ROMAN[i] || i}`;
    if (!set.has(n.toLowerCase())) return n;
  }
  return base;
}
/** What it says when it asks. DATA carries the bible's lines; the rest get one that fits any monster. */
function joinLine(species) {
  const m = monOf(species);
  if (m && m.joinLine) return m.joinLine;
  return '"…" It looks at you hopefully and does a small hop.';
}
const tidy = (s) => {
  const t = String(s || '').replace(/[^A-Za-z '-]/g, '').replace(/\s+/g, ' ').trim().slice(0, 8);
  return t ? t[0].toUpperCase() + t.slice(1) : '';
};

// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
// 2. the chance (MONSTER-BIBLE §7 / SYSTEMS §10.3) — one source of truth, shared with the rules engine
// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
function chance({ species, base, heroLvl = 1, kidMode = true, charmBell = false, joined = 0, misses = 0,
  battlesSinceRecruit = 0 } = {}) {
  const m = monOf(species);
  const b = base != null ? base : (m ? m.recruit : 0);
  if (!b) return 0;
  if (misses >= RECRUIT_GUARANTEE_AFTER) return 1;                  // the 13th time, it asks. Always.
  return recruitChance({ base: b, kidMode, heroLvl, monsterLvl: (m && m.lvl) || 1, charmBell,
    duplicate: joined > 0, pity: battlesSinceRecruit >= RECRUIT_PITY_BATTLES });
}

// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
// 3. the naming window
// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
const ALPHA = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

function plate(name, line) {
  return UI.h('div', [
    UI.h('div.dq-row', [UI.h('span.dq-label', 'NAME')]),
    UI.h('div.dq-row', [UI.h('span.dq-grow.dq-c-gold', name || '…', { style: { fontSize: '1.9em', letterSpacing: '.06em' } })]),
    UI.h('div.dq-row', [UI.h('span.dq-grow', line || '', { style: { whiteSpace: 'normal', opacity: '.86', lineHeight: '1.5' } })]),
  ]);
}

/** Spell a name out letter by letter. Resolves the typed name, or null on cancel. */
async function spellOut(start, win) {
  let text = tidy(start);
  const items = ALPHA.map((c) => ({ id: 'c' + c, label: c }))
    .concat([{ id: 'sp', label: '␣' }, { id: 'dash', label: '-' }, { id: 'del', label: '←' },
      { id: 'clear', label: 'Clear' }, { id: 'done', label: 'DONE', color: 'gold' }]);
  const m = UI.menu({ id: 'recruit-alphabet', centerX: true, bottom: 52, columns: 7, items,
    title: 'Spell it out', minWidth: 520, destroyOnClose: true, closeOnSelect: false, initial: 'done',
    cancelValue: null });
  const redraw = () => { if (win && !win.destroyed) win.setContent(plate(text, 'Arrows move · Z picks · X goes back')); };
  redraw();
  for (;;) {
    const it = await m.choose();
    if (!it) { m.destroy(); return null; }
    if (it.id === 'done') { m.destroy(); return tidy(text) || null; }
    if (it.id === 'del') text = text.slice(0, -1);
    else if (it.id === 'clear') text = '';
    else if (it.id === 'sp') text = (text + ' ').slice(0, 8);
    else if (it.id === 'dash') text = (text + '-').slice(0, 8);
    else text = (text + it.label).slice(0, 8);
    text = text.length === 1 ? text.toUpperCase() : text[0].toUpperCase() + text.slice(1).toLowerCase();
    redraw();
    sfx('cursor');
  }
}

/**
 * The naming window. Confirm twice and a six-year-old has a monster with a lovely name.
 * Resolves the chosen name (never null — cancelling keeps the default, because nothing here may trap a child).
 */
async function nameWindow({ species = 'gloop', monsterName = 'Monster', preset = null, taken = [] } = {}) {
  const def = uniqueName(preset || defaultName(species), taken);
  let seed = 0, chosen = def;
  const win = UI.window({ id: 'recruit-name', centerX: true, top: 96, width: 560, title: `${monsterName} joins you`,
    destroyOnClose: true, content: plate(def, joinLine(species)) });
  await win.open();
  for (;;) {
    const list = suggest(species, seed).filter((n) => n.toLowerCase() !== def.toLowerCase()).slice(0, 6);
    const items = [{ id: 'keep', label: `Keep "${def}"`, color: 'gold' }, '-']
      .concat(list.map((n) => ({ id: 'n:' + n, label: n })))
      .concat(['-', { id: 'more', label: 'Other ideas…' }, { id: 'spell', label: 'Spell it out…' }]);
    const m = UI.menu({ id: 'recruit-name-menu', centerX: true, bottom: 52, columns: 3, items,
      minWidth: 560, destroyOnClose: true, closeOnSelect: true, cancelValue: null, initial: 'keep' });
    const it = await m.choose();
    if (!it || it.id === 'keep') { chosen = def; break; }
    if (it.id === 'more') { seed++; sfx('cursor'); continue; }
    if (it.id === 'spell') {
      const typed = await spellOut(def, win);
      if (typed) { chosen = uniqueName(typed, taken); break; }
      if (win && !win.destroyed) win.setContent(plate(def, joinLine(species)));
      continue;
    }
    chosen = uniqueName(it.id.slice(2), taken);
    break;
  }
  if (win && !win.destroyed) { win.setContent(plate(chosen, 'A fine name.')); await UI.wait(0.45); await win.close(); win.destroy(); }
  sfx('confirm');
  return chosen;
}

// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
// 4. the ceremony + the live wiring
// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
const L = { ctx: null, Party: null, Companions: null, before: null, busy: false, last: null, count: 0 };

function sting(id) {
  const c = L.ctx;
  if (!c || typeof c.Music !== 'function') return;
  guard('sting', () => { const p = c.Music(); if (p && p.then) p.then((M) => { try { if (M) M.stinger(id); } catch (_) {} }).catch(() => {}); });
}
function say(text, name) {
  const F = L.ctx && L.ctx.Field;
  if (F && F.active && typeof F.talk === 'function') return !!F.talk({ text, voice: 'narrator', name: name || 'a new friend' });
  return false;
}

/** The whole join beat for one member that has ALREADY been added to the roster. Names it and celebrates. */
async function ceremony(member, { species = null, home = 'wagon' } = {}) {
  if (!member || L.busy) return null;
  L.busy = true;
  try {
    const sp = species || member.species || member.id;
    const mon = monOf(sp);
    const taken = (L.Party ? L.Party.all() : []).filter((m) => m !== member).map((m) => m.name);
    sting('join');
    sfx('level_up_sparkle', { vol: 0.7 });
    const name = await nameWindow({ species: sp, monsterName: (mon && mon.name) || member.name, preset: member.name, taken });
    member.name = name;
    L.last = { name, species: sp, home, at: Date.now() };
    L.count++;
    if (L.Companions && L.Companions.refresh) guard('refresh', () => L.Companions.refresh());
    const where = home === 'paddock'
      ? `${name} waves: "The wagon's full? I'll wait in the paddock at Puddlewick!"`
      : (home === 'party' ? `${name} falls in behind you, beaming.` : `${name} hops up into the wagon, very pleased with itself.`);
    sfx('item_get');
    say(`${name} joined the party!{wait:400}{n}${where}`, name);
    return name;
  } catch (e) {
    reportError('recruit ceremony', e);
    return null;
  } finally { L.busy = false; }
}

/** Who in the roster is a monster, by id -> member. */
function monsterIds() {
  const P = L.Party;
  if (!P) return new Map();
  return new Map(P.all().filter((m) => m && m.kind === 'monster').map((m) => [m.id, m]));
}

/** The whole offer, start to finish, outside a battle: used by __DQ.recruit() and by the demo. */
async function offer(species = 'gloop', { heroLvl = 5, auto = null } = {}) {
  const P = L.Party;
  const mon = monOf(species);
  if (!P || !mon) return { ok: false, reason: `unknown monster "${species}"` };
  if (L.busy) return { ok: false, reason: 'already offering' };
  sting('join');
  const yes = auto != null ? !!auto
    : await UI.yesNo({ id: 'recruit-offer', centerX: true, bottom: 220, yes: 'Yes', no: 'No' })
      .catch(() => false);
  if (!yes) { say(`The ${mon.name} waves you off cheerfully and wanders home.`, mon.name); return { ok: true, joined: false }; }
  const n = (P.countSpecies(species) || 0) + 1;
  const member = guard('newCompanion', () => newCompanion(mon, {
    id: `${species}_${Date.now().toString(36).slice(-4)}${n}`, name: defaultName(species, n), lvl: Math.max(1, heroLvl - 2),
  }));
  if (!member) return { ok: false, reason: 'could not build the companion' };
  const home = P.add(member);
  const name = await ceremony(member, { species, home });
  return { ok: true, joined: true, name, home, id: member.id };
}

export const Recruit = {
  chance, defaultName, suggest, uniqueName, joinLine, nameWindow, ceremony, offer,
  names: NAMES,
  state() {
    return { joins: L.count, last: L.last, busy: L.busy,
      pityAfter: RECRUIT_PITY_BATTLES, guaranteeAfter: RECRUIT_GUARANTEE_AFTER };
  },

  install(ctx = {}, { Party = null, Companions = null } = {}) {
    L.ctx = ctx; L.Party = Party; L.Companions = Companions;
    const Bus = ctx.Bus, D = ctx.Debug || Debug;

    if (Bus && typeof Bus.on === 'function') {
      // remember who we were before the fight, so we can spot the monster that joined during it
      Bus.on('battle.start', () => { L.before = Array.from(monsterIds().keys()); });
      /**
       * P14's battle already asked "shall it come along?" and pushed the friend into the roster. Everything that
       * makes it a MOMENT — the name, the paddock overflow, the follower appearing behind you — happens here, on
       * the field, the instant the fight is over.
       */
      Bus.on('battle.end', () => {
        guard('battle.end', () => {
          const now = monsterIds();
          const before = new Set(L.before || []);
          L.before = Array.from(now.keys());
          const fresh = Array.from(now.values()).filter((m) => !before.has(m.id));
          if (!fresh.length || !Party) return;
          const home = Party.rehome();                       // wagon full -> paddock (MONSTER-BIBLE §7)
          const member = fresh[0];
          const where = home[member.id] || Party.whereIs(member.id) || 'wagon';
          UI.wait(0.8).then(() => ceremony(member, { species: member.species, home: where }))
            .catch((e) => reportError('recruit after battle', e));
        });
      });
    }

    D.provide('recruit', () => Recruit.state());
    /** __DQ.recruit('gloop') — run the whole offer right now, wherever you are. */
    D.expose('recruit', (species = 'gloop', opts = {}) => offer(species, opts));
    /** __DQ.recruitChance('gloop', 5) — what the odds actually are (a critic can check the bible). */
    D.expose('recruitChance', (species = 'gloop', heroLvl = 5, opts = {}) => chance({ species, heroLvl, ...opts }));
    /** __DQ.nameMonster('gloop_1') — open the naming window for somebody already in the roster. */
    D.expose('nameMonster', async (id) => {
      const m = Party && Party.find(id);
      if (!m) return { ok: false, reason: `nobody called "${id}"` };
      const name = await nameWindow({ species: m.species || m.id, monsterName: m.name, preset: m.name,
        taken: Party.all().filter((x) => x !== m).map((x) => x.name) });
      m.name = name;
      if (Companions && Companions.refresh) Companions.refresh();
      return { ok: true, id, name };
    });
    return Recruit;
  },
};

export default Recruit;
