# Persistence — EARS Specs

Specs for the persistence segment. Design: `persistence-design.md`.

How long a write waits and the names of the storage keys are tunable values, not
requirements. These specs fix what a save holds, when it is written, and what happens
when it is read.

## What a save holds

- [x] **SAVE-HOLD-001**: The system shall hold a campaign in one save carrying a schema version, the campaign's plan, the campaign generator's position, exploration's state, the party, and any encounter in progress.
- [x] **SAVE-HOLD-002**: The system shall save the campaign's plan whole, and shall read it back from the save rather than regenerating it from a seed.
- [x] **SAVE-HOLD-003**: The system shall report the position of a seeded generator, and shall rebuild from that position a generator producing the same stream from there on.
- [x] **SAVE-HOLD-004**: The system shall save the position of every generator a campaign uses: the campaign's own, each roamer's, and an encounter's.
- [x] **SAVE-HOLD-005**: While an encounter is running, the system shall save its enemies, every combatant's readiness, its beats, the skills used by each actor, the pot banked, its origin, the roamer it began with, and its generator.
- [x] **SAVE-HOLD-006**: The system shall save each character once, in the party, and shall restore an encounter referring to that same party.
- [x] **SAVE-HOLD-007**: The system shall save exploration's pending confirmation and pending fall, so that a reload neither dismisses a prompt nor escapes a pit.
- [x] **SAVE-HOLD-008**: The system shall not save a fight's log or whether a menu is open.
- [x] **SAVE-HOLD-009**: The system shall write a save containing only values that survive being written as JSON, and shall restore from one every value the campaign reads.

## When a save is written

- [x] **SAVE-WRITE-001**: When an action changes the campaign, the system shall write the save after a short fixed delay, gathering any further changes in that delay into the one write.
- [x] **SAVE-WRITE-002**: When the page is hidden, the system shall write any pending save at once.
- [x] **SAVE-WRITE-003**: When a fight action resolves, including an enemy's, the system shall treat it as a change to the campaign.
- [x] **SAVE-WRITE-004**: The system shall write no save while nothing has changed since the last write.

## Where it is kept

- [x] **SAVE-STORE-001**: The system shall keep the save under one key in the browser's synchronous local storage.
- [x] **SAVE-STORE-002**: If a write fails or storage is unavailable, then the system shall continue the game without interruption and shall report that the campaign is not being saved.
- [x] **SAVE-STORE-003**: When a later write succeeds, the system shall stop reporting that the campaign is not being saved.

## Reading a save

- [x] **SAVE-READ-001**: When the game opens and no save exists, the system shall begin a new campaign.
- [x] **SAVE-READ-002**: When the game opens and a save of the current version exists, the system shall resume that campaign, with every segment's hooks wired as a new campaign's are.
- [x] **SAVE-READ-003**: When a resumed campaign has an encounter in progress, the system shall resume that encounter at the turn it was saved on.
- [x] **SAVE-READ-004**: When a resumed fight is played on from the save with the same choices, the system shall produce the same results as if it had never been saved.
- [x] **SAVE-READ-005**: When a save of an earlier version is read, the system shall migrate it one version at a time, in order, to the current version before resuming it.
- [x] **SAVE-READ-006**: If a save cannot be read or carries a later version than the system knows, then the system shall move it unchanged to a key of its own, begin a new campaign, and report that this happened.
- [x] **SAVE-READ-007**: The system shall never overwrite a save it could not read.
- [ ] **SAVE-READ-008**: When a save from before the purse and opened chests is read, the system shall migrate it with an empty purse and no chest opened on any floor.

## Beginning again

- [x] **SAVE-NEW-001**: When beginning again is confirmed, the system shall replace the campaign and its save with a new campaign, and shall leave nothing of the old one in play.
- [x] **SAVE-NEW-002**: The system shall not begin again without the player's confirmation.

## Deferred

- [D] **SAVE-DATA-001**: The system shall let the player export a save to a file and import one.
- [D] **SAVE-DATA-002**: The system shall offer a save that was moved aside back to the player.
