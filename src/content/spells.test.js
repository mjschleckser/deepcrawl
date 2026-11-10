import { describe, it, expect } from 'vitest';
import { buildSpell, spellDefinitions } from './spells.js';
import { Skill } from '../sim/party.js';
import { CastWhere, Learned, SpellTarget } from '../sim/magic.js';

const missileFile = {
  id: 'magic_missile', name: 'Magic Missile', school: 'EVOCATION', rank: 1,
  target: 'ENEMY', effect: { damage: 6, ignoresArmour: true }, where: ['COMBAT'], learned: 'CLASS',
};

describe('reading an authored spell', () => {
  // @spec MAGIC-SPELL-002
  it('reads every spell from a file of its own', () => {
    expect(Object.keys(spellDefinitions()).sort()).toEqual(['fire_bolt', 'heal', 'magic_missile']);
  });

  // @spec MAGIC-SPELL-003
  it('refuses a value it does not recognise, and says which', () => {
    expect(() => buildSpell('a.json', { ...missileFile, school: 'PYROMANCY' })).toThrow(/a\.json: school "PYROMANCY"/);
    // Who may cast it is the class's to say, by school; a spell names no classes.
    expect(buildSpell('b.json', missileFile).classes).toBeUndefined();
    expect(() => buildSpell('c.json', { ...missileFile, target: 'SELF' })).toThrow(/c\.json: target "SELF"/);
    expect(() => buildSpell('d.json', { ...missileFile, where: ['TOWN'] })).toThrow(/d\.json: where "TOWN"/);
    expect(() => buildSpell('e.json', { ...missileFile, learned: 'SCROLL' })).toThrow(/e\.json: learned "SCROLL"/);
    expect(() => buildSpell('f.json', { ...missileFile, effect: { freeze: 3 } })).toThrow(/f\.json: effect "freeze"/);
    expect(() => buildSpell('g.json', { ...missileFile, effect: { damage: 0 } })).toThrow(/g\.json: damage 0/);
  });
});

describe('the authored spells', () => {
  const spells = spellDefinitions();

  // @spec MAGIC-SPELL-004
  it('holds Magic Missile: Evocation, rank 1, mages, an enemy, ignoring armour, fights only', () => {
    expect(spells.magic_missile).toMatchObject({
      school: Skill.EVOCATION, rank: 1, target: SpellTarget.ENEMY,
      where: [CastWhere.COMBAT], learned: Learned.CLASS,
    });
    expect(spells.magic_missile.effect).toMatchObject({ damage: 6, ignoresArmour: true });
  });

  // @spec MAGIC-SPELL-005
  it('holds Heal: Healing, rank 1, clerics, an ally, in a fight or exploring', () => {
    expect(spells.heal).toMatchObject({
      school: Skill.HEALING, rank: 1, target: SpellTarget.ALLY,
      learned: Learned.CLASS,
    });
    expect(spells.heal.where.sort()).toEqual([CastWhere.COMBAT, CastWhere.EXPLORATION]);
    expect(spells.heal.effect).toMatchObject({ heal: 8 });
  });

  // @spec MAGIC-SPELL-007
  it('holds Fire Bolt: Evocation, rank 1, mages, by tome, an enemy, blunted by armour, fights only', () => {
    expect(spells.fire_bolt).toMatchObject({
      school: Skill.EVOCATION, rank: 1, target: SpellTarget.ENEMY,
      where: [CastWhere.COMBAT], learned: Learned.TOME,
    });
    expect(spells.fire_bolt.effect).toMatchObject({ damage: 10, ignoresArmour: false });
  });
});
