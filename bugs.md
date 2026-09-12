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

## Confirmed limitation / candidate bug — chart and hypothetical fidelity

- **Observed:** Hidden-assignment and category-total discrepancy information can be absent from the trend input.
- **Observed:** Teacher-specific drop-score and manual-override rules cannot always be modeled exactly by local charts or hypothetical calculations.
- **Reproduction outline:** Compare official StudentVUE totals with local trend or hypothetical results in a class that uses hidden/category-total data, dropped work, or manual overrides.
- **Status:** Confirmed limitation / candidate bug.
