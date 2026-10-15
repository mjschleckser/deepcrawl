import { describe, it, expect } from 'vitest';
import {
  createFloor,
  openEdge,
  setEdge,
  setTileFeature,
  EdgeKind,
  TileFeature,
  Direction,
} from './floor.js';
import {
  createExploration, corridorAhead, discoverEdge, MAX_DRAWN_DEPTH, SIGHT_RANGE,
} from './exploration.js';

// A north-south corridor one tile wide at x=3, party at the south end facing north.
function corridorScene({ facing = Direction.NORTH, roamers = [], length = 9 } = {}) {
  const floor = createFloor({ id: 'f1', width: 7, height: length });
  for (let y = 0; y < length; y++) {
    setEdge(floor, 3, y, Direction.WEST, EdgeKind.WALL);
    setEdge(floor, 3, y, Direction.EAST, EdgeKind.WALL);
  }
  const state = createExploration({
    floors: [floor],
    floorId: 'f1',
    tile: { x: 3, y: length - 3 },
    facing,
    roamers,
  });
  return { floor, state };
}

describe('the corridor ahead', () => {
  // @spec EXPLORE-VIEW-001
  it('reports each depth as walled to the left and right of the party', () => {
    const { state } = corridorScene();

    const slices = corridorAhead(state);

    expect(slices[0]).toMatchObject({ depth: 0, walledLeft: true, walledRight: true });
    expect(slices[1]).toMatchObject({ depth: 1, walledLeft: true, walledRight: true });
  });

  // @spec EXPLORE-VIEW-001
  it('reports a side opening where the corridor is not walled', () => {
    const { floor, state } = corridorScene();
    // Knock a gap in the west wall two tiles ahead.
    setEdge(floor, 3, 4, Direction.WEST, EdgeKind.OPEN);

    const slices = corridorAhead(state);

    expect(slices.find((s) => s.depth === 2)).toMatchObject({
      walledLeft: false,
      walledRight: true,
    });
  });

  // @spec EXPLORE-VIEW-008
  it('reports left and right relative to facing, not to the map', () => {
    const { floor } = corridorScene();
    setEdge(floor, 3, 4, Direction.WEST, EdgeKind.OPEN);

    const northward = corridorAhead(
      createExploration({
        floors: [floor], floorId: 'f1', tile: { x: 3, y: 6 },
        facing: Direction.NORTH,
      }),
    );
    const southward = corridorAhead(
      createExploration({
        floors: [floor], floorId: 'f1', tile: { x: 3, y: 2 },
        facing: Direction.SOUTH,
      }),
    );

    // The same gap is on the party's left going north and on its right going south.
    expect(northward.find((s) => s.depth === 2).walledLeft).toBe(false);
    expect(southward.find((s) => s.depth === 2).walledRight).toBe(false);
  });

  // @spec EXPLORE-VIEW-002
  it('reports the feature standing at each depth', () => {
    const { floor, state } = corridorScene();
    setTileFeature(floor, 3, 4, TileFeature.STAIRS_DOWN, {
      target: { floorId: 'other', x: 0, y: 0 },
    });

    const slices = corridorAhead(state);

    expect(slices.find((s) => s.depth === 2).feature).toBe(TileFeature.STAIRS_DOWN);
    expect(slices.find((s) => s.depth === 1).feature).toBe(TileFeature.NONE);
  });
});

describe('where the corridor report stops', () => {
  // @spec EXPLORE-VIEW-005
  it('closes the corridor at a wall and reports nothing beyond it', () => {
    const { floor, state } = corridorScene();
    setEdge(floor, 3, 4, Direction.NORTH, EdgeKind.WALL);

    const slices = corridorAhead(state);

    expect(slices.at(-1)).toMatchObject({ depth: 2, closedAhead: true });
    expect(slices.some((s) => s.depth > 2)).toBe(false);
  });

  // @spec EXPLORE-VIEW-004
  it('closes at a closed door and opens at one generation left open', () => {
    const { floor, state } = corridorScene();
    setEdge(floor, 3, 4, Direction.NORTH, EdgeKind.DOOR);
    expect(corridorAhead(state).at(-1).closedAhead).toBe(true);

    setEdge(floor, 3, 4, Direction.NORTH, EdgeKind.DOOR, { open: true });
    expect(corridorAhead(state).some((s) => s.depth > 2)).toBe(true);
  });

  // @spec EXPLORE-VIEW-004
  it('closes at an undiscovered secret door, exactly as at a wall', () => {
    const { floor, state } = corridorScene();
    setEdge(floor, 3, 4, Direction.NORTH, EdgeKind.SECRET_DOOR);

    expect(corridorAhead(state).at(-1)).toMatchObject({ depth: 2, closedAhead: true });
  });

  // @spec EXPLORE-VIEW-007
  it('reports past the sight distance, out to the maximum drawn depth of six and no further', () => {
    // A corridor running well past both.
    const { state } = corridorScene({ length: 20 });

    const slices = corridorAhead(state);

    expect(MAX_DRAWN_DEPTH).toBe(6);
    expect(MAX_DRAWN_DEPTH).toBeGreaterThan(SIGHT_RANGE);
    expect(slices.map((s) => s.depth)).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });

  // @spec EXPLORE-VIEW-011
  it('reports a warband standing on a tile ahead', () => {
    // (3,5) is one ahead of the party.
    const { state } = corridorScene({ roamers: [{ id: 'r1', floorId: 'f1', x: 3, y: 5 }] });

    const slices = corridorAhead(state);

    expect(slices[1]).toMatchObject({ depth: 1, enemyHere: true });
    expect(slices.filter((s) => s.enemyHere)).toHaveLength(1);
  });

  // @spec EXPLORE-VIEW-012
  it('reports a warband by the automap rule: within four tiles, and not beyond', () => {
    // Party at (3,17) facing north: (3,13) is four ahead, (3,12) five.
    const near = corridorScene({ length: 20, roamers: [{ id: 'r1', floorId: 'f1', x: 3, y: 13 }] });
    const far = corridorScene({ length: 20, roamers: [{ id: 'r1', floorId: 'f1', x: 3, y: 12 }] });

    expect(corridorAhead(near.state).find((s) => s.depth === 4).enemyHere).toBe(true);
    // Depth five is still drawn, but nothing standing on it is picked out.
    expect(corridorAhead(far.state).find((s) => s.depth === 5).enemyHere).toBe(false);
  });

  // @spec EXPLORE-VIEW-011
  it('reports no warband from another floor standing on the same coordinates', () => {
    const { state } = corridorScene({ roamers: [{ id: 'r1', floorId: 'elsewhere', x: 3, y: 5 }] });

    expect(corridorAhead(state).every((s) => s.enemyHere === false)).toBe(true);
  });

  // @spec EXPLORE-VIEW-009
  it('reports a closed door on the edge ahead as the door it is', () => {
    const { floor, state } = corridorScene();
    setEdge(floor, 3, 5, Direction.NORTH, EdgeKind.DOOR);

    const slices = corridorAhead(state);

    expect(slices.at(-1)).toMatchObject({
      depth: 1,
      closedAhead: true,
      portalAhead: { kind: EdgeKind.DOOR, open: false },
    });
  });

  // @spec EXPLORE-VIEW-009
  it('reports an open door as a door, and the corridor as going on through it', () => {
    const { floor, state } = corridorScene();
    setEdge(floor, 3, 5, Direction.NORTH, EdgeKind.DOOR);
    openEdge(floor, 3, 5, Direction.NORTH);

    const slices = corridorAhead(state);

    expect(slices[1]).toMatchObject({
      depth: 1,
      closedAhead: false,
      portalAhead: { kind: EdgeKind.DOOR, open: true },
    });
    expect(slices.length).toBeGreaterThan(2);
  });

  // @spec EXPLORE-VIEW-010
  it('reports a plain wall as no door', () => {
    const { floor, state } = corridorScene();
    setEdge(floor, 3, 5, Direction.NORTH, EdgeKind.WALL);

    expect(corridorAhead(state).at(-1)).toMatchObject({
      closedAhead: true,
      portalAhead: null,
    });
  });

  // @spec EXPLORE-VIEW-010
  it('reports an undiscovered secret door as no door, giving nothing away', () => {
    const { floor, state } = corridorScene();
    setEdge(floor, 3, 5, Direction.NORTH, EdgeKind.SECRET_DOOR);

    expect(corridorAhead(state).at(-1)).toMatchObject({
      closedAhead: true,
      portalAhead: null,
    });
  });

  // @spec EXPLORE-VIEW-009
  it('reports a secret door the party has found as the door it turned out to be', () => {
    const { floor, state } = corridorScene();
    setEdge(floor, 3, 5, Direction.NORTH, EdgeKind.SECRET_DOOR);
    discoverEdge(state, 'f1', 3, 5, Direction.NORTH);

    // Found, it stops being opaque, so the report carries on past it as a door.
    expect(corridorAhead(state)[1]).toMatchObject({
      portalAhead: { kind: EdgeKind.SECRET_DOOR, open: false },
    });
  });

  // @spec EXPLORE-VIEW-005
  it('closes at the edge of the floor', () => {
    const { state } = corridorScene({ facing: Direction.SOUTH });

    const slices = corridorAhead(state);

    // From (3,6) facing south on a 9-tall floor, the border wall closes it at depth 2.
    expect(slices.at(-1).closedAhead).toBe(true);
  });
});
