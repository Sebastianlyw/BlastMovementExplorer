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
measured to block the main thread (see the point-cloud section once added).

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
