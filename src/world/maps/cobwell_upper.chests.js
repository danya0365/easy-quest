/**
 * cobwell_upper.chests.js — the ballroom floor's treasure.     (P23B treasure layer of cobwell_upper.js)
 * MUSIC BOX 2 is under Ottilie's dress (WORLD-BIBLE §4 A7), and the study's guest book is the best twenty
 * seconds in the dungeon, so it is a container too: you open it, and what you get is everybody's name.
 */
export default {
  chests: [
    { id: 'cu_musicbox2', x: -5.2, z: -8.6, kind: 'hidden', item: 'music_box',
      name: 'under the dress', line: 't-musicbox2', reach: 1.8 },
    { id: 'cu_wardrobe', x: -10.8, z: -5.0, kind: 'wardrobe', item: 'strong_herb',
      name: 'Ottilie’s wardrobe', line: 't-wardrobe', reach: 1.8 },
    { id: 'cu_bed', x: -8.6, z: -9.2, kind: 'hidden', gold: 19, name: 'under the bed', line: 't-bed', reach: 1.7 },
    { id: 'cu_guestbook', x: 8.6, z: -10.0, kind: 'shelf', name: 'the guest book', line: 't-guestbook', reach: 1.8 },
    { id: 'cu_desk', x: 8.6, z: -10.4, kind: 'hidden', item: 'antidote_drop', name: 'the desk drawer', line: 't-desk', reach: 1.7 },
    { id: 'cu_shelf_e', x: 11.6, z: -7.0, kind: 'bookshelf', gold: 26, name: 'the east shelves', line: 't-shelf', reach: 1.8 },
    { id: 'cu_shelf_w', x: 5.6, z: -7.0, kind: 'bookshelf', name: 'the west shelves', line: 't-shelf-2', reach: 1.8 },
    { id: 'cu_chair', x: -10.4, z: 11.0, kind: 'hidden', item: 'herb', name: 'behind the thirtieth chair', line: 't-chair', reach: 1.7 },
    { id: 'cu_chandelier', x: 0, z: 4.0, kind: 'hidden', gold: 31, name: 'under the chandelier', line: 't-chandelier', reach: 1.8 },
  ],
  lines: {
    't-musicbox2': ['%HERO% lifts the hem of the\ndress.{n}A painted box, red, with a brass\nhandle. He turns it once.',
      'Three notes, and a fourth, and\nthe fourth is nearly right.{p}{gold}MUSIC BOX 2 of 3.{/gold}'],
    't-wardrobe': ['Coats that were somebody’s best.\nIn the left pocket of the best\nof them: medicine, and a\nshopping list.'],
    't-bed': ['%HERO% looks under the bed.{n}Coins in a shoe. There is\nalways a shoe.'],
    't-guestbook': ['%HERO% reads the guest book,\nall of it, out loud, slowly,\nwith his finger.{n}"Barnaby Sallow, butler. Fond\nof: being useful."',
      '"Ottilie Cobwell. Fond of: him."{p}"Fen, age 7. Fond of: winning."{p}"The cat. Fond of: the\nchandelier."',
      '{wait:400}Somewhere below, somebody who has\nnot been called by name in two\nhundred years stands up a little\nstraighter.'],
    't-desk': ['The drawer sticks and then gives\nall at once, the way drawers do.{n}A bottle, and a very old boiled\nsweet.'],
    't-shelf': ['%HERO% pulls out a book about\nsheep.{n}It is hollow. Of course it is.\nCoins.'],
    't-shelf-2': ['%HERO% reads three spines.{n}"ON DAMP." "MORE ON DAMP."\n"DAMP: A REPLY."'],
    't-chair': ['%HERO% looks behind the last\nchair in the row.{n}A herb, and a hairpin, and the\nsmall dry corpse of a very old\nbunch of flowers.'],
    't-chandelier': ['%HERO% looks straight up, and\nthen straight down.{n}Two hundred years of things\ndropped by people dancing.'],
    search: ['%HERO% has a good look round\nthe ballroom.{n}Chairs. Dust. Twelve people who\nare not moving.',
      '%HERO% searches the corner.{n}A glove. Only ever one glove,\nin any house, anywhere.'],
  },
};
