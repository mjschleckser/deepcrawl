# Food — EARS Specs

Specs for the food segment. Design: `food-design.md`.

The fullness each stage starts at, the size of each penalty and buff, and what each
ingredient carries are content data and tunable values, not requirements. These specs fix
how hunger runs, how the pot makes a meal, and what a meal does.

## Hunger

- [x] **FOOD-HUNGER-001**: The system shall give every character a fullness, starting full at the campaign's start, and shall take one from every living character for every tick the exploration clock advances.
- [x] **FOOD-HUNGER-002**: The system shall take no fullness while a fight is running.
- [x] **FOOD-HUNGER-003**: The system shall set a character's stage from their fullness: Fed, then four Hungry stages, then Starving at none.
- [x] **FOOD-HUNGER-004**: While a character is Hungry or Starving, the system shall reduce their weapon damage and spell magnitude by the stage's penalty, larger at each stage.
- [x] **FOOD-HUNGER-005**: While a character is Starving, the system shall take one hit point from them for every thirty ticks, and shall never take them below one hit point or change their condition.
- [x] **FOOD-HUNGER-006**: When a character's stage worsens, the system shall report who and the stage they reached.

## Ingredients

- [x] **FOOD-ITEM-001**: The system shall carry on every food item the nourishment and healing it adds to a pot, and the trait points it carries among hearty, tough, nimble, arcane, hale and warming.
- [x] **FOOD-ITEM-002**: The system shall hold the Ration, Goblin Haunch, Spit-roast Rat, Glowcap, Mage's Spice Pouch, Bitterleaf, Fleetroot, Cave Moss, Ironcap, Smoked Sausage, Honeycomb and Dragonpepper as food items.
- [x] **FOOD-ITEM-003**: The system shall start a campaign with six Rations in the pack.

## The pot

- [x] **FOOD-POT-001**: When the party cooks at camp, the system shall make one meal from every food item put in the pot, using those items up.
- [x] **FOOD-POT-002**: The system shall scale a meal's nourishment, healing and buff by a cook factor of one plus a tenth per rank of the best Cooking rank among the conscious.
- [x] **FOOD-POT-003**: The system shall give every conscious character the whole of a meal's nourishment and healing, raising fullness no higher than its maximum and hit points through the party's operation.
- [x] **FOOD-POT-004**: The system shall give a meal the buffs of the traits with the most points in the pot, as many as one per five ranks of the cook's Cooking rank rounded up, ties going in the order hearty, tough, nimble, arcane, hale, warming, and no buff when the pot holds no trait.
- [x] **FOOD-POT-005**: The system shall give every eater the meal's buffs, replacing any they carried.
- [x] **FOOD-POT-006**: The system shall report what a pot would make — each eater's nourishment and healing, and the buffs — without using anything up.
- [x] **FOOD-POT-007**: When the pot is cooked, the system shall train the cook's Cooking skill through the party's operation.

## Buffs

- [x] **FOOD-BUFF-001**: While a character carries a hearty buff, the system shall raise their weapon damage by two percent per point.
- [x] **FOOD-BUFF-002**: While a character carries a tough buff, the system shall raise their armour by one per two points.
- [x] **FOOD-BUFF-003**: While a character carries a nimble buff, the system shall raise their Dexterity by one per two points.
- [x] **FOOD-BUFF-004**: While a character carries an arcane buff, the system shall raise their spell magnitude by three percent per point.
- [x] **FOOD-BUFF-006**: While a character carries a hale buff, the system shall raise their maximum hit points by two per point.
- [x] **FOOD-BUFF-007**: While a character carries a warming buff, the system shall take five percent fewer fullness per point from them, never fewer than half.
- [x] **FOOD-BUFF-005**: When the camp segment clears buffs, the system shall remove every character's meal buffs, taking a hale buff's hit points back off their maximum and leaving them at least one hit point.

## Foraging

- [x] **FOOD-FORAGE-001**: When the camp segment asks for foraging, the system shall find one ingredient plus one for every two ranks of the best Foraging rank among the conscious, drawn from the forage list, put them in the pack, and train that forager's Foraging skill.

## Deferred

- [D] **FOOD-ITEM-004**: The system shall spoil food carried too long.
