# AGENTS.md — engineering rules for agents working on Blast Movement Explorer

## Toolchain

- Node **24.21.0** (`.nvmrc`). The machine default may be older; prefix commands with the nvm path, e.g. `PATH="$APPDATA/nvm/v24.21.0:$PATH"` in Git Bash.
- Angular 22.2 (standalone, **zoneless**, signals), TypeScript 6.0 strict, Three.js **0.186.1** (pinned), Vitest 5 via `ng test`, Playwright 1.64 (full Chromium, `channel: 'chromium'`), OpenSpec 1.16.
- Do not upgrade pinned versions without recording why in the relevant OpenSpec change.

## Commands

| Purpose | Command |
|---|---|
| Dev server | `npm start` |
| Unit tests | `npm test` |
| Production build | `npm run build` |
| E2E (needs a build; serves `dist/` on :4310) | `npm run e2e` |
| Static preview of the build | `npm run preview` |
| Spec validation | `npx openspec validate --all --strict` |
| Everything | `npm run verify` |

## Module boundaries

```
src/app/domain    pure TS: generation, movement, filtering, metrics, config IO. No Angular, no Three.
src/app/renderer  Three.js only. Owns every GPU resource. Talks to UI via SceneRenderer methods + callbacks.
src/app/state     Angular signal store. Parameters, ids, summaries — never Three objects or big arrays.
src/app/ui        Angular components. Never import three.
src/app/workers   Web Worker entry points (only for work measured to block the main thread).
```

## Data and units

- Coordinates: local mine frame, **X East, Y North, Z Up, metres, right-handed**. No EPSG. Label it "Local coordinates".
- The renderer is Z-up too (`camera.up = (0,0,1)`); `WorldFrame` is the only conversion (translation only). Never swap axes elsewhere.
- Grade g/t, density t/m³, tonnes = true block volume × density (never visual scale).
- Ore/waste = `grade >= cutoff` at query time; never stored.
- Block model is authoritative for metrics. Surface point cloud and material samples are visual only.
- Movement interpolation: `p(t) = (1−t)·before + t·after`, exact at t = 0 and t = 1. `t` is not time.
- Datasets are deterministic for (seed, generatorVersion, params). Bump `GENERATOR_VERSION` when output changes.

## Performance rules

- One `InstancedMesh` for blocks, one `THREE.Points` per point cloud. No per-item `Object3D`.
- Render on demand (`invalidate()`); continuous frames only while damping, animating or benchmarking.
- Never write signals per frame. Stats ≤ 2 Hz; UI indicators are updated by direct DOM writes.
- Picking must use the same visibility rules and interpolated positions as the shader.

## Resource lifecycle

- Every geometry, material, texture, controls, listener, observer, timer, RAF and Worker created by the renderer is released in `dispose()`.
- `SceneRenderer.liveInstances` / `pendingFrames` must return to their previous values after a viewport is destroyed (checked in e2e).
- Workers: after transferring a buffer, never touch the source again; stale responses are dropped by request id.

## Honesty rules

- Never invent results: test outcomes, performance numbers, URLs or reviews must come from an actual run. Unrun checks are written as **Not run** with the reason.
- The product must not claim blast-physics prediction or AI capability. Keep the "Synthetic data · Illustrative movement" label visible.
- Mark OpenSpec tasks done only after their verification ran.
