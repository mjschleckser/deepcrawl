/**
 * Light for the exploration segment.
 *
 * Light is a contract, not a torch. A torch is the only implementation the game ships
 * today, but nothing here names one: spells with a duration, refuelable lanterns, and
 * light carried by something other than the party are all the same shape.
 */

import { LightLevel } from './floor.js';

/** Darkest to brightest, so comparisons are index comparisons. */
const RANK = [LightLevel.DARK, LightLevel.DIM, LightLevel.BRIGHT];

/** @spec EXPLORE-LIGHT-002 */
export function brighter(a, b) {
  return RANK.indexOf(a) >= RANK.indexOf(b) ? a : b;
}

/**
 * Build a light source.
 *
 * A bright radius must be smaller than the dim radius: the dim ring is what lies
 * *beyond* the bright one, so a source with no dim margin has no falloff to give.
 *
 * @spec EXPLORE-LIGHT-004
 * @spec EXPLORE-LIGHT-005
 */
export function createLightSource({
  id,
  brightRadius,
  dimRadius,
  remainingTicks = null,
  lit = false,
}) {
  if (!(brightRadius < dimRadius)) {
    throw new Error(
      `light source ${id}: brightRadius (${brightRadius}) must be smaller than dimRadius (${dimRadius})`,
    );
  }
  return { id, brightRadius, dimRadius, remainingTicks, lit, spent: false };
}

/**
 * What a source projects onto a tile the given distance away.
 *
 * @spec EXPLORE-LIGHT-003
 */
export function projectedLevel(distance, source) {
  if (!source || !source.lit) return LightLevel.DARK;
  if (distance <= source.brightRadius) return LightLevel.BRIGHT;
  if (distance <= source.dimRadius) return LightLevel.DIM;
  return LightLevel.DARK;
}

/**
 * Chebyshev distance: light pools square on a grid where a diagonal step is no
 * further than an orthogonal one.
 */
export function tileDistance(a, b) {
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
}

/**
 * An enemy is only picked out in bright light. In dim light it is indistinguishable
 * from shadow, which is what makes a guttering torch frightening rather than merely
 * inconvenient.
 *
 * @spec EXPLORE-SIGHT-006
 */
export function enemiesVisibleAt(level) {
  return level === LightLevel.BRIGHT;
}

/**
 * How light gates the search for traps and secret doors. The size of the penalty is
 * content data; its shape is not.
 *
 * @spec EXPLORE-SIGHT-007
 */
export function detectionAt(level) {
  if (level === LightLevel.DARK) return { canDetect: false, penalised: false };
  return { canDetect: true, penalised: level === LightLevel.DIM };
}
