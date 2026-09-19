/**
 * Drawing and driving a fight.
 *
 * Pure data and plain state, like the other presentation modules: the plan says what
 * a fight looks like, the controller walks the party through choosing, and the Pixi
 * adapter only emits what they decided.
 *
 * Combatants act one at a time as their readiness fills, so the log is not decoration —
 * it is the fight as the player perceives it, built from what each turn reported.
 */

import { Condition, Row, Skill, character, roster } from '../sim/party.js';
import { MIN_TAP_PX, ControlKind, uiScale, contentColumn } from './geometry.js';
import {
  Action, Band, Outcome, meleeTargets, rangedTargets, frontRowHolds,
  encounterOutcome, readyActor, advanceBeats, takeAction, attemptFlee, readinessOf,
  readinessPartway, FULL_BAR,
} from '../sim/combat.js';
import { proposeFrom } from '../sim/orders.js';

export const FightPhase = { ACTING: 'ACTING', ENDED: 'ENDED' };

/**
 * The player's clocks, in real milliseconds. Neither has anything to do with the
 * fight's own time, which advances in beats and stops while anybody is being asked.
 *
 * The beat is what stops a fight run on standing orders landing between two frames;
 * the countdown is how long a proposal waits before taking itself.
 *
 * @spec PRESENT-READY-005
 * @spec PRESENT-READY-006
 */
export const BEAT_MS = 630;
export const COUNTDOWN_MS = 1500;

/**
 * How long one beat of the fight's time takes on screen while the bars are filling. It
 * sets only the pace: at Dexterity 10 a bar fills in ten beats, whatever this is.
 *
 * @spec PRESENT-READY-024
 */
export const FILL_BEAT_MS = 250;

/** How badly hurt a combatant is, by the share of their hit points left. */
export const Wound = { HEALTHY: 'HEALTHY', WOUNDED: 'WOUNDED', CRITICAL: 'CRITICAL' };

/** @spec PRESENT-READY-023 */
export function woundOf(share) {
  if (share > 0.5) return Wound.HEALTHY;
  if (share > 0.25) return Wound.WOUNDED;
  return Wound.CRITICAL;
}

/**
 * Whether a proposal takes itself when its countdown runs out.
 *
 * Off: every action is taken by a press. The countdown machinery is kept whole and
 * under test behind this one constant, because whether a fight should be able to play
 * itself for a player who has set their orders is a question worth being able to
 * answer twice.
 *
 * @spec COMBAT-ORDER-006
 * @spec PRESENT-READY-008
 */
export const AUTO_CONFIRM = false;

/** How far an attacker's card jumps, before the judder decays over the beat. */
export const SHAKE_PIXELS = 5;

export const FightAction = {
  // Taking what this character's standing orders already worked out.
  CONFIRM: 'CONFIRM',
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
const nameOf = (encounter, id) =>
  roster(encounter.party).find((c) => c.id === id)?.name
  ?? encounter.enemies.members.find((e) => e.id === id)?.name
  ?? id;

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
export function buildFightPlan(
  encounter,
  viewport,
  {
    phase, outcome = null, pending = null, log = [], actor = null,
    countdown = 0, autoConfirm = false, notice = null, shakingId = null, shake = 0,
    partway = 0,
  } = {},
) {
  const scale = uiScale(viewport);
  const column = contentColumn(viewport);
  const pad = CARD_GAP * scale;

  // How full a bar is, as a share of one, partway through whatever beat is filling it.
  // Read from the simulation rather than counted here, so the screen and the fight
  // cannot disagree about who is next.
  // @spec PRESENT-READY-002
  // @spec PRESENT-READY-025
  const filled = (id) => Math.min(1, readinessPartway(encounter, id, partway) / FULL_BAR);

  // How much of their hit points somebody has left, and how bad that is.
  // @spec PRESENT-READY-022
  // @spec PRESENT-READY-023
  const healthOf = (who) => {
    const share = who.maxHitPoints > 0 ? Math.max(0, who.hitPoints) / who.maxHitPoints : 0;
    return { health: share, wound: woundOf(share) };
  };

  // A quick vertical judder on whoever just swung, decaying to nothing over the beat.
  // Decided here rather than while drawing, like every other position.
  // @spec PRESENT-READY-018
  // @spec PRESENT-READY-019
  const offsetOf = (id) => {
    if (id !== shakingId) return 0;
    const left = Math.max(0, 1 - shake / BEAT_MS);
    // Cosine, so it jumps the moment the blow lands rather than easing into it.
    return Math.round(Math.cos(shake / 28) * SHAKE_PIXELS * left * scale);
  };

  const drawEnemy = (e) => ({
    id: e.id, name: e.name, row: e.row,
    hitPoints: e.hitPoints, maxHitPoints: e.maxHitPoints,
    // Kept in place: the shape of a line that has lost its middle is information.
    down: !standing(e),
    ...healthOf(e),
    readiness: filled(e.id),
    acting: actor?.id === e.id,
    offsetY: offsetOf(e.id),
  });

  const drawMember = (c) => ({
    id: c.id, name: c.name, row: c.row,
    hitPoints: c.hitPoints, maxHitPoints: c.maxHitPoints,
    condition: c.condition,
    down: c.condition !== Condition.OK,
    ...healthOf(c),
    readiness: filled(c.id),
    acting: actor?.id === c.id,
    offsetY: offsetOf(c.id),
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

  // The ring sits on the acting character's own card, beside the bar it is counting
  // against, so what is about to happen is shown where it is about to happen.
  // @spec PRESENT-READY-007
  // @spec PRESENT-READY-011
  const actingCard = [...laidParty, ...laidEnemies].find((c) => c.acting);
  const ringRadius = 7 * scale;
  const ring = autoConfirm && pending?.proposal && actingCard
    ? {
        x: actingCard.x + actingCard.width - ringRadius - 4 * scale,
        y: actingCard.y + actingCard.height - ringRadius - 3 * scale,
        radius: ringRadius,
        progress: Math.min(1, countdown / COUNTDOWN_MS),
        label: 'A',
      }
    : null;

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
    countdown: ring,
    // Who the next press belongs to, or nothing at all while nothing waits: a prompt
    // over a fight that is playing invites a press nothing is listening for.
    // @spec PRESENT-READY-013
    // @spec PRESENT-READY-014
    prompt: pending
      ? (pending.targets
        ? `${nameOf(encounter, pending.characterId)}: at whom?`
        : `${nameOf(encounter, pending.characterId)} is ready to act!`)
      : null,
    // @spec PRESENT-READY-015
    notice: notice
      ? {
        text: notice.text,
        bounds: {
          x: column.x + (column.width - bannerWidth) / 2,
          y: bounds.y - bannerHeight - pad,
          width: bannerWidth,
          height: bannerHeight * 0.6,
        },
      }
      : null,
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
/**
 * What the row of controls offers. A proposal comes first and names its target, because
 * a turn the character's orders already answer should be one press.
 *
 * @spec PRESENT-READY-020
 */
function optionsFor(encounter, characterId, proposal = null) {
  const options = [];

  if (proposal) {
    const verb = proposal.action.kind === Action.ATTACK ? 'Attack' : 'Cast';
    options.push({
      action: FightAction.CONFIRM,
      label: `${verb} ${nameOf(encounter, proposal.targetId)}`,
    });
  }
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

/**
 * What the fight looks like from one character's position, for their standing orders to
 * read. Assembled here because only this layer knows both the encounter and what a
 * character may legally do in it.
 *
 * @spec COMBAT-ORDER-003
 * @spec COMBAT-ORDER-015
 */
function situationFor(fight, characterId) {
  const { encounter } = fight;
  const reachable = targetsFor(encounter, characterId, FightAction.ATTACK) ?? [];

  return {
    actorId: characterId,
    // The character is one of their own allies, so a cleric alone still has somebody
    // to heal. Listed in the acting order, which is what settles equal candidates.
    allies: roster(encounter.party).map((c) => ({
      id: c.id,
      hitPoints: c.hitPoints,
      maxHitPoints: c.maxHitPoints,
      conscious: c.condition === Condition.OK,
    })),
    enemies: encounter.enemies.members.filter(standing).map((e) => ({
      id: e.id,
      hitPoints: e.hitPoints,
      row: e.row,
      targetable: reachable.some((t) => t.id === e.id),
    })),
    frontBroken: !frontRowHolds(encounter.party),
    slots: character(encounter.party, characterId)?.slots ?? {},
    taken: fight.ordersTaken.get(characterId) ?? new Set(),
    isLegal: (action, targetId) => {
      if (action.kind !== Action.ATTACK) return true;
      return reachable.some((t) => t.id === targetId);
    },
  };
}

export function createFightController({ encounter, viewport, onDraw }) {
  const fight = {
    encounter, viewport, onDraw,
    phase: FightPhase.ACTING,
    // Whose turn it is. A party member waits on the player; an enemy waits only on the
    // beat that plays it.
    actor: null,
    pending: null,
    log: [],
    turnsTaken: 0,
    outcome: null,
    dismissed: false,
    // Which "once this encounter" rules have fired, per character.
    ordersTaken: new Map(),
    // The player's clocks, in milliseconds: how long this proposal has been standing,
    // how long since the last action played, how long the shake has been running, and
    // how far into the beat of filling now under way.
    countdown: 0,
    beat: 0,
    shake: 0,
    shakingId: null,
    fill: 0,
    partway: 0,
    autoConfirm: AUTO_CONFIRM,
    // Whoever began with a full bar. The ambush lasts until the last of them has spent
    // it, and the card announcing it lasts exactly as long.
    // @spec PRESENT-READY-015
    // @spec PRESENT-READY-017
    ambushers: encounter.surprisedSide
      ? [...encounter.readiness.keys()].filter((id) => readinessOf(encounter, id) >= FULL_BAR)
      : [],
    notice: null,
  };

  nextTurn(fight);
  return fight;
}

/**
 * Hand the turn to whoever is ready. A party member is asked; an enemy is left standing
 * until the beat that plays it.
 *
 * @spec COMBAT-TIME-003
 * @spec COMBAT-TIME-009
 * @spec PRESENT-FIGHT-005
 */
function nextTurn(fight) {
  announce(fight);
  const result = encounterOutcome(fight.encounter);
  if (result.outcome !== Outcome.ONGOING) return end(fight, result);

  // Nobody full yet: the bars fill in front of the player, on the fill clock, rather
  // than jumping straight to whoever wins the race.
  // @spec PRESENT-READY-024
  const actor = readyActor(fight.encounter);
  fight.fill = 0;
  fight.partway = 0;
  if (!actor) {
    fight.actor = null;
    fight.pending = null;
    return;
  }

  fight.actor = actor;
  if (actor.side !== 'PARTY') {
    fight.pending = null;
    fight.beat = 0;
    return;
  }
  ask(fight, actor.id);
}

/**
 * Keep the ambush card up while any ambusher still holds the full bar they began with.
 * Acting spends it and falling drops it, so either ends that one's part in the ambush
 * for good: a quick ambusher who fills again is simply fast, not ambushing twice.
 *
 * @spec PRESENT-READY-015
 * @spec PRESENT-READY-026
 */
function announce(fight) {
  fight.ambushers = fight.ambushers.filter((id) => readinessOf(fight.encounter, id) >= FULL_BAR);
  fight.notice = fight.ambushers.length > 0 ? { text: 'Ambush!' } : null;
}

function end(fight, result) {
  fight.phase = FightPhase.ENDED;
  fight.outcome = result;
  fight.pending = null;
  fight.actor = null;
}

/**
 * Ask a character what to do, with whatever their orders propose already filled in.
 *
 * @spec COMBAT-ORDER-003
 * @spec COMBAT-ORDER-005
 * @spec COMBAT-ORDER-014
 */
function ask(fight, characterId) {
  // A fresh turn is a fresh countdown; nothing carries over from the last one.
  fight.countdown = 0;
  const rules = character(fight.encounter.party, characterId)?.orders ?? [];
  // Composed now rather than when they came ready, so it accounts for everything
  // resolved in between.
  const proposal = proposeFrom(rules, situationFor(fight, characterId));

  fight.pending = {
    characterId,
    options: optionsFor(fight.encounter, characterId, proposal),
    targets: null,
    action: null,
    proposal,
  };
}

function names(fight) {
  const map = {};
  for (const c of roster(fight.encounter.party)) map[c.id] = c.name;
  for (const e of fight.encounter.enemies.members) map[e.id] = e.name;
  return map;
}

/**
 * Take one action, write down what it did, and pass the turn on.
 *
 * @spec COMBAT-TIME-009
 * @spec PRESENT-FIGHT-008
 * @spec PRESENT-FIGHT-010
 */
function resolveOne(fight, actorId, action) {
  const event = takeAction(fight.encounter, actorId, action);
  if (event && event.action === Action.ATTACK) {
    fight.log.push(describeEvent(event, names(fight), event.targetId, event.felled === true));
    // The card that moves is the card that swung: nothing else in a fight moves, so a
    // blow is otherwise a number changing on a panel of numbers.
    // @spec PRESENT-READY-018
    fight.shakingId = actorId;
    fight.shake = 0;
  }
  fight.turnsTaken += 1;
  nextTurn(fight);
  return event;
}

/**
 * Play the turn of whatever is standing ready that is not the party's. One at a time,
 * because a beat passes between them.
 *
 * @spec COMBAT-ORDER-013
 * @spec COMBAT-TIME-009
 */
export function playEnemyTurn(fight) {
  if (fight.phase !== FightPhase.ACTING || fight.pending || !fight.actor) return false;

  const foe = fight.actor;
  const legal = meleeTargets(fight.encounter, foe.id);
  resolveOne(fight, foe.id, legal.length === 0
    ? { kind: Action.DEFEND }
    : {
      kind: Action.ATTACK,
      targetId: legal[0].id,
      baseDamage: 5,
      accuracy: fight.encounter.enemies.members.find((e) => e.id === foe.id)?.accuracy ?? 0,
    });
  return true;
}

/**
 * Take the action a character's orders proposed. The countdown reaches here, and so
 * does a player who confirms before it runs out; nothing downstream can tell which.
 *
 * @spec COMBAT-ORDER-006
 * @spec COMBAT-ORDER-017
 */
export function takeProposal(fight) {
  const proposal = fight.pending?.proposal;
  if (fight.phase !== FightPhase.ACTING || !proposal) return false;

  const characterId = fight.pending.characterId;
  const taken = fight.ordersTaken.get(characterId) ?? new Set();
  taken.add(proposal.ruleIndex);
  fight.ordersTaken.set(characterId, taken);

  resolveOne(fight, characterId, {
    ...proposal.action,
    targetId: proposal.targetId,
    ...(proposal.action.kind === Action.ATTACK ? PLACEHOLDER_ATTACK : {}),
  });
  return true;
}

/**
 * The player reached for the screen. Whatever was about to happen on its own stops,
 * and does not start again this turn.
 *
 * @spec COMBAT-ORDER-018
 * @spec PRESENT-READY-009
 */
export function cancelProposal(fight) {
  if (!fight.pending?.proposal) return false;
  fight.pending = { ...fight.pending, proposal: null };
  fight.countdown = 0;
  return true;
}

/**
 * Whether anything is going to happen without the player doing something. A fight with
 * nothing queued and nobody counting down is a fight waiting, and waiting costs no
 * frames.
 *
 * @spec PRESENT-SCENE-011
 * @spec PRESENT-READY-010
 */
export function fightIsPlaying(fight) {
  if (!fight || fight.phase !== FightPhase.ACTING) return false;
  if (fight.shakingId) return true;
  if (!fight.pending) return true;
  return fight.autoConfirm && Boolean(fight.pending.proposal);
}

/**
 * Run the player's clock on by the milliseconds that actually passed: the bars filling,
 * the beat between actions, and the countdown on a proposal. Only the filling moves the
 * fight's own time, and only while nobody is up.
 *
 * @spec PRESENT-READY-005
 * @spec PRESENT-READY-006
 * @spec PRESENT-READY-008
 * @spec PRESENT-READY-024
 */
export function advanceClock(fight, ms) {
  if (!fightIsPlaying(fight)) return false;

  // The judder decays on its own clock, so it outlives the turn that caused it.
  if (fight.shakingId) {
    fight.shake += ms;
    if (fight.shake >= BEAT_MS) {
      fight.shake = 0;
      fight.shakingId = null;
    }
  }

  if (!fight.actor) {
    fight.fill += ms;
    while (fight.fill >= FILL_BEAT_MS) {
      fight.fill -= FILL_BEAT_MS;
      advanceBeats(fight.encounter, 1);
      if (readyActor(fight.encounter)) {
        nextTurn(fight);
        return true;
      }
    }
    fight.partway = fight.fill / FILL_BEAT_MS;
    return true;
  }

  if (fight.pending) {
    if (!fight.autoConfirm || !fight.pending.proposal) return true;
    fight.countdown += ms;
    if (fight.countdown < COUNTDOWN_MS) return true;
    takeProposal(fight);
    return true;
  }

  fight.beat += ms;
  if (fight.beat < BEAT_MS) return true;
  playEnemyTurn(fight);
  return true;
}

/**
 * Take the nth option on offer. A number key and a tap land here identically, carrying
 * no record of which was used.
 *
 * @spec PRESENT-FIGHT-013
 */
export function chooseOption(fight, index) {
  if (fight.phase !== FightPhase.ACTING || !fight.pending) return false;

  // Taking the proposal is one press, and the only press that keeps it.
  // @spec PRESENT-READY-021
  if (!fight.pending.targets && fight.pending.options[index]?.action === FightAction.CONFIRM) {
    return takeProposal(fight);
  }

  // Anything else is the player choosing for themselves, which drops the proposal.
  cancelProposal(fight);

  const characterId = fight.pending.characterId;

  // Choosing a target for an action already picked.
  if (fight.pending.targets) {
    const target = fight.pending.targets[index];
    if (!target) return false;
    resolveOne(fight, characterId, {
      kind: Action.ATTACK, targetId: target.id, ...PLACEHOLDER_ATTACK,
    });
    return true;
  }

  const option = fight.pending.options[index];
  if (!option) return false;

  if (option.action === FightAction.FLEE) {
    // One character calls the retreat and pays for it; the whole party leaves or
    // nobody does.
    fight.fled = attemptFlee(fight.encounter, characterId);
    if (fight.fled.escaped) {
      end(fight, encounterOutcome(fight.encounter));
      return true;
    }
    fight.log.push('The way out is shut.');
    fight.turnsTaken += 1;
    nextTurn(fight);
    return true;
  }

  const targets = targetsFor(fight.encounter, characterId, option.action);
  if (targets && targets.length > 0) {
    fight.pending = { ...fight.pending, action: option.action, targets };
    return true;
  }

  resolveOne(fight, characterId, { kind: Action.DEFEND });
  return true;
}

/**
 * Back out of a half-made choice. A turn belongs to one character and resolves the
 * instant it is taken, so there is nothing behind this one to reach back to.
 *
 * @spec PRESENT-FIGHT-009
 */
export function goBack(fight) {
  if (fight.phase !== FightPhase.ACTING || !fight.pending) return false;
  cancelProposal(fight);

  if (fight.pending.targets) {
    fight.pending = { ...fight.pending, action: null, targets: null };
    return true;
  }
  return false;
}

/** @spec PRESENT-FIGHT-015 */
export function dismissOutcome(fight) {
  if (fight.phase !== FightPhase.ENDED) return false;
  fight.dismissed = true;
  return true;
}
