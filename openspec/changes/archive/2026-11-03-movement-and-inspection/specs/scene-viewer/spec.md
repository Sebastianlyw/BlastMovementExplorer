# Spec Delta

## ADDED Requirements

### Requirement: Colour mode
The user SHALL be able to colour blocks by grade (fixed 0–3 g/t scale) or by displacement magnitude (fixed 0–12 m scale); the legend SHALL show the active scale and its range SHALL NOT change with filters or camera.

#### Scenario: Switch to displacement colour
- **WHEN** the user selects "Displacement magnitude"
- **THEN** blocks are recoloured by displacement and the legend shows "Displacement magnitude (m)" from 0 to 12

### Requirement: Independent layer visibility
Blocks and terrain SHALL each have a visibility toggle that does not affect the other layer.

#### Scenario: Hide terrain
- **WHEN** the user turns the terrain layer off
- **THEN** the terrain is no longer drawn and the blocks remain visible
