import { describe, it, expect } from 'vitest';
import { buildLootTable, lootTables, lootTableById } from './loot.js';
import { itemDefinitions } from './items.js';
import { Rarity } from '../sim/items.js';

const goodFile = {
  id: 'scraps',
  odds: { LEGENDARY: 0.01, EPIC: 0.02, RARE: 0.05, UNCOMMON: 0.2 },
  gold: { min: 1, max: 6 },
  draws: { count: 1, chance: 0.3 },
  items: ['dagger', 'mace'],
};

describe('reading an authored loot table', () => {
  // @spec LOOT-TABLE-001
  // @spec LOOT-TABLE-002
  it('reads its odds, gold, draws, and the items it names, resolved', () => {
    const table = buildLootTable('scraps.json', goodFile);

    expect(table).toMatchObject({
      id: 'scraps',
      odds: { LEGENDARY: 0.01, EPIC: 0.02, RARE: 0.05, UNCOMMON: 0.2 },
      gold: { min: 1, max: 6 },
      draws: { count: 1, chance: 0.3 },
    });
    expect(table.items.map((i) => i.id)).toEqual(['dagger', 'mace']);
    expect(table.items[0].damage).toBeGreaterThan(0);
  });

  // @spec LOOT-TABLE-001
  it('takes a tier it does not name as never rolled', () => {
    const table = buildLootTable('scraps.json', { ...goodFile, odds: { RARE: 0.1 } });
    expect(table.odds).toEqual({ LEGENDARY: 0, EPIC: 0, RARE: 0.1, UNCOMMON: 0 });
  });

  // @spec LOOT-DATA-001
  it('rejects a file by name and the value it could not read', () => {
    const bad = (over) => () => buildLootTable('bad.json', { ...goodFile, ...over });

    expect(bad({ id: undefined })).toThrow(/bad\.json: no id/);
    expect(bad({ items: ['dagger', 'excalibur'] })).toThrow(/bad\.json: item "excalibur"/);
    expect(bad({ odds: { RARE: 1.5 } })).toThrow(/bad\.json: odds RARE 1\.5/);
    expect(bad({ odds: { COMMON: 0.5 } })).toThrow(/bad\.json: odds "COMMON"/);
    expect(bad({ draws: { count: 1, chance: -0.1 } })).toThrow(/bad\.json: draw chance -0\.1/);
    expect(bad({ draws: { count: -1, chance: 1 } })).toThrow(/bad\.json: draw count -1/);
    expect(bad({ gold: { min: -2, max: 5 } })).toThrow(/bad\.json: gold -2 to 5/);
    expect(bad({ gold: { min: 9, max: 5 } })).toThrow(/bad\.json: gold 9 to 5/);
  });

  // @spec LOOT-DATA-001
  it('rejects a table holding no common item', () => {
    const rareOnly = Object.values(itemDefinitions()).find((i) => i.rarity !== Rarity.COMMON);
    expect(() => buildLootTable('thin.json', { ...goodFile, items: [rareOnly.id] }))
      .toThrow(/thin\.json: no common item/);
  });
});

describe('the authored tables', () => {
  // @spec LOOT-TABLE-001
  it('reads every table file, keyed by what it calls itself', () => {
    const tables = lootTables();

    expect(Object.keys(tables).sort()).toEqual(['chest', 'goblin', 'goblin_mage']);
    expect(lootTableById('goblin').id).toBe('goblin');
    expect(lootTableById('nothing')).toBeNull();
  });

  // @spec ITEM-DEF-012
  it('holds something in every tier between them', () => {
    const tiers = new Set(Object.values(lootTables()).flatMap((t) => t.items.map((i) => i.rarity)));
    expect([...tiers].sort()).toEqual(Object.values(Rarity).sort());
  });

  // @spec ITEM-DEF-013
  it('offers potions to drink', () => {
    const potions = Object.values(itemDefinitions()).filter((i) => i.effect?.heal > 0);
    expect(potions.length).toBeGreaterThanOrEqual(2);
  });
});

describe('where tomes are found', () => {
  // @spec LOOT-DATA-004
  it('puts the tome of Fire Bolt in the chest table and the goblin mage table, and not the goblin table', () => {
    const has = (id) => lootTableById(id).items.some((item) => item.id === 'tome_of_fire_bolt');
    expect(has('chest')).toBe(true);
    expect(has('goblin_mage')).toBe(true);
    expect(has('goblin')).toBe(false);
  });
});
