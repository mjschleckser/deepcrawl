import { describe, it, expect } from 'vitest';
import { makeRng } from './rng.js';
import {
  createParty, createCharacter, addCharacter, character, stow, packOf, equip, chargesLeft,
  applyDamage, Attribute, CharacterClass, Condition, Skill,
} from './party.js';
import {
  ItemCategory, ItemKind, Slot, CASTING, armourOf, baseDamageWith, createItem, wieldableBy,
} from './items.js';
import {
  createSpell, knows, slotsAt, spellMagnitude, castRefusal, CastRefusal, castOnAlly, castPayment,
  readRefusal, ReadRefusal, spendSlot, CastWhere, Learned, SpellTarget, SpellEffect,
} from './magic.js';
import {
  beginEncounter, takeAction, hitDamage, createEnemy, createEnemyGroup, encounterOutcome, castPreview,
  hasActed, Action, FULL_BAR, serializeEncounter, restoreEncounter,
} from './combat.js';
import { selectEnemyTarget } from './enemies.js';
import { createFloor, Direction } from './floor.js';
import { createExploration, computeSight } from './exploration.js';
import { camp, CampOutcome } from './camp.js';

const make = (id, characterClass, over = {}) => createCharacter({ id, name: id, characterClass, ...over });

function party(...members) {
  const p = createParty();
  for (const m of members) addCharacter(p, m);
  return p;
}

const missile = createSpell({
  id: 'magic_missile', name: 'Magic Missile', school: Skill.EVOCATION, rank: 1, target: SpellTarget.ENEMY,
  effect: { [SpellEffect.DAMAGE]: 6, ignoresArmour: true }, where: [CastWhere.COMBAT], learned: Learned.CLASS,
});
const heal = createSpell({
  id: 'heal', name: 'Heal', school: Skill.HEALING, rank: 1, target: SpellTarget.ALLY,
  effect: { [SpellEffect.HEAL]: 8 }, where: [CastWhere.COMBAT, CastWhere.EXPLORATION], learned: Learned.CLASS,
});
const bolt = createSpell({
  id: 'fire_bolt', name: 'Fire Bolt', school: Skill.EVOCATION, rank: 1, target: SpellTarget.ENEMY,
  effect: { [SpellEffect.DAMAGE]: 10 }, where: [CastWhere.COMBAT], learned: Learned.TOME,
});
const spells = { magic_missile: missile, heal, fire_bolt: bolt };

const weapon = (id, category, over = {}) => createItem({
  id, name: id, kind: ItemKind.WEAPON, slot: Slot.MAIN_HAND, category, skill: Skill.BLADE, damage: 10, ...over,
});
const armour = (id, category, value, slot = Slot.BODY, kind = ItemKind.ARMOUR) => createItem({
  id, name: id, kind, slot, category, armour: value,
});

const orc = (id, over = {}) => createEnemy({ id, name: 'Orc', maxHitPoints: 60, potValue: 20, ...over });

function fight(members, enemies, seed = 7) {
  return beginEncounter({
    party: party(...members), enemies: createEnemyGroup(enemies), rng: makeRng(seed),
    origin: { floorId: 'f1', x: 1, y: 1 }, spells,
  });
}

describe('who may cast what', () => {
  // @spec MAGIC-SPELL-001
  it('gives a spell no list of classes', () => {
    expect(missile.classes).toBeUndefined();
  });

  // @spec MAGIC-KNOW-001
  it('knows a class spell by the schools the class casts', () => {
    expect(knows(make('isolde', CharacterClass.MAGE), missile)).toBe(true);
    expect(knows(make('wren', CharacterClass.CLERIC), heal)).toBe(true);
    const wren = make('wren', CharacterClass.CLERIC, { ranks: { [Skill.EVOCATION]: 5 } });
    expect(knows(wren, missile)).toBe(false);
  });

  // @spec MAGIC-KNOW-004
  it('refuses a tome to a class that does not cast its school', () => {
    const tome = createItem({ id: 't', name: 'Tome', kind: ItemKind.CONSUMABLE, effect: { teach: 'fire_bolt' } });
    const p = party(make('wren', CharacterClass.CLERIC, { ranks: { [Skill.EVOCATION]: 3 } }), make('isolde', CharacterClass.MAGE));
    stow(p, tome);
    expect(readRefusal(p, 'wren', tome, spells)).toBe(ReadRefusal.WRONG_CLASS);
    expect(readRefusal(p, 'isolde', tome, spells)).toBe(null);
  });
});

describe('the casting attribute', () => {
  // @spec MAGIC-SLOT-001
  it('buys slots with the class\'s own attribute', () => {
    const wren = make('wren', CharacterClass.CLERIC, { attributes: { [Attribute.RESOLVE]: 14, [Attribute.INTELLECT]: 8 } });
    expect(slotsAt(wren, 1, spells)).toBe(5);
    const isolde = make('isolde', CharacterClass.MAGE, { attributes: { [Attribute.INTELLECT]: 12, [Attribute.RESOLVE]: 18 } });
    expect(slotsAt(isolde, 1, spells)).toBe(4);
  });

  // @spec MAGIC-CAST-001
  it('grows spells with the class\'s own attribute', () => {
    const plain = make('wren', CharacterClass.CLERIC);
    const resolute = make('wren', CharacterClass.CLERIC, { attributes: { [Attribute.RESOLVE]: 15, [Attribute.INTELLECT]: 5 } });
    expect(spellMagnitude(plain, heal)).toBe(10);
    expect(spellMagnitude(resolute, heal)).toBe(Math.round(8 * 1.2 * 1.2));
  });
});

describe('Overchannel', () => {
  const spentMage = (hp = 18) => {
    const p = party(make('isolde', CharacterClass.MAGE), make('wren', CharacterClass.CLERIC));
    const isolde = character(p, 'isolde');
    for (let i = 0; i < 3; i++) spendSlot(isolde, 1);
    isolde.hitPoints = hp;
    return p;
  };

  // @spec MAGIC-SLOT-003
  it('still refuses a caster without Overchannel who is out of slots', () => {
    const p = party(make('wren', CharacterClass.CLERIC), make('bram', CharacterClass.FIGHTER));
    for (let i = 0; i < 3; i++) spendSlot(character(p, 'wren'), 1);
    character(p, 'bram').hitPoints = 5;
    expect(castRefusal(p, 'wren', heal, { where: CastWhere.COMBAT, targetId: 'bram' })).toBe(CastRefusal.NO_SLOTS);
  });

  // @spec MAGIC-SLOT-009
  // @spec MAGIC-SLOT-011
  it('pays with a slot while one is left, and with hit points only after', () => {
    const p = party(make('isolde', CharacterClass.MAGE));
    expect(castPayment(character(p, 'isolde'), missile, spells)).toEqual({ slot: true, hitPoints: 0 });
    expect(spentMage().members[0] && castPayment(character(spentMage(), 'isolde'), missile, spells))
      .toEqual({ slot: false, hitPoints: 6 });
  });

  // @spec MAGIC-SLOT-008
  // @spec MAGIC-SLOT-012
  it('charges hit points for a cast with no slot left, and counts Overchannel as used', () => {
    const state = beginEncounter({
      party: spentMage(), enemies: createEnemyGroup([orc('o1')]), rng: makeRng(3), origin: null, spells,
    });
    state.readiness.set('isolde', FULL_BAR);
    const result = takeAction(state, 'isolde', { kind: Action.CAST, spellId: 'magic_missile', targetId: 'o1' });
    expect(result.damage).toBeGreaterThan(0);
    expect(character(state.party, 'isolde').hitPoints).toBe(12);
    expect(character(state.party, 'isolde').spentSlots[1]).toBe(3);
    expect([...state.skillsByActor.get('isolde')]).toEqual([Skill.EVOCATION, Skill.OVERCHANNEL]);
  });

  // @spec MAGIC-SLOT-010
  it('refuses an Overchannelled cast that would knock the mage out, spending nothing', () => {
    const p = spentMage(6);
    expect(castRefusal(p, 'isolde', missile, { where: CastWhere.COMBAT })).toBe(CastRefusal.TOO_HURT);
    expect(castRefusal(spentMage(7), 'isolde', missile, { where: CastWhere.COMBAT })).toBe(null);
  });

  // @spec MAGIC-SLOT-008
  it('pays for an ally spell out of a fight in hit points too, and trains Overchannel', () => {
    const allyBolt = createSpell({ ...heal, id: 'mend', school: Skill.ALTERATION });
    const p = spentMage();
    character(p, 'wren').hitPoints = 10;
    expect(castOnAlly(p, 'isolde', allyBolt, 'wren', { where: CastWhere.EXPLORATION })).not.toBe(null);
    expect(character(p, 'isolde').hitPoints).toBe(12);
    expect(character(p, 'isolde').skillExperience[Skill.OVERCHANNEL]).toBeGreaterThan(0);
  });
});

describe('item categories', () => {
  // @spec ITEM-DEF-016
  it('offers exactly the seven categories', () => {
    expect(Object.values(ItemCategory)).toEqual([
      'LIGHT_WEAPON', 'MARTIAL_BLADE', 'MARTIAL_BLUNT', 'WAND', 'LIGHT_ARMOUR', 'HEAVY_ARMOUR', 'SHIELD',
    ]);
  });

  // @spec ITEM-WIELD-002
  // @spec ITEM-WIELD-003
  it('lets a class hold what its file names, whatever skills it holds', () => {
    const longsword = weapon('longsword', ItemCategory.MARTIAL_BLADE);
    const warhammer = weapon('warhammer', ItemCategory.MARTIAL_BLUNT, { skill: Skill.BLUNT });
    expect(wieldableBy(longsword, CharacterClass.THIEF)).toBe(true);
    expect(wieldableBy(warhammer, CharacterClass.THIEF)).toBe(false);
    expect(wieldableBy(warhammer, CharacterClass.CLERIC)).toBe(true);
    expect(wieldableBy(armour('plate', ItemCategory.HEAVY_ARMOUR, 6), CharacterClass.MAGE)).toBe(false);
  });

  // @spec PARTY-OP-003
  it('refuses to equip an item whose category the class does not wield', () => {
    const p = party(make('isolde', CharacterClass.MAGE));
    const plate = armour('plate', ItemCategory.HEAVY_ARMOUR, 6);
    stow(p, plate);
    expect(equip(p, 'isolde', plate, Slot.BODY)).toBe(false);
    expect(packOf(p)).toEqual([plate]);
  });

  // @spec ITEM-DEF-005
  it('gives armour no skill', () => {
    expect(armour('mail', ItemCategory.HEAVY_ARMOUR, 5).skill).toBe(null);
  });
});

describe('a weapon drawing on the casting attribute', () => {
  // @spec ITEM-DEF-017
  it('draws on Intellect for a mage, Resolve for a cleric, the default for others', () => {
    const wand = weapon('wand', ItemCategory.WAND, { skill: Skill.BLADE, governs: CASTING });
    const holding = (characterClass, attributes) => {
      const c = make('x', characterClass, { attributes });
      c.ranks[Skill.BLADE] = 0;
      c.equipment[Slot.MAIN_HAND] = wand;
      return baseDamageWith(c);
    };
    expect(holding(CharacterClass.MAGE, { [Attribute.INTELLECT]: 15, [Attribute.RESOLVE]: 5 })).toBeCloseTo(12);
    expect(holding(CharacterClass.CLERIC, { [Attribute.INTELLECT]: 5, [Attribute.RESOLVE]: 15 })).toBeCloseTo(12);
    expect(holding(CharacterClass.FIGHTER, { [Attribute.INTELLECT]: 15, [Attribute.RESOLVE]: 15 })).toBeCloseTo(10);
  });
});

describe('Ironclad armour', () => {
  // @spec ITEM-NUM-009
  it('grows worn armour and shield by the fighter\'s Ironclad, before any meal bonus', () => {
    const bram = make('bram', CharacterClass.FIGHTER);
    bram.ranks[Skill.IRONCLAD] = 10;
    bram.equipment[Slot.BODY] = armour('mail', ItemCategory.HEAVY_ARMOUR, 5);
    bram.equipment[Slot.OFF_HAND] = armour('shield', ItemCategory.SHIELD, 1, Slot.OFF_HAND, ItemKind.SHIELD);
    expect(armourOf(bram)).toBeCloseTo(9);
    const isolde = make('isolde', CharacterClass.MAGE);
    isolde.equipment[Slot.BODY] = armour('mail', ItemCategory.HEAVY_ARMOUR, 5);
    expect(armourOf(isolde)).toBe(5);
  });
});

describe('Backstab', () => {
  const thief = () => {
    const tam = make('tam', CharacterClass.THIEF, { attack: { skill: Skill.BLADE, baseDamage: 10 } });
    tam.ranks[Skill.BLADE] = 0;
    return tam;
  };

  // @spec COMBAT-ATTACK-017
  // @spec COMBAT-ATTACK-019
  it('doubles a thief\'s blow on an enemy that has not acted, and shows it first', () => {
    const state = fight([thief()], [orc('o1'), orc('o2')]);
    expect(hasActed(state, 'o1')).toBe(false);
    expect(hitDamage(state, 'tam', 'o1')).toBe(20);
    state.readiness.set('tam', FULL_BAR);
    const result = takeAction(state, 'tam', { kind: Action.ATTACK, targetId: 'o1', skill: Skill.BLADE });
    expect(result.damage).toBe(20);
    expect([...state.skillsByActor.get('tam')]).toEqual([Skill.BLADE, Skill.BACKSTAB]);
  });

  // @spec COMBAT-ATTACK-018
  // @spec COMBAT-ATTACK-019
  it('stops once the enemy has acted', () => {
    const state = fight([thief()], [orc('o1', { attack: { skill: Skill.BLADE, baseDamage: 1 } })]);
    state.readiness.set('o1', FULL_BAR);
    takeAction(state, 'o1', { kind: Action.ATTACK, targetId: 'tam', skill: Skill.BLADE });
    expect(hasActed(state, 'o1')).toBe(true);
    expect(hitDamage(state, 'tam', 'o1')).toBe(10);
    const back = restoreEncounter(JSON.parse(JSON.stringify(serializeEncounter(state))), state.party, {}, spells);
    expect(hasActed(back, 'o1')).toBe(true);
  });

  // @spec COMBAT-ATTACK-018
  it('leaves spells and other classes\' blows alone', () => {
    const bram = make('bram', CharacterClass.FIGHTER, { attack: { skill: Skill.BLADE, baseDamage: 10 } });
    bram.ranks[Skill.BLADE] = 0;
    const state = fight([bram, make('isolde', CharacterClass.MAGE)], [orc('o1')]);
    expect(hitDamage(state, 'bram', 'o1')).toBe(10);
    expect(castPreview(state, 'isolde', 'magic_missile', 'o1')).toBe(7);
  });
});

describe('class skills used in a fight', () => {
  // @spec COMBAT-END-008
  it('counts Ironclad when an enemy\'s attack strikes the fighter', () => {
    const state = fight([make('bram', CharacterClass.FIGHTER)], [orc('o1', { attack: { skill: Skill.BLADE, baseDamage: 5 } })]);
    state.readiness.set('o1', FULL_BAR);
    takeAction(state, 'o1', { kind: Action.ATTACK, targetId: 'bram', skill: Skill.BLADE });
    expect([...state.skillsByActor.get('bram')]).toEqual([Skill.IRONCLAD]);
  });

  // @spec COMBAT-END-008
  // @spec PARTY-CSKILL-010
  it('counts Intercession for the cleric when it catches a fall, without training it there', () => {
    const state = fight(
      [make('bram', CharacterClass.FIGHTER), make('wren', CharacterClass.CLERIC)],
      [orc('o1', { attack: { skill: Skill.BLADE, baseDamage: 500 } })],
    );
    state.readiness.set('o1', FULL_BAR);
    takeAction(state, 'o1', { kind: Action.ATTACK, targetId: 'bram', skill: Skill.BLADE });
    expect(character(state.party, 'bram')).toMatchObject({ hitPoints: 1, condition: Condition.OK });
    expect([...state.skillsByActor.get('wren')]).toEqual([Skill.INTERCESSION]);
    expect(character(state.party, 'wren').skillExperience[Skill.INTERCESSION]).toBeUndefined();
    expect(encounterOutcome(state).outcome).toBe('ONGOING');
  });
});

describe('Ironclad drawing enemy attacks', () => {
  // @spec ENEMY-FIGHT-005
  it('draws a fighter as often as Ironclad weights them', () => {
    const bram = make('bram', CharacterClass.FIGHTER);
    bram.ranks[Skill.IRONCLAD] = 10;
    const tam = make('tam', CharacterClass.THIEF);
    const rng = makeRng(11);
    let bramPicked = 0;
    for (let i = 0; i < 4000; i++) if (selectEnemyTarget('MELEE', [bram, tam], rng) === bram) bramPicked += 1;
    expect(bramPicked / 4000).toBeGreaterThan(0.72);
    expect(bramPicked / 4000).toBeLessThan(0.78);
  });

  // @spec ENEMY-FIGHT-005
  it('draws evenly among characters without Ironclad', () => {
    const a = make('a', CharacterClass.THIEF);
    const b = make('b', CharacterClass.MAGE);
    const rng = makeRng(5);
    let aPicked = 0;
    for (let i = 0; i < 4000; i++) if (selectEnemyTarget('MELEE', [a, b], rng) === a) aPicked += 1;
    expect(aPicked / 4000).toBeGreaterThan(0.46);
    expect(aPicked / 4000).toBeLessThan(0.54);
  });
});

describe('camp and Intercession', () => {
  // @spec CAMP-REST-007
  it('restores the cleric\'s spent charges when the camp is not broken', () => {
    const p = party(make('bram', CharacterClass.FIGHTER), make('wren', CharacterClass.CLERIC));
    applyDamage(p, 'bram', 500);
    expect(chargesLeft(character(p, 'wren'))).toBe(0);
    const floor = createFloor({ id: 'f1', width: 13, height: 13 });
    const state = createExploration({ floors: [floor], floorId: 'f1', tile: { x: 6, y: 6 }, facing: Direction.NORTH });
    computeSight(state);
    expect(camp(state, p).outcome).toBe(CampOutcome.RESTED);
    expect(chargesLeft(character(p, 'wren'))).toBe(1);
  });
});

