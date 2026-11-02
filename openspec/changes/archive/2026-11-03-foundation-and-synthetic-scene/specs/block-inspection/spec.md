# Spec Delta

## Purpose

Lets the user select a single block in the viewport and read its authoritative properties from the block model.

## ADDED Requirements

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
