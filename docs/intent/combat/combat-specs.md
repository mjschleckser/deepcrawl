# Combat — EARS Specs

Specs for the combat segment. Design: `combat-design.md`.

The minimum-damage fraction, and how base damage and armour are assembled from skill,
attribute and equipment, are content data. These specs fix the structure those numbers
are fed into.

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
- [x] **COMBAT-TIME-012**: The system shall not advance the exploration clock for any reason while an encounter is running.
- [x] **COMBAT-TIME-013**: When a combatant stops being able to act, the system shall discard the readiness they had accumulated rather than holding it for their return.
- [x] **COMBAT-TIME-014**: The system shall not raise the readiness of a combatant unable to act.
- [x] **COMBAT-TIME-015**: The system shall allow a combatant whose readiness fills more than once between two actions of a slower combatant to act that many times.

## The turn order

- [x] **COMBAT-QUEUE-001**: While an encounter is ongoing, the system shall report the turn order as a list of the fight's next turns, of a length the caller asks for, each entry naming the combatant who takes that turn.
- [x] **COMBAT-QUEUE-002**: The system shall name as the first entry of the turn order the combatant the fight will act next.
- [x] **COMBAT-QUEUE-003**: The system shall project the turn order by the rules that resolve the fight: raising readiness by Dexterity, settling combatants ready on the same beat by the acting order, and spending one full bar for each turn listed.
- [x] **COMBAT-QUEUE-004**: The system shall list a combatant in the turn order as often as their readiness fills, so that a quicker combatant holds more of its entries than a slower one.
- [x] **COMBAT-QUEUE-005**: The system shall change no readiness, advance no fight time, and draw no random number when reporting the turn order.
- [x] **COMBAT-QUEUE-006**: The system shall list only combatants able to act in the turn order.
- [x] **COMBAT-QUEUE-007**: When an encounter is no longer ongoing, the system shall report an empty turn order.

## Where the bars start

- [x] **COMBAT-SURPRISE-003**: When an encounter begins, the system shall set the readiness of every combatant on both sides to an independently drawn random share of a full bar, below a full bar.
- [x] **COMBAT-SURPRISE-004**: The system shall draw every combatant's opening readiness from the encounter's own seeded generator, so that an encounter replayed from the same seed opens identically.
- [x] **COMBAT-SURPRISE-010**: The system shall not vary any combatant's opening readiness with which side noticed the other or how the two sides came to meet.
- [x] **COMBAT-SURPRISE-007**: The system shall apply the opening readiness once, at the start of an encounter, and shall raise readiness by Dexterity alone thereafter.

## Resolving an attack

- [x] **COMBAT-ATTACK-014**: The system shall land every attack on its target, with no miss.
- [x] **COMBAT-ATTACK-015**: The system shall deal, for every attack, the attacker's base damage less the target's armour, rounded to the nearest whole point, with no multiplier.
- [x] **COMBAT-ATTACK-016**: The system shall draw no random number when resolving an attack, so that the same attacker striking the same target deals the same damage every time, on either side alike.
- [x] **COMBAT-ATTACK-005**: The system shall deal at least one twentieth of an attack's base damage, rounded up and never below one, whatever the target's armour.
- [x] **COMBAT-ATTACK-013**: The system shall report the damage one combatant's attack on another will deal, by the calculation that resolving that attack uses, without drawing a random number or changing the encounter.

## Targeting

- [x] **COMBAT-TARGET-001**: The system shall allow any combatant able to act to attack any combatant on the opposing side that is able to act.
- [x] **COMBAT-TARGET-002**: The system shall allow any combatant able to act to aim a heal or a benefit at any combatant on its own side, itself included.
- [x] **COMBAT-TARGET-003**: The system shall not let a combatant's position, ordering, or listing affect whether it may be targeted, there being no position in an encounter.
- [x] **COMBAT-TARGET-004**: The system shall offer as targets only combatants able to act, and shall exclude the unconscious, the dead, and the otherwise incapacitated.
- [x] **COMBAT-TARGET-005**: The system shall bound what a combatant may do by the weapons, spell slots, and abilities it holds, and by nothing else.

## Actions

- [ ] **COMBAT-ACTION-001**: When a character casts a spell, the system shall spend one spell slot of that spell's rank, and shall refuse the cast when no slot of that rank remains.
- [ ] **COMBAT-ACTION-002**: The system shall not restore a spell slot during an encounter.
- [ ] **COMBAT-ACTION-015**: When a character casts a spell they know that may be cast in a fight, the system shall resolve its effect through the magic segment against a target resolved at that moment, spend a full bar of their readiness, and record the spell's school as a skill they used.
- [ ] **COMBAT-ACTION-016**: If a cast in a fight is refused, then the system shall spend none of the character's readiness and leave their turn waiting.
- [x] **COMBAT-ACTION-009**: When a combatant passes their turn, the system shall spend a full bar of their readiness and shall resolve no action.
- [x] **COMBAT-ACTION-006**: The system shall apply every change to a character's hit points or condition through the party segment's operations.
- [x] **COMBAT-ACTION-008**: The system shall take an attack's base damage from the combatant that is acting, and the armour reducing it from the combatant struck, on either side alike.
- [x] **COMBAT-ACTION-011**: When a character equips an item from the pack in a fight, the system shall make the change through the party segment's operation and shall spend a full bar of their readiness.
- [x] **COMBAT-ACTION-012**: If a change of equipment in a fight is refused, then the system shall spend none of the character's readiness.
- [x] **COMBAT-ACTION-010**: When a character attacks, the system shall record as the skill used the skill of the weapon they are using, rather than the skill of the attack they were authored with.
- [x] **COMBAT-ACTION-013**: When a character uses a consumable in a fight, the system shall use it on that character alone, through the party's operation, and shall spend their full bar.
- [x] **COMBAT-ACTION-014**: If the party refuses a character's use of a consumable in a fight, then the system shall spend nothing and leave the character's turn waiting.

## Taking a turn

- [x] **COMBAT-TURN-001**: The system shall not take a character's turn until the player has chosen an action for it, and shall wait at that character without limit.
- [x] **COMBAT-TURN-002**: The system shall take an enemy's turn without awaiting the player.
- [x] **COMBAT-TURN-003**: The system shall offer a character every action that character can legally take, and shall accept no action a character cannot legally take.
- [x] **COMBAT-TURN-004**: If a character can legally take no action at all, then the system shall offer them passing and nothing else.
- [x] **COMBAT-TURN-005**: The system shall report whether a flee attempt is certain to fail, by the same rules that resolve one, without taking the attempt or costing any readiness.


## Fleeing

- [x] **COMBAT-FLEE-001**: The system shall resolve a flee attempt once for the whole party, never for individual characters.
- [x] **COMBAT-FLEE-002**: When a flee attempt succeeds, the system shall end the encounter, return the party to the tile it came from, and award nothing.
- [x] **COMBAT-FLEE-003**: If a flee attempt fails, then the system shall spend the readiness of the character who attempted it, impose no further penalty, and allow another attempt as soon as any character is ready.
- [x] **COMBAT-FLEE-004**: The system shall fail a flee attempt when the fastest enemy's Dexterity exceeds the party's slowest member's Dexterity by more than a quarter.
- [x] **COMBAT-FLEE-005**: The system shall fail a flee attempt when any enemy present carries an ability that forbids escape.

## Enemy groups

- [x] **COMBAT-ENEMY-006**: The system shall resolve an enemy's action by the same rules it resolves a character's, reading the same fields from both.
- [x] **COMBAT-ENEMY-002**: The system shall not limit an enemy group to the party's size.
- [x] **COMBAT-ENEMY-007**: The system shall hold at most twenty enemies in an enemy group.

## Ending an encounter

- [x] **COMBAT-END-001**: When no enemy remains able to act, the system shall end the encounter in victory.
- [x] **COMBAT-END-002**: When no party member remains conscious, the system shall end the encounter in defeat.
- [x] **COMBAT-END-003**: When an encounter ends in victory, the system shall report the experience pot from the enemies defeated together with the distinct skills the party used.
- [x] **COMBAT-END-004**: The system shall determine the pot from the enemies defeated and never from how long the encounter took.
- [x] **COMBAT-END-005**: When an encounter ends in defeat, the system shall report the defeat and the floor and tile the party fell on, and shall not alter the party further.
- [x] **COMBAT-END-006**: When an encounter ends in escape or defeat, the system shall report no experience pot.
- [x] **COMBAT-END-007**: When an encounter ends in victory, the system shall report with the pot the gold and every item the defeated enemies yielded.

## Deferred

- [D] **COMBAT-ACTION-007**: The system shall resolve the effect of each ability a skill rank unlocks.
- [D] **COMBAT-SURPRISE-011**: Where a combatant carries an item or skill that grants an opening advantage, the system shall apply that advantage to that combatant's opening readiness alone, on either side alike.
- [D] **COMBAT-ENEMY-005**: The system shall choose enemy actions by the behaviour its roster defines, beyond selecting a legal target.
- [D] **COMBAT-STATUS-001**: The system shall apply and expire status effects such as poison, fear, and paralysis.
