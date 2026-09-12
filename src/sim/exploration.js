/**
 * The exploration segment: where the party is, which way it faces, and the passage of
 * time. Simulation core — no renderer, no DOM.
 *
 * Adjacent segments (traps, roaming enemies, hunger, camp, combat) arrive as hooks.
 * This module decides *when* they fire and what they may read; their rules are theirs.
 */

import {
  Direction,
  EdgeKind,
  LightLevel,
  TileFeature,
  FACINGS,
  STEP_DELTA,
  contains,
  edgeDetail,
  edgeKey,
  getEdge,
  getTile,
  isStairs,
  openEdge,
} from './floor.js';
import {
  brighter,
  detectionAt,
  enemiesVisibleAt,
  projectedLevel,
  tileDistance,
} from './light.js';
import {
  computeSight as runSight,
  isEdgeKnown,
  isTileDiscovered,
  isTrapKnown,
  recordTrapDetected,
} from './sight.js';

import { buildAutomapView } from './automap.js';
import { serialize as serializeState, restore } from './persistence.js';

export { enemiesVisibleAt, detectionAt } from './light.js';
export { SAVE_VERSION } from './persistence.js';
export { isTileDiscovered, isEdgeKnown, isTrapKnown, recordTrapDetected } from './sight.js';

export const Verb = {
  STEP_FORWARD: 'STEP_FORWARD',
  TURN_LEFT: 'TURN_LEFT',
  TURN_RIGHT: 'TURN_RIGHT',
  TURN_AROUND: 'TURN_AROUND',
};

export const PartyAction = {
  PARTY: 'PARTY',
  INVENTORY: 'INVENTORY',
  SPELLS: 'SPELLS',
  SEARCH: 'SEARCH',
  INTERACT: 'INTERACT',
  TOGGLE_MAP: 'TOGGLE_MAP',
};

export const StepEvent = {
  MOVED: 'MOVED',
  CLOCK_ADVANCED: 'CLOCK_ADVANCED',
  FEATURE_RESOLVED: 'FEATURE_RESOLVED',
  RESTOCKED: 'RESTOCKED',
  TRAP_TRIGGERED: 'TRAP_TRIGGERED',
  SIGHT_RECOMPUTED: 'SIGHT_RECOMPUTED',
  ROAMERS_MOVED: 'ROAMERS_MOVED',
  CONTACT_CHECKED: 'CONTACT_CHECKED',
};

/**
 * Ticks of absence below which a return does not re-stock. Belongs in content data
 * once content data exists; it is a knob, not a rule.
 */
export const DEFAULT_RESTOCK_MIN_ELAPSED_TICKS = 1;

const NO_HOOKS = {
  onTick: () => {},
  onTrapTrigger: () => {},
  onTrapDetect: () => {},
  onRoamersMove: () => {},
  onRestock: () => {},
  onContactCheck: () => {},
  onSight: () => {},
  onPartyAction: () => {},
};

export function createExploration({
  floors,
  floorId,
  tile,
  facing = Direction.NORTH,
  hooks = {},
  keys = [],
  lightSources = [],
  roamers = [],
  restockMinElapsedTicks = DEFAULT_RESTOCK_MIN_ELAPSED_TICKS,
}) {
  const state = {
    floors: new Map(floors.map((f) => [f.id, f])),
    party: { floorId, tile: { ...tile }, facing },
    keys: [...keys],
    hooks: { ...NO_HOOKS, ...hooks },
    restockMinElapsedTicks,
    combatActive: false,
    menuOpen: false,
    discoveredEdges: new Set(),
    discoveredTiles: new Map(),
    knownTraps: new Map(),
    // Only ever one of these is lit; the rest wait their turn in the pack.
    lightSources: lightSources.map((source) => ({ ...source })),
    // Positions are owned by the roaming-enemy segment; exploration only reads them.
    roamers: roamers.map((roamer) => ({ ...roamer })),
    dousedSourceId: null,
    camped: false,
    litBeforeCamp: null,
    // floorId -> tick at which the party last left it
    departedAt: new Map(),
    pendingConfirmation: null,
    // A pit the party was dropped onto without resolving; it claims the next step.
    pendingFall: null,
  };

  // The tick counter is readable by everyone and writable by no one. Camp advances
  // time by asking, not by assignment.
  let ticks = 0;
  Object.defineProperty(state, 'ticks', {
    get: () => ticks,
    enumerable: true,
    configurable: false,
  });
  state._advanceTicks = (n) => {
    ticks += n;
  };

  // At most one source burns at a time, however many arrive lit.
  enforceSingleFlame(state);

  return state;
}

/** @spec EXPLORE-LIGHT-006 */
function enforceSingleFlame(state) {
  let found = false;
  for (const source of state.lightSources) {
    if (source.lit && !source.spent && !found) {
      found = true;
    } else {
      source.lit = false;
    }
  }
}

export function lightSources(state) {
  return state.lightSources;
}

/** @spec EXPLORE-LIGHT-006 */
export function litSource(state) {
  return state.lightSources.find((source) => source.lit) ?? null;
}

export function addLightSource(state, source) {
  state.lightSources.push({ ...source });
  enforceSingleFlame(state);
}

/**
 * Burn the lit source down, and hand off to the next when it is spent.
 *
 * Burnout relights automatically because a party that must re-light by hand every few
 * dozen paces is being charged friction, not tension.
 *
 * @spec EXPLORE-LIGHT-007
 * @spec EXPLORE-LIGHT-008
 */
function burnLight(state, ticks) {
  const source = litSource(state);
  if (!source || source.remainingTicks === null) return;

  source.remainingTicks = Math.max(0, source.remainingTicks - ticks);
  if (source.remainingTicks > 0) return;

  source.spent = true;
  source.lit = false;
  const spare = state.lightSources.find((s) => !s.spent && s.remainingTicks !== 0);
  if (spare) spare.lit = true;
}

/**
 * Put the party's light out from the outside — a water attack, say. Deliberately does
 * not reach for a spare: that is the difference between a torch burning out and one
 * being put out, and it is what makes dousing worth an attack.
 *
 * @spec EXPLORE-LIGHT-009
 */
export function douseLight(state) {
  const source = litSource(state);
  if (!source) return null;
  source.lit = false;
  state.dousedSourceId = source.id;
  return source;
}

/**
 * Relight the same instance that was doused, fuel intact.
 *
 * @spec EXPLORE-LIGHT-013
 */
function relightSource(state) {
  const doused = state.lightSources.find(
    (s) => s.id === state.dousedSourceId && !s.spent,
  );
  const source = doused ?? state.lightSources.find((s) => !s.spent);
  if (!source) return null;
  source.lit = true;
  state.dousedSourceId = null;
  enforceSingleFlame(state);
  return source;
}

/**
 * A camp has a fire of its own, so carried light is put out for the duration and the
 * ticks a camp consumes do not burn it.
 *
 * @spec EXPLORE-LIGHT-014
 */
export function enterCamp(state) {
  const source = litSource(state);
  state.litBeforeCamp = source ? source.id : null;
  for (const s of state.lightSources) s.lit = false;
  state.camped = true;
}

/** @spec EXPLORE-LIGHT-015 */
export function breakCamp(state) {
  state.camped = false;
  const previous = state.lightSources.find(
    (s) => s.id === state.litBeforeCamp && !s.spent,
  );
  if (previous) previous.lit = true;
  state.litBeforeCamp = null;
  enforceSingleFlame(state);
}

/**
 * How far the party's own light reaches, which is as far as sight can go.
 */
function litReach(state) {
  const source = litSource(state);
  return source ? source.dimRadius : 0;
}

/**
 * A tile's light is the brighter of what the dungeon gives it and what the party
 * brings. Light is only ever an improvement.
 *
 * @spec EXPLORE-LIGHT-001
 * @spec EXPLORE-LIGHT-002
 */
export function resolveTileLight(state, x, y) {
  const floor = currentFloor(state);
  const intrinsic = getTile(floor, x, y).intrinsicLight ?? LightLevel.DARK;
  const distance = tileDistance(state.party.tile, { x, y });
  return brighter(intrinsic, projectedLevel(distance, litSource(state)));
}

/**
 * @spec EXPLORE-SIGHT-001
 * @spec EXPLORE-SIGHT-003
 */
export function computeSight(state) {
  return runSight(state, {
    resolveLight: (x, y) => resolveTileLight(state, x, y),
    litReach: () => Math.max(litReach(state), maxIntrinsicReach(state)),
    enemiesVisibleAt,
  });
}

/**
 * What the automap may draw, given everything the party has discovered.
 *
 * @spec EXPLORE-MAP-001
 * @spec EXPLORE-MAP-009
 */
export function automapView(state) {
  return buildAutomapView(state, {
    resolveLight: (x, y) => resolveTileLight(state, x, y),
    enemiesVisibleAt,
  });
}

/**
 * @spec EXPLORE-SAVE-001
 * @spec EXPLORE-SAVE-004
 */
export function serialize(state) {
  return serializeState(state);
}

/**
 * @spec EXPLORE-SAVE-002
 */
export function deserialize(saved) {
  return restore(saved, createExploration);
}

/**
 * A party with no light of its own can still see down a corridor the dungeon lights,
 * so sight cannot be bounded by the torch alone.
 */
function maxIntrinsicReach(state) {
  const floor = currentFloor(state);
  return Math.max(floor.width, floor.height);
}

export function tickCount(state) {
  return state.ticks;
}

export function partyPosition(state) {
  return {
    floorId: state.party.floorId,
    tile: { ...state.party.tile },
    facing: state.party.facing,
  };
}

export function setCombatActive(state, active) {
  state.combatActive = active;
}

export function setMenuOpen(state, open) {
  state.menuOpen = open;
}

export function currentFloor(state) {
  return state.floors.get(state.party.floorId);
}

/** Mark a secret door found, so it stops behaving as a wall. */
export function discoverEdge(state, floorId, x, y, direction) {
  const floor = state.floors.get(floorId);
  state.discoveredEdges.add(edgeKey(floor, x, y, direction));
}

function isEdgeDiscovered(state, floor, x, y, direction) {
  return state.discoveredEdges.has(edgeKey(floor, x, y, direction));
}

/**
 * Advance the clock and tell the segments that live off it.
 *
 * Combat is outside the clock entirely, so nothing accrues to the party for staying
 * in a fight longer.
 *
 * @spec EXPLORE-CLOCK-005
 * @spec EXPLORE-CLOCK-008
 * @spec EXPLORE-CLOCK-009
 * @spec EXPLORE-BOUND-006
 */
function advance(state, n) {
  if (state.combatActive || state.menuOpen || n <= 0) return 0;
  state._advanceTicks(n);
  burnLight(state, n);
  state.hooks.onTick(n);
  return n;
}

/**
 * The camp segment advances a clock it does not own.
 *
 * @spec EXPLORE-CLOCK-004
 */
export function advanceForCamp(state, ticks) {
  return advance(state, ticks);
}

/**
 * Why a step cannot be taken, or null if it can. Every blocked reason presents
 * identically to the caller, so an undiscovered secret door gives nothing away.
 *
 * @spec EXPLORE-MOVE-003
 * @spec EXPLORE-MOVE-004
 * @spec EXPLORE-MOVE-005
 */
function stepBlocked(state, floor, from, facing) {
  const { dx, dy } = STEP_DELTA[facing];
  const target = { x: from.x + dx, y: from.y + dy };
  if (!contains(floor, target.x, target.y)) return true;

  const kind = getEdge(floor, from.x, from.y, facing);
  if (kind === EdgeKind.WALL) return true;
  if (kind === EdgeKind.SECRET_DOOR && !isEdgeDiscovered(state, floor, from.x, from.y, facing)) {
    return true;
  }
  if (kind === EdgeKind.LOCKED_DOOR) {
    const { keyId } = edgeDetail(floor, from.x, from.y, facing);
    if (keyId !== undefined && !state.keys.includes(keyId)) return true;
  }
  return false;
}

/**
 * @spec EXPLORE-RETURN-001
 */
function relocate(state, target) {
  // Leaving a floor stamps it, so a later return knows how long the party was gone.
  if (target.floorId !== state.party.floorId) {
    state.departedAt.set(state.party.floorId, state.ticks);
  }
  state.party.floorId = target.floorId;
  state.party.tile = { x: target.x, y: target.y };
  // Facing survives the journey; a connector does not spin the party.
}

/**
 * Re-stock a floor the party is returning to, in proportion to its absence.
 *
 * Floors are frozen while the party is elsewhere, so the life of the dungeon is
 * restored on arrival rather than simulated in the background. Traps are exempt: they
 * are laid once at generation and the party's knowledge of them only ever grows.
 *
 * @spec EXPLORE-RETURN-003
 * @spec EXPLORE-RETURN-007
 */
function maybeRestock(state, events) {
  const departed = state.departedAt.get(state.party.floorId);
  if (departed === undefined) return;

  const elapsed = state.ticks - departed;
  if (elapsed < state.restockMinElapsedTicks) return;

  state.departedAt.delete(state.party.floorId);
  state.hooks.onRestock({ floorId: state.party.floorId, elapsed });
  events.push(StepEvent.RESTOCKED);
}

/**
 * Everything a successful step sets off, in the one order the design fixes.
 *
 * Two orderings are load-bearing. The clock advances before sight is recomputed, so a
 * light source that expires on this step is already spent when the party looks around.
 * Roamers move after discovery, so the party sees the tile as it was on arrival.
 *
 * @spec EXPLORE-MOVE-008
 * @spec EXPLORE-MOVE-010
 * @spec EXPLORE-MOVE-011
 * @spec EXPLORE-MOVE-012
 * @spec EXPLORE-BOUND-005
 */
function resolveStepEffects(state, events, { alreadyRelocated = false } = {}) {
  advance(state, 1);
  events.push(StepEvent.CLOCK_ADVANCED);

  // A pit fires the moment the party enters it, with no say in the matter.
  let relocated = alreadyRelocated;
  if (!alreadyRelocated) {
    const tile = getTile(currentFloor(state), state.party.tile.x, state.party.tile.y);
    if (tile.feature === TileFeature.PIT && tile.target) {
      relocate(state, tile.target);
      relocated = true;
    }
  }

  // Features resolve at most once per step, so a pit landed on does not chain. It
  // claims the party's next step instead.
  if (relocated) {
    const landed = getTile(currentFloor(state), state.party.tile.x, state.party.tile.y);
    if (landed.feature === TileFeature.PIT && landed.target) {
      state.pendingFall = { ...landed.target };
    }
  }
  events.push(StepEvent.FEATURE_RESOLVED);

  maybeRestock(state, events);

  // Everything downstream acts on wherever the party actually ended up.
  const here = { floorId: state.party.floorId, tile: { ...state.party.tile } };

  state.hooks.onTrapTrigger({ ...here, party: state.party });
  events.push(StepEvent.TRAP_TRIGGERED);

  computeSight(state);
  state.hooks.onSight(here);
  events.push(StepEvent.SIGHT_RECOMPUTED);

  state.hooks.onRoamersMove({ floorId: state.party.floorId });
  events.push(StepEvent.ROAMERS_MOVED);

  state.hooks.onContactCheck(here);
  events.push(StepEvent.CONTACT_CHECKED);
}

/**
 * @spec EXPLORE-MOVE-002
 */
function turn(state, verb) {
  const from = FACINGS.indexOf(state.party.facing);
  const delta = verb === Verb.TURN_LEFT ? 3 : verb === Verb.TURN_RIGHT ? 1 : 2;
  state.party.facing = FACINGS[(from + delta) % 4];
  return { blocked: false, events: [] };
}

/**
 * @spec EXPLORE-MOVE-006
 * @spec EXPLORE-MOVE-007
 * @spec EXPLORE-MOVE-009
 * @spec EXPLORE-MOVE-015
 * @spec EXPLORE-CLOCK-001
 * @spec EXPLORE-CLOCK-007
 */
function stepForward(state) {
  const floor = currentFloor(state);

  // A pit the party was dropped onto claims this step instead of it.
  if (state.pendingFall) {
    const target = state.pendingFall;
    state.pendingFall = null;
    const events = [];
    relocate(state, target);
    events.push(StepEvent.MOVED);
    resolveStepEffects(state, events, { alreadyRelocated: true });
    return { blocked: false, events };
  }

  const from = state.party.tile;
  if (stepBlocked(state, floor, from, state.party.facing)) {
    // Blocked is blocked: no movement, no tick, no side effect, and no clue about
    // which of the several reasons applied.
    return { blocked: true, events: [] };
  }

  const { dx, dy } = STEP_DELTA[state.party.facing];
  const target = { x: from.x + dx, y: from.y + dy };
  const targetTile = getTile(floor, target.x, target.y);

  // Stairs ask before they take the party anywhere, and a declined staircase is not
  // walked onto at all — so a staircase is never crossed by accident.
  if (isStairs(targetTile.feature)) {
    state.pendingConfirmation = {
      kind: 'STAIRS',
      feature: targetTile.feature,
      target: targetTile.target,
      tile: { ...target },
    };
    return { blocked: false, events: [], confirmationRequired: state.pendingConfirmation };
  }

  const edgeKind = getEdge(floor, from.x, from.y, state.party.facing);
  if (edgeKind === EdgeKind.DOOR || edgeKind === EdgeKind.LOCKED_DOOR || edgeKind === EdgeKind.SECRET_DOOR) {
    // Opening is part of the step, not a second action charged separately.
    openEdge(floor, from.x, from.y, state.party.facing);
  }

  const events = [];
  state.party.tile = target;
  events.push(StepEvent.MOVED);
  resolveStepEffects(state, events);

  return { blocked: false, events };
}

/**
 * Answer a pending prompt. Declining costs nothing and leaves the party where it was.
 *
 * @spec EXPLORE-MOVE-016
 * @spec EXPLORE-MOVE-017
 * @spec EXPLORE-MOVE-013
 */
export function resolveConfirmation(state, accepted) {
  const pending = state.pendingConfirmation;
  if (!pending) return { blocked: false, events: [] };
  state.pendingConfirmation = null;

  if (!accepted) return { blocked: false, events: [], declined: true };

  const events = [];
  relocate(state, pending.target);
  events.push(StepEvent.MOVED);
  resolveStepEffects(state, events, { alreadyRelocated: true });
  return { blocked: false, events };
}

/**
 * Everything the party can do on its current tile. Exploration owns none of these but
 * the map: it routes each to the segment that owns it and charges the clock.
 *
 * Opening a party action is free; committing to one costs a tick. A game that charges
 * for looking punishes the player for playing carefully.
 *
 * @spec EXPLORE-ACTION-001
 * @spec EXPLORE-ACTION-002
 * @spec EXPLORE-ACTION-003
 * @spec EXPLORE-ACTION-004
 * @spec EXPLORE-ACTION-005
 * @spec EXPLORE-BOUND-007
 * @spec EXPLORE-BOUND-009
 * @spec EXPLORE-CLOCK-002
 * @spec EXPLORE-MOVE-018
 */
function partyAction(state, action, commit) {
  if (action === PartyAction.INTERACT) {
    const tile = getTile(currentFloor(state), state.party.tile.x, state.party.tile.y);
    const targets =
      tile.feature === TileFeature.NONE
        ? []
        : [{ feature: tile.feature, target: tile.target, tile: { ...state.party.tile } }];
    state.hooks.onPartyAction({ action, committed: Boolean(commit), targets });
    if (commit) advance(state, 1);
    return { targets, events: [] };
  }

  state.hooks.onPartyAction({ action, committed: Boolean(commit) });

  if (action === PartyAction.SEARCH && commit) {
    const { x, y } = state.party.tile;
    state.hooks.onTrapDetect({
      floorId: state.party.floorId,
      tiles: [{ x, y, level: resolveTileLight(state, x, y) }],
      deliberate: true,
    });
  }

  // The map has nothing to commit to, so it never costs a tick.
  if (commit && action !== PartyAction.TOGGLE_MAP) advance(state, 1);

  return { events: [] };
}

/**
 * The single entry point for everything the party does during exploration.
 *
 * @spec EXPLORE-MOVE-001
 * @spec EXPLORE-ACTION-006
 * @spec EXPLORE-CLOCK-003
 * @spec EXPLORE-CLOCK-006
 * @spec EXPLORE-LIGHT-010
 */
export function perform(state, action) {
  // Exploration does not accept input during a fight; combat owns the party then.
  if (state.combatActive && (action.verb || action.partyAction)) {
    return { rejected: true, blocked: false, events: [] };
  }

  if (action.relight) {
    // A tick during exploration, a character's action during combat. Either way the
    // party pays for having its light put out.
    const source = relightSource(state);
    if (state.combatActive) {
      return { relit: Boolean(source), consumedAction: true, events: [] };
    }
    advance(state, 1);
    return { relit: Boolean(source), events: [] };
  }

  if (action.verb === Verb.STEP_FORWARD) return stepForward(state);
  if (action.verb) return turn(state, action.verb);
  if (action.partyAction) return partyAction(state, action.partyAction, action.commit);

  return { events: [] };
}
