/**
 * strings.js — every string the machine says, written by the same hand as the dialogue.
 *                                                                              (P12, owner: src/data/strings.js)
 *
 * VOICE-BIBLE §3 is the source for the system strings (they are quoted here as written) and WORLD-BIBLE §5 for the
 * empty-container lines. House rule R7: there is no computer in this world — no "ERROR", no "OK", no "INVALID",
 * no "Loading...". The fanfare does the shouting, so the words stay calm.
 *
 *   import { STR, str, line, container, pick } from '../data/strings.js';
 *
 *   str('level.up', {NAME: 'Bram', N: 4})    -> 'Bram is now level 4! / Looking rather pleased about it.'
 *   str('missing.key')                       -> null  (never a thrown error, never the key echoed at a child)
 *   container('pot', 3)                      -> the 4th pot line, in order, so a map never repeats one
 *   pick('search.nothing')                   -> a random one where a key holds several
 *   line('inn.greet', {N: 6})                same as str; `line` reads better at a call site
 *
 * Tokens are CANON §10: %HERO% %WIFE% %SON% %DAUGHTER% %PIP% %NAME% %MONSTER% %ITEM% %SPELL% %N% %G% %PLACE% %TEXT%
 * %TARGET% %OTHER%. Anything not supplied is left as written (so a half-built caller is visible, not silent).
 * Markup is src/ui/text.js: {n} = line break, {p} = new page, {gold}...{/gold}, {wait:400}.
 *
 * Callers: P12 dialogue · P13 menus · P14/P15 battle · P17 recruiting · P19 level-ups · P22 shops, inns, churches ·
 * P30 chests and searching · P32 place cards · F5 saves. Add a key here rather than inlining words anywhere else.
 */

// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
// 1. the system strings (VOICE-BIBLE §3)
// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
export const STR = {
  // ── ceremony ──────────────────────────────────────────────────────────────────────────────────────────────
  'level.up': '%NAME% is now level %N%!{n}Looking rather pleased about it.',
  'level.stats': 'Strength up by %N%.{n}And a bit more room for supper.',
  'spell.learn': '%NAME% has learnt %SPELL%!{n}It tingles all the way down\nto the elbows.',
  'spell.learn.first': 'Something new is rattling about\nin %NAME%\'s head. It\'s %SPELL%.',
  'chest.open': '%HERO% opens the chest.{n}Inside: %ITEM%.',
  'chest.gold': '%N% gold coins. Someone hid these\nand then forgot. Their loss.',
  'chest.empty': 'The chest is empty, and somehow\nsmug about it.',
  'chest.already': 'This chest has already given\neverything it had. Let it rest.',
  'item.get': '%HERO% has got the %ITEM%!',
  'item.get.key': '%HERO% has got the %ITEM%.{n}Doors everywhere shift uneasily.',
  'item.use': '%NAME% uses the %ITEM%.',
  'item.full': 'The bag is full. Something\nin there would have to go,\nand nothing wants to.',
  'gold.found': '%N% gold coins, found in a boot.',
  'map.enter': '%PLACE%',

  // ── church, inn, shop ─────────────────────────────────────────────────────────────────────────────────────
  'inn.greet': 'A bed each, and breakfast if\nyou\'re up before the bread\'s\ngone. %N% gold?',
  'inn.yes': 'Sleep well. Mind the third stair.',
  'inn.wake': 'Morning. Everyone\'s mended.{n}The pudding snored.',
  'inn.poor': 'Come back when your purse\nis heavier.{n}The pillows will wait.',
  'inn.no': 'Suit yourself. The bench outside\nis free, and very honest about it.',
  'church.greet': 'Welcome. Would you like the book,\nthe blessing, or the quiet?',
  'church.save': 'Your journey has been written\ndown. It won\'t be lost now.',
  'church.saved': 'Rest as long as you like.{n}The page is keeping your place.',
  'church.heal': 'There. Hold still.{n}...There.',
  'church.uncurse': 'Whatever that ring was\nwhispering, it has stopped.',
  'church.blessing': 'Go carefully. Come back muddy.',
  'shop.greet': 'Morning! Buying, selling, or\nsheltering from the weather?',
  'shop.buy': 'Lovely choice. That\'ll be %N% gold.',
  'shop.poor': 'Ah. You\'re %N% gold short.{n}I\'d give you it, but my wife\ncounts.',
  'shop.sell': 'I\'ll give you %N% for it.{n}I\'ll regret it by Thursday.',
  'shop.bye': 'Mind how you go. Take the lantern.',
  'shop.equip.no': '%NAME% gives it a hopeful wobble.{n}It doesn\'t fit anybody.',

  // ── battle ────────────────────────────────────────────────────────────────────────────────────────────────
  'enc.start': '%MONSTER% draws near!',
  'enc.group': 'A %MONSTER% and friends draw near!',
  'enc.ambush': 'They came out of nowhere!',
  'enc.first': 'You\'ve caught them napping!',
  'atk.hit': '%NAME% hits %TARGET% for %N%\ndamage.',
  'atk.crit': 'A terrific whack! %N% damage!',
  'atk.miss': '%NAME% swings at the air.{n}The air is unharmed.',
  'spell.cast': '%NAME% casts %SPELL%!',
  'spell.nomp': '%NAME% hasn\'t the puff for it.',
  'spell.fizzle': 'The spell coughs, thinks better\nof it, and goes out.',
  heal: '%NAME% is looking much better.',
  'heal.full': '%NAME% is already in the pink!',
  ko: '%NAME% is worn out.',
  revive: '%NAME% sits up, blinking.{n}"What did I miss?"',
  'status.sleep': '%NAME% is fast asleep.{n}Rude, mid-fight.',
  'status.poison': '%NAME% is looking rather green.',
  'status.confuse': '%NAME% has forgotten which way\nis which.',
  'flee.ok': 'Everybody runs. Nobody mentions\nit again.',
  'flee.fail': '%HERO% turns to run, thinks\nabout it, and turns back.',
  'enemy.flee': 'The %MONSTER% has had enough\nand legs it.',
  'enemy.down': 'The %MONSTER% is beaten.',
  victory: 'Victory!',
  'victory.exp': '%N% experience points.{n}%G% gold coins.',
  defeat: 'You are dreaming of somewhere\nwarm. Somebody is carrying you.',
  'defeat.church': 'You wake on a church bench.{n}Your purse is lighter.\nYou are not.',

  // ── monsters joining, the wagon, the party ────────────────────────────────────────────────────────────────
  'recruit.ask': 'The %MONSTER% is still here.{n}It appears to have decided\nsomething.',
  'recruit.join': '%MONSTER% wants to be your friend!{n}Shall it come along?',
  'recruit.name': 'What will you call it?',
  'recruit.joined': '%NAME% has joined the party.{n}%NAME% is thrilled about\nthe wagon.',
  'recruit.decline': 'The %MONSTER% nods, entirely\nfine about it, and wanders off\nto tell its mother.',
  'recruit.full': 'The wagon is full of monsters\nand opinions.{p}%NAME% trots off to the paddock\nat home to wait.',
  'party.swap': '%NAME% climbs down.\n%OTHER% climbs up.',
  'party.wagon.no': 'No wagon down here.\nIt\'s all stairs.',

  // ── searching the world (the discovery voice) ─────────────────────────────────────────────────────────────
  'pot.empty': 'The pot holds nothing but\na spider, and the spider\nis not for sale.',
  'barrel.empty': 'Barrel of rainwater. And one\nboot. Just the one.',
  'drawer.empty': 'Socks. Somebody\'s whole life\nin socks.',
  wardrobe: '%HERO% stands in the wardrobe\nfor a bit. It\'s nice in here.',
  bookshelf: 'A book about turnips.{n}It is longer than it needs to be.',
  'bookshelf.2': '"Monsters of the Realm,\nVolume Nine."{n}Volumes one to eight are missing.',
  cupboard: 'Jam. Nine jars of jam.{n}Someone here has a plan.',
  sack: 'Flour. %HERO% is now slightly\ngrey.',
  well: '%HERO% shouts into the well.{n}The well shouts back, eventually.',
  'bed.other': 'It\'s somebody else\'s bed.{n}They\'d notice.',
  'search.nothing': 'Nothing. But it was worth a look.',
  'door.locked': 'Locked. The handle rattles\nin a disappointed sort of way.',
  'door.needkey': 'Locked, and it wants a proper\nkey. Not a hairpin.\nIt\'s seen hairpins.',
  'door.unlock': 'The key turns.\nThe door forgives you.',
  'door.barred': 'Barred from the other side.{n}Someone in there does not want\nTuesday.',
  sign: '%TEXT%',

  // ── system, saves and settings ────────────────────────────────────────────────────────────────────────────
  'title.new': 'A New Tale',
  'title.continue': 'Carry On',
  'name.prompt': 'And what shall we call the boy?',
  'save.confirm': 'Write the tale down here?',
  'save.done': 'Written down, and safe.',
  'save.over': 'There\'s a tale here already.{n}Shall we write over it?',
  quit: 'Close the book for now?',
  'settings.text': 'How fast should the words come?',
  hint: 'Where were we, then?',
  'quest.new': 'Something to do: %TEXT%',

  // ── weather and time (barks from the world, not the UI) ───────────────────────────────────────────────────
  night: 'The lamps are being lit.',
  dawn: 'Somewhere, a cockerel is very\npleased with itself.',
  rain: 'Rain. The good sort,\nfor staying in.',

  // ── talking to nothing in particular (P12 / P13 fallbacks) ────────────────────────────────────────────────
  'talk.nobody': 'There is nobody here to talk to.{n}A bee says hello, though.',
  'talk.nothing': 'They have nothing to say,{n}and they say it very nicely.',
  'talk.busy': 'Not now, love. Mid-thought.',
};

// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
// 2. the empty containers — where the CHARM budget is spent (WORLD-BIBLE §5: at least sixty, never repeated
//    within one map). `container(kind, n)` walks the list in order; P30 keeps the counter per map.
// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
export const EMPTY = {
  pot: [
    'The pot holds nothing but a\nspider, and the spider is not\nfor sale.',
    'Nothing. The pot is doing\nits best.',
    'Empty — but it has the smell of\na pot that once held something\nmarvellous.',
    'A pot of dust, arranged with\nreal commitment.',
    'One dried pea. It rolls out,\nlooks at the floor, and stops.',
    'Empty, and you can hear the sea\nin it. You are four hundred\nmiles inland.',
    'Somebody has painted a face on\nthe inside of this pot.\nIt is having a lovely time.',
    'A pot with nothing in it and\na crack down one side.{n}It is still on duty.',
  ],
  barrel: [
    'Barrel of rainwater. And one\nboot. Just the one.',
    'A barrel of rainwater and one\nextremely surprised frog.',
    'Salt. Rather a lot of salt.{n}Nobody needs this much salt.',
    'Empty, and it smells of apples\nfrom about nine years ago.',
    'Beans. So very many beans.{n}You take none of them,\nout of respect.',
    'Somebody is hiding in this\nbarrel.{p}...No. Somebody WAS hiding\nin this barrel.',
  ],
  crate: [
    'Straw, and the shape of\nsomething that has gone.',
    'Nailed shut, and heavy, and\nlabelled "NOT SPOONS".',
    'Empty. A very good crate, mind.\nYou could keep anything in this.',
    'Turnips. Eleven turnips.{n}Somebody counted them in ink\non the lid.',
  ],
  drawer: [
    'Socks. Somebody\'s whole life\nin socks.',
    'Socks. Only socks.\nSomehow, all left.',
    'Somebody has already been through\nthis drawer. Recently. Hm.',
    'String. Too short to keep,\nand kept.',
    'A key that fits nothing in\nthis house. It has been tried.',
    'Somebody\'s school work.\nThe spelling is heroic.',
  ],
  wardrobe: [
    '%HERO% stands in the wardrobe\nfor a bit. It\'s nice in here.',
    'Coats. None of them are your\nsize and all of them are lovely.',
    'One wedding dress, and one\nvery old bunch of hawthorn.',
    'Three identical brown coats.{n}Somebody has made a decision\nand stuck to it.',
  ],
  cupboard: [
    'Jam. Nine jars of jam.{n}Someone here has a plan.',
    'Plates for eleven.\nThere are two people in\nthis house.',
    'A cake tin with no cake in it,\nand a note reading "I know".',
    'Onions. They look back at you\nreproachfully.',
  ],
  bookshelf: [
    'A book about turnips.{n}It is longer than it needs to be.',
    '"Monsters of the Realm,\nVolume Nine."{n}Volumes one to eight are missing.',
    '"On the Keeping of Bees."{n}Somebody has crossed out\n"keeping" and written "asking".',
    'A ledger of who owes whom a\nfavour. It is nearly all\none name.',
    'A book of maps of places that\nhave since moved.',
    'Somebody has hollowed out a\nbook and kept a spare key in it.\nThe key is gone. The hole\nremains.',
  ],
  oven: [
    'Warm, and empty, and smelling\nof this morning.',
    'Cold. Long cold.',
    'One bun, forgotten at the back.{n}It is now a small brick\nwith raisins in it.',
  ],
  sack: [
    'Flour. %HERO% is now slightly\ngrey.',
    'Oats, and a mouse with an\nentirely clear conscience.',
    'Wool, ready for spinning.{n}It smells of sheep and rain.',
  ],
  urn: [
    'Dust, and a coin from a country\nthat is not there any more.',
    'Somebody\'s ashes. You put the\nlid back on very carefully.',
    'A wasps\' nest, empty.{n}Thank goodness.',
  ],
  log: [
    'A hollow log, full of leaves\nand one cross beetle.',
    'Mushrooms, and no way of knowing\nwhich sort. You leave them.',
    'Somebody has kept a fishing line\nin here. It is still wet.',
  ],
  pan: [
    'The paddock trough. Two inches\nof rain and a lot of sky.',
    'A watering can with a hole\nin exactly the wrong place.',
  ],
  generic: [
    'Nothing. But it was worth a look.',
    'Nothing here. The looking was\nfree, though.',
    'Just a spider. She looks up.\nYou look away first.',
    'Nothing but a note reading\n"I got here first."{n}It is not signed.',
    'A single boot. Its friend has\ngone on ahead.',
    'Dust, arranged with real\ncommitment.',
    'Somebody\'s comb. Nobody in this\nhouse has that much hair.',
    'Two pennies and a button.{n}The button is winning.',
    'Cobwebs, and the landlady of\nthe cobwebs.',
    'Nothing, twice.\nYou looked twice.',
  ],
};

// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
// 3. helpers
// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
const TOKEN = /%([A-Z][A-Z0-9_]*)%/g;

/** Substitute CANON §10 tokens. Unknown tokens are left as written. */
export function fill(text, vars = {}) {
  if (text == null) return null;
  const one = (s) => String(s).replace(TOKEN, (m, k) => (vars[k] ?? vars[k.toLowerCase()] ?? m));
  return Array.isArray(text) ? text.map(one) : one(text);
}

/** A system string by key, with its tokens filled in. Unknown keys return null (callers decide what to do). */
export function str(key, vars) {
  const v = STR[key];
  if (v == null) return null;
  return fill(v, vars);
}
export const line = str;

/** One of a list (or a single string) at random — for lines that may repeat without anyone minding. */
export function pick(keyOrList, vars) {
  const v = Array.isArray(keyOrList) ? keyOrList : STR[keyOrList];
  if (v == null) return null;
  const list = [].concat(v);
  return fill(list[Math.floor(Math.random() * list.length)], vars);
}

/**
 * The nth empty-container line for a kind ('pot' 'barrel' 'crate' 'drawer' 'wardrobe' 'cupboard' 'bookshelf'
 * 'oven' 'sack' 'urn' 'log' 'pan'), walking the list in order so a map never repeats one. Unknown kinds fall
 * back to the generic list; past the end of a kind's list it carries on into the generic one.
 */
export function container(kind, n = 0, vars) {
  const own = EMPTY[kind] || [];
  const i = Math.max(0, Math.floor(n));
  if (i < own.length) return fill(own[i], vars);
  const g = EMPTY.generic;
  return fill(g[(i - own.length) % g.length], vars);
}

/** How many lines exist for a kind (P30 uses it to know when it must start repeating). */
export const emptyCount = (kind) => (EMPTY[kind] || []).length + EMPTY.generic.length;
/** Every key, for tests and for a critic who wants to see what the machine can say. */
export const keys = () => Object.keys(STR);

export default STR;
