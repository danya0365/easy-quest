/**
 * The plugin manifest — the ONE shared file every piece may append a single line to.
 *
 * Each entry is [name, () => import('./path.js')]. The module must export install(ctx)
 * (see docs/ARCHITECTURE.md "Scene plugins"). main.js loads them in this order and a plugin that
 * fails to load or throws is reported in __DQ.state().boot and skipped — it never breaks the game.
 *
 * RULES FOR AGENTS: append or edit only YOUR OWN line. Never reorder or delete someone else's.
 * Order matters a little: libraries first (fx), then field systems, then scenes, title last.
 */
export const PLUGINS = [
  ['fx', () => import('./art/fx.js')],
  ['transitions', () => import('./ui/transitions.js')],
  ['dialogue', () => import('./ui/dialogue.js')],
  ['menu', () => import('./ui/menu.js')],
  ['items', () => import('./data/items.js')],
  ['shop', () => import('./ui/shop.js')],
  ['hud', () => import('./ui/hud.js')],
  ['npc', () => import('./world/npc.js')],
  ['treasure', () => import('./world/treasure.js')],
  ['party', () => import('./world/party.js')],
  ['encounter', () => import('./world/encounter.js')],
  ['battle.present', () => import('./battle/present.js')],
  ['battle.scene', () => import('./battle/scene.js')],
  ['story', () => import('./story/script.js')],
  ['access', () => import('./ui/access.js')],
  ['perf', () => import('./engine/perf.js')],
  ['title', () => import('./ui/title.js')],
];
