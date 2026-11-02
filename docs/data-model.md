# Data model

## Coordinates and units

| Item | Convention |
|---|---|
| Frame | Local mine coordinates, **X = East, Y = North, Z = Up**, right-handed |
| Units | metres (length), tonnes (mass), g/t (grade), t/m³ (density) |
| Geodesy | None. No EPSG code; the UI says "Local coordinates" |
| Renderer | Also Z-up; `WorldFrame` subtracts the dataset origin only |

## Three kinds of data

| Kind | Purpose | Authoritative for metrics? |
|---|---|---|
| **Block model** | Material, grade, density, before/after position | **Yes** — the only input to metrics |
| **Surface point cloud** ("Synthetic surface scan") | Visual context of the pre-blast terrain | No. Never used for grade or tonnes |
| Material samples | Optional enhancement, **not implemented** | — |

## DatasetMetadata

`schemaVersion` (1), `generatorVersion` ("1.1.0"), `seed`, `units`, `coordinateSystem`
(`kind: "local"`, axes, handedness, `epsg: null`), `blockBounds`, `finalBounds` (contains
every moved block), `params` (grid, ore body, vein, terrain, movement — all serialisable),
`provenance` (states the data is synthetic and the movement illustrative).

## Block model (structure of arrays)

| Field | Type | Notes |
|---|---|---|
| `ids` | Int32Array | stable id = `ix + nx·(iy + ny·iz)`; survives filtering, compaction and animation |
| `gridIndex` | Int32Array ×3 | (ix, iy, iz) |
| `before` / `after` | Float32Array ×3 | centres, metres |
| `size` | Float32Array ×3 | true dimensions (2 m); the renderer draws at 94 % for visual gaps |
| `density` | Float32Array | t/m³, 2.62–2.93 by geological class + continuous noise |
| `grade` | Float32Array | g/t, ≥ 0 |
| `geoClass` | Uint8Array | host rock / halo / ore-zone core / narrow vein (fixed at generation) |

`Block` is a plain record view (`getBlock`) used by the inspector and exports.
Tonnes = `dx · dy · dz · density`, never from visual scale.
Ore/waste is **derived** at query time: `grade ≥ cutoff` is ore (equality counts as ore).
The demo cutoff is 0.8 g/t.

## Generation (deterministic)

- Grade: `(background + max(body, vein)) · (1 + a · fbm)` clamped at 0, where `body` is a
  Gaussian of the normalised distance to a tilted ellipsoid (strike 28°, dip 18°) whose
  boundary is warped by low-frequency noise, and `vein` is a sinuous, steeply dipping band.
  Noise is seeded value noise with quintic interpolation, so neighbours are similar.
- Terrain: flat blast bench at Z = 24 m, vertical free face along Y = 0 down to a floor at
  Z = 0, pit walls 12 m beyond the footprint rising 12 m. Every block is below it.
- Movement (illustrative): see `src/app/domain/movement.ts`. Parameters and ranges:

| Parameter | Default | Range |
|---|---|---|
| throwAzimuthDeg (CCW from East) | −90 (South) | −180 … 180 |
| throwMetres | 6 | 0 … 15 |
| faceDecayMetres | 30 | 5 … 200 |
| depthRatio | 0.55 | 0 … 1 |
| lateralSpreadMetres | 1.5 | 0 … 5 |
| dropMetres | 2 | 0 … 4 |
| verticalMaxMetres | 2.5 | 0 … 4 |
| noiseMetres | 0.6 | 0 … 2 |
| noiseScaleMetres | 18 | 4 … 100 |

Out-of-range values are rejected, not clamped. Movement changes positions only; ids,
grades, densities and tonnes are untouched, and no block is removed.

## Movement interpolation

`p(t) = (1 − t) · before + t · after`, t ∈ [0, 1], labelled "Movement interpolation".
This form returns the endpoints bit-exactly (unit-tested). t is not time and the path is
not a trajectory. Metrics use the endpoints only.

## Dig analysis (demo definitions)

Region: axis-aligned XY rectangle `(centerE, centerN, width, length)`, full height,
centre-point inclusion, edges inclusive. The **original** region is derived once per
dataset from pre-movement ore (≥ 0.8 g/t): 5th–95th percentile of E and N, ±½ block,
snapped outward to the grid; it is never recomputed afterwards.

| Metric | Definition |
|---|---|
| Total ore | Σ t where grade ≥ cutoff (all blocks) |
| Recovered ore | ore t with centre in region |
| Lost ore | ore t with centre outside |
| Extracted waste | t with grade < cutoff in region |
| Extracted total | all t in region |
| Ore loss % | lost ÷ total ore × 100 (N/A if total ore = 0) |
| Dilution % | waste ÷ extracted × 100 (N/A if extracted = 0) |
| Avg extracted grade | Σ(grade · t) ÷ extracted t (N/A if extracted = 0) |

Scenarios: **A** before + original, **B** after + original, **C** after + adjusted.

Hand-checked example (`examples/mini-block-fixture.json`, cutoff 0.8, region E 0–6, N 0–2):
four 8 m³ blocks of 20, 20, 24, 20 t with grades 1.2, 0.4, 2.0, 0.8. Before: total ore 64 t,
recovered 44, lost 20, waste 20, extracted 64 → ore loss 31.25 %, dilution 31.25 %,
grade 80/64 = 1.25 g/t. After (block 1 moves out, block 3 stays in): recovered 24, lost 40,
extracted 44 → ore loss 62.5 %, dilution 45.45 %, grade 56/44 = 1.27 g/t.

## Surface point cloud

Jittered stratified samples over the terrain extent (≈ 100k / 300k / 1M before dropout),
`z = terrainHeight + N(0, 0.025 m)` clamped to ±0.1 m, coherent dropout where seeded
noise > 0.62 (≈ 4 % fewer points). Positions only (Float32Array, domain metres), plus
bounds, count, tier and `source: "synthetic-surface-scan"`.

## Scene configuration (JSON)

`format: "blast-movement-explorer/scene-config"`, `schemaVersion: 1`, `generatorVersion`,
`scene { presetId, seed, generation }`, `cutoff`, `regions { original, adjusted }`,
`display { colorMode, layers, gradeFilter, section, movementT, quality, pointDensity,
pointSize }`, `note`. Import rejects: > 256 kB, invalid JSON, other format / schema /
generator version, unknown preset, generation parameters (other than movement) that
differ from the preset, out-of-range values, and an original region that does not match
the one derived from the restored dataset. See `examples/scene-config.default.json`.

## Numeric precision

Grades, densities and positions are stored as `Float32Array`; cutoff and region values
are JavaScript doubles. Every comparison (ore/waste, region inclusion, section) uses the
**stored** float32 value, so the inspector, filters and metrics always agree with each
other. A displayed value is rounded (grade to 3 decimals), so a block whose stored grade
is 0.69999998 is shown as "0.700 g/t" and is waste at a 0.7 cutoff. Generated grades are
continuous, so exact ties are rare; the unit tests use cutoffs that are exact in float32.
