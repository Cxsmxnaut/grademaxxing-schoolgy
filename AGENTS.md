# Repository instructions

Read `PROJECT_CONTEXT.md` before changing this repository, then follow the linked document for the area being modified.

## Required boundaries

- Preserve unrelated working-tree changes.
- Never store, print, log, commit, or fixture real StudentVUE credentials, cookies, portal data, student records, or student screenshots.
- Keep StudentVUE access read-only and keep official values distinct from local estimates or simulations.
- Preserve per-session serialization for operations that change StudentVUE reporting-period or class focus.
- Keep Cloudflare observability disabled and required secrets outside source control. Do not remove the production Worker route or Vercel rollback configuration.

## Deployment branches

- Routine development belongs on `pre-prod`. Push explicitly with `git push origin pre-prod`; it deploys only to `dev.grademaxxing.app` and its existing preview alias.
- `main` deploys only to production. Promote application changes to `main` only when the user explicitly requests a production release for those changes, using a separate reviewed pull request.
- Do not publish the same development change to both branches, automatically synchronize the branches, or use `git push --all`, `--mirror`, or multiple branch refspecs. A pre-production deployment is not authorization for a production release.
- Keep deployment workflow branch guards and explicit Wrangler config paths intact. When the user requests deployment-policy maintenance, apply only the requested policy files to `main`; do not include application changes.

## Structure

- Route/UI composition: `src/routes/`
- External portal contracts: `src/lib/contracts/studentvue/`
- Grade domain: `src/lib/grades/`
- Browser StudentVUE client: `src/lib/studentvue/` through the compatibility facade `src/lib/synergy.ts`
- Server portal client: `src/lib/server/pxp2.ts`; supporting contracts/parsers/infrastructure: `src/lib/server/pxp2/`
- Server API support: `src/lib/server/studentvue-api/`; private operations: `src/lib/server/admin/` and `src/lib/server/analytics/`
- Shared browser state: `src/lib/storage/`
- Reusable product components: `src/lib/components/`; actively used primitives: `src/lib/components/ui/`

Import from the owning module. Do not add a catch-all `$lib` barrel or move server-only portal logic into browser code.

## Validation

Run focused tests while developing. Before handing off a completed change, run:

```sh
npm run verify
npm run build:cloudflare
```

Run focused Playwright coverage for route, UI, session, accessibility, or deployment behavior. Live portal tests require explicit authorization and a designated test account supplied outside source control.
