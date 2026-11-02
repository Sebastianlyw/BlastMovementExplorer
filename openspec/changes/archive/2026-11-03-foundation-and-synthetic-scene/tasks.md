# Tasks

## 1. Domain: synthetic dataset

- [x] 1.1 Implement seeded PRNG and continuous 3D value noise in `src/app/domain/random.ts`; verify determinism and continuity unit tests pass
- [x] 1.2 Define dataset types (metadata, block model SoA, `Block` record, tonnes) in `src/app/domain/types.ts` and `blocks.ts`; verify the 21.6 t fixture test passes
- [x] 1.3 Implement terrain height function and block model generator in `src/app/domain/generator.ts`; verify tests for size, unique ids, valid values, determinism, seed sensitivity, spatial coherence, ore/waste presence and blocks-below-surface pass
- [x] 1.4 Implement cutoff classification (grade ≥ cutoff is ore) and verify the equality test passes

## 2. Renderer foundation

- [x] 2.1 Implement `WorldFrame` (domain ↔ render) and ray–AABB picking helpers as pure functions; verify round-trip and picking unit tests pass
- [x] 2.2 Implement `SceneRenderer` (Z-up camera, OrbitControls, instanced blocks, terrain mesh with footprint cut-out, selection outline, on-demand loop, ResizeObserver, dispose); verify by loading the app in a real browser
- [x] 2.3 Implement camera presets (Reset, Fit, Top, Front, Isometric) that keep the camera above the terrain; verify via Playwright that the initial camera is outside the data

## 3. UI shell and inspection

- [x] 3.1 Build the app shell (top bar with persistent synthetic label, left/right panels, viewport, legend, orientation and scale indicators) with an English UI; verify visually in the browser
- [x] 3.2 Implement the signal store holding params, selection id and status; implement loading / error / WebGL-unavailable states; verify the WebGL-unavailable unit test passes
- [x] 3.3 Implement click-to-select, empty-click clears, drag does not select, and the inspector property panel; verify via Playwright that a selected block's properties match the block model

## 4. Integration

- [x] 4.1 Run `npm test`, `npm run build` and `npm run e2e`; record actual results in this file
- [x] 4.2 Measure generation time for the default dataset and record it in docs/performance.md

## Verification record (2026-11-03)

- `npm test`: 3 files, 27 tests passed.
- `npm run build`: success; initial bundle 742 kB raw (budget raised, see docs/performance.md).
- `npm run e2e`: 5 passed, twice in a row (full Chromium headless, SwiftShader WebGL).
- Visual check: screenshots of default isometric and Front views at 1280×720 inspected.
- Issues found and fixed during this change:
  - The sloped free face of the terrain sat in front of the blocks' south face and hid it from the default view. The face was made vertical at the block boundary (spec scenario "Blocks are below the surface" still holds).
  - `pickAt`/`projectBlock` used camera matrices from the previous frame, so a click right after a camera preset could resolve against the old view. Both now update the camera matrices first (caught by the e2e "Top preset" test).
  - Playwright's headless shell intermittently stalled on mouse input after a previous WebGL page closed; switched to full Chromium headless (`channel: 'chromium'`).

## Workflow follow-up

- Validate with `openspec validate foundation-and-synthetic-scene --strict` and archive with `openspec archive foundation-and-synthetic-scene` once all tasks are verified.
