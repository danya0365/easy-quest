/** whistling_caves.chests.js */
export default {
  chests: [
    { id: 'wc_rock', x: 0.2, z: -4.0, kind: 'hidden', gold: 20,
      name: 'under Bobble’s rock', line: 't-rock', reach: 1.7,
      found: 'Coins Bobble was sitting on.\nHe says they were keeping him warm.' },
    { id: 'wc_urn', x: -3.5, z: -2.5, kind: 'urn', item: 'herb',
      name: 'a cave urn', line: 't-urn', reach: 1.6 },
  ],
  lines: {
    't-rock': ['The rock is just a rock now.\nBobble has moved.'],
    't-urn': ['Empty, and whistling faintly.'],
  },
};
