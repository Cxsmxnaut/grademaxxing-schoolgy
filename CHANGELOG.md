# Changelog

## 0.2.0-beta.1

- Rebrands every product-facing surface as Grademaxxing (Beta).
- Adds a privacy-aware, prefilled beta feedback path for the controlled tester pool.
- Publishes the beta channel and version through the health endpoint.
- Adds a portable GitHub release gate covering audit, types, lint, unit tests, build, and Playwright.
- Adds a seven-day tester plan with daily checks, severity levels, and launch criteria.
- Corrects the privacy page to describe the encrypted HTTP-only session cookie accurately.

## 0.2.0-alpha.1

- Labels the primary course grade as an official StudentVUE value with its sync freshness.
- Labels what-if results as private simulations that are not official.
- Replaces an ambiguous calculation error with a side-by-side official-versus-visible-work explanation.
- Explains reconstructed point-discrepancy records without pretending hidden assignments are directly visible.
- Adds live browser assertions for official and simulated grade states.

## 0.1.0-alpha.1

- Introduced a centralized semantic palette for light and dark modes.
- Added explicit official, simulated, stale, status, and grade-outcome tokens.
- Moved grade progress, changes, extra credit, and unseen work off raw utility colors.
- Added theme-contract and browser interaction-state regression coverage.
- Added a dated competitive benchmark and versioned product roadmap.

This release intentionally changes color semantics only. It does not alter StudentVUE requests, parsing, session behavior, calculations, routes, or page layout.

## 0.0.1

- Established a passing release baseline before the visual-system work.
- Updated authentication browser tests to the current Grademaxxing flow.
- Formatted the existing component baseline and resolved resulting import diagnostics.
