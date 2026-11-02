# scene-config-io Specification

## Purpose
Lets the user take results out of the app as CSV and save and restore a complete scenario as a validated JSON configuration file.

## Requirements

### Requirement: Analysis CSV export
The user SHALL be able to download a CSV with one row per scenario (A, B, C) containing region bounds, cutoff, raw tonnes, percentages (empty for N/A) and the seed and generator version.

#### Scenario: CSV contents
- **WHEN** the user exports the analysis CSV
- **THEN** the file has a header row and three rows labelled A, B and C whose values equal the displayed metrics

### Requirement: Scene configuration export
The user SHALL be able to download a JSON configuration containing schema version, generator version, seed, scene preset, generation and movement parameters, cutoff, both dig regions and display settings.

#### Scenario: Export
- **WHEN** the user exports the configuration
- **THEN** the downloaded JSON contains the current seed, cutoff, adjusted region and movement parameters

### Requirement: Configuration import restores the scenario
Importing a valid configuration SHALL restore an equivalent scene: the same dataset, cutoff, regions and display settings, and therefore identical analysis values.

#### Scenario: Round trip
- **GIVEN** an exported configuration
- **WHEN** the user changes the cutoff and region and then imports the file
- **THEN** the cutoff, regions and every metric equal those at export time

### Requirement: Import validation
Import SHALL reject files larger than 256 kB, non-JSON content, unknown schema versions, generator versions other than the running one, missing required fields and out-of-range numbers, with a message naming the problem; the current scene SHALL remain unchanged.

#### Scenario: Out-of-range value
- **WHEN** the user imports a configuration with cutoff −1
- **THEN** an error message mentions "cutoff" and the current scene is unchanged
