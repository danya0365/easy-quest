/**
 * cobwell_manor.chests.js — the manor is deliberately RICH.    (P23B treasure layer of cobwell_manor.js)
 * WORLD-BIBLE §2 [04]: "21 containers; the Manor is deliberately *rich* (35% hit rate) so the scary place
 * rewards you." A2's hidden larder is the reward for searching a scary room anyway, and the nursery hatbox is
 * where Pip is (`party.pip`, CANON B6) — the story piece flips that flag; this layer only puts the box there.
 */
export default {
  chests: [
    // A1 the front hall: the Candle and the Retreat Bell, in a chest by the door, exactly as Barnaby says
    { id: 'cm_hall_chest', x: 3.4, z: 16.4, kind: 'chest', item: 'candle',
      name: 'a chest by the hall table', line: 't-candle', reach: 1.7 },
    { id: 'cm_hall_bell', x: -3.4, z: 13.0, kind: 'chest', item: 'retreat_bell',
      name: 'a small chest on the hall table', line: 't-bell', reach: 1.7 },
    { id: 'cm_coats', x: -5.2, z: 17.0, kind: 'hidden', gold: 14, name: 'the warm coat', line: 't-coat', reach: 1.6 },
    // A2 the gallery
    { id: 'cm_urn_w', x: -10.2, z: 2.2, kind: 'pot', name: 'an urn in the gallery', line: 't-urn', reach: 1.6 },
    { id: 'cm_urn_e', x: 10.2, z: 2.2, kind: 'pot', item: 'herb', name: 'the other urn', line: 't-urn-2', reach: 1.6 },
    { id: 'cm_urn_n', x: -10.2, z: 7.8, kind: 'pot', gold: 11, name: 'the third urn', line: 't-urn-3', reach: 1.6 },
    // A3 the kitchen
    { id: 'cm_barrel_1', x: -14.4, z: -5.0, kind: 'barrel', name: 'the first barrel', line: 't-barrel', reach: 1.6 },
    { id: 'cm_barrel_2', x: -14.4, z: -6.1, kind: 'barrel', item: 'strong_herb', name: 'the second barrel', line: 't-barrel-2', reach: 1.6 },
    { id: 'cm_range', x: -12.6, z: -4.9, kind: 'oven', gold: 16, name: 'inside the range', line: 't-range', reach: 1.8 },
    { id: 'cm_crates', x: -4.4, z: -5.0, kind: 'crate', name: 'the kitchen crates', line: 't-crates', reach: 1.6 },
    { id: 'cm_pots', x: -5.0, z: -1.2, kind: 'pot', item: 'antidote_drop', name: 'a stack of pots', line: 't-pots', reach: 1.6 },
    // A4 the hidden larder: four containers, three of them full
    { id: 'cm_larder_1', x: -19.8, z: -4.0, kind: 'shelf', item: 'strong_herb', name: 'the damson jars', line: 't-larder', reach: 1.7 },
    { id: 'cm_larder_2', x: -20.6, z: -1.4, kind: 'shelf', gold: 45, name: 'the high shelf', line: 't-larder-2', reach: 1.7 },
    { id: 'cm_larder_3', x: -17.4, z: -1.0, kind: 'sacks', item: 'herb', name: 'the sacks', line: 't-larder-3', reach: 1.7 },
    { id: 'cm_larder_4', x: -17.6, z: -5.0, kind: 'pot', name: 'a crock in the corner', line: 't-larder-4', reach: 1.6 },
    // A5 the Long Stair
    { id: 'cm_under_stair', x: 1.3, z: -6.6, kind: 'hidden', item: 'willows_ribbon',
      name: 'under the stairs', line: 't-ribbon', reach: 1.8 },
    // A6 the nursery: the music box, the hatbox, and the shelf of nine wooden animals
    { id: 'cm_musicbox', x: 11.6, z: -2.0, kind: 'hidden', item: 'music_box',
      name: 'the painted box on the shelf', line: 't-musicbox', reach: 1.7 },
    { id: 'cm_hatbox', x: 11.4, z: -5.4, kind: 'hidden', flag: 'party.pip',
      name: 'the hatbox that mews', line: 't-hatbox', reach: 1.8 },
    { id: 'cm_cot', x: 6.4, z: -4.2, kind: 'hidden', gold: 7, name: 'under the cot', line: 't-cot', reach: 1.7 },
    { id: 'cm_shelf_animals', x: 12.0, z: -0.4, kind: 'shelf', name: 'nine wooden animals', line: 't-animals', reach: 1.7 },
    { id: 'cm_horse', x: 9.8, z: -3.9, kind: 'hidden', item: 'herb', name: 'the rocking horse’s saddlebag', line: 't-horse', reach: 1.7 },
  ],
  lines: {
    't-candle': ['A chest, unlocked, with one thing\nin it, put there for whoever\ncame.{n}A {gold}CANDLE{/gold}, and a tinderbox,\nand a note: "IT WILL GO OUT.\nTHAT IS NOT YOUR FAULT."'],
    't-bell': ['A little brass bell with a very\nserious weight to it.{n}Barnaby coughs, from across the\nhall, with enormous satisfaction.'],
    't-coat': ['%HERO% puts a hand in the warm\ncoat’s pocket.{n}Coins. Still warm. He puts them\nin his own pocket and does not\nthink about it.'],
    't-urn': ['%HERO% looks in the urn.{n}Two hundred years of dust, and\nthe dust is DRY, which in this\nhouse is a surprise.'],
    't-urn-2': ['%HERO% looks in the other urn.{n}A herb, still green, which is\nimpossible.'],
    't-urn-3': ['%HERO% tips the third urn.{n}Coins ring on the boards and\nevery portrait looks at once.'],
    't-barrel': ['%HERO% looks in the first barrel.{n}Apples. Perfect apples. He puts\nthe lid back on very gently.'],
    't-barrel-2': ['%HERO% looks in the second\nbarrel.{n}Medicine, corked and waxed and\nlabelled FOR THE CHILDREN.'],
    't-range': ['%HERO% opens the range.{n}It is cold. Inside, on the\ngrate, somebody has left coins\nin a little pile.'],
    't-crates': ['%HERO% opens the crates.{n}Candlesticks. Forty of them. All\nfacing the same way.'],
    't-pots': ['%HERO% takes the top pot off.{n}A stoppered bottle with a\nbitter smell and a kind label.'],
    't-larder': ['"DAMSONS, 1101." The wax is\nunbroken. %HERO% takes one jar\nand feels like a burglar and a\nguest at the same time.'],
    't-larder-2': ['On the high shelf, behind the\njars, a purse nobody has been\nable to reach since 1102.'],
    't-larder-3': ['%HERO% opens the sacks.{n}Flour, meal, and one herb\nwrapped in paper on top, like\na note.'],
    't-larder-4': ['%HERO% lifts the crock lid.{n}Empty. Scrubbed. Somebody was\nvery proud of this crock.'],
    't-ribbon': ['It is dark under the stairs, and\nthe draught has just taken the\ncandle.{wait:600}{n}In the dark, something is put\ninto %HERO%’s hand, and tied\nround his wrist, twice.',
      '{gold}"There,"{/gold} says Willow, from\nvery close by.{p}{gold}"Now the dark knows you belong\nto somebody."{/gold}'],
    't-musicbox': ['A small painted box with a brass\nhandle.{n}%HERO% turns it once. Three\nnotes, too slow, and one of them\nstuck.{p}{gold}MUSIC BOX 1 of 3.{/gold}'],
    't-hatbox': ['The hatbox mews.{wait:500}{n}%HERO% takes the lid off.',
      'A ginger kitten with two very\nsmall sabre teeth looks up at\nhim, entirely unsurprised.',
      '{gold}PIP{/gold} climbs straight up his\nsleeve and goes to sleep on his\nshoulder, and that is that for\nthe rest of his life.'],
    't-cot': ['%HERO% looks under the cot.{n}A marble, a boot, and seven gold\nin a sock.'],
    't-animals': ['Nine wooden animals in a row.\nThe tenth space is empty and\nhas been dusted.'],
    't-horse': ['There is a little bag on the\nsaddle, and in the bag, a herb,\nfor the journey somebody was\ngoing to make.'],
    search: ['%HERO% has a good look round.{n}Dust, and the feeling of being\npolitely waited for.',
      '%HERO% searches the dark bit.{n}Nothing. But it was very brave\nof him and everybody noticed.'],
  },
};
