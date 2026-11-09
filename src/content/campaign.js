/**
 * Wiring a campaign.
 *
 * This is the composition root: the one place that knows generation, exploration,
 * enemies, combat, and the party all exist. What exploration sets off is answered by
 * hooks handed to it here, so it never reaches into the segments that live off its clock.
 */

import { makeRng } from '../sim/rng.js';
import {
  createExploration, deserialize, generateFloor, generatePlan, resolveArrival, serialize,
  setCombatActive,
} from '../sim/exploration.js';
import {
  Attribute, createParty, addCharacter, awardEncounter, partyStepCost,
  restoreParty, serializeParty, addGold, stow,
} from '../sim/party.js';
import {
  createRoamer, giveTicks, giveGround, forgetParty, occupantsFor,
} from '../sim/enemies.js';
import {
  beginEncounter, createEnemy, createEnemyGroup, encounterOutcome, attemptFlee, Outcome,
  restoreEncounter, serializeEncounter,
} from '../sim/combat.js';
import { startingCharacters } from './combatants.js';
import { checkArchetype, lootTables } from './loot.js';
import { spellDefinitions } from './spells.js';
import { itemById, forageList } from './items.js';
import { applyTestKit } from './testkit.js';
import { camp, CampOutcome } from '../sim/camp.js';
import { passHunger, cookPot } from '../sim/meals.js';
import { chestRng, rollLoot } from '../sim/loot.js';

/** Bands standing on a freshly built floor, before anyone has disturbed it. */
const BANDS_PER_FLOOR = 3;

/**
 * The party a campaign opens with, read from its own authored files.
 *
 * @spec PARTY-DATA-002
 */
/** Nobody sets off without food. */
const STARTING_RATIONS = 6;

/** @spec FOOD-ITEM-003 */
function createStartingParty() {
  const party = createParty();
  for (const c of startingCharacters()) addCharacter(party, c);
  for (let i = 0; i < STARTING_RATIONS; i++) stow(party, { ...itemById('ration') });
  return party;
}

/** A band becomes a set of combatants only when a fight actually starts. */
function toEnemyGroup(band) {
  return createEnemyGroup(
    band.members.map((m) =>
      // An enemy is a character: everything its file said, carried through whole.
      createEnemy({ ...m, id: m.instanceId }),
    ),
  );
}

/**
 * A new campaign from a seed, or a saved one picked up where it stopped. Either way the
 * wiring below is the same: a restored campaign is connected to its neighbours exactly as
 * a new one is, because hooks are functions and a save cannot hold them.
 *
 * @spec SAVE-HOLD-002
 * @spec SAVE-READ-002
 */
export function createCampaign({ seed = Date.now() >>> 0, saved = null, testing = false } = {}) {
  // The plan is read back rather than regenerated, so a later build generating plans
  // differently cannot disagree with the floors already in the save.
  const plan = saved ? saved.plan : generatePlan({ seed });
  const descriptors = new Map(plan.floors.map((f) => [f.id, f]));
  const rng = makeRng(saved ? saved.rng : (seed ^ 0x9e3779b9) >>> 0);
  // What a defeated enemy's drops are rolled on, read once for the whole campaign.
  const tables = lootTables();
  const spells = spellDefinitions();
  // Every archetype in the plan must name a chest table that exists.
  // @spec LOOT-DATA-002
  for (const descriptor of plan.floors) checkArchetype(descriptor.archetype, tables);

  const party = saved ? restoreParty(saved.party) : createStartingParty();
  // A testing campaign starts with one of everything, and is never a saved one.
  // @spec SAVE-TEST-004
  if (testing && !saved) applyTestKit(party);
  // The spells are content, held here so every screen reads the same catalogue.
  const campaign = { plan, party, state: null, encounter: null, spells, testing: Boolean(testing && !saved) };

  function stockFloor(floor, count = BANDS_PER_FLOOR) {
    // Nothing is stocked onto the party, so a floor re-stocking around a standing
    // party cannot put a warband where they are.
    const avoid = campaign.state && campaign.state.party.floorId === floor.id
      ? { ...campaign.state.party.tile }
      : null;

    return occupantsFor({ floorId: floor.id, rooms: floor.rooms ?? [], rng, count, avoid }).map((occupant) =>
      createRoamer({
        ...occupant,
        dexterity: occupant.band.members[0].attributes[Attribute.DEXTERITY],
        rng: makeRng(rng.int(1, 1e9)),
      }),
    );
  }

  // Floors are built lazily and cached by exploration, so a campaign never pays to
  // build levels nobody visits. A floor arrives already stocked — generation is a
  // floor's first stocking, not a re-stocking.
  const floorProvider = (id) => {
    const descriptor = descriptors.get(id);
    if (!descriptor) throw new Error(`no floor in the plan with id ${id}`);
    const floor = generateFloor({
      id: descriptor.id,
      seed: descriptor.seed,
      archetype: descriptor.archetype,
      depthLabel: descriptor.depthLabel,
      links: descriptor.links,
      up: descriptor.up,
    });
    const stocked = stockFloor(floor);
    if (campaign.state) campaign.state.roamers.push(...stocked);
    else floor.pendingRoamers = stocked;
    return floor;
  };

  /**
   * Roamers spend the ticks the party's step consumed against their own cost to cross
   * a tile. Only the floor the party stands on moves; the rest are frozen.
   *
   * @spec EXPLORE-RETURN-002
   * @spec EXPLORE-MOVE-019
   * @spec ENEMY-MOVE-002
   */
  function onRoamersMove({ floorId, ticks }) {
    const state = campaign.state;
    if (campaign.encounter) return;
    const floor = state.getFloor(floorId);

    state.roamers = state.roamers.map((roamer) =>
      roamer.floorId === floorId
        ? giveTicks(roamer, ticks, { floor, party: state.party.tile })
        : roamer,
    );
  }

  /**
   * Whether a warband is standing on a tile. Exploration asks before it steps, because
   * a step into one is the encounter rather than a step.
   *
   * @spec EXPLORE-BOUND-001
   * @spec ENEMY-CONTACT-002
   */
  function isTileOccupied({ floorId, tile }) {
    if (campaign.encounter) return false;
    return campaign.state.roamers.some(
      (r) => r.floorId === floorId && r.x === tile.x && r.y === tile.y,
    );
  }

  /**
   * Contact begins a fight. Exploration reports where the party stands and, when the
   * step was barred, the tile it was barred from; which warband is there is this
   * layer's business.
   *
   * @spec EXPLORE-BOUND-001
   * @spec EXPLORE-BOUND-002
   * @spec EXPLORE-BOUND-011
   * @spec ENEMY-CONTACT-001
   * @spec COMBAT-TIME-012
   */
  function onContactCheck({ floorId, tile, at = null }) {
    const state = campaign.state;
    if (campaign.encounter) return;

    // A barred step names the tile they walked into; otherwise it is whatever reached
    // the party while they walked.
    const met = at
      ? state.roamers.find((r) => r.floorId === floorId && r.x === at.x && r.y === at.y)
      : state.roamers.find((r) => r.floorId === floorId && r.contacted);
    if (!met) return;

    campaign.encounter = beginEncounter({
      party: campaign.party,
      enemies: toEnemyGroup(met.band),
      rng: makeRng(rng.int(1, 1e9)),
      origin: { floorId, x: tile.x, y: tile.y },
      lootTables: tables,
      spells,
    });
    campaign.encounter.roamerId = met.id;
    setCombatActive(state, true);
  }

  /**
   * Re-stocking answers with occupants and nothing else: no edge, no feature,
   * and never a word about what the party has discovered.
   *
   * @spec EXPLORE-RETURN-005
   * @spec EXPLORE-RETURN-006
   * @spec GEN-STOCK-001
   */
  function restockFloor(floorId, elapsed) {
    const state = campaign.state;
    const floor = state.getFloor(floorId);
    // A longer absence brings more back.
    const extra = Math.min(BANDS_PER_FLOOR, Math.round(elapsed / 200));

    state.roamers = [
      ...state.roamers.filter((r) => r.floorId !== floorId),
      ...stockFloor(floor, BANDS_PER_FLOOR + extra),
    ];
  }

  /**
   * A chest is opened: roll the floor's chest table from the floor's seed and the chest's
   * number, and put what it held in the purse and the pack.
   *
   * @spec LOOT-CHEST-001
   * @spec LOOT-CHEST-002
   */
  function onOpenChest({ floor, number, table }) {
    const rolledOn = table ? tables[table] : null;
    if (!rolledOn) return { gold: 0, items: [] };
    const find = rollLoot(rolledOn, chestRng(floor.seed ?? 0, number));
    addGold(party, find.gold);
    for (const item of find.items) stow(party, item);
    return find;
  }

  const wiring = {
    floorProvider,
    stepCost: () => partyStepCost(party),
    hooks: {
      onRoamersMove,
      onContactCheck,
      isTileOccupied,
      onRestock: ({ floorId, elapsed }) => restockFloor(floorId, elapsed),
      onOpenChest,
      // Hunger runs on the exploration clock, and its notices go back through it.
      // @spec FOOD-HUNGER-001
      onTick: (ticks) => passHunger(party, ticks),
      // A camp that rests offers the pot, once.
      // @spec CAMP-REST-006
      // @spec CAMP-FOOD-002
      onCamp: () => {
        const result = camp(campaign.state, party, { forageList: forageList(), rng });
        campaign.potOffered = result.outcome === CampOutcome.RESTED;
        return result;
      },
    },
  };

  /** A campaign's first moment: the entrance built and stocked, the party at its door. */
  function enterDungeon() {
    const entrance = floorProvider(plan.entrance.floorId);
    const startingRoamers = entrance.pendingRoamers ?? [];
    delete entrance.pendingRoamers;

    const opening = createExploration({
      ...wiring,
      floors: [entrance],
      floorId: entrance.id,
      tile: { x: 0, y: 0 },
      roamers: startingRoamers,
    });
    campaign.state = opening;

    const start = resolveArrival(opening, plan.entrance);
    opening.party.tile = { x: start.x, y: start.y };
    // The entrance was stocked before anyone knew where the party would come in, so
    // anything standing on the arrival tile steps aside now rather than being fought on
    // the first move.
    opening.roamers = opening.roamers.map((r) =>
      r.floorId === entrance.id ? giveGround(r, entrance, opening.party.tile) : r,
    );
    return opening;
  }

  const state = saved ? deserialize(saved.exploration, wiring) : enterDungeon();
  campaign.state = state;

  // @spec SAVE-READ-003
  if (saved?.encounter) {
    campaign.encounter = restoreEncounter(saved.encounter, party, tables, spells);
    setCombatActive(state, true);
  }

  /**
   * Bank what a won fight taught, and take the warband off the floor.
   *
   * Each character advances the skills they themselves used; the pot belongs to the
   * enemies, so it is the same however long the fight ran.
   *
   * @spec PARTY-XP-001
   * @spec COMBAT-END-003
   */
  campaign.concludeEncounter = () => {
    const encounter = campaign.encounter;
    if (!encounter) return null;
    const result = encounterOutcome(encounter);
    if (result.outcome === Outcome.ONGOING) return result;

    if (result.outcome === Outcome.VICTORY) {
      for (const [actorId, skillsUsed] of result.skillsByActor ?? []) {
        awardEncounter(campaign.party, actorId, { pot: result.pot, skillsUsed });
      }
      // What the warband dropped goes straight to the purse and the pack.
      // @spec LOOT-DROP-001
      addGold(campaign.party, result.finds?.gold ?? 0);
      for (const item of result.finds?.items ?? []) stow(campaign.party, item);
      state.roamers = state.roamers.filter((r) => r.id !== encounter.roamerId);
    }

    campaign.encounter = null;
    setCombatActive(state, false);
    return result;
  };

  /**
   * Break off. Whatever they fled no longer knows where they went, which is what makes
   * fleeing worth something rather than a one-step reprieve.
   *
   * @spec COMBAT-FLEE-002
   * @spec ENEMY-AWARE-007
   */
  campaign.fleeEncounter = () => {
    const encounter = campaign.encounter;
    if (!encounter) return { escaped: false };

    const result = attemptFlee(encounter);
    if (!result.escaped) return result;

    state.roamers = state.roamers.map((r) => (r.id === encounter.roamerId ? forgetParty(r) : r));
    campaign.encounter = null;
    setCombatActive(state, false);
    return result;
  };

  /**
   * Everything a save holds, ready to be written down.
   *
   * @spec SAVE-HOLD-001
   * @spec SAVE-HOLD-004
   */
  campaign.snapshot = () => ({
    plan,
    rng: rng.position(),
    exploration: serialize(state),
    party: serializeParty(party),
    encounter: campaign.encounter ? serializeEncounter(campaign.encounter) : null,
  });

  /**
   * Cook the pot the camp offered, from food in the pack. Once per camp, and only while
   * it is offered.
   *
   * @spec CAMP-FOOD-003
   */
  campaign.cook = (items) => {
    if (!campaign.potOffered) return null;
    campaign.potOffered = false;
    return cookPot(party, items);
  };
  /** Leave camp without eating. */
  campaign.leaveCamp = () => {
    campaign.potOffered = false;
  };

  campaign.restockFloor = restockFloor;
  campaign.floorProvider = floorProvider;
  return campaign;
}
