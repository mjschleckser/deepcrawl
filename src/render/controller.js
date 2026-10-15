/**
 * The presentation controller: routes input into the simulation, decides when the
 * screen needs redrawing, and assembles the draw plans for each layer.
 *
 * Holds no game state. Its only fields are the simulation it draws, the viewport it
 * draws into, and whether the map is expanded — which is a property of the view, not
 * of the game.
 */

import { actionForKey, actionForTouch } from '../sim/input.js';
import {
  automapView,
  corridorAhead,
  perform,
  resolveConfirmation,
  setMenuOpen,
  PartyAction,
} from '../sim/exploration.js';
import { roster } from '../sim/party.js';
import { buildPartyPlan, pageFor, PartyControl } from './partyplan.js';
import { hitTest, controlsFor, uiScale, versionStamp } from './geometry.js';
import { APP_VERSION } from '../version.js';
import { buildPromptPlan } from './promptplan.js';
import { buildViewPlan } from './viewplan.js';
import { buildMapPlan } from './mapplan.js';
import {
  buildFightPlan, createFightController, chooseOption, goBack, dismissOutcome, passTurn,
  advanceClock, fightIsPlaying, scrollLog, FightPhase,
} from './fight.js';

const CONFIRM_KEYS = ['Enter', ' '];
const DECLINE_KEYS = ['Escape'];

/**
 * Everything about the simulation that the screen depends on. Comparing this before
 * and after an action is how a blocked step — which changes nothing — avoids costing
 * a redraw.
 *
 * @spec PRESENT-SCENE-005
 */
function stateSignature(state) {
  const { floorId, tile, facing } = state.party;
  const discovered = [...state.discoveredTiles.values()].reduce((n, set) => n + set.size, 0);
  return [
    floorId,
    tile.x,
    tile.y,
    facing,
    state.ticks,
    discovered,
    state.discoveredEdges.size,
    state.pendingConfirmation ? state.pendingConfirmation.kind : 'none',
  ].join('|');
}

/** @spec PRESENT-SCENE-007 */
export function createController({ state, viewport, onDraw, campaign = null }) {
  const controller = {
    state, viewport, onDraw, campaign,
    expanded: false, fight: null,
    // The party screen, when open: which character's page is showing. A view of the
    // party like the expanded map is a view of the floor, so it lives here.
    partyScreen: null,
    // Which control the finger is currently on, so it can be outlined while held.
    pressedRegion: null,
  };
  syncFight(controller);
  onDraw(layers(controller));
  return controller;
}

/**
 * A fight begins and ends in the simulation; the renderer only follows it.
 *
 * @spec PRESENT-FIGHT-001
 */
function syncFight(controller) {
  const encounter = controller.campaign?.encounter ?? null;
  if (!encounter) {
    controller.fight = null;
    return;
  }
  if (!controller.fight || controller.fight.encounter !== encounter) {
    controller.fight = createFightController({
      encounter, viewport: controller.viewport, onDraw: () => {},
    });
  }
}

/**
 * Build every layer fresh. A corridor is a few dozen polygons and a map a few hundred
 * cells, so rebuilding costs less thought than reconciling — and removes the class of
 * bug where the screen disagrees with the state because an update was missed.
 *
 * @spec PRESENT-SCENE-001
 * @spec PRESENT-SCENE-006
 * @spec PRESENT-PROMPT-001
 * @spec PRESENT-PROMPT-002
 */
/**
 * Every drawing names every layer. A layer with nothing to show gets an empty drawing
 * rather than being left out, because a layer nobody names is a layer nobody clears,
 * and what it drew last stays on the screen.
 *
 * @spec PRESENT-SCENE-001
 * @spec PRESENT-SCENE-006
 * @spec PRESENT-SCENE-010
 */
export function layers(controller) {
  // Read the simulation, never a cache of it: a drawing derived from a stale flag is a
  // drawing of something that is no longer true.
  syncFight(controller);
  const { state, viewport, expanded, fight } = controller;
  if (fight) {
    const fightPlan = buildFightPlan(fight.encounter, viewport, {
      phase: fight.phase,
      outcome: fight.outcome,
      pending: fight.pending,
      log: fight.log,
      actor: fight.actor,
      shakingId: fight.shakingId,
      shake: fight.shake,
      partway: fight.partway,
      logScroll: fight.logScroll,
    });
    return [
      { name: 'view', plan: buildViewPlan(corridorAhead(state), viewport) },
      { name: 'map', plan: null },
      { name: 'fight', plan: fightPlan },
      { name: 'party', plan: null },
      {
        name: 'hud',
        plan: {
          prompt: null,
          viewport,
          scale: uiScale(viewport),
          controls: [],
          // The fight's own panel is what stands in the corner during a fight.
          stamp: stampFor(viewport, [fightPlan.bounds]),
        },
      },
    ];
  }
  const sheet = partyPlan(controller);
  // Nothing to walk toward while a prompt stands or the party screen is up, so the
  // walking controls and the action bar go.
  // @spec PRESENT-PARTY-006
  const controls = state.pendingConfirmation || sheet
    ? []
    : controlsFor(viewport, { pressedRegion: controller.pressedRegion });

  return [
    { name: 'view', plan: buildViewPlan(corridorAhead(state), viewport) },
    { name: 'map', plan: buildMapPlan(automapView(state), viewport, { expanded }) },
    { name: 'fight', plan: null },
    { name: 'party', plan: sheet },
    // The prompt is read from the simulation's pending confirmation, so one can never
    // be shown for a confirmation that is not actually pending.
    {
      name: 'hud',
      plan: {
        prompt: buildPromptPlan(state.pendingConfirmation ?? null, viewport),
        viewport,
        // @spec PRESENT-CTRL-013
        scale: uiScale(viewport),
        controls,
        stamp: stampFor(viewport, sheet ? [sheet.bounds] : controls),
      },
    },
  ];
}

/**
 * Which build this is, in the corner. Placed here rather than while drawing, like
 * every other position.
 *
 * @spec PRESENT-BUILD-001
 * @spec PRESENT-BUILD-003
 * @spec PRESENT-BUILD-006
 */
function stampFor(viewport, controls) {
  return versionStamp({ viewport, controls, text: APP_VERSION, scale: uiScale(viewport) });
}

function redraw(controller) {
  controller.onDraw(layers(controller));
}

/** The party the screen reads, straight from the campaign. */
const partyOf = (controller) => controller.campaign?.party ?? null;

/** The open page, or nothing while the screen is shut. */
function partyPlan(controller) {
  const party = partyOf(controller);
  if (!controller.partyScreen || !party) return null;
  return buildPartyPlan(party, controller.viewport, { page: controller.partyScreen.page });
}

/**
 * Open the party screen on the first character. Changes nothing that is true, so the
 * simulation is told only that a menu is up, which is what stops its clock.
 *
 * @spec PRESENT-PARTY-001
 * @spec PRESENT-PARTY-003
 * @spec PRESENT-PARTY-004
 * @spec PRESENT-PARTY-005
 * @spec PRESENT-PARTY-008
 */
function openPartyScreen(controller) {
  const party = partyOf(controller);
  if (controller.fight || controller.state.pendingConfirmation) return false;
  if (!party || roster(party).length === 0) return false;
  controller.partyScreen = { page: 0 };
  setMenuOpen(controller.state, true);
  redraw(controller);
  return true;
}

/**
 * @spec PRESENT-PARTY-002
 * @spec PRESENT-PARTY-004
 */
function closePartyScreen(controller) {
  controller.partyScreen = null;
  setMenuOpen(controller.state, false);
  redraw(controller);
  return true;
}

/** Turn to a page, wrapping at either end of the party. */
function showPage(controller, page) {
  const count = roster(partyOf(controller)).length;
  controller.partyScreen.page = pageFor(partyOf(controller), ((page % count) + count) % count);
  redraw(controller);
  return true;
}

/**
 * While the party screen is up it owns the keyboard: paging, closing, and nothing else.
 *
 * @spec PRESENT-PARTY-002
 * @spec PRESENT-PARTY-006
 * @spec PRESENT-PARTY-009
 * @spec PRESENT-PARTY-010
 * @spec PRESENT-PARTY-011
 */
function pressKeyOnPartyScreen(controller, key) {
  const { page } = controller.partyScreen;
  if (key === 'Escape' || key === 'p' || key === 'P') return closePartyScreen(controller);
  if (key === 'ArrowRight' || key === 'd' || key === 'D') return showPage(controller, page + 1);
  if (key === 'ArrowLeft' || key === 'a' || key === 'A') return showPage(controller, page - 1);

  const number = Number.parseInt(key, 10);
  if (String(number) === key && number >= 1 && number <= roster(partyOf(controller)).length) {
    return showPage(controller, number - 1);
  }
  return false;
}

/** A press on the open screen: its own controls, and nothing beneath it. */
function pressPointerOnPartyScreen(controller, px, py) {
  const control = hit(partyPlan(controller)?.controls, px, py);
  if (!control) return false;
  const { page } = controller.partyScreen;
  if (control.role === PartyControl.CLOSE) return closePartyScreen(controller);
  if (control.role === PartyControl.NEXT) return showPage(controller, page + 1);
  if (control.role === PartyControl.PREVIOUS) return showPage(controller, page - 1);
  return false;
}

/**
 * Run an action and redraw only if it moved the world.
 *
 * @spec PRESENT-SCENE-003
 * @spec PRESENT-SCENE-005
 */
function applyAction(controller, action) {
  if (!action) return false;

  // The map is the one action that changes how things are drawn rather than what is
  // true, so the controller answers it rather than the simulation.
  // @spec PRESENT-MAP-003
  if (action.partyAction === PartyAction.TOGGLE_MAP) {
    controller.expanded = !controller.expanded;
    redraw(controller);
    return true;
  }
  // So is the party screen: reading a character changes nothing about them.
  if (action.partyAction === PartyAction.PARTY) return openPartyScreen(controller);

  const before = stateSignature(controller.state);
  perform(controller.state, action);
  // A step can walk the party into a warband, which is a change no signature catches.
  syncFight(controller);
  if (!controller.fight && stateSignature(controller.state) === before) return false;

  redraw(controller);
  return true;
}

/**
 * @spec PRESENT-INPUT-001
 * @spec PRESENT-INPUT-003
 * @spec PRESENT-PROMPT-003
 * @spec PRESENT-PROMPT-004
 * @spec PRESENT-PROMPT-005
 */
const within = (box, px, py) =>
  px >= box.x && px <= box.x + box.width && py >= box.y && py <= box.y + box.height;

/**
 * Turn a wheel over the fight into a walk back through its log.
 *
 * @spec PRESENT-FIGHT-031
 */
export function scrollFightLog(controller, lines) {
  syncFight(controller);
  if (!controller.fight || !scrollLog(controller.fight, lines)) return false;
  redraw(controller);
  return true;
}

/**
 * While a fight is on there is nowhere to walk, so the exploration vocabulary does not
 * apply and combat has its own.
 *
 * @spec PRESENT-FIGHT-012
 * @spec PRESENT-FIGHT-013
 */
function pressKeyInFight(controller, key) {
  const fight = controller.fight;

  if (fight.phase === FightPhase.ENDED) {
    if (key !== 'Enter' && key !== ' ' && key !== 'Escape') return false;
    dismissOutcome(fight);
    // Concluding banks the pot and puts the party back in the corridor.
    controller.campaign.concludeEncounter();
    syncFight(controller);
    redraw(controller);
    return true;
  }

  if (key === 'Escape') {
    if (!goBack(fight)) return false;
    redraw(controller);
    return true;
  }

  // A character with nothing available has one press to make, and this is it.
  // @spec PRESENT-FIGHT-043
  if (key === 'Enter' || key === ' ') {
    if (!passTurn(fight)) return false;
    redraw(controller);
    return true;
  }

  const option = Number.parseInt(key, 10);
  if (!Number.isInteger(option) || option < 1) return false;
  if (!chooseOption(fight, option - 1)) return false;

  // Fleeing can end a fight outright.
  if (fight.phase === FightPhase.ENDED && fight.fled?.escaped) {
    controller.campaign.fleeEncounter();
    syncFight(controller);
  }
  redraw(controller);
  return true;
}

export function pressKey(controller, key) {
  syncFight(controller);
  if (controller.fight) return pressKeyInFight(controller, key);

  if (controller.state.pendingConfirmation) {
    // While a prompt stands, it owns the keyboard: every movement verb and party
    // action is discarded rather than queued.
    if (CONFIRM_KEYS.includes(key)) return answerPrompt(controller, true);
    if (DECLINE_KEYS.includes(key)) return answerPrompt(controller, false);
    return false;
  }
  if (controller.partyScreen) return pressKeyOnPartyScreen(controller, key);
  return applyAction(controller, actionForKey(key));
}

/**
 * @spec PRESENT-INPUT-002
 * @spec PRESENT-INPUT-003
 * @spec PRESENT-INPUT-006
 * @spec PRESENT-PROMPT-003
 */
function hit(controls, px, py) {
  return (controls ?? []).find(
    (c) => px >= c.x && px <= c.x + c.width && py >= c.y && py <= c.y + c.height,
  ) ?? null;
}

/**
 * @spec PRESENT-INPUT-002
 * @spec PRESENT-INPUT-003
 * @spec PRESENT-INPUT-006
 * @spec PRESENT-CTRL-005
 * @spec PRESENT-FIGHT-017
 */
export function pressPointer(controller, px, py) {
  syncFight(controller);

  if (controller.fight) {
    const plan = layers(controller).find((l) => l.name === 'fight').plan;

    // A press on the scrollbar's track pages the log, above the thumb or below it.
    // @spec PRESENT-FIGHT-033
    const bar = plan.scrollbar;
    if (bar && within(bar.track, px, py)) {
      scrollLog(controller.fight, py < bar.thumb.y ? bar.page : -bar.page);
      redraw(controller);
      return true;
    }

    const control = hit(plan.controls, px, py);
    if (!control) return false;

    if (control.role === 'DISMISS') return pressKeyInFight(controller, 'Enter');
    if (control.role === 'BACK') return pressKeyInFight(controller, 'Escape');
    // The one press a character with nothing to do can make.
    // @spec PRESENT-FIGHT-043
    if (control.role === 'PASS') return pressKeyInFight(controller, 'Enter');
    return pressKeyInFight(controller, String(control.optionIndex + 1));
  }

  if (controller.state.pendingConfirmation) {
    const plan = buildPromptPlan(controller.state.pendingConfirmation, controller.viewport);
    const control = hit(plan?.controls, px, py);
    if (!control) return false;
    return answerPrompt(controller, control.accepted);
  }

  // A tap outside the page lands on nothing: a stray thumb must not dismiss it.
  if (controller.partyScreen) return pressPointerOnPartyScreen(controller, px, py);

  const region = hitTest(controller.viewport, px, py);
  if (!region) return false;

  // Show it held before the action lands, so the outline is visible for the press.
  controller.pressedRegion = region;
  const acted = applyAction(controller, actionForTouch(region));
  // A blocked step changes nothing, so nothing redrew it as pressed. Draw it anyway.
  if (!acted) redraw(controller);
  return acted;
}

/**
 * The finger lifted. Whatever was outlined stops being.
 *
 * @spec PRESENT-CTRL-008
 * @spec PRESENT-CTRL-009
 */
export function releasePointer(controller) {
  if (controller.pressedRegion === null) return false;
  controller.pressedRegion = null;
  redraw(controller);
  return true;
}

/**
 * @spec PRESENT-PROMPT-004
 */
export function answerPrompt(controller, accepted) {
  resolveConfirmation(controller.state, accepted);
  redraw(controller);
  return true;
}

/**
 * @spec PRESENT-SCENE-004
 * @spec PRESENT-INPUT-005
 */
/**
 * Run the fight's pacing on by the milliseconds that really passed. The renderer calls
 * this while, and only while, something is going to happen without the player.
 *
 * @spec PRESENT-READY-005
 * @spec PRESENT-READY-008
 * @spec PRESENT-SCENE-011
 */
export function tick(controller, ms) {
  syncFight(controller);
  if (!controller.fight) return false;
  if (!advanceClock(controller.fight, ms)) return false;

  // A fight can end on a beat nobody pressed anything for.
  syncFight(controller);
  redraw(controller);
  return true;
}

/** Whether anything is going to move without the player touching the screen. */
export function isPlaying(controller) {
  return fightIsPlaying(controller.fight);
}

export function resize(controller, viewport) {
  controller.viewport = viewport;
  redraw(controller);
}
