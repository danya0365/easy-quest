/** quiet_deep.chests.js */
export default {
  chests: [
    { id: 'qu_find', x: 0.5, z: -4.0, kind: 'hidden', gold: 20,
      name: 'a quiet find', line: 't-find', reach: 1.7,
      found: 'Coins left for whoever finishes the walk.' },
  ],
  lines: { 't-find': ['Empty now. The quiet keeps the rest.'] },
};
