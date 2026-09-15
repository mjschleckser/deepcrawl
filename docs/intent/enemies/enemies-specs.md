# Enemies — EARS Specs

Specs for the enemies segment. Design: `enemies-design.md`.

Every stat on the roster, every band's count range, notice range, and how long
awareness takes to decay are content data. These specs fix the rules those numbers
are fed into.

## The roster

- [x] **ENEMY-ROSTER-001**: The system shall define each enemy with an id, a name, a role, a preferred row, hit points, Dexterity, accuracy, armour, and a pot value.
- [ ] **ENEMY-ROSTER-002**: The system shall give every enemy exactly one role from: melee, ranged, or caster.
- [x] **ENEMY-ROSTER-003**: The system shall keep an enemy's role and its row as separate properties, so that an enemy may stand in a row its role does not prefer.
- [ ] **ENEMY-ROSTER-004**: The system shall hold the goblin, the goblin archer, and the goblin mage in the first floor's roster, as a melee front-row enemy, a ranged back-row enemy, and a caster back-row enemy respectively.
- [ ] **ENEMY-ROSTER-005**: The system shall read every enemy from content data, and shall hold no behaviour particular to any named enemy.

## Bands

- [x] **ENEMY-BAND-001**: The system shall define a band as a named template naming each enemy it contains and a range of how many.
- [x] **ENEMY-BAND-002**: When a band is assembled, the system shall draw each member count from within its range using the seed it was given.
- [x] **ENEMY-BAND-003**: The system shall assemble an identical band from an identical seed and template.
- [x] **ENEMY-BAND-004**: When assembling a band, the system shall place each member in its preferred row until that row is full, and in the other row thereafter.
- [x] **ENEMY-BAND-005**: The system shall not place more than the combat segment's row limit in either row of a band.
- [x] **ENEMY-BAND-006**: The system shall hold a goblin warband of two to four goblins in the first floor's bands.

## Awareness

- [x] **ENEMY-AWARE-001**: When the party comes within a roamer's notice range, the system shall make that roamer aware.
- [x] **ENEMY-AWARE-002**: The system shall not vary a roamer's awareness with the party's light level.
- [x] **ENEMY-AWARE-003**: While the party stands in a roamer's line of sight, the system shall hold that roamer's awareness at full rather than letting it decay.
- [x] **ENEMY-AWARE-004**: While the party is out of a roamer's line of sight, the system shall decay that roamer's awareness by the ticks that pass.
- [x] **ENEMY-AWARE-005**: When a roamer's awareness has fully decayed, the system shall return it to unaware.
- [x] **ENEMY-AWARE-006**: The system shall treat a wall, a closed door, and an undiscovered secret door as blocking a roamer's line of sight.
- [x] **ENEMY-AWARE-007**: When the party escapes an encounter, the system shall return the roamer it escaped from to unaware.

## Movement

- [x] **ENEMY-MOVE-001**: The system shall give every roamer a cost in ticks to cross one tile, derived from its Dexterity.
- [x] **ENEMY-MOVE-002**: When the party takes a step, the system shall give each roamer on that floor the ticks the step consumed to spend against its own crossing cost.
- [x] **ENEMY-MOVE-003**: The system shall carry a roamer's unspent ticks forward to the next step rather than discarding them.
- [x] **ENEMY-MOVE-004**: When a roamer has accumulated at least its crossing cost, the system shall move it one tile and deduct that cost, repeating while it can still afford to move.
- [x] **ENEMY-MOVE-005**: While a roamer is aware, the system shall move it one tile toward the party.
- [x] **ENEMY-MOVE-006**: While a roamer is unaware, the system shall move it one tile in a direction it can travel, chosen from the seed.
- [x] **ENEMY-MOVE-007**: The system shall not move a roamer through a wall, a closed door, or an undiscovered secret door.
- [x] **ENEMY-MOVE-008**: The system shall let a party whose step cost is lower than a pursuing roamer's crossing cost increase its distance from that roamer over successive steps.

## Contact

- [x] **ENEMY-CONTACT-001**: When the tile a roamer would move into is the party's tile, the system shall begin an encounter with that roamer's band and leave the roamer on the tile it stood on.
- [x] **ENEMY-CONTACT-002**: The system shall not let the party and a roamer occupy the same tile, nor exchange tiles within one step.
- [x] **ENEMY-CONTACT-003**: When an encounter begins, the system shall report the party's awareness of the roamer and the roamer's awareness of the party as the surprise payload.
- [x] **ENEMY-CONTACT-004**: The system shall treat a roamer that has not noticed the party as unaware for the purposes of surprise, whatever the light.
- [x] **ENEMY-CONTACT-005**: When the party arrives on a roamer's tile by a relocation it cannot refuse, the system shall begin an encounter and move that roamer to an adjacent tile it can travel to.
- [x] **ENEMY-CONTACT-006**: The system shall place a newly stocked roamer on a tile other than the one the party occupies.

## Behaviour in a fight

- [x] **ENEMY-FIGHT-001**: When a melee enemy selects a target, the system shall choose from the party's front row while a conscious character stands in it.
- [x] **ENEMY-FIGHT-002**: When a ranged or caster enemy selects a target, the system shall weight its choice toward the party's front row while leaving the back row reachable.
- [x] **ENEMY-FIGHT-003**: The system shall never let an enemy select a target the reach rules forbid.

## Re-stocking

- [x] **ENEMY-STOCK-001**: When generation asks for a floor's occupants, the system shall return bands and the tiles they stand on.
- [x] **ENEMY-STOCK-002**: The system shall return no change to any floor's edges, tile features, or traps when asked for occupants.

## Deferred

- [D] **ENEMY-FIGHT-004**: The system shall resolve the abilities an enemy's roster entry gives it.
- [D] **ENEMY-BAND-007**: The system shall assemble a band to a difficulty budget rather than from a named template.
- [D] **ENEMY-ROSTER-006**: The system shall vary notice range per enemy rather than using one range for all.
