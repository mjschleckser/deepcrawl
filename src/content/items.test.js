import { describe, it, expect } from 'vitest';
import { buildItem, itemDefinitions, itemById } from './items.js';
import { ItemKind, Slot } from '../sim/items.js';
import { Attribute, CharacterClass, Skill } from '../sim/party.js';

const swordFile = {
  id: 'blade', name: 'Blade', kind: 'WEAPON', slot: 'MAIN_HAND',
  skill: 'BLADE', damage: 9, accuracy: 22, governs: 'MIGHT',
};

describe('reading an authored item', () => {
  // @spec ITEM-DATA-001
  it('builds an item with everything its file said', () => {
    expect(buildItem('blade.json', swordFile)).toMatchObject({
      id: 'blade', kind: ItemKind.WEAPON, slot: Slot.MAIN_HAND,
      skill: Skill.BLADE, damage: 9, accuracy: 22, governs: Attribute.MIGHT,
    });
  });

  // @spec ITEM-DATA-002
  it('rejects a file by name and the value it could not read', () => {
    expect(() => buildItem('kind.json', { ...swordFile, kind: 'WAND' }))
      .toThrow(/kind\.json: kind "WAND"/);
    expect(() => buildItem('slot.json', { ...swordFile, slot: 'HAT' }))
      .toThrow(/slot\.json: slot "HAT"/);
    expect(() => buildItem('skill.json', { ...swordFile, skill: 'BLDAE' }))
      .toThrow(/skill\.json: skill "BLDAE"/);
    expect(() => buildItem('attr.json', { ...swordFile, governs: 'MITE' }))
      .toThrow(/attr\.json: attribute "MITE"/);
    expect(() => buildItem('class.json', { ...swordFile, classes: ['FIGTHER'] }))
      .toThrow(/class\.json: class "FIGTHER"/);
  });

  // @spec ITEM-DATA-003
  it('rejects a file missing anything every item must have', () => {
    for (const field of ['id', 'name', 'kind', 'slot']) {
      const partial = { ...swordFile };
      delete partial[field];
      expect(() => buildItem('short.json', partial)).toThrow(new RegExp(`short\.json: no ${field}`));
    }
  });

  // @spec ITEM-DATA-004
  it('leaves an item naming no classes open to everybody', () => {
    expect(buildItem('blade.json', swordFile).classes).toBeNull();
  });

  // @spec ITEM-DATA-002
  it('lets a shield omit the skill a weapon needs', () => {
    const shield = buildItem('shield.json', {
      id: 's', name: 'S', kind: 'SHIELD', slot: 'OFF_HAND', defence: 5,
    });

    expect(shield.skill).toBeNull();
    expect(shield.defence).toBe(5);
  });
});

describe('the authored catalogue', () => {
  // @spec ITEM-DATA-001
  it('reads every item file, keyed by what it calls itself', () => {
    const all = itemDefinitions();

    expect(Object.keys(all).length).toBeGreaterThan(0);
    for (const [id, item] of Object.entries(all)) expect(item.id).toBe(id);
  });

  // @spec ITEM-DATA-001
  it('finds one by name, and nothing by a name nobody authored', () => {
    expect(itemById('shortsword')).toMatchObject({ kind: ItemKind.WEAPON });
    expect(itemById('excalibur')).toBeNull();
  });

  // @spec ITEM-WIELD-002
  it('keeps heavy gear to the classes that may wear it', () => {
    expect(itemById('chainmail').classes).toContain(CharacterClass.FIGHTER);
    expect(itemById('chainmail').classes).not.toContain(CharacterClass.MAGE);
  });
});
