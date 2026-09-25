/** sighing_grotto.chests.js */
export default {
  chests: [
    { id: 'sg_pearl_shelf', x: 0.3, z: -6.2, kind: 'hidden', item: 'tide_pearl',
      name: 'a cold shelf of rock', line: 't-pearl', reach: 1.8,
      found: 'The Tide Pearl. It is faintly\ndisappointed in the sea.' },
    { id: 'sg_pool', x: -2.5, z: -3.0, kind: 'hidden', gold: 22,
      name: 'a tide pool', line: 't-pool', reach: 1.6 },
  ],
  lines: {
    't-pearl': ['The shelf is empty. The sea keeps\nsighing anyway.'],
    't-pool': ['Salt water. No more coins.'],
  },
};
