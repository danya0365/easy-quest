/**
 * int_barn.chests.js — what a child finds in the barn.           (P06 seed; P30 owns treasure/ceremony from here)
 */
export default {
  chests: [
    { id: 'bn_hay', x: 2.9, z: -3.2, kind: 'hay', name: 'the hay heap', line: 'search-hay', reach: 1.8 },
    { id: 'bn_manger', x: -4.4, z: -5.0, kind: 'manger', name: 'the manger', line: 'search-manger', reach: 1.6 },
    { id: 'bn_crates', x: 5.4, z: -0.4, kind: 'crate', name: 'the tool crates', line: 'search-crate', reach: 1.6 },
    { id: 'bn_oats', x: -5.8, z: 3.3, kind: 'barrel', name: 'the oat barrel', line: 'search-oats', reach: 1.6 },
    { id: 'bn_sacks', x: -5.4, z: 1.9, kind: 'sacks', name: 'the feed sacks', line: 'search-sacks', reach: 1.6 },
  ],
  lines: {
    'search-hay': ['%HERO% digs into the hay heap.{wait:400}{n}An egg. Warm. Then another.\nThen four more.',
      'So THAT is where she has been\nlaying.{p}He decides Old Dodder can find\nout the fun way.'],
    'search-manger': ['%HERO% feels along the manger.{n}Hay, and one very old carrot\nthat has become a fossil of a\ncarrot.'],
    'search-crate': ['%HERO% opens the tool crates.{n}Rasps, a hoof pick, and a jar\nof something that used to be\ngrease.'],
    'search-oats': ['%HERO% lifts the lid off the oat\nbarrel.{wait:300}{n}Oats, a scoop, and {gold}8 gold coins{/gold}\nin a twist of cloth at the very\nbottom.',
      'Somebody keeps their money where\nnobody but a horse looks.'],
    'search-sacks': ['%HERO% prods the feed sacks.{n}Bran, beans, and one sack of\nsomething labelled DO NOT.',
      'He does not.'],
    search: ['%HERO% searches the barn.{n}Hay. Two kinds. He is now an\nexpert on hay and nobody will\never ask.',
      '%HERO% looks at the clean\nrectangle on the floor.{n}The wagon is not home yet.'],
  },
};
