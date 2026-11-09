import { describe, it, expect, vi } from 'vitest';
import {
  createFloor, setEdge, setTileFeature, EdgeKind, TileFeature, Direction, isEdgeOpen,
} from './floor.js';
import {
  createExploration, perform, resolveConfirmation, serialize, deserialize, Verb, StepEvent,
} from './exploration.js';
import {
  RESTOCK_FULL_TICKS, restockStrength, restockRng, planWarbands,
} from './restock.js';

describe('a re-stocking\'s strength', () => {
  // @spec EXPLORE-RETURN-004
  it('rises with the absence, full at a thousand ticks', () => {
    expect(RESTOCK_FULL_TICKS).toBe(1000);
    expect(restockStrength(0)).toBe(0);
    expect(restockStrength(250)).toBe(0.25);
    expect(restockStrength(1000)).toBe(1);
    expect(restockStrength(5000)).toBe(1);
  });
});

describe('what happens to the warbands', () => {
  const standing = ['a', 'b', 'c'];

  // @spec GEN-STOCK-002
  it('is the same for the same floor, count and absence', () => {
    const one = planWarbands({ standing, stocked: 3, strength: 0.5, rng: restockRng(77, 2) });
    const two = planWarbands({ standing, stocked: 3, strength: 0.5, rng: restockRng(77, 2) });
    expect(one).toEqual(two);
  });

  // @spec GEN-STOCK-003
  it('differs from one re-stocking of a floor to the next', () => {
    const plans = new Set();
    for (let count = 0; count < 12; count++) {
      plans.add(JSON.stringify(planWarbands({ standing, stocked: 3, strength: 0.5, rng: restockRng(77, count) })));
    }
    expect(plans.size).toBeGreaterThan(1);
  });

  // @spec GEN-STOCK-004
  // @spec EXPLORE-RETURN-008
  it('moves and returns at least as much for a longer absence', () => {
    for (let count = 0; count < 30; count++) {
      const short = planWarbands({ standing: ['a'], stocked: 3, strength: 0.3, rng: restockRng(5, count) });
      const long = planWarbands({ standing: ['a'], stocked: 3, strength: 0.7, rng: restockRng(5, count) });
      for (const id of short.move) expect(long.move).toContain(id);
      expect(long.returning).toBeGreaterThanOrEqual(short.returning);
    }
  });

  // @spec GEN-STOCK-004
  it('moves everything and refills to what was stocked at full strength, and never past it', () => {
    expect(planWarbands({ standing: ['a'], stocked: 3, strength: 1, rng: restockRng(5, 0) }))
      .toEqual({ move: ['a'], returning: 2 });
    expect(planWarbands({ standing: ['a', 'b', 'c', 'd'], stocked: 3, strength: 1, rng: restockRng(5, 0) }).returning)
      .toBe(0);
    expect(planWarbands({ standing: ['a'], stocked: 3, strength: 0, rng: restockRng(5, 0) }))
      .toEqual({ move: [], returning: 0 });
  });
});

describe('re-stocking on a return', () => {
  /** Two floors, stairs between them, and every door on the upper floor open. */
  function scene(onRestock = vi.fn(), seed = 31) {
    const upper = createFloor({ id: 'upper', width: 5, height: 5 });
    const lower = createFloor({ id: 'lower', width: 5, height: 5 });
    upper.seed = seed;
    for (let x = 0; x < 5; x++) setEdge(upper, x, 3, Direction.NORTH, EdgeKind.DOOR, { open: true });
    setTileFeature(upper, 2, 1, TileFeature.STAIRS_DOWN, { target: { floorId: 'lower', x: 2, y: 2 } });
    setTileFeature(lower, 2, 1, TileFeature.STAIRS_UP, { target: { floorId: 'upper', x: 2, y: 2 } });
    const state = createExploration({
      floors: [upper, lower], floorId: 'upper', tile: { x: 2, y: 2 }, facing: Direction.NORTH,
      hooks: { onRestock }, restockMinElapsedTicks: 100,
    });
    return { state, upper };
  }
  /** Down, wait out some ticks, and back up. */
  function goAndReturn(state, ticks) {
    perform(state, { verb: Verb.STEP_FORWARD });
    resolveConfirmation(state, true);
    state._advanceTicks(ticks);
    perform(state, { verb: Verb.STEP_FORWARD });
    return resolveConfirmation(state, true);
  }
  const openDoors = (upper) => [0, 1, 2, 3, 4].filter((x) => isEdgeOpen(upper, x, 3, Direction.NORTH));

  // @spec EXPLORE-RETURN-004
  it('closes doors the party opened at half the strength, and hands strength and generator on', () => {
    const onRestock = vi.fn();
    const { state, upper } = scene(onRestock);

    const result = goAndReturn(state, 5000);

    expect(result.events).toContain(StepEvent.RESTOCKED);
    expect(onRestock).toHaveBeenCalledWith(expect.objectContaining({ floorId: 'upper', strength: 1 }));
    expect(typeof onRestock.mock.calls[0][0].rng.next).toBe('function');
    // At full strength each door closes at a half chance; this floor's seed closes some.
    expect(openDoors(upper).length).toBeLessThan(5);
  });

  // @spec EXPLORE-RETURN-008
  it('closes at least the doors a shorter absence would have', () => {
    let closedByShort = 0;
    for (let seed = 1; seed <= 20; seed++) {
      const short = scene(vi.fn(), seed);
      goAndReturn(short.state, 300);
      const long = scene(vi.fn(), seed);
      goAndReturn(long.state, 900);

      for (const x of [0, 1, 2, 3, 4]) {
        if (openDoors(short.upper).includes(x)) continue;
        closedByShort++;
        expect(openDoors(long.upper)).not.toContain(x);
      }
    }
    expect(closedByShort).toBeGreaterThan(0);
  });

  // @spec EXPLORE-RETURN-011
  it('counts each floor\'s re-stockings, and keeps the count through a save', () => {
    const { state } = scene();
    goAndReturn(state, 500);
    goAndReturn(state, 500);
    expect(state.restockCounts.get('upper')).toBe(2);

    const back = deserialize(JSON.parse(JSON.stringify(serialize(state))));
    expect(back.restockCounts.get('upper')).toBe(2);
  });
});
