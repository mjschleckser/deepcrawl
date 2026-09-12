import { describe, it, expect } from 'vitest';
import {
  createFloor,
  getEdge,
  setEdge,
  isEdgeOpen,
  getTile,
  setTileFeature,
  setTileLight,
  EdgeKind,
  TileFeature,
  LightLevel,
  Direction,
} from './floor.js';

// A bare 3x3 floor: open interior, walled border. Enough to exercise the edge model
// without any floor-graph or lighting setup.
function blankFloor(overrides = {}) {
  return createFloor({ id: 'f1', width: 3, height: 3, ...overrides });
}

describe('floor representation', () => {
  // @spec EXPLORE-FLOOR-001
  it('stores per-floor width and height rather than assuming a fixed size', () => {
    const wide = createFloor({ id: 'wide', width: 12, height: 4 });
    const tall = createFloor({ id: 'tall', width: 4, height: 12 });

    expect(wide.width).toBe(12);
    expect(wide.height).toBe(4);
    expect(tall.width).toBe(4);
    expect(tall.height).toBe(12);
  });

  // @spec EXPLORE-FLOOR-002
  it('stores each edge once, so adjoining tiles cannot disagree about it', () => {
    const floor = blankFloor();

    // The south edge of (1,1) and the north edge of (1,2) are the same edge.
    setEdge(floor, 1, 1, Direction.SOUTH, EdgeKind.DOOR);

    expect(getEdge(floor, 1, 1, Direction.SOUTH)).toBe(EdgeKind.DOOR);
    expect(getEdge(floor, 1, 2, Direction.NORTH)).toBe(EdgeKind.DOOR);
  });

  // @spec EXPLORE-FLOOR-002
  it('sizes the two edge arrays to hold every edge exactly once', () => {
    const floor = createFloor({ id: 'f', width: 5, height: 3 });

    expect(floor.horizontalEdges).toHaveLength(5 * (3 + 1));
    expect(floor.verticalEdges).toHaveLength((5 + 1) * 3);
  });

  // @spec EXPLORE-FLOOR-003
  it('walls the entire outermost ring', () => {
    const floor = blankFloor();

    for (let x = 0; x < floor.width; x++) {
      expect(getEdge(floor, x, 0, Direction.NORTH)).toBe(EdgeKind.WALL);
      expect(getEdge(floor, x, floor.height - 1, Direction.SOUTH)).toBe(EdgeKind.WALL);
    }
    for (let y = 0; y < floor.height; y++) {
      expect(getEdge(floor, 0, y, Direction.WEST)).toBe(EdgeKind.WALL);
      expect(getEdge(floor, floor.width - 1, y, Direction.EAST)).toBe(EdgeKind.WALL);
    }
  });

  // @spec EXPLORE-FLOOR-004
  it('gives every edge exactly one kind drawn from the defined set', () => {
    const floor = blankFloor();
    const kinds = Object.values(EdgeKind);

    for (let y = 0; y < floor.height; y++) {
      for (let x = 0; x < floor.width; x++) {
        for (const dir of Object.values(Direction)) {
          expect(kinds).toContain(getEdge(floor, x, y, dir));
        }
      }
    }
  });

  // @spec EXPLORE-FLOOR-005
  it('tracks an open state for door edges, closed by default', () => {
    const floor = blankFloor();
    setEdge(floor, 1, 1, Direction.EAST, EdgeKind.DOOR);

    expect(isEdgeOpen(floor, 1, 1, Direction.EAST)).toBe(false);
  });

  // @spec EXPLORE-FLOOR-005
  it('lets generation create a door that starts open', () => {
    const floor = blankFloor();
    setEdge(floor, 1, 1, Direction.EAST, EdgeKind.DOOR, { open: true });

    expect(isEdgeOpen(floor, 1, 1, Direction.EAST)).toBe(true);
    // Open state is a property of the shared edge, not of one side of it.
    expect(isEdgeOpen(floor, 2, 1, Direction.WEST)).toBe(true);
  });

  // @spec EXPLORE-FLOOR-005
  it('tracks an open state for locked doors too', () => {
    const floor = blankFloor();
    setEdge(floor, 1, 1, Direction.EAST, EdgeKind.LOCKED_DOOR);

    expect(isEdgeOpen(floor, 1, 1, Direction.EAST)).toBe(false);
  });

  // @spec EXPLORE-FLOOR-006
  it('gives every tile exactly one feature, defaulting to none', () => {
    const floor = blankFloor();
    const features = Object.values(TileFeature);

    for (let y = 0; y < floor.height; y++) {
      for (let x = 0; x < floor.width; x++) {
        expect(getTile(floor, x, y).feature).toBe(TileFeature.NONE);
        expect(features).toContain(getTile(floor, x, y).feature);
      }
    }

    setTileFeature(floor, 1, 1, TileFeature.STAIRS_DOWN);
    expect(getTile(floor, 1, 1).feature).toBe(TileFeature.STAIRS_DOWN);
  });

  // @spec EXPLORE-FLOOR-007
  it('gives every tile an intrinsic light level', () => {
    const floor = blankFloor();
    const levels = Object.values(LightLevel);

    for (let y = 0; y < floor.height; y++) {
      for (let x = 0; x < floor.width; x++) {
        expect(levels).toContain(getTile(floor, x, y).intrinsicLight);
      }
    }

    setTileLight(floor, 0, 0, LightLevel.BRIGHT);
    expect(getTile(floor, 0, 0).intrinsicLight).toBe(LightLevel.BRIGHT);
  });

  // @spec EXPLORE-FLOOR-008
  it('identifies a floor by a stable id and names connector destinations by that id', () => {
    const floor = createFloor({ id: 'crypt-2', width: 3, height: 3 });
    setTileFeature(floor, 1, 1, TileFeature.STAIRS_DOWN, {
      target: { floorId: 'crypt-5', x: 0, y: 2 },
    });

    expect(floor.id).toBe('crypt-2');
    expect(getTile(floor, 1, 1).target).toEqual({ floorId: 'crypt-5', x: 0, y: 2 });
  });

  // @spec EXPLORE-FLOOR-009
  it('carries a stored depth label rather than one computed from the id', () => {
    // Floor 1 leading to both floor 2 and floor 5 is why depth cannot be arithmetic.
    const floor = createFloor({ id: 'crypt-5', width: 3, height: 3, depthLabel: 'B2' });

    expect(floor.depthLabel).toBe('B2');
  });

  // @spec EXPLORE-FLOOR-011
  it('permits a connector with no return connector at its destination', () => {
    const upper = createFloor({ id: 'upper', width: 3, height: 3 });
    const lower = createFloor({ id: 'lower', width: 3, height: 3 });

    setTileFeature(upper, 1, 1, TileFeature.PIT, {
      target: { floorId: 'lower', x: 1, y: 1 },
    });

    // The landing tile offers no way back up.
    expect(getTile(lower, 1, 1).feature).toBe(TileFeature.NONE);
    expect(getTile(lower, 1, 1).target).toBeUndefined();
  });
});
