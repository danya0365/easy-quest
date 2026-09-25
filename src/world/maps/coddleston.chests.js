/** coddleston.chests.js — a little something by the yard wall. */
export default {
  chests: [
    { id: 'cod_barrel', x: -6.5, z: 2.0, kind: 'barrel', gold: 8,
      name: 'a barrel by the wall', line: 't-barrel', reach: 1.7,
      found: 'Coins under a birthday napkin.' },
    { id: 'cod_crate', x: 5.5, z: -1.5, kind: 'crate', name: 'a crate of bunting', line: 't-crate', reach: 1.6 },
  ],
  lines: {
    't-barrel': ['%HERO% looks in the barrel again.\nNapkins. No more coins.'],
    't-crate': ['Bunting, carefully folded, and\none streamer that escaped.'],
  },
};
