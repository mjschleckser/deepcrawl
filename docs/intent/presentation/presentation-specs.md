# Presentation — EARS Specs

Specs for the presentation segment. Design: `presentation-design.md`.

Colours, frame scale ratios, widget sizes and the exact fractions of the viewport that
make up each tap region are content data, not requirements. These specs fix the
structure and the rules; the numbers stay tunable without rewriting a spec or a test.

## Scene

- [x] **PRESENT-SCENE-001**: The system shall draw three layers in order: the first-person view, the automap, then the HUD.
- [x] **PRESENT-SCENE-002**: The system shall keep the renderer's ticker stopped, so that no redraw occurs merely because time has passed.
- [x] **PRESENT-SCENE-003**: When an action changes simulation state, the system shall redraw — including a turn, which changes facing without advancing the clock.
- [x] **PRESENT-SCENE-004**: When a prompt is answered, the map is expanded or collapsed, or the window is resized, the system shall redraw.
- [x] **PRESENT-SCENE-005**: If an action changes no simulation state, then the system shall not redraw.
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
- [x] **PRESENT-VIEW-008**: The system shall draw the feature the simulation reports at each depth — stairs, a pit, or a door — within that depth's band.
- [x] **PRESENT-VIEW-009**: The system shall draw no depth beyond the maximum the simulation reports, however far the party's light reaches.

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

## Prompts

- [x] **PRESENT-PROMPT-001**: While the simulation holds a pending confirmation, the system shall draw a prompt describing it.
- [x] **PRESENT-PROMPT-002**: While the simulation holds no pending confirmation, the system shall draw no prompt.
- [x] **PRESENT-PROMPT-003**: While a prompt is drawn, the system shall accept only the prompt's own confirm and decline inputs, discarding every movement verb and party action.
- [x] **PRESENT-PROMPT-004**: When the player confirms or declines a prompt, the system shall pass the answer to the simulation and redraw.
- [x] **PRESENT-PROMPT-005**: The system shall bind confirm to Enter and to the affirmative on-screen control, and decline to Escape and to the negative on-screen control.

## Combat

- [x] **PRESENT-FIGHT-001**: While an encounter is running, the system shall draw the combat layer over the first-person view rather than in place of it.
- [x] **PRESENT-FIGHT-002**: The system shall draw both the enemy formation and the party in their two rows.
- [x] **PRESENT-FIGHT-003**: The system shall draw a combatant who is down in the place they occupied, rather than removing them from their row.
- [x] **PRESENT-FIGHT-004**: The system shall draw each combatant's remaining and maximum hit points.
- [x] **PRESENT-FIGHT-005**: The system shall ask each conscious party member for an action in turn, in a fixed order.
- [x] **PRESENT-FIGHT-006**: The system shall offer a character only the actions that character can legally take.
- [x] **PRESENT-FIGHT-007**: When an action needs a target, the system shall offer only the targets the reach rules permit.
- [x] **PRESENT-FIGHT-008**: When the last conscious party member has chosen, the system shall resolve the round and begin asking again.
- [x] **PRESENT-FIGHT-009**: When the player backs out of a choice, the system shall return to the previous character's choice rather than only cancelling the current one.
- [x] **PRESENT-FIGHT-010**: The system shall build the combat log from the events a resolved round reports, and shall report nothing the simulation did not do.
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
- [D] **PRESENT-FIGHT-016**: The system shall play a resolving round out over time rather than landing it in a single frame.
