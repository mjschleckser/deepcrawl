# Food — EARS Specs

Specs for the food segment. Design: `food-design.md`.

The fullness each stage starts at, the size of each penalty and buff, and what each
ingredient carries are content data and tunable values, not requirements. These specs fix
how hunger runs, how the pot makes a meal, and what a meal does.

## Hunger

- [ ] **FOOD-HUNGER-001**: The system shall give every character a fullness, starting full at the campaign's start, and shall take one from every living character for every tick the exploration clock advances.
- [ ] **FOOD-HUNGER-002**: The system shall take no fullness while a fight is running.
- [ ] **FOOD-HUNGER-003**: The system shall set a character's stage from their fullness: Fed, then four Hungry stages, then Starving at none.
- [ ] **FOOD-HUNGER-004**: While a character is Hungry or Starving, the system shall reduce their weapon damage and spell magnitude by the stage's penalty, larger at each stage.
- [ ] **FOOD-HUNGER-005**: While a character is Starving, the system shall take one hit point from them for every thirty ticks, and shall never take them below one hit point or change their condition.
- [ ] **FOOD-HUNGER-006**: When a character's stage worsens, the system shall report who and the stage they reached.

## Ingredients

- [ ] **FOOD-ITEM-001**: The system shall carry on every food item the nourishment and healing it adds to a pot, and the trait points it carries among hearty, tough, nimble and arcane.
- [ ] **FOOD-ITEM-002**: The system shall hold the Ration, Goblin Haunch, Glowcap, Bitterleaf and Fleetroot as food items.
- [ ] **FOOD-ITEM-003**: The system shall start a campaign with six Rations in the pack.

## The pot

- [ ] **FOOD-POT-001**: When the party cooks at camp, the system shall make one meal from every food item put in the pot, using those items up.
- [ ] **FOOD-POT-002**: The system shall scale a meal's nourishment, healing and buff by a cook factor of one plus a tenth per rank of the best Cooking rank among the conscious.
- [ ] **FOOD-POT-003**: The system shall share a meal's nourishment and healing equally among every conscious character, raising fullness no higher than its maximum and hit points through the party's operation.
- [ ] **FOOD-POT-004**: The system shall give a meal the buff of the trait with the most points in the pot, ties going in the order hearty, tough, nimble, arcane, and no buff when the pot holds no trait.
- [ ] **FOOD-POT-005**: The system shall give every eater the meal's buff, replacing any buff they carried.
- [ ] **FOOD-POT-006**: The system shall report what a pot would make — each eater's nourishment and healing, and the buff — without using anything up.
- [ ] **FOOD-POT-007**: When the pot is cooked, the system shall train the cook's Cooking skill through the party's operation.

## Buffs

- [ ] **FOOD-BUFF-001**: While a character carries a hearty buff, the system shall raise their weapon damage by two percent per point.
- [ ] **FOOD-BUFF-002**: While a character carries a tough buff, the system shall raise their armour by one per two points.
- [ ] **FOOD-BUFF-003**: While a character carries a nimble buff, the system shall raise their Dexterity by one per two points.
- [ ] **FOOD-BUFF-004**: While a character carries an arcane buff, the system shall raise their spell magnitude by three percent per point.
- [ ] **FOOD-BUFF-005**: When the camp segment clears buffs, the system shall remove every character's meal buff.

## Foraging

- [ ] **FOOD-FORAGE-001**: When the camp segment asks for foraging, the system shall find one ingredient plus one for every two ranks of the best Foraging rank among the conscious, drawn from the forage list, put them in the pack, and train that forager's Foraging skill.

## Deferred

- [D] **FOOD-ITEM-004**: The system shall spoil food carried too long.
- [D] **FOOD-POT-008**: The system shall give a meal a second buff from a second trait strong enough to count.
