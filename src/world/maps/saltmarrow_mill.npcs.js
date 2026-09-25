/**
 * saltmarrow_mill.npcs.js — inside the tide mill.               (P23B people layer of saltmarrow_mill.js)
 * One miller, white to the elbows, and Ozzy Kettleby's duck, who lives here and is called Terror.
 */
const DEG = 180 / Math.PI;
const spot = (base, name, fb) => {
  const s = base && base.spots && base.spots[name];
  return (s && Number.isFinite(+s.x)) ? { x: +s.x, z: +s.z, facing: Number.isFinite(+s.facing) ? +s.facing * DEG : (fb && fb.facing) || 0 } : (fb || { x: 0, z: 0, facing: 0 });
};

export default function millPeople(base = {}) {
  const miller = spot(base, 'miller', { x: -1.0, z: -1.0, facing: 150 });
  return {
    npcs: [
      {
        id: 'mill-miller', name: 'Tam Kettleby', char: 'villager', variant: 'farmer', voice: 'low:0.9',
        wear: 'sky', scale: 1.04, girth: 1.08, hold: 'none',
        x: miller.x, z: miller.z, facing: miller.facing, idle: 'stand', radius: 0.46,
        script: [{
          first: ['Mind the stones. They do not\nmind you.{p}Tam Kettleby. The boy outside\nwith the duck is mine. I am\nsorry about the duck.'],
          again: [{ cycle: [
            'Wheel runs on the tide, not the\nwater. Stops twice a day. I have\nlearned to stop with it.',
            'Flour gets everywhere. In my\nboots. In my tea. In my *dreams*,\nlately.',
            'Have a look in the hopper if you\nlike. Everybody does. Nobody\never looks *under*.',
          ] }] }],
      },
      {
        id: 'mill-duck', name: 'Terror', animal: 'duck', tint: 'white', voice: 'monster:1.3',
        x: -3.6, z: 2.4, facing: 60, idle: 'hen', wander: 1.2, radius: 1.3,
        text: ['A duck, indoors, entirely at\nhome.{p}He has been told he is a gang\nand he believes it.'],
      },
    ],
    lines: {},
  };
}
