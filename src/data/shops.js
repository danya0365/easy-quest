/**
 * shops.js — every counter in the world: what it sells, what it charges, who stands behind it, and the words
 * they say.                                                            (P22, owner: src/data/shops.js)
 *
 *   import { Shops, buyPrice, sellPrice, tradeInPrice, innPrice, Economy } from '../data/shops.js';
 *
 * Numbers are docs/SYSTEMS-BIBLE.md §4 (the 48 items) and §5 (the economy). People and places are
 * docs/WORLD-BIBLE.md §2/§3; the words are docs/VOICE-BIBLE.md §4 "Church, inn, shop" (20-31), kept in the
 * keeper's own voice rather than a shared template wherever the bible gives them one.
 *
 * ── Prices ───────────────────────────────────────────────────────────────────────────────────────────────────
 *   buyPrice(id)                    -> the shop's asking price (SYSTEMS §4 `buy`)
 *   sellPrice(id, {outgrown})       -> floor(buy * 0.5), or 0.65 for gear two tiers below your best (SYSTEMS §5)
 *   tradeInPrice(id)                -> floor(buy * 0.75): the hand-me-down rate, only when the old piece is handed
 *                                      over in the same breath as buying a better one for that slot. This is the
 *                                      P22 half of the DATA-SHAPES §9.3 economy gap — see Economy.audit().
 *   innPrice({level, size})         -> round5(12 * partyLevel) for a party of two, ±25% a head either way
 *
 * ── Counters ─────────────────────────────────────────────────────────────────────────────────────────────────
 *   Shops.get(id) Shops.at(town) Shops.forNpc(npcId)   -> {id, kind:'shop'|'inn'|'church'|'bank', ...}
 *   A shop:   {kind:'shop', name, town, npc, keeper, voice, stock:[itemId], lines:{greet,buy,poor,sell,bye,...}}
 *   An inn:   {kind:'inn',  name, town, npc, keeper, voice, beds, lines:{greet,yes,no,morning}}
 *   A church: {kind:'church', name, town, npc, priest, voice, lines:{greet,save,saved,heal,revive,blessing}}
 *   A bank:   {kind:'bank', name, town, npc, unit: 100}
 *
 * ── Economy ──────────────────────────────────────────────────────────────────────────────────────────────────
 *   Economy.LEGS                     SYSTEMS §5's ten legs: battles, gold a battle, chest gold, the big buy
 *   Economy.nextBuyCheck()           -> per leg: what the purse holds when the big buy comes up, and whether it
 *                                      covers it. This is the contract "you can always afford the next thing".
 *   Economy.audit({tradeIn})         -> what the whole assumed kit of tests/battle/areas.js costs against what a
 *                                      child earns, with and without hand-me-downs (DATA-SHAPES §9.3).
 *   Both run in plain node:  node -e "import('./src/data/shops.js').then(m=>console.log(m.Economy.audit()))"
 */
// P21's table is the one the whole game reads (docs/DATA-SHAPES §4): 73 rows, 44 of them buyable, every price
// copied from SYSTEMS §4 and a line of voice on every single row. The counters read THAT, not a copy.
import { ITEMS as ITEM_TABLE, sellPrice as itemsSellPrice, isKey as itemsIsKey, canEquip, statLine, traitWords,
  describe as describeItem, buyable, whoWords } from './items.js';

let ITEMS = ITEM_TABLE || {};
/** Swap the table (a test, or a later data owner). Defaults to src/data/items.js. */
export function useItems(items) { if (items && typeof items === 'object') ITEMS = items; return Object.keys(ITEMS).length; }
export { canEquip, statLine, traitWords, describeItem, buyable, whoWords };

const num = (v) => (Number.isFinite(+v) ? +v : 0);
export const itemOf = (id) => (id && ITEMS[id]) || null;

export const SELL_RATE = 0.5;        // SYSTEMS §4: "Sell price is floor(buy * 0.5)"
export const OUTGROWN_RATE = 0.65;   // SYSTEMS §5: two tiers below your best sells at 65%
export const TRADE_IN_RATE = 0.75;   // P22: handed over while buying its replacement

/** round to the nearest 5, never below 5 — "12 gold a bed" money, not 137-gold money. */
export const round5 = (n) => Math.max(5, Math.round(num(n) / 5) * 5);

export function buyPrice(id) { const it = itemOf(id); return it ? Math.max(0, Math.round(num(it.buy))) : 0; }

/** Nothing sells for more than it cost, and a keepsake never sells at all — P21's rule, used as published. */
export function sellPrice(id, { outgrown = false } = {}) {
  const it = itemOf(id);
  if (!it) return 0;
  if (ITEMS === ITEM_TABLE) return itemsSellPrice(id, { outgrown });
  if (it.noSell || it.key || it.kind === 'key') return 0;
  const buy = buyPrice(id);
  if (buy <= 0) return 0;
  return Math.floor(buy * (outgrown && it.slot ? OUTGROWN_RATE : SELL_RATE));
}

/** The hand-me-down rate: the old sword goes over the counter as you pick the new one up. */
export function tradeInPrice(id) {
  const it = itemOf(id);
  if (!it) return 0;
  if (ITEMS === ITEM_TABLE ? itemsIsKey(id) : (it.noSell || it.key || it.kind === 'key')) return 0;
  const buy = buyPrice(id);
  if (buy <= 0) return 0;
  return Math.max(1, Math.floor(buy * TRADE_IN_RATE));
}

/**
 * SYSTEMS §5: "Inns cost 12 x partyLevel gold, rounded to the nearest 5." That number is the price for the pair
 * of you (VOICE 'inn': "%N% gold the pair of you"); each head above or below two moves it a quarter.
 */
export function innPrice({ level = 1, size = 2 } = {}) {
  const lvl = Math.max(1, Math.round(num(level) || 1));
  const heads = Math.max(1, Math.round(num(size) || 1));
  return round5(12 * lvl * (1 + (heads - 2) * 0.25));
}

// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
// THE WORDS — VOICE-BIBLE §4 (20-31). " / " is a line break; %N% is a number, %ITEM% a thing, %NAME% a person.
// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
export const SHOP_WORDS = {
  greet: 'Morning! Buying, selling, or sheltering / from the weather?',
  buyWhat: 'Have a look. Have a good long look.',
  sellWhat: 'Go on then. What are you tired of?',
  ask: 'The %ITEM%. That is %N% gold. / Shall I wrap it?',
  buy: "Lovely choice. That'll be %N% gold.",
  poor: "Ah. You're %N% gold short. / I'd give you it, but my wife counts.",
  sell: "I'll give you %N% for it. / I'll regret it by Thursday.",
  sellOld: 'That has done its miles. / %N% gold, and thank you for it.',
  tradeIn: "And I'll take the old one off you. / %N% gold back. Call it luck.",
  nothingToSell: 'You are carrying string and hope. / I cannot shift either.',
  wontBuy: 'That one is not mine to buy. / Keep it. It likes you.',
  wearIt: 'Shall %NAME% put it on now?',
  worn: '%NAME% puts on the %ITEM%.',
  equipNo: '%NAME% gives it a hopeful wobble. / It doesn’t fit anybody.',
  full: 'The bag is full to bursting. / Eat something and come back.',
  bye: 'Mind how you go. Take the lantern.',
};

export const INN_WORDS = {
  // VOICE-BIBLE 15-19, in the bible's own words; a named keeper in COUNTERS below may say their own instead.
  greet: 'A bed each, and breakfast if you’re up / before the bread’s gone. %N% gold?',
  yes: 'Sleep well. Mind the third stair.',
  no: 'Suit yourself. The bench outside / is free, and very honest about it.',
  poor: 'Come back when your purse is heavier. / The pillows will wait.',
  morning: 'Morning. Everyone’s mended. / The pudding snored.',
  full: 'Everyone is up and mended. / Off you go.',
};

export const CHURCH_WORDS = {
  greet: 'Welcome. Would you like the book, / the blessing, or the quiet?',
  save: 'Your journey has been written down. / It won’t be lost now.',
  saved: 'Rest as long as you like. / The page is keeping your place.',
  over: 'There is a tale on this page already. / Shall we write over it?',
  heal: 'There. Hold still. / ...There.',
  healNone: 'Nobody here needs mending. / That is a rare page.',
  reviveWho: 'Who shall we call back?',
  revive: '%NAME% sits up, blinking. / "What did I miss?"',
  reviveNone: 'Everybody is standing up. / Long may it last.',
  uncurse: 'Whatever that ring was whispering, / it has stopped.',
  blessing: 'Go carefully. Come back muddy.',
  defeat: 'You wake on a church bench. / Your purse is lighter. You are not.',
};

export const BANK_WORDS = {
  greet: 'Gold in, gold out. / In hundreds, if you please.',
  in: '%N% gold, safe behind the counter.',
  out: '%N% gold, back in your hand.',
  none: 'There is nothing in the drawer / but the drawer.',
  bye: 'It will be here. That is the whole idea.',
};

// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
// THE COUNTERS — WORLD-BIBLE §2/§3, stocked from the "Where" column of SYSTEMS §4.
// `npc` is the map NPC a child talks to (src/world/maps/<town>.npcs.js); the shop opens when that talk ends.
// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
const COUNTERS = [
  // ── Puddlewick (Act I) ───────────────────────────────────────────────────────────────────────────────────
  {
    id: 'puddlewick_shop', kind: 'shop', trade: 'arms', town: 'puddlewick', npc: 'hammond',
    name: 'Hammond’s, iron and oil', keeper: 'Mr Hammond', voice: 'low:0.86',
    stock: ['cypress_stick', 'sling', 'copper_sword', 'wayfarers_clothes', 'pot_lid'],
    lines: {
      greet: 'Iron, oil, and me deciding / whether you are ready for any of it.',
      buy: 'Right you are. %N% gold.',
      poor: 'You are %N% short, lad. / Come back when the sheep have sold.',
      bye: 'Mind the edges. All of them.',
    },
  },
  {
    id: 'puddlewick_bakery', kind: 'shop', trade: 'goods', town: 'puddlewick', npc: 'nan',
    name: 'Nan Puddifoot’s counter', keeper: 'Nan Puddifoot', voice: 'high:0.96',
    stock: ['herb', 'antidote_drop', 'wake_me_up'],
    lines: {
      greet: 'Warm one, love? / And something for the scrapes.',
      buy: 'There you are, love. %N% gold.',
      poor: 'You are %N% short, love. / Have a corner of one anyway.',
      bye: 'Don’t tell your father.',
    },
  },
  {
    id: 'puddlewick_hats', kind: 'shop', trade: 'goods', town: 'puddlewick', npc: 'brim',
    name: 'Mr Brim, hats', keeper: 'Mr Brim', voice: 'low:1.22',
    stock: ['straw_hat'],
    lines: {
      greet: 'Hats. Hats for every head / in Puddlewick.',
      buy: 'A hat! For you! %N% gold.',
      poor: 'That is %N% gold short of a hat. / It is still free to try one on.',
      bye: 'Wear it at an angle. Everyone does.',
    },
  },
  {
    id: 'puddlewick_inn', kind: 'inn', town: 'puddlewick', npc: 'pottle',
    name: 'Mrs Pottle’s', keeper: 'Mrs Pottle', voice: 'high:0.98', beds: 2,
    lines: {
      greet: '%N% gold, and the soup / is not optional.',
      yes: 'Sleep well. Mind the third stair.',
      no: 'Nobody stays here. They stop here.',
      morning: 'Morning. The soup is famous. / The secret is turnip.',
    },
  },
  {
    id: 'puddlewick_inn_bess', kind: 'inn', town: 'puddlewick_inn', npc: 'inn-tansy',
    name: 'the Puddlewick inn', keeper: 'Bess Hammond', voice: 'high:1.06', beds: 2,
    lines: {
      greet: '%N% gold and I do the actual inn. / Dad does the saying hello.',
      yes: 'Up the stairs. Second on the left.',
      no: 'Right you are. The fire is free.',
      morning: 'You are up. Good. / The beds want doing.',
    },
  },
  {
    id: 'puddlewick_shrine', kind: 'church', town: 'puddlewick', npc: 'candlewick',
    name: 'the shrine of Saint Alden', priest: 'Sister Candlewick', voice: 'high:1.0',
    lines: {
      greet: 'Rest here a moment. / The book keeps its place.',
      blessing: 'Go carefully. Come back muddy.',
      heal: 'There. Hold still. / ...There.',
    },
  },

  // ── Saltmarrow (the first bigger place) ──────────────────────────────────────────────────────────────────
  {
    id: 'saltmarrow_shop', kind: 'shop', trade: 'arms', town: 'saltmarrow', npc: 'saltmarrow_smith',
    name: 'the Beck-side armoury', keeper: 'the armourer', voice: 'low:0.92',
    stock: ['kitchen_cleaver', 'oak_boomerang', 'quilted_coat', 'leather_jerkin', 'leather_shield', 'leather_cap'],
  },
  {
    id: 'saltmarrow_goods', kind: 'shop', trade: 'goods', town: 'saltmarrow', npc: 'sump',
    name: 'Goodwife Sump’s', keeper: 'Goodwife Sump', voice: 'high:1.08',
    stock: ['herb', 'nutcake', 'antidote_drop', 'wake_me_up'],
    lines: { greet: 'Turnips, turnips, and — / no, that’s a turnip too.' },
  },
  {
    id: 'saltmarrow_oddments', kind: 'shop', trade: 'goods', town: 'saltmarrow', npc: 'saltmarrow_oddments',
    name: 'the odd little shop', keeper: 'a woman with a great many pockets', voice: 'high:0.9',
    stock: ['lucky_acorn'],
    lines: { greet: 'One acorn. Very lucky. / I have had it for years and look at me.' },
  },
  {
    id: 'contented_herring', kind: 'inn', town: 'saltmarrow', npc: 'dodd',
    name: 'the Contented Herring', keeper: 'Dodd Pye', voice: 'low:0.94', beds: 3,
    lines: {
      greet: '%N% gold the lot of you, / and I’ll not charge the cat.',
      yes: 'Sleep well. The parrot lies.',
      no: 'Right you are. Mind our Willow.',
      morning: 'Morning. The parrot said you snored. / The parrot lies.',
    },
  },
  { id: 'saltmarrow_church', kind: 'church', town: 'saltmarrow', npc: 'saltmarrow_priest', name: 'the Saltmarrow chapel', priest: 'the priest', voice: 'low:1.02' },
  { id: 'saltmarrow_bank', kind: 'bank', town: 'saltmarrow', npc: 'saltmarrow_banker', name: 'the Saltmarrow counter', keeper: 'the teller', voice: 'low:1.1', unit: 100 },

  // ── Port Pelican ─────────────────────────────────────────────────────────────────────────────────────────
  {
    id: 'port_pelican_arms', kind: 'shop', trade: 'arms', town: 'port_pelican', npc: 'pelican_smith',
    name: 'the quayside armoury', keeper: 'the armourer', voice: 'low:0.88',
    stock: ['chain_whip', 'iron_lance', 'cooks_apron', 'chain_mail', 'iron_shield', 'swiftfoot_anklet'],
  },
  {
    id: 'port_pelican_goods', kind: 'shop', trade: 'goods', town: 'port_pelican', npc: 'pelican_grocer',
    name: 'the chandler’s', keeper: 'the chandler', voice: 'high:0.94',
    stock: ['herb', 'strong_herb', 'nutcake', 'antidote_drop', 'wake_me_up', 'homing_feather', 'whiff_powder'],
  },
  { id: 'port_pelican_inn', kind: 'inn', town: 'port_pelican', npc: 'pelican_innkeeper', name: 'the Packet & Parrot', keeper: 'the innkeeper', voice: 'low:1.0', beds: 4 },
  { id: 'port_pelican_church', kind: 'church', town: 'port_pelican', npc: 'pelican_priest', name: 'the harbour chapel', priest: 'the priest', voice: 'low:1.0' },
  { id: 'port_pelican_bank', kind: 'bank', town: 'port_pelican', npc: 'pelican_banker', name: 'the harbour counter', keeper: 'the teller', voice: 'low:1.1', unit: 100 },

  // ── Marbleford ───────────────────────────────────────────────────────────────────────────────────────────
  {
    id: 'marbleford_arms', kind: 'shop', trade: 'arms', town: 'marbleford', npc: 'marbleford_smith',
    name: 'the Marbleford forge', keeper: 'the smith', voice: 'low:0.84',
    stock: ['steel_sword', 'woodcutters_axe', 'ash_staff', 'silk_robe', 'iron_armour', 'mirror_shield', 'iron_helm', 'ring_of_patience'],
  },
  {
    id: 'marbleford_goods', kind: 'shop', trade: 'goods', town: 'marbleford', npc: 'marbleford_grocer',
    name: 'the market stall', keeper: 'the stallholder', voice: 'high:1.02',
    stock: ['herb', 'strong_herb', 'fresh_herb', 'nutcake', 'honeycake', 'antidote_drop', 'wake_me_up', 'angels_kiss', 'homing_feather', 'whiff_powder'],
  },
  { id: 'marbleford_inn', kind: 'inn', town: 'marbleford', npc: 'marbleford_innkeeper', name: 'the Marble Arms', keeper: 'the innkeeper', voice: 'high:0.9', beds: 4 },
  { id: 'marbleford_church', kind: 'church', town: 'marbleford', npc: 'marbleford_priest', name: 'the Marbleford church', priest: 'the abbot', voice: 'low:0.96' },
  { id: 'marbleford_bank', kind: 'bank', town: 'marbleford', npc: 'marbleford_banker', name: 'the Marbleford counter', keeper: 'the teller', voice: 'low:1.1', unit: 100 },

  // ── Coldcomfort and Highfeather (Act III) ────────────────────────────────────────────────────────────────
  {
    id: 'coldcomfort_arms', kind: 'shop', trade: 'arms', town: 'coldcomfort', npc: 'coldcomfort_smith',
    name: 'the Coldcomfort stall', keeper: 'the smith', voice: 'low:0.9',
    stock: ['frostbite_sabre', 'fur_cloak', 'wide_awake_crown', 'fresh_herb', 'honeycake'],
  },
  { id: 'coldcomfort_inn', kind: 'inn', town: 'coldcomfort', npc: 'coldcomfort_innkeeper', name: 'the Thawing Hearth', keeper: 'the innkeeper', voice: 'low:1.04', beds: 4 },
  { id: 'coldcomfort_church', kind: 'church', town: 'coldcomfort', npc: 'ilma', name: 'Sister Ilma’s shrine', priest: 'Sister Ilma', voice: 'high:0.94',
    lines: { greet: 'Two candles. That’s the whole church. / Pray if you like.' } },
  {
    id: 'highfeather_arms', kind: 'shop', trade: 'arms', town: 'highfeather', npc: 'highfeather_smith',
    name: 'the Feather forge', keeper: 'the smith', voice: 'low:0.86',
    stock: ['thunderfork', 'gleaming_plate', 'dragon_scale_shield', 'fresh_herb', 'honeycake', 'angels_kiss'],
  },
  { id: 'ambergarde_bank', kind: 'bank', town: 'ambergarde', npc: 'ambergarde_banker', name: 'the Ambergarde counter', keeper: 'the teller', voice: 'low:1.08', unit: 100 },
];

const BY_ID = new Map();
const BY_NPC = new Map();
for (const c of COUNTERS) {
  const words = c.kind === 'inn' ? INN_WORDS : c.kind === 'church' ? CHURCH_WORDS : c.kind === 'bank' ? BANK_WORDS : SHOP_WORDS;
  c.lines = Object.assign({}, words, c.lines || {});
  if (c.kind === 'shop' && !Array.isArray(c.stock)) c.stock = [];
  if (c.kind === 'shop') c.stock = c.stock.filter((id) => !!itemOf(id));
  BY_ID.set(c.id, c);
  if (c.npc) BY_NPC.set(c.npc, c);
}

export const Shops = {
  all: () => COUNTERS.slice(),
  get: (id) => BY_ID.get(id) || null,
  forNpc: (npcId) => BY_NPC.get(npcId) || null,
  at: (town) => COUNTERS.filter((c) => c.town === town),
  ids: () => COUNTERS.map((c) => c.id),
  npcs: () => Array.from(BY_NPC.keys()),
};

// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
// THE ECONOMY — SYSTEMS §5's ten legs, and the audit the DATA-SHAPES §9.3 gap asked for.
// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
/**
 * [battles walking through, gold a battle, chest gold, the big buy at the end, its price]
 *
 * BALANCE PASS P22 2026-09-18 — the payout half of the DATA-SHAPES §9.3 economy gap. SYSTEMS §5's published
 * table was written for ONE hero's big buy a leg (16,968 G of battle gold, 6,955 G of chests, 23,953 G all
 * told). The party a non-grinding child really walks with (tests/battle/areas.js) has to kit out up to six
 * people, which costs 34,978 G fresh — so the plan was 11,000 G short and a child would have arrived at
 * Highfeather in leather. `gold` and `chest` below are raised to pay for the WHOLE family, keeping the shape
 * of the published curve (each leg still roughly 1.5x the one before). `bandLow`/`bandHigh` is the spread a
 * single fight may pay inside a leg, kept at the published ±30% so no one fight feels like a jackpot.
 * NEEDS P31: the wild gold in tests/battle/data.js / balance-wild.js must average `gold` per fight for these
 * numbers to be real in play; the `kit` column of Economy.audit() says what each leg has to buy.
 */
export const LEGS = [
  { leg: 1, area: 'Puddlewick Vale & the Long Lane', walk: 10, gold: 6, chest: 30, buy: 'Copper Sword', price: 70 },
  { leg: 2, area: 'Saltmarrow Coast & the Whispering Wood', walk: 12, gold: 12, chest: 110, buy: 'Quilted Coat + Herbs', price: 114 },
  { leg: 3, area: 'Cobwell Manor & Coddleston Downs', walk: 14, gold: 22, chest: 200, buy: 'Oak Boomerang', price: 220 },
  { leg: 4, area: 'The Whistling Caves & the Frittering Sands', walk: 13, gold: 36, chest: 260, buy: 'Chain Whip', price: 300 },
  { leg: 5, area: 'Pelican Coast to Port Pelican', walk: 15, gold: 56, chest: 640, buy: 'Iron Lance + Iron Shield', price: 960 },
  { leg: 6, area: 'Marbleford Downs', walk: 14, gold: 90, chest: 700, buy: 'Steel Sword', price: 900 },
  { leg: 7, area: 'The Sighing Grotto & the road to Ambergarde', walk: 16, gold: 160, chest: 1600, buy: 'Iron Armour + Mirror Shield', price: 2800 },
  { leg: 8, area: 'The Frostbottom & the Glasswing Grotto', walk: 15, gold: 240, chest: 2000, buy: 'Frostbite Sabre', price: 2400 },
  { leg: 9, area: 'Highfeather', walk: 16, gold: 360, chest: 3000, buy: 'Gleaming Plate + Thunderfork', price: 6800 },
  { leg: 10, area: 'Whistfell Abbey & the Quiet Deep', walk: 18, gold: 500, chest: 4600, buy: 'Dragon-scale Shield', price: 4000 },
];
/** The spread one fight inside a leg may pay, so a child sees varied numbers and never a jackpot. */
export const goldBand = (leg) => {
  const L = LEGS.find((x) => x.leg === Math.round(num(leg))) || LEGS[0];
  return [Math.max(1, Math.round(L.gold * 0.7)), Math.round(L.gold * 1.3)];
};

export const START_GOLD = 30;

export const Economy = {
  LEGS,
  START_GOLD,

  /** SYSTEMS §5's promise: at the end of every leg the purse covers that leg's big buy. */
  nextBuyCheck() {
    let purse = START_GOLD;
    const rows = [];
    let worst = Infinity;
    for (const L of LEGS) {
      purse += L.walk * L.gold + L.chest;
      const ok = purse >= L.price;
      const left = purse - L.price;
      worst = Math.min(worst, left);
      rows.push({ leg: L.leg, purse, buy: L.buy, price: L.price, ok, left });
      purse = left;
    }
    return { ok: rows.every((r) => r.ok), worstLeftOver: worst, rows };
  },

  /**
   * THE HOUSEHOLD SUM — the P22 half of the DATA-SHAPES §9.3 economy gap.
   *
   * DATA-SHAPES measured the kit of tests/battle/areas.js as one long shopping list, every piece bought new:
   * 31,338 G (36,068 G at the prices as they now stand) against ~18,000 G of battle gold. A family does not
   * shop like that. DQV's own answer is hand-me-downs: Bram's copper sword becomes Pip's the day Bram gets a
   * steel one, and only what nobody will wear again goes over the counter.
   *
   * So this walks the areas in story order and keeps ONE household:
   *   · a piece somebody has already outgrown and put in the chest is PASSED DOWN — it costs nothing;
   *   · anything else is BOUGHT at buyPrice;
   *   · a piece nobody in the family will ever wear again is handed over at tradeInPrice (75%).
   * Per leg it reports what that leg has to buy and what the purse holds when it does.
   */
  async audit({ rate = TRADE_IN_RATE } = {}) {
    let AREAS;
    try { ({ AREAS } = await import('../../tests/battle/areas.js')); }
    catch (e) { return { ok: false, reason: 'tests/battle/areas.js did not load: ' + (e && e.message) }; }

    const worn = new Map();          // who is wearing what
    const spares = new Map();        // the family chest: itemId -> how many spare
    const kit = {}, credit = {}, passed = {};
    let fresh = 0, handed = 0, handDown = 0;

    for (const a of AREAS) {
      const leg = a.leg || 1;
      kit[leg] = kit[leg] || 0; credit[leg] = credit[leg] || 0; passed[leg] = passed[leg] || 0;
      let party = [];
      try { party = (a.party ? a.party(a.areaLevel || 1) : []) || []; } catch (_) { party = []; }
      for (const m of party) {
        if (!m || !m.equip) continue;
        const cur = worn.get(m.id) || {};
        for (const [slot, id] of Object.entries(m.equip)) {
          if (!id || cur[slot] === id) continue;
          const cost = buyPrice(id);
          if (cost > 0) {
            if ((spares.get(id) || 0) > 0) { spares.set(id, spares.get(id) - 1); passed[leg] += cost; handDown += cost; }
            else { kit[leg] += cost; fresh += cost; }
          }
          if (cur[slot]) spares.set(cur[slot], (spares.get(cur[slot]) || 0) + 1);
          cur[slot] = id;
        }
        worn.set(m.id, cur);
      }
      // Anything in the chest that nobody in the family is wearing any more goes over the counter.
      for (const [id, n] of Array.from(spares)) {
        let wanted = false;
        for (const w of worn.values()) for (const v of Object.values(w)) if (v === id) wanted = true;
        if (wanted) continue;
        const back = n * Math.floor(buyPrice(id) * rate);
        credit[leg] += back; handed += back;
        spares.delete(id);
      }
    }

    let purse = START_GOLD, worst = Infinity;
    const rows = [];
    for (const L of LEGS) {
      const income = L.walk * L.gold + L.chest + (credit[L.leg] || 0);
      purse += income - (kit[L.leg] || 0);
      const k = kit[L.leg] || 0;
      rows.push({ leg: L.leg, income, chest: L.chest, soldBack: credit[L.leg] || 0, kit: k,
        passedDown: passed[L.leg] || 0, left: purse, slackPct: k ? Math.round((purse / k) * 100) : null,
        ok: purse >= 0 });
      worst = Math.min(worst, purse);
    }

    const earnedBattle = LEGS.reduce((s, L) => s + L.walk * L.gold, 0);
    const earnedChest = LEGS.reduce((s, L) => s + L.chest, 0);
    const earned = START_GOLD + earnedBattle + earnedChest + handed;
    return {
      ok: worst >= 0 && fresh <= earned,
      earned, earnedBattle, earnedChest, soldBack: handed,
      kitFresh: fresh, passedDownValue: handDown, kitNet: fresh,
      leftAtTheEnd: purse, worstPurse: worst,
      shortfallNet: Math.max(0, fresh - earned),
      rate, rows,
    };
  },
};

export default Shops;
