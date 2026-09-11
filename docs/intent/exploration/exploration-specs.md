# Exploration — EARS Specs

Specs for the exploration segment. Design: `exploration-design.md`.

Numbers that want balancing — light radii, torch duration, the size of the dim-light
detection penalty, the shake-up curve — are deliberately absent. These specs assert
the relationships between values; the values themselves live in content data, so
tuning the game does not rewrite its specs.

## Floor representation

- [ ] **EXPLORE-FLOOR-001**: The system shall represent a dungeon floor as a rectangular grid of tiles whose width and height are set per floor.
- [ ] **EXPLORE-FLOOR-002**: The system shall store each edge between two tiles exactly once, in an array shared by both tiles.
- [ ] **EXPLORE-FLOOR-003**: The system shall set every edge on the outermost ring of a floor to `wall`.
- [ ] **EXPLORE-FLOOR-004**: The system shall give every edge exactly one kind from: `open`, `wall`, `door`, `lockedDoor`, `secretDoor`.
- [ ] **EXPLORE-FLOOR-005**: The system shall record an open-or-closed state for every `door` and `lockedDoor` edge.
- [ ] **EXPLORE-FLOOR-006**: The system shall give every tile exactly one feature from: `none`, `stairsUp`, `stairsDown`, `pit`.
- [ ] **EXPLORE-FLOOR-007**: The system shall give every tile an intrinsic light level of `bright`, `dim`, or `dark`.
- [ ] **EXPLORE-FLOOR-008**: The system shall identify each floor by a stable id, and each connector (stairs or pit) shall name its destination by target floor id and target tile.
- [ ] **EXPLORE-FLOOR-009**: Where a floor's depth is shown to the player, the system shall display a stored label rather than a value computed from the floor id.
- [ ] **EXPLORE-FLOOR-011**: The system shall permit a connector to exist with no return connector at its destination, so a `pit` may drop the party onto a tile offering no way back.
- [D] **EXPLORE-FLOOR-010**: The system shall support tile features that alter the party's facing or position without a step (spinners, teleporters).

## The clock

- [ ] **EXPLORE-CLOCK-001**: When the party enters a new tile, the system shall advance the clock by one tick.
- [ ] **EXPLORE-CLOCK-002**: When the party searches its current tile, the system shall advance the clock by one tick.
- [ ] **EXPLORE-CLOCK-003**: When the party relights a doused light source during exploration, the system shall advance the clock by one tick.
- [ ] **EXPLORE-CLOCK-004**: When a camp action completes, the system shall advance the clock by the number of ticks the camp segment specifies for that action.
- [ ] **EXPLORE-CLOCK-005**: While combat is active, the system shall not advance the clock for any reason.
- [ ] **EXPLORE-CLOCK-006**: When the party turns in any direction, the system shall not advance the clock.
- [ ] **EXPLORE-CLOCK-007**: If a step is blocked, then the system shall not advance the clock.
- [ ] **EXPLORE-CLOCK-008**: While the automap, inventory, or any menu is open, the system shall not advance the clock.
- [ ] **EXPLORE-CLOCK-009**: The system shall permit only the exploration segment to write the tick counter, including when the camp segment requests an advance.

## Movement

- [ ] **EXPLORE-MOVE-001**: The system shall accept exactly four movement verbs during exploration: `STEP_FORWARD`, `TURN_LEFT`, `TURN_RIGHT`, `TURN_AROUND`.
- [ ] **EXPLORE-MOVE-002**: When the party turns, the system shall rotate its facing by the verb's angle (90° counter-clockwise, 90° clockwise, or 180°) and shall leave its tile unchanged.
- [ ] **EXPLORE-MOVE-003**: If the edge between the party's tile and its target tile is `wall`, then the system shall block the step.
- [ ] **EXPLORE-MOVE-004**: If that edge is a `lockedDoor` and the party does not hold the matching key, then the system shall block the step.
- [ ] **EXPLORE-MOVE-005**: If that edge is an undiscovered `secretDoor`, then the system shall block the step and shall present the outcome identically to a `wall`.
- [ ] **EXPLORE-MOVE-006**: If a step is blocked, then the system shall leave the party's tile, the clock, and every step side effect unchanged.
- [ ] **EXPLORE-MOVE-007**: When the party steps through a closed `door`, or through a `lockedDoor` while holding its matching key, or through a discovered `secretDoor`, the system shall set that edge open and shall not charge a tick beyond the step's own.
- [ ] **EXPLORE-MOVE-008**: When a step succeeds, the system shall resolve its effects in this order: move the party, advance the clock, resolve the tile feature, fire the trap hook, recompute sight and record discovery, move roaming enemies, check contact.
- [ ] **EXPLORE-MOVE-009**: When the party enters a tile whose feature is `pit`, the system shall relocate the party to that connector's target floor and tile.
- [ ] **EXPLORE-MOVE-010**: When a relocation occurs mid-step, the system shall resolve the trap hook, sight, roaming enemy movement, and contact check against the tile the party occupies after relocating.
- [ ] **EXPLORE-MOVE-011**: When a step relocates the party through a `pit`, the system shall advance the clock by one tick for the whole step.
- [ ] **EXPLORE-MOVE-012**: If a relocation lands the party on a tile whose feature is also a connector, then the system shall not resolve that feature until the party's next step.
- [ ] **EXPLORE-MOVE-013**: When the party moves between floors by any connector, the system shall preserve its facing.
- [D] **EXPLORE-MOVE-014**: When the player selects a discovered tile on the automap, the system shall walk the party there, interrupting on an encounter, a trap, or the loss of light.

## Light

- [ ] **EXPLORE-LIGHT-001**: The system shall resolve every tile to exactly one light level: `bright`, `dim`, or `dark`.
- [ ] **EXPLORE-LIGHT-002**: The system shall resolve a tile's light level as the brighter of its intrinsic level and the level projected onto it by the party's lit sources.
- [ ] **EXPLORE-LIGHT-003**: The system shall project `bright` onto tiles within a lit source's bright radius, and `dim` onto tiles beyond that radius but within its dim radius.
- [ ] **EXPLORE-LIGHT-004**: The system shall give every light source a bright radius smaller than its dim radius.
- [ ] **EXPLORE-LIGHT-005**: The system shall track each light source the party carries as a separate instance with its own remaining ticks and lit state.
- [ ] **EXPLORE-LIGHT-006**: The system shall keep at most one of the party's light sources lit at any time.
- [ ] **EXPLORE-LIGHT-007**: When the clock advances by one tick, the system shall reduce the lit source's remaining ticks by one and shall leave unlit sources unchanged.
- [ ] **EXPLORE-LIGHT-008**: When a lit source's remaining ticks reach zero, the system shall mark it spent and light the party's next unspent source if one is carried.
- [ ] **EXPLORE-LIGHT-009**: If an external effect douses the party's lit source, then the system shall not light another source automatically.
- [ ] **EXPLORE-LIGHT-010**: When the party relights a doused source during combat, the system shall consume the acting character's action for that round.
- [ ] **EXPLORE-LIGHT-011**: The system shall not vary encounter rate with the party's light level.
- [ ] **EXPLORE-LIGHT-012**: The system shall not vary any enemy's awareness of the party with the party's light level.

## Sight and discovery

- [ ] **EXPLORE-SIGHT-001**: When recomputing sight, the system shall consider only tiles whose direction from the party's tile is within 90° of the party's facing.
- [ ] **EXPLORE-SIGHT-002**: When tracing sight toward a tile, the system shall stop at the first opaque edge — a `wall`, a closed `door` or `lockedDoor`, or an undiscovered `secretDoor`.
- [ ] **EXPLORE-SIGHT-003**: While the party's own tile is not `dark`, the system shall treat that tile and its four edges as seen regardless of facing.
- [ ] **EXPLORE-SIGHT-004**: When sight reaches a tile resolved to `dim` or `bright`, the system shall mark that tile, its four edges, and its feature discovered.
- [ ] **EXPLORE-SIGHT-005**: When sight discovers a tile, the system shall leave any undiscovered `secretDoor` among that tile's edges undiscovered.
- [ ] **EXPLORE-SIGHT-006**: While a tile is resolved to `dim`, the system shall not reveal any enemy standing on it.
- [ ] **EXPLORE-SIGHT-007**: While the party's tile is resolved to `dim`, the system shall apply a detection penalty to both trap detection and secret-door detection.
- [ ] **EXPLORE-SIGHT-008**: While a tile is resolved to `dark`, the system shall record no discovery for it and shall reveal nothing standing on it.
- [ ] **EXPLORE-SIGHT-010**: When the trap segment reports a trap detected, the system shall record that trap as known in the floor's discovery record.
- [ ] **EXPLORE-SIGHT-009**: The system shall retain each tile's discovered state for the life of the save, across floor changes, save reloads, and party death.

## Automap

- [ ] **EXPLORE-MAP-001**: The system shall draw on the automap only those tiles, edges, and features that have been discovered.
- [ ] **EXPLORE-MAP-002**: The system shall draw traps the party has found on the automap.
- [ ] **EXPLORE-MAP-003**: The system shall not draw undiscovered secret doors on the automap.
- [ ] **EXPLORE-MAP-004**: While a roaming enemy occupies a tile resolved to `bright`, the system shall draw that enemy on the automap.
- [ ] **EXPLORE-MAP-005**: While a roaming enemy occupies a tile not resolved to `bright`, the system shall draw no marker for it on the automap, at its current or any previously seen position.
- [ ] **EXPLORE-MAP-006**: While the party's tile is resolved to `dark`, the system shall draw the automap without the party's position or facing marker.
- [ ] **EXPLORE-MAP-007**: While the party's tile is not resolved to `dark`, the system shall draw the party's tile and facing on the automap.
- [ ] **EXPLORE-MAP-008**: The system shall make the automap available without requiring any item, spell, or character class.
- [ ] **EXPLORE-MAP-009**: The system shall draw the automap and the first-person view from the same party tile and facing, so the two can never disagree.
- [D] **EXPLORE-MAP-010**: The system shall allow the player to place notes and icons on the automap.

## Returning to a floor

- [ ] **EXPLORE-RETURN-001**: When the party leaves a floor, the system shall record the current tick against that floor.
- [ ] **EXPLORE-RETURN-002**: While the party is not on a floor, the system shall not move that floor's roaming enemies, change its door states, or restock its rooms.
- [ ] **EXPLORE-RETURN-003**: When the party arrives on a floor it has previously left, the system shall apply a shake-up scaled to the ticks elapsed since that floor's recorded departure.
- [ ] **EXPLORE-RETURN-004**: When a shake-up runs, the system shall reposition the floor's roaming enemies, change door open states, and restock some previously cleared rooms.
- [ ] **EXPLORE-RETURN-005**: When a shake-up runs, the system shall leave the floor's discovery record unchanged.
- [ ] **EXPLORE-RETURN-006**: When a shake-up runs, the system shall leave the floor's dimensions, edge kinds, and tile features unchanged.
- [ ] **EXPLORE-RETURN-007**: When the party returns to a floor after fewer elapsed ticks than the minimum threshold defined in content data, the system shall apply no shake-up.
- [ ] **EXPLORE-RETURN-008**: When two returns to the same floor differ in elapsed ticks, the system shall apply the larger shake-up to the longer absence.

## Persistence

- [ ] **EXPLORE-SAVE-001**: The system shall save every generated floor, including floors the party does not currently occupy.
- [ ] **EXPLORE-SAVE-002**: The system shall generate any given floor exactly once and shall never regenerate it.
- [ ] **EXPLORE-SAVE-003**: The system shall save, for each floor: id, dimensions, edge arrays, tile features, intrinsic light levels, discovery record, door open states, known traps, and the tick at which the party last left it.
- [ ] **EXPLORE-SAVE-004**: The system shall save the party's current floor, tile, and facing, and the tick counter.
- [ ] **EXPLORE-SAVE-005**: The system shall save each carried light source as a separate instance with its remaining ticks and lit state.
- [ ] **EXPLORE-SAVE-006**: The system shall store each floor's tile discovery record as one bit per tile.

## Input

- [ ] **EXPLORE-INPUT-001**: The system shall expose `STEP_FORWARD`, `TURN_LEFT`, `TURN_RIGHT`, `TURN_AROUND`, `SEARCH`, and `TOGGLE_MAP` through both a keyboard path and a touch path.
- [ ] **EXPLORE-INPUT-002**: The system shall produce an identical action for a given verb whether it originated from keyboard or from touch.
- [ ] **EXPLORE-INPUT-003**: The system shall not expose to the simulation which input device produced an action.

## Segment boundaries

- [ ] **EXPLORE-BOUND-001**: When a roaming enemy occupies the party's tile at a step's contact check, the system shall begin an encounter.
- [ ] **EXPLORE-BOUND-002**: When an encounter begins, the system shall hand combat a payload naming the enemy group, the light level of the encounter tile, and which side was aware of the other.
- [ ] **EXPLORE-BOUND-003**: The system shall change character hit points, status, and death state only through the party segment's operations, from exploration and from combat alike.
- [ ] **EXPLORE-BOUND-004**: The system shall not mutate a floor's dimensions, edge kinds, or tile features after generation produces them.
- [ ] **EXPLORE-BOUND-005**: When the party enters a tile, the system shall fire the trap hook with that tile and the party, flagged as a passive check.
- [ ] **EXPLORE-BOUND-006**: When the clock advances, the system shall notify the hunger segment of the number of ticks elapsed.
- [ ] **EXPLORE-BOUND-007**: When the party searches its current tile, the system shall fire the trap hook with that tile and the party, flagged as a deliberate search.
