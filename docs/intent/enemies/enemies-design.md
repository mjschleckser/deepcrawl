---
parent: high-level-design
prefix: ENEMY
---

# Enemies

## Context and Design Philosophy

Enemies are what the dungeon is made dangerous with. This segment owns what they are,
how they gather into groups, and how they move around a floor before anyone fights
them.

Three principles shape the design.

**A roster is content, not code.** An enemy is a row in a table: some numbers, a role,
and what it is worth. Adding a goblin shaman is authoring. Nothing in the machinery
knows what a goblin is, which is what lets the dungeon grow without the systems moving.

**Enemies fight by the rules the party fights by.** They stand in rows, melee reaches
only a front rank, a caster shelters behind its own front line, and a bow reaches past
it. A monster that ignored positioning would quietly undo the thing the whole combat
design is built on.

**Light never helps them.** A roamer notices the party by proximity, not by seeing
their torch. That is a hard requirement from the exploration segment, and it has a
consequence worth keeping: a party in the dark can be ambushed by something it could
not see but which knew perfectly well where they were. The dark did not attract the
monster; it only blinded the party.

## What This Segment Owns

| | Owned by enemies | Owned elsewhere |
|---|---|---|
| Roster | stats, role, row, what an enemy is worth | — |
| Bands | which enemies gather, and how many | generation decides where a band goes |
| Roaming | where a roamer stands, and how it moves on a floor | exploration owns the tick that moves it |
| Awareness | whether a roamer knows where the party is | exploration hands the result to combat as surprise |
| Behaviour in a fight | choosing a legal target | combat resolves the attack |

## The Roster

An enemy definition carries what combat needs and nothing more.

| Field | Meaning |
|---|---|
| `id`, `name` | identity |
| `role` | `MELEE`, `RANGED`, or `CASTER` |
| `row` | which row it prefers to stand in |
| `hitPoints`, `dexterity`, `accuracy`, `defence`, `armour`, `damage` | what combat resolves against |
| `potValue` | what defeating it is worth in skill experience |
| `forbidsEscape` | whether a party can flee from it |

Role and row are separate on purpose. A melee enemy shoved into a back row by a full
front rank is a melee enemy that cannot reach anything, and that is a legitimate and
useful thing for a band to contain.

### The goblins

The first floor's inhabitants, and the shape every later roster follows.

| Enemy | Role | Row | Notes |
|---|---|---|---|
| **Goblin** | melee | front | the ordinary body in a warband; weak alone, a problem in numbers |
| **Goblin Archer** | ranged | back | reaches the party's back row from safety behind its own front rank |
| **Goblin Mage** | caster | back | the reason a party wants a bow of its own |

The archer and the mage are what make a goblin band a positioning problem rather than
an arithmetic one. Killing the bodies in front is not the same decision as reaching
past them.

An enemy carries **defence** and **armour** as separate numbers, exactly as a character
does: defence decides whether a blow lands, armour decides what it is worth. A goblin
is easy to hit and lightly protected; something in plate later will be the reverse of
one and not the other.

### What an enemy is worth

`potValue` is authored, not computed, and the guideline is that an **ordinary enemy of
floor tier N is worth about 12 × N**, with a dangerous one worth up to twice that. A
floor-one goblin at 14, an archer at 18 and a mage at 24 are that rule applied.

The pot scaling with the floor is the other half of the rank curve. A rank costs more
than the last one did, and a deeper enemy is worth more than a shallower one, so
advancing a rank takes seven or eight floor-appropriate fights at any depth — while the
same rank bought with floor-one goblins takes four times as many by the end. Farming
decays without being forbidden.

## Bands

A band is a named group template: which enemies appear together, and how many of each.
Generation decides where a band is placed; the band decides what a band is.

```
goblin warband
  goblin  ×2–4
```

The count is a range drawn from the seed, so no two warbands are the same size and
none of them is a surprise either. A band never exceeds the row limits combat sets, and
members are placed in their preferred row until it is full, then into the other.

More elaborate bands — archers behind a screen of bodies, a mage with a bodyguard — are
authoring, and the machinery for them is the same.

## Roaming

A roamer is a band standing on a tile of a floor, moving as the party moves.

### Awareness

A roamer is **unaware** until the party comes within its notice range, and aware
thereafter. Notice range is a matter of distance alone.

Nothing about the party's light changes this. A torch does not attract a goblin and
darkness does not hide the party from one. What darkness does is stop the *party*
seeing the *roamer* — which is exactly the asymmetry that makes losing a torch
frightening rather than merely inconvenient.

**Awareness decays with time, but never while the party is in sight.** A roamer that
can see the party stays certain of where they are, however long the chase runs. Once
the party breaks line of sight — around a corner, through a closed door, behind a
secret one — the roamer's certainty runs down over ticks, and when it is spent the
roamer goes back to drifting.

Breaking line of sight is therefore the thing that ends a chase, and it is a skill
rather than a die roll: corners, doors, and the shape of the floor are what a party
escapes with.

### Movement

Every roamer, like the party, pays a number of ticks to cross a tile, drawn from its own
Dexterity. When the party takes a step, the ticks that step consumed are handed to each
roamer to spend against its own cost, with any remainder carried forward.

| State | Behaviour |
|---|---|
| Unaware | drifts, one tile in a direction it can go |
| Aware | moves one tile toward the party |

Nothing moves once per party step. A roamer quicker than the party moves more than once
for each step they take; a slower one waits through several. **A party faster than what
is chasing it opens a gap and eventually loses its pursuer altogether** — not by
turning cleverly, but by being quicker, which is a decision made when the party was
assembled rather than in the corridor.

Movement is over the floor's own passages: a roamer cannot walk through a wall, and a
closed door stops it exactly as it stops the party.

### Contact

**The party and a roamer never stand on the same tile.** Reaching one another *is* the
encounter, and it happens instead of the step that would have closed the gap.

| What moved | What happens |
|---|---|
| The party, into a roamer's tile | The step is not taken; the encounter begins |
| A roamer, into the party's tile | The roamer holds the tile it stood on; the encounter begins |
| The party, onto a roamer, by a route it cannot refuse | The encounter begins, and the roamer gives ground to a tile beside it |

A roamer that stops short rather than stepping onto the party is what makes a chase
legible. A pursuer no quicker than the party spends its ticks arriving where the party
last stood and never reaches them; one quicker has ticks left over to attempt the tile
they are standing in, and that attempt is the fight. Speed decides a chase, which is
what paying separate tick costs was for.

It is also what makes breaking off a fight worth anything. A roamer left standing on
the party would re-open the encounter with their very next step, whatever their
Dexterity — there is no distance to open when the thing chased them into their own
tile.

The one route the party cannot refuse is a relocation: a pit drops them where it drops
them, and a stair lands them on its arrival tile. If something is already standing
there, the encounter begins and the roamer steps aside, because the invariant holds
however the two came to meet.

### Surprise

When contact happens, whether each side was aware is handed to combat as the surprise
payload. A party that saw the roamer coming — which in practice means a lit party —
enters the fight aware. A roamer inside its notice range is always aware. A party
stumbling into something in the dark is therefore surprised by a monster that was not
surprised at all.

## Re-stocking

When exploration re-stocks a floor, it asks generation what refills the rooms, and
generation asks here. What comes back is a set of bands and where they stand.

A re-stocking never touches the floor's construction or its traps, so this segment
answers only with occupants.

Nothing is ever placed on the tile the party occupies: a floor that re-stocks around a
standing party puts its new bands elsewhere, so the invariant holds from the moment
anything arrives.

## Behaviour in a Fight

Deliberately thin at this stage. An enemy chooses a legal target, preferring the
party's front row, and attacks with whatever its role implies: a melee enemy swings at
the front rank, an archer or a mage reaches past it while favouring the front.

Focus fire, protecting casters, retreating when hurt, and using abilities are all
later. What matters now is that an enemy never chooses an illegal target, because the
reach rules are the thing the combat design rests on.

## Decisions & Alternatives

| Decision | Chosen | Alternatives Considered | Rationale |
|---|---|---|---|
| Roster | Content data with no behaviour attached | Enemy subclasses with their own logic | Adding a monster should be authoring rather than programming. Behaviour that varies per enemy arrives later as data the machinery reads, not as code it dispatches to. |
| Role and row | Separate fields | Row implied by role | A melee enemy pushed into the back row by a full front rank is a useful thing for a band to contain, and the two concepts come apart the moment a band is larger than a row. |
| Group composition | Named bands with count ranges | Filling an encounter budget from a table | A band is legible: a goblin warband is two to four goblins, and an author can picture it. Budgets are worth having later for variety, but they make it hard to say what any particular fight will be. |
| Awareness | Proximity alone | Line of sight; noticing the party's light | The exploration segment forbids light affecting enemy awareness. Proximity also produces the asymmetry worth having, where the dark hides the roamer from the party rather than the party from the roamer. |
| Contact | Neither side may enter the other's tile; the attempted entry is the encounter | Contact when the two share a tile | Sharing a tile makes a chase unresolvable: a pursuer that follows the party step for step is never escaped, because every attempt to break off ends with it still on top of them. Barring the entry hands the outcome of a chase back to speed. |
| Pursuit speed | Each side pays its own tick cost to cross a tile | Aware roamers matching the party's pace exactly | Paying separately makes outrunning something a real possibility decided by who the party brought, rather than a chase nobody can ever win. It also makes Dexterity matter in a corridor and not only in a fight. |
| Awareness decay | Runs down over ticks, and never while the party is in sight | Permanent once gained; decaying on a timer regardless of sight | Permanent awareness means a single goblin band pursues forever. Decaying while visible would let a party escape by walking backwards down a lit corridor. Breaking line of sight is the skill worth rewarding. |
| Unaware movement | Drifting | Standing still; patrolling a route | A motionless roamer is furniture, and a patrol route is authored detail a generated floor cannot provide. Drifting gives a floor that changes without anyone designing its traffic. |
| Sight for a roamer | The same opacity rules the party uses, with no secret doors known | Monsters knowing their own dungeon's secrets | A party that ducks behind a secret door and is still seen through it would make the discovery worthless. |
| Fight behaviour | Choose a legal target, prefer the front | Focus fire and target selection by threat | The rule that matters now is that an enemy never picks an illegal target. Cleverness added before that is solid would be cleverness built on sand. |

## Open Questions & Future Decisions

### Resolved

1. ✅ **The roster is content data**; the machinery knows nothing about any particular enemy.
2. ✅ **Role and row are separate fields.**
3. ✅ **A band is a named template** with count ranges, drawn from the seed.
4. ✅ **Awareness is proximity alone**, and light never affects it.
5. ✅ **Every roamer pays its own tick cost to cross a tile**, so a faster party can outrun a slower pursuer.
8. ✅ **Awareness decays over ticks**, but never while the party is in the roamer's line of sight.
9. ✅ **A successful escape from combat leaves the roamer unaware**, so fleeing buys something real.
6. ✅ **Roamers move through passages**, never through walls or closed doors.
7. ✅ **Enemies obey the same reach rules the party does.**

### Deferred

1. **Abilities.** Nothing here casts or uses a special attack yet; the goblin mage is a caster in role only until abilities exist.
2. **Encounter budgets.** Assembling a group to a difficulty target, rather than from a named band.
3. **Behaviour beyond a legal target.** Focus fire, guarding casters, fleeing when hurt.
4. **Ambient encounters.** Exploration reserves random step-triggered encounters alongside roamers; nothing here supplies them yet.
5. **Deeper rosters.** One floor's worth of goblins exists. What lives further down, and how a roster escalates with depth, is unauthored.
6. **Notice range as a stat.** Every enemy currently notices at the same distance; whether a roster should vary it is untested.
7. **Standing still.** A party that only turns spends no ticks, so nothing chasing it ever arrives. Exploration has this recorded as an open question; enemies are what finally make it matter.

## References

- `docs/intent/combat/combat-design.md` — the rows, reach rules, and pot these enemies feed.
- `docs/intent/exploration/exploration-design.md` — the tick that moves a roamer, the re-stocking it serves, and the rule that light must never help it.
