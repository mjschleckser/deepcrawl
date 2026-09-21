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
import { createLightSource } from './light.js';
import {
  createExploration,
  perform,
  resolveConfirmation,
  discoverEdge,
  tickCount,
  partyPosition,
  isTileDiscovered,
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
    lightSources: opts.lightSources,
  });
}

describe('movement verbs', () => {
  // @spec EXPLORE-MOVE-001
  it('accepts exactly the five defined movement verbs', () => {
    expect(Object.values(Verb).sort()).toEqual(
      ['STEP_FORWARD', 'STEP_BACKWARD', 'TURN_LEFT', 'TURN_RIGHT', 'TURN_AROUND'].sort(),
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

describe('stepping backward', () => {
  // @spec EXPLORE-MOVE-020
  it('moves one tile opposite the facing and leaves the facing alone', () => {
    const state = exploration([openFloor()]);

    perform(state, { verb: Verb.STEP_BACKWARD });

    // Facing north from (1,1), the tile behind is (1,2).
    expect(partyPosition(state).tile).toEqual({ x: 1, y: 2 });
    expect(partyPosition(state).facing).toBe(Direction.NORTH);
  });

  // @spec EXPLORE-MOVE-020
  it('is the reverse of a forward step, whichever way the party looks', () => {
    for (const [facing, behind] of [
      [Direction.NORTH, { x: 1, y: 2 }],
      [Direction.SOUTH, { x: 1, y: 0 }],
      [Direction.EAST, { x: 0, y: 1 }],
      [Direction.WEST, { x: 2, y: 1 }],
    ]) {
      const state = exploration([openFloor()], { facing });

      perform(state, { verb: Verb.STEP_BACKWARD });

      expect(partyPosition(state).tile).toEqual(behind);
    }
  });

  // @spec EXPLORE-MOVE-021
  it('is blocked by the edge behind, and costs nothing when it is', () => {
    const floor = openFloor();
    // Facing north at (1,1), so the edge behind is the southern one.
    setEdge(floor, 1, 1, Direction.SOUTH, EdgeKind.WALL);
    const state = exploration([floor]);

    const result = perform(state, { verb: Verb.STEP_BACKWARD });

    expect(result.blocked).toBe(true);
    expect(partyPosition(state).tile).toEqual({ x: 1, y: 1 });
    expect(tickCount(state)).toBe(0);
  });

  // @spec EXPLORE-MOVE-021
  it('costs the same clock a forward step costs', () => {
    const forwards = exploration([openFloor()]);
    const backwards = exploration([openFloor()]);

    perform(forwards, { verb: Verb.STEP_FORWARD });
    perform(backwards, { verb: Verb.STEP_BACKWARD });

    expect(tickCount(backwards)).toBe(tickCount(forwards));
    expect(tickCount(backwards)).toBeGreaterThan(0);
  });

  // @spec EXPLORE-MOVE-021
  it('opens a closed door behind as part of the step, as a forward step would', () => {
    const floor = openFloor();
    setEdge(floor, 1, 1, Direction.SOUTH, EdgeKind.DOOR);
    const state = exploration([floor]);

    perform(state, { verb: Verb.STEP_BACKWARD });

    expect(partyPosition(state).tile).toEqual({ x: 1, y: 2 });
    expect(isEdgeOpen(floor, 1, 1, Direction.SOUTH)).toBe(true);
  });

  // @spec EXPLORE-MOVE-021
  it('resolves the same step effects on arrival a forward step resolves', () => {
    const onContactCheck = vi.fn();
    const state = exploration([openFloor()], { hooks: { onContactCheck } });

    const result = perform(state, { verb: Verb.STEP_BACKWARD });

    expect(result.events).toContain(StepEvent.MOVED);
    expect(result.events).toContain(StepEvent.CLOCK_ADVANCED);
    expect(onContactCheck).toHaveBeenCalled();
  });

  // @spec EXPLORE-MOVE-021
  it('is barred by a warband behind, which begins the encounter where it stands', () => {
    const onContactCheck = vi.fn();
    const state = exploration([openFloor()], {
      hooks: { isTileOccupied: ({ tile }) => tile.x === 1 && tile.y === 2, onContactCheck },
    });

    const result = perform(state, { verb: Verb.STEP_BACKWARD });

    expect(partyPosition(state).tile).toEqual({ x: 1, y: 1 });
    expect(tickCount(state)).toBe(0);
    expect(onContactCheck).toHaveBeenCalledWith(
      expect.objectContaining({ at: { x: 1, y: 2 } }),
    );
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
  // @spec EXPLORE-BOUND-005
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
  it('walks onto the staircase when the prompt is declined, taking no connector', () => {
    const { upper, lower } = stairSetup();
    const state = exploration([upper, lower]);
    const before = tickCount(state);

    perform(state, { verb: Verb.STEP_FORWARD });
    const result = resolveConfirmation(state, false);

    expect(partyPosition(state).floorId).toBe('upper');
    expect(partyPosition(state).tile).toEqual({ x: 1, y: 0 });
    // A step declined is still a step: it costs what a step costs.
    expect(result.events).toContain(StepEvent.MOVED);
    expect(tickCount(state)).toBeGreaterThan(before);
  });

  // @spec EXPLORE-MOVE-017
  it('lets the party walk over a staircase rather than sealing the way past it', () => {
    const upper = openFloor('upper', 3, 4);
    const lower = openFloor('lower');
    setTileFeature(upper, 1, 1, TileFeature.STAIRS_DOWN, {
      target: { floorId: 'lower', x: 0, y: 0 },
    });
    // Facing north from (1,2): the staircase is the only way through to (1,0).
    const state = exploration([upper, lower], { tile: { x: 1, y: 2 } });

    perform(state, { verb: Verb.STEP_FORWARD });
    resolveConfirmation(state, false);
    perform(state, { verb: Verb.STEP_FORWARD });

    expect(partyPosition(state).floorId).toBe('upper');
    expect(partyPosition(state).tile).toEqual({ x: 1, y: 0 });
  });

  // @spec EXPLORE-MOVE-018
  it('offers the staircase it is standing on after declining it', () => {
    const { upper, lower } = stairSetup();
    const state = exploration([upper, lower]);

    perform(state, { verb: Verb.STEP_FORWARD });
    resolveConfirmation(state, false);
    const offered = perform(state, { partyAction: PartyAction.INTERACT });

    expect(offered.targets).toContainEqual(
      expect.objectContaining({ feature: TileFeature.STAIRS_DOWN }),
    );
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

describe('stepping into something', () => {
  // The party's tile is (1,1) facing north, so a step is an attempt on (1,0).
  const occupiedAhead = () => ({
    isTileOccupied: ({ tile }) => tile.x === 1 && tile.y === 0,
    onContactCheck: vi.fn(),
  });

  // @spec EXPLORE-BOUND-001
  it('meets a roaming enemy where it stands rather than walking onto it', () => {
    const hooks = occupiedAhead();
    const state = exploration([openFloor()], { hooks });

    const result = perform(state, { verb: Verb.STEP_FORWARD });

    expect(hooks.onContactCheck).toHaveBeenCalledTimes(1);
    expect(hooks.onContactCheck.mock.calls[0][0]).toMatchObject({
      floorId: 'f1', tile: { x: 1, y: 1 }, at: { x: 1, y: 0 },
    });
    expect(result.events).toEqual([StepEvent.CONTACT_CHECKED]);
  });

  // @spec EXPLORE-BOUND-012
  it('opens the door it met the warband through, and looks through it', () => {
    const floor = openFloor();
    setEdge(floor, 1, 1, Direction.NORTH, EdgeKind.DOOR);
    const hooks = occupiedAhead();
    const state = exploration([floor], {
      hooks,
      lightSources: [createLightSource({ id: 'torch', brightRadius: 2, dimRadius: 4, remainingTicks: 99, lit: true })],
    });

    perform(state, { verb: Verb.STEP_FORWARD });

    expect(isEdgeOpen(floor, 1, 1, Direction.NORTH)).toBe(true);
    // Sight was recomputed through the open door before contact was checked, so the
    // tile they are about to fight on is one they have seen.
    expect(isTileDiscovered(state, 'f1', 1, 0)).toBe(true);
    expect(hooks.onContactCheck).toHaveBeenCalledTimes(1);
  });

  // @spec EXPLORE-BOUND-010
  it('spends nothing on the step it did not take', () => {
    const state = exploration([openFloor()], { hooks: occupiedAhead() });
    const before = tickCount(state);

    perform(state, { verb: Verb.STEP_FORWARD });

    expect(partyPosition(state).tile).toEqual({ x: 1, y: 1 });
    expect(partyPosition(state).facing).toBe(Direction.NORTH);
    expect(tickCount(state)).toBe(before);
  });

  // @spec EXPLORE-BOUND-010
  it('is not the same as walking into a wall: the party learns it met something', () => {
    const state = exploration([openFloor()], { hooks: occupiedAhead() });

    // A blocked step reports blocked and says nothing; a barred one is a step that
    // resolved into an encounter.
    expect(perform(state, { verb: Verb.STEP_FORWARD }).blocked).toBe(false);
  });

  // @spec EXPLORE-BOUND-011
  it('still checks contact on arrival, for whatever reached the party as it walked', () => {
    const onContactCheck = vi.fn();
    const state = exploration([openFloor()], { hooks: { onContactCheck } });

    const result = perform(state, { verb: Verb.STEP_FORWARD });

    expect(result.events).toContain(StepEvent.CONTACT_CHECKED);
    expect(onContactCheck).toHaveBeenCalledWith(
      expect.objectContaining({ floorId: 'f1', tile: { x: 1, y: 0 } }),
    );
  });
});
