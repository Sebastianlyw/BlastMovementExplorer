# scene-viewer Specification

## Purpose
Defines the interactive 3D viewport: what it draws, how the user navigates it, how coordinates are presented, and which honest status states it shows.

## Requirements

### Requirement: Render block model and terrain
The viewport SHALL draw the block model and the terrain surface of the active dataset, coloured by grade with a fixed sequential colour scale and a visible legend whose range does not depend on the current view.

#### Scenario: Default scene appears
- **WHEN** the application opens
- **THEN** after loading, the viewport shows the block model and terrain and the legend shows the grade scale in g/t

### Requirement: Camera navigation
The viewport SHALL support orbit, pan and zoom, and SHALL offer Reset camera, Fit data, Top, Front and Isometric actions. No preset SHALL place the camera below the terrain surface or inside the block model.

#### Scenario: Top preset looks down the Z axis
- **WHEN** the user activates the Top preset
- **THEN** the camera looks along −Z with North (+Y) toward the top of the screen

#### Scenario: Initial camera is outside the data
- **WHEN** the default scene has loaded
- **THEN** the camera position is above the terrain and outside the block model bounds

### Requirement: Local Z-up coordinates
The viewport SHALL present all coordinates in local mine coordinates (X East, Y North, Z Up, metres) and SHALL label them "Local coordinates"; it SHALL show an orientation indicator and a unit/scale indicator.

#### Scenario: Orientation indicator
- **WHEN** the scene is displayed
- **THEN** an orientation indicator labelled E/N/Up and a metres scale indicator are visible in the viewport

### Requirement: Persistent synthetic-data label
The application SHALL always display the label "Synthetic data · Illustrative movement".

#### Scenario: Label visible
- **WHEN** any view of the application is shown
- **THEN** the text "Synthetic data · Illustrative movement" is visible

### Requirement: Honest status states
The application SHALL show a loading state while the dataset is prepared, an error state with a message if generation fails, and a WebGL-unavailable state if a WebGL context cannot be created; it SHALL NOT show placeholder statistics.

#### Scenario: WebGL unavailable
- **GIVEN** a browser that cannot create a WebGL context
- **WHEN** the application opens
- **THEN** the viewport area shows a "WebGL is not available" message instead of a blank canvas
