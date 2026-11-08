# Camp — EARS Specs

Specs for the camp segment. Design: `camp-design.md`.

How many ticks a camp takes is a tunable value, not a requirement. These specs fix when a
camp may happen, what it costs, and what it restores.

## Camping

- [x] **CAMP-REST-001**: If any roaming enemy on the party's floor is within the party's sight distance with nothing opaque between them, then the system shall refuse the camp and spend nothing.
- [x] **CAMP-REST-002**: When the party camps, the system shall advance the exploration clock by the camp's ticks and give roaming enemies on the floor those ticks to move by.
- [x] **CAMP-REST-003**: If a roaming enemy reaches the party while the camp's ticks are spent, then the system shall begin that encounter and restore nothing.
- [x] **CAMP-REST-004**: When a camp is not broken, the system shall ask the magic segment to restore the spell slots of every character who is not dead, ashes or lost.
- [x] **CAMP-REST-005**: The system shall restore no hit points and wake no unconscious character by camping.
- [x] **CAMP-REST-006**: The system shall report how a camp ended: rested, broken by an encounter, or refused with an enemy in sight.

## Deferred

- [D] **CAMP-FOOD-001**: When the party camps, the system shall clear every food buff still running.
- [D] **CAMP-FOOD-002**: The system shall let the party prepare food at camp, giving buffs and restoring hit points by what is eaten.
- [D] **CAMP-HUNGER-001**: The system shall feed the ticks of a camp to hunger.
