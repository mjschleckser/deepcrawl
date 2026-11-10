/**
 * Reading the authored classes.
 *
 * Each class is one file under `src/game-data/classes`, and that file is the whole of
 * the class: its body, its own skill, the ranks it opens with, what it may hold, and
 * what it casts with what. Nothing in code holds a class's numbers; this module reads
 * the files, checks them against the game's vocabularies, and hands them to the
 * simulation once, when it is first loaded, so every character made afterwards is made
 * from them.
 */

import {
  Attribute, CharacterClass, CLASS_SKILLS, RANK_CAP, Skill, useClasses,
} from '../sim/party.js';
import { ItemCategory } from '../sim/items.js';

const CLASS_FILES = import.meta.glob('../game-data/classes/*.json', { eager: true, import: 'default' });

/** The skills a class may cast spells from. */
const SCHOOLS = [Skill.EVOCATION, Skill.ALTERATION, Skill.HEALING, Skill.RESTORATION];

const FIELDS = ['id', 'name', 'hitPoints', 'classSkill', 'startingRanks', 'wields', 'schools', 'castsWith'];

/**
 * A value that must be one of a known set, or the file is wrong and says which value.
 *
 * @spec PARTY-CLASS-006
 */
function oneOf(file, field, value, allowed) {
  const values = Array.isArray(allowed) ? allowed : Object.values(allowed);
  if (!values.includes(value)) {
    throw new Error(`${file}: ${field} "${value}" is not one of ${values.join(', ')}`);
  }
  return value;
}

function list(file, field, value) {
  if (!Array.isArray(value)) throw new Error(`${file}: ${field} is not a list`);
  return value;
}

/**
 * One class, read whole from its file.
 *
 * @spec PARTY-CLASS-001
 * @spec PARTY-CLASS-006
 * @spec PARTY-CLASS-007
 * @spec PARTY-SKILL-002
 */
export function buildClass(file, data) {
  for (const field of FIELDS) {
    if (data?.[field] === undefined) throw new Error(`${file}: no ${field}`);
  }
  if (!Number.isInteger(data.hitPoints) || data.hitPoints < 1) {
    throw new Error(`${file}: hitPoints ${data.hitPoints} is not a whole number of at least 1`);
  }
  const classSkill = oneOf(file, 'classSkill', data.classSkill, CLASS_SKILLS);

  const startingRanks = {};
  for (const [skill, rank] of Object.entries(data.startingRanks)) {
    oneOf(file, 'skill', skill, Skill);
    if (CLASS_SKILLS.includes(skill) && skill !== classSkill) {
      throw new Error(`${file}: starting rank in ${skill}, another class's skill`);
    }
    if (!Number.isInteger(rank) || rank < 1 || rank > RANK_CAP) {
      throw new Error(`${file}: ${skill} ${rank} is not a rank from 1 to ${RANK_CAP}`);
    }
    startingRanks[skill] = rank;
  }
  if (!startingRanks[classSkill]) throw new Error(`${file}: starting ranks leave out its class skill ${classSkill}`);

  return {
    id: oneOf(file, 'id', data.id, CharacterClass),
    name: data.name,
    hitPoints: data.hitPoints,
    classSkill,
    startingRanks,
    wields: list(file, 'wields', data.wields).map((c) => oneOf(file, 'category', c, ItemCategory)),
    schools: list(file, 'schools', data.schools).map((s) => oneOf(file, 'school', s, SCHOOLS)),
    castsWith: data.castsWith === null ? null : oneOf(file, 'castsWith', data.castsWith, Attribute),
  };
}

/**
 * The classes taken together: no two may share a class skill, since each is the one
 * thing a class has that no other ever can.
 *
 * @spec PARTY-CLASS-007
 */
export function checkClasses(classes) {
  const owner = {};
  for (const k of classes) {
    if (owner[k.classSkill]) {
      throw new Error(`${owner[k.classSkill]} and ${k.id} both name ${k.classSkill} as their class skill`);
    }
    owner[k.classSkill] = k.id;
  }
  return classes;
}

let catalogue = null;

/**
 * Every class, by identifier.
 *
 * @spec PARTY-CLASS-001
 * @spec PARTY-CLASS-005
 */
export function classDefinitions() {
  if (!catalogue) {
    const built = Object.keys(CLASS_FILES).sort().map((file) => buildClass(file, CLASS_FILES[file]));
    catalogue = Object.fromEntries(checkClasses(built).map((k) => [k.id, k]));
  }
  return catalogue;
}

// Handed to the simulation as soon as anything loads this module, so no character is
// ever made before its class is known.
useClasses(classDefinitions());
