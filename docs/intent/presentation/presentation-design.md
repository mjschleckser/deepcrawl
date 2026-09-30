---
parent: high-level-design
prefix: PRESENT
---

# Presentation

## Context and Design Philosophy

Presentation draws simulation state and turns input into simulation actions. It holds
no game state of its own: every pixel on screen is a function of what the simulation
currently says, and the only way anything changes is that an action was performed.

Three principles shape the design.

**Presentation remembers only what it was told once.** Every drawing is a function of
what the simulation currently says. The single exception is a record of events already
reported: a resolved action returns what happened once and never again, and since
nothing animates, a fight would otherwise be perceived only as the state that came out
the other side. Keeping that record is not holding game state — the simulation stays
the only authority on what is true — but it is the one place the renderer remembers
rather than reads.

**Two views, one truth.** The first-person view and the automap show the same party
standing on the same tile facing the same way. They are separate drawings of one
state, never two models that must be kept in step, so they cannot drift apart.

**Nothing is real-time, so nothing redraws on a clock.** The world advances only when
the player acts. A renderer looping at sixty frames a second would burn a phone
battery redrawing an unchanged corridor. Presentation redraws when an action changes
the state, and otherwise does nothing at all.

**The simulation cannot tell who is playing.** Keyboard and touch resolve to the same
action vocabulary before anything reaches the simulation. No code below this layer
ever branches on the input device.

## What This Segment Owns

The boundary with exploration is worth stating plainly, because it is the one most
likely to blur.

| | Owned by exploration | Owned by presentation |
|---|---|---|
| Automap | which tiles, edges, traps, and enemies may be shown | how they are drawn, where the widget sits, how it expands |
| First-person view | what stands ahead, to what depth, at what light | the perspective, the geometry, the colours |
| Input | the action vocabulary and both of its paths | reading the keyboard, hit-testing taps, drawing the controls |

Exploration answers *what may be seen*. Presentation answers *what it looks like*.
Anything that would survive a change of renderer belongs on the left.

## Scene Structure

One PixiJS application, three layers, drawn in order:

```
stage
├── viewLayer    the first-person corridor, filling the screen
├── mapLayer     the automap widget, a corner overlay, expandable
└── hudLayer     prompts and touch controls
```

Each layer is rebuilt from state by its own draw function. No layer keeps a retained
model of what it drew last; a redraw clears and re-emits.

**Every drawing names every layer.** A layer with nothing to show is given an empty
drawing rather than left out, because a layer that is merely omitted is a layer nobody
clears — and what it drew last stays on the screen. Leaving a layer out of a drawing is
the one way this design can leak, so it is not a thing a drawing is allowed to do. At the sizes involved — a
few dozen polygons for the corridor, a few hundred cells for a map — rebuilding is
cheaper to reason about than diffing, and it removes an entire class of bug where the
screen disagrees with the state because an update was missed.

## The First-Person View

The corridor is drawn as a series of **depth frames**: nested rectangles receding
toward a vanishing point at the centre of the screen. Frame 0 is the screen edge;
each subsequent frame is the previous one scaled toward the centre by a fixed ratio.
The band between two consecutive frames is where one tile's worth of wall, floor, and
ceiling is drawn.

```
┌─────────────────────────────┐  frame 0  — the tile the party stands on
│ ╔═════════════════════════╗ │
│ ║  ┌───────────────────┐  ║ │  frame 1
│ ║  │  ╔═════════════╗  │  ║ │  frame 2
│ ║  │  ║             ║  │  ║ │  frame 3 — a wall blocks here
│ ║  │  ║             ║  │  ║ │
│ ║  │  ╚═════════════╝  │  ║ │
│ ║  └───────────────────┘  ║ │
│ ╚═════════════════════════╝ │
└─────────────────────────────┘
```

For each depth the simulation reports, the view draws the floor and ceiling bands,
then a left wall panel where the tile is walled to the left, a right panel where it is
walled to the right, and — where the way ahead is blocked — a flat panel closing off
the corridor at that frame.

**Drawn far to near.** The deepest frame is emitted first, so nearer geometry paints
over it. Painting in this order removes the need for any depth test: a wall two tiles
away simply cannot obscure one that is adjacent.

**Light is drawn, not just obeyed.** Each depth is tinted by the light level the
simulation resolved for that tile: full colour at `bright`, muted at `dim`, and not
drawn at all at `dark`. The corridor therefore fades into blackness at the edge of the
party's torch, and a guttering torch is something the player watches happen rather
than reads in a status line.

Stairs and pits are markings on the floor within the band for the depth they occupy.

**An enemy in the passage is drawn standing in it**, a figure on the floor of the
depth the simulation reports it at and scaled to that depth's frame like everything
else. It carries the horned head the automap marks it with, so the thing on the map and
the thing down the corridor are recognisably one thing.

**A door is drawn on the frame, not on the floor**, because it is a thing in the way
rather than a thing underfoot. A closed door is a panel of timber across the frame the
corridor stops at, lighter than the stone around it and carrying a handle, so a way on
is never taken for the end of a passage. An open door is drawn as its frame alone, the
corridor visible through it — the doorway the party has already been through, which is
what tells one stretch of passage from another.

## The Automap

A corner widget over the first-person view, drawn from what exploration says may be
shown and nothing else.

- Discovered tiles are cells; discovered edges are strokes along the cell boundary.
- Walls, doors, and secret doors the party has found are distinguished by stroke, and
  a door shows whether it stands open: closed, it bars the edge; open, it leaves the
  gap the party walked through between its two posts.
- Known traps carry a mark; stairs and pits carry their own.
- The party is a triangle pointing the way it faces — absent entirely when the party
  stands in the dark, while the rest of the map stays drawn.
- Enemies appear only where exploration reports them, which is only where the party
  can presently see them, and are drawn as a creature mark rather than a dot, so one is
  not read as a trap or as the party. Every enemy shares that mark; telling a goblin
  from a mage on the map is authoring nobody has done.

Tapping or pressing the map key expands the widget to fill the screen; the same input
collapses it. Expanded, it is the same drawing at a larger scale — not a different
map with different rules.

## Input

A single handler resolves every event to an action before anything else happens:

```
keydown ──▶ actionForKey(key) ──┐
                                ├──▶ perform(state, action) ──▶ redraw
pointerdown ─▶ hit-test ────────┘
              actionForTouch(region)
```

Tap regions overlay the first-person view and are defined in fractions of the
viewport, not pixels, so they hold their proportions on any screen:

```
┌─────────────────────────────────┐
│ ◀    ┌───────────────┐    ▶  ┌─┐│ ← automap widget
│ turn │  step forward │ turn  │▓││
│ left │               │ right └─┘│
│      ├───────────────┤          │
│      │   step back   │          │
│      └───────────────┘          │
│  ┌────┬────┬────┬────┬────┐     │
│  │part│pack│spel│srch│ use│     │ ← party action bar
│  └────┴────┴────┴────┴────┘     │
└─────────────────────────────────┘
```

An unrecognised key or a tap outside every region resolves to nothing and is
discarded, rather than being guessed at.

### Controls are drawn, not implied

Every region that can be tapped is visibly drawn. A player on a phone cannot discover
an invisible control, and the project's first target user is holding one — a region
that exists only in the hit-test is a region only a keyboard player benefits from.

Each control is a bordered panel with a label, and no control is smaller than a
thumb: there is a floor on how small a tap target may be drawn, in real pixels rather
than a fraction, because a thumb does not shrink with the viewport.

**A label names the thing, not the key.** `Descend` with a small `Enter` beside it,
never `[Enter] Descend` — the second tells a phone player to press a key they do not
have. Keyboard hints are secondary text on the same control, so one drawing serves
both players and neither is told to use the other's device.

Every hit region is computed in the plan alongside the drawing it belongs to, so the
thing drawn and the thing tapped cannot drift apart. The renderer hit-tests the plan;
it never registers handlers of its own.

Controls come in two kinds, and the difference is how much of the view they cover.

A **navigation zone** — step forward, turn either way — is a large area of the screen,
and a panel that size is a panel large enough to hide the corridor. The corridor is the
game, so a zone draws only its name; its outline appears under the finger and goes when
the finger lifts. The player learns where the zones are by using them, and then gets
their dungeon back.

A **button** — the map, the pack, a spell, a search, an option in a fight — is small and
discrete, and covers almost nothing. Buttons keep their panel and their frame, because
a button that is only a word is hard to read as something you may press, and hiding
almost nothing buys almost nothing.

Which kind a control is belongs in the plan rather than being worked out while drawing,
so the rule lives in one place and can be checked.

## Combat

A fight is drawn over the corridor rather than in place of it. The party is still
standing where it was standing, and seeing the passage they were caught in is part of
knowing how badly this is going. The first-person view stays; the combat layer sits on
top of it.

### What is drawn

```
┌───────────────────────────────────────────────────────────────────┐
│                  ╔═════════════════════╗                          │ ← the corridor,
│  ┌──┐▸▸▸▸▸▸▸▸▹▹▹▹▹▹▹▹      ┌──┐▸▸▸▸▸▸▸▸▸▸▸▸▸▸▸▸▸▸▸▸▸▸▸▸           │   still there
│  │()│ Goblin      Lv 6     │()│ Bram         Lv 41                │
│  └──┘ 9/9                  └──┘ 14/20                             │
│  ┌──┐▸▸▸▸▹▹▹▹▹▹▹▹▹▹▹▹      ┌──┐▸▸▸▸▸▸▸▸▸▸▸▸▹▹▹▹▹▹▹▹▹▹▹▹           │
│  │()│ Goblin      Lv 6     │()│ Rook         Lv 38                │
│  └──┘ 4/9                  └──┘ 20/20                             │
│  ┌──┐░░░░░░░░░░░░░░░░      ┌──┐▸▸▸▸▸▸▸▸▸▸▸▸▸▸▸▸▸▸▸▸▹▹▹▹           │
│  │()│ Goblin     dead      │()│ Isolde       Lv 33                │
│  └──┘ 0/9                  └──┘ 20/20                             │
│         ↑ enemies, left            ↑ the party, right             │
├───────────────────────────────────────────────────────────────────┤
│ Rook grazes Goblin for 3.                                         │
│ Goblin hits Bram for 6.                                           │ ← the log
│ Tam crits Goblin for 14. Goblin falls.                            │
├───────────────────────────────────────────────────────────────────┤
│ Bram is ready to act!                                             │ ← who is up
│  [1] Attack   [2] Magic   [3] Inventory   [4] Flee                │ ← the controls
└───────────────────────────────────────────────────────────────────┘
```

**Enemies on the left, the party on the right**, each side a single column of
combatants however many there are. There are no ranks to draw, because there are none
in the fight: a column is the honest shape of a side whose members are all equally
reachable, and it reads the same whether a side holds two or twelve.

**Each column is centred vertically in the region, on its own count.** Two goblins
facing five characters sit level with the middle of the party rather than stacked
against the ceiling with a drop of empty panel beneath them. The two sides are facing
one another, and a formation pinned to the top edge reads as a list that ran out rather
than as a side that is outnumbered.

The centring is settled when the encounter begins and never moves again: a side keeps
its count all fight, because the fallen keep their places. So a column cannot creep
upward as the fight thins it, which is the same promise every other region makes.

**A side too big for the region starts at its top edge rather than above it.** Centring
a column taller than the room it has would push its first combatants off the top of the
panel, so the centring gives way and the column is squeezed to fit, exactly as a crowded
side is handled now.

**A combatant is an icon and three stacked bars.** The icon is a portrait, at the left
of their own side's column and the same size for everybody. The bars sit to its right,
one above another, each answering one question:

| Bar | Holds | Answers |
|---|---|---|
| Top | Readiness, filling left to right | *when do they act* |
| Middle | Name, total level, and condition when it is not `OK` | *who is this* |
| Bottom | Hit points, and any other resource the fight spends | *how are they doing* |

The order is not arbitrary. The top bar is the one that changes every frame and the one
the whole fight is read off, so it is the one the eye finds first; the bottom bar
changes only when somebody is hit, and the middle bar barely changes at all.

**Readiness is one continuous fill**, sliding to the right with a brighter edge leading
it, and glowing when it reaches the end. It is drawn as one length rather than as a
count of marks: a length is compared between two bars at a glance and moves smoothly
between frames, where marks appearing one at a time turn a smooth thing into a
stuttering one and invite counting nobody wants to do.

### Nothing moves that the player is not moving

**The panel is one fixed frame of fixed regions.** From the top: the two columns of
combatants, then the log, then the line that names who is up, then the controls along
the bottom. Every region keeps its place and its size for the whole encounter, and the
panel keeps its height whatever is in it.

This is the whole point of the arrangement. A prompt that appears when somebody comes
ready would otherwise push the columns up by the height of a line of text, exactly when
the player is looking at them to decide; a log that grew would push them again; a row of
targets taller than a row of options would push everything a third time. A fight is read
under time pressure, and a screen that rearranges itself as it is read is a screen that
has to be re-read from scratch. So the regions are laid out once, from a size the
encounter fixes when it begins, and what changes inside them changes within its own
bounds.

**The line that names who is up is always there**, empty when nobody is waiting. It
costs one line of height and buys a formation that never jumps.

**The controls reserve the room a full row of targets needs**, so choosing *Attack* and
being asked *at whom* does not move the panel under the thumb about to press it.

### The log is a window, and it keeps its place

The log is a box of its own with a fixed height, below the combatants and above the
controls, holding the last few lines of the fight and no more.

**It can be scrolled back.** The fight moves quickly and a player who looks away for a
turn should be able to find what they missed. A scrollbar along its right edge says how
much there is and where in it they are; the wheel moves it, and pressing the track above
or below the thumb pages back and forward.

**It follows the fight until the player takes it back.** New lines keep the view at the
bottom, so a player who is not scrolling always sees the newest line; once they scroll
up, it stays where they put it until they return to the bottom, because a log that
yanked itself back to the newest line mid-read would be unreadable exactly when it was
wanted.

Somebody who is down keeps their place in the column, drawn spent and dimmed. The shape
of a side that has lost its middle is information, and a column that closed its gaps
would keep moving under the player's eye as the fight went on.

Where every part of every combatant sits is decided in the plan, like everything else,
rather than worked out while drawing.

### Readiness, and the fight that plays

**The top bar is readiness**, filled from the left with arrowheads to the share the
simulation reports, over a subdued ground. A bar filled end to end is a combatant ready
to act. The value is the simulation's and nothing else's. A fight is legible from those
bars alone — who is about to act, who is a long way off, which side is quicker — which
is why they are the widest thing on a combatant and the topmost.

**The bottom bar is hit points**, filled to the share of their maximum a combatant has
left and coloured by how much that is: healthy above half, wounded above a quarter,
critical at or below it. The numbers stay on it. A resource that decides what a
combatant can do belongs here beside them, so slots will join them when something
spends slots.

**The middle bar is who they are**: name, total level, and — when it is anything but
`OK` — their condition, which is the whole of what a status is until status effects
exist. It is the bar that changes least, which is why it is neither the one the eye
lands on first nor the one it checks under pressure. Both sides carry both numbers,
because both sides are the same kind of thing.

**Bars fill in front of the player.** Every combatant opens on the share the fight
rolled for them, and it rises over real time, a beat of the fight's time per fixed
span, so that who is catching up on whom is something watched rather than something
that has already happened by the time the screen is drawn. Between beats the fill is
drawn partway, as the simulation reports it, so it glides rather than steps.

**How long a beat takes on screen is one number, and it is set slow enough to read.**
It is the only thing deciding how fast a fight appears to move, and it applies to every
bar alike — a quick combatant and a slow one are drawn at the same pace and differ only
in how far each beat carries them. It is set well below the rate at which the arithmetic
could be shown, because the bars are what the fight is read off, and a race that resolves
before the player has found the two bars in it is a race they were told the result of
rather than shown. It changes nothing about what the fight resolves: the beats are the
simulation's and come out the same at any pace.

**The combatant acting is highlighted while they act**, on both sides alike. Something
has to say *this one, now*, or a fight resolved one combatant at a time reads as a log
that writes itself.

**Actions play out a beat at a time.** Each one lands, its actor highlighted, and a
short pause follows before the next. Without the pause a fight would resolve between two
frames and arrive as a wall of text nobody watched happen.

**An attack shakes its attacker**, a quick vertical judder of their icon and bars
together that decays over the beat. Nothing else in the fight moves, so a blow that
lands is otherwise a number changing somewhere on a panel of numbers — easy to miss
entirely, and easier still to miss *whose* it was. What moves is whoever swung.

Filling bars and that pause are the things in this segment that need a clock. **The
ticker is stopped except while a fight is playing** — bars filling, a beat to wait, a
card still shaking — and stops the moment the fight is waiting on the player instead. A stopped ticker is a
rule about not redrawing an unchanged screen, not a vow of poverty; a screen that is
changing on its own is precisely the case it was never meant to cover.

Two clocks are in play and they are not the same one. The **fight's time** is the
simulation's, counts beats, and never moves while a decision is pending or while
anybody stands ready. The player's clock, measured in seconds, sets only the pace: how
long a beat of filling takes on screen, and the **beat between actions**. Neither
changes what the simulation resolves; a fight played at any pace comes out the same.

### Being told whose turn it is

While a character is waiting to be told what to do, the panel says so in as many words:
**"Bram is ready to act!"**. It names the character rather than asking a question,
because the question is answered by the buttons underneath it and the thing the player
actually needs to know is which of five combatants the next press belongs to.

**While nothing is waiting on the player, that line is not there at all.** Bars filling
and enemies swinging are not a prompt, and a prompt left standing over them would be
inviting a press that nothing is listening for.

### Announcing an ambush

An encounter one side walked into unready opens with a card above the fight saying
**Ambush!**. Every fight opens with its bars at odds — they are rolled — but an ambushed
one opens with one side's bars visibly far along and the other's wherever they fell.

That head start is otherwise unexplained. A player who sees three goblins act before
anybody on their side moves has been given the rule and no way to read it, and the
reasonable conclusion — that the fight is broken — is worse than the rule itself. The
card is the smallest thing that says *this is why*.

**The card stays up for exactly as long as the ambush lasts**: until every combatant the
ambush favoured has acted, or has fallen before they could. The fight plays beneath it
as it would without it, so the card is what explains the ambush while it is happening
rather than a pause before it — and it goes when the last of that head start is spent,
which is the moment the fight becomes an ordinary one.

### The log carries the fight

An action resolves in a single frame, and the only motion it leaves is its attacker's
judder, so without a record the player would see only the state that came out the other
side and never learn what happened in between.

The log is therefore not decoration. It is the fight, as perceived: one line per
resolved action, naming who acted, what band the attack fell in, what it cost, and
what it killed. It is built from the event log a resolved action already returns, so the
renderer invents nothing and reports only what the simulation actually did.

### Choosing actions

**One character is asked at a time, and only when their bar fills.** There is no round
to compose. The fight stops at whoever came ready, that character acts, the log takes a
line, and the fight resumes. Nobody is asked in advance and nothing is held pending, so
the panel is only ever offering one combatant's options.

**Every character is offered the same four things, in the same order, every turn:**

| Option | What it does | Unavailable when |
|---|---|---|
| **Attack** | swing what this combatant carries | they carry no attack, or nothing is standing to swing at |
| **Magic** | cast from what this character knows | they know no spell they can still pay for |
| **Inventory** | use something from the party's pack | the pack holds nothing usable in a fight |
| **Flee** | take the whole party out of the encounter | escape is certain to fail — something present forbids it, or the party cannot outrun what is chasing it |

**An option that cannot be taken is drawn anyway, greyed and inert.** It keeps its
place, keeps its number, and does nothing at all when pressed — no message, no line in
the log, no sound.

**A greyed option says why, on the button, in small text under its name.** *No spells*
under a greyed Magic; *Too slow to escape* under a greyed Flee. Grey alone says only
*not now*, which leaves the player to guess whether they have misunderstood the rule,
missed a step, or found a bug — and a fight is the worst place to be guessing. The
reason is the shortest sentence that ends the question.

It goes on the button rather than on the prompt line because the button is where the
player is already looking, and because a line that appeared only when something was
unavailable would be one more thing moving on a panel whose whole discipline is that
nothing moves. On the button the text is simply there, the same size and in the same
place every turn, changing only its words.

The reason takes the slot the key hint occupies on an available control. A greyed
control's key does nothing, so the number is worth less there than the sentence is.

**Magic and Inventory are greyed in every fight today**, there being no spell a
character knows and no pack to take an item from. They are drawn regardless, because
the row's shape is not a function of which systems happen to exist yet, and they will
light up when those systems arrive without the row being redesigned around them.

This is the whole reason for a fixed four. The alternative — offering only what is
legal — gives a menu that is a different shape on every turn: *Flee* moves under the
thumb when a goblin that forbids escape falls, and the key that attacked last turn casts
this one. A player in a fight is reaching for a position they have learned, and a menu
that rearranges itself is a menu that has to be re-read every time it is used. Four
fixed slots cost some grey and buy a row that can be pressed without being read.

It also makes the menu say what the game contains. A greyed *Magic* tells a player that
casting is a thing characters do and that this one cannot do it now, which is a rule
learned by looking; an absent *Magic* tells them nothing at all, and an absent option
that reappears later reads as a bug.

**The rule is uniform across all four.** Attack greys for an unarmed character exactly
as Magic greys for a mage out of slots. A menu that is fixed except sometimes is not
fixed, and the exception is what the player would have to learn instead.

**A character with nothing at all to do is given one thing: Pass turn.** When all four
options are unavailable, a single control is drawn across the row, over the four greyed
buttons rather than in place of them, and it is the only thing that can be pressed.
Taking it spends the turn and resolves nothing.

The four stay visible underneath because they are the explanation: the player can read
that Attack, Magic, Inventory and Flee were each considered and each refused, and why.
A row replaced by one button would say only that something had gone wrong. The overlay
says *here is everything you could have done, and here is the only thing left*.

It is a press like every other turn, which is the point of drawing it at all. The fight
could pass this character automatically and save the player a tap, but that tap is the
one moment the rule *no turn is taken unattended* would have an exception, and the
exception would land on the rarest and most confusing turn in the game — the one where
the player is already wondering what happened.

**Numbers are fixed to slots, not to what is available.** Attack is always `1` and Flee
is always `4`, whether or not the two between them can be pressed, so a number key means
the same thing in every fight.

**An action needing a target asks for one from the legal targets only**, so an illegal
choice cannot be expressed rather than being refused after the fact. Targets replace the
four while the question stands, and the room for them is already reserved.

**Backing out returns to the open choice**, which is as far back as there is to go. A
turn resolves the instant it is taken, so there is no earlier decision left standing to
reconsider: what `Escape` undoes is a target half-chosen. On the open choice itself it
does nothing, and the control stays drawn rather than vanishing — the row reserves its
place either way, and a control that came and went would move the four above it.

### Input in a fight

The exploration vocabulary does not apply while a fight is on: there is nowhere to walk.
Combat has its own, and like the other it resolves keyboard and touch to one set of
actions that carry no trace of where they came from.

| Action | Keyboard | Touch |
|---|---|---|
| Pick the nth option | `1`–`9` | tap the option |
| Confirm | `Enter` | tap the confirm control |
| Back | `Escape` | tap the back control |

Every option on offer is a drawn control with its own hit region, sized like any
other. A fight a player can watch but not act in is worse than no fight at all, and
that is what an option with no tap target amounts to on a phone.

### Ending

An outcome is drawn as a banner over the fight: what happened, and what it was worth.
The player dismisses it, and combat gives way to the corridor again — or, on a defeat,
to whatever the campaign does with a party that did not come back.

## Prompts

Some actions ask before they resolve — taking a staircase, for one. When the
simulation returns a pending confirmation, the HUD layer draws a prompt and suspends
the normal input mapping until it is answered; the answer goes back to the simulation,
and the normal mapping resumes.

A prompt is drawn from the pending confirmation the simulation is holding, so a prompt
can never be shown for a confirmation that is not actually pending.

## The Build Stamp

The version of the build being played is drawn small and dim in the bottom-left
corner, over everything else.

It exists to answer one question that cannot otherwise be answered from inside the
game: *is what I am looking at the build I think it is?* A player reporting that a fix
did not work and a player looking at a cached copy of yesterday's build write the same
sentence, and with nothing on the screen to compare there is no way to tell the two
apart. This is a progressive web app, and an installed one goes on serving what it
already has until it decides otherwise, so the second case is common rather than
exotic.

The version reads `MAJOR.MINOR.PATCH+SHA`. Major and minor are authored; **the patch is
the number of commits on the branch**, so every commit ships a version that is both new
and correctly ordered without anyone remembering to raise it, and the short commit hash
after it names the exact source. All of it is fixed when the app is built and read from
a constant — nothing works out a version while drawing.

The stamp never sits on top of a control. Where the controls reach that corner it moves
above them, because it is information for the player who goes looking for it and
furniture for everyone else.

## Redraw Discipline

The Pixi ticker is stopped. Presentation renders once at startup and thereafter only
when something has changed:

- an action was performed
- a prompt was answered
- the map was expanded or collapsed
- the window was resized

Resizing recomputes the depth frames and the tap regions from the new viewport, then
redraws. Nothing else in the segment is size-dependent.

### One layout, two screens

The layout is designed against a phone held upright, and every position is a fraction
of the viewport — so the same arrangement holds on any screen. Fractions alone are not
enough, though, and the two ways they fail pull in opposite directions.

**Things that must not shrink** — a control under a thumb, a line of text — are held to
a floor in real pixels. That is what `MIN_TAP_PX` is for.

**Things that must not stretch** — a row of buttons, a column of text, a combatant's
bars — are held to a ceiling. A button spanning a third of a desktop window
is not a bigger button, it is a worse one, and a line of text the full width of a
monitor is not easier to read. Content therefore lays out inside a **centred column**
of bounded width, with the corridor showing either side of it.

Between the floor and the ceiling everything is drawn at a **scale** derived from the
viewport:

```
scale = clamp(min(width / 390, height / 780), 1, 2)
```

A phone gets 1 and the layout it was designed for. A desktop window gets up to 2, so
cards, controls and text grow to suit the screen instead of huddling at phone size in
the middle of it. It is capped at 2 because past that the game stops looking like a
bigger version of itself and starts looking like a zoomed screenshot.

The scale belongs to the **plan**, not to the drawing. Every position and size is
decided before anything is emitted, which is the same rule the combatants already
follow — an adapter that recomputed scale would be a second place where layout lived.

### The viewport is what can be seen

The drawing surface is sized to the **visible** viewport, not the layout one. On a
phone browser these differ: the layout viewport is the height the page would have with
the address bar hidden, so a surface sized to it puts its bottom edge permanently
behind the chrome. Installed as an app there is no chrome and the two agree, which is
exactly why the fault hides from anyone testing only the installed version.

The visible height is read from the browser's own report of it and followed as it
changes, because the chrome slides in and out as the player scrolls or taps. Device
safe areas — a notch, a home indicator — are excluded on the same principle: they are
screen the player can see but the game cannot have.

## The Starter Floor

Dungeon generation does not exist yet, so the app boots onto a hand-authored floor
held as data — a small layout with corridors, a room, a door, a secret door, and a
staircase, enough to exercise every drawing path. It is scaffolding with a known
expiry: when generation lands, the starter floor is deleted rather than migrated.

## Decisions & Alternatives

| Decision | Chosen | Alternatives Considered | Rationale |
|---|---|---|---|
| Wide screens | A centred column of bounded width, at a scale that grows to twice the phone layout | Pure fractions of the viewport; a fixed pixel layout centred with letterboxing | Pure fractions stretch a button across a third of a monitor and a text column across all of it, neither of which is more readable for being larger. A fixed layout leaves a desktop player with a phone-sized game marooned in the middle of the screen. Bounding the column and scaling within it gives both screens a layout built for them. |
| Where the scale lives | On the plan | Computed in the Pixi adapter as it draws | Layout lives in one place. An adapter that worked out its own scale would be a second place to look when something is the wrong size, and the plans already own every other position. |
| Redraw trigger | On state change only; the ticker is stopped | A conventional per-frame render loop | The world advances only when the player acts, so a render loop would redraw an unchanged corridor sixty times a second. On the phone this game is built for, that is battery spent on nothing. |
| Absent layers | Every drawing names every layer, empty where there is nothing to show | Listing only the layers with something in them | A layer merely left out of a drawing is a layer nobody clears, so what it drew last stays on screen. That is the one way this design leaks, so it is made impossible rather than remembered. |
| Layer updates | Clear and rebuild the changed layer | Diffing against a retained scene model | A corridor is a few dozen polygons and a map a few hundred cells. Rebuilding removes the class of bug where the screen and the state disagree because an update was missed. |
| Corridor geometry | Nested depth frames scaled toward a vanishing point | Raycasting into a texture-mapped wall; pre-rendered art per configuration | Frames are a handful of polygons per depth, need no art pipeline, and keep the view honestly 2D. Raycasting would contradict the project's non-goal and cost mobile performance for a view that only ever faces four directions. |
| Draw order | Far to near | Near to far with depth testing | Painting far first makes occlusion automatic; there is no depth buffer to manage and no way for distant geometry to overwrite near geometry. |
| Light in the view | Tint per depth, fading to black at the torch edge | Showing light only as a status readout | The player should watch the dark close in rather than read a number. It also makes the light rules legible without explanation. |
| Surface size | The visible viewport, chrome and safe areas excluded | The layout viewport; `100vh` | On a phone browser the layout viewport is the height the page would have with the address bar hidden, so sizing to it puts the bottom of the game behind the chrome. Installed as an app the two agree, which is how the fault hides. |
| Tap regions | Fractions of the viewport, with a pixel floor on size | Fractions alone; fixed pixel rectangles | The same layout has to work on a phone and a desktop window, so fractions hold the proportions — but a thumb does not shrink with the viewport, so the floor is in real pixels. |
| Drawing the controls | Every tappable region is drawn | Leaving the view uncluttered and the regions invisible | A control nobody can see is a control only a keyboard player has, and the first target user is holding a phone. |
| Navigation zones | The label alone, outlined only while pressed | Always framed | A panel the size of a movement zone is a panel big enough to hide the corridor, and the corridor is the game. The outline under the finger teaches where the zones are without keeping the dungeon covered. |
| Stepping back | A zone of its own, under the forward zone | Reaching it by turning about, stepping, and turning back | A withdrawal that needs three taps is not a withdrawal. Splitting the centre of the view gives the verb a home without taking a thumb's width from any other control. |
| A door in the view | Drawn on the frame the corridor stops at, with an open one drawn as its frame alone | Drawn as a floor marking, like stairs and pits | A door is in the way rather than underfoot, and drawn on the floor it would say nothing about whether the corridor goes on. Drawing the open ones too costs a frame and buys the landmark a player navigates by. |
| Enemies in the corridor | A figure at the depth the report puts it, sharing the map mark's horned head | Drawing none, leaving the map to show them; a card or banner announcing one | A monster the map shows and the corridor does not makes the player watch the corner of the screen instead of the dungeon. Sharing the head is what makes the mark and the figure read as the same creature. |
| The enemy mark | One creature mark for every enemy | A dot; a different mark per roster entry | A dot beside the trap mark and the party triangle is three dots. Per-enemy marks are authoring that the roster does not yet justify, and they would leak what the party has not fought. |
| Buttons | Keep their panel and frame | Bare labels, like the zones | A button covers almost nothing, so hiding it buys almost nothing — and a button that is only a word is hard to read as something you may press. |
| Which kind a control is | Carried in the plan | Inferred from its name while drawing | The rule then lives in one place and can be checked, rather than being re-derived by whatever happens to be drawing. |
| Turning about | A key, but no control of its own | A movement zone of its own, beside the step and turn zones | Two taps of a turn the player already uses reach it. A control earns its place by being the only way to do something or by being worth the room; this is neither. |
| Labels | Name the action, with any key hint as secondary text | Naming the key that triggers it | "[Enter] Descend" instructs a phone player to press a key they do not have. One drawing has to serve both without telling either to use the other's device. |
| Hit regions | Computed in the plan, beside the drawing they belong to | Registered as handlers on the drawn objects | Keeping them together means what is drawn and what is tapped cannot drift apart, and it keeps hit-testing in the pure layer where it can be tested. |
| Combat over the corridor | Drawn on top of the first-person view, which stays visible | Replacing the view with a combat screen | The party is still standing in the passage they were caught in, and seeing it is part of knowing how bad this is. A separate screen would also throw away the light and the place. |
| How a side is arranged | Enemies in one column on the left, the party in one on the right | Two ranks a side, as the rows once were; one combined list ordered by readiness | A column is the honest shape of a side with no positions in it, and it holds two combatants or twelve without changing shape. Facing columns keep *us* and *them* answerable without reading a single name. A list ordered by readiness would reorder itself under the player's eye on every beat, which is the one thing a display being read under pressure must not do. |
| What a combatant is drawn as | A portrait, then three stacked bars: readiness, identity, hit points | A single card whose fill is readiness; a card with a bar along its foot | Three bars put the three questions a player asks — when do they act, who is this, how are they doing — in three fixed places, so each is found by position rather than by reading. A card carrying everything at once makes readiness compete with the name and the numbers for the same space. |
| How readiness is drawn | One continuous fill with a brighter leading edge, glowing at full | A row of arrowheads that appear one at a time; a numbered initiative list; an order-of-play queue along one edge | A length is compared between two bars at a glance and slides smoothly as the bar fills. Marks appearing one at a time stutter, and quantise a value that is continuous underneath. A queue would be recomputed and redrawn on every action and still would not show how close anybody is. |
| The panel's regions | Fixed: combatants, log, prompt line, controls, each keeping its place and size all encounter | Sizing each region to its content, so the panel grows and shrinks as the fight goes | A fight is read under time pressure. A prompt that pushed the formation up as it appeared, or a row of targets taller than the row of options it replaced, would move what the player is reading at the moment they are reading it. Fixed regions cost some empty space in a small fight and buy a screen that can be read at a glance every time. |
| The log's size | A fixed window of the last few lines, scrollable back through the rest | Growing to fit what has happened; clearing between turns; a full-height transcript | A fixed window keeps the panel still, and scrolling keeps what scrolled off reachable — which matters because a fight plays on while the player looks away. A growing log would move everything below it on every action. |
| Hit points | A bar under each combatant, coloured by the share left, with the numbers on it | The number alone | A column of fractions has to be read one at a time; a column of bars shows how hurt the whole party is in one look, and the colour carries the urgency before the length is even judged. |
| Portraits | An image file per class and per enemy kind, drawn at one size | Shapes drawn in code, as the map's marks are; no portrait at all | A picture is recognised faster than a name is read, which is what makes a column of six scannable. Files mean real art arrives by replacing them rather than by rewriting a draw routine, and one size keeps a column aligned whatever it holds. |
| How bars fill | Over real time from empty, a beat per fixed span, drawn partway between beats | Jumping straight to whoever is next ready | A jump shows the result of the race and never the race, so the player cannot see a quick combatant pulling ahead of a slow one, which is the thing the bars exist to show. |
| The beat between actions | A short pause, with the acting combatant highlighted | Resolving everything down to the next decision at once; animating each action properly | Without a pause the enemies' turns land between two frames and are read afterwards as text, which is the thing the log exists to rescue rather than the thing to build on. Real animation is a larger project and would need the ticker running throughout rather than between actions. |
| The ticker | Stopped, except while a fight is playing rather than waiting on the player | Stopped always, with actions resolved instantly; a conventional render loop | The rule was never about the ticker; it was about not redrawing an unchanged screen sixty times a second. A screen that is changing on its own is the one case it was not written for, and the exception is bounded to a fight that is not waiting on anybody. |
| Announcing an ambush | A card above the fight saying Ambush!, up until every ambusher has acted, with the fight playing beneath it | Colouring the bars that start full; a line in the log; a card held for a fixed span before the fight begins | Bars that start full are the one thing on the screen with no cause visible anywhere, and a player who cannot read them concludes the fight is broken. A card held before the fight explains an ambush nobody has seen yet and is gone by the time the ambushers swing; one that lasts as long as the ambush explains it while it happens. The log is read after the fact, and a colour is a code nobody has been taught. |
| The prompt | Naming who is ready, and absent while nothing waits | Asking what the character will do; a prompt that stays up throughout | The buttons already say what may be done; what the player needs is which of five cards the next press belongs to. A prompt standing over a fight that is playing invites a press nothing is listening for. |
| Showing an attack | A vertical judder on the attacker, decaying over the beat | Moving the attacker toward its target; flashing the one that was hit; a larger animation | Nothing else in the fight moves, so the smallest honest motion is enough, and putting it on the attacker answers *whose blow was that* rather than only *that something happened*. Moving toward a target is a real animation and wants a real animation system. |
| Showing an action | A text log built from the action's own event log | Animating each action; showing only the resulting state | Nothing animates, so an action lands in one frame. Without a record the player sees the aftermath and never learns what happened. The log is the fight as perceived. |
| Unavailable options | Drawn in place, greyed and inert, from a fixed four, each carrying its reason | Offered only when legal, so the row changes shape each turn; offered and refused when chosen; greyed with no reason given | A row that is a different shape every turn cannot be pressed from memory: Flee moves under the thumb when the goblin forbidding escape falls, and the key that attacked last turn casts this one. Fixed slots cost some grey and buy a row a player can reach for without reading. Grey alone says only *not now*, leaving the player to guess between a rule they misunderstood and a bug; the reason under the name ends that question in four words, and sits on the button because a line that appeared only sometimes would move the panel. Offering an option and then refusing it teaches the rule by failure, which in a fight is expensive. |
| A turn with no legal action | A Pass turn control drawn over the four greyed options, which must be pressed | Passing the character automatically; replacing the row with one button; leaving the turn pending | Passing automatically would be the only turn in the game taken unattended, and it would land on the rarest and most confusing turn there is. Keeping the four visible underneath makes the overlay an explanation rather than an error: the player reads that each was considered and refused, and why. Replacing the row would say only that something had gone wrong. |
| When Flee greys | Whenever escape is certain to fail, by the rule that resolves an attempt | Only when an enemy forbids escape, leaving a hopeless run to cost a turn; never greying, so every attempt is paid for | A menu that warns about one impossibility and charges a turn to discover the other teaches that greying cannot be trusted. Reading the same rule that resolves the attempt keeps one source of truth, so the button and the outcome can never disagree. The cost is that the party learns something about enemy speed from the button; the reason text says so plainly rather than leaving it to be inferred. |
| Backing out | Returns to the open choice | Stepping back to the previous character's turn | A turn resolves the instant it is taken, so there is no earlier decision still standing to return to. What `Escape` undoes is a target half-chosen. |
| What a turn offers | A fixed four: Attack, Magic, Inventory, Flee | A row built from whatever is legal this turn; a nested menu under one Act button | Four slots in a fixed order can be learned once and pressed thereafter without reading, and they fix the number keys too — Attack is always 1. A menu assembled per turn makes every press a fresh reading. Nesting would cost a press on every turn to save room the panel already reserves. |
| Where a column sits vertically | Centred in the formation region, each side on its own count | Pinned to the top edge; both sides aligned on a shared top | Two goblins facing five characters read as a side that is outnumbered when they sit level with the middle of the party, and as a list that ran out when they hang from the top edge with empty panel beneath. Centring is fixed at the start of the encounter and cannot creep, because the fallen keep their places and a side's count never changes. |
| How fast bars fill on screen | One span per beat, set slow enough that a race can be watched | As fast as the arithmetic allows; a speed the player sets | The bars are what a fight is read off, so a race resolved before the player has found the two bars in it is a result they were told rather than shown. One number, applied to every bar alike, keeps the relative speeds the simulation's and changes nothing it resolves. A player-set speed is a preference screen for a game with no preferences yet. |
| The fallen | Drawn in place, spent and dimmed | Removing them from the column | The shape of a side that has lost its middle is information, and a column that closed its gaps would move everything below the gap while the player was looking at it. |
| The build stamp | Drawn in the corner of the running game, with the commit count as its patch | A version on an about screen; no version at all; a build date | "It does not work" and "you are looking at a cached build" are the same report without it, and a service worker makes the second common. Taking the patch from the commit count means nobody has to remember to raise a number, and it orders correctly by construction. |
| Starter floor | Hand-authored data, deleted when generation lands | Waiting for dungeon generation; generating a floor here | The segment cannot be seen to work without a floor to walk, and building a generator inside the presentation segment would put it in the wrong place permanently. |

## Open Questions & Future Decisions

### Resolved

1. ✅ **Presentation holds no copy of game state**, deriving every drawing from the simulation — except a record of events already reported, which is never reported twice.
2. ✅ **The ticker is stopped outside a fight**; redraws are triggered by change, not by time.
3. ✅ **Layers are cleared and rebuilt** rather than diffed, and every drawing names every layer.
4. ✅ **The corridor is nested depth frames**, drawn far to near, in 2D polygons.
5. ✅ **Light is drawn as a per-depth tint**, fading to black at the edge of sight.
6. ✅ **A door is drawn on the frame the corridor stops at**, closed as a panel with a handle and open as its frame alone.
7. ✅ **An enemy the corridor report names is drawn standing at that depth**, with the same horned head the automap uses.
8. ✅ **Tap regions are viewport fractions**, recomputed on resize, with a pixel floor on how small one may be drawn.
9. ✅ **Every tappable region is drawn**, and every drawn control carries its own hit region in the plan.
10. ✅ **A navigation zone is its label alone**, outlined only while pressed; a button keeps its panel and frame.
11. ✅ **Stepping back is a zone of its own**, beneath the forward zone.
12. ✅ **Turning about has a key but no control**, being two taps of one the player already uses.
13. ✅ **Labels name the action**, with any keyboard hint as secondary text.
14. ✅ **Enemies are a column on the left and the party a column on the right**, each centred vertically on its own count, every position decided in the plan.
15. ✅ **A combatant is a portrait and three stacked bars** — readiness, identity, hit points — and the one acting is highlighted.
16. ✅ **Readiness is one continuous fill** with a leading edge, glowing at full.
17. ✅ **Bars fill over real time from empty**, drawn partway between beats, at one screen pace for every bar alike.
18. ✅ **The bottom bar is hit points**, coloured by the share left; other resources join them when they exist.
19. ✅ **A portrait is an image file**, one per class and per enemy kind.
20. ✅ **The panel's regions are fixed**, so nothing moves that the player is not moving.
21. ✅ **The log is a fixed window with a scrollbar**, following the fight until the player scrolls back.
22. ✅ **Actions play out a beat at a time**, and the ticker runs only while a fight is playing rather than waiting.
23. ✅ **An attack shakes its attacker's card**, which is the only motion in a fight.
24. ✅ **One character is asked at a time**, when their bar fills; backing out returns to the open choice rather than stepping back to anybody.
25. ✅ **Every action is taken by a press**, and nothing in a fight is ever taken unattended.
26. ✅ **A turn offers a fixed four — Attack, Magic, Inventory, Flee — with whatever cannot be taken drawn greyed and inert** in its own place, keeping its number.
27. ✅ **The prompt names who is ready to act**, and is absent while nothing waits on the player.
28. ✅ **An ambush is announced by a card** that stays up until every ambusher has acted, with the fight playing beneath it.
29. ✅ **Prompts are drawn from the simulation's pending confirmation**, never from the renderer's own flag.
30. ✅ **The build's version is drawn in the bottom-left corner**, its patch number the commit count, fixed at build time.
31. ✅ **A hand-authored starter floor** stands in until dungeon generation exists.

### Deferred

1. **Animation in a fight.** An action lands in one frame, and the only motion is the attacker's judder. Real animation — a blow that travels, a spell that reads as a spell — is unbuilt, and would want the ticker running throughout a fight rather than only between actions. The beat, the shake, and the ticker's bounds are settled; everything past them is not.
2. **Art.** Everything is flat-shaded polygons. Textures, sprites for doors and stairs, and any sense of material are unaddressed.
3. **Animation between steps.** A step currently cuts from one position to the next. Whether it should slide, and how that squares with a stopped ticker, is open — an animation is the one thing in this segment that would need time.
4. **The party action bar's contents.** The bar can be drawn, but its panels cannot: `INVENTORY` and `SPELLS` route to an items segment and an ability set that are unbuilt, and `PARTY` has a segment to read but no screen designed for it.
5. **Expanded-map interaction.** Panning and zooming an expanded map, and whether tapping a tile does anything, are unspecified. Auto-travel is already deferred in exploration.
6. **Wide-screen framing.** On a very wide desktop window the corridor frames may want letterboxing rather than stretching; untested.
7. **Accessibility.** Keyboard focus, screen-reader description of the map, and colour-blind-safe stroke distinctions are unaddressed.
8. **Pacing controls.** The beat between actions and the pace bars fill at are fixed lengths chosen for legibility. Whether a player may speed them up or slow them down is unanswered; combat records the same question from its own side.

## References

- `docs/high-level-design.md` — the simulation/presentation split and the two-view rule.
- `docs/intent/exploration/exploration-design.md` — the state this segment draws and the action vocabulary it feeds.
