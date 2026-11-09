---
parent: high-level-design
prefix: LOOT
---

# Loot

## Context and Design Philosophy

Loot is what the party finds: the gold and items a defeated band leaves behind, and what
a chest holds. This segment decides what a find is. The items segment says what an item
is, the party holds what was found, and generation decides where a chest stands.

Three principles shape it.

**A find is rolled, never placed.** No chest on any floor holds a particular sword
because someone put it there. Every find is drawn from an authored loot table by a
seeded generator, so the dungeon's rewards come from the same kind of authored guideline
as its layout, and an author changes them by editing a table rather than visiting
floors.

**Rarity is rolled from the top down.** A table sorts its items into five tiers:
legendary, epic, rare, uncommon and common. A draw tries legendary first, at the
table's legendary odds; on a miss it tries epic, then rare, then uncommon, and common
is what remains. Each tier's odds are therefore a number someone wrote down. They don't
depend on how many items share the table, so adding a fourth common dagger leaves the
chance of a legendary where it was.

**A find goes straight to the pack.** The party never chooses what to pick up. The pack
has no limit, so there is nothing to choose between, and a pick-up screen with nothing
to decide is a press the player must make for nothing. What was found is reported, and
it is in the pack by the time the report is read.

## What This Segment Owns

| | Owned here | Owned elsewhere |
|---|---|---|
| Loot tables | what a table holds, its odds per tier, its gold, how many draws it makes | authored as data, one file each |
| Rolling a find | the draw, from a table and a generator, into gold and items | — |
| What a defeated band yields | one roll per defeated enemy, on that enemy's table | the enemies segment names each enemy's table; combat says when a band is defeated |
| What a chest holds | one roll on the floor's chest table, from a generator derived from the floor's seed and the chest | generation places the chest; exploration records that it was opened |
| What an item is | — | items: kind, rarity, slot, the numbers it carries, what a consumable does |
| The pack and the purse | — | the party holds both and stows into them |

Loot reads tables and items and writes nothing of its own. A roll returns a find, a
plain value of gold and items, and whoever asked for it hands it to the party.

## A Loot Table

```
id       a stable name, unique across tables
odds     the chance of each tier above common:
           legendary, epic, rare, uncommon      each between 0 and 1
gold     the gold a roll yields, as a range
draws    how many items a roll may yield, and the chance that each one does
items    the ids of the items the table can yield
```

**A table lists items. It does not rank them.** Each item's tier is its own `rarity`,
which belongs to the items segment. A legendary blade is legendary in every table that
holds it and is drawn in its tier's colour wherever it appears. A table that ranked its
own items could make one sword common in one place and legendary in another, and the
colour on the screen would stop meaning anything.

**A tier with nothing in it falls through.** If the draw lands on rare and the table
holds no rare item, it takes the next tier down that holds something, so a small table
never yields nothing because of a gap. A table must hold at least one common item, so
falling through always ends somewhere. A table without one is rejected when it is
read, by name.

**Within a tier, every item is equally likely.** Rarity is the one dial; anything finer
would bring back the weighted draw that rolling by tier exists to avoid.

**Draws are independent.** A table that makes two draws makes two separate top-down
rolls, and may yield two rares or two commons. A chest's two items are two finds, not
one find with a pair.

### Depth

Deeper floors reward more by naming richer tables, not through a formula here. An
enemy's roster entry names its table and an archetype names its chest table, so a
deep-floor ogre and a deep archetype point at tables whose odds and items are deeper
ones. Loot never needs to know how deep a floor is, and the same rule holds for every
source.

For now there is one enemy and one archetype, so there are two tables: the goblins'
drops and the chest table. Every floor pays the same until archetypes vary with depth
(GEN-PLAN-008) and deeper enemies exist to name deeper tables.

### Chests pay better than drops

**A chest's table is richer than the drops of the bands on the same floor:** better odds
in every tier above common, more draws and more gold. A chest is found once and never
refills, while bands return on every re-stocking, so a chest has to be the find worth
walking to. The bands that come back on a revisit are the steady income.

This is an authoring rule. Loot can't enforce it, because loot doesn't know which tables
share a floor. It is checked over the authored content: each archetype's chest table is
compared with the tables of the enemies that appear on it.

## Rolling a Find

```
roll(table, rng) → { gold, items }

gold   = rng.int(table.gold.min, table.gold.max)
items  = for each of table.draws.count:
           if rng.next() < table.draws.chance:
             tier = legendary? epic? rare? uncommon? else common   (top down, each at its odds)
             tier = the first tier at or below it the table holds
             item = a uniform pick among the table's items of that tier
```

**A roll draws a fixed number of values per draw.** A failed draw still consumes the
values a successful one would, so the generator's position after a roll doesn't depend
on what was found. That matches generation's rule against variable draws: what one draw
found never shifts the next one.

**A find holds resolved items**, as the pack does, so nothing found has to be looked up
again later.

## Where Finds Come From

### A defeated band

On victory, combat asks for one roll per defeated enemy, on that enemy's table, using
the fight's own generator, and hands every find to the party. The finds are added to the
victory's outcome, so the banner can report what the fight was worth in gold and items
as it already reports the experience.

**Drops are per enemy, not per band.** A larger band pays more, and a goblin mage can
carry what a goblin cannot. A band-level table would give a band of two what a band of
eight gives.

**Only a victory yields.** An escape leaves the band standing, with its gold. A defeat
yields nothing, because the party is gone.

An enemy that names no table yields nothing, which is how a beast with no pockets is
authored.

### A chest

A chest is a tile feature, laid by generation within the archetype's chest budget on
room tiles nothing else has claimed. It is opened with `INTERACT` while
the party stands on it, which costs a tick, as committing any party action does.

**What a chest holds is fixed by the floor, not by the moment it is opened.** Its find
is rolled from a generator seeded from the floor's seed and the chest's index on the
floor, on the archetype's chest table. Opening it later, or after a reload, yields the
same thing. Reloading can't fish for a better chest, and nothing about a chest's
contents has to be saved, only whether it has been opened.

**A chest is opened once.** Exploration records it as opened, beside the floor's door
flags, and an opened chest offers nothing more. It is still drawn, open and empty, so
the map stays a true record of where the party has been.

**Re-stocking never refills a chest.** A chest is part of what the floor is, laid once
like a staircase. Revisited floors stay worth walking because their bands return, and bands
carry drops.

## Gold

Gold is a count the party holds in its purse. A find's gold is added to the purse, and
nothing in this segment takes any away. There is nothing to spend it on until there is
a town; until then, gold is a score that will later become a currency.

## Food

Food is found the way any item is. Chests carry rations, goblins drop rations and haunches,
and the goblin mage's table carries glowcaps. Food is authored at common or uncommon, so it
turns up often enough to keep a careful party fed, and never often enough that hunger stops
mattering. Foraging at camp is the other source, and belongs to the food segment.

## Consumables

A consumable is an item the items segment defines with an effect rather than a slot.
It sits in the pack and is used up rather than worn. There are two kinds. A **potion**
heals: it restores a fixed number of hit points through the party's `applyHealing`
operation, which caps at the maximum. A **tome** teaches a rare spell to whoever reads
it; who may read one, and when, belongs to the magic segment.

**Tomes are rare finds.** A tome is authored at rare or above, so it comes out of the
tiers loot reaches least often. Chests carry tomes, and so do the enemies whose loot
tables name them: the goblin mage drops from a table of its own, the goblin's table with
the tome added, because a caster is where a book of spells is believable.

Using one is the party's operation, not this segment's, and the cost depends on where
it happens:

| Where | Who drinks | Costs |
|---|---|---|
| Out of a fight | the character whose Items page it is pressed on | a tick, as committing any `ITEMS` change does |
| In a fight | the acting character | the full bar, as any action does |

**A potion is drunk, never given.** Whoever drinks it is the one it heals, in a fight or
out of one. Putting a potion into somebody else is a different act from drinking one.
Healing another character belongs to clerics and their spells, which keeps that a
reason to bring a cleric.

**A potion is refused where it would do nothing, or where nobody can drink it:** on a
character at full health, and on one who is unconscious, dead, in ashes or lost. Nothing
is used up and nothing is spent. Raising the dead is revival, and a potion is not a
revival.

An unconscious character therefore can't be woken by a potion. Neither Heal nor camping
wakes one either; waking the fallen is Restoration's work, so until that spell exists a
character knocked out stays down after the fight.

## What Changes Elsewhere

Loot touches every segment that holds or shows a find. Each change below belongs to
that segment's own design and specs, and is listed here so the segment boundaries are
visible from one place.

| Segment | Change |
|---|---|
| Items | a `rarity` on every item, defaulting to common; a fourth kind, `CONSUMABLE`, with no slot and an `effect`; consumables are never equipped |
| Party | a purse of gold beside the pack; `addGold`; `useItem`, which consumes from the pack and heals the character using it through `applyHealing`, refusing a character at full health or who is not conscious |
| Enemies | an optional `loot` table id on each roster entry |
| Combat | per-enemy rolls on victory, stowed and added to the outcome; a **Use** action that costs the full bar |
| Generation | archetype fields `chests` (a range) and `chestTable`; chests laid at generation on room tiles no connector has claimed, and never added or removed afterwards (GEN-PLACE-007) |
| Exploration | a `chest` tile feature; `INTERACT` on an unopened chest opens it, costs a tick and hands its find to the party; a per-floor record of opened chests, saved |
| Persistence | save format 4: the party's purse and each floor's opened chests, with a migration from format 3 that starts the purse at zero and every chest unopened |
| Presentation | the victory banner lists gold and items found; opening a chest shows a report over the view, dismissed by a press; the Items screen shows the purse, draws each item's name in its rarity's colour, and offers consumables as rows that use them; the corridor and the automap draw a chest, open or closed |
| Content | two loot tables under `src/game-data/loot`, the goblins' drops and a richer chest table; a few items above common; potions in two or three sizes |

## Authoring

Tables are one file each under `src/game-data/loot`, read by the same kind of loader as
items and combatants. A table that names an item that doesn't exist, gives odds
outside 0–1, gives a gold or draw range whose minimum exceeds its maximum, or holds no
common item is rejected by name and by the value that couldn't be read. A roster entry
or archetype naming a table that doesn't exist is rejected the same way.

## Decisions & Alternatives

| Decision | Chosen | Alternatives Considered | Rationale |
|---|---|---|---|
| How rarity is drawn | Top down, tier by tier, each at its own odds, with common as what remains | One weighted draw across every item; a rarity roll weighted by each tier's item count | A single weighted draw ties the chance of a legendary to how many commons share the table, so adding content changes the odds by accident. Rolling tier by tier keeps every tier's odds an authored number. |
| Where an item's tier lives | On the item, as `rarity` | On the table entry | A tier on the entry lets the same sword be common in one table and legendary in another, and the colour on screen stops meaning anything. |
| A rolled tier the table lacks | Fall to the next tier down that holds something; require at least one common | Re-roll; yield nothing; climb to the next tier up | A re-roll draws a variable number of values. Yielding nothing punishes a small table for being small. Climbing up turns a gap into a better find than was rolled. |
| How depth raises rewards | The source names a richer table | A per-depth multiplier on a table's odds; tables keyed by floor tier | A multiplier makes every table answer to a formula nobody sees when reading the table, and keying by tier makes every table a matrix. Naming a table keeps each find readable from one file, and the deeper enemy or archetype is where depth is already authored. |
| Drops per enemy or per band | Per enemy, on its own table | One roll per band | A band of eight should pay more than a band of two, and a mage should be able to carry what a goblin cannot. |
| When a chest's contents are decided | Seeded from the floor and the chest, so fixed from generation on | Rolled when opened, from the campaign's generator | Rolling on opening lets a reload fish for a better find, and couples the contents to everything else that drew from the campaign generator first. A seed derived from the floor costs no saved state beyond the opened flag. |
| Chests and re-stocking | A chest is laid once and never refilled | Re-stocking refills some opened chests | A chest that refills becomes a farm, and the map's record of a looted room becomes a lie. Bands already return on a revisit and carry their drops. |
| Receiving a find | Straight to the pack, reported | A screen to choose what to take | With no pack limit there is nothing to choose between, so a pick screen is a press that decides nothing. |
| Who a potion heals | Whoever drinks it, which is the character it is used from; never another, and never someone unconscious | Giving a potion to any party member, conscious or not | A potion is drunk. Tending another character is healing magic's job, which keeps healing an ally a reason to bring a cleric. |
| Chests against drops | A chest's table is richer than its floor's drop tables, as an authoring rule checked over the content | Chests and bands rolling on one table; enforcing it inside loot | Chests never refill and bands do, so the one-time find has to be worth more than the repeatable one. Loot doesn't know which tables share a floor, so the rule is checked where both are authored. |
| What a potion does | Heals a fixed amount through `applyHealing` | Healing by a percentage; curing status | A fixed amount is legible, and the systems player can read it off the item. Status effects don't exist yet. |
| Gold | Counted in a purse, never spent yet | Leave gold out until a town exists | Finds are the reward the HLD's loop runs on, and a purse filling now means the town arrives with a party that already has something to spend. |

## Open Questions & Future Decisions

### Resolved

1. ✅ **Loot comes from defeated bands and from chests**, and goes straight to the pack.
2. ✅ **Rarity is rolled top down**, legendary to common, at each table's odds.
3. ✅ **An item's tier is its own**, and a table only lists items.
4. ✅ **Chest contents are seeded from the floor**, chests never refill, and only the opened flag is saved.
5. ✅ **Drops are per enemy**, and only a victory yields.
6. ✅ **Potions heal**, a fixed amount, and only whoever drinks them; an unconscious character can't drink.
7. ✅ **Gold is counted in a purse** and not yet spent.
8. ✅ **A chest pays better than the drops on its floor**, because it never refills.
9. ✅ **Two tables for now**, the goblins' drops and the chest table. Per-floor tables come with depth-varying archetypes and enemies.

### Deferred

1. **Affixes.** Varying an item within its kind wants enemy armour on a curve to balance against (ENEMY-ROSTER-007, -008).
2. **A pack limit** (ITEM-PACK-006), and with it a reason to choose what to take.
3. **Locked chests.** A chest is opened with `INTERACT` rather than by stepping onto it so that something about a chest can later make opening a decision.
4. **Different loot on each floor**, through richer tables named by deeper archetypes and enemies (GEN-PLAN-008).
5. **Spending gold**, in a town.

## References

- `docs/high-level-design.md`: the loot and items component, and the rarity decision.
- `docs/intent/items/items-design.md`: what an item is, the pack.
- `docs/intent/party/party-design.md`: `stow`, `applyHealing`, the condition chain.
- `docs/intent/generation/generation-design.md`: determinism, connectors, archetypes.
- `docs/intent/exploration/exploration-design.md`: `INTERACT`, the cost of committing a party action.
