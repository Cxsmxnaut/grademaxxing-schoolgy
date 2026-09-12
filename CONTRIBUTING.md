# Contributing to Grademaxxing

Grademaxxing handles sensitive student-record workflows. Contributions must preserve the read-only product boundary, privacy model, and serialized StudentVUE session behavior described in [PROJECT_CONTEXT.md](PROJECT_CONTEXT.md).

## Local setup

1. Use Node 22 (`nvm use` reads `.nvmrc`).
2. Install the locked dependency graph with `npm ci`.
3. Start the local server with `npm run dev`.

Do not add real StudentVUE credentials, cookies, records, screenshots, or portal captures to the repository. Live portal testing requires an approved test account supplied outside source control.

## Repository map

| Path                                  | Responsibility                                                                  |
| ------------------------------------- | ------------------------------------------------------------------------------- |
| `src/routes/`                         | SvelteKit pages, layouts, and same-origin API endpoints                         |
| `src/lib/contracts/studentvue/`       | External StudentVUE wire contracts                                              |
| `src/lib/grades/`                     | Gradebook normalization, calculations, simulations, and cached catalog state    |
| `src/lib/studentvue/`                 | Browser-side StudentVUE account, request, retry, and XML compatibility code     |
| `src/lib/server/pxp2.ts`              | Stateful server-side portal orchestration                                       |
| `src/lib/server/pxp2/`                | Portal contracts, parsing, destination validation, response limits, and helpers |
| `src/lib/server/studentvue-api/`      | Resource inventory, parameter validation, and legacy response adapters          |
| `src/lib/server/admin/`, `analytics/` | Private admin authentication and privacy-preserving usage metrics               |
| `src/lib/storage/`                    | Browser cache keys and reusable record-loading state                            |
| `src/lib/components/ui/`              | Reusable UI primitives with active product consumers                            |
| `src/tests/`                          | Unit, parser, state, and contract tests                                         |
| `tests/e2e/`                          | Browser, accessibility, security, and session-flow tests                        |
| `scripts/`                            | Explicit diagnostic, release, benchmark, and visual-audit entry points          |

See [docs/codebase-architecture.md](docs/codebase-architecture.md) for the complete data flow and route inventory.

## Change workflow

Run focused tests while developing, then run the full local gate before requesting review:

```sh
npm run verify
npm run build:cloudflare
```

Run `npm run test:e2e` for route, session, accessibility, or UI behavior changes. Live StudentVUE tests remain skipped unless explicitly configured with approved credentials.

The dead-code gate (`npm run check:dead-code`) treats every diagnostic script as an intentional entry point and rejects unreachable source files, missing direct dependencies, unresolved imports, and circular dependencies.

## Architecture rules

- Import from the module that owns a responsibility; do not recreate a catch-all `$lib` barrel.
- Keep portal transport and parsing server-side. Browser code talks only to same-origin `/api` routes.
- Preserve per-session serialization around StudentVUE operations that mutate reporting-period or class focus.
- Keep official portal values distinct from local estimates and what-if calculations.
- Use semantic tokens from `src/app.css`; cover light, dark, keyboard, loading, empty, failure, and phone states.
- Keep Cloudflare configuration in `wrangler.jsonc`, observability disabled, and Vercel configuration available for rollback.

## Commits and pull requests

Keep commits focused and explain behavior changes, test coverage, deployment impact, and any privacy or data-handling implications. Do not combine generated artifacts or local environment files with source changes.
