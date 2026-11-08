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
states its damage, its accuracy, the skill it trains and the attribute it draws on.
Nothing anywhere asks "is this a dagger" to decide how it behaves. A dagger and a
longsword are both Blade and are not the same argument for what makes a character
dangerous, and that difference lives in their files rather than in a branch.

**What a character may hold is a question for the item, not the character.** An item
names the slot it occupies and the classes that may wield it. A class does not carry a
list of what it is allowed; a breastplate carries the list of who may wear it. New
items therefore arrive without editing the classes, which is the direction content has
to flow if content is to be addable.

## What This Segment Owns

| | Owned here | Owned elsewhere |
|---|---|---|
| Item definitions | what an item is: slot, kind, numbers, who may wield it | — |
| Slots | which slots exist, and what each admits | the party records what occupies them |
| Wielding rules | whether this class may hold this item in this slot | the party's `equip` enforces the answer |
| Derived combat numbers | how accuracy, defence and base damage are assembled | combat resolves the roll they feed |
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
classes   which classes may wield it, or nothing for anyone
```

and then, by kind:

| Kind | Carries | Means |
|---|---|---|
| **Weapon** | `skill`, `damage`, `accuracy`, `governs` | what it trains, what it hits for, how true it swings, and which attribute makes it hurt |
| **Armour** | `skill`, `armour` | the armour skill it is worn under, and the damage it turns |
| **Shield** | `defence` | how much harder it makes its holder to hit |
| **Consumable** | `effect` | what using it does; the one effect so far is `heal`, a fixed number of hit points |

**Rarity is a property of the item.** A legendary blade is legendary wherever it turns
up: in any loot table, in the pack, in a hand. The tier is what loot rolls on and what
the screen colours a name by, and putting it on the item is what keeps the two in
agreement. An item authored without a rarity is common, so every item that existed
before rarity still reads.

**A consumable occupies no slot and is never equipped.** It sits in the pack until it
is used, and using it removes it. It names no classes, because anyone can drink a
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
was authored to turn.

This is the whole of the compatibility story. Nothing in combat branches on side, and
no enemy file has to be rewritten to hold a dagger it does not own.

## The Numbers

The three formulas combat resolves against, assembled from the combatant and what they
hold. They live here because they are the only place a weapon, a rank and an attribute
meet, and splitting them between party and combat would mean writing each twice.

```
accuracy    = weapon.accuracy + 5 × rank(weapon.skill) + 2 × (Perception − 10)

defence     = 20 + 2 × (Dexterity − 10) + 3 × rank(worn armour's skill) + shield.defence

base damage = weapon.damage × (1 + 0.10 × rank(weapon.skill))
                            × (1 + 0.04 × (attribute(weapon.governs) − 10))
```

**Accuracy is practice and eyesight; defence is nimbleness and what is strapped on;
damage is practice and force.** Perception governs accuracy for every weapon, which is
what stops the damage attribute compounding twice in the same swing: a mighty character
hits harder, not more often.

**Armour is not in the defence line, and that is the point.** Armour reduces the damage
of a blow that landed and does nothing else. One number doing both jobs makes heavy
armour doubly good and light armour doubly bad, and squeezes the bands until a point of
armour outweighs a rank of practice. A shield is the exception that proves it: a shield
is in the defence line because turning a blow aside is the whole of what a shield does.

**Every term degrades to nothing.** No weapon is accuracy zero and damage zero; no
armour skill is rank zero; an empty slot contributes nothing rather than failing. A
combatant holding nothing at all is weak, never broken.

## Wielding

`equip` belongs to the party, which owns what sits where. What it asks of this segment
is two questions, and this segment answers both from the item alone:

| Question | Answered by |
|---|---|
| Does this item go in this slot? | the item's own `slot` |
| May this class hold it? | the item's own `classes`, or yes if it names none |

A refused equip changes nothing. The player is told no before anything moves, rather
than discovering a mage in plate by its consequences.

**A class list is a permission, not a recommendation.** A thief may wear a breastplate
if the breastplate's file says thieves may; nothing infers permission from a class's
skill table, because the skills a class *can train* and the gear it *may hold* are
different questions and conflating them makes one unchangeable without the other.

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

A file naming a slot, kind, skill, class or attribute that does not exist is rejected
by name, as a combatant file is. A typo in content should fail where it was typed.

## Decisions & Alternatives

| Decision | Chosen | Alternatives Considered | Rationale |
|---|---|---|---|
| Where an item lives | One JSON file each under `src/game-data/items` | A table inside the module that reads them; a single catalogue file | A file each diffs cleanly and is addable without opening code, which is the same argument that put each combatant in its own file. One big catalogue reintroduces the merge conflicts the per-file layout exists to avoid. |
| What a character holds | The resolved item, not an identifier | An id resolved against a registry at point of use | A registry is a second global to thread through combat and the save, and an id that fails to resolve fails somewhere far from where it was authored. Resolving once at load keeps the simulation free of lookups and matches how a combatant already holds its attack. The cost is that a save holds a copy of an item's numbers, so re-tuning a weapon does not reach gear already owned. |
| Where the formulas live | In the items segment, read by combat and the party | In combat, with items holding only data; duplicated in both | A weapon, a rank and an attribute meet in exactly one place and the two spec sets that describe them (`COMBAT-ATTACK-*` and `PARTY-SKILL-*`) say the same thing. Writing them once and reading them from both is what stops the two drifting into two different games. |
| Which attribute governs damage | Named by the weapon | Fixed per skill; fixed per class | A dagger and a longsword are both Blade and are not the same argument for what makes a character dangerous. Fixing it per skill would make finesse a new skill rather than a property, and split practice in two for a distinction that is about the object. |
| Accuracy's attribute | Always Perception | The weapon's governing attribute, as damage uses | Tying to-hit to the governing attribute would make Might raise both how often you hit and how hard, compounding one attribute twice in the same swing. Perception gains a reason to exist in a fight without becoming universal. |
| A missing weapon | The combatant's authored attack stands in | A bare-hands item every combatant silently equips; refusing to fight unarmed | An authored goblin has no armoury and should not need one; its attack *is* its natural weapon. A phantom item would have to be authored, owned and saved for every combatant alive. Refusing to fight unarmed turns a disarm into a softlock. |
| Slots | Main hand, off hand, body | A fuller set with rings, cloak, head, feet; a weight-limited bag with no slots at all | A slot with nothing to put in it is empty space on a screen nobody has designed. A shield in the off hand is what makes a shield and a second weapon one decision. Slots can be added without moving anything, and will be when there is gear for them. |
| Who may wield what | The item names its classes | The class names what it may hold; skill ranks implying permission | Content has to flow one way: adding a weapon must not mean editing four classes. Inferring permission from the skill table conflates what a class may *train* with what it may *hold*, and makes neither changeable alone. |
| Where unequipped items go | One pack, shared by the party | A bag per character; items simply discarded when taken off | A bag per character turns handing over a sword into a bookkeeping errand and makes the player track who carries what. Discarding gear makes every swap irreversible, which punishes trying something. |
| What a swap costs | One change: the displaced item goes to the pack | Taking off and putting on as two changes | Replacing one item with another is a single decision, and charging twice for it would make experimenting with gear cost double. |
| A pack limit | None yet | A slot count, with a screen to choose what to keep when a find will not fit | A limit only matters once finds outstrip what a party wants to carry, and choosing what to leave behind is a screen and a decision the loot pass does not need. Finds go straight to the pack while there is room for everything. |
| Affixes | None yet; an item is exactly its file | Rolled affixes on found items | Affixes are a balance design, and there is nothing tuned to balance them against while enemy damage is flat and the armour curve is unbuilt. Numbers invented before the thing they answer to are numbers invented twice. |
| Where rarity lives | On the item | On a loot table's entry | A tier on the entry would let one sword be common in one table and legendary in another, and the colour on the screen would stop meaning anything. |
| Consumables and slots | A fourth kind, with no slot, never equipped | A consumable slot, or a belt of them per character | A slot for potions is a second inventory beside the pack, and choosing which potions to belt is bookkeeping that decides little. The shared pack already holds everything carried. |

## Open Questions & Future Decisions

### Resolved

1. ✅ **An item is a file**, read by the same kind of loader that reads a combatant.
2. ✅ **An item carries its own numbers**; nothing branches on what it is called.
3. ✅ **Three slots** — main hand, off hand, body — and a shield occupies the off hand.
4. ✅ **The weapon names the attribute its damage draws on**; Perception always governs accuracy.
5. ✅ **A combatant with an empty main hand fights with its authored attack**, which is what a natural weapon is.
6. ✅ **Armour reduces damage and never defence**; a shield raises defence and reduces nothing.
7. ✅ **An item names the classes that may hold it**, and a class names nothing.
8. ✅ **A character holds the resolved item**, not an identifier resolved later.
9. ✅ **The three formulas live here**, and combat and the party both read them.
10. ✅ **Nothing here generates an item**; the loot segment does, and affixes come later.
11. ✅ **One pack, shared by the party**, holds everything carried and not equipped.
12. ✅ **An item is always in a slot or in the pack**, and a swap sends the displaced item to the pack as one change.
13. ✅ **Rarity is the item's own**, common unless authored otherwise.
14. ✅ **A consumable is a kind with no slot**, used up from the pack; its one effect so far heals.

### Deferred

1. **Affixes.** The HLD names affix rules. They want enemy defence and armour on a curve to balance against.
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
- `docs/intent/combat/combat-design.md` — the bands these numbers are resolved against.
