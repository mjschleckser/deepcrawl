/**
 * Wiring a campaign.
 *
 * This is the composition root: the one place that knows generation, exploration,
 * enemies, combat, and the party all exist. Every segment reaches its neighbours
 * through a hook handed to it here, and none of them import each other.
 */

import { setTileLight, LightLevel } from '../sim/floor.js';
import { createLightSource } from '../sim/light.js';
import { makeRng } from '../sim/rng.js';
import {
  createExploration, generateFloor, generatePlan, resolveArrival,
  resolveTileLight, isTileDiscovered, setCombatActive,
} from '../sim/exploration.js';
import {
  Attribute,
  createParty, createCharacter, addCharacter, awardEncounter, partyStepCost,
  Row, CharacterClass,
} from '../sim/party.js';
import {
  createRoamer, giveTicks, giveGround, forgetParty, isAware, occupantsFor,
} from '../sim/enemies.js';
import {
  beginEncounter, createEnemy, createEnemyGroup, encounterOutcome, attemptFlee, Action, Outcome,
} from '../sim/combat.js';
import { createRule, When, Aim } from '../sim/orders.js';

/**
 * What the front rank does when nobody tells them otherwise: swing at whatever is
 * closest to falling. Authored here because an order list is content, and because a
 * party that has to be told every swing is a party nobody wants to play.
 *
 * The back row is given nothing: with no bow and no spell there is nothing legal for a
 * rule to propose, and an order that proposes nothing is worse than none at all.
 */
const CUT_DOWN_THE_WEAKEST = [
  createRule({
    when: When.ALWAYS,
    action: { kind: Action.ATTACK },
    aim: Aim.WEAKEST_ENEMY,
  }),
];

/**
 * Dexterity is speed, so five scores are five rates of filling, and a goblin's 11
 * falls in among them rather than ahead of them all. The floor is held at ten because
 * a party flees no faster than its hindmost, and a slower one could never outrun the
 * first thing it meets.
 */
const STARTING_PARTY = [
  { id: 'bram', name: 'Bram', characterClass: CharacterClass.FIGHTER, row: Row.FRONT, attributes: { [Attribute.DEXTERITY]: 13 }, orders: CUT_DOWN_THE_WEAKEST },
  { id: 'rook', name: 'Rook', characterClass: CharacterClass.FIGHTER, row: Row.FRONT, attributes: { [Attribute.DEXTERITY]: 11 }, orders: CUT_DOWN_THE_WEAKEST },
  { id: 'tam', name: 'Tam', characterClass: CharacterClass.THIEF, row: Row.FRONT, attributes: { [Attribute.DEXTERITY]: 16 }, orders: CUT_DOWN_THE_WEAKEST },
  { id: 'isolde', name: 'Isolde', characterClass: CharacterClass.MAGE, row: Row.BACK, attributes: { [Attribute.DEXTERITY]: 12 } },
  { id: 'wren', name: 'Wren', characterClass: CharacterClass.CLERIC, row: Row.BACK, attributes: { [Attribute.DEXTERITY]: 10 } },
];

/** Bands standing on a freshly built floor, before anyone has disturbed it. */
const BANDS_PER_FLOOR = 3;

function createStartingParty() {
  const party = createParty();
  for (const template of STARTING_PARTY) addCharacter(party, createCharacter(template));
  return party;
}

/** A band becomes a set of combatants only when a fight actually starts. */
function toEnemyGroup(band) {
  return createEnemyGroup(
    band.members.map((m) =>
      createEnemy({
        id: m.instanceId,
        name: m.name,
        row: m.row,
        hitPoints: m.hitPoints,
        dexterity: m.dexterity,
        accuracy: m.accuracy,
        armour: m.armour,
        potValue: m.potValue,
        forbidsEscape: m.forbidsEscape,
      }),
    ),
  );
}

export function createCampaign({ seed = Date.now() >>> 0 } = {}) {
  const plan = generatePlan({ seed });
  const descriptors = new Map(plan.floors.map((f) => [f.id, f]));
  const rng = makeRng((seed ^ 0x9e3779b9) >>> 0);

  const party = createStartingParty();
  const campaign = { plan, party, state: null, encounter: null };

  function stockFloor(floor, count = BANDS_PER_FLOOR) {
    // Nothing is stocked onto the party, so a floor re-stocking around a standing
    // party cannot put a warband where they are.
    const avoid = campaign.state && campaign.state.party.floorId === floor.id
      ? { ...campaign.state.party.tile }
      : null;

    return occupantsFor({ floorId: floor.id, rooms: floor.rooms ?? [], rng, count, avoid }).map((occupant) =>
      createRoamer({
        ...occupant,
        dexterity: occupant.band.members[0].dexterity,
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
   * @spec ENEMY-CONTACT-003
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

    const light = resolveTileLight(state, tile.x, tile.y);
    campaign.encounter = beginEncounter({
      party: campaign.party,
      enemies: toEnemyGroup(met.band),
      light,
      // The party knows what it can see; the roamer knows what it has noticed. Light
      // decides the first and never the second.
      awareness: {
        party: light === LightLevel.BRIGHT && isTileDiscovered(state, floorId, met.x, met.y),
        enemies: isAware(met),
      },
      rng: makeRng(rng.int(1, 1e9)),
      origin: { floorId, x: tile.x, y: tile.y },
    });
    campaign.encounter.roamerId = met.id;
    setCombatActive(state, true);
  }

  /**
   * Re-stocking answers with occupants and nothing else: no edge, no feature, no trap,
   * and never a word about what the party has discovered.
   *
   * @spec EXPLORE-RETURN-004
   * @spec EXPLORE-RETURN-005
   * @spec EXPLORE-RETURN-006
   * @spec EXPLORE-RETURN-009
   * @spec GEN-STOCK-001
   * @spec GEN-STOCK-002
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

  const entrance = floorProvider(plan.entrance.floorId);
  const startingRoamers = entrance.pendingRoamers ?? [];
  delete entrance.pendingRoamers;

  const state = createExploration({
    floors: [entrance],
    floorProvider,
    floorId: entrance.id,
    tile: { x: 0, y: 0 },
    roamers: startingRoamers,
    stepCost: () => partyStepCost(party),
    hooks: {
      onRoamersMove,
      onContactCheck,
      isTileOccupied,
      onRestock: ({ floorId, elapsed }) => restockFloor(floorId, elapsed),
    },
    lightSources: [
      createLightSource({ id: 'torch-1', brightRadius: 1, dimRadius: 4, remainingTicks: 4000, lit: true }),
      createLightSource({ id: 'torch-2', brightRadius: 1, dimRadius: 4, remainingTicks: 4000 }),
      createLightSource({ id: 'torch-3', brightRadius: 1, dimRadius: 4, remainingTicks: 4000 }),
    ],
  });
  campaign.state = state;

  const start = resolveArrival(state, plan.entrance);
  state.party.tile = { x: start.x, y: start.y };
  // The entrance was stocked before anyone knew where the party would come in, so
  // anything standing on the arrival tile steps aside now rather than being fought on
  // the first move.
  state.roamers = state.roamers.map((r) =>
    r.floorId === entrance.id ? giveGround(r, entrance, state.party.tile) : r,
  );
  // The way out is always visible, so losing every torch is a crisis rather than a
  // dead end.
  // @spec GEN-PLACE-006
  setTileLight(entrance, start.x, start.y, LightLevel.DIM);

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

  campaign.restockFloor = restockFloor;
  campaign.floorProvider = floorProvider;
  return campaign;
}
