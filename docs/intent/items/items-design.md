---
parent: high-level-design
prefix: ITEM
---

# Items

## Context and Design Philosophy

An item is what a character carries and what the fight's arithmetic reads. This segment
says what an item *is*; the party says which item sits in which slot, and combat says
what happens when one is swung.

Three principles shape it.

**An item is data, never code.** A sword is a file, read by the same kind of loader
that reads a goblin. Nothing about adding a weapon should require opening a module,
because the moment it does, content becomes a programming task and the rate at which
the game can be filled in drops to the rate at which it can be edited.

**An item carries its own numbers, and nothing derives them from its name.** A weapon
states its damage, the skill it trains and the attribute it draws on.
Nothing anywhere asks "is this a dagger" to decide how it behaves. A dagger and a
longsword are both Blade and are not the same argument for what makes a character
dangerous, and that difference lives in their files rather than in a branch.

**What a character may hold is decided by category.** An item names the slot it
occupies and the category it belongs to — a light weapon, a martial blade, heavy armour.
A class names the categories it may wield, in its own file. Neither names the other: a
new item names a category and arrives without editing any class, which is the direction
content has to flow if content is to be addable, and a class's file still says whole
what it may hold.

## What This Segment Owns

| | Owned here | Owned elsewhere |
|---|---|---|
| Item definitions | what an item is: slot, kind, category, numbers | — |
| Slots | which slots exist, and what each admits | the party records what occupies them |
| Wielding rules | whether an item fits a slot, and the vocabulary of categories | the class's file names which categories it wields; the party's `equip` enforces the answer |
| Derived combat numbers | how base damage and armour are assembled | combat resolves the attack they feed |
| The pack | what it holds, and what moving an item in or out of it means | the party holds it, beside the slots |
| Rarity | each item's tier, and the colour it is shown in | loot rolls by tier; presentation draws the colour |
| Consumables | what a consumable is and what its effect does | the party's `useItem` applies it; combat and exploration charge for it |
| Loot, drops, affixes | — | the loot segment generates finds; nothing here generates an item |

Items are read by the party and by combat and read nothing back. The segment has no
state of its own: a definition is a value, and the only mutable things in play are which
definition a character's slot points at and what the pack holds, which belong to the
party.

## What an Item Is

```
id        a stable name, unique across the catalogue
name      what the player is shown
kind      WEAPON | ARMOUR | SHIELD | CONSUMABLE
rarity    COMMON | UNCOMMON | RARE | EPIC | LEGENDARY, common when not given
slot      MAIN_HAND | OFF_HAND | BODY, for anything but a consumable
category  which kind of thing it is to wield, for anything but a consumable
```

The categories:

| Category | What belongs in it |
|---|---|
| `LIGHT_WEAPON` | daggers, short swords, maces, staves — weapons anyone can pick up |
| `MARTIAL_BLADE` | heavy blades a trained hand needs: longswords |
| `MARTIAL_BLUNT` | heavy blunt weapons: warhammers, great maces |
| `WAND` | a caster's weapon |
| `LIGHT_ARMOUR` | robes, leathers |
| `HEAVY_ARMOUR` | mail and plate |
| `SHIELD` | anything held in the off hand to turn blows |

and then, by kind:

| Kind | Carries | Means |
|---|---|---|
| **Weapon** | `skill`, `damage`, `governs` | what it trains, what it hits for, and which attribute makes it hurt |
| **Armour** | `armour` | the damage it turns |
| **Shield** | `armour` | the damage it turns, on top of what the body wears |
| **Consumable** | `effect` | what using it does: `heal`, a fixed number of hit points, or `teach`, the spell a tome teaches |
| **Food** | `nourish`, `heal`, `traits` | what it adds to the pot at camp; never equipped and never used from the pack (see the food segment) |

**Rarity is a property of the item.** A legendary blade is legendary wherever it turns
up: in any loot table, in the pack, in a hand. The tier is what loot rolls on and what
the screen colours a name by, and putting it on the item is what keeps the two in
agreement. An item authored without a rarity is common, so every item that existed
before rarity still reads.

**A consumable occupies no slot and is never equipped.** It sits in the pack until it
is used, and using it removes it. It names no category, because anyone can drink a
potion. The pack holds a consumable like anything else, and wielding rules never apply
to one: asking whether a potion fits a hand has no answer, so the question is refused
rather than answered no.

**Three slots, and no more for now.** A main hand, an off hand, and a body. A shield
occupies the off hand, which is what makes a shield and a second weapon the same
decision rather than two unrelated ones. Rings, cloaks and the rest are slots nothing
yet has a reason to fill, and a slot with nothing to put in it is a row of empty space
on a screen nobody has designed.

**`governs` is the finesse rule, written once.** Might governs damage by default; a
weapon that names Dexterity is a finesse weapon, and still trains the same weapon
skill. Putting it on the weapon rather than on the skill is what lets a dagger and a
longsword be the same practice and different arguments.

## What a Combatant Fights With

Both sides are made of the same stuff, so the arithmetic may not ask which side it is
reading. But an authored goblin has no armoury and should not need one: its claws are
its weapon and its hide is its armour.

**A combatant's weapon is whatever occupies the main hand, and failing that the attack
it was authored with.** A character picks up a sword and the sword answers; a goblin
never picks anything up and its own attack answers. The fallback is not a special case
for monsters — it is what *natural weapon* means, and a character who has been
disarmed reaches it by the same route.

The same holds for armour: what the body slot turns, or failing that what the combatant
was authored to turn, with whatever a shield in the off hand turns added on top.

This is the whole of the compatibility story. Nothing in combat branches on side, and
no enemy file has to be rewritten to hold a dagger it does not own.

## The Numbers

The two numbers combat resolves an attack with, assembled from the combatant and what
they hold. They live here because they are the only place a weapon, a rank and an attribute
meet, and splitting them between party and combat would mean writing each twice.

```
base damage = weapon.damage × (1 + 0.10 × rank(weapon.skill))
                            × (1 + 0.04 × (attribute(weapon.governs) − 10))

armour      = body armour (or authored armour) + shield.armour
```

**Damage is practice and force; armour is what is strapped on.** An attack always lands
(see the combat segment), so there is no to-hit number to assemble: how hard a blow is
and how much of it is turned are the whole of a fight's arithmetic.

**A wand is a caster's weapon, and its skill is the caster's magic.** A wand names
`MAGIC` as its skill rather than one weapon skill: whoever holds it swings with their
strongest magic school — Evocation, Alteration, Healing or Restoration, the highest rank,
ties going in that order — so its damage grows with that rank, and striking with it
trains that school. Its damage draws on the wielder's casting attribute — whatever
their class casts with, Intellect for a mage and Resolve for a cleric — so it names
`CASTING` rather than one attribute. A mage zapping with a wand practises Evocation and a
cleric practises Healing, which is what makes one weapon serve both classes that cast,
and makes practice at magic pay off between spells as well as in them.

**A shield is armour you hold.** It turns a share of every blow exactly as body armour
does, and adds to it only while it is in the off hand. Carrying one is a choice against
a second weapon or an empty hand, and what it buys is a smaller number on every enemy
blow.

**Every term degrades to nothing.** No weapon is damage zero; an empty slot contributes
nothing rather than failing. A
combatant holding nothing at all is weak, never broken.

## Wielding

`equip` belongs to the party, which owns what sits where. What it asks of this segment
is two questions, and this segment answers both from the item alone:

| Question | Answered by |
|---|---|
| Does this item go in this slot? | the item's own `slot` |
| May this class hold it? | whether the item's `category` is among those the class's file names in `wields` |

A refused equip changes nothing. The player is told no before anything moves, rather
than discovering a mage in plate by its consequences.

**A category is a permission, not a recommendation.** A thief may wear a breastplate if
the thief's file names the breastplate's category; nothing infers permission from the
skills a character holds, because what a character has practised and what their class
may hold are different questions. A consumable has no category, and anyone may use one.

## The Pack

**The pack is everything the party carries that nobody is wearing or wielding.** It
belongs to the party as a whole rather than to any one character, so handing a sword from
one character to another is taking it off one and putting it on the other, with the pack
between them. Nobody's bag is full while somebody else's is empty, and nobody has to
remember who is carrying what.

**An item is always somewhere.** It sits in a character's slot or in the pack, and
nothing moves it out of one without putting it in the other:

| Change | What moves |
|---|---|
| Equip from the pack | the item leaves the pack for the slot it names; whatever was in that slot goes into the pack |
| Take off | the item leaves the slot for the pack |

A swap is one change, not two. Putting a mace in a hand that holds a sword is one decision
and costs what one change costs, and the sword is in the pack afterwards rather than gone.

**The pack refuses nothing on its own account.** Whether an item may go into a slot is
the wielding rules below, asked of the item and the character exactly as they are for
equipping anything; the pack adds no rule of its own. A dead or unconscious character's
gear can be taken off and handed on, because a body that cannot fight still carries a
sword someone else can use.

**The pack has no limit yet.** Everything the party finds goes into it, so it never
has to ask what to leave behind. A limit would bring that choice, and the screen to
make it on.

**The pack holds the resolved item**, as a slot does, for the same reason: no registry
to consult, and nothing that fails to resolve far from where it was written.

## Authoring

Items are one file each under `src/game-data/items`, beside the combatants and read by
the same kind of loader — the same reasoning as a goblin in a file: a diff that shows
one weapon changing, and a new weapon that touches no module.

A file naming a slot, kind, category, skill or attribute that does not exist is rejected
by name, as a combatant file is. A typo in content should fail where it was typed.

## Decisions & Alternatives

| Decision | Chosen | Alternatives Considered | Rationale |
|---|---|---|---|
| Where an item lives | One JSON file each under `src/game-data/items` | A table inside the module that reads them; a single catalogue file | A file each diffs cleanly and is addable without opening code, which is the same argument that put each combatant in its own file. One big catalogue reintroduces the merge conflicts the per-file layout exists to avoid. |
| What a character holds | The resolved item, not an identifier | An id resolved against a registry at point of use | A registry is a second global to thread through combat and the save, and an id that fails to resolve fails somewhere far from where it was authored. Resolving once at load keeps the simulation free of lookups and matches how a combatant already holds its attack. The cost is that a save holds a copy of an item's numbers, so re-tuning a weapon does not reach gear already owned. |
| Where the formulas live | In the items segment, read by combat and the party | In combat, with items holding only data; duplicated in both | A weapon, a rank and an attribute meet in exactly one place and the two spec sets that describe them (`COMBAT-ATTACK-*` and `PARTY-SKILL-*`) say the same thing. Writing them once and reading them from both is what stops the two drifting into two different games. |
| A caster's weapon | A wand whose skill is the wielder's strongest magic school, drawing on the wielder's casting attribute | A wand training one fixed school (Evocation); a separate wand per class | One fixed school would leave a cleric holding a weapon they can never get better with. Following the strongest school lets one item serve every caster and keeps practice the axis that matters, without a wand per class to author and balance. |
| Which attribute governs damage | Named by the weapon | Fixed per skill; fixed per class | A dagger and a longsword are both Blade and are not the same argument for what makes a character dangerous. Fixing it per skill would make finesse a new skill rather than a property, and split practice in two for a distinction that is about the object. |
| What a shield does | Adds its armour to the body's | Raising a separate defence that decides whether a blow lands; reducing damage by a share | Every attack lands, so a number that decides whether one lands has nothing to do. Adding flat armour keeps a blow's damage a single subtraction the player can read off the preview. |
| A missing weapon | The combatant's authored attack stands in | A bare-hands item every combatant silently equips; refusing to fight unarmed | An authored goblin has no armoury and should not need one; its attack *is* its natural weapon. A phantom item would have to be authored, owned and saved for every combatant alive. Refusing to fight unarmed turns a disarm into a softlock. |
| Slots | Main hand, off hand, body | A fuller set with rings, cloak, head, feet; a weight-limited bag with no slots at all | A slot with nothing to put in it is empty space on a screen nobody has designed. A shield in the off hand is what makes a shield and a second weapon one decision. Slots can be added without moving anything, and will be when there is gear for them. |
| Who may wield what | The item names a category; the class's file names the categories it wields | The item names its classes; the class lists item ids; skill ranks implying permission | Content has to flow one way: adding a weapon must not mean editing four classes, and a category means it never does. Items naming their classes left no single place saying what a class may hold. Inferring permission from skills conflates what a character has *practised* with what their class may *hold*. |
| Where unequipped items go | One pack, shared by the party | A bag per character; items simply discarded when taken off | A bag per character turns handing over a sword into a bookkeeping errand and makes the player track who carries what. Discarding gear makes every swap irreversible, which punishes trying something. |
| What a swap costs | One change: the displaced item goes to the pack | Taking off and putting on as two changes | Replacing one item with another is a single decision, and charging twice for it would make experimenting with gear cost double. |
| A pack limit | None yet | A slot count, with a screen to choose what to keep when a find will not fit | A limit only matters once finds outstrip what a party wants to carry, and choosing what to leave behind is a screen and a decision the loot pass does not need. Finds go straight to the pack while there is room for everything. |
| Affixes | None yet; an item is exactly its file | Rolled affixes on found items | Affixes are a balance design, and there is nothing tuned to balance them against while enemy damage is flat and the armour curve is unbuilt. Numbers invented before the thing they answer to are numbers invented twice. |
| Where rarity lives | On the item | On a loot table's entry | A tier on the entry would let one sword be common in one table and legendary in another, and the colour on the screen would stop meaning anything. |
| Consumables and slots | A fourth kind, with no slot, never equipped | A consumable slot, or a belt of them per character | A slot for potions is a second inventory beside the pack, and choosing which potions to belt is bookkeeping that decides little. The shared pack already holds everything carried. |
| Food | A fifth kind, with no slot, used only in the pot | Food as a consumable eaten from the pack | Food is eaten only at camp, from a pot shared by the party. A consumable is used by one character from the pack, which is the wrong shape for a shared meal. |

## Open Questions & Future Decisions

### Resolved

1. ✅ **An item is a file**, read by the same kind of loader that reads a combatant.
2. ✅ **An item carries its own numbers**; nothing branches on what it is called.
3. ✅ **Three slots** — main hand, off hand, body — and a shield occupies the off hand.
4. ✅ **The weapon names the attribute its damage draws on.**
5. ✅ **A combatant with an empty main hand fights with its authored attack**, which is what a natural weapon is.
6. ✅ **A shield is armour you hold**: it adds its armour to the body's while in the off hand, and there is no accuracy or defence.
7. ✅ **An item names its category, and a class names the categories it may hold**; neither names the other.
8. ✅ **A character holds the resolved item**, not an identifier resolved later.
9. ✅ **Base damage and armour are assembled here**, and combat and the party both read them.
10. ✅ **Nothing here generates an item**; the loot segment does, and affixes come later.
11. ✅ **One pack, shared by the party**, holds everything carried and not equipped.
12. ✅ **An item is always in a slot or in the pack**, and a swap sends the displaced item to the pack as one change.
13. ✅ **Rarity is the item's own**, common unless authored otherwise.
14. ✅ **A consumable is a kind with no slot**, used up from the pack; a potion heals and a tome teaches a spell.
15. ✅ **A wand's skill is the wielder's strongest magic school**, and it draws on the wielder's casting attribute; it is uncommon or rarer, in the `WAND` category that mages and clerics wield.

### Deferred

1. **Affixes.** The HLD names affix rules. They want enemy armour on a curve to balance against.
2. **More slots.** Rings, cloak, head and feet are slots with nothing to put in them. Adding one moves nothing already built.
3. **More effects.** A consumable heals and does nothing else; curing a status waits for status effects.
4. **Two-handed weapons.** A weapon that claims the off hand as well as the main hand has nowhere to say so yet.
5. **Weapon reach and exposure.** Combat removed rows on the promise that reach returns as a property of weapons and abilities. The property has no field here yet.
6. **Encumbrance.** Nothing weighs anything, and nothing is slowed by what it carries.
7. **Repair, durability and curses.** No item degrades, breaks, or refuses to be taken off.
8. **A pack limit.** Finds go straight to the pack, which holds everything. A limit brings a choice of what to leave behind.

## References

- `docs/high-level-design.md` — the loot and items component, and the content-is-data rule.
- `docs/intent/loot/loot-design.md` — tables and finds, which roll on an item's rarity and fill the pack.
- `docs/intent/party/party-design.md` — the slots this segment fills and the `equip` operation that enforces its rules.
- `docs/intent/combat/combat-design.md` — the attack these numbers are resolved in.
