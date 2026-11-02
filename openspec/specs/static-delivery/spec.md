# static-delivery Specification

## Purpose
Ensures the application ships as plain static files that run without any backend, including when hosted under a URL sub-path such as a GitHub Pages project site.

## Requirements

### Requirement: Static build without backend
The production build SHALL consist only of static files and SHALL generate all data in the browser; it SHALL NOT require any server API, login, database or API key.

#### Scenario: Serve the build statically
- **WHEN** the production build is served by a plain static file server
- **THEN** the default scene loads and the analysis is shown

### Requirement: Sub-path hosting
The build SHALL work when served under a sub-path chosen at build time (e.g. `/BlastMovementExplorer/`), including the Web Worker chunk.

#### Scenario: Hosted under a sub-path
- **GIVEN** a build made with base href `/BlastMovementExplorer/`
- **WHEN** it is served at `http://host/BlastMovementExplorer/`
- **THEN** the scene loads and the surface point cloud can be generated
