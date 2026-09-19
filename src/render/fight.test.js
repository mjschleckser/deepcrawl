import { describe, it, expect, vi } from 'vitest';
import { makeRng } from '../sim/rng.js';
import {
  Row, CharacterClass, createParty, createCharacter, addCharacter, applyDamage, character, Condition,
} from '../sim/party.js';
import { beginEncounter, createEnemy, createEnemyGroup, Action, Outcome, Band } from '../sim/combat.js';
import { createRule, When, Aim } from '../sim/orders.js';
import {
  buildFightPlan, createFightController, chooseOption, goBack, dismissOutcome,
  playEnemyTurn, takeProposal, cancelProposal, advanceClock, fightIsPlaying,
  AUTO_CONFIRM, SHAKE_PIXELS, FILL_BEAT_MS, Wound,
  FightPhase, FightAction, describeEvent, BEAT_MS, COUNTDOWN_MS,
} from './fight.js';

/** Take the Defend option, whatever number it happens to be on this character. */
function defend(fight) {
  const index = fight.pending.options.findIndex((o) => o.action === FightAction.DEFEND);
  return chooseOption(fight, index);
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

const hero = (id, cls, row) =>
  createCharacter({ id, name: id, characterClass: cls, row });

function fightState({ enemies, light = 'BRIGHT', partyAware = true, enemiesAware = true } = {}) {
  const party = createParty();
  addCharacter(party, hero('bram', CharacterClass.FIGHTER, Row.FRONT));
  addCharacter(party, hero('tam', CharacterClass.THIEF, Row.FRONT));
  addCharacter(party, hero('isolde', CharacterClass.MAGE, Row.BACK));

  return beginEncounter({
    party,
    enemies: createEnemyGroup(enemies ?? [
      createEnemy({ id: 'g1', name: 'Goblin', row: Row.FRONT, hitPoints: 9, potValue: 14 }),
      createEnemy({ id: 'g2', name: 'Goblin', row: Row.FRONT, hitPoints: 9, potValue: 14 }),
      createEnemy({ id: 'a1', name: 'Goblin Archer', row: Row.BACK, hitPoints: 7, potValue: 18 }),
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
  it('draws both formations in their two rows', () => {
    const plan = buildFightPlan(fightState(), viewport, { phase: FightPhase.ACTING });

    expect(plan.enemies.filter((e) => e.row === Row.FRONT)).toHaveLength(2);
    expect(plan.enemies.filter((e) => e.row === Row.BACK)).toHaveLength(1);
    expect(plan.party.filter((c) => c.row === Row.FRONT)).toHaveLength(2);
    expect(plan.party.filter((c) => c.row === Row.BACK)).toHaveLength(1);
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

describe('choosing what to do', () => {
  // @spec PRESENT-FIGHT-005
  it('asks each conscious party member in turn, in a fixed order', () => {
    const fight = controller();
    const asked = [];

    for (let i = 0; i < 3; i++) {
      asked.push(fight.pending.characterId);
      chooseOption(fight, 0); // attack
      chooseOption(fight, 0); // first legal target
    }

    expect(asked).toEqual(['bram', 'tam', 'isolde']);
  });

  // @spec PRESENT-FIGHT-005
  it('skips anyone who cannot act', () => {
    const fight = controller();
    applyDamage(fight.encounter.party, 'bram', 9999);
    // The turn passes to whoever is next ready; a body is never asked anything.
    chooseOption(fight, 0);
    chooseOption(fight, 0);
    untilAsked(fight);

    expect(fight.pending.characterId).toBe('tam');
  });

  // @spec PRESENT-FIGHT-006
  it('offers a back-row character no melee attack, having nothing in reach', () => {
    const fight = controller();
    chooseOption(fight, 0); chooseOption(fight, 0); // bram
    chooseOption(fight, 0); chooseOption(fight, 0); // tam

    const options = fight.pending.options.map((o) => o.action);
    expect(fight.pending.characterId).toBe('isolde');
    expect(options).not.toContain(FightAction.ATTACK);
    expect(options).toContain(FightAction.DEFEND);
  });

  // @spec PRESENT-FIGHT-007
  it('offers melee only the enemy front row while it stands', () => {
    const fight = controller();
    chooseOption(fight, 0); // bram attacks

    expect(fight.pending.targets.map((t) => t.id).sort()).toEqual(['g1', 'g2']);
  });

  // @spec PRESENT-FIGHT-007
  it('opens the enemy back row once their front rank has fallen', () => {
    const encounter = fightState();
    for (const id of ['g1', 'g2']) {
      const foe = encounter.enemies.members.find((e) => e.id === id);
      foe.hitPoints = 0;
      foe.condition = Condition.DEAD;
    }
    const fight = untilReady(createFightController({ encounter, viewport, onDraw: vi.fn() }));
    chooseOption(fight, 0);

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

describe('standing orders in a fight', () => {
  const order = (over) => createRule({ when: When.ALWAYS, action: { kind: Action.ATTACK }, aim: Aim.WEAKEST_ENEMY, ...over });

  function ordered(rules, id = 'bram') {
    const encounter = fightState();
    character(encounter.party, id).orders = rules;
    return untilReady(createFightController({ encounter, viewport, onDraw: vi.fn() }));
  }

  // @spec COMBAT-ORDER-003
  // @spec COMBAT-ORDER-014
  it("fills in the action and the target a character's orders name", () => {
    const fight = ordered([order()]);

    expect(fight.pending.characterId).toBe('bram');
    // The archer is the weakest thing on the field, but out of a melee swing's reach,
    // so the proposal names the weakest of what can actually be reached.
    expect(fight.pending.proposal.action.kind).toBe(Action.ATTACK);
    expect(['g1', 'g2']).toContain(fight.pending.proposal.targetId);
  });

  // @spec COMBAT-ORDER-005
  // @spec COMBAT-ORDER-019
  it('proposes nothing for a character with no orders, and waits', () => {
    const fight = controller();

    expect(fight.pending.proposal).toBeNull();
    expect(fight.phase).toBe(FightPhase.ACTING);
    expect(fight.pending.options.length).toBeGreaterThan(0);
  });

  // @spec COMBAT-ORDER-006
  // @spec COMBAT-ORDER-017
  it('takes the proposal, as the countdown running out would', () => {
    const fight = ordered([order()]);
    const targetId = fight.pending.proposal.targetId;
    const before = fight.encounter.enemies.members.find((e) => e.id === targetId).hitPoints;

    expect(takeProposal(fight)).toBe(true);

    expect(fight.encounter.enemies.members.find((e) => e.id === targetId).hitPoints)
      .toBeLessThan(before);
    expect(fight.turnsTaken).toBe(1);
  });

  // @spec COMBAT-ORDER-018
  it('drops the proposal the moment the player reaches for the screen', () => {
    const fight = ordered([order()]);

    expect(cancelProposal(fight)).toBe(true);

    expect(fight.pending.proposal).toBeNull();
    // And nothing brings it back for this turn.
    expect(takeProposal(fight)).toBe(false);
  });

  // @spec COMBAT-ORDER-007
  // @spec COMBAT-ORDER-018
  it('lets the player take another action instead, which drops the proposal', () => {
    const fight = ordered([order()]);

    defend(fight); // rather than the attack proposed

    expect(fight.turnsTaken).toBe(1);
    // Every enemy is untouched: the proposal was not taken on the way past.
    for (const foe of fight.encounter.enemies.members) {
      expect(foe.hitPoints).toBe(foe.maxHitPoints ?? foe.hitPoints);
    }
  });

  // @spec PRESENT-READY-020
  it('offers the proposal as the first control, named for what it would do', () => {
    const fight = ordered([order()]);

    const [first] = fight.pending.options;
    expect(first.action).toBe(FightAction.CONFIRM);
    // Attack Goblin, not Attack: the target is the half an order actually saves.
    expect(first.label).toMatch(/^Attack /);
    expect(first.label.length).toBeGreaterThan('Attack '.length);
  });

  // @spec PRESENT-READY-021
  it('takes the proposal when that control is pressed, in one press', () => {
    const fight = ordered([order()]);
    const targetId = fight.pending.proposal.targetId;
    const before = fight.encounter.enemies.members.find((e) => e.id === targetId).hitPoints;

    chooseOption(fight, 0);

    expect(fight.turnsTaken).toBe(1);
    expect(fight.encounter.enemies.members.find((e) => e.id === targetId).hitPoints)
      .toBeLessThan(before);
  });

  // @spec PRESENT-READY-020
  it('offers no such control to a character whose orders propose nothing', () => {
    const fight = controller();

    expect(fight.pending.options.some((o) => o.action === FightAction.CONFIRM)).toBe(false);
  });

  // @spec COMBAT-ORDER-009
  it('takes a once-this-encounter rule once, then reads past it', () => {
    const fight = ordered([
      createRule({ when: When.ONCE, action: { kind: Action.DEFEND }, aim: Aim.SELF }),
      order(),
    ]);
    expect(fight.pending.proposal.ruleIndex).toBe(0);

    takeProposal(fight);
    for (let i = 0; i < 20; i++) {
      untilAsked(fight);
      if (fight.pending.characterId === 'bram') break;
      defend(fight);
    }

    // The shield is spent; the same list now settles into the attack below it.
    expect(fight.pending.proposal.ruleIndex).toBe(1);
  });

  // @spec COMBAT-ORDER-013
  it("takes an enemy's turn without asking anybody", () => {
    const fight = controller();
    // Walk the party's turns off and let whatever is ready on the other side move.
    for (let i = 0; i < 10 && fight.pending; i++) defend(fight);

    expect(fight.pending).toBeNull();
    expect(playEnemyTurn(fight)).toBe(true);
    expect(fight.turnsTaken).toBeGreaterThan(0);
  });

  // @spec COMBAT-TIME-004
  it("stops the fight's own time while somebody is being asked", () => {
    const fight = controller();
    const beats = fight.encounter.beats;

    // Reading the screen, thinking about it, reading it again: the fight does not move.
    buildFightPlan(fight.encounter, viewport, { phase: fight.phase, pending: fight.pending });
    buildFightPlan(fight.encounter, viewport, { phase: fight.phase, pending: fight.pending });

    expect(fight.encounter.beats).toBe(beats);
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
  it('reports a fizzle as what it was, rather than inventing a result', () => {
    expect(describeEvent({ actorId: 'tam', fizzled: true }, { tam: 'Tam' }, 'g1', false))
      .toBe('Tam swings at nothing.');
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
      enemies: [createEnemy({ id: 'g1', name: 'Goblin', row: Row.FRONT, hitPoints: 1, potValue: 14 })],
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
      enemies: [createEnemy({ id: 'g1', name: 'Goblin', row: Row.FRONT, hitPoints: 1, potValue: 14 })],
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
      enemies: [createEnemy({ id: 'g1', name: 'Goblin', row: Row.FRONT, hitPoints: 1, potValue: 14 })],
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
        createEnemy({ id: `g${i}`, name: 'Goblin', row: i < 3 ? Row.FRONT : Row.BACK, hitPoints: 9, potValue: 14 })),
    });
    const skirmish = withPending({
      enemies: [createEnemy({ id: 'g1', name: 'Goblin', row: Row.FRONT, hitPoints: 9, potValue: 14 })],
    });

    expect(skirmish.bounds.height).toBeLessThan(crowd.bounds.height);
  });

  // @spec PRESENT-FIGHT-001
  it('never takes more than its share of the screen, however crowded', () => {
    const swarm = withPending({
      enemies: Array.from({ length: 20 }, (_, i) =>
        createEnemy({ id: `g${i}`, name: 'Goblin', row: i < 10 ? Row.FRONT : Row.BACK, hitPoints: 9, potValue: 14 })),
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
  const alwaysAttack = () => [createRule({
    when: When.ALWAYS, action: { kind: Action.ATTACK }, aim: Aim.WEAKEST_ENEMY,
  })];

  function ordered(rules, id = 'bram') {
    const encounter = fightState();
    character(encounter.party, id).orders = rules;
    return untilReady(createFightController({ encounter, viewport, onDraw: vi.fn() }));
  }

  const planOf = (fight) => buildFightPlan(fight.encounter, viewport, {
    phase: fight.phase,
    pending: fight.pending,
    log: fight.log,
    actor: fight.actor,
    countdown: fight.countdown,
    autoConfirm: fight.autoConfirm,
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
  // @spec COMBAT-ORDER-006
  it('takes nothing the player has not pressed for, however long it is left', () => {
    const fight = ordered(alwaysAttack());

    advanceClock(fight, COUNTDOWN_MS * 10);

    expect(AUTO_CONFIRM).toBe(false);
    expect(fight.turnsTaken).toBe(0);
    expect(fight.pending.proposal).not.toBeNull();
  });

  // @spec PRESENT-READY-008
  it('draws no ring while nothing is going to take itself', () => {
    const fight = ordered(alwaysAttack());

    expect(planOf(fight).countdown).toBeNull();
  });

  // @spec PRESENT-READY-012
  // @spec PRESENT-READY-007
  // @spec PRESENT-READY-011
  it('would take the proposal on its countdown, were that switched on', () => {
    const fight = ordered(alwaysAttack());
    // The machinery is kept alive rather than kept in a branch nobody runs.
    fight.autoConfirm = true;

    advanceClock(fight, COUNTDOWN_MS - 1);
    expect(fight.turnsTaken).toBe(0);

    const ring = planOf(fight).countdown;
    expect(ring.progress).toBeCloseTo(1, 1);
    expect(ring.label).toBe('A');
    const card = planOf(fight).party.find((c) => c.id === 'bram');
    expect(ring.x).toBeGreaterThan(card.x);
    expect(ring.x).toBeLessThan(card.x + card.width);

    advanceClock(fight, 2);
    expect(fight.turnsTaken).toBe(1);
  });

  // @spec PRESENT-READY-009
  it('drops the proposal once the player has taken the turn back', () => {
    const fight = ordered(alwaysAttack());

    cancelProposal(fight);

    expect(fight.pending.proposal).toBeNull();
    expect(planOf(fight).countdown).toBeNull();
  });

  // @spec PRESENT-READY-010
  // @spec PRESENT-SCENE-011
  it('stops entirely while it is waiting on somebody', () => {
    const fight = controller();

    expect(fightIsPlaying(fight)).toBe(false);
    expect(planOf(fight).countdown).toBeNull();
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
    const fight = opening({ partyAware: false });

    expect(planOf(fight).notice).toMatchObject({ text: 'Ambush!' });
    // The first ambusher is up at once; the card holds nothing back.
    expect(fight.actor.side).toBe('ENEMIES');

    playEnemyTurn(fight);
    playEnemyTurn(fight);
    // One goblin still has its full bar, so the ambush is not over.
    expect(fight.turnsTaken).toBe(2);
    expect(planOf(fight).notice).not.toBeNull();

    playEnemyTurn(fight);

    expect(planOf(fight).notice).toBeNull();
  });

  // @spec PRESENT-READY-015
  it('keeps the card up while an ambushing party is still to act', () => {
    const fight = opening({ enemiesAware: false });

    expect(planOf(fight).notice).not.toBeNull();
    defend(fight);
    defend(fight);
    expect(planOf(fight).notice).not.toBeNull();

    defend(fight);

    expect(planOf(fight).notice).toBeNull();
  });

  // @spec PRESENT-READY-015
  it('counts an ambusher who falls before acting as done', () => {
    const fight = opening({ enemiesAware: false });
    defend(fight);
    // The last ambusher goes down before their turn comes.
    applyDamage(fight.encounter.party, 'isolde', 9999);
    defend(fight);

    expect(planOf(fight).notice).toBeNull();
  });

  // @spec PRESENT-READY-017
  it('announces nothing when neither side was caught out', () => {
    const fight = controller();

    expect(planOf(fight).notice).toBeNull();
  });

  // @spec PRESENT-READY-024
  // @spec COMBAT-SURPRISE-002
  it('opens with every bar empty and nobody up', () => {
    const fight = opening();
    const plan = planOf(fight);

    expect(fight.actor).toBeNull();
    expect(fight.pending).toBeNull();
    for (const card of [...plan.party, ...plan.enemies]) expect(card.readiness).toBe(0);
    expect(fightIsPlaying(fight)).toBe(true);
  });

  // @spec PRESENT-READY-024
  it('fills the bars a beat per span of real time, and not faster', () => {
    const fight = opening();

    advanceClock(fight, FILL_BEAT_MS - 1);
    expect(fight.encounter.beats).toBe(0);

    advanceClock(fight, 1);
    expect(fight.encounter.beats).toBe(1);

    // Dexterity 10 against a bar of 100: ten beats to fill, and not one sooner.
    for (let i = 0; i < 8; i++) advanceClock(fight, FILL_BEAT_MS);
    expect(fight.actor).toBeNull();
    advanceClock(fight, FILL_BEAT_MS);
    expect(fight.pending.characterId).toBe('bram');
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
    advanceClock(fight, FILL_BEAT_MS * 2 + FILL_BEAT_MS / 2);

    const bram = planOf(fight).party.find((c) => c.id === 'bram');

    // Two beats and half of a third, at ten a beat, of a hundred.
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
    const fight = ordered(alwaysAttack());
    takeProposal(fight);

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
    for (let i = 0; i < 10 && fight.pending; i++) defend(fight);
    expect(fight.pending).toBeNull();
    const taken = fight.turnsTaken;

    advanceClock(fight, BEAT_MS - 1);
    expect(fight.turnsTaken).toBe(taken);

    advanceClock(fight, 2);
    expect(fight.turnsTaken).toBe(taken + 1);
  });

  // @spec PRESENT-READY-006
  it("leaves the fight's own time alone, however many seconds pass", () => {
    const fight = ordered(alwaysAttack());
    const beats = fight.encounter.beats;

    advanceClock(fight, COUNTDOWN_MS - 1);

    // Seconds are the player's; beats are the fight's, and only an action spends them.
    expect(fight.encounter.beats).toBe(beats);
  });
});
