# Bug log

This file records observed product issues and confirmed fidelity limits. It contains no student records, credentials, cookies, screenshots, or personal identifiers.

## Confirmed — cold login does not populate StudentVUE data

- **Expected:** After a new Grademaxxing login succeeds, the app automatically pulls the available StudentVUE data and populates the authenticated experience.
- **Observed:** Immediately after a cold sign-in, Grademaxxing showed zero graded courses and a
  blank GPA while official StudentVUE was populated. A normal manual Refresh loaded matching
  current-period results in about seven seconds.
- **Reproduction outline:** Start without an active Grademaxxing session or local data cache, sign in successfully, and inspect the first authenticated load.
- **Status:** Confirmed.

## Investigated / not currently reproducible — current-period estimated GPA discrepancy

- **Expected:** The current-period estimate should match the result of applying Grademaxxing's published equal-weight letter scale to the official StudentVUE visible summaries.
- **Observed:** After Refresh, Grademaxxing matched the official current-period course letter/percentage summaries and showed an estimated **3.50**.
- **Verification:** The prior **3.67** result is likely stale or prior-period state, not a currently reproducible calculation defect. No personal course or grade data is recorded here.
- **Status:** Investigated / not currently reproducible.

## Fixed — entering hypothetical mode changed the displayed grade

- **Expected:** Toggling hypothetical mode with no edits keeps the official StudentVUE
  percentage and reports a ±0.00% change. Both competitor products behave this way on the
  same dataset.
- **Observed:** The headline immediately switched to a locally recomputed grade, differing
  from the official score by up to 8.2 percentage points.
- **Root cause:** Two independent gaps between StudentVUE's published score and a local sum
  of visible assignments: (1) an assignment row can contradict StudentVUE's own category
  totals — one row reported a score ten times the value its category total implies — and
  (2) StudentVUE publishes a truncated percentage, so the official score can sit just below
  the category math. The course page had no reconciliation between the official value and
  the recomputed hypothetical baseline.
- **Fix:** Category adjustment records reconcile local sums with StudentVUE's category rows,
  and hypothetical results are anchored to the official score (official + simulated delta),
  so entering hypothetical mode never moves the grade. Covered by unit tests and a
  browser regression test.
- **Status:** Fixed.

## Confirmed limitation / candidate bug — chart and hypothetical fidelity

- **Observed:** Hidden-assignment and category-total discrepancy information can be absent from the trend input.
- **Observed:** Teacher-specific drop-score and manual-override rules cannot always be modeled exactly by local charts or hypothetical calculations.
- **Reproduction outline:** Compare official StudentVUE totals with local trend or hypothetical results in a class that uses hidden/category-total data, dropped work, or manual overrides.
- **Status:** Confirmed limitation / candidate bug.
