import { describe, it, expect } from 'vitest';
import { makeRng } from './rng.js';
import { createFloor, setEdge, EdgeKind, Direction } from './floor.js';
import { Row } from './party.js';
import { MAX_ENEMY_ROW } from './combat.js';
import {
  ROSTER, BANDS, EnemyRole,
  assembleBand, createRoamer, crossingCost, noticeRange,
  giveTicks, roamerSees, awarenessOf, isAware, forgetParty,
  selectEnemyTarget, occupantsFor,
} from './enemies.js';

// An open 11x11 room, so movement has somewhere to go.
const openFloor = (id = 'f1', size = 11) => createFloor({ id, width: size, height: size });

// A one-wide north-south corridor at x=5, so line of sight can be broken deliberately.
function corridorFloor() {
  const floor = openFloor();
  for (let y = 0; y < 11; y++) {
    setEdge(floor, 5, y, Direction.WEST, EdgeKind.WALL);
    setEdge(floor, 5, y, Direction.EAST, EdgeKind.WALL);
  }
  return floor;
}

describe('the roster', () => {
  // @spec ENEMY-ROSTER-001
  // @spec ENEMY-ROSTER-002
  it('gives every enemy the fields combat resolves against, and exactly one role', () => {
    for (const enemy of Object.values(ROSTER)) {
      expect(enemy.id).toBeTruthy();
      expect(enemy.name).toBeTruthy();
      expect(Object.values(EnemyRole)).toContain(enemy.role);
      expect([Row.FRONT, Row.BACK]).toContain(enemy.row);
      for (const field of ['hitPoints', 'dexterity', 'accuracy', 'armour', 'potValue']) {
        expect(typeof enemy[field]).toBe('number');
      }
    }
  });

  // @spec ENEMY-ROSTER-004
  it('holds the three goblins of the first floor', () => {
    expect(ROSTER.GOBLIN).toMatchObject({ role: EnemyRole.MELEE, row: Row.FRONT });
    expect(ROSTER.GOBLIN_ARCHER).toMatchObject({ role: EnemyRole.RANGED, row: Row.BACK });
    expect(ROSTER.GOBLIN_MAGE).toMatchObject({ role: EnemyRole.CASTER, row: Row.BACK });
  });

  // @spec ENEMY-ROSTER-003
  it('keeps role and row separate, so an enemy can stand where its role would not', () => {
    // A warband bigger than one row pushes melee goblins into the back.
    const band = assembleBand(BANDS.GOBLIN_WARBAND, makeRng(3), { rowLimit: 2 });
    const displaced = band.members.filter((m) => m.role === EnemyRole.MELEE && m.row === Row.BACK);

    expect(band.members.length).toBeGreaterThan(2);
    expect(displaced.length).toBeGreaterThan(0);
  });

  // @spec ENEMY-ROSTER-005
  it('holds no behaviour peculiar to any named enemy', () => {
    // Every roster entry is plain data: nothing callable hides on it.
    for (const enemy of Object.values(ROSTER)) {
      for (const value of Object.values(enemy)) {
        expect(typeof value).not.toBe('function');
      }
    }
  });
});

describe('bands', () => {
  // @spec ENEMY-BAND-001
  // @spec ENEMY-BAND-006
  it('fields a goblin warband of two to four goblins', () => {
    for (let seed = 1; seed < 40; seed++) {
      const band = assembleBand(BANDS.GOBLIN_WARBAND, makeRng(seed));
      expect(band.members.length).toBeGreaterThanOrEqual(2);
      expect(band.members.length).toBeLessThanOrEqual(4);
      expect(band.members.every((m) => m.id.startsWith('GOBLIN'))).toBe(true);
    }
  });

  // @spec ENEMY-BAND-002
  it('varies the count from the seed', () => {
    const sizes = new Set();
    for (let seed = 1; seed < 40; seed++) sizes.add(assembleBand(BANDS.GOBLIN_WARBAND, makeRng(seed)).members.length);

    expect(sizes.size).toBeGreaterThan(1);
  });

  // @spec ENEMY-BAND-003
  it('assembles an identical band from an identical seed', () => {
    const a = assembleBand(BANDS.GOBLIN_WARBAND, makeRng(88));
    const b = assembleBand(BANDS.GOBLIN_WARBAND, makeRng(88));

    expect(a.members.map((m) => [m.id, m.row])).toEqual(b.members.map((m) => [m.id, m.row]));
  });

  // @spec ENEMY-BAND-004
  it('puts each member in its preferred row while there is space', () => {
    const band = assembleBand(
      { name: 'mixed', members: [{ enemy: 'GOBLIN', min: 2, max: 2 }, { enemy: 'GOBLIN_ARCHER', min: 2, max: 2 }] },
      makeRng(5),
    );

    expect(band.members.filter((m) => m.id === 'GOBLIN').every((m) => m.row === Row.FRONT)).toBe(true);
    expect(band.members.filter((m) => m.id === 'GOBLIN_ARCHER').every((m) => m.row === Row.BACK)).toBe(true);
  });

  // @spec ENEMY-BAND-005
  it('never exceeds the combat row limit', () => {
    const swarm = assembleBand(
      { name: 'horde', members: [{ enemy: 'GOBLIN', min: 30, max: 30 }] },
      makeRng(1),
    );

    expect(swarm.members.filter((m) => m.row === Row.FRONT).length).toBeLessThanOrEqual(MAX_ENEMY_ROW);
    expect(swarm.members.filter((m) => m.row === Row.BACK).length).toBeLessThanOrEqual(MAX_ENEMY_ROW);
  });
});

describe('awareness', () => {
  const roamerAt = (x, y, over = {}) =>
    createRoamer({ id: 'r1', floorId: 'f1', x, y, band: assembleBand(BANDS.GOBLIN_WARBAND, makeRng(2)), ...over });

  // @spec ENEMY-AWARE-001
  it('notices the party once it is close enough', () => {
    const floor = openFloor();
    const far = roamerAt(0, 0);
    const near = roamerAt(5, 5);

    expect(isAware(giveTicks(far, 0, { floor, party: { x: 10, y: 10 } }))).toBe(false);
    expect(isAware(giveTicks(near, 0, { floor, party: { x: 5, y: 6 } }))).toBe(true);
  });

  // @spec ENEMY-AWARE-002
  it('notices the same whether the party is lit or in pitch dark', () => {
    const floor = openFloor();
    const lit = giveTicks(roamerAt(5, 5), 0, { floor, party: { x: 5, y: 6 }, light: 'BRIGHT' });
    const dark = giveTicks(roamerAt(5, 5), 0, { floor, party: { x: 5, y: 6 }, light: 'DARK' });

    expect(isAware(lit)).toBe(isAware(dark));
    expect(awarenessOf(lit)).toBe(awarenessOf(dark));
  });

  // @spec ENEMY-AWARE-003
  it('stays certain while the party is in sight, however long the chase runs', () => {
    const floor = openFloor();
    let roamer = giveTicks(roamerAt(5, 5), 0, { floor, party: { x: 5, y: 6 } });
    const full = awarenessOf(roamer);

    for (let i = 0; i < 20; i++) {
      roamer = giveTicks(roamer, 8, { floor, party: { x: roamer.x, y: roamer.y + 1 } });
    }

    expect(awarenessOf(roamer)).toBe(full);
    expect(isAware(roamer)).toBe(true);
  });

  // @spec ENEMY-AWARE-004
  // @spec ENEMY-AWARE-005
  it('forgets the party once sight is broken and enough ticks pass', () => {
    const floor = corridorFloor();
    // Aware, then the party leaves the corridor entirely.
    let roamer = giveTicks(roamerAt(5, 8), 0, { floor, party: { x: 5, y: 7 } });
    expect(isAware(roamer)).toBe(true);

    const hidden = { x: 0, y: 0 };
    let decayed = awarenessOf(roamer);
    for (let i = 0; i < 30 && isAware(roamer); i++) {
      roamer = giveTicks(roamer, 8, { floor, party: hidden });
      expect(awarenessOf(roamer)).toBeLessThanOrEqual(decayed);
      decayed = awarenessOf(roamer);
    }

    expect(isAware(roamer)).toBe(false);
  });

  // @spec ENEMY-AWARE-006
  it('cannot see the party through a wall, a closed door, or an unfound secret door', () => {
    const floor = openFloor();
    const roamer = roamerAt(5, 5);
    const party = { x: 5, y: 3 };
    expect(roamerSees(roamer, floor, party)).toBe(true);

    for (const kind of [EdgeKind.WALL, EdgeKind.DOOR, EdgeKind.SECRET_DOOR]) {
      const blocked = openFloor();
      setEdge(blocked, 5, 4, Direction.NORTH, kind);
      expect(roamerSees(roamer, blocked, party)).toBe(false);
    }
  });

  // @spec ENEMY-AWARE-006
  it('sees through a door that stands open', () => {
    const floor = openFloor();
    setEdge(floor, 5, 4, Direction.NORTH, EdgeKind.DOOR, { open: true });

    expect(roamerSees(roamerAt(5, 5), floor, { x: 5, y: 3 })).toBe(true);
  });

  // @spec ENEMY-AWARE-007
  it('forgets the party when they escape an encounter with it', () => {
    const floor = openFloor();
    const roamer = giveTicks(roamerAt(5, 5), 0, { floor, party: { x: 5, y: 6 } });
    expect(isAware(roamer)).toBe(true);

    expect(isAware(forgetParty(roamer))).toBe(false);
  });
});

describe('movement', () => {
  const band = () => assembleBand(BANDS.GOBLIN_WARBAND, makeRng(2));
  const roamer = (over = {}) => createRoamer({ id: 'r1', floorId: 'f1', x: 5, y: 8, band: band(), ...over });

  // @spec ENEMY-MOVE-001
  it('costs fewer ticks to cross a tile the quicker the enemy', () => {
    expect(crossingCost(16)).toBeLessThan(crossingCost(6));
  });

  // @spec ENEMY-MOVE-002
  // @spec ENEMY-MOVE-005
  it('closes on the party when it can afford to move', () => {
    const floor = corridorFloor();
    const chaser = roamer({ dexterity: 12 });
    const before = chaser.y;

    const moved = giveTicks(chaser, crossingCost(12), { floor, party: { x: 5, y: 2 } });

    expect(moved.y).toBeLessThan(before);
    expect(moved.x).toBe(5);
  });

  // @spec ENEMY-MOVE-003
  it('carries unspent ticks forward rather than discarding them', () => {
    const floor = corridorFloor();
    const chaser = roamer({ dexterity: 10 });
    const cost = crossingCost(10);

    const half = giveTicks(chaser, cost - 1, { floor, party: { x: 5, y: 2 } });
    expect(half.y).toBe(chaser.y); // could not afford a step yet

    const moved = giveTicks(half, 1, { floor, party: { x: 5, y: 2 } });
    expect(moved.y).toBeLessThan(chaser.y); // the carried tick paid for it
  });

  // @spec ENEMY-MOVE-004
  it('moves more than once when given ticks enough for several crossings', () => {
    const floor = corridorFloor();
    const chaser = roamer({ dexterity: 10, y: 9 });

    const moved = giveTicks(chaser, crossingCost(10) * 3, { floor, party: { x: 5, y: 1 } });

    expect(chaser.y - moved.y).toBe(3);
  });

  // @spec ENEMY-MOVE-007
  it('will not walk through a wall', () => {
    const floor = corridorFloor();
    setEdge(floor, 5, 7, Direction.NORTH, EdgeKind.WALL);
    // Close enough to have noticed, so it is genuinely trying to reach them.
    const chaser = roamer({ dexterity: 10, y: 7 });
    const party = { x: 5, y: 5 };

    const moved = giveTicks(chaser, crossingCost(10) * 5, { floor, party });

    expect(moved.y).toBe(7);
  });

  // @spec ENEMY-MOVE-008
  it('is outrun by a party quicker than it', () => {
    const floor = corridorFloor();
    let chaser = roamer({ dexterity: 6, y: 10 });
    const slowCost = crossingCost(6);
    const partyStepCost = 5; // a nimble party

    let partyY = 9;
    const gapBefore = chaser.y - partyY;
    for (let step = 0; step < 6 && partyY > 1; step++) {
      partyY -= 1;
      chaser = giveTicks(chaser, partyStepCost, { floor, party: { x: 5, y: partyY } });
    }

    expect(slowCost).toBeGreaterThan(partyStepCost);
    expect(chaser.y - partyY).toBeGreaterThan(gapBefore);
  });

  // @spec ENEMY-MOVE-006
  it('drifts rather than closing while it has not noticed anyone', () => {
    const floor = openFloor();
    const wanderer = createRoamer({
      id: 'w', floorId: 'f1', x: 5, y: 5, band: band(), dexterity: 10, rng: makeRng(9),
    });

    // The party is far away, so it is never noticed.
    const moved = giveTicks(wanderer, crossingCost(10) * 4, { floor, party: { x: 0, y: 0 } });

    expect(isAware(moved)).toBe(false);
    expect(moved.x !== 5 || moved.y !== 5).toBe(true);
  });
});

describe('contact', () => {
  const band = () => assembleBand(BANDS.GOBLIN_WARBAND, makeRng(2));

  // @spec ENEMY-CONTACT-002
  it('catches a roamer the party stepped onto, before it can move away', () => {
    const floor = corridorFloor();
    // The party has just stepped onto the roamer's tile. Left to move first, a quick
    // roamer would walk off and the two would have passed through each other.
    const chaser = createRoamer({ id: 'r1', floorId: 'f1', x: 5, y: 5, band: band(), dexterity: 20 });

    const moved = giveTicks(chaser, crossingCost(20) * 3, { floor, party: { x: 5, y: 5 } });

    expect(moved.contacted).toBe(true);
    expect({ x: moved.x, y: moved.y }).toEqual({ x: 5, y: 5 });
  });

  // @spec ENEMY-CONTACT-001
  it('catches a party it has walked onto', () => {
    const floor = corridorFloor();
    const chaser = createRoamer({ id: 'r1', floorId: 'f1', x: 5, y: 6, band: band(), dexterity: 20 });

    const moved = giveTicks(chaser, crossingCost(20), { floor, party: { x: 5, y: 5 } });

    expect(moved.x).toBe(5);
    expect(moved.y).toBe(5);
    expect(moved.contacted).toBe(true);
  });

  // @spec ENEMY-CONTACT-004
  it('reports an unnoticed roamer as unaware, whatever the light', () => {
    const floor = openFloor();
    const distant = createRoamer({ id: 'r1', floorId: 'f1', x: 0, y: 0, band: band(), dexterity: 10 });

    expect(isAware(giveTicks(distant, 0, { floor, party: { x: 10, y: 10 }, light: 'DARK' }))).toBe(false);
  });
});

describe('choosing a target', () => {
  const front = [{ id: 'a', row: Row.FRONT }, { id: 'b', row: Row.FRONT }];
  const back = [{ id: 'c', row: Row.BACK }];

  // @spec ENEMY-FIGHT-001
  // @spec ENEMY-FIGHT-003
  it('keeps a melee enemy on the front row while one stands', () => {
    for (let seed = 1; seed < 25; seed++) {
      const target = selectEnemyTarget(EnemyRole.MELEE, [...front, ...back], makeRng(seed));
      expect(target.row).toBe(Row.FRONT);
    }
  });

  // @spec ENEMY-FIGHT-002
  it('lets a ranged enemy reach the back row, while favouring the front', () => {
    const picks = [];
    for (let seed = 1; seed < 200; seed++) {
      picks.push(selectEnemyTarget(EnemyRole.RANGED, [...front, ...back], makeRng(seed)).row);
    }

    const backPicks = picks.filter((r) => r === Row.BACK).length;
    expect(backPicks).toBeGreaterThan(0);
    expect(backPicks).toBeLessThan(picks.length / 2);
  });

  // @spec ENEMY-FIGHT-001
  it('reaches the back row with melee once no front row stands', () => {
    const target = selectEnemyTarget(EnemyRole.MELEE, back, makeRng(1));

    expect(target.row).toBe(Row.BACK);
  });
});

describe('re-stocking', () => {
  // @spec ENEMY-STOCK-001
  // @spec ENEMY-STOCK-002
  it('answers with bands and where they stand, and with nothing about construction', () => {
    const rooms = [{ x: 1, y: 1, width: 3, height: 3 }, { x: 6, y: 6, width: 3, height: 3 }];

    const occupants = occupantsFor({ floorId: 'f1', rooms, rng: makeRng(4), count: 2 });

    expect(occupants).toHaveLength(2);
    for (const occupant of occupants) {
      expect(occupant.band.members.length).toBeGreaterThan(0);
      expect(typeof occupant.x).toBe('number');
      expect(typeof occupant.y).toBe('number');
      // Nothing here describes the floor itself.
      expect(occupant).not.toHaveProperty('edges');
      expect(occupant).not.toHaveProperty('traps');
      expect(occupant).not.toHaveProperty('feature');
    }
  });
});
