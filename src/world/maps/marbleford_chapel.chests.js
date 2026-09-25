/** marbleford_chapel.chests.js — waiting-room finds. */
export default {
  chests: [
    { id: 'mc_pew', x: -2.0, z: -3.0, kind: 'hidden', gold: 12,
      name: 'under a pew cushion', line: 't-pew', reach: 1.6,
      found: 'Coins for the collection.\nBarty put them back once already.' },
    { id: 'mc_vestry', x: 2.5, z: -5.0, kind: 'drawer', item: 'antidote_drop',
      name: 'a vestry drawer', line: 't-vestry', reach: 1.6,
      found: 'One drop. For nerves, or snakes.' },
  ],
  lines: {
    't-pew': ['The cushion is flat again.\nNobody confesses who sat.'],
    't-vestry': ['Candles. Wax. No more drops.'],
  },
};
