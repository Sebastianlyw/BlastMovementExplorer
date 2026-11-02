# Design

## Context

Change 01 already draws blocks in the vertex shader from `aBefore`/`aAfter` attributes with `aAfter = aBefore`, and the CPU picker already interpolates. This change fills `aAfter` with real final centres and drives `uT`.

## Goals / Non-Goals

**Goals:** a believable but clearly illustrative movement field; animation at no per-frame CPU cost proportional to block count; picking that matches the picture at any t.

**Non-Goals:** collision-free volume reconstruction (blocks may overlap after movement — documented), real trajectories, swell/volume change, editing movement parameters in the UI (they are serialised with the scene and come back with config import in change 03).

## Decisions

### D1. Movement field formula
For a block at (x, y, z) with face distance `d = y − faceCrestY` and normalised height `h = (z − zMin) / (zMax − zMin)`:
- `face = 0.3 + 0.7·exp(−d / faceDecay)`; `depth = depthRatio + (1 − depthRatio)·h`
- main throw `= throw · face · depth · (1 + 0.2·n₁)` along the throw azimuth
- lateral `= spread · face · clamp((across − centre) / halfWidth, −1, 1) + noiseAmp · n₂` (perpendicular to throw)
- vertical `= clamp(−drop · face · (0.4 + 0.6·h) + noiseAmp · 0.3 · n₃, −verticalMax, verticalMax)`, then the final centre is kept at least half a block above the lower floor.
`n₁..₃` are seeded continuous value noise. Defaults: throw 6 m, faceDecay 30 m, depthRatio 0.55, spread 1.5 m, drop 2 m, verticalMax 2.5 m, noise 0.6 m at 18 m wavelength, azimuth −90° (south, toward the free face). *Alternative:* per-block random jitter — rejected (not spatially continuous, unreadable).

### D2. Exact-endpoint interpolation
`(1 − t)·a + t·b` instead of `a + t·(b − a)`: in floating point the former returns `a` and `b` exactly at t = 0 and 1. The same expression is used in the GLSL vertex shader (`mix` is not relied upon) and in the CPU picker, so pick and picture agree.

### D3. Shader animation, CPU picking, union bounds
Animation updates one uniform per frame; no instance matrices are rewritten. Frustum culling uses a bounding sphere over both endpoints (computed in change 01). No shadows are cast, so there is no shadow-position inconsistency. Picking cost is O(visible blocks) per click only — no hover picking.

### D4. Playback owned by the renderer
The renderer advances `t` inside its frame loop (duration 4 s for 0 → 1) and reports `t` to the store at ≤ 10 Hz and once exactly on stop. While playing, the store does not push `t` back to the renderer (avoids feedback). The timeline slider writes the store; the store writes the renderer.

### D5. Validation of movement parameters
`validateMovementParams` returns a list of errors using a single `MOVEMENT_PARAM_RANGES` table, reused by config import in change 03.

## Risks / Trade-offs

- [Blocks overlap after movement] → documented as a material-position illustration, not a volume reconstruction.
- [Fast playback looks like a trajectory] → label "Movement interpolation t", README states it is not time or a trajectory.
