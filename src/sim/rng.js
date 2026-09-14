/**
 * Seeded randomness.
 *
 * The simulation is a deterministic state machine, so nothing in it may reach for a
 * global random source. A generator is created from a seed, passed explicitly to
 * whatever needs it, and produces the same stream every time.
 *
 * @spec GEN-SEED-002
 */

/** mulberry32: small, fast, and good enough for laying out a dungeon. */
export function makeRng(seed) {
  let state = seed >>> 0;

  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  return {
    next,
    /** Inclusive on both ends, which is how ranges read in an archetype. */
    int: (min, max) => min + Math.floor(next() * (max - min + 1)),
    chance: (probability) => next() < probability,
    pick: (items) => items[Math.floor(next() * items.length)],
    /** Fisher-Yates, returning a new array and leaving the input alone. */
    shuffle: (items) => {
      const out = [...items];
      for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        [out[i], out[j]] = [out[j], out[i]];
      }
      return out;
    },
  };
}

/**
 * A child generator seeded from one draw of its parent.
 *
 * A step that draws a number of values depending on the data it is working on takes
 * one of these, so however much it consumes, everything after it in the parent stream
 * is unaffected.
 *
 * @spec GEN-SEED-003
 */
export function deriveRng(rng) {
  return makeRng(Math.floor(rng.next() * 0xffffffff));
}
