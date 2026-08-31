# Grademaxxing (Beta) tester plan

This beta is intended for a controlled pool of roughly ten daily testers. It is not a school-wide production release.

## Before inviting a tester

- Give the tester the exact beta URL and confirm it uses HTTPS.
- Tell them Grademaxxing (Beta) is unofficial and read-only. StudentVUE remains the official record.
- Ask them not to paste passwords, student IDs, full names, or unredacted record screenshots into bug reports.
- Confirm the deployed `/api/health` response reports `status: ok`, `release: beta`, and the expected version.
- Run `npm run test:release` against the exact commit being deployed.

## Five-minute daily check

Each tester should check:

1. Sign in and confirm every current class appears.
2. Compare each displayed official percentage with StudentVUE.
3. Open one class and compare its assignment count, latest assignment, category totals, and trend endpoint.
4. Open attendance and verify the latest non-present event, if any.
5. Open Documents and Mail and confirm the newest record is present.
6. Use Refresh once and confirm the interface recovers without an endless loading state.
7. Report any mismatch through the in-app Feedback page before signing out.

## Severity

- **Stop beta:** wrong student, exposed private data, stored password, cross-account data, or destructive portal behavior.
- **Critical:** wrong official percentage, missing class, wrong report period, or sign-in/session failure affecting multiple testers.
- **High:** missing assignments, attendance, documents, or mail; refresh never completes; mobile page is unusable.
- **Normal:** visual mismatch, unclear text, spacing issue, or a non-blocking interaction problem.

## Launch decision after seven days

Continue beyond the first pool only when there are no unresolved stop-beta issues, no recurring critical issue, every tester can refresh and sign out reliably, and official percentages match StudentVUE for every tested report period. Keep the beta label until the live StudentVUE suite passes against the deployed artifact and a second district has been validated.
