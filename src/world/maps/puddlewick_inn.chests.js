/**
 * puddlewick_inn.chests.js — the inn on the green: a chest in the corner, the kegs, and the third stair.
 *                                                        (P30 discovery; layer of puddlewick_inn.js)
 *
 * Registered by src/world/treasure.js. The inn already has its pot by the door and its back shelf (P23's base
 * file, P11's words); this layer adds what they hold and the two things nobody mentions: the money that has gone
 * down behind the kegs, and the board on the third stair that everybody is told to mind.
 */

export const searches = [
  { id: 'inn_kegs', name: 'the kegs', kind: 'barrel', gold: 5,
    found: 'Coins go down behind kegs and\nnobody ever goes after them.' },
  { id: 'inn_table', name: 'a table', kind: 'generic' },
];

export const rewards = {
  inn_shelf: { item: 'herb', found: 'One of the jars is not pickles.\nIt is a herb, in vinegar,\nwhich cannot be right.' },
};

export default {
  chests: [
    { id: 'inn_corner_chest', x: 5.2, z: 3.4, kind: 'chest', gold: 12,
      name: 'a chest in the corner', line: 't-corner' },
    { id: 'inn_third_stair', x: 4.1, z: -2.0, kind: 'hidden', item: 'nutcake',
      name: 'the third stair', line: 't-stair', reach: 1.8 },
  ],

  lines: {
    't-corner': 'Left behind by a guest who\nmeant to come back down.',
    't-stair': ['Mind the third stair, they say.{wait:350}{n}Bram minds it. Then he lifts it.',
      'A cake, kept for later by\nsomebody who went up and\nnever came down for it.'],
  },
};
