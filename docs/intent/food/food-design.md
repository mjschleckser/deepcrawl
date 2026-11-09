---
parent: high-level-design
prefix: FOOD
---

# Food

## Context and Design Philosophy

Food is what the party carries, what it cooks at camp, and what it costs to go without.
This segment owns hunger, the ingredients the party finds, and the pot that turns them
into a meal. Exploration supplies the clock that hunger runs on; camp is the only place
food is cooked and eaten; the party carries what every character has eaten and how hungry
they are; combat and magic read the penalties and buffs a meal and an empty stomach leave
behind.

Four principles shape it.

**Time costs food.** Every tick the party spends in the dungeon — walking, camping,
committing to an action — is a tick its stomachs empty. A fight stops the clock, so a
long fight never starves anybody; everything outside a fight is paid for in food. This
is what makes a long expedition a decision rather than a stroll.

**Hunger warns before it hurts.** A character is fed for a long while after a meal, then
grows hungry by steps, each a little worse than the last, and the party is told at every
step. Starving costs hit points but never a life: a party that runs out of food is
weakened and in danger, never killed by the clock.

**The pot rewards experiment.** Cooking is not a list of recipes to look up. Ingredients
carry their own qualities, and whatever goes into the pot makes a meal out of the sum of
them. What dominates the pot decides what the meal does for the party; the cook's skill
decides how well.

**A meal lasts until the next camp.** A buff from food runs until the party camps again,
when it is cleared and a new meal can take its place. There is no timer to watch: the
decision is when to camp, which already costs time and risk.

## What This Segment Owns

| | Owned here | Owned elsewhere |
|---|---|---|
| Hunger | fullness, its stages, their penalties, starving's drain, and the notices | exploration supplies the ticks; the party holds each character's fullness |
| Ingredients | what a food item carries | items says what kinds of item there are; loot decides where food is found |
| Cooking | the pot: what a set of ingredients makes, scaled by the cook | camp decides when the pot may be used |
| Meal buffs | what each buff does, and clearing them | combat and magic read them |
| Foraging | what a forager finds at camp | camp decides when the party forages |

## Hunger

Every character holds a **fullness**: how many ticks of food they have left in them, up
to a maximum of **2000**. Each tick of the exploration clock takes one away, from every
character who is alive; a fight takes none. Fullness sets the character's stage:

| Fullness | Stage | Effect |
|---|---|---|
| 1000 – 2000 | **Fed** | none |
| 750 – 999 | **Hungry 1** | −5% damage and spell magnitude |
| 500 – 749 | **Hungry 2** | −10% |
| 250 – 499 | **Hungry 3** | −15% |
| 1 – 249 | **Hungry 4** | −20% |
| 0 | **Starving** | −25%, and loses 1 hit point every 30 ticks, never below 1 |

A full meal therefore keeps a character Fed for a thousand ticks — well over a hundred
steps — before the first pang, and hungry for another thousand before they starve.

**Each step down is announced.** When a character's stage worsens, the party is told who
and how: *Isolde is hungry*, *Isolde is very hungry*, *Bram is starving*. Nothing is
announced when a stage improves; eating is its own report.

**Starving never kills.** The drain stops at 1 hit point and never knocks a character
out. A starving party is weak and one fight from disaster, which is warning enough.

The penalty is applied wherever damage and spell magnitude are worked out — a weapon
blow's base damage and a spell's magnitude — so a hungry fighter and a hungry mage weaken
alike.

## Ingredients

Food is an item of its own kind, carried in the pack. It is never equipped and never used
from the Items screen: it goes into the pot at camp. An ingredient carries:

| Field | Means |
|---|---|
| `nourish` | the fullness it adds to the pot |
| `heal` | the hit points it adds to the pot |
| `traits` | its qualities, as points: `hearty`, `tough`, `nimble`, `arcane`, `hale`, `warming` |

The first ingredients, with what each eater gets from one before the cook's skill:

| Ingredient | Rarity | Nourish | Heal | Traits | Found |
|---|---|---|---|---|---|
| **Ration** | common | 600 | 2 | — | the starting supply; chests; goblins |
| **Goblin Haunch** | common | 450 | 8 | hearty 3 | goblins |
| **Spit-roast Rat** | common | 250 | 4 | nimble 2, hearty 1 | goblin archers |
| **Glowcap** | uncommon | 150 | 2 | arcane 3 | goblin mages; foraging |
| **Mage's Spice Pouch** | rare | 0 | 0 | arcane 4, warming 2 | goblin mages |
| **Bitterleaf** | common | 100 | 10 | tough 2 | foraging |
| **Fleetroot** | common | 150 | 3 | nimble 2 | foraging |
| **Cave Moss** | common | 200 | 6 | hale 1, warming 1 | foraging |
| **Ironcap** | uncommon | 150 | 4 | tough 3 | foraging |
| **Smoked Sausage** | uncommon | 700 | 6 | hearty 2, warming 2 | chests |
| **Honeycomb** | uncommon | 300 | 16 | hale 2 | chests |
| **Dragonpepper** | rare | 50 | 0 | hearty 4, warming 3 | chests |

A ration is plain food: it keeps the party fed and does little else. Everything else is
flavour.

**The party starts the campaign carrying six rations.**

## The Pot

At camp, the party puts any of the food it carries into one pot, and one meal comes out.
**Everyone who can eat gets the whole of it**: a meal does as much for each of four as it
would for one, so how much food a party needs does not depend on how many it is.

```
cook factor  = 1 + 0.10 × the best Cooking rank among those awake
nourishment  = total nourish × cook factor, to every eater
healing      = total heal × cook factor, rounded, to every eater
buffs        = the strongest traits in the pot, each at its points × cook factor,
               as many as the cook's rank allows
```

**The eaters are every character who is conscious.** An unconscious character cannot eat,
so a knocked-out character stays as hungry as they were.

**The strongest traits decide the buffs, and the cook decides how many.** A cook gives one
buff from Cooking rank 1 to 5, and two from rank 6 — one per five ranks, rounded up. The
pot's traits are ranked by their points, ties going in the order of the table below, and
the meal carries as many from the top as the cook allows. A pot of haunches is hearty;
throw in enough glowcaps and it turns arcane; a cook of rank 6 makes it both. A pot with no
traits at all, rations alone, gives no buff. What each trait does, per point after the
cook factor:

| Trait | Buff, until the next camp |
|---|---|
| **Hearty** | +2% weapon damage |
| **Tough** | +1 armour per 2 points |
| **Nimble** | +1 Dexterity per 2 points, which speeds the turn order |
| **Arcane** | +3% spell magnitude |
| **Hale** | +2 maximum hit points per point |
| **Warming** | fullness falls 5% slower per point, never more than half as slow |

So a pot of a haunch and a ration cooked by a rank-1 cook — hearty 3 × 1.1 — gives every
eater 1155 fullness, 11 hit points, and +7% weapon damage until the next camp.

**Every eater gets the same buffs, and a new meal replaces the old.** Camping clears every
buff before the pot is cooked, so the buffs a party carries are always those of its last
meal. Losing a hale buff takes its hit points back off the maximum, never below one hit
point.

**Cooking is using the Cooking skill.** The cook — whoever holds the best Cooking rank
among those awake — trains it each time the pot is cooked. Ingredients are used up whether
the meal was wise or not.

The camp shows what the pot will make before it is cooked: what each eater gets in
nourishment and healing, and the buffs. Choosing what goes in is the whole decision, and
the preview is what makes experimenting with it cheap.

## Foraging

When a camp is not broken, the character with the best Foraging rank among those awake
searches the surroundings and finds **1 + ½ their Foraging rank** ingredients (rounded
down), drawn evenly from the forage list — Bitterleaf, Fleetroot, Cave Moss, Ironcap and
Glowcap. Finds go straight
into the pack, before the pot is filled, so they can go into the same meal. Foraging trains
the forager's Foraging skill.

## Decisions & Alternatives

| Decision | Chosen | Alternatives Considered | Rationale |
|---|---|---|---|
| Hunger model | Fullness per character in ticks, falling one per tick | A party food stock eaten automatically; a hunger meter per day | Per character lets an unconscious character fall behind and lets a meal be shared out. Measuring in ticks puts hunger on the same clock as everything else. |
| What hunger costs | A long fed stage, hungry stages that ramp up with a notice each, then starving to 1 hit point | Hit-point loss only; starvation that kills | A ramp warns before it hurts, and a death from the clock alone is a loss nobody chose. |
| Cooking | A freeform pot whose dominant trait decides the buff | Authored recipes; rations only | Recipes become a list to look up. A pot built from ingredients' own qualities invites experiment, and adding an ingredient is authoring one file. |
| Where eating happens | Only at camp | Eating rations from the pack anywhere | Tying every meal to camp makes camping the moment the party recovers and prepares, and stops hunger being solved by a menu press mid-corridor. |
| How long a buff lasts | Until the next camp | A number of ticks; a number of fights | The next camp is when a new meal is made, and the moment the decision is taken anyway. A timer would be one more thing to watch. |
| Sharing the pot | Every eater gets the whole pot | Split equally among the eaters; the player portions it | Splitting a meal couples food to the size of the party, so a full party starves where a small one is fed. A whole pot each keeps food a question of supplies rather than headcount, and portioning by hand is bookkeeping. |
| How many buffs | One per five Cooking ranks, rounded up: one, then two from rank 6 | Always one; every trait in the pot | Always one leaves the Cooking skill nothing to grow into; every trait makes a pot of everything the best pot. Tying the count to the cook makes practice at cooking pay off in the meal. |
| Foraging | At camp, by the best forager | A chance on every step; a separate Forage action | Foraging during the rest uses time camp already spends, and keeps exploration free of a per-step roll. |

## Open Questions & Future Decisions

### Resolved

1. ✅ **Fullness is per character, in ticks, up to 2000**, and falls one per exploration tick.
2. ✅ **Fed, four Hungry stages that ramp up, then Starving**, with a notice for each step down.
3. ✅ **Starving drains hit points to 1 and never kills or knocks a character out.**
4. ✅ **Food is eaten only at camp**, from one pot, and everyone conscious gets the whole of it.
5. ✅ **The pot's strongest traits decide its buffs**, one per five Cooking ranks rounded up, scaled by the best Cooking rank.
6. ✅ **A meal's buffs last until the next camp**, which clears them.
7. ✅ **The party starts with six rations**; food is also found as loot, dropped by enemies, and foraged at camp.

### Deferred

1. **More traits and ingredients.** Four traits and five ingredients are a starting set. Rarer ingredients from deeper floors, and traits that do more than nudge a number, are content to grow.
2. **Spoilage.** Food lasts for ever in the pack. Whether some of it should go off is open.
3. **Buying food.** The town will sell rations once there is a town.

## References

- `docs/high-level-design.md`: the food component.
- `docs/intent/camp/camp-design.md`: when the pot is cooked, and clearing buffs.
- `docs/intent/exploration/exploration-design.md`: the clock and its hunger hook.
- `docs/intent/items/items-design.md`: food as a kind of item.
- `docs/intent/loot/loot-design.md`: where food is found.
- `docs/intent/party/party-design.md`: what a character holds; Cooking and Foraging.
