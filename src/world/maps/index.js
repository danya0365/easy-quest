/**
 * maps/index.js — every map the game knows.                                        (P23, owner: src/world/maps/*.js)
 *
 * Maps.loadAll() (src/world/map.js) imports each entry's base file src/world/maps/<id>.js and its layer files
 * src/world/maps/<id>.<layer>.js — by default ['npcs', 'chests']. When you add a map, add ONE line here and create
 * all three files (an empty `export default {}` layer is fine: P11 fills <id>.npcs.js, P30 fills <id>.chests.js).
 * Map ids come from docs/CANON.md §2 (the opening meadow keeps the slice id 'meadow').
 */
export default [
  // ── Puddlewick Vale and the home village ────────────────────────────────────────────────────────────────
  { id: 'meadow' },                                  // Puddlewick Vale, the opening meadow
  { id: 'puddlewick' },                              // the home village (CANON §2 [01]) — the lane out of the vale
  { id: 'hollybank' },                               // Bram's home (CANON §2 [02]) — the north-west door on the green
  { id: 'puddlewick_inn' },                          // the inn on the green

  // ── the eight other doors round the green (P06's rooms; P23 gap #9: they belong in this list, not in
  //    src/world/maps/int_rooms.js, which puddlewick.js had to import to register them by hand) ────────────
  { id: 'int_bakery' },                              // Nan Puddifoot's bakery
  { id: 'int_shop' },                                // the item and weapon shop
  { id: 'int_chapel' },                              // the chapel of Saint Alden
  { id: 'int_mill' },                                // the watermill on the Beck
  { id: 'int_barn' },                                // Hollybank's barn
  { id: 'int_twins' },                               // Dot and Bel's house
  { id: 'int_hob' },                                 // Old Hob's cottage
  { id: 'int_cottage' },                             // the Pottles' cottage

  // ── THE WIDER WORLD (P23B): the road out of the vale, the coast village, and the Act I dungeon ──────────
  { id: 'road_beck' },                               // the Long Lane down the Beck (WORLD-BIBLE §1 T1)
  { id: 'saltmarrow' },                              // Saltmarrow (CANON §2 [03]) — quay, tide mill, gulls
  { id: 'saltmarrow_mill' },                         // inside the tide mill: the hopper with the gold in it
  { id: 'road_wood' },                               // the Whispering Wood, and the lane to the manor gates
  { id: 'cobwell_manor' },                           // Cobwell Manor ground floor (CANON §2 [04]; WORLD-BIBLE §4 A1-A6)
  { id: 'cobwell_upper' },                           // the manor's first floor: Ottilie, the ballroom, the study
  { id: 'cobwell_cellar' },                          // the cellar under the kitchen: the third music box
  { id: 'cobwell_belfry' },                          // the belfry: BOSS Mumbleroot the Grudge
];
