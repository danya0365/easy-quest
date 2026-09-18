/**
 * maps/index.js — every map the game knows.                                        (P23, owner: src/world/maps/*.js)
 *
 * Maps.loadAll() (src/world/map.js) imports each entry's base file src/world/maps/<id>.js and its layer files
 * src/world/maps/<id>.<layer>.js — by default ['npcs', 'chests']. When you add a map, add ONE line here and create
 * all three files (an empty `export default {}` layer is fine: P11 fills <id>.npcs.js, P30 fills <id>.chests.js).
 * Map ids come from docs/CANON.md §2 (the opening meadow keeps the slice id 'meadow').
 */
export default [
  { id: 'meadow' },                                  // Puddlewick Vale, the opening meadow
  { id: 'puddlewick', layers: ['npcs'] },            // the home village (CANON §2 [01]) — the lane out of the vale
  { id: 'hollybank', layers: ['npcs'] },             // Bram's home (CANON §2 [02]) — the north-west door on the green
  { id: 'puddlewick_inn', layers: ['npcs'] },        // the inn on the green: the second door that is real
  // NOTE: none of these list a 'chests' layer because src/world/maps/<id>.chests.js (P30) does not exist for them
  // yet, and a listed layer file that 404s fails the harness. Add 'chests' the moment P30 creates each file.
];
