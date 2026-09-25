/** stone_garden.chests.js */
export default {
  chests: [
    { id: 'sg_chip', x: 0.8, z: -5.0, kind: 'hidden', gold: 30,
      name: 'under chipped stone', line: 't-chip', reach: 1.7,
      found: 'Coins Papa hid for a rainy day.\nIt has been raining for nine years.' },
    { id: 'sg_bench', x: -2.5, z: -2.0, kind: 'hidden', item: 'herb',
      name: 'beside a stone bench', line: 't-bench', reach: 1.6 },
  ],
  lines: {
    't-chip': ['Stone dust. No more coins.'],
    't-bench': ['Empty. The garden keeps sighing.'],
  },
};
