---
parent: high-level-design
prefix: PRESENT
---

# Presentation

## Context and Design Philosophy

Presentation draws simulation state and turns input into simulation actions. It holds
no game state of its own: every pixel on screen is a function of what the simulation
currently says, and the only way anything changes is that an action was performed.

Three principles shape the design.

**Two views, one truth.** The first-person view and the automap show the same party
standing on the same tile facing the same way. They are separate drawings of one
state, never two models that must be kept in step, so they cannot drift apart.

**Nothing is real-time, so nothing redraws on a clock.** The world advances only when
the player acts. A renderer looping at sixty frames a second would burn a phone
battery redrawing an unchanged corridor. Presentation redraws when an action changes
the state, and otherwise does nothing at all.

**The simulation cannot tell who is playing.** Keyboard and touch resolve to the same
action vocabulary before anything reaches the simulation. No code below this layer
ever branches on the input device.

## What This Segment Owns

The boundary with exploration is worth stating plainly, because it is the one most
likely to blur.

| | Owned by exploration | Owned by presentation |
|---|---|---|
| Automap | which tiles, edges, traps, and enemies may be shown | how they are drawn, where the widget sits, how it expands |
| First-person view | what stands ahead, to what depth, at what light | the perspective, the geometry, the colours |
| Input | the action vocabulary and both of its paths | reading the keyboard, hit-testing taps, drawing the controls |

Exploration answers *what may be seen*. Presentation answers *what it looks like*.
Anything that would survive a change of renderer belongs on the left.

## Scene Structure

One PixiJS application, three layers, drawn in order:

```
stage
├── viewLayer    the first-person corridor, filling the screen
├── mapLayer     the automap widget, a corner overlay, expandable
└── hudLayer     prompts and touch controls
```

Each layer is rebuilt from state by its own draw function. No layer keeps a retained
model of what it drew last; a redraw clears and re-emits. At the sizes involved — a
few dozen polygons for the corridor, a few hundred cells for a map — rebuilding is
cheaper to reason about than diffing, and it removes an entire class of bug where the
screen disagrees with the state because an update was missed.

## The First-Person View

The corridor is drawn as a series of **depth frames**: nested rectangles receding
toward a vanishing point at the centre of the screen. Frame 0 is the screen edge;
each subsequent frame is the previous one scaled toward the centre by a fixed ratio.
The band between two consecutive frames is where one tile's worth of wall, floor, and
ceiling is drawn.

```
┌─────────────────────────────┐  frame 0  — the tile the party stands on
│ ╔═════════════════════════╗ │
│ ║  ┌───────────────────┐  ║ │  frame 1
│ ║  │  ╔═════════════╗  │  ║ │  frame 2
│ ║  │  ║             ║  │  ║ │  frame 3 — a wall blocks here
│ ║  │  ║             ║  │  ║ │
│ ║  │  ╚═════════════╝  │  ║ │
│ ║  └───────────────────┘  ║ │
│ ╚═════════════════════════╝ │
└─────────────────────────────┘
```

For each depth the simulation reports, the view draws the floor and ceiling bands,
then a left wall panel where the tile is walled to the left, a right panel where it is
walled to the right, and — where the way ahead is blocked — a flat panel closing off
the corridor at that frame.

**Drawn far to near.** The deepest frame is emitted first, so nearer geometry paints
over it. Painting in this order removes the need for any depth test: a wall two tiles
away simply cannot obscure one that is adjacent.

**Light is drawn, not just obeyed.** Each depth is tinted by the light level the
simulation resolved for that tile: full colour at `bright`, muted at `dim`, and not
drawn at all at `dark`. The corridor therefore fades into blackness at the edge of the
party's torch, and a guttering torch is something the player watches happen rather
than reads in a status line.

Doors, stairs, and pits are drawn as panels and floor markings within the band for the
depth they occupy.

## The Automap

A corner widget over the first-person view, drawn from what exploration says may be
shown and nothing else.

- Discovered tiles are cells; discovered edges are strokes along the cell boundary.
- Walls, doors, and secret doors the party has found are distinguished by stroke.
- Known traps carry a mark; stairs and pits carry their own.
- The party is a triangle pointing the way it faces — absent entirely when the party
  stands in the dark, while the rest of the map stays drawn.
- Enemies appear only where exploration reports them, which is only where the party
  can presently see them.

Tapping or pressing the map key expands the widget to fill the screen; the same input
collapses it. Expanded, it is the same drawing at a larger scale — not a different
map with different rules.

## Input

A single handler resolves every event to an action before anything else happens:

```
keydown ──▶ actionForKey(key) ──┐
                                ├──▶ perform(state, action) ──▶ redraw
pointerdown ─▶ hit-test ────────┘
              actionForTouch(region)
```

Tap regions overlay the first-person view and are defined in fractions of the
viewport, not pixels, so they hold their proportions on any screen:

```
┌─────────────────────────────────┐
│ ◀    ┌───────────────┐    ▶  ┌─┐│
│ turn │  step forward │ turn │▓││ ← automap widget
│ left │               │ right└─┘│
│      └───────────────┘         │
│ ┌──┬──┬──┐   ┌────────┐        │
│ │party│pack│ │ turn   │        │ ← party action bar
│ └──┴──┴──┘   │ around │        │
└─────────────────────────────────┘
```

An unrecognised key or a tap outside every region resolves to nothing and is
discarded, rather than being guessed at.

## Prompts

Some actions ask before they resolve — taking a staircase, for one. When the
simulation returns a pending confirmation, the HUD layer draws a prompt and suspends
the normal input mapping until it is answered; the answer goes back to the simulation,
and the normal mapping resumes.

A prompt is drawn from the pending confirmation the simulation is holding, so a prompt
can never be shown for a confirmation that is not actually pending.

## Redraw Discipline

The Pixi ticker is stopped. Presentation renders once at startup and thereafter only
when something has changed:

- an action was performed
- a prompt was answered
- the map was expanded or collapsed
- the window was resized

Resizing recomputes the depth frames and the tap regions from the new viewport, then
redraws. Nothing else in the segment is size-dependent.

## The Starter Floor

Dungeon generation does not exist yet, so the app boots onto a hand-authored floor
held as data — a small layout with corridors, a room, a door, a secret door, and a
staircase, enough to exercise every drawing path. It is scaffolding with a known
expiry: when generation lands, the starter floor is deleted rather than migrated.

## Decisions & Alternatives

| Decision | Chosen | Alternatives Considered | Rationale |
|---|---|---|---|
| Redraw trigger | On state change only; the ticker is stopped | A conventional per-frame render loop | The world advances only when the player acts, so a render loop would redraw an unchanged corridor sixty times a second. On the phone this game is built for, that is battery spent on nothing. |
| Layer updates | Clear and rebuild the changed layer | Diffing against a retained scene model | A corridor is a few dozen polygons and a map a few hundred cells. Rebuilding removes the class of bug where the screen and the state disagree because an update was missed. |
| Corridor geometry | Nested depth frames scaled toward a vanishing point | Raycasting into a texture-mapped wall; pre-rendered art per configuration | Frames are a handful of polygons per depth, need no art pipeline, and keep the view honestly 2D. Raycasting would contradict the project's non-goal and cost mobile performance for a view that only ever faces four directions. |
| Draw order | Far to near | Near to far with depth testing | Painting far first makes occlusion automatic; there is no depth buffer to manage and no way for distant geometry to overwrite near geometry. |
| Light in the view | Tint per depth, fading to black at the torch edge | Showing light only as a status readout | The player should watch the dark close in rather than read a number. It also makes the light rules legible without explanation. |
| Tap regions | Fractions of the viewport | Fixed pixel rectangles | The same layout has to work on a phone and a desktop window; fractions hold their proportions where pixels do not. |
| Starter floor | Hand-authored data, deleted when generation lands | Waiting for dungeon generation; generating a floor here | The segment cannot be seen to work without a floor to walk, and building a generator inside the presentation segment would put it in the wrong place permanently. |

## Open Questions & Future Decisions

### Resolved

1. ✅ **Presentation holds no game state.** Every drawing is a function of simulation state.
2. ✅ **The ticker is stopped**; redraws are triggered by change, not by time.
3. ✅ **Layers are cleared and rebuilt** rather than diffed.
4. ✅ **The corridor is nested depth frames**, drawn far to near, in 2D polygons.
5. ✅ **Light is drawn as a per-depth tint**, fading to black at the edge of sight.
6. ✅ **Tap regions are viewport fractions**, recomputed on resize.
7. ✅ **Prompts are drawn from the simulation's pending confirmation**, never from the renderer's own flag.
8. ✅ **A hand-authored starter floor** stands in until dungeon generation exists.

### Deferred

1. **Art.** Everything is flat-shaded polygons. Textures, sprites for doors and stairs, and any sense of material are unaddressed.
2. **Animation between steps.** A step currently cuts from one position to the next. Whether it should slide, and how that squares with a stopped ticker, is open — an animation is the one thing in this segment that would need time.
3. **The party action bar's contents.** `PARTY`, `INVENTORY`, and `SPELLS` route to segments that do not exist, so the bar can be drawn but its panels cannot.
4. **Expanded-map interaction.** Panning and zooming an expanded map, and whether tapping a tile does anything, are unspecified. Auto-travel is already deferred in exploration.
5. **Wide-screen framing.** On a very wide desktop window the corridor frames may want letterboxing rather than stretching; untested.
6. **Accessibility.** Keyboard focus, screen-reader description of the map, and colour-blind-safe stroke distinctions are unaddressed.

## References

- `docs/high-level-design.md` — the simulation/presentation split and the two-view rule.
- `docs/intent/exploration/exploration-design.md` — the state this segment draws and the action vocabulary it feeds.
