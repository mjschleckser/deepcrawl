import { describe, it, expect, vi } from 'vitest';
import { makeRng } from '../sim/rng.js';
import {
  CharacterClass, Skill, createParty, createCharacter, addCharacter, applyDamage, character,
  roster, Condition,
} from '../sim/party.js';
import {
  beginEncounter, createEnemy, createEnemyGroup, readinessOf, turnOrder, hitDamage,
  FULL_BAR, Outcome,
} from '../sim/combat.js';
import { MIN_TAP_PX } from './geometry.js';
import { createSpell, CastWhere, Learned, SpellTarget } from '../sim/magic.js';
import { weaponSymbol } from './symbols.js';
import {
  buildFightPlan, createFightController, chooseOption, pressOption, goBack, dismissOutcome,
  playEnemyTurn, passTurn, advanceClock, fightIsPlaying, scrollLog,
  SHAKE_PIXELS, TURN_STRIP_LENGTH, Wound, OPTION_SLOTS,
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


/** Walk the fight on until the party is being asked something, or it ends. */
function untilAsked(fight, limit = 200) {
  for (let i = 0; i < limit && fight.phase === FightPhase.ACTING && !fight.pending; i++) {
    playEnemyTurn(fight);
  }
  return fight;
}

const viewport = { width: 900, height: 640 };

/** Held in the hand of a character authored with a blade. */
const mace = { name: 'Mace', skill: Skill.BLUNT, damage: 8, governs: 'MIGHT' };

const hero = (id, cls) =>
  createCharacter({
    id, name: id, characterClass: cls,
    attack: { skill: Skill.BLADE, baseDamage: 9 },
  });

function fightState({ enemies, light = 'BRIGHT' } = {}) {
  const party = createParty();
  addCharacter(party, hero('bram', CharacterClass.FIGHTER));
  addCharacter(party, hero('tam', CharacterClass.THIEF));
  addCharacter(party, hero('isolde', CharacterClass.MAGE));

  return beginEncounter({
    party,
    enemies: createEnemyGroup(enemies ?? [
      createEnemy({ id: 'g1', name: 'Goblin', maxHitPoints: 9, potValue: 14, attack: { baseDamage: 5 } }),
      createEnemy({ id: 'g2', name: 'Goblin', maxHitPoints: 9, potValue: 14, attack: { baseDamage: 5 } }),
      createEnemy({ id: 'a1', name: 'Goblin Archer', maxHitPoints: 7, potValue: 18, attack: { baseDamage: 5 } }),
    ]),
    light,
    rng: makeRng(4),
    origin: { floorId: 'f1', x: 2, y: 3 },
  });
}

/** A fight as it opens, which is already at its first turn. */
const controller = (over = {}) =>
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
  it('draws a portrait and two stacked bars for every combatant, and no readiness', () => {
    const plan = buildFightPlan(fightState(), viewport, { phase: FightPhase.ACTING });

    for (const drawn of [...plan.enemies, ...plan.party]) {
      expect(drawn.portraitBox.size).toBe(drawn.height);
      expect(drawn.portraitBox.x).toBe(drawn.x);
      const { identity, health } = drawn.bars;
      // Identity above, hit points beneath, and nothing else to mistake them for.
      expect(identity.y).toBeLessThan(health.y);
      expect(Object.keys(drawn.bars).sort()).toEqual(['health', 'identity']);
      expect(drawn.readiness).toBeUndefined();
      // Beside the portrait, never over it.
      for (const bar of [identity, health]) {
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
    const fight = untilAsked(controller());
    const asked = planWith(fight);
    const quiet = buildFightPlan(fight.encounter, viewport, {
      phase: fight.phase, pending: null, log: fight.log, actor: null,
    });

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
  it('goes back no further than a full window of the oldest lines, and no further forward than now', () => {
    const fight = logged(8);

    scrollLog(fight, 500);
    const oldest = buildFightPlan(fight.encounter, viewport, {
      phase: fight.phase, log: fight.log, logScroll: fight.logScroll,
    }).log;
    expect(oldest[0]).toBe('line 1');
    // Nothing is left to unwind: the first turn back moves what is on the screen.
    expect(scrollLog(fight, -1)).toBe(true);
    expect(buildFightPlan(fight.encounter, viewport, {
      phase: fight.phase, log: fight.log, logScroll: fight.logScroll,
    }).log[0]).toBe('line 2');

    scrollLog(fight, -500);
    expect(fight.logScroll).toBe(0);
  });

  // @spec PRESENT-FIGHT-031
  it('holds the lines in view where the player left them as the fight goes on', () => {
    const fight = logged(30);
    scrollLog(fight, 6);
    const inView = () => buildFightPlan(fight.encounter, viewport, {
      phase: fight.phase, log: fight.log, logScroll: fight.logScroll,
    }).log;
    const before = inView();

    untilAsked(fight);
    defend(fight);

    expect(fight.log.length).toBeGreaterThan(30);
    expect(inView()).toEqual(before);
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
    const fight = createFightController({ encounter, viewport, onDraw: vi.fn() });

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
    const fight = createFightController({ encounter, viewport, onDraw: vi.fn() });

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
    const foe = encounter.enemies.members.find((e) => e.id === 'g1');
    foe.hitPoints = 0;
    foe.condition = Condition.DEAD;
    const fight = createFightController({ encounter, viewport, onDraw: vi.fn() });
    untilAsked(fight);
    chooseOption(fight, fight.pending.options.findIndex((o) => o.action === FightAction.ATTACK));

    expect(fight.pending.targets.map((t) => t.id)).toEqual(['g2', 'a1']);
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
        FightAction.ATTACK, FightAction.MAGIC, FightAction.ITEMS, FightAction.FLEE,
      ]);
      defend(fight);
    }
  });

  // @spec PRESENT-FIGHT-034
  // @spec PRESENT-FIGHT-036
  it('keeps an option it cannot offer in its own place, marked unavailable', () => {
    const encounter = fightState();
    character(encounter.party, 'isolde').attack = null;
    const fight = createFightController({ encounter, viewport, onDraw: vi.fn() });

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
  it('greys Magic, there being no spell, and Items while the pack is empty', () => {
    const fight = controller();
    untilAsked(fight);

    expect(slot(fight, FightAction.MAGIC).available).toBe(false);
    expect(slot(fight, FightAction.ITEMS).available).toBe(false);
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
        attack: { baseDamage: 5 }, forbidsEscape: true,
      })],
    });
    const fight = createFightController({ encounter, viewport, onDraw: vi.fn() });
    untilAsked(fight);

    expect(slot(fight, FightAction.FLEE).available).toBe(false);
  });

  // @spec PRESENT-FIGHT-036
  // @spec COMBAT-TURN-005
  it('greys Flee when the party cannot outrun what is chasing it', () => {
    const encounter = fightState({
      enemies: [createEnemy({
        id: 'w1', name: 'Wolf', maxHitPoints: 9, potValue: 14,
        attributes: { DEXTERITY: 20 }, attack: { baseDamage: 5 },
      })],
    });
    const fight = createFightController({ encounter, viewport, onDraw: vi.fn() });
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
        attributes: { DEXTERITY: 20 }, attack: { baseDamage: 5 },
      })],
    });
    const fight = createFightController({ encounter, viewport, onDraw: vi.fn() });
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
    const fight = createFightController({ encounter, viewport, onDraw: vi.fn() });
    while (fight.pending && fight.pending.characterId !== 'isolde') {
      defend(fight);
      untilAsked(fight);
    }
    const turns = fight.turnsTaken;

    expect(chooseOption(fight, 0)).toBe(false);
    expect(fight.turnsTaken).toBe(turns);
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
    const fight = createFightController({ encounter, viewport, onDraw: vi.fn() });
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
        attack: { baseDamage: 5 }, forbidsEscape: true,
      })],
    });
    for (const c of roster(encounter.party)) c.attack = null;
    const fight = createFightController({ encounter, viewport, onDraw: vi.fn() });
    untilAsked(fight);
    return fight;
  }

  // @spec PRESENT-FIGHT-036
  // @spec ITEM-HOLD-001
  it('offers Attack to a character holding a weapon, whatever they were authored with', () => {
    const encounter = fightState();
    for (const c of roster(encounter.party)) {
      c.attack = null;
      c.equipment.MAIN_HAND = mace;
    }
    const fight = createFightController({ encounter, viewport, onDraw: vi.fn() });
    untilAsked(fight);

    expect(slot(fight, FightAction.ATTACK).available).toBe(true);
  });

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
    for (let i = 0; i < 40; i++) advanceClock(fight, BEAT_MS);

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
  it('names who acted, whom they struck, the damage, and what fell', () => {
    expect(describeEvent(
      { actorId: 'bram', damage: 14, fizzled: false },
      { bram: 'Bram', g1: 'Goblin' }, 'g1', true,
    )).toBe('Bram hits Goblin for 14. Goblin falls.');

    expect(describeEvent(
      { actorId: 'tam', damage: 3, fizzled: false },
      { tam: 'Tam', g1: 'Goblin' }, 'g1', false,
    )).toBe('Tam hits Goblin for 3.');
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
      enemies: [createEnemy({ id: 'g1', name: 'Goblin', maxHitPoints: 1, potValue: 14, attack: { baseDamage: 5 } })],
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
      enemies: [createEnemy({ id: 'g1', name: 'Goblin', maxHitPoints: 1, potValue: 14, attack: { baseDamage: 5 } })],
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
  // @spec COMBAT-ACTION-010
  it('credits a blow to the weapon in hand, not the attack the character was authored with', () => {
    const encounter = fightState();
    const fight = createFightController({ encounter, viewport, onDraw: vi.fn() });
    const whose = fight.pending.characterId;
    character(encounter.party, whose).equipment.MAIN_HAND = mace;

    chooseOption(fight, 0);
    chooseOption(fight, 0);

    const trained = [...encounter.skillsByActor.get(whose)];
    expect(trained).toEqual([Skill.BLUNT]);
  });

  // @spec ITEM-NUM-007
  it('credits a wand\'s blow to the wielder\'s strongest magic school', () => {
    const encounter = fightState();
    const fight = createFightController({ encounter, viewport, onDraw: vi.fn() });
    const whose = fight.pending.characterId;
    const c = character(encounter.party, whose);
    c.ranks[Skill.HEALING] = 4;
    c.equipment.MAIN_HAND = { name: 'Wand', skill: 'MAGIC', damage: 6, governs: 'INTELLECT' };

    chooseOption(fight, 0);
    chooseOption(fight, 0);

    expect([...encounter.skillsByActor.get(whose)]).toEqual([Skill.HEALING]);
  });

  // @spec PRESENT-FIGHT-008
  it('records the skill each attack used, so a victory advances something', () => {
    const fight = controller({
      enemies: [createEnemy({ id: 'g1', name: 'Goblin', maxHitPoints: 1, potValue: 14, attack: { baseDamage: 5 } })],
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
      enemies: [createEnemy({ id: 'g1', name: 'Goblin', maxHitPoints: 9, potValue: 14, attack: { baseDamage: 5 } })],
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

describe('a fight that plays itself out', () => {
  const planOf = (fight) => buildFightPlan(fight.encounter, viewport, {
    phase: fight.phase,
    pending: fight.pending,
    log: fight.log,
    actor: fight.actor,
    shakingId: fight.shakingId,
    shake: fight.shake,
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
});

describe('the turn strip', () => {
  const planOf = (fight, over = {}) => buildFightPlan(fight.encounter, viewport, {
    phase: fight.phase, pending: fight.pending, log: fight.log, actor: fight.actor, ...over,
  });

  // @spec PRESENT-STRIP-001
  // @spec PRESENT-STRIP-007
  it('runs along the top of the screen, in the order the simulation reports', () => {
    const fight = controller();
    const plan = planOf(fight);
    const { tiles, box } = plan.strip;

    expect(tiles.map((t) => t.id))
      .toEqual(turnOrder(fight.encounter, TURN_STRIP_LENGTH).map((t) => t.id));
    expect(box.y + box.height).toBeLessThanOrEqual(plan.bounds.y);
    expect(box.y).toBeLessThan(viewport.height / 4);
    for (const [i, tile] of tiles.entries()) {
      expect(tile.x).toBeGreaterThanOrEqual(plan.bounds.x);
      expect(tile.x + tile.size).toBeLessThanOrEqual(plan.bounds.x + plan.bounds.width);
      if (i > 0) expect(tile.x).toBeGreaterThan(tiles[i - 1].x);
    }
  });

  // @spec PRESENT-STRIP-002
  it('shows the same number of turns however few are fighting', () => {
    const fight = controller({
      enemies: [createEnemy({ id: 'g1', name: 'Goblin', maxHitPoints: 90, potValue: 14, attack: { baseDamage: 1 } })],
    });

    expect(planOf(fight).strip.tiles).toHaveLength(TURN_STRIP_LENGTH);
    defend(fight);
    expect(planOf(fight).strip.tiles).toHaveLength(TURN_STRIP_LENGTH);
  });

  // @spec PRESENT-STRIP-003
  it('draws whoever acts now larger and highlighted, and nobody else', () => {
    const fight = controller();
    const [first, ...rest] = planOf(fight).strip.tiles;

    expect(first.id).toBe(fight.actor.id);
    expect(first.current).toBe(true);
    for (const tile of rest) {
      expect(tile.current).toBe(false);
      expect(tile.size).toBeLessThan(first.size);
    }
  });

  // @spec PRESENT-STRIP-004
  it('carries each tile\'s portrait and side', () => {
    const encounter = fightState();
    encounter.enemies.members[0].portrait = '/art/goblin.png';
    const plan = planOf(createFightController({ encounter, viewport, onDraw: vi.fn() }));

    const sides = new Set(plan.strip.tiles.map((t) => t.side));
    expect(sides).toEqual(new Set(['PARTY', 'ENEMIES']));
    const goblin = plan.strip.tiles.find((t) => t.id === 'g1');
    expect(goblin.portrait).toBe('/art/goblin.png');
  });

  // @spec PRESENT-STRIP-005
  it("marks a character's tile with their initial, and an enemy's with its place in the column", () => {
    const { tiles } = planOf(controller()).strip;
    const markOf = (id) => tiles.find((t) => t.id === id)?.mark;

    expect(markOf('bram')).toBe('B');
    expect(markOf('g1')).toBe('1');
    expect(markOf('a1')).toBe('3');
  });

  // @spec PRESENT-STRIP-005
  it('keeps an enemy\'s number when one above it falls', () => {
    const encounter = fightState();
    const foe = encounter.enemies.members.find((e) => e.id === 'g1');
    foe.hitPoints = 0;
    foe.condition = Condition.DEAD;
    const { tiles } = planOf(createFightController({ encounter, viewport, onDraw: vi.fn() })).strip;

    expect(tiles.find((t) => t.id === 'a1')?.mark).toBe('3');
  });

  // @spec PRESENT-STRIP-006
  it('keeps a tile whose portrait is missing', () => {
    const fight = controller();
    const tile = planOf(fight).strip.tiles.find((t) => t.id === 'bram');

    expect(tile.portrait).toBeNull();
    expect(tile.size).toBeGreaterThan(0);
    expect(tile.mark).toBe('B');
  });

  // @spec PRESENT-STRIP-007
  it('drops a fallen combatant, because the simulation does', () => {
    const encounter = fightState();
    const foe = encounter.enemies.members.find((e) => e.id === 'g1');
    foe.hitPoints = 0;
    foe.condition = Condition.DEAD;
    const fight = createFightController({ encounter, viewport, onDraw: vi.fn() });

    expect(planOf(fight).strip.tiles.map((t) => t.id)).not.toContain('g1');
  });

  // @spec PRESENT-STRIP-008
  it('offers nothing to press along the strip', () => {
    const plan = planOf(untilAsked(controller()));
    const stripFoot = plan.strip.box.y + plan.strip.box.height;

    for (const control of plan.controls) expect(control.y).toBeGreaterThanOrEqual(stripFoot);
  });

  // @spec PRESENT-STRIP-009
  it('places every tile in the plan', () => {
    for (const tile of planOf(controller()).strip.tiles) {
      expect(Number.isFinite(tile.x)).toBe(true);
      expect(Number.isFinite(tile.y)).toBe(true);
      expect(tile.size).toBeGreaterThan(0);
    }
  });

  // @spec PRESENT-STRIP-010
  it('shows no turns once the fight has ended', () => {
    const fight = controller();
    for (const foe of fight.encounter.enemies.members) {
      foe.hitPoints = 0;
      foe.condition = Condition.DEAD;
    }

    const plan = planOf(fight, { phase: FightPhase.ENDED, outcome: { outcome: Outcome.VICTORY, pot: 1 } });

    expect(plan.strip.tiles).toEqual([]);
  });

  // @spec PRESENT-FIGHT-026
  it('keeps its place as the fight wears on', () => {
    const fight = controller();
    const opened = planOf(fight).strip.box;

    for (let i = 0; i < 8 && fight.phase === FightPhase.ACTING; i++) {
      untilAsked(fight);
      if (fight.pending) defend(fight);
    }

    expect(planOf(fight).strip.box).toEqual(opened);
  });
});

describe('telling enemies of one name apart', () => {
  // @spec PRESENT-READY-029
  it('calls every enemy by its own name alone', () => {
    const plan = buildFightPlan(fightState(), viewport, { phase: FightPhase.ACTING });

    expect(plan.enemies.map((e) => e.name)).toEqual(['Goblin', 'Goblin', 'Goblin Archer']);
  });

  // @spec PRESENT-MENU-017
  it('lists targets top to bottom as the column does, passing over the fallen', () => {
    const encounter = fightState();
    const foe = encounter.enemies.members.find((e) => e.id === 'g2');
    foe.hitPoints = 0;
    foe.condition = Condition.DEAD;
    const fight = untilAsked(createFightController({ encounter, viewport, onDraw: vi.fn() }));

    chooseOption(fight, 0);

    expect(fight.pending.targets.map((t) => t.id)).toEqual(['g1', 'a1']);
  });
});

describe('the action menu', () => {
  const narrow = { width: 375, height: 667 };
  const planOf = (fight, vp = viewport) => buildFightPlan(fight.encounter, vp, {
    phase: fight.phase, pending: fight.pending, log: fight.log, actor: fight.actor,
  });
  const options = (plan) => plan.controls.filter((c) => c.role === 'OPTION');
  const entries = (plan) => plan.controls.filter((c) => c.role === 'TARGET');
  const lone = () => [createEnemy({
    id: 'g1', name: 'Goblin', maxHitPoints: 90, potValue: 14, attack: { baseDamage: 5 },
  })];

  // @spec PRESENT-MENU-002
  it('asks even when there is only one thing to strike', () => {
    const fight = controller({ enemies: lone() });

    chooseOption(fight, 0);

    expect(fight.turnsTaken).toBe(0);
    expect(fight.pending.targets.map((t) => t.id)).toEqual(['g1']);
    expect(entries(planOf(fight))).toHaveLength(1);

    chooseOption(fight, 0);
    expect(fight.turnsTaken).toBe(1);
  });

  // @spec PRESENT-MENU-009
  it('makes a double press on Attack harmless with one enemy left', () => {
    const fight = controller({ enemies: lone() });
    const whose = fight.pending.characterId;

    pressOption(fight, 0);
    pressOption(fight, 0);

    expect(fight.turnsTaken).toBe(0);
    expect(fight.pending.characterId).toBe(whose);
    expect(fight.pending.targets).toBeNull();
  });

  // @spec PRESENT-MENU-002
  it('opens a menu and takes nothing while there is a choice to make', () => {
    const fight = controller();

    chooseOption(fight, 0);

    expect(fight.turnsTaken).toBe(0);
    expect(fight.pending.targets).toHaveLength(3);
    expect(planOf(fight).menu).not.toBeNull();
  });

  // @spec PRESENT-MENU-002
  it('draws no menu until something opens one', () => {
    expect(planOf(controller()).menu).toBeNull();
  });

  // @spec PRESENT-MENU-003
  it('rises from the top of the button that opened it, starting at its left edge', () => {
    const fight = controller();
    chooseOption(fight, 0);
    const plan = planOf(fight);
    const attack = options(plan)[0];

    expect(plan.menu.box.x).toBe(attack.x);
    expect(plan.menu.box.y + plan.menu.box.height).toBeLessThanOrEqual(attack.y);
    expect(attack.y - (plan.menu.box.y + plan.menu.box.height)).toBeLessThan(plan.scale * 12);
  });

  // @spec PRESENT-MENU-003
  it('moves inward rather than leaving the panel when opened from the far end', () => {
    const fight = controller();
    chooseOption(fight, 0);
    fight.pending = { ...fight.pending, openedBy: 3 };
    const plan = planOf(fight, narrow);

    expect(plan.menu.box.x + plan.menu.box.width).toBeLessThanOrEqual(plan.bounds.x + plan.bounds.width);
    expect(plan.menu.box.x).toBeLessThan(options(plan)[3].x);
  });

  // @spec PRESENT-MENU-004
  // @spec PRESENT-FIGHT-026
  it('moves no control and no region', () => {
    const fight = controller();
    const before = planOf(fight);

    chooseOption(fight, 0);
    const after = planOf(fight);

    expect(after.regions).toEqual(before.regions);
    expect(after.bounds).toEqual(before.bounds);
    for (const [i, option] of options(after).entries()) {
      const was = options(before)[i];
      expect([option.x, option.y, option.width, option.height])
        .toEqual([was.x, was.y, was.width, was.height]);
    }
    for (const [i, card] of after.enemies.entries()) expect(card.y).toBe(before.enemies[i].y);
  });

  // @spec PRESENT-MENU-005
  it('keeps the four drawn, with the one that opened it marked as open', () => {
    const fight = controller();
    chooseOption(fight, 0);

    const row = options(planOf(fight));

    expect(row).toHaveLength(OPTION_SLOTS.length);
    expect(row.map((o) => o.open)).toEqual([true, false, false, false]);
  });

  // @spec PRESENT-MENU-006
  it('puts each target\'s hit points on their entry', () => {
    const fight = controller();
    fight.encounter.enemies.members[0].hitPoints = 4;
    chooseOption(fight, 0);

    const first = entries(planOf(fight))[0];

    expect(first.label).toBe('Goblin');
    expect(first.detail).toBe('4/9');
  });

  // @spec PRESENT-MENU-016
  it('puts what the attack will deal on each target\'s entry', () => {
    const fight = controller();
    fight.encounter.enemies.members[2].armour = 3;
    const whose = fight.pending.characterId;
    chooseOption(fight, 0);

    const drawn = entries(planOf(fight));

    expect(drawn[0].preview).toBe(String(hitDamage(fight.encounter, whose, 'g1')));
    expect(drawn[2].preview).toBe(String(hitDamage(fight.encounter, whose, 'a1')));
    expect(drawn[2].preview).not.toBe(drawn[0].preview);
  });

  // @spec PRESENT-MENU-018
  it('carries the skill of the weapon in hand, not the attack the character was authored with', () => {
    const encounter = fightState();
    const fight = createFightController({ encounter, viewport, onDraw: vi.fn() });
    character(encounter.party, fight.pending.characterId).equipment.MAIN_HAND = mace;

    chooseOption(fight, 0);

    for (const entry of entries(planOf(fight))) expect(entry.weapon).toBe(Skill.BLUNT);
  });

  // @spec PRESENT-MENU-018
  it('has a symbol of its own for each weapon skill', () => {
    const drawn = [Skill.BLADE, Skill.BLUNT, Skill.POLEARM, Skill.BOW]
      .map((skill) => JSON.stringify(weaponSymbol(skill)));

    expect(new Set(drawn).size).toBe(4);
  });

  // @spec PRESENT-MENU-007
  it('stays one column while one column fits', () => {
    const fight = controller();
    chooseOption(fight, 0);

    expect(new Set(entries(planOf(fight, narrow)).map((e) => e.x)).size).toBe(1);
  });

  // @spec PRESENT-MENU-007
  // @spec PRESENT-CTRL-002
  it('wraps a swarm into columns, staying below the strip and thumb-sized', () => {
    const many = Array.from({ length: 20 }, (_, i) => createEnemy({
      id: `g${i}`, name: 'Goblin', maxHitPoints: 9, potValue: 14, attack: { baseDamage: 1 },
    }));
    const fight = untilAsked(controller({ enemies: many }));
    chooseOption(fight, 0);

    const plan = planOf(fight, narrow);
    const drawn = entries(plan);

    expect(drawn).toHaveLength(20);
    expect(new Set(drawn.map((e) => e.x)).size).toBeGreaterThan(1);
    expect(plan.menu.box.y).toBeGreaterThanOrEqual(plan.strip.box.y + plan.strip.box.height);
    for (const entry of drawn) {
      expect(entry.height).toBeGreaterThanOrEqual(MIN_TAP_PX);
      expect(entry.x + entry.width).toBeLessThanOrEqual(plan.bounds.x + plan.bounds.width + 0.001);
    }
  });

  // @spec PRESENT-MENU-008
  // @spec PRESENT-FIGHT-037
  it('gives the number keys to the menu while it is open', () => {
    const fight = controller();
    chooseOption(fight, 0);

    chooseOption(fight, 1);
    expect(fight.turnsTaken).toBe(1);
    const [first, second] = fight.encounter.enemies.members;
    expect(first.hitPoints).toBe(first.maxHitPoints);
    expect(second.hitPoints).toBeLessThan(second.maxHitPoints);
  });

  // @spec PRESENT-MENU-008
  it('prints no number on an entry', () => {
    const fight = controller();
    chooseOption(fight, 0);

    for (const entry of entries(planOf(fight))) expect(entry.hint).toBeNull();
  });

  // @spec PRESENT-MENU-009
  // @spec PRESENT-FIGHT-009
  it('closes when the button that opened it is pressed again, taking nothing', () => {
    const fight = controller();
    pressOption(fight, 0);
    expect(fight.pending.targets).not.toBeNull();

    expect(pressOption(fight, 0)).toBe(true);

    expect(fight.pending.targets).toBeNull();
    expect(fight.turnsTaken).toBe(0);
  });

  // @spec PRESENT-MENU-010
  it('treats a press on a different option as if no menu were open', () => {
    const fight = controller();
    const whose = fight.pending.characterId;
    pressOption(fight, 0);

    pressOption(fight, fight.pending.options.findIndex((o) => o.action === FightAction.FLEE));

    // Flee was pressed: it either got the party out or spent this character's turn.
    expect(fight.phase === FightPhase.ENDED || fight.turnsTaken === 1).toBe(true);
    expect(fight.pending?.characterId).not.toBe(whose);
    expect(fight.pending?.targets ?? null).toBeNull();
  });

  // @spec PRESENT-MENU-011
  it('leaves the menu open when a greyed option is pressed', () => {
    const fight = controller();
    pressOption(fight, 0);
    const magic = fight.pending.options.findIndex((o) => o.action === FightAction.MAGIC);

    expect(pressOption(fight, magic)).toBe(false);

    expect(fight.pending.targets).not.toBeNull();
    expect(fight.turnsTaken).toBe(0);
  });

  // @spec PRESENT-MENU-014
  it('attempts Flee on the press, with no menu', () => {
    const fight = controller();
    const whose = fight.pending.characterId;

    pressOption(fight, fight.pending.options.findIndex((o) => o.action === FightAction.FLEE));

    expect(fight.phase === FightPhase.ENDED || fight.turnsTaken === 1).toBe(true);
    expect(fight.pending?.characterId).not.toBe(whose);
  });

  // @spec PRESENT-FIGHT-045
  it('keeps the four on one row at every width, and sizes the region to that row', () => {
    for (const vp of [narrow, { width: 320, height: 568 }, viewport]) {
      const plan = planOf(controller(), vp);
      const row = options(plan);

      expect(row).toHaveLength(4);
      expect(new Set(row.map((o) => o.y)).size).toBe(1);
      for (const option of row) expect(option.width).toBeGreaterThanOrEqual(MIN_TAP_PX);
      expect(plan.regions.controlsBox.height).toBeLessThan(row[0].height * 1.5);
    }
  });

  // @spec PRESENT-FIGHT-045
  it('does not grow the controls for a crowd', () => {
    const many = Array.from({ length: 12 }, (_, i) => createEnemy({
      id: `g${i}`, name: 'Goblin', maxHitPoints: 9, potValue: 14, attack: { baseDamage: 1 },
    }));
    const crowd = planOf(controller({ enemies: many }));

    expect(crowd.regions.controlsBox.height).toBe(planOf(controller()).regions.controlsBox.height);
  });
});

describe('the pace of a fight', () => {
  /** Enemies so slow that the party's turns run on from one another. */
  const dawdling = () => [createEnemy({
    id: 's1', name: 'Slug', maxHitPoints: 90, potValue: 14,
    attributes: { DEXTERITY: 1 }, attack: { baseDamage: 1 },
  })];

  /** A fight stopped at the moment an enemy is the next to act. */
  function atAnEnemy() {
    const fight = controller();
    for (let i = 0; i < 40 && fight.pending; i++) defend(fight);
    expect(fight.pending).toBeNull();
    expect(fight.actor.side).toBe('ENEMIES');
    return fight;
  }

  // @spec PRESENT-READY-035
  it('reaches the first turn the moment the fight opens', () => {
    const fight = controller();

    expect(fight.actor).not.toBeNull();
  });

  // @spec PRESENT-READY-035
  it('runs straight on to the next turn when one ends, with no time passing on screen', () => {
    const fight = controller();

    defend(fight);

    expect(fight.actor).not.toBeNull();
  });

  // @spec PRESENT-READY-034
  it('asks the next character at once, with no pause', () => {
    const fight = controller({ enemies: dawdling() });
    const first = fight.pending.characterId;

    defend(fight);

    expect(fight.pending).not.toBeNull();
    expect(fight.pending.characterId).not.toBe(first);
  });

  // @spec PRESENT-READY-005
  it('waits one pause before an enemy takes its turn', () => {
    const fight = atAnEnemy();
    fight.beat = 0;
    const taken = fight.turnsTaken;

    advanceClock(fight, BEAT_MS - 1);
    expect(fight.turnsTaken).toBe(taken);

    advanceClock(fight, 2);
    expect(fight.turnsTaken).toBe(taken + 1);
  });

  // @spec PRESENT-READY-006
  it("spends none of the fight's own time on that pause", () => {
    const fight = atAnEnemy();
    fight.beat = 0;
    const beats = fight.encounter.beats;

    advanceClock(fight, BEAT_MS - 1);

    expect(fight.encounter.beats).toBe(beats);
  });

  // @spec PRESENT-READY-018
  // @spec PRESENT-SCENE-011
  it('finishes the judder of the blow that ended the fight, under its banner', () => {
    const fight = controller({
      enemies: [createEnemy({ id: 'g1', name: 'Goblin', maxHitPoints: 1, potValue: 14 })],
    });
    for (let i = 0; i < 100 && fight.phase === FightPhase.ACTING; i++) {
      untilAsked(fight);
      if (fight.pending) defend(fight);
    }
    expect(fight.phase).toBe(FightPhase.ENDED);

    expect(fightIsPlaying(fight)).toBe(true);
    advanceClock(fight, BEAT_MS);

    expect(fight.shakingId).toBeNull();
    expect(fightIsPlaying(fight)).toBe(false);
  });

  // @spec PRESENT-READY-018
  // @spec PRESENT-SCENE-011
  it('finishes a judder while the next character is being asked, then stops', () => {
    const fight = controller({ enemies: dawdling() });
    defend(fight);
    expect(fight.pending).not.toBeNull();

    expect(fightIsPlaying(fight)).toBe(true);

    advanceClock(fight, BEAT_MS);

    expect(fight.shakingId).toBeNull();
    expect(fightIsPlaying(fight)).toBe(false);
  });
});

describe('casting from the Magic menu', () => {
  const spells = {
    magic_missile: createSpell({
      id: 'magic_missile', name: 'Magic Missile', school: Skill.EVOCATION, rank: 1,
      classes: [CharacterClass.MAGE], target: SpellTarget.ENEMY,
      effect: { damage: 6, ignoresArmour: true }, where: [CastWhere.COMBAT], learned: Learned.CLASS,
    }),
    heal: createSpell({
      id: 'heal', name: 'Heal', school: Skill.HEALING, rank: 1,
      classes: [CharacterClass.CLERIC], target: SpellTarget.ALLY,
      effect: { heal: 8 }, where: [CastWhere.COMBAT, CastWhere.EXPLORATION], learned: Learned.CLASS,
    }),
  };

  function casting() {
    const party = createParty();
    addCharacter(party, hero('bram', CharacterClass.FIGHTER));
    addCharacter(party, hero('isolde', CharacterClass.MAGE));
    addCharacter(party, hero('wren', CharacterClass.CLERIC));
    const encounter = beginEncounter({
      party,
      enemies: createEnemyGroup([
        createEnemy({ id: 'g1', name: 'Goblin', maxHitPoints: 90, potValue: 14, armour: 2, attack: { baseDamage: 1 } }),
        createEnemy({ id: 'g2', name: 'Goblin', maxHitPoints: 90, potValue: 14, armour: 2, attack: { baseDamage: 1 } }),
      ]),
      rng: makeRng(4),
      origin: { floorId: 'f1', x: 0, y: 0 },
      spells,
    });
    return createFightController({ encounter, viewport, onDraw: vi.fn() });
  }

  /** Play the fight on until this character is the one being asked. */
  function askedFor(fight, id) {
    for (let i = 0; i < 200 && fight.pending?.characterId !== id; i++) {
      if (fight.pending) defend(fight); else playEnemyTurn(fight);
    }
    expect(fight.pending?.characterId).toBe(id);
    return fight;
  }
  const magicIndex = (fight) => fight.pending.options.findIndex((o) => o.action === FightAction.MAGIC);

  // @spec PRESENT-FIGHT-036
  it('offers Magic to a caster with a slot, and greys it for those who know no spell or have none left', () => {
    const fight = askedFor(casting(), 'wren');
    character(fight.encounter.party, 'bram').hitPoints -= 5;
    defend(fight);
    askedFor(fight, 'wren');
    expect(slot(fight, FightAction.MAGIC).available).toBe(true);

    character(fight.encounter.party, 'wren').spentSlots = { 1: 3 };
    // Recomposed on the next turn: asked again after one round.
    defend(fight);
    askedFor(fight, 'wren');
    expect(slot(fight, FightAction.MAGIC)).toMatchObject({ available: false, reason: 'No slots' });

    askedFor(fight, 'bram');
    expect(slot(fight, FightAction.MAGIC)).toMatchObject({ available: false, reason: 'No spells' });
  });

  // @spec PRESENT-FIGHT-036
  it('keeps Magic open to a mage out of slots who can Overchannel, and greys it once that would fell her', () => {
    const fight = askedFor(casting(), 'isolde');
    character(fight.encounter.party, 'isolde').spentSlots = { 1: 3 };
    defend(fight);
    askedFor(fight, 'isolde');
    expect(slot(fight, FightAction.MAGIC).available).toBe(true);

    character(fight.encounter.party, 'isolde').hitPoints = 6;
    defend(fight);
    askedFor(fight, 'isolde');
    expect(slot(fight, FightAction.MAGIC)).toMatchObject({ available: false, reason: 'Too hurt' });
  });

  // @spec PRESENT-MENU-012
  it('names a mage\'s Overchannel price in place of her spent slots', () => {
    const fight = askedFor(casting(), 'isolde');
    character(fight.encounter.party, 'isolde').spentSlots = { 1: 3 };
    defend(fight);
    askedFor(fight, 'isolde');
    chooseOption(fight, magicIndex(fight));

    expect(fight.pending.targets[0]).toMatchObject({ name: 'Magic Missile', available: true, detail: '6 HP' });
  });

  // @spec PRESENT-MENU-012
  it('opens a menu of the spells the caster knows, each with the slots left', () => {
    const fight = askedFor(casting(), 'isolde');

    chooseOption(fight, magicIndex(fight));

    expect(fight.pending.targets.map((t) => t.name)).toEqual(['Magic Missile']);
    expect(fight.pending.targets[0]).toMatchObject({ available: true, detail: '3/3' });
  });

  // @spec PRESENT-MENU-013
  // @spec PRESENT-MENU-017
  it('asks whom next, with what the cast will do, and casts on the one chosen', () => {
    const fight = askedFor(casting(), 'isolde');
    chooseOption(fight, magicIndex(fight));
    chooseOption(fight, 0);

    // Every standing goblin, with the missile's whole 7 beside it, armour or not.
    const [g1, g2] = fight.encounter.enemies.members;
    expect(fight.pending.targets.map((t) => t.id)).toEqual(['g1', 'g2']);
    expect(fight.pending.targets[0]).toMatchObject({ preview: '7', detail: `${g1.hitPoints}/90` });
    const before = g2.hitPoints;

    chooseOption(fight, 1);

    expect(g2.hitPoints).toBe(before - 7);
    expect(fight.log.at(-1)).toBe('isolde casts Magic Missile at Goblin for 7.');
    expect(character(fight.encounter.party, 'isolde').spentSlots[1]).toBe(1);
  });

  // @spec PRESENT-MENU-017
  it('greys a heal on someone already whole, and heals someone hurt', () => {
    const fight = askedFor(casting(), 'wren');
    character(fight.encounter.party, 'bram').hitPoints -= 5;
    chooseOption(fight, magicIndex(fight));
    chooseOption(fight, 0);

    const entries = fight.pending.targets;
    const bram = entries.find((t) => t.id === 'bram');
    const isolde = entries.find((t) => t.id === 'isolde');
    expect(bram).toMatchObject({ available: true, preview: '5' });
    expect(isolde).toMatchObject({ available: false, reason: 'Unhurt' });

    // A greyed entry does nothing.
    expect(chooseOption(fight, entries.indexOf(isolde))).toBe(false);
    chooseOption(fight, entries.indexOf(bram));

    expect(character(fight.encounter.party, 'bram').hitPoints).toBe(character(fight.encounter.party, 'bram').maxHitPoints);
    expect(fight.log.at(-1)).toBe('wren casts Heal on bram, restoring 5.');
  });

  // @spec PRESENT-MENU-018
  it('backs out of choosing a target to the list of spells, and then closes', () => {
    const fight = askedFor(casting(), 'isolde');
    chooseOption(fight, magicIndex(fight));
    chooseOption(fight, 0);

    goBack(fight);
    expect(fight.pending.targets.map((t) => t.name)).toEqual(['Magic Missile']);

    goBack(fight);
    expect(fight.pending.targets).toBeNull();
  });

  it('closes the whole menu when the Magic button is pressed again', () => {
    const fight = askedFor(casting(), 'isolde');
    pressOption(fight, magicIndex(fight));
    chooseOption(fight, 0);

    pressOption(fight, magicIndex(fight));

    expect(fight.pending.targets).toBeNull();
    expect(fight.turnsTaken).toBeGreaterThanOrEqual(0);
  });
});
