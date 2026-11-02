# block-movement Specification

## Purpose
Provides an illustrative, procedurally generated displacement for every block and the interpolation used to show material moving between its pre- and post-movement positions.

## Requirements

### Requirement: Illustrative movement field
The generator SHALL compute a final centre for every block from a deterministic, spatially continuous field combining a main throw direction, magnitude decreasing with distance from the free face and with depth, smooth lateral spread and vertical change bounded by a parameter. The field SHALL NOT be presented as a physics prediction.

#### Scenario: Movement is deterministic
- **WHEN** the same seed and parameters are used twice
- **THEN** every block's final centre is identical

#### Scenario: Neighbouring blocks move similarly
- **WHEN** the default dataset is generated
- **THEN** the mean displacement difference between face-adjacent blocks is less than one third of the mean displacement magnitude

#### Scenario: Vertical change is bounded
- **WHEN** a dataset is generated with vertical bound V
- **THEN** no block's vertical displacement exceeds V in magnitude

### Requirement: Movement parameters have explicit ranges
Each movement parameter SHALL have a documented minimum and maximum; out-of-range values SHALL be rejected rather than silently clamped.

#### Scenario: Out-of-range parameter
- **WHEN** a movement parameter outside its documented range is supplied
- **THEN** validation reports which parameter is out of range

### Requirement: Movement preserves block identity and mass
Movement SHALL change only block positions. Block ids, grades, densities, dimensions and tonnes SHALL be identical before and after movement, and no block SHALL be removed, including blocks that move outside the original extents.

#### Scenario: Invariants hold
- **WHEN** the default dataset is generated
- **THEN** the block count, the set of ids, every grade and the total tonnes are the same for the before and after states

### Requirement: Final bounds contain moved data
Dataset metadata SHALL include final bounds that contain every block (centre ± half size) after movement.

#### Scenario: Final bounds
- **WHEN** the default dataset is generated
- **THEN** every moved block lies inside the metadata final bounds

### Requirement: Movement interpolation
The displayed position SHALL be `(1 − t) · before + t · after` for t in [0, 1], labelled "Movement interpolation"; t SHALL NOT be presented as elapsed time or a real trajectory. t = 0 SHALL reproduce the before centre exactly and t = 1 the after centre exactly.

#### Scenario: Exact endpoints
- **WHEN** the interpolation is evaluated at t = 0 and t = 1
- **THEN** the results equal the before and after centres bit-for-bit

### Requirement: Movement timeline control
The UI SHALL provide a slider for t, Play and Pause, and buttons jumping to t = 0 and t = 1. Playback SHALL start only on user action.

#### Scenario: Jump to after
- **WHEN** the user activates "After (t = 1)"
- **THEN** the slider shows t = 1.00 and blocks are drawn at their after centres
