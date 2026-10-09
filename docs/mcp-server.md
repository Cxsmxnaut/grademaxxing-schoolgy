# MCP server (ChatGPT / Claude connectors)

Grademaxxing exposes a remote Model Context Protocol server so ChatGPT, Claude,
Claude Code, and other MCP hosts can use every read-only ability of the app:
gradebook analysis, what-if projection, GPA math, attendance, calendar,
schedule, documents, report cards, mail reading, profile, and school info.

The MCP endpoint is `https://grademaxxing.app/mcp` (Streamable HTTP transport,
JSON-RPC messages over `POST`). It is served by the same SvelteKit app and the
same Cloudflare Worker route — no new deployment surface.

## Endpoints

| Endpoint                                                                              | Purpose                                                                                                                |
| ------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `POST /mcp`                                                                           | MCP JSON-RPC (initialize, tools, resources, prompts). Requires `Authorization: Bearer <access token>`.                 |
| `GET /.well-known/oauth-protected-resource` (and `…/mcp`)                             | RFC 9728 protected-resource metadata pointing at the authorization server.                                             |
| `GET /.well-known/oauth-authorization-server` and `/.well-known/openid-configuration` | RFC 8414 / OIDC discovery for the built-in authorization server.                                                       |
| `POST /mcp/register`                                                                  | RFC 7591 dynamic client registration (public clients only).                                                            |
| `GET/POST /mcp/authorize`                                                             | Authorization endpoint: renders the StudentVUE sign-in + consent page, then redirects back with an authorization code. |
| `POST /mcp/revoke`                                                                    | RFC 7009 connection-family revocation.                                                                                 |
| `POST /mcp/token`                                                                     | Authorization-code + PKCE exchange and refresh-token rotation (`application/x-www-form-urlencoded`).                   |

Discovery is served from `src/lib/server/mcp/metadata.ts` via an early
intercept in `src/hooks.server.ts`, so it works on every adapter without
dot-directory routes.

## Tool surface (all read-only)

Identity and discovery: `get_profile` (designated with `_meta["openai/profile"]`
so ChatGPT can label connections), `get_capabilities`.

Grades: `get_gradebook`, `get_course`, `get_gradebook_digest`,
`calculate_gpa`, `project_course_grade` (what-if).

Records: `get_attendance`, `get_calendar`, `get_schedule`, `list_documents`,
`get_document`, `get_report_cards`, `get_student_profile`, `get_student_photo`,
`get_school_info`.

Mail: `list_mail_folders`, `list_mail`, `get_message`, `get_mail_attachment`.

Every tool declares `annotations: { readOnlyHint: true, openWorldHint: true }`,
an `inputSchema`, and an `outputSchema`. Binary payloads return bounded base64
(≤ ~500 KB) plus a native `image` content block when the MIME type is an image.
Everything else returns `structuredContent` plus the JSON text fallback.

Resources mirror the data as `studentvue://…` URIs (`gradebook`, `attendance`,
`calendar`, `schedule`, `student-info`, `school-info`, `documents`,
`report-cards`, `mailbox`, `capabilities`), and eight prompts
(`analyze-grades`, `what-if-scenario`, `gpa-planner`, `attendance-review`,
`weekly-digest`, `mail-triage`, `study-priorities`, `report-card-review`)
encode the app's analysis workflows.

### Official vs. computed values

The product rule carries into the protocol: official StudentVUE values travel
under `official*` keys and `officialMark`, while anything the server derives is
labeled `localCalculations`, `simulation`, or listed in `assumptions`.
`project_course_grade` and `calculate_gpa` reuse the same domain modules as the
UI (`$lib/grades/gpa`, `gpa-policy`, `grade-scale`) so chat results match the
app. Prompts repeat the guardrail so the model never presents a simulation as
an official grade.

## Authentication design

The app has no user database and never retains StudentVUE passwords, so the MCP
authorization credentials are **self-contained**: every credential is a self-contained
AES-256-GCM payload (key material derived from `GRADEMAXXING_SESSION_SECRET`
with a separate AAD domain) that embeds the same encrypted portal session the
browser cookie uses. A small durable grant ledger stores only SHA-256 token/family
hashes, expiry, and revocation status; it prevents code replay and revokes a
refresh family when a used refresh token is replayed. It never stores student
records, account identifiers, portal sessions, or bearer tokens.
See `src/lib/server/mcp/oauth.ts` and `grants.ts`.

Before deploying these changes, apply `migrations/0007_mcp_oauth_grants.sql` to
the configured `GRADEMAXXING_USAGE_DB` with the normal migration workflow.
Production MCP redemption and access fail closed without that shared store.
Cloudflare uses the existing D1 binding; Node/Vercel require an equivalent
platform database binding before production MCP can be enabled. Development
uses a bounded in-memory ledger; it is not a production fallback.
Connections created before the ledger was introduced must reconnect once after
this upgrade, because their old credentials have no revocable family binding.

Flow:

1. The host fetches protected-resource metadata (or receives a 401 with
   `WWW-Authenticate: Bearer resource_metadata=…`, which is required for Claude
   to start sign-in).
2. The host registers once via DCR. `client_id` is the encrypted registration
   itself, so registration metadata remains self-contained and a Worker restart cannot orphan a
   connection. Redirect URIs are restricted to `chatgpt.com`, `openai.com`,
   `claude.ai`, `claude.com`, `anthropic.com` (https) and RFC 8252 loopback
   addresses (http://localhost, http://127.0.0.1).
3. The host starts authorization-code + PKCE (S256 only). `/mcp/authorize`
   renders the sign-in/consent page; the student's district URL, username, and
   password go to `createStudentSession` exactly like the web login. The
   password is used for the portal login and discarded; the encrypted portal
   session rides inside the authorization code.
4. The token endpoint issues a 1-hour access token bound to the resource
   audience (`resource` is echoed per MCP/RFC 8707 and stored as the token's
   audience) plus a refresh token that rolls the embedded session on every use,
   mirroring the browser keep-alive. `iss` is returned in both authorization
   and token responses (RFC 9207) so ChatGPT accepts its stable redirect URI.
5. Each `POST /mcp` verifies the token (signature/audience/expiry/scope), then
   resumes the embedded portal session. If the StudentVUE session has expired,
   the request returns 401 with the discovery challenge, which makes ChatGPT
   and Claude restart OAuth so the student can sign in again. Reconnecting
   requires the student's district, username, password, and consent again.

Supported protocol versions: `2026-07-28` (stateless `server/discover`),
`2025-11-25`, `2025-06-18`, plus header validation for `2025-03-26` and
`2024-11-05`. Batches, notifications, and `Mcp-Method`/`Mcp-Protocol-Version`
header checks are handled.

## Connecting

### ChatGPT

1. Settings → Connectors (developer mode / plugins) → Add custom MCP server.
2. Enter `https://grademaxxing.app/mcp`.
3. Complete the OAuth prompt; you will land on the Grademaxxing StudentVUE
   sign-in page, then are redirected back.

### Claude (claude.com, Desktop, Code)

1. Settings → Connectors → Add custom connector → Web.
2. Enter `https://grademaxxing.app/mcp`.
3. Approve the OAuth consent; sign in to StudentVUE on the Grademaxxing page.
   Claude Code loopback redirects (`http://localhost:*` / `http://127.0.0.1:*`)
   are accepted as well.

## Operational limits and safeguards

- **Read-only.** There is intentionally no tool for sending mail, editing
  records, or changing grades; the admin and feedback surfaces are excluded.
- **Rate limits.** Sign-in attempts have per-IP/per-account
  limits inside `/mcp/authorize`; registration and token endpoints have
  per-IP sliding windows.
- **Portal serialization.** A shared lease prevents separate MCP HTTP calls
  from racing a session's mutable reporting-period/class focus. Concurrent
  calls get a retryable 503; leases expire after ten minutes if a Worker dies.
- **Bounded inputs.** Streaming body readers enforce limits even without
  Content-Length. JSON-RPC batches are capped at twenty messages.
- **Bounded outputs.** Assignment lists, mail listings, message bodies
  (20 KB), and binaries (500 KB base64) are capped with explicit truncation
  flags.
- **Revocation.** `POST /mcp/revoke` accepts an access or refresh token and
  revokes that token's entire connection family. Hosts may call this when a
  connector is removed; removal alone does not revoke credentials already
  issued. Access checks honor family revocation. The embedded portal session
  still has its own TTL (`GRADEMAXXING_SESSION_TTL_HOURS`, default 12 h).
- **CSRF configuration.** `svelte.config.js` sets `csrf.trustedOrigins: ['*']`
  because SvelteKit's built-in form-CSRF check rejects the no-`Origin`
  `application/x-www-form-urlencoded` POSTs that RFC 6749 requires at the token
  endpoint. Browser-form protection is unchanged: `hooks.server.ts` guards
  `/api/*`, and the hook enforces Origin + `Sec-Fetch-Site` checks for every unsafe route
  except the public/bearer-token endpoints `/mcp`, `/mcp/register`, `/mcp/token`,
  and `/mcp/revoke`. These endpoints use CORS and do not authenticate with cookies.
  OAuth hosts navigate to the consent
  page, whose native form submits from the app origin. Cross-site credential
  submissions are rejected before login.
- **Headers.** `/mcp` and the OAuth endpoints answer with `Cache-Control:
no-store`, `nosniff`, and CORS `*` (bearer-token only, no cookies are used by
  the MCP surface).

## Tests

- Unit: `src/tests/mcp-oauth.test.ts` (DCR allowlist, PKCE binding, audience
  checks, expiry, no-leak assertions) and `src/tests/mcp-protocol.test.ts`
  (version negotiation, tool catalog invariants, GPA/what-if/digest math with
  fixtures, error mapping, batches).
- Browser/API: `tests/e2e/mcp.spec.ts` (discovery documents, 401 challenge
  shape, registration allowlist, token errors, authorize page rendering and
  `iss` redirects).

Live portal behavior is covered by the existing designated-test-account
machinery; no live credentials are ever stored in the repository.
