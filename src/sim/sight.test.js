import { describe, it, expect, vi } from 'vitest';
import {
  createFloor,
  setEdge,
  setTileFeature,
  setTileLight,
  EdgeKind,
  TileFeature,
  LightLevel,
  Direction,
} from './floor.js';
import { createLightSource } from './light.js';
import {
  createExploration,
  perform,
  computeSight,
  isTileDiscovered,
  isEdgeKnown,
  recordTrapDetected,
  isTrapKnown,
  enemiesVisibleAt,
  detectionAt,
  discoverEdge,
  Verb,
  PartyAction,
} from './exploration.js';

const lantern = (over = {}) =>
  createLightSource({ id: 'l', brightRadius: 1, dimRadius: 4, remainingTicks: 99, lit: true, ...over });

// 7x7 open floor, party in the middle at (3,3) facing north.
function scene({ sources = [lantern()], facing = Direction.NORTH, hooks } = {}) {
  const floor = createFloor({ id: 'f1', width: 7, height: 7 });
  const state = createExploration({
    floors: [floor],
    floorId: 'f1',
    tile: { x: 3, y: 3 },
    facing,
    lightSources: sources,
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

// Sight spreads outward through edges that are not opaque, so a lone wall segment in
// an open room is simply walked around by eye. Blocking is only meaningful where there
// is no way past: a one-tile-wide corridor running north from the party.
function corridor() {
  const { floor, state } = scene();
  for (let y = 0; y <= 3; y++) {
    setEdge(floor, 3, y, Direction.WEST, EdgeKind.WALL);
    setEdge(floor, 3, y, Direction.EAST, EdgeKind.WALL);
  }
  return { floor, state };
}

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

describe('discovery', () => {
  // @spec EXPLORE-SIGHT-003
  it('always sees the occupied tile and its edges when that tile is not dark', () => {
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

    // Never stood on it, but it is two tiles ahead and lit.
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

  // @spec EXPLORE-SIGHT-008
  it('records nothing at all in the dark', () => {
    const { state } = scene({ sources: [lantern({ lit: false })] });

    computeSight(state);

    expect(isTileDiscovered(state, 'f1', 3, 3)).toBe(false);
    expect(isTileDiscovered(state, 'f1', 3, 1)).toBe(false);
  });

  // @spec EXPLORE-SIGHT-008
  it('still maps a tile the dungeon lights for itself while the party carries nothing', () => {
    const { floor, state } = scene({ sources: [] });
    setTileLight(floor, 3, 3, LightLevel.DIM);

    computeSight(state);

    expect(isTileDiscovered(state, 'f1', 3, 3)).toBe(true);
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
      lightSources: [lantern()],
    });

    computeSight(state);
    expect(isTileDiscovered(state, 'upper', 3, 1)).toBe(true);

    perform(state, { verb: Verb.STEP_FORWARD }); // falls to the lower floor

    expect(isTileDiscovered(state, 'upper', 3, 1)).toBe(true);
  });
});

describe('what light gates', () => {
  // @spec EXPLORE-SIGHT-006
  it('reveals enemies in bright light only', () => {
    expect(enemiesVisibleAt(LightLevel.BRIGHT)).toBe(true);
    expect(enemiesVisibleAt(LightLevel.DIM)).toBe(false);
    expect(enemiesVisibleAt(LightLevel.DARK)).toBe(false);
  });

  // @spec EXPLORE-SIGHT-006
  it('marks each visible tile with whether an enemy on it would be seen', () => {
    const { state } = scene();

    const result = computeSight(state);
    const adjacent = result.tiles.find((t) => t.x === 3 && t.y === 2);
    const distant = result.tiles.find((t) => t.x === 3 && t.y === 0);

    expect(adjacent.level).toBe(LightLevel.BRIGHT);
    expect(adjacent.enemiesVisible).toBe(true);
    expect(distant.level).toBe(LightLevel.DIM);
    expect(distant.enemiesVisible).toBe(false);
  });

  // @spec EXPLORE-SIGHT-007
  it('penalises trap and secret-door detection in dim light, and forbids it in the dark', () => {
    expect(detectionAt(LightLevel.BRIGHT)).toEqual({ canDetect: true, penalised: false });
    expect(detectionAt(LightLevel.DIM)).toEqual({ canDetect: true, penalised: true });
    expect(detectionAt(LightLevel.DARK)).toEqual({ canDetect: false, penalised: false });
  });

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
  it('offers each tile sight reached to the trap segment, with its light level', () => {
    const onTrapDetect = vi.fn();
    const { state } = scene({ hooks: { onTrapDetect } });

    computeSight(state);

    expect(onTrapDetect).toHaveBeenCalledWith(
      expect.objectContaining({
        floorId: 'f1',
        tiles: expect.arrayContaining([
          expect.objectContaining({ x: 3, y: 2, level: LightLevel.BRIGHT }),
        ]),
        deliberate: false,
      }),
    );
  });

  // @spec EXPLORE-BOUND-007
  it('offers the searched tile with its light level when the party searches', () => {
    const onTrapDetect = vi.fn();
    const { state } = scene({ hooks: { onTrapDetect } });
    onTrapDetect.mockClear();

    perform(state, { partyAction: PartyAction.SEARCH, commit: true });

    expect(onTrapDetect).toHaveBeenCalledWith(
      expect.objectContaining({
        floorId: 'f1',
        deliberate: true,
        tiles: [expect.objectContaining({ x: 3, y: 3, level: LightLevel.BRIGHT })],
      }),
    );
  });
});
