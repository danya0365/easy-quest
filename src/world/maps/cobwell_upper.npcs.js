/**
 * cobwell_upper.npcs.js — the ballroom floor.                      (P23B people layer of cobwell_upper.js)
 *
 * WORLD-BIBLE §2 [04]: OTTILIE, THE WAITING BRIDE — "sad, gentle, does not know she is dead" — at her window,
 * and the twelve ghost-guests standing still in the ballroom, waiting for a band that will not start. Six of
 * them stand here; the rest are the chairs, which are also waiting, in their way.
 * GRANDMOTHER NETTLE (STORY laugh #4) is at the ballroom door complaining about the dust.
 */
const DEG = 180 / Math.PI;
const spot = (base, name, fb) => {
  const s = base && base.spots && base.spots[name];
  return (s && Number.isFinite(+s.x)) ? { x: +s.x, z: +s.z, facing: Number.isFinite(+s.facing) ? +s.facing * DEG : (fb && fb.facing) || 0 } : (fb || { x: 0, z: 0, facing: 0 });
};
const GUEST_LINES = [
  ['We are waiting for the band.', '(He has been waiting so long\nthat waiting is now his hobby.)'],
  ['Is it starting? Oh. No.', 'She smooths her gloves. They\nhave been smooth for a very long\ntime.'],
  ['One does not sit before the\nbride dances.', 'One has therefore not sat down\nsince 1102.'],
  ['I had the first dance promised\nme.{p}I am still holding the promise.\nLook.'],
  ['Shh. Listen. ...No.', 'Sorry. Thought I heard a\nfiddle.'],
  ['Lovely evening for it.{p}It has been a lovely evening\nfor two hundred years.'],
];

export default function upperPeople(base = {}) {
  const S = (base && base.spots) || {};
  const ottilie = spot(base, 'ottilie', { x: -8.6, z: -6.0, facing: 0 });
  const nettle = spot(base, 'nettle', { x: 0, z: 10.0, facing: 180 });
  const guests = S.guests || [];
  return {
    npcs: [
      {
        id: 'ottilie', name: 'Ottilie, the Waiting Bride', char: 'villager', variant: 'nun', voice: 'high:1.0',
        wear: 'cream', scale: 1.0, girth: 0.94, ghost: true,
        x: ottilie.x, z: ottilie.z, facing: ottilie.facing, idle: 'stand', radius: 0.42,
        script: [{
          first: ['Is it evening?{p}He said before evening.'],
          again: [{ cycle: [
            'You’ve a kind face. Would you\ntell the band to start?{p}Nobody will start.',
            'There are three music boxes in\nthis house. My mother hid them\nso the dancing would keep.{p}Find them, and it will keep.',
            'He will have been held up. The\nroad floods. It always floods.',
            '*She looks down the drive. There\nis nothing on the drive. She\nlooks anyway.*',
          ] }] }],
      },
      {
        id: 'nettle', name: 'Grandmother Nettle', char: 'villager', variant: 'granny', voice: 'high:0.88',
        wear: 'plum', scale: 0.96, girth: 1.14, hold: 'none', ghost: true,
        x: nettle.x, z: nettle.z, facing: nettle.facing, idle: 'stand', radius: 0.46,
        script: [{
          first: ['Look at it. LOOK at it.{p}Two hundred years and not one\nof them has thought to get a\nCLOTH.'],
          again: [{ cycle: [
            'I am not frightening. I am\nDISAPPOINTED. There is a\ndifference and it is worse.',
            'The child with the ribbon has\nmore sense than the entire\nhouse. Including the house.',
            'When you have finished up there,\ncome back down. There will be\ndancing, and I shall complain\nabout that too.',
          ] }] }],
      },
      ...guests.slice(0, 6).map((g, i) => ({
        id: 'guest-' + (i + 1), name: 'a ghost-guest', char: 'villager',
        variant: ['merchant', 'granny', 'innkeeper', 'nun', 'farmer', 'merchant'][i % 6],
        voice: i % 2 ? 'high:0.96' : 'low:0.94', wear: ['ink', 'slate', 'plum', 'cream', 'moss', 'berry'][i % 6],
        scale: 0.98 + (i % 3) * 0.02, girth: 0.96 + (i % 2) * 0.06, ghost: true,
        x: g.x, z: g.z, facing: (Math.atan2(0 - g.x, 5 - g.z) * DEG + 360) % 360, idle: 'stand', radius: 0.42,
        script: [{ cycle: GUEST_LINES[i % GUEST_LINES.length] }],
      })),
    ],
    lines: {},
  };
}
