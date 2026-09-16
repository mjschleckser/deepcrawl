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

import { Condition, Row, Skill, roster } from '../sim/party.js';
import { MIN_TAP_PX, ControlKind, uiScale, contentColumn } from './geometry.js';
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

/** A card at the scale the phone layout was designed against. */
const CARD_WIDTH = 108;
const CARD_HEIGHT = 44;
const CARD_GAP = 8;

/**
 * Lay a rank out centred across the column, so the two sides read as facing one another
 * down a corridor rather than as two lists sharing a left margin.
 *
 * @spec PRESENT-FIGHT-018
 * @spec PRESENT-FIGHT-019
 * @spec PRESENT-FIGHT-022
 */
function layOutRank(cards, column, top, scale) {
  if (cards.length === 0) return [];

  const gap = CARD_GAP * scale;
  const natural = CARD_WIDTH * scale;
  const height = CARD_HEIGHT * scale;

  // Squeeze rather than overflow: a crowded rank still has to fit the column.
  const available = column.width - gap * 2;
  const total = cards.length * natural + (cards.length - 1) * gap;
  const width = total <= available
    ? natural
    : (available - (cards.length - 1) * gap) / cards.length;

  const rankWidth = cards.length * width + (cards.length - 1) * gap;
  const startX = column.x + (column.width - rankWidth) / 2;

  return cards.map((card, i) => ({
    ...card,
    x: startX + i * (width + gap),
    y: top,
    width,
    height,
  }));
}

/**
 * What an attack trains, and what it hits for. Placeholders until weapons exist: the
 * skill an attack uses, the damage it deals and the accuracy behind it are all
 * properties of the weapon being swung, and there are no weapons yet.
 */
const PLACEHOLDER_ATTACK = { skill: Skill.BLADE, baseDamage: 9, accuracy: 30 };

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
  const scale = uiScale(viewport);
  const column = contentColumn(viewport);
  const pad = CARD_GAP * scale;

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

  const byRow = (cards, row) => cards.filter((c) => c.row === row);
  const enemyCards = encounter.enemies.members.map(drawEnemy);
  const partyCards = roster(encounter.party).map(drawMember);

  const rankOrder = [
    [enemyCards, Row.BACK], [enemyCards, Row.FRONT],
    [partyCards, Row.FRONT], [partyCards, Row.BACK],
  ];
  const occupied = rankOrder.filter(([cards, row]) => byRow(cards, row).length > 0).length;

  // The panel is sized to what is in it rather than to a fixed share of the screen: a
  // fixed share leaves a wide window mostly empty between the log and the controls.
  const metrics = controlMetrics({ column, pending, scale });
  const shownLog = log.slice(-LOG_LINES);
  const contentHeight =
    pad
    + occupied * (CARD_HEIGHT + CARD_GAP) * scale
    + (pending ? 26 * scale : 0)
    + shownLog.length * 15 * scale
    + (metrics.height > 0 ? metrics.gap + metrics.height : 0)
    + pad;
  // Never more than most of the screen, however crowded the fight.
  const height = Math.min(viewport.height * PANEL_FRACTION, contentHeight);

  // The fight is a centred surface, not a band across the whole screen: on a wide
  // window the corridor stays visible either side of it.
  const bounds = { x: column.x, y: viewport.height - height, width: column.width, height };
  const bannerHeight = Math.max(MIN_TAP_PX * 2.6, 150) * scale;
  const bannerWidth = Math.min(column.width - 24, 420 * scale);
  const banner = phase === FightPhase.ENDED && outcome
    ? {
        outcome: outcome.outcome,
        pot: outcome.pot ?? null,
        // Its own panel: a banner reading through the formation behind it is a banner
        // nobody can read.
        bounds: {
          x: (viewport.width - bannerWidth) / 2,
          y: bounds.y + (bounds.height - bannerHeight) / 2,
          width: bannerWidth,
          height: bannerHeight,
        },
      }
    : null;

  // Enemy back, enemy front, then the party's two ranks facing them.
  let top = bounds.y + pad;
  const ranks = [];
  for (const [cards, row] of rankOrder) {
    const rank = byRow(cards, row);
    ranks.push({
      owner: cards === enemyCards ? 'enemies' : 'party',
      laid: layOutRank(rank, column, top, scale),
    });
    if (rank.length > 0) top += (CARD_HEIGHT + CARD_GAP) * scale;
  }
  const laidEnemies = ranks.filter((r) => r.owner === 'enemies').flatMap((r) => r.laid);
  const laidParty = ranks.filter((r) => r.owner === 'party').flatMap((r) => r.laid);

  return {
    // Over the corridor, never instead of it: the party is still standing where they
    // were caught.
    overlaysView: true,
    bounds,
    // Carried, never recomputed while drawing: layout lives in one place.
    // @spec PRESENT-CTRL-013
    scale,
    cardsBottom: top,
    controlsTop: bounds.y + bounds.height - pad - metrics.height + metrics.gap,
    enemies: laidEnemies,
    party: laidParty,
    pending,
    log: shownLog,
    banner,
    // Drawn and tapped are one thing: a fight nobody can touch is a fight a phone
    // player can watch and not play.
    controls: fightControls({
      bounds, pending, banner, metrics,
      top: bounds.y + bounds.height - pad - metrics.height + metrics.gap,
    }),
  };
}

/**
 * How much room the controls need, and how they divide the column. Worked out before
 * the panel is sized, because the panel is sized to fit them.
 */
function controlMetrics({ column, pending, scale }) {
  const gap = 8 * scale;
  const buttonHeight = Math.max(MIN_TAP_PX, 52 * scale);
  if (!pending) return { gap, buttonHeight, columns: 0, rows: 0, width: 0, height: 0 };

  const count = pending.targets ? pending.targets.length : pending.options.length;

  // Wrap onto as many rows as the width needs, so a narrow phone never squeezes a
  // control below a thumb.
  const perRow = Math.max(1, Math.floor((column.width - gap) / (MIN_TAP_PX * 1.8 * scale + gap)));
  const columns = Math.min(perRow, Math.max(1, count));
  const rows = Math.ceil(count / columns);

  return {
    gap, buttonHeight, columns, rows,
    width: Math.max(MIN_TAP_PX, (column.width - gap * (columns + 1)) / columns),
    // The option rows, then the way back on a row of its own.
    height: (rows + 1) * (buttonHeight + gap),
  };
}

/**
 * A control per option on offer, plus the way back and the way out.
 *
 * @spec PRESENT-CTRL-001
 * @spec PRESENT-CTRL-002
 * @spec PRESENT-CTRL-003
 * @spec PRESENT-CTRL-004
 * @spec PRESENT-FIGHT-017
 * @spec PRESENT-FIGHT-021
 */
function fightControls({ bounds, pending, banner, metrics, top }) {
  const { gap, buttonHeight, columns, width } = metrics;

  if (banner) {
    const bannerWidth = Math.min(banner.bounds.width - gap * 2, 320 * (buttonHeight / 52));
    return [{
      kind: ControlKind.BUTTON, role: 'DISMISS', label: 'Onward', hint: 'Enter',
      x: banner.bounds.x + (banner.bounds.width - bannerWidth) / 2,
      y: banner.bounds.y + banner.bounds.height - buttonHeight - gap,
      width: bannerWidth, height: buttonHeight,
    }];
  }
  if (!pending) return [];

  const choices = pending.targets
    ? pending.targets.map((t) => t.name)
    : pending.options.map((o) => o.label);

  const controls = choices.map((label, index) => ({
    kind: ControlKind.BUTTON,
    role: pending.targets ? 'TARGET' : 'OPTION',
    optionIndex: index,
    label,
    hint: String(index + 1),
    x: bounds.x + gap + (index % columns) * (width + gap),
    y: top + Math.floor(index / columns) * (buttonHeight + gap),
    width, height: buttonHeight,
  }));

  controls.push({
    kind: ControlKind.BUTTON, role: 'BACK', label: 'Back', hint: 'Esc',
    x: bounds.x + gap,
    y: top + metrics.rows * (buttonHeight + gap),
    width: Math.max(MIN_TAP_PX, bounds.width * 0.3),
    height: buttonHeight,
  });

  return controls;
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
        ...PLACEHOLDER_ATTACK,
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
