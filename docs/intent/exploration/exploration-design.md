---
parent: high-level-design
prefix: EXPLORE
---

# Exploration

## Context and Design Philosophy

Exploration owns the dungeon as a place: where the party is, which way it faces,
what it has seen, and the passage of time. Everything the party does to the
dungeon — stepping, turning, discovering — resolves here, and every other segment
that cares about time reads the clock this segment advances.

Three principles shape the design.

**Position is discrete and so is time.** The party occupies exactly one tile
facing exactly one of four directions, and the world advances in whole ticks. There
is no interpolation in the model; smoothing a step into an animation is the
renderer's business and never the simulation's.

**What the party has seen is a fact about the party, not about the map.** The
automap draws discovery state; it does not own it. Discovery survives a save,
survives leaving and returning to a floor, and is recorded the moment sight reaches
a tile rather than when the party stands on it.

**Adjacent mechanics get hooks, not homes.** Hunger, traps, and roaming enemies all
tick with exploration and all trigger on movement, but none of them belong to this
segment. Exploration defines when they fire and what they may read; their rules
live in their own segments. Light is the exception — it exists only to gate what
exploration can see and record, so it is owned here.

## Floor Representation

A floor is a rectangular grid of tiles. Width and height vary per floor; nothing in
the model assumes a fixed size.

### Tiles and edges

Walls sit on **tile edges**, not on tiles. A tile is a space the party can occupy;
an edge is the boundary between two adjacent tiles, or between a tile and the
outside of the grid.

Edges are stored once, not per-tile. A floor holds two edge arrays:

| Array | Dimensions | Holds |
|---|---|---|
| `horizontalEdges` | `width × (height + 1)` | the edge above each tile, plus the bottom border |
| `verticalEdges` | `(width + 1) × height` | the edge left of each tile, plus the right border |

Storing each edge once removes an entire class of bug: a per-tile wall model lets
tile A claim a wall on its north side while tile B claims open floor on its south
side, and the two views of the dungeon disagree. There is only ever one answer.

Edge kinds:

- `open` — passable, transparent
- `wall` — impassable, opaque
- `door` — impassable and opaque while closed; passable and transparent once open
- `lockedDoor` — a door that cannot be opened without the matching key
- `secretDoor` — indistinguishable from `wall` until discovered; a door thereafter

Doors carry an **open** flag alongside their kind. Generation may open some doors at
creation; otherwise a door opens when the party steps through it. An open door stays
open while the party is on the floor, but the shake-up applied on a return visit may
have closed it again (see *Returning to a Floor*). A closed door blocks sight as well
as movement, so the party cannot map a room before entering it.

The outermost ring of both edge arrays is always `wall`. The grid border lives in the
edge model rather than in a separate bounds check, so stepping off the edge of a floor
is blocked by the same rule that blocks every other wall.

Tile features (on the tile, not the edge):

- `none`
- `stairsUp`, `stairsDown` — connectors to another floor
- `pit` — a one-way connector downward

Each tile also carries an intrinsic light level (see *Sight, Light, and Discovery*)
and a discovery record.

### The floor graph

Floors form a **graph, not a stack**. A floor has a stable id; connectors name a
target floor id and target tile rather than "one level down." Floor 1 may hold
stairs to Floor 2 and separate stairs to Floor 5.

Floor numbering is therefore a label the player sees, not the topology. Nothing in
this segment computes depth by arithmetic on a floor id.

Connectors are directional and paired only when both directions exist: a `pit`
drops the party to a target floor with no return connector at the landing tile.

## The Clock

The tick is the unit of in-game time. Exploration owns the tick counter.

**Advances the clock:**

| Event | Ticks |
|---|---|
| Party enters a new tile | 1 |
| An active search of the current tile | 1 |
| Relighting a doused light source | 1 |
| Camp actions (sleep, eat, rest, train) | defined by the camp segment |

**Does not advance the clock:**

- Turning, in any direction
- Attempting to step into a blocked edge
- Opening or reading the automap, inventory, or any menu
- Combat, in its entirety

Combat standing outside the clock is deliberate: a long fight should not also
starve the party and burn the torch down. Combat costs resources of its own, and
charging time for it would punish the same encounter twice.

The camp segment advances a clock it does not own. It calls exploration's tick
advance; exploration remains the only writer of the counter.

## Returning to a Floor

Floors the party has left are frozen. Nothing on them moves, respawns, or decays
while the party is elsewhere: simulating every generated floor would cost time
proportional to the length of the campaign, for changes nobody is present to see.

A frozen dungeon is a dead one, so the life is restored on arrival rather than
maintained in the background. Every floor records the tick at which the party last
left it. On return, exploration compares that against the current tick and applies a
**shake-up** scaled to how much time has passed:

- roaming enemies are repositioned
- doors are opened and closed
- some previously cleared rooms are restocked

A long absence produces a thorough shake-up. Stepping down a staircase and straight
back up produces none — the threshold is elapsed ticks, not the act of arriving.

**The shake-up never touches the discovery record.** The map the party drew stays
theirs permanently; what changes is what is standing in it. A returning party finds
its own map accurate as a map and unreliable as intelligence, which is the point.

Exploration owns the trigger, the per-floor last-left tick, and the door changes,
since it already owns door state. Repositioning and restocking are delegated to the
segments that own roaming enemies and generation.

## Movement

Four verbs:

| Verb | Effect | Ticks |
|---|---|---|
| `STEP_FORWARD` | move one tile in the facing direction | 1, if the step succeeds |
| `TURN_LEFT` | facing rotates 90° counter-clockwise | 0 |
| `TURN_RIGHT` | facing rotates 90° clockwise | 0 |
| `TURN_AROUND` | facing rotates 180° | 0 |

There is no backward step. Because turning is free, withdrawing while facing a
threat costs nothing a backward step would save, and a backward step would move
the party into a tile its facing never revealed — an exception the sight rules
would otherwise have to carry.

### Step resolution

A step is attempted against the edge between the current tile and the target tile.
It is **blocked** — no movement, no tick, no side effects — when the target is
outside the grid, or the edge is `wall`, `lockedDoor` without the matching key, or
an undiscovered `secretDoor`. A `door` or discovered `secretDoor` opens as part of
the step and costs no extra tick.

On a successful step, these resolve in a fixed order:

1. The party's tile becomes the target tile.
2. The clock advances one tick — light burns down, hunger advances.
3. Tile features resolve: a `pit` relocates the party to its connector's target floor
   and tile, preserving facing.
4. The trap hook fires for the tile the party now occupies.
5. Sight is recomputed and discovery recorded.
6. Roaming enemies on the party's current floor move.
7. Contact is checked; an enemy sharing the party's tile begins an encounter.

Steps 4 through 7 act on the tile the party occupies *after* any relocation, so a pit
can drop the party onto a trap and both resolve inside one step. A pit costs only the
tick of the step that entered it — the landing is a relocation, not a second step. Tile
features resolve at most once per step, so landing on another pit does not chain; the
party falls again on its next step instead.

The order is load-bearing in three places. Light burns down **before** sight is
computed, so a torch that expires on this step leaves the party blind on arrival
rather than granting one last free look. Roamers move **after** discovery, so the
party sees the tile it entered as it was when it arrived, and a roamer that steps
into view does so on the next recomputation. And only the occupied floor's roamers
move: floors the party has left are frozen rather than simulated in the background.

## Sight, Light, and Discovery

### Light levels

Every tile resolves to one of three light levels.

| Level | The party can see |
|---|---|
| `bright` | the tile, its edges, its features, traps it has detected, and any enemy standing on it |
| `dim` | the tile, its edges, and its features — but not enemies, which are indistinguishable from shadow. Trap and secret-door detection are penalised. |
| `dark` | nothing at all |

A tile's resolved level is the brighter of its **intrinsic** level, set by generation,
and the level **projected** onto it by the party's lit sources.

Light is only ever beneficial. It does not affect encounter rates, and it does not
make enemies more likely to notice the party.

### Light sources

A light source is a contract, not a torch:

| Field | Meaning |
|---|---|
| `brightRadius` | tiles it raises to `bright` |
| `dimRadius` | tiles it raises to `dim`, beyond the bright ring |
| `remainingTicks` | ticks before it is spent; `null` for a permanent source |
| `isLit` | whether it is currently burning |

A torch is the only implementation in v1. Each torch the party carries is a separate
instance with its own `remainingTicks` and `isLit`, so torches are spent one at a
time rather than in parallel: exactly one burns, and when it is spent the next
unspent torch lights automatically.

A torch may also be extinguished by an external effect — a water attack, say. That
does **not** trigger automatic relighting; a deliberate relight action is required.
Relighting costs a tick during exploration and a character's action during combat,
which is what makes dousing the party's light worth an attack.

Spells with a duration, refuelable lanterns, permanently lit equipment, and light
carried by something other than the party are later implementations of the same
contract. Nothing in sight resolution names a torch.

Generation marks some tiles intrinsically `bright` or `dim` regardless of what the
party carries — the dungeon entrance is always lit, so the party can never be
stranded in the dark with no way to see.

### What the party sees

Sight is cast into the **forward quadrant**: tiles whose direction from the party is
within 90° of its facing, with line of sight blocked by any opaque edge — a `wall`, a
closed `door`, or an undiscovered `secretDoor`. The occupied tile and its four edges
are always seen unless that tile is `dark`.

A quadrant cast rather than a straight line down the corridor: a straight-line cast
is simpler, but in an open room it reveals a single file of tiles and leaves the
automap looking broken in exactly the places the player most wants mapped.

### Discovery

A tile becomes discovered the moment sight reaches it at `dim` or better — not when
the party stands on it. Discovering a tile also discovers its four edges and any
feature on it, **except undiscovered secret doors**, which stay indistinguishable
from wall until the search mechanics find them. Without that carve-out, merely
looking at a tile would give up its secrets and the search mechanic would never fire.

Discovery is permanent and per-floor. It survives leaving the floor, reloading the
save, and the party's death.

Where every tile in view is `dark`, the party may still step, but sees nothing: no
tile is discovered, no enemy is visible, and **automapping pauses**. Movement in the
dark leaves no trace on the map, so a party that loses its light walks blind through
corridors it will have to map again.

## The Automap

The automap is a second view of exploration state. It owns nothing.

**It draws:** discovered tiles and their edges, discovered features (stairs, pits),
traps the party has found, and the party's own tile and facing.

**It does not draw:** undiscovered tiles or secret doors, and roaming enemies on
tiles that are not `bright`. A roamer appears on the map only where the party can
presently see it — showing last-known positions would hand the player an information
advantage that carrying light is supposed to buy.

**In darkness the map stays readable, but the party marker disappears.** The record
of where the party has been is never lost; knowing where it currently stands is
something light has to buy back. A party whose torch goes out still has its map and
no idea where on it they are.

The automap is always available and needs no item or spell. Items, tomes, and
classes may later extend mapping range and trap-finding, but the baseline map is
never gated.

## Hooks into Adjacent Segments

Each hook names when exploration calls out and what the other segment may read.
Rules beyond that line belong to the other segment.

| Hook | Fires when | Exploration provides | Owned elsewhere |
|---|---|---|---|
| Hunger | every tick | the tick | stages, thresholds, effects |
| Traps | party enters a tile; active search | tile, party, search flag | detection, disarm, effects |
| Roaming enemies | after discovery on each step | floor, party tile, resolved tile light levels | movement behavior, roster, respawn |
| Floor shake-up | the party arrives on a floor it has visited before | the floor and the ticks elapsed since it was last left | how far enemies move, which rooms restock |
| Encounter | an enemy shares the party's tile | the encounter payload — see *The Combat Handoff* | all of combat |
| Camp | the player enters camp | tick advance | sleep, eat, rest, train |

Exploration owns one piece of trap state despite not owning traps: whether a trap
is **known**, because that is a fact about what the party has discovered and it
belongs with the rest of the map's discovery record.

## The Combat Handoff

Exploration hands combat an explicit encounter payload rather than leaving combat to
read exploration's state directly. The payload names the enemy group, the light level
of the tile the encounter begins on, and which side was aware of the other.

An explicit handoff rather than shared reads: the boundary between these two segments
is exactly where cascade discipline pauses, and a boundary both sides read through
freely is not a boundary. The payload is the contract, and it is the thing that
changes when the segments need to tell each other something new.

### Party state is owned, not shared

Party state is the exception that proves the rule, because both segments legitimately
change it — a character takes damage in combat and drinks a potion during exploration.
Neither segment writes those fields directly. The **party segment owns them**, and
exploration and combat both call its operations.

That keeps the invariants in one place: hit points cannot fall below zero, death and
revival follow a single state machine, and the party is never larger than five or
deeper than three in a row, no matter which segment triggered the change.

| State | Owned by | Changed through |
|---|---|---|
| Party tile, facing, current floor | exploration | exploration |
| Tick counter | exploration | exploration; camp calls its advance |
| Per-tile discovery, door open flags, known traps | exploration | exploration |
| Resolved light levels, torch states | exploration | exploration |
| Floor layouts | dungeon generation | never mutated after creation |
| Character hit points, status, death state | party | party operations, called by combat and exploration |
| Party roster and row assignment | party | party operations |
| Hunger per character | hunger | hunger, on exploration's tick |
| Roaming enemy positions and state | roaming enemies | roaming enemies, on exploration's step |

Exploration never mutates a floor's layout. Generation produces layouts; exploration
writes only the discovery and door-state record laid over them.

## Persistence

Everything in this segment is saved, including floors the party is not currently
on. A floor is generated once and never generated again: its layout is fixed for the
life of the save, and so is the discovery record laid over it. The floor's occupants
and dynamic state also persist, but are rewritten by the shake-up on each return.

Saved by this segment:

- Every generated floor: id, dimensions, edge arrays, tile features, intrinsic light levels
- Per-floor discovery record (tiles, edges, features, known traps)
- Per-floor door open flags
- Per-floor tick at which the party last left it
- Party's current floor, tile, and facing
- Tick counter
- Every carried light source as a separate instance, with its remaining ticks and lit state

Discovery is stored as a bitmask per floor rather than a per-tile object, since it
is one bit per tile and floors accumulate for the life of the campaign.

## Input

One action vocabulary; keyboard and touch both produce it, and the simulation
cannot tell which was used.

| Action | Keyboard | Touch |
|---|---|---|
| `STEP_FORWARD` | `W` / `↑` | tap upper-centre of the view |
| `TURN_LEFT` | `A` / `←` | tap left edge of the view |
| `TURN_RIGHT` | `D` / `→` | tap right edge of the view |
| `TURN_AROUND` | `S` / `↓` | tap lower-centre of the view |
| `SEARCH` | `F` | tap the search control |
| `TOGGLE_MAP` | `M` | tap the automap widget |

`SEARCH` is the only action here that advances the clock; its rules belong to the
trap segment, and exploration only routes it and charges the tick.

```
┌─────────────────────────────────┐
│ ◀    ┌───────────────┐    ▶  ┌─┐│
│ turn │   step fwd    │ turn │▓││ ← automap widget
│ left │               │ right└─┘│   (tap to expand)
│      └───────────────┘         │
│      ┌───────────────┐         │
│      │  turn around  │         │
│      └───────────────┘         │
└─────────────────────────────────┘
```

Tap regions overlay the first-person view and are sized for thumbs; the automap
widget occupies a corner and expands to full screen on tap.

## Decisions & Alternatives

| Decision | Chosen | Alternatives Considered | Rationale |
|---|---|---|---|
| Wall placement | Walls on tile edges | Walls as whole tiles | Edge walls allow doors between two floor tiles, one-way passages, and secret doors. Tile-walls make doors impossible and cannot be retrofitted. |
| Edge storage | Two shared edge arrays | A four-sided wall record per tile | Each edge exists once, so neighbouring tiles cannot disagree about the wall between them. |
| Floor dimensions | Variable per floor | Fixed 20×20 | Lets generation shape a floor to its archetype. Costs nothing, since nothing in the model assumes a size. |
| Floor topology | A graph of floors joined by connectors | A linear stack indexed by depth | One floor may lead to several others. Depth becomes a label rather than a computed property. |
| Floor lifetime | Generated once, persisted forever | Regenerated from seed on revisit | Discovery, sprung traps, and looted tiles have to survive a revisit. Regeneration would undo the player's record of their own exploration. |
| Turning | Free, never ticks | Turning costs a tick | Free turning keeps the first-person view scannable, which matters most on a phone where looking around is the primary orientation gesture. |
| Wall bump | No movement, no tick | Bumping costs a tick | A misjudged step should not cost food and torchlight. |
| Movement verbs | Forward, turn L/R, turn 180° | Adding a backward step | Free turning already makes withdrawal cheap; a backward step would only add a case where the party enters a tile its facing never revealed. |
| Sight shape | Forward-quadrant cast, radius `R` | Straight-line corridor cast; full 360° radius | A straight line maps open rooms one file at a time and looks broken. A full circle would show what the party is not looking at. |
| Discovery trigger | Sight reaches the tile | Standing on the tile | Mapping a room by walking every tile in it is tedious, and the first-person view already shows what sight-based discovery records. |
| Light model | Three levels per tile: bright, dim, dark | A single binary lit/unlit; a continuous radius | Three tiers give a middle state where the party can map but cannot spot enemies, which is what makes pushing on with a guttering torch a real gamble. |
| Light sources | A contract; torch is the only v1 implementation | Hard-coding the torch | Spells, lanterns, and enemy-carried light all arrive later. Nothing in sight resolution names a torch. |
| Torch bookkeeping | Each torch a separate instance; exactly one lit; next lights automatically when one is spent | One pooled fuel total; all carried torches burning at once | Separate instances let an external effect douse a specific torch. Automatic relighting on burnout keeps routine walking frictionless, while a deliberate relight after a dousing keeps such attacks meaningful. |
| Doors and sight | A closed door is opaque and impassable; it opens by being stepped through, and some start open | Doors transparent when closed; opening as its own action costing a tick | Seeing through closed doors would let the party map a room without entering it. Charging a tick to open would make every doorway a toll. |
| Light and enemies | Light never worsens the party's position | Light raising encounter rate or enemy awareness | Light is a scarce resource the player already pays for; making it also a liability would push play toward travelling dark. |
| Combat and time | Combat advances no ticks | Combat ticking per round | A long fight already costs resources. Charging time as well would punish the same encounter twice. |
| Roamers on the automap | Shown only on `bright` tiles | Last-known position; always shown; visible at `dim` too | Seeing where enemies are is what carrying light buys. A persistent map marker would give it away for free. |
| Exploration to combat | An explicit encounter payload | Both segments reading shared state freely | The segment boundary is where cascade pauses; a boundary read through freely is not a boundary. The payload is the contract that changes when the segments need to say something new. |
| Party state | Owned by the party segment; exploration and combat both call its operations | Either segment writing character fields directly | Both segments legitimately change party state — damage in combat, a potion in exploration. Routing both through one owner keeps hit-point floors, the death state machine, and the five-member and three-per-row limits in a single place. |
| Floors the party has left | Frozen, then shaken up on return in proportion to elapsed ticks | Live background simulation; no change at all on return | Background simulation costs time proportional to the campaign for changes nobody observes, while a wholly static dungeon is dead. A shake-up buys the appearance of a living dungeon at the cost of one arrival-time pass. |
| Shake-up and the map | Discovery is never revised; only occupants, doors, and room contents change | Fogging the map again after long absences | The player earned the map. Making its layout decay would punish the mapping the game is built to reward; making its contents unreliable is the interesting half. |
| Dim light | Penalises trap and secret-door detection, and hides enemies | Dim as purely cosmetic; dim also degrading mapping accuracy | Detection penalties make a failing torch dangerous without making the map itself lie, which would undermine the record the player is building. |
| Relighting a doused source | Costs a tick in exploration, an action in combat | Free relighting; automatic relighting after a dousing | A dousing has to cost something or the attack that caused it accomplishes nothing. Automatic relighting stays for ordinary burnout, where friction would only be tedium. |
| Step resolution order | Fixed seven-step order | Resolving side effects in any order | Light burning before sight is computed, and roamers moving after discovery, are both observable behaviours that must be specified rather than emergent. |
| Pit relocation | Steps 4-7 act on the landing tile; one tick total; features resolve at most once per step | Charging a second tick for the landing; chaining pits within one step | Acting on the landing tile lets a pit drop the party onto a trap, which is the interesting case. Resolving features once per step bounds the fall without a special rule. |
| Facing across floors | Preserved through stairs and pits | Facing set by the connector; facing randomised on arrival | Preserving facing keeps arrival predictable and costs nothing; a connector-defined facing is a detail generation would have to author for every connector. |

## Open Questions & Future Decisions

### Resolved

1. ✅ **Walls are on tile edges**, stored once per edge in two shared arrays; the border ring is always `wall`.
2. ✅ **Floors are a graph**, not a stack; connectors name a target floor and tile.
3. ✅ **Generated floors persist forever** in the save, including floors not currently occupied.
4. ✅ **Turning is free; only entering a new tile ticks.** Bumping a wall does neither.
5. ✅ **Discovery is by sight**, cast into the forward quadrant, at `dim` light or better.
6. ✅ **Closed doors are opaque**, so a room cannot be mapped before it is entered. Some doors start open; the rest open by being stepped through.
7. ✅ **Sight never reveals an undiscovered secret door** — that is the search mechanic's job alone.
8. ✅ **Three light levels per tile**: bright, dim, dark.
9. ✅ **Darkness pauses automapping** but not movement; the existing map stays readable while the party marker vanishes.
10. ✅ **Light is always beneficial** — no effect on encounter rate or enemy awareness.
11. ✅ **One torch burns at a time**, tracked per instance, relighting automatically when spent but not when doused.
12. ✅ **Facing is preserved** across stairs and pits.
13. ✅ **Combat does not advance the clock.** Exploration and camp are the only sources of time.
14. ✅ **Roamers appear on the automap only where currently visible.**
15. ✅ **Exploration hands combat an explicit payload**; party state is owned by the party segment and changed through its operations by both.
16. ✅ **Floors the party has left are frozen**, then shaken up on return in proportion to elapsed ticks — never actively simulated.
17. ✅ **The shake-up never revises discovery.** Layout stays known; occupants, doors, and room contents change.
18. ✅ **Dim light penalises trap and secret-door detection**, on top of hiding enemies. It does not degrade mapping.
19. ✅ **Relighting a doused source costs a tick in exploration and an action in combat.** Burnout still relights automatically.

### Deferred

1. **Shake-up magnitude.** How far enemies move, which rooms restock, and how many ticks of absence separate a light rearrangement from a thorough one are all untuned. The trigger and the inputs are settled; the curve is not.
2. **Auto-travel** — tap a discovered automap tile and walk there. Must interrupt on encounter, trap, or light expiry. Not in v1.
3. **Player map annotations** — Etrian-style notes and icons. Out of scope.
4. **Hunger stages and effects** — this segment supplies the tick only; thresholds and consequences belong to the hunger segment.
5. **Ambush and first strike** — facing and awareness should decide who strikes first. The encounter payload carries an awareness field; the rule that reads it is combat's.
6. **Keys and locked doors** — `lockedDoor` names a matching key, but whether keys are per-door ids, a keyring, or a generic unlock is the items segment's decision.
7. **Spinners and teleporters** — tile features that defeat mapping. Deferred; the edge and feature model accommodates them unchanged.
8. **Other adventuring parties** in the dungeon, carrying their own light. Noted as a future inhabitant of the same floor model.
9. **Standing still is free and safe.** Because roamers move only on party ticks, a stationary party is never approached. Whether idling should carry a cost is an open design question.
10. **Save size** — every floor is retained for the life of the campaign with a full edge model. Discovery is bitmasked; whether layouts need compaction is unmeasured.
11. **Mapping-range and trap-finding modifiers** from items, tomes, and classes — the baseline map is never gated, but the extension mechanism is unspecified.

## References

- `docs/high-level-design.md` — first-person stepped exploration, the simulation/presentation split, and the two-view rule.
- Genre prior art: the later Wizardry entries for stepped first-person movement and corner automapping; Etrian Odyssey for sight-based mapping as a pleasure in itself.
