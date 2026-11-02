# Spec Delta

## Purpose

Shows a synthetic, deterministic scan of the pre-blast terrain surface at selectable densities, for visual context only, without ever influencing block-model metrics.

## ADDED Requirements

### Requirement: Synthetic surface sampling
Surface points SHALL be sampled from the same terrain height function as the terrain mesh, with jittered stratified XY positions, seeded measurement noise of at most 0.1 m vertical and deterministic, spatially coherent dropout zones. Identical seed, parameters and density SHALL give identical points.

#### Scenario: Deterministic points
- **WHEN** the 100k tier is generated twice with the same seed
- **THEN** both position buffers are identical

#### Scenario: Points lie on the surface
- **WHEN** any tier is generated
- **THEN** every point's Z differs from the terrain height at its XY by at most 0.1 m and every point lies inside the terrain extent

#### Scenario: Dropout zones exist
- **WHEN** the 100k tier is generated
- **THEN** the point count is lower than the 100,000 target and above 70,000

### Requirement: Density tiers
The user SHALL be able to choose about 100k (default), 300k or 1M (stress) points; the actual point count SHALL be displayed.

#### Scenario: Switch density
- **WHEN** the user selects the 300k tier
- **THEN** the displayed point count is between 210,000 and 300,000

### Requirement: Off-main-thread generation without stale results
Point generation SHALL run off the main thread. When a newer request supersedes an older one, the older result SHALL be discarded and never displayed.

#### Scenario: Rapid density changes
- **WHEN** the user switches 1M → 100k before the 1M result arrives
- **THEN** the displayed cloud is the 100k result

### Requirement: Point display controls
The point cloud SHALL have a visibility toggle (off by default), a point size control (1–8 px) and a colour mode (by height or fixed natural colour), and SHALL be drawn as round points.

#### Scenario: Show point cloud
- **WHEN** the user enables "Surface point cloud"
- **THEN** points appear over the terrain and the viewport legend labels them "Synthetic surface scan"

### Requirement: Point cloud is visual only
The point cloud SHALL be labelled "Synthetic surface scan" (not LiDAR or a measurement) and its visibility, density or point size SHALL NOT change any metric.

#### Scenario: Metrics unchanged
- **WHEN** the user enables the point cloud and switches to the 1M tier
- **THEN** every dig-analysis metric is unchanged
