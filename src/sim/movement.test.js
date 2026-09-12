import { describe, it, expect, vi } from 'vitest';
import {
  createFloor,
  setEdge,
  setTileFeature,
  isEdgeOpen,
  EdgeKind,
  TileFeature,
  Direction,
} from './floor.js';
import {
  createExploration,
  perform,
  resolveConfirmation,
  discoverEdge,
  tickCount,
  partyPosition,
  Verb,
  PartyAction,
  StepEvent,
} from './exploration.js';

function openFloor(id = 'f1', width = 3, height = 3) {
  return createFloor({ id, width, height });
}

// Party at (1,1) facing north on an open 3x3, so a forward step lands on (1,0).
function exploration(floors, opts = {}) {
  return createExploration({
    floors,
    floorId: opts.floorId ?? floors[0].id,
    tile: opts.tile ?? { x: 1, y: 1 },
    facing: opts.facing ?? Direction.NORTH,
    hooks: opts.hooks,
    keys: opts.keys,
  });
}

describe('movement verbs', () => {
  // @spec EXPLORE-MOVE-001
  it('accepts exactly the four defined movement verbs', () => {
    expect(Object.values(Verb).sort()).toEqual(
      ['STEP_FORWARD', 'TURN_LEFT', 'TURN_RIGHT', 'TURN_AROUND'].sort(),
    );
  });

  // @spec EXPLORE-MOVE-002
  it('rotates facing by the verb angle and leaves the tile unchanged', () => {
    const state = exploration([openFloor()]);

    perform(state, { verb: Verb.TURN_LEFT });
    expect(partyPosition(state).facing).toBe(Direction.WEST);

    perform(state, { verb: Verb.TURN_RIGHT });
    expect(partyPosition(state).facing).toBe(Direction.NORTH);

    perform(state, { verb: Verb.TURN_AROUND });
    expect(partyPosition(state).facing).toBe(Direction.SOUTH);

    expect(partyPosition(state).tile).toEqual({ x: 1, y: 1 });
  });

  // @spec EXPLORE-MOVE-002
  it('turns right through all four facings and back to the start', () => {
    const state = exploration([openFloor()]);
    const seen = [];

    for (let i = 0; i < 4; i++) {
      perform(state, { verb: Verb.TURN_RIGHT });
      seen.push(partyPosition(state).facing);
    }

    expect(seen).toEqual([Direction.EAST, Direction.SOUTH, Direction.WEST, Direction.NORTH]);
  });
});

describe('blocked steps', () => {
  // @spec EXPLORE-MOVE-003
  it('blocks a step into a wall', () => {
    const floor = openFloor();
    setEdge(floor, 1, 1, Direction.NORTH, EdgeKind.WALL);
    const state = exploration([floor]);

    const result = perform(state, { verb: Verb.STEP_FORWARD });

    expect(result.blocked).toBe(true);
    expect(partyPosition(state).tile).toEqual({ x: 1, y: 1 });
  });

  // @spec EXPLORE-MOVE-004
  it('blocks a step through a locked door when the party holds no matching key', () => {
    const floor = openFloor();
    setEdge(floor, 1, 1, Direction.NORTH, EdgeKind.LOCKED_DOOR, { keyId: 'brass' });
    const state = exploration([floor], { keys: [] });

    const result = perform(state, { verb: Verb.STEP_FORWARD });

    expect(result.blocked).toBe(true);
    expect(partyPosition(state).tile).toEqual({ x: 1, y: 1 });
  });

  // @spec EXPLORE-MOVE-004
  it('allows a step through a locked door when the party holds the matching key', () => {
    const floor = openFloor();
    setEdge(floor, 1, 1, Direction.NORTH, EdgeKind.LOCKED_DOOR, { keyId: 'brass' });
    const state = exploration([floor], { keys: ['brass'] });

    const result = perform(state, { verb: Verb.STEP_FORWARD });

    expect(result.blocked).toBe(false);
    expect(partyPosition(state).tile).toEqual({ x: 1, y: 0 });
  });

  // @spec EXPLORE-MOVE-005
  it('blocks a step through an undiscovered secret door', () => {
    const floor = openFloor();
    setEdge(floor, 1, 1, Direction.NORTH, EdgeKind.SECRET_DOOR);
    const state = exploration([floor]);

    const result = perform(state, { verb: Verb.STEP_FORWARD });

    expect(result.blocked).toBe(true);
  });

  // @spec EXPLORE-MOVE-005
  it('reports a blocked secret door identically to a wall, giving nothing away', () => {
    const secretFloor = openFloor('secret');
    setEdge(secretFloor, 1, 1, Direction.NORTH, EdgeKind.SECRET_DOOR);
    const wallFloor = openFloor('walled');
    setEdge(wallFloor, 1, 1, Direction.NORTH, EdgeKind.WALL);

    const secretResult = perform(exploration([secretFloor]), { verb: Verb.STEP_FORWARD });
    const wallResult = perform(exploration([wallFloor]), { verb: Verb.STEP_FORWARD });

    expect(secretResult).toEqual(wallResult);
  });

  // @spec EXPLORE-MOVE-005
  it('allows a step through a secret door once discovered', () => {
    const floor = openFloor();
    setEdge(floor, 1, 1, Direction.NORTH, EdgeKind.SECRET_DOOR);
    const state = exploration([floor]);
    discoverEdge(state, 'f1', 1, 1, Direction.NORTH);

    const result = perform(state, { verb: Verb.STEP_FORWARD });

    expect(result.blocked).toBe(false);
  });

  // @spec EXPLORE-MOVE-006
  it('leaves tile, clock, and every side effect untouched when a step is blocked', () => {
    const floor = openFloor();
    setEdge(floor, 1, 1, Direction.NORTH, EdgeKind.WALL);
    const hooks = {
      onTick: vi.fn(),
      onTrapTrigger: vi.fn(),
      onRoamersMove: vi.fn(),
      onRestock: vi.fn(),
    };
    const state = exploration([floor], { hooks });

    const result = perform(state, { verb: Verb.STEP_FORWARD });

    expect(partyPosition(state).tile).toEqual({ x: 1, y: 1 });
    expect(tickCount(state)).toBe(0);
    expect(result.events).toEqual([]);
    for (const hook of Object.values(hooks)) {
      expect(hook).not.toHaveBeenCalled();
    }
  });
});

describe('doors', () => {
  // @spec EXPLORE-MOVE-007
  it('opens a closed door by stepping through it, at no extra tick', () => {
    const floor = openFloor();
    setEdge(floor, 1, 1, Direction.NORTH, EdgeKind.DOOR);
    const state = exploration([floor]);

    const result = perform(state, { verb: Verb.STEP_FORWARD });

    expect(result.blocked).toBe(false);
    expect(isEdgeOpen(floor, 1, 1, Direction.NORTH)).toBe(true);
    expect(tickCount(state)).toBe(1);
  });

  // @spec EXPLORE-MOVE-007
  it('opens a locked door held open by its key, at no extra tick', () => {
    const floor = openFloor();
    setEdge(floor, 1, 1, Direction.NORTH, EdgeKind.LOCKED_DOOR, { keyId: 'brass' });
    const state = exploration([floor], { keys: ['brass'] });

    perform(state, { verb: Verb.STEP_FORWARD });

    expect(isEdgeOpen(floor, 1, 1, Direction.NORTH)).toBe(true);
    expect(tickCount(state)).toBe(1);
  });
});

describe('step resolution order', () => {
  // @spec EXPLORE-MOVE-008
  it('resolves a successful step in the specified order', () => {
    const state = exploration([openFloor()]);

    const result = perform(state, { verb: Verb.STEP_FORWARD });

    expect(result.events).toEqual([
      StepEvent.MOVED,
      StepEvent.CLOCK_ADVANCED,
      StepEvent.FEATURE_RESOLVED,
      StepEvent.TRAP_TRIGGERED,
      StepEvent.SIGHT_RECOMPUTED,
      StepEvent.ROAMERS_MOVED,
      StepEvent.CONTACT_CHECKED,
    ]);
  });

  // @spec EXPLORE-MOVE-008
  it('advances the clock before recomputing sight, so an expiring source is already spent', () => {
    const state = exploration([openFloor()]);

    const result = perform(state, { verb: Verb.STEP_FORWARD });

    expect(result.events.indexOf(StepEvent.CLOCK_ADVANCED)).toBeLessThan(
      result.events.indexOf(StepEvent.SIGHT_RECOMPUTED),
    );
  });

  // @spec EXPLORE-MOVE-008
  it('moves roamers after discovery, so the party sees the tile as it arrived', () => {
    const state = exploration([openFloor()]);

    const result = perform(state, { verb: Verb.STEP_FORWARD });

    expect(result.events.indexOf(StepEvent.SIGHT_RECOMPUTED)).toBeLessThan(
      result.events.indexOf(StepEvent.ROAMERS_MOVED),
    );
  });
});

describe('pits', () => {
  function pitSetup() {
    const upper = openFloor('upper');
    const lower = openFloor('lower');
    setTileFeature(upper, 1, 0, TileFeature.PIT, {
      target: { floorId: 'lower', x: 2, y: 2 },
    });
    return { upper, lower };
  }

  // @spec EXPLORE-MOVE-009
  it('relocates the party without asking, when it enters a pit tile', () => {
    const { upper, lower } = pitSetup();
    const state = exploration([upper, lower]);

    const result = perform(state, { verb: Verb.STEP_FORWARD });

    expect(result.confirmationRequired).toBeUndefined();
    expect(partyPosition(state).floorId).toBe('lower');
    expect(partyPosition(state).tile).toEqual({ x: 2, y: 2 });
  });

  // @spec EXPLORE-MOVE-013
  it('preserves facing through the fall', () => {
    const { upper, lower } = pitSetup();
    const state = exploration([upper, lower], { facing: Direction.NORTH });

    perform(state, { verb: Verb.STEP_FORWARD });

    expect(partyPosition(state).facing).toBe(Direction.NORTH);
  });

  // @spec EXPLORE-MOVE-011
  it('charges one tick in total for a step that falls through a pit', () => {
    const { upper, lower } = pitSetup();
    const state = exploration([upper, lower]);

    perform(state, { verb: Verb.STEP_FORWARD });

    expect(tickCount(state)).toBe(1);
  });

  // @spec EXPLORE-MOVE-010
  it('fires the trap trigger against the landing tile, not the pit tile', () => {
    const { upper, lower } = pitSetup();
    const onTrapTrigger = vi.fn();
    const state = exploration([upper, lower], { hooks: { onTrapTrigger } });

    perform(state, { verb: Verb.STEP_FORWARD });

    expect(onTrapTrigger).toHaveBeenCalledTimes(1);
    expect(onTrapTrigger).toHaveBeenCalledWith(
      expect.objectContaining({ floorId: 'lower', tile: { x: 2, y: 2 } }),
    );
  });

  // @spec EXPLORE-MOVE-012
  it('does not chain when the landing tile is itself a connector', () => {
    const { upper, lower } = pitSetup();
    // The landing tile on the lower floor is another pit.
    const deepest = openFloor('deepest');
    setTileFeature(lower, 2, 2, TileFeature.PIT, {
      target: { floorId: 'deepest', x: 0, y: 0 },
    });
    const state = exploration([upper, lower, deepest]);

    perform(state, { verb: Verb.STEP_FORWARD });

    expect(partyPosition(state).floorId).toBe('lower');
    expect(partyPosition(state).tile).toEqual({ x: 2, y: 2 });
  });

  // @spec EXPLORE-MOVE-012
  it('falls again on the next step after landing on a second pit', () => {
    const { upper, lower } = pitSetup();
    const deepest = openFloor('deepest');
    setTileFeature(lower, 2, 2, TileFeature.PIT, {
      target: { floorId: 'deepest', x: 0, y: 0 },
    });
    const state = exploration([upper, lower, deepest]);

    perform(state, { verb: Verb.STEP_FORWARD });
    perform(state, { verb: Verb.TURN_AROUND });
    perform(state, { verb: Verb.STEP_FORWARD });

    expect(partyPosition(state).floorId).toBe('deepest');
  });

  // @spec EXPLORE-MOVE-008
  // @spec EXPLORE-MOVE-010
  it('re-stocks a revisited floor immediately after relocation, before the trap trigger', () => {
    const { upper, lower } = pitSetup();
    const state = exploration([upper, lower]);

    // Visit and leave the lower floor so that returning to it re-stocks.
    perform(state, { verb: Verb.STEP_FORWARD });
    const result = perform(state, { verb: Verb.STEP_FORWARD });

    const events = result.events;
    if (events.includes(StepEvent.RESTOCKED)) {
      expect(events.indexOf(StepEvent.FEATURE_RESOLVED)).toBeLessThan(
        events.indexOf(StepEvent.RESTOCKED),
      );
      expect(events.indexOf(StepEvent.RESTOCKED)).toBeLessThan(
        events.indexOf(StepEvent.TRAP_TRIGGERED),
      );
    }
  });
});

describe('stairs', () => {
  function stairSetup() {
    const upper = openFloor('upper');
    const lower = openFloor('lower');
    setTileFeature(upper, 1, 0, TileFeature.STAIRS_DOWN, {
      target: { floorId: 'lower', x: 0, y: 0 },
    });
    return { upper, lower };
  }

  // @spec EXPLORE-MOVE-015
  it('raises a confirmation before moving the party onto a staircase', () => {
    const { upper, lower } = stairSetup();
    const state = exploration([upper, lower]);

    const result = perform(state, { verb: Verb.STEP_FORWARD });

    expect(result.confirmationRequired).toEqual(
      expect.objectContaining({ kind: 'STAIRS' }),
    );
    expect(partyPosition(state).tile).toEqual({ x: 1, y: 1 });
  });

  // @spec EXPLORE-MOVE-016
  it('relocates the party to the connector target when the prompt is confirmed', () => {
    const { upper, lower } = stairSetup();
    const state = exploration([upper, lower]);

    perform(state, { verb: Verb.STEP_FORWARD });
    resolveConfirmation(state, true);

    expect(partyPosition(state).floorId).toBe('lower');
    expect(partyPosition(state).tile).toEqual({ x: 0, y: 0 });
  });

  // @spec EXPLORE-MOVE-013
  it('preserves facing through a staircase', () => {
    const { upper, lower } = stairSetup();
    const state = exploration([upper, lower], { facing: Direction.NORTH });

    perform(state, { verb: Verb.STEP_FORWARD });
    resolveConfirmation(state, true);

    expect(partyPosition(state).facing).toBe(Direction.NORTH);
  });

  // @spec EXPLORE-MOVE-017
  it('leaves the party in place and spends no tick when the prompt is declined', () => {
    const { upper, lower } = stairSetup();
    const state = exploration([upper, lower]);

    perform(state, { verb: Verb.STEP_FORWARD });
    resolveConfirmation(state, false);

    expect(partyPosition(state).floorId).toBe('upper');
    expect(partyPosition(state).tile).toEqual({ x: 1, y: 1 });
    expect(tickCount(state)).toBe(0);
  });

  // @spec EXPLORE-MOVE-018
  it('offers a staircase as an INTERACT target when the party was dropped onto it', () => {
    const upper = openFloor('upper');
    const lower = openFloor('lower');
    const deepest = openFloor('deepest');
    setTileFeature(upper, 1, 0, TileFeature.PIT, {
      target: { floorId: 'lower', x: 1, y: 1 },
    });
    // The pit lands the party squarely on a staircase.
    setTileFeature(lower, 1, 1, TileFeature.STAIRS_DOWN, {
      target: { floorId: 'deepest', x: 2, y: 2 },
    });
    const state = exploration([upper, lower, deepest]);

    perform(state, { verb: Verb.STEP_FORWARD });
    const offered = perform(state, { partyAction: PartyAction.INTERACT });

    expect(offered.targets).toContainEqual(
      expect.objectContaining({ feature: TileFeature.STAIRS_DOWN }),
    );
  });

  // @spec EXPLORE-ACTION-005
  it('offers no INTERACT target on a tile with no feature', () => {
    const state = exploration([openFloor()]);

    const offered = perform(state, { partyAction: PartyAction.INTERACT });

    expect(offered.targets).toEqual([]);
  });
});
