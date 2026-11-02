# Tasks

## 1. Domain and worker

- [x] 1.1 Implement `generateSurfacePoints` in `src/app/domain/point-cloud.ts`; verify unit tests for determinism, on-surface tolerance, extent, dropout range and tier counts
- [x] 1.2 Implement the worker and `PointCloudClient` with request ids and transferables; verify the stale-response unit test with a fake worker passes
- [x] 1.3 Measure generation time per tier in the worker and on the main thread; record in docs/performance.md

## 2. Renderer and UI

- [x] 2.1 Implement `PointCloudLayer` (THREE.Points, round-point shader, height/natural colour, size) and dispose path; verify in the browser
- [x] 2.2 Add point cloud controls (toggle, density, size, colour), status (generating / count / error) and the "Synthetic surface scan" label; verify via Playwright that density changes the count, rapid switching ends on the last choice, and metrics are unchanged

## 3. Integration

- [x] 3.1 Run `npm test`, `npm run typecheck:e2e`, `npm run build`, `npm run e2e`, `openspec validate --all --strict`; record results here

## Verification record (2026-11-03)

- `npm test`: 8 files, 79 tests passed (6 point-cloud tests, 4 stale-response client tests).
- `npm run typecheck:e2e`: no errors.
- `npm run build`: success; the worker is emitted as a separate 2.5 kB chunk.
- `npm run e2e`: 22 passed, two consecutive runs (~35 s).
- Visual check at 1280×720: 100k points over the terrain at t = 0 and t = 1, label visible.
- Generation: 15 / 42 / 132 ms for 100k / 300k / 1M in Node; see docs/performance.md.

### Notes

- Elevation colours were toned down after the first visual check because the points overpowered the block colours.
- Rendering performance (FPS) for 100k and 1M points on a real GPU is measured in change 05, not here.
- Material samples (optional enhancement) are not implemented.

## Workflow follow-up

- Archive with `openspec archive surface-point-cloud` after verification.
