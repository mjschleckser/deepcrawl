---
parent: high-level-design
prefix: COMBAT
---

# Combat

## Context and Design Philosophy

Combat is where the party's composition is tested. It runs entirely outside the
exploration clock, resolves one combatant at a time as each becomes ready, and ends by
handing the party what it learned.

Four principles shape the design.

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

**Nothing accrues for staying longer.** The exploration clock is stopped, so hunger
does not advance and torches do not burn. That is a constraint on this segment rather
than a licence: nothing here may regenerate, recharge, or accumulate as the fight's own
time passes, and the encounter pot is fixed by the enemies rather than by how long the
fight ran.

**Time orders the fight; it never hurries the player.** Readiness fills, whoever fills
first acts, and the fight's clock stops dead whenever anybody has to be asked what to
do. Thinking for an hour costs exactly what thinking for a second costs.

## The Shape of an Encounter

```
exploration hands over ──▶ surprise ──▶ ACT ──▶ … ──▶ outcome ──▶ pot awarded
                                        │  ▲
                    time runs on until  │  │  the one who is ready acts,
                    somebody is ready   └──┘  alone, and spends the bar
```

Exploration begins an encounter with a payload naming the enemy group, the light level
of the tile it began on, and which side was aware of the other. Combat runs until one
side is finished or the party escapes, then reports the outcome and the experience pot
back.

## Readiness

A fight has a clock of its own. It is not the exploration clock, which is stopped for
the whole encounter and which nothing here advances, and it is not divided into rounds,
because there are none.

Every combatant carries a **readiness** that rises as the fight's time passes. When it
reaches the top, that combatant acts — alone, immediately, and without waiting on
anybody — and acting spends the bar so that the filling begins again.

| | |
|---|---|
| Readiness rises by | the combatant's Dexterity, each beat of the fight's time |
| A combatant acts at | a full bar |
| Acting costs | one full bar, whatever the action |
| Anything left over | carries forward, so nothing is lost by coming ready a fraction late |

**Speed is Dexterity, undisguised.** A combatant of Dexterity 18 fills three bars while
one of Dexterity 6 fills a single bar, and acts three times to their once. That spread
is the point rather than an accident of the numbers: it is what makes a quick party
something other than a party that goes first, and it is the same attribute that already
decides how fast the party walks and whether it can outrun what is chasing it. Nothing
is ever slower than one point of Dexterity, so nothing is frozen out of its own fight.

The fight advances one beat at a time until at least one combatant is ready, and never
past that. **It does not advance at all while anybody is being asked what to do.** Time
in a fight is a way of ordering actions; it is not something the player races.

**Ties are settled, not rolled.** Combatants who come ready on the same beat act in
descending Dexterity; a tie there goes to the party; a tie within the party is settled
by a fixed order of position.

**An action's cost belongs to the action.** Every action costs one full bar today, and
the cost is carried on the action rather than assumed by the resolver — so a dagger's
flick and a two-handed wind-up can come to differ without the structure moving. They do
not differ yet, because there is no weapon table for them to differ in.

**Nothing accrues for waiting.** No hit point, no spell slot, and no other resource
recovers because a beat has passed. A bar that fills with time is exactly the mechanism
that invites a party to stall until something refills; nothing here refills.

**A combatant who falls loses what they had banked.** Readiness is discarded rather than
held, so a character brought back to consciousness begins filling from empty instead of
acting the instant they open their eyes.

### Surprise

If one side was unaware, that side begins the fight with empty bars and the aware side
with full ones. The aware side therefore acts first, and a quick aware side may act more
than once before the surprised one moves at all — which is a truer account of catching
somebody unready than one free round handed to each side alike. Awareness comes from
exploration: light, and whether the party saw what was coming.

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

### Accuracy, Defence, and Armour

Accuracy is **practice and eyesight**: the weapon in hand, the rank behind it, and how
much the wielder notices.

```
accuracy = weapon.accuracy + 5 × weapon skill rank + 2 × (Perception − 10)
```

Defence is what it takes to avoid being hit, and is a different thing entirely from
what it takes to survive being hit:

```
defence = 20 + 2 × (Dexterity − 10) + 3 × armour skill rank + shield
```

**Armour never makes anyone harder to hit.** It reduces the damage of a blow that
landed, and does nothing else. Letting one number do both jobs makes heavy armour
doubly good and light armour doubly bad, and it squeezes the accuracy bands until
every point of armour is worth more than a rank of practice.

Damage is **practice and force**, and the attribute is the weapon's to name:

```
base damage = weapon.damage × (1 + 0.10 × weapon skill rank)
                            × (1 + 0.04 × (governing attribute − 10))
dealt        = round(base damage × band multiplier) − target armour
```

Might governs by default; a weapon with the *finesse* property names Dexterity
instead, and still trains the same weapon skill. This is why the governing attribute is
a property of the weapon rather than of the skill: a dagger and a longsword are both
Blade, and they are not the same argument for what makes a character dangerous.

### What the numbers come out at

The calibration anchor is a fresh party against a floor-one goblin. Everything above is
tuned so an ordinary goblin takes two solid hits and a front-liner falls in five.

| | Value |
|---|---|
| Fresh fighter, sword (acc 20, dmg 8), Blade 2, Perception 10 | accuracy 30, base damage 10 |
| Same fighter, Heavy Armour 2, Dexterity 10 | defence 26 |
| Goblin | defence 20, armour 2, accuracy 24 |

A level-appropriate attacker therefore sits at about **+10** over what it is attacking,
which on the band thresholds gives 4% miss, 35% graze, 50% hit, 11% crit. Missing is
rare, as it should be; crits are frequent enough to hope for and far too rare to plan
around; and guaranteeing them would take an advantage of +99, which no campaign
casually produces. Each rank is worth +5 accuracy and +10% damage, so enemy defence has
to climb by about five per floor tier for parity to hold.

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
| Attack | a full bar | melee or ranged, per the weapon |
| Cast | a full bar, and a spell slot of that rank | |
| Use ability | a full bar | unlocked by a skill rank |
| Swap places | a full bar | dragging an ally out of the front rank is work |
| Relight | a full bar | a doused light source, per exploration |
| Defend | a full bar | raises defence until that character next acts |
| Flee | a full bar, of the character who attempts it | resolved for the whole party; see below |

A combatant acts when their bar is full and not otherwise, so how often anyone acts is
a question about Dexterity rather than about turn structure. Nothing in the base design
grants an action off the bar; abilities that would are a matter for the abilities
content.

### Spell slots

A caster holds a number of slots at each spell rank. Casting spends one of that rank,
and slots are restored only by sleeping at camp — which costs ticks, and ticks cost
food and light.

This is what makes magic an attrition resource rather than a rotation. The question a
caster faces on the fourth floor is not which spell is optimal but whether this is the
fight worth spending the last heal on. Slots deliberately do not recover between
fights, or per round, because either would make descending deeper cost nothing.

## Standing Orders

A fight in which every character must be told what to do every time they come ready is
a fight the player transcribes rather than plays. **Standing orders are how a party says
once what it usually does**, so the repetitive nine tenths of an encounter can be
confirmed instead of composed.

**A proposal is never taken without a press.** It fills the choice in and offers itself
as one control — *Attack Goblin* rather than *Attack*, and then *which goblin* — so a
turn a character's orders already answer is one press instead of three, and never zero.
An order removes the composing and leaves the deciding exactly where it was.

The fight therefore waits, indefinitely and without penalty, at every character. That
is the point at which a player looks at the screen, and a fight that moved past it on
its own would be a fight they watched rather than fought.

A character with no matching rule is asked with nothing filled in, which is the same
wait with more to think about.

### What an order is

An order list belongs to a character, is authored outside a fight, and survives from one
encounter to the next. It is an **ordered list of rules**:

```
when <condition>   do <action>   on <target>
```

When that character comes ready, the rules are read from the top, and the first one
whose condition holds — and whose action is legal from where they stand — becomes the
**proposal**: the action pre-chosen, the target pre-aimed. The player may take it at
once, wait and let it take itself, or ignore it and choose something else entirely.
Where no rule matches, nothing is proposed and the player is asked exactly as they would
have been.

### Three parties' worth of orders

A fighter who always swings at whatever is closest to falling:

```
1. always                      attack        the enemy with the fewest hit points
```

A mage who opens with a shield and then commits to the offensive:

```
1. once this encounter         cast shield   the front rank
2. while a slot remains        cast missile  the enemy with the fewest hit points
```

A cleric who heals when healing is wanted and fights when it is not:

```
1. while an ally is below half  cast heal    the ally with the fewest hit points
2. always                       attack       the enemy with the fewest hit points
```

Read from the top and first match wins, so the cleric's second rule is what happens
whenever the first does not — which is the whole of "or attack if everyone is healthy",
written without a word for "otherwise".

### What a rule may ask about

**A character is one of their own allies.** Every condition and every target that says
*ally* counts the character whose order it is among them, so a cleric on three hit
points is the ally with the fewest and heals themselves. The alternative — allies
meaning everyone else — gives a lone survivor an order list that proposes nothing at
exactly the moment they need one.

| Condition | Holds when |
|---|---|
| always | always |
| an ally is below a share of their health | any conscious ally's hit points fall below that share |
| no ally is below a share | no conscious ally's hit points fall below it |
| once this encounter | this rule has not yet been taken in this encounter |
| a slot remains | the actor holds an unspent slot of the rank the action needs |
| the front rank is broken | no conscious character stands in the actor's own front row |

**"Once this encounter" is what says *open with the buff, then settle in*** while status
effects remain unbuilt. When they exist, *while the fighter lacks that blessing* will say
it better and will be a rule of exactly the same shape.

### What a rule may aim at

| Target | Resolves to |
|---|---|
| the enemy with the fewest hit points | the legal enemy target with the fewest hit points remaining |
| the enemy in the front row | a legal enemy target standing in the front row |
| the ally with the fewest hit points | the conscious ally with the fewest hit points remaining |
| a named ally | that character, while they are a legal target |
| the actor | the character whose order it is |

**A target is resolved when the action is taken, never before.** The enemy with the
fewest hit points is whoever that is at the moment of the swing, so there is nothing to
aim at a corpse and nothing to fizzle.

**Equal candidates are settled, not rolled.** Two enemies on the same hit points are
separated by the same fixed order combatants act in, so the same fight from the same
seed picks the same one every time.

### Where an order does not reach

**An illegal proposal falls through.** A rule whose action cannot be taken — a spell with
no slot left, a melee swing from the back row, a heal with nobody hurt — is skipped and
the next rule is read. An order never proposes something the player would only be
refused.

**Darkness overrides the aim, not the act.** Deliberate targeting is impossible in the
dark, so an order's target selector gives way to the random legal target the darkness
rules impose. What a character does in the dark is still theirs; who it lands on is not.

**Enemies have no orders.** What an enemy does is its roster's business, and giving the
player's vocabulary to a monster would be a way of authoring behaviour in the wrong
segment.

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

A failed attempt costs the bar of whoever attempted it and nothing more. There is no
additional penalty, no free strike for the enemy, and no bar on another character
trying the moment they come ready — a party that cannot escape is already in enough
trouble. One character calls the retreat; the whole party leaves or nobody does.

Fleeing in the dark is allowed. The party came from somewhere and can feel its way back
whether or not it can see.

## Decisions & Alternatives

| Decision | Chosen | Alternatives Considered | Rationale |
|---|---|---|---|
| Defence and armour | Two separate stats: defence decides the band, armour reduces damage | One armour number serving as both | One number doing both jobs makes heavy armour doubly good and light armour doubly bad, and it forces the accuracy bands to stay compressed so that plate does not become untouchable. Splitting them is also what lets a nimble unarmoured thief be hard to hit and easy to hurt, which is a character worth being able to build. |
| What accuracy is made of | Weapon, weapon skill rank, and Perception | The weapon's governing attribute, as damage uses; nothing but skill and weapon | Tying to-hit to the governing attribute would mean Might raised both how often you hit and how hard, compounding one attribute twice in the same swing. Perception keeps its exploration job and gains a reason to exist in a fight, without becoming the universal attribute that flattens every build. |
| Rank value | +5 accuracy and +10% damage per rank | +3/+6%, so gear leads; +8/+15%, so skill dominates | Practice should be the main axis in a game whose progression is practice, while still leaving a found weapon and the right attribute able to decide a fight between two similar characters. |
| Attack resolution | One roll into four bands: miss, graze, hit, crit | Binary hit or miss; always-hit with variable damage | A binary result makes an unfavourable matchup produce nothing at all, so the player watches turns evaporate. Four bands make it produce less, so a losing fight is still being played. |
| Band widths | Narrow miss, wide middle, distant crit | Even bands | A miss should mean badly outmatched, not unlucky; a reliable crit should mean a real accuracy advantage rather than a good afternoon. |
| The order of acting | A readiness that fills with the fight's own time; whoever fills first acts, alone | A round in which everyone acts once, resolved in descending Dexterity | A round makes a quick combatant and a slow one differ only in who moves first, which wastes the attribute already deciding speed everywhere else, and it caps the difference between them at one place in a queue. A bar lets the quick act twice while the slow act once, which is the difference actually worth building an attribute on. |
| Choosing and resolving | Both in the same instant, one combatant at a time | Everyone selects, then everything resolves in order | Committing before you know is worth something, but it costs every action the existence of its target: a heal aimed at somebody who dies first is spent on nothing, and the lesson it teaches is to have acted sooner, which the player had no way to do. Resolving as each combatant comes ready removes the wasted action entirely, and is the only shape a readiness bar admits. |
| Speed | Dexterity itself, with a floor of one | A derived initiative statistic; a flat rate modified by equipment | A second statistic meaning the same thing is a second statistic to explain and to balance. Using the attribute undisguised also gives the widest honest spread — three actions to one across the range — which is what makes an extraordinarily quick character feel extraordinary. |
| The cost of an action | One full bar for every action, carried on the action rather than assumed | A constant in the resolver; per-action weights from the start | Putting the cost on the action means weapon weight can arrive later as content rather than as a restructuring. Making them all equal now means there is nothing to balance before there are weapons to balance it against. |
| Surprise | The aware side starts with full bars, the surprised side with empty ones | A free round for the aware side | A free round hands the same head start to a sluggish ambusher as to a quick one. Starting the bars apart lets speed decide how much an ambush is actually worth, using the mechanism the fight already has. |
| Standing orders | Propose an action and a target, and wait for a press | Taking the proposal when a countdown runs out; orders that act instantly and unattended; no orders at all | An order's work is the composing — which action, against which of six goblins — and that is what a proposal removes. Taking the turn on a timer removes the press as well, and with it the moment the player looks at the screen: a fight that advances on its own is one they watch. One press a turn is the price of it still being their fight. |
| The countdown mechanism | Built, and switched off | Removed entirely; left running | Whether a fight should play itself is a question worth being able to answer twice. The machinery is a constant and a branch, it stays under test, and turning it on is a one-line change rather than a rebuild. |
| Reading an order | First matching rule, top to bottom | Weights and scores; a scripting language | A list read from the top is something a player can predict by looking at it and fix by dragging a line. A scoring system produces behaviour nobody can account for, which in a system meant to reduce fuss is a new kind of fuss. |
| What "an ally" means | The character whose order it is counts among their own allies | Allies meaning every other member of the party; the actor counted only when nobody else qualifies | A cleric forbidden to heal themselves has an order list that proposes nothing the moment they are the one bleeding, and a lone survivor's orders stop working exactly when they are all that is left. The cost — a cleric lower than the fighter treating themselves first — is precisely what "the ally with the fewest hit points" says it will do. |
| A failed escape | Costs the bar of whoever attempted it, and nothing else | Every conscious character's bar, as a round once cost; no further attempt until all have acted | A party that cannot escape is already in enough trouble, and charging the whole party for one character's failed attempt punishes the situation rather than the decision. A party that keeps trying is a party spending every action on the door instead of on the fight, which is cost enough without a rule to enforce it. |
| Defending | Lasts until that character next acts | A fixed span of the fight's time; whichever of the two lasts longer | Every action costs one bar and buys one turn's worth of effect, and Defend is not an exception to a rule the whole economy rests on. A quick character's guard covers less of the fight's time and they come round again sooner, which is the trade Dexterity makes everywhere else in the game. |
| Orders for enemies | None; the roster decides what a monster does | The same order vocabulary on both sides | Enemy behaviour is authored content belonging to the enemies segment. Sharing the player's vocabulary would put monster design in the combat segment and invite the player to read their opponent's script. |
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
2. ✅ **Each combatant chooses and resolves in the same instant**, when their readiness fills.
3. ✅ **Melee reaches the front row only**, as a hard rule.
4. ✅ **Ranged and magical attacks reach any row**, weighted toward the front.
5. ✅ **Reaching and finesse are weapon properties**, not class features.
6. ✅ **Spell slots per rank**, restored only by camping.
7. ✅ **Enemies share the row structure and are not capped at five.**
8. ✅ **Fleeing is one attempt for the whole party**, costing only the round it was spent on, allowed in the dark, and impossible against something far faster or something that forbids escape.
11. ✅ **A target is resolved at the moment the action is taken**, so no action is ever aimed at something already gone.
12. ✅ **Only a conscious character blocks the front row.** A body shields nobody.
13. ✅ **A landed blow always deals at least a twentieth of its base damage**, never less than one.
14. ✅ **An enemy row holds at most ten**, so a swarm is a shape rather than an unbounded number.
15. ✅ **A defeated party stays where it fell**, to be abandoned or recovered by a fresh party.
9. ✅ **Darkness penalises accuracy and removes deliberate targeting**, and never helps the enemy.
10. ✅ **Nothing recharges as the fight's time passes**, so no stretch of a fight is worth taking for its own sake.
16. ✅ **Readiness fills by Dexterity**, at a floor of one point, and a full bar is what an action costs.
17. ✅ **The fight's time never advances while anyone is being asked what to do.**
18. ✅ **Surprise starts the aware side's bars full and the surprised side's empty.**
19. ✅ **A combatant who falls loses the readiness they had banked.**
20. ✅ **Standing orders propose an action and a target**, which is taken only when the player presses for it.
21. ✅ **Orders are an ordered list, read top to bottom, first match winning**, with an illegal proposal falling through to the next rule.
22. ✅ **Order targets resolve at the moment of acting**, and give way to the random target darkness imposes.
23. ✅ **A character counts among their own allies** for every condition and target that names one.
24. ✅ **Equal candidates for a target are settled by the acting order**, never by a roll.
25. ✅ **A failed escape costs only the bar of the character who attempted it.**
26. ✅ **Defending lasts until that character next acts**, like every other action's one turn of effect.
27. ✅ **Every action is taken by a press**, proposed or not; the fight waits at every character without penalty.

### Deferred

1. **Per-action costs.** Every action costs one full bar. The cost lives on the action so that a heavy weapon can cost more later, but no action differs from another yet and no weapon exists to make one.
2. **Conditions and targets beyond the listed set.** The vocabulary is deliberately small. Conditions about status effects, about enemy kinds, and about the party's remaining resources all want to exist and none of them can until the systems they read do.
3. **Where orders are authored.** That a character carries an order list and that it persists between encounters is settled; the screen on which a player writes one belongs to the party segment and is unbuilt.
4. **Taking a proposal on a timer.** The countdown that would take a proposal unattended is built and switched off. Whether a fight should be able to play itself — for a player who has set their orders and wants to watch — is a real question, and the answer is one constant away.
5. **Ability definitions.** Skill ranks unlock abilities, but what each one does is unauthored content.
6. **Enemy rosters and their pot values.** What any enemy is, and what it is worth, belongs with the enemies segment.
7. **Enemy behaviour beyond choosing a legal target.** Focus fire, retreat, protecting casters — all later.
8. **Status effects.** Poison, fear, paralysis and the rest have no model here.
9. **Recovering a fallen party.** That a wiped party stays where it fell and can be recovered by a fresh one is settled; a stranded roster, bodies on a floor, and hiring at a tavern all need segments that do not exist.
10. **The numbers.** Band thresholds, graze and crit multipliers, and how accuracy and defence are assembled from skill, attribute and equipment are all content data with no content yet.

## References

- `docs/high-level-design.md` — party-versus-party with rows, and the tenets combat answers to.
- `docs/intent/party/party-design.md` — the operations combat calls, and the pot it hands back.
- `docs/intent/exploration/exploration-design.md` — the payload that begins an encounter, and the clock that stops for it.
