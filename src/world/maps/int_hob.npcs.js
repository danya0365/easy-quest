/**
 * int_hob.npcs.js — who is in Old Hob's cottage.                  (P06 seed; P11 owns people/lines from here on)
 *
 * Hob himself is out at the well and stays there: this room is meant to be found EMPTY, because the empty chair
 * is the point (DQV-RUBRIC "Heart"). The only living thing in it is a very old cat who does the talking.
 */
const DEG = 180 / Math.PI;
function spot(base, name, fallback) {
  const s = base && base.spots && base.spots[name];
  if (s && Number.isFinite(+s.x)) return { x: +s.x, z: +s.z, facing: Number.isFinite(+s.facing) ? +s.facing * DEG : (fallback && fallback.facing) || 0 };
  return fallback || { x: 0, z: 0, facing: 0 };
}

export default function hobPeople(base = {}) {
  const cat = spot(base, 'cat', { x: -1.2, z: -2.9, facing: 130 });

  return {
    npcs: [
      {
        id: 'hb-mittens', name: 'Mittens', animal: 'cat', tint: 'grey', voice: 'monster:1.1',
        x: cat.x + 1.1, z: cat.z + 0.9, facing: 130, idle: 'curl', radius: 0.7,
        script: [{ cycle: [
          'Mrrrr.\n(She has been in charge of this\nfire since before you were\nthought of.)',
          '*Mittens opens one eye, works\nout who you are, and shuts it\nagain.*\n(Acceptable.)',
          'Prrp.\n(He comes back at dark. He always\ncomes back at dark. She is not\nworried. She is never worried.)',
          '*She looks, for a moment, at the\nempty place on the boards beside\nthe chair.*\n(...Mrow.)',
        ] }],
      },
    ],
    lines: {},
  };
}
