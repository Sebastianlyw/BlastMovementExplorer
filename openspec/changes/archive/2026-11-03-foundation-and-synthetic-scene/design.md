# Design

## Context

Greenfield Angular 22.2 workspace (zoneless, standalone, Vitest) with Three.js 0.186.1 pinned. See proposal.md for motivation. This change establishes the module boundaries every later change builds on, so the decisions below are deliberately conservative.

## Goals / Non-Goals

**Goals:**
- Layering that keeps the domain pure and testable without WebGL.
- A renderer API small enough that the UI never touches Three.js objects.
- Picking that is exact for axis-aligned blocks and cheap at 28,800 blocks.

**Non-Goals:**
- Movement, filtering, sectioning, dig analysis, point clouds (later changes).
- Web Workers for block generation in this change (measure first; see Decisions).

## Decisions

### D1. Three layers with one-way imports
`domain/` (pure TypeScript, no Angular or Three imports) → `renderer/` (Three.js, owns every GPU resource) → `state/` + `ui/` (Angular). The UI talks to the renderer only through `SceneRenderer`'s public methods and callbacks. *Alternative:* an Angular-wrapped Three.js library — rejected; the portfolio goal is explicit control of render loop and resource lifecycle.

### D2. Structure-of-arrays block model
Blocks are stored as typed arrays (`Float32Array` centres, `Float32Array` grades, `Uint8Array` classes, `Int32Array` ids) inside a non-reactive `BlockModel` object. Signals hold only parameters, ids and summaries. *Alternative:* an array of `Block` objects — rejected for 28,800+ blocks (GC pressure, slow transfer to workers). A `getBlock(model, index)` helper produces a plain `Block` record for the inspector and tests.

### D3. Z-up rendering instead of axis swapping
The scene is rendered in a Z-up frame: `camera.up = (0,0,1)` and OrbitControls respects `camera.up`. A single `WorldFrame` (domain → render: subtract dataset-centre origin; render → domain: add it back) is the only coordinate conversion; no module swaps axes. The origin offset keeps render coordinates small. *Alternative:* convert to Three's Y-up — rejected because every preset, section and pick would need the swap and it is a common source of mirrored scenes.

### D4. One InstancedMesh for blocks, CPU ray–AABB picking
Blocks are a single `InstancedMesh` (unit box, per-instance colour). Picking is done on the CPU with a ray vs. axis-aligned box slab test over the currently visible blocks, returning the nearest hit and mapping instance index → stable block id through an explicit `instanceToBlock` array. This stays correct once later changes move blocks in the vertex shader (Three's built-in `InstancedMesh.raycast` would only see `instanceMatrix`). Measured cost is recorded in docs/performance.md. Blocks are drawn at 94 % scale to separate faces visually; tonnes always use true dimensions.

### D5. Deterministic generation with seeded hash noise
`mulberry32` PRNG for scalar draws and a seeded integer-hash 3D value noise with quintic interpolation for continuous fields. Generation is a pure function of `(seed, generatorVersion, params)`. Grade = `peak × falloff(ellipsoidDistance)` + vein term, multiplied by `(1 + noiseAmp × noise)`, clamped at 0.

### D6. Generation on the main thread for now
Block generation at 28,800 blocks is expected to be tens of milliseconds. It is measured in this change; a Worker is introduced only for work measured to block the main thread (expected: 300k–1M point clouds in change 04).

### D7. On-demand render loop outside Angular change detection
The app is zoneless, so `requestAnimationFrame` callbacks do not trigger change detection. The renderer renders only when invalidated (controls change, damping in progress, data change) and keeps at most one pending frame. Stats are pushed to the UI at ≤ 2 Hz.

## Risks / Trade-offs

- [Grade field looks artificial] → tilt + vein + continuous noise; visual check in the browser.
- [Terrain hides ore] → terrain mesh is cut out over the block footprint and the ore body is allowed to reach the south free face, which the default isometric view faces.
- [Headless WebGL in tests is software-rendered] → Playwright checks behaviour only; no performance claims from headless runs.
