# The Party — EARS Specs

Specs for the party segment. Design: `party-design.md`.

Rank thresholds, class rate multipliers, starting rank values, the pot ceiling and
what any enemy is worth are all content data. These specs fix the rules those numbers
are fed into, never the numbers.

## The roster

- [ ] **PARTY-ROSTER-001**: The system shall hold at most five characters in a party.
- [ ] **PARTY-ROSTER-002**: The system shall hold at most three characters in the front row and at most three in the back row.
- [ ] **PARTY-ROSTER-003**: If an operation would exceed a roster or row limit, then the system shall reject it and leave the party unchanged.
- [ ] **PARTY-ROSTER-004**: The system shall record each character's row on the character, so that a character is in exactly one row at all times.
- [ ] **PARTY-ROSTER-005**: The system shall keep a character whose condition is `LOST` in the save as a record, and shall not count them against the roster limit.

## Character state

- [ ] **PARTY-CHAR-001**: The system shall give every character the six attributes: Might, Constitution, Dexterity, Intellect, Perception, and Resolve.
- [ ] **PARTY-CHAR-002**: The system shall not derive which attribute a weapon or ability draws on from the skill it uses; that is a property of the weapon or ability.
- [ ] **PARTY-CHAR-003**: The system shall change a character's hit points, condition, row, class, equipment, or skill ranks only through a party operation, whichever segment asked.
- [ ] **PARTY-CHAR-004**: The system shall give every character a class, and shall record their equipment as the item occupying each slot.

## Condition

- [ ] **PARTY-COND-001**: When damage brings a character's hit points to zero or below, the system shall set their hit points to zero and their condition to `UNCONSCIOUS`.
- [ ] **PARTY-COND-002**: When a character whose condition is `UNCONSCIOUS` takes damage, the system shall set their condition to `DEAD`.
- [ ] **PARTY-COND-003**: When any healing is applied to a character whose condition is `UNCONSCIOUS`, the system shall set their condition to `OK`.
- [ ] **PARTY-COND-004**: The system shall not heal a character whose condition is `DEAD`, `ASHES`, or `LOST`.
- [ ] **PARTY-COND-005**: When a revival attempt on a `DEAD` character succeeds, the system shall set their condition to `OK`; when it fails, the system shall set it to `ASHES`.
- [ ] **PARTY-COND-006**: When a revival attempt on an `ASHES` character succeeds, the system shall set their condition to `OK`; when it fails, the system shall set it to `LOST`.
- [ ] **PARTY-COND-007**: The system shall accept no revival attempt on a character whose condition is `LOST`.
- [ ] **PARTY-COND-008**: The system shall never raise a character's hit points above their maximum.
- [ ] **PARTY-COND-009**: While a character's condition is not `OK`, the system shall let them take no action and contribute no defence, while continuing to occupy their row.
- [ ] **PARTY-COND-010**: The system shall resolve a condition change at the moment the damage or healing is applied, rather than deferring it to the end of a round.
- [ ] **PARTY-COND-011**: The system shall accept a revival attempt from a party member using Restoration, a town temple, a hired cleric, or a consumed one-use item alike.

## Skills

- [ ] **PARTY-SKILL-001**: The system shall give every skill a rank, and shall unlock a character's abilities from the ranks they hold.
- [ ] **PARTY-SKILL-002**: When a character is created, the system shall set the base skills shared by every class to rank 1, and the skills their class starts with to rank 1 or higher.
- [ ] **PARTY-SKILL-003**: The system shall not advance a skill that the character's class cannot train.
- [ ] **PARTY-SKILL-004**: The system shall advance a skill at the rate its class defines for that skill.
- [ ] **PARTY-SKILL-005**: The system shall never reduce a skill rank.

## Advancement

- [ ] **PARTY-XP-001**: When an encounter ends, the system shall award skill experience from a pot determined by the enemies defeated, and shall divide it equally among the distinct skills the party used during that encounter.
- [ ] **PARTY-XP-002**: The system shall count a skill as used in an encounter whether the action it drove succeeded or failed.
- [ ] **PARTY-XP-003**: The system shall count a skill once per encounter however many times it was used, so that additional uses of the same skill award nothing further.
- [ ] **PARTY-XP-004**: The system shall grow the pot with the number of distinct skills used, up to a ceiling beyond which further distinct skills grow it no more.
- [ ] **PARTY-XP-005**: The system shall award nothing to a skill that was not used during the encounter.
- [ ] **PARTY-XP-006**: The system shall award a smaller pot for a weaker enemy, so that fighting far beneath the party advances it slowly rather than not at all.
- [ ] **PARTY-XP-007**: When a skill is used outside combat, the system shall advance it for that use, which the clock has already charged for.

## Class

- [ ] **PARTY-CLASS-001**: The system shall define, for each class, the skills it may train and the rate at which it trains each.
- [ ] **PARTY-CLASS-002**: When a character changes class, the system shall keep every skill rank they have already earned, including ranks in skills the new class cannot train.
- [ ] **PARTY-CLASS-003**: If a character does not meet a class's requirements, then the system shall refuse the change and leave them as they are.

## Operations

- [ ] **PARTY-OP-001**: When combat or exploration applies damage, the system shall apply it through the party's own operation, enforcing the floor at zero and the condition chain.
- [ ] **PARTY-OP-002**: When a character swaps places with an unconscious ally, the system shall consume the swapping character's action for that round.
- [ ] **PARTY-OP-003**: When equipment is changed, the system shall refuse a slot the item does not fit and a class that may not wield it.

## Persistence

- [ ] **PARTY-SAVE-001**: The system shall save every character's attributes, class, skill ranks, accumulated skill experience, condition, hit points, row, and equipment.
- [ ] **PARTY-SAVE-002**: The system shall restore a party from a save with every character in the condition and row they were saved in.

## Deferred

- [D] **PARTY-CHAR-005**: The system shall set a new character's attributes according to the campaign's character-creation rules.
- [D] **PARTY-OP-004**: The system shall apply a penalty to a party carrying characters who are dead.
- [D] **PARTY-CLASS-004**: The system shall offer class changes only at a trainer in a town.
