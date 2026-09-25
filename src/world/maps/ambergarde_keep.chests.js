/** ambergarde_keep.chests.js — court corners. */
export default {
  chests: [
    { id: 'ak_crest', x: 0.5, z: -5.5, kind: 'chest', gold: 35,
      name: 'a chest by the crest', line: 't-crest', reach: 1.7,
      found: 'Coins with a little amber lark.\nThe court pretends not to see.' },
    { id: 'ak_curtain', x: -3.0, z: -2.0, kind: 'hidden', item: 'strong_herb',
      name: 'behind a court curtain', line: 't-curtain', reach: 1.6,
      found: 'A strong herb. For kneeling,\nor for not kneeling.' },
  ],
  lines: {
    't-crest': ['The crest box is empty.\nKneeling continues unpaid.'],
    't-curtain': ['Dust. A scratch of velvet.\nNo leaves left.'],
  },
};
