/**
 * encounter.js — random encounters: step-based rate, terrain tables, ambush / first strike, boss triggers.
 *                                                                             (P31, owner: src/world/encounter.js)
 *
 * PLUGIN: main.js imports this file once and calls install(ctx). Fill THIS file and it is live in the real game.
 *
 * STUB: installs nothing — nothing ambushes you in the meadow (map.encounters is null there anyway).
 *
 * Extension points to use:
 *   ctx.Field.on('update', (dt, {top, field}) => ...)   fixed 60 Hz; read ctx.Field.player() -> {x, z, speed, steps,
 *                                                       ground, ...} and ctx.Field.map.def.encounters {rate, table}
 *   ctx.Bus.emit('battle.start', {enemies, backdrop, ambush}) / ctx.Scenes.push('battle', {...})   (P14's scene)
 *   ctx.Debug.provide('encounter', () => ({rate, stepsToNext, table}))
 *   Kid rule (ARCHITECTURE hard rule 8): never on the first 12 steps of a map, never twice in 20 steps.
 */
export function install(ctx = {}) {
  void ctx;   // stub
}

export default install;
