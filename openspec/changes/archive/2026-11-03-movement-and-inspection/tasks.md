# Tasks

## 1. Domain movement

- [x] 1.1 Implement movement params, ranges, validation and the field in `src/app/domain/movement.ts`; verify unit tests for determinism, continuity, vertical bound and range rejection pass
- [x] 1.2 Integrate movement into the generator (after centres, final bounds, generator 1.1.0); verify invariant tests (count, ids, grades, tonnes, nothing removed, final bounds contain all blocks) pass
- [x] 1.3 Implement exact-endpoint interpolation; verify the bit-exact t = 0 / t = 1 test passes

## 2. Renderer

- [x] 2.1 Feed real after centres, add `setMovementT`, playback with low-frequency t reports, selection outline following t; verify in the browser that blocks move
- [x] 2.2 Add colour mode (grade / displacement) and layer visibility (blocks, terrain); verify via Playwright that toggles change the drawn image and the legend

## 3. UI

- [x] 3.1 Add the timeline bar (slider labelled "Movement interpolation t", Play, Pause, Before, After); verify via Playwright that the image changes between t = 0 and t = 1
- [x] 3.2 Add layers and colour controls in the left panel; extend the inspector with before/after/displacement; verify via Playwright that a block picked at t = 1 shows the displacement from the block model

## 4. Integration

- [x] 4.1 Run `npm test`, `npm run build`, `npm run e2e`, `openspec validate --all --strict`; record results here

## Verification record (2026-11-03)

- `npm test`: 4 files, 38 tests passed.
- `npm run typecheck:e2e`: no errors.
- `npm run build`: success, initial 758 kB raw / 173 kB transfer.
- `npm run e2e`: 11 passed, three consecutive runs (18–19 s each).
- `openspec validate --all --strict`: 4 passed.
- Visual check: t = 1 isometric (displacement colour) and Top views at 1280×720 inspected.

### Implementation notes and deviations

- The renderer was split into `BlockLayer` and `TerrainLayer`. `BlockLayer` already supports compaction for a visibility mask and a block-granular Z section, but neither is wired to the UI yet; that happens in change 03.
- A floor plane at the lower-bench elevation was added under the footprint. Before this, moved blocks exposed a hole showing the background.
- Rendering quality presets (High / Medium / Low) and camera inertia disabled under `prefers-reduced-motion` were added here rather than in change 05. They were needed to make e2e deterministic under software WebGL; see docs/performance.md. The scene-viewer spec gains no requirement for them yet; change 05 specifies them.
- Problems found and fixed: e2e assumed an `<output>` has no ARIA role (it is `status`); the timeline re-wrapped when Play changed to Pause, which resized the viewport; tests read renderer state before Angular's zoneless scheduler had flushed effects (they now poll); a pick test was ambiguous where moved blocks overlap (it now selects an unambiguous block).

## Workflow follow-up

- Archive with `openspec archive movement-and-inspection` after verification.
