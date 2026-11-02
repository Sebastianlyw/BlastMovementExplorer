# Spec Delta

## Purpose

Keeps the viewport responsive and honest about its performance: quality presets, on-demand rendering, reduced motion, diagnostics, a repeatable benchmark, and clean resource lifecycle.

## ADDED Requirements

### Requirement: Quality presets
The user SHALL be able to choose High (MSAA, DPR ≤ 2), Medium (MSAA, DPR ≤ 1.5) or Low (no MSAA, DPR 1) rendering quality; changing it SHALL recreate the WebGL context and keep the scene, selection-independent settings and metrics.

#### Scenario: Switch to Low
- **WHEN** the user selects Low quality
- **THEN** the canvas pixel ratio is 1 and every metric is unchanged

### Requirement: On-demand rendering
The viewport SHALL render frames only while something changes (camera interaction, damping, playback, data or setting changes, benchmark) and SHALL NOT keep a render loop running while idle or while the page is hidden.

#### Scenario: Idle viewport
- **GIVEN** no interaction, playback or benchmark
- **WHEN** one second passes
- **THEN** no animation frame is pending and the rendered frame count does not increase

### Requirement: Reduced motion
When the user prefers reduced motion, camera inertia SHALL be disabled; movement playback SHALL only ever start from a user action.

#### Scenario: Reduced motion preference
- **GIVEN** the browser reports prefers-reduced-motion: reduce
- **WHEN** the user releases an orbit drag
- **THEN** the camera stops without an inertia animation

### Requirement: Diagnostics panel
A closable diagnostics panel SHALL show the median browser frame interval over recent continuous frames (or "idle"), draw calls, triangles, points, block instances, geometries, textures, device pixel ratio, canvas size and quality, updated at most twice per second, and SHALL state that these are browser frame intervals and renderer object counts, not GPU timings or memory sizes.

#### Scenario: Open diagnostics
- **WHEN** the user opens the diagnostics panel
- **THEN** it shows a non-zero draw call count and the block instance count

### Requirement: Repeatable benchmark
The user SHALL be able to run a benchmark that renders continuously along a fixed camera orbit with movement playback for a 2 s warm-up and a 10 s sampling window, and reports median and p95 frame interval, frame count, browser, GPU renderer string (when exposed), viewport, DPR, quality, block and point counts and draw calls, downloadable as JSON. Results SHALL be labelled as browser frame-interval measurements.

#### Scenario: Run benchmark
- **WHEN** the user runs the benchmark
- **THEN** after about 12 s a result with median and p95 frame interval and the environment details is shown

### Requirement: Resource lifecycle
Replacing the dataset or the renderer SHALL dispose previous GPU resources, listeners, observers, timers, animation frames and workers, so repeated scene and quality changes do not accumulate renderers, render loops or geometries.

#### Scenario: Repeated scene switches
- **WHEN** the user switches scenes and quality several times and the view settles
- **THEN** exactly one renderer is alive, no more than one frame is pending, and the geometry count equals the count after the first load of the same configuration

### Requirement: WebGL context loss
On WebGL context loss the viewport SHALL show a message and stop rendering; on restore it SHALL resume rendering without a reload.

#### Scenario: Lose and restore context
- **WHEN** the WebGL context is lost and then restored
- **THEN** a "graphics context was lost" message is shown while lost and disappears after restore, and blocks are pickable again
