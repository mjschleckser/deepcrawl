/**
 * Watching for a newer build.
 *
 * An installed app left open, or resumed from the background, goes on running the build
 * it loaded and never learns that another exists. This registers the service worker
 * itself, asks it to look for a newer build on a schedule, and reports when one has been
 * installed in place of the running one.
 *
 * The worker skips waiting and claims open pages, so a new build that finishes
 * installing takes control of this page at once, firing `controllerchange`. From then
 * on its cache is what a refresh loads, which is why that moment, and not a newer build
 * merely existing on the server, is when one is reported.
 *
 * Nothing here reloads the page. Whether and when to refresh is the player's call.
 */

/** How often a running game asks whether there is a newer build. */
export const UPDATE_CHECK_INTERVAL_MS = 5 * 60 * 1000;

/**
 * @param {object} options
 * @param {ServiceWorkerContainer | undefined} options.container `navigator.serviceWorker`
 * @param {Document} options.document for noticing the page come back to the foreground
 * @param {() => void} options.onAvailable called when a newer build is installed
 * @param {string} [options.url] the worker's script
 * @param {string} [options.scope]
 *
 * @spec PRESENT-BUILD-007
 * @spec PRESENT-BUILD-008
 * @spec PRESENT-BUILD-009
 * @spec PRESENT-BUILD-010
 */
export function watchForUpdates({ container, document, onAvailable, url = 'sw.js', scope = './' }) {
  if (!container) return;

  // A page with no worker before is not on an old build. Its first worker taking
  // control is an install, not an update, so only a change after that is news.
  let controlled = Boolean(container.controller);
  container.addEventListener('controllerchange', () => {
    if (controlled) onAvailable();
    controlled = true;
  });

  // Registering checks once already, as the page loads; these are the checks after.
  container.register(url, { scope }).then((registration) => {
    // Offline, or the server not answering, is no news, and the next check tries again.
    const check = () => registration.update().catch(() => {});
    setInterval(check, UPDATE_CHECK_INTERVAL_MS);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') check();
    });
  }).catch(() => {});
}
