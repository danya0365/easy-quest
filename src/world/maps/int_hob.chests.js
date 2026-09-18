/**
 * int_hob.chests.js — what a child finds in Old Hob's cottage.   (P06 seed; P30 owns treasure/ceremony from here)
 */
export default {
  chests: [
    { id: 'hb_drawer', x: -5.0, z: -1.3, kind: 'drawer', name: 'the dresser drawer', line: 'search-drawer', reach: 1.6 },
    { id: 'hb_pots', x: -5.4, z: 2.2, kind: 'pot', name: 'the pots', line: 'search-pots', reach: 1.5 },
    { id: 'hb_books', x: 2.4, z: -4.2, kind: 'shelf', name: 'the bookshelf', line: 'search-books', reach: 1.6 },
    { id: 'hb_bed', x: 3.4, z: -2.6, kind: 'bed', name: 'under the bed', line: 'search-bed', reach: 1.6 },
    { id: 'hb_crate', x: 4.8, z: 2.8, kind: 'crate', name: 'a crate by the wall', line: 'search-crate', reach: 1.6 },
  ],
  lines: {
    'search-drawer': ['%HERO% opens the dresser drawer.{n}String, a spare bootlace, and a\nsmall stack of buttons, all\ndifferent, all kept.'],
    'search-pots': ['%HERO% looks in the pots.{n}Salt. Tea. And one with water\nand a single flower in it.',
      'Somebody put a flower in a pot\nin a room nobody visits.'],
    'search-books': ['%HERO% pulls out the book about\nthe sea.{wait:400}{n}It falls open on its own, at a\npicture of a harbour.',
      'Inside the cover, in pencil:\n"ONE DAY. — H."{p}The pencil is very old.'],
    'search-bed': ['%HERO% looks under the bed.{wait:350}{n}A wooden box. In it: {gold}12 gold\ncoins{/gold}, and a soldier\'s buckle,\ngreen with age.',
      'He puts the box back exactly\nwhere it was, and straightens\nthe blanket.'],
    'search-crate': ['%HERO% opens the crate.{n}Rope. Good rope, coiled the way\nsomebody was taught once and\nnever stopped doing.'],
    search: ['%HERO% stands very still in the\nmiddle of the room.{wait:600}{n}The fire ticks. Nothing else\nhappens.',
      '%HERO% looks at the chair.{n}It is the right size for him.\nHob, that is. Not you.'],
  },
};
