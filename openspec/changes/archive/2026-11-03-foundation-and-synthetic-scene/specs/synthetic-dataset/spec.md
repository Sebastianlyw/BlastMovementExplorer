# Spec Delta

## Purpose

Generates the reproducible synthetic mine dataset (block model, terrain surface and metadata) that every visual and analytical feature of Blast Movement Explorer is built on.

## ADDED Requirements

### Requirement: Deterministic generation
The generator SHALL produce bit-identical block data, terrain heights and metadata for the same seed, generator version and parameters, and SHALL expose every generation parameter in serialisable form.

#### Scenario: Same inputs give the same dataset
- **GIVEN** seed 20261103 and the default parameters
- **WHEN** the dataset is generated twice
- **THEN** every block id, centre, size, density, grade and geological class is identical between the two runs

#### Scenario: Different seed changes the dataset
- **GIVEN** the default parameters
- **WHEN** the dataset is generated with seed 20261103 and with seed 20261104
- **THEN** at least one block grade differs between the two datasets

### Requirement: Default block model geometry
With default parameters the block model SHALL contain 60 × 40 × 12 = 28,800 blocks of 2 m edge length filling X 0–120 m, Y 0–80 m, Z 0–24 m, each with a unique, stable integer id.

#### Scenario: Default size and ids
- **WHEN** the default dataset is generated
- **THEN** it contains 28,800 blocks, all block ids are unique, and every block centre lies inside the declared extents

### Requirement: Valid physical values
Every block SHALL have finite coordinates, positive finite dimensions, positive finite density in t/m³ and a finite, non-negative grade in g/t.

#### Scenario: No invalid numbers
- **WHEN** any dataset is generated with parameters inside their documented ranges
- **THEN** no block value is NaN or Infinity, no density or dimension is ≤ 0, and no grade is negative

### Requirement: Tonnage from true block volume
Block tonnes SHALL equal block volume (from the block's true dimensions) multiplied by its density, independent of any visual scaling.

#### Scenario: Tonnes of a 2 m block
- **GIVEN** a 2 × 2 × 2 m block with density 2.7 t/m³
- **WHEN** its tonnes are computed
- **THEN** the result is 21.6 t

### Requirement: Spatially continuous grade field
Grade SHALL be derived from distance to a tilted ellipsoidal ore body (plus an optional narrow vein) modulated by low-amplitude, seeded, spatially continuous noise, so that neighbouring blocks have similar grades.

#### Scenario: Ore body is spatially coherent
- **WHEN** the default dataset is generated
- **THEN** the mean absolute grade difference between face-adjacent blocks is less than half the mean absolute difference between randomly paired blocks

#### Scenario: Ore exists at the default cutoff
- **WHEN** the default dataset is generated
- **THEN** some blocks have grade ≥ 0.8 g/t and some have grade < 0.8 g/t

### Requirement: Geological class separate from economic class
Each block SHALL carry a geological class (e.g. ore-zone core, halo, vein, host rock) fixed at generation; ore / waste SHALL be derived from the current cutoff at query time and SHALL NOT be stored as a block property. A block with grade exactly equal to the cutoff SHALL be ore.

#### Scenario: Cutoff equality is ore
- **GIVEN** a block with grade 0.8 g/t
- **WHEN** it is classified with cutoff 0.8 g/t
- **THEN** it is classified as ore

### Requirement: Benched terrain surface
The generator SHALL provide a deterministic terrain height function describing a pre-blast surface with a bench top at the top of the block model, a free face to the south dropping to a lower floor, and a higher bench to the north. All block centres SHALL lie below this surface.

#### Scenario: Blocks are below the surface
- **WHEN** the default dataset is generated
- **THEN** for every block the terrain height at the block's XY is greater than or equal to the block's top elevation

### Requirement: Dataset metadata
Each dataset SHALL include metadata stating schema version, generator version, seed, units (metres, tonnes, g/t, t/m³), coordinate convention (local, X East, Y North, Z Up, right-handed, no EPSG), extents, parameters and a provenance note declaring the data synthetic.

#### Scenario: Metadata declares synthetic local data
- **WHEN** the default dataset is generated
- **THEN** its metadata coordinate system is "local" with axes X East, Y North, Z Up, and its provenance note states the data is synthetic
