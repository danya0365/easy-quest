/**
 * church.js — the book, the blessing and the quiet.                          (P22, owner: src/ui/church.js)
 *
 * The priest keeps three things: the book (F5 `Save.write`, with F5's own words), the mending (free — SYSTEMS
 * §6.1: "Church healing and revival are free... children should not be taxed for a mistake"), and the candle,
 * which is the only thing in a church anyone pays for. She also says the warm, slightly funny thing when a
 * child wakes up here after losing (SYSTEMS §6.2: there is no "Game Over" anywhere in this build).
 *
 *   import { runChurch, Church } from './church.js';
 *   runChurch(runtime, helpers)      driven by src/ui/shop.js's counter scene (it owns the windows and the purse)
 *   Church.wakeWords()               one of the twelve defeat lines, for whoever stands the party up again
 *
 * Nothing here writes to storage except through `Save`; nothing here can lose a tale — F5 keeps the old page as
 * the spare before the new one lands, and the priest reads F5's own status words back to the child.
 */
import { UI, h } from './window.js';
import { Save } from '../engine/save.js';
import { Sfx } from '../audio/sfx.js';
import { Bus } from '../engine/events.js';
import { reportError } from '../engine/debug.js';
import { statsFor } from '../data/growth.js';
import { CHURCH_WORDS, itemOf } from '../data/shops.js';

const guard = (where, fn, fallback) => { try { return fn(); } catch (e) { reportError('church: ' + where, e); return fallback; } };

/** SYSTEMS §6.2: twelve warm, slightly funny lines, a different one each time you wake up here. */
export const WAKE_WORDS = [
  'You wake on a church bench. / Your purse is lighter. You are not.',
  'You are on the bench again. / The bench is getting to know you.',
  'Somebody carried you here. / Nobody will say who.',
  'You have been asleep four hours / and you have missed nothing at all.',
  'The candle burned down while / you were away. Candles do that.',
  'Your boots are by the door. / Somebody cleaned them. Not me.',
  'There. All mended. / Try to come back the usual way.',
  'The cat sat on you the whole time. / She says you are very warm.',
  'You lost some gold and no time. / That is the better way round.',
  'I put the kettle on when I saw you. / I have got quite good at guessing.',
  'You are all here, and all standing. / That is the whole of the job.',
  'Off you go. Gently. / The door is the one you came in by.',
];
let wakeN = 0;
export const Church = {
  WAKE_WORDS,
  wakeWords() { const s = WAKE_WORDS[wakeN % WAKE_WORDS.length]; wakeN++; return s; },
  CANDLE_PRICE: 2,
};

const SLOT_IDS = [1, 2, 3];
const hurt = (m) => {
  if (!m) return false;
  const s = guard('stats', () => statsFor(m), null);
  if (!s) return false;
  return (m.hp ?? s.hp) < s.hp || (m.mp ?? s.mp) < s.mp || !!m.status;
};
const fallen = (m) => !!m && (m.hp ?? 1) <= 0;

/**
 * A ring that whispers. VOICE-BIBLE 24 gives the priest a line for it, so the mending takes it off and says it.
 * Nothing in src/data/items.js is cursed yet (NEEDS P21: a `cursed: true` row) — the moment one is, this works.
 */
function cursedOn(m) {
  if (!m || !m.equip) return [];
  const out = [];
  for (const [slot, id] of Object.entries(m.equip)) {
    const it = guard('itemOf', () => itemOf(id), null);
    if (it && it.cursed) out.push({ slot, id, name: it.name });
  }
  return out;
}

/**
 * The whole church, run inside src/ui/shop.js's counter runtime.
 * `R` gives say / hush / mkMenu / mkWin / closeWin / pay / take / openPurse; `H` gives words() and the roster.
 */
export async function runChurch(R, H) {
  const c = R.counter;
  const words = H.words;
  const Roster = H.Roster;
  R.openPurse();
  R.patter(c.lines.greet || CHURCH_WORDS.greet);

  // SYSTEMS §6.1.6 / docs/INTEGRATION-NEEDS "P31 + P22": after a boss has wiped the party twice in a row, the
  // battle hands us one sentence a child can act on — and it is written as something the priest says. She says
  // it once, here, the next time they come in.
  const advice = Roster && Roster.helper && Roster.helper.text ? Roster.helper : null;
  if (advice && !advice.saidAtChurch) {
    advice.saidAtChurch = true;
    await R.say(String(advice.text).split(' / ').join('{n}'));
    if (!R.alive) return;
    await R.hush();
  }

  while (R.alive) {
    const anyHurt = H.party().some((m) => hurt(m) || cursedOn(m).length);
    const anyFallen = H.party().some(fallen);
    const cmd = R.mkMenu({
      id: 's-church', left: 34, top: 30, minWidth: 340, origin: '0% 0%', title: c.name,
      items: [
        { id: 'save', label: 'The book' },
        { id: 'heal', label: 'The mending', right: anyHurt ? '' : 'all well', color: anyHurt ? undefined : 'grey' },
        { id: 'revive', label: 'Call somebody back', right: anyFallen ? '' : 'nobody', color: anyFallen ? undefined : 'grey' },
        { id: 'candle', label: 'A candle', right: String(Church.CANDLE_PRICE) },
        { id: 'leave', label: 'The quiet' },
      ],
      cancelValue: { id: 'leave' },
    });
    const pick = await cmd.choose();
    await R.closeWin(cmd);
    if (!R.alive) return;
    const what = pick && pick.id;
    if (!what || what === 'leave') break;
    if (what === 'save') await saveFlow(R, H);
    else if (what === 'heal') await healFlow(R, H, Roster);
    else if (what === 'revive') await reviveFlow(R, H, Roster);
    else if (what === 'candle') await candleFlow(R, H);
    if (!R.alive) return;
  }
  await R.say(words(c.lines.blessing || CHURCH_WORDS.blessing));
  await R.hush();
}

// ── the book ────────────────────────────────────────────────────────────────────────────────────────────────
function slotRow(s) {
  const sum = guard('summary', () => Save.summary(s), null);
  if (!sum || !sum.exists) return { id: String(s), label: 'Tale ' + s, right: 'an empty page', color: 'grey', data: { slot: s, empty: true } };
  const who = sum.hero || 'somebody';
  const lvl = sum.level ? ' Lv ' + sum.level : '';
  const where = sum.placeName || sum.place || '';
  return { id: String(s), label: 'Tale ' + s, right: `${who}${lvl}`, note: where + (sum.playtimeText ? '  ' + sum.playtimeText : ''),
    data: { slot: s, empty: false, sum } };
}

async function saveFlow(R, H) {
  const words = H.words;
  guard('save init', () => Save.init());
  R.patter('Which page shall it go on?');
  const list = R.mkMenu({ id: 's-slots', left: 34, top: 180, minWidth: 520, lineHeight: 52, origin: '0% 0%',
    title: 'Which page?', items: SLOT_IDS.map(slotRow) });
  const pick = await list.choose();
  await R.closeWin(list);
  if (!R.alive) return;
  if (!pick) { await R.hush(); return; }
  const slot = pick.data.slot;

  if (!pick.data.empty) {
    await R.say(words(Save.words && Save.words.over ? Save.words.over : CHURCH_WORDS.over), { wait: false });
    const yes = await R.yesNo({ yes: 'Write over it', no: 'Leave it be' });
    if (!R.alive) return;
    if (!yes) { await R.hush(); return; }
  } else {
    await R.say(words(Save.words && Save.words.confirm ? Save.words.confirm : 'Write the tale down here?'), { wait: false });
    const yes = await R.yesNo({ yes: 'Yes please', no: 'Not yet' });
    if (!R.alive) return;
    if (!yes) { await R.hush(); return; }
  }

  const res = guard('write', () => Save.write(slot, { reason: 'church' }), { ok: false, words: null });
  guard('bell', () => Sfx.play('save_church_bell', { vol: 0.9 }));
  await UI.wait(0.35);
  if (!R.alive) return;
  if (res && res.ok) {
    Bus.emit('church.save', { slot });
    await R.say(words(CHURCH_WORDS.save) + '{p}' + words((Save.words && Save.words.done) || 'Written down, and safe.')
      + '{n}{grey}Tale ' + slot + '{/grey}');
    if (!R.alive) return;
    await R.say(words(CHURCH_WORDS.saved));
  } else {
    const w = (res && res.words) || (Save.words && Save.words.blocked) || 'The ink will not take today.';
    await R.say(words(w));
  }
  await R.hush();
}

// ── the mending (free) ──────────────────────────────────────────────────────────────────────────────────────
async function healFlow(R, H, Roster) {
  const words = H.words;
  const hurtOnes = H.party().filter(hurt);
  const bewitched = H.party().filter((m) => cursedOn(m).length);
  if (!hurtOnes.length && !bewitched.length) { await R.say(words(CHURCH_WORDS.healNone)); await R.hush(); return; }
  // The whispering ring comes off first, free, and the priest says so (VOICE-BIBLE 24).
  if (bewitched.length) {
    for (const m of bewitched) for (const c of cursedOn(m)) delete m.equip[c.slot];
    guard('uncurse sfx', () => Sfx.play('level_up_sparkle', { vol: 0.6 }));
    Bus.emit('church.uncurse', { count: bewitched.length });
    await R.say(words(CHURCH_WORDS.uncurse));
    if (!R.alive) return;
    await R.hush();
    if (!hurtOnes.length) return;
  }
  const poisoned = hurtOnes.filter((m) => m.status);
  guard('heal', () => (Roster && Roster.heal ? Roster.heal() : null));
  guard('heal sfx', () => Sfx.play('heal', { vol: 0.8 }));
  Bus.emit('church.heal', { count: hurtOnes.length });
  await UI.wait(0.25);
  if (!R.alive) return;
  const who = hurtOnes.map((m) => m.name).join(', ');
  await R.say(words(CHURCH_WORDS.heal) + '{p}{green}' + who + '{/green} ' + (hurtOnes.length > 1 ? 'are' : 'is') + ' mended.'
    + (poisoned.length ? '{n}The green has gone out of ' + (poisoned.length > 1 ? 'them' : poisoned[0].name) + '.' : ''));
  await R.hush();
}

// ── calling somebody back (free) ────────────────────────────────────────────────────────────────────────────
async function reviveFlow(R, H, Roster) {
  const words = H.words;
  const down = H.party().filter(fallen);
  if (!down.length) { await R.say(words(CHURCH_WORDS.reviveNone)); await R.hush(); return; }
  let m = down[0];
  if (down.length > 1) {
    R.patter(CHURCH_WORDS.reviveWho);
    const list = R.mkMenu({ id: 's-revive', left: 34, top: 180, minWidth: 320, origin: '0% 0%',
      title: 'Who shall we call back?', items: down.map((x) => ({ id: x.id, label: x.name, right: 'Lv ' + (x.lvl || 1) })) });
    const pick = await list.choose();
    await R.closeWin(list);
    if (!R.alive) return;
    if (!pick) { await R.hush(); return; }
    m = down.find((x) => x.id === pick.id) || down[0];
  }
  const s = guard('stats', () => statsFor(m), null);
  m.hp = s ? Math.max(1, Math.floor(s.hp * 0.5)) : 1;
  m.status = undefined;
  guard('revive sfx', () => Sfx.play('level_up_sparkle', { vol: 0.7 }));
  Bus.emit('church.revive', { who: m.id });
  await UI.wait(0.3);
  if (!R.alive) return;
  await R.say(words(CHURCH_WORDS.revive, { NAME: m.name }));
  await R.hush();
}

// ── the candle: the only thing in a church that costs anything ──────────────────────────────────────────────
async function candleFlow(R, H) {
  const words = H.words;
  const price = Church.CANDLE_PRICE;
  if (H.gold() < price) {
    guard('buzz', () => Sfx.play('buzzer', { vol: 0.5 }));
    await R.say(words('The blessing is free. / The candle is %N% gold. / Today, take the blessing.', { N: price }));
    await R.hush();
    return;
  }
  await R.say(words('The blessing is free. / The candle is %N% gold.', { N: price }), { wait: false });
  const yes = await R.yesNo({ yes: 'Light one', no: 'Not today' });
  if (!R.alive) return;
  if (!yes) { await R.hush(); return; }
  await R.pay(price);
  guard('candle', () => Sfx.play('item_get', { vol: 0.5, pitch: 1.2 }));
  Bus.emit('church.candle', {});
  await R.say(words('There. / Most people find the blessing / goes further with a candle.'));
  await R.hush();
}

/** A small window the defeat flow (P14/P15) can borrow: who woke up, and the priest's line. */
export function wakePanel(party = []) {
  return h('div', [
    h('div.dq-header', 'Everyone is standing up'),
    ...party.map((m) => h('div.dq-row', [h('span.dq-grow', m.name), h('span.dq-num', 'Lv ' + (m.lvl || 1))])),
  ]);
}

export default runChurch;
