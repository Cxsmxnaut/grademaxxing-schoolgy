# Grademaxxing

## Overview

Grademaxxing is a private, read-only grade companion for StudentVUE, the grade portal used by many school districts. It sits on top of a student's existing portal account and turns the raw gradebook into grade trends, weighted-category math, what-if scores, attendance records, documents, and school mail — without ever changing school data.

- Web app: <https://grademaxxing.app>
- Stack: SvelteKit (Svelte 5) + TypeScript, deployed to Cloudflare Workers with static assets; Vercel is a rollback target.
- Scope: read-only StudentVUE access. Grademaxxing cannot submit assignments, change grades, or send mail.

## Install

```sh
git clone <this repository>
cd grademaxxing
npm ci
npm run dev
```

The dev server listens on `127.0.0.1:5173`. Node.js 22.12+ is required.

## Configuration

Runtime configuration lives in `wrangler.jsonc` (Cloudflare) and environment variables:

- `MAINTENANCE_MODE` — `off` normally; set to a truthy value to show the maintenance page.
- `GRADEMAXXING_SESSION_SECRET` — encrypts the HTTP-only app session cookie (secret; never commit).
- `GRADEMAXXING_ANALYTICS_HMAC_SECRET` — hashes referral student keys (secret; never commit).
- `GRADEMAXXING_ADMIN_SECRET`, `GRADEMAXXING_ADMIN_PASSWORD_HASH` — guard the admin console (secrets; never commit).

Secrets are injected per environment with `wrangler secret put`; no secret values live in this repository.

## Usage

```sh
npm run dev        # local dev server on 127.0.0.1:5173
npm run verify     # svelte-check, eslint, prettier, knip, unit tests
npm run build:cloudflare   # production Cloudflare build
```

Agent-facing endpoints on the deployed site:

```sh
curl https://grademaxxing.app/llms.txt      # llmstxt.org site summary
curl https://grademaxxing.app/sitemap.md    # Markdown sitemap
curl -H "Accept: text/markdown" https://grademaxxing.app/  # Markdown via content negotiation
```

An OAuth-protected MCP server is available at `/mcp` with discovery documents under
`/.well-known/oauth-*`. All application APIs under `/api` require an authenticated
StudentVUE session.

## Conventions

- Import from the owning module (`src/lib/grades`, `src/lib/server/pxp2.ts`, `src/routes`); no catch-all barrels.
- Per-session serialization is required for any operation that changes StudentVUE reporting-period or class focus.
- Official StudentVUE values stay distinct from local estimates; what-if and projected grades must be labeled as simulations.
- Format with Prettier and lint with ESLint; run `npm run verify` before handing off.

## Out of scope

- Never store, log, or commit StudentVUE credentials, cookies, portal data, student records, or student screenshots.
- Never write to StudentVUE — access stays read-only.
- Do not remove the production Worker route, the Vercel rollback configuration, or the deployment branch guards.
- Keep Cloudflare observability disabled and required secrets outside source control.
