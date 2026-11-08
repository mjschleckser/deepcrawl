import { describe, it, expect } from 'vitest';
import {
  ItemKind, Slot, Rarity, RARITY_ORDER, createItem,
  weaponOf, armourOf, baseDamageWith,
  fitsSlot, wieldableBy,
} from './items.js';
import { Attribute, CharacterClass, Skill, createCharacter } from './party.js';

const sword = (over = {}) => createItem({
  id: 'sword', name: 'Sword', kind: ItemKind.WEAPON, slot: Slot.MAIN_HAND,
  skill: Skill.BLADE, damage: 10, governs: Attribute.MIGHT, ...over,
});

const mail = (over = {}) => createItem({
  id: 'mail', name: 'Mail', kind: ItemKind.ARMOUR, slot: Slot.BODY,
  skill: Skill.HEAVY_ARMOUR, armour: 4, ...over,
});

const buckler = (over = {}) => createItem({
  id: 'buckler', name: 'Buckler', kind: ItemKind.SHIELD, slot: Slot.OFF_HAND,
  armour: 2, ...over,
});

/** A combatant shaped the way both sides are shaped, with nothing held. */
const bare = (over = {}) => ({
  id: 'x', name: 'X',
  attributes: { ...{ MIGHT: 10, CONSTITUTION: 10, DEXTERITY: 10, INTELLECT: 10, RESOLVE: 10 } },
  ranks: {}, equipment: {}, attack: null, armour: 0, ...over,
});

describe('what an item is', () => {
  // @spec ITEM-DEF-001
  // @spec ITEM-DEF-004
  it('carries its own numbers rather than deriving them from its name', () => {
    const w = sword();

    expect(w).toMatchObject({
      id: 'sword', kind: ItemKind.WEAPON, slot: Slot.MAIN_HAND,
      skill: Skill.BLADE, damage: 10, governs: Attribute.MIGHT,
    });
    expect(w).not.toHaveProperty('accuracy');
  });

  // @spec ITEM-DEF-008
  it('lets a finesse weapon train the same skill as a heavy one', () => {
    const dagger = sword({ id: 'dagger', governs: Attribute.DEXTERITY });

    expect(dagger.governs).toBe(Attribute.DEXTERITY);
    expect(dagger.skill).toBe(sword().skill);
  });

  // @spec ITEM-DATA-004
  it('is wieldable by anyone when it names no classes', () => {
    expect(wieldableBy(sword(), CharacterClass.MAGE)).toBe(true);
  });

  // @spec ITEM-DEF-001
  // @spec ITEM-DATA-005
  it('carries a rarity, common unless it names another', () => {
    expect(sword().rarity).toBe(Rarity.COMMON);
    expect(sword({ rarity: Rarity.EPIC }).rarity).toBe(Rarity.EPIC);
  });

  // @spec ITEM-DEF-001
  // @spec ITEM-DEF-013
  it('lets a consumable carry an effect and no slot', () => {
    const potion = createItem({
      id: 'potion', name: 'Potion', kind: ItemKind.CONSUMABLE, slot: Slot.MAIN_HAND,
      effect: { heal: 8 },
    });

    expect(potion.slot).toBeNull();
    expect(potion.effect).toEqual({ heal: 8 });
  });

  // @spec ITEM-WIELD-004
  it('fits a consumable to no slot, so it can never be equipped', () => {
    const potion = createItem({ id: 'p', name: 'P', kind: ItemKind.CONSUMABLE, effect: { heal: 8 } });

    for (const slot of Object.values(Slot)) expect(fitsSlot(potion, slot)).toBe(false);
  });

  it('copies what it is given, so two items never share a part', () => {
    const effect = { heal: 8 };
    const potion = createItem({ id: 'p', name: 'P', kind: ItemKind.CONSUMABLE, effect });
    const again = createItem(potion);

    expect(again).toEqual(potion);
    expect(again.effect).not.toBe(potion.effect);
    expect(potion.effect).not.toBe(effect);
  });
});

describe('what a combatant fights with', () => {
  // @spec ITEM-HOLD-001
  it('takes the weapon from the main hand when one is held', () => {
    const c = bare({ equipment: { [Slot.MAIN_HAND]: sword() } });

    expect(weaponOf(c).id).toBe('sword');
  });

  // @spec ITEM-HOLD-001
  // @spec ITEM-HOLD-003
  it('falls back to the attack a combatant was authored with', () => {
    const goblin = bare({
      equipment: {}, attack: { skill: Skill.BLADE, baseDamage: 5 },
    });

    // Its claws are its weapon: the same fields, read the same way.
    expect(weaponOf(goblin)).toMatchObject({ skill: Skill.BLADE, damage: 5 });
  });

  // @spec ITEM-HOLD-002
  it('takes armour from the body slot, and failing that from what was authored', () => {
    expect(armourOf(bare({ equipment: { [Slot.BODY]: mail() } }))).toBe(4);
    expect(armourOf(bare({ armour: 2 }))).toBe(2);
  });

  // @spec ITEM-HOLD-004
  it('adds a shield\'s armour to the body\'s, only while it is in the off hand', () => {
    expect(armourOf(bare({ equipment: { [Slot.OFF_HAND]: buckler() } }))).toBe(2);
    expect(armourOf(bare({ equipment: { [Slot.BODY]: mail(), [Slot.OFF_HAND]: buckler() } }))).toBe(6);
    expect(armourOf(bare({ armour: 3, equipment: { [Slot.OFF_HAND]: buckler() } }))).toBe(5);
    // A second weapon in the off hand turns nothing.
    expect(armourOf(bare({ equipment: { [Slot.BODY]: mail(), [Slot.OFF_HAND]: sword({ slot: Slot.OFF_HAND }) } }))).toBe(4);
  });
});

describe('the numbers', () => {
  // @spec ITEM-NUM-003
  it('assembles base damage from the weapon, the rank, and what the weapon governs', () => {
    const c = bare({
      attributes: { ...bare().attributes, MIGHT: 15 },
      ranks: { [Skill.BLADE]: 4 },
      equipment: { [Slot.MAIN_HAND]: sword() },
    });

    // 10 x (1 + 0.10x4) x (1 + 0.04x5)
    expect(baseDamageWith(c)).toBeCloseTo(10 * 1.4 * 1.2, 5);
  });

  // @spec ITEM-NUM-003
  it('draws damage from the attribute the weapon names, not from a fixed one', () => {
    const attrs = { ...bare().attributes, MIGHT: 10, DEXTERITY: 20 };
    const heavy = bare({ attributes: attrs, equipment: { [Slot.MAIN_HAND]: sword() } });
    const finesse = bare({
      attributes: attrs,
      equipment: { [Slot.MAIN_HAND]: sword({ governs: Attribute.DEXTERITY }) },
    });

    expect(baseDamageWith(finesse)).toBeGreaterThan(baseDamageWith(heavy));
  });

  // @spec ITEM-NUM-006
  it('assembles both for somebody holding nothing at all', () => {
    const empty = bare();

    expect(armourOf(empty)).toBe(0);
    expect(baseDamageWith(empty)).toBe(0);
  });
});

describe('who may hold what', () => {
  // @spec ITEM-WIELD-001
  it('fits an item only to the slot it names', () => {
    expect(fitsSlot(sword(), Slot.MAIN_HAND)).toBe(true);
    expect(fitsSlot(sword(), Slot.BODY)).toBe(false);
    expect(fitsSlot(buckler(), Slot.OFF_HAND)).toBe(true);
  });

  // @spec ITEM-WIELD-002
  it('admits only the classes an item names, once it names any', () => {
    const plate = mail({ classes: [CharacterClass.FIGHTER] });

    expect(wieldableBy(plate, CharacterClass.FIGHTER)).toBe(true);
    expect(wieldableBy(plate, CharacterClass.MAGE)).toBe(false);
  });

  // @spec ITEM-WIELD-003
  it('asks the item rather than what the class can train', () => {
    const mage = createCharacter({ id: 'm', name: 'M', characterClass: CharacterClass.MAGE });
    // Whatever this class cannot train, it may still be permitted to hold.
    const untrainable = Object.values(Skill).find((sk) => !mage.trainable.includes(sk));
    expect(untrainable).toBeDefined();

    const permitted = sword({ skill: untrainable, classes: [CharacterClass.MAGE] });

    expect(wieldableBy(permitted, CharacterClass.MAGE)).toBe(true);
  });
});

describe('the vocabulary an item is built from', () => {
  // @spec ITEM-DEF-002
  it('offers four kinds and no others', () => {
    expect(Object.keys(ItemKind).sort()).toEqual(['ARMOUR', 'CONSUMABLE', 'SHIELD', 'WEAPON']);
  });

  // @spec ITEM-DEF-012
  it('offers five rarities, lowest to highest', () => {
    expect(RARITY_ORDER).toEqual([
      Rarity.COMMON, Rarity.UNCOMMON, Rarity.RARE, Rarity.EPIC, Rarity.LEGENDARY,
    ]);
    expect(Object.keys(Rarity).sort()).toEqual(['COMMON', 'EPIC', 'LEGENDARY', 'RARE', 'UNCOMMON']);
  });

  // @spec ITEM-DEF-003
  it('offers three slots and no others', () => {
    expect(Object.keys(Slot).sort()).toEqual(['BODY', 'MAIN_HAND', 'OFF_HAND']);
  });

  // @spec ITEM-DEF-005
  it('carries on armour the skill it is worn under and the damage it turns', () => {
    expect(mail()).toMatchObject({ skill: Skill.HEAVY_ARMOUR, armour: 4 });
  });

  // @spec ITEM-DEF-006
  it('carries on a shield the armour it adds', () => {
    expect(buckler()).toMatchObject({ kind: ItemKind.SHIELD, armour: 2 });
    expect(buckler()).not.toHaveProperty('defence');
  });

  // @spec ITEM-DEF-007
  it('behaves by its fields rather than by what it is called', () => {
    // Same numbers, different names: nothing anywhere reads the identifier.
    const named = sword({ id: 'excalibur', name: 'Excalibur' });
    const plain = sword();
    const wielder = (w) => bare({ equipment: { [Slot.MAIN_HAND]: w } });

    expect(baseDamageWith(wielder(named))).toBe(baseDamageWith(wielder(plain)));
  });
});
