# Agent workflow — what actually happened

This records the real process used to build the project with AI coding agents. The
product itself has no AI features; agents were a development tool.

## Tools and versions

- Main agent: Claude Code (Claude Opus 5.5) acting as tech lead and implementer.
- Specs: OpenSpec 1.16.0 (`@fission-ai/openspec`, pinned dev dependency), schema
  `spec-driven`, initialised with `openspec init --tools claude --language English`.
- OpenSpec's Claude integration installs `/opsx:*` commands and skills under `.claude/`.
  They were not loaded in the session that ran `init`, so the first change was driven by
  the equivalent, verified CLI steps (`openspec new change`, `openspec instructions <artifact>`,
  `openspec status`, `openspec validate --strict`, `openspec archive`). Later in the
  session the skills became available and the archive skill (`openspec-archive-change`)
  was used for change 01; it delegates to the same CLI.
- Independent reviewer: one separate subagent (general-purpose, read-only by instruction)
  briefed with [steering/spec-to-test-review.md](steering/spec-to-test-review.md).

## Process per change

For each of the five changes:

1. `openspec new change <name>` → write `proposal.md`, delta specs with Given/When/Then
   scenarios, `design.md` and `tasks.md` from `openspec instructions` templates →
   `openspec validate <name> --strict`.
2. Implement the smallest runnable increment, with unit tests in the same step.
3. Build, inspect screenshots of the real WebGL output at 1280 × 720, write Playwright
   tests, run the suite repeatedly to catch flakiness.
4. Tick tasks only after their verification ran; add a "Verification record" with actual
   command results and any deviations to `tasks.md`.
5. `openspec archive <name> --yes` (merges deltas into `openspec/specs/`), validate all, commit.

| Change | Capabilities | Unit tests after | E2E after |
|---|---|---|---|
| foundation-and-synthetic-scene | synthetic-dataset, scene-viewer, block-inspection | 27 | 5 |
| movement-and-inspection | block-movement (+ inspection, viewer) | 38 | 11 |
| filtering-and-dig-analysis | view-filtering, dig-analysis, scene-config-io | 69 | 19 |
| surface-point-cloud | surface-point-cloud | 79 | 22 |
| performance-and-delivery | render-performance, static-delivery | 80 (after review: one vacuous test removed, others strengthened) | 36 |

## Division of responsibilities

The brief allowed up to three parallel implementation agents (data, rendering, review).
In practice the main agent implemented data, rendering and UI **sequentially**: the
interfaces (typed-array block model, `SceneRenderer` API, store) were changing in every
change, and splitting files between agents would have cost more coordination than it
saved. Parallelism was used once, where it was cheap and safe: the independent reviewer
ran (read-only) while the main agent wrote documentation.

## One requirement, end to end (real example)

Requirement *"Hidden blocks are not pickable"* (view-filtering):

1. Design decision (change 03 design D4/D5): grade filters compact instances (they don't
   depend on t); the section is evaluated per block in the vertex shader **and** by the
   CPU picker with the same expression, because it depends on the interpolated position.
2. Implementation: `BlockLayer` (`compact()`, `BEGIN_VERTEX`, `pick()` with
   `isVisibleAt`), `SceneRenderer.isBlockDrawn`, and a viewport effect that clears a
   hidden selection with a notice.
3. Tests: unit (`pickNearest` honours the visibility predicate and interpolation),
   e2e (`blocks above the section are neither drawn nor pickable`, `ore-only clears a
   selected waste block with a notice`).
4. A real defect found on the way: the first e2e version expected `sel-id` to exist after
   clicking where only hidden blocks were — the test was wrong (nothing is selected), and
   was rewritten to assert against whatever the picker reports at that pixel.

## Problems found during the work (not invented)

- Terrain free face occluded the block model (fixed: vertical face).
- Stale camera matrices in `pickAt` right after a preset (fixed: update matrices first).
- Headless Chromium shell stalled on input after earlier WebGL pages; switched to full
  Chromium. Then SwiftShader frames (~0.4 s) made Pause/drag tests race the playback; fixed
  in tests (Low quality, reduced motion, no frame races) and documented.
- Zoneless effects flush asynchronously; tests now poll instead of reading immediately.
- `isFilterActive` treated the default max grade as a filter (fixed with dataset max).
- Analysis table and timeline overflowed at 1280 px (fixed after screenshots).
- Chromium chose the integrated GPU; the benchmark now also runs with
  `--force_high_performance_gpu`, and both are reported.

## Independent review

A separate subagent (no write access by instruction, briefed with
[steering/spec-to-test-review.md](steering/spec-to-test-review.md)) reviewed all specs against
the code and tests after change 05 was implemented. It ran the unit tests (81 passed) and a
probe script; it did not run Playwright. It reported 1 likely bug, 6 test gaps and
4 boundary/doc issues. The main agent triaged every item; all were accepted:

| # | Finding | Outcome |
|---|---|---|
| 1 | Changing quality or scene during a benchmark disposed the renderer without settling the benchmark promise, leaving the button stuck on "running" | **Bug fixed**: `abortBenchmark()` rejects on dispose / scene change; the UI shows a notice and resets |
| 2 | "Low quality = DPR 1" test passed trivially at device scale 1 | Replaced: 2× display context, High → 2, Low → 1, metrics unchanged |
| 3 | Reduced-motion test could not detect inertia | Replaced: counts frames after release, with a `no-preference` control that must exceed 5 frames |
| 4 | Unit test "view filters cannot influence metrics" compared two identical calls | Removed (the e2e test is the real guard) |
| 5 | Hidden-selection clearing tested only for ore-only | Added section, block-layer-off and movement-crossing-section e2e tests |
| 6 | Selection outline never asserted | Added `selectionOutline()` hook and an e2e test (position, follows t, cleared) |
| 7 | Three coordinate offsets computed outside `WorldFrame` | Moved to `WorldFrame.zToRender` / `bufferToRenderInPlace` |
| 8 | float32 grades vs double cutoff at exact ties | Documented (data-model.md, numeric precision); behaviour is consistent across UI and metrics |
| 9 | Picking used full block size while blocks are drawn at 94 % | **Fixed**: pick boxes use the drawn size, so clicks in visual gaps select nothing |
| 10 | Point colour mode not saved in the config | Added `display.pointColorMode` (validated) |
| 11 | Minor gaps (all point tiers on surface, N/S/Z continuity, original region vs cutoff, legend vs filters, E/N/Up labels) | Tests added |

The review was useful mainly for test strength: three tests (2, 3, 4) would have
kept passing with the behaviour broken. Those three were weak tests written by the
main agent, not product failures.
