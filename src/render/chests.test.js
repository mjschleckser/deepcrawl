import { describe, it, expect, vi } from 'vitest';
import { TileFeature, Direction, createFloor, setTileFeature } from '../sim/floor.js';
import { createExploration, partyPosition, tickCount } from '../sim/exploration.js';
import {
  createParty, createCharacter, addCharacter, CharacterClass,
} from '../sim/party.js';
import { ItemKind, Rarity, createItem } from '../sim/items.js';
import { buildViewPlan } from './viewplan.js';
import { buildMapPlan, MapMark } from './mapplan.js';
import { RARITY_COLOURS } from './appconfig.js';
import { createController, layers, pressKey, pressPointer } from './controller.js';

const viewport = { width: 800, height: 600 };

const slice = (over = {}) => ({
  depth: 0, feature: TileFeature.NONE, walledLeft: true, walledRight: true,
  closedAhead: false, portalAhead: null, enemyHere: false, chestOpened: null, ...over,
});

describe('a chest down the corridor', () => {
  // @spec PRESENT-VIEW-016
  it('stands on the floor of its depth, scaled to that depth, and shows whether it is open', () => {
    const closed = buildViewPlan([slice(), slice({ depth: 1, feature: TileFeature.CHEST, chestOpened: false })], viewport);
    const open = buildViewPlan([slice(), slice({ depth: 1, feature: TileFeature.CHEST, chestOpened: true })], viewport);
    const nearer = buildViewPlan([slice({ feature: TileFeature.CHEST, chestOpened: false })], viewport);
    const chest = (plan) => plan.shapes.find((s) => s.kind === 'chest');

    expect(chest(closed)).toMatchObject({ depth: 1, opened: false });
    expect(chest(open)).toMatchObject({ depth: 1, opened: true });
    expect(chest(open).lid).not.toEqual(chest(closed).lid);
    expect(chest(nearer).body.width).toBeGreaterThan(chest(closed).body.width);
    // Standing on the floor, not painted onto it as a marking.
    expect(closed.shapes.some((s) => s.kind === 'feature' && s.feature === TileFeature.CHEST)).toBe(false);
  });
});

describe('a chest on the automap', () => {
  const edges = { NORTH: { kind: 'OPEN' }, EAST: { kind: 'OPEN' }, SOUTH: { kind: 'OPEN' }, WEST: { kind: 'OPEN' } };
  const view = {
    floorId: 'f1', width: 6, height: 2,
    tiles: [
      { x: 0, y: 0, feature: TileFeature.CHEST, chestOpened: false, edges },
      { x: 1, y: 0, feature: TileFeature.CHEST, chestOpened: true, edges },
      { x: 2, y: 0, feature: TileFeature.STAIRS_DOWN, chestOpened: null, edges },
      { x: 3, y: 0, feature: TileFeature.PIT, chestOpened: null, edges },
      { x: 4, y: 0, feature: TileFeature.NONE, chestOpened: null, edges },
    ],
    party: { x: 5, y: 1, facing: Direction.NORTH },
    enemies: [],
  };

  // @spec PRESENT-MAP-012
  it('marks a chest, opened or not, apart from stairs and pits', () => {
    const marks = buildMapPlan(view, viewport).cells.map((c) => c.mark);

    expect(marks).toEqual([MapMark.CHEST, MapMark.OPENED_CHEST, MapMark.STAIRS, MapMark.PIT, null]);
    expect(new Set(Object.values(MapMark)).size).toBe(Object.values(MapMark).length);
  });
});

/** A party standing at the foot of a corridor, a chest two tiles ahead. */
function harness({ find = { gold: 12, items: [] } } = {}) {
  const floor = createFloor({ id: 'f1', width: 3, height: 7 });
  floor.seed = 5;
  const tile = setTileFeature(floor, 1, 3, TileFeature.CHEST);
  tile.chest = 0;
  tile.table = 'chest';
  const onOpenChest = vi.fn(() => find);
  const state = createExploration({
    floors: [floor], floorId: 'f1', tile: { x: 1, y: 5 }, facing: Direction.NORTH, hooks: { onOpenChest },
  });
  const party = createParty();
  addCharacter(party, createCharacter({ id: 'bram', name: 'Bram', characterClass: CharacterClass.FIGHTER }));
  const controller = createController({ state, campaign: { encounter: null, state, party }, viewport, onDraw: vi.fn() });
  return { controller, state, onOpenChest };
}

const hud = (controller) => layers(controller).find((l) => l.name === 'hud').plan;
const report = (controller) => layers(controller).find((l) => l.name === 'chest')?.plan ?? null;
const interactLabel = (controller) => hud(controller).controls.find((c) => c.region === 'INTERACT_PROMPT')?.label;

describe('opening a chest', () => {
  // @spec PRESENT-PROMPT-007
  it('words the use control Open while the party stands on an unopened chest', () => {
    const { controller } = harness();
    expect(interactLabel(controller)).toBe('Use');

    pressKey(controller, 'w');
    pressKey(controller, 'w');
    expect(interactLabel(controller)).toBe('Open');

    pressKey(controller, 'e');
    pressKey(controller, 'Enter');
    expect(interactLabel(controller)).toBe('Use');
  });

  // @spec PRESENT-CHEST-001
  it('reports what the chest held, each item in its rarity\'s colour', () => {
    const blade = createItem({ id: 'b', name: 'Runed Dagger', kind: ItemKind.WEAPON, slot: 'MAIN_HAND', rarity: Rarity.EPIC });
    const { controller } = harness({ find: { gold: 12, items: [blade] } });
    pressKey(controller, 'w');
    pressKey(controller, 'w');

    pressKey(controller, 'e');

    const plan = report(controller);
    expect(plan.title).toBe('The chest held');
    expect(plan.find.gold).toBe('12 gold');
    expect(plan.find.items).toEqual([{ text: 'Runed Dagger', rarity: Rarity.EPIC, colour: RARITY_COLOURS[Rarity.EPIC] }]);
  });

  // @spec PRESENT-CHEST-001
  it('says when a chest held nothing', () => {
    const { controller } = harness({ find: { gold: 0, items: [] } });
    pressKey(controller, 'w');
    pressKey(controller, 'w');
    pressKey(controller, 'e');

    expect(report(controller).find).toMatchObject({ gold: null, items: [], nothing: 'Nothing' });
  });

  // @spec PRESENT-CHEST-002
  it('holds the input until dismissed, and dismissing changes nothing', () => {
    for (const dismiss of ['Enter', 'Escape', 'e', 'tap']) {
      const { controller, state } = harness();
      pressKey(controller, 'w');
      pressKey(controller, 'w');
      pressKey(controller, 'e');
      const where = partyPosition(state);
      const ticks = tickCount(state);

      pressKey(controller, 'w');
      pressKey(controller, 'i');
      expect(partyPosition(state)).toEqual(where);
      expect(layers(controller).find((l) => l.name === 'items')?.plan ?? null).toBeNull();
      expect(report(controller)).not.toBeNull();

      if (dismiss === 'tap') pressPointer(controller, 400, 300);
      else pressKey(controller, dismiss);

      expect(report(controller)).toBeNull();
      expect(partyPosition(state)).toEqual(where);
      expect(tickCount(state)).toBe(ticks);
    }
  });
});
