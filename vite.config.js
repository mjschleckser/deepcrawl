import { execSync } from 'node:child_process';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import { formatVersion } from './src/version.js';

/** Git, when there is a checkout to ask. A tarball build still produces a version. */
const git = (command, fallback) => {
  try {
    return execSync(command, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch {
    return fallback;
  }
};

/**
 * Stamped into the build so the running game can say which build it is.
 *
 * @spec PRESENT-BUILD-003
 * @spec PRESENT-BUILD-004
 */
const APP_VERSION = formatVersion({ commits: git('git rev-list --count HEAD', '0') });

// Base path matches the GitHub Pages project URL: https://<user>.github.io/deepcrawl/
export default defineConfig({
  base: '/deepcrawl/',
  define: { __APP_VERSION__: JSON.stringify(APP_VERSION) },
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      // The app registers the worker itself (src/content/updates.js), so that it can keep
      // asking for newer builds and say when one is installed.
      injectRegister: false,
      // A new build takes over open pages as soon as it is installed. That handover is
      // what src/content/updates.js reports, and what makes a refresh load the new build.
      workbox: { skipWaiting: true, clientsClaim: true },
      manifest: {
        name: 'Deepcrawl',
        short_name: 'Deepcrawl',
        description: 'A 2D dungeon-crawling RPG.',
        theme_color: '#1a1410',
        background_color: '#1a1410',
        display: 'standalone',
        start_url: '/deepcrawl/',
        scope: '/deepcrawl/',
        icons: [
          {
            src: 'pwa-192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: 'pwa-512.png',
            sizes: '512x512',
            type: 'image/png',
          },
        ],
      },
    }),
  ],
});
