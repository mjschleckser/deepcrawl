import { describe, it, expect, vi } from 'vitest';
import {
  createFloor,
  setEdge,
  setTileFeature,
  EdgeKind,
  TileFeature,
  Direction,
} from './floor.js';
import {
  createExploration,
  perform,
  partyPosition,
  computeSight,
  isTileDiscovered,
  isEdgeKnown,
  recordTrapDetected,
  isTrapKnown,
  discoverEdge,
  SIGHT_RANGE,
  Verb,
  PartyAction,
} from './exploration.js';

// 7x7 open floor, party in the middle at (3,3) facing north.
function scene({ facing = Direction.NORTH, hooks } = {}) {
  const floor = createFloor({ id: 'f1', width: 7, height: 7 });
  const state = createExploration({
    floors: [floor],
    floorId: 'f1',
    tile: { x: 3, y: 3 },
    facing,
    hooks,
  });
  return { floor, state };
}

describe('the sight cone', () => {
  // @spec EXPLORE-SIGHT-001
  it('sees straight ahead and 45 degrees either side, but not abeam', () => {
    const { state } = scene();

    computeSight(state);

    expect(isTileDiscovered(state, 'f1', 3, 1)).toBe(true); // dead ahead
    expect(isTileDiscovered(state, 'f1', 2, 2)).toBe(true); // 45 degrees left
    expect(isTileDiscovered(state, 'f1', 4, 2)).toBe(true); // 45 degrees right
    expect(isTileDiscovered(state, 'f1', 1, 3)).toBe(false); // abeam, 90 degrees
    expect(isTileDiscovered(state, 'f1', 3, 5)).toBe(false); // behind
  });

  // @spec EXPLORE-SIGHT-001
  it('excludes tiles just outside the 45 degree edge', () => {
    const { state } = scene();

    computeSight(state);

    // (5,2) is two across and one ahead: outside 45 degrees.
    expect(isTileDiscovered(state, 'f1', 5, 2)).toBe(false);
  });

  // @spec EXPLORE-SIGHT-001
  it('turns the cone with the party', () => {
    const { state } = scene({ facing: Direction.EAST });

    computeSight(state);

    expect(isTileDiscovered(state, 'f1', 5, 3)).toBe(true); // dead ahead, east
    expect(isTileDiscovered(state, 'f1', 3, 1)).toBe(false); // north is now abeam
  });
});

// A one-tile-wide corridor running north from the party, for testing what stops sight
// along a single unambiguous line.
function corridor() {
  const { floor, state } = scene();
  for (let y = 0; y <= 3; y++) {
    setEdge(floor, 3, y, Direction.WEST, EdgeKind.WALL);
    setEdge(floor, 3, y, Direction.EAST, EdgeKind.WALL);
  }
  return { floor, state };
}

describe('how far the party sees', () => {
  // @spec EXPLORE-SIGHT-001
  it('sees four tiles, diagonals counting as one step, and no further', () => {
    const floor = createFloor({ id: 'f1', width: 13, height: 13 });
    const state = createExploration({
      floors: [floor], floorId: 'f1', tile: { x: 6, y: 10 }, facing: Direction.NORTH,
    });

    computeSight(state);

    expect(SIGHT_RANGE).toBe(4);
    expect(isTileDiscovered(state, 'f1', 6, 6)).toBe(true); // four ahead
    expect(isTileDiscovered(state, 'f1', 6, 5)).toBe(false); // five ahead
    expect(isTileDiscovered(state, 'f1', 2, 6)).toBe(true); // four along the diagonal
    expect(isTileDiscovered(state, 'f1', 1, 5)).toBe(false); // five along it
  });

  // @spec EXPLORE-SIGHT-004
  it('discovers every tile in reach alike, the far ones as fully as the near', () => {
    const { state } = scene();

    const result = computeSight(state);

    expect(result.tiles.find((t) => t.x === 3 && t.y === 0)).toEqual({ x: 3, y: 0, feature: TileFeature.NONE });
    expect(result.tiles.find((t) => t.x === 3 && t.y === 2)).toEqual({ x: 3, y: 2, feature: TileFeature.NONE });
  });
});

describe('what blocks sight', () => {
  // @spec EXPLORE-SIGHT-002
  it('stops at a wall', () => {
    const { floor, state } = corridor();
    setEdge(floor, 3, 2, Direction.NORTH, EdgeKind.WALL);

    computeSight(state);

    expect(isTileDiscovered(state, 'f1', 3, 2)).toBe(true);
    expect(isTileDiscovered(state, 'f1', 3, 1)).toBe(false);
  });

  // @spec EXPLORE-SIGHT-002
  it('stops at a closed door, so a room cannot be mapped before entering it', () => {
    const { floor, state } = corridor();
    setEdge(floor, 3, 2, Direction.NORTH, EdgeKind.DOOR);

    computeSight(state);

    expect(isTileDiscovered(state, 'f1', 3, 1)).toBe(false);
  });

  // @spec EXPLORE-SIGHT-002
  it('sees through a door that generation left open', () => {
    const { floor, state } = corridor();
    setEdge(floor, 3, 2, Direction.NORTH, EdgeKind.DOOR, { open: true });

    computeSight(state);

    expect(isTileDiscovered(state, 'f1', 3, 1)).toBe(true);
  });

  // @spec EXPLORE-SIGHT-002
  it('stops at an undiscovered secret door, exactly as at a wall', () => {
    const { floor, state } = corridor();
    setEdge(floor, 3, 2, Direction.NORTH, EdgeKind.SECRET_DOOR);

    computeSight(state);

    expect(isTileDiscovered(state, 'f1', 3, 1)).toBe(false);
  });
});

describe('sight does not go round corners', () => {
  // An L-shaped corridor: north from the party, then east at the top. Nothing in the
  // eastern arm is in line of sight until the party reaches the turn.
  function elbow() {
    const floor = createFloor({ id: 'f1', width: 7, height: 7 });
    // Wall off everything except the vertical arm at x=3 (y 3..6) and the horizontal
    // arm at y=3 (x 3..6).
    for (let y = 0; y < 7; y++) {
      for (let x = 0; x < 7; x++) {
        const inVertical = x === 3 && y >= 3;
        const inHorizontal = y === 3 && x >= 3;
        if (inVertical || inHorizontal) continue;
        for (const dir of Object.values(Direction)) setEdge(floor, x, y, dir, EdgeKind.WALL);
      }
    }
    const state = createExploration({
      floors: [floor],
      floorId: 'f1',
      tile: { x: 3, y: 6 },
      facing: Direction.NORTH,
    });
    return { floor, state };
  }

  // @spec EXPLORE-SIGHT-012
  it('hides the far arm of an elbow until the party reaches the turn', () => {
    const { state } = elbow();

    computeSight(state);

    // Straight up the corridor is visible...
    expect(isTileDiscovered(state, 'f1', 3, 4)).toBe(true);
    expect(isTileDiscovered(state, 'f1', 3, 3)).toBe(true);
    // ...but the arm running east from the turn is not.
    expect(isTileDiscovered(state, 'f1', 5, 3)).toBe(false);
    expect(isTileDiscovered(state, 'f1', 6, 3)).toBe(false);
  });

  // @spec EXPLORE-SIGHT-012
  it('reveals the far arm once the party stands at the turn and looks along it', () => {
    const { state } = elbow();

    perform(state, { verb: Verb.STEP_FORWARD });
    perform(state, { verb: Verb.STEP_FORWARD });
    perform(state, { verb: Verb.STEP_FORWARD });
    perform(state, { verb: Verb.TURN_RIGHT });

    expect(partyPosition(state).tile).toEqual({ x: 3, y: 3 });
    expect(isTileDiscovered(state, 'f1', 5, 3)).toBe(true);
  });

  // @spec EXPLORE-SIGHT-002
  it('hides the tile directly behind a lone wall standing in open floor', () => {
    const { floor, state } = scene();
    setEdge(floor, 3, 2, Direction.NORTH, EdgeKind.WALL);

    computeSight(state);

    expect(isTileDiscovered(state, 'f1', 3, 2)).toBe(true);
    // Straight through the wall is not seen, even though the party could walk around.
    expect(isTileDiscovered(state, 'f1', 3, 1)).toBe(false);
  });

  // @spec EXPLORE-SIGHT-013
  it('sees through a single diagonal gap between two blocks', () => {
    const { floor, state } = scene();
    // Two blocks meeting at a corner point, leaving one diagonal slit open.
    setEdge(floor, 2, 2, Direction.NORTH, EdgeKind.WALL);
    setEdge(floor, 2, 2, Direction.EAST, EdgeKind.WALL);

    computeSight(state);

    // The way straight ahead is untouched.
    expect(isTileDiscovered(state, 'f1', 3, 1)).toBe(true);
  });
});

describe('discovery', () => {
  // @spec EXPLORE-SIGHT-003
  it('always sees the occupied tile and its edges', () => {
    const { state } = scene();

    computeSight(state);

    expect(isTileDiscovered(state, 'f1', 3, 3)).toBe(true);
    for (const dir of Object.values(Direction)) {
      expect(isEdgeKnown(state, 'f1', 3, 3, dir)).toBe(true);
    }
  });

  // @spec EXPLORE-SIGHT-004
  it('discovers a tile, its four edges, and its feature the moment sight reaches it', () => {
    const { floor, state } = scene();
    setTileFeature(floor, 3, 1, TileFeature.STAIRS_DOWN, {
      target: { floorId: 'other', x: 0, y: 0 },
    });

    const result = computeSight(state);

    expect(isTileDiscovered(state, 'f1', 3, 1)).toBe(true);
    expect(isEdgeKnown(state, 'f1', 3, 1, Direction.EAST)).toBe(true);
    expect(result.tiles).toContainEqual(
      expect.objectContaining({ x: 3, y: 1, feature: TileFeature.STAIRS_DOWN }),
    );
  });

  // @spec EXPLORE-SIGHT-004
  it('discovers by sight rather than by standing, so a room need not be walked', () => {
    const { state } = scene();

    computeSight(state);

    // Never stood on it, but it is two tiles ahead.
    expect(isTileDiscovered(state, 'f1', 3, 1)).toBe(true);
  });

  // @spec EXPLORE-SIGHT-005
  it('never gives up an undiscovered secret door, even on a tile it discovers', () => {
    const { floor, state } = scene();
    // A secret door on the far side of a tile the party can plainly see.
    setEdge(floor, 3, 2, Direction.EAST, EdgeKind.SECRET_DOOR);

    computeSight(state);

    expect(isTileDiscovered(state, 'f1', 3, 2)).toBe(true);
    expect(isEdgeKnown(state, 'f1', 3, 2, Direction.EAST)).toBe(false);
  });

  // @spec EXPLORE-SIGHT-005
  it('knows a secret door once the search mechanics find it', () => {
    const { floor, state } = scene();
    setEdge(floor, 3, 2, Direction.EAST, EdgeKind.SECRET_DOOR);

    discoverEdge(state, 'f1', 3, 2, Direction.EAST);
    computeSight(state);

    expect(isEdgeKnown(state, 'f1', 3, 2, Direction.EAST)).toBe(true);
  });

  // @spec EXPLORE-SIGHT-011
  it('records what a turn reveals, though a turn costs no tick', () => {
    const { state } = scene({ facing: Direction.NORTH });
    computeSight(state);
    expect(isTileDiscovered(state, 'f1', 5, 3)).toBe(false);

    perform(state, { verb: Verb.TURN_RIGHT });

    // Now facing east, the corridor to the right has been looked at.
    expect(isTileDiscovered(state, 'f1', 5, 3)).toBe(true);
  });

  // @spec EXPLORE-SIGHT-009
  it('keeps discovery permanently, across leaving and returning to a floor', () => {
    const upper = createFloor({ id: 'upper', width: 7, height: 7 });
    const lower = createFloor({ id: 'lower', width: 7, height: 7 });
    setTileFeature(upper, 3, 2, TileFeature.PIT, { target: { floorId: 'lower', x: 1, y: 1 } });
    const state = createExploration({
      floors: [upper, lower],
      floorId: 'upper',
      tile: { x: 3, y: 3 },
      facing: Direction.NORTH,
    });

    computeSight(state);
    expect(isTileDiscovered(state, 'upper', 3, 1)).toBe(true);

    perform(state, { verb: Verb.STEP_FORWARD }); // falls to the lower floor

    expect(isTileDiscovered(state, 'upper', 3, 1)).toBe(true);
  });
});

describe('the trap record', () => {
  // @spec EXPLORE-SIGHT-010
  it('records a trap the trap segment reports, and keeps it', () => {
    const { state } = scene();

    expect(isTrapKnown(state, 'f1', 2, 2)).toBe(false);
    recordTrapDetected(state, 'f1', 2, 2);

    expect(isTrapKnown(state, 'f1', 2, 2)).toBe(true);
  });
});

describe('the trap detection boundary', () => {
  // @spec EXPLORE-BOUND-008
  it('offers each tile sight reached to the trap segment', () => {
    const onTrapDetect = vi.fn();
    const { state } = scene({ hooks: { onTrapDetect } });

    computeSight(state);

    expect(onTrapDetect).toHaveBeenCalledWith(
      expect.objectContaining({
        floorId: 'f1',
        tiles: expect.arrayContaining([
          expect.objectContaining({ x: 3, y: 2 }),
        ]),
        deliberate: false,
      }),
    );
  });

  // @spec EXPLORE-BOUND-007
  it('offers the searched tile when the party searches, and nothing else', () => {
    const onTrapDetect = vi.fn();
    const { state } = scene({ hooks: { onTrapDetect } });
    onTrapDetect.mockClear();

    perform(state, { partyAction: PartyAction.SEARCH, commit: true });

    expect(onTrapDetect).toHaveBeenCalledWith(
      expect.objectContaining({
        floorId: 'f1',
        deliberate: true,
        tiles: [{ x: 3, y: 3 }],
      }),
    );
  });
});
