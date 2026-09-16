import { describe, it, expect, vi } from 'vitest';
import { makeRng } from '../sim/rng.js';
import { Row, CharacterClass, createParty, createCharacter, addCharacter, applyDamage, Condition } from '../sim/party.js';
import { beginEncounter, createEnemy, createEnemyGroup, Outcome, Band } from '../sim/combat.js';
import {
  buildFightPlan, createFightController, chooseOption, goBack, dismissOutcome,
  FightPhase, FightAction, describeEvent,
} from './fight.js';

const viewport = { width: 900, height: 640 };

const hero = (id, cls, row) =>
  createCharacter({ id, name: id, characterClass: cls, row });

function fightState({ enemies, light = 'BRIGHT' } = {}) {
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
    awareness: { party: true, enemies: true },
    rng: makeRng(4),
    origin: { floorId: 'f1', x: 2, y: 3 },
  });
}

const controller = (over = {}) =>
  createFightController({ encounter: fightState(over), viewport, onDraw: vi.fn() });

describe('what a fight draws', () => {
  // @spec PRESENT-FIGHT-002
  it('draws both formations in their two rows', () => {
    const plan = buildFightPlan(fightState(), viewport, { phase: FightPhase.SELECTING });

    expect(plan.enemies.filter((e) => e.row === Row.FRONT)).toHaveLength(2);
    expect(plan.enemies.filter((e) => e.row === Row.BACK)).toHaveLength(1);
    expect(plan.party.filter((c) => c.row === Row.FRONT)).toHaveLength(2);
    expect(plan.party.filter((c) => c.row === Row.BACK)).toHaveLength(1);
  });

  // @spec PRESENT-FIGHT-004
  it('draws remaining and maximum hit points for everyone', () => {
    const plan = buildFightPlan(fightState(), viewport, { phase: FightPhase.SELECTING });

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

    const plan = buildFightPlan(encounter, viewport, { phase: FightPhase.SELECTING });

    expect(plan.party).toHaveLength(3);
    expect(plan.enemies).toHaveLength(3);
    expect(plan.party.find((c) => c.id === 'bram').down).toBe(true);
    expect(plan.enemies.find((e) => e.id === 'g1').down).toBe(true);
  });

  // @spec PRESENT-FIGHT-001
  it('leaves room for the corridor beneath it rather than covering the screen', () => {
    const plan = buildFightPlan(fightState(), viewport, { phase: FightPhase.SELECTING });

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
    fight.restart();

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
    const fight = controller();
    for (const id of ['g1', 'g2']) {
      const foe = fight.encounter.enemies.members.find((e) => e.id === id);
      foe.hitPoints = 0;
      foe.condition = Condition.DEAD;
    }
    fight.restart();
    chooseOption(fight, 0);

    expect(fight.pending.targets.map((t) => t.id)).toEqual(['a1']);
  });

  // @spec PRESENT-FIGHT-008
  it('resolves the round once the last member has chosen, and asks again', () => {
    const fight = controller();

    for (let i = 0; i < 3; i++) { chooseOption(fight, 0); chooseOption(fight, 0); }

    expect(fight.roundsResolved).toBe(1);
    expect(fight.pending.characterId).toBe('bram');
  });

  // @spec PRESENT-FIGHT-009
  it('steps back to the previous character rather than only cancelling the choice', () => {
    const fight = controller();
    chooseOption(fight, 0); chooseOption(fight, 0); // bram is done
    expect(fight.pending.characterId).toBe('tam');

    goBack(fight);

    expect(fight.pending.characterId).toBe('bram');
    expect(fight.pending.targets).toBeNull();
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
    const plan = buildFightPlan(fightState(), viewport, { phase: FightPhase.SELECTING });

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
    phase: FightPhase.SELECTING,
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
    phase: FightPhase.SELECTING,
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
