# Combat — EARS Specs

Specs for the combat segment. Design: `combat-design.md`.

Band thresholds, graze and crit multipliers, darkness penalties, and how accuracy and
defence are assembled from skill, attribute and equipment are all content data. These
specs fix the structure those numbers are fed into.

## Rounds

- [x] **COMBAT-ROUND-001**: The system shall collect an action from every combatant able to act before resolving any of them.
- [x] **COMBAT-ROUND-002**: The system shall resolve the actions of a round one at a time, in descending order of the actor's Dexterity.
- [x] **COMBAT-ROUND-003**: When two combatants have equal Dexterity, the system shall resolve the party's action first.
- [x] **COMBAT-ROUND-004**: When two party members have equal Dexterity, the system shall resolve them in a fixed order of position.
- [x] **COMBAT-ROUND-005**: The system shall give each combatant exactly one action per round.
- [x] **COMBAT-ROUND-006**: If the target of an action is no longer a legal target when that action resolves, then the system shall spend the action and resolve nothing, and shall not select a substitute target.
- [x] **COMBAT-ROUND-007**: The system shall not restore hit points, spell slots, or any other resource merely because a round has passed.
- [ ] **COMBAT-ROUND-008**: The system shall not advance the exploration clock for any reason while an encounter is running.

## Surprise

- [x] **COMBAT-SURPRISE-001**: When one side begins an encounter unaware of the other, the system shall give the aware side a full round before the first ordinary round.
- [x] **COMBAT-SURPRISE-002**: When both sides are aware or both unaware, the system shall begin with an ordinary round.

## Resolving an attack

- [x] **COMBAT-ATTACK-001**: The system shall resolve an attack from a single roll combined with the attacker's accuracy and the target's defence.
- [x] **COMBAT-ATTACK-002**: The system shall resolve every attack into exactly one of four bands: miss, graze, hit, or crit.
- [x] **COMBAT-ATTACK-003**: The system shall deal no damage on a miss.
- [x] **COMBAT-ATTACK-004**: The system shall deal reduced damage on a graze, full damage on a hit, and increased damage on a crit.
- [x] **COMBAT-ATTACK-005**: The system shall deal at least one twentieth of an attack's base damage, rounded up and never below one, whenever that attack lands.
- [x] **COMBAT-ATTACK-006**: The system shall raise the band as the attacker's accuracy rises relative to the target's defence, so that a greater advantage never produces a worse band on the same roll.
- [ ] **COMBAT-ATTACK-007**: The system shall draw an attack's governing attribute from the weapon rather than from the skill the weapon uses.
- [ ] **COMBAT-ATTACK-008**: The system shall assemble accuracy from the attacker's weapon skill rank, the weapon's governing attribute, and equipment.

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
- [ ] **COMBAT-ACTION-003**: When a character defends, the system shall raise their defence until their next turn.
- [ ] **COMBAT-ACTION-004**: When a character swaps places with an ally, the system shall spend that character's action for the round.
- [ ] **COMBAT-ACTION-005**: When a character relights a doused light source, the system shall spend that character's action for the round.
- [x] **COMBAT-ACTION-006**: The system shall apply every change to a character's hit points or condition through the party segment's operations.

## Darkness

- [x] **COMBAT-DARK-001**: While an encounter is in darkness, the system shall apply an accuracy penalty to the party's attacks.
- [x] **COMBAT-DARK-002**: While an encounter is in darkness, the system shall choose the party's targets at random among legal targets rather than allowing deliberate selection.
- [x] **COMBAT-DARK-003**: The system shall not raise any enemy's accuracy, awareness, or effectiveness because the party's light level is low.

## Fleeing

- [x] **COMBAT-FLEE-001**: The system shall resolve a flee attempt once for the whole party, never for individual characters.
- [x] **COMBAT-FLEE-002**: When a flee attempt succeeds, the system shall end the encounter, return the party to the tile it came from, and award nothing.
- [x] **COMBAT-FLEE-003**: If a flee attempt fails, then the system shall spend the round and impose no further penalty, and shall allow another attempt on a later round.
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
- [x] **COMBAT-END-004**: The system shall determine the pot from the enemies defeated and never from the number of rounds the encounter took.
- [x] **COMBAT-END-005**: When an encounter ends in defeat, the system shall report the defeat and the floor and tile the party fell on, and shall not alter the party further.
- [x] **COMBAT-END-006**: When an encounter ends in escape or defeat, the system shall report no experience pot.

## Deferred

- [D] **COMBAT-ACTION-007**: The system shall resolve the effect of each ability a skill rank unlocks.
- [D] **COMBAT-ENEMY-005**: The system shall choose enemy actions by the behaviour its roster defines, beyond selecting a legal target.
- [D] **COMBAT-STATUS-001**: The system shall apply and expire status effects such as poison, fear, and paralysis.
