import { describe, it, expect } from 'vitest';
import { makeRng } from './rng.js';
import {
  createParty, createCharacter, addCharacter, applyDamage, character,
  Condition, CharacterClass, Skill, roster, stow, packOf,
} from './party.js';
import { ItemKind, Slot, createItem } from './items.js';
import {
  beginEncounter, takeAction, nextActor, damageFor, actingOrder, readinessOf, hitDamage,
  attackTargets, allyTargets, attemptFlee, fleeCertainToFail, createEnemy,
  createEnemyGroup, encounterOutcome, Action, Outcome, MAX_ENEMY_GROUP,
  MIN_DAMAGE_FRACTION, FULL_BAR, serializeEncounter, restoreEncounter,
} from './combat.js';
import { createLootTable } from './loot.js';

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

function encounter({ members, enemies, seed = 7 } = {}) {
  return beginEncounter({
    party: party(...members),
    enemies: createEnemyGroup(enemies),
    rng: makeRng(seed),
    origin: { floorId: 'f1', x: 3, y: 4 },
  });
}

describe('damage', () => {
  // @spec COMBAT-ATTACK-015
  it('deals base damage less armour, with no multiplier', () => {
    expect(damageFor(40, 0)).toBe(40);
    expect(damageFor(20, 5)).toBe(15);
    expect(damageFor(10.8, 2)).toBe(9);
  });

  // @spec COMBAT-ATTACK-005
  it('never reduces a blow to nothing, however heavy the armour', () => {
    const crushed = damageFor(40, 9999);
    expect(crushed).toBeGreaterThanOrEqual(1);
    expect(crushed).toBe(Math.ceil(40 * MIN_DAMAGE_FRACTION));
  });

  // @spec COMBAT-ATTACK-005
  it('floors at one even for a feeble attack against nothing at all', () => {
    expect(damageFor(1, 9999)).toBe(1);
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
      members: [hero('armed', { attack: { baseDamage: 9 } }), hero('bare')],
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

    expect(Object.keys(goblin.attributes)).toHaveLength(5);
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
    takeAction(state, 'a', { kind: Action.ATTACK, targetId: 'o1', baseDamage: 50 });

    readyUp(state, 'a');
    const event = takeAction(state, 'a', { kind: Action.ATTACK, targetId: 'o1', baseDamage: 50 });

    expect(event.targetId).toBeNull();
    // The other orc is untouched: a swing at nothing does not wander onto it.
    expect(state.enemies.members.find((e) => e.id === 'o2').hitPoints).toBe(40);
  });

  // @spec COMBAT-TIME-010
  it('aims at the fight as it stands when the blow is struck', () => {
    const state = encounter({ members: [hero('a')], enemies: [orc('o1', { maxHitPoints: 40 })] });
    readyUp(state, 'a');

    const event = takeAction(state, 'a', { kind: Action.ATTACK, targetId: 'o1', baseDamage: 12 });

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
});

describe('ending', () => {
  // @spec COMBAT-END-001
  // @spec COMBAT-END-003
  it('ends in victory and reports the pot with the skills used', () => {
    const state = encounter({ members: [hero('a')], enemies: [orc('o1', { hitPoints: 1, potValue: 30 })] });
    readyUp(state, 'a');
    takeAction(state, 'a', { kind: Action.ATTACK, targetId: 'o1', baseDamage: 50, skill: Skill.BLADE });

    const result = encounterOutcome(state);
    expect(result.outcome).toBe(Outcome.VICTORY);
    expect(result.pot).toBe(30);
    expect(result.skillsUsed).toContain(Skill.BLADE);
  });

  // @spec COMBAT-END-004
  it('reports the same pot however long the fight ran', () => {
    const quick = encounter({ members: [hero('a')], enemies: [orc('o1', { hitPoints: 1, potValue: 30 })] });
    readyUp(quick, 'a');
    takeAction(quick, 'a', { kind: Action.ATTACK, targetId: 'o1', baseDamage: 99, skill: Skill.BLADE });

    const slow = encounter({ members: [hero('a')], enemies: [orc('o1', { hitPoints: 40, potValue: 30 })] });
    for (let i = 0; i < 12 && encounterOutcome(slow).outcome === Outcome.ONGOING; i++) {
      readyUp(slow, 'a');
      takeAction(slow, 'a', { kind: Action.ATTACK, targetId: 'o1', baseDamage: 6, skill: Skill.BLADE });
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
});

describe('what a blow is resolved against', () => {
  // @spec COMBAT-ATTACK-014
  // @spec COMBAT-ATTACK-016
  it('lands every attack for the same damage, whatever the seed', () => {
    const dealt = new Set();
    for (let seed = 1; seed <= 60; seed++) {
      const state = encounter({
        members: [hero('a')],
        enemies: [orc('o1', { maxHitPoints: 400, armour: 3, attributes: { DEXTERITY: 40 } })],
        seed,
      });
      readyUp(state, 'a');
      const event = takeAction(state, 'a', { kind: Action.ATTACK, targetId: 'o1', baseDamage: 20 });
      expect(event.damage).toBeGreaterThan(0);
      dealt.add(event.damage);
    }
    expect([...dealt]).toEqual([17]);
  });

  // @spec COMBAT-ATTACK-016
  it('draws nothing from the fight\'s generator to resolve an attack', () => {
    const state = encounter({ members: [hero('a')], enemies: [orc('o1', { maxHitPoints: 400 })] });
    const before = state.rng.position();
    readyUp(state, 'a');
    takeAction(state, 'a', { kind: Action.ATTACK, targetId: 'o1' });
    expect(state.rng.position()).toEqual(before);
  });

  // @spec COMBAT-ATTACK-016
  it('lets an enemy strike for a fixed amount too', () => {
    const dealt = new Set();
    for (let seed = 1; seed <= 30; seed++) {
      const state = encounter({
        members: [hero('a', { attributes: { DEXTERITY: 40 } })],
        enemies: [orc('o1', { attack: { baseDamage: 6 } })],
        seed,
      });
      readyUp(state, 'o1');
      dealt.add(takeAction(state, 'o1', { kind: Action.ATTACK, targetId: 'a' }).damage);
    }
    expect(dealt.size).toBe(1);
  });

  // @spec COMBAT-ATTACK-013
  it('deals exactly what it previews, on either side', () => {
    const state = encounter({
      members: [hero('a', { attack: { baseDamage: 9 } })],
      enemies: [orc('o1', { maxHitPoints: 400, armour: 2, attack: { baseDamage: 5 } })],
    });
    const forecast = hitDamage(state, 'a', 'o1');
    const reply = hitDamage(state, 'o1', 'a');
    readyUp(state, 'a'); readyUp(state, 'o1');
    expect(takeAction(state, 'a', { kind: Action.ATTACK, targetId: 'o1' }).damage).toBe(forecast);
    expect(takeAction(state, 'o1', { kind: Action.ATTACK, targetId: 'a' }).damage).toBe(reply);
  });
});

describe('damage from a fight', () => {
  // @spec PARTY-OP-001
  it('takes a real blow through the party operation, floor and chain included', () => {
    const state = encounter({
      members: [hero('victim')],
      enemies: [orc('o1', { attack: { baseDamage: 9999 } })],
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
});

describe('changing equipment in a fight', () => {
  const dagger = () => createItem({
    id: 'dagger', name: 'Dagger', kind: ItemKind.WEAPON, slot: Slot.MAIN_HAND,
    skill: Skill.BLADE, damage: 6,
  });

  // @spec COMBAT-ACTION-011
  it('puts an item on from the pack through the party, and spends a full bar', () => {
    const state = encounter({ members: [hero('a')], enemies: [orc('o1')] });
    const blade = dagger();
    stow(state.party, blade);
    readyUp(state, 'a');

    const event = takeAction(state, 'a', { kind: Action.EQUIP, item: blade });

    expect(event.action).toBe(Action.EQUIP);
    expect(character(state.party, 'a').equipment[Slot.MAIN_HAND]).toBe(blade);
    expect(packOf(state.party)).toEqual([]);
    expect(readinessOf(state, 'a')).toBe(0);
  });

  // @spec COMBAT-ACTION-012
  it('spends nothing on a change the party refuses', () => {
    const state = encounter({ members: [hero('a')], enemies: [orc('o1')] });
    readyUp(state, 'a');

    // Not in the pack, so not the party's to hand over.
    const event = takeAction(state, 'a', { kind: Action.EQUIP, item: dagger() });

    expect(event).toBeNull();
    expect(readinessOf(state, 'a')).toBe(FULL_BAR);
    expect(character(state.party, 'a').equipment[Slot.MAIN_HAND]).toBeUndefined();
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
    takeAction(state, 'a', { kind: Action.ATTACK, targetId: 'o1', baseDamage: 50 });

    expect(state.enemies.members[0].hitPoints).toBeLessThan(20);
    // The bar is spent, so the turn has genuinely passed on.
    expect(readinessOf(state, 'a')).toBeLessThan(FULL_BAR);
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
  it('takes damage from whoever swung, on either side alike', () => {
    const heavy = hero('heavy', { attack: { baseDamage: 20 } });
    const state = encounter({
      members: [heavy],
      enemies: [orc('o1', { maxHitPoints: 40, attack: { baseDamage: 3 } })],
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
      members: [hero('bram', { attack: { baseDamage: 40 } })],
      enemies: [orc('o1', { maxHitPoints: 6, attack: { baseDamage: 40 } })],
    });
    readyUp(state, 'o1');
    takeAction(state, 'o1', { kind: Action.ATTACK, targetId: 'bram' });

    // A character brought to zero is unconscious, and may yet be brought round.
    expect(character(state.party, 'bram').condition).toBe(Condition.UNCONSCIOUS);

    const other = encounter({
      members: [hero('rook', { attack: { baseDamage: 40 } })],
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
    const first = takeAction(state, 'a', { kind: Action.ATTACK, targetId: 'o1', baseDamage: 12 });
    readyUp(state, 'b');
    const second = takeAction(state, 'b', { kind: Action.ATTACK, targetId: 'o1', baseDamage: 12 });

    expect(first.felled).toBe(false);
    expect(second.felled).toBe(true);
  });

  // @spec COMBAT-TIME-009
  it('names the target of the attack it resolved', () => {
    const state = encounter({ members: [hero('a')], enemies: [orc('o1')] });
    readyUp(state, 'a');

    expect(takeAction(state, 'a', { kind: Action.ATTACK, targetId: 'o1', baseDamage: 5 }).targetId)
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

describe('drinking in a fight', () => {
  const potion = () => createItem({
    id: 'potion', name: 'Potion', kind: ItemKind.CONSUMABLE, effect: { heal: 6 },
  });

  // @spec COMBAT-ACTION-013
  it('heals the one who drinks, from the pack, for their full bar', () => {
    const state = encounter({ members: [hero('a'), hero('b')], enemies: [orc('o1')] });
    applyDamage(state.party, 'a', 10);
    applyDamage(state.party, 'b', 10);
    const drink = potion();
    stow(state.party, drink);
    readyUp(state, 'a');
    const before = character(state.party, 'a').hitPoints;

    const event = takeAction(state, 'a', { kind: Action.USE, item: drink });

    expect(event.action).toBe(Action.USE);
    expect(character(state.party, 'a').hitPoints).toBe(before + 6);
    expect(character(state.party, 'b').hitPoints).toBe(character(state.party, 'b').maxHitPoints - 10);
    expect(packOf(state.party)).toEqual([]);
    expect(readinessOf(state, 'a')).toBe(0);
  });

  // @spec COMBAT-ACTION-014
  it('spends nothing on a drink the party refuses', () => {
    const state = encounter({ members: [hero('a')], enemies: [orc('o1')] });
    const drink = potion();
    stow(state.party, drink);
    readyUp(state, 'a');

    // Already at full health.
    expect(takeAction(state, 'a', { kind: Action.USE, item: drink })).toBeNull();
    expect(readinessOf(state, 'a')).toBe(FULL_BAR);
    expect(packOf(state.party)).toEqual([drink]);
  });
});

describe('what a victory yields', () => {
  const potion = createItem({ id: 'potion', name: 'Potion', kind: ItemKind.CONSUMABLE, effect: { heal: 6 } });
  const tables = {
    pockets: createLootTable({
      id: 'pockets', gold: { min: 3, max: 3 }, draws: { count: 1, chance: 1 }, items: [potion],
    }),
  };

  function won({ enemies, lootTables = tables, seed = 7 } = {}) {
    const state = beginEncounter({
      party: party(hero('a')),
      enemies: createEnemyGroup(enemies),
      rng: makeRng(seed),
      origin: { floorId: 'f1', x: 3, y: 4 },
      lootTables,
    });
    for (const e of state.enemies.members) {
      e.hitPoints = 0;
      e.condition = Condition.DEAD;
    }
    return state;
  }

  // @spec LOOT-DROP-001
  // @spec COMBAT-END-007
  it('rolls each defeated enemy\'s own table and reports the finds with the pot', () => {
    const state = won({ enemies: [orc('o1', { loot: 'pockets' }), orc('o2', { loot: 'pockets' })] });

    const result = encounterOutcome(state);

    expect(result.outcome).toBe(Outcome.VICTORY);
    expect(result.finds.gold).toBe(6);
    expect(result.finds.items.map((i) => i.id)).toEqual(['potion', 'potion']);
  });

  // @spec LOOT-DROP-001
  it('rolls once, however often the outcome is read, and from the encounter\'s generator', () => {
    const state = won({ enemies: [orc('o1', { loot: 'pockets' })] });
    const before = state.rng.position();

    const first = encounterOutcome(state).finds;
    const after = state.rng.position();
    const again = encounterOutcome(state).finds;

    expect(after).not.toBe(before);
    expect(state.rng.position()).toBe(after);
    expect(again).toEqual(first);
  });

  // @spec LOOT-DROP-002
  it('rolls nothing for an enemy that carries nothing', () => {
    const state = won({ enemies: [orc('o1'), orc('o2', { loot: 'pockets' })] });
    expect(encounterOutcome(state).finds.items).toHaveLength(1);
  });

  // @spec LOOT-DROP-003
  it('rolls nothing on an escape or a defeat', () => {
    const fled = encounter({ members: [hero('a')], enemies: [orc('o1', { loot: 'pockets' })] });
    fled.escaped = true;
    expect(encounterOutcome(fled).finds).toBeUndefined();

    const lost = encounter({ members: [hero('a')], enemies: [orc('o1', { loot: 'pockets' })] });
    applyDamage(lost.party, 'a', 9999);
    expect(encounterOutcome(lost).finds).toBeUndefined();
  });

  // @spec LOOT-DROP-001
  // @spec SAVE-HOLD-005
  it('keeps what a victory yielded across a save and reload', () => {
    const state = won({ enemies: [orc('o1', { loot: 'pockets' })] });
    const finds = encounterOutcome(state).finds;

    const restored = restoreEncounter(
      JSON.parse(JSON.stringify(serializeEncounter(state))), state.party, tables,
    );
    expect(encounterOutcome(restored).finds).toEqual(finds);
  });

  // @spec ENEMY-ROSTER-012
  it('lets an enemy name the table it drops from, or none', () => {
    expect(orc('o1').loot).toBeNull();
    expect(orc('o1', { loot: 'pockets' }).loot).toBe('pockets');
  });
});
