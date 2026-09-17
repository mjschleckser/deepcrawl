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
  litSource,
  perform,
  resolveConfirmation,
  PartyAction,
} from '../sim/exploration.js';
import { hitTest, controlsFor, uiScale, versionStamp } from './geometry.js';
import { APP_VERSION } from '../version.js';
import { buildPromptPlan } from './promptplan.js';
import { buildViewPlan } from './viewplan.js';
import { buildMapPlan } from './mapplan.js';
import {
  buildFightPlan, createFightController, chooseOption, goBack, dismissOutcome,
  advanceClock, fightIsPlaying, cancelProposal, FightPhase,
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
  const source = litSource(state);
  const discovered = [...state.discoveredTiles.values()].reduce((n, set) => n + set.size, 0);
  return [
    floorId,
    tile.x,
    tile.y,
    facing,
    state.ticks,
    discovered,
    state.discoveredEdges.size,
    source ? `${source.id}:${source.remainingTicks}` : 'dark',
    state.pendingConfirmation ? state.pendingConfirmation.kind : 'none',
  ].join('|');
}

export function createController({ state, viewport, onDraw, campaign = null }) {
  const controller = {
    state, viewport, onDraw, campaign,
    expanded: false, fight: null,
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
      countdown: fight.countdown,
    });
    return [
      { name: 'view', plan: buildViewPlan(corridorAhead(state), viewport) },
      { name: 'map', plan: null },
      { name: 'fight', plan: fightPlan },
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
  const controls = state.pendingConfirmation
    ? []
    : controlsFor(viewport, { pressedRegion: controller.pressedRegion });

  return [
    { name: 'view', plan: buildViewPlan(corridorAhead(state), viewport) },
    { name: 'map', plan: buildMapPlan(automapView(state), viewport, { expanded }) },
    { name: 'fight', plan: null },
    // The prompt is read from the simulation's pending confirmation, so one can never
    // be shown for a confirmation that is not actually pending.
    {
      name: 'hud',
      plan: {
        prompt: buildPromptPlan(state.pendingConfirmation ?? null, viewport),
        viewport,
        // @spec PRESENT-CTRL-013
        scale: uiScale(viewport),
        // Nothing to walk toward while a prompt stands, so the walking controls go.
        controls,
        stamp: stampFor(viewport, controls),
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
  if (action.partyAction === PartyAction.TOGGLE_MAP) {
    controller.expanded = !controller.expanded;
    redraw(controller);
    return true;
  }

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
    const control = hit(plan.controls, px, py);
    if (!control) return false;

    if (control.role === 'DISMISS') return pressKeyInFight(controller, 'Enter');
    if (control.role === 'BACK') return pressKeyInFight(controller, 'Escape');
    return pressKeyInFight(controller, String(control.optionIndex + 1));
  }

  if (controller.state.pendingConfirmation) {
    const plan = buildPromptPlan(controller.state.pendingConfirmation, controller.viewport);
    const control = hit(plan?.controls, px, py);
    if (!control) return false;
    return answerPrompt(controller, control.accepted);
  }

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
