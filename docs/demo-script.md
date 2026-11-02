# 90-second demo script

Setup: production build or dev server, desktop browser at ≥ 1280 × 720, default scene
(Bench A, seed 20261103), High quality. Start from a fresh load (or press **Reset**).

| Time | Do | Say |
|---|---|---|
| 0–15 s | Point at the yellow badge, the legend and the Cutoff field. | "Everything here is synthetic: a 120 × 80 × 24 m bench of 28,800 two-metre blocks, generated from a seed in the browser. Colour is grade on a fixed 0–3 g/t scale; ore is anything at or above the 0.8 g/t demo cutoff." |
| 15–35 s | Click a block on the front face → inspector. Press **Play**; then **After (t = 1)**; switch *Colour blocks by* → Displacement. | "Each block has a stable id, true tonnes from volume × density, and before/after positions. The movement is an illustrative procedural field — thrown toward the free face, less at depth — not a physics prediction. The slider is an interpolation, not time." |
| 35–55 s | Switch back to Grade. Tick **Ore only**, tick **Hide blocks above Z** (12 m). Then enable **Surface point cloud**. | "Filters and the section only change the view; hidden blocks can't be picked. The ore body and the narrow vein appear. The point cloud is a synthetic pre-blast scan — visual context only, never used for tonnes." |
| 55–75 s | Point at the analysis table: A vs B. Click **Offset by mean ore displacement**, then show C. Optionally type a different Centre N. | "Keeping the original dig region after movement, ore loss rises from about 15 % to 19 %. Shifting the region by the mean ore displacement brings it to about 16 %. These are demo definitions with a centre-point rule — and the adjusted region is allowed to be worse." |
| 75–90 s | Open **Diagnostics** (counts, frame interval). Mention Export CSV / config. | "One instanced draw for 28,800 blocks, movement in the vertex shader, picking on the CPU with the same rule. Measured at the 54 Hz frame-pacing ceiling of this machine for blocks + 100k points. It was built change by change with OpenSpec specs, unit and Playwright tests, and an independent agent review." |

Numbers quoted above are from the default scene (A 14.7 %, B 19.1 %, C 16.4 % ore loss)
and docs/performance.md; re-check them if the generator version changes.
