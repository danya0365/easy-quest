// score/index.js — the registry of every theme, variant and stinger cue (ids from CANON.md §9).  (P27)
// Each score file exports build() -> compiled theme (or an array of variants). Built once at import: pure data.
import * as title from './title.js';
import * as village from './village.js';
import * as overworld from './overworld.js';
import * as castle from './castle.js';
import * as town from './town.js';
import * as church from './church.js';
import * as inn from './inn.js';
import * as dungeon from './dungeon.js';
import * as tension from './tension.js';
import * as battle from './battle.js';
import * as boss from './boss.js';
import * as victory from './victory.js';
import * as levelup from './levelup.js';
import * as befriend from './befriend.js';
import * as family from './family.js';
import * as lullaby from './lullaby.js';
import * as wedding from './wedding.js';
import * as highfeather from './highfeather.js';
import * as quietHand from './quiet_hand.js';
import * as finale from './finale.js';
import * as battleStart from './battle_start.js';
import * as itemGet from './item_get.js';
import * as sadSting from './sad_sting.js';
import { counterpointOf } from './_lib.js';

const BUILDERS = [title, village, overworld, castle, town, church, inn, dungeon, tension, battle, boss, victory, levelup,
  befriend, family, lullaby, wedding, highfeather, quietHand, finale, battleStart, itemGet, sadSting];

export const THEMES = {};
for (const mod of BUILDERS) {
  try {
    const built = mod.build();
    for (const th of Array.isArray(built) ? built : [built]) THEMES[th.id] = th;
  } catch (e) {
    try { (globalThis.__DQ ||= {}).errors ||= []; globalThis.__DQ.errors.push('[music] score build failed: ' + e.message); } catch (_) { /* ignore */ }
    console.warn('[music] score build failed', e);
  }
}

/** counterpoint report for the named themes (see _lib.counterpointOf) — the demo and the harness assert on this */
export function counterpoint(ids = ['village', 'overworld', 'battle']) {
  return ids.map((id) => THEMES[id]).filter(Boolean).map((th) => counterpointOf(th));
}

/** map.music aliases (ARCHITECTURE.md uses 'sad') */
export const ALIASES = { sad: 'family' };

/** Music.stinger(id) -> the one-shot cue it plays */
export const STINGER_THEME = {
  battle_start: 'battle_start', victory: 'victory', level_up: 'levelup', item_get: 'item_get',
  join: 'befriend', inn: 'inn.sleep', sad_sting: 'sad_sting',
};
export const STINGER_IDS = Object.keys(STINGER_THEME);
