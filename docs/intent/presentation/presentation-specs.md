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
- [ ] **PRESENT-SCENE-007**: The system shall hold no game state in the presentation layer; every drawing shall be derived from simulation state at the moment of drawing.

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
- [x] **PRESENT-INPUT-005**: When the viewport is resized, the system shall recompute the tap regions and the depth frames from the new size.
- [x] **PRESENT-INPUT-006**: The system shall pass an action to the simulation without any indication of whether a key or a pointer produced it.

## Prompts

- [x] **PRESENT-PROMPT-001**: While the simulation holds a pending confirmation, the system shall draw a prompt describing it.
- [x] **PRESENT-PROMPT-002**: While the simulation holds no pending confirmation, the system shall draw no prompt.
- [x] **PRESENT-PROMPT-003**: While a prompt is drawn, the system shall accept only the prompt's own confirm and decline inputs, discarding every movement verb and party action.
- [x] **PRESENT-PROMPT-004**: When the player confirms or declines a prompt, the system shall pass the answer to the simulation and redraw.
- [x] **PRESENT-PROMPT-005**: The system shall bind confirm to Enter and to the affirmative on-screen control, and decline to Escape and to the negative on-screen control.

## Deferred

- [D] **PRESENT-VIEW-010**: The system shall animate the transition between one party position and the next.
- [D] **PRESENT-VIEW-011**: The system shall draw walls, floors, and features with textures rather than flat fill.
- [D] **PRESENT-INPUT-007**: When a step is blocked, the system shall give the player feedback that the way is barred.
