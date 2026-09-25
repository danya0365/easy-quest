/**
 * saltmarrow.npcs.js — the people of Saltmarrow.                       (P23B people layer of saltmarrow.js)
 *
 * WORLD-BIBLE §2 [03] names four, word for word, and they are all here: WILLOW PYE (eight, fearless, has already
 * decided you are her friend), DODD PYE her father (kind, permanently apologising), OZZY KETTLEBY the mill-boy
 * (thinks he is a bandit chief; currently it is him and a duck) and GOODWIFE SUMP (turnips, at speed).
 * SERA FAIRWEATHER is in the inn parlour being politely bored, which is CANON B4.
 *
 * The npc ids `dodd`, `sump`, `saltmarrow_smith`, `saltmarrow_oddments`, `saltmarrow_priest` and
 * `saltmarrow_banker` are the ones src/data/shops.js already has counters for (P22 opens a counter when a
 * conversation with that id ends), so the inn bed, both shops, the chapel and the bank all work from here.
 * Goodwife Sump is BOTH the grocer and the town crier (WORLD-BIBLE §6.5), which is exactly right of her.
 */
const DEG = 180 / Math.PI;
function spot(base, name, fallback) {
  const s = base && base.spots && base.spots[name];
  if (s && Number.isFinite(+s.x)) return { x: +s.x, z: +s.z, facing: Number.isFinite(+s.facing) ? +s.facing * DEG : (fallback && fallback.facing) || 0 };
  return fallback || { x: 0, z: 0, facing: 0 };
}

export default function saltmarrowPeople(base = {}) {
  const S = (base && base.spots) || {};
  const willow = spot(base, 'willow', { x: -2.0, z: -6.4, facing: 80 });
  const dodd = spot(base, 'dodd', { x: 1.8, z: -4.0, facing: 180 });
  const ozzy = spot(base, 'ozzy', { x: -11.4, z: 3.2, facing: 180 });
  const sump = spot(base, 'sump', { x: -7.6, z: -9.4, facing: 110 });
  const smith = spot(base, 'smith', { x: -14.6, z: -10.6, facing: 150 });
  const odd = spot(base, 'oddments', { x: -16.4, z: -10.2, facing: 150 });
  const priest = spot(base, 'priest', { x: 9.7, z: -12.6, facing: 175 });
  const banker = spot(base, 'banker', { x: 16.0, z: -1.0, facing: 145 });
  const sera = spot(base, 'sera', { x: 4.6, z: -4.4, facing: 35 });
  const gulls = S.gulls || [{ x: 6, z: -1 }];

  return {
    npcs: [
      {
        id: 'willow', name: 'Willow Pye', char: 'willow', voice: 'willow', scale: 0.99, girth: 0.98,
        x: willow.x, z: willow.z, facing: willow.facing, idle: 'stand', wander: 1.4, radius: 0.42,
        script: [{
          first: ['You’re the boy from over the beck.{p}You look like you need someone\nbrave.'],
          again: [{ cycle: [
            'There’s a ghost house in the wood.\nI’m going. You can come if you\ndon’t cry.',
            'I have been up to the gates\ntwice. Twice! The second time I\nwaved.',
            'Dad says it’s a *version*. Dad\nhas never been.',
            'If you’re coming, come. If you’re\nnot, say so and I shall think\nless of you but still be your\nfriend.',
          ] }] }],
      },
      {
        id: 'dodd', name: 'Dodd Pye', char: 'villager', variant: 'innkeeper', voice: 'low:0.94',
        wear: 'teal', scale: 1.03, girth: 1.12, hold: 'jug',
        x: dodd.x, z: dodd.z, facing: dodd.facing, idle: 'stand', radius: 0.48,
        script: [{
          first: ['Twelve gold a bed, and I’ll not\ncharge the cat.{p}I’m Dodd. That’s my daughter.\nI’m sorry.'],
          again: [{ cycle: [
            'If our Willow has told you about\nthe manor, she’s told you a\n*version* of it.',
            'Beds are up the stair, and the\nparrot is a liar.',
            'Her mother was brave as well.\nI married into it.',
          ] }] }],
      },
      {
        id: 'sump', name: 'Goodwife Sump', char: 'villager', variant: 'granny', voice: 'high:1.08',
        wear: 'mustard', scale: 0.97, girth: 1.1, hold: 'basket',
        x: sump.x, z: sump.z, facing: sump.facing, idle: 'stand', radius: 0.46, crier: true,
        script: [{
          first: ['Turnips, turnips, and — no,\nthat’s a turnip too.'],
          again: [{ cycle: [
            'Sir Halvard walked through at\ndawn. Grim as a Monday, that\nman.',
            'Willow Pye is at the north gate\nagain. Somebody is going to have\nto go with her.',
            'The mill hopper wants looking at.\nFlour hides things. Flour has\nalways hidden things.',
            'Fourpence the bunch and I’ll\nthrow in the gossip free, which\nis the expensive part.',
          ] }] }],
      },
      {
        id: 'ozzy', name: 'Ozzy Kettleby', char: 'villager', variant: 'child', voice: 'high:1.22',
        wear: 'rust', scale: 1.02, girth: 1.0, hold: 'none',
        x: ozzy.x, z: ozzy.z, facing: ozzy.facing, idle: 'stand', wander: 1.0, radius: 0.4,
        script: [{
          first: ['Toll to cross. That’s two gold.{p}...Fine. Nothing. Don’t tell.'],
          again: [{ cycle: [
            'One day I’ll have a *proper* gang.\nCurrently it’s me and a duck.',
            'The duck is called Terror. He\ndoes not know this.',
            'I could get into that manor. I\nchoose not to. Strategically.',
          ] }] }],
      },
      {
        id: 'saltmarrow_smith', name: 'Hob Anvil', char: 'villager', variant: 'innkeeper', voice: 'low:0.86',
        wear: 'ink', scale: 1.06, girth: 1.14, hold: 'hammer',
        x: smith.x, z: smith.z, facing: smith.facing, idle: 'stand', radius: 0.48,
        script: [{ cycle: [
          'Copper sword. Pot lid. Straw hat.\nThat is the whole of my art and\nI am proud of it.',
          'A pot lid is a shield if you\nbelieve it. Believe it.',
        ] }],
      },
      {
        id: 'saltmarrow_oddments', name: 'a woman with a great many pockets', char: 'villager', variant: 'merchant',
        voice: 'high:0.9', wear: 'berry', scale: 0.98, girth: 1.02,
        x: odd.x, z: odd.z, facing: odd.facing, idle: 'stand', radius: 0.44,
        script: [{ cycle: [
          'One acorn. Very lucky.{p}I have had it for years and\nlook at me.',
          'Everything in these pockets was\nsomebody’s favourite thing once.',
        ] }],
      },
      {
        id: 'saltmarrow_priest', name: 'the priest', char: 'villager', variant: 'nun', voice: 'low:1.02',
        wear: 'ink', scale: 1.0, girth: 1.0,
        x: priest.x, z: priest.z, facing: priest.facing, idle: 'stand', radius: 0.44,
        script: [{ cycle: [
          'Sit if you like. Or don’t. The\nbench has no opinion.',
          'If it goes badly out there, you\nwake up in here. That is the\narrangement and it has never\nonce been broken.',
        ] }],
      },
      {
        id: 'saltmarrow_banker', name: 'the teller', char: 'villager', variant: 'merchant', voice: 'low:1.1',
        wear: 'slate', scale: 1.0, girth: 0.96,
        x: banker.x, z: banker.z, facing: banker.facing, idle: 'stand', radius: 0.44,
        script: [{ cycle: [
          'Gold in a pocket goes for a walk.\nGold in here stays put.',
          'A hundred at a time, and I write\nit down twice, because once is\nhow arguments start.',
        ] }],
      },
      {
        id: 'sera', name: 'Sera Fairweather', char: 'sera', voice: 'sera', scale: 0.96, girth: 0.95,
        x: sera.x, z: sera.z, facing: sera.facing, idle: 'stand', radius: 0.4,
        script: [{
          first: ['I have been outside exactly once.{p}It had ghosts in it. I should\nlike to go again.'],
          again: [{ cycle: [
            'Everyone who comes here wants\nsomething. You want... directions?\nOh. How *restful*.',
            'If she is going, I am going, and\nI shall wear the wrong shoes\nand not mention it.',
            'My carriage is at four. It can\nwait. Carriages are extremely\npatient.',
          ] }] }],
      },
      { id: 'gull-1', name: 'a gull', animal: 'duck', tint: 'white', voice: 'monster:1.44',
        x: gulls[0].x, z: gulls[0].z, facing: 0, idle: 'hen', radius: 1.4,
        text: ['A gull, standing on a bollard,\nfully prepared to take your\nlunch and your dignity.'] },
    ],
    lines: {
      'inn-door': ['{gold}THE CONTENTED HERRING{/gold}\nTwelve gold a bed.',
        'Mr Pye is stood right outside\nit, so you might as well ask\nhim.'],
    },
  };
}
