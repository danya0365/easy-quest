/**
 * road_beck.chests.js — what is worth a poke on the Beck road.       (P23B treasure layer of road_beck.js)
 * WORLD-BIBLE §5: a dead end always pays. The spur to the fold is the dead end; the hay at the end of it has
 * the herb in it, and the hollow of the drystone wall has the coins.
 */
export default {
  chests: [
    { id: 'beck_chest_fold', x: 9.6, z: -17.2, kind: 'chest', item: 'herb',
      name: 'a chest behind the hay', line: 't-fold', reach: 1.7 },
    { id: 'beck_wall', x: 2.0, z: -5.6, kind: 'hidden', gold: 18,
      name: 'a gap in the wall', line: 't-wall', reach: 1.7 },
    { id: 'beck_barrel', x: -26.2, z: 14.4, kind: 'barrel', name: 'a rain barrel', line: 't-barrel', reach: 1.6 },
    { id: 'beck_crate', x: -25.2, z: 15.6, kind: 'crate', name: 'a crate by the lane', line: 't-crate', reach: 1.6 },
    { id: 'beck_cart', x: -3.2, z: 1.7, kind: 'crate', item: 'antidote_drop', name: 'the carter’s load', line: 't-cart', reach: 1.7 },
    { id: 'beck_bench', x: 21.4, z: -2.8, kind: 'hidden', gold: 6, name: 'under the bench', line: 't-bench', reach: 1.6 },
  ],
  lines: {
    't-fold': ['Behind the hay, where the rain\ncannot get at it, somebody keeps\na box.'],
    't-wall': ['One stone in the wall is not a\nstone. It is a lid.{n}Under it: coins, and a button.'],
    't-barrel': ['%HERO% looks in the rain barrel.{n}Rain. A leaf. A very calm\nbeetle on the leaf.'],
    't-crate': ['%HERO% opens the crate.{n}Straw, and the shape of\nsomething that has gone.'],
    't-cart': ['The carter said don’t help. He\ndid not say don’t look.'],
    't-bench': ['Under the bench, where somebody\nsat and then stood up too fast.'],
    search: ['%HERO% has a good look about.{n}Grass, a cart rut, and one\nhorseshoe nail.',
      '%HERO% pokes the verge.{n}A snail, going somewhere, very\nslowly and with total confidence.'],
  },
};
