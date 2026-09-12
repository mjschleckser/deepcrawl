import { describe, it, expect } from 'vitest';
import {
  createFloor,
  setEdge,
  setTileFeature,
  setTileLight,
  getEdge,
  getTile,
  isEdgeOpen,
  EdgeKind,
  TileFeature,
  LightLevel,
  Direction,
} from './floor.js';
import { createLightSource } from './light.js';
import {
  createExploration,
  computeSight,
  perform,
  recordTrapDetected,
  isTileDiscovered,
  isTrapKnown,
  tickCount,
  partyPosition,
  lightSources,
  litSource,
  serialize,
  deserialize,
  Verb,
} from './exploration.js';

const torch = (over = {}) =>
  createLightSource({ id: 'a', brightRadius: 1, dimRadius: 4, remainingTicks: 7, lit: true, ...over });

// Two floors, the party on the upper one, having seen a little of it.
function campaign() {
  const upper = createFloor({ id: 'upper', width: 7, height: 5, depthLabel: 'B1' });
  const lower = createFloor({ id: 'lower', width: 4, height: 9, depthLabel: 'B2' });
  setEdge(upper, 3, 2, Direction.EAST, EdgeKind.DOOR, { open: true });
  setEdge(upper, 2, 2, Direction.WEST, EdgeKind.LOCKED_DOOR, { keyId: 'brass' });
  setTileFeature(upper, 3, 1, TileFeature.STAIRS_DOWN, {
    target: { floorId: 'lower', x: 1, y: 1 },
  });
  setTileLight(upper, 0, 0, LightLevel.BRIGHT);

  const state = createExploration({
    floors: [upper, lower],
    floorId: 'upper',
    tile: { x: 3, y: 3 },
    facing: Direction.NORTH,
    lightSources: [torch(), torch({ id: 'b', lit: false, remainingTicks: 12 })],
  });
  computeSight(state);
  recordTrapDetected(state, 'upper', 3, 2);
  return state;
}

const roundTrip = (state) => deserialize(JSON.parse(JSON.stringify(serialize(state))));

describe('saving exploration state', () => {
  // @spec EXPLORE-SAVE-001
  it('saves every generated floor, including the one the party is not on', () => {
    const saved = serialize(campaign());

    expect(saved.floors.map((f) => f.id).sort()).toEqual(['lower', 'upper']);
  });

  // @spec EXPLORE-SAVE-003
  it('saves each floor dimensions, depth label, edges, features, and intrinsic light', () => {
    const restored = roundTrip(campaign());
    const upper = restored.floors.get('upper');

    expect(upper.width).toBe(7);
    expect(upper.height).toBe(5);
    expect(upper.depthLabel).toBe('B1');
    expect(getEdge(upper, 3, 2, Direction.EAST)).toBe(EdgeKind.DOOR);
    expect(getTile(upper, 3, 1).feature).toBe(TileFeature.STAIRS_DOWN);
    expect(getTile(upper, 3, 1).target).toEqual({ floorId: 'lower', x: 1, y: 1 });
    expect(getTile(upper, 0, 0).intrinsicLight).toBe(LightLevel.BRIGHT);
  });

  // @spec EXPLORE-SAVE-003
  it('saves door open states, so a door the party opened stays open', () => {
    const restored = roundTrip(campaign());
    const upper = restored.floors.get('upper');

    expect(isEdgeOpen(upper, 3, 2, Direction.EAST)).toBe(true);
    expect(isEdgeOpen(upper, 2, 2, Direction.WEST)).toBe(false);
  });

  // @spec EXPLORE-SAVE-003
  it('saves the discovery record and the traps the party knows about', () => {
    const original = campaign();
    const restored = roundTrip(original);

    expect(isTileDiscovered(restored, 'upper', 3, 3)).toBe(true);
    expect(isTileDiscovered(restored, 'upper', 3, 1)).toBe(true);
    expect(isTileDiscovered(restored, 'upper', 6, 4)).toBe(false);
    expect(isTrapKnown(restored, 'upper', 3, 2)).toBe(true);
  });

  // @spec EXPLORE-SAVE-003
  it('saves the tick at which the party last left each floor', () => {
    const state = campaign();
    perform(state, { verb: Verb.STEP_FORWARD }); // stairs prompt, no move
    const saved = serialize(state);

    expect(saved).toHaveProperty('departedAt');
  });

  // @spec EXPLORE-SAVE-004
  it('saves the party floor, tile, facing, and the tick counter', () => {
    const original = campaign();
    const restored = roundTrip(original);

    expect(partyPosition(restored)).toEqual(partyPosition(original));
    expect(tickCount(restored)).toBe(tickCount(original));
  });

  // @spec EXPLORE-SAVE-005
  it('saves each light source separately, with its own fuel and lit state', () => {
    const restored = roundTrip(campaign());
    const [a, b] = lightSources(restored);

    expect(a).toMatchObject({ id: 'a', remainingTicks: 7, lit: true });
    expect(b).toMatchObject({ id: 'b', remainingTicks: 12, lit: false });
    expect(litSource(restored).id).toBe('a');
  });

  // @spec EXPLORE-SAVE-006
  it('stores discovery as one bit per tile', () => {
    const saved = serialize(campaign());

    // 7 x 5 = 35 tiles, so 5 bytes, base64 encoded.
    const encoded = saved.discovery.upper;
    expect(Buffer.from(encoded, 'base64')).toHaveLength(Math.ceil((7 * 5) / 8));
  });
});

describe('reloading a campaign', () => {
  // @spec EXPLORE-SAVE-002
  it('restores a floor rather than regenerating it, layout identical', () => {
    const original = campaign();
    const restored = roundTrip(original);

    const before = original.floors.get('upper');
    const after = restored.floors.get('upper');

    expect(after.horizontalEdges).toEqual(before.horizontalEdges);
    expect(after.verticalEdges).toEqual(before.verticalEdges);
    expect(after.tiles).toEqual(before.tiles);
  });

  // @spec EXPLORE-SAVE-002
  it('carries on playing from a restored save', () => {
    const restored = roundTrip(campaign());

    const before = tickCount(restored);
    perform(restored, { verb: Verb.TURN_AROUND });
    perform(restored, { verb: Verb.STEP_FORWARD });

    expect(tickCount(restored)).toBe(before + 1);
    expect(partyPosition(restored).tile).toEqual({ x: 3, y: 4 });
  });

  // @spec EXPLORE-SAVE-002
  it('keeps a locked door locked, with its key still required', () => {
    const restored = roundTrip(campaign());
    const upper = restored.floors.get('upper');

    expect(getEdge(upper, 2, 2, Direction.WEST)).toBe(EdgeKind.LOCKED_DOOR);
    expect(isEdgeOpen(upper, 2, 2, Direction.WEST)).toBe(false);
  });
});
