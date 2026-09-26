# Design system and visual QA

## Current visual direction

Grademaxxing (Beta) uses a restrained dark-first gradebook product style, with a matching light mode. The goal is close **interaction and information hierarchy parity** with current student-grade products, not copying another product's logos, branded graphics, wording, or proprietary source/assets.

The main visual references used during prior work were GradeWave-style spacing, typography hierarchy, sidebar density, loading behavior, and gradebook affordances. Preserve original Grademaxxing branding and use original visual assets.

## Tokens and typography

`src/app.css` is the one source for semantic colors. It exposes background/foreground, sidebar, surface, input, border, focus, grade-state, chart, and light/dark variables. Change the theme by editing semantic tokens there; do not scatter hex overrides throughout components.

- Body: Manrope.
- Headings: Outfit.
- Technical labels and compact metadata: JetBrains Mono.
- Icons: Lucide Svelte.

Use the existing semantic tokens and Tailwind aliases. Hard-coded colors are appropriate only for a genuinely local illustration/effect that cannot be represented semantically.

## Layout rules that matter

- The sidebar is a major visual anchor: brand lockup, primary navigation, class list, refresh state, theme choice, student identity, and logout affordance must remain readable at laptop and phone widths.
- The gradebook is the home experience. Do not turn it into a generic analytics dashboard or add a separate dashboard concept unless the user explicitly changes product direction.
- Official marks must be prominent; simulations and calculations need visual labels so they cannot be mistaken for school-record values.
- Avoid a card-inside-card effect. Use spacing, surface changes, and typographic hierarchy before adding decorative borders.
- Keep useful feedback responsive: login routes show a full-screen loading state while grade data is being retrieved; do not strand a user on an empty gradebook while waiting.
- Test both themes and a phone-width viewport after any shell/sidebar/token change.

## Visual and interaction tests

```sh
npm run test:e2e
npm run visual:diff
npm run visual:audit
npm run test:human
```

Playwright tests cover accessibility, responsive layouts, sidebar/navigation behavior, sign-in flows, session persistence, records states, theme contracts, gradebook controls, and landing content. The human suite uses actual clicks/headful behavior when valid designated test credentials are authorized.

Use screenshots and pixel diffs to catch regressions, but never commit screenshots containing a real student's information. For a change touching menus, test the closed state, open state, keyboard access, dismissal, phone layout, loading state, error state, and light/dark rendering.

## Product copy and branding

Use `Grademaxxing (Beta)` consistently in user-facing text. Do not claim district or Edupoint endorsement. Keep the StudentVUE trademark notice where legally appropriate. Be cautious about making claims such as "we never store grades" unless the actual deployment, caches, logs, feedback workflow, and privacy notice support it.
