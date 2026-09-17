// tests/battle/data.js — P14 fixture data in the shapes of docs/DATA-SHAPES.md.
// Transcribed from docs/MONSTER-BIBLE.md (stat blocks verbatim) and docs/SYSTEMS-BIBLE.md §3–4, renamed per
// docs/CANON.md. Anything the bibles do not give a number for is marked `provisional: true` (or listed in
// `provisional: [...]`) so P16/P20/P21 can see exactly what was filled in to make the simulator run.
// This file is test/demo data. The real game reads src/data/{monsters,spells,items}.js (owned by P16/P20/P21).
// Synced to the canon-pass bibles (SYSTEMS §2.4/§3/§4, MONSTER §6/§6b) on 2026-09-17.

import { BALANCE } from './balance.js';

// ------------------------------------------------------------------------------------------------ spells
const sp = (id, name, mp, tier, kind, extra = {}) => ({ id, name, mp, tier, kind, target: 'enemy', battle: true, ...extra });

export const SPELLS = Object.fromEntries([
  sp('scorcha', 'Scorcha', 2, 1, 'damage', { school: 'fire', element: 'fire', base: 8, k: 0.35, blurb: 'a little puff of fire at one monster.' }),
  sp('scorchalot', 'Scorchalot', 4, 2, 'damage', { school: 'fire', element: 'fire', base: 22, k: 0.42, blurb: 'a proper blaze at one monster.' }),
  sp('kascorcha', 'Kascorcha', 10, 3, 'damage', { school: 'fire', element: 'fire', base: 55, k: 0.60, blurb: 'an enormous roaring fire at one monster.' }),
  sp('whiffle', 'Whiffle', 3, 1, 'damage', { school: 'wind', element: 'wind', base: 6, k: 0.28, target: 'enemies', blurb: 'a gust that buffets every monster.' }),
  sp('whiffler', 'Whiffler', 6, 2, 'damage', { school: 'wind', element: 'wind', base: 16, k: 0.36, target: 'enemies', blurb: 'a howling wind at every monster.' }),
  sp('kawhiffle', 'Kawhiffle', 14, 3, 'damage', { school: 'wind', element: 'wind', base: 34, k: 0.48, target: 'enemies', blurb: 'a gale that tears the air open.' }),
  sp('nip', 'Nip', 3, 1, 'damage', { school: 'ice', element: 'ice', base: 10, k: 0.30, blurb: 'a sharp little frost at one monster.' }),
  sp('nipper', 'Nipper', 8, 2, 'damage', { school: 'ice', element: 'ice', base: 20, k: 0.42, target: 'enemies', blurb: 'a flurry of ice at every monster.' }),
  sp('kanip', 'Kanip', 16, 3, 'damage', { school: 'ice', element: 'ice', base: 40, k: 0.55, target: 'enemies', blurb: 'freezes the whole battlefield.' }),
  sp('zapple', 'Zapple', 8, 3, 'damage', { school: 'lightning', element: 'lightning', base: 45, k: 0.55, pierce: 0.5, blurb: 'a bolt of lightning at one monster.' }),
  sp('kazapple', 'Kazapple', 20, 4, 'damage', { school: 'lightning', element: 'lightning', base: 60, k: 0.70, pierce: 0.5, target: 'enemies', blurb: 'lightning on every monster at once.' }),
  sp('mend', 'Mend', 2, 1, 'heal', { school: 'healing', base: 18, k: 0.30, target: 'ally', field: true, blurb: 'heals a friend a little.' }),
  sp('mendmore', 'Mendmore', 5, 2, 'heal', { school: 'healing', base: 45, k: 0.45, target: 'ally', field: true, blurb: 'heals a friend rather a lot.' }),
  sp('mendall', 'Mendall', 12, 3, 'healAll', { school: 'healing', base: 35, k: 0.35, target: 'allies', field: true, blurb: 'heals the whole party.' }),
  sp('fullmend', 'Fullmend', 9, 3, 'fullheal', { school: 'healing', target: 'ally', field: true, blurb: 'heals a friend all the way.' }),
  sp('rouse', 'Rouse', 8, 3, 'revive', { school: 'revive', pct: 0.5, target: 'fallen', field: true, blurb: 'wakes a worn-out friend. Always works.' }),
  sp('sweeten', 'Sweeten', 2, 1, 'cure', { school: 'support', cures: ['poison'], target: 'ally', field: true, blurb: 'cures poison.' }),
  sp('wobble', 'Wobble', 3, 1, 'debuff', { school: 'support', buff: { stat: 'def', mult: 0.75, turns: 6 }, land: { normal: 0.9, boss: 0.55 }, blurb: "makes one monster's defence go wobbly." }),
  sp('wakey', 'Wakey', 4, 2, 'cure', { school: 'support', cures: ['sleep', 'dazzle', 'root', 'confuse', 'hiccup'], target: 'ally', blurb: 'wakes, unmuddles and unsticks a friend.' }),
  sp('bolster', 'Bolster', 4, 2, 'buff', { school: 'support', buff: { stat: 'def', step: 0.25, max: 1.5, turns: 5 }, target: 'allies', blurb: 'the whole party gets sturdier.' }),
  sp('bluster', 'Bluster', 5, 2, 'buff', { school: 'support', buff: { stat: 'atk', step: 0.25, max: 1.5, turns: 5 }, target: 'allies', blurb: 'the whole party hits harder.' }),
  sp('snoozle', 'Snoozle', 4, 2, 'sleep', { school: 'control', turns: [2, 4], target: 'enemies', blurb: 'sends the monsters to sleep.' }),
  sp('tanglefoot', 'Tanglefoot', 5, 2, 'root', { school: 'control', turns: [1, 3], chance: 0.9, blurb: "ties one monster's feet in vines." }),
  sp('lanternlight', 'Lanternlight', 3, 1, 'field', { school: 'field', battle: false, target: 'party', blurb: 'lights up a dark cave.' }),
  sp('sniff', 'Sniff', 2, 1, 'field', { school: 'field', battle: false, target: 'party', blurb: 'sniffs out hidden treasure nearby.' }),
  sp('scarper', 'Scarper', 4, 2, 'escape', { school: 'field', target: 'party', blurb: 'everybody leaves the fight at once.' }),
  sp('whistle_down', 'Whistle Down', 3, 2, 'field', { school: 'field', battle: false, target: 'party', encounterMult: 0.5, steps: 200, blurb: 'the monsters keep their heads down for a while.' }),
  sp('homeward', 'Homeward', 8, 3, 'field', { school: 'field', battle: false, target: 'party', blurb: 'whisks everyone to a church.' }),
].map((s) => [s.id, s]));

// ------------------------------------------------------------------------------------------------ items
const con = (id, name, buy, battle, extra = {}) => ({ id, name, kind: 'consumable', buy, battle, ...extra });
const wpn = (id, name, power, buy, who, extra = {}) => ({ id, name, kind: 'weapon', slot: 'weapon', power, buy, who, ...extra });
const arm = (id, name, def, buy, who, extra = {}) => ({ id, name, kind: 'armour', slot: 'armour', def, buy, who, ...extra });
const shd = (id, name, def, buy, who, extra = {}) => ({ id, name, kind: 'shield', slot: 'shield', def, buy, who, ...extra });
const hlm = (id, name, def, buy, who, extra = {}) => ({ id, name, kind: 'helm', slot: 'helm', def, buy, who, ...extra });
const acc = (id, name, buy, extra = {}) => ({ id, name, kind: 'accessory', slot: 'accessory', buy, who: 'anyone', ...extra });
const SWORD = ['hero', 'rowan'];

export const ITEMS = Object.fromEntries([
  con('herb', 'Herb', 8, { effect: 'heal', amount: 30, target: 'ally' }, { field: true }),
  con('strong_herb', 'Strong Herb', 32, { effect: 'heal', amount: 80, target: 'ally' }, { field: true }),
  con('fresh_herb', 'Fresh Herb', 110, { effect: 'heal', amount: 200, target: 'ally' }, { field: true }),
  con('nutcake', 'Nutcake', 14, { effect: 'mp', amount: 12, target: 'ally' }, { field: true }),
  con('honeycake', 'Honeycake', 60, { effect: 'mp', amount: 40, target: 'ally' }, { field: true }),
  con('antidote_drop', 'Antidote Drop', 10, { effect: 'cure', statuses: ['poison'], target: 'ally' }, { field: true }),
  con('wake_me_up', 'Wake-me-up', 12, { effect: 'cure', statuses: ['sleep', 'dazzle'], target: 'ally' }, { field: true }),
  con('angels_kiss', "Angel's Kiss", 180, { effect: 'revive', pct: 0.5, target: 'fallen' }, { field: true }),
  con('sunbottle', 'Sunbottle', 90, { effect: 'damageAll', amount: 60, element: 'fire', target: 'enemies' }),
  con('retreat_bell', 'Retreat Bell', 0, null, { kind: 'key', field: true, reusable: true, noSell: true }),
  con('homing_feather', 'Homing Feather', 40, null, { field: true }),
  con('whiff_powder', 'Whiff Powder', 25, null, { field: true }),
  con('seed_of_life', 'Seed of Life', 0, null, { field: true, provisional: true }),

  wpn('wooden_sword', 'Wooden Sword', 2, 0, ['hero'], { blurb: 'Father made it. Badly. On purpose.' }),
  wpn('cypress_stick', 'Cypress Stick', 4, 10, 'anyone'),
  wpn('sling', 'Sling', 7, 55, ['willow', 'linnet']),
  wpn('copper_sword', 'Copper Sword', 11, 70, SWORD),
  wpn('kitchen_cleaver', 'Kitchen Cleaver', 14, 120, ['barty']),
  wpn('oak_boomerang', 'Oak Boomerang', 16, 220, ['willow'], { allEnemies: 0.65 }),
  wpn('chain_whip', 'Chain Whip', 22, 300, ['willow', 'sera'], { allEnemies: 0.75 }),
  wpn('iron_lance', 'Iron Lance', 28, 480, ['hero', 'rowan', 'barty']),
  wpn('steel_sword', 'Steel Sword', 35, 900, SWORD),
  wpn('woodcutters_axe', "Woodcutter's Axe", 41, 1150, ['barty'], { agi: -4 }),
  wpn('ash_staff', 'Ash Staff', 18, 700, ['sera', 'linnet', 'elowen'], { wis: 12 }),
  wpn('frostbite_sabre', 'Frostbite Sabre', 48, 2400, SWORD, { elementBonus: { ice: 0.25 } }),
  wpn('thunderfork', 'Thunderfork', 54, 3600, ['barty', 'hero'], { stun: 0.12 }),
  wpn('halvards_greatsword', "Halvard's Greatsword", 66, 0, ['hero'], { key: true }),
  wpn('larksteel_sword', 'Larksteel Sword', 74, 0, ['rowan'], { key: true, elementBonus: { lightning: 0.25 } }),

  arm('wayfarers_clothes', "Wayfarer's Clothes", 4, 20, 'anyone'),
  arm('quilted_coat', 'Quilted Coat', 9, 90, 'anyone', { resil: 2 }),
  arm('leather_jerkin', 'Leather Jerkin', 15, 210, 'anyone'),
  arm('cooks_apron', "Cook's Apron", 18, 260, ['barty'], { maxHp: 10 }),
  arm('chain_mail', 'Chain Mail', 24, 560, 'anyone', { agi: -2 }),
  arm('silk_robe', 'Silk Robe', 19, 640, ['willow', 'sera', 'linnet', 'elowen'], { mdef: 8 }),
  arm('iron_armour', 'Iron Armour', 33, 1100, ['hero', 'rowan', 'barty'], { agi: -4 }),
  arm('fur_cloak', 'Fur Cloak', 38, 1900, 'anyone', { halves: ['ice'] }),
  arm('gleaming_plate', 'Gleaming Plate', 47, 3200, ['hero', 'rowan', 'barty'], { agi: -5 }),
  arm('elowens_shawl', "Elowen's Shawl", 30, 0, 'anyone', { mdef: 20, immune: ['fear'], key: true }),
  arm('larkweave_cloak', 'Larkweave Cloak', 40, 0, ['linnet'], { mdef: 30, spellGuard: 0.5, key: true }),

  shd('pot_lid', 'Pot Lid', 3, 25, 'anyone'),
  shd('leather_shield', 'Leather Shield', 8, 130, 'anyone'),
  shd('iron_shield', 'Iron Shield', 16, 480, ['hero', 'rowan', 'barty']),
  shd('mirror_shield', 'Mirror Shield', 25, 1700, ['hero', 'rowan'], { reflect: ['wobble', 'snoozle', 'sleep'] }),
  shd('dragon_scale_shield', 'Dragon-scale Shield', 34, 4000, ['hero', 'rowan', 'barty'], { halves: ['fire'] }),
  shd('larksteel_shield', 'Larksteel Shield', 38, 0, ['rowan'], { key: true, halves: ['fire', 'ice'] }),

  hlm('straw_hat', 'Straw Hat', 2, 18, 'anyone'),
  hlm('leather_cap', 'Leather Cap', 6, 95, 'anyone'),
  hlm('iron_helm', 'Iron Helm', 14, 620, ['hero', 'rowan', 'barty']),
  hlm('wide_awake_crown', 'Wide-Awake Crown', 21, 2600, 'anyone', { immune: ['sleep'] }),
  hlm('larksteel_helm', 'Larksteel Helm', 26, 0, ['rowan'], { key: true, immune: ['confuse'] }),

  acc('lucky_acorn', 'Lucky Acorn', 300, { luck: 8 }),
  acc('swiftfoot_anklet', 'Swiftfoot Anklet', 900, { agi: 10 }),
  acc('ring_of_patience', 'Ring of Patience', 2200, { mpRegen: 2 }),
  acc('pips_bell', "Pip's Bell", 0, { encounterMult: 0.65, key: true }),
  acc('charm_bell', 'Charm Bell', 0, { recruitMult: 1.5, key: true }),
  acc('osrics_wooden_bird', "Osric's Wooden Bird", 0, { def: 2, key: true, blurb: 'Osric made this. It took a year.' }),
  acc('silver_waltz_charm', 'Silver Waltz-Charm', 0, { luck: 5, blurb: 'Somebody was finally allowed to go home.' }),
  acc('sock_of_considerable_power', 'The Sock of Considerable Power', 0, { agi: 6, luck: 12, blurb: 'The wearer hums.' }),
].map((i) => [i.id, i]));

// ------------------------------------------------------------------------------------------------ monsters
// mon(id, name, tier, [lvl, hp, mp, atk, def, agi, exp, gold, recruit], moves, extra)
const mon = (id, name, tier, [lvl, hp, mp, atk, def, agi, exp, gold, recruit], moves, extra = {}) =>
  ({ id, name, tier, lvl, hp, mp, atk, def, agi, exp, gold, recruit, moves, ...extra });
const HERB = [{ item: 'herb', rate: 0.18 }];
const atk = (id, name, extra = {}) => ({ id, name, kind: 'attack', ...extra });

export const MONSTERS = Object.fromEntries([
  // ---- tier 1
  mon('gloop', 'Gloop', 1, [2, 9, 0, 10, 6, 5, 3, 3, 1 / 8], [atk('squelch', 'Squelch', { text: '%ACTOR% squelches into %TARGET%!' })],
    { drops: HERB, joinLine: '"Gloop!"', nameSuggest: 'Dollop' }),
  mon('bloop', 'Bloop', 1, [3, 14, 6, 8, 8, 7, 5, 4, 1 / 10], [
    { id: 'mend', name: 'Mend', kind: 'heal', amount: 20, target: 'ally', below: 0.9, weight: 1.5, text: '%ACTOR% fusses over a friend with Mend!' },
    atk('squelch', 'Squelch', { text: '%ACTOR% squelches into %TARGET%!' })], { drops: HERB }),
  mon('flapjack', 'Flapjack', 1, [2, 11, 0, 12, 5, 20, 4, 5, 1 / 12], [
    atk('flittersmack', 'Flittersmack', { hits: 2, power: 0.5, text: '%ACTOR% flitters at %TARGET%, twice!' })],
    { evade: 0.06, joinLine: "\"I'll flap along behind! I'm very good at behind!\"", nameSuggest: 'Pancake' }),
  mon('peckish', 'Peckish', 1, [1, 7, 0, 9, 4, 12, 2, 2, 1 / 6], [atk('peck', 'Peck', { text: '%ACTOR% pecks %TARGET%!' })], { drops: HERB }),
  mon('grumpleroot', 'Grumpleroot', 1, [3, 16, 0, 13, 11, 3, 6, 4, 1 / 14], [
    atk('root_wallop', 'Root Wallop', { weight: 2, text: '%ACTOR% wallops %TARGET% with a root!' }),
    { id: 'grumble', name: 'Grumble', kind: 'buff', target: 'enemy', buff: { stat: 'atk', mult: 0.85, turns: 3 }, text: '%ACTOR% grumbles at %TARGET% until they feel a bit rubbish.' }]),
  mon('toadstooligan', 'Toadstooligan', 1, [4, 18, 4, 14, 9, 8, 7, 6, 1 / 12], [
    atk('cap_bonk', 'Cap Bonk', { weight: 2, text: '%ACTOR% bonks %TARGET% with its cap!' }),
    { id: 'spore_snooze', name: 'Spore Snooze', kind: 'status', status: { id: 'sleep', chance: 0.35, turns: [1, 2] }, text: '%ACTOR% puffs sleepy spores at %TARGET%!' }]),
  mon('bumbleblunder', 'Bumbleblunder', 1, [3, 12, 0, 15, 6, 18, 6, 5, 1 / 16], [
    atk('blunder_charge', 'Blunder Charge', { selfMiss: 0.25, selfMissDamage: 3, text: '%ACTOR% charges at %TARGET%!' })]),

  // ---- tier 2
  mon('grumbleglop', 'Grumbleglop', 2, [8, 34, 0, 26, 18, 9, 15, 12, 1 / 16], [
    atk('splat', 'Splat', { weight: 3, text: '%ACTOR% splats onto %TARGET%!' }),
    { id: 'hiccup_bomb', name: 'Hiccup Bomb', kind: 'status', status: { id: 'hiccup', chance: 0.75, turns: 2 }, text: '%ACTOR% lobs a Hiccup Bomb at %TARGET%!' }]),
  mon('sir_gloopalot', 'Sir Gloopalot', 2, [11, 46, 5, 38, 30, 14, 28, 24, 1 / 32], [
    atk('lance_poke', 'Lance Poke', { weight: 3, text: '%ACTOR% pokes %TARGET% with a very small lance!' }),
    { id: 'bolster_self', name: 'Bolster', kind: 'buff', target: 'self', buff: { stat: 'def', step: 0.25, max: 1.5, turns: 5 }, text: '%ACTOR% straightens his tiny helmet.' }],
    { joinLine: '"Sir, my steed likes you. My steed likes everyone. But sir — so do I."' }),
  mon('boohoo', 'Boohoo', 2, [9, 30, 12, 24, 4, 22, 22, 16, 1 / 20], [
    atk('cold_hands', 'Cold Hands', { weight: 3, text: '%ACTOR% touches %TARGET% with cold hands!' }),
    { id: 'snoozle', kind: 'spell', spell: 'snoozle', weight: 1 }],
    { evade: 0.04, joinLine: '"You heard me. …Sorry. You heard me, and you didn\'t run. Sniff."', provisional: ['evade (SYSTEMS 0.04 over MONSTER 40%)'] }),
  mon('chestnut', 'Chestnut', 2, [12, 52, 0, 44, 34, 6, 40, 90, 1 / 48], [
    atk('chomp', 'Chomp', { weight: 3, power: 1.4, text: '%ACTOR% chomps down on %TARGET%!' }),
    { id: 'gold_gobble', name: 'Gold Gobble', kind: 'steal', gold: [1, 20], fleeChance: 0.2, text: '%ACTOR% lunges at the gold purse!' }],
    { joinLine: '"You looked inside me. Nobody ever looks inside me. Well — they do once."', nameSuggest: 'Nutty' }),
  mon('crabbit', 'Crabbit', 2, [7, 28, 0, 25, 22, 16, 14, 11, 1 / 14], [
    atk('pinch', 'Pinch', { weight: 3, text: '%ACTOR% pinches %TARGET%!' }),
    { id: 'sand_kick', name: 'Sand Kick', kind: 'status', status: { id: 'dazzle', chance: 0.6, turns: 2 }, text: '%ACTOR% kicks sand at %TARGET%!' }]),
  mon('hoot_couture', 'Hoot Couture', 2, [10, 33, 14, 28, 20, 24, 26, 30, 1 / 24], [
    atk('talon', 'Talon', { weight: 2, text: '%ACTOR% swipes at %TARGET%, fashionably.' }),
    { id: 'whiffle', kind: 'spell', spell: 'whiffle', weight: 1 },
    { id: 'muddle', name: 'Muddle', kind: 'status', status: { id: 'confuse', chance: 0.45 }, weight: 0.7, text: '%ACTOR% looks %TARGET% up and down until they forget which way is up.' }]),
  mon('batterfly', 'Batterfly', 2, [9, 26, 8, 27, 14, 28, 20, 14, 1 / 18], [
    atk('wing_batter', 'Wing Batter', { hits: 2, power: 0.55, weight: 3, text: '%ACTOR% batters %TARGET% with both wings!' }),
    { id: 'dustup', name: 'Dustup', kind: 'status', status: { id: 'dazzle', chance: 0.6, turns: 2 }, text: '%ACTOR% shakes dust into %TARGET%\'s eyes!' }]),
  mon('twiglet', 'Twiglet', 2, [6, 24, 0, 22, 24, 7, 12, 9, 1 / 10], [
    atk('whippy_branch', 'Whippy Branch', { weight: 3, text: '%ACTOR% whips %TARGET% with a branch!' }),
    { id: 'stand_very_still', name: 'Stand Very Still', kind: 'standStill', text: '%ACTOR% stands very, very still. It is definitely firewood.' }],
    { group: [3, 3] }),
  mon('quietling', 'Quietling', 2, [10, 30, 6, 22, 16, 14, 18, 20, 0], [
    atk('poke', 'Poke', { weight: 3, text: '%ACTOR% pokes %TARGET%, apologetically.' }),
    { id: 'shush', name: 'Shush', kind: 'status', status: { id: 'silence', chance: 0.7, turns: 2 }, notTwiceRunning: true, text: '%ACTOR% puts a finger to its lips at %TARGET%. "Shh."' }],
    { defeatText: '%TARGET% folds its robe neatly and sits the mask on top.' }),

  // ---- tier 3
  mon('glimmergloop', 'Glimmergloop', 3, [16, 5, 0, 30, 240, 180, 1050, 90, 1 / 128], [
    { id: 'bolt', name: 'Scarper', kind: 'flee', when: 'round1', weight: 3 },
    { id: 'scarper', name: 'Scarper', kind: 'flee', weight: 0.25 },
    atk('ping', 'Ping', { fixed: 1, text: '%ACTOR% pings %TARGET%.' })],
    { elements: { fire: 0, ice: 0, wind: 0, lightning: 0 }, mdef: 200, provisional: ['elements'] }),
  mon('clankworthy', 'Clankworthy', 3, [18, 88, 0, 64, 58, 18, 70, 55, 1 / 40], [
    atk('sword_swing', 'Sword Swing', { weight: 3, text: '%ACTOR% swings its sword at %TARGET%!' }),
    { id: 'clatterguard', name: 'Clatterguard', kind: 'selfStatus', status: { id: 'guard', turns: 2 }, text: '%ACTOR% raises its shield with a great clatter.' }],
    { joinLine: '"…" … "…yes."' }),
  mon('boulderdash', 'Boulderdash', 3, [21, 140, 0, 72, 66, 8, 95, 70, 1 / 64], [
    { id: 'rock_fall', name: 'Rock Fall', kind: 'attack', target: 'enemies', power: 0.7, weight: 2, text: '%ACTOR% brings the rocks down on everyone!' },
    atk('thump', 'Thump', { weight: 1, text: '%ACTOR% thumps %TARGET%, apologetically.' }),
    { id: 'sit_down_heavily', name: 'Sit Down Heavily', kind: 'standStill', heal: 20, weight: 1, text: '%ACTOR% sits down heavily.' }],
    { joinLine: '"I am very heavy and I break bridges. Will that be a problem? …It usually is."', nameSuggest: 'Pebbles' }),
  mon('cactuddle', 'Cactuddle', 3, [17, 76, 0, 55, 40, 12, 58, 34, 1 / 6], [
    atk('cuddle', 'Cuddle', { power: 1.4, recoil: 8, weight: 7.3, text: '%ACTOR% gives %TARGET% an enormous, prickly hug! "Sorry!"' }),
    { id: 'sniffle', name: 'Sniffle', kind: 'nothing', weight: 1, text: '%ACTOR% sniffles. Nothing else happens.' }],
    { joinLine: '"You didn\'t run away. Nobody\'s ever not run away before. Can I come?"', nameSuggest: 'Prickle' }),
  mon('dune_buggy', 'Dune Buggy', 3, [19, 96, 6, 62, 52, 30, 72, 44, 1 / 28], [
    atk('barge', 'Barge', { weight: 3, text: '%ACTOR% barges into %TARGET%!' }),
    { id: 'sandspray', name: 'Sandspray', kind: 'attack', target: 'enemies', power: 0.4, text: '%ACTOR% sprays sand over everyone!' },
    { id: 'burrow', name: 'Burrow', kind: 'selfStatus', status: { id: 'hidden', turns: 1 }, then: 'surprise', text: '%ACTOR% burrows into the sand!' },
    atk('surprise', 'Surprise!', { weight: 0, power: 1.3, text: '%ACTOR% bursts up under %TARGET%!' })],
    { group: [3, 3], plural: 'Dune Buggies' }),
  mon('jinglebottom', 'Jinglebottom', 3, [20, 84, 24, 58, 44, 38, 84, 66, 1 / 36], [
    atk('bell_bonk', 'Bell Bonk', { weight: 3, text: '%ACTOR% bonks %TARGET% with a bell!' }),
    { id: 'muddle_all', name: 'Muddle', kind: 'status', target: 'enemies', status: { id: 'confuse', chance: 0.3 }, text: '%ACTOR% tells its one joke. Everyone is muddled.' },
    { id: 'swap', name: 'Swap', kind: 'shuffle', weight: 0.5, text: '%ACTOR% cartwheels through the party!' }]),
  mon('barrowmole', 'Barrowmole', 3, [15, 70, 0, 50, 38, 14, 46, 120, 1 / 22], [
    atk('shovel_swing', 'Shovel Swing', { weight: 2.3, text: '%ACTOR% swings a shovel at %TARGET%!' }),
    { id: 'trundle_away', name: 'Trundle Away', kind: 'flee', withGold: true, weight: 1, text: '%ACTOR% trundles off with its barrow of gold!' }]),
  mon('candelabracadabra', 'Candelabracadabra', 3, [22, 78, 40, 46, 42, 26, 88, 58, 1 / 30], [
    { id: 'scorcha', kind: 'spell', spell: 'scorcha', weight: 3 },
    atk('wax_flick', 'Wax Flick', { weight: 1, text: '%ACTOR% flicks hot wax at %TARGET%!' }),
    { id: 'mend', name: 'Mend', kind: 'heal', amount: 30, target: 'ally', weight: 1, text: '%ACTOR% casts Mend!' }]),

  // ---- tier 4
  mon('gloopold', 'Gloopold the Grand', 4, [27, 210, 20, 92, 74, 20, 260, 150, 1 / 64], [
    { id: 'royal_squelch', name: 'Royal Squelch', kind: 'attack', target: 'enemies', power: 0.65, weight: 3, text: '%ACTOR% squelches the whole party, royally!' },
    { id: 'rally', name: 'Rally', kind: 'summon', monster: 'gloop', count: 2, maxUses: 2, text: '%ACTOR% calls a vote!' },
    { id: 'mend_self', name: 'Mend', kind: 'heal', target: 'self', amount: 40, below: 0.5, text: '%ACTOR% casts Mend on itself!' }],
    { properName: false, plural: 'Gloopolds the Grand' }),
  mon('sir_cumference', 'Sir Cumference', 4, [29, 240, 0, 104, 96, 12, 300, 180, 1 / 56], [
    atk('grand_charge', 'Grand Charge', { power: 1.5, weight: 2, then: 'turn_around', text: '%ACTOR% charges %TARGET% at a stately gallop!' }),
    { id: 'turn_around', name: 'Turn Around', kind: 'nothing', weight: 0, text: '%ACTOR% takes a moment to turn around.' },
    { id: 'bow_politely', name: 'Bow Politely', kind: 'nothing', weight: 1, text: '%ACTOR% bows politely. It is very charming.' }]),
  mon('mirthquake', 'Mirthquake', 4, [31, 265, 60, 110, 80, 46, 380, 220, 1 / 72], [
    atk('punchline', 'Punchline', { power: 1.3, weight: 3, text: '%ACTOR% delivers the punchline to %TARGET%!' }),
    { id: 'kascorcha', kind: 'spell', spell: 'kascorcha', weight: 1 },
    { id: 'belly_laugh', name: 'Belly Laugh', kind: 'attack', target: 'enemies', power: 0.55, status: { id: 'confuse', chance: 0.3 }, weight: 1.5, text: '%ACTOR% laughs so hard the ground shakes!' }]),
  mon('lady_mothbonnet', 'Lady Mothbonnet', 4, [28, 190, 70, 84, 66, 40, 290, 165, 1 / 44], [
    { id: 'nipper', kind: 'spell', spell: 'nipper', weight: 2 },
    { id: 'snoozle', kind: 'spell', spell: 'snoozle', weight: 1 },
    atk('last_dance', 'Last Dance', { fixed: 30, drain: 30, weight: 2, text: '%ACTOR% takes %TARGET% for a very cold last dance!' })],
    { elements: { ice: 0.5, fire: 1.5 }, provisional: ['elements'] }),
  mon('squidgeon', 'Squidgeon', 4, [26, 175, 30, 88, 60, 52, 240, 130, 1 / 34], [
    atk('tentacle_slap', 'Tentacle Slap', { hits: 3, power: 0.42, weight: 3, text: '%ACTOR% slaps %TARGET% three times!' }),
    { id: 'inkblot', name: 'Inkblot', kind: 'status', target: 'enemies', status: { id: 'dazzle', chance: 0.5, turns: 2 }, text: '%ACTOR% squirts ink everywhere!' },
    { id: 'whiffle', kind: 'spell', spell: 'whiffle', weight: 1 }]),
  mon('thunderpuff', 'Thunderpuff', 4, [30, 200, 90, 78, 58, 44, 330, 145, 1 / 48], [
    { id: 'zapple', kind: 'spell', spell: 'zapple', weight: 2 },
    { id: 'kazapple', kind: 'spell', spell: 'kazapple', weight: 1 },
    atk('bump', 'Bump', { weight: 1, text: '%ACTOR% bumps into %TARGET%, grumpily.' }),
    { id: 'fluff_up', name: 'Fluff Up', kind: 'selfStatus', status: { id: 'fluffed', turns: 1 }, weight: 1, notTwiceRunning: true, text: '%ACTOR% fluffs up!' }],
    { elements: { lightning: 0, wind: 1.5 }, provisional: ['elements'] }),
  mon('wyrmsley', 'Wyrmsley', 4, [32, 255, 45, 118, 92, 34, 420, 260, 1 / 60], [
    { id: 'tail_sweep', name: 'Tail Sweep', kind: 'attack', target: 'enemies', power: 0.6, weight: 2, text: '%ACTOR% sweeps its tail across the whole party!' },
    { id: 'scorcha', kind: 'spell', spell: 'scorcha', weight: 1 },
    atk('claw', 'Claw', { weight: 2, text: '%ACTOR% claws at %TARGET%, with regret.' }),
    { id: 'serve_tea', name: 'Serve Tea', kind: 'heal', target: 'allies', amount: 40, weight: 1, text: '%ACTOR% serves tea. It is genuinely good tea.' }],
    { joinLine: '"His Grace\'s tea has been undrinkable for years. I shall require a new employer."', nameSuggest: 'Jenkins' }),
  mon('grimalkitten', 'Grimalkitten', 4, [25, 160, 36, 90, 55, 66, 230, 110, 1 / 26], [
    atk('pounce', 'Pounce', { critRate: 0.25, weight: 3, text: '%ACTOR% pounces on %TARGET%!' }),
    { id: 'vanish', name: 'Vanish', kind: 'selfStatus', status: { id: 'hidden', turns: 1 }, weight: 0.7, notTwiceRunning: true, text: '%ACTOR% steps into a shadow and is gone.' },
    { id: 'muddle', name: 'Muddle', kind: 'status', status: { id: 'confuse', chance: 0.4 }, weight: 0.7, text: '%ACTOR% purrs at %TARGET% in a very confusing way.' }],
    { evade: 0.05 }),

  // ---- tier 5
  mon('hexcalibur', 'Hexcalibur', 5, [36, 290, 80, 152, 105, 72, 620, 300, 1 / 80], [
    atk('rebuke', 'Rebuke', { power: 1.25, weight: 3, text: '%ACTOR% rebukes %TARGET%. Rudely.' }),
    { id: 'blade_storm', name: 'Blade Storm', kind: 'attack', target: 'random', hits: 4, power: 0.5, weight: 2, text: '%ACTOR% becomes a storm of blades!' },
    { id: 'hexed_edge', name: 'Hexed Edge', kind: 'status', status: { id: 'hexed', chance: 1 }, cooldown: 6, weight: 1,
      telegraph: "%ACTOR%'s edge starts to glow a nasty violet.", text: '%ACTOR% nicks %TARGET% with its Hexed Edge!' }]),
  mon('vesperling', 'Vesperling', 5, [35, 270, 120, 130, 92, 80, 580, 240, 1 / 70], [
    { id: 'kascorcha', kind: 'spell', spell: 'kascorcha', weight: 1.5 },
    { id: 'nipper', kind: 'spell', spell: 'nipper', weight: 1.5 },
    atk('wing_cuff', 'Wing Cuff', { weight: 1.5, text: '%ACTOR% cuffs %TARGET% with a wing.' }),
    { id: 'evensong', name: 'Evensong', kind: 'heal', target: 'allies', amount: 60, below: 0.7, weight: 1, text: '%ACTOR% sings Evensong. It is deliberately beautiful.' }]),

  // ---- bosses (CANON §8 order). MONSTER-BIBLE §6 + §6b stat blocks verbatim; move numbers (power/base/k) and
  // telegraph lines the bibles do not give are ours and listed in DATA-SHAPES.md §8.
  mon('mumbleroot', 'Mumbleroot the Grudge', 2, [7, 180, 0, 26, 18, 9, 160, 400, 0], [
    atk('root_lash', 'Root Lash', { weight: 3, text: '%ACTOR% lashes %TARGET% with a black root!' }),
    { id: 'bind', name: 'Bind', kind: 'status', status: { id: 'root', chance: 0.8, turns: 1 }, weight: 1.2, notTwiceRunning: true, text: '%ACTOR% winds roots round %TARGET%!' },
    { id: 'cold_draught', name: 'Cold Draught', kind: 'magic', target: 'enemies', base: 14, k: 0.4, big: true, weight: 1, fx: 'darken',
      telegraph: 'The candle flame leans sideways. Something in the coat is breathing in.', text: '%ACTOR% lets out a Cold Draught! The candle gutters out!' }],
    { boss: true, properName: true, neverTargets: ['willow_child', 'willow'], partyLevel: 6,
      defeatText: 'Mumbleroot unravels into a plain black coat, lying on the floor.',
      fleeRefusal: 'The belfry door has swung shut, and the rope is tangled in roots. There is nowhere to run but forward.' }),
  mon('sunmane', 'Sunmane', 3, [14, 420, 0, 60, 40, 50, 600, 0, 0], [
    atk('pounce', 'Pounce', { weight: 2, text: '%ACTOR% pounces on %TARGET% with paws the size of doors!' }),
    { id: 'roar', name: 'Roar', kind: 'buff', target: 'enemies', buff: { stat: 'agi', mult: 0.8, turns: 1 }, weight: 1, text: '%ACTOR% ROARS. The whole cave shakes.' }],
    { boss: true, partyLevel: 11, minHpPct: 0.5,
      scriptedEnd: { round: 2, outcome: 'victory', text: 'The Sunmane stops mid-roar. It has seen the green ribbon on the wrist. It sniffs... and lies down. It\'s Pip!' },
      spareText: 'The Sunmane is purring.' }),
  mon('bogwallop', 'Bogwallop the Bulbous', 3, [8, 180, 10, 34, 24, 8, 220, 150, 0], [
    { id: 'belly_flop', name: 'Belly Flop', kind: 'attack', target: 'enemies', power: 0.75, recoil: 5, big: true, weight: 2,
      telegraph: 'Bogwallop wobbles up onto his tiptoes. The whole well gurgles.', text: '%ACTOR% belly-flops onto everyone!' },
    { id: 'gulp', name: 'Gulp', kind: 'swallow', weight: 2, notTwiceRunning: true, text: '%ACTOR% swallows %TARGET% whole!' },
    { id: 'enormous_burp', name: 'Enormous Burp', kind: 'nothing', weight: 1, text: '%ACTOR% does an Enormous Burp. That is all.' }],
    { boss: true, properName: true, evade: 0.03, partyLevel: 12,
      fleeRefusal: 'Bogwallop plants himself in the doorway with the calm of a man who has nowhere else to be.',
      phases: [{ below: 0.4, set: { atk: 46 }, text: '%ACTOR% stands up on his back legs! It is genuinely startling.' }],
      joinLine: '"Room in that wagon for a big lad?"' }),
  mon('sexton_sootbell', 'Sexton Sootbell', 3, [15, 420, 90, 62, 48, 30, 700, 400, 0], [
    { id: 'toll', name: 'Toll', kind: 'magic', target: 'enemies', base: 28, k: 0.4, big: true, fx: 'desaturate',
      telegraph: '%ACTOR% takes hold of a rope that isn\'t there, and pulls.', text: 'The ghost bell tolls! BONG!' },
    { id: 'snoozle', kind: 'spell', spell: 'snoozle', weight: 1 },
    { id: 'summon_boohoo', name: 'Summon Boohoo', kind: 'summon', monster: 'boohoo', count: 2, once: true, weight: 1, text: '%ACTOR% calls softly into the dark.' },
    { id: 'dust_of_years', name: 'Dust of Years', kind: 'buff', target: 'enemies', buff: { stat: 'agi', mult: 0.8, turns: 4 }, weight: 0.8, text: '%ACTOR% shakes a hundred years of dust over everyone.' },
    atk('cold_hands', 'Cold Hands', { weight: 2, text: '%ACTOR% reaches for %TARGET% with cold hands!' })],
    { boss: true, properName: true, partyLevel: 14,
      phases: [{ below: 0.5, text: '%ACTOR% rings the bell. The candles go out, one by one.' },
        { below: 0.2, skipTurn: true, skipText: '"I only wanted someone to hear it."', text: '%ACTOR% stops, and lowers his hands.' }] }),
  mon('tidewarden', 'Tidewarden', 4, [18, 900, 40, 70, 55, 20, 1500, 600, 0], [
    { id: 'high_tide', name: 'High Tide', kind: 'magic', target: 'enemies', element: 'water', base: 40, k: 0.5, big: true, weight: 1,
      telegraph: 'The water starts to rise. The Tidewarden hauls in a breath that rattles the whole grotto.', text: 'High Tide! The sea comes crashing in!' },
    atk('clamp', 'Clamp', { power: 1.2, weight: 3, text: '%ACTOR% clamps down on %TARGET%!' }),
    { id: 'undertow', name: 'Undertow', kind: 'pullBack', power: 0.6, weight: 1.5, text: '%ACTOR% drags %TARGET% under!' }],
    { boss: true, partyLevel: 18, spareAtZero: true,
      spareText: 'The Tidewarden shuts its door and sulks. The Tide Pearl rolls out.' }),
  mon('hoarfax', 'Hoarfax the Ninefold', 4, [28, 900, 60, 96, 70, 60, 2400, 800, 1 / 8], [
    { id: 'frostbreath', name: 'Frostbreath', kind: 'magic', target: 'enemies', element: 'ice', base: 60, k: 0.5, big: true, weight: 1,
      telegraph: '%ACTOR% breathes in, and the air in the room turns to glitter.', text: '%ACTOR% breathes out a storm of frost!' },
    { id: 'ninefold_feint', name: 'Ninefold Feint', kind: 'attack', target: 'random', hits: 9, power: 0.26, weight: 2, text: '%ACTOR% feints nine ways at once!' },
    { id: 'hush', name: 'Hush', kind: 'status', status: { id: 'silence', chance: 0.8, turns: 2 }, notTwiceRunning: true, weight: 1, text: '%ACTOR% lays a tail across %TARGET%\'s mouth. Hush.' },
    atk('tail_swipe', 'Tail Swipe', { weight: 2, text: '%ACTOR% swipes %TARGET% with a frosty tail!' })],
    { boss: true, properName: true, spareAtZero: true, spareText: 'Hoarfax sits down in the snow and sneezes. All nine tails droop.',
      elements: { fire: 1.5, ice: 0 }, partyLevel: 23, nameSuggest: 'Foxglove',
      phases: [
        { below: 0.78, text: 'One of the nine tails winks out like a candle.' },
        { below: 0.56, removeMoves: ['hush'], text: 'Another tail goes out. %ACTOR% can\'t find its Hush any more.' },
        { below: 0.33, removeMoves: ['ninefold_feint'], text: 'Only three tails left. %ACTOR% can\'t feint any more — it is getting easier, and more beautiful.' }] }),
  mon('iron_governess', 'Iron Governess', 4, [26, 900, 120, 118, 104, 42, 2400, 1200, 0], [
    { id: 'ruler_rap', name: 'Ruler Rap', kind: 'attack', power: 2.0, big: true, weight: 1,
      telegraph: '%ACTOR% raises her ruler and begins to count. "One..."', text: '%ACTOR% brings the ruler down on %TARGET%! "...Two."' },
    { id: 'inspection', name: 'Inspection', kind: 'attack', lowestHp: true, weight: 2, text: '%ACTOR% inspects %TARGET%. Thoroughly.' },
    { id: 'wind_the_key', name: 'Wind the Key', kind: 'buff', target: 'self', buff: [{ stat: 'atk', step: 0.3, max: 1.6, turns: 6 }, { stat: 'agi', step: 0.3, max: 1.6, turns: 6 }], maxUses: 2, weight: 1, text: '%ACTOR% winds the key in her back. Tick-tick-tick.' },
    { id: 'kanip', kind: 'spell', spell: 'kanip', weight: 1 }],
    { boss: true, partyLevel: 24, defeatText: 'The key spins free. %TARGET% folds down into a neat, dignified, harmless heap.',
      phases: [{ below: 0.66, text: 'Her key slows. Tick... tick.' }, { below: 0.33, text: 'Tick.......... tick.' }] }),
  mon('hush', 'Hush', 5, [34, 1100, 120, 120, 90, 70, 3000, 900, 0], [
    { id: 'silence_all', name: 'Silence All', kind: 'status', target: 'enemies', status: { id: 'silence', chance: 0.6, turns: 2 }, notTwiceRunning: true, weight: 1.2, text: '%ACTOR% lifts one finger to her lips. Every spell in the room goes quiet.' },
    atk('quiet_blow', 'Quiet Blow', { weight: 3, text: '%ACTOR% strikes %TARGET% without a sound.' }),
    { id: 'hush_now', name: 'Hush Now', kind: 'magic', target: 'enemies', base: 50, k: 0.6, big: true, weight: 1,
      telegraph: '%ACTOR% draws in a long, slow breath. Every candle in the abbey leans towards her.', text: '"Hush now." The silence itself hurts!' }],
    { boss: true, properName: true, partyLevel: 26, partnerGivesUp: true, spareText: 'Hush lowers her finger and sits down on the floor.' }),
  mon('hark', 'Hark', 5, [34, 1100, 120, 120, 90, 70, 3000, 900, 0], [
    { id: 'echo', name: 'Echo', kind: 'echo', partner: 'hush', weight: 2, text: '%ACTOR% cups a hand to his ear and does exactly what %PARTNER% did.' },
    atk('clang', 'Clang', { power: 1.1, weight: 3, text: '%ACTOR% clangs %TARGET% like a bell!' }),
    { id: 'echo_strike', name: 'Echo Strike', kind: 'attack', target: 'enemies', power: 0.8, big: true, weight: 1,
      telegraph: 'Somewhere far above, a very large bell starts to swing.', text: '%ACTOR% strikes, and the echo strikes everyone!' }],
    { boss: true, properName: true, partyLevel: 26, partnerGivesUp: true, spareText: 'Hark stops listening, and sits down next to his sister.' }),
  mon('mortmain', 'Bishop Mortmain', 5, [38, 2400, 300, 158, 128, 76, 9000, 3000, 0], [
    { id: 'vespers', name: 'Vespers', kind: 'magic', target: 'enemies', base: 80, k: 0.5, big: true, weight: 1,
      telegraph: '%ACTOR% lifts his little glass lantern, and the light in the room goes grey and soft.', text: '%ACTOR% sings Vespers. It is so sad it hurts.' },
    { id: 'kascorcha', kind: 'spell', spell: 'kascorcha', weight: 2 },
    { id: 'silence_the_choir', name: 'Silence the Choir', kind: 'status', status: { id: 'silence', chance: 0.8, turns: 3 }, notTwiceRunning: true, weight: 1, text: '%ACTOR% lifts a soft hand toward %TARGET%. "There now."' },
    { id: 'benediction', name: 'Benediction', kind: 'heal', target: 'self', amount: 300, below: 0.7, maxUses: 3, weight: 1,
      telegraph: '%ACTOR% folds his hands, and closes his eyes.', text: '"Benediction." %ACTOR% is made whole, or nearly.' },
    atk('lantern_knock', 'Lantern Knock', { weight: 3, text: '%ACTOR% knocks %TARGET% gently with his glass lantern.' })],
    { boss: true, properName: true, partyLevel: 27, spareAtZero: true,
      spareText: 'The dream-coat drifts up and away. What is left kneeling is an ordinary, very old man with his hands still folded.',
      fleeRefusal: '"Oh, child. There\'s nowhere to go. That\'s rather the point."',
      phases: [{ below: 0.6, set: { actions: 2, name: 'Mortmain Enfolded' }, text: 'The dream wraps round him like a coat. It has given him a bat\'s face, and it is beautiful, and that is worse.' },
        { below: 0.25, text: 'The wings unfurl to their full span. He stops speaking entirely.' }] }),
  mon('malgrim_cocoon', 'Malgrim the Unlit', 5, [45, 1800, 999, 175, 140, 90, 0, 0, 0], [
    { id: 'unlight', name: 'Unlight', kind: 'magic', target: 'enemies', base: 70, k: 0.5, big: true, fx: 'desaturate', weight: 1,
      telegraph: 'The eight shut eyes twitch under their lids.', text: 'Unlight. The colour drains out of everything.' },
    { id: 'lash', name: 'Lash', kind: 'attack', target: 'random', hits: 3, power: 0.5, weight: 3, text: '%ACTOR% lashes out three times!' },
    { id: 'open_one_eye', name: 'Open One Eye', kind: 'buff', target: 'self', buff: { stat: 'atk', step: 0.08, max: 1.32, turns: 99 }, maxUses: 4, weight: 1, text: 'One of the eight eyes opens.' }],
    { boss: true, properName: true, partyLevel: 28, transformsInto: 'malgrim_unravelling',
      transformText: 'The Cocoon breaks open. Inside is a small, thin figure made of folded dark.' }),
  mon('malgrim_unravelling', 'Malgrim the Unlit', 5, [45, 2700, 999, 175, 140, 90, 0, 0, 0], [
    { id: 'nothing_at_all', name: 'Nothing At All', kind: 'setHp', big: true, weight: 1, cooldown: 5, then: 'listen',
      telegraph: '%ACTOR% opens its small hands. It is very, very quiet.', text: 'Nothing At All. Everyone is left standing on one single hit point.' },
    { id: 'kascorcha', kind: 'spell', spell: 'kascorcha', weight: 2 },
    { id: 'undo', name: 'Undo', kind: 'purge', weight: 1, text: '%ACTOR% gently undoes everything.' },
    { id: 'listen', name: 'Listen', kind: 'nothing', weight: 0, text: '%ACTOR% tilts its head, as if listening. It gives you a moment.' },
    atk('fold', 'Fold', { weight: 3, text: '%ACTOR% folds the dark around %TARGET%.' })],
    { boss: true, properName: true, partyLevel: 28,
      spareText: 'Rowan says, "No. People are supposed to be loud." It opens its small hands, and lets go. Colour comes back into the world.',
      phases: [{ below: 0.1, spare: true, text: 'It whispers: "Wouldn\'t it be kinder if everything were quiet?"' }] }),
  mon('mortmain_scripted', 'Bishop Mortmain', 5, [60, 9999, 0, 70, 999, 40, 0, 0, 0], [
    { id: 'there_now', name: 'There Now', kind: 'status', status: { id: 'sleep', chance: 0.5, turns: 1 }, weight: 1, text: '"There now," says %ACTOR%.' },
    atk('gentle_push', 'Gentle Push', { power: 0.4, weight: 2, text: '%ACTOR% moves %TARGET% aside, very gently.' })],
    { boss: true, properName: true, untouchable: true }),

  // Pip's species (a party companion, never a wild encounter)
  mon('sunspot_cub', 'Sunspot Cub', 2, [5, 30, 0, 20, 12, 30, 0, 0, 0], ['attack'], { companionOnly: true, provisional: true }),
].map((m) => [m.id, m]));

// ------------------------------------------------------------------------------------------------ balance pass r2
// The stat blocks above are the MONSTER-BIBLE's, verbatim. tests/battle/balance.js holds the journey-measured numbers
// that supersede them (home `partyLevel`, HP/ATK/DEF/EXP/gold, boss move numbers); the bible block is kept on
// `monster.bible` so every change is visible. See docs/DATA-SHAPES.md §9.
export function applyBalance(monsters, balance) {
  for (const [id, patch] of Object.entries(balance)) {
    const m = monsters[id];
    if (!m) continue;
    if (!m.bible) m.bible = Object.fromEntries(['lvl', 'hp', 'mp', 'atk', 'def', 'agi', 'exp', 'gold'].map((k) => [k, m[k]]));
    const { moves: movePatch, ...rest } = patch;
    Object.assign(m, rest);
    for (const [mid, mp] of Object.entries(movePatch || {})) {
      const mv = m.moves.find((x) => typeof x === 'object' && x.id === mid);
      if (mp === null) m.moves = m.moves.filter((x) => x !== mv);
      else if (mv) Object.assign(mv, mp);
      else m.moves.push({ id: mid, ...mp });
    }
  }
  return monsters;
}
applyBalance(MONSTERS, BALANCE);

export const DATA = { monsters: MONSTERS, spells: SPELLS, items: ITEMS };
export default DATA;
