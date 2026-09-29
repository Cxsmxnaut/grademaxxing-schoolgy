# Codebase architecture

## Stack

- Svelte 5 and SvelteKit 2, TypeScript, Vite, Tailwind CSS 4.
- Server-side StudentVUE portal adapter, not a public Edupoint API client.
- Stateless encrypted browser session cookie; no student-record database.
- Vitest for unit/contract tests and Playwright for browser, accessibility, security, session, and live-portal coverage.
- Node, Vercel, and Cloudflare adapters are selected in `svelte.config.js`.

## Application layers

```text
Browser Svelte pages / stores
        │ same-origin fetch
        ▼
SvelteKit API routes
        │ session cookie + serialized operation gate
        ▼
Pxp2Client and StudentVUE adapters
        │ form login + PXP2 pages / structured calls
        ▼
District StudentVUE portal
```

### Client and routes

`src/routes/+page.svelte` is the public landing page. `login` and `privacy` are public routes. Legacy onboarding URLs redirect to `login`. Routes beneath `src/routes/(authed)` share the application shell and sidebar.

Key authenticated routes:

- `grades`: main gradebook; `grades/[index]` is the course-detail and what-if calculator page.
- `gpa-calculator`: GPA planning utility.
- `attendance`: calendar/list presentation backed by normalized attendance state.
- `documents`: StudentVUE document list and file viewer.
- `mail`: read-only folders, message dialog, and attachment viewer.
- `studentinfo`: Student profile and photo.
- `feedback`: product feedback surface. Review its destination before making a school-facing launch.
- `dashboard`: legacy compatibility route; it redirects/aliases toward the gradebook experience rather than defining a separate product area.

`src/routes/(authed)/+layout.svelte` holds session bootstrap, cached data restoration, refresh handling, reconnect behavior, and app-wide navigation. `AppSidebar.svelte` is the sidebar visual system and class list. Page-specific `.svelte.ts` files are reactive stores for attendance, documents, mail, and profile data.

### Domain logic

`src/lib/grades/` contains calculation and presentation-independent grade logic:

- `gradebook.ts` and `course.ts` normalize grade data.
- `assignments.ts` is the stable assignment-domain facade; `assignments/` owns contracts, calculations, and portal parsing.
- `gpa.ts` and `rank.ts` own GPA/rank calculations.
- `refresh.ts` and `seenAssignments.ts` manage refresh snapshots and newly seen records.
- `catalog.ts` is the persisted gradebook catalog; `catalog.svelte.ts` is its reactive client facade.
- `course-name.ts` owns StudentVUE course-title normalization used by presentation layers.

Keep official portal grades distinct from calculated/simulated values. Product copy and state styling communicate that distinction. Never silently replace official values with local calculations.

Cross-cutting browser utilities are grouped by responsibility instead of a catch-all barrel:

- `src/lib/contracts/studentvue/`: external StudentVUE wire contracts, kept distinct from internal grade-domain models.
- `src/lib/storage/`: browser storage keys and reusable cached-record loading state.
- `src/lib/format/`: locale-aware display formatting.
- `src/lib/files/`: bounded, MIME-checked browser file handling.
- `src/lib/studentvue/`: browser-side account/session behavior, API retries and serialization, and legacy XML compatibility. `src/lib/synergy.ts` is a compatibility facade only.

### API surface

`POST /api/session` performs StudentVUE login. It issues an HttpOnly `grademaxxing_session` cookie and a client session identifier. `GET /api/session/status` reports liveness; `GET /api/session/keepalive` refreshes the portal session while the page is active; it is not a password refresh.

`/api/studentvue/[resource]` exposes the read-only modern StudentVUE contract. The capabilities endpoint is the discoverable source of supported resource names. The detailed mapping is in [studentvue-modern-api.md](studentvue-modern-api.md).

`/api/health` is the public deployment health check and must stay free of student data.

### Server integration

- `src/lib/server/pxp2.ts`: stateful PXP2 portal client and login/resume/resource orchestration.
- `src/lib/server/pxp2/`: portal contracts, errors, destination validation, bounded response readers, concurrency helpers, and HTML/structured-response parsers.
- `src/lib/server/studentvue-api/`: public resource inventory, query validation, and legacy response-shape adapters used by the dynamic API route.
- `src/lib/server/admin/` and `src/lib/server/analytics/`: private administrator authentication and privacy-preserving usage metrics.
- `src/lib/server/gradebook-adapter.ts`: complete gradebook retrieval and period/class focus behavior.
- `src/lib/server/studentvue-adapters.ts`: adapts modern portal records to the application contracts; attendance normalization and profile-photo handling live here.
- `src/lib/server/student-session.ts`: session encryption, rolling TTL, per-session serialization, and global portal-operation backpressure.

The StudentVUE portal maintains gradebook period/class focus in its own upstream session. That means complete gradebook reads must remain serialized for one signed-in session. Do not parallelize period/focus-changing requests merely to make them faster.

## Styling and components

`src/app.css` is the canonical semantic-token file for light/dark colors, typography, status colors, surfaces, sidebar tokens, focus rings, and charts. Fonts are Instrument Sans (body), Space Grotesk (headings), and IBM Plex Mono (technical labels). Prefer semantic Tailwind tokens such as `bg-background`, `text-foreground`, and `bg-sidebar` over hard-coded colors. The public landing page's isolated visual system lives in `src/lib/components/landing/landing.css`.

Reusable primitives live in `src/lib/components/ui`. Keep only primitives that have active application consumers. Product-level shared pieces live in `src/lib/components`, notably `AppPageShell`, `AppPageHeader`, `LoadingBanner`, `RecordLoadFailure`, and `RankEmblem`.

## Configuration and deployment files

- `svelte.config.js`: chooses Cloudflare only when `DEPLOY_TARGET=cloudflare`; normal local builds use Node, and Vercel remains supported.
- `wrangler.jsonc`: Cloudflare Worker definition, required session secret, no observability, and the production route.
- `vercel.json`: legacy Vercel configuration; leave intact until a separately authorized retirement/rollback decision.
- `.env.example`: safe template only. Never add live secrets or student details.

## Tests and scripts

- Unit tests: `src/tests/`.
- Browser tests: `tests/e2e/`.
- Human/headful test: `tests/human/headful-human.spec.ts`.
- Visual parity helpers: `scripts/compare-visual-parity.ts`, `capture-gradewave-reference.ts`, and related scripts.
- StudentVUE diagnostics: `scripts/verify-studentvue-parity.ts`, `trace-portal-capabilities.mjs`, and `trace-course-api.mjs`.

`npm run verify` is the standard local quality gate: Svelte/type diagnostics, formatting and lint, dead-code/dependency analysis, and unit tests. CI additionally builds the Node and Cloudflare targets and runs Playwright.

The live StudentVUE Playwright tests are intentionally skipped unless designated credentials are supplied through environment variables. That is a safety mechanism, not a missing test.
