# Blast Movement Explorer

A small, complete 3D web application for exploring a **synthetic** mine block model before
and after an **illustrative** movement, and for comparing simple dig-region metrics.
Built with Angular 22, TypeScript (strict) and Three.js.

> **Synthetic data · Illustrative movement.** Every block, grade, terrain and scan point is
> generated procedurally in the browser. The movement is a procedural rule, not a blast
> physics model or a prediction. Nothing here is real mine data, and it must not be used
> for mining decisions.

It answers four demo questions:

1. Before the blast, where is material of each grade? (block model coloured by grade, filters, section)
2. Given a demo movement result, where did it go? (before/after interpolation, displacement colouring)
3. If the original dig region is kept, how much ore falls outside it and how much waste falls in? (scenario B vs A)
4. How do those numbers change for an adjusted region? (scenario C)

## Quick start

Requires **Node 24.21** (see `.nvmrc`; Angular 22 needs Node ≥ 22.22 / 24.15).

```bash
npm ci
npm start                 # dev server at http://localhost:4200
```

| Task | Command |
|---|---|
| Unit tests (Vitest via `ng test`) | `npm test` |
| Type-check e2e sources | `npm run typecheck:e2e` |
| Production build → `dist/blast-movement-explorer/browser` | `npm run build` |
| Build for a sub-path (GitHub Pages project site) → `dist/pages/browser` | `npm run build:pages` |
| Serve the production build | `npm run preview` (http://localhost:4310) |
| E2E tests (Playwright; needs both builds above) | `npx playwright install chromium --no-shell` once, then `npm run e2e` |
| Real-GPU benchmark (headed browser) | `npm run benchmark` / `npm run benchmark -- --discrete-gpu` |
| Spec validation | `npx openspec validate --all --strict` |
| Everything | `npm run verify` |

URL parameters: `?quality=high|medium|low`, `?points=100k|300k|1m` (show the surface scan),
`?benchmark=auto` (run the benchmark after load).

## Deploying

The app is static: no backend, no API keys, no login. Any static host works. For a
GitHub Pages project site at `https://<user>.github.io/<repo>/`, build with the matching
base href (`npm run build:pages` uses `/BlastMovementExplorer/`) and publish
`dist/pages/browser`. Live demo: https://sebastianlyw.github.io/BlastMovementExplorer/ (GitHub Pages, deployed by `.github/workflows/deploy-pages.yml`).

## What you can do

- Navigate: orbit / pan / zoom, Reset camera, Fit data, Top, Front, Isometric. Local
  coordinates (E, N, Up in metres) with an orientation and scale indicator.
- Select a block: the inspector shows id, grid index, before/after centres, displacement,
  dimensions, density, grade, tonnes and ore/waste at the current cutoff.
- Play the movement interpolation (t ∈ [0, 1], not time), or jump to Before / After.
- Colour by grade (fixed 0–3 g/t) or displacement magnitude (fixed 0–12 m).
- Filter by grade range or ore only, apply a horizontal section; hidden blocks are not pickable.
- Toggle blocks, terrain and a synthetic surface point cloud (~100k / 300k / 1M points).
- Compare dig regions: A (before, original), B (after, original), C (after, adjusted).
- Export the analysis as CSV, export/import the full scene configuration as JSON.
- Diagnostics panel with renderer counts and a repeatable benchmark.

## Data and limits

- Block model: 60 × 40 × 12 blocks of 2 m (120 × 80 × 24 m), seed 20261103, tilted
  ellipsoidal ore body + narrow vein with continuous seeded noise. Tonnes = volume × density.
- Movement: main throw toward the free face, magnitude decaying with depth and distance,
  smooth lateral spread, bounded vertical change. Blocks may overlap after movement — it
  illustrates where material ends up, it is not a volume reconstruction.
- Metrics use a centre-point rule (a block is extracted when its centre is inside the
  rectangle, edges inclusive). No partial volumes. These are demo definitions, not an
  industry standard. Zero denominators show N/A.
- The surface point cloud is sampled from the procedural pre-blast terrain (2.5D, with
  noise and gaps). It is not LiDAR and never feeds grade or tonnes.
- Desktop first; usable at 1280 × 720. Panels collapse on narrower screens.

## Documentation

- [docs/architecture.md](docs/architecture.md) — layers, renderer, state, workers
- [docs/data-model.md](docs/data-model.md) — coordinates, units, dataset, metrics
- [docs/performance.md](docs/performance.md) — measured numbers and the environment
- [docs/agent-workflow.md](docs/agent-workflow.md) — how the work was specified, built and reviewed
- [docs/demo-script.md](docs/demo-script.md) — 90-second walkthrough
- [docs/case-study.md](docs/case-study.md) — problem, trade-offs, verification, limits
- [AGENTS.md](AGENTS.md) — rules for agents working on this repo
- [openspec/](openspec/) — specifications and archived changes
- [assets-attribution.md](assets-attribution.md) — external assets (none)
- [examples/](examples/) — a hand-computed fixture and a scene configuration

## Licence and provenance

Original code and synthetic data written for this portfolio project. No employer code,
client data, screenshots or brand assets are used. This is an independent work and is
not affiliated with or a copy of any commercial product.
