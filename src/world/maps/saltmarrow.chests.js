/**
 * saltmarrow.chests.js — what Saltmarrow is hiding.                 (P23B treasure layer of saltmarrow.js)
 * WORLD-BIBLE §2 [03] names three by hand: the mill hopper (30 gold under the flour — that one is inside, in
 * saltmarrow_mill.chests.js), the inn's wardrobe (a Homing Feather) and a bookshelf with the first hint about
 * the manor's music boxes. The inn has no interior yet, so the Homing Feather is in the net loft's sea chest
 * instead, which is a better hiding place and still one room off the quay.
 */
export default {
  chests: [
    { id: 'sm_chest_loft', x: -18.0, z: 1.4, kind: 'chest', item: 'homing_feather',
      name: 'a sea chest by the net loft', line: 't-loft', reach: 1.8 },
    { id: 'sm_chest_quay', x: 17.2, z: 1.8, kind: 'chest', gold: 24,
      name: 'a chest at the end of the quay', line: 't-quay', reach: 1.7 },
    { id: 'sm_crabpot', x: 10.9, z: -1.5, kind: 'pot', item: 'herb', name: 'the crab pots', line: 't-crabpot', reach: 1.7 },
    { id: 'sm_barrel_quay', x: 0.4, z: -1.0, kind: 'barrel', name: 'a barrel on the quay', line: 't-barrel', reach: 1.6 },
    { id: 'sm_crate_quay', x: 6.6, z: -0.8, kind: 'crate', name: 'a crate on the quay', line: 't-crate', reach: 1.6 },
    { id: 'sm_crate_far', x: 14.6, z: 0.4, kind: 'crate', gold: 9, name: 'the last crate', line: 't-crate-2', reach: 1.6 },
    { id: 'sm_boat', x: 5.4, z: 0.2, kind: 'hidden', item: 'nutcake', name: 'the bucket in the boat', line: 't-boat', reach: 1.9 },
    { id: 'sm_upturned', x: -3.4, z: 12.2, kind: 'hidden', gold: 12, name: 'under the upturned boat', line: 't-upturned', reach: 1.9 },
    { id: 'sm_nets', x: -13.6, z: 7.9, kind: 'hidden', name: 'the mended net', line: 't-nets', reach: 1.8 },
    { id: 'sm_stall', x: -6.2, z: -7.2, kind: 'crate', name: 'the apple crate', line: 't-apples', reach: 1.6 },
    { id: 'sm_woodpile', x: -19.0, z: -12.4, kind: 'log', name: 'the woodpile', line: 't-woodpile', reach: 1.8 },
  ],
  lines: {
    't-loft': ['A sea chest with a rope handle\nand somebody’s initials burnt\ninto the lid.',
      'Inside, wrapped in oilcloth,\na feather that knows the way\nhome.'],
    't-quay': ['Right at the end, where the\nstone runs out and the water\nstarts.'],
    't-crabpot': ['%HERO% lifts the top pot.{n}One crab, one herb, and a long\nunblinking disagreement.'],
    't-barrel': ['%HERO% looks in the barrel.{n}Salt. Just salt. An enormous\namount of salt.'],
    't-crate': ['%HERO% opens the crate.{n}Rope, tar, and the smell of\nsomewhere else.'],
    't-crate-2': ['The last crate on the quay has\nbeen used as a moneybox by\nsomebody very small.'],
    't-boat': ['There is a bucket in the boat,\nand a cake in the bucket, and a\nnote that says MINE.',
      '%HERO% eats it anyway. He is\nsix.'],
    't-upturned': ['%HERO% tips the boat up.{n}Coins, a marble, and a crab who\nis extremely annoyed about the\ndaylight.'],
    't-nets': ['%HERO% goes along the net,\nknot by knot.{n}It has been mended in nine\ncolours by nine people.',
      'Nothing in it. Somebody was\nvery thorough, and that somebody\nwas a gull.'],
    't-apples': ['%HERO% roots in the apple crate.{n}Apples. And, at the bottom, one\npear, smuggled.'],
    't-woodpile': ['%HERO% pulls at the woodpile.{n}A wren shoots out past his ear\nand he sits down.'],
    search: ['%HERO% has a good look round.{n}Rope, fish scales, and a gull\nwatching him work.',
      '%HERO% looks under the boards.{n}Water, going up and down, doing\nits job.'],
  },
};
