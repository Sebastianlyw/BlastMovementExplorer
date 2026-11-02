# Design

## Context

The renderer already renders on demand, counts live instances and pending frames, and reports stats at 2 Hz. Headless Chromium uses SwiftShader, so performance must be measured in a headed browser on real hardware (docs/performance.md).

## Goals / Non-Goals

**Goals:** measurements another person can repeat; lifecycle checks that would catch leaks; a deployable artifact.

**Non-Goals:** GPU timer queries (`EXT_disjoint_timer_query`) — availability varies and mixing them with frame intervals is misleading; automated performance gating in CI; publishing the site (requires the owner's authorisation and is done outside this change).

## Decisions

### D1. Benchmark inside the renderer
`SceneRenderer.runBenchmark()` takes over the camera: it orbits the target at constant radius and elevation (one revolution per 10 s), loops movement t with a triangle wave, and requests a frame every RAF. Frame intervals are recorded from RAF timestamps after the warm-up. Camera and t are restored afterwards. Only browser frame intervals are reported; the result states this. A URL flag `?benchmark=auto` starts it after load so a script (Playwright headed) can run it unattended and read `window.__bmx.lastBenchmark()`.

### D2. Environment capture
UA string, `WEBGL_debug_renderer_info` unmasked renderer when exposed (otherwise "not exposed"), viewport CSS size, DPR, canvas pixel size, quality, dataset seed / generator version, block count, point count, draw calls and triangles from the last frame.

### D3. Lifecycle verification in e2e
Debug hook exposes `lifecycle()` (live renderers, pending frames, geometries, framesRendered). The test switches scene ×3 and quality ×2, waits for idle, and compares with a fresh load. Geometry count from `renderer.info.memory` is used as a leak indicator, not as a memory size.

### D4. Context loss test
`WEBGL_lose_context` from the test (via the debug hook's `loseContext()` / `restoreContext()`), checking the overlay and that picking still works after restore.

### D5. Sub-path
Angular `--base-href`; the worker is referenced with `new URL(..., import.meta.url)`, which the builder resolves relative to the chunk, so it works under a sub-path. Verified by serving the build under a prefix with the repo's static server (`--prefix` option).

## Risks / Trade-offs

- [Benchmark varies with background load and display refresh rate] → environment captured; numbers reported with refresh-rate caveat (RAF is capped at the display rate).
