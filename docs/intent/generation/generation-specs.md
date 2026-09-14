# Dungeon Generation — EARS Specs

Specs for the generation segment. Design: `generation-design.md`.

Every quantity a floor is built from — sizes, counts, chances, budgets — lives in
archetypes as data. These specs fix what generation guarantees, never the numbers it
guarantees it with.

## Determinism

- [x] **GEN-SEED-001**: The system shall produce an identical floor for identical seed and archetype, on every call.
- [x] **GEN-SEED-002**: The system shall draw every random value from a generator passed into the call, and shall read no module-level or global source of randomness.
- [x] **GEN-SEED-003**: When a step needs a number of random draws that depends on the data it is working on, the system shall give that step its own generator derived from the parent, so later steps are unaffected by how many draws it made.
- [x] **GEN-SEED-004**: The system shall produce an identical dungeon plan for an identical campaign seed.

## Floor layout

- [x] **GEN-FLOOR-001**: The system shall start generation with every edge of the floor set to `wall`, and shall only ever open edges thereafter.
- [x] **GEN-FLOOR-002**: The system shall choose floor width and height from within the archetype's size range.
- [x] **GEN-FLOOR-003**: The system shall split the floor into regions until the archetype's room count is reached or no region remains large enough to hold a room.
- [x] **GEN-FLOOR-004**: The system shall place at most one room in each leaf region, sized within the archetype's room-size range and inset from the region's boundary.
- [x] **GEN-FLOOR-005**: The system shall treat the archetype's room count as a target rather than a guarantee, delivering fewer rooms when the floor cannot hold that many rather than failing.
- [x] **GEN-FLOOR-006**: The system shall open every interior edge of a room.
- [x] **GEN-FLOOR-007**: The system shall leave every tile that is part of no room and no corridor with all four of its edges walled.

## Connectivity

- [x] **GEN-CONNECT-001**: The system shall carve a corridor joining the rooms of each pair of sibling regions, so that every room is reachable from every other by construction.
- [x] **GEN-CONNECT-002**: The system shall carve each corridor as two straight legs meeting at a single turn, choosing which leg runs first from the seed.
- [x] **GEN-CONNECT-003**: The system shall carve a number of additional connections drawn from the archetype's loop range, between regions that are not siblings.
- [x] **GEN-CONNECT-004**: Every tile belonging to a room or corridor shall be reachable from every other such tile on the floor, ignoring locked and secret doors.

## Doors and secrets

- [x] **GEN-DOOR-001**: Where a carved corridor meets a room's boundary, the system shall make that edge a `door` at the archetype's door chance, and leave it open otherwise.
- [x] **GEN-DOOR-002**: The system shall make a portion of doors `lockedDoor`, drawn at the archetype's locked chance.
- [x] **GEN-DOOR-003**: The system shall make a `secretDoor` only from a connection carved as a loop, never from one joining sibling regions.
- [x] **GEN-DOOR-004**: The system shall leave every region reachable by at least one route that passes through no `secretDoor` and no `lockedDoor`.
- [x] **GEN-DOOR-005**: If making a connection secret would leave a region reachable only through secret or locked doors, then the system shall leave that connection as it is.

## Placement

- [x] **GEN-PLACE-001**: The system shall place at least one `stairsUp` on every floor, so that an arrival by stairs can always be resolved.
- [x] **GEN-PLACE-002**: The system shall place a connector only on a tile belonging to a room or corridor, and never on a tile the party must cross to pass through a doorway.
- [x] **GEN-PLACE-003**: The system shall lay traps numbering within the archetype's trap range.
- [ ] **GEN-PLACE-004**: The system shall lay every trap at generation, and shall neither add nor remove a trap on a floor thereafter.
- [x] **GEN-PLACE-005**: The system shall set every tile's intrinsic light to dark, except the rooms the archetype marks lit.
- [x] **GEN-PLACE-006**: The system shall light the arrival tile of the floor holding the dungeon entrance.

## The dungeon plan

- [x] **GEN-PLAN-001**: The system shall produce the dungeon plan before any floor is generated, naming each floor's id, archetype, and depth label.
- [x] **GEN-PLAN-002**: The system shall name, for every connector in the plan, a destination floor that the plan also contains.
- [x] **GEN-PLAN-003**: The system shall designate exactly one floor in the plan as the entrance, with the tile the campaign begins on.
- [x] **GEN-PLAN-004**: The system shall give a connector a destination floor and an arrival rule rather than a destination tile.
- [x] **GEN-PLAN-005**: The system shall resolve an arrival rule of `STAIRS_UP` to an upward staircase on the destination floor.
- [x] **GEN-PLAN-006**: The system shall resolve an arrival rule of `RANDOM_ROOM` to a tile drawn from a room on the destination floor.
- [x] **GEN-PLAN-007**: The system shall generate a floor the first time it is asked for, and shall return the same floor on every later request.

## Re-stocking

- [x] **GEN-STOCK-001**: When exploration re-stocks a floor, the system shall return the room contents to place, and shall change no edge, no tile feature, and no trap.
- [x] **GEN-STOCK-002**: The system shall derive a re-stocking from the floor's own seed combined with a re-stocking counter, so the same floor re-stocked the same number of times gives the same result.
- [ ] **GEN-STOCK-003**: The system shall produce a different arrangement for successive re-stockings of the same floor, so that a floor visited repeatedly does not settle into one layout of occupants.
- [ ] **GEN-STOCK-004**: The system shall scale how much a re-stocking changes with the ticks the party was absent.

## Deferred

- [D] **GEN-PLACE-007**: The system shall place loot within a floor according to the archetype's loot budget.
- [D] **GEN-FLOOR-008**: The system shall place hand-authored set pieces into a generated floor.
- [D] **GEN-PLAN-008**: The system shall choose a floor's archetype according to its depth in the campaign.
