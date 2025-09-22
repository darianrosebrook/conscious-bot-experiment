# A11y / Performance / Security Budgets

- **Accessibility**: Dashboard cognitive stream must continue to pass axe + keyboard suites (`npm run test:axe`); ensure new metadata fields have accessible labels.
- **Performance**: Observation→LLM round trip p95 ≤ 400 ms; enforce AbortController timeout of 4 s with metric logging.
- **Security**: Strip world seed/session identifiers from prompts; verify `npm run secret:scan` and dep policy remain green; redact precise coordinates in logs (`<redacted>` granularity within 5 blocks).
