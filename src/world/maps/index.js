/**
 * maps/index.js — every map the game knows.                                        (P23, owner: src/world/maps/*.js)
 *
 * Maps.loadAll() (src/world/map.js) imports each entry's base file src/world/maps/<id>.js and its layer files
 * src/world/maps/<id>.<layer>.js — by default ['npcs', 'chests']. When you add a map, add ONE line here and create
 * all three files (an empty `export default {}` layer is fine: P11 fills <id>.npcs.js, P30 fills <id>.chests.js).
 * Map ids come from docs/CANON.md §2 (the opening meadow keeps the slice id 'meadow').
 */
export default [
  { id: 'meadow' },                 // Puddlewick Vale, the opening meadow
];
