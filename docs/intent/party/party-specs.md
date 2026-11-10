# The Party — EARS Specs

Specs for the party segment. Design: `party-design.md`.

Starting rank values, the pot ceiling and
what any enemy is worth are all content data. These specs fix the rules those numbers
are fed into, never the numbers.

## The roster

- [x] **PARTY-ROSTER-001**: The system shall hold at most four characters in a party.
- [x] **PARTY-ROSTER-003**: If an operation would exceed the roster limit, then the system shall reject it and leave the party unchanged.
- [x] **PARTY-ROSTER-006**: The system shall give a character no position within the party, and shall treat every member as equally present.
- [x] **PARTY-ROSTER-005**: The system shall keep a character whose condition is `LOST` in the save as a record, and shall not count them against the roster limit.

## Character state

- [x] **PARTY-CHAR-001**: The system shall give every character the five attributes: Might, Constitution, Dexterity, Intellect, and Resolve.
- [x] **PARTY-CHAR-003**: The system shall change a character's hit points, condition, class, equipment, or skill ranks only through a party operation, whichever segment asked.
- [x] **PARTY-CHAR-004**: The system shall give every character a class, and shall record their equipment as the item occupying each slot.
- [x] **PARTY-CHAR-006**: The system shall set a classed character's maximum hit points from their class's base, moved one twentieth for each point of Constitution above or below ten, and shall not change it as they advance.
- [x] **PARTY-CHAR-009**: The system shall report a character's total level as the sum of their skill ranks.
- [x] **PARTY-CHAR-010**: The system shall derive total level whenever it is asked for rather than storing it, so that it changes exactly when a rank changes.
- [x] **PARTY-CHAR-011**: The system shall report the total level of anything holding skill ranks by the same summation, whether it belongs to the party or to an enemy group.
- [x] **PARTY-CHAR-012**: The system shall let no roll, reward, or eligibility be decided by total level.
- [x] **PARTY-CHAR-013**: The system shall take a character's casting attribute from their class's file: Intellect for a mage, Resolve for a cleric, and none for a class that casts nothing.

## Condition

- [x] **PARTY-COND-001**: When damage brings a character's hit points to zero or below, the system shall set their hit points to zero and their condition to `UNCONSCIOUS`.
- [x] **PARTY-COND-002**: When a character whose condition is `UNCONSCIOUS` takes damage, the system shall set their condition to `DEAD`.
- [x] **PARTY-COND-003**: When any healing is applied to a character whose condition is `UNCONSCIOUS`, the system shall set their condition to `OK`.
- [x] **PARTY-COND-004**: The system shall not heal a character whose condition is `DEAD`, `ASHES`, or `LOST`.
- [x] **PARTY-COND-005**: When a revival attempt on a `DEAD` character succeeds, the system shall set their condition to `OK`; when it fails, the system shall set it to `ASHES`.
- [x] **PARTY-COND-006**: When a revival attempt on an `ASHES` character succeeds, the system shall set their condition to `OK`; when it fails, the system shall set it to `LOST`.
- [x] **PARTY-COND-007**: The system shall accept no revival attempt on a character whose condition is `LOST`.
- [x] **PARTY-COND-008**: The system shall never raise a character's hit points above their maximum.
- [x] **PARTY-COND-009**: While a character's condition is not `OK`, the system shall let them take no action, while remaining a member of the party.
- [x] **PARTY-COND-010**: The system shall resolve a condition change at the moment the damage or healing is applied, rather than deferring it until other combatants have acted.
- [x] **PARTY-COND-011**: The system shall accept a revival attempt from a party member using Restoration, a town temple, a hired cleric, or a consumed one-use item alike.

## Skills

- [x] **PARTY-SKILL-001**: The system shall give every skill a rank, and shall unlock a character's abilities from the ranks they hold.
- [x] **PARTY-SKILL-002**: When a character is created, the system shall set the base skills shared by every class to rank 1, and the skills their class's file names as starting ranks to the ranks it gives, its class skill always among them at rank 1 or higher.
- [x] **PARTY-SKILL-005**: The system shall never reduce a skill rank.
- [x] **PARTY-SKILL-006**: The system shall cap every skill rank at ten, and shall award no further rank however much experience is earned beyond it.
- [x] **PARTY-SKILL-007**: The system shall require three hundred multiplied by a skill's current rank in experience to raise it by one rank.
- [x] **PARTY-SKILL-011**: The system shall read a skill's rank from the experience accumulated in it, counting from rank zero, so that a rank a class granted free costs its holder no less to leave than one they earned.
- [x] **PARTY-SKILL-013**: The system shall place every skill in exactly one of six groups — Class, Weapon, Arcane, Divine, Stealth, Survival — listed in that order, and shall let nothing but presentation depend on the grouping.
- [x] **PARTY-SKILL-012**: The system shall report a skill's progress toward its next rank as the share, from nought to one, of that rank's cost the accumulated experience has covered, reporting nought while the experience has not yet reached the current rank and one at the rank cap.
- [x] **PARTY-SKILL-014**: The system shall advance every skill a character uses by the same amount for the same experience, whatever their class, and shall bar no class from practising any skill but another class's class skill.
- [x] **PARTY-SKILL-015**: The system shall offer these skills and no others: Ironclad, Backstab, Overchannel, Intercession, Blade, Blunt, Polearm, Bow, Evocation, Alteration, Healing, Restoration, Detection, Disarm, Locks, Cartography, Cooking, Foraging.

## Advancement

- [x] **PARTY-XP-001**: When an encounter ends, the system shall award skill experience from a pot determined by the enemies defeated, and shall divide it equally among the distinct skills the party used during that encounter.
- [x] **PARTY-XP-002**: The system shall count a skill as used in an encounter whether the action it drove succeeded or failed.
- [x] **PARTY-XP-003**: The system shall count a skill once per encounter however many times it was used, so that additional uses of the same skill award nothing further.
- [x] **PARTY-XP-004**: The system shall grow the pot with the number of distinct skills used, up to a ceiling beyond which further distinct skills grow it no more.
- [x] **PARTY-XP-005**: The system shall award nothing to a skill that was not used during the encounter.
- [x] **PARTY-XP-006**: The system shall award a smaller pot for a weaker enemy, so that fighting far beneath the party advances it slowly rather than not at all.
- [x] **PARTY-XP-007**: When a skill is used outside combat, the system shall advance it for that use, which the clock has already charged for.

## Class

- [x] **PARTY-CLASS-001**: The system shall read each class from a file of its own under `src/game-data/classes`, holding its identifier, name, hit-point base, class skill, starting ranks, the item categories it wields, the schools it casts, and the attribute it casts with.
- [x] **PARTY-CLASS-005**: The system shall take every property of a class from that class's file and from nowhere else.
- [x] **PARTY-CLASS-006**: When an authored class names a skill, item category, school or attribute that does not exist, or lacks any field a class holds, the system shall reject that file by name and report which value was not recognised.
- [x] **PARTY-CLASS-007**: If two authored classes name the same class skill, or a class names as its class skill a skill outside the Class group, then the system shall reject the class files and report the clash.
- [x] **PARTY-CLASS-008**: The system shall offer no operation that changes a character's class once they are created.

## Class skills

- [x] **PARTY-CSKILL-001**: The system shall give a character a rank or experience in a class skill only when it is their own class's class skill, whatever the source — an encounter, use outside combat, a tome, or an authored file.
- [x] **PARTY-CSKILL-002**: The system shall rank, cost, cap, count toward total level, and advance from the encounter pot a class skill exactly as any other skill.
- [x] **PARTY-CSKILL-003**: The system shall report a fighter's Ironclad armour factor as one plus one twentieth per Ironclad rank.
- [x] **PARTY-CSKILL-004**: The system shall report a fighter's Ironclad weight as a target as one plus one fifth per Ironclad rank, and every other character's as one.
- [x] **PARTY-CSKILL-005**: The system shall report a thief's Backstab multiplier as one and nine tenths plus one tenth per Backstab rank.
- [x] **PARTY-CSKILL-006**: The system shall report a mage's Overchannel cost per spell rank as seven hit points less half their Overchannel rank, rounded up.
- [x] **PARTY-CSKILL-007**: The system shall give a cleric Intercession charges numbering one plus one for every four whole Intercession ranks.
- [x] **PARTY-CSKILL-008**: When damage would bring a conscious party member to zero hit points or below, and a conscious cleric in the party has an Intercession charge left, the system shall leave the member at one hit point and conscious, and shall spend one charge of the first such cleric in the party's order.
- [x] **PARTY-CSKILL-009**: The system shall intercede for no damage to a character who is not conscious, and shall let that damage proceed through the condition chain.
- [x] **PARTY-CSKILL-010**: When Intercession spends a charge, the system shall count Intercession as used by that cleric — in an encounter as a skill used there, and outside one through the operation for a skill used outside combat.
- [x] **PARTY-CSKILL-011**: When the camp segment restores a character's charges, the system shall return every Intercession charge they have spent, and shall restore none at any other time.

## Operations

- [x] **PARTY-OP-001**: When combat or exploration applies damage, the system shall apply it through the party's own operation, enforcing the floor at zero and the condition chain.
- [x] **PARTY-OP-003**: When equipment is changed, the system shall refuse a slot the item does not fit and an item whose category the character's class file does not name.
- [x] **PARTY-OP-005**: The system shall move items between a character's slots and the pack only through the party's `equip`, `takeOff` and `stow` operations, shall take a consumable out of the pack only through `useItem`, and shall refuse to equip or use an item that is not in the pack.
- [x] **PARTY-OP-006**: The system shall hold for the party as a whole one purse of gold, starting at zero, and shall add to it only through the party's `addGold` operation, which never lowers it.
- [x] **PARTY-OP-007**: When a character uses a consumable, the system shall remove one of it from the pack and heal that character, and no other, by its stated amount through the party's healing operation.
- [x] **PARTY-OP-008**: If a character using a consumable is at full health or is not conscious, then the system shall refuse the use and leave the pack and every character as they were.
- [x] **PARTY-OP-009**: When magic pays an Overchannelled cast, the system shall lower the caster's hit points by the cost through the party's `payHitPoints`, changing no condition and drawing on no Intercession.
- [x] **PARTY-OP-010**: If a cost paid through `payHitPoints` would bring the character to zero hit points or below, then the system shall refuse it and leave the character as they were.

## Persistence

- [x] **PARTY-SAVE-001**: The system shall save every character's attributes, class, skill ranks, accumulated skill experience, condition, hit points, and equipment.
- [x] **PARTY-SAVE-005**: The system shall save every character's fullness and the meal buff they carry.
- [x] **PARTY-SAVE-006**: The system shall save every cleric's spent Intercession charges, and shall save a character's class by its identifier only.
- [x] **PARTY-SAVE-007**: When a saved party holds ranks or experience in a skill that no longer exists, the system shall drop them as it restores the party.
- [x] **PARTY-SAVE-003**: The system shall save the pack and every item in it, and shall restore it in the same order.
- [x] **PARTY-SAVE-002**: The system shall restore a party from a save with every character in the condition they were saved in.
- [x] **PARTY-SAVE-004**: The system shall save the party's purse, and shall restore it to the same amount.

## Authored combatants

- [x] **PARTY-DATA-001**: The system shall read each authored combatant from a file of its own, holding that combatant and nothing else.
- [x] **PARTY-DATA-002**: The system shall read the party's authored combatants from `src/game-data/players` and the enemies' from `src/game-data/enemies`.
- [x] **PARTY-DATA-003**: The system shall build an authored combatant through the same creation the rest of the system uses, so that an authored combatant and a created one are the same shape.
- [x] **PARTY-DATA-004**: When an authored combatant names a class, attribute, skill, condition, or role that does not exist, the system shall reject that file by name and report which value was not recognised.
- [x] **PARTY-DATA-005**: The system shall require an identifier and a name of every authored combatant, and maximum hit points of one that names no class, and shall reject a file lacking any of them.
- [x] **PARTY-DATA-006**: The system shall treat an authored combatant's omitted attributes as the default score and its omitted skill ranks as the ranks its class grants.
- [x] **PARTY-DATA-007**: When an authored character names a rank in another class's class skill, or an authored enemy names a rank in any class skill, the system shall reject that file by name and report the skill.

## Deferred

- [D] **PARTY-CHAR-005**: The system shall set a new character's attributes according to the campaign's character-creation rules.
- [D] **PARTY-OP-004**: The system shall apply a penalty to a party carrying characters who are dead.
