import { describe, it, expect } from 'vitest';
import { makeRng } from './rng.js';
import {
  createParty, createCharacter, addCharacter, applyDamage, character,
  Condition, CharacterClass, Skill, roster,
} from './party.js';
import {
  beginEncounter, takeAction, nextActor, advanceBeats, attackBand, damageFor,
  actingOrder, readinessOf, attackTargets, allyTargets, attemptFlee, fleeCertainToFail,
  createEnemy, createEnemyGroup, encounterOutcome,
  Band, Action, Outcome, MAX_ENEMY_GROUP, MIN_DAMAGE_FRACTION, FULL_BAR,
} from './combat.js';

/** Bring one combatant to a full bar without waiting out the beats. */
const readyUp = (state, id) => state.readiness.set(id, FULL_BAR);

const hero = (id, over = {}) =>
  createCharacter({ id, name: id, characterClass: CharacterClass.FIGHTER, ...over });

function party(...members) {
  const p = createParty();
  for (const m of members) addCharacter(p, m);
  return p;
}

const orc = (id, over = {}) =>
  createEnemy({ id, name: 'Orc', maxHitPoints: 12, potValue: 20, ...over });

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

describe('the order of acting', () => {
  // @spec COMBAT-TIME-008
  it('acts in descending Dexterity', () => {
    const quick = hero('quick', { attributes: { DEXTERITY: 18 } });
    const slow = hero('slow', { attributes: { DEXTERITY: 6 } });
    const state = encounter({ members: [quick, slow], enemies: [orc('o1', { attributes: { DEXTERITY: 12 } })] });

    expect(actingOrder(state).map((c) => c.id)).toEqual(['quick', 'o1', 'slow']);
  });

  // @spec COMBAT-TIME-008
  it('gives a tie to the party', () => {
    const c = hero('hero', { attributes: { DEXTERITY: 12 } });
    const state = encounter({ members: [c], enemies: [orc('o1', { attributes: { DEXTERITY: 12 } })] });

    expect(actingOrder(state).map((c) => c.id)).toEqual(['hero', 'o1']);
  });

  // @spec COMBAT-TIME-008
  it('settles a tie within the party by a fixed order of position', () => {
    const a = hero('a', { attributes: { DEXTERITY: 10 } });
    const b = hero('b', { attributes: { DEXTERITY: 10 } });
    const state = encounter({ members: [a, b], enemies: [orc('o1', { attributes: { DEXTERITY: 1 } })] });

    expect(actingOrder(state).map((c) => c.id).slice(0, 2)).toEqual(['a', 'b']);
    // And it is stable across repeated reads.
    expect(actingOrder(state).map((c) => c.id)).toEqual(actingOrder(state).map((c) => c.id));
  });

  // @spec COMBAT-TIME-008
  it('places every combatant able to act exactly once', () => {
    const state = encounter({
      members: [hero('a'), hero('b', {})],
      enemies: [orc('o1'), orc('o2')],
    });

    const ids = actingOrder(state).map((c) => c.id);
    expect(ids).toHaveLength(4);
    expect(new Set(ids).size).toBe(4);
  });
});

describe('targeting', () => {
  // @spec COMBAT-TARGET-001
  // @spec COMBAT-TARGET-003
  it('lets anybody attack anybody on the other side', () => {
    const state = encounter({
      members: [hero('bram'), hero('tam'), hero('isolde')],
      enemies: [orc('o1'), orc('o2')],
    });

    expect(attackTargets(state, 'isolde').map((t) => t.id).sort()).toEqual(['o1', 'o2']);
    expect(attackTargets(state, 'o2').map((t) => t.id).sort()).toEqual(['bram', 'isolde', 'tam']);
  });

  // @spec COMBAT-TARGET-004
  it('offers nobody who cannot act', () => {
    const state = encounter({
      members: [hero('bram'), hero('tam')],
      enemies: [orc('o1'), orc('o2')],
    });
    applyDamage(state.party, 'bram', 9999);
    state.enemies.members[0].hitPoints = 0;
    state.enemies.members[0].condition = Condition.DEAD;

    expect(character(state.party, 'bram').condition).toBe(Condition.UNCONSCIOUS);
    expect(attackTargets(state, 'o2').map((t) => t.id)).toEqual(['tam']);
    expect(attackTargets(state, 'tam').map((t) => t.id)).toEqual(['o2']);
  });

  // @spec COMBAT-TARGET-002
  it('aims a benefit at anybody on its own side, the actor included', () => {
    const state = encounter({
      members: [hero('bram'), hero('wren')],
      enemies: [orc('o1')],
    });

    expect(allyTargets(state, 'wren').map((t) => t.id).sort()).toEqual(['bram', 'wren']);
    expect(allyTargets(state, 'o1').map((t) => t.id)).toEqual(['o1']);
  });

  // @spec COMBAT-TARGET-005
  it('bounds what a combatant may do by what they carry, never by where they are', () => {
    const state = encounter({
      members: [hero('armed', { attack: { baseDamage: 9, accuracy: 30 } }), hero('bare')],
      enemies: [orc('o1')],
    });

    // Both reach every enemy; what differs is what they have to swing.
    expect(attackTargets(state, 'bare').map((t) => t.id)).toEqual(['o1']);
    expect(character(state.party, 'bare').attack).toBeNull();
    expect(character(state.party, 'armed').attack).toMatchObject({ baseDamage: 9 });
  });
});

describe('enemy groups', () => {
  // @spec COMBAT-ENEMY-006
  it('makes an enemy of the same stuff a character is', () => {
    const goblin = orc('g');

    expect(Object.keys(goblin.attributes)).toHaveLength(6);
    expect(goblin.characterClass).toBeUndefined();
    expect(goblin.condition).toBe(Condition.OK);
    expect(goblin.hitPoints).toBe(goblin.maxHitPoints);
  });

  // @spec COMBAT-ENEMY-002
  it('is not capped at five', () => {
    const swarm = createEnemyGroup(Array.from({ length: 9 }, (_, i) => orc(`o${i}`)));

    expect(swarm.members).toHaveLength(9);
  });

  // @spec COMBAT-ENEMY-007
  it('holds at most twenty in a group', () => {
    const tooMany = Array.from({ length: 25 }, (_, i) => orc(`o${i}`));

    expect(createEnemyGroup(tooMany).members).toHaveLength(MAX_ENEMY_GROUP);
  });
});

describe('aiming at what is there', () => {
  // @spec COMBAT-TIME-010
  it('resolves nothing against a target that has already fallen, and finds no other', () => {
    const state = encounter({
      members: [hero('a')],
      enemies: [orc('o1', { maxHitPoints: 1 }), orc('o2', { maxHitPoints: 40 })],
    });
    readyUp(state, 'a');
    takeAction(state, 'a', { kind: Action.ATTACK, targetId: 'o1', baseDamage: 50, accuracy: 100 });

    readyUp(state, 'a');
    const event = takeAction(state, 'a', { kind: Action.ATTACK, targetId: 'o1', baseDamage: 50, accuracy: 100 });

    expect(event.targetId).toBeNull();
    // The other orc is untouched: a swing at nothing does not wander onto it.
    expect(state.enemies.members.find((e) => e.id === 'o2').hitPoints).toBe(40);
  });

  // @spec COMBAT-TIME-010
  it('aims at the fight as it stands when the blow is struck', () => {
    const state = encounter({ members: [hero('a')], enemies: [orc('o1', { maxHitPoints: 40 })] });
    readyUp(state, 'a');

    const event = takeAction(state, 'a', { kind: Action.ATTACK, targetId: 'o1', baseDamage: 12, accuracy: 100 });

    expect(event.targetId).toBe('o1');
    expect(state.enemies.members[0].hitPoints).toBeLessThan(40);
  });
});

describe('fleeing', () => {
  // @spec COMBAT-FLEE-004
  it('fails when the fastest enemy far outpaces the party slowest', () => {
    const state = encounter({
      members: [hero('a', { attributes: { DEXTERITY: 10 } }), hero('slow', { attributes: { DEXTERITY: 8 } })],
      enemies: [orc('o1', { attributes: { DEXTERITY: 11 } })], // 11 > 8 * 1.25
    });

    expect(attemptFlee(state).escaped).toBe(false);
  });

  // @spec COMBAT-FLEE-004
  it('can succeed when the party is not badly outpaced', () => {
    const state = encounter({
      members: [hero('a', { attributes: { DEXTERITY: 12 } })],
      enemies: [orc('o1', { attributes: { DEXTERITY: 12 } })],
    });

    expect(attemptFlee(state).escaped).toBe(true);
  });

  // @spec COMBAT-FLEE-005
  it('fails against an enemy that forbids escape, however slow it is', () => {
    const state = encounter({
      members: [hero('a', { attributes: { DEXTERITY: 18 } })],
      enemies: [orc('o1', { attributes: { DEXTERITY: 1 }, forbidsEscape: true })],
    });

    expect(attemptFlee(state).escaped).toBe(false);
  });

  // @spec COMBAT-TURN-005
  it('reports a hopeless escape without taking the attempt', () => {
    const state = encounter({
      members: [hero('a', { attributes: { DEXTERITY: 8 } })],
      enemies: [orc('o1', { attributes: { DEXTERITY: 20 } })],
    });
    readyUp(state, 'a');
    const banked = readinessOf(state, 'a');

    expect(fleeCertainToFail(state)).toBe(true);
    // Asking is free: it costs no readiness and takes no attempt.
    expect(readinessOf(state, 'a')).toBe(banked);
  });

  // @spec COMBAT-TURN-005
  // @spec COMBAT-FLEE-005
  it('reports an escape forbidden as hopeless, however slow the thing forbidding it', () => {
    const state = encounter({
      members: [hero('a', { attributes: { DEXTERITY: 18 } })],
      enemies: [orc('o1', { attributes: { DEXTERITY: 1 }, forbidsEscape: true })],
    });

    expect(fleeCertainToFail(state)).toBe(true);
  });

  // @spec COMBAT-TURN-005
  it('reports a winnable escape as worth attempting', () => {
    const state = encounter({
      members: [hero('a', { attributes: { DEXTERITY: 12 } })],
      enemies: [orc('o1', { attributes: { DEXTERITY: 12 } })],
    });

    expect(fleeCertainToFail(state)).toBe(false);
  });

  // @spec COMBAT-TURN-005
  it('agrees with what an attempt actually does, in every case', () => {
    for (const [partyDex, enemyDex, forbids] of [[8, 20, false], [12, 12, false], [18, 1, true], [10, 11, false]]) {
      const state = encounter({
        members: [hero('a', { attributes: { DEXTERITY: partyDex } })],
        enemies: [orc('o1', { attributes: { DEXTERITY: enemyDex }, forbidsEscape: forbids })],
      });
      const predicted = fleeCertainToFail(state);

      expect(attemptFlee(state).escaped).toBe(!predicted);
    }
  });

  // @spec COMBAT-FLEE-003
  it('costs only the round when it fails, and may be tried again', () => {
    const state = encounter({
      members: [hero('a', { attributes: { DEXTERITY: 8 } })],
      enemies: [orc('o1', { attributes: { DEXTERITY: 20 } })],
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
      enemies: [orc('o1', { attributes: { DEXTERITY: 4 } })],
    });

    const result = attemptFlee(state);

    expect(result.escaped).toBe(true);
    expect(result.returnTo).toEqual({ floorId: 'f1', x: 3, y: 4 });
    expect(encounterOutcome(state).outcome).toBe(Outcome.ESCAPED);
    expect(encounterOutcome(state).pot).toBeUndefined();
  });

  // @spec COMBAT-FLEE-006
  it('can be attempted in the dark on the same terms', () => {
    const lit = encounter({ members: [hero('a', { attributes: { DEXTERITY: 12 } })], enemies: [orc('o1', { attributes: { DEXTERITY: 4 } })] });
    const dark = encounter({ members: [hero('a', { attributes: { DEXTERITY: 12 } })], enemies: [orc('o1', { attributes: { DEXTERITY: 4 } })], light: 'DARK' });

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
    readyUp(state, 'a');
    takeAction(state, 'a', { kind: Action.ATTACK, targetId: 'o1', baseDamage: 50, accuracy: 100, skill: Skill.BLADE });

    const result = encounterOutcome(state);
    expect(result.outcome).toBe(Outcome.VICTORY);
    expect(result.pot).toBe(30);
    expect(result.skillsUsed).toContain(Skill.BLADE);
  });

  // @spec COMBAT-END-004
  it('reports the same pot however long the fight ran', () => {
    const quick = encounter({ members: [hero('a')], enemies: [orc('o1', { hitPoints: 1, potValue: 30 })] });
    readyUp(quick, 'a');
    takeAction(quick, 'a', { kind: Action.ATTACK, targetId: 'o1', baseDamage: 99, accuracy: 100, skill: Skill.BLADE });

    const slow = encounter({ members: [hero('a')], enemies: [orc('o1', { hitPoints: 40, potValue: 30 })] });
    for (let i = 0; i < 12 && encounterOutcome(slow).outcome === Outcome.ONGOING; i++) {
      readyUp(slow, 'a');
      takeAction(slow, 'a', { kind: Action.ATTACK, targetId: 'o1', baseDamage: 6, accuracy: 100, skill: Skill.BLADE });
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

  // @spec COMBAT-TIME-011
  it('restores nothing merely because the fight ran on', () => {
    const state = encounter({ members: [hero('a')], enemies: [orc('o1', { maxHitPoints: 80 })] });
    applyDamage(state.party, 'a', 5);
    const wounded = character(state.party, 'a').hitPoints;

    for (let i = 0; i < 5; i++) {
      readyUp(state, 'a');
      takeAction(state, 'a', { kind: Action.PASS });
      advanceBeats(state, 10);
    }

    expect(character(state.party, 'a').hitPoints).toBe(wounded);
  });
});

describe('what a blow is resolved against', () => {
  // @spec COMBAT-ATTACK-010
  it('resolves the band against defence, and lets armour do nothing to it', () => {
    const soft = encounter({
      members: [hero('a')],
      enemies: [orc('o1', { maxHitPoints: 400, armour: 0 })],
    });
    const plated = encounter({
      members: [hero('a')],
      enemies: [orc('o1', { maxHitPoints: 400, armour: 30 })],
    });

    // Same seed, same roll, same defence: armour changed the damage, never the band.
    readyUp(soft, 'a'); readyUp(plated, 'a');
    const swing = { kind: Action.ATTACK, targetId: 'o1', baseDamage: 60, accuracy: 40 };
    const bare = takeAction(soft, 'a', swing);
    const thick = takeAction(plated, 'a', swing);

    expect(thick.band).toBe(bare.band);
    expect(thick.damage).toBeLessThan(bare.damage);
  });

  // @spec COMBAT-ATTACK-010
  it('makes a nimbler target harder to hit', () => {
    const bands = (dexterity) => {
      let crits = 0;
      for (let seed = 1; seed <= 60; seed++) {
        const state = encounter({
          members: [hero('a')],
          enemies: [orc('o1', { maxHitPoints: 400, attributes: { DEXTERITY: dexterity } })],
          seed,
        });
        readyUp(state, 'a');
        const event = takeAction(state, 'a', { kind: Action.ATTACK, targetId: 'o1' });
        if (event.band === Band.CRIT || event.band === Band.HIT) crits += 1;
      }
      return crits;
    };

    expect(bands(20)).toBeLessThan(bands(4));
  });

  // @spec COMBAT-ATTACK-012
  it('takes armour off after the band multiplied the blow, never before', () => {
    // A graze halves the blow; armour comes off what is left, so a grazed blow against
    // armour lands lower than half of what an unarmoured one would.
    expect(damageFor(Band.HIT, 20, 5)).toBe(15);
    expect(damageFor(Band.GRAZE, 20, 5)).toBe(5);
    expect(damageFor(Band.CRIT, 20, 5)).toBe(25);
  });

  // @spec COMBAT-ATTACK-012
  it('never lets armour take a landed blow below the floor', () => {
    expect(damageFor(Band.HIT, 20, 9999)).toBe(Math.max(1, Math.ceil(20 * 0.05)));
  });
});

describe('damage from a fight', () => {
  // @spec PARTY-OP-001
  it('takes a real blow through the party operation, floor and chain included', () => {
    const state = encounter({
      members: [hero('victim')],
      enemies: [orc('o1', { attack: { baseDamage: 9999, accuracy: 999 } })],
    });
    readyUp(state, 'o1');

    takeAction(state, 'o1', { kind: Action.ATTACK, targetId: 'victim' });

    const victim = character(state.party, 'victim');
    // Never below nothing, and unconscious rather than simply at zero: both are the
    // party operation's doing, and combat writes neither itself.
    expect(victim.hitPoints).toBe(0);
    expect(victim.condition).toBe(Condition.UNCONSCIOUS);
  });
});

describe('passing a turn', () => {
  // @spec COMBAT-ACTION-009
  it('spends a full bar and resolves nothing', () => {
    const state = encounter({ members: [hero('a')], enemies: [orc('o1')] });
    readyUp(state, 'a');
    const foe = state.enemies.members.find((e) => e.id === 'o1').hitPoints;

    const event = takeAction(state, 'a', { kind: Action.PASS });

    expect(readinessOf(state, 'a')).toBeLessThan(FULL_BAR);
    expect(event.action).toBe(Action.PASS);
    // Nothing was struck, healed or otherwise touched.
    expect(state.enemies.members.find((e) => e.id === 'o1').hitPoints).toBe(foe);
    expect(character(state.party, 'a').hitPoints).toBe(character(state.party, 'a').maxHitPoints);
  });

  // @spec COMBAT-ACTION-009
  it('costs exactly what acting costs', () => {
    const acting = encounter({ members: [hero('a')], enemies: [orc('o1')] });
    const passing = encounter({ members: [hero('a')], enemies: [orc('o1')] });
    readyUp(acting, 'a'); readyUp(passing, 'a');

    takeAction(acting, 'a', { kind: Action.ATTACK, targetId: 'o1' });
    takeAction(passing, 'a', { kind: Action.PASS });

    expect(readinessOf(passing, 'a')).toBe(readinessOf(acting, 'a'));
  });
});

describe('taking a turn', () => {
  // @spec COMBAT-TIME-009
  it('gives the turn back only once the action has been taken', () => {
    const state = encounter({
      members: [hero('a', { attributes: { DEXTERITY: 18 } })],
      enemies: [orc('o1', { hitPoints: 20, dexterity: 1 })],
    });

    expect(nextActor(state).id).toBe('a');
    takeAction(state, 'a', { kind: Action.ATTACK, targetId: 'o1', baseDamage: 50, accuracy: 100 });

    expect(state.enemies.members[0].hitPoints).toBeLessThan(20);
    // The bar is spent, so the turn has genuinely passed on.
    expect(readinessOf(state, 'a')).toBeLessThan(FULL_BAR);
  });

  // @spec COMBAT-ATTACK-001
  it('resolves an attack from one roll set against accuracy and defence', () => {
    // Defence is what moves the band, and Dexterity is what moves defence.
    const feeble = encounter({
      members: [hero('a')],
      enemies: [orc('nimble', { hitPoints: 99, attributes: { DEXTERITY: 40 } })], seed: 3,
    });
    readyUp(feeble, 'a');
    const weak = takeAction(feeble, 'a', { kind: Action.ATTACK, targetId: 'nimble', baseDamage: 40, accuracy: 0 });

    const sharp = encounter({
      members: [hero('a')],
      enemies: [orc('slow', { hitPoints: 99, attributes: { DEXTERITY: 10 } })], seed: 3,
    });
    readyUp(sharp, 'a');
    const strong = takeAction(sharp, 'a', { kind: Action.ATTACK, targetId: 'slow', baseDamage: 40, accuracy: 200 });

    // Same roll, opposite circumstances: accuracy and defence decide the band.
    expect(weak.band).toBe(Band.MISS);
    expect(strong.band).toBe(Band.CRIT);
  });

  // @spec COMBAT-ACTION-006
  // @spec PARTY-OP-001
  it('changes a character through the party operations, so the condition chain applies', () => {
    const state = encounter({
      members: [hero('victim', { attributes: { DEXTERITY: 1 } })],
      enemies: [orc('o1', { attributes: { DEXTERITY: 20 } })],
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
        hero('lame', { attributes: { DEXTERITY: 4 } }),
      ],
      enemies: [orc('o1', { attributes: { DEXTERITY: 10 } })],
    });

    // The swift one could outrun this easily; the party cannot, and nobody is left.
    const result = attemptFlee(state);

    expect(result.escaped).toBe(false);
    expect(roster(state.party)).toHaveLength(2);
  });
});

describe('what a blow is worth', () => {
  // @spec COMBAT-ACTION-008
  it('takes damage and accuracy from whoever swung, on either side alike', () => {
    const heavy = hero('heavy', { attack: { baseDamage: 20, accuracy: 100 } });
    const state = encounter({
      members: [heavy],
      enemies: [orc('o1', { maxHitPoints: 40, attack: { baseDamage: 3, accuracy: 100 } })],
    });
    readyUp(state, 'heavy');
    readyUp(state, 'o1');

    // Neither action carries a number; both are read off the combatant acting.
    const swing = takeAction(state, 'heavy', { kind: Action.ATTACK, targetId: 'o1' });
    const jab = takeAction(state, 'o1', { kind: Action.ATTACK, targetId: 'heavy' });

    expect(swing.damage).toBeGreaterThan(jab.damage);
    expect(jab.damage).toBeGreaterThan(0);
  });

  // @spec ENEMY-ROSTER-011
  it('kills an enemy outright where a character would be left unconscious', () => {
    const state = encounter({
      members: [hero('bram', { attack: { baseDamage: 40, accuracy: 100 } })],
      enemies: [orc('o1', { maxHitPoints: 6, attack: { baseDamage: 40, accuracy: 100 } })],
    });
    readyUp(state, 'o1');
    takeAction(state, 'o1', { kind: Action.ATTACK, targetId: 'bram' });

    // A character brought to zero is unconscious, and may yet be brought round.
    expect(character(state.party, 'bram').condition).toBe(Condition.UNCONSCIOUS);

    const other = encounter({
      members: [hero('rook', { attack: { baseDamage: 40, accuracy: 100 } })],
      enemies: [orc('o2', { maxHitPoints: 6 })],
    });
    readyUp(other, 'rook');
    takeAction(other, 'rook', { kind: Action.ATTACK, targetId: 'o2' });

    // An enemy brought to zero is dead: nobody is coming back for a goblin.
    expect(other.enemies.members[0].condition).toBe(Condition.DEAD);
  });
});

describe('what a turn reports', () => {
  // @spec COMBAT-TIME-009
  it('credits the felling blow to the blow that felled, not to every blow that landed', () => {
    const a = hero('a', { attributes: { DEXTERITY: 18 } });
    const b = hero('b', { attributes: { DEXTERITY: 12 } });
    const state = encounter({
      members: [a, b],
      enemies: [orc('o1', { maxHitPoints: 20, attributes: { DEXTERITY: 1 } })],
    });

    // Both swing at the same orc; the first wounds it, the second finishes it.
    readyUp(state, 'a');
    const first = takeAction(state, 'a', { kind: Action.ATTACK, targetId: 'o1', baseDamage: 12, accuracy: 100 });
    readyUp(state, 'b');
    const second = takeAction(state, 'b', { kind: Action.ATTACK, targetId: 'o1', baseDamage: 12, accuracy: 100 });

    expect(first.felled).toBe(false);
    expect(second.felled).toBe(true);
  });

  // @spec COMBAT-TIME-009
  it('names the target of the attack it resolved', () => {
    const state = encounter({ members: [hero('a')], enemies: [orc('o1')] });
    readyUp(state, 'a');

    expect(takeAction(state, 'a', { kind: Action.ATTACK, targetId: 'o1', baseDamage: 5, accuracy: 100 }).targetId)
      .toBe('o1');
  });

  // @spec COMBAT-FLEE-003
  it('spends the bar of whoever called a retreat that failed, and nobody else', () => {
    const state = encounter({
      members: [
        hero('swift', { attributes: { DEXTERITY: 18 } }),
        hero('lame', { attributes: { DEXTERITY: 4 } }),
      ],
      enemies: [orc('o1', { attributes: { DEXTERITY: 10 } })],
    });
    readyUp(state, 'swift');
    readyUp(state, 'lame');

    expect(attemptFlee(state, 'swift').escaped).toBe(false);

    expect(readinessOf(state, 'swift')).toBe(0);
    // The one who stayed put still has their turn to spend.
    expect(readinessOf(state, 'lame')).toBe(FULL_BAR);
  });
});
