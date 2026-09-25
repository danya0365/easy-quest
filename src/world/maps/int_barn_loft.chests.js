/** int_barn_loft.chests.js — something in the hay. */
export default {
  chests: [
    { id: 'loft_hay', x: -2.5, z: -2.0, kind: 'hay', item: 'herb',
      name: 'a loft bale', line: 't-hay', reach: 1.8,
      found: 'An herb wrapped in a scrap of\nsackcloth.' },
  ],
  lines: {
    't-hay': ['Hay again. The herb is gone.'],
  },
};
