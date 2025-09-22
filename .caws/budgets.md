# A11y / Performance / Security Budgets

- **Accessibility**: No UI touchpoints; ensure regression suite keeps axe + keyboard coverage unchanged (`npm run test:axe`).
- **Performance**: Bootstrap logic must keep planner-side work ≤ 200 ms p95; LLM call timeout capped at 4 s with graceful degradation and circuit breaker logging.
- **Security**: Sanitize/scrub memory-derived snippets before LLM prompting; confirm secret scanning + dep policy (`npm run secret:scan`, `npm run dep:policy`) remain clean.
