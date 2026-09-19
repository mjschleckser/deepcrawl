# Combat — EARS Specs

Specs for the combat segment. Design: `combat-design.md`.

Band thresholds, graze and crit multipliers, darkness penalties, and how accuracy and
defence are assembled from skill, attribute and equipment are all content data. These
specs fix the structure those numbers are fed into.

## The fight's time

- [x] **COMBAT-TIME-001**: The system shall give every combatant a readiness that rises by their Dexterity for each beat of the fight's time.
- [x] **COMBAT-TIME-002**: The system shall raise a combatant's readiness by at least one for each beat, however low their Dexterity.
- [x] **COMBAT-TIME-003**: While no combatant is ready, the system shall advance the fight's time one beat at a time until at least one combatant is ready.
- [x] **COMBAT-TIME-004**: The system shall not advance the fight's time while a combatant's action is awaiting the player.
- [x] **COMBAT-TIME-005**: The system shall treat a combatant as ready when their readiness reaches a full bar.
- [x] **COMBAT-TIME-006**: When a combatant acts, the system shall subtract that action's cost from their readiness and carry the remainder forward.
- [x] **COMBAT-TIME-007**: The system shall take an action's cost from the action itself rather than from a value fixed in the resolver, and shall cost every action one full bar.
- [x] **COMBAT-TIME-008**: When several combatants become ready on the same beat, the system shall act them in descending order of Dexterity, the party before the enemies at equal Dexterity, and party members in a fixed order of position.
- [x] **COMBAT-TIME-009**: The system shall resolve one combatant's action completely before another combatant acts.
- [x] **COMBAT-TIME-010**: The system shall resolve an action's target at the moment that action is taken, so that no action is aimed at a combatant that has since stopped being a legal target.
- [x] **COMBAT-TIME-011**: The system shall not restore hit points, spell slots, or any other resource because the fight's time has passed.
- [ ] **COMBAT-TIME-012**: The system shall not advance the exploration clock for any reason while an encounter is running.
- [x] **COMBAT-TIME-013**: When a combatant stops being able to act, the system shall discard the readiness they had accumulated rather than holding it for their return.
- [x] **COMBAT-TIME-014**: The system shall not raise the readiness of a combatant unable to act.
- [x] **COMBAT-TIME-016**: The system shall report which combatant is ready to act without advancing the fight's time.
- [x] **COMBAT-TIME-017**: The system shall report a combatant's readiness partway through a beat as their readiness plus that fraction of what the beat will add, and shall report no readiness for a combatant unable to act.
- [x] **COMBAT-TIME-015**: The system shall allow a combatant whose readiness fills more than once between two actions of a slower combatant to act that many times.

## Surprise

- [x] **COMBAT-SURPRISE-001**: When one side begins an encounter unaware of the other, the system shall begin every combatant on the aware side with a full bar of readiness and every combatant on the unaware side with none.
- [x] **COMBAT-SURPRISE-002**: When both sides are aware or both unaware, the system shall begin every combatant with no readiness.

## Resolving an attack

- [x] **COMBAT-ATTACK-001**: The system shall resolve an attack from a single roll combined with the attacker's accuracy and the target's defence.
- [x] **COMBAT-ATTACK-002**: The system shall resolve every attack into exactly one of four bands: miss, graze, hit, or crit.
- [x] **COMBAT-ATTACK-003**: The system shall deal no damage on a miss.
- [x] **COMBAT-ATTACK-004**: The system shall deal reduced damage on a graze, full damage on a hit, and increased damage on a crit.
- [x] **COMBAT-ATTACK-005**: The system shall deal at least one twentieth of an attack's base damage, rounded up and never below one, whenever that attack lands.
- [x] **COMBAT-ATTACK-006**: The system shall raise the band as the attacker's accuracy rises relative to the target's defence, so that a greater advantage never produces a worse band on the same roll.
- [ ] **COMBAT-ATTACK-007**: The system shall draw the governing attribute for an attack's damage from the weapon rather than from the skill the weapon uses.
- [ ] **COMBAT-ATTACK-008**: The system shall assemble an attacker's accuracy from the weapon's own accuracy, five per rank of the weapon's skill, and two per point of Perception above ten.
- [ ] **COMBAT-ATTACK-009**: The system shall assemble a defender's defence from a base of twenty, two per point of Dexterity above ten, three per rank of the armour skill they are wearing, and any shield they carry.
- [ ] **COMBAT-ATTACK-010**: The system shall resolve an attack's band against the target's defence and shall not let the target's armour affect which band the attack falls into.
- [ ] **COMBAT-ATTACK-011**: The system shall assemble an attack's base damage from the weapon's own damage, a tenth more per rank of the weapon's skill, and four hundredths more per point of the weapon's governing attribute above ten.
- [ ] **COMBAT-ATTACK-012**: The system shall subtract the target's armour from the damage of a landed attack, after the band's multiplier and before the minimum.

## Reach and targeting

- [x] **COMBAT-REACH-001**: The system shall allow a melee attack to target only the front row of the defending side, while any conscious character stands in that row.
- [x] **COMBAT-REACH-002**: While no conscious character stands in a side's front row, the system shall allow melee attacks against its back row.
- [x] **COMBAT-REACH-003**: The system shall not count an unconscious, dead, or otherwise incapacitated character as blocking their side's front row.
- [x] **COMBAT-REACH-004**: The system shall allow a back-row character to make a melee attack only with a weapon carrying the reaching property.
- [x] **COMBAT-REACH-005**: The system shall allow a ranged attack or a spell to target either row of the defending side.
- [ ] **COMBAT-REACH-006**: When an enemy selects a target for a ranged attack or spell, the system shall weight its choice toward the front row while leaving the back row reachable.

## Actions

- [ ] **COMBAT-ACTION-001**: When a character casts a spell, the system shall spend one spell slot of that spell's rank, and shall refuse the cast when no slot of that rank remains.
- [ ] **COMBAT-ACTION-002**: The system shall not restore a spell slot during an encounter.
- [ ] **COMBAT-ACTION-003**: When a character defends, the system shall raise their defence until that character next acts.
- [ ] **COMBAT-ACTION-004**: When a character swaps places with an ally, the system shall spend a full bar of that character's readiness.
- [ ] **COMBAT-ACTION-005**: When a character relights a doused light source, the system shall spend a full bar of that character's readiness.
- [x] **COMBAT-ACTION-006**: The system shall apply every change to a character's hit points or condition through the party segment's operations.

## Standing orders

- [x] **COMBAT-ORDER-001**: The system shall hold for each character an ordered list of rules, each naming a condition, an action, and a target.
- [x] **COMBAT-ORDER-002**: The system shall keep a character's order list from one encounter to the next.
- [x] **COMBAT-ORDER-003**: When a character is about to act, the system shall read their rules from the first and shall propose the action and target of the first rule whose condition holds and whose action is legal for that character.
- [x] **COMBAT-ORDER-004**: If a rule's action is not legal for that character, then the system shall pass over that rule and read the next.
- [x] **COMBAT-ORDER-005**: If no rule holds and offers a legal action, then the system shall propose nothing and shall ask the player as it would for a character with no orders at all.
- [x] **COMBAT-ORDER-006**: The system shall not take a proposed action until the player confirms it.
- [x] **COMBAT-ORDER-017**: The system shall resolve a proposal the player confirmed exactly as one chosen by hand, with no difference in what happens.
- [x] **COMBAT-ORDER-018**: When the player takes any action other than the one proposed, the system shall drop the proposal for that turn.
- [x] **COMBAT-ORDER-019**: The system shall wait for the player at every character's turn, without limit, whether or not anything is proposed.
- [x] **COMBAT-ORDER-007**: The system shall allow the player to take any legal action in place of the one proposed.
- [x] **COMBAT-ORDER-008**: The system shall offer these conditions and no others: always; an ally below a share of their hit points; no ally below a share of their hit points; a rule not yet taken this encounter; a spell slot of the required rank remaining; the actor's own front row broken.
- [x] **COMBAT-ORDER-009**: The system shall count a rule guarded by "not yet taken this encounter" as taken only when its action is actually taken, and shall forget that it was taken when the encounter ends.
- [x] **COMBAT-ORDER-010**: The system shall offer these targets and no others: the legal enemy with the fewest hit points; a legal enemy standing in the front row; the conscious ally with the fewest hit points; a named ally; the actor.
- [x] **COMBAT-ORDER-011**: The system shall resolve an order's target from the state of the fight at the moment the action is taken.
- [ ] **COMBAT-ORDER-012**: While an encounter is in darkness, the system shall keep an order's action and replace its target with the random legal target the darkness rules impose.
- [x] **COMBAT-ORDER-013**: The system shall give no enemy an order list, and shall take an enemy's action without awaiting the player.
- [x] **COMBAT-ORDER-015**: The system shall count the character whose order it is among their own allies, for every condition and every target that names an ally.
- [x] **COMBAT-ORDER-016**: When two candidates are equal for a target the order names, the system shall choose between them by the same fixed order it acts combatants in.
- [x] **COMBAT-ORDER-014**: The system shall compose a proposal when a character is about to act rather than when they become ready, so that a proposal accounts for everything resolved before it.

## Darkness

- [x] **COMBAT-DARK-001**: While an encounter is in darkness, the system shall apply an accuracy penalty to the party's attacks.
- [x] **COMBAT-DARK-002**: While an encounter is in darkness, the system shall choose the party's targets at random among legal targets rather than allowing deliberate selection.
- [x] **COMBAT-DARK-003**: The system shall not raise any enemy's accuracy, awareness, or effectiveness because the party's light level is low.

## Fleeing

- [x] **COMBAT-FLEE-001**: The system shall resolve a flee attempt once for the whole party, never for individual characters.
- [x] **COMBAT-FLEE-002**: When a flee attempt succeeds, the system shall end the encounter, return the party to the tile it came from, and award nothing.
- [x] **COMBAT-FLEE-003**: If a flee attempt fails, then the system shall spend the readiness of the character who attempted it, impose no further penalty, and allow another attempt as soon as any character is ready.
- [x] **COMBAT-FLEE-004**: The system shall fail a flee attempt when the fastest enemy's Dexterity exceeds the party's slowest member's Dexterity by more than a quarter.
- [x] **COMBAT-FLEE-005**: The system shall fail a flee attempt when any enemy present carries an ability that forbids escape.
- [x] **COMBAT-FLEE-006**: The system shall allow a flee attempt in darkness on the same terms as in light.

## Enemy groups

- [x] **COMBAT-ENEMY-001**: The system shall give an enemy group a front row and a back row, governed by the same reach rules as the party's.
- [x] **COMBAT-ENEMY-002**: The system shall not limit an enemy group to five members.
- [x] **COMBAT-ENEMY-003**: The system shall hold at most ten enemies in either enemy row.
- [x] **COMBAT-ENEMY-004**: When an enemy selects a melee target, the system shall choose from the party's front row while a conscious character stands in it.

## Ending an encounter

- [x] **COMBAT-END-001**: When no enemy remains able to act, the system shall end the encounter in victory.
- [x] **COMBAT-END-002**: When no party member remains conscious, the system shall end the encounter in defeat.
- [x] **COMBAT-END-003**: When an encounter ends in victory, the system shall report the experience pot from the enemies defeated together with the distinct skills the party used.
- [x] **COMBAT-END-004**: The system shall determine the pot from the enemies defeated and never from how long the encounter took.
- [x] **COMBAT-END-005**: When an encounter ends in defeat, the system shall report the defeat and the floor and tile the party fell on, and shall not alter the party further.
- [x] **COMBAT-END-006**: When an encounter ends in escape or defeat, the system shall report no experience pot.

## Deferred

- [D] **COMBAT-ACTION-007**: The system shall resolve the effect of each ability a skill rank unlocks.
- [D] **COMBAT-ENEMY-005**: The system shall choose enemy actions by the behaviour its roster defines, beyond selecting a legal target.
- [D] **COMBAT-STATUS-001**: The system shall apply and expire status effects such as poison, fear, and paralysis.
