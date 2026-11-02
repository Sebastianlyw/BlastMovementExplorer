# Design

## Context

`BlockLayer` (change 02) already compacts instances for a visibility mask and hides blocks above a Z section in the vertex shader with the same rule in the CPU picker. This change wires those to the UI, adds dig regions and analysis in the domain, and adds configuration IO.

## Goals / Non-Goals

**Goals:** metrics that are pure functions of (block model, cutoff, region, endpoint); view state that provably cannot affect them; a configuration file that fully reproduces a scenario.

**Non-Goals:** polygon regions, drag handles, partial-volume intersection, optimisation of the region, importing custom block models or arbitrary generation parameters.

## Decisions

### D1. Metrics in the domain, computed on the main thread
`computeDigMetrics(blocks, positions, cutoff, region)` is a single pass over all blocks; it is passed `blocks.before` or `blocks.after`, never interpolated positions. Measured cost is recorded in docs/performance.md; if it is a few milliseconds it stays on the main thread (no Worker for this).

### D2. N/A as `null`
Ratios with a zero denominator are `null` in the domain and rendered as "N/A" in the UI and as empty cells in CSV. NaN never leaves the domain.

### D3. Original region derivation
Ore blocks (default cutoff 0.8 g/t, pre-movement) → 5th and 95th percentiles of E and N → snapped outward to the 2 m block grid. Computed once per dataset load and stored; not recomputed on cutoff change. The adjusted region starts equal to the original. A clearly labelled helper "Offset by mean ore displacement" shifts the adjusted region by the tonnage-weighted mean horizontal displacement of ore blocks. It is a simple, explained heuristic, not an optimiser, and it can make metrics worse.

### D4. Visibility mask built in the domain
`buildVisibilityMask(blocks, filter, cutoff)` returns a `Uint8Array` (grade range + ore-only). The section is applied separately in the renderer because it depends on t. The store holds only filter parameters; the mask is built in the viewport effect and passed to the renderer.

### D5. Hidden selection rule
After any change of filters, section, t or block-layer visibility, the viewport asks the renderer `isBlockDrawn(selected)`. If false, the store clears the selection and shows a notice for 4 s.

### D6. Configuration format
`{ format: "blast-movement-explorer/scene-config", schemaVersion: 1, generatorVersion, scene: { presetId, seed, generation, movement }, cutoff, regions: { original, adjusted }, display: {...} }`. Import validates with hand-written checks (no schema library): size ≤ 256 kB, JSON parse, format and versions, preset exists, `generation` (minus movement) equals the preset's (custom generation is out of scope), movement ranges, cutoff [0, 10], regions positive size and finite. The original region in the file must equal the one derived from the restored dataset; otherwise import is rejected (it would mean the file was edited or produced by different code).

## Risks / Trade-offs

- [Centre-point rule misclassifies blocks straddling the boundary] → stated in the UI and README as an approximation.
- [Users read B vs C as a recommendation] → "Demo definitions — not mine planning advice" label in the analysis panel.
