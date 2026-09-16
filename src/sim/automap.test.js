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
import { createLightSource } from './light.js';
import {
  createExploration,
  computeSight,
  automapView,
  recordTrapDetected,
  discoverEdge,
  partyPosition,
} from './exploration.js';

const lantern = (over = {}) =>
  createLightSource({ id: 'l', brightRadius: 1, dimRadius: 4, remainingTicks: 99, lit: true, ...over });

function scene({ sources = [lantern()], roamers = [], facing = Direction.NORTH } = {}) {
  const floor = createFloor({ id: 'f1', width: 7, height: 7 });
  const state = createExploration({
    floors: [floor],
    floorId: 'f1',
    tile: { x: 3, y: 3 },
    facing,
    lightSources: sources,
    roamers,
  });
  return { floor, state };
}

const tileAt = (view, x, y) => view.tiles.find((t) => t.x === x && t.y === y);

describe('what the automap draws', () => {
  // @spec EXPLORE-MAP-001
  it('draws only tiles sight has discovered', () => {
    const { state } = scene();
    computeSight(state);

    const view = automapView(state);

    expect(tileAt(view, 3, 3)).toBeDefined(); // stood on
    expect(tileAt(view, 3, 1)).toBeDefined(); // seen ahead
    expect(tileAt(view, 1, 6)).toBeUndefined(); // never seen
  });

  // @spec EXPLORE-MAP-001
  it('draws nothing at all before the party has seen anything', () => {
    const { state } = scene();

    expect(automapView(state).tiles).toEqual([]);
  });

  // @spec EXPLORE-MAP-001
  it('draws the edges of each discovered tile', () => {
    const { floor, state } = scene();
    setEdge(floor, 3, 3, Direction.NORTH, EdgeKind.DOOR);
    computeSight(state);

    const view = automapView(state);

    expect(tileAt(view, 3, 3).edges[Direction.NORTH].kind).toBe(EdgeKind.DOOR);
  });

  // @spec EXPLORE-MAP-001
  it('draws a discovered feature', () => {
    const { floor, state } = scene();
    setTileFeature(floor, 3, 1, TileFeature.STAIRS_DOWN, {
      target: { floorId: 'other', x: 0, y: 0 },
    });
    computeSight(state);

    expect(tileAt(automapView(state), 3, 1).feature).toBe(TileFeature.STAIRS_DOWN);
  });

  // @spec EXPLORE-MAP-002
  it('draws a trap the party has found', () => {
    const { state } = scene();
    computeSight(state);
    recordTrapDetected(state, 'f1', 3, 2);

    const view = automapView(state);

    expect(tileAt(view, 3, 2).trapKnown).toBe(true);
    expect(tileAt(view, 3, 3).trapKnown).toBe(false);
  });

  // @spec EXPLORE-MAP-003
  it('shows an undiscovered secret door as plain wall, giving nothing away', () => {
    const { floor, state } = scene();
    setEdge(floor, 3, 3, Direction.EAST, EdgeKind.SECRET_DOOR);
    computeSight(state);

    expect(tileAt(automapView(state), 3, 3).edges[Direction.EAST].kind).toBe(EdgeKind.WALL);
  });

  // @spec EXPLORE-MAP-003
  it('shows a secret door once the search mechanics have found it', () => {
    const { floor, state } = scene();
    setEdge(floor, 3, 3, Direction.EAST, EdgeKind.SECRET_DOOR);
    discoverEdge(state, 'f1', 3, 3, Direction.EAST);
    computeSight(state);

    expect(tileAt(automapView(state), 3, 3).edges[Direction.EAST].kind).toBe(EdgeKind.SECRET_DOOR);
  });

  // @spec EXPLORE-MAP-011
  it('says whether a door it draws stands open', () => {
    const { floor, state } = scene();
    setEdge(floor, 3, 3, Direction.NORTH, EdgeKind.DOOR);
    setEdge(floor, 3, 3, Direction.EAST, EdgeKind.DOOR);
    openEdge(floor, 3, 3, Direction.EAST);
    computeSight(state);

    const tile = tileAt(automapView(state), 3, 3);
    expect(tile.edges[Direction.NORTH]).toEqual({ kind: EdgeKind.DOOR, open: false });
    expect(tile.edges[Direction.EAST]).toEqual({ kind: EdgeKind.DOOR, open: true });
  });

  // @spec EXPLORE-MAP-008
  it('needs no item, spell, or class to be available', () => {
    const { state } = scene({ sources: [] });
    computeSight(state);

    // A party carrying nothing at all still gets a map of what it has seen.
    expect(automapView(state)).toMatchObject({ floorId: 'f1', width: 7, height: 7 });
  });
});

describe('the party marker', () => {
  // @spec EXPLORE-MAP-007
  it('draws the party tile and facing while the party can see', () => {
    const { state } = scene({ facing: Direction.EAST });
    computeSight(state);

    expect(automapView(state).party).toEqual({ x: 3, y: 3, facing: Direction.EAST });
  });

  // @spec EXPLORE-MAP-006
  it('drops the party marker in the dark, while keeping the map readable', () => {
    const { state } = scene();
    computeSight(state); // map some ground while lit

    const litView = automapView(state);
    expect(litView.party).not.toBeNull();

    state.lightSources[0].lit = false;
    const darkView = automapView(state);

    // The record of where the party has been survives; knowing where it stands does not.
    expect(darkView.party).toBeNull();
    expect(darkView.tiles.length).toBe(litView.tiles.length);
  });

  // @spec EXPLORE-MAP-009
  it('always agrees with the party position the rest of the simulation reports', () => {
    const { state } = scene({ facing: Direction.SOUTH });
    computeSight(state);

    const view = automapView(state);
    const position = partyPosition(state);

    expect(view.party).toEqual({ ...position.tile, facing: position.facing });
  });
});

describe('roaming enemies on the map', () => {
  // @spec EXPLORE-MAP-004
  it('draws an enemy standing in bright light', () => {
    // (3,2) is adjacent to the party, inside the lantern bright ring.
    const { state } = scene({ roamers: [{ id: 'r1', floorId: 'f1', x: 3, y: 2 }] });
    computeSight(state);

    expect(automapView(state).enemies).toEqual([{ id: 'r1', x: 3, y: 2 }]);
  });

  // @spec EXPLORE-MAP-005
  it('draws no enemy standing in dim light', () => {
    // (3,0) is three away: inside the dim radius, outside the bright one.
    const { state } = scene({ roamers: [{ id: 'r1', floorId: 'f1', x: 3, y: 0 }] });
    computeSight(state);

    expect(automapView(state).enemies).toEqual([]);
  });

  // @spec EXPLORE-MAP-005
  it('draws no enemy the party can no longer see, not even where it last stood', () => {
    const { state } = scene({ roamers: [{ id: 'r1', floorId: 'f1', x: 3, y: 2 }] });
    computeSight(state);
    expect(automapView(state).enemies).toHaveLength(1);

    state.lightSources[0].lit = false;

    expect(automapView(state).enemies).toEqual([]);
  });

  // @spec EXPLORE-MAP-012
  it('draws no enemy standing behind a wall, however bright its tile', () => {
    // (3,2) is adjacent and lit, but the party is looking at the wall between them.
    const { floor, state } = scene({ roamers: [{ id: 'r1', floorId: 'f1', x: 3, y: 2 }] });
    setEdge(floor, 3, 3, Direction.NORTH, EdgeKind.WALL);
    computeSight(state);

    expect(automapView(state).enemies).toEqual([]);
  });

  // @spec EXPLORE-MAP-012
  it('draws no enemy standing behind a closed door, and draws it once the door opens', () => {
    const { floor, state } = scene({ roamers: [{ id: 'r1', floorId: 'f1', x: 3, y: 2 }] });
    setEdge(floor, 3, 3, Direction.NORTH, EdgeKind.DOOR);
    computeSight(state);
    expect(automapView(state).enemies).toEqual([]);

    openEdge(floor, 3, 3, Direction.NORTH);

    expect(automapView(state).enemies).toEqual([{ id: 'r1', x: 3, y: 2 }]);
  });

  // @spec EXPLORE-MAP-013
  it('draws an enemy standing behind the party, which sight never had to reach', () => {
    // (3,4) is at the party's back: outside the sight cone, inside the lantern.
    const { state } = scene({ roamers: [{ id: 'r1', floorId: 'f1', x: 3, y: 4 }] });
    computeSight(state);

    expect(automapView(state).enemies).toEqual([{ id: 'r1', x: 3, y: 4 }]);
  });

  // @spec EXPLORE-MAP-004
  it('ignores enemies on other floors', () => {
    const { state } = scene({ roamers: [{ id: 'r1', floorId: 'elsewhere', x: 3, y: 2 }] });
    computeSight(state);

    expect(automapView(state).enemies).toEqual([]);
  });
});
