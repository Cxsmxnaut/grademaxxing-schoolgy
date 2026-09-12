# Grademaxxing (Beta)

Grademaxxing is a privacy-conscious, read-only StudentVUE companion for understanding grades, planning what-if scores, and viewing attendance, documents, mail, and profile information.

> StudentVUE is a registered trademark of Edupoint Educational Systems LLC. Grademaxxing is not affiliated with or endorsed by Edupoint, a school district, or a school.

## Product boundaries

- StudentVUE is the source of truth; local calculations and simulations are labeled as estimates.
- The application reads portal data but does not send messages, submit work, edit records, or report absences.
- StudentVUE credentials are used only to establish or reconnect a session. They are never stored server-side.
- Raw student records, credentials, cookies, and request bodies must never enter logs, analytics, fixtures, screenshots, or source control.

Read [PROJECT_CONTEXT.md](PROJECT_CONTEXT.md) before making changes.

## Quick start

The supported development baseline is Node 22.

```sh
nvm use
npm ci
npm run dev
```

The development server listens on `127.0.0.1`. Live StudentVUE access is the default; mock behavior is opt-in through the safe values documented in [.env.example](.env.example).

## Quality gates

```sh
# Types, Svelte diagnostics, formatting, lint, dead code, dependencies, cycles, and unit tests
npm run verify

# Platform-specific production artifact
npm run build:cloudflare

# Browser, accessibility, security, and session flows
npm run test:e2e
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for repository boundaries and the expected change workflow. The complete release process is in [docs/release-checklist.md](docs/release-checklist.md).

## Architecture

```text
Svelte pages and reactive stores
            │ same-origin JSON
            ▼
      SvelteKit API routes
            │ encrypted session + serialized operation gate
            ▼
  Pxp2Client and portal adapters
            │ HTTPS
            ▼
   District StudentVUE portal
```

The detailed module and route map is in [docs/codebase-architecture.md](docs/codebase-architecture.md). The modern read-only API contract is documented in [docs/studentvue-modern-api.md](docs/studentvue-modern-api.md).

## Mock data

Generate local mocks only from an explicitly approved account and never commit generated records:

```sh
npm run generate-mocks
```

Set `PUBLIC_MOCK_STUDENTVUE_ORIGIN` only when the mock service worker should be active. Keep all credential-bearing environment values in ignored local files.

## Live diagnostics

Live tests and diagnostic scripts require a designated test account supplied outside source control. They are intentionally skipped or inert without that configuration.

For the local performance CLI:

```sh
npm run benchmark:studentvue -- configure
npm run benchmark:studentvue
```

See [docs/studentvue-api-benchmark.md](docs/studentvue-api-benchmark.md) for its credential and data-safety behavior.

## Deployment

Production runs on the Cloudflare Worker and route defined in [wrangler.jsonc](wrangler.jsonc). The required secrets live in Cloudflare, never in repository variables or files.

```sh
npm run build:cloudflare
npm run deploy:cloudflare
```

Follow [docs/operations-runbook.md](docs/operations-runbook.md) for health checks, custom-domain validation, and rollback. The Vercel configuration remains an intentional rollback path.

## License

Grademaxxing is an AGPLv3-derived modification of GradeCompass. The repository history, attribution, and [GNU Affero General Public License](LICENSE.txt) obligations remain intact. If you modify this source and host the modified application over a network, publish the corresponding source under the same license and document your changes.
