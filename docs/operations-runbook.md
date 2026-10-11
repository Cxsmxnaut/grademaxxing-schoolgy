# Operations runbook

## Hosting topology

The active public deployment is a Cloudflare Worker:

- Domain: `grademaxxing.app`
- Worker service: `grademaxxing-beta`
- Public Worker route: `grademaxxing.app/*`
- Cloudflare test hostname: `grademaxxing-beta.bhavith-lolakapuri.workers.dev`
- Registrar: Spaceship
- Nameservers: Cloudflare-managed nameservers

`wrangler.jsonc` is the source of truth for the Worker route. It requires `GRADEMAXXING_SESSION_SECRET`, keeps Cloudflare observability disabled, and uses Cloudflare's static-assets binding. Normal builds remain Node-oriented; Cloudflare builds require `DEPLOY_TARGET=cloudflare`.

Pre-production uses branch `pre-prod`, Worker `grademaxxing-pre-prod`, and `wrangler.preprod.jsonc`. Its preview address is `https://dev.grademaxxing.app`; `https://new.grademaxxing.app` remains an alias. Every push to `pre-prod` runs [the pre-production deployment workflow](../.github/workflows/deploy-preprod.yml): dependency audit, source verification, Cloudflare build, deployment, public health checks, and landing/login browser smoke tests. It uses the existing repository `CLOUDFLARE_API_TOKEN` secret and the GitHub `Preview` environment. A newer push supersedes an in-flight pre-production run.

For a manual local deployment, use `npx wrangler deploy --config wrangler.preprod.jsonc` after the normal verification and Cloudflare build checks. The production workflow remains separate and runs on pushes to `main`.

## Maintenance page

The maintenance page is preserved in [`src/lib/components/MaintenancePage.svelte`](../src/lib/components/MaintenancePage.svelte). It is a reusable fallback; do not delete it when the public site is open. The root layout renders it only when the server-side `MAINTENANCE_MODE` variable is exactly `on`. Production sets this variable to `off` in `wrangler.jsonc`, so the public site shows the normal application.

To use the page again for a planned maintenance window, change `MAINTENANCE_MODE` to `on` in `wrangler.jsonc`, deploy the Worker, and verify the public page. Set it back to `off` and deploy again to reopen the site. The health endpoint remains available in either mode, so check the homepage itself when verifying the switch. The maintenance page was previously enabled by a permanent `grademaxxing.app` hostname check; that check was removed because it kept production offline after the merge.

## Common commands

```sh
# Local development
npm run dev

# Quality gate
npm run check
npm test
npm run test:e2e

# Cloudflare build and deployment
npm run build:cloudflare
npm run deploy:cloudflare

# Public health check
curl -fsS https://grademaxxing.app/api/health
```

The health endpoint should return a small non-sensitive JSON object and HTTP 200. Do not turn it into a diagnostic endpoint that leaks configuration, user data, or upstream status.

## Deployment procedure

1. Review `git status`; do not accidentally deploy or commit unrelated user work.
2. Run `npm run check`, `npm test`, and relevant Playwright suites. For platform-sensitive releases, follow [release-checklist.md](release-checklist.md).
3. Confirm Cloudflare has `GRADEMAXXING_SESSION_SECRET` stored as a secret. Do not use a `vars` field, a checked-in file, chat, or CI output for the value.
4. Deploy with `npm run deploy:cloudflare`.
5. Verify the Worker-hostname health endpoint before checking the custom domain.
6. Verify `https://grademaxxing.app/api/health`, then run a focused production-domain browser suite.
7. Inspect response headers: successful public traffic should show Cloudflare, never an unexpected Vercel response.

## Domain and DNS safeguards

Before changing DNS, inventory A/AAAA/CNAME/MX/TXT/DMARC/SPF records. The `grademaxxing.app` zone has Improvmx mail records and SPF/DMARC entries that must be preserved.

The first Cloudflare move briefly left HTTPS unavailable while Universal SSL completed TXT validation. Cloudflare automatically created the temporary `_acme-challenge` records. A short certificate-provisioning period after nameserver changes is normal; do not delete validation records or change routing simply because HTTPS is not immediate. Confirm certificate status in Cloudflare and recheck after propagation.

Do not modify `grademaxxing.com` as part of this app unless the user explicitly asks; it is separate from the deployed `.app` property.

## Rollback

For an application code regression, redeploy the previously known-good Worker version or temporarily remove/replace the Worker route in an explicitly authorized rollback. For a domain/routing regression, preserve mail records and move only the web routing back to the prior verified host. Do not use broad DNS replacement or deletion commands.

Vercel configuration remains in the repository as a possible rollback path. Do not remove the Vercel deployment or configuration unless an explicit decommissioning task covers that scope.

## Logging and privacy

Cloudflare observability is intentionally disabled for this student-data beta. Keep raw credentials, cookies, identifiers, grades, attendance, document names, message bodies, attachments, and request bodies out of logs, analytics, traces, error reporters, feedback providers, and support tickets. Read the [student-data compliance audit](student-data-compliance-audit.md) before public/school expansion.
