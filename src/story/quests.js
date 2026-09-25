/**
 * quests.js — "where do I go next", in one sentence a six-year-old can read.     (P26, owner: src/story/quests.js)
 *
 * CLARITY is a rubric dimension of its own: *a six-year-old always knows where to go*. This file is the single
 * place that answers it. One entry per CANON §4 beat: what you are doing, where, and the flag that finishes it.
 *
 *   Quests.install(ctx)     Debug.provide('quest'), Debug.expose('quests'), Bus 'quest.change'
 *   Quests.current()        -> {id, beat, act, title, hint, map, mapName, done} | null     THE HUD RIBBON
 *   Quests.hint()           -> the one sentence (a string), or null
 *   Quests.log()            -> {act, current, done: [...], todo: [...]}   the quest log window
 *   Quests.done(id)         -> bool          Quests.find(id) -> entry
 *   Quests.refresh()        recompute now (the flag watcher does this for you)
 *
 * THE RULES the words follow (CANON §10):
 *   6. the ribbon never names a place the player has not heard said aloud;
 *   4. every "why can't I?" gets one sentence;
 *   and a hint is an INSTRUCTION, never a riddle: a verb, a place, a full stop.
 */
import { Bus } from '../engine/events.js';
import { Debug, reportError } from '../engine/debug.js';
import { Flags } from './flags.js';

const T = (n) => Flags.has(n);

/**
 * The quest table, in beat order. The FIRST entry whose `when` is true and whose `until` flag is not yet set wins.
 *   beat   CANON §4 beat id            map   where the next thing is (a CANON §2 id, or null for "wherever you are")
 *   until  the flag that finishes it   when   optional extra gate (defaults to "the previous beat is done")
 */
export const QUESTS = [
  // ── ACT I ──────────────────────────────────────────────────────────────────────────────────────────────────
  { id: 'wake', beat: 'B1', act: 1, map: 'hollybank', title: 'Papa’s boots',
    hint: 'Go home to Hollybank Cottage and take Papa his boots.', until: 'ch1.awake',
    // A SIX-YEAR-OLD IS NEVER TOLD TO GO SOMEWHERE THEY CANNOT SEE. The one sentence changes with where the child
    // is actually standing, so it is always the very next door, not the end of the errand.
    hintOn: { hollybank: 'Take Papa his boots. Search things on the way.',
      meadow: 'Walk up the lane into Puddlewick. Home is the cottage on the green.',
      puddlewick: 'Home is Hollybank Cottage, the door on the green. Papa wants his boots.',
      puddlewick_inn: 'Out of the inn, then home to Hollybank Cottage.' } },
  { id: 'village', beat: 'B2', act: 1, map: 'puddlewick', title: 'Out to the lane',
    hint: 'Say goodbye round the village, then find Papa at the lane.', until: 'ch1.left_home',
    hintOn: { hollybank: 'Out of the door and round the village, then out to the lane.',
      meadow: 'Papa is waiting at the lane out of Puddlewick. Back up the path.' } },
  { id: 'lane', beat: 'B3', act: 1, map: 'meadow', title: 'The Long Lane',
    hint: 'Follow the Long Lane south. Papa is right behind you.', until: 'party.bobble',
    hintOn: { puddlewick: 'Keep walking down the dirt path past the gate sign — out of the village.',
      meadow: 'South along the lane to the signpost that says The Long Lane.' } },
  { id: 'friends', beat: 'B4', act: 1, map: 'saltmarrow', title: 'Down to the water',
    hint: 'Take the lane to Saltmarrow, where the Beck meets the tide.', until: 'ch1.met_willow' },
  { id: 'dare', beat: 'B5', act: 1, map: 'saltmarrow', title: 'Willow’s dare',
    hint: 'Ask round Saltmarrow about the old manor in the wood.', until: 'ch1.dare_taken' },
  { id: 'manor', beat: 'B6', act: 1, map: 'cobwell_manor', title: 'Cobwell Manor',
    hint: 'Cobwell Manor, after dark. Willow dared you.', until: 'ch1.manor_cleared' },
  { id: 'farewell', beat: 'B7', act: 1, map: 'saltmarrow', title: 'Goodbyes',
    hint: 'Say goodbye on the quay, then back to Papa’s wagon.', until: 'ch1.farewell' },
  { id: 'castle', beat: 'B8', act: 1, map: 'coddleston', title: 'The prince’s birthday',
    hint: 'Papa is wanted at Coddleston Castle. Ride with him.', until: 'ch1.bertie_taken' },
  { id: 'ruins', beat: 'B9', act: 1, map: 'grey_ruins', title: 'After Bertie',
    hint: 'Papa has gone after Bertie. Stay with Papa.', until: 'ch1.halvard_fallen' },
  // ── ACT II ─────────────────────────────────────────────────────────────────────────────────────────────────
  { id: 'quarry', beat: 'B10', act: 2, map: 'quiet_quarry', title: 'Ten years of chores',
    hint: 'Do your chores. Keep watching for a way out.', until: 'ch2.quarry_escape' },
  { id: 'caves', beat: 'B11', act: 2, map: 'whistling_caves', title: 'Out through the wind',
    hint: 'Follow the wind out of the caves.', until: 'party.bobble_return' },
  { id: 'sunmane', beat: 'B11b', act: 2, map: 'gogglestone_caves', title: 'The golden beast',
    hint: 'Puddlewick is frightened of the caves. Go and look.', until: 'ch2.pip_return' },
  { id: 'home', beat: 'B12', act: 2, map: 'hollybank', title: 'Home',
    hint: 'Go home to Hollybank. Somebody kept the fire in.', until: 'ch2.barty_join' },
  { id: 'inn', beat: 'B13', act: 2, map: 'saltmarrow', title: 'The Contented Herring',
    hint: 'Willow runs her father’s inn now. Call in.', until: 'ch2.willow_grown' },
  { id: 'hall', beat: 'B14', act: 2, map: 'marbleford', title: 'Fairweather Hall',
    hint: 'Take the packet boat to Marbleford and ask for Sera.', until: 'ch2.pearl_quest' },
  { id: 'pearl', beat: 'B15', act: 2, map: 'sighing_grotto', title: 'The Tide Pearl',
    hint: 'The pearl is in the sea-cave under the cliffs.', until: 'ch2.pearl' },
  { id: 'bride', beat: 'B16', act: 2, map: 'fairweather_hall', title: 'The choice',
    hint: 'Go back to Fairweather Hall. It is time to choose.', until: 'ch2.bride' },
  { id: 'wedding', beat: 'B17', act: 2, map: 'marbleford_chapel', title: 'The wedding',
    hint: 'To the chapel. Everybody is waiting.', until: 'ch2.married' },
  { id: 'crown', beat: 'B18', act: 2, map: 'ambergarde', title: 'Ambergarde',
    hint: 'The crest fits a door on a green headland. Go and see.', until: 'ch2.ambergarde' },
  { id: 'coronation', beat: 'B19', act: 2, map: 'ambergarde_keep', title: 'The coronation',
    hint: 'The keep is ready for you.', until: 'ch2.petrified' },
  // ── ACT III ────────────────────────────────────────────────────────────────────────────────────────────────
  { id: 'chip', beat: 'B20', act: 3, map: 'stone_garden', title: 'Chip Papa free',
    hint: 'Hit the stone. Keep hitting it.', until: 'ch3.awake' },
  { id: 'sword', beat: 'B21', act: 3, map: 'ambergarde_keep', title: 'The sword in the stone',
    hint: 'The sword in the stone at Ambergarde Keep. Let Rowan try.', until: 'ch3.sword_drawn' },
  { id: 'world', beat: 'B22', act: 3, map: null, title: 'Old friends, cold places',
    hint: 'Take the wagon anywhere. Old friends first.', until: 'ch3.shield' },
  { id: 'stair', beat: 'B23', act: 3, map: 'bellhollow_abbey', title: 'The Cloud Stair',
    hint: 'Stand under the empty bell frame holding the sword.', until: 'ch3.sunlark' },
  { id: 'abbey', beat: 'B24', act: 3, map: 'whistfell_abbey', title: 'Over the whirlpool',
    hint: 'Fly over the Gullet. Find the one lit lantern.', until: 'ch3.elowen' },
  { id: 'deep', beat: 'B25', act: 3, map: 'quiet_deep', title: 'The Quiet Deep',
    hint: 'Down, under everything. Finish it.', until: 'ch3.malgrim_fallen' },
  { id: 'garden', beat: 'B26', act: 3, map: 'stone_garden', title: 'Everybody wakes',
    hint: 'Take Mum to the Stone Garden.', until: 'ch3.spouse_freed' },
  { id: 'home_again', beat: 'B27', act: 3, map: 'ambergarde_keep', title: 'Going home',
    hint: 'Go home. All of you.', until: 'game.cleared' },
];

/** Places the player has heard said aloud by the time each quest is live (CANON §10 rule 6). */
const PLACE_NAMES = {
  hollybank: 'Hollybank Cottage', puddlewick: 'Puddlewick', meadow: 'Puddlewick Vale', aldenmoor: 'the Long Lane',
  saltmarrow: 'Saltmarrow', contented_herring: 'the Contented Herring', cobwell_manor: 'Cobwell Manor',
  coddleston: 'Coddleston Castle', grey_ruins: 'the Grey Ruins', quiet_quarry: 'the Quiet Quarry',
  whistling_caves: 'the Whistling Caves', gogglestone_caves: 'Gogglestone Caves', parchmouth: 'Parchmouth',
  port_pelican: 'Port Pelican', marbleford: 'Marbleford', fairweather_hall: 'Fairweather Hall',
  marbleford_chapel: 'Marbleford Chapel', sighing_grotto: 'the Sighing Grotto', ambergarde: 'Ambergarde',
  ambergarde_keep: 'Ambergarde Keep', stone_garden: 'the Stone Garden', bellhollow_abbey: 'Bellhollow Abbey',
  highfeather: 'Highfeather', whistfell_abbey: 'Whistfell Abbey', quiet_deep: 'the Quiet Deep',
  coldcomfort: 'Coldcomfort', glasswing_grotto: 'the Glasswing Grotto', quaggerton: 'Quaggerton',
  puddlewick_inn: 'the Puddlewick inn',
};

/**
 * A door the player cannot walk through yet always gets ONE sentence saying why (CANON §10 rule 4). The story
 * hands these to whoever asks; a map's exit that is not built yet can borrow one.
 */
export const WHY_NOT = {
  'ch2.wagon': 'Monsters have nowhere to ride until Papa’s wagon is mended.',
  'ch2.sword_failed': 'It isn’t yours to carry, lad. It’s yours to pass on.',
  'ch3.cloudstair': 'The stair only comes down for the Larksteel Sword.',
};

const S = { current: null, installed: false, off: null, map: null };

function pick() {
  const act = Flags.act();
  for (const q of QUESTS) {
    if (q.act > act) break;                              // a later Act's business is not yours yet
    if (q.act < act) continue;                            // …and an earlier Act's business is over: the story moved
    if (T(q.until)) continue;                            // already finished
    if (typeof q.when === 'function' && !q.when(Flags)) continue;
    return q;
  }
  return null;
}

/** The sentence for where the child is standing right now, falling back to the beat's own. */
function hintOf(q) {
  if (!q) return null;
  if (q.hintOn && S.map && q.hintOn[S.map]) return q.hintOn[S.map];
  return q.hint;
}

function entryOut(q) {
  if (!q) return null;
  return {
    id: q.id, beat: q.beat, act: q.act, title: q.title, hint: hintOf(q),
    map: q.map || null, mapName: q.map ? (PLACE_NAMES[q.map] || q.map) : null,
    until: q.until, done: false, here: S.map || null,
  };
}

export const Quests = {
  QUESTS, WHY_NOT, PLACE_NAMES,

  current() { return entryOut(S.current || pick()); },
  hint() { return hintOf(S.current || pick()); },
  find(id) { return QUESTS.find((q) => q.id === id) || null; },
  done(id) { const q = Quests.find(id); return !!(q && T(q.until)); },
  placeName(mapId) { return PLACE_NAMES[mapId] || null; },
  whyNot(flag) { return WHY_NOT[flag] || null; },

  log() {
    const act = Flags.act();
    const cur = S.current || pick();
    const mine = QUESTS.filter((q) => q.act <= act);
    return {
      act, current: entryOut(cur),
      done: mine.filter((q) => T(q.until)).map((q) => ({ id: q.id, beat: q.beat, title: q.title })),
      todo: mine.filter((q) => !T(q.until) && q !== cur && q.act >= act).map((q) => ({ id: q.id, beat: q.beat, title: q.title })),
      of: QUESTS.length,
    };
  },

  refresh() {
    const next = pick();
    const before = S.current;
    S.current = next;
    if ((before && before.id) !== (next && next.id)) {
      try { Bus.emit('quest.change', { from: before ? before.id : null, quest: entryOut(next) }); } catch (e) { reportError('quest.change', e); }
    }
    return Quests.current();
  },

  describe() {
    const q = Quests.current();
    return Object.assign({ hint: q ? q.hint : null, progress: Quests.log().done.length + '/' + QUESTS.length }, q || {});
  },

  install(ctx = {}) {
    if (S.installed) return Quests;
    S.installed = true;
    const D = ctx.Debug || Debug;
    const Bs = ctx.Bus || Bus;

    S.off = Flags.on('*', () => { try { Quests.refresh(); } catch (e) { reportError('quests refresh', e); } });
    // the ribbon re-reads itself on arrival too, because the sentence depends on which door you are next to
    Bs.on('map.enter', (m) => {
      S.map = m && m.id;
      try { Bus.emit('quest.change', { from: S.current ? S.current.id : null, quest: Quests.current() }); }
      catch (e) { reportError('quest.change map', e); }
    });
    Quests.refresh();

    // The HUD, the menu and a critic all read the same one sentence.
    D.provide('quest', () => Quests.describe());
    D.expose('quests', (what) => (what === 'log' ? Quests.log() : Quests.describe()));
    return Quests;
  },
};

export default Quests;
