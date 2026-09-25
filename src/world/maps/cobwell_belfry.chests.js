/**
 * cobwell_belfry.chests.js — what is in the belfry, and what is in the coat afterwards.
 *                                                            (P23B treasure layer of cobwell_belfry.js)
 * WORLD-BIBLE §4 A12: "the SILVER WALTZ-CHARM (accessory, +5 luck; 'Somebody was finally allowed to go home.')
 * plus 400g in the coat pockets." The charm sits in the frame's own chest, which is not openable until the thing
 * standing in front of it has unravelled — and after the fight it simply is, because the boss is gone.
 */
export default {
  chests: [
    { id: 'cb_charm', x: 0, z: -5.4, kind: 'chest', item: 'silver_waltz_charm',
      name: 'a chest under the bell frame', line: 't-charm', reach: 1.8 },
    { id: 'cb_coat', x: 1.6, z: -2.6, kind: 'hidden', gold: 400, name: 'the black coat on the floor', line: 't-coat', reach: 1.8 },
    { id: 'cb_crate', x: -5.6, z: 4.2, kind: 'crate', item: 'strong_herb', name: 'a crate on the landing', line: 't-crate', reach: 1.6 },
    { id: 'cb_urn', x: 5.6, z: -2.0, kind: 'pot', gold: 18, name: 'an urn of rainwater', line: 't-urn', reach: 1.6 },
  ],
  lines: {
    't-charm': ['A little chest, under the frame,\nwith the dust brushed off the\nlid by somebody who could not\nlift it.',
      'Inside: a silver charm in the\nshape of two people dancing.{p}{gold}"Somebody was finally allowed\nto go home."{/gold}'],
    't-coat': ['A plain black coat, lying on the\nfloor with nothing in it, which\nis the whole of what is left.',
      'In the pockets: four hundred\ngold, and a pressed flower that\nhas kept its colour.'],
    't-crate': ['%HERO% opens the crate.{n}Rope, a hook, and medicine\nsomebody carried up here and\nnever needed.'],
    't-urn': ['%HERO% tips the urn.{n}Three hundred years of rain, and\neighteen gold thrown in for luck\nby people who came this far and\nno further.'],
    search: ['%HERO% looks about the belfry.{n}Wind. Roots. A view of the whole\nwood and, a long way off, the\nsea.',
      '%HERO% looks up into the frame.{n}No bell. Only the sky, going\nround very slowly.'],
  },
};
