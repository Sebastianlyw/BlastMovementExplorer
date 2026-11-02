# dig-analysis Specification

## Purpose
Compares demo ore-loss and dilution metrics for an original and an adjusted dig region before and after the illustrative movement, using the authoritative block model.

## Requirements

### Requirement: Dig region definition
A dig region SHALL be an axis-aligned rectangle in the XY plane (centre E, centre N, width, length in metres) spanning the full vertical range. A block is extracted when its centre lies inside the rectangle, boundaries inclusive. This centre-point rule SHALL be stated in the UI as an approximation with no partial-volume intersection.

#### Scenario: Centre on the boundary
- **GIVEN** a region spanning E 10–20 m
- **WHEN** a block centre lies at E = 20 m
- **THEN** the block is extracted

### Requirement: Frozen original region
The original region SHALL be derived once per dataset from the pre-movement positions of ore blocks at the default cutoff (5th–95th percentile of their E and N, snapped outward to the block grid) and SHALL NOT change when movement, cutoff or the adjusted region change.

#### Scenario: Original region is stable
- **WHEN** the user changes the cutoff or moves the adjusted region
- **THEN** the original region values are unchanged

### Requirement: Scenarios A, B and C
The analysis SHALL report scenario A (before movement, original region), B (after movement, original region) and C (after movement, adjusted region). Positions SHALL be the movement endpoints only, never intermediate t.

#### Scenario: Analysis ignores t
- **WHEN** the movement slider is at t = 0.5
- **THEN** scenarios A, B and C show the same values as at t = 0 and t = 1

### Requirement: Demo metric definitions
For a scenario the analysis SHALL compute, over all blocks: total ore t (grade ≥ cutoff), recovered ore t (ore in region), lost ore t (ore outside), extracted waste t (grade < cutoff in region), extracted total t, ore loss % = lost / total ore × 100, dilution % = waste / extracted × 100 and average extracted grade = Σ(grade × t) / extracted t. Values whose denominator is zero SHALL be reported as N/A. The UI SHALL label these as demo definitions.

#### Scenario: Hand-checkable fixture
- **GIVEN** three 1 t blocks with grades 2, 1 and 0.5 g/t, cutoff 1 g/t, and a region containing only the 1 and 0.5 g/t blocks
- **THEN** total ore 2 t, recovered 1 t, lost 1 t, waste 1 t, extracted 2 t, ore loss 50 %, dilution 50 %, average grade 0.75 g/t

#### Scenario: Empty region
- **WHEN** the region contains no block centres
- **THEN** dilution and average extracted grade are N/A, not 0 and not NaN

#### Scenario: No ore
- **WHEN** no block has grade ≥ cutoff
- **THEN** ore loss % is N/A

### Requirement: Inputs that change metrics
Changing the cutoff or the adjusted region SHALL recompute the affected scenarios; the adjusted region SHALL be allowed to make metrics worse.

#### Scenario: Move the adjusted region
- **WHEN** the user changes the adjusted region's centre
- **THEN** scenario C values update and scenarios A and B do not change
