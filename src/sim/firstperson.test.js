import { describe, it, expect } from 'vitest';
import {
  createFloor,
  openEdge,
  setEdge,
  setTileFeature,
  setTileLight,
  EdgeKind,
  TileFeature,
  LightLevel,
  Direction,
} from './floor.js';
import { createLightSource } from './light.js';
import { createExploration, corridorAhead, discoverEdge, MAX_DRAWN_DEPTH } from './exploration.js';

const lamp = (over = {}) =>
  createLightSource({ id: 'l', brightRadius: 2, dimRadius: 6, remainingTicks: 99, lit: true, ...over });

// A north-south corridor one tile wide at x=3, party at the south end facing north.
function corridorScene({ facing = Direction.NORTH, sources = [lamp()] } = {}) {
  const floor = createFloor({ id: 'f1', width: 7, height: 9 });
  for (let y = 0; y <= 8; y++) {
    setEdge(floor, 3, y, Direction.WEST, EdgeKind.WALL);
    setEdge(floor, 3, y, Direction.EAST, EdgeKind.WALL);
  }
  const state = createExploration({
    floors: [floor],
    floorId: 'f1',
    tile: { x: 3, y: 6 },
    facing,
    lightSources: sources,
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
        facing: Direction.NORTH, lightSources: [lamp()],
      }),
    );
    const southward = corridorAhead(
      createExploration({
        floors: [floor], floorId: 'f1', tile: { x: 3, y: 2 },
        facing: Direction.SOUTH, lightSources: [lamp()],
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

  // @spec EXPLORE-VIEW-003
  it('reports the light level at each depth, dimming with distance', () => {
    const { state } = corridorScene(); // bright 2, dim 6

    const slices = corridorAhead(state);

    expect(slices.find((s) => s.depth === 0).level).toBe(LightLevel.BRIGHT);
    expect(slices.find((s) => s.depth === 2).level).toBe(LightLevel.BRIGHT);
    expect(slices.find((s) => s.depth === 3).level).toBe(LightLevel.DIM);
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

  // @spec EXPLORE-VIEW-006
  it('reports the dark boundary itself, so the view has something to fade into', () => {
    // No carried light; the party's own tile is lit by the dungeon, nothing beyond is.
    const { floor, state } = corridorScene({ sources: [] });
    setTileLight(floor, 3, 6, LightLevel.DIM);

    const slices = corridorAhead(state);

    expect(slices.at(-1).level).toBe(LightLevel.DARK);
    expect(slices.filter((s) => s.level === LightLevel.DARK)).toHaveLength(1);
  });

  // @spec EXPLORE-VIEW-007
  it('reports no more than the maximum drawn depth, however far light reaches', () => {
    // A lamp that reaches the whole floor.
    const { state } = corridorScene({
      sources: [lamp({ brightRadius: 20, dimRadius: 40 })],
    });

    const slices = corridorAhead(state);

    expect(slices.length).toBeLessThanOrEqual(MAX_DRAWN_DEPTH + 1);
    expect(MAX_DRAWN_DEPTH).toBeLessThan(20);
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
