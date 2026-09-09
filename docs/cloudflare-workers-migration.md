# Cloudflare Workers staging migration

This project can run on Cloudflare Workers without moving the live Vercel deployment or DNS. The Cloudflare adapter is selected only when `DEPLOY_TARGET=cloudflare`.

## Why this is a staged migration

Grademaxxing handles StudentVUE credentials, an encrypted resumable portal session, grades, attendance, documents, messages, and student profile data. Cloudflare is therefore a new data processor. Do not make a school-directed deployment until the district has reviewed the processor, the Cloudflare data-processing terms, the application data map, and the security/retention controls.

Cloudflare's global edge also changes the network source used for StudentVUE requests. The encrypted app session survives a Worker instance change, but Edupoint must be validated to ensure it accepts a resumed portal session after requests reach a different Cloudflare edge.

## Local Worker validation

```sh
npm run build:cloudflare
npm run preview:cloudflare
```

The build target uses `@sveltejs/adapter-cloudflare`; normal `npm run build` still builds the existing Node target. Do not add `GRADEMAXXING_SESSION_SECRET` to source control. For local Worker preview, put a randomly generated secret only in an ignored `.dev.vars` file:

```sh
GRADEMAXXING_SESSION_SECRET="replace-with-at-least-32-random-characters"
```

## Staging release gate

Before `npm run deploy:cloudflare`:

1. Sign in to the intended Cloudflare account and verify that `grademaxxing-beta` is the intended Worker name.
2. Add `GRADEMAXXING_SESSION_SECRET` as a Cloudflare **secret**, never as a `vars` value or committed file. Use a new random value for the staging Worker so no existing Vercel session can be accepted there.
3. Keep Workers observability, Logpush, third-party analytics, and trace exports disabled for the student-data beta unless they have separately passed the privacy review. The Worker config explicitly disables observability.
4. Configure a Cloudflare dashboard/WAF login rate-limit rule for `POST /api/session`. The in-process rate limiter is a fallback only; Worker isolates are not global. Do not send raw usernames, session IDs, cookies, or grade data to a rate-limit key, log, or analytics product.
5. Deploy only to the Workers subdomain first. Do not move the production custom domain or turn off Vercel yet.

## Required canary test

Use a designated test account, not a tester's primary account, and record only pass/fail results:

1. Sign in, load grades, attendance, documents, mail, and a profile photo.
2. Refresh the page and verify the encrypted session remains valid.
3. Wait through the background keepalive interval; verify data refresh works without a new password prompt.
4. Test a StudentVUE session expiry and confirm the password-only reconnect flow works.
5. Sign out; verify the Worker session cookie and browser origin storage are cleared.
6. Check Worker logs and Cloudflare dashboard settings: no credentials, cookies, identifiers, grade payloads, document names, message content, or request query values may appear.
7. Repeat the suite from a second network/location before considering a custom-domain cutover.

## Cutover and rollback

Use the Cloudflare Workers subdomain for the canary. After the gate passes, point the custom domain at the Worker using Cloudflare's normal custom-domain flow. Keep the Vercel deployment available for an agreed rollback window. Roll back DNS/routing immediately if StudentVUE session continuity, login, or record retrieval is inconsistent.

## Operational constraints

- Workers' free CPU allocation is too tight for this server-rendered, encrypted, XML-parsing workload; use a paid/standard plan and set a bounded CPU limit.
- The app uses a stateless encrypted session cookie, so no student-record database, KV, D1, or R2 binding is needed for this migration. Do not add one merely for hosting.
- Cloudflare rate limiting is local to a Cloudflare location and eventually consistent. Use it as a fast layer, paired with a Cloudflare dashboard/WAF rule and the app's existing protective limits.
- Cloudflare Worker secrets must be configured separately for every Worker environment. Do not reuse the Vercel secret by copying it through chat, Git, logs, or a public CI variable.
