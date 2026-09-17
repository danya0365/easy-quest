/**
 * scene.js — the 'battle' scene: wires the rules engine (battle.js / actions.js / ai.js) to input, the command
 * windows and the presenter.                                                     (P14, owner: src/battle/scene.js)
 *
 * PLUGIN: main.js imports this file once and calls install(ctx). Fill THIS file and it is live in the real game.
 *
 * STUB: installs nothing, so __DQ.battle(ids) stays the F1 stub and no 'battle' scene is registered.
 *
 * Extension points to use:
 *   ctx.Scenes.register('battle', () => ({ opaque: true, enter({enemies, backdrop, ambush}) {...}, update(dt) {...},
 *                                          render(alpha) {...}, onInput(btn) { if (ctx.UI.input(btn)) return true; ... } }))
 *   ctx.Debug.implement('battle', (monsterIds) => ctx.Scenes.push('battle', {enemies: monsterIds}))
 *   ctx.Debug.provide('battle', () => ({turn, enemies, phase}))    // the ARCHITECTURE state().battle contract key
 *   ctx.Bus.emit('battle.start' | 'battle.end', {...})             // transitions (P29) and music listen
 *   ctx.Music().then(M => M.play('battle')) / M.stinger('victory')  // CANON §9 ids
 *   Presentation comes from src/battle/present.js (P15): keep the scene free of meshes and VFX.
 */
export function install(ctx = {}) {
  void ctx;   // stub
}

export default install;
