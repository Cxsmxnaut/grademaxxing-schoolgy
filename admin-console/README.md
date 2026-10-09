# Grademaxxing operations console

The React operations console uses the vendored TailAdmin shell and the existing
`/api/admin/*` backend. See [VENDORED.md](VENDORED.md) for origin and license.

Run `npm run build:admin` from the repository root to build `/admin-app/`.
The main Node and Cloudflare builds include this step. `/admin` redirects to
the console; refreshing a nested route serves the same app shell.

For local development, start the Svelte backend with `npm run dev`, then run
`npm run dev:admin` and open `http://127.0.0.1:5174/admin-app/`. The console
proxies API and font requests to port 5173; set `GRADEMAXXING_DEV_API_ORIGIN`
when the backend uses another port.

Access requires `GRADEMAXXING_ADMIN_SECRET` (at least 32 random characters) and
`GRADEMAXXING_ADMIN_PASSWORD_HASH` (SHA-256) in the deployment environment.
There is no built-in password or signing-key fallback. The optional
`GRADEMAXXING_ADMIN_USERNAME` defaults to `admin`, and
`GRADEMAXXING_ADMIN_DISPLAY_NAME` defaults to `Administrator`.
For password/session-key rotation, follow the operations runbook; credentials
must stay outside the source tree.

The console shows usage metrics, product feedback, referral partners, and
protected user keys. It does not retrieve StudentVUE grades or records.
`npm run verify` checks both applications. Focused browser coverage lives in
`tests/e2e/admin-dashboard.spec.ts` and `admin-security.spec.ts`.
