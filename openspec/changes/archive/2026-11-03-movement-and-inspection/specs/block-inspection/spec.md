# Spec Delta

## ADDED Requirements

### Requirement: Picking follows the displayed position
Picking and the selection highlight SHALL use each block's current interpolated position, so a click selects exactly the block drawn under the cursor at the current t.

#### Scenario: Select a moved block
- **GIVEN** t = 1
- **WHEN** the user clicks where a block is drawn at its after position
- **THEN** that block is selected, and clicking its former before position (now empty) does not select it

#### Scenario: Highlight follows movement
- **GIVEN** a selected block
- **WHEN** t changes
- **THEN** the highlight outline is drawn around the block's current position

### Requirement: Movement properties in the inspector
The inspector SHALL show the selected block's before centre, after centre, displacement vector (ΔE, ΔN, ΔZ) and displacement magnitude in metres.

#### Scenario: Displacement shown
- **WHEN** a block is selected
- **THEN** the displayed displacement equals after centre − before centre from the block model
