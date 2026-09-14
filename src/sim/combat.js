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

  let surpriseRoundFor = null;
  if (awareness.party && !awareness.enemies) surpriseRoundFor = 'PARTY';
  if (!awareness.party && awareness.enemies) surpriseRoundFor = 'ENEMIES';

  return {
    party,
    enemies,
    light,
    origin,
    rng,
    surpriseRoundFor,
    // Kept, not just consumed: who knew what is worth telling the player.
    awareness: { ...awareness },
    // Fighting blind is possible and awful: the party swings wildly at whatever is in
    // front of it.
    accuracyPenalty: dark ? DARK_ACCURACY_PENALTY : 0,
    deliberateTargeting: !dark,
    // Light never helps the enemy. It only lets the party fight properly.
    enemyAccuracyBonus: 0,
    selections: new Map(),
    skillsUsed: new Set(),
    skillsByActor: new Map(),
    escaped: false,
    potBanked: 0,
  };
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
 * Descending Dexterity, ties to the party, ties within the party by position.
 *
 * @spec COMBAT-ROUND-002
 * @spec COMBAT-ROUND-003
 * @spec COMBAT-ROUND-004
 * @spec COMBAT-ROUND-005
 */
export function turnOrder(state) {
  return combatants(state).sort((a, b) => {
    if (b.dexterity !== a.dexterity) return b.dexterity - a.dexterity;
    if (a.side !== b.side) return a.side === 'PARTY' ? -1 : 1;
    return a.order - b.order;
  });
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

/** @spec COMBAT-ROUND-001 */
export function selectAction(state, actorId, selection) {
  state.selections.set(actorId, selection);
}

function findTarget(state, targetId) {
  const enemy = state.enemies.members.find((e) => e.id === targetId);
  if (enemy) return enemyStanding(enemy) ? enemy : null;
  const ally = character(state.party, targetId);
  return ally && ally.condition === Condition.OK ? ally : null;
}

/**
 * Resolve a round: every action already chosen, taken one at a time in order.
 *
 * @spec COMBAT-ROUND-001
 * @spec COMBAT-ROUND-006
 * @spec COMBAT-ROUND-007
 * @spec COMBAT-ACTION-006
 */
export function resolveRound(state) {
  const log = [];

  for (const actor of turnOrder(state)) {
    const selection = state.selections.get(actor.id);
    if (!selection) continue;

    if (selection.skill) {
      state.skillsUsed.add(selection.skill);
      const mine = state.skillsByActor.get(actor.id) ?? new Set();
      mine.add(selection.skill);
      state.skillsByActor.set(actor.id, mine);
    }

    if (selection.action !== Action.ATTACK) {
      log.push({ actorId: actor.id, action: selection.action, fizzled: false });
      continue;
    }

    const target = findTarget(state, selection.targetId);
    if (!target) {
      // Committing before you know is the cost of selecting a whole round at once.
      // The action is spent and looks for nothing else.
      log.push({ actorId: actor.id, action: selection.action, fizzled: true });
      continue;
    }

    const roll = state.rng.int(1, 100);
    const penalty = actor.side === 'PARTY' ? state.accuracyPenalty : 0;
    const band = attackBand(roll, (selection.accuracy ?? 0) - (target.armour ?? 0) - penalty);
    const damage = damageFor(band, selection.baseDamage ?? 0, target.armour ?? 0);

    if (character(state.party, target.id)) {
      // Every change to a character goes through the party's own operation.
      if (damage > 0) applyDamage(state.party, target.id, damage);
    } else {
      target.hitPoints = Math.max(0, target.hitPoints - damage);
      if (target.hitPoints === 0) {
        target.condition = Condition.DEAD;
        // The pot belongs to the enemies defeated, never to the rounds taken.
        state.potBanked += target.potValue;
      }
    }

    log.push({ actorId: actor.id, action: selection.action, band, damage, fizzled: false });
  }

  state.selections.clear();
  return log;
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
export function attemptFlee(state) {
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
