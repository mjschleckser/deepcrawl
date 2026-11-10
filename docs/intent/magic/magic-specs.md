# Magic — EARS Specs

Specs for the magic segment. Design: `magic-design.md`.

A particular spell's base number, and how many slots the casting attribute buys, are content data
and tunable values, not requirements. These specs fix what a spell is, who knows it, how
it is paid for, and what a cast does.

## What a spell is

- [x] **MAGIC-SPELL-001**: The system shall give every spell an identifier, a name, a school, a rank, a target of enemy or ally, an effect, where it may be cast, and whether it is learned by class or by tome.
- [x] **MAGIC-SPELL-002**: The system shall read each spell from a file of its own under the authored spell data.
- [x] **MAGIC-SPELL-003**: When an authored spell names a school, target, effect, place to cast or way of learning that does not exist, the system shall reject that file by name and the value it could not read.
- [x] **MAGIC-SPELL-004**: The system shall hold Magic Missile, an Evocation spell of rank 1 for mages, aimed at an enemy, dealing damage that ignores armour, cast only in a fight.
- [x] **MAGIC-SPELL-005**: The system shall hold Heal, a Healing spell of rank 1 for clerics, aimed at an ally, restoring hit points, cast in a fight or while exploring.
- [x] **MAGIC-SPELL-007**: The system shall hold Fire Bolt, an Evocation spell of rank 1 for mages learned by tome, aimed at an enemy, dealing damage reduced by armour, cast only in a fight.

## Who knows a spell

- [x] **MAGIC-KNOW-001**: The system shall treat a character as knowing a class spell when their class's file names the spell's school among the schools it casts and the character's rank in that school is at least the spell's rank.
- [x] **MAGIC-KNOW-002**: The system shall treat a character as knowing a tome spell only once they have read its tome.
- [x] **MAGIC-KNOW-003**: When a character reads a tome out of a fight, the system shall teach them its spell for good, use the tome up from the pack, and advance the clock by one tick.
- [x] **MAGIC-KNOW-004**: If the character's class does not cast the spell's school, their rank in its school is below the spell's rank, or they know the spell already, then the system shall refuse the reading, keep the tome, and spend nothing, reporting the reason.
- [x] **MAGIC-KNOW-005**: The system shall not let a tome be read in a fight.
- [x] **MAGIC-KNOW-006**: The system shall keep the spells a character has learned from tomes in the party's save.

## Spell slots

- [x] **MAGIC-SLOT-001**: The system shall give a character who knows a rank-1 spell three rank-1 slots and one more for every two points of their casting attribute above ten, and shall give a character no slots at a rank they know no spell of.
- [x] **MAGIC-SLOT-002**: When a character casts a spell, the system shall spend one of their slots of that spell's rank.
- [x] **MAGIC-SLOT-003**: If a character has no slot of a spell's rank left and cannot Overchannel it, then the system shall refuse the cast and spend nothing.
- [x] **MAGIC-SLOT-004**: When the camp segment restores a character's slots, the system shall return every slot they have spent.
- [x] **MAGIC-SLOT-005**: The system shall restore no slot except when the camp segment asks.
- [x] **MAGIC-SLOT-006**: The system shall keep a character's spent slots in the party's save.
- [x] **MAGIC-SLOT-008**: When a mage casts a spell with no slot of its rank left, the system shall charge the spell's rank times their Overchannel cost per rank in hit points through the party's `payHitPoints`, and spend no slot.
- [x] **MAGIC-SLOT-009**: The system shall spend a slot whenever one of the spell's rank is left, and shall charge hit points for a cast only when none is.
- [x] **MAGIC-SLOT-010**: If an Overchannelled cast's cost would bring the mage to zero hit points or below, then the system shall refuse the cast and spend nothing.
- [x] **MAGIC-SLOT-011**: The system shall report whether a cast would be paid by a slot or by hit points, and how many, without spending anything.
- [x] **MAGIC-SLOT-012**: When a cast is paid in hit points, the system shall count Overchannel as used by the caster, as the spell's school is.

## What a cast does

- [x] **MAGIC-CAST-001**: The system shall set a spell's magnitude to its base grown by a tenth per rank in its school and by four hundredths per point of the caster's casting attribute above or below ten, rounded to a whole number and never below one.
- [x] **MAGIC-CAST-010**: The system shall scale a caster's spell magnitude by their hunger penalty and arcane buff, as the food segment sets them, before rounding.
- [x] **MAGIC-CAST-002**: When a spell that deals damage ignoring armour is cast on an enemy, the system shall deal its whole magnitude, unreduced by the target's armour.
- [x] **MAGIC-CAST-009**: When a spell that deals damage not ignoring armour is cast on an enemy, the system shall deal its magnitude less the target's armour, held to the minimum a weapon blow is held to.
- [x] **MAGIC-CAST-003**: When a healing spell is cast on a conscious ally, the system shall restore its magnitude in hit points through the party's operation, never past the ally's maximum.
- [x] **MAGIC-CAST-004**: If a healing spell is aimed at an ally who is not conscious or is already at full hit points, then the system shall refuse the cast and spend nothing.
- [x] **MAGIC-CAST-005**: The system shall report what a cast on a given target would do, by the calculation the cast uses, without spending anything or changing anything.
- [x] **MAGIC-CAST-006**: The system shall offer a spell only where the spell names it may be cast, and shall refuse a cast anywhere else.
- [x] **MAGIC-CAST-007**: When a character casts a spell out of a fight, the system shall train the spell's school through the party's operation for a skill used outside combat.

## Deferred

- [D] **MAGIC-SLOT-007**: The system shall give characters slots at ranks above 1, by a rule set when spells of those ranks exist.
- [D] **MAGIC-SPELL-006**: The system shall hold a Restoration spell that wakes an unconscious ally.
- [D] **MAGIC-CAST-008**: The system shall let an enemy cast the spells it knows, by the same rules a character casts by.
