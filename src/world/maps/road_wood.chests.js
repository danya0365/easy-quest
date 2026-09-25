/**
 * road_wood.chests.js — what the wood keeps.                      (P23B treasure layer of road_wood.js)
 * Two dead ends, and WORLD-BIBLE §5's promise: a dead end always pays. The clearing pays in an accessory,
 * the charcoal ring in gold, and the hollow log in a cushion and a cake.
 */
export default {
  chests: [
    { id: 'wood_chest_clearing', x: 16.4, z: -2.6, kind: 'chest', item: 'lucky_acorn',
      name: 'a chest at the foot of the stone', line: 't-clearing', reach: 1.7 },
    { id: 'wood_chest_ring', x: -13.8, z: -14.6, kind: 'chest', gold: 22,
      name: 'a chest by the charcoal ring', line: 't-ring', reach: 1.7 },
    { id: 'wood_log', x: 14.6, z: 1.8, kind: 'log', item: 'nutcake', name: 'the hollow log', line: 't-log', reach: 1.9 },
    { id: 'wood_crate', x: -14.2, z: -11.4, kind: 'crate', name: 'the burner’s crate', line: 't-crate', reach: 1.6 },
    { id: 'wood_pot', x: 1.2, z: -18.4, kind: 'pot', item: 'herb', name: 'a cracked pot by the gates', line: 't-pot', reach: 1.6 },
    { id: 'wood_stump', x: -3.6, z: 2.0, kind: 'hidden', gold: 8, name: 'a hollow stump', line: 't-stump', reach: 1.7 },
  ],
  lines: {
    't-clearing': ['Nobody has opened this in a\nvery long time, and yet it is\nnot at all rusty.'],
    't-ring': ['A box under the turf beside the\nfire, where a man keeps what he\nhas earned.',
      'He will not mind. He said take\nthe log.'],
    't-log': ['Inside the log: a cushion, a\ncandle-end, and a cake in a\ncloth.',
      'Somebody small lives here on\nSaturdays.'],
    't-crate': ['%HERO% opens the crate.{n}A saw, a bottle of something,\nand a spare hat.'],
    't-pot': ['A pot by the gatepost with a\ncrack right down it, and a herb\ngrowing out of the crack.'],
    't-stump': ['%HERO% reaches into the stump.{n}Coins, and about four hundred\nacorns. Somebody is saving.'],
    search: ['%HERO% goes through the leaves.{n}Leaves, mostly. A beech nut. A\nfeather that is not a bird’s.',
      '%HERO% listens.{n}The wind, a long way up, and\nsomewhere ahead of him, one\ngirl, whistling.'],
  },
};
