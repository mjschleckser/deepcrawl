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
open while the party is on the floor, but the re-stocking applied on a return visit may
have closed it again (see *Returning to a Floor*). A closed door blocks sight as well
as movement, so the party cannot map a room before entering it.

The outermost ring of both edge arrays is always `wall`. The grid border lives in the
edge model rather than in a separate bounds check, so stepping off the edge of a floor
is blocked by the same rule that blocks every other wall.

Tile features (on the tile, not the edge):

- `none`
- `stairsUp`, `stairsDown` — connectors to another floor, taken deliberately
- `pit` — a one-way connector downward, taken involuntarily

Each tile also carries an intrinsic light level (see *Sight, Light, and Discovery*)
and a discovery record.

### Floors the party has not reached

Exploration does not hold every floor of a campaign. A floor it has never visited is
requested, once, through a provider handed to it at setup; from then on it is held and
saved like any other. Exploration knows nothing about how a floor comes to exist —
only that asking for one by id yields one.

### The floor graph

Floors form a **graph, not a stack**. A floor has a stable id; connectors name a
target floor id and target tile rather than "one level down." Floor 1 may hold
stairs to Floor 2 and separate stairs to Floor 5.

Floor numbering is therefore a label the player sees, not the topology. Nothing in
this segment computes depth by arithmetic on a floor id.

A connector names its destination floor and an **arrival rule** rather than a
destination tile, because the floor it points at may not have been built yet. Stairs
down arrive at the destination's upward staircase, so a descent can be retraced; a pit
drops the party into a room chosen on the destination, with no way back from where they
land.

Connectors are directional and paired only when both directions exist: a `pit`
drops the party to a target floor with no return connector at the landing tile.

Stairs and pits are taken differently. A `pit` fires the moment the party enters its
tile, with no say in the matter. Stairs ask: attempting to step onto a staircase
raises a confirmation, and declining leaves the party on its current tile having
spent no tick, so a staircase is never merely walked across. A party that arrives on
a staircase some other way — dropped there by a pit, which does not chain — is simply
standing on it, and takes it with an `INTERACT`.

## The Clock

The tick is the unit of in-game time. Exploration owns the tick counter.

**Advances the clock:**

| Event | Ticks |
|---|---|
| Party enters a new tile | a **step cost** set by the party's average Dexterity |
| An active search of the current tile | a fixed cost |
| Relighting a doused light source | a fixed cost |
| Camp actions (sleep, eat, rest, train) | defined by the camp segment |

### The step cost

A step is not one tick. It costs a number of ticks drawn from the party's **average
Dexterity** — a nimble party crosses a tile in less time than a burdened one — bounded
between a floor and a ceiling so that no party is ever twice as fast as another.

This is what makes speed a property of the party rather than a number in a fight. Every
other inhabitant of the floor pays its own cost to cross a tile, so a party quicker
than what is chasing it gradually opens a gap and eventually loses it, while a slower
one is run down however cleverly it turns. Outrunning something is a thing the party
either can or cannot do, decided by who they brought.

Because a step now costs several ticks rather than one, hunger and light are consumed
at rates authored against that scale. Both were always per-tick; only the size of a
tick relative to a footstep has changed.

**Does not advance the clock:**

- Turning, in any direction
- Attempting to step into a blocked edge
- Opening or reading the automap, inventory, or any menu
- Combat, in its entirety

Combat standing outside the clock is deliberate: a long fight should not also
starve the party and burn the torch down. Combat costs resources of its own, and
charging time for it would punish the same encounter twice.

The corollary is a constraint on every segment, not a licence: because the clock
stops, nothing may accrue to the party merely for staying in combat longer. Anything
that regenerates, re-prepares, or recovers on a timer must not tick during a fight
either, or stalling becomes the optimal play.

The camp segment advances a clock it does not own. It calls exploration's tick
advance; exploration remains the only writer of the counter. Those ticks reach hunger
like any other, but not the party's carried light, which is out for the duration of
the camp.

## Returning to a Floor

Floors the party has left are frozen. Nothing on them moves, respawns, or decays
while the party is elsewhere: simulating every generated floor would cost time
proportional to the length of the campaign, for changes nobody is present to see.

A frozen dungeon is a dead one, so the life is restored on arrival rather than
maintained in the background. Every floor records the tick at which the party last
left it. On return, exploration compares that against the current tick and applies a
**re-stocking** scaled to how much time has passed:

- roaming enemies are repositioned
- doors are opened and closed
- some previously cleared rooms are refilled

A long absence produces a thorough re-stocking. Stepping down a staircase and straight
back up produces none — the threshold is elapsed ticks, not the act of arriving.

**Re-stocking never touches the discovery record, and never touches a trap.** The map
the party drew stays theirs permanently; what changes is what is standing in it. A
returning party finds its own map accurate as a map and unreliable as intelligence,
which is the point.

Traps are exempt entirely: an undiscovered trap stays undiscovered, a known one stays
known, and a sprung one stays sprung. A floor's traps are laid once, when it is
generated, and the party's knowledge of them only ever grows. Re-stocking rearranges
the living contents of a floor, not its construction.

Exploration owns the trigger, the per-floor last-left tick, and the door changes,
since it already owns door state. Repositioning and refilling are delegated to the
segments that own roaming enemies and generation.

## Movement

Five verbs:

| Verb | Effect | Ticks |
|---|---|---|
| `STEP_FORWARD` | move one tile in the facing direction | the step cost, if the step succeeds |
| `STEP_BACKWARD` | move one tile opposite the facing, which does not change | the step cost, if the step succeeds |
| `TURN_LEFT` | facing rotates 90° counter-clockwise | 0 |
| `TURN_RIGHT` | facing rotates 90° clockwise | 0 |
| `TURN_AROUND` | facing rotates 180° | 0 |

A backward step is a withdrawal: the party gives ground without taking its eyes off
what is in front of it. In every other respect it is an ordinary step — the same cost,
the same blocking rules, the same arrival — because the tile behind the party does not
care which way they are looking. What it buys is the difference between retreating and
turning your back, which in a corridor with something in it is the whole of it.

Backing into a tile the party has never looked at needs no exception in the sight
rules. The party always sees the ground under its own feet, so the tile is mapped on
arrival like any other.

### Step resolution

A step is attempted against the edge between the current tile and the target tile —
the tile ahead of the party going forward, the tile behind it going back. It is
**blocked** — no movement, no tick, no side effects — when the target is
outside the grid, or the edge is `wall`, `lockedDoor` without the matching key, or
an undiscovered `secretDoor`. A `door` or discovered `secretDoor` opens as part of
the step and costs no extra tick.

A step into a tile a roaming enemy occupies is **barred**: the encounter begins where
that enemy stands, the party does not move, and no tick is spent. Meeting happens
*instead of* the step rather than on arrival, because the party and a roamer never
share a tile. That invariant is what makes breaking off a fight worth anything — a
warband cannot be standing on the party when they turn to walk away, and so cannot
re-open the fight with their next step.

On a successful step, these resolve in a fixed order:

1. The party's tile becomes the target tile.
2. The clock advances one tick — light burns down, hunger advances.
3. Tile features resolve: a `pit` relocates the party to its connector's target floor
   and tile, preserving facing.
4. If the party has arrived on a floor it previously left, that floor is re-stocked.
5. The trap trigger hook fires for the tile the party now occupies.
6. Sight is recomputed and discovery recorded.
7. Roaming enemies on the party's current floor move, each spending the ticks this
   step consumed against its own cost to cross a tile — so a quick one moves more than
   once while a slow one waits several of the party's steps for its turn.
8. Contact is checked; a roamer that reached the party begins an encounter.

Steps 4 through 8 act on the tile the party occupies *after* any relocation, so a pit
can drop the party onto a trap and both resolve inside one step, and a pit onto a
known floor lands the party in the re-stocked version of it rather than the stale
one. A pit costs only the
tick of the step that entered it — the landing is a relocation, not a second step. Tile
features resolve at most once per step, so landing on another pit does not chain; the
party falls again on its next step instead.

Roamers are not moved once per party step but once per *their own* step. A step that
costs the party eight ticks gives a roamer that crosses a tile in six ticks one move
with two ticks carried forward; a roamer that needs twelve waits. Everything that
chases the party does so at its own pace.

The order is load-bearing in three places. Light burns down **before** sight is
computed, so a torch that expires on this step is already spent when the party looks
around, rather than granting one last free look. With a spare in the pack the next
torch has already lit by then and nothing is lost; on the last torch, the party
arrives blind. Roamers move **after** discovery, so the
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
which is what makes dousing the party's light worth an attack. A relight resumes the
same doused instance, which still holds whatever fuel it had; it does not reach for a
fresh one.

Carried light is put out for the duration of a camp and relit on breaking camp, so
the ticks a camp consumes do not burn a torch. Camp has a fire of its own, and a
party that had to sleep in shifts holding a torch would simply never sleep.

Spells with a duration, refuelable lanterns, permanently lit equipment, and light
carried by something other than the party are later implementations of the same
contract. Nothing in sight resolution names a torch.

Generation marks some tiles intrinsically `bright` or `dim` regardless of what the
party carries — the dungeon entrance is always lit, so the party can never be
stranded in the dark with no way to see.

### What the party sees

Sight is cast into the **forward quadrant**: tiles lying within 45° either side of
the party's facing, a 90° cone in total, with line of sight blocked by any opaque
edge — a `wall`, a closed `door`, or an undiscovered `secretDoor`. The occupied tile
and its four edges are always seen unless that tile is `dark`.

Sight is recomputed whenever the cone moves, which means on a turn as well as on a
step. Turning costs no tick, but it points the party at ground it has not looked at;
a party that mapped only what lay ahead of its walking direction would have to walk
every corridor twice.

A quadrant cast rather than a straight line down the corridor: a straight-line cast
is simpler, but in an open room it reveals a single file of tiles and leaves the
automap looking broken in exactly the places the player most wants mapped.

Within the cone, a tile is visible only if an unobstructed **line** runs from the
party to it. The line is traced from the middle of the party's tile to the middle of
the candidate, and every edge it crosses must be transparent; one opaque edge anywhere
along it and the tile is not seen.

A line rather than a spreading flood, because sight does not go round corners. Where a
corridor turns, the ground beyond the turn is hidden until the party reaches the
corner and looks along the new arm — which is the whole reason a dungeon is worth
mapping rather than merely walking.

Where a line passes exactly through the corner point shared by four tiles, it is
blocked only if **both** ways around that corner are blocked. A single diagonal gap
can be seen through; a solid corner cannot. Treating the corner as blocked whenever
either side was blocked would carve spurious shadows across open rooms, where a player
can plainly see past a pillar's edge.

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

**It draws:** discovered tiles and their edges — including whether a door on one
stands open or closed — discovered features (stairs, pits),
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

## The Corridor Ahead

The first-person view needs the same kind of answer the automap needs, and for the
same reason: what may be shown, given where the party stands and how far it can see.
Both are projections of exploration state, so both are answered here and drawn
elsewhere.

For each depth ahead of the party, exploration reports whether the way on is blocked,
what stands on the edge the way on passes through, whether that tile is walled to the
left and to the right, what feature stands on it, and what light it resolves to. The
report stops at the first depth whose approach is opaque, at the first depth that
resolves to `dark`, or at the maximum drawn depth, whichever comes first.

The blocking rule is sight's rule, not a second one: a `wall`, a closed `door` or
`lockedDoor`, an undiscovered `secretDoor`. A view that disagreed with sight about
what is opaque would show a corridor the automap denies.

**A door on the edge ahead is reported as a door**, open or closed alike. Closed, it is
what separates a way on from the end of a passage, which the blocking flag by itself
cannot say. Open, it is a landmark: a doorway already walked through is what tells one
stretch of corridor from another. A secret door the party has not found is reported as
the wall it imitates, exactly as sight reports it — the corridor report may never give
away what searching has not yet earned.

The maximum drawn depth is a limit on the drawing, not on the seeing. A party whose
light reaches forty tiles still maps forty tiles; it is simply not shown forty nested
frames, which at that distance are narrower than a pixel.

## Hooks into Adjacent Segments

Each hook names when exploration calls out and what the other segment may read.
Rules beyond that line belong to the other segment.

| Hook | Fires when | Exploration provides | Owned elsewhere |
|---|---|---|---|
| Hunger | every tick | the tick | stages, thresholds, effects |
| Trap detection | sight is recomputed; the party searches | tiles in view or the searched tile, the party, the resolved light level | detection rules, disarm |
| Trap triggering | the party enters a tile | the entered tile and the party | which trap fires and what it does |
| Roaming enemies | after discovery on each step | floor, party tile, resolved tile light levels | movement behavior, roster, respawn |
| Floor re-stocking | the party arrives on a floor it has visited before | the floor and the ticks elapsed since it was last left | how far enemies move, which rooms refill |
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
and dynamic state also persist, but are rewritten by the re-stocking on each return.

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

Exploration accepts two classes of action. **Movement verbs** change where the party
is or which way it looks. **Party actions** open onto everything else the party can
do while standing still.

| Movement verb | Keyboard | Touch |
|---|---|---|
| `STEP_FORWARD` | `W` / `↑` | tap upper-centre of the view |
| `STEP_BACKWARD` | `S` / `↓` | tap lower-centre of the view |
| `TURN_LEFT` | `A` / `←` | tap left edge of the view |
| `TURN_RIGHT` | `D` / `→` | tap right edge of the view |
| `TURN_AROUND` | `X` | two taps of either turn control |

The four keys under one hand walk the party: forward, back, and a turn either way.
Turning about is the one verb reached by repeating another, so it keeps a key without
a control of its own. A control earns its place by being the only way to do something
or by being worth the room it takes, and this one is neither. What must hold is that
every action stays *achievable* by touch, not that each has a button of its own.

| Party action | Keyboard | Touch | Owned by |
|---|---|---|---|
| `PARTY` — roster, row assignment, statuses | `P` | party bar | party |
| `INVENTORY` — use and equip items | `I` | pack icon | loot and items |
| `SPELLS` — out-of-combat magic | `C` | spell icon | abilities |
| `SEARCH` — look for traps and secret doors | `F` | search control | traps |
| `INTERACT` — dungeon features on the current tile | `E` | prompt on the view | varies by feature |
| `TOGGLE_MAP` — open the automap | `M` | automap widget | exploration |

Exploration owns none of these but `TOGGLE_MAP`: it routes each to the segment that
owns it and charges the clock. **Opening a party action costs nothing; committing to
one costs a tick.** Reading the roster, browsing the pack, and reading the map are
free, because a game that charges for looking punishes the player for playing
carefully. Equipping the armour, drinking the potion, casting the spell, searching
the tile, and working the lever each cost a tick.

`TOGGLE_MAP` never costs a tick at all, having nothing to commit to.

```
┌─────────────────────────────────┐
│ ◀    ┌───────────────┐    ▶  ┌─┐│ ← automap widget
│ turn │  step forward │ turn  │▓││   (tap to expand)
│ left │               │ right └─┘│
│      ├───────────────┤          │
│      │   step back   │          │
│      └───────────────┘          │
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
| Step cost | Several ticks, set by the party's average Dexterity | A flat one tick per step | Speed becomes a property of the party rather than a combat statistic, and pursuit becomes a contest a party can win or lose by who they brought rather than by how they turn. |
| Turning | Free, never ticks | Turning costs a tick | Free turning keeps the first-person view scannable, which matters most on a phone where looking around is the primary orientation gesture. |
| Wall bump | No movement, no tick | Bumping costs a tick | A misjudged step should not cost food and torchlight. |
| Stepping into an occupied tile | Barred: the encounter begins and the party stays where it is | Take the step, then check contact on arrival | Arriving on top of a warband leaves the two sharing a tile, and a fight broken off from there re-opens on the party's next step, since whatever they fled is standing on them. Barring the step makes meeting a thing that happens between tiles, so fleeing buys distance rather than a single step's reprieve. |
| Movement verbs | Forward, backward, turn L/R, turn 180° | Forward and turns alone, withdrawing by turning about | Turning to leave is not the same act as backing away: it puts the party's front rank at the back and gives up sight of whatever they are retreating from. The objection that a backward step enters a tile the facing never revealed costs nothing after all, since the party maps the tile it stands on however it arrived there. |
| The corridor's door report | The edge ahead is reported as a door, open or closed, or as nothing | Reporting only whether the way on is blocked | A closed door and a dead end are otherwise the same report, so the view cannot tell a way on from the end of a passage. Open doors are reported for the reverse reason: a doorway already walked through is what distinguishes one corridor from another. |
| Visibility propagation | A line traced from the party to each candidate tile | Spreading outward through non-opaque edges within the cone | Spreading is cheaper and has no corner cases to arbitrate, but it sees around corners: the map fills in ground beyond a turn the party has never looked along. That silently undoes the reason to map a dungeon at all, which is worth the cost of tracing lines. |
| Lines through a corner point | Blocked only when both ways around the corner are blocked | Blocked when either way is blocked | A solid corner is blocked both ways and stays hidden. Blocking on either side would throw spurious shadows across open rooms, where a player can plainly see past the edge of a pillar. |
| Light falloff distance | Chebyshev, so light pools square on the grid | Euclidean distance, rounded | A diagonal step costs the party no more than an orthogonal one, so light that reached further orthogonally than diagonally would contradict how the party moves. |
| Sight shape | Forward-quadrant cast, 45° either side of facing | Straight-line corridor cast; full 360° radius | A straight line maps open rooms one file at a time and looks broken. A full circle would show what the party is not looking at. |
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
| Floors the party has left | Frozen, then re-stocked on return in proportion to elapsed ticks | Live background simulation; no change at all on return | Background simulation costs time proportional to the campaign for changes nobody observes, while a wholly static dungeon is dead. A re-stocking buys the appearance of a living dungeon at the cost of one arrival-time pass. |
| Re-stocking and the map | Discovery is never revised; only occupants, doors, and room contents change | Fogging the map again after long absences | The player earned the map. Making its layout decay would punish the mapping the game is built to reward; making its contents unreliable is the interesting half. |
| Dim light | Penalises trap and secret-door detection, and hides enemies | Dim as purely cosmetic; dim also degrading mapping accuracy | Detection penalties make a failing torch dangerous without making the map itself lie, which would undermine the record the player is building. |
| Relighting a doused source | Costs a tick in exploration, an action in combat | Free relighting; automatic relighting after a dousing | A dousing has to cost something or the attack that caused it accomplishes nothing. Automatic relighting stays for ordinary burnout, where friction would only be tedium. |
| Step resolution order | Fixed seven-step order | Resolving side effects in any order | Light burning before sight is computed, and roamers moving after discovery, are both observable behaviours that must be specified rather than emergent. |
| Stairs versus pits | Stairs prompt on attempted entry and cost nothing to decline; pits fire on entry with no say | Stairs taken by a verb while standing on them; stairs firing automatically like pits | A staircase that fires automatically cannot be walked past, which breaks down once a floor has several. A confirmation keeps the tile passable in intent while never letting the party take stairs by accident. |
| Action classes | Movement verbs, plus party actions that open free and commit for a tick | Charging a tick to open any menu; charging nothing for any party action | Charging for looking punishes careful play, and charging for nothing removes the cost of acting. The split puts the price on the commitment. |
| Traps and re-stocking | Traps are untouched: laid at generation, and party knowledge of them only grows | Clearing known-trap flags on refilled rooms; re-laying traps as part of re-stocking | A trap the party disarmed reappearing, or a map marking a brand-new trap as already known, are both worse than a floor whose traps are simply permanent. |
| Relighting | Resumes the same doused instance | Consuming a fresh source on relight | A doused torch still holds its fuel; making the party throw it away would turn one enemy attack into the loss of a whole item. |
| Light during camp | Carried light is out for the camp's duration | Burning carried light through every tick a camp consumes | A camp has its own fire. Burning a torch through a night's sleep would make resting unaffordable and encourage never camping. |
| Corridor projection | Answered by exploration, beside the automap projection | Owned by the presentation segment that draws it | Both answer "what may be shown given what the party can see", which is sight's question. Splitting two identical concerns across two segments would put the automap's rules and the corridor's rules in different places. |
| Maximum drawn depth | A cap on the report, separate from how far light reaches | Drawing as deep as the light goes | Sight and drawing have different natural limits. A torch reaching far should still map far; nested frames past a handful of depths are narrower than a pixel. |
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
14. ✅ **Roamers appear on the automap wherever they stand in `bright` light**, whether or not they fall inside the sight cast.
15. ✅ **Exploration hands combat an explicit payload**; party state is owned by the party segment and changed through its operations by both.
16. ✅ **Floors the party has left are frozen**, then re-stocked on return in proportion to elapsed ticks — never actively simulated.
17. ✅ **Re-stocking never revises discovery and never touches a trap.** Layout stays known, trap state is permanent; occupants, doors, and room contents change.
18. ✅ **Dim light penalises trap and secret-door detection**, on top of hiding enemies. It does not degrade mapping.
19. ✅ **Relighting a doused source costs a tick in exploration and an action in combat**, and resumes the same instance. Burnout still relights automatically.
20. ✅ **Sight is a true 90° cone** — 45° either side of facing.
21. ✅ **Stairs prompt on attempted entry**; declining costs nothing and leaves the party in place. Pits fire without asking.
22. ✅ **Party actions open free and commit for a tick.** Exploration routes them and charges the clock; the owning segments hold the rules.
23. ✅ **Trap detection and trap triggering are separate hooks.** Detection runs at sight and search and carries the light level; triggering runs on entry and does not.
24. ✅ **Carried light is out for the duration of a camp**, so camp ticks do not burn it.
25. ✅ **Re-stocking resolves immediately after relocation**, before the trap trigger fires.
26. ✅ **Visibility is a traced line** from the party to each candidate tile; sight does not go round corners.
27. ✅ **Light distance is Chebyshev**, matching the way the party moves.
30. ✅ **A step costs several ticks**, set by the party's average Dexterity and bounded at both ends.
31. ✅ **Roamers move on their own tick cost**, not once per party step.
28. ✅ **The corridor projection is exploration's**, answered beside the automap projection and drawn by presentation.
29. ✅ **Maximum drawn depth is capped independently of light reach.**
32. ✅ **The party may step backward**, at the same cost and under the same rules as a forward step, without changing facing.
33. ✅ **The corridor report names the door on the edge ahead**, open or closed, and never an undiscovered secret one.

### Deferred

1. **Re-stocking magnitude.** How far enemies move, which rooms refill, and how many ticks of absence separate a light rearrangement from a thorough one are all untuned. The trigger and the inputs are settled; the curve is not.
2. **Skill-dependent enemy visibility on the automap.** Enemies currently show wherever they stand in `bright` light. Party skill was raised as a future modifier on that range; the mechanism is unspecified.
3. **Auto-travel** — tap a discovered automap tile and walk there. Must interrupt on encounter, trap, or light expiry. Not in v1.
4. **Player map annotations** — Etrian-style notes and icons. Out of scope.
5. **Hunger stages and effects** — this segment supplies the tick only; thresholds and consequences belong to the hunger segment.
6. **Ambush and first strike** — facing and awareness should decide who strikes first. The encounter payload carries an awareness field; the rule that reads it is combat's.
7. **Keys and locked doors** — `lockedDoor` names a matching key, but whether keys are per-door ids, a keyring, or a generic unlock is the items segment's decision.
8. **Spinners and teleporters** — tile features that defeat mapping. Deferred; the edge and feature model accommodates them unchanged.
9. **Other adventuring parties** in the dungeon, carrying their own light. Noted as a future inhabitant of the same floor model.
10. **Standing still is free and safe.** Because roamers move only on party ticks, a stationary party is never approached. Whether idling should carry a cost is an open design question.
11. **Save size** — every floor is retained for the life of the campaign with a full edge model. Discovery is bitmasked; whether layouts need compaction is unmeasured.
12. **Mapping-range and trap-finding modifiers** from items, tomes, and classes — the baseline map is never gated, but the extension mechanism is unspecified.

## References

- `docs/high-level-design.md` — first-person stepped exploration, the simulation/presentation split, and the two-view rule.
- Genre prior art: the later Wizardry entries for stepped first-person movement and corner automapping; Etrian Odyssey for sight-based mapping as a pleasure in itself.
