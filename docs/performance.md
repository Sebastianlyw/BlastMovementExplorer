# Performance

All numbers in this file were measured; nothing is estimated. Each entry states
the environment, what was measured and how. Targets are listed separately from
results.

## Reference machine

| Item | Value |
|---|---|
| OS | Windows 11 Pro 10.0.26200 |
| CPU | Intel Core i5-14400 |
| GPU | AMD Radeon RX 7700 XT (also Intel UHD 730 iGPU present) |
| RAM | 64 GB |
| Node | 24.21.0 |

## Dataset generation (main thread)

Default scene: seed 20261103, generator 1.0.0, 60 × 40 × 12 = 28,800 blocks.

| Where | How measured | Result |
|---|---|---|
| Node 24 (esbuild bundle of `generateDataset`) | `performance.now()` around one call, 3 runs | 24–26 ms |
| Headless Chromium 156 (Playwright) | `performance.now()` in `ExplorerStore.loadPreset`, shown in the Scene panel | 20–21 ms |

**Decision:** block generation stays on the main thread. At ~25 ms it is shorter
than two frames and only runs on scene load. A Worker is reserved for work
measured to block the main thread (see the point-cloud section).

## Dig analysis and filtering (main thread)

Node 24, default dataset, 200 runs after 20 warm-up runs (2026-11-03):

| Operation | Median | p95 |
|---|---|---|
| `computeScenarios` (A, B, C over all 28,800 blocks) | 0.33 ms | 0.62 ms |
| `buildVisibilityMask` (ore-only) | 0.07 ms | — |

**Decision:** analysis and filtering stay on the main thread; a Worker would cost more
in message passing than the computation itself.

## Surface point cloud generation

Node 24, `generateSurfacePoints`, median of 5 runs after one warm-up (2026-11-03):

| Tier | Points (after dropout) | Time | Position buffer |
|---|---|---|---|
| ~100k | 95,738 | 15 ms | 1.1 MB |
| ~300k | 287,529 | 42 ms | 3.5 MB |
| ~1M | 958,564 | 132 ms | 11.5 MB |

In the browser the same work runs in a module Web Worker (the UI shows the worker time;
14–16 ms for 100k in headless Chromium). The buffer is transferred, not copied.

**Decision:** 132 ms would block about eight 60 Hz frames, so point generation runs in a
Worker. The renderer keeps one CPU copy (needed to re-upload after a WebGL context
loss) and one GPU copy; colour is computed in the shader, so there is no colour buffer.

## Bundle size

The production initial bundle is ~740 kB raw / ~170 kB transferred, most of it
Three.js. The Angular default budget (500 kB warning) was raised to 900 kB
warning / 1.2 MB error in `angular.json`; the 3D viewport is the core of the
product, so it is not deferred.

## Headless test rendering (not a performance result)

Playwright runs Chromium 156 headless with SwiftShader (CPU) WebGL:
`ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero)), SwiftShader driver)`.

Measured with a `requestAnimationFrame` timestamp log during playback of the default
scene at 1280 × 720 (2026-11-03): idle frames ~31 ms, frames that render the scene
**~430 ms** each, even at Low quality (no MSAA, DPR 1). The scene is ~420k triangles
and ~690k vertex-shader invocations per frame, all on the CPU.

Consequences, handled in the e2e setup rather than hidden:

- Functional e2e runs use `?quality=low` and `reducedMotion: 'reduce'` (no camera
  inertia, which would otherwise render ~100 slow frames after every drag).
- Tests never rely on wall-clock timing against rendered frames (e.g. Pause is
  dispatched without Playwright's two-frame stability wait).
- These numbers say nothing about real GPU performance; see the benchmark section.

## Rendering benchmark (real GPU, headed Chromium)

**How to repeat:** `npm run build && npm run benchmark` (integrated/default adapter) and
`npm run benchmark -- --discrete-gpu` (adds Chromium's `--force_high_performance_gpu`).
The script opens the production build in a **headed** Chromium 156 window at a
1280 × 720 viewport with `?benchmark=auto`; the app then orbits the camera once per 10 s
at the isometric radius/elevation while looping movement t (4 s triangle wave), renders
every animation frame, discards a 2 s warm-up and samples 10 s. Raw JSON is in
`benchmarks/results/`. The in-app "Diagnostics → Run benchmark" button runs the same
procedure.

**What is measured:** browser frame intervals from `requestAnimationFrame` timestamps
(median, p95, max). This is not GPU timing, and it cannot go below the browser's frame
pacing. Draw calls / triangles / points come from `renderer.info` for the last frame.

Environment (2026-11-03): Windows 11 Pro 10.0.26200, Intel Core i5-14400 (16 logical
cores), 64 GB RAM, Chromium 156 (Playwright build). 3D canvas 672 × 631 CSS px (the
viewport between the side panels), DPR 1. Dataset: seed 20261103, generator 1.1.0,
28,800 block instances; 6 draw calls and 398,402 triangles per frame.

| Config | GPU (ANGLE D3D11) | Quality | Surface points | Median | p95 | Max |
|---|---|---|---|---|---|---|
| default | Intel UHD 730 (iGPU) | High | 95,738 | 18.6 ms | 20.5 ms | 23.3 ms |
| blocks-only | Intel UHD 730 | High | 0 | 19.0 ms | 20.8 ms | 24.1 ms |
| stress-1m | Intel UHD 730 | High | 958,564 | **38.0 ms** | **59.0 ms** | 93.0 ms |
| stress-1m-low | Intel UHD 730 | Low | 958,564 | 18.4 ms | 20.1 ms | 23.0 ms |
| default | AMD Radeon RX 7700 XT | High | 95,738 | 18.9 ms | 20.5 ms | 22.0 ms |
| blocks-only | AMD Radeon RX 7700 XT | High | 0 | 19.0 ms | 21.0 ms | 23.2 ms |
| stress-1m | AMD Radeon RX 7700 XT | High | 958,564 | 18.8 ms | 20.5 ms | 22.6 ms |
| stress-1m-low | AMD Radeon RX 7700 XT | Low | 958,564 | 18.5 ms | 20.3 ms | 22.1 ms |


**Frame-pacing ceiling.** An empty page in the same headed Chromium measured a median
rAF interval of **18.5 ms** (both adapters), i.e. ~54 Hz. Windows reports no refresh rate
for the displays and a Microsoft Remote Display Adapter is present, so this machine's
frame pacing is set by its (likely remote/virtual) display, not by the app.

**Reading the results honestly:**

- Every configuration except iGPU + 1M points + MSAA runs at the environment's
  frame-pacing ceiling: the app adds no measurable frame time over an empty page. The
  actual GPU headroom on the RX 7700 XT cannot be inferred from these numbers.
- Target "45–60 FPS for 28,800 blocks + 100k points": met on both GPUs here
  (~53 FPS = the 54 Hz ceiling). Not yet measured on a 60/120 Hz local display.
- Target "1M points at least operable": on the integrated GPU, High quality gives
  ~26 FPS median (p95 59 ms). Switching to **Low quality** (no MSAA, DPR 1) brings it back
  to the ceiling (18.4 ms), so the documented degradation path for weak GPUs is the
  Low preset.
- Main-thread long tasks are avoided by design (block generation ~25 ms on load; 1M point
  generation in a Worker), but no long-task trace was recorded.
