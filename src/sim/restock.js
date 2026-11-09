/**
 * Re-stocking: what a return to a floor changes, decided by numbers drawn in a fixed
 * order and compared with a strength that rises with the absence.
 *
 * Every change draws its number whatever the strength, so the same floor and count give
 * the same numbers, and a larger strength makes every change a smaller one would.
 * Simulation core — no renderer, no DOM.
 */

import { EdgeKind } from './floor.js';
import { makeRng } from './rng.js';

/** Ticks away at which a re-stocking is complete. */
export const RESTOCK_FULL_TICKS = 1000;

/** @spec EXPLORE-RETURN-004 */
export function restockStrength(elapsed) {
  return Math.min(1, Math.max(0, elapsed) / RESTOCK_FULL_TICKS);
}

/**
 * The generator a floor's re-stocking draws from: its own seed and how many times it
 * has been re-stocked before.
 *
 * @spec EXPLORE-RETURN-011
 * @spec GEN-STOCK-002
 */
export function restockRng(seed, count) {
  return makeRng((((seed ?? 1) ^ 0x2c1b3c6d) + Math.imul(count + 1, 0x9e3779b9)) >>> 0);
}

/**
 * Close the doors the party left open, each at half the strength. Horizontal edges
 * first, then vertical, each in index order.
 *
 * @spec EXPLORE-RETURN-004
 * @spec EXPLORE-RETURN-008
 */
export function closeDoors(floor, strength, rng) {
  for (const edges of [floor.horizontalEdges, floor.verticalEdges]) {
    for (const edge of edges) {
      if (edge.kind !== EdgeKind.DOOR && edge.kind !== EdgeKind.LOCKED_DOOR) continue;
      if (!edge.open) continue;
      if (rng.chance(strength / 2)) edge.open = false;
    }
  }
}

/**
 * Which standing warbands move, and how many missing ones return. One number for each
 * standing warband in order, then one for each the floor is short of.
 *
 * @spec GEN-STOCK-003
 * @spec GEN-STOCK-004
 */
export function planWarbands({ standing, stocked, strength, rng }) {
  const move = standing.filter(() => rng.chance(strength));
  const missing = Math.max(0, stocked - standing.length);
  let returning = 0;
  for (let i = 0; i < missing; i++) if (rng.chance(strength)) returning++;
  return { move, returning };
}
