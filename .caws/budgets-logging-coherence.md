# Budgets: COG-LOG-1001

## Accessibility
- N/A (no UI changes).

## Performance
- API p95 latency budget: 250ms (unchanged).
- No new synchronous work added in request path beyond lightweight logging.

## Security
- No new dependencies.
- No sensitive data logged.
- Existing SAST/secret/deps policy gates apply.
