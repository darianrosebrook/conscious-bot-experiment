# Test Plan: PR4-PLANNING-OBS-400

## Unit
- Guard function returns `missing_fields` for absent reduction/digest (debug path).
- Flag-off behavior: 400 response excludes validation details; logs do not include key_presence fields.
- Log safety: no log entry contains thought content or other free-text fields.
- Request id propagation: preserves incoming `x-request-id` or generates one; echoed in response header.

## Integration (local)
- Submit malformed payload to planning ingestion endpoint → 400 + debug logs include key presence and missing fields when flag on.
- Submit valid payload → 2xx.

## E2E smoke (local)
- Trigger cognition → planning 400 and confirm cognition logs URL, status, and truncated response with hash.
