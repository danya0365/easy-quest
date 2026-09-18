/**
 * items.js — every item, every weapon, every scrap of armour and every keepsake in the game.        (P21)
 *
 * The table is CANON §6 (key items, the Larksteel set, the family gear) and SYSTEMS-BIBLE §4 (the 48 shop
 * entries, their prices and their numbers), in the shape docs/DATA-SHAPES.md §4 makes law, so the shop (P22),
 * the menu (P13), the bag, the chests (P30) and the battle engine (P14) all read the SAME rows.
 *
 *   ITEMS[id] = { id, name, kind, slot?, buy, blurb, where, who, battle, field, ...bonuses }
 *
 *   kind     'consumable' | 'weapon' | 'armour' | 'shield' | 'helm' | 'accessory' | 'key'
 *   slot     'weapon' | 'armour' | 'shield' | 'helm' | 'accessory'   (anything you can put on)
 *   buy      the shop price in gold. 0 = never sold (story gear, chest-only, gifts).
 *   sell     NOT stored: floor(buy / 2) — sellPrice(id) does it, with SYSTEMS §5's kinder 65% for outgrown kit.
 *   who      'anyone' (any of the family) or a list of CANON §1 char ids: hero willow sera barty rowan linnet elowen
 *   blurb    ONE line, in voice, for every single entry. A child reads this in the menu and smiles. Never empty.
 *   where    where a child actually finds it, in plain words (the shop town, the chest, the story beat).
 *   battle   {effect, ...} or null. effects: heal | mp | cure | revive | damageAll | seed  (DATA-SHAPES §4)
 *   field    true if it can be used walking about.
 *
 * Bonuses the engine sums across the five slots (all optional):
 *   power def mdef agi wis luck resil maxHp maxMp mpRegen
 *   allEnemies (.65 boomerang / .75 whip) · stun (.12 Thunderfork) · elementBonus {ice:.25} · spellGuard (.5)
 *   halves ['fire'] · immune ['sleep'] · reflect ['snoozle','wobble','sleep'] · encounterMult (.65 Pip's Bell)
 *   recruitMult (1.5 Charm Bell) · reusable · noSell · key
 *
 * No functions live in the data: every row survives JSON.stringify, so a save can hold ids and nothing else.
 * The helpers below (item, sellPrice, byKind, canEquip, equipOptions, statLine, describe) are the only code.
 *
 * LIVE: `install(ctx)` (or `wire()`) hands this table to src/ui/menu.js through Menu.useData({items}), which is
 * the swap its header asks for, and implements __DQ.give / __DQ.gold against the one shared bag in
 * src/battle/scene.js Roster. Import of this file alone changes nothing — it only registers data.
 */

// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
// builders — terse rows, plain objects out
// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
const con = (id, name, buy, blurb, where, battle, extra = {}) =>
  ({ id, name, kind: 'consumable', buy, blurb, where, who: 'anyone', battle, field: true, ...extra });
const key = (id, name, blurb, where, extra = {}) =>
  ({ id, name, kind: 'key', buy: 0, blurb, where, who: 'anyone', battle: null, field: false, noSell: true, key: true, ...extra });
const wpn = (id, name, power, buy, who, blurb, where, extra = {}) =>
  ({ id, name, kind: 'weapon', slot: 'weapon', power, buy, who, blurb, where, battle: null, field: false, ...extra });
const arm = (id, name, def, buy, who, blurb, where, extra = {}) =>
  ({ id, name, kind: 'armour', slot: 'armour', def, buy, who, blurb, where, battle: null, field: false, ...extra });
const shd = (id, name, def, buy, who, blurb, where, extra = {}) =>
  ({ id, name, kind: 'shield', slot: 'shield', def, buy, who, blurb, where, battle: null, field: false, ...extra });
const hlm = (id, name, def, buy, who, blurb, where, extra = {}) =>
  ({ id, name, kind: 'helm', slot: 'helm', def, buy, who, blurb, where, battle: null, field: false, ...extra });
const acc = (id, name, buy, who, blurb, where, extra = {}) =>
  ({ id, name, kind: 'accessory', slot: 'accessory', buy, who, blurb, where, battle: null, field: false, ...extra });

const ANY = 'anyone';
const SWORD = ['hero', 'rowan'];                       // the two who swing a proper sword
const HEAVY = ['hero', 'rowan', 'barty'];              // the three who can carry iron about
const MAGES = ['willow', 'sera', 'linnet', 'elowen'];  // the ones who would rather not

// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
// THE TABLE
// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
const ROWS = [
  // ── consumables — SYSTEMS §4.1 ──────────────────────────────────────────────────────────────────────────────
  con('herb', 'Herb', 8, 'A green leaf that stops a graze stinging.',
    'Every shop, all game. Gloops drop them.', { effect: 'heal', amount: 30, target: 'ally' }),
  con('strong_herb', 'Strong Herb', 32, 'A fatter leaf. Stops rather more stinging.',
    'Shops from Port Pelican onward.', { effect: 'heal', amount: 80, target: 'ally' }),
  con('fresh_herb', 'Fresh Herb', 110, 'Picked this morning, somewhere kinder than here.',
    'Shops from Coldcomfort onward.', { effect: 'heal', amount: 200, target: 'ally' }),
  con('nutcake', 'Nutcake', 14, 'Tastes of nuts. Puts a little magic back.',
    'Saltmarrow onward. Barty eats one if you leave it in the bag too long.', { effect: 'mp', amount: 12, target: 'ally' }),
  con('honeycake', 'Honeycake', 60, 'Tastes of honey. Puts a lot of magic back.',
    'Marbleford onward.', { effect: 'mp', amount: 40, target: 'ally' }),
  con('antidote_drop', 'Antidote Drop', 10, 'One drop, and the green goes out of you.',
    'Every shop, all game.', { effect: 'cure', statuses: ['poison'], target: 'ally' }),
  con('wake_me_up', 'Wake-me-up', 12, 'Smells like a shout.',
    'Puddlewick onward.', { effect: 'cure', statuses: ['sleep', 'dazzle'], target: 'ally' }),
  con('angels_kiss', "Angel's Kiss", 180, 'Wakes a friend who has run right out of standing up.',
    'Churches everywhere, and the Marbleford shop.', { effect: 'revive', pct: 0.5, target: 'fallen' }),
  con('homing_feather', 'Homing Feather', 40, 'Blow it and the wind carries you back to the last church.',
    'Shops from Port Pelican onward.', null, { warp: 'church' }),
  con('whiff_powder', 'Whiff Powder', 25, 'Monsters sneeze once and decide to be somewhere else.',
    'Shops from Port Pelican onward.', null, { encounterMult: 0.5, steps: 200 }),
  con('sunbottle', 'Sunbottle', 90, 'A summer afternoon, corked. Anyone at all can open it.',
    'Chests, and a runaway Quietling selling them out of a sack in Whistfell Abbey.',
    { effect: 'damageAll', amount: 60, element: 'fire', target: 'enemies' }),

  // ── seeds — permanent, tiny, found not bought ────────────────────────────────────────────────────────────────
  con('seed_of_life', 'Seed of Life', 0, 'Eat it and you are a little harder to knock over. For ever.',
    'Pots, barrels and chests. Never sold.', { effect: 'seed', stat: 'maxHp', amount: [3, 6], target: 'ally' }, { provisional: true }),
  con('seed_of_strength', 'Seed of Strength', 0, 'Bitter as anything, and then your arms mean it.',
    'Pots, barrels and chests. Never sold.', { effect: 'seed', stat: 'might', amount: [1, 3], target: 'ally' }, { provisional: true }),
  con('seed_of_swiftness', 'Seed of Swiftness', 0, 'You will find you have already stood up.',
    'Pots, barrels and chests. Never sold.', { effect: 'seed', stat: 'nimble', amount: [1, 3], target: 'ally' }, { provisional: true }),
  con('seed_of_wisdom', 'Seed of Wisdom', 0, 'Tastes of libraries. Do not ask how anyone knows that.',
    'Pots, barrels and chests. Never sold.', { effect: 'seed', stat: 'wis', amount: [1, 3], target: 'ally' }, { provisional: true }),

  // ── key items — CANON §6. Cannot be sold, dropped or lost. ──────────────────────────────────────────────────
  key('retreat_bell', 'Retreat Bell', 'Ring it and you are outside, blinking at the daylight.',
    'Given free in your first dungeon; another stands on a plinth outside every boss door.',
    { field: true, reusable: true, battle: null, effect: 'Walk out of any dungeon, even a boss room.' }),
  key('willows_ribbon', "Willow's Ribbon", 'Half a green ribbon. She has the other half, and she checks.',
    'Act I, B6 — tied on your wrist in the dark at Cobwell Manor.',
    { effect: 'Worn in every frame. Stops the Sunmane at B11b.' }),
  key('candle', 'Candle', 'A stub of candle. It makes the dark exactly one room smaller.',
    'Act I, Cobwell Manor, first floor.', { effect: 'Lights one room of the manor at a time.' }),
  key('music_box', 'Music Box', 'Three turns of the key and a lullaby nobody has taught you.',
    'Act I, B6, Cobwell Manor. There are three of them.', { effect: "Plays Queen Elowen's lullaby." }),
  key('papas_letter', "Papa's Letter", 'Father wrote it badly, on purpose, so it would not sound like goodbye.',
    "Act II, B12 — the Hollybank loft.", { readable: true, effect: "Reads Father's last letter aloud." }),
  key('mums_feather_hairpin', "Mum's Feather Hairpin", 'A Skyborne feather, bent from being worn every single day.',
    'Act II, B12 — the Hollybank loft. Queen Elowen asks for it back at B24.',
    { effect: 'A Skyborne feather. Proof, when proof is wanted.' }),
  key('ambergarde_crest', 'Ambergarde Crest', 'A little amber lark. Barty has carried it for ten years without saying so.',
    'Act II, B12 — Barty gives it to you. It opens Ambergarde Keep.',
    { effect: 'Opens the doors of Ambergarde Keep.' }),
  key('tide_pearl', 'Tide Pearl', 'It is cold, and it is faintly disappointed in the sea.',
    'Act II, B15 — the Sighing Grotto. Lord Rudolpho will not budge without it.',
    { effect: "Lord Rudolpho's one condition." }),
  key('marsh_lily', 'Marsh Lily', 'It smells of pond, and Bogwallop adores it.',
    'Act III — the Sogglemarsh. Bogwallop will only come if you are holding one.',
    { effect: 'Lets Bogwallop join the party.' }),
  key('stilt_boots', 'Stilt-Boots', 'Very silly. Very tall. Entirely necessary.',
    "Act III — Quaggerton's ferryman, for walking the Duckboard Causeway.",
    { effect: 'Walk the Duckboard Causeway into the Sogglemarsh.' }),
  key('wolfscarf', 'Wolfscarf', 'Knitted by somebody who has never met a blizzard and defeated one anyway.',
    'Act III — Coldcomfort. Lets you walk Wolfscarf Pass.',
    { effect: 'Walk through the Wolfscarf Pass blizzard.' }),
  key('emberbell', 'Emberbell', 'Shake it and the air around you remembers August.',
    'Act III — Coldcomfort, 300 G, or free if you fed Biscuit the dog.',
    { effect: 'Thaws the Glasswing Grotto door.' }),
  key('sunlarks_feather', "Sunlark's Feather", 'One feather, and it is warm, and it is still singing a little.',
    'The altar of Ambergarde Keep. Stolen at B19, returned at B25.',
    { effect: 'Proof of the Skyborne line.' }),

  // ── weapons — SYSTEMS §4.2 ──────────────────────────────────────────────────────────────────────────────────
  wpn('wooden_sword', 'Wooden Sword', 2, 0, ['hero'], 'Father made it. Badly. On purpose.',
    "The loft chest in Hollybank Cottage.", { noSell: true }),
  wpn('cypress_stick', 'Cypress Stick', 4, 10, ANY, 'A stick. A good one, but a stick.',
    'Puddlewick.'),
  wpn('sling', 'Sling', 7, 55, ['willow', 'linnet'], 'Willow can knock a pear off a wall with this at thirty paces.',
    'Puddlewick.'),
  wpn('copper_sword', 'Copper Sword', 11, 70, SWORD, 'Your first real sword. It goes green if you sulk.',
    'Puddlewick.'),
  wpn('kitchen_cleaver', 'Kitchen Cleaver', 14, 120, ['barty'], 'Barty is delighted. He says it is for onions. It is not for onions.',
    'Saltmarrow.'),
  wpn('oak_boomerang', 'Oak Boomerang', 16, 220, ['willow'], 'Hits everything out there, then comes home for tea.',
    'Saltmarrow.', { allEnemies: 0.65 }),
  wpn('chain_whip', 'Chain Whip', 22, 300, ['willow', 'sera'], 'Cracks like a joke nobody enjoys except you.',
    'Port Pelican.', { allEnemies: 0.75 }),
  wpn('iron_lance', 'Iron Lance', 28, 480, HEAVY, 'Long enough to keep the nastiness at arm’s length.',
    'Port Pelican.'),
  wpn('steel_sword', 'Steel Sword', 35, 900, SWORD, 'Proper steel. It rings when you draw it, and you will draw it far too often.',
    'Marbleford.'),
  wpn('woodcutters_axe', "Woodcutter's Axe", 41, 1150, ['barty'], 'Enormous. Slow. Absolutely final.',
    'Marbleford.', { agi: -4 }),
  wpn('ash_staff', 'Ash Staff', 18, 700, ['sera', 'linnet', 'elowen'], 'Not much use for hitting. Marvellous for thinking.',
    'Marbleford.', { wis: 12 }),
  wpn('frostbite_sabre', 'Frostbite Sabre', 48, 2400, SWORD, 'The blade is cold, the handle is cold, your opinions are cold.',
    'Coldcomfort.', { elementBonus: { ice: 0.25 } }),
  wpn('thunderfork', 'Thunderfork', 54, 3600, ['barty', 'hero'], 'Three prongs, one very bad afternoon for somebody.',
    'Highfeather.', { stun: 0.12 }),
  wpn('halvards_greatsword', "Halvard's Greatsword", 66, 0, ['hero'], 'He carried it like a walking stick. It is heavier than that.',
    'Act III, B20 — leaning on the plinth in the Stone Garden.', { noSell: true, key: true }),
  wpn('larksteel_sword', 'Larksteel Sword', 74, 0, ['rowan'], 'It has waited in that stone for a very small boy with the right blood.',
    'Act III, B21 — drawn from the stone in Ambergarde Keep.',
    { noSell: true, key: true, elementBonus: { lightning: 0.25 } }),

  // ── armour — SYSTEMS §4.3 ───────────────────────────────────────────────────────────────────────────────────
  arm('wayfarers_clothes', "Wayfarer's Clothes", 4, 20, ANY, 'Clothes for walking a long way in.',
    'Puddlewick. Bram starts in a pair.'),
  arm('quilted_coat', 'Quilted Coat', 9, 90, ANY, 'Somebody quilted this while worrying about you.',
    'Saltmarrow.', { resil: 2 }),
  arm('leather_jerkin', 'Leather Jerkin', 15, 210, ANY, 'Creaks honestly. Smells of the tannery and the sea.',
    'Saltmarrow.'),
  arm('cooks_apron', "Cook's Apron", 18, 260, ['barty'], 'Barty will not fight without it, and frankly he is right.',
    'Port Pelican.', { maxHp: 10 }),
  arm('chain_mail', 'Chain Mail', 24, 560, ANY, 'Two thousand little rings, all holding hands.',
    'Port Pelican.', { agi: -2 }),
  arm('silk_robe', 'Silk Robe', 19, 640, MAGES, 'Light as a rumour, and spells slide right off it.',
    'Marbleford.', { mdef: 8 }),
  arm('iron_armour', 'Iron Armour', 33, 1100, HEAVY, 'You will not be hurried, and neither will anything you meet.',
    'Marbleford.', { agi: -4 }),
  arm('fur_cloak', 'Fur Cloak', 38, 1900, ANY, 'Enormously warm. You will be the only cheerful thing in the Frostbottom.',
    'Coldcomfort.', { halves: ['ice'] }),
  arm('gleaming_plate', 'Gleaming Plate', 47, 3200, HEAVY, 'You can see your own worried face in it.',
    'Highfeather.', { agi: -5 }),
  arm('elowens_shawl', "Elowen's Shawl", 30, 0, ANY, 'It moves as though there were a wind indoors. Nothing frightening can get near it.',
    "Act III, B24 — Queen Elowen's gift.", { mdef: 20, immune: ['fear'], noSell: true, key: true }),
  arm('larkweave_cloak', 'Larkweave Cloak', 40, 0, ['linnet'], 'Woven from feathers and daylight. Magic gets bored halfway through it.',
    'Act III, B23 — Highfeather.', { mdef: 30, spellGuard: 0.5, noSell: true, key: true }),

  // ── shields — SYSTEMS §4.4 ──────────────────────────────────────────────────────────────────────────────────
  shd('pot_lid', 'Pot Lid', 3, 25, ANY, 'It was a pot lid this morning. Barty would like it back.',
    'Puddlewick.'),
  shd('leather_shield', 'Leather Shield', 8, 130, ANY, 'Boiled leather, and a boss you can polish on your sleeve.',
    'Saltmarrow.'),
  shd('iron_shield', 'Iron Shield', 16, 480, HEAVY, 'Heavy enough that hiding behind it is a real plan.',
    'Port Pelican.'),
  shd('mirror_shield', 'Mirror Shield', 25, 1700, SWORD, 'Casts a spell straight back at whoever started it.',
    'Marbleford.', { reflect: ['wobble', 'snoozle', 'sleep'] }),
  shd('dragon_scale_shield', 'Dragon-scale Shield', 34, 4000, HEAVY, 'Scales off something that stopped minding fire a long time ago.',
    'Highfeather.', { halves: ['fire'] }),
  shd('larksteel_shield', 'Larksteel Shield', 38, 0, ['rowan'], 'Cold on one side, warm on the other, and never the wrong way round.',
    'Act III, B22 — the Glasswing Grotto.', { noSell: true, key: true, halves: ['fire', 'ice'] }),

  // ── helms — SYSTEMS §4.4 ────────────────────────────────────────────────────────────────────────────────────
  hlm('straw_hat', 'Straw Hat', 2, 18, ANY, 'Keeps the sun off. Keeps almost nothing else off.',
    'Puddlewick.'),
  hlm('leather_cap', 'Leather Cap', 6, 95, ANY, 'Snug, and it squashes your hair into a shape you did not choose.',
    'Saltmarrow.'),
  hlm('iron_helm', 'Iron Helm', 14, 620, HEAVY, 'Everything anybody says to you sounds like it is happening in a bucket.',
    'Marbleford.'),
  hlm('wide_awake_crown', 'Wide-Awake Crown', 21, 2600, ANY, 'You could not nod off in this if somebody read you the tax rolls.',
    'Coldcomfort.', { immune: ['sleep'] }),
  hlm('larksteel_helm', 'Larksteel Helm', 26, 0, ['rowan'], 'A wedding present, kept in a box for nine years, and it fits him exactly.',
    'Act III — given at the wedding, B17.', { noSell: true, key: true, immune: ['confuse'] }),

  // ── accessories — SYSTEMS §4.5 + CANON §6 ───────────────────────────────────────────────────────────────────
  acc('lucky_acorn', 'Lucky Acorn', 300, ANY, 'An acorn that has already survived one winter and rather fancies its chances.',
    "Saltmarrow's odd little shop.", { luck: 8 }),
  acc('swiftfoot_anklet', 'Swiftfoot Anklet', 900, ANY, 'Your feet start before the rest of you has agreed to go.',
    'Port Pelican.', { agi: 10 }),
  acc('ring_of_patience', 'Ring of Patience', 2200, ANY, 'Magic comes back to you while you are busy waiting.',
    'Marbleford.', { mpRegen: 2 }),
  acc('pips_bell', "Pip's Bell", 0, ANY, 'A tiny brass bell a kitten outgrew. Most monsters hear it and remember an appointment.',
    'Act I, B11b — Pip drops it at your feet when he comes home.',
    { encounterMult: 0.65, noSell: true, key: true }),
  acc('charm_bell', 'Charm Bell', 0, ANY, 'Rings once, very sweetly, and monsters start wondering what you are like.',
    'Optional — the Bellhollow Belfry, Act II.', { recruitMult: 1.5, noSell: true, key: true }),
  acc('osrics_wooden_bird', "Osric's Wooden Bird", 0, ANY, 'Osric made this. It took a year.',
    'Act II, the first morning in the Quiet Quarry.', { def: 2, noSell: true, key: true }),
  acc('silver_waltz_charm', 'Silver Waltz-Charm', 0, ANY, 'Somebody was finally allowed to go home.',
    'Cobwell Manor, after Ottilie the Waiting Bride gets her dance.', { luck: 5, noSell: true, key: true }),
  acc('sock_of_considerable_power', 'The Sock of Considerable Power', 0, ANY, 'The wearer hums. They cannot help it and they do not want to.',
    'Find all eleven socks in pots, barrels and wardrobes.', { agi: 6, luck: 12, noSell: true, key: true }),
];

/** Every item in the game, keyed by its forever-id. Plain data: JSON.stringify(ITEMS) is a save-safe dump. */
export const ITEMS = Object.fromEntries(ROWS.map((r) => [r.id, r]));

/** The same rows in table order (consumables, seeds, keys, weapons, armour, shields, helms, trinkets). */
export const ITEM_LIST = ROWS;

export const KINDS = ['consumable', 'key', 'weapon', 'armour', 'shield', 'helm', 'accessory'];
export const KIND_NAMES = {
  consumable: 'Things to use', key: 'Important things', weapon: 'Weapons',
  armour: 'Armour', shield: 'Shields', helm: 'Hats and helms', accessory: 'Trinkets',
};
/** The five equipment slots, in the order the Equip window shows them (matches P13's SLOT_LIST). */
export const SLOTS = [
  ['weapon', 'Weapon'], ['armour', 'Armour'], ['shield', 'Shield'], ['helm', 'Hat'], ['accessory', 'Trinket'],
];
/** Every stat an item may move, with the words a child reads and whether up is good. */
export const STAT_WORDS = [
  ['power', 'Attack', 1], ['def', 'Defence', 1], ['mdef', 'Magic guard', 1], ['agi', 'Nimble', 1],
  ['wis', 'Wisdom', 1], ['luck', 'Luck', 1], ['resil', 'Resilience', 1],
  ['maxHp', 'Max HP', 1], ['maxMp', 'Max MP', 1], ['mpRegen', 'MP each round', 1],
];

// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
// helpers — the only code in this file
// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
/** The row for an id (or a row straight through). Never throws; unknown ids give null. */
export function item(id) {
  if (!id) return null;
  if (typeof id === 'object') return id.id && ITEMS[id.id] ? ITEMS[id.id] : id;
  return ITEMS[id] || null;
}
export const itemName = (id) => { const it = item(id); return it ? it.name : String(id || '—'); };

/** Cannot be sold, dropped or thrown away (CANON §6). */
export const isKey = (id) => { const it = item(id); return !!(it && (it.kind === 'key' || it.key || it.noSell)); };
export const isGear = (id) => { const it = item(id); return !!(it && it.slot); };

/**
 * SYSTEMS §5: sell is floor(buy / 2) — and gear two tiers below your current best sells at 65% instead, so
 * upgrading never feels like burning money. Nothing ever sells for more than it cost. Key items sell for nothing.
 */
export function sellPrice(id, { outgrown = false } = {}) {
  const it = item(id);
  if (!it || isKey(it) || !(it.buy > 0)) return 0;
  return Math.floor(it.buy * (outgrown && it.slot ? 0.65 : 0.5));
}

export const byKind = (kind) => ROWS.filter((r) => r.kind === kind);
export const bySlot = (slot) => ROWS.filter((r) => r.slot === slot);
/** Everything a shop could stock: has a price and is not a keepsake. */
export const buyable = () => ROWS.filter((r) => r.buy > 0 && !isKey(r));

/** Can this character put this on? 'anyone' means any of the family (guests and monsters never equip). */
export function canEquip(id, charId) {
  const it = item(id);
  if (!it || !it.slot) return false;
  if (!charId) return true;
  const who = it.who;
  if (!who || who === 'anyone') return true;
  return Array.isArray(who) ? who.includes(charId) : who === charId;
}
/** Everything this character could wear in this slot, worst first. */
export const equipOptions = (charId, slot) =>
  bySlot(slot).filter((r) => canEquip(r, charId)).sort((a, b) => (a.power || a.def || 0) - (b.power || b.def || 0));

/** Who can hold it, in words: 'Anyone' or 'Bram, Rowan'. `names` maps char id -> display name. */
export function whoWords(id, names = DEFAULT_NAMES) {
  const it = item(id);
  if (!it) return '—';
  if (it.kind === 'key') return 'In the bag';
  if (!it.slot) return 'Anyone';
  const who = it.who;
  if (!who || who === 'anyone') return 'Anyone';
  const list = Array.isArray(who) ? who : [who];
  return list.map((c) => names[c] || c).join(', ');
}
export const DEFAULT_NAMES = {
  hero: 'Bram', willow: 'Willow', sera: 'Sera', barty: 'Barty',
  rowan: 'Rowan', linnet: 'Linnet', elowen: 'Elowen',
};

/** Every number this thing changes, as ['Attack', +11] pairs — the Equip window's green ▲ / red ▼ list. */
export function statPairs(id) {
  const it = item(id);
  if (!it) return [];
  const out = [];
  for (const [k, label] of STAT_WORDS) if (typeof it[k] === 'number' && it[k] !== 0) out.push([label, it[k], k]);
  return out;
}
/** The same thing on one line: '+11 Attack' / '+24 Defence, -2 Nimble'. Empty string if it changes nothing. */
export const statLine = (id) =>
  statPairs(id).map(([label, n]) => `${n > 0 ? '+' : '−'}${Math.abs(n)} ${label}`).join(', ');

/** The extra things a row does that are not a number — 'Hits every monster', 'Halves fire'. */
export function traitWords(id) {
  const it = item(id);
  if (!it) return [];
  const out = [];
  if (it.effect) out.push(it.effect.replace(/\.$/, ''));
  const b = it.battle;
  if (b && b.effect === 'heal') out.push(b.amount === 'full' ? 'Heals all the way' : `Heals ${b.amount} HP`);
  if (b && b.effect === 'mp') out.push(`Gives back ${b.amount} MP`);
  if (b && b.effect === 'cure') out.push(`Cures ${b.statuses.join(' and ')}`);
  if (b && b.effect === 'revive') out.push(`Wakes a fallen friend at ${Math.round(b.pct * 100)}% HP`);
  if (b && b.effect === 'damageAll') out.push(`${b.amount} ${b.element} damage to every monster`);
  if (b && b.effect === 'seed') {
    const words = { maxHp: 'Max HP', maxMp: 'Max MP', might: 'Might', nimble: 'Nimble', wis: 'Wisdom', resil: 'Resilience', luck: 'Luck' };
    const a = Array.isArray(b.amount) ? `${b.amount[0]}\u2013${b.amount[1]}` : String(b.amount);
    out.push(`${words[b.stat] || b.stat} up ${a}, for ever`);
  }
  if (it.warp === 'church') out.push('Takes the party back to the last church');
  if (it.allEnemies) out.push(`Hits every monster at ${Math.round(it.allEnemies * 100)}% power`);
  if (it.stun) out.push(`${Math.round(it.stun * 100)}% chance to root a monster for a round`);
  if (it.elementBonus) for (const [el, n] of Object.entries(it.elementBonus)) out.push(`${el} magic hits ${Math.round(n * 100)}% harder`);
  if (it.spellGuard) out.push(`Halves all spell damage`);
  if (it.halves) out.push(`Halves ${it.halves.join(' and ')} damage`);
  if (it.immune) out.push(`Never ${it.immune.map((s) => (s === 'sleep' ? 'falls asleep' : s === 'confuse' ? 'gets muddled' : `feels ${s}`)).join(' or ')}`);
  if (it.reflect) out.push('Reflects Wobble and Snoozle back at the caster');
  if (it.encounterMult) {
    out.push(`Monsters find you ${Math.round((1 - it.encounterMult) * 100)}% less often`
      + (it.steps ? `, for ${it.steps} steps` : ''));
  }
  if (it.recruitMult) out.push(`Monsters are ${it.recruitMult}x keener to join you`);
  if (it.reusable) out.push('Use it as often as you like');
  if (it.readable) out.push('Can be read again any time');
  if (isKey(it)) out.push('Cannot be sold or dropped');
  return out;
}

/** Everything a window needs about one row, in one call. */
export function describe(id, names) {
  const it = item(id);
  if (!it) return null;
  return {
    id: it.id, name: it.name, kind: it.kind, slot: it.slot || null,
    blurb: it.blurb, where: it.where,
    buy: it.buy || 0, sell: sellPrice(it),
    stats: statLine(it), traits: traitWords(it), who: whoWords(it, names),
  };
}

/** A tiny health report a critic (and __DQ) can read: counts, and anything missing its words. */
export function audit() {
  const missing = ROWS.filter((r) => !r.blurb || !r.where).map((r) => r.id);
  const counts = {};
  for (const k of KINDS) counts[k] = byKind(k).length;
  const dupes = ROWS.map((r) => r.id).filter((id, i, a) => a.indexOf(id) !== i);
  return {
    total: ROWS.length, counts, equippable: ROWS.filter((r) => r.slot).length,
    buyable: buyable().length, keys: ROWS.filter((r) => isKey(r)).length,
    missingWords: missing, duplicateIds: dupes,
    priciest: ROWS.reduce((a, b) => (b.buy > a.buy ? b : a)).id,
  };
}

// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
// LIVE — hand the table to the running game
// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
/**
 * Swap this table into every window that reads items. src/ui/menu.js exposes `Menu.useData({items})` for exactly
 * this (its header: "swaps in src/data/items.js the day P21 lands"), and the bag/pockets/equip windows re-read it
 * at once. Safe to call twice; never throws.
 */
export function wire(Menu) {
  const out = { menu: false, items: ROWS.length };
  try {
    if (Menu && typeof Menu.useData === 'function') { Menu.useData({ items: ITEMS }); out.menu = true; }
  } catch (_) { /* a menu mid-edit must never stop the game booting */ }
  return out;
}

/**
 * Plugin entry point (docs/ARCHITECTURE.md "Scene plugins"). `install(ctx)` wires the table into the menu, gives
 * __DQ a working `give` and an `items` report, and adds the critic controls. Harmless if anything is missing.
 */
export function install(ctx = {}) {
  const { Debug } = ctx;
  const report = { wired: false, total: ROWS.length };

  import('../ui/menu.js').then((m) => { report.wired = wire(m.Menu).menu; }, () => {});

  if (Debug && typeof Debug.provide === 'function') {
    try { Debug.provide('items', () => ({ ...audit(), wired: report.wired })); } catch (_) { /* ignore */ }
  }
  // __DQ.give: only if nobody has implemented it yet. src/battle/scene.js (P14) already owns a good one against
  // the one shared bag; this is the fallback for a build where the battle scene is not installed.
  let giveIsStub = false;
  try { giveIsStub = ((globalThis.__DQ.state().stubs) || []).includes('give'); } catch (_) { giveIsStub = false; }
  if (giveIsStub && Debug && typeof Debug.implement === 'function') {
    try {
      Debug.implement('give', (id, n = 1) => {
        const it = item(id);
        if (!it) return { ok: false, reason: `no item "${id}"`, ids: ROWS.length };
        return import('../battle/scene.js').then(({ Roster }) => {
          if (!Roster || !Roster.bag) return { ok: false, reason: 'no bag yet' };
          Roster.bag[it.id] = (Roster.bag[it.id] || 0) + Math.max(1, n | 0);
          return { ok: true, item: it.id, name: it.name, have: Roster.bag[it.id] };
        }, () => ({ ok: false, reason: 'no roster' }));
      });
    } catch (_) { /* ignore */ }
  }
  if (Debug && typeof Debug.expose === 'function') {
    try {
      Debug.expose('items', (id) => (id ? describe(id) : ITEM_LIST.map((r) => r.id)));
      Debug.expose('itemAudit', () => audit());
    } catch (_) { /* ignore */ }
  }
  return report;
}

export default ITEMS;
