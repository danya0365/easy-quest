/**
 * road_beck.npcs.js — the people on the Beck road.                     (P23B people layer of road_beck.js)
 *
 * A road is not empty. Three people are on it, all of them going somewhere, all of them glad you came:
 * a carter whose wheel is off, a shepherd who has counted his flock four times, and a girl fishing the Beck
 * who is losing. Facings are DEGREES here; the base map publishes radians and spot() converts.
 */
const DEG = 180 / Math.PI;
function spot(base, name, fallback) {
  const s = base && base.spots && base.spots[name];
  if (s && Number.isFinite(+s.x)) return { x: +s.x, z: +s.z, facing: Number.isFinite(+s.facing) ? +s.facing * DEG : (fallback && fallback.facing) || 0 };
  return fallback || { x: 0, z: 0, facing: 0 };
}

export default function beckPeople(base = {}) {
  const carter = spot(base, 'carter', { x: -4.0, z: -0.4, facing: 90 });
  const shepherd = spot(base, 'shepherd', { x: 7.0, z: -12.0, facing: 135 });
  const fisher = spot(base, 'fisher', { x: -16.6, z: 4.4, facing: 20 });

  return {
    npcs: [
      {
        id: 'beck-carter', name: 'Wick Dray', char: 'villager', variant: 'farmer', voice: 'low:0.84',
        wear: 'clay', scale: 1.04, girth: 1.06, hold: 'hammer',
        x: carter.x, z: carter.z, facing: carter.facing, idle: 'stand', radius: 0.45,
        script: [{ first: ['Don’t help. You’ll want to help,\nand then there’ll be two of us\nunder it.'],
          again: [{ cycle: [
            'Wheel came off at the bridge.\nI blame the bridge.',
            'Saltmarrow’s down there. You’ll\nsmell it before you see it, and\nthat is a compliment.',
            'If you meet a girl about your\nsize who says she is brave —\nshe is. Worse luck.',
            '*He looks at the wheel. The wheel\nlooks at him. Neither of them\nblinks.*',
          ] }] }],
      },
      {
        id: 'beck-shepherd', name: 'Old Lammas', char: 'villager', variant: 'farmer', voice: 'low:0.76',
        wear: 'moss', scale: 1.01, girth: 1.02, hold: 'none',
        x: shepherd.x, z: shepherd.z, facing: shepherd.facing, idle: 'stand', radius: 0.45,
        script: [{ cycle: [
          'Twelve. Twelve. Twelve. Thirteen.{p}...Twelve.',
          'That gate stays shut. Not for\nthe sheep. For the sheep’s\nideas.',
          'Road’s safe enough. Off the road\nis where things live.',
        ] }],
      },
      {
        id: 'beck-fisher', name: 'Cress', char: 'villager', variant: 'child', voice: 'high:1.34',
        wear: 'sky', scale: 0.93, girth: 0.95, hold: 'none',
        x: fisher.x, z: fisher.z, facing: fisher.facing, idle: 'sit', radius: 0.4,
        script: [{ cycle: [
          'I have been here since breakfast\nand I have caught a boot and\nsome opinions.',
          'There is a big one under the\nbridge. Everyone says so. Nobody\nhas met him.',
          'If you go to the manor, don’t.{p}If you do, wave at the window\nfor me.',
        ] }],
      },
    ],
    lines: {
      sheep: ['A sheep. It considers you at\nsome length and finds you\nacceptable.'],
    },
  };
}
