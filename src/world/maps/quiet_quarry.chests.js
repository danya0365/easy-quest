/** quiet_quarry.chests.js — chores leave a few things behind. */
export default {
  chests: [
    { id: 'qq_barrel', x: 0.5, z: 2.0, kind: 'barrel', gold: 15,
      name: 'a chore barrel', line: 't-barrel', reach: 1.7,
      found: 'Fifteen coins under a dust of stone.\nBertie will not notice.' },
    { id: 'qq_crate', x: -1.0, z: 1.5, kind: 'crate', item: 'herb',
      name: 'a crate of picks', line: 't-crate', reach: 1.6,
      found: 'A herb, tucked where Digby digs.' },
    { id: 'qq_wall', x: -3.0, z: -7.0, kind: 'hidden', item: 'osrics_wooden_bird',
      name: 'a soft place in the wall', line: 't-wall', reach: 1.8,
      found: "Osric's wooden bird.\nIt took him a year." },
  ],
  lines: {
    't-barrel': ['Stone dust. No more coins.'],
    't-crate': ['Picks. Handles. Nothing green.'],
    't-wall': ['The soft place is hard again.\nDigby’s work is done.'],
  },
};
