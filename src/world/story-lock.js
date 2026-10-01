// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
// One flag, set by the story runner, read by the field.   (P25)
//
// The boy has two owners and they have to be able to say so out loud. When a story beat is running, the field
// must not do anything that changes where he IS — and the biggest offender was the exit pad under the front
// door. B1 walks him there to send his father off, and the pad teleported him out to Puddlewick mid-cutscene:
// the rest of the beat played on the wrong map, `ch1.awake` was never set, and after the scene ended no arrow
// key moved him again (P25).
//
// It could not be fixed by asking `Scenes.top() === 'field'`. A `move` step deliberately takes the field back
// to the top of the stack so the hero's legs are driven by the normal field tick — which is precisely the tick
// that fired the exit. The scene stack is true at the exact moment it must be false.
//
// So it lives here instead: its own module, no imports, no cycle. `story/script.js` sets it around every beat;
// `world/player.js` reads it. Both already import half the tree, and this adds nothing to either.
// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════

let owned = false;

/** True while a story beat has the boy. The field asks before it moves him somewhere on its own. */
export const StoryLock = {
  get owned() { return owned; },
  /** @param {boolean} on */
  set(on) { owned = !!on; },
  /** Run `fn` with the boy held, releasing it whatever happens. */
  async hold(fn) {
    const was = owned;
    owned = true;
    try { return await fn(); } finally { owned = was; }
  },
};

/** The one-liner the field uses. */
export const cutsceneOwnsHero = () => owned;
