/**
 * int_shop.chests.js — what a child finds in the shop.           (P06 seed; P30 owns treasure/ceremony from here)
 */
export default {
  chests: [
    { id: 'sh_nailkeg', x: -5.6, z: 1.3, kind: 'barrel', name: 'the nail barrel', line: 'search-nails', reach: 1.6 },
    { id: 'sh_crates', x: -5.2, z: -2.6, kind: 'crate', name: 'the stock crates', line: 'search-crate', reach: 1.6 },
    { id: 'sh_drawer', x: 2.2, z: -2.1, kind: 'drawer', name: 'the counter drawer', line: 'search-drawer', reach: 1.6 },
    { id: 'sh_pots', x: 5.4, z: 1.7, kind: 'pot', name: 'the pots by the window', line: 'search-pots', reach: 1.6 },
    { id: 'sh_sacks', x: -5.4, z: 2.7, kind: 'sacks', name: 'the sacks in the corner', line: 'search-sacks', reach: 1.6 },
  ],
  lines: {
    'search-nails': ['%HERO% puts a hand in the nail\nbarrel.{wait:300}{n}Nails. Obviously nails.',
      'He takes his hand out slightly\nfaster than he put it in.'],
    'search-crate': ['%HERO% lifts the lid of a crate.{n}Straw, and eleven kinds of hook,\nall tangled into one kind of\nhook.'],
    'search-drawer': ['%HERO% opens the counter drawer.{wait:350}{n}{gold}5 gold coins{/gold} in a saucer, and a\nnote: "FOR THE BOY. DO NOT TELL\nHIM I SAID SO."',
      'It does not say which boy.{p}He decides it is him.'],
    'search-pots': ['%HERO% looks in the pots.{n}Lamp oil, lamp oil, and one that\nsomebody has put a frog in.',
      'Puddlewick has a frog problem.\nPuddlewick does not think it is\na problem.'],
    'search-sacks': ['%HERO% pokes the sacks.{n}Plaster, sand, and something\nthat says PLASTER and is sand.'],
    search: ['%HERO% searches the shop.{n}Everything in here costs money,\nand he has the wrong amount of\nit, which is none.',
      '%HERO% looks under the counter.{n}A very old dog blanket, and no\ndog.'],
  },
};
