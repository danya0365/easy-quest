/** ambergarde.chests.js */
export default {
  chests: [
    { id: 'ag_crest_box', x: 0.5, z: -4.5, kind: 'chest', gold: 40,
      name: 'a box by the crest door', line: 't-box', reach: 1.7,
      found: 'Coins stamped with a little amber lark.' },
    { id: 'ag_bush', x: -4.5, z: -2.5, kind: 'hidden', item: 'strong_herb',
      name: 'in the headland grass', line: 't-grass', reach: 1.6 },
  ],
  lines: {
    't-box': ['The box is empty. The crest still fits.'],
    't-grass': ['Grass. Wind. No more leaves.'],
  },
};
