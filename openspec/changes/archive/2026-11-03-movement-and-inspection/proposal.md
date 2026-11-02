# Proposal

## Why

The product's second question — where did material go after the blast? — needs a before/after position for every block and a way to watch and inspect that movement. The movement must be honest: a procedural, illustrative field, not a physics prediction.

## What Changes

- Add a deterministic, spatially continuous illustrative movement field: main throw direction toward the free face, depth- and face-distance-dependent magnitude, smooth lateral spread and bounded vertical change. Parameters have documented ranges and are part of the dataset parameters.
- Each block gets a final centre; id, grade, density and tonnes never change. No block is removed.
- Dataset metadata gains final bounds that contain every moved block.
- Add the movement interpolation `p(t) = (1 − t)·before + t·after`, t ∈ [0, 1], labelled "Movement interpolation" (not time).
- Add a bottom timeline: slider, Play / Pause, "Before (t = 0)" and "After (t = 1)" buttons.
- Add colour by displacement magnitude (fixed 0–12 m scale) next to colour by grade.
- Add independent visibility toggles for blocks and terrain.
- Inspector shows before centre, after centre, displacement vector and magnitude; selection and picking follow the interpolated position.
- Bump the generator version (dataset output changes).

## Capabilities

### New Capabilities
- `block-movement`: The illustrative movement field, its parameters and invariants, and movement interpolation between the two endpoints.

### Modified Capabilities
- `block-inspection`: picking and highlight follow the current interpolated position; the inspector shows movement properties (added requirements).
- `scene-viewer`: colour by displacement magnitude, layer visibility toggles and the movement timeline (added requirements).

## Impact

- `src/app/domain/movement.ts` (new), generator and types updated, `GENERATOR_VERSION` 1.0.0 → 1.1.0.
- Renderer: `aAfter` attribute now carries real final centres; `setMovementT`, playback, colour mode, layer visibility.
- New timeline and layers UI; inspector extended.
