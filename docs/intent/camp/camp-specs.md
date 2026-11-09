# Camp — EARS Specs

Specs for the camp segment. Design: `camp-design.md`.

How many ticks a camp takes is a tunable value, not a requirement. These specs fix when a
camp may happen, what it costs, and what it restores.

## Camping

- [x] **CAMP-REST-001**: If any roaming enemy on the party's floor is within the party's sight distance with nothing opaque between them, then the system shall refuse the camp and spend nothing.
- [x] **CAMP-REST-002**: When the party camps, the system shall advance the exploration clock by the camp's ticks and give roaming enemies on the floor those ticks to move by.
- [x] **CAMP-REST-003**: If a roaming enemy reaches the party while the camp's ticks are spent, then the system shall begin that encounter and restore nothing.
- [x] **CAMP-REST-004**: When a camp is not broken, the system shall ask the magic segment to restore the spell slots of every character who is not dead, ashes or lost.
- [x] **CAMP-REST-005**: The system shall restore no hit points and wake no unconscious character by camping, apart from what the meal restores.
- [x] **CAMP-REST-006**: The system shall report how a camp ended: rested, broken by an encounter, or refused with an enemy in sight.

## The meal

- [x] **CAMP-FOOD-001**: When a camp is not broken, the system shall ask the food segment to clear every meal buff still running, before the pot is offered.
- [x] **CAMP-FOOD-002**: When a camp is not broken, the system shall ask the food segment to forage, and then offer the pot: the player chooses which food goes in and may cook it or leave without eating.
- [x] **CAMP-FOOD-003**: The system shall let the pot be cooked at most once per camp, and only while the camp is offering it.
- [x] **CAMP-HUNGER-001**: The system shall spend a camp's ticks on hunger as the party rests, before it eats.
