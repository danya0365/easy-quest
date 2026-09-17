// tests/battle/areas.js — the areas of docs/WORLD-BIBLE.md in CANON story order, each with the party a child who
// never grinds would plausibly have there (CANON §4 beats + level targets, SYSTEMS §2.4 guests, SYSTEMS §8 "at most
// 4 before the wagon"), an encounter table (MONSTER-BIBLE "Where" lines + CANON §8 tiers) and its SYSTEMS §5
// economy leg (battles walking through, gold per battle, the big buy at the end).
// Shared by tests/battle/sim.mjs and demos/P14.html. Encounter tables belong to P31; these are plausible drafts.

import { newMember } from '../../src/data/growth.js';

const W = (weapon, armour, shield, helm, accessory) => ({ weapon, armour, shield, helm, accessory });

/** SYSTEMS §5 economy table: [battles walking through, average gold per battle, big buy, price]. */
export const LEGS = {
  1: { walk: 10, gold: 6, buy: 'Copper Sword', price: 70 },
  2: { walk: 12, gold: 11, buy: 'Quilted Coat + Herbs', price: 114 },
  3: { walk: 14, gold: 18, buy: 'Oak Boomerang', price: 220 },
  4: { walk: 13, gold: 28, buy: 'Chain Whip', price: 300 },
  5: { walk: 15, gold: 42, buy: 'Iron Lance + Iron Shield', price: 960 },
  6: { walk: 14, gold: 66, buy: 'Steel Sword', price: 900 },
  7: { walk: 16, gold: 108, buy: 'Iron Armour + Mirror Shield', price: 2800 },
  8: { walk: 15, gold: 168, buy: 'Frostbite Sabre', price: 2400 },
  9: { walk: 16, gold: 248, buy: 'Gleaming Plate + Thunderfork', price: 6800 },
  10: { walk: 18, gold: 355, buy: 'Dragon-scale Shield', price: 4000 },
};

/** Build a party list at a level. spec entries: [id, lvlOffset | 'fixedLvl', equip, extra] */
function build(specs, lvl) {
  return specs.map(([id, off = 0, equip = {}, extra = {}]) => {
    const L = typeof off === 'string' ? Number(off) : Math.max(1, Math.min(30, lvl + off));
    const m = newMember(id, L, { ...extra });
    if (m.kind !== 'guest') m.equip = Object.fromEntries(Object.entries(equip).filter(([, v]) => v));
    return m;
  });
}

const ACT3 = (L, { rowanOff = -3, linnetOff = -3, bram, rowan, linnet, barty, extra = [] } = {}) => build([
  ['hero', 0, bram || W('halvards_greatsword', 'iron_armour', 'mirror_shield', 'iron_helm', 'osrics_wooden_bird')],
  ['rowan', rowanOff, rowan || W('larksteel_sword', 'chain_mail', 'iron_shield', 'larksteel_helm'), { mother: 'willow' }],
  ['linnet', linnetOff, linnet || W('ash_staff', 'silk_robe', null, 'leather_cap'), { mother: 'willow' }],
  ['barty', 0, barty || W('woodcutters_axe', 'iron_armour', 'iron_shield', 'iron_helm')],
  ...extra,
], L);

export const AREAS = [
  // ------------------------------------------------------------------------------------------------ Act I
  {
    id: 'long_lane', name: 'Puddlewick Vale & the Long Lane', act: 1, beat: 'B3', leg: 1, tier: 1, levels: [1, 2, 4],
    note: 'First battles with Papa as guest; Bobble joins at Lv 1.',
    party: (L) => build([['hero', 0, W('wooden_sword', 'wayfarers_clothes')], ['halvard'], ['bobble', -1]], L),
    table: [['gloop', 5], ['peckish', 4], ['bloop', 3], ['flapjack', 2], ['grumpleroot', 2], ['bumbleblunder', 2], ['toadstooligan', 1]],
    group: [1, 3], bag: { herb: 3 },
  },
  {
    id: 'long_lane_alone', name: 'Long Lane — Bram alone (stress)', act: 1, beat: '—', leg: 1, tier: 1, levels: [1, 2, 3], stress: true,
    note: 'Never happens in the story (Papa is always there). Tests the floor for a lone six-year-old hero.',
    party: (L) => build([['hero', 0, W('wooden_sword', 'wayfarers_clothes')]], L),
    table: [['gloop', 5], ['peckish', 4], ['bloop', 3], ['flapjack', 2], ['grumpleroot', 2], ['bumbleblunder', 2], ['toadstooligan', 1]],
    group: [1, 2], walk: 6, bag: { herb: 2 },
  },
  {
    id: 'saltmarrow_coast', name: 'Saltmarrow Coast', act: 1, beat: 'B4–B7', leg: 2, tier: 2, levels: [3, 5, 6],
    party: (L) => build([['hero', 0, W('copper_sword', 'wayfarers_clothes', 'pot_lid', 'straw_hat')], ['halvard'], ['bobble', -1]], L),
    table: [['crabbit', 4], ['peckish', 2], ['gloop', 2], ['batterfly', 2], ['grumbleglop', 1], ['bumbleblunder', 2]],
    group: [1, 3], bag: { herb: 4 },
  },
  {
    id: 'whispering_wood', name: 'The Whispering Wood (the children, no Papa)', act: 1, beat: 'B5–B6', leg: 2, tier: 2, levels: [4, 5, 6],
    note: 'Bram, Willow and Sera as children (their own Lv 3 rows), and Bobble.',
    party: (L) => build([['hero', 0, W('copper_sword', 'quilted_coat', 'pot_lid', 'straw_hat')], ['willow_child'], ['sera_child'], ['bobble', -1]], L),
    table: [['toadstooligan', 4], ['twiglet', 2], ['batterfly', 2], ['hoot_couture', 2], ['grumpleroot', 2], ['flapjack', 2], ['sir_gloopalot', 1]],
    group: [1, 3], bag: { herb: 4 },
  },
  {
    id: 'cobwell_manor', name: 'Cobwell Manor', act: 1, beat: 'B6', leg: 3, tier: 2, levels: [5, 6, 7], wagonReachable: false,
    note: 'No adults. Pip is found in a hatbox near the end; before the wagon the party is at most four.',
    party: (L) => build([['hero', 0, W('copper_sword', 'quilted_coat', 'pot_lid', 'straw_hat')], ['willow_child'], ['sera_child'], ['bobble', -1]], L),
    table: [['boohoo', 4], ['flapjack', 3], ['toadstooligan', 2], ['chestnut', 0.5]],
    group: [1, 3], bag: { herb: 5 },
    boss: { enemies: ['mumbleroot'], level: 6, note: 'the belfry' },
  },
  {
    id: 'coddleston_downs', name: 'Coddleston Downs & Moor', act: 1, beat: 'B8', leg: 3, tier: 2, levels: [6, 7, 8],
    party: (L) => build([['hero', 0, W('copper_sword', 'quilted_coat', 'leather_shield', 'leather_cap')], ['halvard'], ['bobble', -1], ['pip', -2]], L),
    table: [['twiglet', 2], ['sir_gloopalot', 2], ['hoot_couture', 2], ['batterfly', 2], ['quietling', 2], ['toadstooligan', 2]],
    group: [1, 3], bag: { herb: 5 },
  },
  // ------------------------------------------------------------------------------------------------ Act II
  {
    id: 'whistling_caves', name: 'The Whistling Caves', act: 2, beat: 'B11', leg: 4, tier: 3, levels: [9, 10, 11], wagonReachable: false,
    note: 'Out of the quarry with Act I\'s bag (Digby dug up the strongbox), Bertie as guest, Digby.',
    party: (L) => build([['hero', 0, W('copper_sword', 'quilted_coat', 'leather_shield', 'leather_cap', 'osrics_wooden_bird')], ['bertie'], ['digby', -1]], L),
    table: [['flapjack', 4], ['barrowmole', 3], ['candelabracadabra', 1], ['clankworthy', 1], ['jinglebottom', 1], ['glimmergloop', 0.05]],
    group: [1, 2], bag: { herb: 5 },
  },
  {
    id: 'frittering_sands', name: 'The Frittering Sands (round Parchmouth)', act: 2, beat: 'B11', leg: 4, tier: 3, levels: [10, 11, 13],
    note: 'Bertie has gone home; Bobble was waiting at the cave mouth.',
    party: (L) => build([['hero', 0, W('copper_sword', 'leather_jerkin', 'leather_shield', 'leather_cap', 'osrics_wooden_bird')], ['digby', -1], ['bobble', 0]], L),
    table: [['cactuddle', 3], ['dune_buggy', 3], ['barrowmole', 2], ['jinglebottom', 1], ['glimmergloop', 0.05]],
    group: [1, 2], bag: { herb: 6 },
  },
  {
    id: 'gogglestone_caves', name: 'Gogglestone Caves (the Sunmane)', act: 2, beat: 'B11b', leg: 4, tier: 2, levels: [11, 12, 13], wagonReachable: false,
    party: (L) => build([['hero', 0, W('copper_sword', 'leather_jerkin', 'leather_shield', 'leather_cap', 'osrics_wooden_bird')], ['bobble', 0], ['digby', -1]], L),
    table: [['flapjack', 3], ['toadstooligan', 2], ['grumbleglop', 3], ['barrowmole', 2], ['crabbit', 1]],
    group: [1, 3], walk: 10, bag: { herb: 6 },
    boss: { enemies: ['sunmane'], level: 11 },
  },
  {
    id: 'sogglemarsh', name: 'The Sogglemarsh & Pelican Coast', act: 2, beat: 'B13–B14', leg: 5, tier: 3, levels: [12, 13, 15],
    note: 'The wagon is back (B12): Barty and Pip join; Digby rides.',
    party: (L) => build([
      ['hero', 0, W('copper_sword', 'chain_mail', 'leather_shield', 'leather_cap', 'osrics_wooden_bird')],
      ['barty', 0, W('kitchen_cleaver', 'cooks_apron', 'pot_lid', 'leather_cap')], ['pip', 0], ['bobble', -1], ['digby', -1]], L),
    table: [['grumbleglop', 4], ['toadstooligan', 2], ['crabbit', 3], ['batterfly', 2], ['boohoo', 1]],
    group: [1, 3], bag: { herb: 6 },
    boss: { enemies: ['bogwallop'], level: 12, wagonReachable: false },
  },
  {
    id: 'marbleford_downs', name: 'Marbleford Downs', act: 2, beat: 'B14', leg: 6, tier: 3, levels: [13, 14, 16],
    party: (L) => build([
      ['hero', 0, W('iron_lance', 'chain_mail', 'iron_shield', 'leather_cap', 'osrics_wooden_bird')],
      ['barty', 0, W('kitchen_cleaver', 'cooks_apron', 'leather_shield', 'leather_cap')], ['pip', 0], ['bobble', -1], ['digby', -1]], L),
    table: [['boulderdash', 2], ['sir_gloopalot', 3], ['hoot_couture', 2], ['clankworthy', 2], ['twiglet', 2], ['glimmergloop', 0.06]],
    group: [1, 3], bag: { herb: 6, strong_herb: 2 },
  },
  {
    id: 'bellhollow_belfry', name: 'Bellhollow Belfry (Sexton Sootbell)', act: 2, beat: 'opt', leg: 6, tier: 2, levels: [14, 15, 16], wagonReachable: false,
    party: (L) => build([
      ['hero', 0, W('steel_sword', 'chain_mail', 'iron_shield', 'leather_cap', 'osrics_wooden_bird')],
      ['barty', 0, W('iron_lance', 'cooks_apron', 'iron_shield', 'leather_cap')], ['pip', 0], ['bobble', -1]], L),
    table: [['boohoo', 4], ['flapjack', 3], ['candelabracadabra', 1]],
    group: [1, 3], bag: { herb: 6, strong_herb: 2 },
    boss: { enemies: ['sexton_sootbell'], level: 14 },
  },
  {
    id: 'sighing_grotto', name: 'The Sighing Grotto', act: 2, beat: 'B15', leg: 7, tier: 4, levels: [17, 18, 19], wagonReachable: false,
    note: 'Willow volunteers as a grown guest at the party\'s level, for this dungeon only.',
    party: (L) => build([
      ['hero', 0, W('steel_sword', 'chain_mail', 'iron_shield', 'iron_helm', 'osrics_wooden_bird')], ['willow_grown', 0],
      ['barty', 0, W('woodcutters_axe', 'cooks_apron', 'iron_shield', 'iron_helm')], ['pip', -1], ['bobble', -2], ['digby', -2]], L),
    table: [['squidgeon', 3], ['crabbit', 3], ['flapjack', 2], ['grumbleglop', 2], ['candelabracadabra', 1]],
    group: [1, 2], bag: { herb: 4, strong_herb: 5 },
    boss: { enemies: ['tidewarden'], level: 18 },
  },
  // ------------------------------------------------------------------------------------------------ Act III
  {
    id: 'glasswing_grotto', name: 'The Frostbottom & Glasswing Grotto', act: 3, beat: 'B22', leg: 8, tier: 4, levels: [22, 23, 25], wagonReachable: false,
    note: 'Bram, the twins (catching up, mother = Willow), Barty; Pip and Bobble wait in the wagon.',
    party: (L) => ACT3(L, { rowanOff: -4, linnetOff: -4, extra: [['pip', -1], ['bobble', -2]] }),
    table: [['lady_mothbonnet', 3], ['grimalkitten', 2], ['boulderdash', 2], ['gloopold', 1], ['squidgeon', 1]],
    group: [1, 2], bag: { strong_herb: 6, honeycake: 1 },
    boss: { enemies: ['hoarfax'], level: 23 },
  },
  {
    id: 'grey_ruins', name: 'The Grey Ruins', act: 3, beat: 'B22', leg: 8, tier: 4, levels: [22, 23, 25],
    party: (L) => ACT3(L, { rowan: W('larksteel_sword', 'chain_mail', 'larksteel_shield', 'larksteel_helm'), extra: [['pip', -1], ['bobble', -2]] }),
    table: [['sir_cumference', 2], ['lady_mothbonnet', 2], ['grimalkitten', 3], ['candelabracadabra', 2], ['quietling', 1]],
    group: [1, 2], bag: { strong_herb: 6, honeycake: 1 },
  },
  {
    id: 'quiet_quarry', name: 'The Quiet Quarry (setting it free)', act: 3, beat: 'B22', leg: 8, tier: 4, levels: [23, 24, 25], wagonReachable: false,
    party: (L) => ACT3(L, { rowanOff: -2, linnetOff: -2, rowan: W('larksteel_sword', 'chain_mail', 'larksteel_shield', 'larksteel_helm'), extra: [['pip', -1], ['bobble', -2]] }),
    table: [['quietling', 3], ['barrowmole', 2], ['clankworthy', 2], ['boulderdash', 2]],
    group: [1, 3], bag: { strong_herb: 6, honeycake: 1 },
    boss: { enemies: ['iron_governess'], level: 24 },
  },
  {
    id: 'highfeather', name: "Highfeather's cloud road", act: 3, beat: 'B23', leg: 9, tier: 4, levels: [23, 24, 25],
    party: (L) => ACT3(L, { rowanOff: -2, linnetOff: -2, bram: W('halvards_greatsword', 'iron_armour', 'mirror_shield', 'wide_awake_crown', 'osrics_wooden_bird'),
      rowan: W('larksteel_sword', 'iron_armour', 'larksteel_shield', 'larksteel_helm'), linnet: W('ash_staff', 'larkweave_cloak', null, 'leather_cap'),
      extra: [['pip', -1], ['bobble', -2]] }),
    table: [['thunderpuff', 3], ['mirthquake', 2], ['squidgeon', 1], ['gloopold', 1]],
    group: [1, 2], bag: { strong_herb: 6, fresh_herb: 1, honeycake: 1 },
  },
  {
    id: 'whistfell_abbey', name: 'Whistfell Abbey', act: 3, beat: 'B24', leg: 10, tier: 5, levels: [24, 25, 26], wagonReachable: false,
    party: (L) => ACT3(L, { rowanOff: -1, linnetOff: -1, bram: W('halvards_greatsword', 'gleaming_plate', 'mirror_shield', 'wide_awake_crown', 'osrics_wooden_bird'),
      rowan: W('larksteel_sword', 'iron_armour', 'larksteel_shield', 'larksteel_helm'), linnet: W('ash_staff', 'larkweave_cloak', null, 'leather_cap'),
      barty: W('thunderfork', 'gleaming_plate', 'iron_shield', 'iron_helm'), extra: [['pip', -1], ['bobble', -2]] }),
    table: [['hexcalibur', 2], ['vesperling', 2], ['wyrmsley', 2], ['clankworthy', 2], ['jinglebottom', 1], ['quietling', 1]],
    group: [1, 2], bag: { strong_herb: 5, fresh_herb: 2, honeycake: 2 },
    boss: { enemies: ['hush', 'hark'], level: 25 },
  },
  {
    id: 'quiet_deep', name: 'The Quiet Deep', act: 3, beat: 'B25', leg: 10, tier: 5, levels: [26, 27, 28], wagonReachable: false,
    note: 'Queen Elowen has joined at the party\'s level (B24).',
    party: (L) => build([
      ['hero', 0, W('halvards_greatsword', 'gleaming_plate', 'dragon_scale_shield', 'wide_awake_crown', 'osrics_wooden_bird')],
      ['rowan', -1, W('larksteel_sword', 'gleaming_plate', 'larksteel_shield', 'larksteel_helm'), { mother: 'willow' }],
      ['linnet', -1, W('ash_staff', 'larkweave_cloak', null, 'leather_cap'), { mother: 'willow' }],
      ['elowen', -1, W('ash_staff', 'elowens_shawl')],
      ['barty', 0, W('thunderfork', 'gleaming_plate', 'iron_shield', 'iron_helm')], ['pip', -1]], L),
    table: [['hexcalibur', 2], ['vesperling', 2], ['mirthquake', 2], ['quietling', 1]],
    group: [1, 2], bag: { strong_herb: 4, fresh_herb: 4, honeycake: 3 },
    boss: { enemies: ['mortmain'], level: 27 },
    boss2: { enemies: ['malgrim_cocoon'], level: 28, note: 'after Mortmain kneels; the Tobin beat between' },
  },
];

for (const a of AREAS) {
  const leg = LEGS[a.leg];
  a.walk = a.walk || leg.walk;
  a.goldTarget = leg.gold;
  a.nextBuy = { name: leg.buy, price: leg.price };
}

export const AREA_BY_ID = Object.fromEntries(AREAS.map((a) => [a.id, a]));

/** Roll an encounter for an area: [monsterId, ...]. Group size from the area, or the monster's own group. */
export function rollEncounter(area, rng, monsters) {
  const pick = rng.weighted(area.table, ([, w]) => w)[0];
  const g = (monsters[pick] && monsters[pick].group) || area.group || [1, 3];
  const n = rng.int(g[0], g[1]);
  const out = [pick];
  for (let i = 1; i < n; i++) {
    // mixed groups: 60% same species, 40% another from the table (never a second rare)
    const other = rng.weighted(area.table.filter(([, w]) => w >= 1), ([, w]) => w)[0];
    out.push(rng.chance(0.6) || monsters[pick].group ? pick : other);
  }
  return out;
}
