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

- [x] **GEN-CONNECT-001**: The system shall carve a corridor joining each room to the next in a chain through every room, so that every room is reachable from every other by construction.
- [x] **GEN-CONNECT-002**: The system shall carve each corridor as two straight legs meeting at a single turn, choosing which leg runs first from the seed.
- [x] **GEN-CONNECT-003**: The system shall carve a number of additional connections drawn from the archetype's loop range, each between two rooms chosen from the seed.
- [x] **GEN-CONNECT-004**: Every tile belonging to a room or corridor shall be reachable from every other such tile on the floor, ignoring locked doors.

## Doors

- [x] **GEN-DOOR-001**: Where a carved corridor meets a room's boundary, the system shall make that edge a `door` at the archetype's door chance, and leave it open otherwise.
- [x] **GEN-DOOR-002**: The system shall make a portion of doors `lockedDoor`, drawn at the archetype's locked chance.
- [x] **GEN-DOOR-004**: The system shall leave every region reachable by at least one route that passes through no `lockedDoor`.

## Placement

- [x] **GEN-PLACE-001**: The system shall place at least one `stairsUp` on every floor, so that an arrival by stairs can always be resolved.
- [x] **GEN-PLACE-002**: The system shall place a connector only on a tile belonging to a room or corridor, and never on a tile the party must cross to pass through a doorway.
- [x] **GEN-PLACE-008**: The system shall place no two ways down in the same room, counting a staircase down and a pit connector alike as a way down.
- [x] **GEN-PLACE-009**: When a floor has more ways down than rooms, the system shall place one in each room and no more.
- [x] **GEN-PLACE-007**: The system shall lay chests numbering within the archetype's chest range, on room tiles no connector has claimed and that the party need not cross to pass through a doorway, and where fewer such tiles remain than the number drawn, shall lay as many as fit.
- [x] **GEN-PLACE-010**: The system shall lay chests after every other placement, from a generator derived from the floor's own, so that the number of chests changes nothing else generated.
- [x] **GEN-PLACE-011**: The system shall number each chest on a floor in the order it was laid.
- [x] **GEN-PLACE-012**: The system shall lay every chest at generation, and shall neither add nor remove a chest on a floor thereafter, re-stocking included.
- [x] **GEN-PLACE-013**: The system shall carry on every archetype a chest range and the loot table its chests roll on.

## The dungeon plan

- [x] **GEN-PLAN-001**: The system shall produce the dungeon plan before any floor is generated, naming each floor's id, archetype, and depth label.
- [x] **GEN-PLAN-002**: The system shall name, for every connector in the plan, a destination floor that the plan also contains.
- [x] **GEN-PLAN-003**: The system shall designate exactly one floor in the plan as the entrance, with the arrival rule that sets the tile the campaign begins on.
- [x] **GEN-PLAN-004**: The system shall give a connector a destination floor and an arrival rule rather than a destination tile.
- [x] **GEN-PLAN-005**: The system shall resolve an arrival rule of `STAIRS_UP` to an upward staircase on the destination floor.
- [x] **GEN-PLAN-006**: The system shall resolve an arrival rule of `RANDOM_ROOM` to a tile drawn from a room on the destination floor.
- [x] **GEN-PLAN-007**: The system shall generate a floor the first time it is asked for, and shall return the same floor on every later request.
- [x] **GEN-PLAN-009**: The system shall give the upward staircase of every floor reached by stairs down a connector back to the floor those stairs descend from, and shall give the entrance's upward staircase no destination.
- [x] **GEN-PLAN-010**: The system shall resolve an arrival rule of `STAIRS_DOWN` to the downward staircase on the destination floor that leads to the floor the party is leaving.

## Re-stocking

- [x] **GEN-STOCK-001**: When exploration re-stocks a floor, the system shall return the room contents to place, and shall change no edge and no tile feature.
- [x] **GEN-STOCK-002**: The system shall derive a re-stocking from the floor's own seed combined with a re-stocking counter, so the same floor re-stocked the same number of times after the same absence gives the same result.
- [x] **GEN-STOCK-003**: The system shall produce a different arrangement for successive re-stockings of the same floor, so that a floor visited repeatedly does not settle into one layout of occupants.
- [x] **GEN-STOCK-004**: The system shall move each standing warband to a room, and return each warband the floor is short of against the three it was stocked with, each when a number drawn for it in a fixed order falls under the re-stocking's strength, and shall never hold more warbands on a floor than it was stocked with.

## Deferred

- [D] **GEN-FLOOR-008**: The system shall place hand-authored set pieces into a generated floor.
- [D] **GEN-PLAN-008**: The system shall choose a floor's archetype according to its depth in the campaign.
