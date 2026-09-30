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
- [x] **COMBAT-TIME-008**: When several combatants become ready on the same beat, the system shall act them in descending order of Dexterity, the party before the enemies at equal Dexterity, and members of one side in a fixed order of listing.
- [x] **COMBAT-TIME-009**: The system shall resolve one combatant's action completely before another combatant acts.
- [x] **COMBAT-TIME-010**: The system shall resolve an action's target at the moment that action is taken, so that no action is aimed at a combatant that has since stopped being a legal target.
- [x] **COMBAT-TIME-011**: The system shall not restore hit points, spell slots, or any other resource because the fight's time has passed.
- [ ] **COMBAT-TIME-012**: The system shall not advance the exploration clock for any reason while an encounter is running.
- [x] **COMBAT-TIME-013**: When a combatant stops being able to act, the system shall discard the readiness they had accumulated rather than holding it for their return.
- [x] **COMBAT-TIME-014**: The system shall not raise the readiness of a combatant unable to act.
- [x] **COMBAT-TIME-016**: The system shall report which combatant is ready to act without advancing the fight's time.
- [x] **COMBAT-TIME-017**: The system shall report a combatant's readiness partway through a beat as their readiness plus that fraction of what the beat will add, and shall report no readiness for a combatant unable to act.
- [x] **COMBAT-TIME-015**: The system shall allow a combatant whose readiness fills more than once between two actions of a slower combatant to act that many times.

## Where the bars start

- [x] **COMBAT-SURPRISE-003**: When an encounter begins, the system shall set the readiness of every combatant not on a side that caught the other unready to an independently drawn random share of a full bar, below a full bar.
- [x] **COMBAT-SURPRISE-004**: The system shall draw every combatant's opening readiness from the encounter's own seeded generator, so that an encounter replayed from the same seed opens identically.
- [x] **COMBAT-SURPRISE-005**: When one side begins an encounter unaware of the other, the system shall set every aware combatant's opening readiness to a full bar, and shall leave the unaware side's opening readiness as drawn.
- [x] **COMBAT-SURPRISE-008**: When one side begins an encounter unaware of the other, the system shall act every aware combatant once before any unaware combatant acts.
- [x] **COMBAT-SURPRISE-009**: The system shall order the aware side's opening actions among themselves by the same rule it orders any other combatants ready on the same beat.
- [x] **COMBAT-SURPRISE-006**: When both sides are aware or both unaware, the system shall draw every combatant's opening readiness and shall fill no combatant's bar.
- [x] **COMBAT-SURPRISE-007**: The system shall apply the opening readiness once, at the start of an encounter, and shall raise readiness by Dexterity alone thereafter.

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

## Targeting

- [x] **COMBAT-TARGET-001**: The system shall allow any combatant able to act to attack any combatant on the opposing side that is able to act.
- [x] **COMBAT-TARGET-002**: The system shall allow any combatant able to act to aim a heal or a benefit at any combatant on its own side, itself included.
- [x] **COMBAT-TARGET-003**: The system shall not let a combatant's position, ordering, or listing affect whether it may be targeted, there being no position in an encounter.
- [x] **COMBAT-TARGET-004**: The system shall offer as targets only combatants able to act, and shall exclude the unconscious, the dead, and the otherwise incapacitated.
- [x] **COMBAT-TARGET-005**: The system shall bound what a combatant may do by the weapons, spell slots, and abilities it holds, and by nothing else.

## Actions

- [ ] **COMBAT-ACTION-001**: When a character casts a spell, the system shall spend one spell slot of that spell's rank, and shall refuse the cast when no slot of that rank remains.
- [ ] **COMBAT-ACTION-002**: The system shall not restore a spell slot during an encounter.
- [ ] **COMBAT-ACTION-005**: When a character relights a doused light source, the system shall spend a full bar of that character's readiness.
- [x] **COMBAT-ACTION-009**: When a combatant passes their turn, the system shall spend a full bar of their readiness and shall resolve no action.
- [x] **COMBAT-ACTION-006**: The system shall apply every change to a character's hit points or condition through the party segment's operations.
- [x] **COMBAT-ACTION-008**: The system shall take an attack's base damage and accuracy from the combatant that is acting, and the armour reducing it from the combatant struck, on either side alike.

## Taking a turn

- [x] **COMBAT-TURN-001**: The system shall not take a character's turn until the player has chosen an action for it, and shall wait at that character without limit.
- [x] **COMBAT-TURN-002**: The system shall take an enemy's turn without awaiting the player.
- [x] **COMBAT-TURN-003**: The system shall offer a character every action that character can legally take, and shall accept no action a character cannot legally take.
- [x] **COMBAT-TURN-004**: If a character can legally take no action at all, then the system shall offer them passing and nothing else.
- [x] **COMBAT-TURN-005**: The system shall report whether a flee attempt is certain to fail, by the same rules that resolve one, without taking the attempt or costing any readiness.

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

- [x] **COMBAT-ENEMY-006**: The system shall resolve an enemy's action by the same rules it resolves a character's, reading the same fields from both.
- [x] **COMBAT-ENEMY-002**: The system shall not limit an enemy group to five members.
- [x] **COMBAT-ENEMY-007**: The system shall hold at most twenty enemies in an enemy group.

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
