# Case study — Blast Movement Explorer

## Problem

After a blast, rock moves. A dig plan drawn on pre-blast grade boundaries can then dig
waste and leave ore behind. The product question is visual and quantitative: where was
the ore, where did it go, and what does keeping or adjusting the dig region do to ore
loss and dilution? This project answers that question **with synthetic data and an
illustrative movement rule**, to demonstrate 3D web engineering, not to predict blasts.

## Role and scope

Sole engineer and tech lead, working with AI coding agents under a spec-driven process
(OpenSpec). Scope: data generation, rendering, interaction, analysis, IO, performance
measurement, tests and documentation. Out of scope by design: real data, physics,
backend, auth, optimisation of dig regions.

## Key technical decisions

| Decision | Why | Alternative rejected |
|---|---|---|
| Pure TS domain layer (generation, movement, metrics) | Testable without WebGL; reusable in a Worker; metrics provably independent of the view | Logic inside components / renderer |
| Z-up rendering, one translation-only `WorldFrame` | Mining coordinates are Z-up; no axis swaps to get wrong in presets, sections or picking | Converting to Three.js Y-up everywhere |
| One `InstancedMesh`, movement in the vertex shader | One draw call for 28,800 blocks; animation = one uniform per frame | Per-block meshes; rewriting instance matrices per frame |
| CPU ray–AABB picking with the shader's exact rule | Picks what is drawn at any t, with filters and section; < 1 ms per click | `InstancedMesh.raycast` (sees only instance matrices) |
| Instance compaction for filters, shader rule for section | Filters don't depend on t (compact once); section does (evaluate per frame on GPU and per click on CPU) | Material clipping planes (pick/visual mismatch) |
| Signals for parameters/summaries only; zoneless | No per-frame change detection; large arrays never become reactive | Global state library; Zone.js |
| Worker only for point clouds | Measured: 1M points 132 ms vs blocks 25 ms, analysis 0.3 ms | Moving everything to Workers "just in case" |
| Centre-point dig rule, N/A for zero denominators | Simple, explainable, testable by hand | Partial-volume intersection (scope) |

## Verification

- **Unit (Vitest, 80 tests):** determinism and seed sensitivity, invalid values, spatial
  coherence, tonnage, cutoff equality, exact interpolation endpoints, movement bounds
  and invariants, metrics on hand-built fixtures (including an example JSON fixture with
  hand-computed results), empty region / no ore / full extraction, CSV, 13 config
  rejection cases, stale worker responses, coordinate round-trip, picking math.
- **E2E (Playwright, 36 tests):** loading, camera presets, selection, empty click and
  drag, movement and picking at t = 0.5 / 1, playback/pause, filters, section, hidden
  selection clearing, region edits change only C, view changes never change metrics,
  CSV and config round trip, invalid files, point cloud tiers and stale switching,
  lifecycle (no accumulating renderers/frames/geometries), idle loop, context loss,
  benchmark, sub-path build, selection outline, quality on a 2× display, reduced motion
  with a failing control case.
- **Real GPU benchmark:** headed Chromium on the reference machine; results and the
  frame-pacing caveat in docs/performance.md.
- **Independent review:** a separate agent checked specs against tests (docs/agent-workflow.md).

## Problems found along the way (real)

- The sloped free face of the terrain hid the blocks' south face; it was made vertical.
- Picking right after a camera preset used the previous frame's matrices.
- Software WebGL in CI-style headless runs takes ~0.4 s per frame, which made input
  timing flaky; tests now use Low quality and reduced motion, and never race frames.
- Moved blocks overlap; a picking test chose an ambiguous overlap edge.
- Chromium picked the integrated GPU on a dual-GPU machine despite
  `powerPreference: 'high-performance'`; both adapters are now benchmarked.

## Limits

Synthetic data; illustrative movement with overlaps; centre-point metrics; rectangle
regions only; 2.5D scan without the vertical face; frame-interval benchmarks capped by
the display's frame pacing; desktop-first layout; no material samples, PLY/XYZ import or
synchronised dual viewports (optional enhancements not done).
