# Changelog

## Unreleased

- Keeps supported what-if calculations and estimated trends available when another assignment lacks grading data, limits only unsupported assignment edits, labels partial predictions, and preserves explicit zero-weight practice and inactive final categories.
- Accepts truncated StudentVUE assignment percentages without rejecting valid weighted points, preserves precise point-based calculation baselines, and refreshes cached rows affected by the old rounding guard.
- Preserves StudentVUE's weighted assignment points and separate raw score scale, cross-checks assignment percentages using evidence from the same row, and recalculates percentages after what-if edits without rewriting legitimate bonus scores.
- Retains percentage and point precision, preserves rounded display values while using a consistent calculation baseline, shows known grades with missing weighted points, and makes unsupported weighted scales unavailable to simulations. Counts blank-denominator extra credit and keeps Finals Planner targets consistent with the official course grade.
- Keeps the official course grade stable when entering hypothetical mode: local calculations now reconcile with StudentVUE's category totals, and hypothetical results are anchored to the official score plus the simulated change.
- Reorganizes StudentVUE browser, server, API, grade-assignment, contract, storage, formatting, and file-handling code into responsibility-owned modules while preserving stable compatibility facades.
- Removes 72 unreachable source files and the catch-all `$lib` barrel; adds an enforced dead-code, dependency, unresolved-import, and cycle gate.
- Refreshes the supported dependency baseline, removes unused packages, declares direct tooling dependencies, and resolves all known npm advisories.
- Adds repository governance, contribution, security, ownership, editor, and pull-request guidance plus a clearer architecture and operations map.
- Strengthens CI and Cloudflare deployment checks around the unified verification gate and both production build targets.
- Fixes a refresh race that could hide the StudentVUE reconnect prompt after a definitive upstream-session expiry.
- Adds bounded browser file decoding and StudentVUE API resource/parameter/legacy-adapter contract tests.

## 0.2.0

- Rebrands every product-facing surface as Grademaxxing.
- Adds a privacy-aware, prefilled feedback path for the controlled tester pool.
- Publishes the stable release channel and version through the health endpoint.
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
