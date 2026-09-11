# Deepcrawl

A 2D dungeon-crawling RPG, built as a progressive web app.

**Stack:** [Vite](https://vite.dev) + [PixiJS](https://pixijs.com) + [vite-plugin-pwa](https://vite-pwa-org.netlify.app)

## Local development

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
npm run preview
```

## Live version

Every push to `main` triggers a GitHub Actions workflow that builds the project
and deploys it to GitHub Pages:

**https://mjschleckser.github.io/deepcrawl/**

Refresh that URL after a push lands to see the latest changes (usually live within
about a minute).

## Status

Early scaffold. Current scene (`src/scenes/placeholder.js`) is just a proof of
concept: a static grid map with a movable marker, confirming the render and
input pipeline work end to end. Design docs and real game architecture coming next.
