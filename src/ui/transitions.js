/**
 * transitions.js — wipes, fades, the battle swirl, flashes, vignette, the boot fade-in.
 *                                                                              (P29, owner: src/ui/transitions.js)
 *
 * PLUGIN: main.js imports this file once and calls install(ctx) FIRST (before the other plugins). Fill THIS file and
 * it is live in the real game — no shared-file edit.
 *
 * STUB: installs nothing, so map changes are instant cuts and the first frame simply appears.
 *
 * Extension points to use:
 *   ctx.Field.setTransition((info, swap) => Promise)   every exit to a built map runs through it:
 *                                                      info = {kind: 'door'|'stairs'|'edge', from, to, exit};
 *                                                      fade out, call swap() ONCE (builds the new map), fade in, resolve.
 *   ctx.Debug.busy('transition', true|false)          holds __DQ.screenshotReady() false while a wipe is mid-flight
 *   ctx.Input.block('transition', true|false)         held buttons wait for a fresh press after the wipe
 *   ctx.Bus.on('app.booted', ({scene}) => fadeIn())    main.js emits it once the first scene is on the stack
 *   ctx.Bus.on('battle.start' | 'battle.end', ...)     the battle swirl (P14/P15 emit these)
 *   An overlay layer: a DOM element in #ui-root (pointer-events:none) or an overlay THREE.Scene with background null.
 */
export function install(ctx = {}) {
  void ctx;   // stub
}

export default install;
