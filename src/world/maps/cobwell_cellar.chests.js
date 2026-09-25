/**
 * cobwell_cellar.chests.js — MUSIC BOX 3 is inside the roots. (P23B treasure layer of cobwell_cellar.js)
 * WORLD-BIBLE §4 A10. Getting it out is the scare: the roots move while your hands are in them, and they let go.
 */
export default {
  chests: [
    { id: 'cc_musicbox3', x: -2.0, z: -4.2, kind: 'hidden', item: 'music_box',
      name: 'inside the roots', line: 't-musicbox3', reach: 1.9 },
    { id: 'cc_coat', x: -1.7, z: -3.2, kind: 'hidden', gold: 40, name: 'the coat pockets', line: 't-coat', reach: 1.8 },
    { id: 'cc_barrel', x: 6.6, z: 2.6, kind: 'barrel', item: 'strong_herb', name: 'a cellar barrel', line: 't-barrel', reach: 1.6 },
    { id: 'cc_barrel2', x: 7.2, z: 1.4, kind: 'barrel', name: 'the other barrel', line: 't-barrel-2', reach: 1.6 },
    { id: 'cc_crates', x: -7.2, z: 3.0, kind: 'crate', gold: 13, name: 'the crates', line: 't-crates', reach: 1.6 },
    { id: 'cc_rack', x: 7.4, z: -5.0, kind: 'shelf', name: 'the bottle rack', line: 't-rack', reach: 1.7 },
    { id: 'cc_urns', x: -8.0, z: -3.0, kind: 'pot', item: 'herb', name: 'a crock', line: 't-urn', reach: 1.6 },
    { id: 'cc_wet', x: -6.2, z: -5.2, kind: 'hidden', gold: 5, name: 'the puddle', line: 't-wet', reach: 1.7 },
  ],
  lines: {
    't-musicbox3': ['%HERO% puts both arms into the\nroots up to the elbow.{wait:700}{n}The roots move.',
      '{wait:300}They do not grab. They move like\nsomething turning over in its\nsleep, and then they are still.',
      'He pulls out a painted box, gold,\nwith a brass handle, wound about\nwith root.{p}{gold}MUSIC BOX 3 of 3.{/gold}'],
    't-coat': ['%HERO% goes through the pockets\nof the groom’s coat.{n}Forty gold, a ring, and a folded\nnote he cannot read in the dark.'],
    't-barrel': ['%HERO% opens the barrel.{n}Medicine, wrapped for a journey\nthat did not happen.'],
    't-barrel-2': ['%HERO% opens the other barrel.{n}Water. Extremely old water.'],
    't-crates': ['%HERO% pulls the crates apart.{n}Coins in a jar, and a very\ncalm newt.'],
    't-rack': ['%HERO% goes along the rack.{n}Nine bottles, all of them empty,\nall of them uncorked from the\ninside.'],
    't-urn': ['%HERO% lifts the crock lid.{n}A herb, dry and perfect, kept\nin the cold.'],
    't-wet': ['%HERO% puts his hand in the\npuddle and immediately regrets\nit.{n}Coins. And something that moves\naway from his fingers.'],
    search: ['%HERO% feels along the wall.{n}Root. Mud. More root. He takes\nhis hand back.',
      '%HERO% looks at the roots and\ndecides not to.'],
  },
};
