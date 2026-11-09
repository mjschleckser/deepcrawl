import { describe, it, expect } from 'vitest';
import {
  Attribute, CharacterClass, Condition, Skill, totalLevel, roster,
} from '../sim/party.js';
import { EnemyRole } from '../sim/combat.js';
import {
  buildPlayer, buildEnemy, startingCharacters, enemyDefinitions,
} from './combatants.js';

const goblinFile = {
  id: 'GOBLIN', name: 'Goblin', role: 'MELEE',
  attributes: { DEXTERITY: 11 },
  ranks: { BLADE: 2, LIGHT_ARMOUR: 1 },
  maxHitPoints: 9,
  attack: { skill: 'BLADE', baseDamage: 5 },
  armour: 2,
  potValue: 14,
};

const playerFile = {
  id: 'bram', name: 'Bram', characterClass: 'FIGHTER',
  attributes: { DEXTERITY: 13 },
  maxHitPoints: 20,
  attack: { skill: 'BLADE', baseDamage: 9 },
};

describe('reading an authored combatant', () => {
  // @spec PARTY-DATA-003
  it('builds a character with everything its file said', () => {
    const bram = buildPlayer('bram.json', playerFile);

    expect(bram).toMatchObject({
      id: 'bram', name: 'Bram', characterClass: CharacterClass.FIGHTER, condition: Condition.OK,
    });
    expect(bram.attributes[Attribute.DEXTERITY]).toBe(13);
    expect(bram.attack).toMatchObject({ baseDamage: 9 });
  });

  // @spec PARTY-DATA-003
  // @spec ENEMY-ROSTER-009
  it('builds an enemy as a character without a class', () => {
    const goblin = buildEnemy('goblin.json', goblinFile);

    expect(goblin.characterClass).toBeUndefined();
    expect(goblin.role).toBe(EnemyRole.MELEE);
    expect(goblin.hitPoints).toBe(9);
    expect(totalLevel(goblin)).toBe(3);
  });

  // @spec PARTY-DATA-006
  it('fills in what a file left out', () => {
    const plain = buildEnemy('plain.json', { id: 'x', name: 'X', maxHitPoints: 5 });

    expect(Object.keys(plain.attributes)).toHaveLength(5);
    expect(plain.attributes[Attribute.MIGHT]).toBe(10);
    expect(plain.attack).toBeNull();
    expect(plain.armour).toBe(0);

    // A character's omitted ranks are the ones their class grants.
    const bare = buildPlayer('bare.json', { id: 'y', name: 'Y', characterClass: 'MAGE', maxHitPoints: 18 });
    expect(bare.ranks[Skill.EVOCATION]).toBeGreaterThan(0);
  });

  // @spec PARTY-DATA-005
  it('refuses a file missing what every combatant needs', () => {
    expect(() => buildEnemy('nameless.json', { id: 'x', maxHitPoints: 4 })).toThrow(/nameless\.json: no name/);
    expect(() => buildEnemy('frail.json', { id: 'x', name: 'X' })).toThrow(/no maxHitPoints/);
  });

  // @spec PARTY-DATA-004
  it('refuses a value it does not recognise, and says which', () => {
    expect(() => buildPlayer('typo.json', { ...playerFile, characterClass: 'FIGTHER' }))
      .toThrow(/typo\.json: class "FIGTHER"/);
    expect(() => buildEnemy('ranks.json', { ...goblinFile, ranks: { BLDAE: 2 } }))
      .toThrow(/ranks\.json: skill "BLDAE"/);
    expect(() => buildEnemy('role.json', { ...goblinFile, role: 'SNEAKY' }))
      .toThrow(/role\.json: role "SNEAKY"/);
    expect(() => buildEnemy('eyes.json', { ...goblinFile, attributes: { PERCEPTION: 12 } }))
      .toThrow(/eyes\.json: attribute "PERCEPTION"/);
  });
});

describe('the loot an enemy carries', () => {
  // @spec ENEMY-ROSTER-012
  it('reads the table an enemy drops from, or none', () => {
    expect(buildEnemy('goblin.json', goblinFile).loot).toBeNull();
    expect(buildEnemy('goblin.json', { ...goblinFile, loot: 'goblin' }).loot).toBe('goblin');
  });

  // @spec LOOT-DATA-002
  it('rejects an enemy naming a table nobody authored', () => {
    expect(() => buildEnemy('goblin.json', { ...goblinFile, loot: 'hoard' }))
      .toThrow(/goblin\.json: loot table "hoard"/);
  });

  // @spec ENEMY-ROSTER-012
  it('gives the goblin the goblin table, and the archer and the mage tables of their own', () => {
    const roster = enemyDefinitions();
    expect(roster.GOBLIN.loot).toBe('goblin');
    // @spec LOOT-DATA-006
    expect(roster.GOBLIN_ARCHER.loot).toBe('goblin_archer');
    // @spec LOOT-DATA-004
    expect(roster.GOBLIN_MAGE.loot).toBe('goblin_mage');
  });
});

describe('the authored roster', () => {
  // @spec PARTY-DATA-001
  // @spec PARTY-DATA-002
  it('reads the party from its own files, in the order they were authored in', () => {
    const party = startingCharacters();

    expect(party.map((c) => c.id)).toEqual(['bram', 'tam', 'isolde', 'wren']);
    for (const c of party) {
      expect(c.condition).toBe(Condition.OK);
      expect(c.attack).not.toBeNull();
      expect(totalLevel(c)).toBeGreaterThan(0);
    }
  });

  // @spec PARTY-DATA-001
  // @spec ENEMY-ROSTER-005
  it('reads every enemy from its own file', () => {
    const enemies = enemyDefinitions();

    expect(Object.keys(enemies).sort()).toEqual(['GOBLIN', 'GOBLIN_ARCHER', 'GOBLIN_MAGE']);
    expect(enemies.GOBLIN_MAGE.role).toBe(EnemyRole.CASTER);
  });
});
