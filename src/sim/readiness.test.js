import { describe, it, expect } from 'vitest';
import { makeRng } from './rng.js';
import {
  createParty, createCharacter, addCharacter, applyDamage, character,
  Row, CharacterClass,
} from './party.js';
import {
  beginEncounter, createEnemy, createEnemyGroup,
  advanceBeats, nextActor, takeAction, readinessOf, actionCost,
  readyActor, readinessPartway,
  Action, FULL_BAR,
} from './combat.js';

const hero = (id, dexterity, over = {}) =>
  createCharacter({
    id, name: id, characterClass: CharacterClass.FIGHTER, row: Row.FRONT,
    attributes: { DEXTERITY: dexterity }, ...over,
  });

const orc = (id, dexterity) =>
  createEnemy({ id, name: 'Orc', row: Row.FRONT, hitPoints: 40, dexterity, potValue: 20 });

function encounter({ members, enemies, partyAware = true, enemiesAware = true, light = 'BRIGHT' }) {
  const p = createParty();
  for (const m of members) addCharacter(p, m);
  return beginEncounter({
    party: p,
    enemies: createEnemyGroup(enemies),
    light,
    awareness: { party: partyAware, enemies: enemiesAware },
    rng: makeRng(7),
    origin: { floorId: 'f1', x: 3, y: 4 },
  });
}

const attack = (targetId) => ({ kind: Action.ATTACK, targetId });

describe('where a fight starts', () => {
  // @spec COMBAT-SURPRISE-002
  it('starts every bar empty when neither side is surprised', () => {
    const state = encounter({ members: [hero('bram', 12)], enemies: [orc('o1', 10)] });

    expect(readinessOf(state, 'bram')).toBe(0);
    expect(readinessOf(state, 'o1')).toBe(0);
  });

  // @spec COMBAT-SURPRISE-001
  it('starts the aware side full and the surprised side empty', () => {
    const state = encounter({
      members: [hero('bram', 12)], enemies: [orc('o1', 10)], enemiesAware: false,
    });

    expect(readinessOf(state, 'bram')).toBe(FULL_BAR);
    expect(readinessOf(state, 'o1')).toBe(0);
  });

  // @spec COMBAT-SURPRISE-001
  it('starts the party empty when it is the party that was caught out', () => {
    const state = encounter({
      members: [hero('bram', 12)], enemies: [orc('o1', 10)], partyAware: false,
    });

    expect(readinessOf(state, 'bram')).toBe(0);
    expect(readinessOf(state, 'o1')).toBe(FULL_BAR);
  });
});

describe("the fight's own time", () => {
  // @spec COMBAT-TIME-001
  it("raises readiness by the combatant's Dexterity each beat", () => {
    const state = encounter({ members: [hero('bram', 12)], enemies: [orc('o1', 5)] });

    advanceBeats(state, 3);

    expect(readinessOf(state, 'bram')).toBe(36);
    expect(readinessOf(state, 'o1')).toBe(15);
  });

  // @spec COMBAT-TIME-002
  it('raises a bar by at least one a beat, however slow the combatant', () => {
    const state = encounter({ members: [hero('bram', 10)], enemies: [orc('o1', 0)] });

    advanceBeats(state, 4);

    expect(readinessOf(state, 'o1')).toBe(4);
  });

  // @spec COMBAT-TIME-003
  // @spec COMBAT-TIME-005
  it('advances a beat at a time until somebody is ready, and no further', () => {
    const state = encounter({ members: [hero('bram', 30)], enemies: [orc('o1', 1)] });

    const actor = nextActor(state);

    // Four beats at thirty reaches a hundred and twenty; three would not have.
    expect(actor.id).toBe('bram');
    expect(state.beats).toBe(4);
    expect(readinessOf(state, 'bram')).toBeGreaterThanOrEqual(FULL_BAR);
  });

  // @spec COMBAT-TIME-003
  it('does not advance at all when somebody is already ready', () => {
    const state = encounter({
      members: [hero('bram', 12)], enemies: [orc('o1', 10)], enemiesAware: false,
    });

    expect(nextActor(state).id).toBe('bram');
    expect(state.beats).toBe(0);
  });
});

describe('what acting costs', () => {
  // @spec COMBAT-TIME-006
  it("subtracts the action's cost and carries the remainder forward", () => {
    const state = encounter({ members: [hero('bram', 30)], enemies: [orc('o1', 1)] });

    nextActor(state);
    const before = readinessOf(state, 'bram');
    takeAction(state, 'bram', attack('o1'));

    // A hundred and twenty less a full bar leaves twenty banked, not nothing.
    expect(before).toBe(120);
    expect(readinessOf(state, 'bram')).toBe(before - FULL_BAR);
  });

  // @spec COMBAT-TIME-007
  it('takes the cost from the action rather than from a fixed value', () => {
    const state = encounter({ members: [hero('bram', 30)], enemies: [orc('o1', 1)] });

    nextActor(state);
    takeAction(state, 'bram', { ...attack('o1'), cost: 40 });

    expect(readinessOf(state, 'bram')).toBe(120 - 40);
  });

  // @spec COMBAT-TIME-007
  it('costs every action there is one full bar', () => {
    for (const kind of Object.values(Action)) {
      expect(actionCost({ kind })).toBe(FULL_BAR);
    }
  });
});

describe('who acts first', () => {
  // @spec COMBAT-TIME-008
  it('acts the quicker of two combatants ready on the same beat', () => {
    const state = encounter({ members: [hero('slow', 10)], enemies: [orc('o1', 20)] });

    expect(nextActor(state).id).toBe('o1');
  });

  // @spec COMBAT-TIME-008
  it('gives the party the turn when Dexterity ties', () => {
    const state = encounter({ members: [hero('bram', 10)], enemies: [orc('o1', 10)] });

    expect(nextActor(state).id).toBe('bram');
  });

  // @spec COMBAT-TIME-008
  it('settles a tie inside the party by position', () => {
    const state = encounter({
      members: [hero('first', 10), hero('second', 10)], enemies: [orc('o1', 1)],
    });

    expect(nextActor(state).id).toBe('first');
  });

  // @spec COMBAT-TIME-009
  it('gives the turn to one combatant at a time', () => {
    const state = encounter({
      members: [hero('a', 10), hero('b', 10)], enemies: [orc('o1', 10)],
    });

    const first = nextActor(state);
    // Still that one's turn until they have taken it: nobody else is handed one.
    expect(nextActor(state).id).toBe(first.id);
  });

  // @spec COMBAT-TIME-015
  it("lets a quick combatant act three times to a slow one's once", () => {
    const state = encounter({ members: [hero('quick', 18)], enemies: [orc('slow', 6)] });
    const taken = [];

    for (let i = 0; i < 4; i++) {
      const actor = nextActor(state);
      taken.push(actor.id);
      takeAction(state, actor.id, attack(actor.side === 'PARTY' ? 'slow' : 'quick'));
    }

    // Dexterity 18 against Dexterity 6 is three bars to one, undisguised.
    expect(taken).toEqual(['quick', 'quick', 'quick', 'slow']);
  });
});

describe('falling out of the order', () => {
  // @spec COMBAT-TIME-013
  it('discards the readiness of a combatant who falls', () => {
    const state = encounter({ members: [hero('bram', 20)], enemies: [orc('o1', 1)] });
    advanceBeats(state, 4);
    expect(readinessOf(state, 'bram')).toBeGreaterThan(0);

    applyDamage(state.party, 'bram', 999);

    expect(readinessOf(state, 'bram')).toBe(0);
  });

  // @spec COMBAT-TIME-014
  it('does not fill the bar of a combatant who cannot act', () => {
    const state = encounter({
      members: [hero('bram', 20), hero('rook', 20)], enemies: [orc('o1', 1)],
    });
    applyDamage(state.party, 'bram', 999);

    advanceBeats(state, 3);

    expect(readinessOf(state, 'bram')).toBe(0);
    expect(readinessOf(state, 'rook')).toBe(60);
  });

  // @spec COMBAT-TIME-013
  it('starts a revived character from empty rather than owing them a turn', () => {
    const state = encounter({ members: [hero('bram', 20)], enemies: [orc('o1', 1)] });
    advanceBeats(state, 4);
    applyDamage(state.party, 'bram', 999);
    // Whatever brings them back took somebody's turn, so the fight has moved on.
    advanceBeats(state, 1);

    character(state.party, 'bram').hitPoints = 5;
    character(state.party, 'bram').condition = 'OK';

    expect(readinessOf(state, 'bram')).toBe(0);
  });
});

describe('what time does not buy', () => {
  // @spec COMBAT-TIME-011
  it('restores no hit points because the fight has run on', () => {
    const state = encounter({ members: [hero('bram', 10)], enemies: [orc('o1', 10)] });
    applyDamage(state.party, 'bram', 8);
    const hurt = character(state.party, 'bram').hitPoints;

    advanceBeats(state, 200);

    expect(character(state.party, 'bram').hitPoints).toBe(hurt);
  });

  // @spec COMBAT-TIME-011
  it('restores no spell slot because the fight has run on', () => {
    const state = encounter({ members: [hero('bram', 10)], enemies: [orc('o1', 10)] });
    const slots = { ...(character(state.party, 'bram').slots ?? {}) };

    advanceBeats(state, 200);

    expect({ ...(character(state.party, 'bram').slots ?? {}) }).toEqual(slots);
  });
});

describe('reading the bars without moving the fight', () => {
  // @spec COMBAT-TIME-016
  it('names nobody while nobody is full, and leaves the fight where it was', () => {
    const state = encounter({ members: [hero('bram', 12)], enemies: [orc('o1', 10)] });

    expect(readyActor(state)).toBeNull();
    expect(state.beats).toBe(0);
    expect(readinessOf(state, 'bram')).toBe(0);
  });

  // @spec COMBAT-TIME-016
  it('names whoever is full, in acting order', () => {
    const state = encounter({ members: [hero('bram', 12)], enemies: [orc('o1', 10)] });
    advanceBeats(state, 10);

    expect(readyActor(state).id).toBe('bram');
    expect(state.beats).toBe(10);
  });

  // @spec COMBAT-TIME-017
  it('reports a bar partway through a beat as that share of what the beat adds', () => {
    const state = encounter({ members: [hero('bram', 12)], enemies: [orc('o1', 10)] });
    advanceBeats(state, 2);

    expect(readinessPartway(state, 'bram', 0)).toBe(24);
    expect(readinessPartway(state, 'bram', 0.5)).toBe(30);
    expect(readinessPartway(state, 'o1', 0.25)).toBe(22.5);
    // Partway is a report, not a beat.
    expect(state.beats).toBe(2);
  });

  // @spec COMBAT-TIME-017
  it('reports nothing for somebody who cannot act', () => {
    const state = encounter({ members: [hero('bram', 12), hero('tam', 12)], enemies: [orc('o1', 10)] });
    advanceBeats(state, 3);
    applyDamage(state.party, 'bram', 9999);

    expect(readinessPartway(state, 'bram', 0.5)).toBe(0);
  });
});
