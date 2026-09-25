/** fairweather_hall.chests.js — lists leave crumbs. */
export default {
  chests: [
    { id: 'fh_drawer', x: -2.2, z: -2.5, kind: 'drawer', gold: 28,
      name: 'a list drawer', line: 't-drawer', reach: 1.6,
      found: 'Coins for parchment and ink.\nCondition two is stationery.' },
    { id: 'fh_urn', x: 2.0, z: -4.0, kind: 'urn', item: 'herb',
      name: 'a polished hall urn', line: 't-urn', reach: 1.6,
      found: 'A herb, tucked under a guest list.' },
  ],
  lines: {
    't-drawer': ['Empty. Rudolpho has inventoried\neven the dust.'],
    't-urn': ['Only names now. No leaves.'],
  },
};
