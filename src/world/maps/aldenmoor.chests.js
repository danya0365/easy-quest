/** aldenmoor.chests.js — a purse under a milestone. */
export default {
  chests: [
    { id: 'moor_stone', x: 3.0, z: -6.0, kind: 'hidden', gold: 15,
      name: 'under the milestone', line: 't-stone', reach: 1.8 },
    { id: 'moor_hay', x: -7.0, z: 1.0, kind: 'hay', item: 'herb', name: 'a roadside bale', line: 't-hay', reach: 1.7 },
  ],
  lines: {
    't-stone': ['The milestone says 12. Under it:\ncoins for somebody who got tired\nat 11.'],
    't-hay': ['Hay, and a herb somebody meant\nto come back for.'],
  },
};
