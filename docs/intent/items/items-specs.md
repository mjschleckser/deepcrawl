# Items — EARS Specs

Specs for the items segment. Design: `items-design.md`.

The numbers an item carries — a particular sword's damage, a particular mail's armour —
are content data, not requirements. These specs fix what an item is, how its numbers
are assembled into the three the fight resolves, and who may hold it.

## What an item is

- [x] **ITEM-DEF-001**: The system shall give every item an identifier, a name, a kind, and the slot it occupies.
- [x] **ITEM-DEF-002**: The system shall offer these kinds and no others: weapon, armour, shield.
- [x] **ITEM-DEF-003**: The system shall offer these slots and no others: main hand, off hand, body.
- [x] **ITEM-DEF-004**: The system shall carry on a weapon the skill it trains, its damage, its accuracy, and the attribute its damage draws on.
- [x] **ITEM-DEF-005**: The system shall carry on a piece of armour the armour skill it is worn under and the damage it turns.
- [x] **ITEM-DEF-006**: The system shall carry on a shield the amount it adds to its holder's defence.
- [x] **ITEM-DEF-007**: The system shall decide an item's behaviour from the fields it carries and from no property of its identifier or name.
- [x] **ITEM-DEF-008**: The system shall treat a weapon that names Dexterity as its damage attribute as training the same skill as one that names Might.

## Authoring

- [x] **ITEM-DATA-001**: The system shall read each item from a file of its own under the authored item data, as it reads an authored combatant.
- [x] **ITEM-DATA-002**: When an authored item names a kind, slot, skill, class, or attribute that does not exist, the system shall reject that file by name and the value it could not read.
- [x] **ITEM-DATA-003**: The system shall require of every authored item an identifier, a name, a kind, and a slot, and shall reject a file lacking any of them.
- [x] **ITEM-DATA-004**: The system shall treat an authored item that names no classes as wieldable by every class.

## What a combatant fights with

- [x] **ITEM-HOLD-001**: The system shall take a combatant's weapon from the item in their main hand, and when that slot is empty, from the attack they were authored with.
- [x] **ITEM-HOLD-002**: The system shall take the damage a combatant turns from the item on their body, and when that slot is empty, from the armour they were authored with.
- [x] **ITEM-HOLD-003**: The system shall read a combatant's weapon and armour the same way whether they belong to the party or to an enemy group.
- [x] **ITEM-HOLD-004**: The system shall add a shield's defence only while that shield occupies the off hand.

## The numbers

- [x] **ITEM-NUM-001**: The system shall assemble a combatant's accuracy from their weapon's accuracy, five per rank of that weapon's skill, and two per point of Perception above ten.
- [x] **ITEM-NUM-002**: The system shall assemble a combatant's defence from a base of twenty, two per point of Dexterity above ten, three per rank of the skill their worn armour is used under, and the defence of any shield they hold.
- [x] **ITEM-NUM-003**: The system shall assemble a combatant's base damage from their weapon's damage, a tenth more per rank of that weapon's skill, and four hundredths more per point of the weapon's governing attribute above ten.
- [x] **ITEM-NUM-004**: The system shall draw accuracy from Perception whatever attribute a weapon's damage draws on.
- [x] **ITEM-NUM-005**: The system shall let no armour raise a combatant's defence, and no shield reduce the damage a combatant takes.
- [x] **ITEM-NUM-006**: The system shall assemble each of the three numbers for a combatant holding nothing in any slot, contributing nothing for each empty slot rather than failing.

## Wielding

- [x] **ITEM-WIELD-001**: The system shall report an item as fitting a slot only when the item names that slot.
- [x] **ITEM-WIELD-002**: The system shall report an item as wieldable by a class when the item names that class, or when the item names no classes at all.
- [x] **ITEM-WIELD-003**: The system shall decide what a class may hold from the item alone, and not from the skills that class can train.

## Deferred

- [D] **ITEM-LOOT-001**: The system shall generate an item from a loot table, within the affix rules that table allows.
- [D] **ITEM-LOOT-002**: The system shall award items from a defeated enemy group and from containers on a floor.
- [D] **ITEM-PACK-001**: The system shall hold items the party carries but has not equipped, and shall offer those usable in a fight.
- [D] **ITEM-DEF-009**: The system shall let a weapon claim the off hand as well as the main hand, and shall refuse an off-hand item while one does.
- [D] **ITEM-DEF-010**: The system shall carry on a weapon the reach and exposure it grants, which combat reads in place of the rows it removed.
- [D] **ITEM-DEF-011**: The system shall give every item a weight, and shall slow a party carrying more than it can bear.
