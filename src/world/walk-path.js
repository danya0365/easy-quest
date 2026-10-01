/**
 * walk-path.js — the pathfinder, on its own. (P25, from src/story/script.js — see git for the beat that moved it)
 *
 * IT IS HERE BECAUSE A SECOND KIND OF BODY NEEDS IT. Until now the only thing that walked itself across a room was
 * the hero, and only ever inside a beat. Then Papa had to cross one — "I shall walk on to the lane" — and the people
 * layer's `stepTo` steers STRAIGHT at a target, because everybody who uses it is a wanderer with an anchor and a
 * fresh spot to try whenever a wall beats them. A beat's walk has no somewhere else: it gave up two units from the
 * door and reported that it had arrived, which is how a father ended up still standing beside his chair.
 *
 * So both walk the same route. Nothing here knows about the hero, about stages, or about dialogue.
 */
import { reportError } from '../engine/debug.js';

const guard = (where, fn, fb) => { try { return fn(); } catch (e) { reportError(where, e); return fb; } };

/**
 * WALKING THERE, NOT STRAIGHT AT IT. `move('hero', …)` used to steer the boy straight at the mark. In a cottage that
 * works until the mark is up a loft: the cottage stair and the loft rail are solid, so he ran into them, ground to a
 * halt against a wall for the length of the step's timeout, and the timeout branch then TELEPORTED him onto the loft
 * (that `pl.place()` in tickHero). So the beat "worked" — he arrived, he searched the chest, the story read on — while
 * the only thing that had moved him was a position assignment. He also does this on every bridge, stair, ledge and
 * doorframe in Act II, and there the teleport lands him on the wrong side of a rail.
 *
 * So a scripted walk is planned, not steered: a grid A* over the same collision data the player's own controller uses
 * (GameMap._deepest, the very function `m.move` calls), so a route the pathfinder finds is a route he can physically
 * walk. Two things make it work where a plain A* would not:
 *
 *   · HEIGHT. A cell is only a neighbour if the floor under it is within STEP_UP of the floor he is standing on. The
 *     stair rises 0.144 a tread, so the route to the chest goes up it one tread at a time; the loft edge beside it is
 *     1.15 up and is simply never offered as a step. Without this the search walks straight off the edge of the loft.
 *   · FURNITURE IS NOT A DOOR. The chest, the bed and the dresser are solid, and the boy's mark is a tile BESIDE them
 *     — so the goal is "reachable" and the search stops on the tile next to it, not on top of it.
 *
 * Costs are in units, and the heuristic is straight-line to the goal CELL, which never overestimates on a uniform grid.
 * A failed search is not fatal: the caller reports the walk as failed rather than steering blindly into furniture.
 *
 * THE LAST WAYPOINT IS THE STANDING TILE, NOT THE MARK. The route used to end on the mark itself, which for every
 * chest and every table is inside a collider. So the boy was told to walk to a place he could never stand, and the only
 * way the step could end was its clock. That produced the second form of the reported bug — "he walks a loop, back and
 * forth in the cottage, and will not stop" — in two separate shapes:
 *
 *   · HE PACED THE LAST FEW CENTIMETRES. He could get to within a boy's width of a mark he was never allowed to reach, so
 *     `H.stop = 0.22` never fired; he kept closing on it, was pushed back out by `m.move`, closed again, and the
 *     recorded trace oscillated. He overshot his own last waypoint by 0.42 of a unit into the chest to do it.
 *   · HE CIRCLED THE FURNITURE. A waypoint sitting inside a collider made `m.move`'s corner assist steer him AROUND it
 *     to keep the motion legal, past the waypoint, and then back toward it for the next frame. The assist checks only
 *     0.45 ahead, so it never noticed the leg it was contradicting. Measured on one run in three: 8 direction reversals,
 *     two of them on the loft with x swinging 4.70 <-> 2.62 either side of the chest.
 *
 * So the route now ends where he can actually stand, and that endpoint — not the mark — is what the arrival test and the
 * arrival test's radius are read from. He walks to the chest and stops beside it, which is what a player expects to see.
 */
const GRID = 0.25;                            // the search lattice: a quarter unit, so it samples a stair tread twice over
const STEP_UP = 0.5;                          // the biggest floor change he can step over in one stride
const PATH_CAP = 6000;                        // cells examined before a search gives up; a cottage is ~1200

// The 512 is in the key only, to keep a cell key from ever going negative. The INDEX of a world position has no such
// offset — this is a plain `x / GRID`. The first version wrote `Math.round(sx / GRID)` while `cellCentre` subtracted
// 512, so every cell the search looked at sat 256 units west of the boy: the search evaluated a lattice that is not
// the map, found nothing, and returned null. The caller then fell back to steering straight at the mark, which is
// exactly the jam-and-teleport bug the pathfinder was written to remove.
const keyOf = (i, j) => (i + 512) * 1024 + (j + 512);
const cellCentre = (i) => i * GRID + GRID / 2;
const cellIndex = (v) => Math.round(v / GRID);

/** Can the boy stand here at all? This is his own body against the map's colliders — no second opinion. */
function standable(m, x, z, r = DEF_RADIUS) {
  if (!m || typeof m._deepest !== 'function') return false;
  return !guard('path standable', () => m._deepest(x, z, r), true);
}

// A body with no room in the route is a body that walks into furniture and grinds. The search is generous by a
// twentieth of a unit so a body nudged in from a slide is not judged a failure on the frame it arrives — but the route
// must also be walkable by the body the game actually moves, which is PLAYER_RADIUS = 0.35 wide. These are not the
// same number, and planning with the wrong one is how a route comes to exist that he physically cannot follow. The gap
// is 0.02, not the full 0.05, and that is the whole margin: at 0.33 the search walled the boy out of a pocket the game
// itself resolves him out of, and every scene that borrowed a body from the people layer lost its route.
const PLAN_BONUS = 0.02;
const PLAN_RADIUS = 0.3;

/**
 * AND THE BODY IS A PARAMETER, BECAUSE THE SECOND BODY IS BIGGER. The hero is 0.35 across and moves with a 0.3 circle;
 * Papa is 0.42 across (`0.3 * scale 1.08 * girth 1.1`) and moves with the same 0.3 circle, so he is 0.12 wider than
 * the disc that steers him — which means he can be walked into a gap he does not fit and left standing half inside a
 * chair. A path planned for one of them is not a path the other can walk.
 *
 * So the radius is an argument, defaulted to the boy's, and a caller with a fatter body passes its own. Everything
 * inside the search that has to fit a body (`standable` at the lattice, `legFits` along a leg, `goalCell`'s pocket)
 * uses it. Nobody's numbers change: the hero's call passes nothing and gets 0.3 exactly as before.
 */
const DEF_RADIUS = 0.3;
const GOAL_POCKET = 1.0;                        // how far off the mark a tile may be and still count as the destination
const GOAL_PULL = 0.35;                         // what being one tile nearer the mark is worth against a tile of walking
const GOALS = new Set();                         // "i,j" of every tile goalCell has offered as somewhere he can end up

/** Has this search been given somewhere to END, as opposed to a mark to steer at? */
const isGoalPlace = (i, j) => GOALS.has(i + ',' + j);

/** Why the last search gave up, in words. A pathfinder that can only say "no" is a pathfinder you have to re-debug. */
let why = '';

/**
 * The cell a mark resolves to, or null when the mark is nowhere he could stand.
 *
 * A scripted target is usually a mark standing a step OFF a piece of furniture, and the boy is 0.6 wide, so the mark
 * itself is frequently inside a collider. The nearest lattice cell — without the goal guard, the search just refused
 * to plan at all and every step fell back to steering straight at furniture. And the NEAREST cell is not automatically
 * the right one: the chest on the loft has the ground-floor tile directly under it, one lattice step closer, so a plain
 * nearest-cell snap routes him to the foot of the loft and the run ends a storey below where the chest is. So a cell
 * counts as the goal only if it stands on the same floor as the mark, and cells are offered to the search nearest
 * first, so a tile one step sideways but on the right storey beats the tile underneath.
 */
function goalCell(m, tx, tz, radius = DEF_RADIUS) {
  const ti = cellIndex(tx), tj = cellIndex(tz);
  const markY = m.walkY(tx, tz);
  const ring = [];
  for (let di = -3; di <= 3; di++) {
    for (let dj = -3; dj <= 3; dj++) {
      const x = cellCentre(ti + di), z = cellCentre(tj + dj);
      if (!standable(m, x, z, radius)) continue;
      if (Math.abs(m.walkY(x, z) - markY) > STEP_UP) continue;  // the floor above the chest, not the one beneath it
      ring.push({ i: ti + di, j: tj + dj, d: Math.hypot(x - tx, z - tz) });
    }
  }
  if (!ring.length) return null;
  ring.sort((a, b) => a.d - b.d);
  const pocket = ring[0];
  // A mark with a pocket around it gets that pocket as GOAL PLACES, not one cell. The reason is the body: `_deepest`
  // does not stop at a disc, it reports a contact whenever ANY solid cell of the circle's bounding box touches a solid
  // tile, so one 0.5 grid cell to the side can seal a cell the boy would actually be standing clear in. On the loft that
  // sealed the tile right at the chest's foot — the very tile he should end on — and the search then sent him the long
  // way round the whole loft to a corner it could reach. A goal is a place, not a point.
  for (const c of ring) {
    if (c.d - pocket.d > GOAL_POCKET) continue;
    if (!GOALS.has(c.i + ',' + c.j)) { GOALS.add(c.i + ',' + c.j); c.g = true; }
  }
  return pocket;
}

/**
 * A* from (sx,sz) to (tx,tz) on the lattice. Returns a list of {x,z} waypoints (excluding the start), or null.
 * The lattice is offset by a half cell so cell centres land between samples, which stops a start or goal sitting
 * exactly on a boundary; the first waypoint is pulled back to the real start position.
 */
export function findRoute(m, sx, sz, tx, tz, radius = DEF_RADIUS) {
  GOALS.clear();
  const g = goalCell(m, tx, tz, radius);
  if (!g) { why = `no standable cell within 3 of (${tx.toFixed(2)},${tz.toFixed(2)}) on its own floor`; return null; }
  const s = { i: cellIndex(sx), j: cellIndex(sz) };
  // The heuristic aims at the mark, not at the goal cell: the mark is what "near" means to a person reading the
  // route, and no cell of the pocket is further from it than the pocket's own radius. Cheap, and it keeps the
  // pocket from being a lump of equal-cost cells the search wanders through on the way in.
  const heur = (i, j) => Math.hypot(cellCentre(i) - tx, cellCentre(j) - tz);
  const open = [{ i: s.i, j: s.j, f: heur(s.i, s.j) }];
  const came = new Map();                                       // key -> {i,j} it was reached from
  const gScore = new Map([[keyOf(s.i, s.j), 0]]);
  const done = new Set();
  // `best`/`bestH` track the CLOSEST cell seen — for the "never got there" message. `goal`/`goalS` track the cheapest
  // POCKET cell — for the ending. One variable cannot do both jobs: `bestH` holds a plain distance, which a goal score
  // carrying a whole route's worth of units can never beat, so seeding it as the search went killed every route.
  let seen = 0, best = null, bestH = Infinity, goal = null, goalS = Infinity;

  while (open.length && seen < PATH_CAP) {
    // the open list is a handful of cells in practice; scanning it is cheaper than a heap and cannot go stale
    let bi = 0;
    for (let k = 1; k < open.length; k++) if (open[k].f < open[bi].f) bi = k;
    const cur = open.splice(bi, 1)[0];
    const ck = keyOf(cur.i, cur.j);
    if (done.has(ck)) continue;
    done.add(ck);
    seen++;

    // A GOAL PLACE, not a goal cell — and not the first one the search stumbles into either. The pocket is a slab of
    // cells all "next to the chest", so breaking on the first one he reaches ends the walk wherever his approach
    // happened to brush it: on the loft, 0.8 of a unit short of the chest, in the corner, after the long way round.
    //
    // So every goal cell the search visits is kept, and the one it ends at is the cheapest by `cost + pull`:
    //
    //   cost  walking there, in units
    //   pull  GOAL_PULL times how far off the mark it leaves him
    //
    // The pull is what keeps the walk honest and the pocket from becoming a corridor. Prefer the plain NEAREST tile
    // to the mark instead and the loft sends him round the far side of the BED to reach a tile half a unit closer to
    // the chest than the one he already had — the search reports the shortest route it can see, and the player
    // watches the boy take a detour round the furniture. A tile's width of walking is worth 0.35, so the pull decides
    // between tiles a step apart and never trades a real detour for a stride.
    if (isGoalPlace(cur.i, cur.j)) {
      const c = (gScore.get(ck) ?? Infinity) + GOAL_PULL * heur(cur.i, cur.j);
      if (c < goalS) { goalS = c; goal = cur; }
      // and KEEP GOING. A pocket cell is not a dead end: on the loft the tile one row south of it is the one nearest
      // the chest, and stopping the expansion here walled that off from the search. So the pocket is scored, not
      // entered and abandoned — the closed set still visits each cell once, so this costs the whole floor and not more.
    }
    const h = heur(cur.i, cur.j);
    if (h < bestH) { bestH = h; best = cur; }                     // closest seen so far, only if no pocket cell yet


    const cy = m.walkY(cellCentre(cur.i), cellCentre(cur.j));
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const ni = cur.i + di, nj = cur.j + dj, nk = keyOf(ni, nj);
      if (done.has(nk)) continue;
      const nx = cellCentre(ni), nz = cellCentre(nj);
      if (!standable(m, nx, nz, radius)) continue;
      const ny = m.walkY(nx, nz);
      if (Math.abs(ny - cy) > STEP_UP) continue;                 // a step, or a drop off the edge of the world
      // a DIAGONAL may not cut a corner: both orthogonal tiles beside it have to be open, or he clips the post
      if (di && dj && (!standable(m, cellCentre(cur.i + di), cellCentre(cur.j), radius) || !standable(m, cellCentre(cur.i), cellCentre(cur.j + dj), radius))) continue;
      const step = (di && dj ? Math.SQRT2 : 1) * GRID;
      const ng = gScore.get(ck) + step;
      if (ng >= (gScore.get(nk) ?? Infinity)) continue;
      gScore.set(nk, ng);
      came.set(nk, cur);
      const f = ng + heur(ni, nj);
      const at = open.findIndex((o) => o.i === ni && o.j === nj);
      if (at >= 0) open[at].f = f; else open.push({ i: ni, j: nj, f });
    }
  }
  // A route that stops SHORT is not a route. The first version kept the nearest cell it had seen when the search ran
  // out, so a blocked goal produced a confident walk to the middle of the room; the step then timed out and `place()`
  // moved the boy onto the mark anyway. Both halves of that is the bug that was reported: he does not walk there, he
  // is moved. No route, no fallback teleport — the step simply fails, and the scene can see that it did. `best` now
  // only ever holds a GOAL PLACE, so a search that exhausted the room without reaching the pocket says so.
  if (!goal) {
    why = `gave up after ${seen} cells; never reached a tile beside (${tx.toFixed(2)},${tz.toFixed(2)}), closest was cell (${best ? best.i : '?'},${best ? best.j : '?'})`;
    return null;
  }

  const cells = [];
  for (let c = goal, k = keyOf(goal.i, goal.j); c; c = came.get(k)) { cells.push(c); k = keyOf(c.i, c.j); if (cells.length > PATH_CAP) return null; }
  cells.reverse();
  // Thin the corners: keep a waypoint only when the direction actually changes, so he walks the line, not the zigzag.
  const pts = cells.map((c) => ({ x: cellCentre(c.i), z: cellCentre(c.j) }));
  pts[0] = { x: sx, z: sz };
  // A body does not walk a dead-straight line between two tiles and stay on it. `m.move` resolves him each 0.15 of
  // motion and `tickHero` only turns him, never steers him, so a leg with no clearance in the middle of it ends with
  // him chattering between two legal spots: a third of a walking pace, in place, forever. One tile of leg has to fit
  // the boy's body before a leg is let through — a margin the lattice itself provides, since the search only ever
  // admitted tiles at PLAN_RADIUS.
  const legFits = (a, b) => {
    const len = Math.hypot(b.x - a.x, b.z - a.z);
    const n = Math.max(1, Math.ceil(len / (GRID * 2)));
    for (let k = 1; k < n; k++) {
      const t = k / n;
      if (!standable(m, a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t, radius)) return false;
    }
    return true;
  };
  const out = [];
  for (let k = 1; k < pts.length; k++) {
    const a = out.length ? out[out.length - 1] : pts[k - 1];
    const b = pts[k];
    const isLast = k === pts.length - 1;
    const turn = isLast || Math.abs((b.x - a.x) * (pts[k + 1].z - a.z) - (b.z - a.z) * (pts[k + 1].x - a.x)) > 1e-4;
    if (turn && !isLast && !legFits(a, b)) { if (out.length) out.pop(); continue; }   // walk this leg in two
    if (turn) out.push(b);
  }
  // The last waypoint is the last CELL, never the mark. The mark is inside the chest / the table / the bed, and a
  // waypoint he is being pushed out of every frame is the loop this whole function exists to stop.
  return out.length ? out : null;
}

/** Why the last search gave up, in words. A pathfinder that can only say "no" is a pathfinder you have to re-debug. */
export function pathWhy() { return why; }
export { GRID, PLAN_RADIUS, PLAN_BONUS, DEF_RADIUS, standable };
