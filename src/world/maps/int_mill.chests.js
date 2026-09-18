/**
 * int_mill.chests.js — what a child finds in the mill.           (P06 seed; P30 owns treasure/ceremony from here)
 * WORLD-BIBLE hides gold under the flour in a mill hopper; Puddlewick's does the same, smaller.
 */
export default {
  chests: [
    { id: 'ml_hopper', x: -3.0, z: -2.4, kind: 'hopper', name: 'the hopper', line: 'search-hopper', reach: 1.7 },
    { id: 'ml_sacks', x: 4.4, z: -2.5, kind: 'sacks', name: 'the full sacks', line: 'search-sacks', reach: 1.7 },
    { id: 'ml_barrel', x: -5.4, z: -2.7, kind: 'barrel', name: 'a barrel of bran', line: 'search-barrel', reach: 1.6 },
    { id: 'ml_bench', x: -4.1, z: 1.4, kind: 'drawer', name: 'the bench drawer', line: 'search-drawer', reach: 1.6 },
  ],
  lines: {
    'search-hopper': ['%HERO% reaches into the hopper,\nwhere nobody reaches.{wait:450}{n}Under the flour: {gold}20 gold coins{/gold},\nwrapped in a rag.',
      'Somebody has been hiding money\nfrom somebody for a long time.{p}He puts the rag back exactly as\nit was.'],
    'search-sacks': ['%HERO% pushes at the full sacks.{n}They push back. They win.'],
    'search-barrel': ['%HERO% looks in the bran barrel.{n}Bran. A wooden scoop. And a\nmouse, who freezes.',
      'They look at each other.{p}They agree to say nothing.'],
    'search-drawer': ['%HERO% opens the bench drawer.{n}Little brass weights, all\npresent except the smallest.',
      'And a drawing of the mill, done\nby somebody about six, kept\nfor years.'],
    search: ['%HERO% searches the mill.{n}Flour. It gets into everything.\nIt is getting into this\nsentence.',
      '%HERO% watches the big wheel go\nround.{wait:600}{n}He watches it go round again.'],
  },
};
