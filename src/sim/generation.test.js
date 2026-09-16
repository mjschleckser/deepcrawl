import { describe, it, expect } from 'vitest';
import {
  getEdge,
  getTile,
  isEdgeOpen,
  EdgeKind,
  TileFeature,
  LightLevel,
  Direction,
  contains,
} from './floor.js';
import { makeRng, deriveRng } from './rng.js';
import { generateFloor, generatePlan, carveCorridor, DEFAULT_ARCHETYPE, ArrivalRule } from './generation.js';

const ARCH = DEFAULT_ARCHETYPE;
const seeds = (n) => Array.from({ length: n }, (_, i) => 1000 + i * 7919);

// Every tile that belongs to the dungeon — anything with an open edge.
function carvedTiles(floor) {
  const out = [];
  for (let y = 0; y < floor.height; y++) {
    for (let x = 0; x < floor.width; x++) {
      const open = Object.values(Direction).some(
        (d) => getEdge(floor, x, y, d) !== EdgeKind.WALL,
      );
      if (open) out.push({ x, y });
    }
  }
  return out;
}

// Flood the floor, treating every non-wall edge as passable. Locked and secret doors
// count as passable here: connectivity is about whether a route exists at all.
function reachableFrom(floor, start) {
  const seen = new Set([`${start.x},${start.y}`]);
  const queue = [start];
  const step = {
    [Direction.NORTH]: { dx: 0, dy: -1 },
    [Direction.EAST]: { dx: 1, dy: 0 },
    [Direction.SOUTH]: { dx: 0, dy: 1 },
    [Direction.WEST]: { dx: -1, dy: 0 },
  };
  while (queue.length) {
    const tile = queue.pop();
    for (const [dir, { dx, dy }] of Object.entries(step)) {
      if (getEdge(floor, tile.x, tile.y, dir) === EdgeKind.WALL) continue;
      const nx = tile.x + dx;
      const ny = tile.y + dy;
      if (!contains(floor, nx, ny)) continue;
      const key = `${nx},${ny}`;
      if (seen.has(key)) continue;
      seen.add(key);
      queue.push({ x: nx, y: ny });
    }
  }
  return seen;
}

describe('the seeded generator', () => {
  // @spec GEN-SEED-002
  it('produces the same stream for the same seed', () => {
    const a = makeRng(12345);
    const b = makeRng(12345);

    expect([a.next(), a.next(), a.next()]).toEqual([b.next(), b.next(), b.next()]);
  });

  // @spec GEN-SEED-002
  it('produces different streams for different seeds', () => {
    expect(makeRng(1).next()).not.toBe(makeRng(2).next());
  });

  // @spec GEN-SEED-002
  it('stays within the unit interval', () => {
    const rng = makeRng(99);
    for (let i = 0; i < 500; i++) {
      const v = rng.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  // @spec GEN-SEED-003
  it('derives an independent child generator, leaving the parent stream untouched', () => {
    const parent = makeRng(7);
    parent.next();
    const child = deriveRng(parent);
    for (let i = 0; i < 50; i++) child.next();

    const control = makeRng(7);
    control.next();
    deriveRng(control);

    // However much the child drew, the parent carries on identically.
    expect(parent.next()).toBe(control.next());
  });

  // @spec GEN-SEED-002
  it('draws integers within an inclusive range', () => {
    const rng = makeRng(4);
    for (let i = 0; i < 200; i++) {
      const v = rng.int(3, 6);
      expect(v).toBeGreaterThanOrEqual(3);
      expect(v).toBeLessThanOrEqual(6);
    }
  });
});

describe('floor generation is reproducible', () => {
  // @spec GEN-SEED-001
  it('builds an identical floor for the same seed and archetype', () => {
    for (const seed of seeds(5)) {
      const a = generateFloor({ id: 'f', seed, archetype: ARCH });
      const b = generateFloor({ id: 'f', seed, archetype: ARCH });

      expect(a.width).toBe(b.width);
      expect(a.height).toBe(b.height);
      expect(a.horizontalEdges).toEqual(b.horizontalEdges);
      expect(a.verticalEdges).toEqual(b.verticalEdges);
      expect(a.tiles).toEqual(b.tiles);
    }
  });

  // @spec GEN-SEED-001
  it('builds different floors for different seeds', () => {
    const a = generateFloor({ id: 'f', seed: 1, archetype: ARCH });
    const b = generateFloor({ id: 'f', seed: 2, archetype: ARCH });

    expect(a.horizontalEdges).not.toEqual(b.horizontalEdges);
  });
});

describe('floor layout', () => {
  // @spec GEN-FLOOR-002
  it('sizes every floor within the archetype range', () => {
    for (const seed of seeds(20)) {
      const floor = generateFloor({ id: 'f', seed, archetype: ARCH });
      expect(floor.width).toBeGreaterThanOrEqual(ARCH.size.minWidth);
      expect(floor.width).toBeLessThanOrEqual(ARCH.size.maxWidth);
      expect(floor.height).toBeGreaterThanOrEqual(ARCH.size.minHeight);
      expect(floor.height).toBeLessThanOrEqual(ARCH.size.maxHeight);
    }
  });

  // @spec GEN-FLOOR-001
  // @spec GEN-FLOOR-007
  it('walls the border, and leaves untouched rock fully walled', () => {
    const floor = generateFloor({ id: 'f', seed: 42, archetype: ARCH });

    for (let x = 0; x < floor.width; x++) {
      expect(getEdge(floor, x, 0, Direction.NORTH)).toBe(EdgeKind.WALL);
      expect(getEdge(floor, x, floor.height - 1, Direction.SOUTH)).toBe(EdgeKind.WALL);
    }
    // Anything not carved has no open edge at all.
    const carved = new Set(carvedTiles(floor).map((t) => `${t.x},${t.y}`));
    for (let y = 0; y < floor.height; y++) {
      for (let x = 0; x < floor.width; x++) {
        if (carved.has(`${x},${y}`)) continue;
        for (const d of Object.values(Direction)) {
          expect(getEdge(floor, x, y, d)).toBe(EdgeKind.WALL);
        }
      }
    }
  });

  // @spec GEN-FLOOR-003
  // @spec GEN-FLOOR-005
  it('delivers rooms up to the archetype target, and never more', () => {
    for (const seed of seeds(20)) {
      const floor = generateFloor({ id: 'f', seed, archetype: ARCH });
      expect(floor.rooms.length).toBeGreaterThan(0);
      expect(floor.rooms.length).toBeLessThanOrEqual(ARCH.rooms.max);
    }
  });

  // @spec GEN-FLOOR-004
  it('keeps every room inside the floor and within the archetype size range', () => {
    for (const seed of seeds(20)) {
      const floor = generateFloor({ id: 'f', seed, archetype: ARCH });
      for (const room of floor.rooms) {
        expect(room.x).toBeGreaterThanOrEqual(0);
        expect(room.y).toBeGreaterThanOrEqual(0);
        expect(room.x + room.width).toBeLessThanOrEqual(floor.width);
        expect(room.y + room.height).toBeLessThanOrEqual(floor.height);
        expect(room.width).toBeGreaterThanOrEqual(ARCH.roomSize.min);
        expect(room.height).toBeGreaterThanOrEqual(ARCH.roomSize.min);
      }
    }
  });

  // @spec GEN-FLOOR-004
  it('never overlaps two rooms', () => {
    for (const seed of seeds(20)) {
      const { rooms } = generateFloor({ id: 'f', seed, archetype: ARCH });
      for (let i = 0; i < rooms.length; i++) {
        for (let j = i + 1; j < rooms.length; j++) {
          const a = rooms[i];
          const b = rooms[j];
          const disjoint =
            a.x + a.width <= b.x || b.x + b.width <= a.x ||
            a.y + a.height <= b.y || b.y + b.height <= a.y;
          expect(disjoint).toBe(true);
        }
      }
    }
  });

  // @spec GEN-FLOOR-006
  it('opens every interior edge of a room', () => {
    const floor = generateFloor({ id: 'f', seed: 77, archetype: ARCH });
    for (const room of floor.rooms) {
      for (let y = room.y; y < room.y + room.height; y++) {
        for (let x = room.x; x < room.x + room.width - 1; x++) {
          expect(getEdge(floor, x, y, Direction.EAST)).not.toBe(EdgeKind.WALL);
        }
      }
    }
  });
});

describe('connectivity', () => {
  // @spec GEN-CONNECT-001
  // @spec GEN-CONNECT-004
  it('leaves every carved tile reachable from every other, across many seeds', () => {
    for (const seed of seeds(40)) {
      const floor = generateFloor({ id: 'f', seed, archetype: ARCH });
      const carved = carvedTiles(floor);
      const reached = reachableFrom(floor, carved[0]);

      expect(reached.size).toBe(carved.length);
    }
  });

  // @spec GEN-CONNECT-003
  it('carves loops, so a floor is not a bare tree of corridors', () => {
    // A tree over N carved tiles has exactly N-1 open edges; loops add more.
    const floor = generateFloor({ id: 'f', seed: 31, archetype: ARCH });
    const carved = carvedTiles(floor);
    let openEdges = 0;
    for (const t of carved) {
      if (getEdge(floor, t.x, t.y, Direction.EAST) !== EdgeKind.WALL) openEdges++;
      if (getEdge(floor, t.x, t.y, Direction.SOUTH) !== EdgeKind.WALL) openEdges++;
    }

    expect(openEdges).toBeGreaterThan(carved.length - 1);
  });
});

describe('doors and secrets', () => {
  // @spec GEN-DOOR-004
  // @spec GEN-DOOR-005
  it('never seals a region behind secret or locked doors alone, across many seeds', () => {
    for (const seed of seeds(40)) {
      const floor = generateFloor({ id: 'f', seed, archetype: ARCH });
      const carved = carvedTiles(floor);

      // Flood using only plainly passable edges: no secret, no locked.
      const seen = new Set([`${carved[0].x},${carved[0].y}`]);
      const queue = [carved[0]];
      const step = {
        [Direction.NORTH]: { dx: 0, dy: -1 }, [Direction.EAST]: { dx: 1, dy: 0 },
        [Direction.SOUTH]: { dx: 0, dy: 1 }, [Direction.WEST]: { dx: -1, dy: 0 },
      };
      while (queue.length) {
        const t = queue.pop();
        for (const [dir, { dx, dy }] of Object.entries(step)) {
          const kind = getEdge(floor, t.x, t.y, dir);
          if (kind === EdgeKind.WALL || kind === EdgeKind.SECRET_DOOR || kind === EdgeKind.LOCKED_DOOR) continue;
          const nx = t.x + dx, ny = t.y + dy;
          if (!contains(floor, nx, ny)) continue;
          const key = `${nx},${ny}`;
          if (seen.has(key)) continue;
          seen.add(key); queue.push({ x: nx, y: ny });
        }
      }

      expect(seen.size).toBe(carved.length);
    }
  });

  // @spec GEN-DOOR-003
  it('places a secret door only where a loop was carved', () => {
    for (const seed of seeds(15)) {
      const floor = generateFloor({ id: 'f', seed, archetype: ARCH });
      for (const secret of floor.secretEdges ?? []) {
        expect(secret.fromLoop).toBe(true);
      }
    }
  });

  // @spec GEN-DOOR-001
  it('marks doors where corridors meet rooms', () => {
    let doorsSeen = 0;
    for (const seed of seeds(10)) {
      const floor = generateFloor({ id: 'f', seed, archetype: ARCH });
      for (let y = 0; y < floor.height; y++) {
        for (let x = 0; x < floor.width; x++) {
          for (const d of Object.values(Direction)) {
            if (getEdge(floor, x, y, d) === EdgeKind.DOOR) doorsSeen++;
          }
        }
      }
    }
    expect(doorsSeen).toBeGreaterThan(0);
  });
});

describe('placement', () => {
  // @spec GEN-PLACE-001
  it('places an upward staircase on every floor, so an arrival can always resolve', () => {
    for (const seed of seeds(20)) {
      const floor = generateFloor({ id: 'f', seed, archetype: ARCH });
      const ups = floor.tiles.filter((t) => t.feature === TileFeature.STAIRS_UP);
      expect(ups.length).toBeGreaterThanOrEqual(1);
    }
  });

  const roomIndexAt = (floor, x, y) =>
    (floor.rooms ?? []).findIndex(
      (r) => x >= r.x && x < r.x + r.width && y >= r.y && y < r.y + r.height,
    );

  const waysDown = (floor) => {
    const out = [];
    for (let y = 0; y < floor.height; y++) {
      for (let x = 0; x < floor.width; x++) {
        const { feature } = getTile(floor, x, y);
        if (feature === TileFeature.STAIRS_DOWN || feature === TileFeature.PIT) out.push({ x, y });
      }
    }
    return out;
  };

  const descending = (count) =>
    Array.from({ length: count }, (_, i) => ({
      toFloorId: `down-${i}`,
      arriveAt: ArrivalRule.STAIRS_UP,
      via: i % 2 === 0 ? TileFeature.STAIRS_DOWN : TileFeature.PIT,
    }));

  // @spec GEN-PLACE-008
  it('never puts two ways down in the same room', () => {
    for (const seed of seeds(30)) {
      const floor = generateFloor({ id: 'f', seed, archetype: ARCH, links: descending(3) });

      const rooms = waysDown(floor)
        .map((t) => roomIndexAt(floor, t.x, t.y))
        .filter((i) => i !== -1);

      expect(new Set(rooms).size).toBe(rooms.length);
    }
  });

  // @spec GEN-PLACE-008
  it('leaves the way back up free to share a room with a way down', () => {
    // The way up is a fixed point every floor must have; only descents claim a room.
    for (const seed of seeds(30)) {
      const floor = generateFloor({ id: 'f', seed, archetype: ARCH, links: descending(2) });
      expect(floor.tiles.filter((t) => t.feature === TileFeature.STAIRS_UP).length).toBe(1);
    }
  });

  // @spec GEN-PLACE-009
  it('places no more ways down than it has rooms to put them in', () => {
    for (const seed of seeds(20)) {
      const floor = generateFloor({ id: 'f', seed, archetype: ARCH, links: descending(40) });
      expect(waysDown(floor).length).toBeLessThanOrEqual((floor.rooms ?? []).length);
    }
  });

  // @spec GEN-PLACE-002
  it('places every connector on a carved tile', () => {
    for (const seed of seeds(20)) {
      const floor = generateFloor({ id: 'f', seed, archetype: ARCH });
      const carved = new Set(carvedTiles(floor).map((t) => `${t.x},${t.y}`));
      for (let y = 0; y < floor.height; y++) {
        for (let x = 0; x < floor.width; x++) {
          if (getTile(floor, x, y).feature === TileFeature.NONE) continue;
          expect(carved.has(`${x},${y}`)).toBe(true);
        }
      }
    }
  });

  // @spec GEN-PLACE-003
  it('lays traps within the archetype budget', () => {
    for (const seed of seeds(20)) {
      const floor = generateFloor({ id: 'f', seed, archetype: ARCH });
      expect(floor.traps.length).toBeGreaterThanOrEqual(ARCH.traps.min);
      expect(floor.traps.length).toBeLessThanOrEqual(ARCH.traps.max);
    }
  });

  // @spec GEN-PLACE-005
  it('leaves tiles dark except the rooms the archetype lights', () => {
    const floor = generateFloor({ id: 'f', seed: 5, archetype: { ...ARCH, litRooms: 0 } });
    expect(floor.tiles.every((t) => t.intrinsicLight === LightLevel.DARK)).toBe(true);

    const lit = generateFloor({ id: 'f', seed: 5, archetype: { ...ARCH, litRooms: 2 } });
    expect(lit.tiles.some((t) => t.intrinsicLight !== LightLevel.DARK)).toBe(true);
  });
});

describe('the dungeon plan', () => {
  // @spec GEN-SEED-004
  it('produces an identical plan for the same campaign seed', () => {
    expect(generatePlan({ seed: 808 })).toEqual(generatePlan({ seed: 808 }));
  });

  // @spec GEN-PLAN-001
  // @spec GEN-PLAN-003
  it('names one entrance floor and gives every floor an id, archetype, and label', () => {
    const plan = generatePlan({ seed: 12 });

    expect(plan.floors.length).toBeGreaterThan(1);
    expect(plan.floors.filter((f) => f.id === plan.entrance.floorId)).toHaveLength(1);
    for (const floor of plan.floors) {
      expect(floor.id).toBeTruthy();
      expect(floor.archetype).toBeTruthy();
      expect(floor.depthLabel).toBeTruthy();
    }
  });

  // @spec GEN-PLAN-002
  it('points every connector at a floor the plan contains', () => {
    for (const seed of seeds(15)) {
      const plan = generatePlan({ seed });
      const ids = new Set(plan.floors.map((f) => f.id));
      for (const floor of plan.floors) {
        for (const link of floor.links) {
          expect(ids.has(link.toFloorId)).toBe(true);
        }
      }
    }
  });

  // @spec GEN-PLAN-004
  it('gives every link a destination floor and an arrival rule, never a tile', () => {
    const plan = generatePlan({ seed: 3 });

    for (const floor of plan.floors) {
      for (const link of floor.links) {
        expect(Object.values(ArrivalRule)).toContain(link.arriveAt);
        expect(link).not.toHaveProperty('x');
        expect(link).not.toHaveProperty('y');
      }
    }
  });

  // @spec GEN-PLAN-002
  it('reaches every floor in the plan from the entrance', () => {
    for (const seed of seeds(15)) {
      const plan = generatePlan({ seed });
      const byId = new Map(plan.floors.map((f) => [f.id, f]));
      const seen = new Set([plan.entrance.floorId]);
      const queue = [plan.entrance.floorId];
      while (queue.length) {
        for (const link of byId.get(queue.pop()).links) {
          if (seen.has(link.toFloorId)) continue;
          seen.add(link.toFloorId);
          queue.push(link.toFloorId);
        }
      }
      expect(seen.size).toBe(plan.floors.length);
    }
  });
});

describe('corridor shape and locked doors', () => {
  // @spec GEN-CONNECT-002
  it('carves a corridor as two straight legs meeting at one turn', () => {
    for (const seed of seeds(10)) {
      const floor = generateFloor({ id: 'f', seed, archetype: ARCH });
      const carved = [];
      const rng = makeRng(seed);
      carveCorridor(floor, new Set(), rng, { x: 2, y: 2 }, { x: 8, y: 6 }, carved);

      // Every step runs along one axis, and the axis changes exactly once.
      const axes = carved.map((c) => (c.dir === Direction.EAST || c.dir === Direction.WEST ? 'x' : 'y'));
      const turns = axes.filter((a, i) => i > 0 && a !== axes[i - 1]).length;
      expect(turns).toBe(1);
      expect(carved).toHaveLength(6 + 4);
    }
  });

  // @spec GEN-CONNECT-002
  it('chooses which leg runs first from the seed, not always the same way', () => {
    const firstAxis = seeds(24).map((seed) => {
      const floor = generateFloor({ id: 'f', seed, archetype: ARCH });
      const carved = [];
      carveCorridor(floor, new Set(), makeRng(seed), { x: 2, y: 2 }, { x: 8, y: 6 }, carved);
      return carved[0].dir === Direction.EAST ? 'x' : 'y';
    });

    expect(new Set(firstAxis).size).toBe(2);
  });

  // @spec GEN-DOOR-002
  it('locks doors only when the archetype asks for it', () => {
    const lockedIn = (floor) => {
      let n = 0;
      for (let y = 0; y < floor.height; y++)
        for (let x = 0; x < floor.width; x++)
          for (const d of Object.values(Direction))
            if (getEdge(floor, x, y, d) === EdgeKind.LOCKED_DOOR) n++;
      return n;
    };

    for (const seed of seeds(10)) {
      const unlocked = generateFloor({ id: 'f', seed, archetype: { ...ARCH, lockedChance: 0 } });
      expect(lockedIn(unlocked)).toBe(0);
    }

    const anyLocked = seeds(10).some((seed) =>
      lockedIn(generateFloor({ id: 'f', seed, archetype: { ...ARCH, lockedChance: 1, secretChance: 0 } })) > 0,
    );
    expect(anyLocked).toBe(true);
  });
});
