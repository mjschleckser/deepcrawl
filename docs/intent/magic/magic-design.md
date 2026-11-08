---
parent: high-level-design
prefix: MAGIC
---

# Magic

## Context and Design Philosophy

Magic is what a caster does instead of swinging: a spell, chosen from the ones the
character knows, paid for with a slot, and resolved to an effect. This segment decides
what a spell is, who knows it, what it costs, and what it does. Combat decides when a
spell is cast in a fight, exploration when one is cast out of one, and the party is
where every change to a character lands.

Four principles shape it.

**Slots are attrition, not a rotation.** A caster holds a few slots and spends one per
cast. Nothing refills them but camping, so the question a caster faces is never which
spell is optimal this turn but whether this is the fight worth spending on. A slot spent
on the first goblin is a slot not there for the fourth floor.

**A spell does what it says.** Nothing about a cast is rolled. A spell's damage or its
healing is fixed by the spell and the caster, and the number shown before it is cast is
the number that happens, exactly as for a weapon blow.

**A spell is data.** Each spell is a file of its own under the authored data, read by the
same kind of loader that reads an item. Adding a spell is authoring, not programming, and
nothing branches on a spell's name.

**Practice is power.** A spell grows stronger with the rank of the school it belongs to,
the same way a sword grows stronger with the rank of Blade. Casting is using that school,
so a caster gets better at what they actually cast.

## What This Segment Owns

| | Owned here | Owned elsewhere |
|---|---|---|
| What a spell is | the fields a spell carries, and reading them from authored files | content holds the files |
| Who knows a spell | the rule from class and school rank | the party holds the ranks |
| Spell slots | how many a character holds at each rank, spending them, restoring them | camp decides when slots are restored |
| What a cast does | the effect's size, its target, and whether it may be cast now | the party applies every change to a character; combat applies damage to an enemy |
| When a spell is cast | — | combat in a fight, exploration out of one |

## A Spell

A spell is authored as one file under `src/game-data/spells`, carrying:

| Field | Means |
|---|---|
| `id`, `name` | identity |
| `school` | the skill the spell belongs to: Evocation, Alteration, Healing or Restoration |
| `rank` | the spell's rank: the slot it costs, and the school rank a caster needs to know it |
| `classes` | the classes that may cast it |
| `target` | `ENEMY` or `ALLY`: whom it is aimed at |
| `effect` | what it does: `damage` with whether it `ignoresArmour`, or `heal` |
| `where` | where it may be cast: `COMBAT`, `EXPLORATION`, or both |
| `learned` | how a character comes to know it: `CLASS` or `TOME` |

The first spells:

| Spell | Learned | School | Rank | Classes | Target | Effect | Where |
|---|---|---|---|---|---|---|---|
| **Magic Missile** | class | Evocation | 1 | Mage | an enemy | 6 damage, ignoring armour | in a fight |
| **Heal** | class | Healing | 1 | Cleric | a conscious ally, the caster included | heals 8 | in a fight and exploring |
| **Fire Bolt** | tome | Evocation | 1 | Mage | an enemy | 10 damage, reduced by armour | in a fight |

Fire Bolt hits harder than Magic Missile and is blunted by armour where the missile is
not, so a mage who knows both chooses by what they are aiming at rather than always
reaching for the newer one.

## Who Knows a Spell

There are two kinds of spell, and they are learned two ways.

**A class spell is known as soon as practice reaches it.** A character knows one when
their class is among the spell's classes and their rank in the spell's school is at least
the spell's rank. Nothing is learned by hand and nothing is chosen at creation: a cleric
with a rank in Healing knows Heal, and a mage whose Evocation reaches rank 3 will know the
rank-3 Evocation class spells the moment it does. The class says which spells are open to
a character; practice says how far into them they have come.

**A rare spell is known only by reading its tome.** A tome is an item, found like any
other: in chests, and on the enemies whose loot tables carry one. Reading it teaches its
spell to the character who reads it, for good, and uses the tome up. A character may read
a tome only when their class is among the spell's classes, their rank in its school
reaches the spell's rank, and they do not know the spell already; otherwise the tome is
refused and kept, so it can go to someone who can use it, or wait until practice catches
up. A tome is read out of a fight, as a committed party action costing a tick: study is
not something done between blows.

Rare spells are what make a find exciting for a caster in the way a rare weapon is for a
fighter: practice gives every mage the same spells, and tomes are what make one mage's
repertoire different from another's.

## Spell Slots

A character holds a number of slots at each spell rank, spends one of a spell's rank on
each cast, and gets them back only by camping.

```
slots at rank 1 = 3 + 1 per 2 points of Intellect above 10
```

for a character who knows any rank-1 spell, and none for one who knows none. A character
holds no slots at a rank they know no spell of, so a fighter has no slots to show.
Intellect is the attribute that buys slots, which is the job the party segment gives it.

**A cast with no slot of its rank left is refused, and costs nothing.** No readiness, no
tick, no slot: it was never a cast. That is the same rule a refused drink follows, and it
is what lets the screen grey a spell rather than offer it and charge for the attempt.

Slots are a record of what has been spent, kept on the character, so the number held
follows Intellect and the spells known whenever either moves.

## What a Cast Does

A spell's effect is its base number grown by practice and wit:

```
magnitude = round(base × (1 + 0.10 × rank in the spell's school)
                       × (1 + 0.04 × (Intellect − 10))), at least 1
```

which is the same growth a weapon gets from its skill and its attribute, with Intellect
as the attribute for every spell. A fresh mage with Evocation 2 casts a 7-point Magic
Missile; a fresh cleric with Healing 2 casts a 10-point Heal.

**Damage that ignores armour is dealt whole.** Magic Missile is the caster's answer to
something armoured: where a staff blow on a goblin is worth its damage less the goblin's
armour, a missile is worth all of it. The price is a slot, which a staff never costs.

**Healing raises a conscious character's hit points, never past their maximum.** It does
not wake the unconscious; that is Restoration's work, and a different spell. A Heal aimed
at a character already at full hit points is refused, and costs nothing, for the same
reason a potion is refused there.

**What a cast will do is reported before it is cast**, by the same sum the cast runs
through: the damage a missile will deal to a given enemy, the hit points a heal will
restore to a given ally. Asking changes nothing.

**Casting is using the spell's school.** In a fight it is recorded as a skill used, and
advances at the fight's end as every skill used there does; out of a fight it trains the
school through the party's operation for a skill used outside combat.

## Where a Spell Is Cast

A spell names where it may be cast, and is offered nowhere else. Magic Missile is cast
only in a fight, there being nothing to aim it at in a corridor; Heal is cast in a fight
and while exploring.

In a fight, casting is the character's turn: it costs a full bar, as every action does,
as well as the slot. Its target is resolved the moment it is cast, so nothing is aimed at
a combatant who has since fallen.

Out of a fight, casting is committing to a party action: it costs the slot and a tick.

## Authoring

A spell file names its school, classes, target and where it is cast from the game's own
vocabularies, and a file naming one that does not exist is rejected by name, with the
value it could not read, as an item file is.

## Decisions & Alternatives

| Decision | Chosen | Alternatives Considered | Rationale |
|---|---|---|---|
| Paying for a spell | A slot of the spell's rank, restored only by camping | A mana pool that refills; cooldowns; free casting | Slots make magic attrition, so the question is whether this fight is worth spending on. A pool that refills, or a cooldown, makes the best spell the one cast every time it is ready, which is a rotation rather than a decision. |
| Restoring slots | Only by camping | After every won fight; on taking stairs | Refilling after every fight makes each fight a fresh budget and the long view disappears. Tying it to camping puts the refill where it costs something: time, risk, and the food buffs camping clears. |
| Knowing a spell | Class spells by class and school rank; rare spells only by reading a tome | Every spell learned from scrolls or trainers; every spell by rank; chosen at creation | Practice already drives every other part of a character, so the common spells arrive with it and need no learning screen. Tomes give loot something for casters to hope for and make two casters of one class differ. |
| Reading a tome | Out of a fight, by a character whose class and school rank fit, using the tome up | Readable by anyone; learning first and needing the rank later to cast; readable in a fight | A tome read by someone who can never cast its spell is a tome wasted, so it is refused and kept. Requiring the rank at reading keeps one rule for when a spell can be cast: known means castable. |
| Slot count | Three rank-1 slots, one more per two points of Intellect over ten | Slots from the school's rank; one slot per rank | Intellect is the attribute the party gives slots to. Three is enough for a fight or two and too few for a floor, which is the attrition intended. |
| Magnitude | Base × school rank × Intellect, fixed | A rolled range; base only | A fixed number keeps the preview honest, as weapon damage is. Growing with the school rank is what makes casting worth practising, and Intellect gives the attribute a reason to exist in a fight. |
| Magic Missile and armour | Ignores armour | Reduced by armour like a weapon blow | A mage's spell should answer what a mage's staff cannot. Ignoring armour gives a slot a reason to be spent on the armoured enemy rather than the soft one. |
| Healing the unconscious | Not by Heal | Heal waking the unconscious at its healed hit points | Waking the fallen is a bigger thing than topping someone up, and belongs to Restoration. Keeping it separate keeps a knocked-out character a real setback. |

## Open Questions & Future Decisions

### Resolved

1. ✅ **Spells are authored files**, one each, and nothing branches on a spell's name.
2. ✅ **Class spells come with practice; rare spells only from tomes.** A class spell is known when class and school rank allow; a rare one when its tome has been read.
9. ✅ **A tome is read out of a fight**, by a character who could cast its spell and does not know it, and is used up.
3. ✅ **Slots are per rank, spent one per cast, restored only by camping.**
4. ✅ **A cast with no slot left is refused and costs nothing.**
5. ✅ **A spell's effect is fixed**, grown by the school's rank and by Intellect, and reported before it is cast.
6. ✅ **Magic Missile ignores armour**, and is cast only in a fight.
7. ✅ **Heal raises a conscious character only**, is refused on one already whole, and is cast in a fight or out of one.
8. ✅ **Casting uses the spell's school**, in a fight and out of one.

### Deferred

6. **More rare spells and tomes.** Fire Bolt is the only rare spell; which spells are rare and which enemies carry their tomes is content to grow with the floors.

1. **Higher-rank slots.** Only rank-1 spells exist, so only rank-1 slots are defined. How many a character holds at higher ranks waits on spells to spend them on.
2. **Restoration.** Waking the unconscious, and the revival chain the party describes, is a spell not yet written.
3. **Enemy casters.** The goblin mage is a caster in role only. An enemy casting draws on the same spells and the same rules, once enemy behaviour can choose to.
4. **Spells over time and areas.** Every spell has one target and acts once. A spell that hits a whole side, or lasts several turns, waits on status effects.
5. **Alteration.** The school has ranks and no spell.

## References

- `docs/high-level-design.md`: the magic component.
- `docs/intent/combat/combat-design.md`: the cast action and its cost in readiness.
- `docs/intent/camp/camp-design.md`: restoring slots.
- `docs/intent/party/party-design.md`: schools as skills, Intellect, the operations that heal and harm.
- `docs/intent/exploration/exploration-design.md`: committing a party action out of a fight.
