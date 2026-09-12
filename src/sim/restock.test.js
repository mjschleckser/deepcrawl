import { describe, it, expect, vi } from 'vitest';
import { createFloor, setTileFeature, TileFeature, Direction } from './floor.js';
import {
  createExploration,
  perform,
  resolveConfirmation,
  Verb,
  StepEvent,
} from './exploration.js';

// Two floors joined by stairs in both directions, so the party can leave one and
// come back to it.
function twoFloors() {
  const upper = createFloor({ id: 'upper', width: 3, height: 3 });
  const lower = createFloor({ id: 'lower', width: 3, height: 3 });
  setTileFeature(upper, 1, 0, TileFeature.STAIRS_DOWN, {
    target: { floorId: 'lower', x: 1, y: 1 },
  });
  setTileFeature(lower, 1, 0, TileFeature.STAIRS_UP, {
    target: { floorId: 'upper', x: 1, y: 1 },
  });
  return { upper, lower };
}

function descendAndReturn(state) {
  perform(state, { verb: Verb.STEP_FORWARD });
  resolveConfirmation(state, true); // now on the lower floor
  perform(state, { verb: Verb.STEP_FORWARD });
  return resolveConfirmation(state, true); // back on the upper floor
}

describe('returning to a floor', () => {
  // @spec EXPLORE-RETURN-003
  it('re-stocks a floor the party returns to, naming how long it was gone', () => {
    const onRestock = vi.fn();
    const { upper, lower } = twoFloors();
    const state = createExploration({
      floors: [upper, lower],
      floorId: 'upper',
      tile: { x: 1, y: 1 },
      facing: Direction.NORTH,
      hooks: { onRestock },
      restockMinElapsedTicks: 1,
    });

    const result = descendAndReturn(state);

    expect(onRestock).toHaveBeenCalledTimes(1);
    expect(onRestock).toHaveBeenCalledWith(
      expect.objectContaining({ floorId: 'upper', elapsed: expect.any(Number) }),
    );
    expect(result.events).toContain(StepEvent.RESTOCKED);
  });

  // @spec EXPLORE-RETURN-003
  it('does not re-stock a floor the party has never left', () => {
    const onRestock = vi.fn();
    const { upper, lower } = twoFloors();
    const state = createExploration({
      floors: [upper, lower],
      floorId: 'upper',
      tile: { x: 1, y: 1 },
      facing: Direction.SOUTH,
      hooks: { onRestock },
    });

    // Walk around the upper floor without ever taking the stairs.
    perform(state, { verb: Verb.STEP_FORWARD });
    perform(state, { verb: Verb.TURN_AROUND });
    perform(state, { verb: Verb.STEP_FORWARD });

    expect(onRestock).not.toHaveBeenCalled();
  });

  // @spec EXPLORE-RETURN-007
  it('does not re-stock when the absence falls below the minimum threshold', () => {
    const onRestock = vi.fn();
    const { upper, lower } = twoFloors();
    const state = createExploration({
      floors: [upper, lower],
      floorId: 'upper',
      tile: { x: 1, y: 1 },
      facing: Direction.NORTH,
      hooks: { onRestock },
      // A threshold no there-and-back trip can reach.
      restockMinElapsedTicks: 1000,
    });

    const result = descendAndReturn(state);

    expect(onRestock).not.toHaveBeenCalled();
    expect(result.events).not.toContain(StepEvent.RESTOCKED);
  });
});
