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
  encounterOutcome, nextActor, takeAction, attemptFlee,
  fleeCertainToFail, turnOrder, hitDamage,
} from '../sim/combat.js';
import { selectEnemyTarget } from '../sim/enemies.js';
import { weaponOf } from '../sim/items.js';

export const FightPhase = { ACTING: 'ACTING', ENDED: 'ENDED' };

/**
 * The pause before an enemy takes its turn, in real milliseconds, and how long a judder
 * lasts. It has nothing to do with the fight's own time, which never plays out on
 * screen.
 *
 * It is the only wait in a fight, and it is what stops the enemies' turns landing
 * between two frames and arriving as a wall of text nobody watched happen.
 *
 * @spec PRESENT-READY-005
 * @spec PRESENT-READY-006
 */
export const BEAT_MS = 350;

/** How many turns the strip along the top of the screen shows. */
export const TURN_STRIP_LENGTH = 8;

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
const SCROLLBAR_WIDTH = 6;

/** A tile in the turn strip, and how much larger whoever acts now is drawn. */
const STRIP_TILE = 36;
const STRIP_GAP = 4;
const STRIP_CURRENT_SCALE = 1.3;

/** One entry of a menu, and the room around entries. */
const MENU_ENTRY_HEIGHT = 44;
const MENU_ENTRY_WIDTH = 230;
const MENU_GAP = 4;

/** One combatant, at the scale the phone layout was designed against. */
const ROW_HEIGHT = 34;
const ROW_GAP = 5;
const CARD_GAP = 8;
/** The portrait is square and as tall as the row, so a column stays aligned. */
const PORTRAIT_GAP = 4;
/** Two bars, stacked, with a hairline between them. */
const BAR_GAP = 1;

const nameOf = (encounter, id) =>
  roster(encounter.party).find((c) => c.id === id)?.name
  ?? encounter.enemies.members.find((e) => e.id === id)?.name
  ?? id;

/**
 * The turn strip's place on the screen, and the size of a tile in it. Sized from the
 * column alone, so it stays put all encounter.
 *
 * @spec PRESENT-FIGHT-026
 */
function stripMetrics(column, scale) {
  const pad = CARD_GAP * scale;
  const gap = STRIP_GAP * scale;
  const room = column.width - pad * 2 - gap * (TURN_STRIP_LENGTH - 1);
  const tile = Math.min(STRIP_TILE * scale, room / (TURN_STRIP_LENGTH - 1 + STRIP_CURRENT_SCALE));
  const current = tile * STRIP_CURRENT_SCALE;
  return {
    tile, current, gap,
    box: { x: column.x, y: pad, width: column.width, height: current },
  };
}

/**
 * The strip of turns along the top of the screen: read, never pressed, so it carries no
 * hit region. The order is the simulation's and is only laid out here.
 *
 * @spec PRESENT-STRIP-001
 * @spec PRESENT-STRIP-002
 * @spec PRESENT-STRIP-003
 * @spec PRESENT-STRIP-004
 * @spec PRESENT-STRIP-005
 * @spec PRESENT-STRIP-006
 * @spec PRESENT-STRIP-007
 * @spec PRESENT-STRIP-008
 * @spec PRESENT-STRIP-009
 * @spec PRESENT-STRIP-010
 */
function layOutStrip(encounter, phase, metrics, scale) {
  const { box, tile, current, gap } = metrics;
  const turns = phase === FightPhase.ENDED ? [] : turnOrder(encounter, TURN_STRIP_LENGTH);
  let x = box.x + CARD_GAP * scale;

  const tiles = turns.map(({ id, side }, i) => {
    const hero = roster(encounter.party).find((c) => c.id === id);
    const who = hero ?? encounter.enemies.members.find((e) => e.id === id);
    const size = i === 0 ? current : tile;
    const drawn = {
      id, side,
      portrait: who.portrait ?? null,
      mark: hero ? hero.name.charAt(0).toUpperCase() : null,
      current: i === 0,
      x,
      y: box.y + (box.height - size) / 2,
      size,
    };
    x += size + gap;
    return drawn;
  });

  return { box, tiles };
}

/**
 * Lay a side out as one column: a portrait, and two bars stacked beside it.
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
  const barHeight = (height - barGap) / 2;
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
      // Who they are above, how they are doing beneath. One filled bar to a card, so
      // there is never a second to mistake it for.
      bars: { identity: bar(0), health: bar(1) },
    };
  });
}

/**
 * What an attack trains: the skill of the weapon being used, which is the same weapon
 * that decides the damage and the accuracy.
 *
 * @spec COMBAT-ACTION-008
 * @spec COMBAT-ACTION-010
 */
const attackOf = (encounter, id) => ({
  skill: weaponOf(character(encounter.party, id))?.skill ?? Skill.BLADE,
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
    shakingId = null, shake = 0,
    logScroll = 0,
  } = {},
) {
  const scale = uiScale(viewport);
  const column = contentColumn(viewport);
  const pad = CARD_GAP * scale;

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
  const metrics = controlMetrics({ column, scale });
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
  const strip = stripMetrics(column, scale);
  const { menu, controls } = fightControls({
    bounds, pending, banner, metrics, top: controlsBox.y, scale,
    ceiling: strip.box.y + strip.box.height,
  });

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
    strip: layOutStrip(encounter, phase, strip, scale),
    enemies: laidEnemies,
    party: laidParty,
    pending,
    // Who the next press belongs to, or nothing at all while nothing waits: a prompt
    // over a fight that is playing invites a press nothing is listening for.
    // @spec PRESENT-READY-013
    // @spec PRESENT-READY-014
    prompt: pending ? `${nameOf(encounter, pending.characterId)} is ready to act!` : null,
    log: shownLog,
    banner,
    menu,
    // Drawn and tapped are one thing: a fight nobody can touch is a fight a phone
    // player can watch and not play.
    controls,
  };
}

/**
 * How much room the controls need, and how they divide the column. Worked out before
 * the panel is sized, because the panel is sized to fit them. The four always share one
 * row: a further choice opens as a menu over the panel, so nothing is reserved for it.
 *
 * @spec PRESENT-FIGHT-045
 */
function controlMetrics({ column, scale }) {
  const gap = 8 * scale;
  const buttonHeight = Math.max(MIN_TAP_PX, 52 * scale);
  const columns = OPTION_SLOTS.length;

  return {
    gap, buttonHeight, columns,
    width: Math.max(MIN_TAP_PX, (column.width - gap * (columns + 1)) / columns),
    height: buttonHeight,
  };
}

/**
 * Lay a menu out rising from the button that opened it: one column while that fits
 * beneath the turn strip, and as many as it takes when it does not. Laid over the panel
 * and moving nothing in it.
 *
 * @spec PRESENT-MENU-003
 * @spec PRESENT-MENU-004
 * @spec PRESENT-MENU-006
 * @spec PRESENT-MENU-007
 * @spec PRESENT-MENU-008
 * @spec PRESENT-MENU-016
 * @spec PRESENT-MENU-018
 */
function layOutMenu({ pending, opener, bounds, ceiling, metrics, scale }) {
  const gap = MENU_GAP * scale;
  const inset = metrics.gap;
  const entryHeight = Math.max(MIN_TAP_PX, MENU_ENTRY_HEIGHT * scale);
  const count = pending.targets.length;
  const foot = opener.y - metrics.gap;

  const fits = Math.floor((foot - ceiling - gap) / (entryHeight + gap));
  const columns = Math.ceil(count / Math.max(1, fits));
  const rows = Math.ceil(count / columns);
  const room = bounds.width - inset * 2 - gap * (columns + 1);
  const entryWidth = Math.min(MENU_ENTRY_WIDTH * scale, room / columns);

  const width = columns * (entryWidth + gap) + gap;
  const height = rows * (entryHeight + gap) + gap;
  const box = {
    x: Math.max(bounds.x + inset, Math.min(opener.x, bounds.x + bounds.width - inset - width)),
    y: foot - height,
    width,
    height,
  };

  const entries = pending.targets.map((target, index) => ({
    kind: ControlKind.BUTTON,
    role: 'TARGET',
    entryIndex: index,
    label: target.name,
    detail: `${target.hitPoints}/${target.maxHitPoints}`,
    preview: String(target.damage),
    weapon: target.weapon,
    available: true,
    reason: null,
    hint: null,
    x: box.x + gap + Math.floor(index / rows) * (entryWidth + gap),
    y: box.y + gap + (index % rows) * (entryHeight + gap),
    width: entryWidth,
    height: entryHeight,
  }));

  return { menu: { box, openedBy: pending.openedBy }, entries };
}

/**
 * A control per option on offer, and an entry for anything an open menu is asking.
 *
 * Every option is drawn whether or not it can be taken: an unavailable one keeps its
 * slot, loses its key hint to the reason it cannot be pressed, and does nothing. When
 * none of the four can be taken, a Pass turn control is laid over them — over, not
 * instead of, because the four underneath are the explanation for why it is there.
 *
 * @spec PRESENT-MENU-005
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
function fightControls({ bounds, pending, banner, metrics, top, ceiling, scale }) {
  const { gap, buttonHeight, width } = metrics;

  if (banner) {
    const bannerWidth = Math.min(banner.bounds.width - gap * 2, 320 * (buttonHeight / 52));
    return {
      menu: null,
      controls: [{
        kind: ControlKind.BUTTON, role: 'DISMISS', label: 'Onward', hint: 'Enter',
        x: banner.bounds.x + (banner.bounds.width - bannerWidth) / 2,
        y: banner.bounds.y + banner.bounds.height - buttonHeight - gap,
        width: bannerWidth, height: buttonHeight,
      }],
    };
  }
  if (!pending) return { menu: null, controls: [] };

  const controls = pending.options.map((choice, index) => ({
    kind: ControlKind.BUTTON,
    role: 'OPTION',
    optionIndex: index,
    label: choice.label,
    // What cannot be pressed says so, and says why in the place the key would sit.
    available: choice.available,
    reason: choice.available ? null : choice.reason,
    hint: choice.available ? String(index + 1) : null,
    open: Boolean(pending.targets) && pending.openedBy === index,
    x: bounds.x + gap + index * (width + gap),
    y: top,
    width, height: buttonHeight,
  }));

  // Laid across the row it covers, so the four greyed options stay readable beneath it.
  if (!pending.targets && pending.mustPass) {
    const count = pending.options.length;
    controls.push({
      kind: ControlKind.BUTTON, role: 'PASS', label: 'Pass turn', hint: 'Enter',
      overlay: true,
      x: bounds.x + gap,
      y: top,
      width: Math.max(MIN_TAP_PX, count * width + (count - 1) * gap),
      height: buttonHeight,
    });
  }

  if (!pending.targets) return { menu: null, controls };

  const { menu, entries } = layOutMenu({
    pending, opener: controls[pending.openedBy], bounds, ceiling, metrics, scale,
  });
  return { menu, controls: [...controls, ...entries] };
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

/**
 * @spec PRESENT-FIGHT-007
 * @spec PRESENT-MENU-017
 */
function targetsFor(encounter, characterId, action) {
  if (action !== FightAction.ATTACK) return null;
  const weapon = attackOf(encounter, characterId).skill;
  return attackTargets(encounter, characterId).map((t) => ({
    id: t.id, name: t.name, hitPoints: t.hitPoints, maxHitPoints: t.maxHitPoints,
    damage: hitDamage(encounter, characterId, t.id),
    weapon,
  }));
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
    // The player's clocks, in milliseconds: how far into the pause before an enemy's
    // turn, and how long the shake has been running.
    beat: 0,
    shake: 0,
    shakingId: null,
    // How far back through the log the player has scrolled, in lines. Zero is the
    // newest line, which is where it stays until they take it somewhere else.
    // @spec PRESENT-FIGHT-032
    logScroll: 0,
  };

  nextTurn(fight);
  return fight;
}

/**
 * Hand the turn to whoever acts next, running the fight's time straight on to them. A
 * party member is asked at once; an enemy is left standing for the pause that plays it.
 *
 * @spec COMBAT-TIME-003
 * @spec COMBAT-TIME-009
 * @spec PRESENT-FIGHT-005
 * @spec PRESENT-READY-034
 * @spec PRESENT-READY-035
 */
function nextTurn(fight) {
  const result = encounterOutcome(fight.encounter);
  if (result.outcome !== Outcome.ONGOING) return end(fight, result);

  const actor = nextActor(fight.encounter);
  fight.actor = actor;
  if (actor.side !== 'PARTY') {
    fight.pending = null;
    fight.beat = 0;
    return;
  }
  ask(fight, actor.id);
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
    openedBy: null,
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
  // Waiting on a press costs no frames; only the pause moves on its own.
  return !fight.pending;
}

/**
 * Run the player's clock on by the milliseconds that actually passed: the pause before
 * an enemy's turn, and any judder still decaying. None of it moves the fight's own time.
 *
 * @spec PRESENT-READY-005
 * @spec PRESENT-READY-006
 * @spec PRESENT-READY-008
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
 * While a menu is open the nth thing on offer is its nth entry, not the nth option.
 *
 * @spec PRESENT-FIGHT-013
 * @spec PRESENT-FIGHT-037
 * @spec PRESENT-MENU-002
 * @spec PRESENT-MENU-008
 * @spec PRESENT-MENU-014
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
  // Asked however few there are, so a press on Attack means the same thing on every turn.
  if (targets?.length > 0) {
    fight.pending = { ...fight.pending, action: option.action, targets, openedBy: index };
    return true;
  }

  // Every remaining option needs a target, so reaching here means there was none to
  // offer — which optionsFor would have greyed.
  return false;
}

/**
 * Press one of the four on the row. With no menu open that is choosing it. With one
 * open, the button that opened it closes it, a greyed one stays inert, and any other
 * closes it and goes on as though it had never been open.
 *
 * @spec PRESENT-MENU-009
 * @spec PRESENT-MENU-010
 * @spec PRESENT-MENU-011
 */
export function pressOption(fight, index) {
  if (fight.phase !== FightPhase.ACTING || !fight.pending) return false;
  if (!fight.pending.targets) return chooseOption(fight, index);

  if (!fight.pending.options[index]?.available) return false;
  const opener = fight.pending.openedBy === index;
  goBack(fight);
  return opener || chooseOption(fight, index);
}

/**
 * Close an open menu. A turn belongs to one character and resolves the instant it is
 * taken, so there is nothing behind this one to reach back to.
 *
 * @spec PRESENT-FIGHT-009
 * @spec PRESENT-MENU-009
 */
export function goBack(fight) {
  if (fight.phase !== FightPhase.ACTING || !fight.pending) return false;

  if (fight.pending.targets) {
    fight.pending = { ...fight.pending, action: null, targets: null, openedBy: null };
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
