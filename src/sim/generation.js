/**
 * Dungeon generation: a seed and an archetype in, a floor out.
 *
 * Structure is authored once and frozen. Walls, doors, stairs and traps are laid here
 * and never touched again, because the party's map has to stay true and a trap they
 * disarmed must not reappear. Only room contents are ever refilled.
 */

import {
  createFloor,
  setEdge,
  setTileFeature,
  setTileLight,
  getEdge,
  contains,
  Direction,
  EdgeKind,
  LightLevel,
  TileFeature,
} from './floor.js';
import { makeRng, deriveRng } from './rng.js';

export const ArrivalRule = {
  STAIRS_UP: 'STAIRS_UP',
  RANDOM_ROOM: 'RANDOM_ROOM',
};

/**
 * The authored guidelines a floor is generated inside. Ranges, never coordinates: an
 * archetype says what kind of place this is, not where anything goes.
 */
export const DEFAULT_ARCHETYPE = {
  name: 'vault',
  size: { minWidth: 17, maxWidth: 23, minHeight: 17, maxHeight: 23 },
  rooms: { min: 5, max: 8 },
  roomSize: { min: 3, max: 6 },
  loops: { min: 2, max: 4 },
  doorChance: 0.7,
  lockedChance: 0.12,
  secretChance: 0.45,
  traps: { min: 3, max: 7 },
  litRooms: 1,
};

const STEP = {
  [Direction.NORTH]: { dx: 0, dy: -1 },
  [Direction.EAST]: { dx: 1, dy: 0 },
  [Direction.SOUTH]: { dx: 0, dy: 1 },
  [Direction.WEST]: { dx: -1, dy: 0 },
};

const OPPOSITE = {
  [Direction.NORTH]: Direction.SOUTH,
  [Direction.SOUTH]: Direction.NORTH,
  [Direction.EAST]: Direction.WEST,
  [Direction.WEST]: Direction.EAST,
};

const key = (x, y) => `${x},${y}`;
const centre = (room) => ({
  x: room.x + Math.floor(room.width / 2),
  y: room.y + Math.floor(room.height / 2),
});

/**
 * Split the floor into regions until the room target is met or nothing left is big
 * enough. A split cannot overlap, so no rejection loop can fail on an unlucky seed.
 *
 * @spec GEN-FLOOR-003
 * @spec GEN-FLOOR-005
 */
function splitRegions(rng, width, height, archetype) {
  const minSpan = archetype.roomSize.min + 2;
  let regions = [{ x: 0, y: 0, width, height }];
  const target = rng.int(archetype.rooms.min, archetype.rooms.max);

  while (regions.length < target) {
    // Always split the largest region, so rooms stay spread out.
    const splittable = regions
      .map((r, i) => ({ r, i }))
      .filter(({ r }) => r.width >= minSpan * 2 || r.height >= minSpan * 2)
      .sort((a, b) => b.r.width * b.r.height - a.r.width * a.r.height);
    if (splittable.length === 0) break;

    const { r, i } = splittable[0];
    const horizontal = r.height >= minSpan * 2 && (r.width < minSpan * 2 || rng.chance(0.5));
    let a;
    let b;
    if (horizontal) {
      const cut = rng.int(minSpan, r.height - minSpan);
      a = { x: r.x, y: r.y, width: r.width, height: cut };
      b = { x: r.x, y: r.y + cut, width: r.width, height: r.height - cut };
    } else {
      const cut = rng.int(minSpan, r.width - minSpan);
      a = { x: r.x, y: r.y, width: cut, height: r.height };
      b = { x: r.x + cut, y: r.y, width: r.width - cut, height: r.height };
    }
    regions.splice(i, 1, a, b);
  }
  return regions;
}

/** @spec GEN-FLOOR-004 */
function placeRooms(rng, regions, archetype) {
  const rooms = [];
  for (const region of regions) {
    const maxW = Math.min(archetype.roomSize.max, region.width - 2);
    const maxH = Math.min(archetype.roomSize.max, region.height - 2);
    if (maxW < archetype.roomSize.min || maxH < archetype.roomSize.min) continue;

    const width = rng.int(archetype.roomSize.min, maxW);
    const height = rng.int(archetype.roomSize.min, maxH);
    rooms.push({
      x: region.x + rng.int(1, region.width - width - 1),
      y: region.y + rng.int(1, region.height - height - 1),
      width,
      height,
    });
  }
  return rooms;
}

function openBetween(floor, carved, from, dir, record) {
  const { dx, dy } = STEP[dir];
  const to = { x: from.x + dx, y: from.y + dy };
  if (!contains(floor, to.x, to.y)) return false;
  setEdge(floor, from.x, from.y, dir, EdgeKind.OPEN);
  carved.add(key(from.x, from.y));
  carved.add(key(to.x, to.y));
  if (record) record.push({ from: { ...from }, dir, to });
  return true;
}

/** @spec GEN-FLOOR-006 */
function carveRoom(floor, carved, room) {
  for (let y = room.y; y < room.y + room.height; y++) {
    for (let x = room.x; x < room.x + room.width; x++) {
      carved.add(key(x, y));
      if (x + 1 < room.x + room.width) setEdge(floor, x, y, Direction.EAST, EdgeKind.OPEN);
      if (y + 1 < room.y + room.height) setEdge(floor, x, y, Direction.SOUTH, EdgeKind.OPEN);
    }
  }
}

/**
 * Two straight legs meeting at one turn. Which leg runs first is drawn from the seed,
 * so corridors do not all elbow the same way.
 *
 * @spec GEN-CONNECT-002
 */
export function carveCorridor(floor, carved, rng, from, to, record) {
  const horizontalFirst = rng.chance(0.5);
  let { x, y } = from;

  const walkX = () => {
    while (x !== to.x) {
      const dir = to.x > x ? Direction.EAST : Direction.WEST;
      openBetween(floor, carved, { x, y }, dir, record);
      x += to.x > x ? 1 : -1;
    }
  };
  const walkY = () => {
    while (y !== to.y) {
      const dir = to.y > y ? Direction.SOUTH : Direction.NORTH;
      openBetween(floor, carved, { x, y }, dir, record);
      y += to.y > y ? 1 : -1;
    }
  };

  if (horizontalFirst) { walkX(); walkY(); } else { walkY(); walkX(); }
}

function roomIndexAt(rooms, x, y) {
  return rooms.findIndex(
    (r) => x >= r.x && x < r.x + r.width && y >= r.y && y < r.y + r.height,
  );
}

function inAnyRoom(rooms, x, y) {
  return roomIndexAt(rooms, x, y) !== -1;
}

/** Flood the carved tiles, treating the given edge kinds as impassable. */
function flood(floor, carved, start, blocked) {
  const seen = new Set([key(start.x, start.y)]);
  const queue = [start];
  while (queue.length) {
    const t = queue.pop();
    for (const [dir, { dx, dy }] of Object.entries(STEP)) {
      const kind = getEdge(floor, t.x, t.y, dir);
      if (kind === EdgeKind.WALL || blocked.has(kind)) continue;
      const nx = t.x + dx;
      const ny = t.y + dy;
      if (!contains(floor, nx, ny) || !carved.has(key(nx, ny))) continue;
      if (seen.has(key(nx, ny))) continue;
      seen.add(key(nx, ny));
      queue.push({ x: nx, y: ny });
    }
  }
  return seen;
}

/**
 * Turn junctions into doors, and some loop connections into secrets.
 *
 * A secret is only ever taken if the floor stays fully walkable without it. A secret
 * that is the sole way into somewhere is not a secret, it is a wall the party never
 * gets past.
 *
 * @spec GEN-DOOR-001
 * @spec GEN-DOOR-002
 * @spec GEN-DOOR-003
 * @spec GEN-DOOR-004
 * @spec GEN-DOOR-005
 */
function placeDoors(floor, carved, rng, rooms, junctions, loopEdges, archetype) {
  const secretEdges = [];
  const loopSet = new Set(loopEdges.map((e) => `${e.from.x},${e.from.y},${e.dir}`));

  for (const junction of junctions) {
    const { from, dir } = junction;
    if (getEdge(floor, from.x, from.y, dir) !== EdgeKind.OPEN) continue;
    if (!rng.chance(archetype.doorChance)) continue;

    const fromLoop = loopSet.has(`${from.x},${from.y},${dir}`);
    const wanted =
      fromLoop && rng.chance(archetype.secretChance)
        ? EdgeKind.SECRET_DOOR
        : rng.chance(archetype.lockedChance)
          ? EdgeKind.LOCKED_DOOR
          : EdgeKind.DOOR;

    if (wanted === EdgeKind.DOOR) {
      setEdge(floor, from.x, from.y, dir, EdgeKind.DOOR);
      continue;
    }

    // Try it, and put it back if it would strand anything.
    setEdge(floor, from.x, from.y, dir, wanted);
    const start = { x: Number(carved.values().next().value.split(',')[0]),
                    y: Number(carved.values().next().value.split(',')[1]) };
    const openOnly = flood(floor, carved, start, new Set([EdgeKind.SECRET_DOOR, EdgeKind.LOCKED_DOOR]));
    if (openOnly.size !== carved.size) {
      setEdge(floor, from.x, from.y, dir, EdgeKind.DOOR);
      continue;
    }
    if (wanted === EdgeKind.SECRET_DOOR) {
      secretEdges.push({ x: from.x, y: from.y, direction: dir, fromLoop });
    }
  }
  return secretEdges;
}

/**
 * Build a floor.
 *
 * @spec GEN-SEED-001
 * @spec GEN-FLOOR-001
 * @spec GEN-FLOOR-002
 * @spec GEN-FLOOR-007
 * @spec GEN-CONNECT-001
 * @spec GEN-CONNECT-003
 * @spec GEN-CONNECT-004
 * @spec GEN-PLACE-001
 * @spec GEN-PLACE-002
 * @spec GEN-PLACE-008
 * @spec GEN-PLACE-009
 * @spec GEN-PLACE-003
 * @spec GEN-PLACE-005
 */
export function generateFloor({ id, seed, archetype = DEFAULT_ARCHETYPE, depthLabel = null, links = [] }) {
  const rng = makeRng(seed);
  const width = rng.int(archetype.size.minWidth, archetype.size.maxWidth);
  const height = rng.int(archetype.size.minHeight, archetype.size.maxHeight);

  const floor = createFloor({ id, width, height, depthLabel });
  // Generation carves; it never fills. Everything starts as rock.
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      for (const dir of Object.values(Direction)) setEdge(floor, x, y, dir, EdgeKind.WALL);
    }
  }

  const regions = splitRegions(deriveRng(rng), width, height, archetype);
  const rooms = placeRooms(deriveRng(rng), regions, archetype);

  const carved = new Set();
  for (const room of rooms) carveRoom(floor, carved, room);

  // Join every room to the next in a chain, then add loops. The chain is what makes
  // connectivity a property of construction rather than something to check for.
  const corridorRng = deriveRng(rng);
  const edgesCarved = [];
  for (let i = 1; i < rooms.length; i++) {
    carveCorridor(floor, carved, corridorRng, centre(rooms[i - 1]), centre(rooms[i]), edgesCarved);
  }

  const loopRng = deriveRng(rng);
  const loopEdges = [];
  const loopCount = rooms.length > 2 ? loopRng.int(archetype.loops.min, archetype.loops.max) : 0;
  for (let i = 0; i < loopCount; i++) {
    const a = loopRng.pick(rooms);
    const b = loopRng.pick(rooms);
    if (a === b) continue;
    carveCorridor(floor, carved, loopRng, centre(a), centre(b), loopEdges);
  }

  // A junction is an opened edge with a room on exactly one side: a doorway.
  const junctions = [...edgesCarved, ...loopEdges].filter(
    ({ from, to }) =>
      inAnyRoom(rooms, from.x, from.y) !== inAnyRoom(rooms, to.x, to.y),
  );
  const secretEdges = placeDoors(floor, carved, deriveRng(rng), rooms, junctions, loopEdges, archetype);

  const placeRng = deriveRng(rng);
  const carvedList = [...carved].map((k) => {
    const [x, y] = k.split(',').map(Number);
    return { x, y };
  });
  const roomTiles = carvedList.filter((t) => inAnyRoom(rooms, t.x, t.y));
  const spots = placeRng.shuffle(roomTiles.length >= 4 ? roomTiles : carvedList);

  // One tile is claimed at a time from the shuffled list, so nothing is ever placed on
  // top of anything else.
  const taken = new Set();
  const take = (allows = () => true) => {
    for (const spot of spots) {
      const key = `${spot.x},${spot.y}`;
      if (taken.has(key) || !allows(spot)) continue;
      taken.add(key);
      return spot;
    }
    return null;
  };

  // Every floor holds a way back up, so an arrival by stairs always resolves. The way
  // up claims no room: a landing that also holds a way onward is a legitimate room.
  const stairsUp = take();
  setTileFeature(floor, stairsUp.x, stairsUp.y, TileFeature.STAIRS_UP);

  // Each way down claims a room of its own. Several descents are what make the dungeon
  // a graph, but two in one room turn a choice of route into a choice of tile.
  const claimedRooms = new Set();
  for (const link of links) {
    const spot = take((t) => {
      const room = roomIndexAt(rooms, t.x, t.y);
      return room === -1 || !claimedRooms.has(room);
    });
    // A floor with more descents than rooms places as many as it has rooms for.
    if (!spot) break;

    const room = roomIndexAt(rooms, spot.x, spot.y);
    if (room !== -1) claimedRooms.add(room);

    const feature = link.via === TileFeature.PIT ? TileFeature.PIT : TileFeature.STAIRS_DOWN;
    setTileFeature(floor, spot.x, spot.y, feature, {
      target: { floorId: link.toFloorId, arriveAt: link.arriveAt },
    });
  }

  const trapCount = placeRng.int(archetype.traps.min, archetype.traps.max);
  const traps = [];
  for (let i = 0; i < trapCount; i++) {
    const spot = take();
    if (!spot) break;
    traps.push({ x: spot.x, y: spot.y });
  }

  const litRng = deriveRng(rng);
  for (const room of litRng.shuffle(rooms).slice(0, archetype.litRooms)) {
    for (let y = room.y; y < room.y + room.height; y++) {
      for (let x = room.x; x < room.x + room.width; x++) {
        setTileLight(floor, x, y, LightLevel.DIM);
      }
    }
  }

  floor.rooms = rooms;
  floor.traps = traps;
  floor.secretEdges = secretEdges;
  floor.seed = seed;
  return floor;
}

/**
 * Lay out the floor graph before any floor is built, so a connector always names a
 * floor that will exist.
 *
 * @spec GEN-SEED-004
 * @spec GEN-PLAN-001
 * @spec GEN-PLAN-002
 * @spec GEN-PLAN-003
 * @spec GEN-PLAN-004
 */
export function generatePlan({ seed, depth = 4, archetype = DEFAULT_ARCHETYPE }) {
  const rng = makeRng(seed);
  const floors = [];

  for (let i = 0; i < depth; i++) {
    floors.push({
      id: `floor-${i + 1}`,
      archetype,
      depthLabel: `B${i + 1}`,
      seed: rng.int(1, 0x7fffffff),
      links: [],
    });
  }

  // A spine down through every floor, so the whole plan is reachable from the entrance.
  for (let i = 0; i < floors.length - 1; i++) {
    floors[i].links.push({
      toFloorId: floors[i + 1].id,
      arriveAt: ArrivalRule.STAIRS_UP,
      via: TileFeature.STAIRS_DOWN,
    });
  }

  // Shortcuts that skip a floor, so a dungeon is a graph rather than a stack. A pit
  // drops the party somewhere in a room, with no way back from where they land.
  for (let i = 0; i < floors.length - 2; i++) {
    if (!rng.chance(0.5)) continue;
    floors[i].links.push({
      toFloorId: floors[i + 2].id,
      arriveAt: ArrivalRule.RANDOM_ROOM,
      via: TileFeature.PIT,
    });
  }

  return {
    seed,
    floors,
    entrance: { floorId: floors[0].id, arriveAt: ArrivalRule.STAIRS_UP },
  };
}
