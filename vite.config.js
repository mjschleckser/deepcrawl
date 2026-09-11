import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

// Base path matches the GitHub Pages project URL: https://<user>.github.io/deepcrawl/
export default defineConfig({
  base: '/deepcrawl/',
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
