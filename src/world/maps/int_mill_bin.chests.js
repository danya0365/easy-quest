/** int_mill_bin.chests.js — one find in the loft. */
export default {
  chests: [
    { id: 'bin_corner', x: -3.5, z: -2.5, kind: 'hidden', gold: 9,
      name: 'behind the end bin', line: 't-corner', reach: 1.7,
      found: 'Nine coins in a flour-sack\npocket nobody uses.' },
  ],
  lines: {
    't-corner': ['Flour. The coins are gone. The\npocket stays.'],
  },
};
