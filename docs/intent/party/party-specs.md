# The Party — EARS Specs

Specs for the party segment. Design: `party-design.md`.

Rank thresholds, class rate multipliers, starting rank values, the pot ceiling and
what any enemy is worth are all content data. These specs fix the rules those numbers
are fed into, never the numbers.

## The roster

- [x] **PARTY-ROSTER-001**: The system shall hold at most five characters in a party.
- [x] **PARTY-ROSTER-002**: The system shall hold at most three characters in the front row and at most three in the back row.
- [x] **PARTY-ROSTER-003**: If an operation would exceed a roster or row limit, then the system shall reject it and leave the party unchanged.
- [x] **PARTY-ROSTER-004**: The system shall record each character's row on the character, so that a character is in exactly one row at all times.
- [x] **PARTY-ROSTER-005**: The system shall keep a character whose condition is `LOST` in the save as a record, and shall not count them against the roster limit.

## Character state

- [x] **PARTY-CHAR-001**: The system shall give every character the six attributes: Might, Constitution, Dexterity, Intellect, Perception, and Resolve.
- [ ] **PARTY-CHAR-002**: The system shall not derive which attribute a weapon or ability draws on for damage from the skill it uses; that is a property of the weapon or ability.
- [ ] **PARTY-CHAR-003**: The system shall change a character's hit points, condition, row, class, equipment, or skill ranks only through a party operation, whichever segment asked.
- [x] **PARTY-CHAR-004**: The system shall give every character a class, and shall record their equipment as the item occupying each slot.
- [ ] **PARTY-CHAR-006**: The system shall set a character's maximum hit points from their class's base multiplied by one twentieth of their Constitution above ten, and shall not change it as they advance.
- [ ] **PARTY-CHAR-007**: The system shall draw a weapon's governing attribute for damage from the weapon, and shall always draw accuracy from Perception whatever the weapon.

## Condition

- [x] **PARTY-COND-001**: When damage brings a character's hit points to zero or below, the system shall set their hit points to zero and their condition to `UNCONSCIOUS`.
- [x] **PARTY-COND-002**: When a character whose condition is `UNCONSCIOUS` takes damage, the system shall set their condition to `DEAD`.
- [x] **PARTY-COND-003**: When any healing is applied to a character whose condition is `UNCONSCIOUS`, the system shall set their condition to `OK`.
- [x] **PARTY-COND-004**: The system shall not heal a character whose condition is `DEAD`, `ASHES`, or `LOST`.
- [x] **PARTY-COND-005**: When a revival attempt on a `DEAD` character succeeds, the system shall set their condition to `OK`; when it fails, the system shall set it to `ASHES`.
- [x] **PARTY-COND-006**: When a revival attempt on an `ASHES` character succeeds, the system shall set their condition to `OK`; when it fails, the system shall set it to `LOST`.
- [x] **PARTY-COND-007**: The system shall accept no revival attempt on a character whose condition is `LOST`.
- [x] **PARTY-COND-008**: The system shall never raise a character's hit points above their maximum.
- [x] **PARTY-COND-009**: While a character's condition is not `OK`, the system shall let them take no action and contribute no defence, while continuing to occupy their row.
- [x] **PARTY-COND-010**: The system shall resolve a condition change at the moment the damage or healing is applied, rather than deferring it to the end of a round.
- [x] **PARTY-COND-011**: The system shall accept a revival attempt from a party member using Restoration, a town temple, a hired cleric, or a consumed one-use item alike.

## Skills

- [x] **PARTY-SKILL-001**: The system shall give every skill a rank, and shall unlock a character's abilities from the ranks they hold.
- [x] **PARTY-SKILL-002**: When a character is created, the system shall set the base skills shared by every class to rank 1, and the skills their class starts with to rank 1 or higher.
- [x] **PARTY-SKILL-003**: The system shall not advance a skill that the character's class cannot train.
- [x] **PARTY-SKILL-004**: The system shall advance a skill at the rate its class defines for that skill.
- [x] **PARTY-SKILL-005**: The system shall never reduce a skill rank.
- [ ] **PARTY-SKILL-006**: The system shall cap every skill rank at ten, and shall award no further rank however much experience is earned beyond it.
- [ ] **PARTY-SKILL-007**: The system shall require three hundred multiplied by a skill's current rank in experience to raise it by one rank.
- [ ] **PARTY-SKILL-008**: The system shall derive a character's accuracy with a weapon from the weapon, the rank of the weapon's skill, and the character's Perception.
- [ ] **PARTY-SKILL-009**: The system shall derive a character's defence from their Dexterity, the rank of the armour skill they are wearing, and their shield.
- [ ] **PARTY-SKILL-010**: The system shall derive a character's base damage with a weapon from the weapon, the rank of the weapon's skill, and the attribute the weapon names.

## Advancement

- [x] **PARTY-XP-001**: When an encounter ends, the system shall award skill experience from a pot determined by the enemies defeated, and shall divide it equally among the distinct skills the party used during that encounter.
- [x] **PARTY-XP-002**: The system shall count a skill as used in an encounter whether the action it drove succeeded or failed.
- [x] **PARTY-XP-003**: The system shall count a skill once per encounter however many times it was used, so that additional uses of the same skill award nothing further.
- [x] **PARTY-XP-004**: The system shall grow the pot with the number of distinct skills used, up to a ceiling beyond which further distinct skills grow it no more.
- [x] **PARTY-XP-005**: The system shall award nothing to a skill that was not used during the encounter.
- [x] **PARTY-XP-006**: The system shall award a smaller pot for a weaker enemy, so that fighting far beneath the party advances it slowly rather than not at all.
- [x] **PARTY-XP-007**: When a skill is used outside combat, the system shall advance it for that use, which the clock has already charged for.

## Class

- [x] **PARTY-CLASS-001**: The system shall define, for each class, the skills it may train and the rate at which it trains each.
- [x] **PARTY-CLASS-002**: When a character changes class, the system shall keep every skill rank they have already earned, including ranks in skills the new class cannot train.
- [x] **PARTY-CLASS-003**: If a character does not meet a class's requirements, then the system shall refuse the change and leave them as they are.

## Operations

- [ ] **PARTY-OP-001**: When combat or exploration applies damage, the system shall apply it through the party's own operation, enforcing the floor at zero and the condition chain.
- [x] **PARTY-OP-002**: When a character swaps places with an unconscious ally, the system shall consume the swapping character's action for that round.
- [ ] **PARTY-OP-003**: When equipment is changed, the system shall refuse a slot the item does not fit and a class that may not wield it.

## Persistence

- [x] **PARTY-SAVE-001**: The system shall save every character's attributes, class, skill ranks, accumulated skill experience, condition, hit points, row, and equipment.
- [x] **PARTY-SAVE-002**: The system shall restore a party from a save with every character in the condition and row they were saved in.

## Deferred

- [D] **PARTY-CHAR-005**: The system shall set a new character's attributes according to the campaign's character-creation rules.
- [D] **PARTY-OP-004**: The system shall apply a penalty to a party carrying characters who are dead.
- [D] **PARTY-CLASS-004**: The system shall offer class changes only at a trainer in a town.
