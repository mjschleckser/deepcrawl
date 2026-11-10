import { describe, it, expect } from 'vitest';
import { buildClass, checkClasses, classDefinitions } from './classes.js';
import { buildEnemy, buildPlayer } from './combatants.js';
import { CharacterClass, Skill, Attribute, classOf } from '../sim/party.js';
import { ItemCategory } from '../sim/items.js';

const fighterFile = () => ({
  id: 'FIGHTER',
  name: 'Fighter',
  hitPoints: 30,
  classSkill: 'IRONCLAD',
  startingRanks: { IRONCLAD: 1, BLADE: 2 },
  wields: ['LIGHT_WEAPON', 'SHIELD'],
  schools: [],
  castsWith: null,
});

describe('reading a class', () => {
  // @spec PARTY-CLASS-001
  it('reads every property a class holds from its file', () => {
    expect(buildClass('fighter.json', fighterFile())).toEqual({
      id: CharacterClass.FIGHTER,
      name: 'Fighter',
      hitPoints: 30,
      classSkill: Skill.IRONCLAD,
      startingRanks: { [Skill.IRONCLAD]: 1, [Skill.BLADE]: 2 },
      wields: [ItemCategory.LIGHT_WEAPON, ItemCategory.SHIELD],
      schools: [],
      castsWith: null,
    });
  });

  // @spec PARTY-CLASS-006
  it('rejects a file naming something that does not exist, by name and value', () => {
    const cases = [
      [{ classSkill: 'TAUNT' }, /TAUNT/],
      [{ startingRanks: { IRONCLAD: 1, SWORDS: 2 } }, /SWORDS/],
      [{ wields: ['GREATAXE'] }, /GREATAXE/],
      [{ schools: ['NECROMANCY'] }, /NECROMANCY/],
      [{ castsWith: 'CHARM' }, /CHARM/],
      [{ id: 'BARD' }, /BARD/],
    ];
    for (const [change, message] of cases) {
      expect(() => buildClass('fighter.json', { ...fighterFile(), ...change })).toThrow(/fighter\.json/);
      expect(() => buildClass('fighter.json', { ...fighterFile(), ...change })).toThrow(message);
    }
  });

  // @spec PARTY-CLASS-006
  it('rejects a file lacking any field a class holds', () => {
    for (const field of ['id', 'name', 'hitPoints', 'classSkill', 'startingRanks', 'wields', 'schools', 'castsWith']) {
      const data = fighterFile();
      delete data[field];
      expect(() => buildClass('fighter.json', data)).toThrow(new RegExp(field));
    }
  });

  // @spec PARTY-SKILL-002
  it('rejects starting ranks that leave out the class skill', () => {
    expect(() => buildClass('fighter.json', { ...fighterFile(), startingRanks: { BLADE: 2 } })).toThrow(/IRONCLAD/);
  });

  // @spec PARTY-CLASS-007
  it('rejects a class skill outside the Class group, or two classes sharing one', () => {
    expect(() => buildClass('fighter.json', { ...fighterFile(), classSkill: 'BLADE', startingRanks: { BLADE: 1 } }))
      .toThrow(/BLADE/);
    const fighter = buildClass('fighter.json', fighterFile());
    const thief = buildClass('thief.json', { ...fighterFile(), id: 'THIEF', name: 'Thief' });
    expect(() => checkClasses([fighter, thief])).toThrow(/IRONCLAD/);
  });
});

describe('the authored classes', () => {
  // @spec PARTY-CLASS-001
  // @spec PARTY-CLASS-005
  it('reads one file for each class, holding the class whole', () => {
    const classes = classDefinitions();
    expect(Object.keys(classes).sort()).toEqual(['CLERIC', 'FIGHTER', 'MAGE', 'THIEF']);
    expect(classOf(CharacterClass.FIGHTER)).toEqual(classes.FIGHTER);
  });

  it('authors the four classes as the party design sets them', () => {
    const c = classDefinitions();
    expect([c.FIGHTER, c.MAGE, c.CLERIC, c.THIEF].map((k) => k.hitPoints)).toEqual([30, 18, 26, 22]);
    expect([c.FIGHTER, c.MAGE, c.CLERIC, c.THIEF].map((k) => k.classSkill))
      .toEqual([Skill.IRONCLAD, Skill.OVERCHANNEL, Skill.INTERCESSION, Skill.BACKSTAB]);
    expect(c.MAGE.castsWith).toBe(Attribute.INTELLECT);
    expect(c.CLERIC.castsWith).toBe(Attribute.RESOLVE);
    expect(c.FIGHTER.castsWith).toBe(null);
    expect(c.MAGE.schools).toEqual([Skill.EVOCATION, Skill.ALTERATION]);
    expect(c.CLERIC.schools).toEqual([Skill.HEALING, Skill.RESTORATION]);
    expect(c.THIEF.wields).toContain(ItemCategory.MARTIAL_BLADE);
    expect(c.THIEF.wields).not.toContain(ItemCategory.MARTIAL_BLUNT);
    expect(c.CLERIC.wields).toContain(ItemCategory.WAND);
  });
});

describe('class skills in authored combatants', () => {
  // @spec PARTY-DATA-007
  it('rejects a character holding another class\'s class skill', () => {
    expect(() => buildPlayer('tam.json', { id: 'tam', name: 'Tam', characterClass: 'THIEF', ranks: { IRONCLAD: 2 } }))
      .toThrow(/tam\.json.*IRONCLAD/);
    expect(buildPlayer('tam.json', { id: 'tam', name: 'Tam', characterClass: 'THIEF', ranks: { BACKSTAB: 3 } })
      .ranks[Skill.BACKSTAB]).toBe(3);
  });

  // @spec PARTY-DATA-007
  it('rejects an enemy holding any class skill', () => {
    expect(() => buildEnemy('ogre.json', { id: 'OGRE', name: 'Ogre', maxHitPoints: 20, ranks: { IRONCLAD: 1 } }))
      .toThrow(/ogre\.json.*IRONCLAD/);
  });
});
