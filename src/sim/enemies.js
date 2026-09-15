/**
 * Enemies: what lives in the dungeon, how it gathers, and how it moves before anyone
 * fights it.
 *
 * The roster is data. Nothing here knows what a goblin is — which is what lets the
 * dungeon grow without the machinery moving.
 */

import { Row } from './party.js';
import { MAX_ENEMY_ROW } from './combat.js';
import { hasLineOfSight } from './sight.js';
import { STEP_DELTA, Direction, EdgeKind, contains, getEdge, isEdgeOpen } from './floor.js';
import { makeRng } from './rng.js';

export const EnemyRole = { MELEE: 'MELEE', RANGED: 'RANGED', CASTER: 'CASTER' };

/**
 * The first floor's inhabitants. Plain data: an author adds a monster by adding a row.
 */
export const ROSTER = {
  GOBLIN: {
    id: 'GOBLIN', name: 'Goblin', role: EnemyRole.MELEE, row: Row.FRONT,
    hitPoints: 9, dexterity: 11, accuracy: 24, armour: 2, potValue: 14, forbidsEscape: false,
  },
  GOBLIN_ARCHER: {
    id: 'GOBLIN_ARCHER', name: 'Goblin Archer', role: EnemyRole.RANGED, row: Row.BACK,
    hitPoints: 7, dexterity: 13, accuracy: 30, armour: 1, potValue: 18, forbidsEscape: false,
  },
  GOBLIN_MAGE: {
    id: 'GOBLIN_MAGE', name: 'Goblin Mage', role: EnemyRole.CASTER, row: Row.BACK,
    hitPoints: 6, dexterity: 10, accuracy: 34, armour: 0, potValue: 24, forbidsEscape: false,
  },
};

export const BANDS = {
  GOBLIN_WARBAND: {
    name: 'Goblin Warband',
    members: [{ enemy: 'GOBLIN', min: 2, max: 4 }],
  },
};

/** How far a roamer notices the party, regardless of light. */
export const NOTICE_RANGE = 4;

/** Ticks of certainty a roamer holds after losing sight of the party. */
export const AWARENESS_TICKS = 40;

/** Bounds on how long anything takes to cross a tile. */
export const MIN_CROSSING = 5;
export const MAX_CROSSING = 10;

/** Tries at finding a tile for a band before its placement is given up on. */
export const PLACEMENT_ATTEMPTS = 8;

/** Share of a ranged enemy's choices that fall on the back row. */
export const BACK_ROW_WEIGHT = 0.25;

/**
 * Ticks to cross one tile, from Dexterity. Quicker is cheaper, bounded at both ends so
 * nothing is ever twice the speed of anything else.
 *
 * @spec ENEMY-MOVE-001
 */
export function crossingCost(dexterity) {
  const span = MAX_CROSSING - MIN_CROSSING;
  const scaled = MAX_CROSSING - Math.round(((dexterity - 6) / 12) * span);
  return Math.min(MAX_CROSSING, Math.max(MIN_CROSSING, scaled));
}

export function noticeRange() {
  return NOTICE_RANGE;
}

/**
 * Build a group from a template, placing each member in its preferred row while there
 * is space.
 *
 * @spec ENEMY-BAND-001
 * @spec ENEMY-BAND-002
 * @spec ENEMY-BAND-003
 * @spec ENEMY-BAND-004
 * @spec ENEMY-BAND-005
 * @spec ENEMY-BAND-006
 * @spec ENEMY-ROSTER-003
 */
export function assembleBand(template, rng, { rowLimit = MAX_ENEMY_ROW } = {}) {
  const members = [];
  const filled = { [Row.FRONT]: 0, [Row.BACK]: 0 };

  for (const entry of template.members) {
    const count = rng.int(entry.min, entry.max);
    for (let i = 0; i < count; i++) {
      const definition = ROSTER[entry.enemy];
      const other = definition.row === Row.FRONT ? Row.BACK : Row.FRONT;
      // Preferred row first; the other when it is full. Role does not follow it there.
      const row = filled[definition.row] < rowLimit ? definition.row
        : filled[other] < rowLimit ? other : null;
      if (row === null) continue;

      filled[row] += 1;
      members.push({ ...definition, row, instanceId: `${definition.id}-${members.length}` });
    }
  }
  return { name: template.name, members };
}

/**
 * @spec ENEMY-ROSTER-001
 */
export function createRoamer({ id, floorId, x, y, band, dexterity = 10, rng = makeRng(1) }) {
  return {
    id, floorId, x, y, band, dexterity,
    crossing: crossingCost(dexterity),
    banked: 0,
    awareness: 0,
    rng,
    contacted: false,
  };
}

export const awarenessOf = (roamer) => roamer.awareness;
export const isAware = (roamer) => roamer.awareness > 0;

/**
 * An escape breaks the chase: the roamer no longer knows where the party went.
 *
 * @spec ENEMY-AWARE-007
 */
export function forgetParty(roamer) {
  return { ...roamer, awareness: 0 };
}

/**
 * Whether a roamer can see the party. A roamer knows no secret doors, so a party that
 * ducks behind one is genuinely hidden.
 *
 * @spec ENEMY-AWARE-006
 */
export function roamerSees(roamer, floor, party) {
  return hasLineOfSight(new Set(), floor, { x: roamer.x, y: roamer.y }, party);
}

const chebyshev = (a, b) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));

/**
 * What stops a roamer. It knows no secret doors, so a party that ducks behind one is
 * genuinely hidden rather than merely inconvenienced.
 *
 * @spec ENEMY-MOVE-007
 */
function blocksRoamer(floor, x, y, direction) {
  const kind = getEdge(floor, x, y, direction);
  if (kind === EdgeKind.WALL || kind === EdgeKind.SECRET_DOOR) return true;
  if (kind === EdgeKind.DOOR || kind === EdgeKind.LOCKED_DOOR) {
    return !isEdgeOpen(floor, x, y, direction);
  }
  return false;
}

function stepToward(roamer, floor, party, blocked) {
  // Close the larger gap first; it makes a pursuer read as heading for you.
  const dx = Math.sign(party.x - roamer.x);
  const dy = Math.sign(party.y - roamer.y);
  const preferred = Math.abs(party.x - roamer.x) >= Math.abs(party.y - roamer.y)
    ? [dx !== 0 && (dx > 0 ? Direction.EAST : Direction.WEST), dy !== 0 && (dy > 0 ? Direction.SOUTH : Direction.NORTH)]
    : [dy !== 0 && (dy > 0 ? Direction.SOUTH : Direction.NORTH), dx !== 0 && (dx > 0 ? Direction.EAST : Direction.WEST)];

  for (const direction of preferred) {
    if (!direction) continue;
    if (blocked(roamer.x, roamer.y, direction)) continue;
    const { dx: sx, dy: sy } = STEP_DELTA[direction];
    if (!contains(floor, roamer.x + sx, roamer.y + sy)) continue;
    return { x: roamer.x + sx, y: roamer.y + sy };
  }
  return null;
}

function stepAdrift(roamer, floor, blocked, avoid = null) {
  const directions = roamer.rng.shuffle(Object.values(Direction));
  for (const direction of directions) {
    if (blocked(roamer.x, roamer.y, direction)) continue;
    const { dx, dy } = STEP_DELTA[direction];
    const to = { x: roamer.x + dx, y: roamer.y + dy };
    if (!contains(floor, to.x, to.y)) continue;
    if (avoid && to.x === avoid.x && to.y === avoid.y) continue;
    return to;
  }
  return null;
}

/**
 * Move a roamer off the tile the party is on, to any tile beside it that it could
 * travel to. Nothing shares a tile with the party, and a placement made before the
 * party's own tile was settled is the one case that has to be corrected rather than
 * prevented.
 *
 * @spec ENEMY-CONTACT-006
 */
export function giveGround(roamer, floor, party) {
  if (roamer.x !== party.x || roamer.y !== party.y) return roamer;
  const aside = stepAdrift(roamer, floor, (x, y, d) => blocksRoamer(floor, x, y, d), party);
  return aside ? { ...roamer, x: aside.x, y: aside.y } : roamer;
}

/**
 * Hand a roamer the ticks a party's step consumed, and let it spend them.
 *
 * Nothing moves once per party step. A roamer quicker than the party moves more than
 * once; a slower one waits through several, which is what lets a fast party outrun a
 * slow pursuer rather than merely staying ahead of it.
 *
 * @spec ENEMY-AWARE-001
 * @spec ENEMY-AWARE-002
 * @spec ENEMY-AWARE-003
 * @spec ENEMY-AWARE-004
 * @spec ENEMY-AWARE-005
 * @spec ENEMY-MOVE-002
 * @spec ENEMY-MOVE-003
 * @spec ENEMY-MOVE-004
 * @spec ENEMY-MOVE-005
 * @spec ENEMY-MOVE-006
 * @spec ENEMY-MOVE-007
 * @spec ENEMY-MOVE-008
 * @spec ENEMY-CONTACT-001
 * @spec ENEMY-CONTACT-002
 * @spec ENEMY-CONTACT-004
 * @spec ENEMY-CONTACT-005
 */
export function giveTicks(roamer, ticks, { floor, party }) {
  const blocked = (x, y, direction) => blocksRoamer(floor, x, y, direction);

  const next = { ...roamer, contacted: false };

  // Proximity alone: a torch neither attracts a goblin nor hides the party from one.
  if (chebyshev(next, party) <= NOTICE_RANGE) {
    next.awareness = AWARENESS_TICKS;
  } else if (roamerSees(next, floor, party) && next.awareness > 0) {
    // Certainty does not run down while they are being watched.
    next.awareness = AWARENESS_TICKS;
  } else {
    next.awareness = Math.max(0, next.awareness - ticks);
  }

  next.banked += ticks;

  // The party may have arrived on top of the roamer by a route they could not refuse —
  // a pit, or a stair. Nothing shares a tile with the party, so the band gives ground,
  // and the arrival is contact.
  if (next.x === party.x && next.y === party.y) {
    next.contacted = true;
    const aside = stepAdrift(next, floor, blocked, party);
    if (aside) {
      next.x = aside.x;
      next.y = aside.y;
    }
    return next;
  }

  while (next.banked >= next.crossing) {
    next.banked -= next.crossing;
    const destination = isAware(next)
      ? stepToward(next, floor, party, blocked)
      : stepAdrift(next, floor, blocked);
    if (!destination) break;

    // Reaching the party is the encounter, not a tile to stand on. Holding the ground
    // it already had is what lets a party outwalk anything no quicker than they are:
    // a pursuer spends its ticks arriving where they last stood, never on them.
    if (destination.x === party.x && destination.y === party.y) {
      next.contacted = true;
      break;
    }

    next.x = destination.x;
    next.y = destination.y;
  }

  return next;
}

/**
 * Choose something legal to attack, preferring the front rank.
 *
 * @spec ENEMY-FIGHT-001
 * @spec ENEMY-FIGHT-002
 * @spec ENEMY-FIGHT-003
 */
export function selectEnemyTarget(role, candidates, rng) {
  const front = candidates.filter((c) => c.row === Row.FRONT);
  const back = candidates.filter((c) => c.row === Row.BACK);

  // Melee cannot reach past a standing front rank at all.
  if (role === EnemyRole.MELEE) {
    const reachable = front.length > 0 ? front : back;
    return rng.pick(reachable);
  }

  // Reach past it, but usually do not bother.
  if (front.length === 0) return rng.pick(back);
  if (back.length > 0 && rng.chance(BACK_ROW_WEIGHT)) return rng.pick(back);
  return rng.pick(front);
}

/**
 * What refills a floor's rooms. Occupants only — never a word about construction.
 *
 * @spec ENEMY-STOCK-001
 * @spec ENEMY-STOCK-002
 * @spec ENEMY-CONTACT-006
 */
export function occupantsFor({ floorId, rooms, rng, count, avoid = null }) {
  const occupants = [];
  for (let i = 0; i < count && rooms.length > 0; i++) {
    let tile = null;
    // Nothing is placed where the party stands, so a floor re-stocking around them
    // cannot hand back a band already on top of them.
    for (let attempt = 0; attempt < PLACEMENT_ATTEMPTS && tile === null; attempt++) {
      const room = rng.pick(rooms);
      const candidate = {
        x: room.x + rng.int(0, room.width - 1),
        y: room.y + rng.int(0, room.height - 1),
      };
      if (!avoid || candidate.x !== avoid.x || candidate.y !== avoid.y) tile = candidate;
    }
    if (!tile) continue;

    occupants.push({
      id: `${floorId}-roamer-${i}`,
      floorId,
      ...tile,
      band: assembleBand(BANDS.GOBLIN_WARBAND, rng),
    });
  }
  return occupants;
}
