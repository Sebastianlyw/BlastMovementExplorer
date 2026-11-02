# Proposal

## Why

A surface point cloud is how mine sites usually see their terrain, and rendering hundreds of thousands to a million points is a core 3D web performance skill. It must stay visually separate from the block model: a scan cannot tell you grade or tonnes.

## What Changes

- Generate a synthetic pre-blast surface scan by sampling the same procedural terrain height function: jittered stratified sampling, small seeded measurement noise and deterministic spatially coherent dropout zones. Density tiers ≈ 100k, 300k and 1M points (target counts before dropout); 1M is a stress tier.
- Generate points in a Web Worker and transfer the position buffer; stale responses from superseded requests are dropped.
- Render as a single `THREE.Points` with a small round-point shader, coloured by height or a fixed natural colour; controls for visibility, density, point size and colour.
- Label it "Synthetic surface scan" everywhere it appears; it never feeds metrics.

## Capabilities

### New Capabilities
- `surface-point-cloud`: generation, display and labelling of the synthetic surface scan, and its independence from metrics.

### Modified Capabilities

(none — the point-cloud display fields already exist in the configuration format)

## Impact

- `src/app/domain/point-cloud.ts`, `src/app/workers/point-cloud.worker.ts`, `src/app/workers/point-cloud-client.ts`, `src/app/renderer/point-cloud-layer.ts`, UI controls.
- Angular `webWorkerTsConfig` (`tsconfig.worker.json`) added via `ng generate web-worker`.
