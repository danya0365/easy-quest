// src/battle/ai.js — P14. Monster move choice (with Big-Attack telegraphs) and party auto-battle policies.
// Pure logic. Policies:
//   'mash'  — a six-year-old pressing Confirm: every turn, Attack the first monster.
//   'auto'  — the "Fight!" auto-battle (SYSTEMS §7.3): never uses items, never spends MP below half.
//   'smart' — a careful player / helpful parent: heals early, revives, Bolsters on a wind-up, uses items.

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
// Party

const estPhys = (a, t, power = 1) => Math.max(1.5, (effAtk(a) - effDef(t) / 2) * 0.6) * power;
const estSpell = (a, s, t) => (s.base + a.mag * s.k) * elementMult(t, s.element) * (1 - Math.min(0.6, effMdef(t) * (1 - (s.pierce || 0)) / 200));

function usableSpells(B, a, kinds) {
  return (a.spells || []).map((id) => B.data.spells[id]).filter((s) => s && kinds.includes(s.kind)
    && s.battle !== false && a.mp >= spellCost(a, s) && !a.status.silence);
}

function mpOk(a, cost, policy) {
  if (policy === 'auto') return a.mp - cost >= a.maxMp * 0.5;
  return a.mp >= cost;
}

function bestHealSpell(B, a, t, policy) {
  const missing = effMaxHp(t) - t.hp;
  const list = usableSpells(B, a, ['heal', 'fullheal']).filter((s) => mpOk(a, spellCost(a, s), policy));
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

/** Choose a command for a party member. Returns a command object {type, target?, id?}. */
export function chooseAllyAction(B, a, policy = 'auto') {
  const foes = B.enemies.filter(targetable);
  const friends = B.party.filter((c) => !c.gone);
  const up = friends.filter(isUp);
  if (!foes.length) return { type: 'defend' };

  const attackTarget = () => {
    if (policy === 'mash') return foes[0];
    // finish off whatever can be finished, else the one with the least HP left
    return foes.slice().sort((x, y) => x.hp - y.hp)[0];
  };
  const attack = () => ({ type: 'attack', target: attackTarget().id });
  if (policy === 'mash') return attack();

  const canItem = policy === 'smart' && !a.guest;
  const telegraphing = B.enemies.some((e) => isUp(e) && e.windup && e.windup.big);

  // 1. revive the fallen
  const fallen = friends.filter((c) => !isUp(c));
  if (fallen.length) {
    const rouse = usableSpells(B, a, ['revive']).find((s) => mpOk(a, spellCost(a, s), policy === 'auto' ? 'smart' : policy));
    if (rouse) return { type: 'spell', id: rouse.id, target: fallen[0].id };
    if (canItem) {
      const kiss = Object.keys(B.bag).map((id) => B.data.items[id]).find((it) => it && it.battle && it.battle.effect === 'revive' && B.bag[it.id] > 0);
      if (kiss) return { type: 'item', id: kiss.id, target: fallen[0].id };
    }
  }

  // 2. heal the hurt
  const healAt = policy === 'smart' ? (telegraphing ? 0.65 : 0.45) : 0.35;
  const hurt = up.filter((c) => c.hp / effMaxHp(c) < healAt).sort((x, y) => x.hp / effMaxHp(x) - y.hp / effMaxHp(y));
  if (hurt.length) {
    if (hurt.length >= 2) {
      const all = usableSpells(B, a, ['healAll']).find((s) => mpOk(a, spellCost(a, s), policy));
      if (all) return { type: 'spell', id: all.id };
    }
    const s = bestHealSpell(B, a, hurt[0], policy);
    if (s) return { type: 'spell', id: s.id, target: hurt[0].id };
    if (canItem && (hurt[0] === a || !usableSpells(B, a, ['heal']).length)) {
      const herb = bestHerb(B, hurt[0]);
      if (herb) return { type: 'item', id: herb.id, target: hurt[0].id };
    }
  }

  // 3. brace for a telegraphed Big Attack
  if (policy === 'smart' && telegraphing) {
    const bolster = usableSpells(B, a, ['buff']).find((s) => s.buff && s.buff.stat === 'def' && s.target === 'allies'
      && up.some((c) => !c.buffs.def || c.buffs.def.mult < (s.buff.max ?? 1.5)));
    if (bolster) return { type: 'spell', id: bolster.id };
    if (a.hp / effMaxHp(a) < 0.7) return { type: 'defend' };
  }

  // 4. offence: compare the best spell against a plain swing
  const boss = foes.find((e) => e.boss);
  const target = boss || attackTarget();
  const physEst = a.gear && a.gear.allEnemies ? foes.reduce((s, t) => s + estPhys(a, t, a.gear.allEnemies), 0) : estPhys(a, target);
  let best = null, bestVal = physEst * 1.15;
  for (const s of usableSpells(B, a, ['damage'])) {
    const cost = spellCost(a, s);
    if (!mpOk(a, cost, policy)) continue;
    if (policy === 'smart' && !boss && s.target !== 'enemies' && foes.length === 1 && target.hp <= physEst) continue;
    const val = s.target === 'enemies' ? foes.reduce((sum, t) => sum + Math.min(t.hp, estSpell(a, s, t)), 0) : Math.min(target.hp * 1.2, estSpell(a, s, target));
    // spend MP only when it is clearly worth it (auto) or efficient (smart)
    const adj = val / (1 + cost * (policy === 'auto' ? 0.04 : 0.015));
    if (adj > bestVal) { best = s; bestVal = adj; }
  }
  if (policy === 'smart' && boss && !best) {
    const buff = usableSpells(B, a, ['buff']).find((s) => s.buff && s.buff.stat === 'atk' && s.target === 'allies' && !a.buffs.atk);
    if (buff && B.round % 4 === 1) return { type: 'spell', id: buff.id };
    const wob = usableSpells(B, a, ['debuff']).find((s) => s.buff && s.buff.stat === 'def' && !boss.buffs.def);
    if (wob) return { type: 'spell', id: wob.id, target: boss.id };
  }
  if (best) return { type: 'spell', id: best.id, target: best.target === 'enemies' ? undefined : target.id };
  return { type: 'attack', target: target.id };
}

/** Is this command legal right now? (used by AI fallbacks) */
export function commandLooksOk(B, a, cmd) {
  if (cmd.type === 'spell') return !spellProblem(B, a, B.data.spells[cmd.id], cmd.target);
  if (cmd.type === 'item') return !itemProblem(B, a, B.data.items[cmd.id], cmd.target);
  return true;
}
