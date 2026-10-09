# Design system and visual QA

## Current visual direction

Grademaxxing (Beta) uses a restrained dark gradebook product style. The goal is close **interaction and information hierarchy parity** with current student-grade products, not copying another product's logos, branded graphics, wording, or proprietary source/assets.

The main visual references used during prior work were GradeWave-style spacing, typography hierarchy, sidebar density, loading behavior, and gradebook affordances. Preserve original Grademaxxing branding and use original visual assets.

## Tokens and typography

`src/app.css` is the one source for semantic colors. It exposes background/foreground, sidebar, surface, input, border, focus, grade-state, and chart variables for the dark-only interface. Change colors by editing semantic tokens there; do not scatter hex overrides throughout components.

- Body: Manrope.
- Headings: Outfit.
- Technical labels and compact metadata: JetBrains Mono.
- Icons: Lucide Svelte.

Use the existing semantic tokens and Tailwind aliases. Hard-coded colors are appropriate only for a genuinely local illustration/effect that cannot be represented semantically.

## Corner radius system

Apple's design guidance describes rounded rectangles, capsules, and concentric nested shapes rather than prescribing one radius for every element. It recommends continuous-looking corners and matching an inner corner to its enclosing corner by subtracting the inset. Our web implementation uses a shared, app-specific scale in `src/app.css`:

| Token / Tailwind class         | Radius | Use                                  |
| ------------------------------ | -----: | ------------------------------------ |
| `--corner-xs` / `rounded-xs`   |    4px | Tiny controls and indicators         |
| `--corner-sm` / `rounded-sm`   |    8px | Compact controls and inner elements  |
| `--corner-md` / `rounded-md`   |   12px | Inputs, buttons, and small panels    |
| `--corner-lg` / `rounded-lg`   |   16px | Cards and gradebook rows             |
| `--corner-xl` / `rounded-xl`   |   20px | Large panels and prominent surfaces  |
| `--corner-2xl` / `rounded-2xl` |   24px | Dialog-scale and page-level surfaces |

Choose the parent radius first, then give a nested surface a smaller radius that follows its padding (for example, a 24px shell with 8px inset can contain a 16px panel). Keep avatars and circular icons at `50%` or `rounded-full`; use capsule ends for pills and progress bars. Asymmetric speech bubbles, chart marks, and deliberately square edges retain their functional shapes. Do not alter color or typography to apply the corner system.

References: [Apple's design system session](https://developer.apple.com/videos/play/wwdc2025/356/), [Apple's guidance on concentric corners](https://developer.apple.com/videos/play/wwdc2023/10076/), and [SwiftUI continuous corner style](https://developer.apple.com/documentation/swiftui/roundedcornerstyle/continuous). These tokens are Grademaxxing's web adaptation, not Apple-specified pixel values.

## Layout rules that matter

- The sidebar is a major visual anchor: brand lockup, primary navigation, class list, refresh state, student identity, and logout affordance must remain readable at laptop and phone widths.
- The gradebook is the home experience. Do not turn it into a generic analytics dashboard or add a separate dashboard concept unless the user explicitly changes product direction.
- Official marks must be prominent; simulations and calculations need visual labels so they cannot be mistaken for school-record values.
- Avoid a card-inside-card effect. Use spacing, surface changes, and typographic hierarchy before adding decorative borders.
- Keep useful feedback responsive: login routes show a full-screen loading state while grade data is being retrieved; do not strand a user on an empty gradebook while waiting.
- Check the dark interface at desktop and phone widths after any shell/sidebar/token change.

## Visual and interaction tests

```sh
npm run test:e2e
npm run visual:diff
npm run visual:audit
npm run test:human
```

Playwright tests cover accessibility, responsive layouts, sidebar/navigation behavior, sign-in flows, session persistence, records states, theme contracts, gradebook controls, and landing content. The human suite uses actual clicks/headful behavior when valid designated test credentials are authorized.

Use screenshots and pixel diffs to catch regressions, but never commit screenshots containing a real student's information. For a change touching menus, check the closed state, open state, keyboard access, dismissal, phone layout, loading state, and error state.

The public landing is implemented in `src/routes/+page.svelte`, with isolated styling in `src/lib/components/landing/landing.css` and synthetic app previews in `static/landing/images/`. It uses the integrated hills/scroll presentation and a static, responsive feature-preview grid; it does not depend on the standalone Next.js prototypes. Refresh preview assets when the app layout changes; never use a student's live records for public previews. Landing links target the existing `/login` and `/privacy` routes, while saved sessions continue to `/grades`. Focused coverage lives in `tests/e2e/landing.spec.ts` and `tests/e2e/landing-animos.spec.ts`, alongside accessibility, auth-flow, and session-persistence coverage.

## Product copy and branding

Use `Grademaxxing (Beta)` consistently in user-facing text. Do not claim district or Edupoint endorsement. Keep the StudentVUE trademark notice where legally appropriate. Be cautious about making claims such as "we never store grades" unless the actual deployment, caches, logs, feedback workflow, and privacy notice support it.
