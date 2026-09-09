# Fresh-agent continuation checklist

Use this when a new Codex chat opens for Grademaxxing.

1. Open [PROJECT_CONTEXT.md](../PROJECT_CONTEXT.md) first.
2. Inspect `git status --short` before editing. Preserve unrelated changes.
3. Identify the request domain:
   - UI/visual: read [design-system.md](design-system.md).
   - StudentVUE/data/session: read [studentvue-integration.md](studentvue-integration.md) and [studentvue-modern-api.md](studentvue-modern-api.md).
   - deploy/domain/Cloudflare: read [operations-runbook.md](operations-runbook.md).
   - school readiness/privacy: read [student-data-compliance-audit.md](student-data-compliance-audit.md).
4. Run only the relevant checks first. Avoid live StudentVUE checks unless a designated test account and explicit authorization are in scope.
5. For code changes, use `apply_patch`, keep secrets out of output, and avoid destructive Git/DNS actions.
6. For any public deployment, verify the Worker hostname, production health endpoint, and the custom domain separately.

## Known facts worth retaining

- Legacy SOAP is not the integration path; PXP2 is.
- Gradebook retrieval has mutable upstream period/class focus and must remain serialized per session.
- The application session is encrypted/stateless; do not add a student database merely to make login persistence work.
- Background keepalive preserves a still-valid StudentVUE session; it cannot refresh an upstream session that has already expired.
- Attendance is exception-based; past school days may imply present, while future cells must not.
- Cloudflare is live for `grademaxxing.app`; Vercel config is retained for rollback, not removed.
- Cloudflare Universal SSL may temporarily wait on TXT validation after a DNS change. Wait for its status rather than removing the route/records.
- Production Playwright and health verification were last observed passing after the Cloudflare cutover; re-run after platform/auth/parser changes.

## Useful source starting points

| Concern | Start here |
| --- | --- |
| Login/session | `src/routes/api/session/+server.ts`, `src/lib/server/student-session.ts` |
| Portal client | `src/lib/server/pxp2.ts` |
| Gradebook data | `src/lib/server/gradebook-adapter.ts`, `src/lib/grades/` |
| StudentVUE resource API | `src/routes/api/studentvue/[resource]/+server.ts` |
| Main app shell/sidebar | `src/routes/(authed)/+layout.svelte`, `src/routes/(authed)/AppSidebar.svelte` |
| Theme | `src/app.css` |
| Cloudflare | `svelte.config.js`, `wrangler.jsonc` |
