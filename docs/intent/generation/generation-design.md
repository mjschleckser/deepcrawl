---
parent: high-level-design
prefix: GEN
---

# Dungeon Generation

## Context and Design Philosophy

Generation turns a seed and an archetype into a floor. It runs once per floor, before
the party ever sets foot on it, and it never runs over that floor again.

Three principles shape the design.

**Structure is authored once and frozen; contents are not.** A floor's walls, doors,
stairs, and traps are laid down at generation and never change for the life of the
campaign — the party's map has to stay true, and a trap they disarmed must not
reappear. What lives *in* the floor is a different matter: monsters and the contents
of rooms are refilled when the party returns after a long enough absence. Generation
therefore does two separable jobs, and confusing them would either freeze the dungeon
into a museum or make the player's map a lie.

**The seed is the floor.** Given the same seed and the same archetype, generation
produces a byte-identical floor every time. Nothing reads the clock, the global random
number generator, or anything else outside its arguments. This is what makes a
generator testable at all: a property like "every floor is fully connected" can be
asserted across a thousand seeds in a second.

**Authored data bounds the generator, and code does not.** How large a floor runs, how
many rooms it holds, how often a door is locked or a passage secret — all of it lives
in archetypes as data. The generator is the machinery that satisfies an archetype; it
holds no opinion about what a dungeon should feel like. Changing the feel of the
dungeon should not mean changing the generator.

## What This Segment Owns

| | Owned by generation | Owned elsewhere |
|---|---|---|
| Floor layout | walls, doors, secret doors, room shapes | nothing — frozen after creation |
| Connectors | where stairs and pits sit, and what they point at | exploration decides what taking one does |
| Traps | where they are laid, once | the trap segment owns detection, disarming, effects |
| Lighting | the intrinsic light level of each tile | exploration resolves it against carried light |
| Room contents | what refills a room, and when it is worth refilling | the roaming-enemy segment owns enemies once placed |

## Determinism

Generation takes a seed and returns a floor. It uses a small seeded generator passed
explicitly through the call, never a module-level one, so two generations cannot
interfere with each other and a floor built on a Tuesday matches one built on a Friday.

The seeded generator is consumed in a fixed order. Adding a new step that draws from
it changes every floor downstream of that point, which is expected and acceptable
during development; what is not acceptable is a step that draws a *variable* number of
values depending on data, because that makes later steps depend on earlier ones in
ways nobody can reason about. Steps that need a variable number of draws take their own
derived generator, seeded from the parent.

## Floor Generation

A floor is built in passes, each of which leaves the floor valid.

### 1. Solid rock

Every edge on the floor starts as `wall`. Generation carves; it never fills.

### 2. Rooms

The floor is split recursively into regions until the archetype's room count is
reached or the regions grow too small to hold a room, then a room is placed inside each
leaf region with a margin. The room count is a target rather than a guarantee: a small
floor asked for many rooms delivers as many as fit, because a generator that failed
outright on an awkward archetype would be worse than one that delivers a smaller floor.

Splitting rather than scattering rooms and testing for overlap: a split cannot produce
overlapping regions, so no rejection loop is needed, and no seed can spend a thousand
attempts failing to place its last room.

Each room is a rectangle of tiles whose interior edges are opened.

### 3. Corridors

Sibling regions are joined by carving a corridor between their rooms. Because the
split is a tree and every sibling pair is joined, the result is connected by
construction — there is no pass that checks connectivity and repairs it, because there
is no way for the floor to come out disconnected.

A corridor runs in two straight legs, turning once. Which leg comes first is drawn from
the seed, so corridors do not all elbow the same way.

### 4. Loops

A tree of corridors means exactly one route between any two points, which makes a floor
tedious to navigate and trivial to map. A number of extra connections drawn from the
archetype are carved between regions that are near each other but not siblings, giving
the floor loops and alternative routes.

### 5. Doors

Where a corridor meets a room's boundary, the opened edge becomes a `door`. A portion
of doors, drawn from the archetype, become `lockedDoor`; a portion of the *loop*
connections become `secretDoor`.

Secrets are bounded by an invariant the generator enforces rather than hopes for:
**every region keeps at least one route in that is neither secret nor locked.** Only
loop connections are eligible to become secret, and a loop is passed over if making it
secret would leave the region it serves reachable only through secrets. A secret that
is the sole way into somewhere is not a secret, it is a wall the party never gets past.

### 6. Connectors, traps, and light

Stairs and pits are placed on floor tiles away from doorways, so a connector is never
the tile a party is forced to cross. Traps are laid within the archetype's budget,
weighted toward corridors and doorways. Intrinsic light is dark by default; an
archetype may specify lit rooms, and the floor holding the dungeon entrance always
lights the arrival tile.

## Archetypes

An archetype is the authored data a floor is generated inside. It holds ranges rather
than values, and generation draws from those ranges.

| Field | Meaning |
|---|---|
| `size` | minimum and maximum floor width and height |
| `rooms` | how many rooms to aim for, as a range |
| `roomSize` | minimum and maximum room dimensions |
| `loops` | extra non-tree connections, as a range |
| `doorChance`, `lockedChance`, `secretChance` | how often a junction becomes each kind |
| `traps` | how many traps to lay, as a range |
| `litRooms` | how many rooms are intrinsically lit |

An archetype names no absolute coordinates and no specific rooms. A generator that
needed hand-placed detail to produce a good floor would have failed at its job.

## The Dungeon Plan

Floors form a graph, so something has to decide the graph before any floor is built.
The plan is generated first: a set of floor descriptors, each with an id, an archetype,
a depth label, and the ids of the floors its connectors lead to.

The plan is generated from the campaign seed and is small enough to hold entirely.
Floors themselves are built lazily — a floor is generated the first time the party
would arrive on it, not when the campaign begins — so a campaign does not pay to build
levels nobody visits.

Because the plan fixes the graph first, a connector always names a floor that will
exist, and a floor's exits are known before its interior is.

## Arriving on a Floor

A floor is built the first time the party would arrive on it. Exploration asks for a
floor it does not hold through a provider handed to it at campaign setup; generation
answers. Exploration never learns that a generator exists, and the floor it receives is
cached and saved from then on, so a floor is still built exactly once.

**Generation is the floor's first stocking, not a re-stocking.** A floor the party has
never left has no departure recorded against it, so arriving on a newly built floor
re-stocks nothing. The monsters standing in it on the first visit are the ones
generation put there.

**A connector names a rule, not a coordinate.** Floor A's stairs down cannot name a
tile on floor B, because B does not exist when A is built. Instead a connector carries
the destination floor and an *arrival rule*, resolved against the destination once it
exists:

| Rule | Arrives at | Used by |
|---|---|---|
| `STAIRS_UP` | the destination's matching upward staircase | stairs down |
| `RANDOM_ROOM` | a tile drawn from any room on the destination | pits, and later teleports |

Descending a staircase therefore lands the party on the staircase back up, which is
what makes a descent retraceable. Falling down a pit lands them somewhere in the dark
with no way back, which is what makes a pit a hazard rather than a shortcut.

Every floor holds at least one upward staircase, so `STAIRS_UP` can always be resolved.

## Re-stocking

Exploration decides *when* a floor is re-stocked and by how much; generation answers
*what* refills it. Given a floor and how long the party was away, generation returns
the room contents to place.

It never touches the layout and never touches a trap. Re-stocking is derived from the
floor's own seed combined with a re-stocking counter, so the same floor re-stocked
twice after the same absence gives the same result, and a floor visited repeatedly does
not converge on one arrangement.

## Decisions & Alternatives

| Decision | Chosen | Alternatives Considered | Rationale |
|---|---|---|---|
| Randomness | A seeded generator passed explicitly into every call | A module-level generator; `Math.random` | The HLD makes reproducibility a falsification signal. An explicit generator also lets a test assert a property across a thousand seeds, which is the only way a generator can be meaningfully tested. |
| Room placement | Recursive splitting, one room per leaf region | Scattering rooms and rejecting overlaps; cellular automata caves | A split cannot overlap, so there is no rejection loop that can fail or run long on an unlucky seed. Caves suit a different genre; this one wants rooms and corridors. |
| Connectivity | Guaranteed by construction, joining sibling regions | Generating freely, then detecting and repairing disconnection | A repair pass is a second generator with its own failure modes. A floor that cannot come out disconnected needs no check. |
| Loops | Extra connections drawn from the archetype | Leaving the corridor tree as-is | One route between any two points makes a floor tedious and trivially mapped. Loops are what make a map worth drawing. |
| Secret doors | Only on loop connections, and never the last open route into a region | Anywhere; loop connections without the further check | Restricting to loops is not enough on its own — two loops into the same region could both turn secret and seal it again. The invariant is that every region keeps a route in that is neither secret nor locked. |
| Room count | A target the generator approaches, not a contract | Failing when an archetype cannot be satisfied | An archetype asking for more rooms than a floor can hold should give a smaller floor, not an error. Generation has no good way to refuse. |
| Arrival | A rule carried by the connector, resolved at the destination | Coordinates named by the source connector | A source floor cannot name a tile on a floor that does not exist yet. Descending to the matching upward staircase is also a rule, not a coordinate — it says what the arrival means. |
| Lazy floors | Requested through a provider exploration is handed | Exploration calling generation; generating every floor up front | Exploration already takes its neighbours as injected hooks. A provider keeps the boundary intact and leaves the generated floor cached and saved thereafter. |
| Floor building | Lazily, the first time the party would arrive | Building every floor when the campaign starts | A campaign should not pay to build levels nobody visits, and the plan already guarantees the connector's destination exists. |
| Plan versus floors | The graph is fixed first, floors filled in later | Deciding each floor's exits as it is generated | Deciding exits during generation means a connector can point at a floor whose archetype is not yet chosen, or at nothing at all. |
| Re-stocking seed | The floor seed combined with a re-stocking counter | Re-running generation; drawing fresh randomness each time | Re-running generation would rewrite the layout the party has mapped. A counter keeps each re-stocking reproducible while stopping a floor converging on one arrangement. |

## Open Questions & Future Decisions

### Resolved

1. ✅ **The seed is the floor** — identical seed and archetype give an identical floor, always.
2. ✅ **Layout and traps are frozen** at generation; only room contents are ever refilled.
3. ✅ **Connectivity is guaranteed by construction**, not checked and repaired.
4. ✅ **Archetypes are ranges**, and hold no absolute coordinates.
5. ✅ **Secret doors only ever sit on loop connections**, never on the sole route to anywhere.
6. ✅ **The dungeon plan fixes the floor graph first**; floors are generated lazily.
7. ✅ **Re-stocking derives from the floor seed plus a counter**, never from re-running generation.
8. ✅ **Generation is a floor's first stocking.** Arriving on a newly built floor re-stocks nothing.
9. ✅ **Room count is a target**, not a guarantee — a small floor delivers what fits.
10. ✅ **Every region keeps a route in that is neither secret nor locked.**
11. ✅ **Connectors carry an arrival rule**, resolved against the destination once it exists.
12. ✅ **Every floor holds an upward staircase**, so a descent is always retraceable.

### Deferred

1. **Themed floors.** Archetypes currently bound quantities, not character — no crypts that differ from caverns in anything but numbers.
2. **Set pieces.** A hand-authored room dropped into a generated floor — a boss chamber, a vault — has no mechanism.
3. **Loot placement.** Generation places traps and connectors but nothing worth carrying; the loot segment does not exist.
4. **Enemy placement.** Generation reports what should refill a room, but the roaming-enemy segment that consumes it does not exist yet, so the shape of that answer is provisional.
5. **Archetype progression.** Nothing decides which archetype a floor at a given depth should use, or how a campaign escalates.
6. **Floor size versus drawn depth.** A long straight corridor beyond the maximum drawn depth is invisible past its limit; whether archetypes should avoid sightlines that long is untested.

## References

- `docs/high-level-design.md` — procedural content within authored guidelines.
- `docs/intent/exploration/exploration-design.md` — the floor model generation fills in, and the re-stocking it serves.
