# Spec Delta

## ADDED Requirements

### Requirement: Hidden selection is cleared
When the selected block becomes hidden by a filter, the section, movement crossing the section, or hiding the block layer, the selection SHALL be cleared and a short notice SHALL explain why.

#### Scenario: Filter hides the selection
- **GIVEN** a selected waste block
- **WHEN** the user enables "Ore only"
- **THEN** no block is selected and a notice says the selection was cleared because it is hidden
