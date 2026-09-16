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

**Presentation remembers only what it was told once.** Every drawing is a function of
what the simulation currently says. The single exception is a record of events already
reported: a resolved round returns what happened once and never again, and since
nothing animates, a fight would otherwise be perceived only as the state that came out
the other side. Keeping that record is not holding game state — the simulation stays
the only authority on what is true — but it is the one place the renderer remembers
rather than reads.

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
model of what it drew last; a redraw clears and re-emits.

**Every drawing names every layer.** A layer with nothing to show is given an empty
drawing rather than left out, because a layer that is merely omitted is a layer nobody
clears — and what it drew last stays on the screen. Leaving a layer out of a drawing is
the one way this design can leak, so it is not a thing a drawing is allowed to do. At the sizes involved — a
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

Stairs and pits are markings on the floor within the band for the depth they occupy.

**An enemy in the passage is drawn standing in it**, a figure on the floor of the
depth the simulation reports it at and scaled to that depth's frame like everything
else. It carries the horned head the automap marks it with, so the thing on the map and
the thing down the corridor are recognisably one thing.

**A door is drawn on the frame, not on the floor**, because it is a thing in the way
rather than a thing underfoot. A closed door is a panel of timber across the frame the
corridor stops at, lighter than the stone around it and carrying a handle, so a way on
is never taken for the end of a passage. An open door is drawn as its frame alone, the
corridor visible through it — the doorway the party has already been through, which is
what tells one stretch of passage from another.

## The Automap

A corner widget over the first-person view, drawn from what exploration says may be
shown and nothing else.

- Discovered tiles are cells; discovered edges are strokes along the cell boundary.
- Walls, doors, and secret doors the party has found are distinguished by stroke, and
  a door shows whether it stands open: closed, it bars the edge; open, it leaves the
  gap the party walked through between its two posts.
- Known traps carry a mark; stairs and pits carry their own.
- The party is a triangle pointing the way it faces — absent entirely when the party
  stands in the dark, while the rest of the map stays drawn.
- Enemies appear only where exploration reports them, which is only where the party
  can presently see them, and are drawn as a creature mark rather than a dot, so one is
  not read as a trap or as the party. Every enemy shares that mark; telling a goblin
  from a mage on the map is authoring nobody has done.

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
│ ◀    ┌───────────────┐    ▶  ┌─┐│ ← automap widget
│ turn │  step forward │ turn  │▓││
│ left │               │ right └─┘│
│      ├───────────────┤          │
│      │   step back   │          │
│      └───────────────┘          │
│  ┌────┬────┬────┬────┬────┐     │
│  │part│pack│spel│srch│ use│     │ ← party action bar
│  └────┴────┴────┴────┴────┘     │
└─────────────────────────────────┘
```

An unrecognised key or a tap outside every region resolves to nothing and is
discarded, rather than being guessed at.

### Controls are drawn, not implied

Every region that can be tapped is visibly drawn. A player on a phone cannot discover
an invisible control, and the project's first target user is holding one — a region
that exists only in the hit-test is a region only a keyboard player benefits from.

Each control is a bordered panel with a label, and no control is smaller than a
thumb: there is a floor on how small a tap target may be drawn, in real pixels rather
than a fraction, because a thumb does not shrink with the viewport.

**A label names the thing, not the key.** `Descend` with a small `Enter` beside it,
never `[Enter] Descend` — the second tells a phone player to press a key they do not
have. Keyboard hints are secondary text on the same control, so one drawing serves
both players and neither is told to use the other's device.

Every hit region is computed in the plan alongside the drawing it belongs to, so the
thing drawn and the thing tapped cannot drift apart. The renderer hit-tests the plan;
it never registers handlers of its own.

Controls come in two kinds, and the difference is how much of the view they cover.

A **navigation zone** — step forward, turn either way — is a large area of the screen,
and a panel that size is a panel large enough to hide the corridor. The corridor is the
game, so a zone draws only its name; its outline appears under the finger and goes when
the finger lifts. The player learns where the zones are by using them, and then gets
their dungeon back.

A **button** — the map, the pack, a spell, a search, an option in a fight — is small and
discrete, and covers almost nothing. Buttons keep their panel and their frame, because
a button that is only a word is hard to read as something you may press, and hiding
almost nothing buys almost nothing.

Which kind a control is belongs in the plan rather than being worked out while drawing,
so the rule lives in one place and can be checked.

## Combat

A fight is drawn over the corridor rather than in place of it. The party is still
standing where it was standing, and seeing the passage they were caught in is part of
knowing how badly this is going. The first-person view stays; the combat layer sits on
top of it.

### What is drawn

```
┌─────────────────────────────────────────────┐
│           ╔═══════════════════╗             │ ← the corridor, still there
│  ┌──────┐ ┌──────┐                          │
│  │shaman│ │shaman│          enemy back row  │
│  └──────┘ └──────┘                          │
│  ┌──────┐ ┌──────┐ ┌──────┐                 │
│  │goblin│ │goblin│ │goblin│  enemy front    │
│  │ 9/9  │ │ 4/9  │ │ dead │                 │
│  └──────┘ └──────┘ └──────┘                 │
├─────────────────────────────────────────────┤
│ Bram 14/20 │ Rook 20/20 │ Tam 20/20         │ ← your front row
│ Isolde 20/20 │ Wren 20/20                   │ ← your back row
├─────────────────────────────────────────────┤
│ Bram: what will you do?                     │
│  [1] Attack   [2] Defend   [3] Flee         │ ← only the legal ones
├─────────────────────────────────────────────┤
│ Rook grazes Goblin for 3.                   │
│ Goblin hits Bram for 6.                     │ ← the log
│ Tam crits Goblin for 14. Goblin falls.      │
└─────────────────────────────────────────────┘
```

Both formations are drawn as rows, because rows are what the fight is about. A
character or enemy who is down is drawn in place rather than removed — the shape of a
line that has lost its middle is information.

Each rank is **centred**, so the two sides read as facing one another down a corridor
rather than as two lists sharing a left margin. Where every card sits is decided in the
plan, like everything else, rather than worked out while drawing.

### The log carries the fight

Nothing animates. A round resolves in a single frame, so without a record the player
would see only the state that came out the other side and never learn what happened in
between.

The log is therefore not decoration. It is the fight, as perceived: one line per
resolved action, naming who acted, what band the attack fell in, what it cost, and
what it killed. It is built from the event log a resolved round already returns, so the
renderer invents nothing and reports only what the simulation actually did.

### Choosing actions

Selection walks the conscious party in a fixed order. Each character is asked in turn,
and only the actions that character can legally take are offered — no attack option
with nothing in reach, no flee option against something that forbids it. An action
needing a target asks for one from the legal targets only, so an illegal choice cannot
be expressed rather than being refused after the fact.

When the last character has chosen, the round resolves, the log grows, and the first
character is asked again.

Backing out of a choice steps back to the previous character, because a party committed
before seeing any result should be able to reconsider the whole round rather than only
its last decision.

### Input in a fight

The exploration vocabulary does not apply while a fight is on: there is nowhere to walk.
Combat has its own, and like the other it resolves keyboard and touch to one set of
actions that carry no trace of where they came from.

| Action | Keyboard | Touch |
|---|---|---|
| Pick the nth option | `1`–`9` | tap the option |
| Confirm | `Enter` | tap the confirm control |
| Back | `Escape` | tap the back control |

Every option on offer is a drawn control with its own hit region, sized like any
other. A fight a player can watch but not act in is worse than no fight at all, and
that is what an option with no tap target amounts to on a phone.

### Ending

An outcome is drawn as a banner over the fight: what happened, and what it was worth.
The player dismisses it, and combat gives way to the corridor again — or, on a defeat,
to whatever the campaign does with a party that did not come back.

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

### One layout, two screens

The layout is designed against a phone held upright, and every position is a fraction
of the viewport — so the same arrangement holds on any screen. Fractions alone are not
enough, though, and the two ways they fail pull in opposite directions.

**Things that must not shrink** — a control under a thumb, a line of text — are held to
a floor in real pixels. That is what `MIN_TAP_PX` is for.

**Things that must not stretch** — a row of buttons, a column of text, a rank of
combatant cards — are held to a ceiling. A button spanning a third of a desktop window
is not a bigger button, it is a worse one, and a line of text the full width of a
monitor is not easier to read. Content therefore lays out inside a **centred column**
of bounded width, with the corridor showing either side of it.

Between the floor and the ceiling everything is drawn at a **scale** derived from the
viewport:

```
scale = clamp(min(width / 390, height / 780), 1, 2)
```

A phone gets 1 and the layout it was designed for. A desktop window gets up to 2, so
cards, controls and text grow to suit the screen instead of huddling at phone size in
the middle of it. It is capped at 2 because past that the game stops looking like a
bigger version of itself and starts looking like a zoomed screenshot.

The scale belongs to the **plan**, not to the drawing. Every position and size is
decided before anything is emitted, which is the same rule the combatant cards already
follow — an adapter that recomputed scale would be a second place where layout lived.

### The viewport is what can be seen

The drawing surface is sized to the **visible** viewport, not the layout one. On a
phone browser these differ: the layout viewport is the height the page would have with
the address bar hidden, so a surface sized to it puts its bottom edge permanently
behind the chrome. Installed as an app there is no chrome and the two agree, which is
exactly why the fault hides from anyone testing only the installed version.

The visible height is read from the browser's own report of it and followed as it
changes, because the chrome slides in and out as the player scrolls or taps. Device
safe areas — a notch, a home indicator — are excluded on the same principle: they are
screen the player can see but the game cannot have.

## The Starter Floor

Dungeon generation does not exist yet, so the app boots onto a hand-authored floor
held as data — a small layout with corridors, a room, a door, a secret door, and a
staircase, enough to exercise every drawing path. It is scaffolding with a known
expiry: when generation lands, the starter floor is deleted rather than migrated.

## Decisions & Alternatives

| Decision | Chosen | Alternatives Considered | Rationale |
|---|---|---|---|
| Wide screens | A centred column of bounded width, at a scale that grows to twice the phone layout | Pure fractions of the viewport; a fixed pixel layout centred with letterboxing | Pure fractions stretch a button across a third of a monitor and a text column across all of it, neither of which is more readable for being larger. A fixed layout leaves a desktop player with a phone-sized game marooned in the middle of the screen. Bounding the column and scaling within it gives both screens a layout built for them. |
| Where the scale lives | On the plan | Computed in the Pixi adapter as it draws | Layout lives in one place. An adapter that worked out its own scale would be a second place to look when something is the wrong size, and the plans already own every other position. |
| Redraw trigger | On state change only; the ticker is stopped | A conventional per-frame render loop | The world advances only when the player acts, so a render loop would redraw an unchanged corridor sixty times a second. On the phone this game is built for, that is battery spent on nothing. |
| Absent layers | Every drawing names every layer, empty where there is nothing to show | Listing only the layers with something in them | A layer merely left out of a drawing is a layer nobody clears, so what it drew last stays on screen. That is the one way this design leaks, so it is made impossible rather than remembered. |
| Layer updates | Clear and rebuild the changed layer | Diffing against a retained scene model | A corridor is a few dozen polygons and a map a few hundred cells. Rebuilding removes the class of bug where the screen and the state disagree because an update was missed. |
| Corridor geometry | Nested depth frames scaled toward a vanishing point | Raycasting into a texture-mapped wall; pre-rendered art per configuration | Frames are a handful of polygons per depth, need no art pipeline, and keep the view honestly 2D. Raycasting would contradict the project's non-goal and cost mobile performance for a view that only ever faces four directions. |
| Draw order | Far to near | Near to far with depth testing | Painting far first makes occlusion automatic; there is no depth buffer to manage and no way for distant geometry to overwrite near geometry. |
| Light in the view | Tint per depth, fading to black at the torch edge | Showing light only as a status readout | The player should watch the dark close in rather than read a number. It also makes the light rules legible without explanation. |
| Surface size | The visible viewport, chrome and safe areas excluded | The layout viewport; `100vh` | On a phone browser the layout viewport is the height the page would have with the address bar hidden, so sizing to it puts the bottom of the game behind the chrome. Installed as an app the two agree, which is how the fault hides. |
| Tap regions | Fractions of the viewport, with a pixel floor on size | Fractions alone; fixed pixel rectangles | The same layout has to work on a phone and a desktop window, so fractions hold the proportions — but a thumb does not shrink with the viewport, so the floor is in real pixels. |
| Drawing the controls | Every tappable region is drawn | Leaving the view uncluttered and the regions invisible | A control nobody can see is a control only a keyboard player has, and the first target user is holding a phone. |
| Navigation zones | The label alone, outlined only while pressed | Always framed | A panel the size of a movement zone is a panel big enough to hide the corridor, and the corridor is the game. The outline under the finger teaches where the zones are without keeping the dungeon covered. |
| Stepping back | A zone of its own, under the forward zone | Reaching it by turning about, stepping, and turning back | A withdrawal that needs three taps is not a withdrawal. Splitting the centre of the view gives the verb a home without taking a thumb's width from any other control. |
| A door in the view | Drawn on the frame the corridor stops at, with an open one drawn as its frame alone | Drawn as a floor marking, like stairs and pits | A door is in the way rather than underfoot, and drawn on the floor it would say nothing about whether the corridor goes on. Drawing the open ones too costs a frame and buys the landmark a player navigates by. |
| Enemies in the corridor | A figure at the depth the report puts it, sharing the map mark's horned head | Drawing none, leaving the map to show them; a card or banner announcing one | A monster the map shows and the corridor does not makes the player watch the corner of the screen instead of the dungeon. Sharing the head is what makes the mark and the figure read as the same creature. |
| The enemy mark | One creature mark for every enemy | A dot; a different mark per roster entry | A dot beside the trap mark and the party triangle is three dots. Per-enemy marks are authoring that the roster does not yet justify, and they would leak what the party has not fought. |
| Buttons | Keep their panel and frame | Bare labels, like the zones | A button covers almost nothing, so hiding it buys almost nothing — and a button that is only a word is hard to read as something you may press. |
| Which kind a control is | Carried in the plan | Inferred from its name while drawing | The rule then lives in one place and can be checked, rather than being re-derived by whatever happens to be drawing. |
| Turning about | A key, but no control of its own | A movement zone of its own, beside the step and turn zones | Two taps of a turn the player already uses reach it. A control earns its place by being the only way to do something or by being worth the room; this is neither. |
| Labels | Name the action, with any key hint as secondary text | Naming the key that triggers it | "[Enter] Descend" instructs a phone player to press a key they do not have. One drawing has to serve both without telling either to use the other's device. |
| Hit regions | Computed in the plan, beside the drawing they belong to | Registered as handlers on the drawn objects | Keeping them together means what is drawn and what is tapped cannot drift apart, and it keeps hit-testing in the pure layer where it can be tested. |
| Combat over the corridor | Drawn on top of the first-person view, which stays visible | Replacing the view with a combat screen | The party is still standing in the passage they were caught in, and seeing it is part of knowing how bad this is. A separate screen would also throw away the light and the place. |
| Showing a round | A text log built from the round's own event log | Animating each action; showing only the resulting state | Nothing animates, so a round lands in one frame. Without a record the player sees the aftermath and never learns what happened. The log is the fight as perceived. |
| Illegal options | Not offered at all | Offered and refused when chosen | An option that cannot be taken should not be presented. Refusing after the fact teaches the rules by failure, which in a fight is expensive. |
| Backing out | Steps back to the previous character | Cancelling only the current choice | The party commits to a whole round before any of it resolves, so reconsidering should reach the whole round rather than only its last decision. |
| The fallen | Drawn in place, not removed | Removing them from the formation | The shape of a line that has lost its middle is information, and a body still occupies its row. |
| Starter floor | Hand-authored data, deleted when generation lands | Waiting for dungeon generation; generating a floor here | The segment cannot be seen to work without a floor to walk, and building a generator inside the presentation segment would put it in the wrong place permanently. |

## Open Questions & Future Decisions

### Resolved

1. ✅ **Presentation holds no copy of game state**, deriving every drawing from the simulation — except a record of events already reported, which is never reported twice.
2. ✅ **The ticker is stopped**; redraws are triggered by change, not by time.
3. ✅ **Layers are cleared and rebuilt** rather than diffed.
4. ✅ **The corridor is nested depth frames**, drawn far to near, in 2D polygons.
5. ✅ **Light is drawn as a per-depth tint**, fading to black at the edge of sight.
6. ✅ **Tap regions are viewport fractions**, recomputed on resize, with a pixel floor on how small one may be drawn.
9. ✅ **Every tappable region is drawn**, and every drawn control carries its own hit region in the plan.
11. ✅ **A navigation zone is its label alone**, outlined only while pressed; a button keeps its panel and frame.
13. ✅ **Each rank in a fight is centred**, and every card's position is decided in the plan.
14. ✅ **Stepping back is a zone of its own**, beneath the forward zone.
15. ✅ **A door is drawn on the frame the corridor stops at**, closed as a panel with a handle and open as its frame alone.
16. ✅ **An enemy the corridor report names is drawn standing at that depth**, with the same horned head the automap uses.
12. ✅ **Turning about has a key but no control**, being two taps of one the player already uses.
10. ✅ **Labels name the action**, with any keyboard hint as secondary text.
7. ✅ **Prompts are drawn from the simulation's pending confirmation**, never from the renderer's own flag.
8. ✅ **A hand-authored starter floor** stands in until dungeon generation exists.

### Deferred

1. **Animation in a fight.** A round lands in one frame and is read from the log. Whether a resolving round should play out over time, and what that would do to the stopped ticker, is the same open question the step animation raises.
2. **Art.** Everything is flat-shaded polygons. Textures, sprites for doors and stairs, and any sense of material are unaddressed.
3. **Animation between steps.** A step currently cuts from one position to the next. Whether it should slide, and how that squares with a stopped ticker, is open — an animation is the one thing in this segment that would need time.
4. **The party action bar's contents.** `PARTY`, `INVENTORY`, and `SPELLS` route to segments that do not exist, so the bar can be drawn but its panels cannot.
5. **Expanded-map interaction.** Panning and zooming an expanded map, and whether tapping a tile does anything, are unspecified. Auto-travel is already deferred in exploration.
6. **Wide-screen framing.** On a very wide desktop window the corridor frames may want letterboxing rather than stretching; untested.
7. **Accessibility.** Keyboard focus, screen-reader description of the map, and colour-blind-safe stroke distinctions are unaddressed.

## References

- `docs/high-level-design.md` — the simulation/presentation split and the two-view rule.
- `docs/intent/exploration/exploration-design.md` — the state this segment draws and the action vocabulary it feeds.
