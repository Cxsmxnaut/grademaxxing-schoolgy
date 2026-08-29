# Product benchmark and release strategy

Research date: August 29, 2026.

## How the comparison was made

There is no authoritative worldwide ranking for student grade portals. We therefore use a transparent proxy: public app-store adoption and sentiment, official product reach, feature overlap, and relevance to a student checking and understanding grades. Ratings are snapshots and should be rechecked before external publication.

The working organization used three independent reviews before the product and technical leads reconciled the plan:

- UX Head: interaction hierarchy, accessibility, visual restraint, and anti-pattern review.
- Product Lead: student jobs-to-be-done, prioritization, trust, and rollout sequencing.
- Tech Lead: architecture boundaries, performance risks, test gates, and rollback design.

## Benchmark cohort

| Rank | Product                                                                                | Why it belongs in the cohort                                                                                                                                | Pattern worth adapting                                                               | Pattern to avoid                                                                       |
| ---- | -------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------- |
| 1    | [GradeWay](https://www.gradeway.app/)                                                  | The closest widely adopted third-party StudentVUE/HAC enhancement; its public product and store presence show strong demand for faster mobile grade access. | Fast grade-first entry, change visibility, lightweight navigation.                   | Ads, monetizing basic access, or implying official affiliation.                        |
| 2    | [Canvas Student](https://apps.apple.com/us/app/canvas-student/id480883488)             | Large global learning-platform reach and mature student workflows.                                                                                          | What-if planning, assignment context, accessibility, clear course drill-down.        | Recreating a full LMS or mixing teacher workflows into the student record.             |
| 3    | [PowerSchool Mobile](https://apps.apple.com/us/app/powerschool-mobile/id973741088)     | A major official student-information-system portal with broad parent/student usage.                                                                         | At-a-glance grades, clear record freshness, change and notification patterns.        | Dense administrative terminology and unexplained sync failures.                        |
| 4    | [Google Classroom](https://edu.google.com/workspace-for-education/products/classroom/) | Exceptional classroom adoption and a highly familiar assignment/file mental model.                                                                          | Calm information density, restrained surfaces, recognizable upcoming-work structure. | Treating Classroom integration as reliable when a district administrator can block it. |
| 5    | [StudentVUE](https://apps.apple.com/us/app/studentvue-new/id6618112702)                | The official source of truth this product enhances and must continuously match.                                                                             | Complete school record and official terminology.                                     | Slow navigation, opaque errors, and making students interpret raw SIS structure.       |

Secondary references include [GradePro](https://apps.apple.com/us/app/gradepro-grades-gpa/id562121946), [Gradekit](https://apps.apple.com/us/app/gradekit-track-grades-gpa/id947291514), and [Grades](https://apps.apple.com/us/app/grades-grade-calculator-gpa/id1069653513). They are useful for calculator and tracking patterns, but have less direct parity with a complete live StudentVUE record.

## Product position

Grademaxxing should be the fastest, clearest, and most trustworthy explanation of a student's official school record.

The interface should make three states unmistakable:

1. Official: the value returned by StudentVUE and when it was synchronized.
2. Estimated: a calculation from visible assignments, with discrepancies explained.
3. Simulated: a student's private what-if scenario, never presented as official.

We explicitly reject ranks, streaks, achievement systems, social comparison, public sharing, gradients, glows, and a card around every piece of content. Those patterns distract from a sensitive school record and were not supported by the product thesis.

## Versioned roadmap

| Version                       | Scope                                                                                  | Required validation                                                                         |
| ----------------------------- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| v0.0.1 baseline               | Freeze the known-good product before visual changes.                                   | Types, lint, unit, production build, public browser journeys, WCAG A/AA.                    |
| v0.1 visual foundation        | Central semantic light/dark tokens and outcome colors; no layout or data-path changes. | Theme contract, control states, WCAG, mobile, live StudentVUE human journey, source parity. |
| v0.2 grade truth              | Official/estimated/simulated labels, freshness, stale and failure behavior.            | Parser fixtures, discrepancy cases, refresh recovery, live parity.                          |
| v0.3 information architecture | Sharper navigation and grade-page hierarchy built from proven primitives.              | Every route/action, keyboard, screen readers, mobile/tablet/desktop.                        |
| v0.4 planning clarity         | Canvas-inspired what-if flow without copying its expression.                           | Math edge cases, undo/reset, simulation isolation, explanatory copy.                        |
| v1.0 school pilot             | Capacity, privacy, observability, incident ownership, and approved pilot.              | Full release, security, load, privacy, and operational gates.                               |

No version is described as school-ready until the capacity and privacy gates in `docs/release-checklist.md` have passed against the deployed artifact.
