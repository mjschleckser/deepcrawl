---
parent: high-level-design
prefix: CAMP
---

# Camp

## Context and Design Philosophy

Camp is where the party stops in the dungeon to recover what it has spent. It is the one
place spell slots and a cleric's Intercession charges come back, and the only place food
is cooked and eaten. This segment decides when the
party may camp, what camping costs, and what it restores. Magic owns slots and says how
they are restored; exploration owns the clock camping advances; roaming enemies keep
moving while the party rests.

Three principles shape it.

**Recovery has a price.** If resting were free, slots would stop being attrition: a caster
would spend everything in every fight and rest after each one. Camping therefore costs
time, which the dungeon spends moving its enemies, and it clears the food buffs the party
is carrying, so a camp is always a choice to give up what was cooked last.

**No resting in a fight's shadow.** A party cannot camp with an enemy in sight. Camp is
something done in a cleared room or a quiet corridor, never as a way out of a fight about
to begin.

**Camp is a scene, not a menu.** The party rests, forages, and gathers round one pot. What
goes into it is the decision the scene exists for.

## What This Segment Owns

| | Owned here | Owned elsewhere |
|---|---|---|
| Whether the party may camp | the refusal with an enemy in sight | exploration says what the party can see |
| What camping costs | the ticks a rest takes; clearing food buffs | exploration advances the clock; roaming enemies move on it |
| What camping restores | asking magic to restore slots, and the party to restore Intercession charges | magic owns slots; the party owns charges |
| The meal | when the pot is offered, foraging, clearing buffs | food owns hunger, ingredients, the pot and what a buff does |

## Camping

The player camps from exploration, with the `CAMP` party action. Camping happens in this
order:

1. **If any roaming enemy is in sight, camping is refused**, and nothing is spent. In sight
   means what the automap means by it: within the party's sight distance, with nothing
   opaque between. An enemy behind a closed door or round a corner does not stop a camp.
2. **The rest takes its time.** The clock advances by the camp's ticks — a long stretch,
   many steps' worth — and roaming enemies on the floor spend those ticks moving, as they
   would had the party walked.
3. **If an enemy reaches the party during the rest, the camp is broken.** The fight begins
   where the party lies, and nothing is restored: the time is spent and the slots are not.
4. **Otherwise the party wakes rested.** Every character who is still alive has every spent
   spell slot and every spent Intercession charge restored, and every meal buff still
   running is cleared.
5. **The party forages.** The best forager among those awake finds ingredients, which go
   into the pack.
6. **The pot is offered.** The player chooses which food from the pack goes in, sees what
   the meal would make, and cooks it — or leaves without eating. A camp that is left
   without cooking still restored the slots and still cleared the buffs.

The hunger of the camp's ticks is spent as the party rests, before it eats: a long rest is
paid for in food.

The party learns how the camp went: rested and fed, broken by an enemy, or refused because
one was in sight.

**The unconscious rest too.** A character knocked out still gets their slots back; a camp
does not wake them. Waking the fallen is Restoration's work.

**Hit points come from food.** Camping restores no hit points by itself; the meal does,
by what went into the pot.

## Decisions & Alternatives

| Decision | Chosen | Alternatives Considered | Rationale |
|---|---|---|---|
| What limits camping | No enemy in sight; a long stretch of time; clearing food buffs | Camping anywhere for free; a fixed number of camps per floor; camping only at marked sites | Each limit is something the dungeon already has: sight, the clock, and the roamers moving on it. A camp count or camp sites would be a new rule with nothing in the world behind it. |
| An enemy arriving mid-rest | The camp is broken and restores nothing | Restoring first and fighting rested; the enemy simply waiting | A rest that always succeeds makes the time cost cosmetic. Losing the rest to an ambush is what makes choosing where to camp matter. |
| Hit points at camp | Restored only through the meal | Full hit points at every camp | Free full healing would make potions and Heal near pointless between camps. Healing through food ties recovery to the cooking the camp is for. |
| Waking the unconscious | Not by camping | Camping wakes everyone | Being knocked out should stay a setback that needs a cleric's craft, not a nap. |

## Open Questions & Future Decisions

### Resolved

1. ✅ **Camping restores spell slots and Intercession charges; the meal restores hit points and fullness.**
2. ✅ **Camping is refused with an enemy in sight**, by the automap's rule of sight.
3. ✅ **A camp takes a long stretch of ticks**, and roaming enemies move through it.
4. ✅ **An enemy reaching the party mid-rest breaks the camp**, and nothing is restored.
5. ✅ **Camping clears running food buffs**, which is the price of every camp once food exists.

### Deferred

1. **How long a camp takes.** The number of ticks is a placeholder until roaming and re-stocking are tuned against it.

## References

- `docs/high-level-design.md`: the camp component.
- `docs/intent/magic/magic-design.md`: spell slots, which camping restores.
- `docs/intent/exploration/exploration-design.md`: the clock, the camp hook, and the sight rule.
- `docs/intent/enemies/enemies-design.md`: roamers moving on the ticks they are given.
- `docs/intent/food/food-design.md`: hunger, foraging, the pot and the buffs it gives.
