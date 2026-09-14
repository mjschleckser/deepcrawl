/**
 * Drawing and driving a fight.
 *
 * Pure data and plain state, like the other presentation modules: the plan says what
 * a fight looks like, the controller walks the party through choosing, and the Pixi
 * adapter only emits what they decided.
 *
 * Nothing animates, so a round lands in one frame. The log is therefore not
 * decoration — it is the fight as the player perceives it, built from the events a
 * resolved round actually reported.
 */

import { Row, Condition, roster, character } from '../sim/party.js';
import {
  Action, Band, Outcome, meleeTargets, rangedTargets,
  encounterOutcome, selectAction, resolveRound, attemptFlee,
} from '../sim/combat.js';

export const FightPhase = { SELECTING: 'SELECTING', ENDED: 'ENDED' };

export const FightAction = {
  ATTACK: 'ATTACK',
  DEFEND: 'DEFEND',
  FLEE: 'FLEE',
};

const PANEL_FRACTION = 0.62;
const LOG_LINES = 5;

const standing = (e) => e.condition === Condition.OK && e.hitPoints > 0;

/**
 * What a fight looks like: both formations in their rows, the fallen still in place,
 * and a banner once it is over.
 *
 * @spec PRESENT-FIGHT-001
 * @spec PRESENT-FIGHT-002
 * @spec PRESENT-FIGHT-003
 * @spec PRESENT-FIGHT-004
 * @spec PRESENT-FIGHT-014
 */
export function buildFightPlan(encounter, viewport, { phase, outcome = null, pending = null, log = [] } = {}) {
  const height = viewport.height * PANEL_FRACTION;

  const drawEnemy = (e) => ({
    id: e.id, name: e.name, row: e.row,
    hitPoints: e.hitPoints, maxHitPoints: e.maxHitPoints,
    // Kept in place: the shape of a line that has lost its middle is information.
    down: !standing(e),
  });

  const drawMember = (c) => ({
    id: c.id, name: c.name, row: c.row,
    hitPoints: c.hitPoints, maxHitPoints: c.maxHitPoints,
    condition: c.condition,
    down: c.condition !== Condition.OK,
  });

  return {
    // Over the corridor, never instead of it: the party is still standing where they
    // were caught.
    overlaysView: true,
    bounds: { x: 0, y: viewport.height - height, width: viewport.width, height },
    enemies: encounter.enemies.members.map(drawEnemy),
    party: roster(encounter.party).map(drawMember),
    pending,
    log: log.slice(-LOG_LINES),
    banner: phase === FightPhase.ENDED && outcome
      ? { outcome: outcome.outcome, pot: outcome.pot ?? null }
      : null,
  };
}

/**
 * One line of the log, from one resolved event. Reports what the simulation did and
 * invents nothing.
 *
 * @spec PRESENT-FIGHT-010
 * @spec PRESENT-FIGHT-011
 */
export function describeEvent(event, names, targetId, felled) {
  const actor = names[event.actorId] ?? event.actorId;
  if (event.fizzled) return `${actor} swings at nothing.`;

  const target = names[targetId] ?? targetId;
  if (event.band === Band.MISS) return `${actor} misses ${target}.`;

  const verb = { [Band.GRAZE]: 'grazes', [Band.HIT]: 'hits', [Band.CRIT]: 'crits' }[event.band];
  const blow = `${actor} ${verb} ${target} for ${event.damage}.`;
  return felled ? `${blow} ${target} falls.` : blow;
}

/**
 * What this character may legally do, and at whom.
 *
 * An option that cannot be taken is not offered. Refusing a choice after it is made
 * teaches the rules by failure, which in a fight is expensive.
 *
 * @spec PRESENT-FIGHT-006
 * @spec PRESENT-FIGHT-007
 */
function optionsFor(encounter, characterId) {
  const options = [];
  // The reaching property lives on a weapon, which does not exist yet; until it does,
  // a back-row character has nothing to swing.
  const reachable = meleeTargets(encounter, characterId, { reaching: false });
  if (reachable.length > 0) options.push({ action: FightAction.ATTACK, label: 'Attack' });

  options.push({ action: FightAction.DEFEND, label: 'Defend' });

  const foes = encounter.enemies.members.filter(standing);
  if (!foes.some((e) => e.forbidsEscape)) options.push({ action: FightAction.FLEE, label: 'Flee' });

  return options;
}

function targetsFor(encounter, characterId, action) {
  if (action !== FightAction.ATTACK) return null;
  const melee = meleeTargets(encounter, characterId, { reaching: false });
  return (melee.length > 0 ? melee : rangedTargets(encounter, characterId))
    .filter(standing)
    .map((t) => ({ id: t.id, name: t.name, row: t.row }));
}

export function createFightController({ encounter, viewport, onDraw }) {
  const fight = {
    encounter, viewport, onDraw,
    phase: FightPhase.SELECTING,
    order: [],
    index: 0,
    chosen: new Map(),
    pending: null,
    log: [],
    roundsResolved: 0,
    outcome: null,
    dismissed: false,
  };

  /** @spec PRESENT-FIGHT-005 */
  fight.restart = () => {
    fight.order = roster(encounter.party).filter((c) => c.condition === Condition.OK).map((c) => c.id);
    fight.index = 0;
    fight.chosen = new Map();
    ask(fight);
  };

  fight.restart();
  return fight;
}

function ask(fight) {
  const characterId = fight.order[fight.index];
  if (!characterId) return;
  fight.pending = {
    characterId,
    options: optionsFor(fight.encounter, characterId),
    targets: null,
    action: null,
  };
}

function names(fight) {
  const map = {};
  for (const c of roster(fight.encounter.party)) map[c.id] = c.name;
  for (const e of fight.encounter.enemies.members) map[e.id] = e.name;
  return map;
}

/**
 * Resolve the round everyone has now committed to, and write down what happened.
 *
 * @spec PRESENT-FIGHT-008
 * @spec PRESENT-FIGHT-010
 */
function resolve(fight) {
  const { encounter } = fight;

  for (const [characterId, choice] of fight.chosen) {
    if (choice.action === FightAction.ATTACK) {
      selectAction(encounter, characterId, {
        action: Action.ATTACK,
        targetId: choice.targetId,
        baseDamage: 9,
        accuracy: 30,
        skill: choice.skill,
      });
    } else {
      selectAction(encounter, characterId, { action: Action.DEFEND });
    }
  }

  // Enemies act too, each against something it may legally reach.
  for (const foe of encounter.enemies.members.filter(standing)) {
    const legal = meleeTargets(encounter, foe.id);
    if (legal.length === 0) continue;
    selectAction(encounter, foe.id, {
      action: Action.ATTACK, targetId: legal[0].id, baseDamage: 5, accuracy: foe.accuracy,
    });
  }

  const events = resolveRound(encounter);
  const who = names(fight);

  for (const event of events) {
    if (event.action !== Action.ATTACK) continue;
    fight.log.push(describeEvent(event, who, event.targetId, event.felled === true));
  }

  fight.roundsResolved += 1;

  const result = encounterOutcome(encounter);
  if (result.outcome !== Outcome.ONGOING) {
    fight.phase = FightPhase.ENDED;
    fight.outcome = result;
    fight.pending = null;
    return;
  }
  fight.restart();
}

/**
 * Take the nth option on offer. A number key and a tap land here identically, carrying
 * no record of which was used.
 *
 * @spec PRESENT-FIGHT-013
 */
export function chooseOption(fight, index) {
  if (fight.phase !== FightPhase.SELECTING || !fight.pending) return false;

  // Choosing a target for an action already picked.
  if (fight.pending.targets) {
    const target = fight.pending.targets[index];
    if (!target) return false;
    fight.chosen.set(fight.pending.characterId, {
      action: fight.pending.action,
      targetId: target.id,
    });
    advance(fight);
    return true;
  }

  const option = fight.pending.options[index];
  if (!option) return false;

  if (option.action === FightAction.FLEE) {
    fight.fled = attemptFlee(fight.encounter);
    if (fight.fled.escaped) {
      fight.phase = FightPhase.ENDED;
      fight.outcome = encounterOutcome(fight.encounter);
      fight.pending = null;
      return true;
    }
    // A failed attempt costs the round and nothing else.
    fight.log.push('The way out is shut.');
    fight.chosen.set(fight.pending.characterId, { action: FightAction.DEFEND });
    advance(fight);
    return true;
  }

  const targets = targetsFor(fight.encounter, fight.pending.characterId, option.action);
  if (targets && targets.length > 0) {
    fight.pending = { ...fight.pending, action: option.action, targets };
    return true;
  }

  fight.chosen.set(fight.pending.characterId, { action: option.action });
  advance(fight);
  return true;
}

function advance(fight) {
  fight.index += 1;
  if (fight.index >= fight.order.length) resolve(fight);
  else ask(fight);
}

/**
 * Back out. The party commits to a whole round before any of it resolves, so
 * reconsidering reaches the whole round rather than only its last decision.
 *
 * @spec PRESENT-FIGHT-009
 */
export function goBack(fight) {
  if (fight.phase !== FightPhase.SELECTING || !fight.pending) return false;

  // Mid-choice: drop the target question and ask this character again.
  if (fight.pending.targets) {
    fight.pending = { ...fight.pending, action: null, targets: null };
    return true;
  }
  if (fight.index === 0) return false;

  fight.index -= 1;
  fight.chosen.delete(fight.order[fight.index]);
  ask(fight);
  return true;
}

/** @spec PRESENT-FIGHT-015 */
export function dismissOutcome(fight) {
  if (fight.phase !== FightPhase.ENDED) return false;
  fight.dismissed = true;
  return true;
}
