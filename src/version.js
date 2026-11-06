/**
 * The version of the build being played.
 *
 * A player reporting that a fix did not work and a player looking at a cached copy of
 * an older build write the same sentence. The version on the screen is what tells the
 * two apart, so it is composed here and fixed at build time — never worked out while
 * the game is running.
 */

/**
 * `Build 64`, the number being the commit count. Every commit therefore ships a higher
 * number without anyone raising it by hand. With no count there is no number to claim,
 * and the stand-in shows instead.
 *
 * @spec PRESENT-BUILD-004
 */
export function formatVersion({ commits = 0 } = {}) {
  const count = Math.floor(Number(commits));
  return count > 0 ? `Build ${count}` : '';
}

/**
 * What the build stamped in, or a stand-in when nothing did. A build with no version is
 * itself worth seeing: an empty corner reads as an old build rather than a
 * misconfigured one.
 *
 * @spec PRESENT-BUILD-005
 */
export function resolveVersion(stamped) {
  return typeof stamped === 'string' && stamped ? stamped : 'dev';
}

/** @spec PRESENT-BUILD-003 */
export const APP_VERSION = resolveVersion(
  typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : null,
);
