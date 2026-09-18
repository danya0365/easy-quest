/**
 * int_bakery.chests.js — what a child finds in the bakery.                          (P30, owner: *.chests.js)
 *
 * DQV-RUBRIC "World & discovery": searchable containers everywhere, roughly one in four rewards you, and the
 * rest have a funny line. Five here, and two pay: the crock of buns, and the flour, which holds one of the
 * eleven socks (CANON §6 `secret.socks` — all eleven make The Sock of Considerable Power).
 *
 * `found` is the page for the moment it gives something up; `line` is what is left to say afterwards.
 */
export default {
  chests: [
    { id: 'bk_flour', x: -5.3, z: 4.25, kind: 'sack', name: 'the flour sacks', line: 'search-flour', reach: 1.6,
      sock: true, found: ['%HERO% pushes his arm into the\nflour sack up to the elbow.{wait:400}{n}Something soft. Something\nwoollen.',
        'It is a {gold}sock{/gold}. A single, enormous,\nvery clean sock.{p}He keeps it. Obviously he\nkeeps it.'] },
    { id: 'bk_crock', x: 3.9, z: -0.25, kind: 'pot', name: 'the bun crock', line: 'search-crock', reach: 1.6,
      item: 'nutcake', found: ['%HERO% lifts the lid off the\ncrock.{wait:350}{n}Buns. Still warm.',
        'He takes one.{p}A voice from the front says\n"Warm one, love," without\nlooking up.'] },
    { id: 'bk_crates', x: 5.3, z: 2.5, kind: 'crate', name: 'a crate of kindling', line: 'search-crate', reach: 1.6 },
    { id: 'bk_pots', x: 5.6, z: -2.9, kind: 'pot', name: 'the pots in the corner', line: 'search-pots', reach: 1.6 },
    { id: 'bk_drawer', x: 1.4, z: -0.6, kind: 'drawer', name: 'the counter drawer', line: 'search-drawer', reach: 1.6 },
  ],
  lines: {
    'search-flour': ['%HERO% pushes his arm into the\nflour sack again.{n}Flour, all the way down, and no\nfurther woollen surprises.',
      'He is now grey to the elbow and\nvery pleased with himself.'],
    'search-crock': ['%HERO% lifts the lid off the\ncrock.{n}Crumbs, and the ghost of a warm\nsmell.'],
    'search-crate': ['%HERO% digs through the crate.{n}Kindling, a bent nail, and half\na very old biscuit.',
      'The biscuit is not food. The\nbiscuit is furniture.'],
    'search-pots': ['%HERO% looks in the pots.{n}One has water. One has a wooden\nspoon. One has a frog.',
      'The frog is fine. The frog lives\nhere.'],
    'search-drawer': ['%HERO% opens the counter drawer.{n}A pencil stub, and a list of\neverybody in the village who\nowes for bread.',
      'His father is on the list.{p}Twice.'],
    search: ['%HERO% searches the bakery.{n}Flour. Flour everywhere. Some of\nit is on him now.',
      '%HERO% looks under the kneading\nbench.{n}A wooden spoon with a bite taken\nout of it.',
      '%HERO% peers into the oven.{wait:300}{n}No. Absolutely not.'],
  },
};
