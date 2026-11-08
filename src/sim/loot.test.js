import { describe, it, expect } from 'vitest';
import { createLootTable, rollLoot, VALUES_PER_DRAW } from './loot.js';
import { ItemKind, Rarity, Slot, createItem } from './items.js';
import { makeRng } from './rng.js';

const item = (id, rarity) => createItem({
  id, name: id, kind: ItemKind.WEAPON, slot: Slot.MAIN_HAND, rarity,
});

const common = [item('stick', Rarity.COMMON), item('club', Rarity.COMMON)];
const uncommon = item('axe', Rarity.UNCOMMON);
const rare = item('blade', Rarity.RARE);
const legendary = item('sun', Rarity.LEGENDARY);

const table = (over = {}) => createLootTable({
  id: 'test',
  odds: { LEGENDARY: 0.1, EPIC: 0.1, RARE: 0.1, UNCOMMON: 0.1 },
  gold: { min: 2, max: 9 },
  draws: { count: 1, chance: 1 },
  items: [...common, uncommon, rare, legendary],
  ...over,
});

/**
 * A generator that answers from a script and counts what it was asked. Rolling only
 * ever asks `next` and `int`, so those are all it needs.
 */
function scripted(values) {
  let used = 0;
  const next = () => {
    if (used >= values.length) throw new Error('script ran out');
    return values[used++];
  };
  return {
    next,
    int: (min, max) => min + Math.floor(next() * (max - min + 1)),
    get used() { return used; },
  };
}

// One draw reads: does it yield, then legendary, epic, rare, uncommon, then the pick.
const draw = ({ yields = true, tiers = [0.9, 0.9, 0.9, 0.9], pick = 0 } = {}) => [
  yields ? 0 : 0.99, ...tiers, pick,
];

describe('the gold a roll yields', () => {
  // @spec LOOT-ROLL-001
  it('draws gold from the whole range, both ends included', () => {
    const empty = { draws: { count: 0, chance: 1 } };
    expect(rollLoot(table(empty), scripted([0])).gold).toBe(2);
    expect(rollLoot(table(empty), scripted([0.9999])).gold).toBe(9);
  });
});

describe('the items a roll yields', () => {
  // @spec LOOT-ROLL-002
  it('makes as many draws as the table names, each yielding by its own chance', () => {
    const rng = scripted([0, ...draw(), ...draw({ yields: false }), ...draw()]);
    const find = rollLoot(table({ draws: { count: 3, chance: 0.5 } }), rng);

    expect(find.items).toHaveLength(2);
  });

  // @spec LOOT-ROLL-003
  it('tries legendary first and falls a tier at a time, common being what remains', () => {
    const roll = (tiers) => rollLoot(table(), scripted([0, ...draw({ tiers })])).items[0];

    expect(roll([0, 0, 0, 0]).rarity).toBe(Rarity.LEGENDARY);
    expect(roll([0.5, 0.5, 0, 0]).rarity).toBe(Rarity.RARE);
    expect(roll([0.5, 0.5, 0.5, 0]).rarity).toBe(Rarity.UNCOMMON);
    expect(roll([0.5, 0.5, 0.5, 0.5]).rarity).toBe(Rarity.COMMON);
  });

  // @spec LOOT-ROLL-004
  it('takes the nearest lower tier the table holds when it holds none of the one rolled', () => {
    // Epic is rolled, and the table holds no epic: the nearest lower tier is rare.
    const epicRolled = rollLoot(table(), scripted([0, ...draw({ tiers: [0.5, 0, 0.5, 0.5] })]));
    expect(epicRolled.items[0]).toMatchObject({ id: 'blade' });

    // Nothing above common: every roll lands there.
    const plain = table({ items: common });
    const legendaryRolled = rollLoot(plain, scripted([0, ...draw({ tiers: [0, 0, 0, 0] })]));
    expect(legendaryRolled.items[0].rarity).toBe(Rarity.COMMON);
  });

  // @spec LOOT-ROLL-005
  it('picks evenly among the items of the tier it lands on', () => {
    const pick = (value) => rollLoot(table(), scripted([0, ...draw({ pick: value })])).items[0].id;

    expect(pick(0)).toBe('stick');
    expect(pick(0.49)).toBe('stick');
    expect(pick(0.5)).toBe('club');
    expect(pick(0.99)).toBe('club');
  });

  // @spec LOOT-ROLL-006
  it('reads the same number of values for every draw, whatever it found', () => {
    const lots = { draws: { count: 3, chance: 0.5 } };
    const all = scripted([0, ...draw(), ...draw({ tiers: [0, 0, 0, 0] }), ...draw()]);
    const none = scripted([0, ...draw({ yields: false }), ...draw({ yields: false }), ...draw({ yields: false })]);

    rollLoot(table(lots), all);
    rollLoot(table(lots), none);

    expect(VALUES_PER_DRAW).toBe(6);
    expect(all.used).toBe(1 + 3 * VALUES_PER_DRAW);
    expect(none.used).toBe(all.used);
  });

  // @spec LOOT-ROLL-007
  it('finds the same thing from the same table and the same place in the stream', () => {
    const generous = table({ draws: { count: 4, chance: 0.7 } });
    const first = rollLoot(generous, makeRng(1234));
    const second = rollLoot(generous, makeRng(1234));

    expect(second).toEqual(first);
  });

  // @spec LOOT-TABLE-002
  it('hands over items of its own, not the table\'s', () => {
    const find = rollLoot(table(), scripted([0, ...draw()]));

    expect(find.items[0]).toEqual(common[0]);
    expect(find.items[0]).not.toBe(table().items[0]);
  });

  // @spec LOOT-ROLL-003
  it('lands on each tier about as often as its odds say, over many rolls', () => {
    const rng = makeRng(99);
    const odds = { LEGENDARY: 0.05, EPIC: 0, RARE: 0.2, UNCOMMON: 0 };
    const counts = {};
    const rolls = 20000;
    for (let i = 0; i < rolls; i++) {
      const [found] = rollLoot(table({ odds }), rng).items;
      counts[found.rarity] = (counts[found.rarity] ?? 0) + 1;
    }

    expect(counts[Rarity.LEGENDARY] / rolls).toBeCloseTo(0.05, 1);
    // Rare is only tried after legendary missed: 0.95 × 0.2.
    expect(counts[Rarity.RARE] / rolls).toBeCloseTo(0.19, 1);
  });
});
