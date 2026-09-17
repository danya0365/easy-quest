/**
 * present.js — battle presentation: terrain-matched backdrop, battle camera, monsters idling, hits, damage pops,
 * shake, flashes, the victory tally and the monster-joins moment.                (P15, owner: src/battle/present.js)
 *
 * PLUGIN: main.js imports this file once and calls install(ctx). Fill THIS file and it is live in the real game.
 *
 * STUB: installs nothing.
 *
 * Extension points to use:
 *   export a presenter factory the battle scene (src/battle/scene.js, P14) calls, e.g.
 *     createPresenter({ enemies, backdrop }) -> { render(alpha), play(event) -> Promise, dispose() }
 *   and/or listen on ctx.Bus ('battle.start', 'battle.event', 'battle.end').
 *   Monsters: src/art/monsters.js (P16) Monsters.build(id). Party: src/art/chars.js Chars.build(id).
 *   Overlay scenes must keep THREE.Scene.background null (ARCHITECTURE / F1 needs).
 *   ctx.Debug.provide('battlePresent', () => ({...})) for critics.
 */
export function install(ctx = {}) {
  void ctx;   // stub
}

export default install;
