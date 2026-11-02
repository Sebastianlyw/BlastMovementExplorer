# Spec-to-test review checklist

Used to brief an independent reviewer agent (see docs/agent-workflow.md). The reviewer
reads; it does not edit code.

1. For every `### Requirement` in `openspec/specs/**/spec.md`, find the test(s) that exercise
   each `#### Scenario` (unit: `src/**/*.spec.ts`, e2e: `e2e/*.spec.ts`). Report scenarios
   with no test, or with a test that would still pass if the behaviour were broken.
2. Check that expected values in tests are not computed with the same code they test
   (independent fixtures for metrics, tonnes, interpolation endpoints).
3. Edge cases to probe: cutoff equality, empty region, no ore, region boundary inclusion,
   t = 0 / t = 1 exactness, hidden blocks not pickable (filters, section, layer off, after
   movement), stale worker responses, invalid config files, zero denominators (N/A).
4. Boundaries: view settings (filters, section, layers, colour, t, point cloud, quality)
   must not reach metric code; the domain must not import Angular or Three.js; only
   `WorldFrame` converts coordinates.
5. Honesty: no UI text or doc claims physics prediction, AI capability, real data, or
   performance numbers without a measurement.
6. Report each finding with file:line, the failing scenario (inputs → wrong outcome),
   and a severity (bug / test gap / doc). Mark anything not verified by running code as
   "not verified".
