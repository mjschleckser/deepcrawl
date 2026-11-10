/**
 * Combat: party against party, with nowhere to stand, outside the clock.
 *
 * Every standing combatant is in reach of every other, so what bounds a turn is what
 * the combatant carries rather than where they are. Readiness orders the fight and an
 * action spends a full bar of it; the fight's time never moves while anybody is being
 * asked what to do.
 */

import {
  Attribute, Condition, DEFAULT_ATTRIBUTES, Skill, applyDamage, backstabMultiplier, character, equip,
  roster, skillRank, useItem,
} from './party.js';
import { mergeFinds, rollLoot } from './loot.js';
import { armourOf, baseDamageWith } from './items.js';
import { makeRng } from './rng.js';
import { dexterityBonus } from './food.js';
import {
  CastWhere, SpellEffect, SpellTarget, castOnAlly, castRefusal, healPreview, payForCast, spellMagnitude,
} from './magic.js';

export const Action = {
  ATTACK: 'ATTACK', CAST: 'CAST', ABILITY: 'ABILITY',
  EQUIP: 'EQUIP', USE: 'USE', PASS: 'PASS',
};

export const Outcome = {
  ONGOING: 'ONGOING', VICTORY: 'VICTORY', DEFEAT: 'DEFEAT', ESCAPED: 'ESCAPED',
};

/** A blow is never worth nothing, however heavy the armour it meets. */
export const MIN_DAMAGE_FRACTION = 0.05;

/** A swarm is a shape the game can express, not an unbounded number. */
export const MAX_ENEMY_GROUP = 20;

/** Fleeing fails against something more than a quarter faster than the hindmost. */
export const FLEE_SPEED_RATIO = 1.25;

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
 * What an attack deals. Nothing is rolled and nothing multiplies it: the attacker's
 * base damage, less the target's armour, held to a floor.
 *
 * @spec COMBAT-ATTACK-005
 * @spec COMBAT-ATTACK-015
 */
export function damageFor(baseDamage, armour) {
  // Heavy armour can crush a blow down to almost nothing, but never to nothing.
  const floor = Math.max(1, Math.ceil(baseDamage * MIN_DAMAGE_FRACTION));
  return Math.max(floor, Math.round(baseDamage - armour));
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
  potValue = 10, forbidsEscape = false, loot = null,
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
    // The loot table it drops from, by identifier, or none for an enemy with nothing on it.
    // @spec ENEMY-ROSTER-012
    loot,
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
  // Uncapped by the party's four, but a swarm is a shape rather than a number.
  return { members: enemies.slice(0, MAX_ENEMY_GROUP) };
}

const enemyStanding = (e) => e.condition === Condition.OK && e.hitPoints > 0;

/**
 * @spec COMBAT-SURPRISE-003
 * @spec COMBAT-SURPRISE-010
 */
export function beginEncounter({ party, enemies, rng, origin, lootTables = {}, spells = {} }) {
  const state = {
    party,
    enemies,
    origin,
    rng,
    // The tables a defeated enemy's loot is rolled on, by identifier. Content, not
    // state: it is handed in again when a saved fight is restored.
    lootTables,
    // The spells a cast is resolved from, by identifier. Content, not state, like the
    // tables: handed in again when a saved fight is restored.
    spells,
    // What the fight yielded, rolled the first time its victory is read.
    finds: null,
    // How full each combatant's bar is, by id. The fight's own clock, in beats, is
    // beside it; neither has anything to do with the exploration clock, which is
    // stopped for the whole encounter.
    readiness: new Map(),
    beats: 0,
    skillsUsed: new Set(),
    skillsByActor: new Map(),
    // Everyone who has taken an action in this fight. Backstab reads it.
    // @spec COMBAT-ATTACK-019
    acted: new Set(),
    escaped: false,
    potBanked: 0,
  };

  // Every fight opens somewhere different. A bar drawn at random means the same
  // warband met twice is not the same fight twice, and nobody is owed the first turn
  // by the order they happen to be listed in. Nothing about how the two sides met
  // reaches in: the draw alone decides the opening.
  // @spec COMBAT-SURPRISE-003
  // @spec COMBAT-SURPRISE-004
  // @spec COMBAT-SURPRISE-007
  for (const combatant of combatants(state)) {
    state.readiness.set(combatant.id, rng.int(0, FULL_BAR - 1));
  }

  return state;
}

/**
 * Everyone still able to act, read the same way from both sides.
 *
 * @spec COMBAT-ENEMY-006
 */
function combatants(state) {
  // A nimble meal quickens a character's turns.
  // @spec COMBAT-TIME-016
  const speed = (c) => c.attributes[Attribute.DEXTERITY] + dexterityBonus(c);
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
 * The next turns of the fight, in the order they will come: the fight's own arithmetic
 * run forward on a copy of the bars. A forecast and not a beat, so nothing moves, nothing
 * is drawn from the generator, and it assumes everyone standing stays standing.
 *
 * @spec COMBAT-QUEUE-001
 * @spec COMBAT-QUEUE-002
 * @spec COMBAT-QUEUE-003
 * @spec COMBAT-QUEUE-004
 * @spec COMBAT-QUEUE-005
 * @spec COMBAT-QUEUE-006
 * @spec COMBAT-QUEUE-007
 */
export function turnOrder(state, count) {
  if (encounterOutcome(state).outcome !== Outcome.ONGOING) return [];

  const order = actingOrder(state);
  const bars = new Map(order.map((c) => [c.id, state.readiness.get(c.id) ?? 0]));
  const turns = [];

  while (turns.length < count && order.length > 0) {
    const ready = order.find((c) => bars.get(c.id) >= FULL_BAR);
    if (ready) {
      turns.push({ id: ready.id, side: ready.side });
      bars.set(ready.id, bars.get(ready.id) - FULL_BAR);
    } else {
      for (const c of order) bars.set(c.id, bars.get(c.id) + speedOf(c.dexterity));
    }
  }
  return turns;
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
 * A fight, written down. Characters are not in it: they are saved once, in the party,
 * and a restored fight is handed that party rather than a second copy of it. Its log
 * and any open menu are the screen's, and are not here to be saved.
 *
 * @spec SAVE-HOLD-004
 * @spec SAVE-HOLD-005
 * @spec SAVE-HOLD-006
 * @spec SAVE-HOLD-008
 */
export function serializeEncounter(state) {
  return {
    enemies: state.enemies,
    origin: state.origin,
    rng: state.rng.position(),
    readiness: [...state.readiness],
    beats: state.beats,
    skillsUsed: [...state.skillsUsed],
    skillsByActor: [...state.skillsByActor].map(([id, skills]) => [id, [...skills]]),
    acted: [...(state.acted ?? [])],
    escaped: state.escaped,
    potBanked: state.potBanked,
    finds: state.finds ?? null,
    roamerId: state.roamerId ?? null,
  };
}

/**
 * @spec SAVE-READ-003
 * @spec SAVE-READ-004
 */
export function restoreEncounter(saved, party, lootTables = {}, spells = {}) {
  return {
    ...saved,
    party,
    lootTables,
    spells,
    finds: saved.finds ?? null,
    rng: makeRng(saved.rng),
    readiness: new Map(saved.readiness),
    skillsUsed: new Set(saved.skillsUsed),
    skillsByActor: new Map(saved.skillsByActor.map(([id, skills]) => [id, new Set(skills)])),
    acted: new Set(saved.acted ?? []),
  };
}

/**
 * Whether a combatant has yet taken an action in this fight.
 *
 * @spec COMBAT-ATTACK-019
 */
export function hasActed(state, id) {
  return state.acted?.has(id) ?? false;
}

/** Record a skill as used by this combatant, for the fight's end to advance. */
function recordUse(state, actorId, skill) {
  state.skillsUsed.add(skill);
  const mine = state.skillsByActor.get(actorId) ?? new Set();
  mine.add(skill);
  state.skillsByActor.set(actorId, mine);
}

/**
 * Whether a weapon attack by this swinger on this target is a backstab: a thief's blow on
 * an enemy that has not yet acted.
 *
 * @spec COMBAT-ATTACK-017
 * @spec COMBAT-ATTACK-018
 */
function backstabs(state, swinger, target) {
  if (!character(state.party, swinger.id) || character(state.party, target.id)) return false;
  return skillRank(swinger, Skill.BACKSTAB) > 0 && !hasActed(state, target.id);
}

/** A weapon blow's base damage, multiplied by Backstab where it applies. */
function attackBase(state, swinger, target, base = baseDamageWith(swinger)) {
  return backstabs(state, swinger, target) ? base * backstabMultiplier(swinger) : base;
}

/**
 * What an attack by one combatant on another will deal. The very sum a resolved attack
 * runs through, so the preview and the result are the same number; nothing is drawn and
 * nothing changes.
 *
 * @spec COMBAT-ATTACK-013
 */
export function hitDamage(state, actorId, targetId) {
  const swinger = recordOf(state, actorId);
  const target = findTarget(state, targetId);
  if (!swinger || !target) return 0;
  return damageFor(attackBase(state, swinger, target), armourOf(target));
}

/**
 * Why a cast in this fight cannot happen, or nothing when it can: the magic segment's
 * rules, with whether an enemy target is standing judged here. Asked before anything is
 * spent, so a refused cast costs nothing and a menu can grey it with the reason.
 *
 * @spec COMBAT-ACTION-001
 * @spec COMBAT-ACTION-016
 */
export function castRefusalInFight(state, actorId, spellId, targetId = null) {
  const spell = state.spells?.[spellId];
  if (!spell || !character(state.party, actorId)) return 'NOT_KNOWN';
  const refusal = castRefusal(state.party, actorId, spell, {
    where: CastWhere.COMBAT,
    targetId: spell.target === SpellTarget.ALLY ? targetId : null,
  });
  if (refusal) return refusal;
  if (targetId !== null && spell.target === SpellTarget.ENEMY) {
    const foe = state.enemies.members.find((e) => e.id === targetId);
    if (!foe || !enemyStanding(foe)) return 'NO_TARGET';
  }
  return null;
}

/** What a spell aimed at an enemy deals: its whole magnitude, or that less armour. */
function spellDamage(caster, spell, target) {
  const magnitude = spellMagnitude(caster, spell);
  return spell.effect.ignoresArmour ? magnitude : damageFor(magnitude, armourOf(target));
}

/**
 * What a cast on a given target would do — the damage it deals or the hit points it
 * restores — by the sum the cast runs through. Nothing is spent and nothing changes.
 *
 * @spec MAGIC-CAST-005
 */
export function castPreview(state, actorId, spellId, targetId) {
  const spell = state.spells?.[spellId];
  const caster = character(state.party, actorId);
  if (!spell || !caster) return 0;
  if (spell.target === SpellTarget.ALLY) return healPreview(state.party, actorId, spell, targetId);
  const target = findTarget(state, targetId);
  return target && spell.effect[SpellEffect.DAMAGE] ? spellDamage(caster, spell, target) : 0;
}

/**
 * Land a blow on whoever it is aimed at, through the party's operation for a character
 * and directly for an enemy, which is dead where a character would be unconscious.
 * Answers whether it felled them.
 */
function strike(state, target, damage) {
  if (character(state.party, target.id)) {
    // Every change to a character goes through the party's own operation. A cleric's
    // Intercession catching the fall is counted as used, to advance with the rest.
    // @spec COMBAT-END-008
    const wasUp = target.condition === Condition.OK;
    const landed = damage > 0 ? applyDamage(state.party, target.id, damage, { inFight: true }) : false;
    if (landed?.intercededBy) recordUse(state, landed.intercededBy, Skill.INTERCESSION);
    return wasUp && character(state.party, target.id).condition !== Condition.OK;
  }
  // A fallen enemy is dead where a fallen character is unconscious: nobody is
  // coming back for a goblin.
  // @spec ENEMY-ROSTER-011
  target.hitPoints = Math.max(0, target.hitPoints - damage);
  if (target.hitPoints === 0 && target.condition === Condition.OK) {
    target.condition = Condition.DEAD;
    // The pot belongs to the enemies defeated, never to how long the fight ran.
    state.potBanked += target.potValue;
    return true;
  }
  return false;
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

  // Putting something on is the party's own operation, asked before the bar is touched:
  // a change the party refuses was never an action, and costs nothing.
  // @spec COMBAT-ACTION-011
  // @spec COMBAT-ACTION-012
  if (action.kind === Action.EQUIP) {
    if (!character(state.party, actorId)) return null;
    if (!equip(state.party, actorId, action.item, action.slot)) return null;
  }
  // A drink is the same: the party's to refuse, before anything is spent, and it heals
  // only whoever drinks it.
  // @spec COMBAT-ACTION-013
  // @spec COMBAT-ACTION-014
  if (action.kind === Action.USE) {
    if (!character(state.party, actorId)) return null;
    if (!useItem(state.party, actorId, action.item)) return null;
  }

  // A cast is asked first, as a drink is: a refused one was never an action.
  // @spec COMBAT-ACTION-016
  if (action.kind === Action.CAST && castRefusalInFight(state, actorId, action.spellId, action.targetId)) {
    return null;
  }

  state.readiness.set(actorId, readinessOf(state, actorId) - actionCost(action));

  // A cast trains the school it belongs to, whatever skill the caller named.
  if (action.kind === Action.CAST) action = { ...action, skill: state.spells[action.spellId].school };

  if (action.skill) recordUse(state, actorId, action.skill);

  // Backstab reads whether a target has acted before this action of its own is counted.
  const backstab = action.kind === Action.ATTACK
    && backstabs(state, recordOf(state, actorId), findTarget(state, action.targetId) ?? { id: null });
  state.acted.add(actorId);

  // @spec COMBAT-ACTION-015
  if (action.kind === Action.CAST) {
    const spell = state.spells[action.spellId];
    if (spell.target === SpellTarget.ALLY) {
      const { healed, overchannelled } = castOnAlly(state.party, actorId, spell, action.targetId, { where: CastWhere.COMBAT });
      // @spec MAGIC-SLOT-012
      if (overchannelled) recordUse(state, actorId, Skill.OVERCHANNEL);
      return { actorId, action: action.kind, spellId: spell.id, targetId: action.targetId, healed };
    }
    const target = findTarget(state, action.targetId);
    if (!payForCast(state.party, actorId, spell).slot) recordUse(state, actorId, Skill.OVERCHANNEL);
    const damage = spellDamage(recordOf(state, actorId), spell, target);
    const felled = strike(state, target, damage);
    return { actorId, action: action.kind, spellId: spell.id, targetId: target.id, damage, felled };
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
  // blunts it to whoever is struck. Both are assembled by the items segment from the
  // weapon in hand, the rank behind it and the attribute it draws on — or, for anybody
  // holding nothing, from the attack they were authored with.
  // @spec COMBAT-ACTION-008
  const swinger = recordOf(state, actorId);
  const unmultiplied = action.baseDamage ?? baseDamageWith(swinger);
  // A thief's blow on an enemy yet to act lands harder, and Backstab is counted as used.
  // @spec COMBAT-ATTACK-017
  // @spec COMBAT-END-008
  const baseDamage = backstab ? unmultiplied * backstabMultiplier(swinger) : unmultiplied;
  if (backstab) recordUse(state, actorId, Skill.BACKSTAB);

  // An enemy's blow landing on a fighter is Ironclad taking it.
  // @spec COMBAT-END-008
  if (!character(state.party, actorId) && character(state.party, target.id)
    && skillRank(target, Skill.IRONCLAD) > 0) {
    recordUse(state, target.id, Skill.IRONCLAD);
  }

  // Nothing is rolled: every attack lands, for exactly what the fight previewed.
  // @spec COMBAT-ATTACK-014
  // @spec COMBAT-ATTACK-015
  // @spec COMBAT-ATTACK-016
  const damage = damageFor(baseDamage, armourOf(target));

  const felled = strike(state, target, damage);

  return { actorId, action: action.kind, targetId: target.id, damage, felled };
}

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

/**
 * One attempt for the whole party: a party does not leave anyone behind.
 *
 * @spec COMBAT-FLEE-001
 * @spec COMBAT-FLEE-002
 * @spec COMBAT-FLEE-003
 * @spec COMBAT-FLEE-004
 * @spec COMBAT-FLEE-005
 */
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
 * What a won fight yielded: one roll for each defeated enemy, on its own table, from the
 * fight's generator. Rolled the first time it is asked for and kept, so however often the
 * outcome is read, and across a save, the fight paid out once.
 *
 * Only a victory asks. An escape leaves the band standing with its gold, and a defeat
 * leaves nobody to carry anything.
 *
 * @spec LOOT-DROP-001
 * @spec LOOT-DROP-002
 * @spec LOOT-DROP-003
 */
function settleFinds(state) {
  if (!state.finds) {
    const finds = [];
    for (const enemy of state.enemies.members) {
      const table = enemy.loot ? state.lootTables?.[enemy.loot] : null;
      if (table) finds.push(rollLoot(table, state.rng));
    }
    state.finds = mergeFinds(finds);
  }
  return state.finds;
}

/**
 * @spec COMBAT-END-001
 * @spec COMBAT-END-002
 * @spec COMBAT-END-003
 * @spec COMBAT-END-004
 * @spec COMBAT-END-005
 * @spec COMBAT-END-006
 * @spec COMBAT-END-007
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
      finds: settleFinds(state),
      skillsUsed: [...state.skillsUsed],
      // Per actor, so a character advances the skills they used rather than the
      // party's whole repertoire.
      skillsByActor: new Map([...state.skillsByActor].map(([id, set]) => [id, [...set]])),
    };
  }

  return { outcome: Outcome.ONGOING };
}
