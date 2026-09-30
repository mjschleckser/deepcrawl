import { describe, it, expect, vi } from 'vitest';
import { makeRng } from '../sim/rng.js';
import {
  CharacterClass, Skill, createParty, createCharacter, addCharacter, applyDamage, character,
  roster, Condition,
} from '../sim/party.js';
import {
  beginEncounter, createEnemy, createEnemyGroup, readinessOf, FULL_BAR,
  Action, Outcome, Band,
} from '../sim/combat.js';
import {
  buildFightPlan, createFightController, chooseOption, goBack, dismissOutcome,
  playEnemyTurn, passTurn, advanceClock, fightIsPlaying, scrollLog,
  SHAKE_PIXELS, FILL_BEAT_MS, Wound, OPTION_SLOTS,
  FightPhase, FightAction, describeEvent, BEAT_MS,
} from './fight.js';

/** Burn this character's turn on the simplest thing available: swing at whoever is first. */
function defend(fight) {
  const index = fight.pending.options.findIndex((o) => o.action === FightAction.ATTACK);
  if (index < 0 || !fight.pending.options[index].available) return passTurn(fight);
  chooseOption(fight, index);
  return fight.pending?.targets ? chooseOption(fight, 0) : true;
}

/** The option occupying one of the four fixed slots. */
const slot = (fight, action) => fight.pending.options.find((o) => o.action === action);

/** Let the fight move on a little, whatever it is waiting for. */
function nudge(fight, spans = 4) {
  for (let i = 0; i < spans; i++) advanceClock(fight, FILL_BEAT_MS);
  return fight;
}

/** Let the bars fill, a beat at a time, until somebody is up. */
function untilReady(fight, limit = 200) {
  for (let i = 0; i < limit && fight.phase === FightPhase.ACTING && !fight.actor; i++) {
    advanceClock(fight, FILL_BEAT_MS);
  }
  return fight;
}

/** Walk the fight on until the party is being asked something, or it ends. */
function untilAsked(fight, limit = 200) {
  for (let i = 0; i < limit && fight.phase === FightPhase.ACTING && !fight.pending; i++) {
    if (fight.actor) playEnemyTurn(fight);
    else advanceClock(fight, FILL_BEAT_MS);
  }
  return fight;
}

const viewport = { width: 900, height: 640 };

const hero = (id, cls) =>
  createCharacter({
    id, name: id, characterClass: cls,
    attack: { skill: Skill.BLADE, baseDamage: 9, accuracy: 30 },
  });

function fightState({ enemies, light = 'BRIGHT', partyAware = true, enemiesAware = true } = {}) {
  const party = createParty();
  addCharacter(party, hero('bram', CharacterClass.FIGHTER));
  addCharacter(party, hero('tam', CharacterClass.THIEF));
  addCharacter(party, hero('isolde', CharacterClass.MAGE));

  return beginEncounter({
    party,
    enemies: createEnemyGroup(enemies ?? [
      createEnemy({ id: 'g1', name: 'Goblin', maxHitPoints: 9, potValue: 14, attack: { baseDamage: 5, accuracy: 24 } }),
      createEnemy({ id: 'g2', name: 'Goblin', maxHitPoints: 9, potValue: 14, attack: { baseDamage: 5, accuracy: 24 } }),
      createEnemy({ id: 'a1', name: 'Goblin Archer', maxHitPoints: 7, potValue: 18, attack: { baseDamage: 5, accuracy: 24 } }),
    ]),
    light,
    awareness: { party: partyAware, enemies: enemiesAware },
    rng: makeRng(4),
    origin: { floorId: 'f1', x: 2, y: 3 },
  });
}

/** A fight run on to its first turn, which is where most of what is tested begins. */
const controller = (over = {}) =>
  untilReady(createFightController({ encounter: fightState(over), viewport, onDraw: vi.fn() }));

/** A fight exactly as it opens, before any time has passed. */
const opening = (over = {}) =>
  createFightController({ encounter: fightState(over), viewport, onDraw: vi.fn() });

describe('what a fight draws', () => {
  // @spec PRESENT-FIGHT-002
  // @spec PRESENT-FIGHT-018
  it('draws the enemies as a column on the left and the party as one on the right', () => {
    const plan = buildFightPlan(fightState(), viewport, { phase: FightPhase.ACTING });

    expect(plan.enemies).toHaveLength(3);
    expect(plan.party).toHaveLength(3);
    // One column a side: every member shares an x, and the sides do not.
    expect(new Set(plan.enemies.map((e) => e.x)).size).toBe(1);
    expect(new Set(plan.party.map((c) => c.x)).size).toBe(1);
    expect(plan.enemies[0].x).toBeLessThan(plan.party[0].x);
    // Stacked, in the order their side lists them.
    expect(plan.enemies[1].y).toBeGreaterThan(plan.enemies[0].y);
  });

  // @spec PRESENT-READY-028
  it('draws a portrait and three stacked bars for every combatant', () => {
    const plan = buildFightPlan(fightState(), viewport, { phase: FightPhase.ACTING });

    for (const drawn of [...plan.enemies, ...plan.party]) {
      expect(drawn.portraitBox.size).toBe(drawn.height);
      expect(drawn.portraitBox.x).toBe(drawn.x);
      const { readiness, identity, health } = drawn.bars;
      // Readiness above, identity in the middle, hit points beneath.
      expect(readiness.y).toBeLessThan(identity.y);
      expect(identity.y).toBeLessThan(health.y);
      // Beside the portrait, never over it.
      for (const bar of [readiness, identity, health]) {
        expect(bar.x).toBeGreaterThanOrEqual(drawn.portraitBox.x + drawn.portraitBox.size);
        expect(bar.x + bar.width).toBeLessThanOrEqual(drawn.x + drawn.width + 0.001);
      }
    }
  });

  // @spec PRESENT-READY-029
  // @spec PRESENT-READY-030
  it('names every combatant with their level, on both sides alike', () => {
    const encounter = fightState();
    applyDamage(encounter.party, 'bram', 9999);

    const plan = buildFightPlan(encounter, viewport, { phase: FightPhase.ACTING });

    for (const drawn of [...plan.enemies, ...plan.party]) {
      expect(typeof drawn.level).toBe('number');
      expect(drawn.name).toBeTruthy();
    }
    // A condition worth saying is said; an ordinary one is not.
    expect(plan.party.find((c) => c.id === 'bram').status).toBe(Condition.UNCONSCIOUS);
    expect(plan.party.find((c) => c.id === 'tam').status).toBeNull();
  });

  // @spec PRESENT-READY-027
  it('reports readiness as a share of one, for a bar filled with arrowheads', () => {
    const encounter = fightState();
    encounter.readiness.set('bram', 50);
    encounter.readiness.set('g1', 100);

    const plan = buildFightPlan(encounter, viewport, { phase: FightPhase.ACTING });

    expect(plan.party.find((c) => c.id === 'bram').readiness).toBeCloseTo(0.5, 5);
    expect(plan.enemies.find((e) => e.id === 'g1').readiness).toBe(1);
    // A share the drawing can lay arrowheads along, never a count of its own.
    for (const drawn of [...plan.party, ...plan.enemies]) {
      expect(drawn.readiness).toBeLessThanOrEqual(1);
      expect(drawn.bars.readiness.width).toBeGreaterThan(0);
    }
  });

  // @spec PRESENT-READY-031
  it('marks a full bar as ready, and a filling one as not', () => {
    const encounter = fightState();
    encounter.readiness.set('bram', 100);
    encounter.readiness.set('tam', 30);

    const plan = buildFightPlan(encounter, viewport, { phase: FightPhase.ACTING });

    expect(plan.party.find((c) => c.id === 'bram').readiness).toBe(1);
    expect(plan.party.find((c) => c.id === 'tam').readiness).toBeLessThan(1);
  });

  // @spec PRESENT-FIGHT-024
  it('draws a combatant whose portrait is missing, rather than not drawing', () => {
    const encounter = fightState();
    for (const e of encounter.enemies.members) e.portrait = null;

    const plan = buildFightPlan(encounter, viewport, { phase: FightPhase.ACTING });

    expect(plan.enemies).toHaveLength(3);
    for (const drawn of plan.enemies) {
      expect(drawn.portrait).toBeNull();
      // Everything else about them is still placed and still drawn.
      expect(drawn.portraitBox.size).toBeGreaterThan(0);
      expect(drawn.bars.identity.width).toBeGreaterThan(0);
    }
  });

  // @spec PRESENT-FIGHT-023
  it('carries the portrait each combatant was authored with', () => {
    const encounter = fightState();
    encounter.enemies.members[0].portrait = '/art/goblin.png';

    const plan = buildFightPlan(encounter, viewport, { phase: FightPhase.ACTING });

    expect(plan.enemies[0].portrait).toBe('/art/goblin.png');
    // Nobody authored one for these, and the plan says so rather than inventing one.
    expect(plan.party[0].portrait).toBeNull();
  });

  // @spec PRESENT-FIGHT-004
  it('draws remaining and maximum hit points for everyone', () => {
    const plan = buildFightPlan(fightState(), viewport, { phase: FightPhase.ACTING });

    for (const drawn of [...plan.enemies, ...plan.party]) {
      expect(typeof drawn.hitPoints).toBe('number');
      expect(typeof drawn.maxHitPoints).toBe('number');
      expect(drawn.name).toBeTruthy();
    }
  });

  // @spec PRESENT-FIGHT-003
  it('keeps the fallen in place rather than closing the gap', () => {
    const encounter = fightState();
    applyDamage(encounter.party, 'bram', 9999);
    encounter.enemies.members[0].hitPoints = 0;
    encounter.enemies.members[0].condition = Condition.DEAD;

    const plan = buildFightPlan(encounter, viewport, { phase: FightPhase.ACTING });

    expect(plan.party).toHaveLength(3);
    expect(plan.enemies).toHaveLength(3);
    expect(plan.party.find((c) => c.id === 'bram').down).toBe(true);
    expect(plan.enemies.find((e) => e.id === 'g1').down).toBe(true);
  });

  // @spec PRESENT-FIGHT-001
  it('leaves room for the corridor beneath it rather than covering the screen', () => {
    const plan = buildFightPlan(fightState(), viewport, { phase: FightPhase.ACTING });

    expect(plan.overlaysView).toBe(true);
    expect(plan.bounds.height).toBeLessThan(viewport.height);
  });
});

describe('a panel that stays where it is', () => {
  const planWith = (fight) => buildFightPlan(fight.encounter, viewport, {
    phase: fight.phase,
    pending: fight.pending,
    log: fight.log,
    actor: fight.actor,
    logScroll: fight.logScroll,
  });

  // @spec PRESENT-FIGHT-025
  it('divides the panel into a region for each thing it holds', () => {
    const plan = buildFightPlan(fightState(), viewport, { phase: FightPhase.ACTING });
    const { formation, logBox, promptLine, controlsBox } = plan.regions;

    // Top to bottom, in that order, each inside the panel and none overlapping.
    expect(formation.y).toBeGreaterThanOrEqual(plan.bounds.y);
    expect(logBox.y).toBeGreaterThanOrEqual(formation.y + formation.height);
    expect(promptLine.y).toBeGreaterThanOrEqual(logBox.y + logBox.height);
    expect(controlsBox.y).toBeGreaterThanOrEqual(promptLine.y + promptLine.height);
    expect(controlsBox.y + controlsBox.height)
      .toBeLessThanOrEqual(plan.bounds.y + plan.bounds.height + 0.001);
  });

  // @spec PRESENT-FIGHT-026
  // @spec PRESENT-FIGHT-027
  it('keeps every region where it was when a prompt arrives', () => {
    const fight = opening();
    const quiet = planWith(fight);
    untilAsked(fight);
    const asked = planWith(fight);

    expect(asked.bounds).toEqual(quiet.bounds);
    expect(asked.regions).toEqual(quiet.regions);
    // The prompt's line is there either way; only what is written in it changes.
    expect(quiet.prompt).toBeNull();
    expect(asked.prompt).toBeTruthy();
    for (const [i, card] of asked.party.entries()) {
      expect(card.y).toBe(quiet.party[i].y);
    }
  });

  // @spec PRESENT-FIGHT-026
  // @spec PRESENT-FIGHT-028
  it('keeps every region where it was when targets are offered', () => {
    const fight = controller();
    untilAsked(fight);
    const before = planWith(fight);

    chooseOption(fight, fight.pending.options.findIndex((o) => o.action === FightAction.ATTACK));
    const choosing = planWith(fight);

    expect(choosing.pending.targets).not.toBeNull();
    expect(choosing.regions).toEqual(before.regions);
    for (const [i, card] of choosing.enemies.entries()) {
      expect(card.y).toBe(before.enemies[i].y);
    }
  });

  // @spec PRESENT-FIGHT-026
  it('keeps the panel the same height as the fight wears on', () => {
    const fight = controller();
    const opened = planWith(fight).bounds;

    for (let i = 0; i < 12 && fight.phase === FightPhase.ACTING; i++) {
      untilAsked(fight);
      if (fight.pending) defend(fight);
      else if (fight.actor) playEnemyTurn(fight);
    }

    expect(planWith(fight).bounds).toEqual(opened);
  });
});

describe('each side centred on its own count', () => {
  /** Where a laid-out column begins and ends, including the row heights. */
  const span = (cards) => ({
    top: cards[0].y,
    bottom: cards[cards.length - 1].y + cards[cards.length - 1].height,
  });

  const planFor = (encounter) => buildFightPlan(encounter, viewport, { phase: FightPhase.ACTING });

  // @spec PRESENT-FIGHT-038
  it('centres a short column against the region rather than hanging it from the top', () => {
    const encounter = fightState({
      enemies: [createEnemy({ id: 'g1', name: 'Goblin', maxHitPoints: 9, potValue: 14 })],
    });
    const plan = planFor(encounter);
    const region = plan.regions.formation;
    const { top, bottom } = span(plan.enemies);

    // The gap above the column matches the gap below it.
    expect(top - region.y).toBeCloseTo(region.y + region.height - bottom, 0);
    expect(top).toBeGreaterThan(region.y);
  });

  // @spec PRESENT-FIGHT-038
  it('centres each side on its own count, not on the deeper of the two', () => {
    const encounter = fightState({
      enemies: [createEnemy({ id: 'g1', name: 'Goblin', maxHitPoints: 9, potValue: 14 })],
    });
    const plan = planFor(encounter);

    // One goblin against three characters: the goblin sits level with the party's middle.
    const enemy = span(plan.enemies);
    const party = span(plan.party);
    const midOf = (s) => (s.top + s.bottom) / 2;

    expect(midOf(enemy)).toBeCloseTo(midOf(party), 0);
    expect(enemy.top).toBeGreaterThan(party.top);
  });

  // @spec PRESENT-FIGHT-038
  // @spec PRESENT-FIGHT-026
  it('does not move a column as the fight kills its members', () => {
    const encounter = fightState();
    const before = span(planFor(encounter).enemies);

    const foe = encounter.enemies.members.find((e) => e.id === 'g1');
    foe.hitPoints = 0;
    foe.condition = Condition.DEAD;

    // The fallen keep their places, so the centring cannot creep.
    expect(span(planFor(encounter).enemies)).toEqual(before);
  });

  // @spec PRESENT-FIGHT-039
  it('starts a column too tall for the region at its top edge', () => {
    const many = Array.from({ length: 20 }, (_, i) => createEnemy({
      id: `g${i}`, name: 'Goblin', maxHitPoints: 9, potValue: 14,
    }));
    const plan = planFor(fightState({ enemies: many }));
    const region = plan.regions.formation;

    expect(plan.enemies[0].y).toBeGreaterThanOrEqual(region.y);
  });
});

describe('the log as a window', () => {
  const withLog = (lines, over = {}) => buildFightPlan(fightState(), viewport, {
    phase: FightPhase.ACTING,
    log: Array.from({ length: lines }, (_, i) => `line ${i + 1}`),
    ...over,
  });

  // @spec PRESENT-FIGHT-029
  it('shows the most recent lines that fit, and no more', () => {
    const plan = withLog(40);

    expect(plan.log.length).toBeLessThan(40);
    expect(plan.log.at(-1)).toBe('line 40');
    expect(plan.logBox.height).toBe(withLog(2).logBox.height);
  });

  // @spec PRESENT-FIGHT-030
  it('draws no scrollbar while everything fits, and one when it does not', () => {
    expect(withLog(1).scrollbar).toBeNull();

    const bar = withLog(60).scrollbar;
    expect(bar.thumb.height).toBeLessThan(bar.track.height);
    expect(bar.thumb.height).toBeGreaterThan(0);
    // At the newest line, the thumb sits at the bottom of its track.
    expect(bar.thumb.y + bar.thumb.height).toBeCloseTo(bar.track.y + bar.track.height, 1);
  });

  // @spec PRESENT-FIGHT-031
  it('shows older lines when the view is scrolled back', () => {
    const plan = withLog(60, { logScroll: 5 });

    expect(plan.log.at(-1)).toBe('line 55');
    expect(plan.scrollbar.thumb.y).toBeLessThan(withLog(60).scrollbar.thumb.y);
  });

  // @spec PRESENT-FIGHT-031
  it('scrolls back no further than the first line there is', () => {
    const plan = withLog(60, { logScroll: 9999 });

    expect(plan.log[0]).toBe('line 1');
    expect(plan.scrollbar.thumb.y).toBeCloseTo(plan.scrollbar.track.y, 1);
  });
});

describe('walking back through the log', () => {
  const logged = (lines) => {
    const fight = controller();
    fight.log = Array.from({ length: lines }, (_, i) => `line ${i + 1}`);
    return fight;
  };

  // @spec PRESENT-FIGHT-031
  it('moves the view back by the lines scrolled, and forward again', () => {
    const fight = logged(30);

    expect(scrollLog(fight, 4)).toBe(true);
    expect(fight.logScroll).toBe(4);

    scrollLog(fight, -2);
    expect(fight.logScroll).toBe(2);
  });

  // @spec PRESENT-FIGHT-031
  it('goes back no further than the fight goes, and no further forward than now', () => {
    const fight = logged(6);

    scrollLog(fight, 500);
    expect(fight.logScroll).toBe(5);

    scrollLog(fight, -500);
    expect(fight.logScroll).toBe(0);
  });

  // @spec PRESENT-FIGHT-032
  it('holds where the player left it as the fight goes on', () => {
    const fight = logged(30);
    scrollLog(fight, 6);

    untilAsked(fight);
    defend(fight);

    expect(fight.logScroll).toBe(6);
  });

  // @spec PRESENT-FIGHT-032
  it('opens at the newest line, and stays there while nobody scrolls', () => {
    const fight = controller();
    expect(fight.logScroll).toBe(0);

    for (let i = 0; i < 6 && fight.phase === FightPhase.ACTING; i++) {
      untilAsked(fight);
      if (fight.pending) defend(fight);
      else if (fight.actor) playEnemyTurn(fight);
    }

    expect(fight.logScroll).toBe(0);
  });
});

describe('choosing what to do', () => {
  // @spec PRESENT-FIGHT-005
  it('asks whoever is ready, and only ever somebody who is', () => {
    const fight = controller();
    const asked = [];

    for (let i = 0; i < 6 && fight.phase === FightPhase.ACTING; i++) {
      untilAsked(fight);
      if (!fight.pending) break;
      asked.push(fight.pending.characterId);
      // Whoever is being asked is the one whose bar is full, never anybody else.
      expect(readinessOf(fight.encounter, fight.pending.characterId)).toBeGreaterThanOrEqual(FULL_BAR);
      defend(fight);
    }

    expect(asked.length).toBeGreaterThan(0);
    for (const id of asked) expect(['bram', 'tam', 'isolde']).toContain(id);
  });

  // @spec PRESENT-FIGHT-005
  it('skips anyone who cannot act', () => {
    const encounter = fightState();
    applyDamage(encounter.party, 'bram', 9999);
    const fight = untilReady(createFightController({ encounter, viewport, onDraw: vi.fn() }));

    // A body is never asked anything, however full the bar it had.
    for (let i = 0; i < 6 && fight.phase === FightPhase.ACTING; i++) {
      untilAsked(fight);
      if (!fight.pending) break;
      expect(fight.pending.characterId).not.toBe('bram');
      defend(fight);
    }
  });

  // @spec PRESENT-FIGHT-006
  // @spec COMBAT-TARGET-005
  it('offers no attack to somebody with nothing to swing', () => {
    const encounter = fightState();
    character(encounter.party, 'isolde').attack = null;
    const fight = untilReady(createFightController({ encounter, viewport, onDraw: vi.fn() }));

    while (fight.pending && fight.pending.characterId !== 'isolde') {
      defend(fight);
      untilAsked(fight);
    }

    // Attack keeps its slot, greyed; it is not removed from the row.
    expect(slot(fight, FightAction.ATTACK).available).toBe(false);
    expect(fight.pending.options.map((o) => o.action)).toContain(FightAction.ATTACK);
  });

  // @spec PRESENT-FIGHT-007
  // @spec COMBAT-TARGET-001
  it('offers every standing enemy as a target, wherever they are in the list', () => {
    const fight = controller();
    untilAsked(fight);
    chooseOption(fight, fight.pending.options.findIndex((o) => o.action === FightAction.ATTACK));

    expect(fight.pending.targets.map((t) => t.id).sort()).toEqual(['a1', 'g1', 'g2']);
  });

  // @spec PRESENT-FIGHT-007
  // @spec COMBAT-TARGET-004
  it('offers nobody who has already fallen', () => {
    const encounter = fightState();
    for (const id of ['g1', 'g2']) {
      const foe = encounter.enemies.members.find((e) => e.id === id);
      foe.hitPoints = 0;
      foe.condition = Condition.DEAD;
    }
    const fight = untilReady(createFightController({ encounter, viewport, onDraw: vi.fn() }));
    untilAsked(fight);
    chooseOption(fight, fight.pending.options.findIndex((o) => o.action === FightAction.ATTACK));

    expect(fight.pending.targets.map((t) => t.id)).toEqual(['a1']);
  });

  // @spec COMBAT-TIME-009
  it('resolves each turn as it is taken rather than banking them up', () => {
    const fight = controller();
    const before = fight.encounter.enemies.members.find((e) => e.id === 'g1').hitPoints;

    chooseOption(fight, 0); // attack
    chooseOption(fight, 0); // the first legal target

    expect(fight.turnsTaken).toBe(1);
    expect(fight.encounter.enemies.members.find((e) => e.id === 'g1').hitPoints)
      .toBeLessThan(before);
  });

  // @spec PRESENT-FIGHT-009
  it('reaches no further back than the turn being taken', () => {
    const fight = controller();
    chooseOption(fight, 0); chooseOption(fight, 0); // bram has swung; it is spent
    const whose = fight.pending?.characterId;

    // A turn resolves the instant it is taken, so there is nothing behind this one.
    expect(goBack(fight)).toBe(false);
    expect(fight.pending?.characterId).toBe(whose);
  });

  // @spec PRESENT-FIGHT-009
  it('backs out of a target choice to the action choice for the same character', () => {
    const fight = controller();
    chooseOption(fight, 0); // bram: attack, now choosing a target
    expect(fight.pending.targets).not.toBeNull();

    goBack(fight);

    expect(fight.pending.characterId).toBe('bram');
    expect(fight.pending.targets).toBeNull();
  });
});

describe('the four a turn offers', () => {
  // @spec PRESENT-FIGHT-006
  it('offers the same four, in the same order, on every turn', () => {
    const fight = controller();

    for (let i = 0; i < 5 && fight.phase === FightPhase.ACTING; i++) {
      untilAsked(fight);
      if (!fight.pending) break;
      expect(fight.pending.options.map((o) => o.action)).toEqual([
        FightAction.ATTACK, FightAction.MAGIC, FightAction.INVENTORY, FightAction.FLEE,
      ]);
      defend(fight);
    }
  });

  // @spec PRESENT-FIGHT-006
  it('names them for what they do', () => {
    const fight = controller();
    untilAsked(fight);

    expect(fight.pending.options.map((o) => o.label))
      .toEqual(['Attack', 'Magic', 'Inventory', 'Flee']);
  });

  // @spec PRESENT-FIGHT-034
  // @spec PRESENT-FIGHT-036
  it('keeps an option it cannot offer in its own place, marked unavailable', () => {
    const encounter = fightState();
    character(encounter.party, 'isolde').attack = null;
    const fight = untilReady(createFightController({ encounter, viewport, onDraw: vi.fn() }));

    while (fight.pending && fight.pending.characterId !== 'isolde') {
      defend(fight);
      untilAsked(fight);
    }

    // Still four, still in order - Attack is simply dark.
    expect(fight.pending.options).toHaveLength(OPTION_SLOTS.length);
    expect(fight.pending.options[0].action).toBe(FightAction.ATTACK);
    expect(slot(fight, FightAction.ATTACK).available).toBe(false);
  });

  // @spec PRESENT-FIGHT-036
  it('greys Magic and Inventory, there being no spell and no pack yet', () => {
    const fight = controller();
    untilAsked(fight);

    expect(slot(fight, FightAction.MAGIC).available).toBe(false);
    expect(slot(fight, FightAction.INVENTORY).available).toBe(false);
  });

  // @spec PRESENT-FIGHT-036
  it('offers Attack while anything is standing to swing at', () => {
    const fight = controller();
    untilAsked(fight);

    expect(slot(fight, FightAction.ATTACK).available).toBe(true);
  });

  // @spec PRESENT-FIGHT-036
  // @spec COMBAT-TURN-005
  it('greys Flee when escape is forbidden', () => {
    const encounter = fightState({
      enemies: [createEnemy({
        id: 'j1', name: 'Jailer', maxHitPoints: 9, potValue: 14,
        attack: { baseDamage: 5, accuracy: 24 }, forbidsEscape: true,
      })],
    });
    const fight = untilReady(createFightController({ encounter, viewport, onDraw: vi.fn() }));
    untilAsked(fight);

    expect(slot(fight, FightAction.FLEE).available).toBe(false);
  });

  // @spec PRESENT-FIGHT-036
  // @spec COMBAT-TURN-005
  it('greys Flee when the party cannot outrun what is chasing it', () => {
    const encounter = fightState({
      enemies: [createEnemy({
        id: 'w1', name: 'Wolf', maxHitPoints: 9, potValue: 14,
        attributes: { DEXTERITY: 20 }, attack: { baseDamage: 5, accuracy: 24 },
      })],
    });
    const fight = untilReady(createFightController({ encounter, viewport, onDraw: vi.fn() }));
    untilAsked(fight);

    // A hopeless run is not offered and then charged for; it is not offered.
    expect(slot(fight, FightAction.FLEE).available).toBe(false);
  });

  // @spec PRESENT-FIGHT-040
  it('says on every greyed option why it cannot be taken', () => {
    const fight = controller();
    untilAsked(fight);

    for (const option of fight.pending.options) {
      if (option.available) continue;
      expect(option.reason).toBeTruthy();
      expect(option.reason.length).toBeGreaterThan(0);
    }
  });

  // @spec PRESENT-FIGHT-040
  it('gives a greyed option a reason naming its own cause', () => {
    const encounter = fightState({
      enemies: [createEnemy({
        id: 'w1', name: 'Wolf', maxHitPoints: 9, potValue: 14,
        attributes: { DEXTERITY: 20 }, attack: { baseDamage: 5, accuracy: 24 },
      })],
    });
    const fight = untilReady(createFightController({ encounter, viewport, onDraw: vi.fn() }));
    untilAsked(fight);

    // Two different causes, two different sentences.
    expect(slot(fight, FightAction.FLEE).reason).not.toBe(slot(fight, FightAction.MAGIC).reason);
  });

  // @spec PRESENT-FIGHT-041
  it('gives a greyed option its reason in place of a key hint', () => {
    const fight = controller();
    untilAsked(fight);
    const plan = buildFightPlan(fight.encounter, viewport, {
      phase: fight.phase, pending: fight.pending, actor: fight.actor,
    });

    for (const control of plan.controls.filter((c) => c.role === 'OPTION')) {
      if (control.available) {
        expect(control.hint).toBeTruthy();
        expect(control.reason).toBeNull();
      } else {
        // A key that does nothing is worth less than the sentence explaining why.
        expect(control.hint).toBeNull();
        expect(control.reason).toBeTruthy();
      }
    }
  });

  // @spec COMBAT-TURN-003
  it('accepts no action the character cannot legally take', () => {
    const encounter = fightState();
    character(encounter.party, 'isolde').attack = null;
    const fight = untilReady(createFightController({ encounter, viewport, onDraw: vi.fn() }));
    while (fight.pending && fight.pending.characterId !== 'isolde') {
      defend(fight);
      untilAsked(fight);
    }
    const turns = fight.turnsTaken;

    expect(chooseOption(fight, 0)).toBe(false);
    expect(fight.turnsTaken).toBe(turns);
  });

  // @spec PRESENT-FIGHT-040
  it('gives an available option no reason to explain', () => {
    const fight = controller();
    untilAsked(fight);

    expect(slot(fight, FightAction.ATTACK).reason).toBeNull();
  });

  // @spec PRESENT-FIGHT-035
  it('does nothing at all when a greyed option is pressed', () => {
    const fight = controller();
    untilAsked(fight);
    const whose = fight.pending.characterId;
    const turns = fight.turnsTaken;
    const lines = fight.log.length;

    const magic = fight.pending.options.indexOf(slot(fight, FightAction.MAGIC));
    expect(chooseOption(fight, magic)).toBe(false);

    // The same character is still being asked, and nothing was written down.
    expect(fight.pending.characterId).toBe(whose);
    expect(fight.turnsTaken).toBe(turns);
    expect(fight.log).toHaveLength(lines);
  });

  // @spec PRESENT-FIGHT-037
  it('binds each option to the same number whether or not it can be taken', () => {
    const encounter = fightState();
    character(encounter.party, 'isolde').attack = null;
    const fight = untilReady(createFightController({ encounter, viewport, onDraw: vi.fn() }));
    untilAsked(fight);

    const armed = fight.pending.options.map((o) => o.action);
    while (fight.pending && fight.pending.characterId !== 'isolde') {
      defend(fight);
      untilAsked(fight);
    }

    // Isolde cannot attack, but Attack is still 1 and Flee is still 4.
    expect(fight.pending.options.map((o) => o.action)).toEqual(armed);
  });
});

describe('a turn with nothing in it', () => {
  /** A character who can do nothing at all: nothing to swing, and nowhere to run. */
  function cornered() {
    const encounter = fightState({
      enemies: [createEnemy({
        id: 'j1', name: 'Jailer', maxHitPoints: 9, potValue: 14,
        attack: { baseDamage: 5, accuracy: 24 }, forbidsEscape: true,
      })],
    });
    for (const c of roster(encounter.party)) c.attack = null;
    const fight = untilReady(createFightController({ encounter, viewport, onDraw: vi.fn() }));
    untilAsked(fight);
    return fight;
  }

  // @spec PRESENT-FIGHT-042
  it('offers Pass turn when every option is unavailable', () => {
    const fight = cornered();

    expect(fight.pending.options.every((o) => !o.available)).toBe(true);
    expect(fight.pending.mustPass).toBe(true);
  });

  // @spec PRESENT-FIGHT-042
  it('keeps the four drawn beneath the Pass turn control', () => {
    const fight = cornered();
    const plan = buildFightPlan(fight.encounter, viewport, {
      phase: fight.phase, pending: fight.pending, actor: fight.actor,
    });

    const pass = plan.controls.find((c) => c.role === 'PASS');
    const options = plan.controls.filter((c) => c.role === 'OPTION');

    expect(pass).toBeTruthy();
    expect(pass.label).toBe('Pass turn');
    // The four are still there, explaining what was refused.
    expect(options).toHaveLength(OPTION_SLOTS.length);
    for (const option of options) expect(option.available).toBe(false);
  });

  // @spec PRESENT-FIGHT-044
  it('draws no Pass turn control while anything can be done', () => {
    const fight = controller();
    untilAsked(fight);
    const plan = buildFightPlan(fight.encounter, viewport, {
      phase: fight.phase, pending: fight.pending, actor: fight.actor,
    });

    expect(fight.pending.mustPass).toBe(false);
    expect(plan.controls.find((c) => c.role === 'PASS')).toBeUndefined();
  });

  // @spec PRESENT-FIGHT-043
  // @spec COMBAT-ACTION-009
  it('spends the turn when Pass turn is taken', () => {
    const fight = cornered();
    const whose = fight.pending.characterId;
    const banked = readinessOf(fight.encounter, whose);

    expect(passTurn(fight)).toBe(true);

    expect(fight.turnsTaken).toBe(1);
    expect(readinessOf(fight.encounter, whose)).toBeLessThan(banked);
  });

  // @spec COMBAT-TURN-001
  // @spec COMBAT-TURN-002
  it('waits for the press rather than passing on its own', () => {
    const fight = cornered();
    const whose = fight.pending.characterId;

    // However long the clock runs, a turn nobody pressed for is not taken.
    for (let i = 0; i < 40; i++) advanceClock(fight, FILL_BEAT_MS);

    expect(fight.turnsTaken).toBe(0);
    expect(fight.pending.characterId).toBe(whose);
  });

  // @spec COMBAT-TURN-004
  it('offers passing and nothing else when nothing else is legal', () => {
    const fight = cornered();
    const plan = buildFightPlan(fight.encounter, viewport, {
      phase: fight.phase, pending: fight.pending, actor: fight.actor,
    });

    const pressable = plan.controls.filter((c) => c.role === 'OPTION' && c.available);
    expect(pressable).toHaveLength(0);
    expect(plan.controls.find((c) => c.role === 'PASS')).toBeTruthy();
  });

  // @spec PRESENT-FIGHT-044
  it('refuses a pass from a character who has something to do', () => {
    const fight = controller();
    untilAsked(fight);

    expect(passTurn(fight)).toBe(false);
    expect(fight.turnsTaken).toBe(0);
  });
});

describe('the log', () => {
  // @spec PRESENT-FIGHT-010
  // @spec PRESENT-FIGHT-011
  it('names who acted, the band, the damage, and what fell', () => {
    expect(describeEvent(
      { actorId: 'bram', band: Band.CRIT, damage: 14, fizzled: false },
      { bram: 'Bram', g1: 'Goblin' }, 'g1', true,
    )).toBe('Bram crits Goblin for 14. Goblin falls.');

    expect(describeEvent(
      { actorId: 'tam', band: Band.GRAZE, damage: 3, fizzled: false },
      { tam: 'Tam', g1: 'Goblin' }, 'g1', false,
    )).toBe('Tam grazes Goblin for 3.');

    expect(describeEvent(
      { actorId: 'tam', band: Band.MISS, damage: 0, fizzled: false },
      { tam: 'Tam', g1: 'Goblin' }, 'g1', false,
    )).toBe('Tam misses Goblin.');
  });

  // @spec PRESENT-FIGHT-010
  it('grows only from events a resolved round actually reported', () => {
    const fight = controller();
    expect(fight.log).toHaveLength(0);

    for (let i = 0; i < 3; i++) { chooseOption(fight, 0); chooseOption(fight, 0); }

    expect(fight.log.length).toBeGreaterThan(0);
    for (const line of fight.log) expect(typeof line).toBe('string');
  });
});

describe('ending', () => {
  // @spec PRESENT-FIGHT-014
  it('draws a banner naming the outcome and what a victory was worth', () => {
    const fight = controller({
      enemies: [createEnemy({ id: 'g1', name: 'Goblin', maxHitPoints: 1, potValue: 14, attack: { baseDamage: 5, accuracy: 24 } })],
    });

    // One character can finish this, so the round ends it.
    for (let i = 0; i < 3 && fight.phase !== FightPhase.ENDED; i++) {
      chooseOption(fight, 0);
      if (fight.pending?.targets) chooseOption(fight, 0);
    }

    const plan = buildFightPlan(fight.encounter, viewport, { phase: fight.phase, outcome: fight.outcome });
    expect(fight.phase).toBe(FightPhase.ENDED);
    expect(plan.banner.outcome).toBe(Outcome.VICTORY);
    expect(plan.banner.pot).toBeGreaterThan(0);
  });

  // @spec PRESENT-FIGHT-015
  it('hands control back when the banner is dismissed', () => {
    const fight = controller({
      enemies: [createEnemy({ id: 'g1', name: 'Goblin', maxHitPoints: 1, potValue: 14, attack: { baseDamage: 5, accuracy: 24 } })],
    });
    for (let i = 0; i < 3 && fight.phase !== FightPhase.ENDED; i++) {
      chooseOption(fight, 0);
      if (fight.pending?.targets) chooseOption(fight, 0);
    }

    const done = dismissOutcome(fight);

    expect(done).toBe(true);
    expect(fight.dismissed).toBe(true);
  });

  // @spec PRESENT-FIGHT-014
  it('draws no banner while the fight is still on', () => {
    const plan = buildFightPlan(fightState(), viewport, { phase: FightPhase.ACTING });

    expect(plan.banner).toBeNull();
  });
});

describe('input in a fight', () => {
  // @spec PRESENT-FIGHT-013
  it('resolves a numbered key and a tap on the same option identically', () => {
    const byKey = controller();
    const byTap = controller();

    chooseOption(byKey, 1);
    chooseOption(byTap, 1);

    expect(byKey.pending).toEqual(byTap.pending);
  });

  // @spec PRESENT-FIGHT-013
  it('ignores an option that is not on offer', () => {
    const fight = controller();
    const before = { ...fight.pending };

    expect(chooseOption(fight, 99)).toBe(false);
    expect(fight.pending.characterId).toBe(before.characterId);
  });
});

describe('what a won fight teaches', () => {
  // @spec PRESENT-FIGHT-008
  it('records the skill each attack used, so a victory advances something', () => {
    const fight = controller({
      enemies: [createEnemy({ id: 'g1', name: 'Goblin', maxHitPoints: 1, potValue: 14, attack: { baseDamage: 5, accuracy: 24 } })],
    });

    for (let i = 0; i < 6 && fight.phase !== FightPhase.ENDED; i++) {
      chooseOption(fight, 0);
      if (fight.pending?.targets) chooseOption(fight, 0);
    }

    // Somebody swung at something, so somebody learned from it.
    expect(fight.outcome.skillsByActor.size).toBeGreaterThan(0);
    for (const [, skills] of fight.outcome.skillsByActor) {
      expect(skills.length).toBeGreaterThan(0);
    }
  });
});

describe('a fight on a wide screen', () => {
  const phone = { width: 390, height: 780 };
  const desktop = { width: 2116, height: 1264 };
  const planFor = (vp) => buildFightPlan(fightState(), vp, {
    phase: FightPhase.ACTING,
    pending: { characterId: 'bram', options: [{ label: 'Attack' }, { label: 'Defend' }, { label: 'Flee' }], targets: null },
  });

  // @spec PRESENT-FIGHT-020
  it('lays out in a centred column rather than across the whole window', () => {
    const plan = planFor(desktop);

    expect(plan.bounds.width).toBeLessThan(desktop.width);
    expect(plan.bounds.x).toBeCloseTo((desktop.width - plan.bounds.width) / 2, 5);
  });

  // @spec PRESENT-FIGHT-020
  it('gives a phone its whole width, the column being the screen', () => {
    const plan = planFor(phone);

    expect(plan.bounds.x).toBe(0);
    expect(plan.bounds.width).toBe(phone.width);
  });

  // @spec PRESENT-FIGHT-021
  it('keeps every control inside the column', () => {
    const plan = planFor(desktop);

    expect(plan.controls.length).toBeGreaterThan(0);
    for (const control of plan.controls) {
      expect(control.x).toBeGreaterThanOrEqual(plan.bounds.x);
      expect(control.x + control.width).toBeLessThanOrEqual(plan.bounds.x + plan.bounds.width);
    }
  });

  // @spec PRESENT-FIGHT-022
  it('draws bigger cards on a bigger screen', () => {
    const small = planFor(phone).party[0];
    const large = planFor(desktop).party[0];

    expect(large.width).toBeGreaterThan(small.width);
    expect(large.height).toBeGreaterThan(small.height);
  });

  // @spec PRESENT-CTRL-013
  it('carries the scale on the plan, so nothing works it out while drawing', () => {
    expect(planFor(phone).scale).toBe(1);
    expect(planFor(desktop).scale).toBeGreaterThan(1);
  });
});

describe('the panel is sized to what is in it', () => {
  const desktop = { width: 1920, height: 1080 };
  const withPending = (over) => buildFightPlan(fightState(over), desktop, {
    phase: FightPhase.ACTING,
    pending: { characterId: 'bram', options: [{ label: 'Attack' }, { label: 'Defend' }, { label: 'Flee' }], targets: null },
  });

  // @spec PRESENT-FIGHT-001
  it('leaves more corridor showing for a smaller fight', () => {
    const crowd = withPending({
      enemies: Array.from({ length: 6 }, (_, i) =>
        createEnemy({ id: `g${i}`, name: 'Goblin', maxHitPoints: 9, potValue: 14 })),
    });
    const skirmish = withPending({
      enemies: [createEnemy({ id: 'g1', name: 'Goblin', maxHitPoints: 9, potValue: 14, attack: { baseDamage: 5, accuracy: 24 } })],
    });

    expect(skirmish.bounds.height).toBeLessThan(crowd.bounds.height);
  });

  // @spec PRESENT-FIGHT-001
  it('never takes more than its share of the screen, however crowded', () => {
    const swarm = withPending({
      enemies: Array.from({ length: 20 }, (_, i) =>
        createEnemy({ id: `g${i}`, name: 'Goblin', maxHitPoints: 9, potValue: 14 })),
    });

    expect(swarm.bounds.height).toBeLessThan(desktop.height);
    expect(swarm.bounds.y).toBeGreaterThan(0);
  });

  // @spec PRESENT-FIGHT-021
  it('puts the controls at the foot of the panel, not adrift in the middle of it', () => {
    const plan = withPending();
    const lowest = Math.max(...plan.controls.map((c) => c.y + c.height));
    const panelBottom = plan.bounds.y + plan.bounds.height;

    expect(panelBottom - lowest).toBeLessThan(plan.scale * 20);
    expect(plan.controlsTop).toBeGreaterThan(plan.cardsBottom);
  });
});

describe('the pace the bars are drawn at', () => {
  // @spec PRESENT-READY-032
  it('gives every bar the same span of real time per beat', () => {
    const encounter = fightState();
    const fight = createFightController({ encounter, viewport, onDraw: vi.fn() });
    const beats = fight.encounter.beats;

    // One span of real time buys exactly one beat, for everybody at once.
    advanceClock(fight, FILL_BEAT_MS);

    expect(fight.encounter.beats).toBe(beats + 1);
  });

  // @spec PRESENT-READY-024
  it('is slow enough that a bar takes several seconds to fill', () => {
    // A Dexterity-10 combatant needs ten beats for a bar; the pace makes that readable
    // rather than instant.
    expect(FILL_BEAT_MS * 10).toBeGreaterThanOrEqual(3000);
  });
});

describe('a fight that plays itself out', () => {
  const planOf = (fight) => buildFightPlan(fight.encounter, viewport, {
    phase: fight.phase,
    pending: fight.pending,
    log: fight.log,
    actor: fight.actor,
    notice: fight.notice,
    shakingId: fight.shakingId,
    shake: fight.shake,
    partway: fight.partway,
  });

  // @spec PRESENT-READY-001
  // @spec PRESENT-READY-002
  it('carries how full every bar is, as the simulation has it', () => {
    const fight = controller();
    const plan = planOf(fight);

    for (const card of [...plan.party, ...plan.enemies]) {
      expect(card.readiness).toBeGreaterThanOrEqual(0);
      expect(card.readiness).toBeLessThanOrEqual(1);
    }
    // Whoever is up is full; that is what being up means.
    expect(plan.party.find((c) => c.id === fight.actor.id).readiness).toBe(1);
  });

  // @spec PRESENT-READY-003
  // @spec PRESENT-READY-004
  it('marks the one acting, and only the one', () => {
    const plan = planOf(controller());

    const acting = [...plan.party, ...plan.enemies].filter((c) => c.acting);
    expect(acting).toHaveLength(1);
  });

  // @spec PRESENT-READY-008
  // @spec COMBAT-TURN-001
  it('takes nothing the player has not pressed for, however long it is left', () => {
    const fight = controller();

    advanceClock(fight, BEAT_MS * 100);

    expect(fight.turnsTaken).toBe(0);
    expect(fight.pending).not.toBeNull();
  });

  // @spec PRESENT-READY-010
  // @spec PRESENT-SCENE-011
  it('stops entirely while it is waiting on somebody', () => {
    const fight = controller();

    expect(fightIsPlaying(fight)).toBe(false);
    expect(advanceClock(fight, 10000)).toBe(false);
  });

  // @spec PRESENT-READY-013
  it('names whoever is waiting to be told what to do', () => {
    const fight = controller();

    expect(planOf(fight).prompt).toBe(`${fight.pending.characterId} is ready to act!`);
  });

  // @spec PRESENT-READY-014
  it('says nothing at all while the fight is playing rather than waiting', () => {
    const fight = controller();
    for (let i = 0; i < 10 && fight.pending; i++) defend(fight);

    expect(fight.pending).toBeNull();
    expect(planOf(fight).prompt).toBeNull();
  });

  // @spec PRESENT-READY-015
  // @spec PRESENT-READY-026
  it('keeps the ambush card up while the ambushers act, and plays the fight beneath it', () => {
    // Tough enough to survive being hit back, so the card's lifetime is what is under
    // test rather than how fast the party kills.
    const sturdy = (id) => createEnemy({
      id, name: 'Goblin', maxHitPoints: 400, potValue: 14,
      attack: { baseDamage: 1, accuracy: 24 },
    });
    const fight = opening({
      partyAware: false,
      enemies: [sturdy('g1'), sturdy('g2'), sturdy('a1')],
    });

    expect(planOf(fight).notice).toMatchObject({ text: "You've been ambushed!" });

    // The card lasts until every goblin the ambush favoured has taken its turn — no
    // longer, and not a turn less.
    const goblins = fight.encounter.enemies.members.map((e) => e.id);
    const swung = new Set();
    for (let i = 0; i < 60 && swung.size < goblins.length; i++) {
      // Still up, because a goblin is still owed the turn the ambush bought it.
      expect(planOf(fight).notice).not.toBeNull();
      if (fight.actor && fight.actor.side === 'ENEMIES') {
        swung.add(fight.actor.id);
        playEnemyTurn(fight);
      } else if (fight.pending) {
        defend(fight);
      } else {
        advanceClock(fight, FILL_BEAT_MS);
      }
    }

    expect(swung.size).toBe(goblins.length);
    expect(planOf(fight).notice).toBeNull();
    // It played out beneath the card rather than waiting behind it.
    expect(fight.turnsTaken).toBeGreaterThanOrEqual(goblins.length);
  });

  // @spec PRESENT-READY-033
  it('names the party as the side caught when the party is', () => {
    const fight = opening({ partyAware: false });

    expect(planOf(fight).notice.text).toBe("You've been ambushed!");
  });

  // @spec PRESENT-READY-033
  it('names the enemies as the side caught when they are', () => {
    const fight = opening({ enemiesAware: false });

    expect(planOf(fight).notice.text).toBe('Enemy has been ambushed!');
  });

  // @spec PRESENT-READY-033
  it('tells the two cards apart on their first word, not their last', () => {
    const jumped = planOf(opening({ partyAware: false })).notice.text;
    const sprung = planOf(opening({ enemiesAware: false })).notice.text;

    expect(jumped).not.toBe(sprung);
    expect(jumped.split(' ')[0]).not.toBe(sprung.split(' ')[0]);
  });

  // @spec PRESENT-READY-015
  it('does not bring the card back when an ambusher comes ready a second time', () => {
    const quick = (id) => createEnemy({
      id, name: 'Goblin', maxHitPoints: 30, attributes: { DEXTERITY: 30 },
      attack: { baseDamage: 4, accuracy: 20 },
    });
    const fight = opening({ partyAware: false, enemies: [quick('g1'), quick('g2')] });

    const swung = new Set();
    for (let i = 0; i < 40 && swung.size < 2; i++) {
      if (fight.actor && fight.actor.side === 'ENEMIES') {
        swung.add(fight.actor.id);
        playEnemyTurn(fight);
      } else if (fight.pending) {
        defend(fight);
      } else {
        advanceClock(fight, FILL_BEAT_MS);
      }
    }
    expect(planOf(fight).notice).toBeNull();

    // An ambusher now acts from exactly full to exactly nothing, so who is next turns
    // on what the party drew. Put the party at the back of the queue, so that a goblin
    // coming round a second time is what is actually under test.
    for (const c of roster(fight.encounter.party)) fight.encounter.readiness.set(c.id, 0);

    // Three times the party's speed: the goblins come round again before anybody else.
    untilReady(fight);
    expect(fight.actor.side).toBe('ENEMIES');

    // A quick ambusher coming round again is simply fast, not ambushing twice.
    expect(planOf(fight).notice).toBeNull();
  });

  // @spec PRESENT-READY-015
  it('keeps the card up while an ambushing party is still to act', () => {
    const fight = opening({ enemiesAware: false });

    expect(planOf(fight).notice).not.toBeNull();
    for (let i = 0; i < 2; i++) {
      untilAsked(fight);
      expect(planOf(fight).notice).not.toBeNull();
      defend(fight);
    }

    untilAsked(fight);
    defend(fight);

    expect(planOf(fight).notice).toBeNull();
  });

  // @spec PRESENT-READY-015
  it('counts an ambusher who falls before acting as done', () => {
    const fight = opening({ enemiesAware: false });
    untilAsked(fight);
    const up = fight.pending.characterId;
    expect(planOf(fight).notice).not.toBeNull();

    // Every other ambusher goes down before their turn comes; the one still standing
    // takes theirs, and that is the whole ambush spent.
    for (const c of roster(fight.encounter.party)) {
      if (c.id !== up) applyDamage(fight.encounter.party, c.id, 9999);
    }
    defend(fight);

    expect(planOf(fight).notice).toBeNull();
  });

  // @spec PRESENT-READY-017
  it('announces nothing when neither side was caught out', () => {
    const fight = controller();

    expect(planOf(fight).notice).toBeNull();
  });

  // @spec PRESENT-READY-024
  // @spec COMBAT-SURPRISE-003
  it('opens with every bar part-filled and nobody up', () => {
    const fight = opening();
    const plan = planOf(fight);

    expect(fight.actor).toBeNull();
    expect(fight.pending).toBeNull();
    for (const card of [...plan.party, ...plan.enemies]) {
      expect(card.readiness).toBeGreaterThanOrEqual(0);
      expect(card.readiness).toBeLessThan(1);
    }
    expect(fightIsPlaying(fight)).toBe(true);
  });

  // @spec PRESENT-READY-024
  it('fills the bars a beat per span of real time, and not faster', () => {
    const fight = opening();

    advanceClock(fight, FILL_BEAT_MS - 1);
    expect(fight.encounter.beats).toBe(0);

    advanceClock(fight, 1);
    expect(fight.encounter.beats).toBe(1);

    // However far along the bars opened, the fight's time moves a beat a span.
    const beats = fight.encounter.beats;
    advanceClock(fight, FILL_BEAT_MS * 3);
    expect(fight.encounter.beats).toBeLessThanOrEqual(beats + 3);
  });

  // @spec PRESENT-READY-024
  it('stops filling the moment somebody is up', () => {
    const fight = controller();
    const beats = fight.encounter.beats;

    advanceClock(fight, FILL_BEAT_MS * 20);

    expect(fight.encounter.beats).toBe(beats);
  });

  // @spec PRESENT-READY-025
  it('draws a bar partway through the beat that is filling it', () => {
    const fight = opening();
    // Empty every bar, so what is drawn is the filling and nothing else.
    for (const id of fight.encounter.readiness.keys()) fight.encounter.readiness.set(id, 0);
    advanceClock(fight, FILL_BEAT_MS * 2 + FILL_BEAT_MS / 2);

    const bram = planOf(fight).party.find((c) => c.id === 'bram');

    // Two beats and half of a third, at Bram's ten a beat, of a hundred.
    expect(bram.readiness).toBeCloseTo(0.25, 5);
  });

  // @spec PRESENT-READY-022
  it('carries how much of their hit points everybody has left', () => {
    const fight = controller();
    applyDamage(fight.encounter.party, 'bram', 3);
    const bram = character(fight.encounter.party, 'bram');

    const card = planOf(fight).party.find((c) => c.id === 'bram');

    expect(card.health).toBeCloseTo(bram.hitPoints / bram.maxHitPoints, 5);
    for (const e of planOf(fight).enemies) expect(e.health).toBe(1);
  });

  // @spec PRESENT-READY-023
  it('marks how badly hurt somebody is by the share they have left', () => {
    const fight = controller();
    const bram = character(fight.encounter.party, 'bram');
    const woundAt = (hp) => {
      bram.hitPoints = hp;
      return planOf(fight).party.find((c) => c.id === 'bram').wound;
    };
    const max = bram.maxHitPoints;

    expect(woundAt(max)).toBe(Wound.HEALTHY);
    expect(woundAt(Math.floor(max / 2) + 1)).toBe(Wound.HEALTHY);
    expect(woundAt(Math.floor(max / 2))).toBe(Wound.WOUNDED);
    expect(woundAt(Math.floor(max / 4) + 1)).toBe(Wound.WOUNDED);
    expect(woundAt(Math.floor(max / 4))).toBe(Wound.CRITICAL);
  });

  // @spec PRESENT-READY-018
  // @spec PRESENT-READY-019
  it('shakes the card of whoever just swung, decaying to nothing over the beat', () => {
    const fight = controller();
    while (fight.pending && fight.pending.characterId !== 'bram') {
      defend(fight);
      untilAsked(fight);
    }
    defend(fight);

    const struck = planOf(fight).party.find((c) => c.id === 'bram');
    expect(Math.abs(struck.offsetY)).toBeGreaterThan(0);
    expect(Math.abs(struck.offsetY)).toBeLessThanOrEqual(SHAKE_PIXELS * 2);

    advanceClock(fight, BEAT_MS * 2);

    expect(planOf(fight).party.find((c) => c.id === 'bram').offsetY).toBe(0);
  });

  // @spec PRESENT-READY-018
  it('shakes nobody who has not just swung', () => {
    const plan = planOf(controller());

    for (const card of [...plan.party, ...plan.enemies]) expect(card.offsetY).toBe(0);
  });

  // @spec PRESENT-READY-005
  it('plays an enemy turn a beat after the last action, not the instant it is due', () => {
    const fight = controller();
    for (let i = 0; i < 20 && !(fight.actor && fight.actor.side === 'ENEMIES'); i++) {
      if (fight.pending) defend(fight);
      else advanceClock(fight, FILL_BEAT_MS);
    }
    expect(fight.pending).toBeNull();
    fight.beat = 0;
    const taken = fight.turnsTaken;

    advanceClock(fight, BEAT_MS - 1);
    expect(fight.turnsTaken).toBe(taken);

    advanceClock(fight, 2);
    expect(fight.turnsTaken).toBe(taken + 1);
  });

  // @spec PRESENT-READY-006
  it("leaves the fight's own time alone, however many seconds pass", () => {
    const fight = controller();
    const beats = fight.encounter.beats;

    advanceClock(fight, BEAT_MS * 20);

    // Seconds are the player's; beats are the fight's, and only an action spends them.
    expect(fight.encounter.beats).toBe(beats);
  });
});
