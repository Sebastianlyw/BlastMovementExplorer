# Tasks

## 1. Domain

- [x] 1.1 Implement `filtering.ts` (visibility mask) with unit tests for grade range, ore-only and cutoff equality
- [x] 1.2 Implement `dig-analysis.ts` (region inclusion, metrics, original-region derivation, mean-displacement offset); verify the hand-made fixtures (3-block example, empty region, no ore, full extraction, inclusive boundary) and the "view settings do not change metrics" test pass
- [x] 1.3 Implement `scene-config.ts` (build, serialise, validate, parse) and `csv.ts`; verify round-trip and every rejection case in unit tests

## 2. Renderer

- [x] 2.1 Add `DigRegionLayer` (original and adjusted rectangles as vertical wireframe boxes) and wire mask and section; verify in the browser

## 3. UI and state

- [x] 3.1 Add filter and section controls, empty state, and hidden-selection clearing with a notice; verify via Playwright (empty state, hidden block not selectable, selection cleared)
- [x] 3.2 Add dig region inputs, the analysis table (A/B/C, tonnes, %, N/A, demo label) and the offset helper; verify via Playwright that region edits change C only and layer/section toggles change nothing
- [x] 3.3 Add Export CSV, Export config and Import config with error messages; verify via Playwright the download contents, round trip and invalid-file message

## 4. Integration

- [x] 4.1 Measure analysis time and record it in docs/performance.md
- [x] 4.2 Run `npm test`, `npm run typecheck:e2e`, `npm run build`, `npm run e2e`, `openspec validate --all --strict`; record results here

## Verification record (2026-11-03)

- `npm test`: 6 files, 69 tests passed (includes 13 config rejection cases and hand-built metric fixtures).
- `npm run typecheck:e2e`: no errors.
- `npm run build`: success, initial 786 kB raw / 180 kB transfer.
- `npm run e2e`: 19 passed, three consecutive runs (~30 s each).
- `openspec validate --all --strict`: passed.
- Analysis timing: `computeScenarios` median 0.33 ms (Node 24), so no Worker is used.
- Visual check at 1280×720: ore-only + section at Z = 12 m, both regions drawn, analysis table fits the right panel.

### Notes and deviations

- Default scene result (cutoff 0.8 g/t): ore loss A 14.7 %, B 19.1 %; "Offset by mean ore displacement" moves the adjusted region 2.9 m south and gives C 16.4 %. These are outputs of the generator and formulas, not tuned targets.
- The top-bar "Reset" now restores default cutoff, filters, section and display settings as well as reloading the scene.
- Problems found and fixed: `isFilterActive` treated the default max grade as an active filter; the analysis table overflowed the right panel at 1280 px; the timeline help text overlapped the slider (it is now a tooltip plus a screen-reader description); a unit test used a valid range as its "invalid" case; an e2e assertion expected `sel-id` to exist after a click on empty space.
- The configuration already carries point-cloud display fields (`layers.pointCloud`, `pointDensity`, `pointSize`) so the format does not change in change 04.

## Workflow follow-up

- Archive with `openspec archive filtering-and-dig-analysis` after verification.
