/**
 * ch2.js — ACT II: The Quiet Quarry & the bride road.                 (P25, owner: src/story/chapters/ch2*.js)
 *
 * Wave-2 breadth: every CANON §4 B10–B19 beat is reachable as a real cutscene (or a journey card when its map
 * is not built yet), so Act I → Act II is not a dead end. Full bridal / Ambergarde polish comes later; these
 * scenes set the right flags, hand the right items, and never soft-lock a child.
 */
import {
  Story, say, narrate, move, face, wait, camera, fade, music, sfx, give, gold, flag, joinParty, choice,
  shake, battle, card, spawn, despawn, act,
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

// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
// B10 — the Quiet Quarry. Ten years of chores, then a hole Digby dug.
// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
const b10 = () => [
  music('tension'),
  narrate('Ten years of black stone and cold breakfast.\nBertie is taller. You are taller.\nThe Quiet Quarry is the same.'),
  spawn('bertie', 'villager:boy', { ahead: 2.4, side: -0.8 }),
  camera.two('bertie'),
  say('bertie', 'Chore one: barrows.\nChore two: stones.\nChore three: do not look at the gate.'),
  say('bertie', 'I have been counting the mornings.\nThree thousand, six hundred and\nfifty-two. Give or take a birthday.'),
  spawn('digby', 'monster:barrowmole', { ahead: 2.8, side: 1.0 }),
  face('hero', 'digby'),
  camera.two('digby'),
  say('digby', 'Digby dug.\nDigby dug a long time.\nThe wall is soft now.'),
  choice(['Nod', 'Thank him'], [
    [say('digby', 'Digby likes nods. Digby dug more.')],
    [say('digby', 'Digby does not need thanks.\nDigby needs open air.')],
  ]),
  joinParty('digby'),
  narrate('{gold}Digby{/gold} joined the party!'),
  sfx('door_open'),
  flag('ch2.quarry_escape'),
  narrate('{gold}The wall gives way.\nWind smells of rain, not dust.{/gold}'),
  despawn('bertie'), despawn('digby'),
  camera.follow(),
];

// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
// B11 — Whistling Caves. Bobble waited.
// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
const b11 = () => [
  music('dungeon'),
  narrate('The Whistling Caves sing when the\nwind is bored. Follow the note that\nsounds least like a warning.'),
  spawn('bobble', 'monster:gloop', { ahead: 2.5, side: 0.2 }),
  wait(280),
  camera.two('bobble'),
  say('bobble', 'Bobble packed a lunch.\nBobble packed it ten years ago.\nIt is mostly philosophy now.'),
  say('bobble', 'Bobble sat on this rock.\nBobble did not move.\nBobble is very good at sitting.'),
  joinParty('bobble'),
  narrate('{gold}Bobble{/gold} is back in the wagon.'),
  flag('party.bobble_return'),
  spawn('bertie', 'villager:boy', { ahead: 2.6, side: -1.0 }),
  camera.two('bertie'),
  say('bertie', 'I am going home to Coddleston.\nDo not die of anything interesting\nwithout writing.'),
  narrate('Bertie tips his cap and walks toward\nthe light. The caves keep whistling.'),
  despawn('bobble'), despawn('bertie'),
  camera.follow(),
];

// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
// B11b — Gogglestone. The Sunmane is Pip.
// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
const b11b = () => [
  music('boss'),
  narrate('Puddlewick folk swear a golden beast\nlives in Gogglestone Caves.\nIt does.'),
  spawn('sunmane', 'monster:sunmane', { ahead: 3.2, side: 0 }),
  camera.two('sunmane', 'hero', { dist: 3.6, height: 1.3 }),
  battle({ area: 'gogglestone_caves', enemies: ['sunmane'], scripted: { rounds: 2, unlosable: true, endText: 'The roar stops mid-breath.' } }),
  music('family'),
  narrate('The golden beast sees the scrap of\nribbon on your wrist.\nThe roar becomes a question.'),
  say('sunmane', '…Pip?'),
  narrate('It is Pip.\nGrown, and golden, and still yours.'),
  give('pips_bell', 1),
  sfx('item_get'),
  narrate('%HERO% picked up {gold}Pip’s Bell{/gold}.'),
  joinParty('pip'),
  flag('ch2.pip_return'),
  despawn('sunmane'),
  camera.follow(),
];

// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
// B12 — Home. Barty kept the fire in.
// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
const b12 = () => [
  music('family'),
  narrate('Hollybank is half a house and half\na memory. Smoke still comes from\nthe chimney.'),
  spawn('barty', 'barty', { ahead: 2.3, side: -0.4 }),
  camera.two('barty'),
  say('barty', 'Little master.\nI kept the fire in.\nTen years is a long kettle.'),
  say('barty', 'He died, little master.\nI will say it once, plainly,\nand then we will make supper.'),
  give('ambergarde_crest', 1),
  give('papas_letter', 1),
  give('mums_feather_hairpin', 1),
  sfx('item_get'),
  narrate('Barty hands over the house key,\nthe {gold}Ambergarde Crest{/gold},\nand Papa’s letter from the loft.'),
  joinParty('barty'),
  flag('ch2.barty_join'),
  flag('ch2.crest'),
  flag('ch2.letter'),
  flag('ch2.wagon'),
  narrate('{gold}Wild monsters may join the wagon now.{/gold}\nDoss mended Papa’s old wheels.'),
  despawn('barty'),
  camera.follow(),
];

// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
// B13–B19 — bridal road (breadth stubs: real flags, short scenes, journey when maps missing)
// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
const b13 = () => [
  music('village'),
  narrate('Saltmarrow smells of rope again.\nThe Contented Herring has a new\nkeeper who used to dare you into manors.'),
  spawn('willow', 'willow', { ahead: 2.4, side: 0.6 }, { build: { age: 'adult' } }),
  camera.two('willow'),
  say('willow', 'Well.\nLook who grew.\nThe stew is on. Sit.'),
  flag('ch2.willow_grown'),
  despawn('willow'),
  camera.follow(),
];

const b14 = () => [
  music('castle'),
  narrate('Marbleford. Fairweather Hall.\nSera has grown into the sort of\nperson who writes lists in ink.'),
  spawn('sera', 'sera', { ahead: 2.5, side: 0.5 }, { build: { age: 'adult' } }),
  camera.two('sera'),
  say('sera', 'Rudolpho has four conditions.\nI have numbered them.\nYou will hate number three.'),
  flag('ch2.sera_grown'),
  flag('ch2.pearl_quest'),
  despawn('sera'),
  camera.follow(),
];

const b15 = () => [
  music('dungeon'),
  narrate('The Sighing Grotto breathes like a\nsleeping giant. The Tide Pearl is\nwhere the water thinks nobody looks.'),
  give('tide_pearl', 1),
  sfx('item_get'),
  narrate('%HERO% found the {gold}Tide Pearl{/gold}.'),
  flag('ch2.pearl'),
  camera.follow(),
];

const b16 = () => [
  music('family'),
  narrate('Fairweather Hall again.\nTwo roads. One ring.\nNobody else can choose for you.'),
  choice(['Ask Willow', 'Ask Sera'], [
    [
      flag('ch2.bride', 'willow'),
      say('willow', 'Took you long enough.\nI already told the stew.'),
    ],
    [
      flag('ch2.bride', 'sera'),
      say('sera', 'Yes.\nI had hoped you would say that\nbefore Rudolpho finished his list.'),
    ],
  ]),
  camera.follow(),
];

const b17 = () => [
  music('wedding'),
  narrate('Marbleford Chapel.\nEverybody is here.\nSomebody is crying already, and it is Barty.'),
  flag('ch2.married'),
  flag('ch2.ship'),
  narrate('{gold}The Merry Lark{/gold} waits at the quay.'),
  camera.follow(),
];

const b18 = () => [
  music('castle'),
  narrate('Ambergarde. The crest fits a door\non a green headland. The court kneels\nbefore they know your name.'),
  flag('ch2.ambergarde'),
  narrate('The Larksteel Sword will not come\nout for you. Not yet.'),
  flag('ch2.sword_failed'),
  narrate('Rowan and Linnet arrive the way\nstorms do — loudly, and all at once.'),
  flag('ch2.twins_born'),
  camera.follow(),
];

const b19 = () => [
  music('tension'),
  narrate('The coronation.\nStone takes the people you love\nthe way winter takes a garden.'),
  flag('ch2.petrified'),
  flag('ch3.start'),
  card('Nine years pass.', null, { ms: 2800 }),
  narrate('{gold}Act III — the Stone Garden.{/gold}\nChip Papa free. Keep going.'),
  camera.follow(),
];

export const BEATS = [
  { id: 'b10', beat: 'B10', at: 'quiet_quarry', needs: ['ch2.start'], blocks: ['ch2.quarry_escape'], steps: b10, name: 'The Quiet Quarry' },
  { id: 'b11', beat: 'B11', at: 'whistling_caves', needs: ['ch2.quarry_escape'], blocks: ['party.bobble_return'], steps: b11, name: 'Whistling Caves' },
  { id: 'b11b', beat: 'B11b', at: 'gogglestone_caves', needs: ['party.bobble_return'], blocks: ['ch2.pip_return'], steps: b11b, name: 'The Sunmane' },
  { id: 'b12', beat: 'B12', at: 'hollybank', needs: ['ch2.pip_return'], blocks: ['ch2.barty_join'], steps: b12, name: 'Home' },
  { id: 'b13', beat: 'B13', at: 'saltmarrow', needs: ['ch2.barty_join'], blocks: ['ch2.willow_grown'], steps: b13, name: 'The Contented Herring' },
  { id: 'b14', beat: 'B14', at: 'marbleford', needs: ['ch2.willow_grown'], blocks: ['ch2.pearl_quest'], steps: b14, name: 'Fairweather Hall' },
  { id: 'b15', beat: 'B15', at: 'sighing_grotto', needs: ['ch2.pearl_quest'], blocks: ['ch2.pearl'], steps: b15, name: 'The Tide Pearl' },
  { id: 'b16', beat: 'B16', at: 'fairweather_hall', needs: ['ch2.pearl'], blocks: ['ch2.bride'], steps: b16, name: 'The choice' },
  { id: 'b17', beat: 'B17', at: 'marbleford_chapel', needs: ['ch2.bride'], blocks: ['ch2.married'], steps: b17, name: 'The wedding' },
  { id: 'b18', beat: 'B18', at: 'ambergarde', needs: ['ch2.married'], blocks: ['ch2.ambergarde'], steps: b18, name: 'Ambergarde' },
  { id: 'b19', beat: 'B19', at: 'ambergarde_keep', needs: ['ch2.ambergarde'], blocks: ['ch2.petrified'], steps: b19, name: 'The coronation' },
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
    steps.push(act(() => {
      const q = (typeof window !== 'undefined' && window.__DQ) || null;
      if (q && q.teleport) q.teleport(place.map);
    }));
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

export const Chapter2 = {
  BEATS, nextBeat, placeOf,
  play(id) {
    const b = BEATS.find((x) => x.id === id || x.beat === id);
    if (!b) return Promise.resolve({ ok: false, reason: `no Act II beat "${id}"`, beats: BEATS.map((x) => x.id) });
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
      act: 2, beats: BEATS.length,
      done: BEATS.filter((b) => b.blocks.some((f) => Flags.has(f))).map((b) => b.id),
      next: n ? { id: n.id, beat: n.beat, name: n.name, where: placeOf(n) } : null,
      built: BEATS.map((b) => b.at).filter((m, i, a) => a.indexOf(m) === i).filter(has),
      missing: BEATS.map((b) => b.at).filter((m, i, a) => a.indexOf(m) === i).filter((m) => !has(m)),
      on: S.map,
    };
  },
  install(ctx = {}) {
    if (S.installed) return Chapter2;
    S.installed = true;
    const D = ctx.Debug || null;
    Story.registerAll(Object.fromEntries(BEATS.map((b) => [b.id, b.steps])));

    const tryHere = () => {
      if (!Story.auto || Story.running()) return;
      try { if (Scenes.top() !== 'field') return; } catch (_) {}
      // Act II only arms after ch2.start (set at the end of B9).
      if (!Flags.has('ch2.start')) return;
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
      playBeat(b).catch((e) => reportError(`Act II ${b.id}`, e));
    };

    Bus.on('map.enter', (m) => {
      S.map = (m && m.id) || null;
      S.armed = true;
      S.cool = 40;
    });
    try {
      Field.on('update', () => {
        if (S.cool > 0) { S.cool--; if (S.cool === 0) tryHere(); return; }
        if (++S.poll < 12) return;
        S.poll = 0;
        tryHere();
      });
    } catch (e) { reportError('Act II triggers', e); }

    if (D) {
      D.provide('act2', () => Chapter2.state());
      D.expose('beat2', (id) => (id === undefined ? Chapter2.state() : Chapter2.play(id)));
      D.expose('act2', (from) => Chapter2.playAll(from));
    }
    return Chapter2;
  },
};

export default Chapter2;
