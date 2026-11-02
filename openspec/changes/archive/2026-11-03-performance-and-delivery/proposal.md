# Proposal

## Why

The portfolio claim is "production-grade 3D web": that needs measured performance on a documented machine, visible diagnostics, verified resource cleanup, graceful degradation, and a build that deploys as static files. Quality presets and reduced-motion behaviour were implemented in change 02 without a spec; this change specifies them.

## What Changes

- Specify rendering quality presets (High / Medium / Low) and reduced-motion behaviour (no camera inertia, playback only on user action).
- Add a closable diagnostics panel: frame interval median, draw calls, triangles, points, instances, geometries, textures, DPR, canvas size, quality; with an explicit note that these are browser frame intervals and renderer object counts, not GPU timings or memory bytes.
- Add a repeatable benchmark (2 s warm-up + 10 s sampling over a fixed camera orbit with movement playback) that reports median and p95 frame interval plus environment and scene details, downloadable as JSON.
- Verify resource lifecycle (no accumulating renderers or render loops after repeated scene and quality changes) and WebGL context loss / restore.
- Make the production build deployable under a sub-path (GitHub Pages style) and document it.
- Delivery documentation: README, architecture, data model, performance, agent workflow, demo script, case study, asset attribution, examples.

## Capabilities

### New Capabilities
- `render-performance`: quality presets, on-demand rendering, reduced motion, diagnostics, benchmark, resource lifecycle and context loss.
- `static-delivery`: static, sub-path-deployable build with no backend.

### Modified Capabilities

(none)

## Impact

- Renderer: benchmark driver, stats additions. UI: diagnostics panel. E2E: lifecycle, context-loss, sub-path tests.
- New docs and examples; no new dependencies.
