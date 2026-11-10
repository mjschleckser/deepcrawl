import { describe, it, expect } from 'vitest';
import { buildItem, itemDefinitions, itemById, forageList } from './items.js';
import { CASTING, ItemCategory, ItemKind, Slot, Rarity } from '../sim/items.js';
import { Attribute, CharacterClass, Skill, classesWielding } from '../sim/party.js';

const swordFile = {
  id: 'blade', name: 'Blade', kind: 'WEAPON', slot: 'MAIN_HAND', category: 'LIGHT_WEAPON',
  skill: 'BLADE', damage: 9, governs: 'MIGHT',
};

describe('reading an authored item', () => {
  // @spec ITEM-DATA-001
  it('builds an item with everything its file said', () => {
    expect(buildItem('blade.json', swordFile)).toMatchObject({
      id: 'blade', kind: ItemKind.WEAPON, slot: Slot.MAIN_HAND, category: ItemCategory.LIGHT_WEAPON,
      skill: Skill.BLADE, damage: 9, governs: Attribute.MIGHT,
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
    expect(() => buildItem('cat.json', { ...swordFile, category: 'GREATAXE' }))
      .toThrow(/cat\.json: category "GREATAXE"/);
    expect(() => buildItem('class.json', { ...swordFile, classes: ['FIGHTER'] }))
      .toThrow(/class\.json: classes "FIGHTER"/);
  });

  // @spec ITEM-DATA-005
  it('reads an item naming no rarity as common, and one naming a rarity as that', () => {
    expect(buildItem('blade.json', swordFile).rarity).toBe(Rarity.COMMON);
    expect(buildItem('blade.json', { ...swordFile, rarity: 'RARE' }).rarity).toBe(Rarity.RARE);
  });

  // @spec ITEM-DATA-003
  // @spec ITEM-DEF-013
  it('reads a consumable with an effect and no slot', () => {
    const potion = buildItem('potion.json', {
      id: 'potion', name: 'Potion', kind: 'CONSUMABLE', effect: { heal: 8 },
    });

    expect(potion).toMatchObject({ kind: ItemKind.CONSUMABLE, slot: null, effect: { heal: 8 } });
  });

  // @spec ITEM-DATA-006
  it('rejects a bad rarity, a consumable with a slot, and an effect it cannot read', () => {
    const potion = { id: 'p', name: 'P', kind: 'CONSUMABLE', effect: { heal: 8 } };

    expect(() => buildItem('rare.json', { ...swordFile, rarity: 'MYTHIC' }))
      .toThrow(/rare\.json: rarity "MYTHIC"/);
    expect(() => buildItem('slotted.json', { ...potion, slot: 'MAIN_HAND' }))
      .toThrow(/slotted\.json: a consumable has no slot/);
    expect(() => buildItem('none.json', { ...potion, effect: undefined }))
      .toThrow(/none\.json: no effect/);
    expect(() => buildItem('odd.json', { ...potion, effect: { poison: 3 } }))
      .toThrow(/odd\.json: effect "poison"/);
    expect(() => buildItem('weak.json', { ...potion, effect: { heal: 0 } }))
      .toThrow(/weak\.json: heal 0/);
    expect(() => buildItem('worn.json', { ...swordFile, effect: { heal: 3 } }))
      .toThrow(/worn\.json: only a consumable has an effect/);
  });

  // @spec ITEM-DATA-003
  it('rejects a file missing anything every item must have', () => {
    for (const field of ['id', 'name', 'kind', 'slot', 'category']) {
      const partial = { ...swordFile };
      delete partial[field];
      expect(() => buildItem('short.json', partial)).toThrow(new RegExp(`short\.json: no ${field}`));
    }
  });

  // @spec ITEM-DATA-002
  it('lets a shield omit the skill a weapon needs, and refuses armour naming one', () => {
    const shield = buildItem('shield.json', {
      id: 's', name: 'S', kind: 'SHIELD', slot: 'OFF_HAND', category: 'SHIELD', armour: 2,
    });
    expect(() => buildItem('mail.json', {
      id: 'm', name: 'M', kind: 'ARMOUR', slot: 'BODY', category: 'HEAVY_ARMOUR', skill: 'BLADE', armour: 5,
    })).toThrow(/mail\.json: skill "BLADE"/);

    expect(shield.skill).toBeNull();
    expect(shield.armour).toBe(2);
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
  it('keeps heavy gear to the classes whose files name its category', () => {
    expect(itemById('chainmail').category).toBe(ItemCategory.HEAVY_ARMOUR);
    expect(classesWielding(ItemCategory.HEAVY_ARMOUR)).toContain(CharacterClass.FIGHTER);
    expect(classesWielding(ItemCategory.HEAVY_ARMOUR)).not.toContain(CharacterClass.MAGE);
  });

  // @spec ITEM-DEF-016
  it('gives every worn item a category and nothing used up one', () => {
    for (const item of Object.values(itemDefinitions())) {
      if (item.slot) expect(Object.values(ItemCategory)).toContain(item.category);
      else expect(item.category ?? null).toBeNull();
    }
  });
});

describe('a tome', () => {
  // @spec ITEM-DEF-013
  it('is a consumable whose effect teaches a spell', () => {
    const tome = itemById('tome_of_fire_bolt');
    expect(tome).toMatchObject({ kind: ItemKind.CONSUMABLE, rarity: Rarity.RARE });
    expect(tome.effect).toEqual({ teach: 'fire_bolt' });
  });

  // @spec ITEM-DATA-006
  it('is refused when it names a spell that does not exist', () => {
    expect(() => buildItem('t.json', {
      id: 't', name: 'T', kind: 'CONSUMABLE', effect: { teach: 'meteor' },
    })).toThrow(/t\.json: teach "meteor"/);
  });
});

describe('the wand', () => {
  // @spec ITEM-DEF-015
  it('is an uncommon wand for mages and clerics, of magic, drawing on what its wielder casts with', () => {
    const wand = itemById('wand');
    expect(wand).toMatchObject({
      kind: ItemKind.WEAPON, slot: Slot.MAIN_HAND, category: ItemCategory.WAND, skill: 'MAGIC', governs: CASTING,
    });
    expect([Rarity.UNCOMMON, Rarity.RARE, Rarity.EPIC, Rarity.LEGENDARY]).toContain(wand.rarity);
    expect(classesWielding(ItemCategory.WAND).sort()).toEqual([CharacterClass.CLERIC, CharacterClass.MAGE]);
  });

  it('refuses MAGIC as the skill of anything but a weapon', () => {
    expect(() => buildItem('robe.json', {
      id: 'r', name: 'R', kind: 'ARMOUR', slot: 'BODY', category: 'LIGHT_ARMOUR', skill: 'MAGIC', armour: 1,
    })).toThrow(/robe\.json: skill "MAGIC"/);
  });
});

describe('the authored food', () => {
  // @spec FOOD-ITEM-002
  it('holds the twelve ingredients, as food with what they add to the pot', () => {
    const ids = ['ration', 'goblin_haunch', 'spit_roast_rat', 'glowcap', 'mages_spice_pouch', 'bitterleaf',
      'fleetroot', 'cave_moss', 'ironcap', 'smoked_sausage', 'honeycomb', 'dragonpepper'];
    for (const id of ids) expect(itemById(id)?.kind).toBe(ItemKind.FOOD);
    expect(itemById('goblin_haunch')).toMatchObject({ nourish: 450, heal: 8, traits: { hearty: 3 } });
    expect(itemById('ration').traits).toEqual({});
  });

  // @spec FOOD-ITEM-001
  it('refuses a trait or an amount it does not recognise, and says which', () => {
    expect(() => buildItem('f.json', { id: 'f', name: 'F', kind: 'FOOD', nourish: 1, traits: { spicy: 2 } }))
      .toThrow(/f\.json: trait "spicy"/);
    expect(() => buildItem('g.json', { id: 'g', name: 'G', kind: 'FOOD', nourish: -5 }))
      .toThrow(/g\.json: nourish -5/);
  });

  // @spec FOOD-FORAGE-001
  it('reads the forage list as items', () => {
    expect(forageList().map((item) => item.id)).toEqual(['bitterleaf', 'fleetroot', 'cave_moss', 'ironcap', 'glowcap']);
  });
});
