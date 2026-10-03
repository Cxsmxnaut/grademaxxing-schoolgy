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
- **Root cause:** The course-content adapter combined a raw score with a weighted point
  maximum. Official category totals and rounded published percentages can also differ from
  a local sum of visible assignments. The course page had no reconciliation between the
  official value and the recomputed hypothetical baseline.
- **Fix:** Category adjustment records reconcile local sums with StudentVUE's category rows,
  and hypothetical results are anchored to the official score (official + simulated delta),
  so entering hypothetical mode never moves the grade. Covered by unit tests and a
  browser regression test.
- **Status:** Fixed.

## Fixed locally — assignment row mixed raw and weighted score scales

- **Expected:** An assignment uses StudentVUE's weighted points for calculations and shows
  its published percentage. Any available raw score pair remains separate display metadata.
- **Observed:** The course-content fallback joined the raw grade mark to the weighted
  maximum, producing an inflated percentage even when the course headline was correct.
- **Fix:** Read the actual weighted earned points and explicit assignment percentage.
  Reconcile discrepancies using evidence for that assignment, with confirmed raw score type,
  penalty, weight, rounding, and extra-credit guards. Category totals never rewrite an
  individual assignment. What-if edits use the edited point ratio; restoring the original
  points restores the official percentage. Existing cached gradebooks are refreshed.
- **Edge cases:** Published percentage and point precision prevent false rounding corrections.
  Calculations use the more precise evidence while retaining the posted points for display.
  Missing weighted maxima never borrow a raw maximum; known percentages remain visible even
  when weighted earned points are absent. Ambiguous scales and extra-credit-only categories
  without a denominator keep the official grade visible and disable unsupported simulations.
  Blank-denominator extra credit counts when the surrounding calculation is defined. Finals
  Planner targets use the same official-grade offset as hypothetical results.
- **Verification:** Synthetic parser, client, XML adapter, chart, and browser regressions.
- **Status:** Fixed locally; deployment is separate.

## Confirmed limitation / candidate bug — chart and hypothetical fidelity

- **Observed:** Hidden-assignment and category-total discrepancy information can be absent from the trend input.
- **Observed:** Teacher-specific drop-score and manual-override rules cannot always be modeled exactly by local charts or hypothetical calculations.
- **Reproduction outline:** Compare official StudentVUE totals with local trend or hypothetical results in a class that uses hidden/category-total data, dropped work, or manual overrides.
- **Status:** Confirmed limitation / candidate bug.
