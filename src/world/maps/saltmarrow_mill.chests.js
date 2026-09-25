/**
 * saltmarrow_mill.chests.js — the mill hopper.               (P23B treasure layer of saltmarrow_mill.js)
 * WORLD-BIBLE §2 [03], word for word: "the mill hopper (hides 30 gold under the flour)".
 */
export default {
  chests: [
    { id: 'mill_hopper', x: 0.9, z: -2.5, kind: 'hidden', gold: 30,
      name: 'the flour under the hopper', line: 't-hopper', reach: 1.8 },
    { id: 'mill_sacks', x: 3.6, z: -2.3, kind: 'sacks', item: 'nutcake', name: 'the flour sacks', line: 't-sacks', reach: 1.7 },
    { id: 'mill_barrel', x: -5.6, z: -1.6, kind: 'barrel', name: 'a barrel by the wall', line: 't-barrel', reach: 1.6 },
    { id: 'mill_crates', x: -5.4, z: -3.0, kind: 'crate', gold: 7, name: 'the crates', line: 't-crates', reach: 1.6 },
    { id: 'mill_hay', x: -5.0, z: 1.5, kind: 'hay', item: 'herb', name: 'the hay', line: 't-hay', reach: 1.7 },
    { id: 'mill_bench', x: 4.8, z: 1.6, kind: 'shelf', name: 'the workbench', line: 't-bench', reach: 1.7 },
  ],
  lines: {
    't-hopper': ['%HERO% pushes both hands into\nthe flour under the hopper.{n}It is warm, and deeper than it\nlooks, and somebody has been\nkeeping money in it.',
      'Thirty gold, in a twist of\ncloth, exactly where a boy\nwould think to look.'],
    't-sacks': ['%HERO% squeezes between the\nsacks.{n}Somebody’s dinner, forgotten,\nand still perfectly good.'],
    't-barrel': ['%HERO% looks in the barrel.{n}Grain, and a beetle who lives\nlike a king.'],
    't-crates': ['%HERO% opens the crates.{n}Washers, pins, and seven gold\nin a saucer.'],
    't-hay': ['%HERO% burrows in the hay.{n}A herb, wrapped up, and the\nperfect shape of a sleeping\nduck.'],
    't-bench': ['%HERO% goes through the bench.{n}Chisels, a dead pencil, and\na drawing of the wheel with\nLOVE FROM OZZY on it.'],
    search: ['%HERO% pokes about in the flour.{n}Flour. More flour. A very\nsurprised beetle.'],
  },
};
