/**
 * cobwell_manor.npcs.js — the ghosts of the ground floor.          (P23B people layer of cobwell_manor.js)
 *
 * WORLD-BIBLE §2 [04] names four ghosts, gives each of them two lines, and says the thing that matters:
 * "all four are talkable and none of them attack". BARNABY THE BUTLER-SHADE blocks you politely in the hall,
 * THE CHANDELIER CAT is a cat (ghost; still a cat), and MASTER FEN is under the Long Stair, winning.
 * Willow and Sera come in with you (CANON B6) and stand in the hall saying so.
 */
const DEG = 180 / Math.PI;
const spot = (base, name, fb) => {
  const s = base && base.spots && base.spots[name];
  return (s && Number.isFinite(+s.x)) ? { x: +s.x, z: +s.z, facing: Number.isFinite(+s.facing) ? +s.facing * DEG : (fb && fb.facing) || 0 } : (fb || { x: 0, z: 0, facing: 0 });
};

export default function manorPeople(base = {}) {
  const barnaby = spot(base, 'barnaby', { x: 0, z: 14.4, facing: 0 });
  const fen = spot(base, 'fen', { x: 1.2, z: -5.6, facing: 145 });
  const cat = (base.spots && base.spots.cat) || { x: -4.0, z: 5.0 };
  const willow = spot(base, 'willow', { x: -2.4, z: 15.2, facing: 35 });
  const sera = spot(base, 'sera', { x: 2.6, z: 15.4, facing: 320 });
  return {
    npcs: [
      {
        id: 'barnaby', name: 'Barnaby the Butler-shade', char: 'villager', variant: 'innkeeper', voice: 'low:0.9',
        wear: 'ink', scale: 1.04, girth: 0.94, hold: 'none', ghost: true,
        x: barnaby.x, z: barnaby.z, facing: barnaby.facing, idle: 'stand', radius: 0.44,
        script: [{
          first: ['Madam is not receiving.{p}Madam has not received since\nthe Tuesday she died.',
            '...You have a name, I suppose.\nEverybody does. Go on.',
            '{wait:300}Very good. Then you are expected,\nwhich is the first time I have\nsaid that in two hundred years.',
            'The {gold}CANDLE{/gold} is on the table.\nTake it. And take this —\na {gold}RETREAT BELL{/gold}.',
            'For guests who find they must\nleave. Ring it anywhere and you\nwill be at the gates. One does\nnot trap people. One is a\nBUTLER.'],
          again: [{ cycle: [
            'If you must wander, do wipe your\nfeet. Some of us have standards\nand no legs.',
            'The gallery. Nine of the eleven\nwill watch you. Two will not.{p}I have never cared for those\ntwo.',
            'Draughts on the stair. Sconces\non the wall. One follows from\nthe other, sir.',
            'There is a boy under the stairs.\nHe is winning. Let him.',
          ] }] }],
      },
      {
        id: 'fen', name: 'Master Fen', char: 'villager', variant: 'child', voice: 'high:1.44',
        wear: 'slate', scale: 0.84, girth: 0.9, hold: 'none', ghost: true,
        x: fen.x, z: fen.z, facing: fen.facing, idle: 'sit', radius: 0.36,
        script: [{
          first: ['I’m winning.{p}I’ve been winning for ever such\na long time.'],
          again: [{ cycle: [
            'Don’t find me. If you find me,\nthe game’s over, and then what\nhave I got?',
            'Somebody counted to a hundred\nonce. That was the last bit I\nliked.',
            '*He shuffles further under the\nstair, very pleased with\nhimself.*',
            'You can hide too if you want.\nThere’s room. There’s always been\nroom.',
          ] }] }],
      },
      {
        id: 'chandelier-cat', name: 'the Chandelier Cat', animal: 'cat', tint: 'white', voice: 'monster:1.36',
        ghost: true,
        x: cat.x, z: cat.z, facing: 90, idle: 'curl', wander: 1.6, radius: 1.2,
        script: [{ cycle: [
          'Mrrp.',
          '(It rolls over. It is transparent.\nIt wants its tummy rubbed and\nthere is nothing to rub.)',
          'Mrrp?',
        ] }],
      },
      {
        id: 'manor-willow', name: 'Willow Pye', char: 'willow', voice: 'willow', scale: 0.99, girth: 0.98,
        x: willow.x, z: willow.z, facing: willow.facing, idle: 'stand', radius: 0.42,
        script: [{
          first: ['See? A house. A house cannot do\nanything to you. Houses have no\nARMS.'],
          again: [{ cycle: [
            'I am going ahead. If I stop\nwhistling, come and find me.',
            'There is a kitten in this house.\nI can hear it. Everyone says I\ncan’t but I CAN.',
            '*She is holding the end of her\nribbon and not noticing that\nshe is.*',
          ] }] }],
      },
      {
        id: 'manor-sera', name: 'Sera Fairweather', char: 'sera', voice: 'sera', scale: 0.96, girth: 0.95,
        x: sera.x, z: sera.z, facing: sera.facing, idle: 'stand', radius: 0.4,
        script: [{
          first: ['I have decided that I am\nenjoying this. It took a moment.'],
          again: [{ cycle: [
            'The dust is *historic*. I shall\nsay that at dinner and be\nthought clever.',
            'If there is a cat I should like\nto be the one holding it,\nplease.',
            'Do not tell my father about the\nshoes.',
          ] }] }],
      },
    ],
    lines: {},
  };
}
