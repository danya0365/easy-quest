/**
 * int_twins.chests.js — what a child finds in the twins' house.  (P06 seed; P30 owns treasure/ceremony from here)
 */
export default {
  chests: [
    { id: 'tw_toybox', x: 4.3, z: 0.2, kind: 'chest', name: 'the toy box', line: 'search-toys', reach: 1.8 },
    { id: 'tw_wardrobe', x: 4.7, z: -4.2, kind: 'wardrobe', name: 'the wardrobe', line: 'search-wardrobe', reach: 1.6 },
    { id: 'tw_drawer', x: -5.0, z: -1.1, kind: 'drawer', name: 'the dresser drawer', line: 'search-drawer', reach: 1.6 },
    { id: 'tw_pots', x: 3.0, z: 2.6, kind: 'pot', name: 'the pots by the door', line: 'search-pots', reach: 1.5 },
    { id: 'tw_bed', x: 2.2, z: -2.6, kind: 'bed', name: 'under the beds', line: 'search-bed', reach: 1.6 },
  ],
  lines: {
    'search-toys': ['%HERO% goes through the toy box.{n}A wooden horse with one ear, a\nhoop, and forty smooth stones,\nsorted.',
      'Sorted by something. Not size.\nNot colour.{p}Whatever it is, it took hours.'],
    'search-wardrobe': ['%HERO% opens the wardrobe.{wait:400}{n}Coats. And a {gold}sock{/gold}, enormous, all\non its own, pinned to the inside\nof the door like a trophy.',
      'Written on the pin, in chalk:\n"EVIDENCE".'],
    'search-drawer': ['%HERO% opens the dresser drawer.{n}Thread, a thimble, and {gold}4 gold\ncoins{/gold} in a matchbox marked\n"NOT FOR SWEETS".',
      'He closes it very carefully.'],
    'search-pots': ['%HERO% looks in the pots.{n}One stone each. Placed, not\ndropped.',
      'This is part of the game. He has\nno idea which part.'],
    'search-bed': ['%HERO% looks under the beds.{n}Two more stones and a plan,\ndrawn on the back of a bit of\nbread wrapper.',
      'The plan is mostly arrows. One\narrow goes into the Beck.'],
    search: ['%HERO% looks round the room.{n}Chalk. Chalk on the boards,\nthe chairs and, somehow, the\nceiling.',
      '%HERO% checks the boots by the\nfire.{n}Both soaked. Both the same size.\nNeither pair matches itself.'],
  },
};
