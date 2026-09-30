/**
 * Reading the authored combatants.
 *
 * Every player and every enemy is a file of its own under `src/game-data`, which is
 * content rather than code: a goblin is edited without opening a module, and adding
 * one is adding a file. This module is the only place that knows the files exist.
 *
 * JSON cannot name an enum, so everything arrives as a string and is checked here
 * against the real ones. A misspelled skill in a hand-edited file should say so by
 * name rather than quietly producing a character missing a rank.
 */

import {
  Attribute, CharacterClass, Condition, Skill, createCharacter,
} from '../sim/party.js';
import { Action, EnemyRole, createEnemy } from '../sim/combat.js';

const PLAYER_FILES = import.meta.glob('../game-data/players/*.json', { eager: true, import: 'default' });
const ENEMY_FILES = import.meta.glob('../game-data/enemies/*.json', { eager: true, import: 'default' });
const PORTRAITS = import.meta.glob('../game-data/portraits/*.png', {
  eager: true, query: '?url', import: 'default',
});

/**
 * The image a combatant is drawn with, by the file name their own file names. A
 * portrait nobody authored is simply absent; the fight draws without one.
 *
 * @spec PRESENT-FIGHT-023
 * @spec PRESENT-FIGHT-024
 */
function portraitUrl(name) {
  if (!name) return null;
  const found = Object.entries(PORTRAITS).find(([path]) => path.endsWith(`/${name}`));
  return found ? found[1] : null;
}

/**
 * A value that must be one of a known set, or the file is wrong and says which value.
 *
 * @spec PARTY-DATA-004
 */
function oneOf(file, field, value, allowed) {
  if (!Object.prototype.hasOwnProperty.call(allowed, value)) {
    throw new Error(`${file}: ${field} "${value}" is not one of ${Object.keys(allowed).join(', ')}`);
  }
  return value;
}

function keysOf(file, field, table, allowed) {
  const checked = {};
  for (const [key, value] of Object.entries(table ?? {})) {
    checked[oneOf(file, field, key, allowed)] = value;
  }
  return checked;
}

/**
 * The fields every combatant carries, whichever side authored it.
 *
 * @spec PARTY-DATA-005
 * @spec PARTY-DATA-006
 */
function commonFields(file, data) {
  // Hit points are not among these: a classed character derives them from its class
  // and its Constitution, and only something authored whole has to state them.
  // @spec PARTY-DATA-005
  for (const required of ['id', 'name']) {
    if (data?.[required] === undefined) throw new Error(`${file}: no ${required}`);
  }
  return {
    id: data.id,
    name: data.name,
    // Omitted attributes are the default score; omitted ranks are whatever the
    // creation gives them.
    attributes: keysOf(file, 'attribute', data.attributes, Attribute),
    ranks: keysOf(file, 'skill', data.ranks, Skill),
    maxHitPoints: data.maxHitPoints,
    attack: data.attack ? { ...data.attack, skill: oneOf(file, 'skill', data.attack.skill, Skill) } : null,
    armour: data.armour ?? 0,
    portrait: portraitUrl(data.portrait),
  };
}

/**
 * An authored character, built through the same creation as any other.
 *
 * @spec PARTY-DATA-003
 */
export function buildPlayer(file, data) {
  const common = commonFields(file, data);
  return createCharacter({
    ...common,
    characterClass: oneOf(file, 'class', data.characterClass, CharacterClass),
  });
}

/**
 * An authored enemy: a character in every field but a class, which it has none of.
 *
 * @spec PARTY-DATA-003
 * @spec ENEMY-ROSTER-009
 */
export function buildEnemy(file, data) {
  // An enemy holds no class to derive a body from, so its file must say.
  // @spec PARTY-DATA-005
  if (data?.maxHitPoints === undefined) throw new Error(`${file}: no maxHitPoints`);

  return createEnemy({
    ...commonFields(file, data),
    role: oneOf(file, 'role', data.role ?? EnemyRole.MELEE, EnemyRole),
    potValue: data.potValue ?? 10,
    forbidsEscape: data.forbidsEscape ?? false,
  });
}

function read(files, build) {
  const built = {};
  for (const [file, data] of Object.entries(files)) {
    const one = build(file, data);
    built[one.id] = one;
  }
  return built;
}

/**
 * Every authored enemy, by id. Definitions rather than combatants: a band copies one
 * for each member it assembles, so two goblins are two goblins.
 *
 * @spec PARTY-DATA-001
 * @spec PARTY-DATA-002
 * @spec ENEMY-ROSTER-005
 */
export function enemyDefinitions() {
  return read(ENEMY_FILES, buildEnemy);
}

/**
 * The party a campaign starts with, in the order their files sort in.
 *
 * @spec PARTY-DATA-001
 * @spec PARTY-DATA-002
 */
export function startingCharacters() {
  // Ordered by the files themselves rather than by how they sort on disk: a party has
  // an order its author meant, and renaming a file should not change it.
  return Object.entries(PLAYER_FILES)
    .map(([file, data]) => ({ at: data.order ?? 0, character: buildPlayer(file, data) }))
    .sort((a, b) => a.at - b.at)
    .map(({ character }) => ({ ...character, condition: Condition.OK }));
}
