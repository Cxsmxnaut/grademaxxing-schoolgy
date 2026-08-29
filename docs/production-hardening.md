# Production hardening

Grademaxxing handles private student records. A production deployment must use HTTPS and a long-lived Node process behind a trusted reverse proxy.

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
GRADEMAXXING_MAX_SESSIONS=5000
GRADEMAXXING_SESSION_TTL_HOURS=12
```

If TLS terminates at a trusted reverse proxy, configure adapter-node's forwarded-header settings for that proxy. Never expose the Node port directly when trusting forwarded headers.

```dotenv
PROTOCOL_HEADER=x-forwarded-proto
HOST_HEADER=x-forwarded-host
ADDRESS_HEADER=x-forwarded-for
XFF_DEPTH=1
```

The proxy should preserve the public `Host`, set the forwarded headers itself, remove client-supplied copies, impose request/time limits, and disable caching for `/api/*`.

## Session topology

StudentVUE browser sessions contain live upstream cookie state and are intentionally held only in server memory. Run one long-lived app instance. Multiple replicas require sticky routing plus a shared, encrypted session implementation; deploying multiple stateless replicas as-is will cause random session-expired responses.

The build intentionally rejects Vercel's serverless environment for this reason. Deploy the generated adapter-node server to a long-lived VM or container with process supervision and a trusted HTTPS reverse proxy.

Sessions expire after 12 hours, are capped at 5,000 per process, and serialize each student's portal operations to prevent StudentVUE focus-state races. The per-session queue is bounded. A process restart safely invalidates all sessions without retaining passwords.

Portal operations are also bounded across the whole process. The defaults allow 96 active student operations and queue 1,000 more for at most 30 seconds; excess or timed-out work receives a retryable `503` instead of exhausting memory, sockets, or StudentVUE. Work abandoned by a disconnected browser is removed from the queue. Tune these settings only after measuring the deployment host and coordinating acceptable traffic with the district portal owner.

Sign-in traffic is bounded globally and per account. Failed authentication is throttled by IP-and-account pair, account, and network so username rotation or distributed password guessing cannot bypass a single limiter.

## Monitoring

- Readiness/liveness: `GET /api/health` should return `200 {"status":"ok"}`.
- Every response contains `X-Request-ID`; unexpected and 30-second requests log that ID.
- `Server-Timing` reports app processing time.
- Alert on elevated 401, 429, 502, and 504 rates and on process restarts.
- Do not log request bodies, cookies, query identifiers, usernames, passwords, or API response bodies.

## Security properties

- Production sessions use a Secure, HTTP-only, SameSite=Lax `__Host-` cookie.
- Every authenticated browser tab is bound to the exact server session generation. A stale tab from a prior account receives `401` rather than being allowed to read the replacement account's records.
- API and HTML responses are non-cacheable.
- CSP, anti-framing, MIME-sniffing, referrer, permissions, HSTS, and cross-origin isolation headers are set centrally.
- Unsafe API methods reject cross-site browser requests.
- Sign-in bodies, active sign-ins, failed attempts, active sessions, portal queues, upstream HTML/JSON, and downloads are bounded.
- Logout deletes server state, browser storage, cookies, and origin caches.
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
