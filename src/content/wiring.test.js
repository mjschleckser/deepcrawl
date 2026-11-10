import { describe, it, expect } from 'vitest';
import { STEP_DELTA, EdgeKind, setEdge, isEdgeOpen } from '../sim/floor.js';
import { makeRng } from '../sim/rng.js';
import {
  computeSight, perform, partyPosition, tickCount,
  advanceForCamp, Verb, PartyAction,
} from '../sim/exploration.js';
import { Condition, CharacterClass, Skill, character, roster, packOf, purseOf } from '../sim/party.js';
import { Outcome, Action, encounterOutcome, nextActor, takeAction } from '../sim/combat.js';
import { isAware } from '../sim/enemies.js';
import { createCampaign } from './campaign.js';

function booted(seed = 4242) {
  const campaign = createCampaign({ seed });
  computeSight(campaign.state);
  return campaign;
}

// A wander that actually goes somewhere: walk forward, and turn when the way is shut.
// A fixed turn pattern just oscillates in the first dead end it finds.
function walkUntil(campaign, predicate, limit = 1200) {
  const rng = makeRng(99);
  const turns = [Verb.TURN_LEFT, Verb.TURN_RIGHT, Verb.TURN_AROUND];

  for (let i = 0; i < limit; i++) {
    if (predicate(campaign)) return true;
    const result = perform(campaign.state, { verb: Verb.STEP_FORWARD });
    if (result.blocked || rng.chance(0.15)) perform(campaign.state, { verb: rng.pick(turns) });
  }
  return predicate(campaign);
}

// Stand a warband directly in the party's path and walk into it. Neither side may
// enter the other's tile, so contact has to be provoked by the step itself rather than
// by parking the goblins on top of the party.
function stepIntoContact(campaign, limit = 20) {
  const { state } = campaign;
  const planted = state.roamers[0];
  planted.floorId = state.party.floorId;

  const rng = makeRng(5);
  for (let i = 0; i < limit && !campaign.encounter; i++) {
    const { dx, dy } = STEP_DELTA[state.party.facing];
    planted.x = state.party.tile.x + dx;
    planted.y = state.party.tile.y + dy;

    const result = perform(state, { verb: Verb.STEP_FORWARD });
    if (result.blocked) perform(state, { verb: rng.pick([Verb.TURN_LEFT, Verb.TURN_RIGHT]) });
  }
  return planted;
}

describe('a campaign has a party', () => {
  // @spec PARTY-DATA-002
  // @spec PARTY-ROSTER-001
  it('fields the four characters its data files describe', () => {
    const { party } = booted();

    expect(roster(party)).toHaveLength(4);
    expect(roster(party).map((c) => c.id)).toEqual(['bram', 'tam', 'isolde', 'wren']);
    for (const c of roster(party)) expect(c.row).toBeUndefined();
  });

  // @spec EXPLORE-CLOCK-001
  it('spends the party own step cost on a step, not a flat tick', () => {
    const campaign = booted();
    const before = tickCount(campaign.state);

    perform(campaign.state, { verb: Verb.STEP_FORWARD });

    const spent = tickCount(campaign.state) - before;
    // Either the step was blocked, or it cost a real number of ticks.
    expect(spent === 0 || spent >= 5).toBe(true);
  });
});

describe('roamers live on the floor', () => {
  it('puts bands of goblins on the entrance floor', () => {
    const { state } = booted();

    expect(state.roamers.length).toBeGreaterThan(0);
    for (const roamer of state.roamers) {
      expect(roamer.band.members.length).toBeGreaterThan(0);
      expect(roamer.floorId).toBe(state.party.floorId);
    }
  });

  // @spec EXPLORE-MOVE-019
  it('moves them as the party walks, spending the ticks each step cost', () => {
    const campaign = booted();
    const before = campaign.state.roamers.map((r) => `${r.x},${r.y}`);

    for (let i = 0; i < 25; i++) perform(campaign.state, { verb: Verb.STEP_FORWARD });

    const after = campaign.state.roamers.map((r) => `${r.x},${r.y}`);
    expect(after).not.toEqual(before);
  });

  // @spec EXPLORE-RETURN-002
  it('leaves roamers on other floors alone while the party is elsewhere', () => {
    const campaign = booted();
    const elsewhere = campaign.plan.floors[1].id;
    campaign.state.getFloor(elsewhere);
    const parked = campaign.state.roamers.filter((r) => r.floorId === elsewhere).map((r) => `${r.x},${r.y}`);

    for (let i = 0; i < 20; i++) perform(campaign.state, { verb: Verb.STEP_FORWARD });

    expect(campaign.state.roamers.filter((r) => r.floorId === elsewhere).map((r) => `${r.x},${r.y}`))
      .toEqual(parked);
  });
});

describe('walking into a warband', () => {
  // @spec EXPLORE-BOUND-001
  // @spec ENEMY-CONTACT-001
  it('begins an encounter the moment a roamer shares the party tile', () => {
    const campaign = booted();
    const planted = stepIntoContact(campaign);

    expect(campaign.encounter).not.toBeNull();
    expect(campaign.encounter.enemies.members).toHaveLength(planted.band.members.length);
  });

  // @spec EXPLORE-BOUND-001
  it('is met eventually by simply walking the floor', () => {
    const campaign = booted();

    expect(walkUntil(campaign, (c) => c.encounter !== null)).toBe(true);
  });

  // @spec EXPLORE-BOUND-002
  it('hands combat the enemy group and where the fight began, and nothing more', () => {
    const campaign = booted();
    stepIntoContact(campaign);

    const encounter = campaign.encounter;
    expect(encounter).not.toHaveProperty('light');
    expect(encounter.enemies.members.length).toBeGreaterThan(0);
    expect(encounter.awareness).toBeUndefined();
    expect(encounter.surprisedSide).toBeUndefined();
    expect(encounter.origin).toMatchObject({ floorId: expect.any(String) });
  });

  // @spec ENEMY-CONTACT-001
  // @spec ENEMY-CONTACT-002
  it('meets the warband beside the party rather than on top of them', () => {
    const campaign = booted();
    stepIntoContact(campaign);

    const met = campaign.state.roamers.find((r) => r.id === campaign.encounter.roamerId);
    expect({ x: met.x, y: met.y }).not.toEqual({ ...campaign.state.party.tile });
  });

  // @spec ENEMY-CONTACT-002
  it('keeps the party off every warband on the floor, however far they walk', () => {
    const campaign = booted();
    const state = campaign.state;

    const shared = (c) => c.state.roamers.some(
      (r) => r.floorId === state.party.floorId
        && r.x === state.party.tile.x && r.y === state.party.tile.y,
    );

    walkUntil(campaign, (c) => c.encounter !== null || shared(c), 400);

    expect(shared(campaign)).toBe(false);
  });

  // @spec EXPLORE-BOUND-012
  it('opens the door it met a warband through, before the fight begins', () => {
    const campaign = booted();
    const { state } = campaign;
    const floor = state.floors.get(state.party.floorId);
    const { dx, dy } = STEP_DELTA[state.party.facing];
    const ahead = { x: state.party.tile.x + dx, y: state.party.tile.y + dy };
    setEdge(floor, state.party.tile.x, state.party.tile.y, state.party.facing, EdgeKind.DOOR);
    const planted = state.roamers[0];
    planted.floorId = state.party.floorId;
    planted.x = ahead.x;
    planted.y = ahead.y;

    perform(state, { verb: Verb.STEP_FORWARD });

    expect(campaign.encounter).not.toBeNull();
    expect(isEdgeOpen(floor, state.party.tile.x, state.party.tile.y, state.party.facing)).toBe(true);
  });

  // @spec COMBAT-TIME-012
  it('moves the exploration clock for nothing while a fight is on', () => {
    const campaign = booted();
    stepIntoContact(campaign);
    const ticks = tickCount(campaign.state);

    perform(campaign.state, { verb: Verb.STEP_FORWARD });
    perform(campaign.state, { partyAction: PartyAction.ITEMS, commit: true });
    advanceForCamp(campaign.state, 5);

    expect(tickCount(campaign.state)).toBe(ticks);
  });

  it('stops the party walking while a fight is on', () => {
    const campaign = booted();
    stepIntoContact(campaign);
    const held = partyPosition(campaign.state);

    perform(campaign.state, { verb: Verb.STEP_FORWARD });

    expect(partyPosition(campaign.state)).toEqual(held);
  });
});

describe('winning a fight', () => {
  function fightToTheEnd(campaign) {
    const encounter = campaign.encounter;
    // One combatant at a time, whoever is ready, until a side is finished.
    for (let turn = 0; turn < 200; turn++) {
      const result = encounterOutcome(encounter);
      if (result.outcome !== Outcome.ONGOING) return result;

      const actor = nextActor(encounter);
      if (!actor) break;

      if (actor.side !== 'PARTY') {
        takeAction(encounter, actor.id, { kind: Action.PASS });
        continue;
      }
      const target = encounter.enemies.members.find((e) => e.condition === Condition.OK && e.hitPoints > 0);
      if (!target) break;
      takeAction(encounter, actor.id, {
        kind: Action.ATTACK, targetId: target.id,
        baseDamage: 40, skill: Skill.BLADE,
      });
    }
    return encounterOutcome(encounter);
  }

  // @spec EXPLORE-BOUND-002
  it('advances the skills the party used, from the pot the enemies were worth', () => {
    const campaign = booted();
    stepIntoContact(campaign);
    const fighter = roster(campaign.party).find((c) => c.characterClass === CharacterClass.FIGHTER);
    const before = fighter.skillExperience[Skill.BLADE] ?? 0;

    const result = fightToTheEnd(campaign);
    campaign.concludeEncounter();

    expect(result.outcome).toBe(Outcome.VICTORY);
    expect(result.pot).toBeGreaterThan(0);
    expect(character(campaign.party, fighter.id).skillExperience[Skill.BLADE]).toBeGreaterThan(before);
  });

  // @spec LOOT-DROP-001
  it('hands the gold and items the warband dropped to the purse and the pack', () => {
    const campaign = booted();
    stepIntoContact(campaign);
    const tables = campaign.encounter.enemies.members.map((e) => e.loot);
    const carried = packOf(campaign.party).map((i) => i.id);

    const result = fightToTheEnd(campaign);
    campaign.concludeEncounter();

    // Every goblin carries a table, and each drops some gold.
    expect(tables.every((t) => ['goblin', 'goblin_archer', 'goblin_mage'].includes(t))).toBe(true);
    expect(result.finds.gold).toBeGreaterThan(0);
    expect(purseOf(campaign.party)).toBe(result.finds.gold);
    expect(packOf(campaign.party).map((i) => i.id)).toEqual([...carried, ...result.finds.items.map((i) => i.id)]);
  });

  // @spec LOOT-DROP-003
  it('hands over nothing when the party escapes', () => {
    const campaign = booted();
    stepIntoContact(campaign);
    const carried = packOf(campaign.party).map((i) => i.id);

    campaign.fleeEncounter();

    expect(purseOf(campaign.party)).toBe(0);
    expect(packOf(campaign.party).map((i) => i.id)).toEqual(carried);
  });

  it('lets the party walk again, with the warband gone from the floor', () => {
    const campaign = booted();
    stepIntoContact(campaign);
    const roamersBefore = campaign.state.roamers.length;

    fightToTheEnd(campaign);
    campaign.concludeEncounter();

    expect(campaign.encounter).toBeNull();
    expect(campaign.state.roamers.length).toBe(roamersBefore - 1);

    const before = partyPosition(campaign.state);
    for (let i = 0; i < 8; i++) perform(campaign.state, { verb: Verb.STEP_FORWARD });
    expect(partyPosition(campaign.state)).not.toEqual(before);
  });

  // @spec ENEMY-AWARE-007
  it('leaves a roamer unaware when the party escapes it', () => {
    const campaign = booted();
    stepIntoContact(campaign);

    campaign.fleeEncounter();

    expect(campaign.encounter).toBeNull();
    // Whatever they fled is no longer sure where they went.
    expect(campaign.state.roamers.every((r) => !isAware(r))).toBe(true);
  });
});

describe('re-stocking a floor', () => {
  // @spec ENEMY-CONTACT-006
  it('starts nobody on the tile the party comes in on', () => {
    for (const seed of [1, 7, 4242, 90210]) {
      const { state } = booted(seed);
      for (const roamer of state.roamers.filter((r) => r.floorId === state.party.floorId)) {
        expect({ x: roamer.x, y: roamer.y }).not.toEqual({ ...state.party.tile });
      }
    }
  });

  // @spec ENEMY-CONTACT-006
  it('puts nothing back on the tile the party is standing on', () => {
    const campaign = booted();
    const state = campaign.state;
    const home = state.party.floorId;

    campaign.restockFloor(home, 2000);

    for (const roamer of state.roamers.filter((r) => r.floorId === home)) {
      expect({ x: roamer.x, y: roamer.y }).not.toEqual({ ...state.party.tile });
    }
  });

  // @spec EXPLORE-RETURN-005
  // @spec EXPLORE-RETURN-006
  // @spec GEN-STOCK-001
  it('refills the occupants while leaving the map alone', () => {
    const campaign = booted();
    const state = campaign.state;
    const home = state.party.floorId;

    // Learn a little of the floor.
    computeSight(state);
    const floor = state.getFloor(home);
    const layoutBefore = JSON.stringify([floor.horizontalEdges, floor.verticalEdges, floor.tiles]);
    const discoveredBefore = state.discoveredTiles.get(home).size;

    campaign.restockFloor(home, 500);

    const after = state.getFloor(home);
    expect(JSON.stringify([after.horizontalEdges, after.verticalEdges, after.tiles])).toBe(layoutBefore);
    expect(state.discoveredTiles.get(home).size).toBe(discoveredBefore);
    expect(state.roamers.filter((r) => r.floorId === home).length).toBeGreaterThan(0);
  });
});

describe('camping in a campaign', () => {
  // @spec CAMP-REST-004
  // @spec CAMP-REST-006
  it('reaches the camp segment and restores slots when the camp is not broken', () => {
    const campaign = booted();
    const state = campaign.state;
    // Nobody in sight, so the camp may begin.
    state.roamers = state.roamers.filter((r) => r.floorId !== state.party.floorId);
    const isolde = roster(campaign.party).find((c) => c.characterClass === CharacterClass.MAGE);
    isolde.spentSlots = { 1: 2 };

    const result = perform(state, { partyAction: PartyAction.CAMP, commit: true });

    expect(result.camp).toMatchObject({ outcome: 'RESTED' });
    expect(isolde.spentSlots).toEqual({});
    expect(tickCount(state)).toBeGreaterThan(0);
  });
});

describe('what a campaign never changes', () => {
  // @spec EXPLORE-BOUND-004
  it('leaves a floor\'s size, edge kinds and tile features as generation made them', () => {
    const campaign = booted();
    const state = campaign.state;
    const home = state.party.floorId;
    const shape = (floor) => JSON.stringify({
      width: floor.width,
      height: floor.height,
      // Doors may open and shut; what kind of edge each one is may not change.
      edges: [...floor.horizontalEdges, ...floor.verticalEdges].map((e) => e.kind),
      features: floor.tiles.map((t) => t.feature),
    });
    const before = shape(state.getFloor(home));

    // Walk, fight nothing, re-stock, camp: everything that touches a floor.
    state.roamers = state.roamers.filter((r) => r.floorId !== home);
    walkUntil(campaign, () => false, 300);
    campaign.restockFloor(home, 500);
    state.roamers = state.roamers.filter((r) => r.floorId !== home);
    perform(state, { partyAction: PartyAction.CAMP, commit: true });

    expect(shape(state.getFloor(home))).toBe(before);
  });

  // @spec EXPLORE-BOUND-003
  it('changes hit points and condition only by the party\'s rules, from a fight and from a spell', () => {
    const campaign = booted();
    const isolde = roster(campaign.party).find((c) => c.characterClass === CharacterClass.MAGE);
    const wren = roster(campaign.party).find((c) => c.characterClass === CharacterClass.CLERIC);
    stepIntoContact(campaign);
    const fight = campaign.encounter;

    // The first such blow is the cleric's Intercession to catch; with it spent, a blow
    // that would take a character below nothing leaves them at nothing and unconscious,
    // which is the party's floor and its chain, not combat's arithmetic.
    wren.spentCharges = 1;
    for (const foe of fight.enemies.members) foe.attack = { skill: Skill.BLADE, baseDamage: 999 };
    fight.readiness.set(fight.enemies.members[0].id, 100);
    takeAction(fight, fight.enemies.members[0].id, { kind: Action.ATTACK, targetId: isolde.id });
    expect(isolde.hitPoints).toBe(0);
    expect(isolde.condition).toBe(Condition.UNCONSCIOUS);

    // A heal on her is refused by the same rules: a spell does not wake the fallen.
    fight.readiness.set(wren.id, 100);
    expect(takeAction(fight, wren.id, { kind: Action.CAST, spellId: 'heal', targetId: isolde.id })).toBeNull();
    expect(isolde.condition).toBe(Condition.UNCONSCIOUS);
  });
});

describe('food in a campaign', () => {
  // @spec FOOD-HUNGER-001
  // @spec EXPLORE-BOUND-006
  it('grows the party hungrier as it walks', () => {
    const campaign = booted();
    campaign.state.roamers = [];
    walkUntil(campaign, () => tickCount(campaign.state) > 100);
    for (const c of roster(campaign.party)) expect(c.fullness).toBe(2000 - tickCount(campaign.state));
  });

  // @spec FOOD-HUNGER-002
  it('takes no fullness while a fight is running', () => {
    const campaign = booted();
    stepIntoContact(campaign);
    const before = roster(campaign.party).map((c) => c.fullness);

    perform(campaign.state, { verb: Verb.STEP_FORWARD });
    advanceForCamp(campaign.state, 50);
    const fight = campaign.encounter;
    for (let i = 0; i < 5; i++) {
      const actor = nextActor(fight);
      if (!actor) break;
      takeAction(fight, actor.id, { kind: Action.PASS });
    }

    expect(roster(campaign.party).map((c) => c.fullness)).toEqual(before);
  });

  // @spec CAMP-FOOD-003
  it('cooks the pot once per camp, and only after a camp has rested', () => {
    const campaign = booted();
    const state = campaign.state;
    state.roamers = [];
    const rations = () => packOf(campaign.party).filter((i) => i.id === 'ration');

    expect(campaign.cook(rations().slice(0, 1))).toBeNull();

    perform(state, { partyAction: PartyAction.CAMP, commit: true });
    expect(campaign.cook(rations().slice(0, 1))).not.toBeNull();
    expect(rations()).toHaveLength(5);
    expect(campaign.cook(rations().slice(0, 1))).toBeNull();
    expect(rations()).toHaveLength(5);
  });
});

describe('re-stocking a campaign floor', () => {
  // @spec GEN-STOCK-004
  it('moves standing warbands unaware, keeping who they are, and refills to three at most', () => {
    const campaign = booted();
    const state = campaign.state;
    const home = state.party.floorId;
    const before = state.roamers.filter((r) => r.floorId === home);
    const survivor = before[0];
    state.roamers = state.roamers.filter((r) => r.floorId !== home || r.id === survivor.id);
    state.roamers = state.roamers.map((r) => (r.id === survivor.id ? { ...r, awareness: 3 } : r));

    campaign.restockFloor(home, 5000);

    const after = state.roamers.filter((r) => r.floorId === home);
    expect(after).toHaveLength(3);
    const moved = after.find((r) => r.id === survivor.id);
    expect(moved.band).toBe(survivor.band);
    expect(moved.awareness).toBe(0);
    expect(new Set(after.map((r) => r.id)).size).toBe(3);

    campaign.restockFloor(home, 5000);
    expect(state.roamers.filter((r) => r.floorId === home)).toHaveLength(3);
  });

  // @spec EXPLORE-RETURN-007
  it('waits out a hundred ticks before a return re-stocks', () => {
    expect(booted().state.restockMinElapsedTicks).toBe(100);
  });

  // @spec EXPLORE-RETURN-003
  it('changes nothing after a short absence', () => {
    const campaign = booted();
    const state = campaign.state;
    const home = state.party.floorId;
    const before = JSON.stringify(state.roamers.filter((r) => r.floorId === home).map(({ rng, ...r }) => r));
    campaign.restockFloor(home, 0);
    expect(JSON.stringify(state.roamers.filter((r) => r.floorId === home).map(({ rng, ...r }) => r))).toBe(before);
  });
});
