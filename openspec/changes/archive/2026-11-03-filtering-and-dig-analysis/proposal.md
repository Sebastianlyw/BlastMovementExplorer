# Proposal

## Why

The product's last two questions — how much ore falls outside the original dig region after movement, how much waste falls in, and how an adjusted region changes that — need view filtering to see the ore, a dig region, demo metrics computed from the authoritative block model, and a way to export and restore the scenario.

## What Changes

- View filtering: grade range filter, ore-only toggle, horizontal Z section. Filtered or sectioned blocks are neither drawn nor pickable; a selection that becomes hidden is cleared with a notice; an empty result shows an explicit empty state.
- Dig regions: an axis-aligned XY rectangle spanning the full vertical range. The original region is derived once from the pre-movement ore distribution and frozen; an adjusted region is edited via centre and size inputs. Both are drawn in the viewport.
- Dig analysis for scenarios A (before + original), B (after + original) and C (after + adjusted), using centre-point inclusion with inclusive bounds, the full block model, and the current cutoff. Raw tonnes and percentages are shown; zero denominators show N/A. Definitions are labelled demo definitions.
- Export: analysis summary CSV and scene configuration JSON (seed, generator version, cutoff, regions, display settings, movement parameters). Import: validated configuration restores an equivalent scene and results; invalid files show a clear message.

## Capabilities

### New Capabilities
- `view-filtering`: grade range, ore-only and Z-section view filters, their effect on drawing and picking, and the empty state.
- `dig-analysis`: dig regions, scenarios A/B/C and the demo metric definitions.
- `scene-config-io`: CSV summary export and JSON configuration export/import with validation.

### Modified Capabilities
- `block-inspection`: selection is cleared with a notice when the selected block becomes hidden (added requirement).

## Impact

- New domain modules `filtering.ts`, `dig-analysis.ts`, `scene-config.ts`, `csv.ts`; new renderer `DigRegionLayer`; new UI panels for filters, dig regions, analysis and import/export.
- Scene presets gain a movement parameter override path (needed for import).
