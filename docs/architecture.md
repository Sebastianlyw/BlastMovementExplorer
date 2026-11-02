# Architecture

## Layers

```
┌──────────── src/app/ui (Angular standalone components, zoneless, signals) ───────────┐
│ App shell · ControlPanel · ViewFilters · DigRegionPanel · PointCloudControls          │
│ Viewport (owns the renderer + point-cloud worker client) · Timeline · Inspector       │
│ AnalysisPanel · SceneIo · DiagnosticsPanel                                            │
└───────────────┬───────────────────────────────────────────────┬───────────────────────┘
                │ signals (params, ids, summaries)              │ method calls / callbacks
┌───────────────▼───────────────┐               ┌───────────────▼───────────────────────┐
│ src/app/state                 │               │ src/app/renderer (Three.js only)       │
│ ExplorerStore: status, preset,│               │ SceneRenderer: camera, controls, loop, │
│ cutoff, t, filters, section,  │               │ picking, benchmark, lifecycle          │
│ regions, analysis (computed), │               │ BlockLayer · TerrainLayer ·            │
│ quality, point-cloud status   │               │ DigRegionLayer · PointCloudLayer       │
└───────────────┬───────────────┘               │ WorldFrame (the only coord conversion) │
                │ pure function calls           └───────────────┬───────────────────────┘
┌───────────────▼───────────────────────────────────────────────▼───────────────────────┐
│ src/app/domain (pure TypeScript — no Angular, no Three.js)                            │
│ random · generator · movement · blocks · filtering · dig-analysis · point-cloud ·     │
│ scene-config · csv                                                                     │
└───────────────────────────────────────▲───────────────────────────────────────────────┘
                                        │ same pure functions
                         src/app/workers/point-cloud.worker.ts (module Worker)
```

Imports point downward only. The UI never imports `three`; the domain never imports
Angular or Three.js, so it runs unchanged in Vitest, Node scripts and the Worker.

## State

`ExplorerStore` (root service) holds **parameters, identifiers and summaries** in signals.
The dataset (typed arrays) lives in a plain field and is announced by an incrementing
`datasetVersion` signal. Analysis is a `computed` over (dataset, cutoff, original
region, adjusted region) only, so view settings cannot reach it by construction.

Movement t reaches the store at most 10 times per second during playback (the renderer
owns playback); FPS and renderer counts reach the UI at 2 Hz; the orientation gizmo and
scale bar are updated by direct DOM writes from the render callback — no signal is
written per frame. The app is zoneless, so `requestAnimationFrame` never triggers
change detection.

## Renderer

- **Coordinates.** Domain and render frames are both Z-up, right-handed, metres:
  `camera.up = (0, 0, 1)` and OrbitControls respects it. `WorldFrame` only subtracts the
  dataset origin (to keep floats small). No module swaps axes.
- **Blocks.** One `InstancedMesh` with a unit box. Per-instance attributes `aBefore`,
  `aAfter`, `aSize` and instance colour; the vertex shader computes
  `centre = (1 − t)·before + t·after` from a single `uT` uniform, so animation costs one
  uniform per frame. `instanceMatrix` stays identity. Visible blocks (grade filters) are
  compacted into the first `count` instances with an `instanceToBlock` map to stable ids.
  The Z section is applied per block in the vertex shader on the *current* centre.
- **Picking.** CPU ray–AABB over the compacted instances using exactly the shader's
  interpolation and section rule, nearest hit wins. Pick boxes use the drawn (94 %) size, so a
  click in the visual gap between blocks selects nothing. Click vs drag is distinguished by
  pointer travel (≤ 4 px) and time (≤ 600 ms). No hover picking.
- **Culling.** The instanced mesh's bounding sphere encloses both movement endpoints.
  No shadows are cast, so there is no shadow-position mismatch.
- **Loop.** `invalidate()` schedules at most one RAF. Frames continue only while
  OrbitControls damping, playback or the benchmark is active. Hidden pages do not render.
- **Quality.** High / Medium / Low set MSAA and the DPR cap; changing quality disposes
  the renderer and creates a new WebGL context (antialias is fixed per context).
- **Lifecycle.** `dispose()` releases layers (geometries, materials), controls, listeners,
  ResizeObserver, the stats timer, any pending RAF, and forces context loss.
  `SceneRenderer.liveInstances` / `pendingFrames` let e2e tests detect leaks.
- **Context loss.** `webglcontextlost` is prevented, rendering stops and an overlay shows;
  on restore rendering resumes (Three.js re-uploads from the kept CPU arrays).

## Workers

Only the surface point cloud is generated off the main thread (1M points take ~130 ms;
see docs/performance.md). `PointCloudClient` tags requests with an id; responses for any
id but the latest are dropped. The position buffer is transferred (the worker never
touches it again) and is then owned by the renderer, which converts it in place.
Block generation (~25 ms) and analysis (~0.3 ms) stay on the main thread because they
were measured to be cheap.

## Data access

All data is generated locally from (seed, generatorVersion, params). There is no API;
scene configuration JSON is the only import. A future API would replace
`generateDataset` behind the store without touching the renderer or UI.

## Testing

- Vitest (Angular `@angular/build:unit-test`, jsdom): domain, renderer math, worker
  client, config parsing, shell smoke test (incl. WebGL-unavailable state).
- Playwright (full Chromium, headless SwiftShader): behaviour only — loading, picking,
  movement, filters, analysis, IO, point cloud, lifecycle, context loss, sub-path build.
  Functional runs use Low quality and reduced motion because software WebGL needs
  ~0.4 s per frame (docs/performance.md).
- Real-GPU benchmark: `scripts/benchmark.mjs` (headed).
