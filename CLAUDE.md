# CLAUDE.md

## Overview

Deepcrawl is a 2D dungeon-crawling RPG, built as a progressive web app.

- **Stack:** Vite + PixiJS + vite-plugin-pwa
- **Live app:** https://mjschleckser.github.io/deepcrawl/
- **Deploy:** every push to `main` triggers `.github/workflows/deploy.yml`, which builds and publishes to GitHub Pages automatically (usually live within about a minute)
- **Status:** early scaffold — a placeholder scene proves the render/input pipeline works; no real game systems yet

## Repo structure

_To be filled in as the project grows. Current layout:_

```
src/
  main.js            # Pixi app bootstrap
  scenes/
    placeholder.js    # temporary proof-of-concept scene, to be replaced
  style.css
public/               # static assets, PWA icons
.github/workflows/    # CI/deploy
```

## Programming conventions

_To be filled in as conventions get established. Nothing formal yet beyond
what the Vite/PixiJS defaults imply._

## Development process: Linked-Intent Development (required)

**All future changes to this repo must follow Linked-Intent Development (LID).**
This is a hard requirement, not a suggestion. See https://linked-intent.dev.

LID keeps a design linked all the way down to code, so intent never drifts
from what's actually built:

```
HLD (why) → LLD (how) → EARS specs (one-line, ID'd claims) → failing-first tests → code
```

- The **HLD** states the project's vision and problem/approach at a high level.
- **LLDs** describe how each component/subsystem works.
- **EARS specs** are one-line, greppable requirement IDs (e.g. `DUNGEON-GEN-001`)
  derived from the design.
- **Tests** are written failing-first, each asserting one spec ID.
- **Code** carries `@spec` annotations citing the spec ID(s) it implements.

This means `grep -r SOME-SPEC-ID` should surface the spec text, its tests, and
the code implementing it, in one pass.

**Practically, for this repo:**

- New features and non-trivial changes start as a design edit (HLD or LLD)
  under `docs/intent/`, not as code.
- Specs, tests, and code cascade from that design edit — review happens at
  the design level first.
- In Claude Code, use the LID plugins to drive this:
  ```
  /plugin marketplace add jszmajda/lid
  /plugin install linked-intent-dev@jszmajda-lid
  /plugin install arrow-maintenance@jszmajda-lid
  /linked-intent-dev
  ```
  The `/linked-intent-dev` skill scaffolds the `docs/intent/` tree and walks
  through design → specs → tests before writing code.
- Other agentic tools (Cursor, Windsurf, Copilot, Aider, etc.) should follow
  the same workflow via their respective LID rule-file adapters — see
  https://linked-intent.dev for setup per tool.
- Small hotfixes may skip the workflow to ship urgently, but must be walked
  back through the design afterward so specs/tests/code catch up. This is
  LID's own stated allowance, not a general exception.
