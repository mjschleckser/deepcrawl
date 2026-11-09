import { describe, it, expect, vi } from 'vitest';
import {
  createFloor, getTile, setTileFeature, Direction, TileFeature,
} from './floor.js';
import { generateFloor, DEFAULT_ARCHETYPE } from './generation.js';
import {
  createExploration, perform, tickCount, partyPosition, corridorAhead, automapView,
  computeSight, serialize, deserialize, PartyAction, Verb, StepEvent,
} from './exploration.js';

const seeds = (n) => Array.from({ length: n }, (_, i) => 3000 + i * 7919);
const keyOf = (t) => `${t.x},${t.y}`;
const chestsOn = (floor) => floor.tiles.filter((t) => t.feature === TileFeature.CHEST);
const tileAt = (floor, i) => ({ x: i % floor.width, y: Math.floor(i / floor.width) });
const chestSpots = (floor) => floor.tiles
  .map((t, i) => ({ ...tileAt(floor, i), tile: t }))
  .filter(({ tile }) => tile.feature === TileFeature.CHEST);
const inRoom = (rooms, { x, y }) => rooms.some((r) => x >= r.x && x < r.x + r.width && y >= r.y && y < r.y + r.height);

describe('laying chests', () => {
  // @spec GEN-PLACE-013
  it('reads a chest range and a chest table from every archetype', () => {
    expect(DEFAULT_ARCHETYPE.chests.min).toBeGreaterThanOrEqual(0);
    expect(DEFAULT_ARCHETYPE.chests.max).toBeGreaterThanOrEqual(DEFAULT_ARCHETYPE.chests.min);
    expect(typeof DEFAULT_ARCHETYPE.chestTable).toBe('string');
  });

  // @spec GEN-PLACE-007
  // @spec GEN-PLACE-011
  // @spec GEN-PLACE-013
  it('lays chests within the range, on room tiles, numbered in the order they were laid', () => {
    for (const seed of seeds(12)) {
      const floor = generateFloor({ id: 'f', seed });
      const spots = chestSpots(floor);
      const { min, max } = DEFAULT_ARCHETYPE.chests;

      expect(spots.length).toBeGreaterThanOrEqual(Math.min(min, 1));
      expect(spots.length).toBeLessThanOrEqual(max);
      expect(spots.map((s) => s.tile.chest).sort((a, b) => a - b))
        .toEqual(spots.map((_, i) => i));
      for (const spot of spots) {
        expect(inRoom(floor.rooms, spot)).toBe(true);
        expect(spot.tile.table).toBe(DEFAULT_ARCHETYPE.chestTable);
      }
    }
  });

  // @spec GEN-PLACE-010
  it('changes nothing else on the floor however many chests it lays', () => {
    for (const seed of seeds(6)) {
      const none = generateFloor({ id: 'f', seed, archetype: { ...DEFAULT_ARCHETYPE, chests: { min: 0, max: 0 } } });
      const many = generateFloor({ id: 'f', seed, archetype: { ...DEFAULT_ARCHETYPE, chests: { min: 4, max: 4 } } });

      expect(chestsOn(none)).toHaveLength(0);
      expect(many.horizontalEdges).toEqual(none.horizontalEdges);
      expect(many.verticalEdges).toEqual(none.verticalEdges);
      const others = (floor) => floor.tiles.map((t) => (t.feature === TileFeature.CHEST ? TileFeature.NONE : t.feature));
      expect(others(many)).toEqual(others(none));
    }
  });

  // @spec GEN-PLACE-007
  it('lays as many as fit when there are fewer free room tiles than chests drawn', () => {
    const floor = generateFloor({
      id: 'f', seed: 11, archetype: { ...DEFAULT_ARCHETYPE, chests: { min: 5000, max: 5000 } },
    });
    const roomTiles = floor.tiles.filter((_, i) => inRoom(floor.rooms, tileAt(floor, i))).length;

    expect(chestsOn(floor).length).toBeGreaterThan(0);
    expect(chestsOn(floor).length).toBeLessThan(roomTiles);
  });
});

/** A corridor running north with a chest two tiles ahead of the party. */
function corridor({ hooks = {} } = {}) {
  const floor = createFloor({ id: 'f1', width: 3, height: 7 });
  floor.seed = 99;
  const chest = setTileFeature(floor, 1, 3, TileFeature.CHEST);
  chest.chest = 0;
  chest.table = 'chest';
  const state = createExploration({
    floors: [floor], floorId: 'f1', tile: { x: 1, y: 5 }, facing: Direction.NORTH, hooks,
  });
  computeSight(state);
  return { state, floor };
}

/** Walk the two tiles from the corridor's foot onto the chest. */
const walkOnto = (state) => {
  perform(state, { verb: Verb.STEP_FORWARD });
  return perform(state, { verb: Verb.STEP_FORWARD });
};

/** Step off the chest and back onto it. */
const stepOffAndOn = (state) => {
  perform(state, { verb: Verb.STEP_BACKWARD });
  return perform(state, { verb: Verb.STEP_FORWARD });
};

describe('a chest underfoot', () => {
  // @spec EXPLORE-FLOOR-006
  it('is one of the features a tile can carry', () => {
    expect(Object.keys(TileFeature).sort()).toEqual(['CHEST', 'NONE', 'PIT', 'STAIRS_DOWN', 'STAIRS_UP']);
  });

  // @spec EXPLORE-FLOOR-013
  // @spec EXPLORE-MOVE-024
  // @spec LOOT-CHEST-001
  it('is opened by stepping onto it, for a tick beyond the step, handing the find over', () => {
    const find = { gold: 9, items: [] };
    const onOpenChest = vi.fn(() => find);
    const { state, floor } = corridor({ hooks: { onOpenChest } });
    perform(state, { verb: Verb.STEP_FORWARD });
    const ticks = tickCount(state);

    const result = perform(state, { verb: Verb.STEP_FORWARD });

    expect(partyPosition(state).tile).toEqual({ x: 1, y: 3 });
    expect(result.events).toContain(StepEvent.CHEST_OPENED);
    expect(result.found).toBe(find);
    // The step's own tick, and the one opening took.
    expect(tickCount(state)).toBe(ticks + 2);
    expect(onOpenChest).toHaveBeenCalledWith({ floor, number: 0, table: 'chest' });
    expect(state.pendingConfirmation).toBeNull();
  });

  // @spec EXPLORE-MOVE-026
  // @spec LOOT-CHEST-003
  it('is floor once opened, and is never opened twice', () => {
    const onOpenChest = vi.fn(() => ({ gold: 1, items: [] }));
    const { state } = corridor({ hooks: { onOpenChest } });
    walkOnto(state);
    const ticks = tickCount(state);

    const again = stepOffAndOn(state);

    expect(again.found).toBeUndefined();
    expect(again.events).not.toContain(StepEvent.CHEST_OPENED);
    expect(onOpenChest).toHaveBeenCalledTimes(1);
    // Two steps, and nothing more.
    expect(tickCount(state)).toBe(ticks + 2);
  });

  // @spec EXPLORE-SAVE-008
  it('stays opened across a save and reload, and an old save opens none', () => {
    const onOpenChest = vi.fn(() => ({ gold: 1, items: [] }));
    const { state } = corridor({ hooks: { onOpenChest } });
    walkOnto(state);

    const saved = JSON.parse(JSON.stringify(serialize(state)));
    expect(stepOffAndOn(deserialize(saved, { hooks: { onOpenChest } })).found).toBeUndefined();

    delete saved.openedChests;
    expect(stepOffAndOn(deserialize(saved, { hooks: { onOpenChest } })).found).toBeDefined();
  });
});

describe('a chest in view', () => {
  // @spec EXPLORE-VIEW-013
  it('is reported down the corridor, opened or not', () => {
    const { state } = corridor({ hooks: { onOpenChest: () => ({ gold: 1, items: [] }) } });
    const slice = () => corridorAhead(state).find((s) => s.feature === TileFeature.CHEST);

    expect(slice()).toMatchObject({ depth: 2, chestOpened: false });

    walkOnto(state);
    perform(state, { verb: Verb.STEP_BACKWARD });
    perform(state, { verb: Verb.STEP_BACKWARD });
    expect(slice().chestOpened).toBe(true);
  });

  // @spec EXPLORE-MAP-014
  it('is reported on the automap once discovered, opened or not', () => {
    const { state } = corridor({ hooks: { onOpenChest: () => ({ gold: 1, items: [] }) } });
    const cell = () => automapView(state).tiles.find((t) => t.feature === TileFeature.CHEST);

    expect(cell()).toMatchObject({ chestOpened: false });

    walkOnto(state);
    expect(cell().chestOpened).toBe(true);
    expect(getTile(state.getFloor('f1'), 1, 3).feature).toBe(TileFeature.CHEST);
  });
});
