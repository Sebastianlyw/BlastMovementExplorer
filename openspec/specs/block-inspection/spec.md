# block-inspection Specification

## Purpose
Lets the user select a single block in the viewport and read its authoritative properties from the block model.

## Requirements

### Requirement: Click to select a block
Clicking a rendered block SHALL select the nearest visible block under the cursor, identified by its stable block id, and highlight it in the viewport.

#### Scenario: Select a visible block
- **WHEN** the user clicks on a rendered block
- **THEN** that block's id becomes the selection and a highlight outline is drawn around it

### Requirement: Clear selection on empty click
Clicking a viewport location with no visible block SHALL clear the current selection; a drag used for orbiting SHALL NOT change the selection.

#### Scenario: Click on empty space
- **GIVEN** a block is selected
- **WHEN** the user clicks on empty space
- **THEN** no block is selected and the highlight is removed

### Requirement: Property panel
The inspector SHALL show for the selected block: id, grid index, centre (E, N, Z in metres), dimensions, density (t/m³), grade (g/t), tonnes (volume × density), geological class and the ore/waste class at the current cutoff.

#### Scenario: Properties match the block model
- **WHEN** a block is selected
- **THEN** every value shown in the inspector equals the corresponding value in the authoritative block model, and tonnes equal volume × density

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

### Requirement: Hidden selection is cleared
When the selected block becomes hidden by a filter, the section, movement crossing the section, or hiding the block layer, the selection SHALL be cleared and a short notice SHALL explain why.

#### Scenario: Filter hides the selection
- **GIVEN** a selected waste block
- **WHEN** the user enables "Ore only"
- **THEN** no block is selected and a notice says the selection was cleared because it is hidden
