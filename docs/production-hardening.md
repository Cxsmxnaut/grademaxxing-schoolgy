# Production hardening

Grademaxxing (Beta) handles private student records. Every production deployment must use HTTPS and a high-entropy session secret.

## Required runtime configuration

```dotenv
NODE_ENV=production
ORIGIN=https://grades.example.edu
HOST=127.0.0.1
PORT=3000
BODY_SIZE_LIMIT=64K
GRADEMAXXING_MAX_ACTIVE_OPERATIONS=96
GRADEMAXXING_MAX_QUEUED_OPERATIONS=1000
GRADEMAXXING_OPERATION_QUEUE_TIMEOUT_MS=30000
GRADEMAXXING_SESSION_SECRET=<at least 32 random characters>
GRADEMAXXING_SESSION_TTL_HOURS=12
```

For adapter-node deployments, if TLS terminates at a trusted reverse proxy, configure the forwarded-header settings for that proxy. Never expose the Node port directly when trusting forwarded headers.

```dotenv
PROTOCOL_HEADER=x-forwarded-proto
HOST_HEADER=x-forwarded-host
ADDRESS_HEADER=x-forwarded-for
XFF_DEPTH=1
```

The proxy should preserve the public `Host`, set the forwarded headers itself, remove client-supplied copies, impose request/time limits, and disable caching for `/api/*`.

## Session topology

StudentVUE credentials are used for upstream login and discarded by the server. When a student opts into persistent sign-in, the browser stores an AES-GCM-encrypted credential envelope whose non-exportable key is held in IndexedDB; the password must never be logged or sent anywhere except the HTTPS sign-in/reconnect request. Live upstream cookie state is compressed, authenticated, and encrypted with AES-256-GCM inside the Secure, HttpOnly application cookie. `GRADEMAXXING_SESSION_SECRET` is required in production, must contain at least 32 random characters, and must be identical across every instance. Rotate it only when intentionally invalidating every active session.

The official Vercel adapter is selected automatically when `VERCEL=1`; other environments use adapter-node. App sessions expire after 12 hours and survive function cold starts without a session database. While an authenticated page is visible, the browser periodically touches a lightweight StudentVUE page so the portal's sliding session remains active, and it refreshes a gradebook that is more than five minutes old. Visibility, focus, page restore, and network-reconnect events also trigger a coalesced check. Browsers serialize session-bound StudentVUE requests across tabs to protect StudentVUE's mutable gradebook focus and prevent stale encrypted-cookie responses from winning a race.

StudentVUE does not issue Grademaxxing a refresh token. If persistent sign-in was enabled, an expired district session can be renewed from the encrypted device vault; otherwise cached account-scoped grades remain visible and the UI requests a password-only reconnect. A successful reconnect replaces the encrypted session and refreshes the current page without clearing same-student caches. Do not claim that reauthentication works after the user signs out, clears site data, or disables device storage.

Portal operations are also bounded across the whole process. The defaults allow 96 active student operations and queue 1,000 more for at most 30 seconds; excess or timed-out work receives a retryable `503` instead of exhausting memory, sockets, or StudentVUE. Work abandoned by a disconnected browser is removed from the queue. Tune these settings only after measuring the deployment host and coordinating acceptable traffic with the district portal owner.

Sign-in traffic is bounded globally and per account. Failed authentication is throttled by IP-and-account pair, account, and network so username rotation or distributed password guessing cannot bypass a single limiter.

## Monitoring

- Readiness/liveness: `GET /api/health` should return `200 {"status":"ok"}`.
- Every response contains `X-Request-ID`; unexpected and 30-second requests log that ID.
- `Server-Timing` reports app processing time.
- Alert separately on `UPSTREAM_SESSION_EXPIRED` and `APP_SESSION_INVALID`, plus elevated 429, 502, and 504 rates and process restarts.
- Do not log request bodies, cookies, query identifiers, usernames, passwords, or API response bodies.

## Security properties

- Production sessions use a Secure, HTTP-only, SameSite=Lax `__Host-` cookie.
- Every authenticated browser tab is bound to the exact server session generation. A stale tab from a prior account receives `401` rather than being allowed to read the replacement account's records.
- API and HTML responses are non-cacheable.
- CSP, anti-framing, MIME-sniffing, referrer, permissions, HSTS, and cross-origin isolation headers are set centrally.
- Unsafe API methods reject cross-site browser requests.
- Sign-in bodies, active sign-ins, failed attempts, active sessions, portal queues, upstream HTML/JSON, and downloads are bounded.
- Logout deletes the encrypted browser session, browser storage, cookies, and origin caches.
- Message HTML is isolated in a sandboxed iframe. Active attachment formats cannot execute through same-origin blob URLs.

Run the security probes, unit suite, and live human suite against the exact production build before each release.

```bash
npm run check
npm run lint
npm test
npm run build
GRADEMAXXING_URL=http://127.0.0.1:5173 npm run test:e2e
PLAYWRIGHT_HEADLESS=1 npx playwright test -c playwright.human.config.ts
```
