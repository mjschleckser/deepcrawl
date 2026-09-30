/**
 * Combat: party against party, with nowhere to stand, outside the clock.
 *
 * Every standing combatant is in reach of every other, so what bounds a turn is what
 * the combatant carries rather than where they are. Readiness orders the fight and an
 * action spends a full bar of it; the fight's time never moves while anybody is being
 * asked what to do.
 */

import {
  Attribute, Condition, DEFAULT_ATTRIBUTES, applyDamage, character, roster,
} from './party.js';

export const Band = { MISS: 'MISS', GRAZE: 'GRAZE', HIT: 'HIT', CRIT: 'CRIT' };

export const Action = {
  ATTACK: 'ATTACK', CAST: 'CAST', ABILITY: 'ABILITY',
  SWAP: 'SWAP', RELIGHT: 'RELIGHT', PASS: 'PASS',
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
export const MAX_ENEMY_GROUP = 20;

/**
 * How much of a bar catching somebody unready is worth. An addition rather than a
 * filled bar: surprise is decisive without being a guaranteed first blow, and it
 * composes with the opening each combatant drew rather than overriding it.
 *
 * @spec COMBAT-SURPRISE-005
 */
export const OPENING_HEAD_START = 55;

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

/**
 * An enemy is a character in every field but a class: the same attributes, the same
 * ranks, the same condition, the same attack. Class is the shape of a career, and a
 * goblin has none — so its hit points are authored rather than derived from one.
 *
 * @spec ENEMY-ROSTER-001
 * @spec ENEMY-ROSTER-003
 * @spec ENEMY-ROSTER-009
 */
export function createEnemy({
  id, name, role = EnemyRole.MELEE, attributes = {}, ranks = {},
  maxHitPoints = 10, attack = null, armour = 0, portrait = null,
  potValue = 10, forbidsEscape = false,
}) {
  return {
    id,
    name,
    role,
    attributes: { ...DEFAULT_ATTRIBUTES, ...attributes },
    ranks: { ...ranks },
    maxHitPoints,
    hitPoints: maxHitPoints,
    attack: attack ? { ...attack } : null,
    armour,
    portrait,
    potValue,
    forbidsEscape,
    condition: Condition.OK,
  };
}

/** What an enemy fights with. It says nothing about where it stands; nobody stands. */
export const EnemyRole = { MELEE: 'MELEE', RANGED: 'RANGED', CASTER: 'CASTER' };

/**
 * @spec COMBAT-ENEMY-002
 * @spec COMBAT-ENEMY-007
 */
export function createEnemyGroup(enemies) {
  // Uncapped by the party's five, but a swarm is a shape rather than a number.
  return { members: enemies.slice(0, MAX_ENEMY_GROUP) };
}

const enemyStanding = (e) => e.condition === Condition.OK && e.hitPoints > 0;

/**
 * @spec COMBAT-SURPRISE-003
 * @spec COMBAT-SURPRISE-005
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

  // Every fight opens somewhere different. A bar drawn at random means the same
  // warband met twice is not the same fight twice, and nobody is owed the first turn
  // by the order they happen to be listed in. Never a full bar: a fight opens with
  // everybody still filling, whatever else is true.
  // @spec COMBAT-SURPRISE-003
  // @spec COMBAT-SURPRISE-004
  // @spec COMBAT-SURPRISE-007
  for (const combatant of combatants(state)) {
    const drawn = rng.int(0, FULL_BAR - 1);
    // Catching somebody unready is a head start rather than a free blow, so a quick
    // ambusher still gets more out of an ambush than a sluggish one does.
    // @spec COMBAT-SURPRISE-005
    // @spec COMBAT-SURPRISE-006
    const ambushing = surprisedSide !== null && combatant.side !== surprisedSide;
    const opening = ambushing ? Math.min(FULL_BAR, drawn + OPENING_HEAD_START) : drawn;
    state.readiness.set(combatant.id, opening);
  }

  return state;
}

/**
 * Everyone still able to act, read the same way from both sides.
 *
 * @spec COMBAT-ENEMY-006
 */
function combatants(state) {
  const speed = (c) => c.attributes[Attribute.DEXTERITY];
  const party = roster(state.party)
    .filter((c) => c.condition === Condition.OK)
    .map((c, index) => ({ id: c.id, side: 'PARTY', order: index, dexterity: speed(c) }));
  const foes = state.enemies.members
    .filter(enemyStanding)
    .map((e, index) => ({ id: e.id, side: 'ENEMIES', order: index, dexterity: speed(e) }));
  return [...party, ...foes];
}

/**
 * Who goes first among combatants ready together: descending Dexterity, ties to the
 * party, ties within a side by the order it is listed in. Equal candidates for a target
 * are settled by this same order, so a seeded fight picks the same one every time.
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
 * Whoever is ready to act right now, or nobody. Unlike nextActor this never runs the
 * fight's time on, so a caller can let the bars fill at a pace of its own choosing.
 *
 * @spec COMBAT-TIME-016
 */
export function readyActor(state) {
  if (encounterOutcome(state).outcome !== Outcome.ONGOING) return null;
  return readyNow(state)[0] ?? null;
}

/**
 * How full a combatant's bar is some share of the way through the beat now filling it.
 * A report and not a beat: nothing moves, and nobody becomes ready because of it.
 *
 * @spec COMBAT-TIME-017
 */
export function readinessPartway(state, id, fraction) {
  const combatant = combatants(state).find((c) => c.id === id);
  if (!combatant) return 0;
  return readinessOf(state, id) + speedOf(combatant.dexterity) * fraction;
}

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

function sideOf(state, actorId) {
  return character(state.party, actorId) ? 'PARTY' : 'ENEMIES';
}

function opposingTargets(state, actorId) {
  return sideOf(state, actorId) === 'PARTY'
    ? state.enemies.members.filter(enemyStanding)
    : roster(state.party).filter((c) => c.condition === Condition.OK);
}

/**
 * Everyone on the other side who is still able to act. There is no position in a
 * fight, so nothing stands between an attacker and anybody they want.
 *
 * @spec COMBAT-TARGET-001
 * @spec COMBAT-TARGET-003
 * @spec COMBAT-TARGET-004
 */
export function attackTargets(state, actorId) {
  return opposingTargets(state, actorId);
}

/**
 * Everyone on the actor's own side, the actor included: a cleric alone still has
 * somebody to heal.
 *
 * @spec COMBAT-TARGET-002
 */
export function allyTargets(state, actorId) {
  return sideOf(state, actorId) === 'PARTY'
    ? roster(state.party).filter((c) => c.condition === Condition.OK)
    : state.enemies.members.filter(enemyStanding);
}

/** Whoever holds this id, on either side, whatever state they are in. */
function recordOf(state, id) {
  return character(state.party, id) ?? state.enemies.members.find((e) => e.id === id) ?? null;
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

  // A turn is chosen and struck in the same instant, so nothing a player or an enemy
  // aims at can fall before the blow lands. This guard is for a caller holding an id
  // from earlier: the target is resolved now, and a swing at somebody already gone
  // spends the bar and touches nobody else.
  // @spec COMBAT-TIME-010
  const target = findTarget(state, action.targetId);
  if (!target) return { actorId, action: action.kind, targetId: null };

  // What a blow is worth belongs to whoever swung it, on either side alike, and what
  // blunts it to whoever is struck.
  // @spec COMBAT-ACTION-008
  const swing = recordOf(state, actorId)?.attack ?? {};
  const accuracy = action.accuracy ?? swing.accuracy ?? 0;
  const baseDamage = action.baseDamage ?? swing.baseDamage ?? 0;

  const roll = state.rng.int(1, 100);
  const penalty = actor.side === 'PARTY' ? state.accuracyPenalty : 0;
  const band = attackBand(roll, accuracy - (target.armour ?? 0) - penalty);
  const damage = damageFor(band, baseDamage, target.armour ?? 0);

  let felled = false;
  if (character(state.party, target.id)) {
    // Every change to a character goes through the party's own operation.
    const wasUp = target.condition === Condition.OK;
    if (damage > 0) applyDamage(state.party, target.id, damage);
    felled = wasUp && character(state.party, target.id).condition !== Condition.OK;
  } else {
    // A fallen enemy is dead where a fallen character is unconscious: nobody is
    // coming back for a goblin.
    // @spec ENEMY-ROSTER-011
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
/**
 * Whether an escape is already lost, by the same rules that resolve one.
 *
 * Asked before a turn is spent, so the option can be greyed rather than offered and
 * charged for. It reads the fight and changes nothing.
 *
 * @spec COMBAT-TURN-005
 */
export function fleeCertainToFail(state) {
  const foes = state.enemies.members.filter(enemyStanding);
  if (foes.length === 0) return false;
  if (foes.some((e) => e.forbidsEscape)) return true;

  const standing = roster(state.party).filter((c) => c.condition === Condition.OK);
  if (standing.length === 0) return false;

  // A party flees no faster than whoever is hindmost.
  const hindmost = Math.min(...standing.map((c) => c.attributes[Attribute.DEXTERITY]));
  const fastest = Math.max(...foes.map((e) => e.attributes[Attribute.DEXTERITY]));
  return fastest > hindmost * FLEE_SPEED_RATIO;
}

export function attemptFlee(state, actorId = null) {
  // A failed attempt costs the bar of whoever called the retreat and nothing else. A
  // party that keeps trying is a party spending its actions on the door rather than on
  // the fight, which is cost enough without a rule to enforce it.
  if (actorId) state.readiness.set(actorId, readinessOf(state, actorId) - FULL_BAR);

  // One rule, asked here and asked again by whatever drew the button, so the two can
  // never disagree about whether the way out is shut.
  if (fleeCertainToFail(state)) return { escaped: false };

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
