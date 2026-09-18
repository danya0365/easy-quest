/**
 * int_cottage.chests.js — what a child finds in the Pottles' cottage. (P06 seed; P30 owns treasure from here)
 */
export default {
  chests: [
    { id: 'ct_wardrobe', x: -4.7, z: 1.8, kind: 'wardrobe', name: 'the wardrobe', line: 'search-wardrobe', reach: 1.6 },
    { id: 'ct_drawer', x: -4.9, z: -2.9, kind: 'drawer', name: 'the dresser drawer', line: 'search-drawer', reach: 1.6 },
    { id: 'ct_pots', x: 5.4, z: 2.7, kind: 'pot', name: 'the pots', line: 'search-pots', reach: 1.5 },
    { id: 'ct_crate', x: -3.4, z: 2.9, kind: 'crate', name: 'a crate under the window', line: 'search-crate', reach: 1.6 },
    { id: 'ct_barrel', x: -5.9, z: 3.2, kind: 'barrel', name: 'the water barrel', line: 'search-barrel', reach: 1.6 },
  ],
  lines: {
    'search-wardrobe': ['%HERO% opens the wardrobe.{wait:350}{n}Sunday coats, mothballs, and a\nhat with a pheasant feather in\nit that nobody has worn since\nthe wedding.',
      'The door swings shut behind him\non its own.{p}He gets out fast.'],
    'search-drawer': ['%HERO% opens the dresser drawer.{n}Napkins nobody uses and a tin.\nIn the tin: {gold}6 gold coins{/gold} and a\nlist of what they are for.',
      'The list says "ROOF". It has\nsaid ROOF for nine years.'],
    'search-pots': ['%HERO% looks in the pots.{n}Jam. Jam. And one with a finger\nmark in the jam.',
      'The finger was about his size.\nThis is not evidence. This is\nnot even nearly evidence.'],
    'search-crate': ['%HERO% opens the crate.{n}Apples, one layer, each one\nwrapped in a bit of paper.',
      'Somebody wrapped fourteen apples\nindividually. Out of love,\nprobably. Or boredom.'],
    'search-barrel': ['%HERO% looks in the water barrel.{n}Water, a floating leaf, and his\nown face, upside down.',
      'He makes the face wobble. This\nis a good barrel.'],
    search: ['%HERO% looks round the room.{n}Everything has a place and a\nlabel and a rule about it.',
      '%HERO% listens to Mr Pottle\nbreathing.{wait:600}{n}It is the most relaxing sound in\nthe village.'],
  },
};
