# School release gate

Do not describe a Grademaxxing (Beta) build as school-ready until this checklist passes against the exact artifact that will be deployed.

## Automated gate

1. Install from the lockfile with `npm ci`.
2. Run `npm audit --audit-level=high` and resolve every high or critical production finding.
3. Run `npm run test:release`. This covers types, Svelte diagnostics, formatting, lint, 31+ unit tests, the production build, public WCAG A/AA checks, request guards, headers, health, and unsafe district destinations.
4. Start the production adapter-node build with the intended runtime environment and build once with `VERCEL=1` to validate the official Vercel adapter.
5. Supply test-account credentials only through environment variables and run `PLAYWRIGHT_HEADLESS=1 npm run test:human`. This exercises actual clicks through login, grades, every class, planning tools, attendance, documents, mail, profile, privacy, refresh, failure recovery, password-only session reconnect, logout, and a 390px viewport. It also verifies the complete modern API contract and malformed upstream records.
6. Confirm `GRADEMAXXING_SESSION_SECRET` is present in every production and preview runtime and is never exposed to the browser, build logs, or repository.
7. Scan tracked and untracked source for real usernames, passwords, cookies, tokens, generated portal records, traces, and screenshots before publishing.
8. For visual-system releases, verify the dark semantic token contract, interactive states, phone layout, and WCAG A/AA checks. Compare screenshots locally, but never commit screenshots containing a real student's record.

## Capacity gate

- The unit burst test proves the global gate never exceeds its active-operation limit and sheds work after the bounded queue is full.
- Set active and queued limits from measured CPU, memory, network, and StudentVUE behavior—not student enrollment alone.
- Load-test a staging deployment with synthetic or district-approved accounts. Never repeatedly authenticate real students or scrape StudentVUE at scale without district approval.
- For adapter-node, confirm the proxy and process supervisor enforce connection, request, and restart limits. For Vercel, confirm the configured function duration covers the slowest approved StudentVUE operation.
- Alert on latency and rates of 401, 429, 502, 503, and 504 responses. Use `X-Request-ID` to correlate failures without logging private payloads.

## Privacy and operations gate

- HTTPS is mandatory. The Node port is private and only the trusted proxy can set forwarded headers.
- No request body, cookie, username, student identifier, document/message identifier, grade payload, or downloaded file is logged.
- Verify logout clears the encrypted session cookie and browser-origin storage.
- Verify a simulated `UPSTREAM_SESSION_EXPIRED` response leaves cached grades and local identity intact, shows the reconnect prompt, and replaces the session after password entry.
- Assign an incident owner and publish a support path before launch.
- Document maintenance windows and tell students that rotating the session secret requires signing in again.
- Re-run the full gate after any dependency, parser, authentication, cache, API, or UI change.
