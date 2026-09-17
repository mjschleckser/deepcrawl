import { describe, it, expect } from 'vitest';
import { Action } from './combat.js';
import { proposeFrom, createRule, When, Aim } from './orders.js';

const attack = { kind: Action.ATTACK };
const heal = { kind: Action.CAST, spell: 'heal', rank: 1 };
const shield = { kind: Action.CAST, spell: 'shield', rank: 1 };

/**
 * What the fight looks like from one character's position. Combat assembles this; the
 * order vocabulary reads it and nothing else, which is what makes it testable flat.
 */
function situation(over = {}) {
  return {
    actorId: 'wren',
    allies: [
      { id: 'bram', hitPoints: 20, maxHitPoints: 20, conscious: true },
      { id: 'wren', hitPoints: 12, maxHitPoints: 12, conscious: true },
    ],
    enemies: [
      { id: 'g1', hitPoints: 9, row: 'FRONT', targetable: true },
      { id: 'g2', hitPoints: 4, row: 'BACK', targetable: true },
    ],
    frontBroken: false,
    slots: { 1: 2 },
    taken: new Set(),
    isLegal: () => true,
    ...over,
  };
}

describe('reading an order list', () => {
  // @spec COMBAT-ORDER-001
  // @spec COMBAT-ORDER-003
  it('proposes the action and target of the first rule that holds', () => {
    const rules = [createRule({ when: When.ALWAYS, action: attack, aim: Aim.WEAKEST_ENEMY })];

    expect(proposeFrom(rules, situation())).toMatchObject({
      ruleIndex: 0,
      action: attack,
      targetId: 'g2',
    });
  });

  // @spec COMBAT-ORDER-003
  it('reads from the top, so an earlier rule wins over a later one that also holds', () => {
    const rules = [
      createRule({ when: When.ALLY_BELOW, share: 0.5, action: heal, aim: Aim.WEAKEST_ALLY }),
      createRule({ when: When.ALWAYS, action: attack, aim: Aim.WEAKEST_ENEMY }),
    ];
    const hurt = situation({
      allies: [
        { id: 'bram', hitPoints: 4, maxHitPoints: 20, conscious: true },
        { id: 'wren', hitPoints: 12, maxHitPoints: 12, conscious: true },
      ],
    });

    expect(proposeFrom(rules, hurt)).toMatchObject({ ruleIndex: 0, targetId: 'bram' });
  });

  // @spec COMBAT-ORDER-003
  it('falls to the later rule when the earlier one does not hold', () => {
    const rules = [
      createRule({ when: When.ALLY_BELOW, share: 0.5, action: heal, aim: Aim.WEAKEST_ALLY }),
      createRule({ when: When.ALWAYS, action: attack, aim: Aim.WEAKEST_ENEMY }),
    ];

    // Nobody is hurt, so the cleric fights. This is "or attack if everyone is healthy",
    // written without a word for otherwise.
    expect(proposeFrom(rules, situation())).toMatchObject({ ruleIndex: 1, action: attack });
  });

  // @spec COMBAT-ORDER-005
  it('proposes nothing when no rule holds', () => {
    const rules = [createRule({ when: When.ALLY_BELOW, share: 0.25, action: heal, aim: Aim.WEAKEST_ALLY })];

    expect(proposeFrom(rules, situation())).toBeNull();
  });

  // @spec COMBAT-ORDER-005
  it('proposes nothing for a character with no orders at all', () => {
    expect(proposeFrom([], situation())).toBeNull();
  });

  // @spec COMBAT-ORDER-004
  it('passes over a rule whose action is not legal and reads the next', () => {
    const rules = [
      createRule({ when: When.ALWAYS, action: heal, aim: Aim.WEAKEST_ALLY }),
      createRule({ when: When.ALWAYS, action: attack, aim: Aim.WEAKEST_ENEMY }),
    ];
    const noHealing = situation({ isLegal: (action) => action.kind !== Action.CAST });

    expect(proposeFrom(rules, noHealing)).toMatchObject({ ruleIndex: 1, action: attack });
  });

  // @spec COMBAT-ORDER-004
  it('passes over a rule whose target is not a legal one for its action', () => {
    const rules = [
      createRule({ when: When.ALWAYS, action: attack, aim: Aim.WEAKEST_ENEMY }),
      createRule({ when: When.ALWAYS, action: attack, aim: Aim.FRONT_ENEMY }),
    ];
    // The weakest enemy stands in the back row, out of reach of a melee swing.
    const meleeOnly = situation({ isLegal: (action, targetId) => targetId !== 'g2' });

    expect(proposeFrom(rules, meleeOnly)).toMatchObject({ ruleIndex: 1, targetId: 'g1' });
  });
});

describe('what a rule may ask about', () => {
  // @spec COMBAT-ORDER-008
  it('holds an ALLY_BELOW rule only while somebody is under the share', () => {
    const rules = [createRule({ when: When.ALLY_BELOW, share: 0.5, action: heal, aim: Aim.WEAKEST_ALLY })];

    expect(proposeFrom(rules, situation())).toBeNull();
    expect(proposeFrom(rules, situation({
      allies: [{ id: 'bram', hitPoints: 9, maxHitPoints: 20, conscious: true }],
    }))).not.toBeNull();
  });

  // @spec COMBAT-ORDER-008
  it('holds a NO_ALLY_BELOW rule only while nobody is under the share', () => {
    const rules = [createRule({ when: When.NO_ALLY_BELOW, share: 0.5, action: attack, aim: Aim.WEAKEST_ENEMY })];

    expect(proposeFrom(rules, situation())).not.toBeNull();
    expect(proposeFrom(rules, situation({
      allies: [{ id: 'bram', hitPoints: 9, maxHitPoints: 20, conscious: true }],
    }))).toBeNull();
  });

  // @spec COMBAT-ORDER-008
  it('counts only conscious allies toward a share', () => {
    const fallen = situation({
      allies: [
        { id: 'bram', hitPoints: 0, maxHitPoints: 20, conscious: false },
        { id: 'wren', hitPoints: 12, maxHitPoints: 12, conscious: true },
      ],
    });
    const rules = [createRule({ when: When.ALLY_BELOW, share: 0.5, action: heal, aim: Aim.WEAKEST_ALLY })];

    // A body is not somebody to heal; raising the dead is not a heal.
    expect(proposeFrom(rules, fallen)).toBeNull();
  });

  // @spec COMBAT-ORDER-008
  it('holds a SLOT_REMAINS rule only while a slot of the action rank is left', () => {
    const rules = [createRule({ when: When.SLOT_REMAINS, action: heal, aim: Aim.WEAKEST_ALLY })];

    expect(proposeFrom(rules, situation())).not.toBeNull();
    expect(proposeFrom(rules, situation({ slots: { 1: 0 } }))).toBeNull();
  });

  // @spec COMBAT-ORDER-008
  it('holds a FRONT_BROKEN rule only while the actor has no front rank left', () => {
    const rules = [createRule({ when: When.FRONT_BROKEN, action: attack, aim: Aim.WEAKEST_ENEMY })];

    expect(proposeFrom(rules, situation())).toBeNull();
    expect(proposeFrom(rules, situation({ frontBroken: true }))).not.toBeNull();
  });

  // @spec COMBAT-ORDER-009
  it('holds a ONCE rule until that rule has actually been taken', () => {
    const rules = [
      createRule({ when: When.ONCE, action: shield, aim: Aim.SELF }),
      createRule({ when: When.ALWAYS, action: attack, aim: Aim.WEAKEST_ENEMY }),
    ];

    // The mage opens with the shield, then settles into the attack for the rest of it.
    expect(proposeFrom(rules, situation())).toMatchObject({ ruleIndex: 0, action: shield });
    expect(proposeFrom(rules, situation({ taken: new Set([0]) })))
      .toMatchObject({ ruleIndex: 1, action: attack });
  });
});

describe('what a rule may aim at', () => {
  // @spec COMBAT-ORDER-010
  it('aims WEAKEST_ENEMY at the legal enemy with the fewest hit points', () => {
    const rules = [createRule({ when: When.ALWAYS, action: attack, aim: Aim.WEAKEST_ENEMY })];

    expect(proposeFrom(rules, situation()).targetId).toBe('g2');
  });

  // @spec COMBAT-ORDER-010
  it('aims FRONT_ENEMY at an enemy standing in the front row', () => {
    const rules = [createRule({ when: When.ALWAYS, action: attack, aim: Aim.FRONT_ENEMY })];

    expect(proposeFrom(rules, situation()).targetId).toBe('g1');
  });

  // @spec COMBAT-ORDER-010
  // @spec COMBAT-ORDER-015
  it('aims WEAKEST_ALLY at the ally with the fewest hit points, the actor included', () => {
    const rules = [createRule({ when: When.ALWAYS, action: heal, aim: Aim.WEAKEST_ALLY })];
    const clericIsWorst = situation({
      allies: [
        { id: 'bram', hitPoints: 20, maxHitPoints: 20, conscious: true },
        { id: 'wren', hitPoints: 3, maxHitPoints: 12, conscious: true },
      ],
    });

    // A cleric is one of their own: a lone survivor's orders still propose something.
    expect(proposeFrom(rules, clericIsWorst).targetId).toBe('wren');
  });

  // @spec COMBAT-ORDER-015
  it('counts the actor when deciding whether an ally is below a share', () => {
    const rules = [createRule({ when: When.ALLY_BELOW, share: 0.5, action: heal, aim: Aim.WEAKEST_ALLY })];
    const onlyTheClericIsHurt = situation({
      allies: [
        { id: 'bram', hitPoints: 20, maxHitPoints: 20, conscious: true },
        { id: 'wren', hitPoints: 3, maxHitPoints: 12, conscious: true },
      ],
    });

    expect(proposeFrom(rules, onlyTheClericIsHurt)).not.toBeNull();
  });

  // @spec COMBAT-ORDER-010
  it('aims NAMED_ALLY at that character, and proposes nothing when they are no target', () => {
    const rules = [createRule({ when: When.ALWAYS, action: heal, aim: Aim.NAMED_ALLY, allyId: 'bram' })];

    expect(proposeFrom(rules, situation()).targetId).toBe('bram');
    expect(proposeFrom(rules, situation({ isLegal: (a, id) => id !== 'bram' }))).toBeNull();
  });

  // @spec COMBAT-ORDER-010
  it('aims SELF at the character whose order it is', () => {
    const rules = [createRule({ when: When.ALWAYS, action: shield, aim: Aim.SELF })];

    expect(proposeFrom(rules, situation()).targetId).toBe('wren');
  });

  // @spec COMBAT-ORDER-016
  it('settles equal candidates by the order they are given, never by a roll', () => {
    const rules = [createRule({ when: When.ALWAYS, action: attack, aim: Aim.WEAKEST_ENEMY })];
    const tied = situation({
      enemies: [
        { id: 'g1', hitPoints: 4, row: 'FRONT', targetable: true },
        { id: 'g2', hitPoints: 4, row: 'BACK', targetable: true },
      ],
    });

    const picks = new Set();
    for (let i = 0; i < 20; i++) picks.add(proposeFrom(rules, tied).targetId);
    expect([...picks]).toEqual(['g1']);
  });

  // @spec COMBAT-ORDER-011
  it('aims at the fight as it stands now, not as it stood when the rule was written', () => {
    const rules = [createRule({ when: When.ALWAYS, action: attack, aim: Aim.WEAKEST_ENEMY })];

    expect(proposeFrom(rules, situation()).targetId).toBe('g2');
    // g2 falls; the same list now names whoever is weakest next.
    expect(proposeFrom(rules, situation({
      enemies: [{ id: 'g1', hitPoints: 9, row: 'FRONT', targetable: true }],
    })).targetId).toBe('g1');
  });

  // @spec COMBAT-ORDER-010
  it('proposes nothing where the aim finds nobody at all', () => {
    const rules = [createRule({ when: When.ALWAYS, action: attack, aim: Aim.WEAKEST_ENEMY })];

    expect(proposeFrom(rules, situation({ enemies: [] }))).toBeNull();
  });
});
