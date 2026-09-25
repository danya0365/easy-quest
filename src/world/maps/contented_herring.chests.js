/** contented_herring.chests.js — a drawer behind the bar. */
export default {
  chests: [
    { id: 'herring_drawer', x: -4.0, z: -2.2, kind: 'drawer', gold: 5,
      name: 'the bar drawer', line: 't-drawer', reach: 1.6,
      found: 'Five coins and a cork. The cork\nhas been chewed.' },
    { id: 'herring_crock', x: 2.8, z: 2.4, kind: 'crock', item: 'nutcake',
      name: 'a crock by the hearth', line: 't-crock', reach: 1.6 },
  ],
  lines: {
    't-drawer': ['The drawer is empty except for\nthe cork. The cork remains.'],
    't-crock': ['Oatcake crumbs and a note:\nFOR WILLOW IF SHE ASKS.'],
  },
};
