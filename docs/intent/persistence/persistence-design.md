---
parent: high-level-design
prefix: SAVE
---

# Persistence

## Context and Design Philosophy

A campaign lives in one save in the browser. This segment decides what that save holds,
when it is written, and what happens when it is read. Exploration and the party each say
how their own state is saved; this segment is what gathers them into a campaign and puts
that campaign somewhere it will survive.

Four principles shape it.

**The player never saves.** There is no save button and no slot to choose. The game is
played a few minutes at a stretch on a phone, and a tab can be closed, reloaded or killed
by the system without warning, so anything that depends on the player remembering is
progress waiting to be lost.

**Reopening is resuming.** The game comes back where it was left: the same tile, the same
facing, the same fight on the same turn. A player who was mid-fight is still mid-fight.

**A bad outcome cannot be reloaded away.** One save and real consequences are the
campaign's whole structure, so the save carries the random generators as well as the
state. Reloading replays the same dice rather than rolling new ones.

**A save is never thrown away on the game's own initiative.** A save that cannot be read
is set aside, not overwritten. An update that fails to load a campaign is a bug that can
be fixed; an update that erases one cannot.

## Testing Mode

The game can run in **testing mode**, for trying its mechanics rather than playing a
campaign. It is a setting the player turns on and off from the party screen, remembered in
the browser apart from any save, and on until it is turned off.

In testing mode nothing is saved: every load begins a new campaign, no save is read or
written, and none already in storage is touched. The game says it is in testing mode, in
the note beside the build stamp, so a player knows a reload starts over.

A testing campaign begins with everything needed to try what the game can do:

- one of every weapon, armour, shield, potion and tome in the pack
- three of every food
- 500 gold
- every spell a caster could learn from a tome, already learned
- Cooking rank 6 for the cleric, so a meal can carry two buffs

**Switching mode begins a new campaign**, after the player confirms it. A testing campaign
never becomes a saved one, and a saved campaign is never given the testing supplies: the
two do not mix.

Everything else this segment describes runs whenever testing mode is off.

## What This Segment Owns

| | Owned here | Owned elsewhere |
|---|---|---|
| The campaign save | what it holds, its version, and how it is migrated | exploration and the party say how their own state is written |
| When a save is written | the triggers and the pacing | — |
| Where it is kept | browser storage, and what happens when that fails | — |
| Beginning again | replacing the campaign with a new one | presentation draws the control and the confirmation |
| Rebuilding a campaign | wiring restored state back to its hooks | `createCampaign` remains the composition root |

## What a Save Holds

```
version      the schema this save was written in
plan         the campaign's plan of floors, whole
rng          where the campaign's generator has reached
exploration  floors, discovery, opened chests, roamers, the clock: exploration's own save
party        every character, what they hold and what they have earned; the pack and the purse
encounter    the fight in progress, or nothing
```

**The plan is saved whole, not regenerated from its seed.** A later build may generate
plans differently, and a plan rebuilt from a seed would then disagree with the floors
already in the save. The seed describes how a campaign began; the plan is what it is.

**A generator is saved as where it has reached.** Each generator reports its position and
can be rebuilt from it, whether it is the campaign's own, the encounter's, or one of the
generators a roamer carries. A generator is otherwise a function, which does not survive
being written down, so a roamer restored without this would have nothing to move with.

**An encounter is saved whole**: the enemies as they stand, every combatant's readiness,
the fight's beats, the skills used so far, the pot banked, and its generator. Characters
are saved once, in the party, and the encounter refers to that party rather than holding
a second copy. A fight's log is a record of what was already reported and is not saved,
so a resumed fight's log starts empty. An open menu is not saved either, and the turn
resumes on its open choice.

## When a Save Is Written

**After anything that changes the campaign, a moment later.** A write is scheduled when
an action changes the state, and held for a second so that a run of steps becomes one
write rather than one each. Writing a whole campaign on every step would stutter on a
phone for no benefit.

**At once, when the page is hidden.** Switching app, locking the phone and closing the tab
all hide the page, and hiding is the last moment that can be relied on. Anything pending
is written then, without waiting out the second.

This leaves no window worth caring about. If a page is killed in that second, the campaign
resumes a step behind, and because the generators are saved the blow that was just struck
lands the same way when it is struck again.

## Where It Is Kept

One key in `localStorage`. It is synchronous, which matters because a write triggered by
the page being hidden has to finish before the page goes, and a campaign is expected to fit
well inside what it allows.

**A write that fails does not stop the game.** Storage can be full, or refused outright in
a private window. The game plays on, and a small line beside the build stamp says the
campaign is not being saved. A player who is losing progress should know while they can
still do something about it, and an error that interrupted play would cost them more than
the failed write did.

## Reading a Save

| What is found | What happens |
|---|---|
| Nothing | a new campaign begins |
| A save of the current version | the campaign resumes |
| A save of an earlier version | it is migrated, one version at a time, then resumes |
| A save that cannot be read, or from a later version | it is moved aside under its own key, a new campaign begins, and the player is told |

**Migrations run in a chain**, each taking a save from one version to the next, so a
save several versions old walks up to the present without any step knowing about more
than its neighbour.

**A migration fills a new field with what the campaign would have had without it.** A
save from before the purse existed opens with an empty purse, and one from before chests
existed opens with no chest opened. The save had none to open, so nothing is lost. An
enemy already placed when enemies began carrying loot takes the table its roster entry
names today, so a warband standing in an old save drops what a new one would. An item
from before rarity is common.

**A migration also takes away what the game no longer has.** When accuracy, defence and
Perception were retired, a save still carrying them drops them: a weapon loses its
accuracy, every combatant loses its Perception, and a shield's defence is replaced by the
armour its own file gives that shield today, so a shield already owned turns blows as a
newly found one would.

A save from a later version is what an old cached build meets after a newer build has
already run. Loading it would discard what it does not understand, so it is set aside
exactly as a broken one is.

## Beginning Again

A single save means beginning again replaces it, so it is a deliberate act. The party
screen carries a **New campaign** control, which asks for confirmation before anything
happens. Confirming writes a new campaign over the old one.

**A wiped party is offered the same thing.** With every character down there is nothing
left to play: the town and the fresh party that would go after them do not exist yet. The
defeat banner therefore carries *Begin again* in place of *Onward*. Without it a saved wipe
would be a permanent dead end, resumed every time the game was opened.

## Decisions & Alternatives

| Decision | Chosen | Alternatives Considered | Rationale |
|---|---|---|---|
| When to write | A second after a change, and at once when the page is hidden | On every action; at intervals; only when the page closes | Writing on every action stutters on a phone. An interval writes when nothing changed and misses what did. Relying on closing alone fails when a phone kills a background page without any warning. |
| A fight in progress | Saved whole, resuming on the same turn | Not saved, returning to the moment before the fight; restarting the fight from its opening | Reopening has to be resuming, and a short session is exactly the one that gets interrupted mid-fight. Rewinding to before a fight would also make closing the tab the way out of a fight going badly. |
| Generators | Saved with the state | Reseeded on load | A reseeded generator gives every reload new dice, which turns the tab's close button into a way to re-roll a bad result. |
| The plan | Saved whole | Regenerated from the seed | A later build may generate plans differently, and the plan must keep agreeing with the floors already saved. |
| Where a save lives | `localStorage`, one key | IndexedDB; a server | The write on hiding has to finish before the page goes, and IndexedDB is asynchronous. A server is a non-goal. If a campaign outgrows it, moving is a migration rather than a redesign. |
| A failed write | Keep playing, and say so quietly | Stop the game with an error; say nothing | An error costs the player more than the failed write. Saying nothing means they find out only when the progress is gone. |
| An unreadable save | Set aside under its own key, never overwritten | Overwriting it with a new campaign; refusing to start | Overwriting makes a recoverable bug permanent. Refusing to start leaves the game unplayable over one bad value. |
| Beginning again | A confirmed control on the party screen, and on the defeat banner | Clearing browser data by hand; a title screen | Without a control a wipe is permanent. A title screen is a whole screen in front of a game whose promise is that it resumes where it was. |

## Open Questions & Future Decisions

### Resolved

1. ✅ **The game saves itself**, a second after a change and at once when the page is hidden.
2. ✅ **A fight in progress is saved whole**, and resumes on the same turn.
3. ✅ **Generators are saved**, so a reload replays the same dice.
4. ✅ **The plan is saved whole** rather than regenerated from its seed.
5. ✅ **A save that cannot be read is set aside**, never overwritten.
6. ✅ **Beginning again is a confirmed act**, offered on the party screen and on the defeat banner.
7. ✅ **Testing mode saves nothing and begins with one of everything**; it is switched from the party screen, and switching begins a new campaign.

### Deferred

1. **Export and import.** A browser save is device-local and losable, and the HLD names export and import as the mitigation. Nothing offers them yet.
2. **Save size.** Every floor is kept for the life of a campaign. Whether a long campaign outgrows `localStorage` is unmeasured; the failed-write line is what would reveal it.
3. **Recovering a set-aside save.** A save moved aside is kept, but nothing in the game offers it back.

## References

- `docs/high-level-design.md` — one party, one save, and the resume-where-you-left-off goal.
- `docs/intent/exploration/exploration-design.md` — what exploration saves, and the floors it holds.
- `docs/intent/party/party-design.md` — the character record and its save.
- `docs/intent/combat/combat-design.md` — the encounter state and what a defeated party is left with.
