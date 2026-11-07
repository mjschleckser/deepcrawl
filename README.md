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

A party of four can be walked through generated floors and fought with. The dungeon is
drawn first-person from the party's own tile and facing, with an automap filling in as
you go; move with WASD or the arrow keys, or by tapping the screen. `M` expands the map,
`P` opens the party screen, `I` the Items screen, and `E` uses a staircase underfoot.

Fights are turn-based, with skills that advance by use, and the campaign saves itself in
the browser. Equipment changes hands on the Items screen (`I`), in a fight or out of one, through a
pack the whole party shares. Loot, consumables, spells, traps, camp, hunger and the town
are still to come.
Design lives under `docs/`, following
[Linked-Intent Development](https://linked-intent.dev).
