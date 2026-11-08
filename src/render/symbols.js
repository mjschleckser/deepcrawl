/**
 * The weapon symbols, as shapes on a unit square with the origin at the top left. Drawn
 * in code rather than taken from a font, because a glyph for a sword reads differently
 * from one phone to the next and may not exist at all in a monospace face.
 *
 * Pure data, so the set can be tested without a renderer: the adapter only paints it.
 */

import { Skill } from '../sim/party.js';

const SYMBOLS = {
  // A tapering blade, its guard across the foot of it, and a grip below.
  [Skill.BLADE]: {
    lines: [[0.2, 0.52, 0.48, 0.8], [0.32, 0.68, 0.1, 0.9]],
    curves: [],
    circles: [],
    polygons: [[0.94, 0.06, 0.3, 0.56, 0.44, 0.7]],
  },
  // A haft, and the head that does the work.
  [Skill.BLUNT]: {
    lines: [[0.14, 0.86, 0.58, 0.42]],
    curves: [],
    circles: [[0.67, 0.33, 0.21]],
    polygons: [],
  },
  // A long shaft, and a point at the end of it.
  [Skill.POLEARM]: {
    lines: [[0.08, 0.92, 0.66, 0.34]],
    curves: [],
    circles: [],
    polygons: [[0.94, 0.06, 0.56, 0.26, 0.74, 0.44]],
  },
  // A bow side on, with an arrow nocked: a bow alone reads as a letter at this size.
  [Skill.BOW]: {
    lines: [[0.2, 0.06, 0.2, 0.94], [0.04, 0.5, 0.8, 0.5]],
    curves: [[0.2, 0.06, 0.92, 0.5, 0.2, 0.94]],
    circles: [],
    polygons: [[0.98, 0.5, 0.76, 0.38, 0.76, 0.62]],
  },
  // A spell school's mark, where a weapon's would sit beside a cast's number: a four-
  // pointed spark for what strikes, a cross for what mends.
  [Skill.EVOCATION]: {
    lines: [],
    curves: [],
    circles: [],
    polygons: [[0.5, 0.04, 0.6, 0.4, 0.96, 0.5, 0.6, 0.6, 0.5, 0.96, 0.4, 0.6, 0.04, 0.5, 0.4, 0.4]],
  },
  [Skill.HEALING]: {
    lines: [],
    curves: [],
    circles: [],
    polygons: [[0.38, 0.1, 0.62, 0.1, 0.62, 0.38, 0.9, 0.38, 0.9, 0.62, 0.62, 0.62, 0.62, 0.9, 0.38, 0.9, 0.38, 0.62, 0.1, 0.62, 0.1, 0.38, 0.38, 0.38]],
  },
};

/**
 * @spec PRESENT-MENU-018
 */
export function weaponSymbol(skill) {
  return SYMBOLS[skill] ?? SYMBOLS[Skill.BLADE];
}
