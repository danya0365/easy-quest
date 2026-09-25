/**
 * ch3.js — ACT III: the Stone Garden & the Quiet Deep.                (P25, owner: src/story/chapters/ch3*.js)
 *
 * Wave-2 breadth: B20–B27 play on real place stubs (stone_garden, keep, saltmarrow, bellhollow, highfeather,
 * whistfell, quiet_deep). Arms only after ch3.start (end of B19). Finale polish later; flags must never soft-lock.
 */
import {
  Story, say, narrate, wait, camera, fade, music, sfx, give, flag, joinParty, choice,
  battle, card, spawn, despawn, act,
} from '../script.js';
import { Flags } from '../flags.js';
import { Quests } from '../quests.js';
import { Maps } from '../../world/map.js';
import { Field } from '../../world/field.js';
import { Bus } from '../../engine/events.js';
import { Scenes } from '../../engine/states.js';
import { reportError } from '../../engine/debug.js';

const has = (id) => { try { return Maps.has(id); } catch (_) { return false; } };
const ROAD = { at: 'meadow', zone: { x: 3.6, z: 31.8, r: 4.0 } };

const b20 = () => [
  music('family'),
  narrate('Nine years. The Stone Garden holds Papa\nand Mum and too many others.\nChip the stone. Keep hitting it.'),
  sfx('rock_slide'),
  flag('ch3.awake'),
  narrate('{gold}Papa stirs inside the stone.{/gold}'),
  camera.follow(),
];

const b21 = () => [
  music('castle'),
  narrate('Ambergarde Keep. The Larksteel Sword\nstill will not come for you.\nRowan’s hand fits.'),
  flag('ch3.sword_drawn'),
  give('larksteel_sword', 1),
  sfx('item_get'),
  narrate('{gold}Rowan draws the Larksteel Sword.{/gold}'),
  camera.follow(),
];

const b22 = () => [
  music('overworld'),
  narrate('The wagon and the Merry Lark are yours.\nOld friends first. Cold places after.'),
  flag('ch3.old_friends'),
  flag('ch3.shield'),
  give('larksteel_shield', 1),
  sfx('item_get'),
  narrate('You gather what the road still owes you.\n{gold}The Larksteel Shield{/gold} finds its arm.'),
  camera.follow(),
];

const b23 = () => [
  music('dungeon'),
  narrate('Bellhollow Abbey. Stand under the empty\nbell frame holding the sword.\nThe Cloud Stair comes down.'),
  ...(has('highfeather') ? [
    fade('out', { ms: 400 }),
    act(() => { try { const q = window.__DQ; if (q && q.teleport) q.teleport('highfeather'); } catch (_) {} }),
    wait(700),
    fade('in', { ms: 500 }),
    narrate('Highfeather. The Sunlark is the size of\na cathedral, and enormously polite.'),
  ] : []),
  give('larkweave_cloak', 1),
  give('sunlarks_feather', 1),
  sfx('item_get'),
  flag('ch3.cloak'),
  flag('ch3.sunlark'),
  narrate('{gold}The Larkweave Cloak{/gold} settles on Linnet.\nA feather keeps singing in your pack.'),
  camera.follow(),
];

const b24 = () => [
  music('tension'),
  narrate('Whistfell Abbey over the Gullet.\nOne lantern is lit. Find it.'),
  flag('ch3.elowen'),
  give('elowens_shawl', 1),
  sfx('item_get'),
  narrate('{gold}Queen Elowen{/gold} wakes.\n“Oh, you got so tall. I only put you down\nfor a minute.”'),
  narrate('She gives {gold}Elowen’s Shawl{/gold}.'),
  camera.follow(),
];

const b25 = () => [
  music('boss'),
  narrate('The Quiet Deep. Down, under everything.\nBishop Mortmain. Then Malgrim the Unlit.'),
  battle({ area: 'quiet_deep', boss: true, scripted: { rounds: 3, unlosable: true, endText: 'It is finished.' } }),
  flag('ch3.mortmain_fallen'),
  flag('ch3.malgrim_fallen'),
  music('victory'),
  narrate('The Larksteel Sword cuts the dream away.\nMortmain lives — an ordinary old man.'),
  camera.follow(),
];

const b26 = () => [
  music('family'),
  narrate('Back to the Stone Garden.\nTake Mum. Everybody wakes.'),
  flag('ch3.spouse_freed'),
  camera.follow(),
];

const b27 = () => [
  music('wedding'),
  narrate('Go home. All of you.\nThe fire is in. The kettle is on.'),
  flag('game.cleared'),
  card('The end — for now.', 'Thank you for playing.', { ms: 3200 }),
  camera.follow(),
];

export const BEATS = [
  { id: 'b20', beat: 'B20', at: 'stone_garden', needs: ['ch3.start'], blocks: ['ch3.awake'], steps: b20, name: 'Chip Papa free' },
  { id: 'b21', beat: 'B21', at: 'ambergarde_keep', needs: ['ch3.awake'], blocks: ['ch3.sword_drawn'], steps: b21, name: 'The sword in the stone' },
  { id: 'b22', beat: 'B22', at: 'saltmarrow', needs: ['ch3.sword_drawn'], blocks: ['ch3.shield'], steps: b22, name: 'Old friends' },
  { id: 'b23', beat: 'B23', at: 'bellhollow_abbey', needs: ['ch3.shield'], blocks: ['ch3.sunlark'], steps: b23, name: 'The Cloud Stair' },
  { id: 'b24', beat: 'B24', at: 'whistfell_abbey', needs: ['ch3.sunlark'], blocks: ['ch3.elowen'], steps: b24, name: 'Over the whirlpool' },
  { id: 'b25', beat: 'B25', at: 'quiet_deep', needs: ['ch3.elowen'], blocks: ['ch3.malgrim_fallen'], steps: b25, name: 'The Quiet Deep' },
  { id: 'b26', beat: 'B26', at: 'stone_garden', needs: ['ch3.malgrim_fallen'], blocks: ['ch3.spouse_freed'], steps: b26, name: 'Everybody wakes' },
  { id: 'b27', beat: 'B27', at: 'ambergarde_keep', needs: ['ch3.spouse_freed'], blocks: ['game.cleared'], steps: b27, name: 'Going home' },
];

export function placeOf(b) {
  if (has(b.at)) return { map: b.at, zone: b.zone || null, journey: false };
  return { map: ROAD.at, zone: ROAD.zone, journey: true };
}
function ready(b) {
  for (const n of b.blocks) if (Flags.has(n)) return false;
  for (const n of b.needs) if (!Flags.has(n)) return false;
  return true;
}
export function nextBeat() { return BEATS.find(ready) || null; }

const S = { installed: false, map: null, cool: 0, poll: 0, armed: true };
const here = () => { try { const w = Field.world(); return (w && w.map && w.map.id) || S.map; } catch (_) { return S.map; } };

async function playBeat(b) {
  const place = placeOf(b);
  const steps = [];
  const away = !place.journey && place.map && here() !== place.map;
  if (place.journey) {
    steps.push(fade('out', { ms: 520 }));
    steps.push(card(Quests.placeName(b.at) || b.name, 'the road takes you there'));
    steps.push(fade('in', { ms: 620 }));
  } else if (away) {
    steps.push(fade('out', { ms: 460 }));
    steps.push(act(() => { const q = (typeof window !== 'undefined' && window.__DQ) || null; if (q && q.teleport) q.teleport(place.map); }));
    steps.push(wait(800));
    steps.push(card(Quests.placeName(b.at) || b.name, null, { ms: 1500 }));
    steps.push(fade('in', { ms: 560 }));
  }
  steps.push(...b.steps());
  if (place.journey) {
    steps.push(fade('out', { ms: 520 }));
    steps.push(card('Puddlewick Vale', 'and the road home'));
    steps.push(fade('in', { ms: 620 }));
  }
  return Story.play(steps, { id: b.id, name: b.name });
}

export const Chapter3 = {
  BEATS, nextBeat, placeOf,
  play(id) {
    const b = BEATS.find((x) => x.id === id || x.beat === id);
    if (!b) return Promise.resolve({ ok: false, reason: `no Act III beat "${id}"`, beats: BEATS.map((x) => x.id) });
    return playBeat(b);
  },
  async playAll(from = 0) {
    const out = [];
    for (let i = Math.max(0, from | 0); i < BEATS.length; i++) out.push(await playBeat(BEATS[i]));
    return { ok: true, played: out.length, beats: out };
  },
  state() {
    const n = nextBeat();
    return {
      act: 3, beats: BEATS.length,
      done: BEATS.filter((b) => b.blocks.some((f) => Flags.has(f))).map((b) => b.id),
      next: n ? { id: n.id, beat: n.beat, name: n.name, where: placeOf(n) } : null,
      built: BEATS.map((b) => b.at).filter((m, i, a) => a.indexOf(m) === i).filter(has),
      missing: BEATS.map((b) => b.at).filter((m, i, a) => a.indexOf(m) === i).filter((m) => !has(m)),
      on: S.map,
    };
  },
  install(ctx = {}) {
    if (S.installed) return Chapter3;
    S.installed = true;
    const D = ctx.Debug || null;
    Story.registerAll(Object.fromEntries(BEATS.map((b) => [b.id, b.steps])));
    const tryHere = () => {
      if (!Story.auto || Story.running()) return;
      try { if (Scenes.top() !== 'field') return; } catch (_) {}
      if (!Flags.has('ch3.start')) return;
      const b = nextBeat();
      if (!b) { S.armed = true; return; }
      const place = placeOf(b);
      if (place.map !== S.map) { S.armed = true; return; }
      if (place.zone) {
        const p = Field.player();
        if (!p) return;
        const d = Math.hypot(p.x - place.zone.x, p.z - place.zone.z);
        if (d > place.zone.r * 1.6) S.armed = true;
        if (d > place.zone.r || !S.armed) return;
      } else if (!S.armed) return;
      S.armed = false;
      playBeat(b).catch((e) => reportError(`Act III ${b.id}`, e));
    };
    Bus.on('map.enter', (m) => { S.map = (m && m.id) || null; S.armed = true; S.cool = 40; });
    try {
      Field.on('update', () => {
        if (S.cool > 0) { S.cool--; if (S.cool === 0) tryHere(); return; }
        if (++S.poll < 12) return;
        S.poll = 0;
        tryHere();
      });
    } catch (e) { reportError('Act III triggers', e); }
    if (D) {
      D.provide('act3', () => Chapter3.state());
      D.expose('beat3', (id) => (id === undefined ? Chapter3.state() : Chapter3.play(id)));
      D.expose('act3', (from) => Chapter3.playAll(from));
    }
    return Chapter3;
  },
};

export default Chapter3;
