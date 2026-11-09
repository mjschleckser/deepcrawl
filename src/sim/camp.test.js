import { describe, it, expect, vi } from 'vitest';
import { createFloor, setEdge, EdgeKind, Direction } from './floor.js';
import {
  createExploration, perform, tickCount, setCombatActive, PartyAction, computeSight,
} from './exploration.js';
import {
  createParty, createCharacter, addCharacter, character, applyDamage, CharacterClass, Condition,
} from './party.js';
import { spendSlot } from './magic.js';
import { createItem, ItemKind } from './items.js';
import { makeRng } from './rng.js';
import { packOf } from './party.js';
import { camp, enemyInSight, CampOutcome, CAMP_TICKS } from './camp.js';

function party() {
  const p = createParty();
  addCharacter(p, createCharacter({ id: 'isolde', name: 'Isolde', characterClass: CharacterClass.MAGE }));
  addCharacter(p, createCharacter({ id: 'wren', name: 'Wren', characterClass: CharacterClass.CLERIC }));
  addCharacter(p, createCharacter({ id: 'bram', name: 'Bram', characterClass: CharacterClass.FIGHTER }));
  for (const id of ['isolde', 'wren']) spendSlot(character(p, id), 1);
  return p;
}

function scene({ roamers = [], hooks = {} } = {}) {
  const floor = createFloor({ id: 'f1', width: 13, height: 13 });
  const state = createExploration({
    floors: [floor], floorId: 'f1', tile: { x: 6, y: 6 }, facing: Direction.NORTH, roamers, hooks,
  });
  computeSight(state);
  return { floor, state };
}

const roamer = (x, y) => ({ id: 'r1', floorId: 'f1', x, y, band: { members: [] } });

describe('whether the party may camp', () => {
  // @spec CAMP-REST-001
  it('is refused with an enemy in sight, spending nothing', () => {
    const p = party();
    const { state } = scene({ roamers: [roamer(6, 4)] });

    expect(enemyInSight(state)).toBe(true);
    expect(camp(state, p)).toEqual({ outcome: CampOutcome.REFUSED });
    expect(tickCount(state)).toBe(0);
    expect(character(p, 'isolde').spentSlots[1]).toBe(1);
  });

  // @spec CAMP-REST-001
  it('is allowed with an enemy behind a closed door, or beyond sight', () => {
    const behindDoor = scene({ roamers: [roamer(6, 4)] });
    setEdge(behindDoor.floor, 6, 5, Direction.NORTH, EdgeKind.DOOR);
    expect(enemyInSight(behindDoor.state)).toBe(false);

    const far = scene({ roamers: [roamer(0, 0)] });
    expect(enemyInSight(far.state)).toBe(false);
  });
});

describe('a camp', () => {
  // @spec CAMP-REST-002
  // @spec CAMP-REST-004
  // @spec CAMP-REST-006
  it('takes its ticks, lets roamers move on them, and restores every spent slot', () => {
    const onRoamersMove = vi.fn();
    const p = party();
    const { state } = scene({ hooks: { onRoamersMove } });

    expect(camp(state, p)).toEqual({ outcome: CampOutcome.RESTED, foraged: [] });

    expect(tickCount(state)).toBe(CAMP_TICKS);
    expect(onRoamersMove).toHaveBeenCalledWith({ floorId: 'f1', ticks: CAMP_TICKS });
    expect(character(p, 'isolde').spentSlots).toEqual({});
    expect(character(p, 'wren').spentSlots).toEqual({});
  });

  // @spec CAMP-REST-003
  it('is broken by an enemy reaching the party, restoring nothing', () => {
    const p = party();
    let state;
    ({ state } = scene({ hooks: { onContactCheck: () => setCombatActive(state, true) } }));

    expect(camp(state, p)).toEqual({ outcome: CampOutcome.BROKEN });
    expect(character(p, 'isolde').spentSlots[1]).toBe(1);
  });

  // @spec CAMP-REST-004
  // @spec CAMP-REST-005
  it('rests the unconscious too, without waking them or healing anybody', () => {
    const p = party();
    applyDamage(p, 'isolde', 999);
    character(p, 'wren').hitPoints = 3;
    const { state } = scene();

    camp(state, p);

    expect(character(p, 'isolde').condition).toBe(Condition.UNCONSCIOUS);
    expect(character(p, 'isolde').spentSlots).toEqual({});
    expect(character(p, 'wren').hitPoints).toBe(3);
  });

  it('restores nothing to the dead', () => {
    const p = party();
    applyDamage(p, 'isolde', 999);
    applyDamage(p, 'isolde', 1);
    const { state } = scene();

    camp(state, p);

    expect(character(p, 'isolde').condition).toBe(Condition.DEAD);
    expect(character(p, 'isolde').spentSlots[1]).toBe(1);
  });
});

describe('camping from exploration', () => {
  // @spec EXPLORE-ACTION-007
  it('routes a committed CAMP to the camp segment, charging no tick of its own', () => {
    const onCamp = vi.fn(() => ({ outcome: CampOutcome.RESTED }));
    const { state } = scene({ hooks: { onCamp } });

    const result = perform(state, { partyAction: PartyAction.CAMP, commit: true });

    expect(onCamp).toHaveBeenCalledTimes(1);
    expect(result.camp).toEqual({ outcome: CampOutcome.RESTED });
    expect(tickCount(state)).toBe(0);
  });
});

describe('food at camp', () => {
  const leaf = createItem({ id: 'bitterleaf', name: 'Bitterleaf', kind: ItemKind.FOOD, nourish: 100, heal: 10, traits: { tough: 2 } });

  // @spec CAMP-FOOD-001
  // @spec CAMP-FOOD-002
  it('clears meal buffs and forages when the camp is not broken', () => {
    const p = party();
    for (const c of p.members) c.buffs = [{ trait: 'hearty', points: 3 }];
    const { state } = scene();

    const result = camp(state, p, { forageList: [leaf], rng: makeRng(2) });

    expect(result.outcome).toBe(CampOutcome.RESTED);
    for (const c of p.members) expect(c.buffs).toEqual([]);
    expect(result.foraged.map((i) => i.id)).toEqual(['bitterleaf']);
    expect(packOf(p).map((i) => i.id)).toEqual(['bitterleaf']);
  });

  // @spec CAMP-FOOD-001
  it('keeps the buffs, and finds nothing, when the camp is broken', () => {
    const p = party();
    for (const c of p.members) c.buffs = [{ trait: 'hearty', points: 3 }];
    let state;
    ({ state } = scene({ hooks: { onContactCheck: () => setCombatActive(state, true) } }));

    camp(state, p, { forageList: [leaf], rng: makeRng(2) });

    for (const c of p.members) expect(c.buffs).toHaveLength(1);
    expect(packOf(p)).toEqual([]);
  });

  // @spec CAMP-HUNGER-001
  it('spends the camp\'s ticks on hunger as the party rests', () => {
    const p = party();
    let state;
    ({ state } = scene({ hooks: { onTick: (n) => { for (const c of p.members) c.fullness -= n; return []; } } }));

    camp(state, p);

    for (const c of p.members) expect(c.fullness).toBe(2000 - CAMP_TICKS);
  });
});
