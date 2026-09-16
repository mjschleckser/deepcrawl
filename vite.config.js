import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
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

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));

/**
 * Stamped into the build so the running game can say which build it is.
 *
 * @spec PRESENT-BUILD-003
 * @spec PRESENT-BUILD-004
 */
const APP_VERSION = formatVersion({
  version: pkg.version,
  commits: Number(git('git rev-list --count HEAD', '0')),
  sha: git('git rev-parse --short HEAD', ''),
});

// Base path matches the GitHub Pages project URL: https://<user>.github.io/deepcrawl/
export default defineConfig({
  base: '/deepcrawl/',
  define: { __APP_VERSION__: JSON.stringify(APP_VERSION) },
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
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
