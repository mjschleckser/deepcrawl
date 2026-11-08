# Items — EARS Specs

Specs for the items segment. Design: `items-design.md`.

The numbers an item carries — a particular sword's damage, a particular mail's armour —
are content data, not requirements. These specs fix what an item is, how its numbers
are assembled into the three the fight resolves, and who may hold it.

## What an item is

- [x] **ITEM-DEF-001**: The system shall give every item an identifier, a name, a kind and a rarity, and every item but a consumable the slot it occupies.
- [x] **ITEM-DEF-002**: The system shall offer these kinds and no others: weapon, armour, shield, consumable.
- [x] **ITEM-DEF-003**: The system shall offer these slots and no others: main hand, off hand, body.
- [x] **ITEM-DEF-004**: The system shall carry on a weapon the skill it trains, its damage, its accuracy, and the attribute its damage draws on.
- [x] **ITEM-DEF-005**: The system shall carry on a piece of armour the armour skill it is worn under and the damage it turns.
- [x] **ITEM-DEF-006**: The system shall carry on a shield the amount it adds to its holder's defence.
- [x] **ITEM-DEF-007**: The system shall decide an item's behaviour from the fields it carries and from no property of its identifier or name.
- [x] **ITEM-DEF-008**: The system shall treat a weapon that names Dexterity as its damage attribute as training the same skill as one that names Might.
- [x] **ITEM-DEF-012**: The system shall offer these rarities and no others, from lowest to highest: common, uncommon, rare, epic, legendary.
- [x] **ITEM-DEF-013**: The system shall carry on a consumable the effect it has when used, and shall offer one effect: healing a stated number of hit points.

## Authoring

- [x] **ITEM-DATA-001**: The system shall read each item from a file of its own under the authored item data, as it reads an authored combatant.
- [x] **ITEM-DATA-002**: When an authored item names a kind, slot, skill, class, or attribute that does not exist, the system shall reject that file by name and the value it could not read.
- [x] **ITEM-DATA-003**: The system shall require of every authored item an identifier, a name and a kind, and of every item but a consumable a slot, and shall reject a file lacking any of them.
- [x] **ITEM-DATA-004**: The system shall treat an authored item that names no classes as wieldable by every class.
- [x] **ITEM-DATA-005**: The system shall treat an authored item that names no rarity as common.
- [x] **ITEM-DATA-006**: When an authored item names a rarity or an effect that does not exist, or a consumable names a slot or an effect amount below one, the system shall reject that file by name and the value it could not read.

## What a combatant fights with

- [x] **ITEM-HOLD-001**: The system shall take a combatant's weapon from the item in their main hand, and when that slot is empty, from the attack they were authored with.
- [x] **ITEM-HOLD-002**: The system shall take the damage a combatant turns from the item on their body, and when that slot is empty, from the armour they were authored with.
- [x] **ITEM-HOLD-003**: The system shall read a combatant's weapon and armour the same way whether they belong to the party or to an enemy group.
- [x] **ITEM-HOLD-004**: The system shall add a shield's defence only while that shield occupies the off hand.

## The numbers

- [x] **ITEM-NUM-001**: The system shall assemble a combatant's accuracy from their weapon's accuracy, five per rank of that weapon's skill, and two per point of Perception above or below ten.
- [x] **ITEM-NUM-002**: The system shall assemble a combatant's defence from a base of twenty, two per point of Dexterity above or below ten, three per rank of the skill their worn armour is used under, and the defence of any shield they hold.
- [x] **ITEM-NUM-003**: The system shall assemble a combatant's base damage from their weapon's damage, a tenth more per rank of that weapon's skill, and four hundredths more or less per point of the weapon's governing attribute above or below ten.
- [x] **ITEM-NUM-004**: The system shall draw accuracy from Perception whatever attribute a weapon's damage draws on.
- [x] **ITEM-NUM-005**: The system shall let no armour raise a combatant's defence, and no shield reduce the damage a combatant takes.
- [x] **ITEM-NUM-006**: The system shall assemble each of the three numbers for a combatant holding nothing in any slot, contributing nothing for each empty slot rather than failing.

## Wielding

- [x] **ITEM-WIELD-001**: The system shall report an item as fitting a slot only when the item names that slot.
- [x] **ITEM-WIELD-002**: The system shall report an item as wieldable by a class when the item names that class, or when the item names no classes at all.
- [x] **ITEM-WIELD-003**: The system shall decide what a class may hold from the item alone, and not from the skills that class can train.
- [x] **ITEM-WIELD-004**: The system shall report a consumable as fitting no slot, so that it can never be equipped.

## The pack

- [x] **ITEM-PACK-001**: The system shall hold, for the party as a whole, the items the party carries and no character has equipped.
- [x] **ITEM-PACK-002**: When an item is equipped from the pack, the system shall remove it from the pack and shall put any item it displaces from that slot into the pack, as one change.
- [x] **ITEM-PACK-003**: When an item is taken off, the system shall put it into the pack.
- [x] **ITEM-PACK-004**: If an item from the pack does not fit the slot or may not be wielded by the character, then the system shall refuse the change and leave the pack and every slot as they were.
- [x] **ITEM-PACK-007**: When an item is stowed, the system shall add it to the end of the pack.
- [x] **ITEM-PACK-005**: The system shall permit equipment to be changed on a character whatever their condition.
- [ ] **ITEM-USE-001**: The system shall let a character use up a consumable from the pack, in a fight or out of one.

## Deferred

- [D] **ITEM-LOOT-001**: The system shall vary an item generated from a loot table within the affix rules that table allows.
- [D] **ITEM-PACK-006**: The system shall limit how much the pack can hold.
- [D] **ITEM-DEF-009**: The system shall let a weapon claim the off hand as well as the main hand, and shall refuse an off-hand item while one does.
- [D] **ITEM-DEF-010**: The system shall carry on a weapon the reach and exposure it grants, which combat reads in place of the rows it removed.
- [D] **ITEM-DEF-011**: The system shall give every item a weight, and shall slow a party carrying more than it can bear.
