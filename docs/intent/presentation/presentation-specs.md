# Presentation — EARS Specs

Specs for the presentation segment. Design: `presentation-design.md`.

Colours, frame scale ratios, widget sizes and the exact fractions of the viewport that
make up each tap region are content data, not requirements. These specs fix the
structure and the rules; the numbers stay tunable without rewriting a spec or a test.

## Scene

- [x] **PRESENT-SCENE-001**: The system shall draw three layers in order: the first-person view, the automap, then the HUD.
- [x] **PRESENT-SCENE-002**: The system shall keep the renderer's ticker stopped while nothing is playing out on its own, so that no redraw occurs merely because time has passed.
- [x] **PRESENT-SCENE-011**: While a fight is playing rather than waiting on the player, the system shall run the ticker, and shall stop it as soon as the fight is waiting on the player.
- [x] **PRESENT-SCENE-003**: When an action changes simulation state, the system shall redraw — including a turn, which changes facing without advancing the clock.
- [x] **PRESENT-SCENE-004**: When a prompt is answered, the map is expanded or collapsed, or the window is resized, the system shall redraw.
- [x] **PRESENT-SCENE-005**: If an action changes no simulation state, then the system shall not redraw.
- [x] **PRESENT-SCENE-010**: The system shall name every layer in every drawing, giving a layer with nothing to show an empty drawing rather than omitting it, so that nothing from a previous drawing can persist.
- [x] **PRESENT-SCENE-006**: When redrawing a layer, the system shall clear and rebuild it rather than reconciling it against what it drew before.
- [ ] **PRESENT-SCENE-007**: The system shall hold no copy of game state in the presentation layer, deriving every drawing from simulation state at the moment of drawing, except for a record of events the simulation has already reported and will not report again.

## First-person view

- [x] **PRESENT-VIEW-001**: The system shall draw one depth frame per depth the simulation reports, each scaled toward a vanishing point by a fixed ratio from the frame before it.
- [x] **PRESENT-VIEW-002**: The system shall draw depths from the furthest reported to the nearest, so that nearer geometry paints over further geometry.
- [x] **PRESENT-VIEW-003**: The system shall draw a left wall panel at each depth the simulation reports as walled to the party's left, and a right wall panel at each depth reported as walled to the party's right.
- [x] **PRESENT-VIEW-004**: For each side of a depth the simulation does not report as walled, the system shall draw an opening rather than a panel, so a side passage is visible from the corridor.
- [x] **PRESENT-VIEW-005**: When the simulation reports the way ahead closed at a depth, the system shall draw a panel closing the corridor at that depth's frame.
- [x] **PRESENT-VIEW-006**: The system shall draw floor and ceiling bands between each pair of consecutive depth frames.
- [x] **PRESENT-VIEW-007**: The system shall tint each depth according to the light level the simulation reports for it, drawing nothing for a depth reported as dark.
- [x] **PRESENT-VIEW-008**: The system shall draw the feature the simulation reports at each depth — stairs or a pit — within that depth's band.
- [x] **PRESENT-VIEW-009**: The system shall draw no depth beyond the maximum the simulation reports, however far the party's light reaches.
- [x] **PRESENT-VIEW-012**: When the simulation reports a closed door on the edge ahead at a depth, the system shall draw a door panel on that depth's far frame, filled distinguishably from the wall around it and carrying a handle.
- [x] **PRESENT-VIEW-013**: When the simulation reports an open door on the edge ahead at a depth, the system shall draw that door's frame on that depth's far frame and shall leave what lies beyond it visible through the opening.
- [x] **PRESENT-VIEW-014**: When the simulation reports a roaming enemy at a depth, the system shall draw a figure standing on the floor at that depth, scaled to that depth's frame.
- [x] **PRESENT-VIEW-015**: The system shall draw the figure for an enemy in the corridor with the same horned head it marks that enemy with on the automap.

## Automap

- [x] **PRESENT-MAP-001**: The system shall draw the automap from the simulation's automap view and from no other source.
- [x] **PRESENT-MAP-002**: While collapsed, the system shall draw the automap as an overlay occupying one corner of the viewport.
- [ ] **PRESENT-MAP-003**: When the player toggles the map, the system shall expand a collapsed automap to fill the viewport, and collapse an expanded one.
- [x] **PRESENT-MAP-004**: The system shall draw the same content expanded as collapsed, differing only in scale.
- [x] **PRESENT-MAP-005**: While the simulation reports a party position on the automap, the system shall draw a marker showing the party's tile and the direction it faces.
- [x] **PRESENT-MAP-006**: While the simulation reports no party position (the party stands in the dark), the system shall draw the automap without any party marker, and shall still draw every discovered tile.
- [x] **PRESENT-MAP-007**: The system shall draw walls, doors, and found secret doors with distinguishable strokes.
- [x] **PRESENT-MAP-008**: The system shall mark tiles the simulation reports as holding a known trap, and mark stairs and pits distinguishably from one another.
- [x] **PRESENT-MAP-009**: The system shall draw an enemy marker for each enemy the simulation reports, and for no other position.
- [x] **PRESENT-MAP-010**: The system shall draw a door the simulation reports as open distinguishably from one it reports as closed.
- [x] **PRESENT-MAP-011**: The system shall draw every enemy with one shared creature marker, distinguishable in shape from the party marker and from a trap mark.

## Input

- [x] **PRESENT-INPUT-001**: When a key is pressed, the system shall resolve it through the shared key binding and perform the resulting action.
- [x] **PRESENT-INPUT-002**: When a pointer press lands inside a tap region, the system shall resolve that region through the shared touch binding and perform the resulting action.
- [x] **PRESENT-INPUT-003**: If a key or a pointer press resolves to no action, then the system shall discard it without performing anything.
- [x] **PRESENT-INPUT-004**: The system shall define every tap region as a fraction of the viewport rather than a fixed pixel rectangle.
- [x] **PRESENT-SCENE-008**: The system shall size its drawing surface to the visible viewport, excluding browser chrome and device safe areas, rather than to the layout viewport.
- [x] **PRESENT-SCENE-009**: When the visible viewport changes size, the system shall resize to it and redraw.
- [x] **PRESENT-INPUT-005**: When the viewport is resized, the system shall recompute the tap regions and the depth frames from the new size.
- [x] **PRESENT-INPUT-006**: The system shall pass an action to the simulation without any indication of whether a key or a pointer produced it.

## Controls

- [x] **PRESENT-CTRL-001**: The system shall draw every region it will accept a tap in.
- [x] **PRESENT-CTRL-002**: The system shall draw no interactive control smaller than the minimum tap size, measured in pixels rather than as a fraction of the viewport.
- [x] **PRESENT-CTRL-003**: The system shall label a control with the action it performs, and shall show any keyboard key as secondary text rather than as the label.
- [x] **PRESENT-CTRL-004**: The system shall carry each control's hit region in the same plan as its drawing, so that what is drawn and what is tapped are one thing.
- [x] **PRESENT-CTRL-005**: When a pointer press lands on a drawn control, the system shall perform that control's action.
- [x] **PRESENT-CTRL-006**: The system shall register no input handler on a drawn object, hit-testing the plan instead.

- [ ] **PRESENT-CTRL-007**: The system shall draw a navigation zone as its label alone, without a panel or an outline, while it is not pressed.
- [ ] **PRESENT-CTRL-010**: The system shall draw a button with a panel and a frame whether or not it is pressed.
- [x] **PRESENT-CTRL-011**: The system shall carry on each control which of the two kinds it is, rather than leaving it to be worked out while drawing.
- [x] **PRESENT-CTRL-012**: The system shall scale drawn controls and their text with the viewport, from the size the phone layout uses up to twice it, and no further.
- [x] **PRESENT-CTRL-013**: The system shall carry the scale on the plan rather than working it out while drawing.
- [x] **PRESENT-CTRL-008**: While a pointer is held on a control, the system shall draw that control's outline, and shall stop drawing it when the pointer is released.
- [x] **PRESENT-CTRL-009**: The system shall mark at most one control as pressed at a time.
- [x] **PRESENT-CTRL-014**: The system shall offer a navigation zone for stepping backward beneath the one for stepping forward, giving neither any part of the other's area.

## Build stamp

- [x] **PRESENT-BUILD-001**: The system shall draw the build's version in the bottom-left corner of the viewport, above every other layer.
- [x] **PRESENT-BUILD-002**: The system shall place the version stamp clear of everything else the screen draws, moving it above whatever occupies that corner rather than over it.
- [x] **PRESENT-BUILD-003**: The system shall read the version from a constant fixed when the app was built, rather than deriving one while drawing.
- [x] **PRESENT-BUILD-004**: The system shall compose the version from the authored major and minor numbers, a patch equal to the number of commits, and the short commit hash.
- [x] **PRESENT-BUILD-005**: If the build supplied no version, then the system shall draw a stand-in rather than nothing, so that the stamp is never silently absent.
- [x] **PRESENT-BUILD-006**: The system shall decide the stamp's position in the draw plan rather than while drawing.

## A fight's readiness

- [x] **PRESENT-READY-001**: The system shall draw each combatant's readiness as the topmost of their three bars, filled from its left edge to the proportion the simulation reports.
- [x] **PRESENT-READY-027**: The system shall draw a readiness bar as one continuous fill from its left edge, with a brighter edge leading the fill, and shall draw no discrete marks along it.
- [x] **PRESENT-READY-031**: While a combatant's readiness is full, the system shall draw their readiness bar as filled and marked as ready to act.
- [x] **PRESENT-READY-028**: The system shall draw each combatant as a portrait with three bars stacked beside it: readiness above, identity in the middle, and condition below.
- [x] **PRESENT-READY-029**: The system shall draw on the identity bar the combatant's name, their total level, and their condition when it is not `OK`.
- [x] **PRESENT-READY-030**: The system shall draw the same portrait, bars, and values for an enemy as for a character.
- [x] **PRESENT-READY-022**: The system shall draw hit points as the lowest of a combatant's three bars, filled to the proportion of their maximum they have left, with the remaining and maximum written on it.
- [x] **PRESENT-READY-023**: The system shall colour a hit-point bar as healthy above half of maximum, wounded above a quarter, and critical at or below a quarter.
- [x] **PRESENT-READY-024**: While no combatant is ready and nothing is waiting on the player, the system shall advance the fight's time by one beat for each fixed span of real time.
- [x] **PRESENT-READY-032**: The system shall apply the same fixed span of real time per beat to every combatant's bar, so that the bars' relative speeds are the simulation's alone.
- [x] **PRESENT-READY-025**: While a beat of filling is in progress, the system shall draw each fill at the readiness the simulation reports for that point in the beat.
- [x] **PRESENT-READY-002**: The system shall draw the readiness bar from the simulation's value and from no count of its own.
- [x] **PRESENT-READY-003**: While a combatant is acting, the system shall draw that combatant as highlighted, on either side alike.
- [x] **PRESENT-READY-004**: The system shall highlight at most one combatant at a time.
- [x] **PRESENT-READY-005**: When the simulation resolves an action, the system shall pause for a fixed beat before playing the next.
- [x] **PRESENT-READY-006**: The system shall measure the beat between actions and the proposal countdown in real seconds, and shall not let either advance the fight's own time.
- [x] **PRESENT-READY-008**: The system shall take no action on a character's turn that the player has not pressed for.
- [x] **PRESENT-READY-010**: The system shall wait for the player at every character's turn without limit.
- [x] **PRESENT-READY-013**: While a character is waiting to be told what to do, the system shall name that character as ready to act.
- [x] **PRESENT-READY-014**: While nothing is waiting on the player, the system shall draw no prompt at all.
- [x] **PRESENT-READY-015**: When an encounter begins with one side unready, the system shall draw a card announcing the ambush until every combatant the ambush favoured has acted or stopped being able to act.
- [x] **PRESENT-READY-033**: While an ambush card is drawn, the system shall name on it which side was caught unready, wording the party's case and the enemies' case differently.
- [x] **PRESENT-READY-026**: While an ambush card is drawn, the system shall play the fight as it would without the card.
- [x] **PRESENT-READY-017**: When an encounter begins with neither side unready, the system shall draw no ambush card.
- [x] **PRESENT-READY-018**: When an attack resolves, the system shall offset the attacker's portrait and bars together, vertically, by an amount that decays to nothing over the beat.
- [x] **PRESENT-READY-019**: The system shall decide each combatant's offset in the draw plan rather than while drawing.

## Prompts

- [x] **PRESENT-PROMPT-001**: While the simulation holds a pending confirmation, the system shall draw a prompt describing it.
- [x] **PRESENT-PROMPT-002**: While the simulation holds no pending confirmation, the system shall draw no prompt.
- [x] **PRESENT-PROMPT-003**: While a prompt is drawn, the system shall accept only the prompt's own confirm and decline inputs, discarding every movement verb and party action.
- [x] **PRESENT-PROMPT-004**: When the player confirms or declines a prompt, the system shall pass the answer to the simulation and redraw.
- [x] **PRESENT-PROMPT-005**: The system shall bind confirm to Enter and to the affirmative on-screen control, and decline to Escape and to the negative on-screen control.

## Combat

- [x] **PRESENT-FIGHT-001**: While an encounter is running, the system shall draw the combat layer over the first-person view rather than in place of it.
- [x] **PRESENT-FIGHT-002**: The system shall draw the enemies as one column on the left of the fight panel and the party as one column on its right.
- [x] **PRESENT-FIGHT-018**: The system shall draw a side's combatants in a single column however many it holds, giving them no arrangement beyond their order in that column.
- [x] **PRESENT-FIGHT-038**: The system shall centre each side's column vertically within the combatants region, on that side's own count of combatants, independently of the other side.
- [x] **PRESENT-FIGHT-039**: If a side's column is taller than the combatants region, then the system shall begin that column at the region's top edge rather than above it.
- [x] **PRESENT-FIGHT-019**: The system shall decide every combatant's position, and the position of their portrait and each of their bars, in the plan rather than while drawing.
- [x] **PRESENT-FIGHT-023**: The system shall draw a combatant's portrait from an image authored for their class or their enemy kind, at one size for every combatant.
- [x] **PRESENT-FIGHT-024**: If a combatant's portrait image is missing or fails to load, then the system shall draw the combatant without it rather than failing to draw the fight.
- [x] **PRESENT-FIGHT-025**: The system shall divide the fight panel into a fixed region for the combatants, a fixed region for the log, a fixed line for the prompt, and a fixed region for the controls.
- [x] **PRESENT-FIGHT-026**: The system shall keep the fight panel's bounds and each of its regions in the same place and at the same size for the whole of an encounter, whatever it holds.
- [x] **PRESENT-FIGHT-027**: The system shall reserve the prompt's line whether or not there is a prompt to draw in it.
- [x] **PRESENT-FIGHT-028**: The system shall reserve in the controls region the room a full row of targets needs, so that offering targets moves no control already drawn.
- [x] **PRESENT-FIGHT-029**: The system shall draw the log in a box of fixed height holding the most recent lines that fit.
- [x] **PRESENT-FIGHT-030**: While the log holds more lines than its box shows, the system shall draw a scrollbar whose thumb is sized to the share shown and placed by how far back the view is.
- [x] **PRESENT-FIGHT-031**: When the player scrolls the log, the system shall move the view by the lines scrolled and hold it there as new lines arrive.
- [x] **PRESENT-FIGHT-032**: While the log's view is at its newest line, the system shall keep it there as new lines arrive.
- [x] **PRESENT-FIGHT-033**: When the player presses the scrollbar track above or below the thumb, the system shall move the view back or forward by the lines the box shows.
- [x] **PRESENT-FIGHT-020**: The system shall lay a fight out within a column centred on the viewport, no wider than the readable maximum the scale allows.
- [x] **PRESENT-FIGHT-021**: The system shall keep every fight control within that column, so that a control never spans a wide window.
- [x] **PRESENT-FIGHT-022**: The system shall scale a combatant's portrait, bars, and text with the viewport, by the same scale the controls use.
- [x] **PRESENT-FIGHT-003**: The system shall draw a combatant who is down in the place they occupied in their column, rather than removing them from it.
- [x] **PRESENT-FIGHT-004**: The system shall draw each combatant's remaining and maximum hit points.
- [x] **PRESENT-FIGHT-005**: The system shall ask exactly one character for an action — the one whose readiness has filled — and shall ask nobody in advance of that.
- [x] **PRESENT-FIGHT-006**: The system shall offer every character the same four options in the same order on every turn: Attack, Magic, Inventory, then Flee.
- [x] **PRESENT-FIGHT-034**: The system shall draw an option the acting character cannot take in its own place, marked unavailable, rather than omitting it or reordering the options around it.
- [x] **PRESENT-FIGHT-035**: When the player presses an option marked unavailable, the system shall do nothing and shall report nothing.
- [x] **PRESENT-FIGHT-036**: The system shall mark Attack unavailable when the character carries no attack or no combatant is standing to attack, Magic unavailable when the character can cast no spell, Inventory unavailable when no item can be used in a fight, and Flee unavailable when the simulation reports a flee attempt as certain to fail.
- [x] **PRESENT-FIGHT-040**: The system shall draw on each unavailable option, beneath its name and in smaller text, a reason naming why it cannot be taken.
- [x] **PRESENT-FIGHT-041**: The system shall draw an unavailable option's reason in the place an available option draws its key hint, and shall draw no key hint on an unavailable option.
- [x] **PRESENT-FIGHT-042**: While every option is unavailable, the system shall draw a Pass turn control over the four, shall accept a press on it alone, and shall keep the four drawn beneath it.
- [x] **PRESENT-FIGHT-043**: When the player takes the Pass turn control, the system shall pass that character's turn and draw the control no further.
- [x] **PRESENT-FIGHT-044**: While any option is available, the system shall draw no Pass turn control.
- [x] **PRESENT-FIGHT-037**: The system shall bind each of the four options to the same numbered key on every turn, whether or not that option can be taken.
- [x] **PRESENT-FIGHT-007**: When an action needs a target, the system shall offer every combatant the simulation reports as a legal target for it.
- [x] **PRESENT-FIGHT-008**: When a character's action is chosen, the system shall resolve it at once and pass on to whoever comes ready next.
- [x] **PRESENT-FIGHT-009**: When the player backs out of a half-chosen target, the system shall return to that character's open choice, never to an earlier character, and shall do nothing when the open choice is already showing.
- [x] **PRESENT-FIGHT-010**: The system shall build the combat log from the events a resolved action reports, and shall report nothing the simulation did not do.
- [x] **PRESENT-FIGHT-011**: The system shall name, for each resolved attack, who acted, which band the attack fell in, the damage it dealt, and whether it felled its target.
- [x] **PRESENT-FIGHT-012**: While an encounter is running, the system shall accept no exploration movement verb or party action.
- [x] **PRESENT-FIGHT-013**: The system shall resolve a numbered key and a tap on the same option to the same choice, carrying no record of which was used.
- [x] **PRESENT-FIGHT-014**: When an encounter ends, the system shall draw a banner naming the outcome and, on a victory, what it was worth.
- [x] **PRESENT-FIGHT-017**: The system shall give every combat option on offer a drawn control with its own hit region, so that a fight can be played by touch alone.
- [x] **PRESENT-FIGHT-015**: When the player dismisses the outcome banner, the system shall return to drawing the corridor and accept exploration input again.

## Deferred

- [D] **PRESENT-VIEW-010**: The system shall animate the transition between one party position and the next.
- [D] **PRESENT-VIEW-011**: The system shall draw walls, floors, and features with textures rather than flat fill.
- [D] **PRESENT-INPUT-007**: When a step is blocked, the system shall give the player feedback that the way is barred.
- [D] **PRESENT-FIGHT-016**: The system shall animate a resolving action rather than landing its effect in a single frame.
