// src/battle/ai.js — P14. Monster move choice (with Big-Attack telegraphs), the DQV Tactics, and the party policies.
// Pure logic. Policies:
//   'mash'   — a six-year-old pressing Confirm: every turn, Attack the first monster.
//   'auto'   — the "Fight!" auto-battle and the "Fight Wisely" tactic (SYSTEMS §7.3): never uses items; on the road it
//              never spends MP below half — that half is kept for the boss, and against a boss it spends it (r3).
//   'smart'  — a careful player / helpful parent: heals early, revives, Bolsters on a wind-up, uses items.
//   'mercy'  — "Show No Mercy": every spell it has, heals only when somebody is nearly out.
//   'support'— "Watch My Back": heals at 60%, wakes friends, braces for a Big Attack, fights when nobody needs help.
//   'nomagic'— "Don't Use Magic": swings, and saves every drop.
// A tactic id ('wisely', 'watch_back', …) may be passed in place of a policy name.

import { isUp, targetable, effMaxHp, effAtk, effDef, effMdef, elementMult, spellCost, spellProblem, itemProblem } from './actions.js';
import { BIG_ATTACK_COOLDOWN } from './formulas.js';

// ---------------------------------------------------------------------------------------------------------
// Monsters

function moveUsable(B, e, m) {
  const uses = e.used.get(m.id) || 0;
  if (m.once && uses > 0) return false;
  if (m.maxUses != null && uses >= m.maxUses) return false;
  if (m.when === 'round1' && B.round !== 1) return false;
  if (m.when === 'belowHalf' && e.hp > e.maxHp / 2) return false;
  if (m.when === 'aboveHalf' && e.hp <= e.maxHp / 2) return false;
  if (m.notTwiceRunning && e.lastMove === m.id) return false;
  if (m.big && e.bigCooldown > 0) return false;
  if (m.cooldown && e.cooldowns[m.id] > B.round) return false;
  if (m.kind === 'spell') {
    const s = B.data.spells[m.spell];
    if (!s || e.mp < (s.mp || 0)) return false;
    if ((s.kind === 'heal' || s.kind === 'healAll') && !B.enemies.some((c) => isUp(c) && c.hp < c.maxHp * 0.6)) return false;
  }
  if (m.kind === 'heal') {
    const pool = m.target === 'self' ? [e] : B.enemies.filter(isUp);
    if (!pool.some((c) => c.hp < c.maxHp * (m.below ?? 0.6))) return false;
  }
  if (m.kind === 'summon' && B.enemies.filter(isUp).length >= (B.options.maxEnemies || 6)) return false;
  if (m.kind === 'buff' && m.target === 'self') {
    const spec = [].concat(m.buff)[0];
    const b = e.buffs[spec.stat];
    if (b && spec.step && Math.abs(b.mult - (spec.max ?? 1.5)) < 1e-9) return false;
  }
  if (m.kind === 'purge' && !B.party.some((c) => isUp(c) && Object.values(c.buffs).some((b) => b.mult > 1))) return false;
  if (m.kind === 'steal' && B.gold <= 0) return false;
  return true;
}

function moveWeight(B, e, m) {
  let w = m.weight ?? 1;
  if (m.kind === 'status' && m.status) {
    const pool = B.party.filter(targetable);
    const fresh = pool.filter((c) => !c.status[m.status.id]);
    if (!fresh.length) w *= 0.05;
  }
  if (m.big) {
    // Big Attacks come round about every 4–5 rounds; guaranteed once it has been quiet for 5.
    const since = B.round - (e.lastBigRound ?? 0);
    if (since >= 5) w *= 50;
  }
  if (m.kind === 'heal' || (m.kind === 'spell' && ['heal', 'healAll'].includes((B.data.spells[m.spell] || {}).kind))) w *= 2;
  return w;
}

/**
 * Decide what an enemy does this turn. Returns {move, target?} or {windup: move}.
 * Called at the moment the monster acts (so it never targets someone already down).
 */
export function chooseEnemyAction(B, e) {
  if (e.followUp) {
    const m = e.moves.find((x) => x.id === e.followUp);
    e.followUp = null;
    if (m) return { move: m };
  }
  const usable = e.moves.filter((m) => moveUsable(B, e, m));
  const move = usable.length ? B.rng.weighted(usable, (m) => moveWeight(B, e, m)) : null;
  if (!move) return { move: B.basicAttack };
  if (move.telegraph || move.big) return { windup: move };
  return { move };
}

export function afterEnemyMove(B, e, move) {
  e.lastMove = move.id;
  e.lastMoveObj = move;
  if (move.big) { e.bigCooldown = move.cooldown ?? BIG_ATTACK_COOLDOWN; e.lastBigRound = B.round; }
  else if (move.cooldown) e.cooldowns[move.id] = B.round + move.cooldown;
}

// ---------------------------------------------------------------------------------------------------------
// Party — DQV Tactics
//
// Dragon Quest V gives the hero alone a command menu. Everybody else in the front line fights on their own, the way
// the child has asked them to (the Tactics menu), and "Follow Orders" is a choice you switch on for one member.
// Before this (critic a2r1) every member waited for a command, so a child mashing Enter had Elowen — the best healer
// in the game — hitting Mortmain with her staff while he knocked her out, and pressed Confirm four times a round.

/**
 * The five Tactics (DQV's own), in menu order. `policy` is the chooseAllyAction policy the member plays by; 'orders'
 * waits for a command like the hero. The leader (Bram, or the first family member when Bram is not there) always
 * follows orders.
 */
export const TACTICS = [
  { id: 'no_mercy', name: 'Show No Mercy', short: 'No Mercy', policy: 'mercy',
    blurb: 'goes all out: the biggest spells and every swing.' },
  { id: 'wisely', name: 'Fight Wisely', short: 'Wisely', policy: 'auto',
    blurb: 'fights, heals and wakes friends up, and keeps a little magic back for later.' },
  { id: 'watch_back', name: 'Watch My Back', short: 'Watch Back', policy: 'support',
    blurb: 'looks after everybody first, and only fights when nobody needs help.' },
  { id: 'no_magic', name: "Don't Use Magic", short: 'No Magic', policy: 'nomagic',
    blurb: 'saves every drop of magic and fights with what is in hand.' },
  { id: 'orders', name: 'Follow Orders', short: 'Orders', policy: null,
    blurb: 'waits for you to say what to do, every round.' },
];
export const TACTIC_BY_ID = Object.fromEntries(TACTICS.map((t) => [t.id, t]));
/** What a new member of the party does until the child says otherwise. */
export const DEFAULT_TACTIC = 'wisely';
/** Old saves and tests: `control: 'player'|'ai'` and the policy names are accepted as tactics too. */
const TACTIC_ALIAS = { player: 'orders', ai: 'wisely', auto: 'wisely', mercy: 'no_mercy', support: 'watch_back', nomagic: 'no_magic' };
export function normalizeTactic(t) {
  if (t == null) return null;
  const id = TACTIC_ALIAS[t] || t;
  return TACTIC_BY_ID[id] ? id : null;
}
export function policyForTactic(t) { const x = TACTIC_BY_ID[normalizeTactic(t) || DEFAULT_TACTIC]; return x.policy || 'auto'; }

/**
 * How each policy plays. 'auto' (Fight! / Fight Wisely) and 'smart' are exactly the r3 behaviour the bosses were
 * calibrated against; 'mercy', 'support' and 'nomagic' are the other Tactics.
 *   healAt / healAtTele   heal a friend under this share of max HP (on a Big-Attack wind-up round)
 *   reserve               'road': never spend MP below half except against a boss (SYSTEMS §7.3); false: spend it
 *   healReserve           the reserve rule for heals ('road' for Fight!, false for the healers' tactics)
 *   thrift                how much MP cost weighs against a spell's damage (higher = casts less)
 *   items / brace / bossBuffs / cure / damageSpells / magic
 */
const POLICY = {
  auto:    { healAt: 0.35, weakSwingHeals: 0.5, reserve: 'road', healReserve: 'road', thrift: 0.04, damageSpells: true, magic: true },
  smart:   { healAt: 0.45, healAtTele: 0.65, reserve: false, healReserve: false, thrift: 0.015, items: true, brace: true, defend: true,
    bossBuffs: true, damageSpells: true, magic: true, spareSingles: true },
  mercy:   { healAt: 0.25, reserve: false, healReserve: false, thrift: 0.004, bossBuffs: true, damageSpells: true, magic: true },
  support: { healAt: 0.6, healAtTele: 0.75, weakSwingHeals: 0.8, reserve: 'road', healReserve: false, thrift: 0.04, brace: true, bossBuffs: true, cure: true,
    damageSpells: true, magic: true },
  nomagic: { healAt: 0, magic: false },
};

const estPhys = (a, t, power = 1) => Math.max(1.5, (effAtk(a) - effDef(t) / 2) * 0.6) * power;
const estSpell = (a, s, t) => (s.base + a.mag * s.k) * elementMult(t, s.element) * (1 - Math.min(0.6, effMdef(t) * (1 - (s.pierce || 0)) / 200));

function usableSpells(B, a, kinds) {
  return (a.spells || []).map((id) => B.data.spells[id]).filter((s) => s && kinds.includes(s.kind)
    && s.battle !== false && a.mp >= spellCost(a, s) && !a.status.silence);
}

/**
 * Can this member spend `cost` MP now? 'road' never spends MP below half in a normal fight (SYSTEMS §7.3) — the
 * half it keeps is for the boss, so against a boss it spends it. (Before balance pass r3 the reserve was never spent:
 * a child who walked a dungeon met its boss with Linnet hitting it with her staff, and one who ran from everything
 * arrived with twice the magic — which made running away worth about four levels.)
 */
function mpOk(B, a, cost, reserve) {
  if (reserve === 'road' && !B.isBoss) return a.mp - cost >= a.maxMp * 0.5;
  return a.mp >= cost;
}

function bestHealSpell(B, a, t, reserve) {
  const missing = effMaxHp(t) - t.hp;
  const list = usableSpells(B, a, ['heal', 'fullheal']).filter((s) => mpOk(B, a, spellCost(a, s), reserve));
  if (!list.length) return null;
  const est = (s) => (s.kind === 'fullheal' ? missing : Math.min(missing, s.base + a.mag * s.k));
  // cheapest spell that covers >= 70% of what's missing, else the strongest
  const enough = list.filter((s) => est(s) >= missing * 0.7).sort((x, y) => spellCost(a, x) - spellCost(a, y));
  return enough[0] || list.sort((x, y) => est(y) - est(x))[0];
}

function bestHerb(B, t) {
  const missing = effMaxHp(t) - t.hp;
  const herbs = Object.keys(B.bag).map((id) => B.data.items[id])
    .filter((it) => it && it.battle && it.battle.effect === 'heal' && B.bag[it.id] > 0)
    .sort((x, y) => (x.battle.amount === 'full' ? 1e9 : x.battle.amount) - (y.battle.amount === 'full' ? 1e9 : y.battle.amount));
  return herbs.find((it) => (it.battle.amount === 'full' ? 1e9 : it.battle.amount) >= missing * 0.6) || herbs[herbs.length - 1] || null;
}

const CURABLE = ['sleep', 'confuse', 'poison', 'root', 'dazzle'];

/**
 * Choose a command for a party member. Returns a command object {type, target?, id?}.
 * policy: 'auto' (Fight! / Fight Wisely) | 'smart' (a careful player giving orders) | 'mash' (Attack, Attack, Attack) |
 *         'mercy' (Show No Mercy) | 'support' (Watch My Back) | 'nomagic' (Don't Use Magic). A tactic id works too.
 * Deterministic (no dice): the mentor reads it to guess which monster a child is about to hit.
 */
export function chooseAllyAction(B, a, policy = 'auto') {
  if (TACTIC_BY_ID[policy] || TACTIC_ALIAS[policy] && !POLICY[policy]) policy = policyForTactic(policy);
  const foes = B.enemies.filter(targetable);
  const friends = B.party.filter((c) => !c.gone);
  const up = friends.filter(isUp);
  if (!foes.length) return { type: 'defend' };

  const attackTarget = () => {
    if (policy === 'mash') return foes[0];
    // finish off whatever can be finished, else the one with the least HP left — and a friend fighting by Tactics
    // leaves a small monster somebody was *told* to hit (one their own two swings fell from full) to them, while there
    // is another monster to go for. DQV's first hour: the boy's swing is the one that pops the slime (before, Bobble
    // finished off every Gloop Bram had just hit, and Bram landed 6% of the killing blows). A monster that needs
    // everybody's swings still gets everybody's swings: spreading out there only lets it hit back for longer (measured:
    // on the Sogglemarsh walk it cost Bogwallop's door eight points of first-try wins).
    let pool = foes;
    if (a.control !== 'player' && !a.guest) {
      const told = new Set();
      for (const c of B.party) {
        if (c === a || c.control !== 'player' || !isUp(c)) continue;
        const cmd = B.commands.get(c.id);
        const t = cmd && cmd.type === 'attack' && cmd.target ? foes.find((f) => f.id === cmd.target) : null;
        if (t && 2 * 1.1 * estPhys(c, t) >= t.maxHp) told.add(t.id);
      }
      const rest = foes.filter((f) => !told.has(f.id));
      if (rest.length) pool = rest;
    }
    return pool.slice().sort((x, y) => x.hp - y.hp)[0];
  };
  if (policy === 'mash') return { type: 'attack', target: attackTarget().id };
  const P = POLICY[policy] || POLICY.auto;
  const boss = foes.find((e) => e.boss);
  if (!P.magic) return { type: 'attack', target: (boss || attackTarget()).id };

  const canItem = P.items && !a.guest;
  const telegraphing = B.enemies.some((e) => isUp(e) && e.windup && e.windup.big);

  // 1. revive the fallen (Rouse is never held back)
  const fallen = friends.filter((c) => !isUp(c));
  if (fallen.length) {
    const rouse = usableSpells(B, a, ['revive']).find((s) => mpOk(B, a, spellCost(a, s), false));
    if (rouse) return { type: 'spell', id: rouse.id, target: fallen[0].id };
    if (canItem) {
      const kiss = Object.keys(B.bag).map((id) => B.data.items[id]).find((it) => it && it.battle && it.battle.effect === 'revive' && B.bag[it.id] > 0);
      if (kiss) return { type: 'item', id: kiss.id, target: fallen[0].id };
    }
  }

  // 2. heal the hurt — and a healer whose swing hardly matters (Queen Elowen's staff against Mortmain: 18 damage a turn
  // while the Rowan beside her hits for 150) tops friends up early instead of hitting things with a stick
  let healAt = telegraphing && P.healAtTele ? P.healAtTele : P.healAt;
  if (P.weakSwingHeals && usableSpells(B, a, ['heal', 'healAll', 'fullheal']).length) {
    const aim = boss || attackTarget();
    const best = Math.max(...up.filter((c) => c !== a).map((c) => estPhys(c, aim)), 0);
    if (best > 0 && estPhys(a, aim) < best * 0.35) healAt = Math.max(healAt, P.weakSwingHeals);
  }
  const hurt = up.filter((c) => c.hp / effMaxHp(c) < healAt).sort((x, y) => x.hp / effMaxHp(x) - y.hp / effMaxHp(y));
  if (hurt.length) {
    if (hurt.length >= 2) {
      const all = usableSpells(B, a, ['healAll']).find((s) => mpOk(B, a, spellCost(a, s), P.healReserve));
      if (all) return { type: 'spell', id: all.id };
    }
    const s = bestHealSpell(B, a, hurt[0], P.healReserve);
    if (s) return { type: 'spell', id: s.id, target: hurt[0].id };
    if (canItem && (hurt[0] === a || !usableSpells(B, a, ['heal']).length)) {
      const herb = bestHerb(B, hurt[0]);
      if (herb) return { type: 'item', id: herb.id, target: hurt[0].id };
    }
  }

  // 3. brace for a telegraphed Big Attack
  if (P.brace && telegraphing) {
    const bolster = usableSpells(B, a, ['buff']).find((s) => s.buff && s.buff.stat === 'def' && s.target === 'allies'
      && up.some((c) => !c.buffs.def || c.buffs.def.mult < (s.buff.max ?? 1.5)));
    if (bolster) return { type: 'spell', id: bolster.id };
    if (P.defend && a.hp / effMaxHp(a) < 0.7) return { type: 'defend' };
  }

  // 3b. wake, unmuddle and unstick a friend (Watch My Back)
  if (P.cure) {
    const cures = usableSpells(B, a, ['cure']);
    for (const c of up) {
      if (c === a) continue;
      const bad = CURABLE.filter((k) => c.status[k]);
      if (!bad.length) continue;
      const s = cures.find((sp) => (sp.cures || []).some((k) => bad.includes(k)) && mpOk(B, a, spellCost(a, sp), false));
      if (s) return { type: 'spell', id: s.id, target: c.id };
    }
  }

  // 4. offence: compare the best spell against a plain swing
  const target = boss || attackTarget();
  const physEst = a.gear && a.gear.allEnemies ? foes.reduce((s, t) => s + estPhys(a, t, a.gear.allEnemies), 0) : estPhys(a, target);
  let best = null, bestVal = physEst * 1.15;
  if (P.damageSpells) {
    for (const s of usableSpells(B, a, ['damage'])) {
      const cost = spellCost(a, s);
      if (!mpOk(B, a, cost, P.reserve)) continue;
      if (P.spareSingles && !boss && s.target !== 'enemies' && foes.length === 1 && target.hp <= physEst) continue;
      const val = s.target === 'enemies' ? foes.reduce((sum, t) => sum + Math.min(t.hp, estSpell(a, s, t)), 0) : Math.min(target.hp * 1.2, estSpell(a, s, target));
      // spend MP only when it is clearly worth it (auto) or efficient (smart), or whenever it hurts more (mercy)
      const adj = val / (1 + cost * P.thrift);
      if (adj > bestVal) { best = s; bestVal = adj; }
    }
  }
  if (P.bossBuffs && boss && !best) {
    const buff = usableSpells(B, a, ['buff']).find((s) => s.buff && s.buff.stat === 'atk' && s.target === 'allies' && !a.buffs.atk
      && mpOk(B, a, spellCost(a, s), policy === 'smart' ? false : P.reserve));
    if (buff && B.round % 4 === 1) return { type: 'spell', id: buff.id };
    const wob = usableSpells(B, a, ['debuff']).find((s) => s.buff && s.buff.stat === 'def' && !boss.buffs.def
      && mpOk(B, a, spellCost(a, s), policy === 'smart' ? false : P.reserve));
    if (wob) return { type: 'spell', id: wob.id, target: boss.id };
  }
  if (best) return { type: 'spell', id: best.id, target: best.target === 'enemies' ? undefined : target.id };
  return { type: 'attack', target: target.id };
}

/** Which monsters is this child about to go for? (a given command, else what their tactic will choose) */
function intendedTargets(B, c, foes) {
  let cmd = B.commands.get(c.id);
  if (!cmd && c.control !== 'player') cmd = chooseAllyAction(B, c, policyForTactic(c.tactic));
  if (!cmd || cmd.type === 'attack') return [cmd && cmd.target ? cmd.target : foes[0].id];
  if (cmd.type === 'spell') {
    const s = B.data.spells[cmd.id];
    if (s && s.target === 'enemies') return foes.map((f) => f.id);
    if (s && s.kind === 'damage' && cmd.target) return [cmd.target];
  }
  return [];
}

/**
 * A mentor guest (Halvard, Act I — "walking beside someone enormous and safe") leaves the children their own fight:
 * he takes a monster nobody has picked, and otherwise steps back so Bram actually swings (the critic's first-hour
 * run had Bram never acting in 35% of fights). He stops holding back the moment a child is under half HP, from
 * round 4, and against a boss. Returns a normal command, or {type:'watch'} (battle.js prints his line).
 */
export function chooseMentorAction(B, a) {
  const kids = B.party.filter((c) => isUp(c) && !c.guest);
  const foes = B.enemies.filter(targetable);
  if (!kids.length || !foes.length) return chooseAllyAction(B, a, 'auto');
  const worried = B.round >= 4 || foes.some((e) => e.boss) || kids.some((c) => c.hp / effMaxHp(c) < 0.5);
  if (worried) return chooseAllyAction(B, a, 'auto');
  const claimed = new Set();
  let pending = false;
  for (const c of kids) {
    if (c.flags.actedRound === B.round) continue;
    pending = true;
    for (const id of intendedTargets(B, c, foes)) claimed.add(id);
  }
  const free = foes.filter((e) => !claimed.has(e.id)).sort((x, y) => x.hp - y.hp);
  if (free.length) return { type: 'attack', target: free[0].id };
  if (pending || B.round <= 2) return { type: 'watch' };
  return chooseAllyAction(B, a, 'auto');
}

/** Is this command legal right now? (used by AI fallbacks) */
export function commandLooksOk(B, a, cmd) {
  if (cmd.type === 'spell') return !spellProblem(B, a, B.data.spells[cmd.id], cmd.target);
  if (cmd.type === 'item') return !itemProblem(B, a, B.data.items[cmd.id], cmd.target);
  return true;
}
