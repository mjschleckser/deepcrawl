import { describe, it, expect } from 'vitest';
import { makeRng } from './rng.js';
import {
  createParty, createCharacter, addCharacter, applyDamage, character,
  CharacterClass,
} from './party.js';
import {
  beginEncounter, createEnemy, createEnemyGroup,
  advanceBeats, nextActor, takeAction, readinessOf, actionCost,
  turnOrder, hitDamage,
  Action, FULL_BAR,
} from './combat.js';

const hero = (id, dexterity, over = {}) =>
  createCharacter({
    id, name: id, characterClass: CharacterClass.FIGHTER,
    attributes: { DEXTERITY: dexterity }, ...over,
  });

const orc = (id, dexterity) =>
  createEnemy({
    id, name: 'Orc', maxHitPoints: 40, potValue: 20,
    attributes: { DEXTERITY: dexterity },
  });

function encounter({ members, enemies, seed = 7, ...rest }) {
  const p = createParty();
  for (const m of members) addCharacter(p, m);
  return beginEncounter({
    party: p,
    enemies: createEnemyGroup(enemies),
    rng: makeRng(seed),
    origin: { floorId: 'f1', x: 3, y: 4 },
    ...rest,
  });
}

const attack = (targetId) => ({ kind: Action.ATTACK, targetId });

/**
 * A fight opens on a random share of a bar, which is exactly what most of these tests
 * are not about: emptying the bars puts the arithmetic back in plain view.
 */
function emptied(state) {
  for (const id of state.readiness.keys()) state.readiness.set(id, 0);
  return state;
}

describe('where a fight starts', () => {
  const opening = (state, id) => readinessOf(state, id);

  // @spec COMBAT-SURPRISE-003
  it('opens every bar somewhere short of full, and not all at the same place', () => {
    const seen = new Set();
    for (let seed = 1; seed <= 30; seed++) {
      const state = encounter({
        members: [hero('bram', 12), hero('tam', 12)], enemies: [orc('o1', 10)], seed,
      });
      for (const id of ['bram', 'tam', 'o1']) {
        const share = opening(state, id);
        expect(share).toBeGreaterThanOrEqual(0);
        expect(share).toBeLessThan(FULL_BAR);
        seen.add(share);
      }
    }
    // Drawn independently: three combatants over thirty fights are not one value.
    expect(seen.size).toBeGreaterThan(5);
  });

  // @spec COMBAT-SURPRISE-004
  it('opens identically from an identical seed', () => {
    const once = encounter({ members: [hero('bram', 12)], enemies: [orc('o1', 10)], seed: 12 });
    const again = encounter({ members: [hero('bram', 12)], enemies: [orc('o1', 10)], seed: 12 });

    expect(opening(again, 'bram')).toBe(opening(once, 'bram'));
    expect(opening(again, 'o1')).toBe(opening(once, 'o1'));
  });

  // @spec COMBAT-SURPRISE-010
  it('opens the same however the two sides met', () => {
    const plain = { members: [hero('bram', 12), hero('slow', 3)], enemies: [orc('o1', 10)] };
    for (let seed = 1; seed <= 20; seed++) {
      const drawn = encounter({ ...plain, seed });
      const variants = [
        // Whatever a caller says about who noticed whom, nothing reads it.
        encounter({ ...plain, seed, awareness: { party: false, enemies: true } }),
        encounter({ ...plain, seed, awareness: { party: true, enemies: false } }),
      ];
      for (const v of variants) {
        for (const id of ['bram', 'slow', 'o1']) {
          expect(opening(v, id)).toBe(opening(drawn, id));
          expect(opening(v, id)).toBeLessThan(FULL_BAR);
        }
      }
    }
  });

  // @spec COMBAT-SURPRISE-007
  it('applies the opening once, leaving Dexterity to fill the bar thereafter', () => {
    const state = encounter({ members: [hero('bram', 12)], enemies: [orc('o1', 10)], seed: 5 });
    const started = opening(state, 'bram');

    advanceBeats(state, 2);

    expect(readinessOf(state, 'bram')).toBe(started + 24);
  });
});

describe("the fight's own time", () => {
  // @spec COMBAT-TIME-001
  it("raises readiness by the combatant's Dexterity each beat", () => {
    const state = emptied(encounter({ members: [hero('bram', 12)], enemies: [orc('o1', 5)] }));

    advanceBeats(state, 3);

    expect(readinessOf(state, 'bram')).toBe(36);
    expect(readinessOf(state, 'o1')).toBe(15);
  });

  // @spec COMBAT-TIME-002
  it('raises a bar by at least one a beat, however slow the combatant', () => {
    const state = emptied(encounter({ members: [hero('bram', 10)], enemies: [orc('o1', 0)] }));

    advanceBeats(state, 4);

    expect(readinessOf(state, 'o1')).toBe(4);
  });

  // @spec COMBAT-TIME-003
  // @spec COMBAT-TIME-005
  it('advances a beat at a time until somebody is ready, and no further', () => {
    const state = emptied(encounter({ members: [hero('bram', 30)], enemies: [orc('o1', 1)] }));

    const actor = nextActor(state);

    // Four beats at thirty reaches a hundred and twenty; three would not have.
    expect(actor.id).toBe('bram');
    expect(state.beats).toBe(4);
    expect(readinessOf(state, 'bram')).toBeGreaterThanOrEqual(FULL_BAR);
  });

  // @spec COMBAT-TIME-003
  it('does not advance at all when somebody is already ready', () => {
    const state = emptied(encounter({
      members: [hero('bram', 12)], enemies: [orc('o1', 10)],
    }));
    state.readiness.set('bram', FULL_BAR);

    expect(nextActor(state).id).toBe('bram');
    expect(state.beats).toBe(0);
  });
});

describe('what acting costs', () => {
  // @spec COMBAT-TIME-006
  it("subtracts the action's cost and carries the remainder forward", () => {
    const state = emptied(encounter({ members: [hero('bram', 30)], enemies: [orc('o1', 1)] }));

    nextActor(state);
    const before = readinessOf(state, 'bram');
    takeAction(state, 'bram', attack('o1'));

    // A hundred and twenty less a full bar leaves twenty banked, not nothing.
    expect(before).toBe(120);
    expect(readinessOf(state, 'bram')).toBe(before - FULL_BAR);
  });

  // @spec COMBAT-TIME-007
  it('takes the cost from the action rather than from a fixed value', () => {
    const state = emptied(encounter({ members: [hero('bram', 30)], enemies: [orc('o1', 1)] }));

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
  // @spec COMBAT-TIME-009
  it('gives the turn to one combatant at a time', () => {
    const state = emptied(encounter({
      members: [hero('a', 10), hero('b', 10)], enemies: [orc('o1', 10)],
    }));

    const first = nextActor(state);
    // Still that one's turn until they have taken it: nobody else is handed one.
    expect(nextActor(state).id).toBe(first.id);
  });

  // @spec COMBAT-TIME-015
  it("lets a quick combatant act three times to a slow one's once", () => {
    const state = emptied(encounter({ members: [hero('quick', 18)], enemies: [orc('slow', 6)] }));
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
    const state = emptied(encounter({ members: [hero('bram', 20)], enemies: [orc('o1', 1)] }));
    advanceBeats(state, 4);
    expect(readinessOf(state, 'bram')).toBeGreaterThan(0);

    applyDamage(state.party, 'bram', 999);

    expect(readinessOf(state, 'bram')).toBe(0);
  });

  // @spec COMBAT-TIME-014
  it('does not fill the bar of a combatant who cannot act', () => {
    const state = emptied(encounter({
      members: [hero('bram', 20), hero('rook', 20)], enemies: [orc('o1', 1)],
    }));
    applyDamage(state.party, 'bram', 999);

    advanceBeats(state, 3);

    expect(readinessOf(state, 'bram')).toBe(0);
    expect(readinessOf(state, 'rook')).toBe(60);
  });

  // @spec COMBAT-TIME-013
  it('starts a revived character from empty rather than owing them a turn', () => {
    const state = emptied(encounter({ members: [hero('bram', 20)], enemies: [orc('o1', 1)] }));
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
    const state = emptied(encounter({ members: [hero('bram', 10)], enemies: [orc('o1', 10)] }));
    applyDamage(state.party, 'bram', 8);
    const hurt = character(state.party, 'bram').hitPoints;

    advanceBeats(state, 200);

    expect(character(state.party, 'bram').hitPoints).toBe(hurt);
  });
});

describe('what a hit would deal', () => {
  const swinger = () => hero('bram', 12, {
    attack: { baseDamage: 9, skill: 'BLADE' },
  });
  const armoured = (armour) => createEnemy({
    id: 'o1', name: 'Orc', maxHitPoints: 400, potValue: 20, armour,
    attributes: { DEXTERITY: 1 },
  });

  // @spec COMBAT-ATTACK-013
  it('reports exactly what the attack then deals, every time', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const state = encounter({ members: [swinger()], enemies: [armoured(2)], seed });
      const forecast = hitDamage(state, 'bram', 'o1');

      const event = takeAction(state, 'bram', attack('o1'));

      expect(event.damage).toBe(forecast);
    }
  });

  // @spec COMBAT-ATTACK-013
  it("takes the target's armour off, and never reports less than a blow's minimum", () => {
    const bare = encounter({ members: [swinger()], enemies: [armoured(0)] });
    const plated = encounter({ members: [swinger()], enemies: [armoured(3)] });
    const walled = encounter({ members: [swinger()], enemies: [armoured(999)] });

    expect(hitDamage(plated, 'bram', 'o1')).toBe(hitDamage(bare, 'bram', 'o1') - 3);
    expect(hitDamage(walled, 'bram', 'o1')).toBeGreaterThanOrEqual(1);
  });

  // @spec COMBAT-ATTACK-013
  it('rolls nothing and changes nothing by being asked', () => {
    const state = encounter({ members: [swinger()], enemies: [armoured(2)], seed: 9 });
    const twin = encounter({ members: [swinger()], enemies: [armoured(2)], seed: 9 });
    const bars = [...state.readiness];

    hitDamage(state, 'bram', 'o1');

    expect([...state.readiness]).toEqual(bars);
    expect(state.enemies.members[0].hitPoints).toBe(400);
    expect(state.rng.int(0, 1000000)).toBe(twin.rng.int(0, 1000000));
  });
});

describe('the turn order', () => {
  // @spec COMBAT-QUEUE-001
  it('lists as many of the next turns as it is asked for', () => {
    const state = emptied(encounter({ members: [hero('bram', 12)], enemies: [orc('o1', 10)] }));

    const order = turnOrder(state, 6);

    expect(order).toHaveLength(6);
    for (const turn of order) expect(['bram', 'o1']).toContain(turn.id);
  });

  // @spec COMBAT-QUEUE-002
  it('always opens on whoever the fight will act next', () => {
    for (let seed = 1; seed <= 25; seed++) {
      const state = encounter({
        members: [hero('bram', 12), hero('tam', 16)], enemies: [orc('o1', 10), orc('o2', 7)], seed,
      });

      const [first] = turnOrder(state, 4);

      expect(first.id).toBe(nextActor(state).id);
      // And still, now that they stand ready and have not yet acted.
      expect(turnOrder(state, 4)[0].id).toBe(first.id);
    }
  });

  // @spec COMBAT-QUEUE-003
  it('forecasts exactly what the fight then does, ties and all', () => {
    for (let seed = 1; seed <= 25; seed++) {
      const state = encounter({
        members: [hero('bram', 12), hero('tam', 12)], enemies: [orc('o1', 12), orc('o2', 7)], seed,
      });

      const forecast = turnOrder(state, 12).map((t) => t.id);
      const played = [];
      for (let i = 0; i < 12; i++) {
        const actor = nextActor(state);
        played.push(actor.id);
        takeAction(state, actor.id, { kind: Action.PASS });
      }

      expect(forecast).toEqual(played);
    }
  });

  // @spec COMBAT-QUEUE-004
  it('holds a quick combatant more often than a slow one', () => {
    const state = emptied(encounter({ members: [hero('quick', 18)], enemies: [orc('slow', 6)] }));

    const ids = turnOrder(state, 8).map((t) => t.id);

    expect(ids.filter((id) => id === 'quick')).toHaveLength(6);
    expect(ids.filter((id) => id === 'slow')).toHaveLength(2);
  });

  // @spec COMBAT-QUEUE-005
  it('changes nothing about the fight by being asked', () => {
    const state = encounter({ members: [hero('bram', 12)], enemies: [orc('o1', 10)], seed: 9 });
    const twin = encounter({ members: [hero('bram', 12)], enemies: [orc('o1', 10)], seed: 9 });
    const bars = [...state.readiness];
    const beats = state.beats;

    const once = turnOrder(state, 10);
    const again = turnOrder(state, 10);

    expect(again).toEqual(once);
    expect([...state.readiness]).toEqual(bars);
    expect(state.beats).toBe(beats);
    // Nothing drawn: the generator is exactly where its untouched twin's is.
    expect(state.rng.int(0, 1000000)).toBe(twin.rng.int(0, 1000000));
  });

  // @spec COMBAT-QUEUE-006
  it('lists nobody unable to act', () => {
    const state = encounter({
      members: [hero('bram', 12), hero('tam', 12)], enemies: [orc('o1', 10)],
    });
    applyDamage(state.party, 'bram', 9999);

    expect(turnOrder(state, 8).map((t) => t.id)).not.toContain('bram');
  });

  // @spec COMBAT-QUEUE-007
  it('reports nothing once the encounter is over', () => {
    const state = encounter({ members: [hero('bram', 12)], enemies: [orc('o1', 10)] });
    const foe = state.enemies.members[0];
    foe.hitPoints = 0;
    foe.condition = 'DEAD';

    expect(turnOrder(state, 8)).toEqual([]);
  });
});
