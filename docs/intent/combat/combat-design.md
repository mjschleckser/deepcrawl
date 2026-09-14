---
parent: high-level-design
prefix: COMBAT
---

# Combat

## Context and Design Philosophy

Combat is where the party's composition is tested. It runs entirely outside the clock,
resolves one character at a time, and ends by handing the party what it learned.

Three principles shape the design.

**Where they stand decides it.** Reach is a hard rule, not a modifier: melee cannot
touch the back row while a front rank stands. Every other part of the design — how
enemies choose targets, what a polearm is for, why losing the front row is a crisis —
follows from that one restriction. A combat system where position was merely an
optimisation would leave the project's own objective unmet.

**A bad roll should cost damage, not a turn.** An attack resolves into four bands
rather than two. Missing outright is reserved for a character badly outmatched by what
they are swinging at; ordinarily a poor roll grazes. A turn that produces nothing is a
turn the player did not get to play, and combat is short enough that losing one hurts
out of proportion to its arithmetic.

**Nothing accrues for staying longer.** The clock is stopped, so hunger does not
advance and torches do not burn. That is a constraint on this segment rather than a
licence: nothing here may regenerate, recharge, or accumulate per round, and the
encounter pot is fixed by the enemies rather than by the number of rounds taken.

## The Shape of an Encounter

```
exploration hands over ──▶ surprise ──▶ ROUND ──▶ … ──▶ outcome ──▶ pot awarded
                                         │  ▲
                                  select │  │ resolve
                                         └──┘
```

Exploration begins an encounter with a payload naming the enemy group, the light level
of the tile it began on, and which side was aware of the other. Combat runs rounds
until one side is finished or the party escapes, then reports the outcome and the
experience pot back.

### A round

Every round has two phases, and they do not interleave.

1. **Selection.** Every character able to act chooses an action. Enemies choose too.
   Nothing is resolved, so a player cannot see the results of one choice before making
   the next.
2. **Resolution.** Actions resolve one at a time in descending Dexterity. Ties go to
   the party; ties within the party are settled by a fixed order of position.

Because selection completes before anything resolves, an action can be aimed at a
target that is gone by the time it lands. When that happens the action **fizzles**: it
is spent, and nothing else happens. It does not seek a substitute.

That is intended, and it is the cost of committing before you know. A heal aimed at an
ally who dies first is wasted, and the lesson is to protect them earlier rather than to
react faster.

### Surprise

If one side was unaware, the aware side takes a full round before the first ordinary
round begins. Awareness comes from exploration — light, and whether the party saw what
was coming.

## Resolving an Attack

One roll decides both whether an attack landed and how well.

```
outcome = roll + accuracy − defence
```

The result falls into one of four bands:

| Band | Effect |
|---|---|
| **Miss** | nothing lands |
| **Graze** | reduced damage |
| **Hit** | full damage |
| **Crit** | increased damage |

The band thresholds are content data. What the design fixes is their shape: the miss
band is **narrow**, so a character only whiffs when badly outmatched by what they are
attacking, and the crit band is **far out**, so reliable critical hits require an
accuracy advantage that a campaign does not casually produce. Between them sits a wide
middle where the ordinary result of a fair fight is a hit, and the ordinary result of
an unfavourable one is a graze.

This is the whole reason for four bands. A binary system makes an unfavourable matchup
produce *nothing*, so the player watches turns evaporate; a graded one makes it produce
*less*, so the fight is still being played while it is being lost.

**Minimum damage.** An attack that lands always deals at least a twentieth of its base
damage, rounded up, and never less than one. Heavy armour can reduce a blow to almost
nothing, but a blow that connected is never worth nothing — that is what the miss band
is for, and having two different ways to deal zero would make the bands meaningless.

**Accuracy** is assembled from the attacker's weapon skill rank, the attribute the
weapon declares it draws on, and equipment. **Defence** is assembled from the
defender's armour skill, attributes, and equipment. Which attribute an attack draws on
is a property of the weapon, never of the skill — a finesse blade draws on Dexterity
where a mace draws on Might, and both still use their weapon skill.

## Reach and Targeting

Reach is a hard rule. Targeting is a soft one.

| | May be attacked by melee | May attack with melee | May attack at range |
|---|---|---|---|
| Front row | yes | yes | yes |
| Back row | only once no *conscious* character stands in front | no, unless the weapon reaches | yes |

A body does not shield anyone. The front row blocks melee only while at least one
character standing in it is conscious, so the line falls the moment its last upright
member does — and a front rank reduced to one is a genuine emergency rather than a
formality.

A **reaching** weapon — a polearm, by default — lets a back-row character strike the
enemy front row without standing in the front themselves. That is the entire purpose of
the property, and it is what makes a polearm a different decision from a sword rather
than a differently-numbered one.

Ranged attacks and spells reach any row on either side. A bow is what makes a back row
offensive rather than merely safe.

**Targeting is weighted, not forced.** An enemy choosing a melee target must pick from
the front row, but an enemy choosing a ranged or magical target prefers the front row
while remaining able to strike the back. A back row is much safer than a front row and
is never wholly safe, which is what keeps a back-row character from being a spectator
to their own defence.

## Actions

| Action | Costs | Notes |
|---|---|---|
| Attack | the actor's action | melee or ranged, per the weapon |
| Cast | the actor's action, and a spell slot of that rank | |
| Use ability | the actor's action | unlocked by a skill rank |
| Swap places | the actor's action | dragging an ally out of the front rank is work |
| Relight | the actor's action | a doused light source, per exploration |
| Defend | the actor's action | raises defence until their next turn |
| Flee | the whole party's round | see below |

A character acts once per round. Nothing grants an extra action per round in the base
design; abilities that would are a matter for the abilities content, not for this
structure.

### Spell slots

A caster holds a number of slots at each spell rank. Casting spends one of that rank,
and slots are restored only by sleeping at camp — which costs ticks, and ticks cost
food and light.

This is what makes magic an attrition resource rather than a rotation. The question a
caster faces on the fourth floor is not which spell is optimal but whether this is the
fight worth spending the last heal on. Slots deliberately do not recover between
fights, or per round, because either would make descending deeper cost nothing.

## Enemies

An enemy group has a front row and a back row and obeys the same reach rules the party
does — an enemy caster shelters behind its own front rank exactly as the party's does,
and can be reached by a bow exactly as the party's can.

Enemy groups are **not capped at five**. Being outnumbered is a real and common threat,
and it is the pressure that makes a front rank holding matter. A group of eight with
three casters behind five bodies is a different problem from a single large enemy, and
both should be expressible.

An enemy row holds at most ten. Most groups are far smaller — three to five a row is
ordinary — but the ceiling exists so a swarm is a shape the game can express rather
than an unbounded number. Without it, "front row" would stop meaning anything, since an
arbitrary number of enemies could stand in front and the reach rules would describe
nothing.

Enemy behaviour is deliberately simple at this stage: choose a legal target, preferring
the front row, and attack. Anything cleverer belongs with enemies, which are their own
segment.

## Darkness

An encounter carries the light level of the tile it began on, because a fight in the
dark is a different fight.

Where the party cannot see, attacks suffer a heavy accuracy penalty and a target cannot
be chosen deliberately — the attacker strikes at whatever is in front of them. A party
whose last torch failed mid-corridor can still fight, badly, and relighting costs
someone their action while the fight goes on around them.

Light never helps the enemy. It does not raise the party's chance of being hit and it
does not make enemies more aware; it only lets the party fight properly.

## Ending

| Outcome | Condition |
|---|---|
| **Victory** | no enemy remains able to act |
| **Defeat** | no party member remains conscious |
| **Escape** | a flee attempt succeeded |

On victory, combat totals the pot from the enemies defeated and hands it to the party
with the distinct skills used, which is the whole of its involvement in advancement.

### Defeat

A defeated party is not erased. The delve ends where it ended: the party stays on the
floor it fell on, in whatever condition it fell in, and the campaign continues without
them.

From there the player has two courses. They may abandon the campaign and begin again,
or they may return to town, hire a fresh party at the tavern, and go down after the
first one — recovering the fallen where they lie, with whatever it costs to bring them
home.

This is what makes *setbacks, not erasure* true at the campaign level while leaving a
wipe genuinely terrible. A party is lost; the campaign is not; and getting them back is
a delve of its own.

Combat's part in this is small and its boundary is worth stating plainly: it reports
that the party was defeated and where. A stranded roster belongs to the party segment,
bodies lying on a floor belong to exploration, and hiring belongs to a town that does
not exist yet.

**Fleeing** is resolved once for the whole party rather than per character — a party
does not leave one member behind. Escape returns the party to the tile it came from,
and nothing is awarded.

An attempt fails outright when the enemy is far faster than the party, or when
something in the group can prevent escape. Speed is compared against the party's
*slowest* member, because a party flees no faster than whoever is hindmost; an enemy
more than a quarter faster than that cannot be outrun.

A failed attempt costs the round it was spent on and nothing more. There is no
additional penalty, no free strike for the enemy, and no bar on trying again next
round — a party that cannot escape is already in enough trouble.

Fleeing in the dark is allowed. The party came from somewhere and can feel its way back
whether or not it can see.

## Decisions & Alternatives

| Decision | Chosen | Alternatives Considered | Rationale |
|---|---|---|---|
| Attack resolution | One roll into four bands: miss, graze, hit, crit | Binary hit or miss; always-hit with variable damage | A binary result makes an unfavourable matchup produce nothing at all, so the player watches turns evaporate. Four bands make it produce less, so a losing fight is still being played. |
| Band widths | Narrow miss, wide middle, distant crit | Even bands | A miss should mean badly outmatched, not unlucky; a reliable crit should mean a real accuracy advantage rather than a good afternoon. |
| Round structure | Select everything, then resolve in Dexterity order | Resolving each character's action as it is chosen | Committing before you know the results is what makes initiative worth having, and it stops a round becoming a sequence of individually optimal reactions. |
| Melee reach | A hard restriction to the front row | A penalty for reaching the back row | Position has to be a commitment rather than an optimisation for the project's objective to hold. A penalty would make the back row merely preferable. |
| Enemy targeting | Weighted toward the front, never forbidden from the back | Strictly front-first | A back row that cannot be touched turns its occupants into spectators to their own defence, and makes the front row a puzzle to be solved once rather than a line to be held. |
| Reaching weapons | A weapon property, not a class feature | Polearms usable only by particular classes | A property is what makes a polearm a different decision from a sword rather than a differently-numbered one, and it composes with the finesse property the party segment already anticipates. |
| Magic cost | Slots per rank, restored only by camping | A regenerating mana pool; per-round cooldowns | Slots make magic attrition, so the question is whether this is the fight worth the last heal. A pool or a cooldown would make descending deeper cost nothing, which is the whole pressure of a dungeon crawl. |
| Enemy group size | Uncapped, with the same row structure | Mirroring the party's five | Being outnumbered is what makes the front rank matter. The same row structure means the reach rules are written once and read the same from both sides. |
| Fleeing | One attempt for the whole party, costing the round | Per-character escape | A party does not leave one member behind, and per-character escape would turn a losing fight into a triage puzzle about who is abandoned. |
| Darkness | Heavy accuracy penalty and no deliberate targeting | Forbidding combat in the dark; no effect | Fighting blind should be possible and awful. Forbidding it would make a failed torch a softlock; ignoring it would make light pointless in the place it matters most. |

## Open Questions & Future Decisions

### Resolved

1. ✅ **One roll, four bands** — miss, graze, hit, crit — with a narrow miss and a distant crit.
2. ✅ **Selection completes before any resolution**, then actions resolve in descending Dexterity.
3. ✅ **Melee reaches the front row only**, as a hard rule.
4. ✅ **Ranged and magical attacks reach any row**, weighted toward the front.
5. ✅ **Reaching and finesse are weapon properties**, not class features.
6. ✅ **Spell slots per rank**, restored only by camping.
7. ✅ **Enemies share the row structure and are not capped at five.**
8. ✅ **Fleeing is one attempt for the whole party**, costing only the round it was spent on, allowed in the dark, and impossible against something far faster or something that forbids escape.
11. ✅ **An action whose target is gone fizzles**, and does not seek a substitute.
12. ✅ **Only a conscious character blocks the front row.** A body shields nobody.
13. ✅ **A landed blow always deals at least a twentieth of its base damage**, never less than one.
14. ✅ **An enemy row holds at most ten**, so a swarm is a shape rather than an unbounded number.
15. ✅ **A defeated party stays where it fell**, to be abandoned or recovered by a fresh party.
9. ✅ **Darkness penalises accuracy and removes deliberate targeting**, and never helps the enemy.
10. ✅ **Nothing recharges per round**, so no round is worth taking for its own sake.

### Deferred

1. **Ability definitions.** Skill ranks unlock abilities, but what each one does is unauthored content.
2. **Enemy rosters and their pot values.** What any enemy is, and what it is worth, belongs with the enemies segment.
3. **Enemy behaviour beyond choosing a legal target.** Focus fire, retreat, protecting casters — all later.
4. **Status effects.** Poison, fear, paralysis and the rest have no model here.
5. **Recovering a fallen party.** That a wiped party stays where it fell and can be recovered by a fresh one is settled; a stranded roster, bodies on a floor, and hiring at a tavern all need segments that do not exist.
6. **The numbers.** Band thresholds, graze and crit multipliers, and how accuracy and defence are assembled from skill, attribute and equipment are all content data with no content yet.

## References

- `docs/high-level-design.md` — party-versus-party with rows, and the tenets combat answers to.
- `docs/intent/party/party-design.md` — the operations combat calls, and the pot it hands back.
- `docs/intent/exploration/exploration-design.md` — the payload that begins an encounter, and the clock that stops for it.
