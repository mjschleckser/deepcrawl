# Loot — EARS Specs

Specs for the loot segment. Design: `loot-design.md`.

What a particular table holds and how likely each tier is are content data, not
requirements. These specs fix how a table is read, how a find is rolled from it, and
where finds come from.

## Tables

- [x] **LOOT-TABLE-001**: The system shall read each loot table from a file of its own under the authored loot data, holding an identifier, the odds of each tier above common, a gold range, a number of draws with the chance that each yields an item, and the identifiers of the items it can yield.
- [x] **LOOT-TABLE-002**: The system shall resolve a table's item identifiers to items when the table is read, so that a find holds resolved items.

## Authoring

- [x] **LOOT-DATA-001**: When an authored loot table names an item that does not exist, gives odds or a draw chance outside 0 to 1, gives a gold range or draw count below zero or a gold range whose minimum exceeds its maximum, or holds no common item, the system shall reject that file by name and the value it could not read.
- [x] **LOOT-DATA-002**: When an enemy roster entry or an archetype names a loot table that does not exist, the system shall reject that file by name and the table it named.
- [x] **LOOT-DATA-003**: The system shall hold every archetype's chest table richer than the table of every enemy that can be placed on a floor of that archetype: odds no lower in every tier above common and higher in at least one, at least as many draws at no lower chance, and a gold range no lower at either end.
- [x] **LOOT-DATA-004**: The system shall hold the tome of Fire Bolt, authored at rare, in the chest table and in the goblin mage's table, and shall give the goblin mage a table of its own.
- [x] **LOOT-DATA-005**: The system shall hold the Wand in the goblin, goblin mage and chest tables.

## Rolling a find

- [x] **LOOT-ROLL-001**: When a table is rolled, the system shall yield gold drawn uniformly from the table's gold range, inclusive.
- [x] **LOOT-ROLL-002**: When a table is rolled, the system shall make as many draws as the table names, each yielding an item with the table's draw chance, independently of every other draw.
- [x] **LOOT-ROLL-003**: When a draw yields an item, the system shall try legendary at the table's legendary odds, then epic, rare and uncommon in that order at their own odds, taking the first tier that succeeds, and common when none does.
- [x] **LOOT-ROLL-004**: If a table holds no item of the tier a draw lands on, then the system shall take the nearest lower tier that holds one.
- [x] **LOOT-ROLL-005**: The system shall pick a draw's item uniformly among the table's items of the tier it lands on.
- [x] **LOOT-ROLL-006**: The system shall consume the same number of generator values for every draw, whether it yields an item and whatever tier it lands on.
- [x] **LOOT-ROLL-007**: The system shall yield the same find from the same table and the same generator position.

## Fight drops

- [x] **LOOT-DROP-001**: When an encounter ends in victory, the system shall roll once for each defeated enemy on that enemy's loot table, from the encounter's generator, and shall add each find's gold to the party's purse and its items to the pack.
- [x] **LOOT-DROP-002**: The system shall roll nothing for a defeated enemy that names no loot table.
- [x] **LOOT-DROP-003**: When an encounter ends in escape or defeat, the system shall roll no loot.

## Chests

- [x] **LOOT-CHEST-001**: When a chest is opened, the system shall roll its floor's chest table from a generator seeded from the floor's seed and the chest's number, and shall add the find's gold to the party's purse and its items to the pack.
- [x] **LOOT-CHEST-002**: The system shall yield the same find from a chest whenever it is opened, whatever else has happened in the campaign before it and across a save and reload.
- [x] **LOOT-CHEST-003**: The system shall yield a find from a chest at most once.

## Deferred

- [D] **LOOT-ROLL-008**: The system shall apply a table's affix rules to an item it yields.
- [D] **LOOT-TABLE-003**: The system shall vary the tables a floor's chests and enemies roll on with the floor's depth.
