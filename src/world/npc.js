/**
 * npc.js — NPC life: people and animals from map.npcs built, placed, idling, wandering, facing you when spoken to.
 *                                                                                   (P11, owner: src/world/npc.js)
 *
 * PLUGIN: main.js imports this file once and calls install(ctx). Fill THIS file and it is live in the real game.
 * Who stands where and what they say lives in the map layer files src/world/maps/<id>.npcs.js (also P11).
 *
 * STUB: installs nothing. map.npcs entries with `text`/`script`/`line` are already interactable (the field's
 * confirm talks to them through map.nearestInteractable), they just have no body yet.
 *
 * Extension points to use:
 *   ctx.Field.on('load',   ({map, scene, camera, field}) => spawn(map.npcs))   // Chars.build(char, {age, variant})
 *   ctx.Field.on('unload', ({map, scene}) => despawn())
 *   ctx.Field.on('update', (dt, {top}) => wander(dt))       // fixed 60 Hz; top = false while a dialogue is up
 *   ctx.Field.on('render', (alpha, dt, t, {player, camera}) => pose(alpha, dt))
 *   ctx.Field.world().blobs.set(i, x, y, z, scale)          // blob shadows (index 0 is the hero; the map view uses a few)
 *   map.nearestInteractable / the npc entry's talk(ctx) -> {text|pages, voice, name}   (the field pushes 'dialogue')
 *   ctx.Bus.on('dialogue.start', ({speaker}) => turnToFace(speaker))
 *   ctx.Debug.provide('npcs', () => [...])                   so critics can see them in __DQ.state().npcs
 */
export function install(ctx = {}) {
  void ctx;   // stub
}

export default install;
