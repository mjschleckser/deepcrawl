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
| `traits` | its qualities, as points: `hearty`, `tough`, `nimble`, `arcane` |

The first ingredients:

| Ingredient | Rarity | Nourish | Heal | Traits | Found |
|---|---|---|---|---|---|
| **Ration** | common | 800 | 4 | — | the starting supply; chests; goblins |
| **Goblin Haunch** | common | 500 | 12 | hearty 3 | goblins |
| **Glowcap** | uncommon | 150 | 4 | arcane 3 | goblin mages; foraging |
| **Bitterleaf** | common | 100 | 10 | tough 2 | foraging |
| **Fleetroot** | common | 150 | 4 | nimble 2 | foraging |

A ration is plain food: it fills the pot and does little else. Everything else is
flavour.

**The party starts the campaign carrying six rations.**

## The Pot

At camp, the party puts any of the food it carries into one pot, and one meal comes out,
shared by everyone who can eat.

```
cook factor  = 1 + 0.10 × the best Cooking rank among those awake
nourishment  = total nourish × cook factor, shared equally among the eaters
healing      = total heal × cook factor, shared equally among the eaters, rounded
buff         = the trait with the most points in the pot, at its points × cook factor
```

**The eaters are every character who is conscious.** An unconscious character cannot eat,
so a knocked-out character stays as hungry as they were.

**The dominant trait decides the buff.** A pot of haunches is hearty; throw in enough
glowcaps and it turns arcane. Ties go in trait order — hearty, tough, nimble, arcane — and
a pot with no traits at all, rations alone, gives no buff. What each trait does, per point
after the cook factor:

| Trait | Buff, until the next camp |
|---|---|
| **Hearty** | +2% weapon damage |
| **Tough** | +1 armour per 2 points |
| **Nimble** | +1 Dexterity per 2 points, which speeds the turn order |
| **Arcane** | +3% spell magnitude |

So a pot of two haunches cooked by a rank-1 cook — hearty 6 × 1.1 — gives every eater
+13% weapon damage until the next camp.

**Every eater gets the same buff, and a new meal replaces the old.** Camping clears every
buff before the pot is cooked, so the buff a party carries is always the one from its last
meal.

**Cooking is using the Cooking skill.** The cook — whoever holds the best Cooking rank
among those awake — trains it each time the pot is cooked. Ingredients are used up whether
the meal was wise or not.

The camp shows what the pot will make before it is cooked: what each eater gets in
nourishment and healing, and the buff. Choosing what goes in is the whole decision, and
the preview is what makes experimenting with it cheap.

## Foraging

When a camp is not broken, the character with the best Foraging rank among those awake
searches the surroundings and finds **1 + ½ their Foraging rank** ingredients (rounded
down), drawn from the forage list — Bitterleaf, Fleetroot and Glowcap. Finds go straight
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
| Sharing the pot | Split equally among the conscious | Each eater gets the whole pot; the player portions it | A whole pot each would make a big party cheaper to feed per head. Splitting it makes food scale with the party, and portioning by hand is bookkeeping. |
| Foraging | At camp, by the best forager | A chance on every step; a separate Forage action | Foraging during the rest uses time camp already spends, and keeps exploration free of a per-step roll. |

## Open Questions & Future Decisions

### Resolved

1. ✅ **Fullness is per character, in ticks, up to 2000**, and falls one per exploration tick.
2. ✅ **Fed, four Hungry stages that ramp up, then Starving**, with a notice for each step down.
3. ✅ **Starving drains hit points to 1 and never kills or knocks a character out.**
4. ✅ **Food is eaten only at camp**, from one pot shared by everyone conscious.
5. ✅ **The pot's dominant trait decides its buff**, scaled by the best Cooking rank.
6. ✅ **A meal's buff lasts until the next camp**, which clears it.
7. ✅ **The party starts with six rations**; food is also found as loot, dropped by enemies, and foraged at camp.

### Deferred

1. **More traits and ingredients.** Four traits and five ingredients are a starting set. Rarer ingredients from deeper floors, and traits that do more than nudge a number, are content to grow.
2. **Spoilage.** Food lasts for ever in the pack. Whether some of it should go off is open.
3. **Buying food.** The town will sell rations once there is a town.
4. **Two buffs from one pot.** A pot gives only its dominant trait's buff; a second trait strong enough to count is a possible extension.

## References

- `docs/high-level-design.md`: the food component.
- `docs/intent/camp/camp-design.md`: when the pot is cooked, and clearing buffs.
- `docs/intent/exploration/exploration-design.md`: the clock and its hunger hook.
- `docs/intent/items/items-design.md`: food as a kind of item.
- `docs/intent/loot/loot-design.md`: where food is found.
- `docs/intent/party/party-design.md`: what a character holds; Cooking and Foraging.
