# Tasks

## 1. Diagnostics and benchmark

- [x] 1.1 Add the closable diagnostics panel with the measurement-type note; verify via Playwright it shows draw calls and instances
- [x] 1.2 Implement `runBenchmark` (fixed orbit + movement loop, 2 s warm-up, 10 s sampling, environment capture, JSON download, `?benchmark=auto`); verify via Playwright that a result appears (headless numbers are not recorded as performance)
- [x] 1.3 Run the benchmark headed on the reference machine for default (100k points, High) and stress (1M points) configurations; record real numbers, environment and gap to target in docs/performance.md

## 2. Lifecycle and robustness

- [x] 2.1 Add lifecycle and context-loss hooks; verify via Playwright repeated scene/quality switches do not accumulate renderers, frames or geometries, and that context loss/restore works
- [x] 2.2 Verify idle rendering stops (no pending frames, frame count stable) via Playwright

## 3. Delivery

- [x] 3.1 Add `--prefix` to the static server and a sub-path e2e check; verify the app and worker load under `/BlastMovementExplorer/`
- [x] 3.2 Write README, docs (architecture, data model, performance, agent workflow, demo script, case study), assets-attribution.md and examples; verify commands in README run as written
- [x] 3.3 Independent spec-to-test review by a separate agent; triage findings and fix confirmed gaps

## 4. Integration

- [x] 4.1 Run `npm run verify` end to end; record results here

## Verification record (2026-11-03)

- `npm run verify`: unit 9 files / 80 tests passed; e2e type-check clean; `build` and `build:pages` succeeded (initial 809 kB raw / 185 kB transfer); e2e 36 passed; `openspec validate --all --strict` 9 passed.
- E2E repeated: 36 passed in three consecutive runs (~1.4 min each).
- Benchmark (headed Chromium 156, 1280 × 720 viewport, DPR 1): Intel UHD 730 and AMD RX 7700 XT, 4 configurations each; results and the 54 Hz frame-pacing ceiling of this machine in docs/performance.md and benchmarks/results/.
- README commands: `npm test`, `npm run typecheck:e2e`, `npm run build`, `npm run build:pages`, `npm run e2e`, `npm run benchmark` (both variants), `npx openspec validate --all --strict` were all run in this change. `npm start` was checked by starting `ng serve` on a spare port and fetching the page (title and `<app-root>` served); the in-browser behaviour is covered by the e2e suite against the production build.
- Independent review: 11 findings, all accepted; fixes and new tests listed in docs/agent-workflow.md.

### Notes and deviations

- Chromium chose the integrated GPU by default; the benchmark script gained `--discrete-gpu` (`--force_high_performance_gpu`).
- `?points=` URL parameter added so the scripted benchmark can include the point cloud.
- Point colour mode was added to the configuration format (`display.pointColorMode`) after the review; the format had not been published, so the schema version stays 1.
- Publishing to GitHub / Pages is not part of this change.

## Workflow follow-up

- Archive with `openspec archive performance-and-delivery` after verification.
- Publishing (GitHub push and Pages deploy) happens after archive, on the owner's explicit request.
