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

import { Condition, Skill, character, roster, totalLevel } from '../sim/party.js';
import { MIN_TAP_PX, ControlKind, uiScale, contentColumn } from './geometry.js';
import {
  Action, Band, Outcome, attackTargets,
  encounterOutcome, readyActor, advanceBeats, takeAction, attemptFlee,
  fleeCertainToFail, readinessPartway, FULL_BAR,
} from '../sim/combat.js';
import { selectEnemyTarget } from '../sim/enemies.js';

export const FightPhase = { ACTING: 'ACTING', ENDED: 'ENDED' };

/**
 * The pause between one resolved action and the next, in real milliseconds. It has
 * nothing to do with the fight's own time, which advances in beats and stops while
 * anybody is being asked.
 *
 * It is what stops the enemies' turns landing between two frames and arriving as a
 * wall of text nobody watched happen.
 *
 * @spec PRESENT-READY-005
 * @spec PRESENT-READY-006
 */
export const BEAT_MS = 630;

/**
 * How long one beat of the fight's time takes on screen while the bars are filling.
 *
 * It sets only the pace, and the same span applies to every bar alike, so the relative
 * speeds stay the simulation's: at Dexterity 10 a bar fills in ten beats, whatever this
 * is. Slow enough that a race between two bars can be watched rather than merely
 * reported — ten beats is a little under four seconds here.
 *
 * @spec PRESENT-READY-024
 * @spec PRESENT-READY-032
 */
export const FILL_BEAT_MS = 375;

/** How badly hurt a combatant is, by the share of their hit points left. */
export const Wound = { HEALTHY: 'HEALTHY', WOUNDED: 'WOUNDED', CRITICAL: 'CRITICAL' };

/** @spec PRESENT-READY-023 */
export function woundOf(share) {
  if (share > 0.5) return Wound.HEALTHY;
  if (share > 0.25) return Wound.WOUNDED;
  return Wound.CRITICAL;
}

/** How far an attacker's card jumps, before the judder decays over the beat. */
export const SHAKE_PIXELS = 5;

export const FightAction = {
  ATTACK: 'ATTACK',
  MAGIC: 'MAGIC',
  INVENTORY: 'INVENTORY',
  FLEE: 'FLEE',
  PASS: 'PASS',
};

/**
 * The four a turn offers, in the order they are always drawn in. The row is this list
 * and nothing else: what a character cannot do is greyed in its own slot rather than
 * left out, so the shape never changes and a number always means the same thing.
 *
 * @spec PRESENT-FIGHT-006
 * @spec PRESENT-FIGHT-037
 */
export const OPTION_SLOTS = [
  { action: FightAction.ATTACK, label: 'Attack' },
  { action: FightAction.MAGIC, label: 'Magic' },
  { action: FightAction.INVENTORY, label: 'Inventory' },
  { action: FightAction.FLEE, label: 'Flee' },
];

const PANEL_FRACTION = 0.62;
/** Lines of the fight the log's window shows at once; the rest is scrolled back to. */
const LOG_LINES = 5;
const LOG_LINE_HEIGHT = 15;
/** The line that names who is up, reserved whether or not anybody is. */
const PROMPT_HEIGHT = 26;
/** Controls a character is ever offered at once: the four slots. */
const MOST_OPTIONS = OPTION_SLOTS.length;
const SCROLLBAR_WIDTH = 6;

/** One combatant, at the scale the phone layout was designed against. */
const ROW_HEIGHT = 34;
const ROW_GAP = 5;
const CARD_GAP = 8;
/** The portrait is square and as tall as the row, so a column stays aligned. */
const PORTRAIT_GAP = 4;
/** Three bars, stacked, with a hairline between them. */
const BAR_GAP = 1;

const nameOf = (encounter, id) =>
  roster(encounter.party).find((c) => c.id === id)?.name
  ?? encounter.enemies.members.find((e) => e.id === id)?.name
  ?? id;

/**
 * Lay a side out as one column: a portrait, and three bars stacked beside it.
 *
 * Everything a combatant is drawn from is positioned here — the portrait's square and
 * each bar's rectangle — so that drawing is only painting.
 *
 * @spec PRESENT-FIGHT-018
 * @spec PRESENT-FIGHT-019
 * @spec PRESENT-FIGHT-022
 * @spec PRESENT-READY-028
 */
function layOutColumn(cards, column, top, scale, { height = ROW_HEIGHT * scale } = {}) {
  const gap = ROW_GAP * scale;
  const portrait = height;
  const portraitGap = PORTRAIT_GAP * scale;
  const barGap = BAR_GAP * scale;
  const barHeight = (height - barGap * 2) / 3;
  const barsX = column.x + portrait + portraitGap;
  const barsWidth = Math.max(1, column.width - portrait - portraitGap);

  return cards.map((card, i) => {
    const y = top + i * (height + gap);
    const bar = (index) => ({
      x: barsX,
      y: y + index * (barHeight + barGap),
      width: barsWidth,
      height: barHeight,
    });
    return {
      ...card,
      x: column.x,
      y,
      width: column.width,
      height,
      portraitBox: { x: column.x, y, size: portrait },
      // Readiness on top, because it is what the fight is read off; identity in the
      // middle, which changes least; hit points beneath, checked under pressure.
      bars: { readiness: bar(0), identity: bar(1), health: bar(2) },
    };
  });
}

/**
 * What an attack trains. The damage and the accuracy belong to the combatant swinging
 * until a weapon carries them; the skill comes with them.
 *
 * @spec COMBAT-ACTION-008
 */
const attackOf = (encounter, id) => ({
  skill: character(encounter.party, id)?.attack?.skill ?? Skill.BLADE,
});

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
    notice = null, shakingId = null, shake = 0,
    partway = 0, logScroll = 0,
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

  // Both sides are the same kind of thing, so both are drawn from the same fields.
  // @spec PRESENT-READY-029
  // @spec PRESENT-READY-030
  const drawCombatant = (who, down) => ({
    id: who.id,
    name: who.name,
    level: totalLevel(who),
    // Until status effects exist, a combatant's only status is their condition, and
    // only worth saying when it is not the ordinary one.
    status: who.condition && who.condition !== Condition.OK ? who.condition : null,
    hitPoints: who.hitPoints,
    maxHitPoints: who.maxHitPoints,
    portrait: who.portrait ?? null,
    // Kept in place: the shape of a side that has lost its middle is information.
    down,
    ...healthOf(who),
    readiness: filled(who.id),
    acting: actor?.id === who.id,
    offsetY: offsetOf(who.id),
  });

  const enemyCards = encounter.enemies.members.map((e) => drawCombatant(e, !standing(e)));
  const partyCards = roster(encounter.party).map((c) => drawCombatant(c, c.condition !== Condition.OK));
  const deepest = Math.max(enemyCards.length, partyCards.length);

  // Every region is sized from what the encounter fixed when it began — how many
  // combatants, how wide the screen — and from nothing that changes while it is
  // fought. A panel that resized itself would move what the player is reading at the
  // moment they are reading it.
  // @spec PRESENT-FIGHT-025
  // @spec PRESENT-FIGHT-026
  const metrics = controlMetrics({
    column, scale,
    // The most controls this encounter will ever put on offer: an option for each
    // thing a character may do, or a target for each enemy there is. Both are settled
    // when the fight begins, so the room they need never changes while it is fought.
    most: Math.max(MOST_OPTIONS, encounter.enemies.members.length),
  });
  const lineHeight = LOG_LINE_HEIGHT * scale;
  const logHeight = LOG_LINES * lineHeight + pad;
  const promptHeight = PROMPT_HEIGHT * scale;
  const contentHeight =
    pad
    + deepest * (ROW_HEIGHT + ROW_GAP) * scale
    + promptHeight
    + logHeight
    + metrics.gap + metrics.height
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

  // Bottom up, because the controls are anchored to the foot of the panel and the
  // combatants take whatever is left: controls, prompt line, log, formation.
  const controlsBox = {
    x: bounds.x,
    y: bounds.y + bounds.height - pad - metrics.height,
    width: bounds.width,
    height: metrics.height,
  };
  const promptLine = {
    x: bounds.x + pad,
    y: controlsBox.y - metrics.gap - promptHeight,
    width: bounds.width - pad * 2,
    height: promptHeight,
  };
  const logBox = {
    x: bounds.x + pad,
    y: promptLine.y - logHeight,
    width: bounds.width - pad * 2,
    height: logHeight,
  };
  const formation = {
    x: bounds.x,
    y: bounds.y + pad,
    width: bounds.width,
    height: Math.max(0, logBox.y - bounds.y - pad),
  };

  // Enemies down the left, the party down the right, facing one another. A column is
  // the shape of a side with no positions in it, and holds two or twelve alike.
  // @spec PRESENT-FIGHT-002
  const sideWidth = (column.width - pad * 3) / 2;
  const left = { x: column.x + pad, width: sideWidth };
  const right = { x: column.x + pad * 2 + sideWidth, width: sideWidth };
  // A crowded side squeezes into the room the formation has rather than overflowing it.
  const natural = ROW_HEIGHT * scale;
  const rowHeight = deepest > 0
    ? Math.min(natural, Math.max(MIN_TAP_PX * 0.5, formation.height / deepest - ROW_GAP * scale))
    : natural;

  // Each side sits in the middle of the region on its own count, so two goblins facing
  // five characters read as outnumbered rather than as a list that ran out. A side's
  // count never changes — the fallen keep their places — so this is settled when the
  // encounter begins and cannot creep as the fight thins a column.
  // A column with more members than the region has room for starts at the top edge
  // instead, rather than being centred up off the panel.
  // @spec PRESENT-FIGHT-038
  // @spec PRESENT-FIGHT-039
  const topFor = (count) => {
    const tall = count * (rowHeight + ROW_GAP * scale) - ROW_GAP * scale;
    return formation.y + Math.max(0, (formation.height - tall) / 2);
  };

  const laidEnemies = layOutColumn(enemyCards, left, topFor(enemyCards.length), scale, { height: rowHeight });
  const laidParty = layOutColumn(partyCards, right, topFor(partyCards.length), scale, { height: rowHeight });
  const bottom = Math.max(
    ...[...laidEnemies, ...laidParty].map((c) => c.y + c.height),
    formation.y,
  );

  // The log is a window on the fight, held where the player left it.
  // @spec PRESENT-FIGHT-029
  // @spec PRESENT-FIGHT-031
  const shown = Math.max(1, Math.floor((logBox.height - pad) / lineHeight));
  const scrolledBack = Math.min(Math.max(0, Math.round(logScroll)), Math.max(0, log.length - shown));
  const end = log.length - scrolledBack;
  const shownLog = log.slice(Math.max(0, end - shown), end);

  // A bar along its right edge, sized to the share it is showing and placed by how far
  // back the view is. Absent while everything fits, there being nothing to scroll.
  // @spec PRESENT-FIGHT-030
  const track = {
    x: logBox.x + logBox.width - SCROLLBAR_WIDTH * scale,
    y: logBox.y + pad / 2,
    width: SCROLLBAR_WIDTH * scale,
    height: logBox.height - pad,
  };
  const hidden = Math.max(0, log.length - shown);
  const thumbHeight = Math.min(
    track.height,
    Math.max(MIN_TAP_PX * 0.4, track.height * Math.min(1, shown / Math.max(1, log.length))),
  );
  const scrollbar = hidden > 0
    ? {
      track,
      // The thumb travels the room the track has left over, and sits at the foot of
      // it while the view is on the newest line.
      thumb: {
        x: track.x,
        y: track.y + (track.height - thumbHeight) * (1 - scrolledBack / hidden),
        width: track.width,
        height: thumbHeight,
      },
      // What a press on the track moves by, and how far back the view is now.
      page: shown,
      scrolledBack,
      hidden,
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
    cardsBottom: bottom,
    controlsTop: controlsBox.y,
    // Every region, so that drawing paints into them rather than working them out.
    // @spec PRESENT-FIGHT-025
    regions: { formation, logBox, promptLine, controlsBox },
    logBox,
    scrollbar,
    enemies: laidEnemies,
    party: laidParty,
    pending,
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
    controls: fightControls({ bounds, pending, banner, metrics, top: controlsBox.y }),
  };
}

/**
 * How much room the controls need, and how they divide the column. Worked out before
 * the panel is sized, because the panel is sized to fit them.
 */
function controlMetrics({ column, scale, most = MOST_OPTIONS }) {
  const gap = 8 * scale;
  const buttonHeight = Math.max(MIN_TAP_PX, 52 * scale);

  // Wrap onto as many columns as the width allows, so a narrow phone never squeezes a
  // control below a thumb.
  const columns = Math.max(1, Math.floor((column.width - gap) / (MIN_TAP_PX * 1.8 * scale + gap)));
  // Room for the most this encounter will ever offer, and the way back beneath it.
  // Reserved whatever is on offer now, so that being asked which goblin never moves a
  // control the player is already reaching for.
  // @spec PRESENT-FIGHT-028
  const rows = Math.max(1, Math.ceil(most / columns));

  return {
    gap, buttonHeight, columns, rows,
    width: Math.max(MIN_TAP_PX, (column.width - gap * (columns + 1)) / columns),
    height: (rows + 1) * (buttonHeight + gap),
  };
}

/**
 * A control per option on offer, plus the way back and the way out.
 *
 * Every option is drawn whether or not it can be taken: an unavailable one keeps its
 * slot, loses its key hint to the reason it cannot be pressed, and does nothing. When
 * none of the four can be taken, a Pass turn control is laid over them — over, not
 * instead of, because the four underneath are the explanation for why it is there.
 *
 * @spec PRESENT-CTRL-001
 * @spec PRESENT-CTRL-002
 * @spec PRESENT-CTRL-003
 * @spec PRESENT-CTRL-004
 * @spec PRESENT-FIGHT-017
 * @spec PRESENT-FIGHT-021
 * @spec PRESENT-FIGHT-034
 * @spec PRESENT-FIGHT-041
 * @spec PRESENT-FIGHT-042
 * @spec PRESENT-FIGHT-044
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
    ? pending.targets.map((t) => ({ label: t.name, available: true, reason: null }))
    : pending.options;

  const controls = choices.map((choice, index) => ({
    kind: ControlKind.BUTTON,
    role: pending.targets ? 'TARGET' : 'OPTION',
    optionIndex: index,
    label: choice.label,
    // What cannot be pressed says so, and says why in the place the key would sit.
    available: choice.available,
    reason: choice.available ? null : choice.reason,
    hint: choice.available ? String(index + 1) : null,
    x: bounds.x + gap + (index % columns) * (width + gap),
    y: top + Math.floor(index / columns) * (buttonHeight + gap),
    width, height: buttonHeight,
  }));

  // Laid across the row it covers, so the four greyed options stay readable beneath it.
  if (!pending.targets && pending.mustPass) {
    const rowWidth = Math.min(columns, choices.length) * width
      + (Math.min(columns, choices.length) - 1) * gap;
    const rows = Math.ceil(choices.length / columns);
    controls.push({
      kind: ControlKind.BUTTON, role: 'PASS', label: 'Pass turn', hint: 'Enter',
      overlay: true,
      x: bounds.x + gap,
      y: top + (rows - 1) * (buttonHeight + gap) / 2,
      width: Math.max(MIN_TAP_PX, rowWidth),
      height: buttonHeight,
    });
  }

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
  const target = names[targetId] ?? targetId;
  if (event.band === Band.MISS) return `${actor} misses ${target}.`;

  const verb = { [Band.GRAZE]: 'grazes', [Band.HIT]: 'hits', [Band.CRIT]: 'crits' }[event.band];
  const blow = `${actor} ${verb} ${target} for ${event.damage}.`;
  return felled ? `${blow} ${target} falls.` : blow;
}

/**
 * What the row offers this character: the same four, in the same order, every turn.
 *
 * An option that cannot be taken keeps its slot and carries the reason why, because a
 * row that changed shape could not be pressed from memory and grey alone says only
 * "not now" — which leaves the player deciding whether they have misread the rules or
 * found a bug.
 *
 * @spec PRESENT-FIGHT-006
 * @spec PRESENT-FIGHT-034
 * @spec PRESENT-FIGHT-036
 * @spec PRESENT-FIGHT-040
 * @spec COMBAT-TURN-003
 */
function optionsFor(encounter, characterId) {
  // Everyone is in reach of everyone; what a character needs is something to swing.
  // @spec COMBAT-TARGET-005
  const armed = Boolean(character(encounter.party, characterId)?.attack);
  const standingFoes = attackTargets(encounter, characterId).length > 0;

  const availability = {
    [FightAction.ATTACK]: armed
      ? (standingFoes ? null : 'Nothing standing')
      : 'Nothing to swing',
    // Spells and the pack wait on segments that do not exist. Both are drawn anyway:
    // the row's shape is not a function of which systems happen to have landed.
    [FightAction.MAGIC]: 'No spells',
    [FightAction.INVENTORY]: 'Pack is empty',
    // Read from the same rule that resolves an attempt, so the button and the outcome
    // can never disagree about whether the way out is shut.
    // @spec COMBAT-TURN-005
    [FightAction.FLEE]: fleeCertainToFail(encounter)
      ? (encounter.enemies.members.filter(standing).some((e) => e.forbidsEscape)
        ? 'Escape forbidden'
        : 'Too slow to escape')
      : null,
  };

  return OPTION_SLOTS.map(({ action, label }) => {
    const reason = availability[action] ?? null;
    return { action, label, available: reason === null, reason };
  });
}

/** @spec PRESENT-FIGHT-007 */
function targetsFor(encounter, characterId, action) {
  if (action !== FightAction.ATTACK) return null;
  return attackTargets(encounter, characterId).map((t) => ({ id: t.id, name: t.name }));
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
    // The player's clocks, in milliseconds: how long since the last action played, how
    // long the shake has been running, and how far into the beat of filling now under
    // way.
    beat: 0,
    shake: 0,
    shakingId: null,
    // How far back through the log the player has scrolled, in lines. Zero is the
    // newest line, which is where it stays until they take it somewhere else.
    // @spec PRESENT-FIGHT-032
    logScroll: 0,
    fill: 0,
    partway: 0,
    // Whoever the ambush favoured. It lasts until the last of them has acted, and the
    // card announcing it lasts exactly as long.
    // @spec PRESENT-READY-015
    // @spec PRESENT-READY-017
    ambushers: ambushersOf(encounter),
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
 * Everyone the ambush handed a head start to, which is everyone on the aware side.
 *
 * @spec PRESENT-READY-015
 * @spec PRESENT-READY-017
 */
function ambushersOf(encounter) {
  if (!encounter.surprisedSide) return [];
  const surprised = encounter.surprisedSide === 'PARTY'
    ? roster(encounter.party).map((c) => c.id)
    : encounter.enemies.members.map((e) => e.id);
  return [...roster(encounter.party), ...encounter.enemies.members]
    .map((c) => c.id)
    .filter((id) => !surprised.includes(id));
}

/** Whether somebody can still take the turn the ambush handed them. */
function ableToAct(encounter, id) {
  const one = character(encounter.party, id) ?? encounter.enemies.members.find((e) => e.id === id);
  return Boolean(one) && one.condition === Condition.OK && (one.hitPoints ?? 1) > 0;
}

/**
 * Keep the ambush card up while any ambusher is still to take the turn the ambush gave
 * them. Acting ends that one's part in it for good, and so does falling first: a quick
 * ambusher who comes ready again is simply fast, not ambushing twice.
 *
 * @spec PRESENT-READY-015
 * @spec PRESENT-READY-026
 */
function announce(fight) {
  fight.ambushers = fight.ambushers.filter((id) => ableToAct(fight.encounter, id));
  fight.notice = fight.ambushers.length > 0 ? { text: 'Ambush!' } : null;
}

function end(fight, result) {
  fight.phase = FightPhase.ENDED;
  fight.outcome = result;
  fight.pending = null;
  fight.actor = null;
}

/**
 * Ask a character what to do. Composed now rather than when they came ready, so what is
 * on offer accounts for everything resolved in between.
 *
 * A character with nothing at all available is asked to pass, which is still a press:
 * the four stay drawn underneath as the explanation for why that is all there is.
 *
 * @spec PRESENT-FIGHT-042
 * @spec COMBAT-TURN-001
 * @spec COMBAT-TURN-004
 */
function ask(fight, characterId) {
  const options = optionsFor(fight.encounter, characterId);

  fight.pending = {
    characterId,
    options,
    targets: null,
    action: null,
    mustPass: options.every((o) => !o.available),
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
  // Their part in the ambush is over the moment they have swung.
  // @spec PRESENT-READY-015
  fight.ambushers = fight.ambushers.filter((id) => id !== actorId);
  const event = takeAction(fight.encounter, actorId, action);
  if (event && event.action === Action.ATTACK && event.targetId) {
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
 * @spec COMBAT-TURN-002
 * @spec COMBAT-TIME-009
 */
export function playEnemyTurn(fight) {
  if (fight.phase !== FightPhase.ACTING || fight.pending || !fight.actor) return false;

  const foe = fight.actor;
  const legal = attackTargets(fight.encounter, foe.id);
  const record = fight.encounter.enemies.members.find((e) => e.id === foe.id);
  // Whom it swings at is the enemies' own business, drawn from everyone standing; what
  // the swing is worth is carried on the enemy itself.
  // @spec ENEMY-FIGHT-005
  const target = selectEnemyTarget(record?.role, legal, fight.encounter.rng);
  // With nowhere to stand there is always somebody in reach, and a fight with nobody
  // left standing has already ended before the turn is handed over.
  resolveOne(fight, foe.id, target
    ? { kind: Action.ATTACK, targetId: target.id, skill: record?.attack?.skill }
    : { kind: Action.PASS });
  return true;
}

/**
 * Pass this character's turn: spend the bar, resolve nothing, move on.
 *
 * Offered only to a character with nothing else available, and still taken by a press,
 * so that no turn in the game is ever taken unattended.
 *
 * @spec PRESENT-FIGHT-043
 * @spec PRESENT-FIGHT-044
 * @spec COMBAT-ACTION-009
 */
export function passTurn(fight) {
  if (fight.phase !== FightPhase.ACTING || !fight.pending?.mustPass) return false;

  resolveOne(fight, fight.pending.characterId, { kind: Action.PASS });
  return true;
}

/**
 * Move the log's view back through the fight, or forward again toward the newest line.
 *
 * Held where the player put it as new lines arrive, because a log that snapped back to
 * the newest line mid-read would be unreadable exactly when it was wanted.
 *
 * @spec PRESENT-FIGHT-031
 * @spec PRESENT-FIGHT-032
 */
export function scrollLog(fight, lines) {
  if (!fight) return false;
  const was = fight.logScroll;
  fight.logScroll = Math.max(0, Math.min(fight.log.length - 1, was + lines));
  return fight.logScroll !== was;
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
  // Waiting on a press costs no frames; only the bars and the beat move on their own.
  return !fight.pending;
}

/**
 * Run the player's clock on by the milliseconds that actually passed: the bars filling
 * and the beat between actions. Only the filling moves the fight's own time, and only
 * while nobody is up.
 *
 * @spec PRESENT-READY-005
 * @spec PRESENT-READY-006
 * @spec PRESENT-READY-008
 * @spec PRESENT-READY-024
 * @spec PRESENT-READY-032
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
      // Somebody is up, or the fight is over between one beat and the next: either
      // way the turn passes rather than the bars going on filling.
      if (readyActor(fight.encounter)
        || encounterOutcome(fight.encounter).outcome !== Outcome.ONGOING) {
        nextTurn(fight);
        return true;
      }
    }
    fight.partway = fight.fill / FILL_BEAT_MS;
    return true;
  }

  // Somebody is being asked, and nothing happens until they are answered.
  // @spec COMBAT-TURN-001
  if (fight.pending) return true;

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

  const characterId = fight.pending.characterId;

  // Choosing a target for an action already picked.
  if (fight.pending.targets) {
    const target = fight.pending.targets[index];
    if (!target) return false;
    resolveOne(fight, characterId, {
      kind: Action.ATTACK, targetId: target.id, ...attackOf(fight.encounter, characterId),
    });
    return true;
  }

  const option = fight.pending.options[index];
  if (!option) return false;
  // A greyed option is drawn but inert: pressing it does nothing and says nothing.
  // @spec PRESENT-FIGHT-035
  if (!option.available) return false;

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

  // Every remaining option needs a target, so reaching here means there was none to
  // offer — which optionsFor would have greyed.
  return false;
}

/**
 * Back out of a half-made choice. A turn belongs to one character and resolves the
 * instant it is taken, so there is nothing behind this one to reach back to.
 *
 * @spec PRESENT-FIGHT-009
 */
export function goBack(fight) {
  if (fight.phase !== FightPhase.ACTING || !fight.pending) return false;

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
