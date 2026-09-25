/** marbleford.chests.js */
export default {
  chests: [
    { id: 'mf_drawer', x: -2.0, z: -3.5, kind: 'drawer', gold: 25,
      name: 'a hall drawer', line: 't-drawer', reach: 1.6,
      found: 'Coins for the packet boat.\nRudolpho will not miss them.' },
    { id: 'mf_urn', x: 2.5, z: -2.0, kind: 'urn', item: 'herb',
      name: 'a polished urn', line: 't-urn', reach: 1.6 },
  ],
  lines: {
    't-drawer': ['Empty. The hall is very tidy.'],
    't-urn': ['Polished. Empty. Judgemental.'],
  },
};
