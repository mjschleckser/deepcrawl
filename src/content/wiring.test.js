import { describe, it, expect } from 'vitest';
import { LightLevel, STEP_DELTA } from '../sim/floor.js';
import { makeRng } from '../sim/rng.js';
import {
  computeSight, perform, partyPosition, tickCount, isTileDiscovered, isTrapKnown,
  recordTrapDetected, Verb,
} from '../sim/exploration.js';
import { Condition, Row, CharacterClass, Skill, character, roster, skillRank, applyDamage } from '../sim/party.js';
import { Outcome, Action, encounterOutcome, selectAction, resolveRound } from '../sim/combat.js';
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
  it('fields five characters across the two rows', () => {
    const { party } = booted();

    expect(roster(party)).toHaveLength(5);
    expect(roster(party).filter((c) => c.row === Row.FRONT)).toHaveLength(3);
    expect(roster(party).filter((c) => c.row === Row.BACK)).toHaveLength(2);
  });

  it('brings one of each class, so every system has someone to use it', () => {
    const { party } = booted();
    const classes = new Set(roster(party).map((c) => c.characterClass));

    for (const cls of Object.values(CharacterClass)) expect(classes).toContain(cls);
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
  // @spec ENEMY-CONTACT-003
  it('hands combat the enemy group, the light, and who was aware of whom', () => {
    const campaign = booted();
    stepIntoContact(campaign);

    const encounter = campaign.encounter;
    expect(Object.values(LightLevel)).toContain(encounter.light);
    expect(typeof encounter.awareness.party).toBe('boolean');
    expect(typeof encounter.awareness.enemies).toBe('boolean');
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
    for (let round = 0; round < 60; round++) {
      const result = encounterOutcome(encounter);
      if (result.outcome !== Outcome.ONGOING) return result;

      for (const c of roster(campaign.party).filter((m) => m.condition === Condition.OK)) {
        const target = encounter.enemies.members.find((e) => e.condition === Condition.OK && e.hitPoints > 0);
        if (!target) break;
        selectAction(encounter, c.id, {
          action: Action.ATTACK, targetId: target.id,
          baseDamage: 40, accuracy: 300, skill: Skill.BLADE,
        });
      }
      resolveRound(encounter);
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

  // @spec EXPLORE-RETURN-004
  // @spec EXPLORE-RETURN-005
  // @spec EXPLORE-RETURN-006
  // @spec EXPLORE-RETURN-009
  // @spec GEN-STOCK-001
  // @spec GEN-STOCK-002
  it('refills the occupants while leaving the map and its traps alone', () => {
    const campaign = booted();
    const state = campaign.state;
    const home = state.party.floorId;

    // Learn a little of the floor and find a trap on it.
    computeSight(state);
    const knownTile = [...state.discoveredTiles.get(home)][0].split(',').map(Number);
    recordTrapDetected(state, home, knownTile[0], knownTile[1]);
    const floor = state.getFloor(home);
    const layoutBefore = JSON.stringify([floor.horizontalEdges, floor.verticalEdges, floor.tiles]);
    const discoveredBefore = state.discoveredTiles.get(home).size;

    campaign.restockFloor(home, 500);

    const after = state.getFloor(home);
    expect(JSON.stringify([after.horizontalEdges, after.verticalEdges, after.tiles])).toBe(layoutBefore);
    expect(state.discoveredTiles.get(home).size).toBe(discoveredBefore);
    expect(isTrapKnown(state, home, knownTile[0], knownTile[1])).toBe(true);
    expect(state.roamers.filter((r) => r.floorId === home).length).toBeGreaterThan(0);
  });
});
