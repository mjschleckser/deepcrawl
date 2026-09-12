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
import { hitTest } from './geometry.js';
import { buildViewPlan } from './viewplan.js';
import { buildMapPlan } from './mapplan.js';

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

export function createController({ state, viewport, onDraw }) {
  const controller = { state, viewport, onDraw, expanded: false };
  onDraw(layers(controller));
  return controller;
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
export function layers(controller) {
  const { state, viewport, expanded } = controller;
  return [
    { name: 'view', plan: buildViewPlan(corridorAhead(state), viewport) },
    { name: 'map', plan: buildMapPlan(automapView(state), viewport, { expanded }) },
    // The prompt is read from the simulation's pending confirmation, so one can never
    // be shown for a confirmation that is not actually pending.
    { name: 'hud', plan: { prompt: state.pendingConfirmation ?? null, viewport } },
  ];
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
  if (stateSignature(controller.state) === before) return false;

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
export function pressKey(controller, key) {
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
export function pressPointer(controller, px, py) {
  if (controller.state.pendingConfirmation) return false;
  const region = hitTest(controller.viewport, px, py);
  if (!region) return false;
  return applyAction(controller, actionForTouch(region));
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
export function resize(controller, viewport) {
  controller.viewport = viewport;
  redraw(controller);
}
