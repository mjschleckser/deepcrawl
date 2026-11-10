/**
 * Reading the authored spells.
 *
 * Every spell is a file of its own under `src/game-data/spells`, read the way an item is:
 * everything arrives as a string and is checked here against the game's own vocabularies,
 * so a misspelled school says so by name rather than producing a spell nobody can cast.
 */

import { Skill } from '../sim/party.js';
import {
  CastWhere, Learned, SpellEffect, SpellTarget, createSpell,
} from '../sim/magic.js';

const SPELL_FILES = import.meta.glob('../game-data/spells/*.json', { eager: true, import: 'default' });

/** The skills a spell may belong to. */
const SCHOOLS = {
  [Skill.EVOCATION]: Skill.EVOCATION,
  [Skill.ALTERATION]: Skill.ALTERATION,
  [Skill.HEALING]: Skill.HEALING,
  [Skill.RESTORATION]: Skill.RESTORATION,
};

function oneOf(file, field, value, allowed) {
  if (!Object.prototype.hasOwnProperty.call(allowed, value)) {
    throw new Error(`${file}: ${field} "${value}" is not one of ${Object.keys(allowed).join(', ')}`);
  }
  return value;
}

/** The one effect a spell has, with a positive whole number behind it. */
function readEffect(file, effect) {
  if (!effect || typeof effect !== 'object') throw new Error(`${file}: no effect`);
  const named = Object.keys(effect).filter((key) => key !== 'ignoresArmour');
  const known = Object.values(SpellEffect);
  for (const name of named) {
    if (!known.includes(name)) throw new Error(`${file}: effect "${name}" is not one of ${known.join(', ')}`);
  }
  if (named.length !== 1) throw new Error(`${file}: a spell has exactly one effect`);
  const amount = effect[named[0]];
  if (!Number.isInteger(amount) || amount < 1) throw new Error(`${file}: ${named[0]} ${amount} is not a whole number of at least 1`);
  return { ...effect, ignoresArmour: Boolean(effect.ignoresArmour) };
}

/**
 * @spec MAGIC-SPELL-002
 * @spec MAGIC-SPELL-003
 */
export function buildSpell(file, data) {
  for (const required of ['id', 'name', 'school', 'target', 'effect', 'where']) {
    if (data?.[required] === undefined) throw new Error(`${file}: no ${required}`);
  }
  const rank = data.rank ?? 1;
  if (!Number.isInteger(rank) || rank < 1) throw new Error(`${file}: rank ${rank} is not a whole number of at least 1`);
  return createSpell({
    id: data.id,
    name: data.name,
    school: oneOf(file, 'school', data.school, SCHOOLS),
    rank,
    target: oneOf(file, 'target', data.target, SpellTarget),
    effect: readEffect(file, data.effect),
    where: data.where.map((place) => oneOf(file, 'where', place, CastWhere)),
    learned: data.learned === undefined ? Learned.CLASS : oneOf(file, 'learned', data.learned, Learned),
  });
}

let catalogue = null;

/**
 * Every spell, by identifier, in the order the files sort.
 *
 * @spec MAGIC-SPELL-002
 */
export function spellDefinitions() {
  if (!catalogue) {
    catalogue = {};
    for (const file of Object.keys(SPELL_FILES).sort()) {
      const spell = buildSpell(file, SPELL_FILES[file]);
      catalogue[spell.id] = spell;
    }
  }
  return catalogue;
}
