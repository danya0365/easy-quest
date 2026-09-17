// src/data/growth.js — P19. Levels, EXP, the six growth personalities, monster templates, guests, learnsets.
// Source of truth: docs/SYSTEMS-BIBLE.md §2 + §3, names per docs/CANON.md (Alder→Bram, Wynn→Willow,
// Nettle→Sera, Bosco→Barty, Tam→Rowan, Ellie→Linnet; spells renamed per CANON §7).
// PURE DATA + tiny pure helpers. No DOM, no Three.js. Runs under plain node.

export const LEVEL_CAP = 30;

/** SYSTEMS §2.1 — one shared table. EXP_TABLE[L] = total EXP needed to *be* level L. */
export const EXP_TABLE = [
  0, // [0] unused
  0, 7, 23, 47, 92, 160, 260, 400, 590, 840,                 // 1..10
  1170, 1590, 2120, 2780, 3600, 4600, 5800, 7250, 8950, 10950, // 11..20
  13300, 16050, 19250, 22950, 27200, 32050, 37600, 43900, 51000, 59000, // 21..30
];

export const STAT_KEYS = ['hp', 'mp', 'might', 'nimble', 'resil', 'wis', 'luck'];
/** Order the level-up panel lists gains in (SYSTEMS §10.2). */
export const GAIN_ORDER = [
  ['hp', 'Max HP'], ['mp', 'Max MP'], ['might', 'Might'], ['nimble', 'Nimbleness'],
  ['resil', 'Resilience'], ['wis', 'Wisdom'], ['luck', 'Luck'],
];

// anchors: {level: [hp, mp, might, nimble, resil, wis, luck]}
const A = (rows) => {
  const out = {};
  for (const [lvl, ...v] of rows) out[lvl] = Object.fromEntries(STAT_KEYS.map((k, i) => [k, v[i]]));
  return out;
};

/**
 * SYSTEMS §2.3–2.4. The six personalities, plus Queen Elowen's "Lantern" (SYSTEMS §2.4, anchors at 20 and 30 only:
 * she joins at the party's level in Act III). Bram's anchors reproduce the full §2.3 table exactly (tested).
 */
export const PERSONALITIES = {
  steady_oak: {
    id: 'steady_oak', name: 'the Steady Oak', blurb: 'Balanced, no bad levels. He heals; he does not blast.',
    anchors: A([
      [1, 20, 0, 10, 8, 9, 4, 8], [5, 44, 8, 20, 15, 19, 10, 14], [10, 82, 22, 35, 26, 33, 20, 22],
      [15, 128, 40, 52, 38, 49, 32, 31], [20, 182, 62, 72, 51, 67, 46, 41], [25, 246, 88, 96, 65, 88, 62, 52],
      [30, 320, 118, 124, 80, 112, 80, 64],
    ]),
  },
  firecracker: {
    id: 'firecracker', name: 'the Firecracker', blurb: 'Front-loaded: better than you for all of Act I. Flattens after 20.',
    anchors: A([
      [1, 17, 6, 9, 12, 7, 9, 10], [5, 40, 20, 21, 26, 16, 22, 18], [10, 74, 40, 38, 44, 28, 40, 27],
      [15, 105, 58, 52, 58, 38, 55, 34], [20, 132, 74, 63, 69, 46, 67, 40], [25, 155, 88, 72, 78, 53, 77, 45],
      [30, 175, 100, 79, 85, 59, 85, 49],
    ]),
  },
  slow_bloom: {
    id: 'slow_bloom', name: 'the Slow Bloom', blurb: 'Nearly useless until 15, then the best healer and the luckiest creature alive.',
    anchors: A([
      [1, 15, 8, 6, 9, 8, 11, 14], [5, 30, 22, 11, 16, 15, 22, 26], [10, 50, 42, 17, 25, 24, 36, 44],
      [15, 74, 68, 24, 34, 34, 54, 64], [18, 92, 88, 29, 40, 42, 66, 76], [20, 112, 108, 33, 45, 48, 80, 86],
      [25, 152, 150, 42, 55, 62, 106, 105], [30, 196, 195, 51, 65, 77, 132, 120],
    ]),
  },
  boulder: {
    id: 'boulder', name: 'the Boulder', blurb: 'Highest HP and Defence, zero magic, slowest turn. Picking him is never wrong.',
    anchors: A([
      [1, 30, 0, 13, 4, 14, 2, 5], [5, 62, 0, 26, 8, 30, 3, 8], [10, 108, 0, 44, 13, 52, 5, 12],
      [15, 158, 0, 62, 18, 74, 7, 16], [20, 212, 0, 80, 23, 96, 9, 20], [25, 270, 0, 98, 27, 118, 11, 24],
      [30, 332, 0, 116, 31, 140, 13, 28],
    ]),
  },
  prodigy: {
    id: 'prodigy', name: 'the Prodigy', blurb: 'Grows fast in everything. The overpowered one a twelve-year-old will find.',
    anchors: A([
      [1, 18, 5, 11, 10, 8, 8, 9], [5, 42, 20, 24, 22, 19, 21, 16], [10, 80, 44, 44, 38, 35, 40, 25],
      [15, 124, 70, 64, 53, 52, 60, 34], [20, 174, 98, 86, 68, 70, 82, 43], [25, 230, 128, 110, 82, 90, 105, 52],
      [30, 292, 160, 134, 96, 111, 128, 61],
    ]),
  },
  kite: {
    id: 'kite', name: 'the Kite', blurb: 'Made of paper and lightning. Where the tactics live.',
    anchors: A([
      [1, 14, 10, 5, 11, 6, 14, 11], [5, 30, 30, 10, 24, 13, 32, 19], [10, 52, 60, 16, 42, 22, 58, 29],
      [15, 76, 94, 22, 57, 31, 86, 38], [20, 102, 132, 28, 70, 40, 116, 47], [25, 130, 172, 34, 81, 49, 148, 55],
      [30, 160, 215, 40, 90, 58, 182, 63],
    ]),
  },
  lantern: {
    id: 'lantern', name: 'the Lantern', blurb: 'Sera-shaped but steeper. The best healing in the game, from the moment she wakes.',
    anchors: A([[20, 110, 150, 20, 50, 40, 120, 70], [30, 170, 240, 28, 66, 56, 170, 90]]),
  },
};
export const FAMILY_PERSONALITIES = ['steady_oak', 'firecracker', 'slow_bloom', 'boulder', 'prodigy', 'kite'];

/**
 * SYSTEMS §2.5 — monster companion templates. `scale` multiplies the source personality; the Plodder is authored
 * (flat, huge HP). Every template is CLAMPED per stat to 0.95 x its `source` family member at the same level,
 * after the species multiplier, so "a recruited monster is never better than the family member it displaces".
 */
export const MONSTER_TEMPLATES = {
  brute:   { id: 'brute',   name: 'Brute',   from: 'boulder',     scale: 0.80, source: ['boulder'] },
  sprite:  { id: 'sprite',  name: 'Sprite',  from: 'firecracker', scale: 0.80, source: ['firecracker'] },
  wisp:    { id: 'wisp',    name: 'Wisp',    from: 'kite',        scale: 0.80, source: ['kite'] },
  plodder: {
    id: 'plodder', name: 'Plodder', source: ['boulder', 'steady_oak'],
    anchors: A([
      [1, 24, 0, 9, 5, 9, 3, 8], [5, 52, 4, 18, 11, 19, 8, 14], [10, 92, 8, 30, 18, 32, 14, 21],
      [15, 136, 12, 42, 25, 45, 20, 28], [20, 184, 16, 54, 32, 58, 26, 35], [25, 234, 20, 66, 38, 71, 32, 42],
      [30, 288, 24, 78, 44, 84, 38, 49],
    ]),
  },
};
export const MONSTER_CLAMP = 0.95;

/**
 * Innate "gear" for monster companions (they fight with teeth, shells and opinions). Roughly tracks what a
 * family member of the same level would be wearing (SYSTEMS §5 economy), so templates stay comparable.
 */
export function naturalGear(lvl) {
  return { power: Math.round(3 + lvl * 1.9), def: Math.round(3 + lvl * 2.6), mdef: Math.round(lvl * 0.5) };
}

/** The family (CANON §1 char ids). `learn` = [spellId, level] per SYSTEMS §3 with CANON §7 names. */
export const CHARACTERS = {
  hero: {
    id: 'hero', name: 'Bram', growth: 'steady_oak', kind: 'family',
    equips: ['sword', 'shield'],
    learn: [['mend', 4], ['sweeten', 7], ['bolster', 12], ['mendmore', 14], ['bluster', 16], ['rouse', 18],
      ['homeward', 21], ['mendall', 26]],
  },
  willow: {
    id: 'willow', name: 'Willow', growth: 'firecracker', kind: 'family',
    learn: [['scorcha', 3], ['wobble', 5], ['whiffle', 7], ['mend', 8], ['lanternlight', 9], ['whistle_down', 10],
      ['scorchalot', 11], ['wakey', 13], ['scarper', 15], ['whiffler', 16], ['snoozle', 18], ['tanglefoot', 21]],
  },
  sera: {
    id: 'sera', name: 'Sera', growth: 'slow_bloom', kind: 'family',
    learn: [['mend', 1], ['sweeten', 3], ['bolster', 6], ['sniff', 8], ['mendmore', 9], ['wakey', 11], ['snoozle', 13],
      ['rouse', 16], ['mendall', 20], ['homeward', 22], ['fullmend', 24]],
  },
  barty: {
    id: 'barty', name: 'Barty', growth: 'boulder', kind: 'family',
    // "Bluster as a shout, no MP — Lv 20"
    learn: [['bluster', 20, { mp: 0, name: 'Bluster (a shout)' }]],
  },
  rowan: {
    id: 'rowan', name: 'Rowan', growth: 'prodigy', kind: 'family',
    learn: [['mend', 4], ['scorcha', 6], ['nip', 10], ['sniff', 12], ['scorchalot', 13], ['mendmore', 15],
      ['tanglefoot', 17], ['zapple', 18], ['nipper', 19], ['kascorcha', 24], ['kawhiffle', 27], ['kazapple', 27], ['kanip', 29]],
  },
  linnet: {
    id: 'linnet', name: 'Linnet', growth: 'kite', kind: 'family',
    learn: [['scorcha', 2], ['whiffle', 5], ['lanternlight', 6], ['nip', 7], ['scorchalot', 9], ['wobble', 11],
      ['whiffler', 14], ['nipper', 15], ['scarper', 17], ['kascorcha', 19], ['kanip', 22], ['kawhiffle', 23],
      ['kazapple', 28]],
  },
  // Queen Elowen joins at B24 at the party's level and "learns every healing spell on joining" (SYSTEMS §2.4).
  elowen: {
    id: 'elowen', name: 'Elowen', growth: 'lantern', kind: 'family',
    learn: [['mend', 1], ['mendmore', 1], ['mendall', 1], ['fullmend', 1], ['rouse', 1]],
  },
};

/** CANON §7 "Mother's gift". Applied to rowan/linnet when `member.mother` is set. */
export const MOTHERS_GIFT = {
  willow: { earlier: ['scorcha', 'scorchalot', 'kascorcha'], by: 3, extra: { rowan: [['whistle_down', 10]] } },
  sera: { earlier: ['mend', 'mendmore', 'mendall'], by: 3, extra: { linnet: [['rouse', 16]] } },
};

/** CANON §5 story companions. Species ids are MONSTER-BIBLE ids (P16). */
export const COMPANIONS = {
  bobble: { id: 'bobble', name: 'Bobble', species: 'gloop', template: 'plodder', mult: 1.0, cap: 30, kind: 'monster' },
  pip: { id: 'pip', name: 'Pip', species: 'sunspot_cub', template: 'sprite', mult: 1.15, cap: 30, kind: 'monster' },
  digby: { id: 'digby', name: 'Digby', species: 'barrowmole', template: 'brute', mult: 1.0, cap: 28, kind: 'monster' },
  bogwallop: { id: 'bogwallop', name: 'Bogwallop', species: 'bogwallop', template: 'plodder', mult: 1.2, cap: 28, kind: 'monster' },
};

/**
 * Guests (CANON §4, SYSTEMS §2.4): fight, cannot be equipped, never level, earn no EXP. AI-controlled by default.
 * `stats` = the seven stats; `gear` = fixed {power, def, mdef} (the kit they walk in with — provisional: SYSTEMS
 * gives stats, not kit). Halvard and Bertie are SYSTEMS verbatim; the children use their own Lv 3 rows; grown
 * Willow joins the Sighing Grotto "at the party's level" (lvl comes from newMember).
 */
export const GUESTS = {
  halvard: {
    id: 'halvard', name: 'Halvard', kind: 'guest',
    stats: { hp: 260, mp: 40, might: 78, nimble: 40, resil: 70, wis: 45, luck: 30 },
    gear: { power: 66, def: 30, mdef: 6 }, // carries Halvard's Greatsword "like a walking stick"
    spells: ['mend', 'mendmore'], provisional: ['gear', 'spells'],
  },
  willow_child: { id: 'willow_child', name: 'Willow', kind: 'guest', growth: 'firecracker', lvl: 3,
    gear: { power: 7, def: 6, mdef: 0 }, provisional: ['gear'] },   // sling + clothes + straw hat
  sera_child: { id: 'sera_child', name: 'Sera', kind: 'guest', growth: 'slow_bloom', lvl: 3,
    gear: { power: 4, def: 7, mdef: 0 }, provisional: ['gear'] },    // cypress stick + clothes + pot lid
  bertie: { id: 'bertie', name: 'Bertie', kind: 'guest',
    stats: { hp: 90, mp: 0, might: 30, nimble: 12, resil: 34, wis: 8, luck: 40 },
    gear: { power: 14, def: 30, mdef: 2 }, provisional: ['gear'] },  // "mostly hides behind his shield"
  willow_grown: { id: 'willow_grown', name: 'Willow', kind: 'guest', growth: 'firecracker', lvl: null,
    gear: { power: 22, def: 21, mdef: 0, allEnemies: 0.75 }, provisional: ['gear'] }, // chain whip, jerkin, cap
};

// ---------------------------------------------------------------------------------------------------------
// helpers (pure)

const roundHalfUp = (x) => Math.floor(x + 0.5 + 1e-9);

/** SYSTEMS §2.2: stat(L) = round(lerp(anchorBelow, anchorAbove, t)). Half rounds up. */
export function lerpAnchors(anchors, L) {
  const lv = Object.keys(anchors).map(Number).sort((a, b) => a - b);
  L = Math.max(lv[0], Math.min(lv[lv.length - 1], Math.floor(L)));
  let lo = lv[0], hi = lv[lv.length - 1];
  for (let i = 0; i < lv.length; i++) {
    if (lv[i] <= L) lo = lv[i];
    if (lv[i] >= L) { hi = lv[i]; break; }
  }
  const out = {};
  for (const k of STAT_KEYS) {
    const a = anchors[lo][k], b = anchors[hi][k];
    out[k] = hi === lo ? a : roundHalfUp(a + (b - a) * ((L - lo) / (hi - lo)));
  }
  return out;
}

export function personalityAt(id, L) {
  const p = PERSONALITIES[id];
  if (!p) throw new Error(`growth: unknown personality "${id}"`);
  return lerpAnchors(p.anchors, L);
}

/** Template stats for a monster companion at level L, with species multiplier and the family clamp. */
export function templateAt(templateId, L, mult = 1) {
  const t = MONSTER_TEMPLATES[templateId];
  if (!t) throw new Error(`growth: unknown monster template "${templateId}"`);
  const base = t.anchors ? lerpAnchors(t.anchors, L) : personalityAt(t.from, L);
  const scale = t.anchors ? 1 : t.scale;
  const m = Math.max(0.7, Math.min(1.3, mult));
  const out = {};
  for (const k of STAT_KEYS) {
    const cap = Math.max(...t.source.map((s) => personalityAt(s, L)[k]));
    out[k] = Math.min(roundHalfUp(base[k] * scale * m), Math.floor(cap * MONSTER_CLAMP));
    if (k === 'hp') out[k] = Math.max(1, out[k]);
  }
  return out;
}

/** Level for a total EXP amount (capped). */
export function levelForExp(exp, cap = LEVEL_CAP) {
  let L = 1;
  while (L < cap && L < EXP_TABLE.length - 1 && exp >= EXP_TABLE[L + 1]) L++;
  return L;
}
export function expForLevel(L) { return EXP_TABLE[Math.max(1, Math.min(EXP_TABLE.length - 1, L))]; }
export function expToNext(L, exp = expForLevel(L)) {
  if (L >= LEVEL_CAP) return 0;
  return Math.max(0, EXP_TABLE[L + 1] - exp);
}

/** Growth source for a member: {kind:'personality'|'template'|'fixed', ...}. */
export function growthOf(member) {
  if (member.stats && (member.kind === 'guest' || member.fixed)) return { kind: 'fixed' };
  const g = GUESTS[member.guestOf || member.id];
  if (member.kind === 'guest' && g) {
    if (g.stats) return { kind: 'fixed', stats: g.stats };
    return { kind: 'personality', id: g.growth, lvl: g.lvl || member.lvl || 1 };
  }
  if (member.template || (member.kind === 'monster' && COMPANIONS[member.id])) {
    const c = COMPANIONS[member.id] || {};
    return { kind: 'template', id: member.template || c.template, mult: member.mult ?? c.mult ?? 1 };
  }
  const ch = CHARACTERS[member.charId || member.id];
  const id = member.growth || (ch && ch.growth);
  if (!id) return { kind: 'fixed' };
  return { kind: 'personality', id };
}

/** The seven base stats of a member at level L (or its own level). Fixed-stat members return their stats. */
export function statsFor(member, L = member.lvl || 1) {
  const g = growthOf(member);
  if (g.kind === 'fixed') return { ...(g.stats || member.stats) };
  if (g.kind === 'template') return templateAt(g.id, L, g.mult);
  return personalityAt(g.id, g.lvl || L);
}

/** gainAtLevel(L) = stat(L) - stat(L-1), for the level-up panel (SYSTEMS §2.2). */
export function gainsAt(member, L) {
  const now = statsFor(member, L), before = statsFor(member, L - 1);
  const out = {};
  for (const k of STAT_KEYS) out[k] = now[k] - before[k];
  return out;
}

/** Level cap for a member (companions have a personal cap 20–30). */
export function capFor(member) {
  if (member.kind === 'guest') return member.lvl || 1;
  if (member.cap) return member.cap;
  const c = COMPANIONS[member.id];
  return c ? c.cap : LEVEL_CAP;
}

/** [[spellId, level, opts?]] for a member, including the mother's gift for the twins. */
export function learnsetFor(member) {
  const base = member.learn || (CHARACTERS[member.charId || member.id] || {}).learn
    || (COMPANIONS[member.id] || {}).learn || [];
  let list = base.map((e) => [...e]);
  const who = member.charId || member.id;
  const gift = member.mother && MOTHERS_GIFT[member.mother];
  if (gift && (who === 'rowan' || who === 'linnet')) {
    list = list.map(([s, l, o]) => (gift.earlier.includes(s) ? [s, Math.max(1, l - gift.by), o] : [s, l, o]));
    for (const e of (gift.extra[who] || [])) if (!list.some(([s]) => s === e[0])) list.push([...e]);
    list.sort((a, b) => a[1] - b[1]);
  }
  return list;
}

/** Spell ids known at level L. */
export function spellsKnownAt(member, L = member.lvl || 1) {
  const g = GUESTS[member.guestOf || member.id];
  if (member.kind === 'guest' && g && g.spells) return [...g.spells];
  if (member.kind === 'guest' && g && g.growth) {
    const ch = Object.values(CHARACTERS).find((c) => c.growth === g.growth);
    const gl = g.lvl || member.lvl || 1;
    return ch ? ch.learn.filter(([, l]) => l <= gl).map(([s]) => s) : [];
  }
  return learnsetFor(member).filter(([, l]) => l <= L).map(([s]) => s);
}

/** Spells newly learnt on reaching exactly level L. */
export function spellsLearnedAt(member, L) {
  return learnsetFor(member).filter(([, l]) => l === L).map(([s, , o]) => ({ id: s, ...(o || {}) }));
}

/** MP cost overrides from learnsets (Barty's no-MP Bluster shout). */
export function mpOverrides(member) {
  const out = {};
  for (const [s, , o] of learnsetFor(member)) if (o && o.mp != null) out[s] = o.mp;
  return out;
}

/**
 * Build a fresh party member at a level. Returns the runtime member shape documented in docs/DATA-SHAPES.md.
 *   newMember('hero', 5, {equip:{weapon:'copper_sword'}})
 *   newMember('halvard')            // guest
 *   newMember('bobble', 3)          // story companion
 */
export function newMember(id, lvl = 1, extra = {}) {
  let m;
  if (GUESTS[id]) {
    const g = GUESTS[id];
    m = { id, name: g.name, kind: 'guest', guest: true, lvl: g.lvl || lvl, exp: 0 };
    if (g.stats) m.stats = { ...g.stats };
    if (g.growth) m.growth = g.growth;
    m.gear = { ...g.gear };
  } else if (COMPANIONS[id]) {
    const c = COMPANIONS[id];
    m = { id, name: c.name, kind: 'monster', species: c.species, template: c.template, mult: c.mult, cap: c.cap,
      lvl, exp: expForLevel(lvl) };
  } else if (CHARACTERS[id]) {
    const c = CHARACTERS[id];
    m = { id, name: c.name, kind: 'family', growth: c.growth, lvl, exp: expForLevel(lvl) };
  } else {
    throw new Error(`growth.newMember: unknown id "${id}"`);
  }
  Object.assign(m, extra);
  const s = statsFor(m, m.lvl);
  if (m.hp == null) m.hp = s.hp;
  if (m.mp == null) m.mp = s.mp;
  if (!m.equip) m.equip = {};
  return m;
}

/** A recruited wild monster as a companion (P17 decides template/mult; these defaults read the stat shape). */
export function newCompanion(monster, { id, name, lvl = 1, template, mult } = {}) {
  let t = template;
  if (!t) {
    const hpAtk = monster.hp / Math.max(1, monster.atk), agi = monster.agi / Math.max(1, monster.atk);
    if ((monster.mp || 0) >= monster.atk * 0.6) t = 'wisp';
    else if (agi >= 0.9) t = 'sprite';
    else if (hpAtk >= 1.6) t = 'plodder';
    else t = 'brute';
  }
  const m = {
    id: id || monster.id, name: name || monster.name, kind: 'monster',
    species: monster.id, template: t, mult: mult ?? Math.max(0.7, Math.min(1.3, 0.85 + (monster.tier || 1) * 0.07)),
    cap: Math.max(20, Math.min(30, 18 + (monster.tier || 1) * 2 + (monster.boss ? 4 : 0))),
    lvl, exp: expForLevel(lvl), equip: {},
    learn: (monster.moves || []).filter((mv) => mv.spell && !mv.monsterOnly).map((mv) => [mv.spell, Math.max(1, mv.learnAt || 1)]),
  };
  const s = statsFor(m, lvl);
  m.hp = s.hp; m.mp = s.mp;
  return m;
}
