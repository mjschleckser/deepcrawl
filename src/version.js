/**
 * The version of the build being played.
 *
 * A player reporting that a fix did not work and a player looking at a cached copy of
 * an older build write the same sentence. The version on the screen is what tells the
 * two apart, so it is composed here and fixed at build time — never worked out while
 * the game is running.
 */

/**
 * `MAJOR.MINOR.PATCH+SHA`, with the commit count as the patch. Every commit therefore
 * ships a version that is new and correctly ordered without anyone raising a number by
 * hand.
 *
 * @spec PRESENT-BUILD-004
 */
export function formatVersion({ version = '0.0.0', commits = 0, sha = '' } = {}) {
  const [major = '0', minor = '0'] = String(version).split('.');
  const count = Number(commits);
  const patch = Number.isFinite(count) && count > 0 ? Math.floor(count) : 0;
  const core = `${major}.${minor}.${patch}`;
  return sha ? `${core}+${sha}` : core;
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
