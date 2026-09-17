/**
 * hud.js — the field HUD: place cards on arrival, the "where do I go" quest ribbon, signpost clarity, minimap.
 *                                                                                      (P32, owner: src/ui/hud.js)
 *
 * PLUGIN: main.js imports this file once and calls install(ctx). Fill THIS file and it is live in the real game.
 *
 * STUB: installs nothing.
 *
 * Extension points to use (no shared-file edits needed):
 *   ctx.Bus.on('map.enter', ({id, name, kind, music, x, z}) => showPlaceCard(name))   // after the map is built
 *   ctx.Bus.on('map.leave', ({id, to}) => ...)        ctx.Bus.on('dialogue.start' | 'dialogue.end' | 'menu.open' | 'menu.close')
 *   ctx.Field.on('update', (dt, {top, field}) => ...)  ctx.Field.on('render', (alpha, dt, t, {player, camera}) => ...)
 *   ctx.Field.world() -> {scene, camera, map, player, cameraRig, blobs, lightRig, view}   (null off the field)
 *   ctx.UI.window({id, left, top, slim, content}) / ctx.UI.h / UI.row / UI.label   the DQ window widget (F4)
 *   ctx.Debug.provide('hud', () => ({placeCard, ribbon}))   so critics can see it in __DQ.state().hud
 */
export function install(ctx = {}) {
  void ctx;   // stub
}

export default install;
