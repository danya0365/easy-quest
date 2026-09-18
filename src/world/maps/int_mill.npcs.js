/**
 * int_mill.npcs.js — who is in the mill.                          (P06 seed; P11 owns people/lines from here on)
 *
 * The miller, who has stood beside a machine for forty years and now speaks at machine volume, and his
 * apprentice, who does not.
 */
const DEG = 180 / Math.PI;
function spot(base, name, fallback) {
  const s = base && base.spots && base.spots[name];
  if (s && Number.isFinite(+s.x)) return { x: +s.x, z: +s.z, facing: Number.isFinite(+s.facing) ? +s.facing * DEG : (fallback && fallback.facing) || 0 };
  return fallback || { x: 0, z: 0, facing: 0 };
}

export default function millPeople(base = {}) {
  const miller = spot(base, 'miller', { x: 1.4, z: -1.2, facing: 250 });
  const bench = spot(base, 'bench', { x: -5.0, z: 1.4, facing: 90 });

  return {
    npcs: [
      {
        id: 'ml-grist', name: 'Tobias Grist', char: 'villager', variant: 'farmer', voice: 'low:0.8',
        wear: 'clay', scale: 1.05, girth: 1.12, hold: 'none',
        x: miller.x, z: miller.z, facing: miller.facing, idle: 'stand', radius: 1.2, wave: true,
        script: [
          { first: [
            'HELLO! SORRY! I TALK LIKE THIS\nNOW!',
            'FORTY YEARS NEXT TO THAT.{p}You get used to it. Everyone\nelse does not.',
          ], again: [{ cycle: [
            'A SACK IS TWELVE GOLD. A HALF\nSACK IS SEVEN. THAT IS NOT HALF.\nI KNOW.',
            'DO NOT PUT YOUR HAND IN THE\nSTONES.{p}I WILL NOT SAY WHY. I WILL JUST\nKEEP SAYING IT.',
            'YOUR FATHER CARRIES TWO SACKS AT\nONCE. SHOWING OFF.{p}IT IS WORKING.',
            'THE WHEEL OUTSIDE IS THE BECK\'S\nIDEA. I JUST TAKE THE CREDIT.',
          ] }] },
        ],
      },
      {
        id: 'ml-nib', name: 'Nib the mill-lad', char: 'villager', variant: 'child', voice: 'high:1.24',
        wear: 'moss', scale: 0.98, girth: 0.99, hold: 'basket',
        x: bench.x + 1.4, z: bench.z + 1.8, facing: 20, idle: 'wander', radius: 1.6,
        script: [{ cycle: [
          '*mouths something, points at his\nown ear, then at the machine,\nthen shrugs*',
          'He is not angry. He is just at\nthat volume permanently.{p}I have learned to nod.',
          'I have been white since\nTuesday. My mum has given up.',
        ] }],
      },
      {
        // the mill cat: P11's animal, not a static prop — it grooms, strolls, and can be talked to
        id: 'ml-flour', name: 'Flour', animal: 'cat', tint: 'white', voice: 'monster:1.34',
        x: -3.6, z: 3.2, facing: 60, idle: 'curl', radius: 1.4,
        script: [{ cycle: [
          'Mrrp.\n(She is white because of her job,\nnot because of her mother.)',
          '*Flour looks pointedly at a\ncorner of the room, then at you,\nthen back at the corner.*\n(There is a mouse. Deal with it.)',
        ] }],
      },
    ],
    lines: {},
  };
}
