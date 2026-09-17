/**
 * title.js — the title screen and the way into the game: logo, sky, music, "A New Tale" / "Carry On".
 *                                                                                    (P01, owner: src/ui/title.js)
 *
 * PLUGIN: main.js imports this file once and calls install(ctx) AFTER every other plugin, then boots whatever
 * ctx.boot says. Fill THIS file and it is live in the real game — no shared-file edit.
 *
 * STUB: installs nothing, so the game still boots straight into the field (ctx.boot unchanged).
 *
 * How the title takes over the boot (all from install(ctx)):
 *   ctx.Scenes.register('title', () => ({ opaque: true, enter() {...}, update(dt) {}, render(alpha) {}, onInput(btn) {...} }));
 *   ctx.boot.scene = 'title'; ctx.boot.ctx = {}; ctx.boot.newGame = false;   // main.js then pushes 'title' instead
 *   "A New Tale": ctx.Save.newGame(); ctx.Scenes.replace('field', { map: 'meadow' })
 *   "Carry On":   const r = ctx.Save.load(slot); ctx.Scenes.replace('field', {})   // the field reads the loaded map + pos
 *   Continue info: ctx.Save.continueInfo() / ctx.Save.latest() / ctx.Save.slots();  music: ctx.Music().then(M => M.play('title'))
 *   Back to the title later: ctx.Save.endGame(); ctx.Scenes.reset('title')
 *   Implement __DQ.goto('title') coverage via Scenes (goto already works for registered scenes).
 */
export function install(ctx = {}) {
  void ctx;   // stub: the game boots into the field (ctx.boot) until P01 lands
}

export default install;
