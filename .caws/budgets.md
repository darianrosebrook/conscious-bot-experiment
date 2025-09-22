# A11y / Performance / Security Budgets

- **Accessibility**: No UI touchpoints; ensure regression suite keeps axe + keyboard coverage unchanged (check `npm run test:axe`).
- **Performance**: Enhanced need integration must keep signal processing <= 180ms p95 (per working spec). Use lightweight transformations and limit ranked tasks to top 3.
- **Security**: No new IO; confirm secret scanning + dep policy (`npm run secret:scan`, `npm run dep:policy`) remain clean.
