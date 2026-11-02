# Design

## Context

The terrain height function is a pure domain function, so it can run inside a Worker. Generating 1M points with noise is expected to take long enough on the main thread to drop frames, which is why the Worker is introduced here and not for blocks (see docs/performance.md).

## Goals / Non-Goals

**Goals:** smooth UI while 1M points generate; one GPU buffer per cloud; no duplicate long-lived copies; stale-response safety.

**Non-Goals:** LAS/LAZ, Potree/octree streaming, point picking, material samples (optional enhancement, not in this change).

## Decisions

### D1. Sampling
A √N × √N stratified grid over the terrain extent, one jittered sample per cell (`mulberry32` seeded by seed + tier). Height = `terrainHeight(x, y) + noise`, noise ~ N(0, 0.025 m) clamped to ±0.1 m (Box–Muller). Dropout: a point is skipped when seeded value noise at 1/18 m⁻¹ exceeds 0.62 (spatially coherent holes, ~10–20 % loss). The vertical free face is a heightfield discontinuity and is therefore not sampled — a 2.5D scan, stated in the UI note.

### D2. Worker protocol and ownership
Request `{ id, seed, params, tier }` → response `{ id, positions: Float32Array, count, bounds, ms }` with `positions.buffer` in the transfer list. After `postMessage`, the worker never touches the buffer again (it is detached). On the main thread `PointCloudClient` keeps only the latest request id; responses with another id are dropped. The client accepts any `{ postMessage, onmessage, terminate }` object, so it is unit-tested with a fake worker.

### D3. Buffers
Positions arrive in domain coordinates; the renderer converts them in place to render coordinates (`WorldFrame` translation) — the received buffer is owned by the renderer from then on, no copy. The `Float32Array` is kept as the `BufferAttribute` array (needed for re-upload after WebGL context restore): one CPU copy plus one GPU copy, about 12 MB each at 1M points. Colour is computed in the shader from Z, so no colour buffer exists.

### D4. Round points
`ShaderMaterial` with `gl_PointSize = uSize * uPixelRatio` and `discard` outside the unit circle in the fragment shader. Opaque with depth write (no blending), so there is no sorting and no transparency halo; antialiasing of the edge is left to MSAA.

## Risks / Trade-offs

- [Points coincide with block tops over the footprint] → blocks are drawn at 94 % scale (tops 6 cm below the surface), so points sit on top without z-fighting.
- [1M points slow on weak GPUs] → stress tier only; default 100k; measured in change 05.
