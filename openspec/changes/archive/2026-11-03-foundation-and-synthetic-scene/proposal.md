# Proposal

## Why

Blast Movement Explorer needs a runnable foundation before any movement or dig analysis can be shown: a reproducible synthetic mine block model, a Three.js viewport the user can navigate, and a way to pick a block and read its properties. Without a deterministic dataset every later metric would be unverifiable.

## What Changes

- Add a deterministic synthetic dataset generator (seeded, serialisable parameters) producing a 60 × 40 × 12 block model of 2 m blocks over a 120 × 80 × 24 m volume, a tilted ellipsoidal ore body with an optional narrow vein, spatially continuous grade (g/t), density and geological class.
- Add a procedural benched terrain (one blast bench with a free face toward the south, a lower floor and an upper bench to the north) generated from the same parameters.
- Add dataset metadata (schema version, generator version, seed, units, coordinate convention, extents, parameters, provenance note).
- Add a 3D viewport rendering the block model as one instanced mesh plus the terrain, with orbit/pan/zoom, Reset camera, Fit data, and Top / Front / Isometric presets in local Z-up coordinates.
- Add click-to-select with a highlight and a property panel; clicking empty space clears the selection.
- Add an always-visible "Synthetic data · Illustrative movement" label and honest loading / error / WebGL-unavailable states.

## Capabilities

### New Capabilities
- `synthetic-dataset`: Deterministic generation of the synthetic block model, terrain surface and dataset metadata, including units, coordinate convention and tonnage rules.
- `scene-viewer`: The 3D viewport: what is drawn, camera navigation and presets, coordinate handling, render states (loading, failure, WebGL unavailable) and the persistent synthetic-data label.
- `block-inspection`: Selecting a block in the viewport and reading its authoritative properties in the inspector.

### Modified Capabilities

(none — first change)

## Impact

- New code under `src/app/domain`, `src/app/renderer`, `src/app/state`, `src/app/ui`.
- Uses the pinned `three@0.186.1` dependency; no backend, no external assets.
- Unit tests (Vitest via `ng test`) for generation; a first Playwright smoke test.
