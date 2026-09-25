/** gogglestone_caves.chests.js */
export default {
  chests: [
    { id: 'gg_nest', x: 0.5, z: -5.5, kind: 'hidden', gold: 18,
      name: 'a sun-warmed scrape', line: 't-bell', reach: 1.7,
      found: 'Coins where a golden beast slept.' },
    { id: 'gg_rock', x: -4.0, z: -4.0, kind: 'hidden', gold: 10,
      name: 'behind a claw-mark', line: 't-claw', reach: 1.6 },
  ],
  lines: {
    't-bell': ['The dust remembers a small cat.'],
    't-claw': ['Gold hair. No more coins.'],
  },
};
