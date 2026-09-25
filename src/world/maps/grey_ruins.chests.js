/** grey_ruins.chests.js — one cold find among the stones. */
export default {
  chests: [
    { id: 'ruins_urn', x: 2.5, z: -7.0, kind: 'urn', item: 'herb',
      name: 'a cracked urn', line: 't-urn', reach: 1.7,
      found: 'A herb, dry as the stone it\nsat in.' },
    { id: 'ruins_rubble', x: -5.0, z: -3.5, kind: 'hidden', gold: 12,
      name: 'under the rubble', line: 't-rubble', reach: 1.8 },
  ],
  lines: {
    't-urn': ['The urn is empty now. It makes\na hollow sound when the wind\npasses.'],
    't-rubble': ['Stone on stone. Nothing else\nwants to be found here.'],
  },
};
