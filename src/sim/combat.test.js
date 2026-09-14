import { describe, it, expect } from 'vitest';
import { makeRng } from './rng.js';
import {
  createParty, createCharacter, addCharacter, applyDamage, character,
  Condition, Row, CharacterClass, Skill, roster,
} from './party.js';
import {
  beginEncounter, selectAction, resolveRound, attackBand, damageFor,
  turnOrder, meleeTargets, rangedTargets, frontRowHolds, attemptFlee,
  createEnemy, createEnemyGroup, encounterOutcome,
  Band, Action, Outcome, MAX_ENEMY_ROW, MIN_DAMAGE_FRACTION,
} from './combat.js';

const hero = (id, over = {}) =>
  createCharacter({ id, name: id, characterClass: CharacterClass.FIGHTER, row: Row.FRONT, ...over });

function party(...members) {
  const p = createParty();
  for (const m of members) addCharacter(p, m);
  return p;
}

const orc = (id, over = {}) => createEnemy({ id, name: 'Orc', row: Row.FRONT, hitPoints: 12, potValue: 20, ...over });

function encounter({ members, enemies, light = 'BRIGHT', partyAware = true, enemiesAware = true, seed = 7 } = {}) {
  return beginEncounter({
    party: party(...members),
    enemies: createEnemyGroup(enemies),
    light,
    awareness: { party: partyAware, enemies: enemiesAware },
    rng: makeRng(seed),
    origin: { floorId: 'f1', x: 3, y: 4 },
  });
}

describe('attack bands', () => {
  // @spec COMBAT-ATTACK-002
  it('resolves every attack into exactly one of four bands', () => {
    const bands = new Set();
    for (let roll = 1; roll <= 100; roll++) {
      for (const delta of [-60, -20, 0, 20, 60, 120]) {
        bands.add(attackBand(roll, delta));
      }
    }
    for (const band of bands) expect(Object.values(Band)).toContain(band);
    expect(bands.size).toBe(4);
  });

  // @spec COMBAT-ATTACK-006
  it('never produces a worse band for a greater accuracy advantage on the same roll', () => {
    for (let roll = 1; roll <= 100; roll += 7) {
      const order = [Band.MISS, Band.GRAZE, Band.HIT, Band.CRIT];
      let previous = -1;
      for (let delta = -80; delta <= 120; delta += 10) {
        const rank = order.indexOf(attackBand(roll, delta));
        expect(rank).toBeGreaterThanOrEqual(previous);
        previous = rank;
      }
    }
  });

  // @spec COMBAT-ATTACK-002
  it('misses only when badly outmatched, so a fair fight rarely whiffs', () => {
    const even = [];
    for (let roll = 1; roll <= 100; roll++) even.push(attackBand(roll, 0));
    const misses = even.filter((b) => b === Band.MISS).length;

    // An evenly matched attacker whiffs on a small minority of rolls.
    expect(misses).toBeGreaterThan(0);
    expect(misses).toBeLessThan(25);
  });

  // @spec COMBAT-ATTACK-002
  it('needs a large accuracy advantage before crits become common', () => {
    const slight = [];
    const huge = [];
    for (let roll = 1; roll <= 100; roll++) {
      slight.push(attackBand(roll, 10));
      huge.push(attackBand(roll, 95));
    }

    // A small edge crits occasionally; only a large one crits reliably.
    expect(slight.filter((b) => b === Band.CRIT).length).toBeLessThan(15);
    expect(huge.filter((b) => b === Band.CRIT).length).toBeGreaterThan(50);
  });
});

describe('damage', () => {
  // @spec COMBAT-ATTACK-003
  it('deals nothing at all on a miss', () => {
    expect(damageFor(Band.MISS, 40, 0)).toBe(0);
    expect(damageFor(Band.MISS, 40, 999)).toBe(0);
  });

  // @spec COMBAT-ATTACK-004
  it('grazes for less than it hits, and crits for more', () => {
    const graze = damageFor(Band.GRAZE, 40, 0);
    const hit = damageFor(Band.HIT, 40, 0);
    const crit = damageFor(Band.CRIT, 40, 0);

    expect(graze).toBeLessThan(hit);
    expect(crit).toBeGreaterThan(hit);
  });

  // @spec COMBAT-ATTACK-005
  it('never reduces a landed blow to nothing, however heavy the armour', () => {
    for (const band of [Band.GRAZE, Band.HIT, Band.CRIT]) {
      const crushed = damageFor(band, 40, 9999);
      expect(crushed).toBeGreaterThanOrEqual(1);
      expect(crushed).toBeGreaterThanOrEqual(Math.ceil(40 * MIN_DAMAGE_FRACTION));
    }
  });

  // @spec COMBAT-ATTACK-005
  it('floors at one even for a feeble attack against nothing at all', () => {
    expect(damageFor(Band.GRAZE, 1, 9999)).toBe(1);
  });
});

describe('turn order', () => {
  // @spec COMBAT-ROUND-002
  it('resolves in descending Dexterity', () => {
    const quick = hero('quick', { attributes: { DEXTERITY: 18 } });
    const slow = hero('slow', { attributes: { DEXTERITY: 6 }, row: Row.BACK });
    const state = encounter({ members: [quick, slow], enemies: [orc('o1', { dexterity: 12 })] });

    expect(turnOrder(state).map((c) => c.id)).toEqual(['quick', 'o1', 'slow']);
  });

  // @spec COMBAT-ROUND-003
  it('gives a tie to the party', () => {
    const c = hero('hero', { attributes: { DEXTERITY: 12 } });
    const state = encounter({ members: [c], enemies: [orc('o1', { dexterity: 12 })] });

    expect(turnOrder(state).map((c) => c.id)).toEqual(['hero', 'o1']);
  });

  // @spec COMBAT-ROUND-004
  it('settles a tie within the party by a fixed order of position', () => {
    const a = hero('a', { attributes: { DEXTERITY: 10 } });
    const b = hero('b', { attributes: { DEXTERITY: 10 } });
    const state = encounter({ members: [a, b], enemies: [orc('o1', { dexterity: 1 })] });

    expect(turnOrder(state).map((c) => c.id).slice(0, 2)).toEqual(['a', 'b']);
    // And it is stable across repeated reads.
    expect(turnOrder(state).map((c) => c.id)).toEqual(turnOrder(state).map((c) => c.id));
  });

  // @spec COMBAT-ROUND-005
  it('gives every combatant exactly one turn in a round', () => {
    const state = encounter({
      members: [hero('a'), hero('b', { row: Row.BACK })],
      enemies: [orc('o1'), orc('o2')],
    });

    const ids = turnOrder(state).map((c) => c.id);
    expect(ids).toHaveLength(4);
    expect(new Set(ids).size).toBe(4);
  });
});

describe('reach', () => {
  // @spec COMBAT-REACH-001
  it('lets melee reach only the front row while someone conscious stands there', () => {
    const state = encounter({
      members: [hero('front'), hero('back', { row: Row.BACK })],
      enemies: [orc('o1')],
    });

    expect(meleeTargets(state, 'o1').map((t) => t.id)).toEqual(['front']);
  });

  // @spec COMBAT-REACH-002
  // @spec COMBAT-REACH-003
  it('opens the back row to melee once the last conscious front-rower falls', () => {
    const state = encounter({
      members: [hero('front'), hero('back', { row: Row.BACK })],
      enemies: [orc('o1')],
    });
    expect(frontRowHolds(state.party)).toBe(true);

    applyDamage(state.party, 'front', 9999);

    expect(character(state.party, 'front').condition).toBe(Condition.UNCONSCIOUS);
    // A body shields nobody.
    expect(frontRowHolds(state.party)).toBe(false);
    expect(meleeTargets(state, 'o1').map((t) => t.id)).toEqual(['back']);
  });

  // @spec COMBAT-REACH-004
  it('lets a back-row character melee only with a reaching weapon', () => {
    const state = encounter({
      members: [hero('front'), hero('spear', { row: Row.BACK })],
      enemies: [orc('o1')],
    });

    expect(meleeTargets(state, 'spear', { reaching: false })).toEqual([]);
    expect(meleeTargets(state, 'spear', { reaching: true }).map((t) => t.id)).toEqual(['o1']);
  });

  // @spec COMBAT-REACH-005
  it('lets ranged attacks and spells reach either row', () => {
    const state = encounter({
      members: [hero('front')],
      enemies: [orc('o1'), orc('o2', { row: Row.BACK })],
    });

    expect(rangedTargets(state, 'front').map((t) => t.id).sort()).toEqual(['o1', 'o2']);
  });

  // @spec COMBAT-ENEMY-004
  it('makes an enemy pick a melee target from the party front row', () => {
    const state = encounter({
      members: [hero('front'), hero('back', { row: Row.BACK })],
      enemies: [orc('o1')],
    });

    for (let i = 0; i < 20; i++) {
      expect(meleeTargets(state, 'o1').every((t) => t.row === Row.FRONT)).toBe(true);
    }
  });
});

describe('enemy groups', () => {
  // @spec COMBAT-ENEMY-001
  it('gives an enemy group both rows', () => {
    const group = createEnemyGroup([orc('a'), orc('b', { row: Row.BACK })]);

    expect(group.members.filter((e) => e.row === Row.FRONT)).toHaveLength(1);
    expect(group.members.filter((e) => e.row === Row.BACK)).toHaveLength(1);
  });

  // @spec COMBAT-ENEMY-002
  it('is not capped at five', () => {
    const swarm = createEnemyGroup(Array.from({ length: 9 }, (_, i) => orc(`o${i}`, { row: i < 5 ? Row.FRONT : Row.BACK })));

    expect(swarm.members).toHaveLength(9);
  });

  // @spec COMBAT-ENEMY-003
  it('holds at most ten in either row', () => {
    const tooMany = Array.from({ length: 12 }, (_, i) => orc(`o${i}`));
    const group = createEnemyGroup(tooMany);

    expect(group.members.filter((e) => e.row === Row.FRONT)).toHaveLength(MAX_ENEMY_ROW);
  });
});

describe('surprise', () => {
  // @spec COMBAT-SURPRISE-001
  it('gives the aware side a free round when the other is unaware', () => {
    const ambushed = encounter({ members: [hero('a')], enemies: [orc('o1')], partyAware: false });
    const ambushing = encounter({ members: [hero('a')], enemies: [orc('o1')], enemiesAware: false });

    expect(ambushed.surpriseRoundFor).toBe('ENEMIES');
    expect(ambushing.surpriseRoundFor).toBe('PARTY');
  });

  // @spec COMBAT-SURPRISE-002
  it('begins ordinarily when both sides are aware, or neither', () => {
    expect(encounter({ members: [hero('a')], enemies: [orc('o1')] }).surpriseRoundFor).toBeNull();
    expect(encounter({
      members: [hero('a')], enemies: [orc('o1')], partyAware: false, enemiesAware: false,
    }).surpriseRoundFor).toBeNull();
  });
});

describe('fizzling', () => {
  // @spec COMBAT-ROUND-006
  it('spends an action aimed at a target that is already gone, and resolves nothing', () => {
    const quick = hero('quick', { attributes: { DEXTERITY: 18 } });
    const slow = hero('slow', { attributes: { DEXTERITY: 4 }, row: Row.BACK });
    const state = encounter({ members: [quick, slow], enemies: [orc('o1', { dexterity: 10, hitPoints: 1 })] });

    selectAction(state, 'quick', { action: Action.ATTACK, targetId: 'o1', baseDamage: 50, accuracy: 100 });
    selectAction(state, 'slow', { action: Action.ATTACK, targetId: 'o1', baseDamage: 50, accuracy: 100 });

    const log = resolveRound(state);
    const fizzled = log.filter((e) => e.fizzled);

    expect(fizzled).toHaveLength(1);
    expect(fizzled[0].actorId).toBe('slow');
  });

  // @spec COMBAT-ROUND-006
  it('does not pick a substitute target when the chosen one is gone', () => {
    const quick = hero('quick', { attributes: { DEXTERITY: 18 } });
    const slow = hero('slow', { attributes: { DEXTERITY: 4 } });
    const state = encounter({
      members: [quick, slow],
      enemies: [orc('o1', { dexterity: 10, hitPoints: 1 }), orc('o2', { dexterity: 10, hitPoints: 40 })],
    });

    selectAction(state, 'quick', { action: Action.ATTACK, targetId: 'o1', baseDamage: 50, accuracy: 100 });
    selectAction(state, 'slow', { action: Action.ATTACK, targetId: 'o1', baseDamage: 50, accuracy: 100 });
    resolveRound(state);

    // The other orc is untouched: the fizzled swing did not wander onto it.
    expect(state.enemies.members.find((e) => e.id === 'o2').hitPoints).toBe(40);
  });
});

describe('fleeing', () => {
  // @spec COMBAT-FLEE-004
  it('fails when the fastest enemy far outpaces the party slowest', () => {
    const state = encounter({
      members: [hero('a', { attributes: { DEXTERITY: 10 } }), hero('slow', { attributes: { DEXTERITY: 8 }, row: Row.BACK })],
      enemies: [orc('o1', { dexterity: 11 })], // 11 > 8 * 1.25
    });

    expect(attemptFlee(state).escaped).toBe(false);
  });

  // @spec COMBAT-FLEE-004
  it('can succeed when the party is not badly outpaced', () => {
    const state = encounter({
      members: [hero('a', { attributes: { DEXTERITY: 12 } })],
      enemies: [orc('o1', { dexterity: 12 })],
    });

    expect(attemptFlee(state).escaped).toBe(true);
  });

  // @spec COMBAT-FLEE-005
  it('fails against an enemy that forbids escape, however slow it is', () => {
    const state = encounter({
      members: [hero('a', { attributes: { DEXTERITY: 18 } })],
      enemies: [orc('o1', { dexterity: 1, forbidsEscape: true })],
    });

    expect(attemptFlee(state).escaped).toBe(false);
  });

  // @spec COMBAT-FLEE-003
  it('costs only the round when it fails, and may be tried again', () => {
    const state = encounter({
      members: [hero('a', { attributes: { DEXTERITY: 8 } })],
      enemies: [orc('o1', { dexterity: 20 })],
    });

    const first = attemptFlee(state);
    expect(first.escaped).toBe(false);
    expect(first.penalty).toBeUndefined();
    // Nothing bars another attempt.
    expect(attemptFlee(state).escaped).toBe(false);
    expect(character(state.party, 'a').condition).toBe(Condition.OK);
  });

  // @spec COMBAT-FLEE-002
  // @spec COMBAT-END-006
  it('returns the party where it came from and awards nothing', () => {
    const state = encounter({
      members: [hero('a', { attributes: { DEXTERITY: 12 } })],
      enemies: [orc('o1', { dexterity: 4 })],
    });

    const result = attemptFlee(state);

    expect(result.escaped).toBe(true);
    expect(result.returnTo).toEqual({ floorId: 'f1', x: 3, y: 4 });
    expect(encounterOutcome(state).outcome).toBe(Outcome.ESCAPED);
    expect(encounterOutcome(state).pot).toBeUndefined();
  });

  // @spec COMBAT-FLEE-006
  it('can be attempted in the dark on the same terms', () => {
    const lit = encounter({ members: [hero('a', { attributes: { DEXTERITY: 12 } })], enemies: [orc('o1', { dexterity: 4 })] });
    const dark = encounter({ members: [hero('a', { attributes: { DEXTERITY: 12 } })], enemies: [orc('o1', { dexterity: 4 })], light: 'DARK' });

    expect(attemptFlee(dark).escaped).toBe(attemptFlee(lit).escaped);
  });
});

describe('darkness', () => {
  // @spec COMBAT-DARK-001
  it('penalises the party accuracy in the dark', () => {
    const lit = encounter({ members: [hero('a')], enemies: [orc('o1')] });
    const dark = encounter({ members: [hero('a')], enemies: [orc('o1')], light: 'DARK' });

    expect(dark.accuracyPenalty).toBeGreaterThan(0);
    expect(lit.accuracyPenalty).toBe(0);
  });

  // @spec COMBAT-DARK-002
  it('takes deliberate target choice away from the party in the dark', () => {
    const dark = encounter({ members: [hero('a')], enemies: [orc('o1'), orc('o2')], light: 'DARK' });

    expect(dark.deliberateTargeting).toBe(false);
    expect(encounter({ members: [hero('a')], enemies: [orc('o1')] }).deliberateTargeting).toBe(true);
  });

  // @spec COMBAT-DARK-003
  it('gives the enemy nothing for the party being in the dark', () => {
    const lit = encounter({ members: [hero('a')], enemies: [orc('o1')] });
    const dark = encounter({ members: [hero('a')], enemies: [orc('o1')], light: 'DARK' });

    expect(dark.enemyAccuracyBonus).toBe(lit.enemyAccuracyBonus);
    expect(dark.enemyAccuracyBonus).toBe(0);
  });
});

describe('ending', () => {
  // @spec COMBAT-END-001
  // @spec COMBAT-END-003
  it('ends in victory and reports the pot with the skills used', () => {
    const state = encounter({ members: [hero('a')], enemies: [orc('o1', { hitPoints: 1, potValue: 30 })] });
    selectAction(state, 'a', { action: Action.ATTACK, targetId: 'o1', baseDamage: 50, accuracy: 100, skill: Skill.BLADE });
    resolveRound(state);

    const result = encounterOutcome(state);
    expect(result.outcome).toBe(Outcome.VICTORY);
    expect(result.pot).toBe(30);
    expect(result.skillsUsed).toContain(Skill.BLADE);
  });

  // @spec COMBAT-END-004
  it('reports the same pot however many rounds it took', () => {
    const quick = encounter({ members: [hero('a')], enemies: [orc('o1', { hitPoints: 1, potValue: 30 })] });
    selectAction(quick, 'a', { action: Action.ATTACK, targetId: 'o1', baseDamage: 99, accuracy: 100, skill: Skill.BLADE });
    resolveRound(quick);

    const slow = encounter({ members: [hero('a')], enemies: [orc('o1', { hitPoints: 40, potValue: 30 })] });
    for (let i = 0; i < 12 && encounterOutcome(slow).outcome === Outcome.ONGOING; i++) {
      selectAction(slow, 'a', { action: Action.ATTACK, targetId: 'o1', baseDamage: 6, accuracy: 100, skill: Skill.BLADE });
      resolveRound(slow);
    }

    expect(encounterOutcome(slow).outcome).toBe(Outcome.VICTORY);
    expect(encounterOutcome(slow).pot).toBe(encounterOutcome(quick).pot);
  });

  // @spec COMBAT-END-002
  // @spec COMBAT-END-005
  it('ends in defeat, reporting where the party fell and changing nothing further', () => {
    const state = encounter({ members: [hero('a')], enemies: [orc('o1')] });
    applyDamage(state.party, 'a', 9999);

    const result = encounterOutcome(state);
    expect(result.outcome).toBe(Outcome.DEFEAT);
    expect(result.fellAt).toEqual({ floorId: 'f1', x: 3, y: 4 });
    expect(result.pot).toBeUndefined();
    // The party is left exactly as the fight left it.
    expect(character(state.party, 'a').condition).toBe(Condition.UNCONSCIOUS);
  });

  // @spec COMBAT-ROUND-007
  it('restores nothing merely because rounds passed', () => {
    const state = encounter({ members: [hero('a')], enemies: [orc('o1', { hitPoints: 80 })] });
    applyDamage(state.party, 'a', 5);
    const wounded = character(state.party, 'a').hitPoints;

    for (let i = 0; i < 5; i++) {
      selectAction(state, 'a', { action: Action.DEFEND });
      resolveRound(state);
    }

    expect(character(state.party, 'a').hitPoints).toBe(wounded);
  });
});

describe('the shape of a round', () => {
  // @spec COMBAT-ROUND-001
  it('resolves nothing until every action has been chosen', () => {
    const state = encounter({
      members: [hero('a', { attributes: { DEXTERITY: 18 } })],
      enemies: [orc('o1', { hitPoints: 20 })],
    });

    selectAction(state, 'a', { action: Action.ATTACK, targetId: 'o1', baseDamage: 50, accuracy: 100 });

    // Choosing is not doing: the orc is untouched until the round resolves.
    expect(state.enemies.members[0].hitPoints).toBe(20);
    resolveRound(state);
    expect(state.enemies.members[0].hitPoints).toBeLessThan(20);
  });

  // @spec COMBAT-ROUND-001
  it('clears its selections once a round has resolved, so none carries over', () => {
    const state = encounter({ members: [hero('a')], enemies: [orc('o1', { hitPoints: 60 })] });
    selectAction(state, 'a', { action: Action.ATTACK, targetId: 'o1', baseDamage: 5, accuracy: 100 });
    resolveRound(state);

    const after = state.enemies.members[0].hitPoints;
    resolveRound(state); // nothing selected this time

    expect(state.enemies.members[0].hitPoints).toBe(after);
  });

  // @spec COMBAT-ATTACK-001
  it('resolves an attack from one roll set against accuracy and defence', () => {
    const feeble = encounter({ members: [hero('a')], enemies: [orc('armoured', { hitPoints: 99, armour: 200 })], seed: 3 });
    selectAction(feeble, 'a', { action: Action.ATTACK, targetId: 'armoured', baseDamage: 40, accuracy: 0 });
    const weak = resolveRound(feeble)[0];

    const sharp = encounter({ members: [hero('a')], enemies: [orc('soft', { hitPoints: 99, armour: 0 })], seed: 3 });
    selectAction(sharp, 'a', { action: Action.ATTACK, targetId: 'soft', baseDamage: 40, accuracy: 200 });
    const strong = resolveRound(sharp)[0];

    // Same roll, opposite circumstances: accuracy and defence decide the band.
    expect(weak.band).toBe(Band.MISS);
    expect(strong.band).toBe(Band.CRIT);
  });

  // @spec COMBAT-ACTION-006
  it('changes a character through the party operations, so the condition chain applies', () => {
    const state = encounter({
      members: [hero('victim', { attributes: { DEXTERITY: 1 } })],
      enemies: [orc('o1', { dexterity: 20 })],
    });
    // Stand in for an enemy landing a killing blow.
    applyDamage(state.party, 'victim', 9999);
    expect(character(state.party, 'victim').condition).toBe(Condition.UNCONSCIOUS);

    applyDamage(state.party, 'victim', 1);

    // Struck while down: the chain moved on rather than the number going lower.
    expect(character(state.party, 'victim').condition).toBe(Condition.DEAD);
    expect(character(state.party, 'victim').hitPoints).toBe(0);
  });

  // @spec COMBAT-FLEE-001
  it('escapes as a party or not at all, never one character at a time', () => {
    const state = encounter({
      members: [
        hero('swift', { attributes: { DEXTERITY: 18 } }),
        hero('lame', { attributes: { DEXTERITY: 4 }, row: Row.BACK }),
      ],
      enemies: [orc('o1', { dexterity: 10 })],
    });

    // The swift one could outrun this easily; the party cannot, and nobody is left.
    const result = attemptFlee(state);

    expect(result.escaped).toBe(false);
    expect(roster(state.party)).toHaveLength(2);
  });
});

describe('what a resolved round reports', () => {
  // @spec COMBAT-ROUND-006
  it('credits the felling blow to the blow that felled, not to every blow that landed', () => {
    const a = hero('a', { attributes: { DEXTERITY: 18 } });
    const b = hero('b', { attributes: { DEXTERITY: 12 } });
    const state = encounter({ members: [a, b], enemies: [orc('o1', { hitPoints: 20, dexterity: 1 })] });

    // Both swing at the same orc; the first wounds it, the second finishes it.
    selectAction(state, 'a', { action: Action.ATTACK, targetId: 'o1', baseDamage: 12, accuracy: 100 });
    selectAction(state, 'b', { action: Action.ATTACK, targetId: 'o1', baseDamage: 12, accuracy: 100 });
    const log = resolveRound(state);

    const felling = log.filter((e) => e.felled);
    expect(felling).toHaveLength(1);
    expect(felling[0].actorId).toBe('b');
    expect(log.find((e) => e.actorId === 'a').felled).toBe(false);
  });

  // @spec COMBAT-ROUND-006
  it('names the target of each resolved attack', () => {
    const state = encounter({ members: [hero('a')], enemies: [orc('o1')] });
    selectAction(state, 'a', { action: Action.ATTACK, targetId: 'o1', baseDamage: 5, accuracy: 100 });

    expect(resolveRound(state)[0].targetId).toBe('o1');
  });
});
