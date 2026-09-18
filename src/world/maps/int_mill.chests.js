/**
 * int_mill.chests.js — what a child finds in the mill.                              (P30, owner: *.chests.js)
 * WORLD-BIBLE hides gold under the flour in a mill hopper; Puddlewick's does the same, smaller.
 *
 * Four containers, one pays: the hopper, where nobody reaches. The hopper and the bench are each nudged clear of
 * the prop int_mill.js draws on the same tile, so map.nearestInteractable() can actually pick the search.
 */
export default {
  chests: [
    { id: 'ml_hopper', x: -4.0, z: -3.1, kind: 'sack', name: 'the hopper', line: 'search-hopper', reach: 1.7,
      gold: 20, found: ['%HERO% reaches into the hopper,\nwhere nobody reaches.{wait:450}{n}Under the flour: {gold}20 gold coins{/gold},\nwrapped in a rag.',
        'Somebody has been hiding money\nfrom somebody for a long time.{p}He puts the rag back exactly as\nit was.'] },
    { id: 'ml_sacks', x: 4.4, z: -2.5, kind: 'sack', name: 'the full sacks', line: 'search-sacks', reach: 1.7 },
    { id: 'ml_barrel', x: -5.4, z: -2.7, kind: 'barrel', name: 'a barrel of bran', line: 'search-barrel', reach: 1.6 },
    { id: 'ml_bench', x: -3.5, z: 1.2, kind: 'drawer', name: 'the bench drawer', line: 'search-drawer', reach: 1.6 },
  ],
  lines: {
    'search-hopper': ['%HERO% reaches into the hopper\nagain, up to the shoulder.{n}Flour, a rag, and no more\nsecrets.'],
    'search-sacks': ['%HERO% pushes at the full sacks.{n}They push back. They win.'],
    'search-barrel': ['%HERO% looks in the bran barrel.{n}Bran. A wooden scoop. And a\nmouse, who freezes.',
      'They look at each other.{p}They agree to say nothing.'],
    'search-drawer': ['%HERO% opens the bench drawer.{n}Little brass weights, all\npresent except the smallest.',
      'And a drawing of the mill, done\nby somebody about six, kept\nfor years.'],
    search: ['%HERO% searches the mill.{n}Flour. It gets into everything.\nIt is getting into this\nsentence.',
      '%HERO% watches the big wheel go\nround.{wait:600}{n}He watches it go round again.'],
  },
};
