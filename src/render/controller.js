/**
 * The presentation controller: routes input into the simulation, decides when the
 * screen needs redrawing, and assembles the draw plans for each layer.
 *
 * Holds no game state. Its only fields are the simulation it draws, the viewport it
 * draws into, and how the map is shown — which is a property of the view, not
 * of the game.
 */

import { actionForKey, actionForTouch } from '../sim/input.js';
import {
  automapView,
  corridorAhead,
  perform,
  currentFloor,
  resolveConfirmation,
  setMenuOpen,
  takeNotices,
  PartyAction,
} from '../sim/exploration.js';
import { buildChestReportPlan, buildCampReportPlan, buildMealReportPlan } from './findsplan.js';
import { buildCampPlan, CampControl, foodKinds, potItems } from './campplan.js';
import { buildSpellsPlan, openingSpellsPage, SpellsControl } from './spellsplan.js';
import { CastWhere, castOnAlly, readTome, tomeSpell } from '../sim/magic.js';
import { character, equip, roster, takeOff, useItem } from '../sim/party.js';
import { isConsumable } from '../sim/items.js';
import { buildPartyPlan, pageFor, PartyControl } from './partyplan.js';
import {
  buildItemsPlan, clampRow, itemRows, rowActs, ItemsControl,
} from './itemsplan.js';
import { Outcome } from '../sim/combat.js';
import { hitTest, controlsFor, uiScale, versionStamp, contentColumn, tapRegionsFor } from './geometry.js';
import { APP_VERSION } from '../version.js';
import { buildPromptPlan } from './promptplan.js';
import { buildViewPlan } from './viewplan.js';
import { MapMode, buildMapPlan, nextMapMode } from './mapplan.js';
import {
  buildFightPlan, createFightController, chooseOption, pressOption, goBack, dismissOutcome,
  passTurn, equipInFight, useInFight, closeItems,
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

/** A key, whatever its case. */
const keyIs = (key, ...names) => names.includes(key) || names.includes(key.toLowerCase());

/** @spec PRESENT-SCENE-007 */
export function createController({
  state, viewport, onDraw, campaign = null, onBeginAgain = () => {}, onToggleTesting = () => {},
}) {
  const controller = {
    state, viewport, onDraw, campaign, onBeginAgain, onToggleTesting,
    // The map opens large: it is what the player is building.
    // @spec PRESENT-MAP-013
    mapMode: MapMode.EXPANDED, fight: null,
    // Anything worth saying about the save, beside the stamp.
    saveNote: null,
    // What the chest just opened held, while its report is up.
    chestFind: null,
    // How the last camp ended, while its report is up.
    campReport: null,
    // The camp screen while it is open: what is in the pot, the highlighted row, and
    // what was foraged.
    campScreen: null,
    // The last meal, while its report is up.
    mealReport: null,
    // Who just grew hungrier, until the player next acts.
    hungerNotice: null,
    // The Spells screen, when open: whose page, which row, and a spell awaiting a target.
    // @spec PRESENT-SPELLS-003
    spellsScreen: null,
    // Whether a newer build is installed and waiting for the player to refresh.
    newBuild: false,
    // The party screen, when open: which character's page is showing. A view of the
    // party like the expanded map is a view of the floor, so it lives here.
    partyScreen: null,
    // The Items screen, when open out of a fight: which page, and which row is
    // highlighted. In a fight the fight says whether it is open; the highlight is still
    // kept here.
    // @spec PRESENT-ITEMS-003
    itemsScreen: null,
    // Which control the finger is currently on, so it can be outlined while held.
    pressedRegion: null,
  };
  syncFight(controller);
  onDraw(layers(controller));
  return controller;
}

/**
 * Put a new campaign in the old one's place, along with everything that was a view of it.
 *
 * @spec SAVE-NEW-001
 */
export function replaceCampaign(controller, campaign) {
  controller.campaign = campaign;
  controller.state = campaign.state;
  controller.fight = null;
  controller.partyScreen = null;
  controller.itemsScreen = null;
  controller.spellsScreen = null;
  controller.campReport = null;
  controller.campScreen = null;
  controller.mealReport = null;
  controller.hungerNotice = null;
  controller.mapMode = MapMode.EXPANDED;
  syncFight(controller);
  redraw(controller);
}

/**
 * @spec PRESENT-SAVE-001
 * @spec PRESENT-SAVE-002
 * @spec PRESENT-SAVE-003
 */
export function setSaveNote(controller, text) {
  if (controller.saveNote === text) return;
  controller.saveNote = text;
  redraw(controller);
}

/** What the stamp says once a newer build is installed. */
export const NEW_BUILD_NOTICE = 'NEW BUILD AVAILABLE';

/**
 * A newer build is installed. Say so on the stamp and nothing more: the refresh is the
 * player's to make.
 *
 * @spec PRESENT-BUILD-008
 * @spec PRESENT-BUILD-009
 */
export function setNewBuild(controller) {
  if (controller.newBuild) return;
  controller.newBuild = true;
  redraw(controller);
}


/**
 * Put the report of an opened chest away. Everything it reports is already in the pack
 * and the purse, so there is nothing to decide and nothing changes.
 *
 * @spec PRESENT-CHEST-002
 */
function closeChestReport(controller) {
  controller.chestFind = null;
  controller.campReport = null;
  controller.mealReport = null;
  redraw(controller);
  return true;
}

const CHEST_DISMISS_KEYS = ['Enter', 'Escape', ' '];
/** @spec PRESENT-CAMP-003 */
const CAMP_DISMISS_KEYS = ['Enter', 'Escape', 'r', 'R', ' '];

/**
 * On the stamp's own line, after the number: the stamp was placed at the width of both,
 * so the note moves with it and never lands on a control.
 *
 * @spec PRESENT-SAVE-001
 */
function noteFor(controller, stamp) {
  if (!controller.saveNote) return null;
  const text = controller.saveNote;
  return {
    x: stamp.noteX, y: stamp.y, size: stamp.size, text,
    width: stamp.x + stamp.width - stamp.noteX,
  };
}

/**
 * A fight begins and ends in the simulation; the renderer only follows it.
 *
 * @spec PRESENT-FIGHT-001
 */
function syncFight(controller) {
  // The highlight a fight's Items screen kept goes with the screen.
  if (controller.itemsScreen?.fromFight && !controller.fight?.pending?.items) {
    controller.itemsScreen = null;
  }
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
  const { state, viewport, mapMode, fight } = controller;
  if (fight) {
    const fightPlan = buildFightPlan(fight.encounter, viewport, {
      phase: fight.phase,
      outcome: fight.outcome,
      pending: fight.pending,
      log: fight.log,
      actor: fight.actor,
      shakingId: fight.shakingId,
      shake: fight.shake,
      logScroll: fight.logScroll,
    });
    const itemsOverFight = itemsPlan(controller);
    // The fight's own panel is what stands in the corner during a fight, and a tall
    // menu can rise past it.
    const stamp = stampFor(
      controller,
      [fightPlan.bounds, fightPlan.menu?.box, itemsOverFight?.bounds].filter(Boolean),
    );
    return [
      { name: 'view', plan: buildViewPlan(corridorAhead(state), viewport) },
      { name: 'map', plan: null },
      { name: 'fight', plan: fightPlan },
      { name: 'party', plan: null },
      { name: 'items', plan: itemsOverFight },
      { name: 'spells', plan: null },
      { name: 'camp', plan: null },
      { name: 'chest', plan: null },
      {
        name: 'hud',
        plan: {
          prompt: null,
          viewport,
          scale: uiScale(viewport),
          controls: [],
          stamp,
          note: noteFor(controller, stamp),
        },
      },
    ];
  }
  const sheet = partyPlan(controller);
  const items = itemsPlan(controller);
  const spellsScreen = spellsPlan(controller);
  const campScreen = campPlan(controller);
  const report = buildChestReportPlan(controller.chestFind, viewport)
    ?? buildCampReportPlan(controller.campReport, viewport)
    ?? buildMealReportPlan(controller.mealReport, viewport);
  const screen = sheet ?? items ?? spellsScreen ?? campScreen ?? report;
  // Nothing to walk toward while a prompt stands or a screen is up, so the walking
  // controls and the action bar go.
  // @spec PRESENT-PARTY-006
  // @spec PRESENT-ITEMS-004
  const controls = state.pendingConfirmation || screen
    ? []
    : controlsFor(viewport, { pressedRegion: controller.pressedRegion });
  const stamp = stampFor(controller, screen ? [screen.bounds] : controls);
  // A question asked by the party screen is the view's own, about ending the campaign;
  // anything else on screen is the simulation's pending confirmation.
  const asking = controller.partyScreen?.confirming
    ? { kind: controller.partyScreen.confirming }
    : state.pendingConfirmation ?? null;

  return [
    { name: 'view', plan: buildViewPlan(corridorAhead(state), viewport) },
    // @spec PRESENT-MAP-015
    {
      name: 'map',
      plan: mapMode === MapMode.HIDDEN ? null : buildMapPlan(automapView(state), viewport, { mode: mapMode }),
    },
    { name: 'fight', plan: null },
    { name: 'party', plan: sheet },
    { name: 'items', plan: items },
    { name: 'spells', plan: spellsScreen },
    { name: 'camp', plan: campScreen },
    { name: 'chest', plan: report },
    // The prompt is read from the simulation's pending confirmation, so one can never
    // be shown for a confirmation that is not actually pending.
    {
      name: 'hud',
      plan: {
        prompt: buildPromptPlan(asking, viewport),
        viewport,
        // @spec PRESENT-CTRL-013
        scale: uiScale(viewport),
        controls,
        stamp,
        note: noteFor(controller, stamp),
        // @spec PRESENT-HUNGER-001
        notice: noticeFor(controller),
      },
    },
  ];
}

/** How a stage reads in a sentence about somebody. */
const STAGE_WORDS = {
  HUNGRY: 'hungry', VERY_HUNGRY: 'very hungry', FAMISHED: 'famished', RAVENOUS: 'ravenous', STARVING: 'starving',
};

/**
 * Who grew hungrier, in a sentence a stage at a time: *Bram, Tam are hungry.*
 *
 * @spec PRESENT-HUNGER-001
 */
function hungerSentence(notices) {
  const byStage = new Map();
  for (const n of notices) byStage.set(n.stage, [...(byStage.get(n.stage) ?? []), n.name]);
  return [...byStage].map(([stage, names]) =>
    `${names.join(', ')} ${names.length > 1 ? 'are' : 'is'} ${STAGE_WORDS[stage] ?? stage.toLowerCase()}.`).join(' ');
}

/** The hunger notice across the top of the view, clear of the Map control. */
function noticeFor(controller) {
  if (!controller.hungerNotice) return null;
  const { viewport } = controller;
  const scale = uiScale(viewport);
  const column = contentColumn(viewport);
  const map = tapRegionsFor(viewport).find((r) => r.region === 'MAP');
  return {
    text: controller.hungerNotice,
    scale,
    box: { x: column.x + 8 * scale, y: map.y + map.height + 6 * scale, width: column.width - 16 * scale, height: 24 * scale },
  };
}

/** The camp screen's plan, or nothing while it is shut. */
function campPlan(controller) {
  const party = partyOf(controller);
  if (!party || !controller.campScreen) return null;
  const { pot, selected, foraged } = controller.campScreen;
  return buildCampPlan(party, controller.viewport, { pot, selected, foraged });
}

/**
 * Put one more of a food in the pot, or one fewer; pressing a row past all of it goes
 * back to none.
 *
 * @spec PRESENT-CAMP-005
 * @spec PRESENT-CAMP-006
 */
function changePot(controller, index, by, { wrap = false } = {}) {
  const party = partyOf(controller);
  const kind = foodKinds(party)[index];
  if (!kind) return false;
  const screen = controller.campScreen;
  const now = screen.pot[kind.item.id] ?? 0;
  let next = now + by;
  if (next > kind.carried) next = wrap ? 0 : kind.carried;
  if (next < 0) next = 0;
  screen.selected = index;
  if (next === now) return false;
  screen.pot = { ...screen.pot, [kind.item.id]: next };
  redraw(controller);
  return true;
}

/**
 * Cook what is in the pot: the meal is the food segment's, through the campaign, which
 * offers the pot once per camp. The screen closes and the meal is reported.
 *
 * @spec PRESENT-CAMP-008
 */
function cookCamp(controller) {
  const party = partyOf(controller);
  const items = potItems(party, controller.campScreen.pot);
  if (items.length === 0) return false;
  const meal = controller.campaign.cook(items);
  controller.campScreen = null;
  setMenuOpen(controller.state, false);
  controller.mealReport = meal;
  redraw(controller);
  return true;
}

/** @spec PRESENT-CAMP-009 */
function leaveCamp(controller) {
  controller.campaign.leaveCamp?.();
  controller.campScreen = null;
  setMenuOpen(controller.state, false);
  redraw(controller);
  return true;
}

/** @spec PRESENT-CAMP-006 */
function pressKeyOnCampScreen(controller, key) {
  const screen = controller.campScreen;
  const count = foodKinds(partyOf(controller)).length;
  if (key === 'Escape') return leaveCamp(controller);
  if (key === 'Enter' || key === ' ') return cookCamp(controller);
  if (keyIs(key, 'ArrowUp', 'w')) {
    if (screen.selected <= 0) return false;
    screen.selected -= 1;
    redraw(controller);
    return true;
  }
  if (keyIs(key, 'ArrowDown', 's')) {
    if (screen.selected >= count - 1) return false;
    screen.selected += 1;
    redraw(controller);
    return true;
  }
  if (keyIs(key, 'ArrowRight', 'd')) return changePot(controller, screen.selected, 1);
  if (keyIs(key, 'ArrowLeft', 'a')) return changePot(controller, screen.selected, -1);
  return false;
}

function pressPointerOnCampScreen(controller, px, py) {
  const control = hit(campPlan(controller)?.controls, px, py);
  if (!control) return false;
  if (control.role === CampControl.COOK) return cookCamp(controller);
  if (control.role === CampControl.LEAVE) return leaveCamp(controller);
  return changePot(controller, control.index, 1, { wrap: true });
}

/**
 * Which build this is, in the corner. Placed here rather than while drawing, like
 * every other position.
 *
 * @spec PRESENT-BUILD-001
 * @spec PRESENT-BUILD-003
 * @spec PRESENT-BUILD-006
 * @spec PRESENT-BUILD-008
 */
function stampFor(controller, controls) {
  const { viewport } = controller;
  return versionStamp({
    viewport, controls, text: APP_VERSION, scale: uiScale(viewport),
    notice: controller.newBuild ? NEW_BUILD_NOTICE : null,
    note: controller.saveNote,
  });
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
  return buildPartyPlan(party, controller.viewport, {
    page: controller.partyScreen.page, testing: Boolean(controller.campaign?.testing),
  });
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
 * The answer to *Abandon this campaign?*. Declining leaves the screen as it was.
 *
 * @spec PRESENT-PARTY-022
 * @spec PRESENT-PARTY-023
 * @spec SAVE-NEW-002
 */
function answerNewCampaign(controller, accepted) {
  const asked = controller.partyScreen.confirming;
  if (!accepted) {
    controller.partyScreen.confirming = false;
    redraw(controller);
    return true;
  }
  closePartyScreen(controller);
  // Switching testing mode begins a new campaign in the other mode.
  // @spec PRESENT-PARTY-025
  if (asked === 'TESTING_ON' || asked === 'TESTING_OFF') controller.onToggleTesting();
  else controller.onBeginAgain();
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
 * @spec PRESENT-PARTY-022
 */
function pressKeyOnPartyScreen(controller, key) {
  const { page, confirming } = controller.partyScreen;
  if (confirming) {
    if (CONFIRM_KEYS.includes(key)) return answerNewCampaign(controller, true);
    if (DECLINE_KEYS.includes(key)) return answerNewCampaign(controller, false);
    if (key === 'p' || key === 'P') return closePartyScreen(controller);
    return false;
  }
  if (key === 'Escape' || key === 'p' || key === 'P') return closePartyScreen(controller);
  if (key === 'ArrowRight' || key === 'd' || key === 'D') return showPage(controller, page + 1);
  if (key === 'ArrowLeft' || key === 'a' || key === 'A') return showPage(controller, page - 1);

  const number = Number.parseInt(key, 10);
  if (String(number) === key && number >= 1 && number <= roster(partyOf(controller)).length) {
    return showPage(controller, number - 1);
  }
  return false;
}

/**
 * A press on the open screen: its own controls, and nothing beneath it.
 *
 * @spec PRESENT-PARTY-021
 */
function pressPointerOnPartyScreen(controller, px, py) {
  if (controller.partyScreen.confirming) {
    const prompt = buildPromptPlan({ kind: controller.partyScreen.confirming }, controller.viewport);
    const answer = hit(prompt.controls, px, py);
    return answer ? answerNewCampaign(controller, answer.accepted) : false;
  }

  const control = hit(partyPlan(controller)?.controls, px, py);
  if (!control) return false;
  const { page } = controller.partyScreen;
  if (control.role === PartyControl.NEW_CAMPAIGN) {
    controller.partyScreen.confirming = 'NEW_CAMPAIGN';
    redraw(controller);
    return true;
  }
  if (control.role === PartyControl.TESTING) {
    controller.partyScreen.confirming = controller.campaign?.testing ? 'TESTING_OFF' : 'TESTING_ON';
    redraw(controller);
    return true;
  }
  if (control.role === PartyControl.CLOSE) return closePartyScreen(controller);
  if (control.role === PartyControl.NEXT) return showPage(controller, page + 1);
  if (control.role === PartyControl.PREVIOUS) return showPage(controller, page - 1);
  return false;
}

/** Whether the fight has its Items screen open. */
const itemsInFight = (controller) => Boolean(controller.fight?.pending?.items);

/** Whose page the Items screen is on, whichever way it was opened. */
function itemsCharacter(controller) {
  if (itemsInFight(controller)) return controller.fight.pending.characterId;
  const party = partyOf(controller);
  if (!controller.itemsScreen || !party) return null;
  return roster(party)[pageFor(party, controller.itemsScreen.page)]?.id ?? null;
}

/** The open page, or nothing while the screen is shut. */
function itemsPlan(controller) {
  const party = partyOf(controller);
  const characterId = itemsCharacter(controller);
  if (!party || !characterId) return null;
  const inFight = itemsInFight(controller);
  return buildItemsPlan(party, controller.viewport, {
    characterId,
    page: controller.itemsScreen?.page ?? 0,
    selected: controller.itemsScreen?.selected ?? 0,
    inFight,
    spells: controller.campaign?.spells ?? {},
  });
}

/** The catalogue every screen reads spells from. */
const spellsOf = (controller) => controller.campaign?.spells ?? {};

/** The Spells screen's open page, or nothing while it is shut. */
function spellsPlan(controller) {
  const party = partyOf(controller);
  const screen = controller.spellsScreen;
  if (!party || !screen) return null;
  return buildSpellsPlan(party, controller.viewport, {
    page: screen.page, selected: screen.selected, spellId: screen.spellId, spells: spellsOf(controller),
  });
}

/**
 * Open the Spells screen on the first character who can cast out of a fight. Browsing
 * it changes nothing, so the simulation is told only that a menu is up.
 *
 * @spec PRESENT-SPELLS-001
 * @spec PRESENT-SPELLS-003
 */
function openSpellsScreen(controller) {
  const party = partyOf(controller);
  if (controller.fight || controller.state.pendingConfirmation) return false;
  if (!party || roster(party).length === 0) return false;
  controller.spellsScreen = { page: openingSpellsPage(party, spellsOf(controller)), selected: 0, spellId: null };
  setMenuOpen(controller.state, true);
  redraw(controller);
  return true;
}

/**
 * Close the screen, or, while a spell awaits a target, go back to the list of spells.
 *
 * @spec PRESENT-SPELLS-002
 * @spec PRESENT-SPELLS-008
 */
function backOutOfSpells(controller) {
  const screen = controller.spellsScreen;
  if (screen.spellId) {
    screen.spellId = null;
    screen.selected = 0;
  } else {
    controller.spellsScreen = null;
    setMenuOpen(controller.state, false);
  }
  redraw(controller);
  return true;
}

/** @spec PRESENT-SPELLS-002 */
function showSpellsPage(controller, page) {
  const screen = controller.spellsScreen;
  if (screen.spellId) return false;
  const count = roster(partyOf(controller)).length;
  screen.page = ((page % count) + count) % count;
  screen.selected = 0;
  redraw(controller);
  return true;
}

function moveSpellsHighlight(controller, by) {
  const screen = controller.spellsScreen;
  const rows = spellsPlan(controller)?.entries.filter((e) => e.kind === 'ROW') ?? [];
  const next = Math.max(0, Math.min(rows.length - 1, screen.selected + by));
  if (rows.length === 0 || next === screen.selected) return false;
  screen.selected = next;
  redraw(controller);
  return true;
}

/**
 * Press a row: choose a spell, then whom to cast it on. Casting is a committed party
 * action, a tick as well as a slot, and the page goes back to its spells.
 *
 * @spec PRESENT-SPELLS-006
 * @spec PRESENT-SPELLS-007
 */
function pressSpellsRow(controller, index) {
  const party = partyOf(controller);
  const screen = controller.spellsScreen;
  const plan = spellsPlan(controller);
  const row = plan?.entries.find((e) => e.kind === 'ROW' && e.index === index);
  if (!row || !row.available) return false;
  if (!screen.spellId) {
    screen.spellId = row.id;
    screen.selected = 0;
    redraw(controller);
    return true;
  }
  const spell = spellsOf(controller)[screen.spellId];
  const cast = castOnAlly(party, plan.characterId, spell, row.id, { where: CastWhere.EXPLORATION });
  if (!cast) return false;
  perform(controller.state, { partyAction: PartyAction.SPELLS, commit: true });
  screen.spellId = null;
  screen.selected = 0;
  redraw(controller);
  return true;
}

/** @spec PRESENT-SPELLS-002 */
function pressKeyOnSpellsScreen(controller, key) {
  const screen = controller.spellsScreen;
  if (keyIs(key, 'Escape', 'c')) return backOutOfSpells(controller);
  if (keyIs(key, 'ArrowUp', 'w')) return moveSpellsHighlight(controller, -1);
  if (keyIs(key, 'ArrowDown', 's')) return moveSpellsHighlight(controller, 1);
  if (key === 'Enter' || key === ' ') return pressSpellsRow(controller, screen.selected);
  if (keyIs(key, 'ArrowRight', 'd')) return showSpellsPage(controller, screen.page + 1);
  if (keyIs(key, 'ArrowLeft', 'a')) return showSpellsPage(controller, screen.page - 1);
  return false;
}

function pressPointerOnSpellsScreen(controller, px, py) {
  const control = hit(spellsPlan(controller)?.controls, px, py);
  if (!control) return false;
  const screen = controller.spellsScreen;
  if (control.role === SpellsControl.CLOSE) return backOutOfSpells(controller);
  if (control.role === SpellsControl.NEXT) return showSpellsPage(controller, screen.page + 1);
  if (control.role === SpellsControl.PREVIOUS) return showSpellsPage(controller, screen.page - 1);
  return pressSpellsRow(controller, control.index);
}

/**
 * Open the Items screen on the first character. Like the party screen it changes
 * nothing that is true, so the simulation is told only that a menu is up.
 *
 * @spec PRESENT-ITEMS-001
 * @spec PRESENT-ITEMS-003
 */
function openItemsScreen(controller) {
  const party = partyOf(controller);
  if (controller.fight || controller.state.pendingConfirmation) return false;
  if (!party || roster(party).length === 0) return false;
  controller.itemsScreen = { page: 0, selected: 0 };
  setMenuOpen(controller.state, true);
  redraw(controller);
  return true;
}

/**
 * @spec PRESENT-ITEMS-002
 * @spec PRESENT-ITEMS-014
 */
function closeItemsScreen(controller) {
  if (itemsInFight(controller)) {
    closeItems(controller.fight);
    controller.itemsScreen = null;
    redraw(controller);
    return true;
  }
  controller.itemsScreen = null;
  setMenuOpen(controller.state, false);
  redraw(controller);
  return true;
}

/**
 * Turn to another character's page, wrapping at either end. The highlight stays where it
 * was, kept within the rows the new page has.
 *
 * @spec PRESENT-ITEMS-005
 * @spec PRESENT-ITEMS-021
 */
function showItemsPage(controller, page) {
  if (itemsInFight(controller)) return false;
  const party = partyOf(controller);
  const count = roster(party).length;
  controller.itemsScreen.page = pageFor(party, ((page % count) + count) % count);
  const rows = itemRows(party, itemsCharacter(controller));
  controller.itemsScreen.selected = clampRow(rows, controller.itemsScreen.selected);
  redraw(controller);
  return true;
}

/** @spec PRESENT-ITEMS-017 */
function moveHighlight(controller, by) {
  const rows = itemRows(partyOf(controller), itemsCharacter(controller));
  const screen = controller.itemsScreen
    ?? (controller.itemsScreen = { page: 0, selected: 0, fromFight: itemsInFight(controller) });
  const next = clampRow(rows, (screen.selected ?? 0) + by);
  if (next === screen.selected) return false;
  screen.selected = next;
  redraw(controller);
  return true;
}

/**
 * Press a row: put a pack item on, or take a worn one off. Out of a fight the change is
 * a committed `ITEMS` action and the screen stays up; in a fight it is the turn, and the
 * fight takes it from there.
 *
 * @spec PRESENT-ITEMS-008
 * @spec PRESENT-ITEMS-009
 * @spec PRESENT-ITEMS-010
 * @spec PRESENT-ITEMS-011
 * @spec PRESENT-ITEMS-012
 * @spec PRESENT-ITEMS-015
 * @spec PRESENT-ITEMS-016
 * @spec PRESENT-ITEMS-021
 * @spec PRESENT-ITEMS-026
 * @spec PRESENT-ITEMS-028
 * @spec PRESENT-ITEMS-029
 */
function pressItemRow(controller, index) {
  const party = partyOf(controller);
  const characterId = itemsCharacter(controller);
  const row = itemRows(party, characterId)[index];
  const inFight = itemsInFight(controller);
  if (!row || !rowActs(row, character(party, characterId), { inFight, party, spells: spellsOf(controller) })) return false;
  const drink = row.role === ItemsControl.PACK && isConsumable(row.item);

  const screen = controller.itemsScreen
    ?? (controller.itemsScreen = { page: 0, selected: 0, fromFight: itemsInFight(controller) });
  screen.selected = index;

  if (inFight) {
    const taken = drink ? useInFight(controller.fight, row.item) : equipInFight(controller.fight, row.item);
    if (!taken) return false;
    controller.itemsScreen = null;
    redraw(controller);
    return true;
  }

  let changed;
  // A tome is read rather than drunk, and teaches its spell to whoever's page it is.
  // @spec MAGIC-KNOW-003
  if (drink && tomeSpell(row.item, spellsOf(controller))) changed = readTome(party, characterId, row.item, spellsOf(controller));
  else if (drink) changed = useItem(party, characterId, row.item);
  else if (row.role === ItemsControl.PACK) changed = equip(party, characterId, row.item);
  else changed = takeOff(party, characterId, row.slot);
  if (!changed) return false;
  perform(controller.state, { partyAction: PartyAction.ITEMS, commit: true });
  screen.selected = clampRow(itemRows(party, characterId), screen.selected);
  redraw(controller);
  return true;
}

/**
 * While the Items screen is up it owns the keyboard.
 *
 * @spec PRESENT-ITEMS-002
 * @spec PRESENT-ITEMS-004
 * @spec PRESENT-ITEMS-005
 * @spec PRESENT-ITEMS-014
 * @spec PRESENT-ITEMS-017
 * @spec PRESENT-ITEMS-018
 */
function pressKeyOnItemsScreen(controller, key) {
  if (keyIs(key, 'Escape', 'i')) return closeItemsScreen(controller);
  if (keyIs(key, 'ArrowUp', 'w')) return moveHighlight(controller, -1);
  if (keyIs(key, 'ArrowDown', 's')) return moveHighlight(controller, 1);
  if (key === 'Enter' || key === ' ') {
    const rows = itemRows(partyOf(controller), itemsCharacter(controller));
    return pressItemRow(controller, clampRow(rows, controller.itemsScreen?.selected ?? 0));
  }
  if (itemsInFight(controller)) return false;

  const { page } = controller.itemsScreen;
  if (keyIs(key, 'ArrowRight', 'd')) return showItemsPage(controller, page + 1);
  if (keyIs(key, 'ArrowLeft', 'a')) return showItemsPage(controller, page - 1);
  const number = Number.parseInt(key, 10);
  if (String(number) === key && number >= 1 && number <= roster(partyOf(controller)).length) {
    return showItemsPage(controller, number - 1);
  }
  return false;
}

/** A press on the open screen: its own controls, and nothing beneath it. */
function pressPointerOnItemsScreen(controller, px, py) {
  const control = hit(itemsPlan(controller)?.controls, px, py);
  if (!control) return false;
  if (control.role === ItemsControl.CLOSE) return closeItemsScreen(controller);
  if (control.role === ItemsControl.NEXT) return showItemsPage(controller, controller.itemsScreen.page + 1);
  if (control.role === ItemsControl.PREVIOUS) return showItemsPage(controller, controller.itemsScreen.page - 1);
  return pressItemRow(controller, control.index);
}

/**
 * Take whatever the clock had to say about hunger. A notice that arrives is shown until
 * the player next acts.
 *
 * @spec PRESENT-HUNGER-001
 */
function gatherNotices(controller) {
  const notices = takeNotices(controller.state);
  if (notices.length > 0) controller.hungerNotice = hungerSentence(notices);
}

/**
 * Run an action and redraw only if it moved the world.
 *
 * @spec PRESENT-SCENE-003
 * @spec PRESENT-SCENE-005
 */
function applyAction(controller, action) {
  if (!action) return false;
  // A notice stays until the player next acts; this is that action.
  // @spec PRESENT-HUNGER-001
  const hadNotice = Boolean(controller.hungerNotice);
  controller.hungerNotice = null;
  if (hadNotice) redraw(controller);

  // The map is the one action that changes how things are drawn rather than what is
  // true, so the controller answers it rather than the simulation.
  // @spec PRESENT-MAP-003
  if (action.partyAction === PartyAction.TOGGLE_MAP) {
    controller.mapMode = nextMapMode(controller.mapMode);
    redraw(controller);
    return true;
  }
  // So is the party screen: reading a character changes nothing about them.
  if (action.partyAction === PartyAction.PARTY) return openPartyScreen(controller);
  if (action.partyAction === PartyAction.ITEMS) return openItemsScreen(controller);
  if (action.partyAction === PartyAction.SPELLS) return openSpellsScreen(controller);
  // Camping is committed at once; how it ended is reported over the view, unless an enemy
  // broke it, in which case the fight that begins is the report.
  // @spec PRESENT-CAMP-001
  // @spec PRESENT-CAMP-002
  if (action.partyAction === PartyAction.CAMP) {
    const { camp } = perform(controller.state, { partyAction: PartyAction.CAMP, commit: true });
    syncFight(controller);
    gatherNotices(controller);
    // A rest opens the camp screen and its pot; a refusal is reported over the view.
    // @spec PRESENT-CAMP-004
    if (camp?.outcome === 'RESTED' && !controller.fight) {
      controller.campScreen = { pot: {}, selected: 0, foraged: camp.foraged ?? [] };
      setMenuOpen(controller.state, true);
    } else if (camp && !controller.fight) {
      controller.campReport = camp.outcome;
    }
    redraw(controller);
    return true;
  }

  const before = stateSignature(controller.state);
  const result = perform(controller.state, action);
  gatherNotices(controller);
  // A chest was opened: what it held is reported over the view.
  // @spec PRESENT-CHEST-001
  if (result?.found !== undefined) {
    controller.chestFind = result.found ?? { gold: 0, items: [] };
    redraw(controller);
    return true;
  }
  // A step can walk the party into a warband, which is a change no signature catches.
  syncFight(controller);
  if (!controller.fight && stateSignature(controller.state) === before) return false;

  redraw(controller);
  return true;
}

const within = (box, px, py) =>
  px >= box.x && px <= box.x + box.width && py >= box.y && py <= box.y + box.height;

/**
 * Turn a wheel over the fight into a walk back through its log. A wheel is not a press,
 * so it leaves an open menu alone.
 *
 * @spec PRESENT-FIGHT-031
 * @spec PRESENT-MENU-015
 */
export function scrollFightLog(controller, lines) {
  syncFight(controller);
  if (!controller.fight || !scrollLog(controller.fight, lines)) return false;
  redraw(controller);
  return true;
}

/** A choice was made. Fleeing can end a fight outright; anything else is just drawn. */
function settleChoice(controller) {
  const { fight } = controller;
  if (fight.phase === FightPhase.ENDED && fight.fled?.escaped) {
    controller.campaign.fleeEncounter();
    syncFight(controller);
  }
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
  if (itemsInFight(controller)) return pressKeyOnItemsScreen(controller, key);

  if (fight.phase === FightPhase.ENDED) {
    // A wiped party begins again, which ends the campaign, so a stray Escape does not
    // count as the answer.
    // @spec PRESENT-FIGHT-049
    if (fight.outcome?.outcome === Outcome.DEFEAT) {
      if (key !== 'Enter' && key !== ' ') return false;
      controller.onBeginAgain();
      return true;
    }
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
  return settleChoice(controller);
}

/**
 * @spec PRESENT-INPUT-001
 * @spec PRESENT-INPUT-003
 * @spec PRESENT-PROMPT-003
 * @spec PRESENT-PROMPT-004
 * @spec PRESENT-PROMPT-005
 */
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
  // A chest's report holds the keyboard until it is put away.
  // @spec PRESENT-CHEST-002
  if (controller.chestFind) return CHEST_DISMISS_KEYS.includes(key) ? closeChestReport(controller) : false;
  // @spec PRESENT-CAMP-003
  if (controller.campReport) return CAMP_DISMISS_KEYS.includes(key) ? closeChestReport(controller) : false;
  if (controller.mealReport) return CAMP_DISMISS_KEYS.includes(key) ? closeChestReport(controller) : false;
  if (controller.campScreen) return pressKeyOnCampScreen(controller, key);
  if (controller.partyScreen) return pressKeyOnPartyScreen(controller, key);
  if (controller.itemsScreen) return pressKeyOnItemsScreen(controller, key);
  if (controller.spellsScreen) return pressKeyOnSpellsScreen(controller, key);
  return applyAction(controller, actionForKey(key));
}

/**
 * The control a press landed on. Later controls are drawn over earlier ones, so the
 * last one under the finger is the one it touched: a Pass turn control covers the four
 * greyed options beneath it, and they must not answer in its place.
 *
 * @spec PRESENT-INPUT-002
 * @spec PRESENT-INPUT-003
 * @spec PRESENT-INPUT-006
 * @spec PRESENT-PROMPT-003
 * @spec PRESENT-FIGHT-042
 */
function hit(controls, px, py) {
  return [...(controls ?? [])].reverse().find(
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

  if (controller.fight && itemsInFight(controller)) {
    return pressPointerOnItemsScreen(controller, px, py);
  }

  if (controller.fight) {
    const plan = layers(controller).find((l) => l.name === 'fight').plan;
    const control = hit(plan.controls, px, py);

    // A press outside an open menu and the row closes the menu and is spent on that:
    // whatever lies beneath it is not pressed as well. The gaps inside the two are not
    // outside them, so a thumb that just misses an entry loses nothing.
    // @spec PRESENT-MENU-009
    if (plan.menu && !control) {
      if (within(plan.menu.box, px, py) || within(plan.regions.controlsBox, px, py)) return false;
      goBack(controller.fight);
      redraw(controller);
      return true;
    }

    // A press on the scrollbar's track pages the log, above the thumb or below it.
    // @spec PRESENT-FIGHT-033
    const bar = plan.scrollbar;
    if (bar && within(bar.track, px, py)) {
      scrollLog(controller.fight, py < bar.thumb.y ? bar.page : -bar.page);
      redraw(controller);
      return true;
    }

    if (!control) return false;

    if (control.role === 'DISMISS') return pressKeyInFight(controller, 'Enter');
    // The one press a character with nothing to do can make.
    // @spec PRESENT-FIGHT-043
    if (control.role === 'PASS') return pressKeyInFight(controller, 'Enter');
    if (control.role === 'TARGET') return pressKeyInFight(controller, String(control.entryIndex + 1));
    if (!pressOption(controller.fight, control.optionIndex)) return false;
    return settleChoice(controller);
  }

  if (controller.state.pendingConfirmation) {
    const plan = buildPromptPlan(controller.state.pendingConfirmation, controller.viewport);
    const control = hit(plan?.controls, px, py);
    if (!control) return false;
    return answerPrompt(controller, control.accepted);
  }

  // Anywhere at all puts a chest's report away: there is nothing on it to press.
  // @spec PRESENT-CHEST-002
  if (controller.chestFind || controller.campReport || controller.mealReport) return closeChestReport(controller);
  if (controller.campScreen) return pressPointerOnCampScreen(controller, px, py);
  // A tap outside the page lands on nothing: a stray thumb must not dismiss it.
  if (controller.partyScreen) return pressPointerOnPartyScreen(controller, px, py);
  if (controller.itemsScreen) return pressPointerOnItemsScreen(controller, px, py);
  if (controller.spellsScreen) return pressPointerOnSpellsScreen(controller, px, py);

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
