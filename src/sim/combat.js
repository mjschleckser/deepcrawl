/**
 * Combat: party against party, in rows, outside the clock.
 *
 * Reach is the hard rule everything else follows from — melee cannot touch a back row
 * while a conscious front rank stands. Attacks resolve into four bands rather than
 * two, so an unfavourable matchup costs damage rather than a turn.
 */

import { Attribute, Condition, Row, applyDamage, character, roster } from './party.js';

export const Band = { MISS: 'MISS', GRAZE: 'GRAZE', HIT: 'HIT', CRIT: 'CRIT' };

export const Action = {
  ATTACK: 'ATTACK', CAST: 'CAST', ABILITY: 'ABILITY',
  SWAP: 'SWAP', RELIGHT: 'RELIGHT', DEFEND: 'DEFEND',
};

export const Outcome = {
  ONGOING: 'ONGOING', VICTORY: 'VICTORY', DEFEAT: 'DEFEAT', ESCAPED: 'ESCAPED',
};

/**
 * Band thresholds on `roll + accuracy - defence`. Content data in waiting; what the
 * design fixes is their shape — a narrow miss, a wide middle, and a distant crit.
 */
export const BANDS = { graze: 15, hit: 50, crit: 100 };

/** A landed blow is never worth nothing; that is what the miss band is for. */
export const MIN_DAMAGE_FRACTION = 0.05;

export const GRAZE_MULTIPLIER = 0.5;
export const CRIT_MULTIPLIER = 1.5;

/** A swarm is a shape the game can express, not an unbounded number. */
export const MAX_ENEMY_ROW = 10;

/** Fleeing fails against something more than a quarter faster than the hindmost. */
export const FLEE_SPEED_RATIO = 1.25;

export const DARK_ACCURACY_PENALTY = 40;

/**
 * A full bar of readiness: what a combatant fills before they act, and what an action
 * costs them. A round is not a unit here; this is.
 *
 * @spec COMBAT-TIME-005
 */
export const FULL_BAR = 100;

/**
 * Speed is Dexterity undisguised, with a floor of one so that nothing is ever frozen
 * out of its own fight.
 *
 * @spec COMBAT-TIME-001
 * @spec COMBAT-TIME-002
 */
export function speedOf(dexterity) {
  return Math.max(1, dexterity);
}

/**
 * What an action takes off the bar. Carried on the action rather than fixed here, so a
 * heavy weapon can come to cost more without the economy being rebuilt around it.
 *
 * @spec COMBAT-TIME-007
 */
export function actionCost(action) {
  return action?.cost ?? FULL_BAR;
}

/**
 * One roll decides both whether an attack landed and how well.
 *
 * @spec COMBAT-ATTACK-001
 * @spec COMBAT-ATTACK-002
 * @spec COMBAT-ATTACK-006
 */
export function attackBand(roll, accuracyMinusDefence) {
  const outcome = roll + accuracyMinusDefence;
  if (outcome >= BANDS.crit) return Band.CRIT;
  if (outcome >= BANDS.hit) return Band.HIT;
  if (outcome >= BANDS.graze) return Band.GRAZE;
  return Band.MISS;
}

/**
 * @spec COMBAT-ATTACK-003
 * @spec COMBAT-ATTACK-004
 * @spec COMBAT-ATTACK-005
 */
export function damageFor(band, baseDamage, armour) {
  if (band === Band.MISS) return 0;

  const multiplier =
    band === Band.GRAZE ? GRAZE_MULTIPLIER : band === Band.CRIT ? CRIT_MULTIPLIER : 1;
  const reduced = baseDamage * multiplier - armour;
  // Heavy armour can crush a blow down to almost nothing, but a blow that connected
  // is never worth nothing.
  const floor = Math.max(1, Math.ceil(baseDamage * MIN_DAMAGE_FRACTION));
  return Math.max(floor, Math.round(reduced));
}

export function createEnemy({ id, name, row = Row.FRONT, hitPoints = 10, dexterity = 10, potValue = 10, accuracy = 0, armour = 0, forbidsEscape = false }) {
  return { id, name, row, hitPoints, maxHitPoints: hitPoints, dexterity, potValue, accuracy, armour, forbidsEscape, condition: Condition.OK };
}

/**
 * @spec COMBAT-ENEMY-001
 * @spec COMBAT-ENEMY-002
 * @spec COMBAT-ENEMY-003
 */
export function createEnemyGroup(enemies) {
  const members = [];
  const counts = { [Row.FRONT]: 0, [Row.BACK]: 0 };
  for (const enemy of enemies) {
    // Uncapped in total, but a row holds only so many bodies.
    if (counts[enemy.row] >= MAX_ENEMY_ROW) continue;
    counts[enemy.row] += 1;
    members.push(enemy);
  }
  return { members };
}

const enemyStanding = (e) => e.condition === Condition.OK && e.hitPoints > 0;

/**
 * @spec COMBAT-SURPRISE-001
 * @spec COMBAT-SURPRISE-002
 * @spec COMBAT-DARK-001
 * @spec COMBAT-DARK-002
 * @spec COMBAT-DARK-003
 */
export function beginEncounter({ party, enemies, light, awareness, rng, origin }) {
  const dark = light === 'DARK';

  let surprisedSide = null;
  if (awareness.party && !awareness.enemies) surprisedSide = 'ENEMIES';
  if (!awareness.party && awareness.enemies) surprisedSide = 'PARTY';

  const state = {
    party,
    enemies,
    light,
    origin,
    rng,
    surprisedSide,
    // Kept, not just consumed: who knew what is worth telling the player.
    awareness: { ...awareness },
    // Fighting blind is possible and awful: the party swings wildly at whatever is in
    // front of it.
    accuracyPenalty: dark ? DARK_ACCURACY_PENALTY : 0,
    deliberateTargeting: !dark,
    // Light never helps the enemy. It only lets the party fight properly.
    enemyAccuracyBonus: 0,
    // How full each combatant's bar is, by id. The fight's own clock, in beats, is
    // beside it; neither has anything to do with the exploration clock, which is
    // stopped for the whole encounter.
    readiness: new Map(),
    beats: 0,
    skillsUsed: new Set(),
    skillsByActor: new Map(),
    escaped: false,
    potBanked: 0,
  };

  // Catching somebody unready is a head start on the bar rather than a free round, so
  // a quick ambusher gets more out of an ambush than a sluggish one does.
  // @spec COMBAT-SURPRISE-001
  // @spec COMBAT-SURPRISE-002
  for (const combatant of combatants(state)) {
    const ready = surprisedSide !== null && combatant.side !== surprisedSide;
    state.readiness.set(combatant.id, ready ? FULL_BAR : 0);
  }

  return state;
}

function combatants(state) {
  const party = roster(state.party)
    .filter((c) => c.condition === Condition.OK)
    .map((c, index) => ({
      id: c.id, side: 'PARTY', row: c.row, order: index,
      dexterity: c.attributes[Attribute.DEXTERITY],
    }));
  const foes = state.enemies.members
    .filter(enemyStanding)
    .map((e, index) => ({ id: e.id, side: 'ENEMIES', row: e.row, order: index, dexterity: e.dexterity }));
  return [...party, ...foes];
}

/**
 * Who goes first among combatants ready together: descending Dexterity, ties to the
 * party, ties within the party by position. Equal candidates for a target are settled
 * by this same order, so a seeded fight picks the same one every time.
 *
 * @spec COMBAT-TIME-008
 */
export function actingOrder(state) {
  return combatants(state).sort((a, b) => {
    if (b.dexterity !== a.dexterity) return b.dexterity - a.dexterity;
    if (a.side !== b.side) return a.side === 'PARTY' ? -1 : 1;
    return a.order - b.order;
  });
}

const ableIds = (state) => new Set(combatants(state).map((c) => c.id));

/**
 * How full a combatant's bar is. Somebody who cannot act has no readiness at all, and
 * whatever they had banked is dropped rather than held for their return.
 *
 * @spec COMBAT-TIME-013
 * @spec COMBAT-TIME-014
 */
export function readinessOf(state, id) {
  if (!ableIds(state).has(id)) {
    state.readiness.delete(id);
    return 0;
  }
  return state.readiness.get(id) ?? 0;
}

/**
 * Run the fight's own time on. Nothing recovers because a beat has passed: a bar that
 * fills with time is exactly the mechanism that invites a party to stall, and there is
 * nothing here to stall for.
 *
 * @spec COMBAT-TIME-001
 * @spec COMBAT-TIME-011
 * @spec COMBAT-TIME-014
 */
export function advanceBeats(state, beats = 1) {
  for (let beat = 0; beat < beats; beat++) {
    const able = combatants(state);
    for (const id of [...state.readiness.keys()]) {
      if (!able.some((c) => c.id === id)) state.readiness.delete(id);
    }
    for (const combatant of able) {
      const filled = (state.readiness.get(combatant.id) ?? 0) + speedOf(combatant.dexterity);
      state.readiness.set(combatant.id, filled);
    }
    state.beats += 1;
  }
  return state.beats;
}

const readyNow = (state) =>
  actingOrder(state).filter((c) => readinessOf(state, c.id) >= FULL_BAR);

/**
 * Whoever acts next, running the fight's time on until somebody is ready and no
 * further. The same combatant is returned until they have taken their turn, because a
 * turn is not over until its action is.
 *
 * @spec COMBAT-TIME-003
 * @spec COMBAT-TIME-005
 * @spec COMBAT-TIME-009
 */
export function nextActor(state) {
  if (encounterOutcome(state).outcome !== Outcome.ONGOING) return null;

  while (readyNow(state).length === 0) {
    if (combatants(state).length === 0) return null;
    advanceBeats(state, 1);
  }
  return readyNow(state)[0];
}

/** @spec COMBAT-REACH-003 */
export function frontRowHolds(party) {
  return roster(party).some((c) => c.row === Row.FRONT && c.condition === Condition.OK);
}

function enemyFrontHolds(state) {
  return state.enemies.members.some((e) => e.row === Row.FRONT && enemyStanding(e));
}

function sideOf(state, actorId) {
  return character(state.party, actorId) ? 'PARTY' : 'ENEMIES';
}

function opposingTargets(state, actorId) {
  return sideOf(state, actorId) === 'PARTY'
    ? state.enemies.members.filter(enemyStanding)
    : roster(state.party).filter((c) => c.condition === Condition.OK);
}

function frontHoldsFor(state, side) {
  return side === 'PARTY' ? frontRowHolds(state.party) : enemyFrontHolds(state);
}

/**
 * Melee reaches the front row only, while a conscious character stands in it. A body
 * shields nobody, so the line falls the moment its last upright member does.
 *
 * @spec COMBAT-REACH-001
 * @spec COMBAT-REACH-002
 * @spec COMBAT-REACH-004
 * @spec COMBAT-ENEMY-004
 */
export function meleeTargets(state, actorId, { reaching = false } = {}) {
  const side = sideOf(state, actorId);
  const actor = side === 'PARTY' ? character(state.party, actorId) : state.enemies.members.find((e) => e.id === actorId);
  if (!actor) return [];

  // A back-row attacker needs a weapon that reaches to swing at all.
  if (actor.row === Row.BACK && !reaching) return [];

  const defenders = opposingTargets(state, actorId);
  const defendingSide = side === 'PARTY' ? 'ENEMIES' : 'PARTY';
  if (!frontHoldsFor(state, defendingSide)) return defenders;
  return defenders.filter((t) => t.row === Row.FRONT);
}

/** @spec COMBAT-REACH-005 */
export function rangedTargets(state, actorId) {
  return opposingTargets(state, actorId);
}

function findTarget(state, targetId) {
  const enemy = state.enemies.members.find((e) => e.id === targetId);
  if (enemy) return enemyStanding(enemy) ? enemy : null;
  const ally = character(state.party, targetId);
  return ally && ally.condition === Condition.OK ? ally : null;
}

/**
 * Take one combatant's turn: chosen and resolved in the same instant, and paid for out
 * of their bar.
 *
 * The target is found now rather than earlier, so nothing is ever aimed at something
 * already gone — which is what removes the wasted action a fight of committed rounds
 * could not avoid.
 *
 * @spec COMBAT-TIME-006
 * @spec COMBAT-TIME-009
 * @spec COMBAT-TIME-010
 * @spec COMBAT-ACTION-006
 */
export function takeAction(state, actorId, action) {
  const actor = combatants(state).find((c) => c.id === actorId);
  if (!actor) return null;

  state.readiness.set(actorId, readinessOf(state, actorId) - actionCost(action));

  if (action.skill) {
    state.skillsUsed.add(action.skill);
    const mine = state.skillsByActor.get(actorId) ?? new Set();
    mine.add(action.skill);
    state.skillsByActor.set(actorId, mine);
  }

  if (action.kind !== Action.ATTACK) {
    return { actorId, action: action.kind };
  }

  const target = findTarget(state, action.targetId);
  // Nothing to swing at is nothing taken: the bar is spent, and the turn is over.
  if (!target) return { actorId, action: action.kind, targetId: null };

  const roll = state.rng.int(1, 100);
  const penalty = actor.side === 'PARTY' ? state.accuracyPenalty : 0;
  const band = attackBand(roll, (action.accuracy ?? 0) - (target.armour ?? 0) - penalty);
  const damage = damageFor(band, action.baseDamage ?? 0, target.armour ?? 0);

  let felled = false;
  if (character(state.party, target.id)) {
    // Every change to a character goes through the party's own operation.
    const wasUp = target.condition === Condition.OK;
    if (damage > 0) applyDamage(state.party, target.id, damage);
    felled = wasUp && character(state.party, target.id).condition !== Condition.OK;
  } else {
    target.hitPoints = Math.max(0, target.hitPoints - damage);
    if (target.hitPoints === 0 && target.condition === Condition.OK) {
      target.condition = Condition.DEAD;
      felled = true;
      // The pot belongs to the enemies defeated, never to how long the fight ran.
      state.potBanked += target.potValue;
    }
  }

  return { actorId, action: action.kind, targetId: target.id, band, damage, felled };
}

/**
 * One attempt for the whole party: a party does not leave anyone behind.
 *
 * @spec COMBAT-FLEE-001
 * @spec COMBAT-FLEE-002
 * @spec COMBAT-FLEE-003
 * @spec COMBAT-FLEE-004
 * @spec COMBAT-FLEE-005
 * @spec COMBAT-FLEE-006
 */
export function attemptFlee(state, actorId = null) {
  // A failed attempt costs the bar of whoever called the retreat and nothing else. A
  // party that keeps trying is a party spending its actions on the door rather than on
  // the fight, which is cost enough without a rule to enforce it.
  if (actorId) state.readiness.set(actorId, readinessOf(state, actorId) - FULL_BAR);

  if (state.enemies.members.filter(enemyStanding).some((e) => e.forbidsEscape)) {
    return { escaped: false };
  }

  const standing = roster(state.party).filter((c) => c.condition === Condition.OK);
  // A party flees no faster than whoever is hindmost.
  const hindmost = Math.min(...standing.map((c) => c.attributes[Attribute.DEXTERITY]));
  const fastest = Math.max(...state.enemies.members.filter(enemyStanding).map((e) => e.dexterity));

  if (fastest > hindmost * FLEE_SPEED_RATIO) return { escaped: false };

  state.escaped = true;
  return { escaped: true, returnTo: state.origin };
}

/**
 * @spec COMBAT-END-001
 * @spec COMBAT-END-002
 * @spec COMBAT-END-003
 * @spec COMBAT-END-004
 * @spec COMBAT-END-005
 * @spec COMBAT-END-006
 */
export function encounterOutcome(state) {
  if (state.escaped) return { outcome: Outcome.ESCAPED, returnTo: state.origin };

  const partyStanding = roster(state.party).some((c) => c.condition === Condition.OK);
  if (!partyStanding) {
    // The delve ends where it ended. The party stays exactly as the fight left them,
    // to be abandoned or recovered by a party that has not been hired yet.
    return { outcome: Outcome.DEFEAT, fellAt: state.origin };
  }

  if (!state.enemies.members.some(enemyStanding)) {
    return {
      outcome: Outcome.VICTORY,
      pot: state.potBanked,
      skillsUsed: [...state.skillsUsed],
      // Per actor, so a character advances the skills they used rather than the
      // party's whole repertoire.
      skillsByActor: new Map([...state.skillsByActor].map(([id, set]) => [id, [...set]])),
    };
  }

  return { outcome: Outcome.ONGOING };
}
