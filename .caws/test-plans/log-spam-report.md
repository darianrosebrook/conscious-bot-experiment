# Test Plan: LOG-1001 Run log spam analysis report

## Scope
Verify report files are generated from `run.log` with correct counts and timing summaries.

## Unit
- None (ad-hoc analysis script only).

## Integration
- Generate reports and verify files exist and parse as JSON/Markdown.

## Manual checks
- Validate JSON schema shape matches `contracts/log-spam-report.yaml`.
- Spot-check D* Lite counts with `rg -c "Using D\* Lite navigation to target" run.log`.
- Confirm report timestamps match log time span.

## Fixtures / Data
- `run.log` in repo root.

## Flake controls
- None (deterministic input file).
