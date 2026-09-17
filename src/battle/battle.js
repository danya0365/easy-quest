// src/battle/battle.js — P14. The battle rules engine. Pure logic: no DOM, no Three.js, runs under plain node.
//
//   const battle = createBattle({party, wagon, enemies, rng, data, emit, options})
//   battle.opening                      -> events for the encounter start (appear, ambush, enemy free round)
//   battle.phase                        -> 'command' | 'resolving' | 'victory' | 'defeat' | 'fled' | 'scripted'
//   battle.needsCommand()               -> actor summary | null
//   battle.command(actorId, {type:'attack'|'spell'|'item'|'defend'|'flee'|'swap', target, id, out}) -> {ok, reason?, text?}
//   battle.undoCommand()                -> {ok, actor}
//   battle.resolveRound()               -> ordered event log for the round (see docs/DATA-SHAPES.md §6)
//   battle.snapshot()                   -> serialisable state
//   battle.result                       -> null until the battle ends; then the outcome (docs/DATA-SHAPES.md §7)
//
// Rules: docs/SYSTEMS-BIBLE.md (formulas §1, curve §2, difficulty contract §6, flow §7, wagon §8, ceremonies §10)
// and docs/MONSTER-BIBLE.md §7 (befriending). Names per docs/CANON.md.

import * as F from './formulas.js';
import * as X from './actions.js';
import { chooseEnemyAction, afterEnemyMove, chooseAllyAction, chooseMentorAction } from './ai.js';
import {
  statsFor, spellsKnownAt, mpOverrides, naturalGear, spellsLearnedAt, capFor, EXP_TABLE, LEVEL_CAP,
  personalityAt, GAIN_ORDER, GUESTS,
} from '../data/growth.js';

const { push, say, nameOf, capFirst, isUp, byId } = X;
const sentence = (tpl, vars) => capFirst(X.fill(tpl, vars));

const clone = (o) => (o == null ? o : JSON.parse(JSON.stringify(o)));
const toMap = (x) => (Array.isArray(x) ? Object.fromEntries(x.map((v) => [v.id, v])) : (x || {}));
const titleCase = (id) => String(id).replace(/[_-]+/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase());

function parseRate(r) {
  if (r == null) return 0;
  if (typeof r === 'number') return r;
  const m = String(r).match(/^\s*(\d+)\s*\/\s*(\d+)\s*$/);
  return m ? Number(m[1]) / Number(m[2]) : Number(r) || 0;
}

// ---------------------------------------------------------------------------------------------------------
// Data normalisation — tolerant of reasonable spellings so P16/P20/P21 data just works.

export function normalizeMove(m) {
  if (typeof m === 'string') m = { id: m };
  const mv = { ...m };
  mv.id = mv.id || (mv.spell ? mv.spell : 'attack');
  mv.name = mv.name || titleCase(mv.id);
  if (!mv.kind) mv.kind = mv.spell ? 'spell' : 'attack';
  if (mv.weight == null) mv.weight = 1;
  if (!mv.target) mv.target = 'enemy';
  if (mv.id === 'attack' && !mv.text) mv.text = '%ACTOR% attacks!';
  return mv;
}

export function normalizeMonster(m) {
  if (!m) throw new Error('battle: unknown monster');
  const pick = (...ks) => { for (const k of ks) if (m[k] != null) return Number(m[k]); return undefined; };
  const hp = pick('hp', 'HP', 'maxHp') ?? 10;
  const lvl = pick('lvl', 'level', 'Lv') ?? 1;
  const atk = pick('atk', 'ATK', 'attack') ?? 5;
  const def = pick('def', 'DEF', 'defence', 'defense') ?? 0;
  const agi = pick('agi', 'AGI', 'spd', 'nimble') ?? 5;
  const mp = pick('mp', 'MP') ?? 0;
  return {
    ...m,
    id: m.id, name: m.name || titleCase(m.id), plural: m.plural, properName: !!m.properName, boss: !!m.boss,
    tier: m.tier ?? 1, lvl, hp, mp, atk, def, agi,
    wis: pick('wis', 'mag') ?? Math.round(5 + lvl * 2.5),
    mdef: pick('mdef', 'MDEF') ?? Math.round(lvl * 1.2),
    luck: pick('luck') ?? lvl,
    evade: m.evade || 0,
    exp: pick('exp', 'EXP', 'xp') ?? 0,
    gold: pick('gold', 'Gold', 'G') ?? 0,
    recruit: parseRate(m.recruit ?? m.recruitRate),
    moves: (m.moves && m.moves.length ? m.moves : ['attack']).map(normalizeMove),
    drops: m.drops || [],
    elements: m.elements || {},
    resist: m.resist || {},
    actions: m.actions || 1,
  };
}

// ---------------------------------------------------------------------------------------------------------

export function createBattle({ party = [], wagon = [], enemies = [], rng, data = {}, emit, options = {} } = {}) {
  data = {
    monsters: toMap(data.monsters), spells: toMap(data.spells), items: toMap(data.items), strings: data.strings || null,
  };
  const S = Number(options.assist && options.assist.s != null ? options.assist.s : options.S || 0);
  const B = {
    data, options, emit,
    rng: F.makeRng(rng ?? options.seed ?? 1),
    S, fx: F.assistEffects(S),
    round: 0, phase: 'command', ended: false,
    party: [], wagon: [], enemies: [],
    commands: new Map(), cmdOrder: [], fleeCmd: null, fleeFails: 0, fleeFailedThisRound: false,
    gold: Number(options.gold || 0), bag: { ...(options.bag || {}) }, itemsUsed: {},
    log: [], cur: [], errors: [],
    stats: { damageTaken: 0, damageDealt: 0, enemyHits: 0, maxHitPct: 0, cappedHits: 0, koCount: 0, koIds: new Set(),
      crits: 0, enemyCrits: 0, playerMisses: 0, telegraphs: 0, bigFired: 0, secondWinds: 0, revives: 0, mpSpent: 0 },
    bossRooted: new Set(), secondWindUsed: false, pendingSecondWind: null,
    wagonReachable: options.wagonReachable ?? true,
    scripted: options.scripted || null,
    enemyCounter: 0, result: null, recruitResult: null, levelUps: [], earned: { exp: 0, gold: 0, drops: [] },
  };
  B.unlosable = !!(B.scripted && B.scripted.unlosable !== false);

  // ---- builders -------------------------------------------------------------------------------------------
  B.normalizeMove = normalizeMove;
  B.basicAttack = normalizeMove({ id: 'attack', name: 'Attack', kind: 'attack' });

  B.makeEnemyStats = (raw) => {
    const m = normalizeMonster(raw);
    return {
      species: m.id, name: m.name, display: m.name, plural: m.plural, properName: m.properName, boss: m.boss,
      tier: m.tier, lvl: m.lvl, hp: m.hp, maxHp: m.hp, mp: m.mp, maxMp: m.mp, atk: m.atk, def: m.def, resil: m.def,
      mdef: m.mdef, spd: m.agi, nimble: m.agi, mag: m.wis, luck: m.luck, evade: m.evade,
      elements: m.elements, resist: m.resist, moves: m.moves, actions: m.actions,
      exp: m.exp, gold: m.gold, expTotal: m.exp, goldTotal: m.gold, drops: m.drops, recruit: m.recruit,
      joinLine: m.joinLine || null, pronoun: m.pronoun || 'it', article: m.article || null, defeatText: m.defeatText || null,
      transformsInto: m.transformsInto || null, transformText: m.transformText || null,
      spareAtZero: !!m.spareAtZero, spareText: m.spareText || null, phases: m.phases || null,
      scriptedEnd: m.scriptedEnd || null, untouchable: !!m.untouchable, neverTargets: m.neverTargets || [],
      fleeRefusal: m.fleeRefusal || null, partyLevel: m.partyLevel || null, expectedMaxHP: m.expectedMaxHP || null,
      minHpPct: m.minHpPct || 0, partnerGivesUp: !!m.partnerGivesUp,
    };
  };
  const specLevels = [], specAreaLevels = [];

  B.addEnemy = (spec) => {
    const id = typeof spec === 'string' ? spec : spec.id;
    const raw = data.monsters[id];
    if (!raw) { B.errors.push(`unknown monster "${id}"`); return null; }
    let src = raw;
    if (typeof spec === 'object') {
      // {id, partyLevel}: met at that party level (encounter-table `lvl`) — carry the block there; then overrides
      const { id: _i, partyLevel: want, at, hpMult, areaLevel, ...over } = spec;
      const lvlWanted = want ?? at;
      if (lvlWanted != null) specLevels.push(Number(lvlWanted));
      if (areaLevel != null) specAreaLevels.push(Number(areaLevel));
      if (lvlWanted != null && raw.partyLevel && !raw.boss) src = F.scaleMonster(normalizeMonster(raw), lvlWanted);
      else if (lvlWanted != null && !raw.boss) src = { ...raw, partyLevel: lvlWanted };
      if (hpMult) src = { ...src, hp: Math.max(1, F.round((src.hp ?? 10) * hpMult)) };   // a sturdier one of these
      src = { ...src, ...over };
    }
    const base = B.makeEnemyStats(src);
    const e = Object.assign(base, {
      id: 'e' + (++B.enemyCounter), uid: null, side: 'enemy', status: {}, buffs: {}, flags: {},
      used: new Map(), cooldowns: {}, bigCooldown: 0, bigUsedOn: new Set(), phaseDone: new Set(),
      windup: null, windupRound: 0, lastMove: null, lastBigRound: 0, followUp: null, stolen: 0, gone: null,
    });
    e.uid = e.id;
    B.enemies.push(e);
    letterEnemies();
    return e;
  };

  function letterEnemies() {
    const bySpecies = {};
    for (const e of B.enemies) (bySpecies[e.species] ||= []).push(e);
    for (const list of Object.values(bySpecies)) {
      if (list.length === 1) { if (!list[0].lettered) list[0].display = list[0].name; continue; }
      list.forEach((e, i) => { e.display = `${e.name} ${String.fromCharCode(65 + i)}`; e.lettered = true; });
    }
  }

  function makeAlly(m0) {
    const member = clone(m0);
    const kind = member.kind || (member.guest ? 'guest' : 'family');
    member.kind = kind;
    const stats = member.stats && (kind === 'guest' || member.fixed) ? member.stats : statsFor(member, member.lvl || 1);
    const pieces = [];
    if (member.gear) pieces.push(member.gear);
    for (const id of Object.values(member.equip || {})) {
      const it = id && data.items[id];
      if (it) pieces.push(it); else if (id) B.errors.push(`unknown item "${id}" equipped by ${member.id}`);
    }
    if (kind === 'monster' && !member.gear) pieces.push(naturalGear(member.lvl || 1));
    const gear = F.sumGear(pieces);
    const d = F.derive(stats, gear);
    const c = {
      id: member.id, uid: member.id, baseId: member.baseId || member.charId || member.id, side: 'party',
      name: member.name || titleCase(member.id), kind, guest: kind === 'guest',
      lvl: member.lvl || 1, exp: member.exp ?? EXP_TABLE[member.lvl || 1] ?? 0,
      maxHp: member.maxHp ?? d.maxHp, maxMp: member.maxMp ?? d.maxMp,
      atk: member.atk ?? d.atk, def: member.def ?? d.def, mdef: member.mdef ?? d.mdef, spd: member.spd ?? d.spd,
      mag: member.mag ?? d.mag, luck: member.luckTotal ?? d.luck, nimble: stats.nimble + (gear.agi || 0), resil: stats.resil,
      evade: 0, gear, stats: { ...stats },
      spells: member.spells ? [...member.spells] : spellsKnownAt(member, member.lvl || 1),
      mpCost: mpOverrides(member),
      status: member.status && member.status.poison ? { poison: member.status.poison } : {},
      buffs: {}, flags: {}, member,
      control: kind === 'guest' ? (options.guestControl || 'ai') : (member.control || 'player'),
    };
    c.hp = F.clamp(member.hp ?? c.maxHp, 0, c.maxHp);
    c.mp = F.clamp(member.mp ?? c.maxMp, 0, c.maxMp);
    return c;
  }

  B.enemySummary = (e) => ({
    id: e.id, species: e.species, name: e.display, lvl: e.lvl, hp: e.hp, maxHp: e.maxHp, mp: e.mp,
    alive: isUp(e), gone: e.gone, boss: e.boss, status: Object.keys(e.status), buffs: buffSummary(e),
    telegraphing: e.windup ? { move: e.windup.id, name: e.windup.name, big: !!e.windup.big } : null,
    bigCooldown: e.bigCooldown,
  });

  B.expectedMaxHP = (e) => options.expectedMaxHP ?? e.expectedMaxHP
    ?? (e.partyLevel ? personalityAt('steady_oak', e.partyLevel).hp : Math.max(...B.party.concat(B.wagon).map((c) => c.maxHp)));

  B.fleeRefusalText = () => {
    const boss = B.enemies.find((e) => e.boss && isUp(e)) || B.enemies[0];
    return boss && boss.fleeRefusal ? capFirst(X.fill(boss.fleeRefusal, { TARGET: nameOf(boss) }))
      : say(B, 'flee.boss', { TARGET: boss ? nameOf(boss) : 'It' });
  };

  B.endFled = () => {
    if (B.ended) return;
    push(B, { t: 'flee', side: 'party', ok: true, text: say(B, 'flee.ok') });
    B.ended = true; B.phase = 'fled';
    B.result = buildResult('fled');
    push(B, { t: 'end', outcome: 'fled' });
  };

  // ---- build combatants -------------------------------------------------------------------------------------
  for (const m of party.slice(0, 4)) B.party.push(makeAlly(m));
  for (const m of party.slice(4)) B.wagon.push(makeAlly(m));
  for (const m of wagon) B.wagon.push(makeAlly(m));
  for (const spec of enemies) B.addEnemy(spec);
  if (!B.party.length) throw new Error('createBattle: party is empty');
  if (!B.enemies.length) throw new Error('createBattle: no enemies');
  B.isBoss = B.enemies.some((e) => e.boss);
  // the level this fight was tuned for (drives the EXP keel): given, else the map's level carried on the encounter
  // spec, else the encounter-table level, else the boss's
  B.areaLevel = options.areaLevel ?? (specAreaLevels.length ? Math.max(...specAreaLevels) : null)
    ?? (specLevels.length ? Math.max(...specLevels) : null)
    ?? (B.isBoss ? Math.max(0, ...B.enemies.filter((e) => e.boss).map((e) => e.partyLevel || 0)) || null : null);
  B.normalCap = options.normalHitCap !== undefined ? options.normalHitCap : (B.isBoss || B.scripted ? null : F.NORMAL_HIT_CAP);
  if (B.scripted) for (const e of B.enemies) if (B.scripted.untouchable !== false) e.untouchable = true;

  // ---- queries ---------------------------------------------------------------------------------------------
  function controllable(a) {
    return isUp(a) && a.control === 'player' && !a.status.sleep && !a.status.root && !a.status.swallowed;
  }
  function buffSummary(c) {
    return Object.fromEntries(Object.entries(c.buffs).map(([k, b]) => [k, { mult: b.mult, turns: b.turns }]));
  }
  function spellList(a) {
    return a.spells.map((id) => {
      const s = data.spells[id];
      if (!s) return { id, name: titleCase(id), mp: 0, usable: false, reason: 'unknown' };
      const cost = X.spellCost(a, s);
      const field = s.battle === false || s.kind === 'field';
      return { id, name: s.name, mp: cost, kind: s.kind, target: s.target, field,
        usable: !field && a.mp >= cost && !a.status.silence };
    });
  }
  function actorSummary(a) {
    return {
      id: a.id, name: a.name, kind: a.kind, guest: a.guest, lvl: a.lvl, hp: a.hp, maxHp: X.effMaxHp(a),
      mp: a.mp, maxMp: a.maxMp, atk: X.effAtk(a), def: X.effDef(a), agi: Math.round(X.effSpd(a)),
      status: Object.keys(a.status), buffs: buffSummary(a), alive: isUp(a), spells: spellList(a),
      front: B.party.includes(a), canSwap: swapAvailability(),
    };
  }
  function swapAvailability() {
    if (!B.wagon.length) return { ok: false, text: 'Nobody is waiting in the wagon.' };
    if (!B.wagonReachable) return { ok: false, text: say(B, 'swap.no') };
    if (!B.wagon.some(isUp)) return { ok: false, text: 'Everyone in the wagon is worn out.' };
    return { ok: true };
  }
  const reserved = (pred) => [...B.commands.values()].filter(pred).length;

  // ---- commands --------------------------------------------------------------------------------------------
  function needsCommand() {
    if (B.phase !== 'command' || B.fleeCmd) return null;
    for (const a of B.party) if (controllable(a) && !B.commands.has(a.id)) return actorSummary(a);
    return null;
  }

  function fail(reason, text) { return { ok: false, reason, text }; }

  function command(actorId, cmd0 = {}) {
    if (B.phase !== 'command') return fail('phase', 'Not now.');
    const a = B.party.find((c) => c.id === actorId);
    if (!a) return fail('actor', `${actorId} is not in the front line.`);
    if (!controllable(a)) return fail('actor', `${a.name} can't do anything this round.`);
    if (B.fleeCmd) return fail('fleeing', 'Everybody is already running.');
    const cmd = { ...cmd0 };
    switch (cmd.type) {
      case 'attack': {
        if (cmd.target != null) {
          const t = B.enemies.find((e) => e.id === cmd.target);
          if (!t || !isUp(t)) return fail('target', 'That monster has already gone.');
        } else cmd.target = (B.enemies.find(X.targetable) || B.enemies.find(isUp) || {}).id;
        break;
      }
      case 'spell': {
        const s = data.spells[cmd.id];
        if (!s || !a.spells.includes(cmd.id)) return fail('unknown', `${a.name} doesn't know that spell.`);
        if (s.target === 'enemy' && cmd.target == null) cmd.target = (B.enemies.find(X.targetable) || {}).id;
        if (['heal', 'fullheal', 'cure'].includes(s.kind) && s.target !== 'allies' && cmd.target == null) {
          cmd.target = B.party.filter(isUp).sort((x, y) => x.hp / X.effMaxHp(x) - y.hp / X.effMaxHp(y))[0].id;
        }
        if (s.kind === 'revive' && cmd.target == null) {
          const f = B.party.find((c) => !isUp(c));
          if (!f) return fail('notneeded', 'Nobody needs rousing.');
          cmd.target = f.id;
        }
        if (s.target === 'enemy' && cmd.target != null) {
          const t = B.enemies.find((e) => e.id === cmd.target);
          if (!t || !isUp(t)) return fail('target', 'That monster has already gone.');
        }
        const p = X.spellProblem(B, a, s, cmd.target);
        if (p) return fail(p.reason, p.text);
        break;
      }
      case 'item': {
        const it = data.items[cmd.id];
        if (it && it.battle && ['heal', 'mp', 'cure'].includes(it.battle.effect) && cmd.target == null) cmd.target = a.id;
        if (it && it.battle && it.battle.effect === 'revive' && cmd.target == null) {
          const f = B.party.find((c) => !isUp(c));
          if (!f) return fail('notneeded', 'Nobody needs it right now.');
          cmd.target = f.id;
        }
        const p = X.itemProblem(B, a, it, cmd.target);
        if (p) return fail(p.reason, p.text);
        if ((B.bag[cmd.id] || 0) <= reserved((c) => c.type === 'item' && c.id === cmd.id)) {
          return fail('none', `Somebody has already bagsed the last ${it.name}.`);
        }
        break;
      }
      case 'defend': break;
      case 'flee': {
        if (B.scripted) return fail('scripted', say(B, 'flee.scripted'));
        if (B.isBoss) return fail('boss', B.fleeRefusalText());
        B.fleeCmd = a.id;
        break;
      }
      case 'swap': {
        const av = swapAvailability();
        if (!av.ok) return fail('nowagon', av.text);
        const inn = B.wagon.find((c) => c.id === cmd.target);
        if (!inn) return fail('target', 'Choose someone from the wagon.');
        if (!isUp(inn)) return fail('target', `${inn.name} is worn out and fast asleep in the wagon.`);
        if (reserved((c) => c.type === 'swap' && c.target === inn.id)) return fail('target', `${inn.name} is already climbing down.`);
        const outId = cmd.out || a.id;
        const out = B.party.find((c) => c.id === outId);
        if (!out) return fail('target', 'Choose someone from the front line to climb up.');
        if (reserved((c) => c.type === 'swap' && (c.out || '') === outId)) return fail('target', `${out.name} is already climbing up.`);
        cmd.out = outId;
        break;
      }
      default:
        return fail('type', `Unknown command "${cmd.type}".`);
    }
    B.commands.set(a.id, cmd);
    B.cmdOrder.push(a.id);
    const next = needsCommand();
    return { ok: true, next: next ? next.id : null };
  }

  function undoCommand() {
    if (B.phase !== 'command' || !B.cmdOrder.length) return { ok: false, actor: null };
    const id = B.cmdOrder.pop();
    const c = B.commands.get(id);
    B.commands.delete(id);
    if (c && c.type === 'flee') B.fleeCmd = null;
    const a = B.party.find((x) => x.id === id);
    return { ok: true, actor: a ? actorSummary(a) : null };
  }

  function autoCommands(policy = options.autoPolicy || 'auto') {
    const out = [];
    let n;
    let guard = 0;
    while ((n = needsCommand()) && guard++ < 8) {
      const a = B.party.find((c) => c.id === n.id);
      let cmd = chooseAllyAction(B, a, policy);
      let r = command(a.id, cmd);
      if (!r.ok) { cmd = { type: 'attack' }; r = command(a.id, cmd); }
      if (!r.ok) { cmd = { type: 'defend' }; command(a.id, cmd); }
      out.push({ actor: a.id, ...cmd });
    }
    return out;
  }

  // ---- round -----------------------------------------------------------------------------------------------
  function resolveRound() {
    if (B.phase !== 'command') return [];
    for (const a of B.party) {
      if (controllable(a) && !B.commands.has(a.id) && !B.fleeCmd) {
        B.commands.set(a.id, { type: 'attack' });
        B.cmdOrder.push(a.id);
      }
    }
    const mode = B.partyFreeRound ? { party: true, enemy: false } : { party: true, enemy: true };
    B.partyFreeRound = false;
    B.cur = [];
    B.phase = 'resolving';
    try {
      runRound(mode);
    } catch (err) {
      // Never leave the child stuck: record, end the round cleanly, carry on.
      B.errors.push(String(err && err.stack || err));
      push(B, { t: 'message', text: 'Everybody pauses for a moment.' });
    }
    B.commands.clear(); B.cmdOrder = []; B.fleeCmd = null;
    if (!B.ended && !options.holdResolving) B.phase = 'command';
    return B.cur;
  }

  function runRound(mode) {
    B.round++;
    B.fleeFailedThisRound = false;
    push(B, { t: 'round', n: B.round });

    if (mode.party) {
      for (const a of B.party) {
        const c = B.commands.get(a.id);
        if (c && c.type === 'defend' && isUp(a)) {
          a.flags.defending = true;
          push(B, { t: 'act', actor: a.id, kind: 'defend', text: say(B, 'defend', { ACTOR: nameOf(a) }) });
        }
      }
      for (const id of B.cmdOrder) {
        const c = B.commands.get(id);
        if (c && c.type === 'swap') doSwap(c);
      }
      if (B.fleeCmd) {
        const who = byId(B, B.fleeCmd);
        const pAgi = avg(B.party.filter(isUp).map((c) => X.effSpd(c)));
        const eAgi = avg(B.enemies.filter(isUp).map((c) => X.effSpd(c)));
        const p = F.fleeChance(pAgi, eAgi, B.fleeFails);
        if (B.rng.chance(p)) { B.endFled(); return; }
        B.fleeFails++;
        B.fleeFailedThisRound = true;
        push(B, { t: 'flee', side: 'party', ok: false, actor: who ? who.id : null, chance: p,
          text: say(B, 'flee.fail', { HERO: who ? who.name : 'Everyone' }) });
      }
    }

    const order = [];
    if (mode.party && !B.fleeFailedThisRound) {
      for (const a of B.party) {
        if (!isUp(a) || a.flags.arrivedRound === B.round) continue;
        const c = B.commands.get(a.id);
        if (c && ['defend', 'swap', 'flee'].includes(c.type)) continue;
        order.push({ c: a, cmd: c || null });
      }
    }
    if (mode.enemy) {
      for (const e of B.enemies) {
        if (!isUp(e)) continue;
        for (let i = 0; i < (e.actions || 1); i++) order.push({ c: e, n: i });
      }
    }
    for (const o of order) o.init = F.initiative(X.effSpd(o.c), o.c.side === 'party', B.rng), o.side = o.c.side;
    F.sortInitiative(order);

    for (const o of order) {
      if (B.ended) break;
      const c = o.c;
      if (!isUp(c)) continue;
      if (c.side === 'party' && !B.party.includes(c)) continue;
      if (c.side === 'party') partyTurn(c, o.cmd);
      else enemyTurn(c);
      checkEnd();
    }
    if (B.ended) return;
    X.endOfRound(B);
    checkEnd();
    if (B.ended) return;
    if (B.scripted && B.round >= (B.scripted.rounds || 3)) endScripted(B.scripted);
  }

  const avg = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : 1);

  function doSwap(c) {
    const out = B.party.find((x) => x.id === c.out);
    const inn = B.wagon.find((x) => x.id === c.target);
    if (!out || !inn || !isUp(inn)) return;
    const i = B.party.indexOf(out), j = B.wagon.indexOf(inn);
    B.party[i] = inn; B.wagon[j] = out;
    inn.flags.arrivedRound = B.round;
    out.flags.defending = false;
    push(B, { t: 'swap', out: out.id, in: inn.id, slot: i, auto: false,
      text: say(B, 'swap', { OUT: out.name, IN: inn.name }) });
  }

  function autoSwapIn() {
    for (let i = 0; i < B.party.length; i++) {
      if (isUp(B.party[i])) continue;
      const inn = B.wagon.find(isUp);
      if (!inn) break;
      const j = B.wagon.indexOf(inn);
      const out = B.party[i];
      B.party[i] = inn; B.wagon[j] = out;
      inn.flags.arrivedRound = B.round;
      push(B, { t: 'swap', out: out.id, in: inn.id, slot: i, auto: true, text: say(B, 'swap.auto', { IN: inn.name }) });
    }
  }

  function turnBlocked(c) {
    if (c.status.sleep) {
      c.status.sleep--;
      push(B, { t: 'status', target: c.id, status: 'sleep', on: true, skip: true, text: say(B, 'asleep', { TARGET: nameOf(c) }) });
      if (c.status.sleep <= 0) X.clearStatus(B, c, 'sleep');
      return true;
    }
    if (c.status.root) {
      c.status.root--;
      push(B, { t: 'status', target: c.id, status: 'root', on: true, skip: true, text: say(B, 'rooted', { TARGET: nameOf(c) }) });
      if (c.status.root <= 0) X.clearStatus(B, c, 'root');
      return true;
    }
    if (c.status.swallowed) return true;
    if (c.status.hiccup && B.rng.chance(0.25)) {
      push(B, { t: 'status', target: c.id, status: 'hiccup', on: true, skip: true, text: say(B, 'hiccup.skip', { TARGET: nameOf(c) }) });
      return true;
    }
    return false;
  }

  function partyTurn(a, cmd) {
    a.flags.actedRound = B.round;
    if (turnBlocked(a)) return;
    if (a.status.confuse) {
      const r = B.rng.next();
      if (r < 0.5) return X.doAttack(B, a, null);
      if (r < 0.75) {
        const pals = B.party.filter((c) => isUp(c) && c !== a);
        if (pals.length) {
          push(B, { t: 'act', actor: a.id, kind: 'attack', confused: true, text: say(B, 'attack', { ACTOR: nameOf(a) }) });
          X.physicalHit(B, a, B.rng.pick(pals), { noCrit: true });
          return;
        }
      }
      push(B, { t: 'act', actor: a.id, kind: 'confused', text: say(B, 'confused.dither', { ACTOR: nameOf(a) }) });
      return;
    }
    const mentor = a.guest && (a.member.mentor || (GUESTS[a.member.guestOf || a.baseId] || {}).mentor);
    if (mentor && a.control !== 'player') {
      // Act I: Papa leaves the lad his own monster, and steps in the moment anyone is hurt (ai.js chooseMentorAction)
      const m = chooseMentorAction(B, a);
      if (m.type === 'watch') {
        const g = GUESTS[a.member.guestOf || a.baseId] || {};
        const lines = a.member.mentorLines || g.mentorLines || ['%ACTOR% steps back and lets the others have a go.'];
        push(B, { t: 'act', actor: a.id, kind: 'watch', text: sentence(B.rng.pick(lines), { ACTOR: nameOf(a) }) });
        return;
      }
      cmd = m;
    } else if (a.control !== 'player' || !cmd) cmd = chooseAllyAction(B, a, a.guest ? 'auto' : (options.autoPolicy || 'auto'));
    switch (cmd.type) {
      case 'spell': return X.doSpell(B, a, cmd.id, cmd.target);
      case 'item': return X.doItem(B, a, cmd.id, cmd.target);
      case 'defend': return;
      case 'attack':
      default: return X.doAttack(B, a, cmd.target);
    }
  }

  function enemyTurn(e) {
    if (e.flags.skipNext) {
      const text = typeof e.flags.skipNext === 'string' ? sentence(e.flags.skipNext, { ACTOR: nameOf(e) }) : say(B, 'nothing', { ACTOR: nameOf(e) });
      e.flags.skipNext = false;
      push(B, { t: 'act', actor: e.id, kind: 'move', move: 'pause', nothing: true, text });
      return;
    }
    if (e.scriptedEnd && B.round >= e.scriptedEnd.round) { endScripted(e.scriptedEnd, e); return; }
    if (turnBlocked(e)) return;
    if (e.windup && B.round > e.windupRound) {
      const m = e.windup;
      e.windup = null;
      X.doMove(B, e, m);
      afterEnemyMove(B, e, m);
      if (m.then && isUp(e)) e.followUp = m.then;   // a telegraphed move's follow-up (Nothing At All → Listen)
      return;
    }
    if (e.status.confuse && B.rng.chance(0.5)) {
      const pool = B.enemies.filter((c) => isUp(c) && c !== e);
      if (pool.length) {
        push(B, { t: 'act', actor: e.id, kind: 'attack', confused: true, text: say(B, 'attack', { ACTOR: nameOf(e) }) });
        X.physicalHit(B, e, B.rng.pick(pool), { noCrit: true });
        return;
      }
    }
    let choice = chooseEnemyAction(B, e);
    if (choice.windup && e.windup) choice = { move: B.basicAttack }; // second action in the wind-up round
    if (choice.windup) {
      const m = choice.windup;
      e.windup = m; e.windupRound = B.round;
      B.stats.telegraphs++;
      push(B, { t: 'telegraph', actor: e.id, move: m.id, name: m.name, big: !!m.big,
        text: sentence(m.telegraph || X.TEXT['telegraph.default'], { ACTOR: nameOf(e) }) });
      return;
    }
    X.doMove(B, e, choice.move);
    afterEnemyMove(B, e, choice.move);
    if (choice.move.then && isUp(e)) e.followUp = choice.move.then;
  }

  function checkEnd() {
    if (B.ended) return;
    if (!B.enemies.some(isUp)) return finishVictory();
    if (!B.party.some(isUp)) {
      if (B.wagonReachable) autoSwapIn();
      if (!B.party.some(isUp)) return finishDefeat();
    }
  }

  function endScripted(spec, who) {
    if (B.ended) return;
    if (spec.text) push(B, { t: 'message', actor: who ? who.id : null, text: sentence(spec.text, { ACTOR: who ? nameOf(who) : '' }) });
    if (spec.outcome === 'victory') {
      for (const e of B.enemies) if (isUp(e)) { e.gone = 'spared'; push(B, { t: 'spared', target: e.id, text: e.spareText || say(B, 'spared', { TARGET: nameOf(e) }) }); }
      return finishVictory();
    }
    B.ended = true; B.phase = 'scripted';
    push(B, { t: 'scripted_end', text: spec.endText || null });
    B.result = buildResult('scripted');
    push(B, { t: 'end', outcome: 'scripted' });
  }

  // ---- endings ---------------------------------------------------------------------------------------------
  function beatenEnemies() { return B.enemies.filter((e) => e.gone === 'defeated' || e.gone === 'spared'); }

  /** F.expKeel for this fight: the party's highest level (guests never count) against the level it was tuned for. */
  function keel() {
    if (options.expKeel === false || !B.areaLevel) return 1;
    const own = B.party.concat(B.wagon).filter((c) => !c.guest);
    return own.length ? F.expKeel(Math.max(...own.map((c) => c.lvl)), B.areaLevel) : 1;
  }

  function finishVictory() {
    B.ended = true; B.phase = 'victory';
    const beaten = beatenEnemies();
    let exp = Math.round(beaten.reduce((s, e) => s + e.expTotal, 0) * keel());
    let gold = beaten.reduce((s, e) => s + e.goldTotal, 0);
    if (!B.isBoss && B.fx.rewardMult > 1) { exp = Math.round(exp * B.fx.rewardMult); gold = Math.round(gold * B.fx.rewardMult); }
    const drops = [];
    for (const e of beaten) {
      for (const d of e.drops) {
        const rate = parseRate(d.rate) * (d.item === 'herb' ? B.fx.herbDropMult : 1);
        if (B.rng.chance(rate)) {
          const it = data.items[d.item];
          drops.push({ item: d.item, name: it ? it.name : titleCase(d.item), from: e.id, monster: e.display });
          B.bag[d.item] = (B.bag[d.item] || 0) + 1;
          break;
        }
      }
    }
    B.gold += gold;
    B.earned = { exp, gold, drops };
    if (!beaten.length) {
      push(B, { t: 'victory', exp: 0, gold: 0, drops: [], allFled: true, text: say(B, 'victory.fled'), lines: [say(B, 'victory.fled')] });
    } else {
      const lines = [say(B, 'victory')];
      if (exp > 0) lines.push(say(B, 'victory.exp', { N: exp }));
      if (gold > 0) lines.push(say(B, 'victory.gold', { G: gold }));
      for (const d of drops) {
        const art = /^[aeiou]/i.test(d.name) ? 'an' : 'a';
        const src = B.enemies.find((x) => x.id === d.from);
        lines.push(say(B, 'drop', { MONSTER: src ? nameOf(src) : 'the ' + d.monster, ITEM: `${art} ${d.name}` }));
      }
      push(B, { t: 'victory', exp, gold, drops, boss: B.isBoss, text: lines[0], lines });
    }
    rollRecruit(beaten);
    awardExp(exp);
    B.result = buildResult('victory');
    push(B, { t: 'end', outcome: 'victory' });
  }

  function finishDefeat() {
    B.ended = true; B.phase = 'defeat';
    const goldBefore = B.gold;
    const goldAfter = F.defeatGold(goldBefore);
    B.gold = goldAfter;
    const lines = [say(B, 'wipe'), say(B, 'wipe.church')];
    push(B, { t: 'wipe', goldBefore, goldAfter, wakeAt: 'church', text: lines[0], lines });
    // "You keep ... every point of EXP earned in the battle you just lost" (SYSTEMS §6.2)
    const exp = Math.round(beatenEnemies().reduce((s, e) => s + e.expTotal, 0) * keel());
    B.earned = { exp, gold: 0, drops: [] };
    if (exp > 0) awardExp(exp);
    B.result = buildResult('defeat');
    push(B, { t: 'end', outcome: 'defeat' });
  }

  function rollRecruit(beaten) {
    const R = options.recruit;
    if (!R || !R.enabled) { B.recruitResult = null; return; }
    const state = {
      joined: { ...(R.joined || {}) }, misses: { ...(R.misses || {}) },
      battlesSinceRecruit: (R.battlesSinceRecruit || 0) + 1,
    };
    const hero = B.party.concat(B.wagon).find((c) => c.baseId === 'hero') || B.party[0];
    // one roll per species (rarest first): three Crabbits in one fight are one Crabbit's worth of asking
    const seen = new Set();
    const cands = beaten.filter((e) => e.recruit > 0).sort((a, b) => a.recruit - b.recruit)
      .filter((e) => (seen.has(e.species) ? false : seen.add(e.species)));
    let offer = null;
    for (const e of cands) {
      if (offer) break;
      const misses = state.misses[e.species] || 0;
      const p = F.recruitChance({ base: e.recruit, kidMode: R.kidMode ?? true, heroLvl: hero.lvl, monsterLvl: e.lvl,
        charmBell: !!R.charmBell, duplicate: (state.joined[e.species] || 0) > 0,
        pity: state.battlesSinceRecruit > F.RECRUIT_PITY_BATTLES });
      if (misses >= F.RECRUIT_GUARANTEE_AFTER || B.rng.chance(p)) {
        offer = e;
        state.misses[e.species] = 0;
        state.battlesSinceRecruit = 0;
      } else state.misses[e.species] = misses + 1;
    }
    B.recruitResult = { offer: offer ? { id: offer.id, species: offer.species, name: offer.name, lvl: offer.lvl } : null, state };
    if (offer) {
      const want = say(B, 'recruit.want', { MONSTER: 'the ' + offer.name });
      const ask = say(B, 'recruit.ask', { PRONOUN: offer.pronoun || 'it' });
      push(B, { t: 'recruit_offer', monster: B.recruitResult.offer, joinLine: offer.joinLine, text: want, ask,
        lines: [want, offer.joinLine, ask].filter(Boolean) });
    }
  }

  function awardExp(exp) {
    const members = B.party.concat(B.wagon).filter((c) => !c.guest);
    if (!members.length || exp <= 0) return;
    const highest = Math.max(...members.map((c) => c.lvl));
    for (const c of members) {
      const mult = F.catchUpMultiplier(c.lvl, highest);
      c.exp += exp * mult;
      c.expGained = (c.expGained || 0) + exp * mult;
      const cap = Math.min(LEVEL_CAP, capFor(c.member));
      let L = c.lvl;
      while (L < cap && c.exp >= EXP_TABLE[L + 1]) L++;
      if (L === c.lvl) continue;
      const from = c.lvl;
      const before = statsFor(c.member, from), after = statsFor(c.member, L);
      const gainsOrdered = GAIN_ORDER.map(([k, label]) => ({ key: k, label, gain: after[k] - before[k], total: after[k] }));
      const gains = Object.fromEntries(gainsOrdered.map((g) => [g.key, g.gain]));
      const learned = [];
      for (let l = from + 1; l <= L; l++) {
        for (const s of spellsLearnedAt(c.member, l)) {
          if (c.spells.includes(s.id)) continue;
          c.spells.push(s.id);
          if (s.mp != null) c.mpCost[s.id] = s.mp;
          const sp = data.spells[s.id];
          learned.push({ id: s.id, name: s.name || (sp ? sp.name : titleCase(s.id)), mp: s.mp ?? (sp ? sp.mp : 0), blurb: sp ? sp.blurb || null : null });
        }
      }
      // re-derive with the new stats and the same gear; level-ups heal by the gain
      c.member.lvl = L;
      const d = F.derive(after, c.gear);
      const hpGain = d.maxHp - c.maxHp, mpGain = d.maxMp - c.maxMp;
      Object.assign(c, { lvl: L, maxHp: d.maxHp, maxMp: d.maxMp, atk: d.atk, def: d.def, mdef: d.mdef, spd: d.spd,
        mag: d.mag, luck: d.luck, nimble: after.nimble + (c.gear.agi || 0), resil: after.resil, stats: { ...after } });
      if (isUp(c)) { c.hp = Math.min(c.maxHp, c.hp + Math.max(0, hpGain)); }
      c.mp = Math.min(c.maxMp, c.mp + Math.max(0, mpGain));
      const lines = [say(B, 'levelup', { NAME: c.name, N: L })];
      for (const g of gainsOrdered) lines.push(`${g.label} ${g.gain > 0 ? '+' + g.gain : '—'}`);
      for (const s of learned) lines.push(say(B, 'learn', { NAME: c.name, SPELL: s.name }));
      const ev = { t: 'levelup', who: c.id, name: c.name, from, level: L, gains, gainsOrdered, learned, text: lines[0], lines };
      B.levelUps.push({ who: c.id, from, level: L, learned: learned.map((s) => s.id) });
      push(B, ev);
    }
  }

  function buildResult(outcome) {
    const memberOut = (c) => {
      const m = { ...c.member, lvl: c.lvl, exp: c.exp, hp: c.hp, mp: c.mp };
      if (c.status.poison) m.status = { poison: c.status.poison }; else delete m.status;
      if (c.member.spells) m.spells = [...c.spells];
      return m;
    };
    const front = B.party;
    const levelsGained = B.levelUps.reduce((s, l) => s + (l.level - l.from), 0);
    const sum = {
      outcome, boss: B.isBoss, koCount: B.stats.koCount, rounds: B.round,
      lowHpAll: outcome !== 'defeat' && front.every((c) => c.hp / X.effMaxHp(c) < 0.3),
      levelsGained, nobodyBelow60: front.every((c) => c.hp / X.effMaxHp(c) >= 0.6),
    };
    const delta = F.assistDelta(sum);
    const bossIds = [...new Set(B.enemies.filter((e) => e.boss).map((e) => e.species))];
    return {
      outcome, rounds: B.round,
      exp: B.earned.exp, gold: B.earned.gold, drops: B.earned.drops,
      goldAfter: B.gold, bag: { ...B.bag }, itemsUsed: { ...B.itemsUsed },
      party: B.party.map(memberOut), wagon: B.wagon.map(memberOut),
      levelUps: B.levelUps.slice(),
      recruit: B.recruitResult,
      assist: { before: B.S, delta, after: F.applyAssist(B.S, delta) },
      boss: bossIds.length ? bossIds : null,
      bossDefeated: outcome === 'victory' && bossIds.length ? bossIds : null,
      bossWipe: outcome === 'defeat' && bossIds.length ? bossIds : null,
      stats: { ...B.stats, koIds: [...B.stats.koIds] },
    };
  }

  // ---- snapshot ------------------------------------------------------------------------------------------
  function allySnap(c) {
    return {
      id: c.id, name: c.name, kind: c.kind, guest: c.guest, lvl: c.lvl, exp: c.exp, hp: c.hp, maxHp: X.effMaxHp(c),
      mp: c.mp, maxMp: c.maxMp, atk: X.effAtk(c), def: X.effDef(c), agi: Math.round(X.effSpd(c)), alive: isUp(c),
      status: Object.keys(c.status), buffs: buffSummary(c), spells: [...c.spells],
    };
  }
  function snapshot() {
    const needs = needsCommand();
    return clone({
      v: 1, round: B.round, phase: B.phase, boss: B.isBoss, scripted: !!B.scripted, ambush: B.ambush,
      wagonReachable: B.wagonReachable,
      party: B.party.map(allySnap), wagon: B.wagon.map(allySnap), enemies: B.enemies.map(B.enemySummary),
      commands: B.cmdOrder.map((id) => ({ actor: id, ...B.commands.get(id) })), needs: needs ? needs.id : null,
      gold: B.gold, bag: B.bag, fleeFails: B.fleeFails, assist: { s: B.S, tier: B.fx.tier },
      rngState: B.rng.state, events: B.log.length, errors: B.errors.slice(-5), result: B.result,
    });
  }

  // ---- opening -------------------------------------------------------------------------------------------
  B.cur = [];
  {
    const l = X.listMonsters(B.enemies);
    push(B, { t: 'appear', enemies: B.enemies.map(B.enemySummary), boss: B.isBoss,
      text: say(B, 'appear', { LIST: l.text, VERB: l.plural ? 'draw' : 'draws' }) });
    let amb = options.ambush;
    if (amb === undefined) amb = F.ambushRoll(B.rng, { S, protectedMap: !!options.protectedMap, boss: B.isBoss || !!B.scripted });
    if (amb === 'none') amb = null;
    B.ambush = amb || null;
    if (amb === 'party') {
      push(B, { t: 'ambush', side: 'party', text: say(B, 'ambush.party') });
      B.partyFreeRound = true;
    } else if (amb === 'enemy') {
      push(B, { t: 'ambush', side: 'enemy', text: say(B, 'ambush.enemy') });
      B.phase = 'resolving';
      runRound({ party: false, enemy: true });
      if (!B.ended) B.phase = 'command';
    }
  }
  const opening = B.cur;

  const api = {
    get phase() { return B.phase; },
    get round() { return B.round; },
    get result() { return B.result; },
    get log() { return B.log; },
    get errors() { return B.errors; },
    get over() { return B.ended; },
    opening,
    needsCommand, command, undoCommand, resolveRound, snapshot, autoCommands,
    /** Fill every missing command with the AI policy, then resolve. */
    autoRound(policy) { autoCommands(policy); return resolveRound(); },
    /** Release a held 'resolving' phase (only with options.holdResolving). */
    ack() { if (B.phase === 'resolving' && !B.ended) B.phase = 'command'; return B.phase; },
    actor(id) { const a = byId(B, id); return a && a.side === 'party' ? actorSummary(a) : a ? B.enemySummary(a) : null; },
    validTargets(actorId, cmd = {}) {
      const a = B.party.find((c) => c.id === actorId);
      if (!a) return [];
      if (cmd.type === 'swap') return B.wagon.filter(isUp).map((c) => c.id);
      const s = cmd.type === 'spell' ? data.spells[cmd.id] : null;
      const it = cmd.type === 'item' ? data.items[cmd.id] : null;
      const kind = s ? s.kind : it && it.battle ? it.battle.effect : 'attack';
      const target = s ? s.target : null;
      if (target === 'enemies' || target === 'allies' || kind === 'damageAll' || kind === 'escape') return [];
      if (kind === 'revive') return B.party.filter((c) => !isUp(c)).map((c) => c.id);
      if (['heal', 'fullheal', 'cure', 'mp', 'buff'].includes(kind)) return B.party.filter(isUp).map((c) => c.id);
      return B.enemies.filter(X.targetable).map((e) => e.id);
    },
    /** internals for tests/sim only */
    _internal: B,
  };
  return api;
}
