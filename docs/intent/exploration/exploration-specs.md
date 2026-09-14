# Exploration — EARS Specs

Specs for the exploration segment. Design: `exploration-design.md`.

Numbers that want balancing — light radii, torch duration, the size of the dim-light
detection penalty, the re-stocking curve — are deliberately absent. These specs assert
the relationships between values; the values themselves live in content data, so
tuning the game does not rewrite its specs.

## Floor representation

- [x] **EXPLORE-FLOOR-001**: The system shall represent a dungeon floor as a rectangular grid of tiles whose width and height are set per floor.
- [x] **EXPLORE-FLOOR-002**: The system shall store each edge between two tiles exactly once, in an array shared by both tiles.
- [x] **EXPLORE-FLOOR-003**: The system shall set every edge on the outermost ring of a floor to `wall`.
- [x] **EXPLORE-FLOOR-004**: The system shall give every edge exactly one kind from: `open`, `wall`, `door`, `lockedDoor`, `secretDoor`.
- [x] **EXPLORE-FLOOR-005**: The system shall record an open-or-closed state for every `door` and `lockedDoor` edge.
- [x] **EXPLORE-FLOOR-006**: The system shall give every tile exactly one feature from: `none`, `stairsUp`, `stairsDown`, `pit`.
- [x] **EXPLORE-FLOOR-007**: The system shall give every tile an intrinsic light level of `bright`, `dim`, or `dark`.
- [x] **EXPLORE-FLOOR-008**: The system shall identify each floor by a stable id, and each connector (stairs or pit) shall name its destination by target floor id and an arrival rule rather than a target tile, since the destination floor may not exist yet.
- [x] **EXPLORE-FLOOR-012**: When the party needs a floor the simulation does not hold, the system shall request it once from the floor provider it was given, and shall hold and save it thereafter.
- [x] **EXPLORE-FLOOR-009**: Where a floor's depth is shown to the player, the system shall display a stored label rather than a value computed from the floor id.
- [x] **EXPLORE-FLOOR-011**: The system shall permit a connector to exist with no return connector at its destination, so a `pit` may drop the party onto a tile offering no way back.
- [D] **EXPLORE-FLOOR-010**: The system shall support tile features that alter the party's facing or position without a step (spinners, teleporters).

## The clock

- [x] **EXPLORE-CLOCK-001**: When the party enters a new tile, the system shall advance the clock by the party's step cost.
- [x] **EXPLORE-CLOCK-010**: The system shall derive the party's step cost from the average Dexterity of its conscious members, bounded between a floor and a ceiling defined in content data.
- [x] **EXPLORE-CLOCK-011**: The system shall never give a party of higher average Dexterity a greater step cost than one of lower average Dexterity.
- [x] **EXPLORE-CLOCK-002**: When the party searches its current tile, the system shall advance the clock by one tick.
- [x] **EXPLORE-CLOCK-003**: When the party relights a doused light source during exploration, the system shall advance the clock by one tick.
- [x] **EXPLORE-CLOCK-004**: When a camp action completes, the system shall advance the clock by the number of ticks the camp segment specifies for that action.
- [x] **EXPLORE-CLOCK-005**: While combat is active, the system shall not advance the clock for any reason.
- [x] **EXPLORE-CLOCK-006**: When the party turns in any direction, the system shall not advance the clock.
- [x] **EXPLORE-CLOCK-007**: If a step is blocked, then the system shall not advance the clock.
- [x] **EXPLORE-CLOCK-008**: While the automap, inventory, or any menu is open, the system shall not advance the clock.
- [x] **EXPLORE-CLOCK-009**: The system shall permit only the exploration segment to write the tick counter, including when the camp segment requests an advance.

## Movement

- [x] **EXPLORE-MOVE-001**: The system shall accept exactly four movement verbs during exploration: `STEP_FORWARD`, `TURN_LEFT`, `TURN_RIGHT`, `TURN_AROUND`.
- [x] **EXPLORE-MOVE-002**: When the party turns, the system shall rotate its facing by the verb's angle (90° counter-clockwise, 90° clockwise, or 180°) and shall leave its tile unchanged.
- [x] **EXPLORE-MOVE-003**: If the edge between the party's tile and its target tile is `wall`, then the system shall block the step.
- [x] **EXPLORE-MOVE-004**: If that edge is a `lockedDoor` and the party does not hold the matching key, then the system shall block the step.
- [x] **EXPLORE-MOVE-005**: If that edge is an undiscovered `secretDoor`, then the system shall block the step and shall present the outcome identically to a `wall`.
- [x] **EXPLORE-MOVE-006**: If a step is blocked, then the system shall leave the party's tile, the clock, and every step side effect unchanged.
- [x] **EXPLORE-MOVE-007**: When the party steps through a closed `door`, or through a `lockedDoor` while holding its matching key, or through a discovered `secretDoor`, the system shall set that edge open and shall not charge a tick beyond the step's own.
- [x] **EXPLORE-MOVE-008**: When a step succeeds, the system shall resolve its effects in this order: move the party, advance the clock, resolve the tile feature, re-stock the floor if the party has arrived on one it previously left, fire the trap trigger hook, recompute sight and record discovery, move roaming enemies, check contact.
- [ ] **EXPLORE-MOVE-019**: When roaming enemies move, the system shall give each the ticks the step consumed to spend against its own cost to cross a tile, carrying any remainder forward.
- [x] **EXPLORE-MOVE-009**: When the party enters a tile whose feature is `pit`, the system shall relocate the party to that connector's destination floor, at the tile its arrival rule resolves to, without asking for confirmation.
- [x] **EXPLORE-MOVE-015**: When the party attempts to step onto a tile whose feature is `stairsUp` or `stairsDown`, the system shall raise a confirmation before moving the party.
- [x] **EXPLORE-MOVE-016**: When the player confirms a staircase prompt, the system shall relocate the party to that connector's destination floor, at the tile its arrival rule resolves to on that floor.
- [x] **EXPLORE-MOVE-017**: If the player declines a staircase prompt, then the system shall leave the party on its current tile and shall not advance the clock.
- [x] **EXPLORE-MOVE-018**: While the party occupies a tile whose feature is `stairsUp` or `stairsDown` (having arrived by relocation rather than by stepping), the system shall offer that staircase as an `INTERACT` target.
- [x] **EXPLORE-MOVE-010**: When a relocation occurs mid-step, the system shall resolve re-stocking, the trap trigger hook, sight, roaming enemy movement, and contact check against the floor and tile the party occupies after relocating.
- [x] **EXPLORE-MOVE-011**: When a step relocates the party through a `pit`, the system shall advance the clock by one tick for the whole step.
- [x] **EXPLORE-MOVE-012**: If a relocation lands the party on a tile whose feature is also a `pit`, then the system shall not resolve that pit until the party's next step, which it claims in place of a move.
- [x] **EXPLORE-MOVE-013**: When the party moves between floors by any connector, the system shall preserve its facing.
- [D] **EXPLORE-MOVE-014**: When the player selects a discovered tile on the automap, the system shall walk the party there, interrupting on an encounter, a trap, or the loss of light.

## Light

- [x] **EXPLORE-LIGHT-001**: The system shall resolve every tile to exactly one light level: `bright`, `dim`, or `dark`.
- [x] **EXPLORE-LIGHT-002**: The system shall resolve a tile's light level as the brighter of its intrinsic level and the level projected onto it by the party's lit sources.
- [x] **EXPLORE-LIGHT-003**: The system shall project `bright` onto tiles within a lit source's bright radius, and `dim` onto tiles beyond that radius but within its dim radius.
- [x] **EXPLORE-LIGHT-004**: The system shall give every light source a bright radius smaller than its dim radius.
- [x] **EXPLORE-LIGHT-005**: The system shall track each light source the party carries as a separate instance with its own remaining ticks and lit state.
- [x] **EXPLORE-LIGHT-006**: The system shall keep at most one of the party's light sources lit at any time.
- [x] **EXPLORE-LIGHT-007**: When the clock advances by one tick, the system shall reduce the lit source's remaining ticks by one and shall leave unlit sources unchanged.
- [x] **EXPLORE-LIGHT-008**: When a lit source's remaining ticks reach zero, the system shall mark it spent and light the party's next unspent source if one is carried.
- [x] **EXPLORE-LIGHT-009**: If an external effect douses the party's lit source, then the system shall not light another source automatically.
- [x] **EXPLORE-LIGHT-010**: When the party relights a doused source during combat, the system shall consume the acting character's action for that round.
- [x] **EXPLORE-LIGHT-013**: When the party relights a doused source, the system shall relight that same instance with its remaining ticks intact rather than consuming another source.
- [x] **EXPLORE-LIGHT-014**: While the party is camped, the system shall keep every carried light source unlit, so that the ticks a camp consumes do not reduce any source's remaining ticks.
- [x] **EXPLORE-LIGHT-015**: When the party breaks camp, the system shall relight the source that was lit when camp began, if the party still carries it.
- [ ] **EXPLORE-LIGHT-011**: The system shall not vary encounter rate with the party's light level.
- [ ] **EXPLORE-LIGHT-012**: The system shall not vary any enemy's awareness of the party with the party's light level.

## Sight and discovery

- [x] **EXPLORE-SIGHT-001**: When recomputing sight, the system shall consider only tiles lying within 45° either side of the party's facing, a 90° cone in total.
- [x] **EXPLORE-SIGHT-002**: When tracing sight toward a tile, the system shall treat the tile as unseen if any edge the traced line crosses is opaque — a `wall`, a closed `door` or `lockedDoor`, or an undiscovered `secretDoor`.
- [x] **EXPLORE-SIGHT-012**: The system shall trace sight along a straight line from the centre of the party's tile to the centre of the candidate tile, so that a tile around a corner is not seen until the party can look along it.
- [x] **EXPLORE-SIGHT-013**: Where a traced line passes exactly through the corner point shared by four tiles, the system shall treat the line as blocked only if both ways around that corner are blocked.
- [x] **EXPLORE-SIGHT-003**: While the party's own tile is not `dark`, the system shall treat that tile and its four edges as seen regardless of facing.
- [x] **EXPLORE-SIGHT-004**: When sight reaches a tile resolved to `dim` or `bright`, the system shall mark that tile, its four edges, and its feature discovered.
- [x] **EXPLORE-SIGHT-005**: When sight discovers a tile, the system shall leave any undiscovered `secretDoor` among that tile's edges undiscovered.
- [x] **EXPLORE-SIGHT-006**: While a tile is resolved to `dim`, the system shall not reveal any enemy standing on it.
- [x] **EXPLORE-SIGHT-007**: While the party's tile is resolved to `dim`, the system shall apply a detection penalty to both trap detection and secret-door detection.
- [x] **EXPLORE-SIGHT-008**: While a tile is resolved to `dark`, the system shall record no discovery for it and shall reveal nothing standing on it.
- [x] **EXPLORE-SIGHT-011**: When the party turns, the system shall recompute sight and record what the new facing reveals, even though turning advances no tick.
- [x] **EXPLORE-SIGHT-010**: When the trap segment reports a trap detected, the system shall record that trap as known in the floor's discovery record.
- [x] **EXPLORE-SIGHT-009**: The system shall retain each tile's discovered state for the life of the save, across floor changes, save reloads, and party death.

## The corridor ahead

- [x] **EXPLORE-VIEW-001**: The system shall report, for each depth ahead of the party, whether the tile at that depth is walled to the party's left and to the party's right.
- [x] **EXPLORE-VIEW-002**: The system shall report, for each depth ahead of the party, the feature standing on the tile at that depth.
- [x] **EXPLORE-VIEW-003**: The system shall report, for each depth ahead of the party, the resolved light level of the tile at that depth.
- [x] **EXPLORE-VIEW-004**: When reporting the corridor ahead, the system shall treat an edge as blocking if and only if sight treats it as opaque -- a `wall`, a closed `door` or `lockedDoor`, or an undiscovered `secretDoor`.
- [x] **EXPLORE-VIEW-005**: When the approach to a depth is blocked, the system shall report that depth as closed ahead and shall report no greater depth.
- [x] **EXPLORE-VIEW-006**: When a depth resolves to `dark`, the system shall report that depth as dark and shall report no depth beyond it, so the view has a boundary to fade into rather than an abrupt end.
- [x] **EXPLORE-VIEW-007**: The system shall report no depth greater than the maximum drawn depth, however far the party's light reaches.
- [x] **EXPLORE-VIEW-008**: The system shall report the corridor ahead relative to the party's current facing, so the same tile is reported as walled left or walled right according to which way the party looks.

## Automap

- [x] **EXPLORE-MAP-001**: The system shall draw on the automap only those tiles, edges, and features that have been discovered.
- [x] **EXPLORE-MAP-002**: The system shall draw traps the party has found on the automap.
- [x] **EXPLORE-MAP-003**: The system shall not draw undiscovered secret doors on the automap.
- [x] **EXPLORE-MAP-004**: While a roaming enemy occupies a tile resolved to `bright`, the system shall draw that enemy on the automap.
- [x] **EXPLORE-MAP-005**: While a roaming enemy occupies a tile not resolved to `bright`, the system shall draw no marker for it on the automap, at its current or any previously seen position.
- [x] **EXPLORE-MAP-006**: While the party's tile is resolved to `dark`, the system shall draw the automap without the party's position or facing marker.
- [x] **EXPLORE-MAP-007**: While the party's tile is not resolved to `dark`, the system shall draw the party's tile and facing on the automap.
- [x] **EXPLORE-MAP-008**: The system shall make the automap available without requiring any item, spell, or character class.
- [x] **EXPLORE-MAP-009**: The system shall draw the automap and the first-person view from the same party tile and facing, so the two can never disagree.
- [D] **EXPLORE-MAP-010**: The system shall allow the player to place notes and icons on the automap.

## Returning to a floor

- [x] **EXPLORE-RETURN-001**: When the party leaves a floor, the system shall record the current tick against that floor.
- [ ] **EXPLORE-RETURN-002**: While the party is not on a floor, the system shall not move that floor's roaming enemies, change its door states, or restock its rooms.
- [x] **EXPLORE-RETURN-003**: When the party arrives on a floor it has previously left, the system shall apply a re-stocking scaled to the ticks elapsed since that floor's recorded departure.
- [ ] **EXPLORE-RETURN-004**: When a re-stocking runs, the system shall reposition the floor's roaming enemies, change door open states, and refill some previously cleared rooms.
- [ ] **EXPLORE-RETURN-005**: When a re-stocking runs, the system shall leave the floor's discovery record unchanged.
- [ ] **EXPLORE-RETURN-009**: When a re-stocking runs, the system shall leave every trap on the floor unchanged — undiscovered traps stay undiscovered, known traps stay known, and sprung traps stay sprung.
- [ ] **EXPLORE-RETURN-010**: The system shall lay a floor's traps once, when the floor is generated, and shall never add or remove a trap thereafter.
- [ ] **EXPLORE-RETURN-006**: When a re-stocking runs, the system shall leave the floor's dimensions, edge kinds, and tile features unchanged.
- [x] **EXPLORE-RETURN-007**: When the party returns to a floor after fewer elapsed ticks than the minimum threshold defined in content data, the system shall apply no re-stocking.
- [ ] **EXPLORE-RETURN-008**: When two returns to the same floor differ in elapsed ticks, the system shall apply the larger re-stocking to the longer absence.

## Persistence

- [x] **EXPLORE-SAVE-001**: The system shall save every generated floor, including floors the party does not currently occupy.
- [x] **EXPLORE-SAVE-002**: The system shall generate any given floor exactly once and shall never regenerate it.
- [x] **EXPLORE-SAVE-003**: The system shall save, for each floor: id, dimensions, edge arrays, tile features, intrinsic light levels, discovery record, door open states, known traps, and the tick at which the party last left it.
- [x] **EXPLORE-SAVE-004**: The system shall save the party's current floor, tile, and facing, and the tick counter.
- [x] **EXPLORE-SAVE-005**: The system shall save each carried light source as a separate instance with its remaining ticks and lit state.
- [x] **EXPLORE-SAVE-006**: The system shall store each floor's tile discovery record as one bit per tile.

## Party actions

- [x] **EXPLORE-ACTION-001**: The system shall accept six party actions during exploration: `PARTY`, `INVENTORY`, `SPELLS`, `SEARCH`, `INTERACT`, and `TOGGLE_MAP`.
- [x] **EXPLORE-ACTION-002**: When the player opens a party action, the system shall not advance the clock.
- [x] **EXPLORE-ACTION-003**: When the player commits to a party action — equipping or using an item, casting a spell, searching a tile, or working a dungeon feature — the system shall advance the clock by one tick.
- [x] **EXPLORE-ACTION-004**: The system shall not advance the clock for `TOGGLE_MAP` under any circumstance.
- [x] **EXPLORE-ACTION-005**: When the player selects `INTERACT`, the system shall offer only features present on the party's current tile.
- [x] **EXPLORE-ACTION-006**: While the party is in combat, the system shall not accept any exploration movement verb or party action.

## Input

- [x] **EXPLORE-INPUT-001**: The system shall expose every movement verb and every party action — `STEP_FORWARD`, `TURN_LEFT`, `TURN_RIGHT`, `TURN_AROUND`, `PARTY`, `INVENTORY`, `SPELLS`, `SEARCH`, `INTERACT`, `TOGGLE_MAP` — through both a keyboard path and a touch path.
- [x] **EXPLORE-INPUT-002**: The system shall produce an identical action for a given verb whether it originated from keyboard or from touch.
- [x] **EXPLORE-INPUT-003**: The system shall not expose to the simulation which input device produced an action.

## Segment boundaries

- [ ] **EXPLORE-BOUND-001**: When a roaming enemy occupies the party's tile at a step's contact check, the system shall begin an encounter.
- [ ] **EXPLORE-BOUND-002**: When an encounter begins, the system shall hand combat a payload naming the enemy group, the light level of the encounter tile, and which side was aware of the other.
- [ ] **EXPLORE-BOUND-003**: The system shall change character hit points, status, and death state only through the party segment's operations, from exploration and from combat alike.
- [ ] **EXPLORE-BOUND-004**: The system shall not mutate a floor's dimensions, edge kinds, or tile features after generation produces them.
- [x] **EXPLORE-BOUND-005**: When the party enters a tile, the system shall fire the trap trigger hook with that tile and the party.
- [x] **EXPLORE-BOUND-006**: When the clock advances, the system shall notify the hunger segment of the number of ticks elapsed.
- [x] **EXPLORE-BOUND-007**: When the party searches its current tile, the system shall fire the trap detection hook with that tile, the party, and the tile's resolved light level.
- [x] **EXPLORE-BOUND-008**: When sight is recomputed, the system shall fire the trap detection hook for the tiles it reached, with the party and each tile's resolved light level.
- [x] **EXPLORE-BOUND-009**: The system shall route each party action to the segment that owns it and shall hold no rules of its own for `PARTY`, `INVENTORY`, `SPELLS`, `SEARCH`, or `INTERACT`.
