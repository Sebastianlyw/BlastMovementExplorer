# view-filtering Specification

## Purpose
Lets the user narrow what the viewport draws — by grade range, ore-only and a horizontal section — while keeping drawing, picking and selection consistent and never altering metrics.

## Requirements

### Requirement: Grade range and ore-only filters
The user SHALL be able to restrict drawn blocks to a grade range [min, max] g/t (inclusive) and to ore only (grade ≥ current cutoff). Filters SHALL NOT change the colour scale.

#### Scenario: Ore only
- **GIVEN** cutoff 0.8 g/t
- **WHEN** the user enables "Ore only"
- **THEN** only blocks with grade ≥ 0.8 g/t are drawn and the legend range is unchanged

### Requirement: Horizontal Z section
The user SHALL be able to enable a horizontal section at elevation Z (default enabled state off); when enabled, blocks whose current centre is above Z SHALL be hidden. The section SHALL use the current interpolated position.

#### Scenario: Section hides upper blocks
- **WHEN** the user enables the section at Z = 12 m
- **THEN** no block whose current centre is above 12 m is drawn or pickable

### Requirement: Hidden blocks are not pickable
A block hidden by a filter or the section SHALL NOT be selectable by clicking; the click SHALL resolve to the nearest drawn block or to nothing.

#### Scenario: Click where a hidden block was
- **GIVEN** a block hidden by the section
- **WHEN** the user clicks where that block would be drawn
- **THEN** that block is not selected

### Requirement: Empty filter result
When filters leave no blocks drawn, the viewport SHALL show an explicit empty state naming the active filters instead of an empty scene.

#### Scenario: Grade range with no blocks
- **WHEN** the user sets the grade range to 50–60 g/t
- **THEN** the viewport shows "No blocks match the current filters"

### Requirement: View settings do not change metrics
Grade filters, ore-only, the section, layer visibility, colour mode, movement t and point-cloud settings SHALL NOT change any dig-analysis metric.

#### Scenario: Toggle view settings
- **WHEN** the user toggles layers, the section and filters
- **THEN** every displayed metric value is unchanged
