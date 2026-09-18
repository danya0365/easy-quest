/**
 * ch1.js — ACT I: The Boy and His Father.                            (P24, owner: src/story/chapters/ch1*.js)
 *
 * CANON §4 B1-B9, beat by beat, written with the cutscene DSL in src/story/script.js. Every flag is spelled
 * exactly as CANON spells it, so the HUD ribbon, the NPC `when:` lines, the Puddlewick "three looks" and the
 * befriending gate all turn over with the story.
 *
 * HOW A BEAT STARTS ITSELF
 *   Each beat declares where it belongs and what must already have happened:
 *     at: 'hollybank'                  the map it plays on
 *     zone: {x, z, r}                  optional: a spot on that map you have to walk to (the lane, the signpost)
 *     needs / blocks                   flags that must be set / must not be set
 *   `Chapter1.install()` watches `map.enter` and polls the player's position through the field's update hook, so a
 *   beat opens the moment a child arrives where the ribbon told them to go. Nothing ever waits on a menu.
 *
 * MAPS THAT ARE NOT BUILT YET (P23 owns them)
 *   Saltmarrow, Cobwell Manor, Coddleston and the Grey Ruins do not exist in the build yet. Act I still plays
 *   END TO END: a beat whose own map is missing plays as a JOURNEY at the Long Lane signpost — fade, a place
 *   card with the name of where you have gone, the scene itself with its real actors, then the road home. The
 *   words, the camera, the fights and every flag are the real ones. The moment `src/world/maps/saltmarrow.js`
 *   (etc.) lands, `Maps.has()` returns true and that beat plays on its own map instead, with no edit here.
 */
import {
  Story, say, narrate, move, face, wait, camera, fade, music, sfx, give, gold, flag, joinParty, choice,
  shake, battle, card, spawn, despawn,
} from '../script.js';
import { Flags } from '../flags.js';
import { Quests } from '../quests.js';
import { Maps } from '../../world/map.js';
import { Field } from '../../world/field.js';
import { Bus } from '../../engine/events.js';
import { reportError } from '../../engine/debug.js';

const has = (id) => { try { return Maps.has(id); } catch (_) { return false; } };
/** The place a beat plays when its own map is not built yet: the Long Lane signpost out of Puddlewick Vale. */
const ROAD = { at: 'meadow', zone: { x: 3.6, z: 31.8, r: 4.0 } };

// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
// B1 — the cottage at Puddlewick. Safety. You are small, the ceiling is low, and it is warm.
// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
const b1 = () => [
  music('village'),
  spawn('halvard', 'halvard', 'at:Father’s chair', { facing: 180 }),
  face('halvard', 'hero'),
  narrate('It is morning in Hollybank Cottage,\nand somebody has left a boot\non the stairs. Again.'),
  say('halvard', 'Morning, lad. There you are.'),
  say('halvard', 'Boots, if you would. Both of them.\nThen we are off down the lane.'),
  say('halvard', 'Have a poke about on the way.\nPots, baskets, drawers — that is\nwhere a house keeps its secrets.'),
  move('hero', 'at:Papa’s boots'),
  sfx('search'),
  narrate('%HERO% picks up two boots.\nThey are enormous.\nHe carries one under each arm.'),
  move('hero', 'halvard'),
  face('halvard', 'hero'),
  say('halvard', 'Good lad. Two boots.\nBoth of them mine.'),
  flag('ch1.awake'),
  say('halvard', 'I shall walk on to the lane.\nCome and find me when you have\nsaid goodbye to the village.'),
  move('halvard', { x: 0, z: 2.6 }),
  despawn('halvard'),
  narrate('{gold}Papa is waiting at the lane\nout of Puddlewick.{/gold}'),
  camera.follow(),
];

// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
// B2 — Puddlewick. Pride: your father cannot be beaten, and everyone here knows it.
// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
const b2 = () => [
  spawn('halvard', 'halvard', { x: 15.4, z: 25.0, facing: 200 }),
  face('hero', 'halvard'),
  camera.shot({ from: { x: 19.6, y: 2.4, z: 26.6 }, lookAt: 'halvard', duration: 1.4, hold: false }),
  say('halvard', 'There you are. Nobody in this\nvillage would sell you so much as\na bun, I hear.'),
  say('halvard', 'That is because you have\nnothing to sell them back.\nHere. Thirty gold coins.'),
  gold(30),
  sfx('gold'),
  narrate('%HERO% received {gold}30 gold coins{/gold}.'),
  say('halvard', 'Don’t spend it all on one sword,\nlad. A sword is a tool.\nBuns are a treat.'),
  say('halvard', 'Up you get. Parsnip knows the road\nbetter than either of us.'),
  narrate('Parsnip the cart-horse looks round\nat %HERO% with enormous patience,\nand leans into the traces.'),
  flag('ch1.left_home'),
  sfx('door_open'),
  say('halvard', 'Watch the road, and stay where\nI can see you, if you would.'),
  despawn('halvard'),
  narrate('{gold}Follow the Long Lane.\nThe signpost is past the sheep.{/gold}'),
  camera.follow(),
];

// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
// B3 — the Long Lane. Delight: you have a friend and he is ridiculous.
// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
const b3 = () => [
  music('overworld'),
  narrate('The Long Lane runs south between\nthe hedges, and the wagon rattles\nalong it like a kettle on wheels.'),
  spawn('bobble', 'monster:gloop', { x: 3.6, z: 35.4, facing: 0 }),
  wait(300),
  sfx('battle_start'),
  narrate('A blue teardrop drops out of the\nhedge and lands in the road with a\nnoise like a wet slipper.'),
  battle({ area: 'long_lane', enemies: ['gloop'] }),
  face('hero', 'bobble'),
  camera.shot({ from: 'hero', to: { x: 3.6, y: 0.9, z: 33.0 }, lookAt: 'bobble', duration: 1.2, hold: false }),
  say('bobble', 'Bobble surrenders.\nBobble surrendered some time ago,\nactually. Nobody noticed.'),
  say('bobble', 'Frankly— Bobble would like to come\nwith you. Bobble is excellent at\nsitting in a wagon.'),
  choice(['Nod', 'Nod twice'], [
    [say('bobble', 'Bobble knew it.')],
    [say('bobble', 'Steady on. Bobble is only\none Gloop.')],
  ]),
  narrate('“Bubble, was it?” says a voice\nfrom the wagon.'),
  say('bobble', '{gold}BOBBLE.{/gold}'),
  joinParty('bobble'),
  narrate('{gold}Bobble{/gold} joined the party!'),
  despawn('bobble'),
  camera.follow(),
];

// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
// B4 — Saltmarrow and the Contented Herring. The world got bigger by two people.
// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
const b4 = () => [
  music('town'),
  spawn('willow', 'willow', { x: 2.0, z: 34.6, facing: 200 }, { build: { age: 'child' } }),
  spawn('sera', 'sera', { x: 5.4, z: 34.8, facing: 160 }, { build: { age: 'child' } }),
  narrate('Saltmarrow is where the Beck gives\nup and joins the sea. A tide-mill\nturns. Gulls shout about nothing.'),
  narrate('Two girls are already arguing on\nthe quay, and one of them is\nwinning by being louder.'),
  face('hero', 'willow'),
  say('willow', 'Right then. You’re new.\nCan you throw?'),
  say('willow', 'Never mind. I started it and\nI’ll finish it. Hold this.'),
  flag('ch1.met_willow'),
  face('hero', 'sera'),
  say('sera', 'I’m sorry — she does this.\nI’m Sera. I’m not supposed to be\nout here.'),
  say('sera', 'You have hay on your shoulder and\nyour father is the largest man I\nhave ever seen.'),
  say('sera', 'I’m sorry, that was rude of me.'),
  flag('ch1.met_sera'),
  say('willow', 'Come ON. The inn does soup and\nmy dad won’t charge you for\nlooking at it.'),
  narrate('%HERO% sleeps at the Contented\nHerring, under a window full of\nboats, and dreams of nothing.'),
  sfx('inn'),
  camera.follow(),
];

// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
// B5 — Saltmarrow at dusk. Mischief: the first time you deliberately do not tell your father something.
// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
const b5 = () => [
  music('tension'),
  spawn('willow', 'willow', { x: 2.2, z: 34.4, facing: 200 }, { build: { age: 'child' } }),
  spawn('sera', 'sera', { x: 5.2, z: 34.6, facing: 170 }, { build: { age: 'child' } }),
  narrate('Five people in Saltmarrow tell\n%HERO% about Cobwell Manor, up in\nthe Whispering Wood.'),
  narrate('It is empty. It is full. It burned\ndown. It has a ghost who is very\nparticular about dust.'),
  narrate('A poster on the quay wall: one\nginger kitten, lost, answers to\nnothing whatsoever.'),
  face('hero', 'willow'),
  say('willow', 'Right then. Tonight.\nYou, me, and that house.'),
  say('willow', 'Unless you’d rather stay here and\nbe six.'),
  say('sera', 'I’m coming.'),
  say('willow', 'You are NOT.'),
  say('sera', 'I have a lantern, a clean\nhandkerchief and nobody who knows\nwhere I am. I’m coming.'),
  say('willow', '...Right then.'),
  flag('ch1.dare_taken'),
  narrate('{gold}Cobwell Manor, after dark.\nWillow dared you.{/gold}'),
  camera.follow(),
];

// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
// B6 — Cobwell Manor. Fear beaten TOGETHER. This is the memory the whole game is built on.
// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
const b6 = () => [
  fade('out', { ms: 520 }),
  card('Cobwell Manor', 'in the Whispering Wood'),
  music('dungeon'),
  fade('in', { ms: 620 }),
  spawn('willow', 'willow', { x: 2.4, z: 34.2, facing: 190 }, { build: { age: 'child' } }),
  spawn('sera', 'sera', { x: 5.0, z: 34.4, facing: 170 }, { build: { age: 'child' } }),
  narrate('Three children and one Gloop, in a\nhouse with three floors, a belfry\nand no adults at all.'),
  say('willow', 'Candle. You carry it.\nYou’re the one with two hands and\nno opinions.'),
  give('candle'),
  narrate('%HERO% received the {gold}Candle{/gold}.'),
  say('sera', 'There are three music boxes.\nThey play the same tune.\nI think the house is humming.'),
  battle({ area: 'cobwell_manor' }),
  narrate('In the nursery, in a hatbox, a\nginger kitten with two very small\nsabre teeth and a brass bell.'),
  say('pip', 'Mrrp.\n(I have been abandoned\nfor nine hours.)'),
  joinParty('pip'),
  narrate('{gold}%PIP%{/gold} joined the party!'),
  // ── the Long Stair, in the dark: the ribbon. Everything in this game hangs off this thirty seconds. ──
  fade('out', { ms: 420 }),
  music('family'),
  fade('in', { ms: 700 }),
  narrate('On the Long Stair a draught comes\nup from somewhere and puts the\ncandle out.'),
  wait(700),
  say('willow', 'Don’t move.'),
  wait(500),
  narrate('Something is pulled tight round\n%HERO%’s left wrist in the dark,\nand knotted twice.'),
  say('willow', 'It’s half my ribbon.\nNow the dark knows you belong\nto somebody. Come ON.'),
  flag('ch1.ribbon'),
  sfx('item_get'),
  narrate('%HERO% is wearing\n{gold}Willow’s Ribbon{/gold}.'),
  camera.shot({ from: 'hero', to: { x: 3.0, y: 1.0, z: 33.6 }, lookAt: 'hero', duration: 2.2, hold: false }),
  // ── the belfry ──
  music('boss'),
  narrate('In the belfry something very old\nand very cross unfolds itself out\nof the bell rope.'),
  battle({ area: 'cobwell_manor', boss: true }),
  music('victory'),
  spawn('nettle', 'villager:granny', { x: 3.6, z: 34.0, facing: 180 }),
  say('nettle', 'DUST. On the dado rail.\nIn MY day a spectre had dado\nrails you could EAT off.'),
  say('nettle', 'You have tidied my house, you\nfrightful small people. Take\nsomething and go to bed.'),
  give('herb', 3),
  flag('ch1.manor_cleared'),
  narrate('{gold}Cobwell Manor is quiet again.{/gold}'),
  despawn('nettle'), despawn('willow'), despawn('sera'),
  camera.follow(),
];

// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
// B7 — Saltmarrow harbour, morning. The first loss, and it is a small one.
// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
const b7 = () => [
  music('family'),
  spawn('willow', 'willow', { x: 2.2, z: 34.4, facing: 220 }, { build: { age: 'child' } }),
  spawn('sera', 'sera', { x: 5.4, z: 34.6, facing: 170 }, { build: { age: 'child' } }),
  narrate('The quay in the morning smells of\nrope and cold fish, and both girls\nare being very brave about it.'),
  face('hero', 'sera'),
  say('sera', 'My carriage is here.\nThank you for the house.\nI shall write, and you shan’t read it.'),
  say('sera', 'I’m sorry, that was rude of me.'),
  despawn('sera'),
  face('hero', 'willow'),
  say('willow', 'Forty-one crates.\nForty-two. Forty-three.'),
  say('willow', 'Go on then. Your dad’s whistling\nand he only does that when\nhe’s waiting.'),
  narrate('Willow counts crates on the quay\nand does not look up.\nThere are nine crates.'),
  flag('ch1.farewell'),
  despawn('willow'),
  camera.follow(),
];

// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
// B8 — Coddleston Castle and the moor. Dread arriving inside something warm and gold-lit.
// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
const b8 = () => [
  music('castle'),
  narrate('Half the Coppermill Pass is lying\nin the road. Papa looks at it the\nway you look at furniture.'),
  spawn('halvard', 'halvard', { x: 3.0, z: 34.4, facing: 190 }),
  say('halvard', 'Bit of a spot of bother.\nStand back, lad. Mind your toes.'),
  shake({ ms: 620, strength: 16 }),
  sfx('rock_slide'),
  flag('ch1.pass_open'),
  narrate('Coddleston Castle has four green\ncopper spires and one extremely\nimportant eight-year-old.'),
  spawn('bertie', 'villager:child', { x: 5.2, z: 34.6, facing: 170 }),
  say('bertie', 'We are Adalbert Rufus Cornelius of\nCoddleston, and it is our birthday,\nand we are BORED.'),
  say('bertie', 'Your father is enormous.\nWe shall hire him. We have decided\nthis in the last four seconds.'),
  say('halvard', 'Bodyguard, is it.\nVery good, Your Highness.\nEat something first, if you would.'),
  despawn('bertie'),
  fade('out', { ms: 560 }),
  card('Coddleston Moor', 'after the birthday'),
  music('tension'),
  fade('in', { ms: 620 }),
  narrate('On the moor the road is grey and\nthe grass is grey and there are\nsix people standing in it.'),
  spawn('quietling', 'villager:nun', { x: 4.2, z: 34.8, facing: 180 }),
  say('quietling', 'Gently now.\nNobody needs to shout.'),
  sfx('monster_cry'),
  narrate('The grey-masked people take the\nprince off the road between them,\nwithout hurrying at all.'),
  flag('ch1.bertie_taken'),
  say('halvard', 'Up on my back, lad.\nHold the ribbon hand tight.\nWe are going to run.'),
  despawn('quietling'),
  narrate('{gold}Stay with Papa.{/gold}'),
  camera.follow(),
];

// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
// B9 — the Grey Ruins. THROAT-TIGHTENER #1. The floor of the world goes.
//
// CANON §10 rule 3: every scripted loss SAYS it is scripted, plainly, so no child thinks they failed. There is no
// fight here on purpose — STORY-BIBLE T1 shows the boy watching, not the death.
// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
const b9 = () => [
  fade('out', { ms: 620 }),
  card('The Grey Ruins', 'on Coddleston Moor'),
  music('overworld'),
  fade('in', { ms: 700 }),
  spawn('halvard', 'halvard', { x: 3.4, z: 34.8, facing: 185 }),
  narrate('Papa has beaten forty of the grey\npeople. He is on one knee,\nbreathing like a bellows, winning.'),
  camera.shot({ from: { x: 3.4, y: 0.45, z: 30.6 }, lookAt: 'halvard', duration: 2.6, fov: 38 }),
  spawn('mortmain', 'villager:nun', { x: 1.6, z: 35.6, facing: 165 }),
  music('silence'),
  say('mortmain', 'There now. Put it down, child.\nYou have a boy in each hand\nand so have I.'),
  wait(900),
  narrate('{gold}You can’t reach him.{/gold}\nHold as many buttons as you like.\nThis one is not yours to win.'),
  wait(700),
  say('halvard', 'Look at the sky, lad.\nNot at me. It’s a very good sky\ntonight, if you would.'),
  camera.shot({ from: { x: 3.0, y: 1.05, z: 33.0 }, lookAt: 'hero', duration: 4.0, fov: 34 }),
  narrate('%HERO% looks up.\nHe holds his own left wrist,\nwhere the ribbon is knotted twice.'),
  wait(1200),
  sfx('spell_cast'),
  shake({ ms: 900, strength: 14 }),
  wait(900),
  say('mortmain', 'Gently. There.\nNow nothing can ever be lost.'),
  wait(600),
  narrate('The stone will not hold him.\nPapa does not stop fighting inside\nit, and then Papa is not there.'),
  wait(900),
  say('mortmain', 'Oh. Oh, child.\nIn forty years nobody has ever\nrefused to be kept.'),
  music('family'),
  narrate('Something small and ginger bolts\npast %HERO%’s ankles and into\nthe dark, bell and all.'),
  flag('party.pip', false),
  wait(800),
  fade('out', { ms: 1400 }),
  sfx('door_close'),
  flag('ch1.halvard_fallen'),
  flag('ch2.start'),
  card('Ten years pass.', null, { ms: 3000 }),
  despawn('mortmain'), despawn('halvard'),
  camera.follow(),
  fade('in', { ms: 900 }),
  narrate('{gold}Act II — the Quiet Quarry.{/gold}\nThe rest of the road is being\nbuilt. Your story is kept safe.'),
];

// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
// THE BEAT TABLE — where each one plays, and what has to have happened first
// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
export const BEATS = [
  { id: 'b1', beat: 'B1', at: 'hollybank', needs: [], blocks: ['ch1.awake'], steps: b1, name: 'The cottage at Puddlewick' },
  { id: 'b2', beat: 'B2', at: 'puddlewick', zone: { x: 14.8, z: 23.4, r: 3.6 }, needs: ['ch1.awake'], blocks: ['ch1.left_home'], steps: b2, name: 'Out to the lane' },
  { id: 'b3', beat: 'B3', at: 'meadow', zone: ROAD.zone, needs: ['ch1.left_home'], blocks: ['party.bobble'], steps: b3, name: 'The Long Lane' },
  { id: 'b4', beat: 'B4', at: 'saltmarrow', needs: ['party.bobble'], blocks: ['ch1.met_willow'], steps: b4, name: 'Saltmarrow' },
  { id: 'b5', beat: 'B5', at: 'saltmarrow', needs: ['ch1.met_willow'], blocks: ['ch1.dare_taken'], steps: b5, name: 'Willow’s dare' },
  { id: 'b6', beat: 'B6', at: 'cobwell_manor', needs: ['ch1.dare_taken'], blocks: ['ch1.manor_cleared'], steps: b6, name: 'Cobwell Manor' },
  { id: 'b7', beat: 'B7', at: 'saltmarrow', needs: ['ch1.manor_cleared'], blocks: ['ch1.farewell'], steps: b7, name: 'Goodbyes' },
  { id: 'b8', beat: 'B8', at: 'coddleston', needs: ['ch1.farewell'], blocks: ['ch1.bertie_taken'], steps: b8, name: 'The prince’s birthday' },
  { id: 'b9', beat: 'B9', at: 'grey_ruins', needs: ['ch1.bertie_taken'], blocks: ['ch1.halvard_fallen'], steps: b9, name: 'The Grey Ruins' },
];

/** Where a beat plays TODAY: its own map when P23 has built it, the Long Lane signpost when it has not. */
export function placeOf(b) {
  if (has(b.at)) return { map: b.at, zone: b.zone || null, journey: false };
  return { map: ROAD.at, zone: ROAD.zone, journey: true };
}

function ready(b) {
  for (const n of b.blocks) if (Flags.has(n)) return false;
  for (const n of b.needs) if (!Flags.has(n)) return false;
  return true;
}

/** The next Act I beat a child could reach, or null when the Act is done. */
export function nextBeat() { return BEATS.find(ready) || null; }

// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
const S = { installed: false, map: null, cool: 0, poll: 0, armed: true };

async function playBeat(b) {
  const place = placeOf(b);
  const steps = [];
  if (place.journey) {
    // the beat's own map is not built yet: go there by road, and come back to the lane afterwards
    steps.push(fade('out', { ms: 520 }));
    steps.push(card(Quests.placeName(b.at) || b.name, 'the road takes you there'));
    steps.push(fade('in', { ms: 620 }));
  }
  steps.push(...b.steps());
  if (place.journey) {
    steps.push(fade('out', { ms: 520 }));
    steps.push(card('Puddlewick Vale', 'and the road home'));
    steps.push(fade('in', { ms: 620 }));
  }
  return Story.play(steps, { id: b.id, name: b.name });
}

export const Chapter1 = {
  BEATS, nextBeat, placeOf,

  /** Play one beat by id, wherever you are (demos, critics, and a child who saved mid-beat). */
  play(id) {
    const b = BEATS.find((x) => x.id === id || x.beat === id);
    if (!b) return Promise.resolve({ ok: false, reason: `no Act I beat "${id}"`, beats: BEATS.map((x) => x.id) });
    return playBeat(b);
  },

  /** Every beat in order, back to back — the whole Act as one sitting (used by demos/P26.html and the harness). */
  async playAll(from = 0) {
    const out = [];
    for (let i = Math.max(0, from | 0); i < BEATS.length; i++) {
      out.push(await playBeat(BEATS[i]));
    }
    return { ok: true, played: out.length, beats: out };
  },

  state() {
    const n = nextBeat();
    return {
      act: 1, beats: BEATS.length,
      done: BEATS.filter((b) => b.blocks.some((f) => Flags.has(f))).map((b) => b.id),
      next: n ? { id: n.id, beat: n.beat, name: n.name, where: placeOf(n) } : null,
      built: BEATS.map((b) => b.at).filter((m, i, a) => a.indexOf(m) === i).filter(has),
      missing: BEATS.map((b) => b.at).filter((m, i, a) => a.indexOf(m) === i).filter((m) => !has(m)),
      on: S.map,
    };
  },

  install(ctx = {}) {
    if (S.installed) return Chapter1;
    S.installed = true;
    const D = ctx.Debug || null;

    Story.registerAll(Object.fromEntries(BEATS.map((b) => [b.id, b.steps])));

    /**
     * One beat per arrival. After a scene ends you are standing exactly where it started, so a zone has to be
     * LEFT before it fires again — otherwise walking to the signpost once would play the rest of the Act at you
     * in a single ten-minute sitting.
     */
    const tryHere = () => {
      if (!Story.auto || Story.running()) return;
      const b = nextBeat();
      if (!b) { S.armed = true; return; }
      const place = placeOf(b);
      if (place.map !== S.map) { S.armed = true; return; }
      if (place.zone) {
        const p = Field.player();
        if (!p) return;
        const d = Math.hypot(p.x - place.zone.x, p.z - place.zone.z);
        if (d > place.zone.r * 1.6) S.armed = true;             // walked away: the spot is live again
        if (d > place.zone.r || !S.armed) return;
      } else if (!S.armed) return;
      S.armed = false;
      playBeat(b).catch((e) => reportError(`Act I ${b.id}`, e));
    };

    Bus.on('map.enter', (m) => {
      S.map = (m && m.id) || null;
      S.armed = true;                                    // a new map is always a fresh arrival
      S.cool = 40;                                       // let the map settle (and the place card land) first
    });
    try {
      Field.on('update', () => {
        if (S.cool > 0) { S.cool--; if (S.cool === 0) tryHere(); return; }
        if (++S.poll < 12) return;                       // five times a second is plenty for a doorway
        S.poll = 0;
        tryHere();
      });
    } catch (e) { reportError('Act I triggers', e); }

    if (D) {
      D.provide('act1', () => Chapter1.state());
      /** __DQ.beat('b6') — play one Act I beat; __DQ.beat() lists them and says where the next one is. */
      D.expose('beat', (id) => (id === undefined ? Chapter1.state() : Chapter1.play(id)));
      /** __DQ.act1() — play Act I from the beginning, beat after beat (about ten minutes). */
      D.expose('act1', (from) => Chapter1.playAll(from));
    }
    return Chapter1;
  },
};

export default Chapter1;
