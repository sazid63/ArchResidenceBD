# ADR-0087: The project assembly builds the MEP and the design's assumptions reach the app
## Date: 2026-10-22
## Status: accepted
## Work package: The rule engine is not yet connected to the design (ADR-0086)
## Context:
The design computes values like setbacks, floor areas, and parking counts, but the app's compliance screen couldn't reach them, leaving the rule engine with declared gaps. The design also assumed 42 values (e.g., footing sizes) that the app never recorded, making them invisible and unverifiable.

## Decision:
1. **The project assembly builds the MEP stage it declares.** The `design_project` function now builds the MEP for each floor, using the same `design_mep` function the walking skeleton calls. This closes the silent gap in the pipeline's declared stages.
2. **The design's assumptions reach the channel.** `design.run` now returns the design's own assumptions (pointer, value, unit, reason, source) under `assumptions`, and the spec's recorded assumptions under `recordedAssumptions`. The golden run's check "the design carries its assumptions" is updated to verify the design's list.

## Consequences:
- **Silent coverage gaps closed:** The MEP stage is built, and every value the design assumes is visible in the spec's provenance map and the app's compliance report.
- **Honest outputs:** The compliance screen can now use the design's actual values (e.g., setbacks, floor areas) once the engine is connected.
- **Golden run changes:** The design's assumptions count increased from 3 to 39 (example) and the MEP's counts are reported. The golden record's `design` block now includes `mep` and the new assumption lists.
- **Test changes:** `test_design_project.py` asserts the MEP is built and assumptions are merged without conflict.

## Notes:
- The MEP's authored values (e.g., electrical points per 100m²) are now in the design's assumptions, tagged with their source (e.g., "mep-1").
- The walking skeleton's MEP step now reuses the assembly's `meps` instead of calling `design_mep` again, ensuring consistency.
- The `DesignAssumption` class holds the merged data; `_merge_assumptions` ensures no conflicting values.

## References:
- ADR-0086: The rule engine is not yet connected to the design
- `docs/spec/assumption-loop-v0.md`
- `docs/spec/golden-run-v0.md`
