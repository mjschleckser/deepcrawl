/**
 * A hand-authored floor to walk while dungeon generation does not exist.
 *
 * Scaffolding with a known expiry: when the generation segment lands, this file is
 * deleted rather than migrated. Its only job is to exercise every drawing path —
 * corridors, a room, a door, a secret door, a staircase, and somewhere dark.
 */

import {
  createFloor,
  setEdge,
  setTileFeature,
  setTileLight,
  Direction,
  EdgeKind,
  LightLevel,
  TileFeature,
} from '../sim/floor.js';
import { createLightSource } from '../sim/light.js';
import { createExploration } from '../sim/exploration.js';

// '#' is solid rock, '.' is floor. Walls live on edges, so a solid tile is simply one
// whose four edges are all walled.
const LAYOUT = [
  '#########',
  '#...#...#',
  '#.#.#.#.#',
  '#.#...#.#',
  '#.#####.#',
  '#.......#',
  '#.#####.#',
  '#.......#',
  '#########',
];

const DOORS = [
  { x: 4, y: 3, direction: Direction.WEST, kind: EdgeKind.DOOR },
  { x: 5, y: 3, direction: Direction.EAST, kind: EdgeKind.DOOR, open: true },
  // The way into the eastern chamber is not obvious.
  { x: 7, y: 3, direction: Direction.NORTH, kind: EdgeKind.SECRET_DOOR },
];

export const STARTER_START = { x: 1, y: 7, facing: Direction.NORTH };

export function createStarterFloor() {
  const height = LAYOUT.length;
  const width = LAYOUT[0].length;
  const floor = createFloor({ id: 'vestibule', width, height, depthLabel: 'B1' });

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (LAYOUT[y][x] !== '#') continue;
      for (const direction of Object.values(Direction)) {
        setEdge(floor, x, y, direction, EdgeKind.WALL);
      }
    }
  }

  for (const { x, y, direction, kind, open = false } of DOORS) {
    setEdge(floor, x, y, direction, kind, { open });
  }

  setTileFeature(floor, 7, 1, TileFeature.STAIRS_DOWN, {
    target: { floorId: 'vestibule', x: 1, y: 7 },
  });
  setTileFeature(floor, 3, 1, TileFeature.PIT, {
    target: { floorId: 'vestibule', x: 1, y: 5 },
  });

  // The entrance is lit, so a party that lets its torch die is never wholly stranded.
  setTileLight(floor, 1, 7, LightLevel.DIM);
  setTileLight(floor, 2, 7, LightLevel.DIM);

  return floor;
}

export function createStarterGame() {
  return createExploration({
    floors: [createStarterFloor()],
    floorId: 'vestibule',
    tile: { x: STARTER_START.x, y: STARTER_START.y },
    facing: STARTER_START.facing,
    lightSources: [
      createLightSource({ id: 'torch-1', brightRadius: 1, dimRadius: 4, remainingTicks: 240, lit: true }),
      createLightSource({ id: 'torch-2', brightRadius: 1, dimRadius: 4, remainingTicks: 240 }),
    ],
  });
}
