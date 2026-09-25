/**
 * road_wood.npcs.js — the three people in the Whispering Wood.          (P23B people layer of road_wood.js)
 *
 * WORLD-BIBLE §6.5: "Escort NPCs. In Act I, Willow and Father physically walk to the next place and wait,
 * calling your name every 20 seconds. A child follows a person; a child ignores an arrow." So Willow is one bend
 * up the lane, waiting, and she says so. The charcoal burner is at his ring, and a hermit sits in the clearing
 * with the standing stone, on the grounds that somebody has to.
 */
const DEG = 180 / Math.PI;
const spot = (base, name, fb) => {
  const s = base && base.spots && base.spots[name];
  return (s && Number.isFinite(+s.x)) ? { x: +s.x, z: +s.z, facing: Number.isFinite(+s.facing) ? +s.facing * DEG : (fb && fb.facing) || 0 } : (fb || { x: 0, z: 0, facing: 0 });
};

export default function woodPeople(base = {}) {
  const willow = spot(base, 'willow', { x: -1.0, z: 12.0, facing: 180 });
  const burner = spot(base, 'burner', { x: -15.0, z: -12.4, facing: 250 });
  const hermit = spot(base, 'hermit', { x: 15.4, z: 1.2, facing: 110 });
  return {
    npcs: [
      {
        id: 'wood-willow', name: 'Willow Pye', char: 'willow', voice: 'willow', scale: 0.99, girth: 0.98,
        x: willow.x, z: willow.z, facing: willow.facing, idle: 'stand', radius: 0.42, escort: true,
        script: [{
          first: ['There you are. I have been brave\nfor eleven minutes on my own and\nit is not as good.'],
          again: [{ cycle: [
            'Straight up the lane and then\nthe gates. I am not scared. I am\n*waiting*.',
            'Listen. That is the wind. That is\nALSO the wind.{p}Come on.',
            'If something happens I shall\nscream, and then I shall hit it,\nin that order.',
          ] }] }],
      },
      {
        id: 'wood-burner', name: 'Cinder Mott', char: 'villager', variant: 'farmer', voice: 'low:0.72',
        wear: 'ink', scale: 1.02, girth: 1.06, hold: 'none',
        x: burner.x, z: burner.z, facing: burner.facing, idle: 'stand', radius: 0.46,
        script: [{ cycle: [
          'Fortnight, this heap takes. I\nsleep out with it. We talk.',
          'It says nothing. That is the\nbest conversation I get all\nmonth.',
          'Up at the house? Lights. Always\none. Never two.',
        ] }],
      },
      {
        id: 'wood-hermit', name: 'Somebody’s Aunt', char: 'villager', variant: 'granny', voice: 'high:0.9',
        wear: 'moss', scale: 0.95, girth: 1.06, hold: 'none',
        x: hermit.x, z: hermit.z, facing: hermit.facing, idle: 'sit', radius: 0.42,
        script: [{ cycle: [
          'Somebody has to sit with the\nstone. It has been sat with for\nnine hundred years and I am not\nbreaking the run.',
          'There is a lark cut on it. When\nyou are older that will matter\nvery much.',
          'Take the log. Not with you. Just\n*take* it, in your head, for\nlater.',
        ] }],
      },
    ],
    lines: {},
  };
}
