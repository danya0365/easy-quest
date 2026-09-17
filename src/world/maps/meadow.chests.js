/**
 * meadow.chests.js — Puddlewick Vale's TREASURE layer: chests, pots, barrels and hidden things to search.
 *                                                                               (P30 discovery; layer of meadow.js)
 *
 * Merged into src/world/maps/meadow.js at load by src/world/map.js (see its header, "Files and layers"):
 *   chests: [{id, x, z, kind?: 'chest'|'pot'|'barrel'|'crate'|'hidden', item?, gold?, flag?, text? | line?, talk?}]
 *   props:  [{type, x, z, ...}]            extra searchable set dressing, appended to the base's props
 *   lines:  {key: text | pages[]}           words for the above (and for base entities naming a `line`)
 * A chest with `text`, `line` or `talk(ctx)` is interactable today (confirm talks); P30's src/world/treasure.js adds
 * the opening ceremony through Field.on('load') / its own install(ctx), and remembers what was taken via flags.
 */
export default {
  chests: [],
};
