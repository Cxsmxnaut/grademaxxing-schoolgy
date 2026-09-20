# StudentVUE integration notes

## What the app uses

Grademaxxing uses the current StudentVUE PXP2 web portal with a server-side `Pxp2Client`. It does **not** rely on the legacy SOAP endpoint. It logs into the district portal through the normal form flow, retains the resulting upstream cookies only inside an encrypted app session, and reads the same first-party portal data that StudentVUE exposes.

This was necessary because the legacy SOAP experience is no longer reliable for this district. The app's modern PXP2 mapping is documented in [studentvue-modern-api.md](studentvue-modern-api.md).

## Session lifecycle

1. The browser submits a district portal URL, username, and password to `POST /api/session` over HTTPS.
2. The password is passed to StudentVUE to sign in, then discarded by the server. If the student opts to stay signed in, the browser stores only an AES-GCM-encrypted credential envelope; the non-exportable encryption key remains in IndexedDB. It must never appear in app logs, source, or test data.
3. The server encrypts the resumable upstream session state into an HttpOnly `grademaxxing_session` cookie using `GRADEMAXXING_SESSION_SECRET`.
4. On reload, the server decrypts and resumes that portal state. The browser should remain signed in until either the configured application TTL or StudentVUE's upstream session expires.
5. `GET /api/session/keepalive` runs only while the page is visible or resumes. It rolls the encrypted cookie after a lightweight authenticated StudentVUE request.
6. If the upstream portal expires, the application first attempts a silent reauthentication from the encrypted device vault. If no vault is available or reauthentication fails, it preserves local cached identity/grades where safe and asks for a password-only reconnect. It does not ask for the username/district again unless the app session is invalid.

The default app-session TTL is 12 hours and can be adjusted with `GRADEMAXXING_SESSION_TTL_HOURS`. The session secret must be at least 32 random characters and must be configured separately in each deployment environment.

## District Google SSO boundary

Some district StudentVUE login pages expose an official “Login with Google” link backed by the
district's SAML configuration. That login creates an authenticated browser session for the district
portal; it does not create a Grademaxxing session. The Google assertion and the portal's HttpOnly
cookies must not be copied into Grademaxxing, and the browser cannot expose them to our server across
origins.

The supported no-reset-email path is therefore:

1. Open the district's official StudentVUE login page.
2. Complete the district Google sign-in there.
3. Return to the setup page's direct Change Password link (or use Account Information in StudentVUE)
   to create a StudentVUE password. If the portal requires a current password, use the district's
   official reset flow or support; Grademaxxing cannot bypass that requirement.
4. Return to Grademaxxing and sign in with that password, optionally enabling the encrypted device vault.

A true one-click Google sign-in for Grademaxxing requires two separate, district/vendor-approved
capabilities:

- **Identity plane:** a SAML/OIDC integration with a registered Grademaxxing redirect URI and a
  stable, authorized identity-to-student mapping.
- **Data plane:** an Edupoint-supported read-only API or token exchange that lets Grademaxxing retrieve
  only that student's records after the identity assertion. A Google assertion by itself does not grant
  access to StudentVUE records.

The public StudentVUE Google link is fixed to Edupoint's SAML service provider and does not provide a
Grademaxxing callback or relay state. It is therefore not sufficient to implement that handoff safely
or reliably. Edupoint's [student and parent FAQ](https://www.edupoint.com/Services/Support/For-Parents-Students)
documents the supported Google login and Account Information password-change path used by the app.

The portal's public service endpoints may advertise permissive CORS for unauthenticated or bearer
requests, but the login page and session-bearing browser responses do not grant Grademaxxing access to
the user's authenticated portal session. A browser-side fetch cannot turn the Google login cookie into
an application session, and adding a proxy or extension to extract it would create an unnecessary
credential/session-transfer risk.

### Automated integration request

For an automated launch, the district/Edupoint integration request should require all of the following
before implementation:

1. A registered Grademaxxing SAML/OIDC client or an Edupoint-supported OAuth/token exchange.
2. A stable district-approved student subject identifier in the assertion/token, with documented
   account-linking and wrong-student protections.
3. A read-only API scope for the StudentVUE resources the product displays (grades, attendance,
   documents, mail, profile, and calendar), or an equivalent server-to-server integration.
4. Redirect URI, token lifetime, revocation, audit, incident, retention, and deletion requirements in
   the district/vendor agreement.

Until those capabilities exist, any “automated” browser extension, remote browser, or cookie proxy would
be an unofficial session-transfer mechanism rather than an approved integration and remains out of scope.

The official StudentVUE mobile app is not an alternate token source: Edupoint states that it uses the
same user login as the web-based portal. It does not provide a public Grademaxxing callback or a
developer token that can replace the district/vendor integration above.

## Error semantics

- `APP_SESSION_INVALID`: app cookie missing, invalid, expired, or cannot be decrypted; a full sign-in is required.
- `UPSTREAM_SESSION_EXPIRED`: StudentVUE portal session expired; use the reconnect flow, preserving the app's non-sensitive local state.
- HTTP 400: invalid resource or parameter.
- HTTP 401: no valid app session or upstream session needs reconnecting.
- HTTP 502/504: StudentVUE portal response changed, failed, or timed out.
- Busy/capacity errors: the app's bounded portal-operation gate is protecting StudentVUE from request bursts.

Do not reduce these errors to a generic "logged out" message: reconnect behavior is intentionally different from a corrupted app session.

## Gradebook fidelity details

The gradebook requires multiple portal interactions. The portal's selected reporting period and focused class are mutable upstream-session state, so the server serializes whole logical gradebook operations per student. It then parallelizes only safe independent class requests.

After the first complete gradebook load, the browser keeps the detailed record locally for immediate rendering. On a later reload, it requests only the lightweight official-mark summary; when course marks and structure are unchanged, it reuses the cached assignment details instead of repeating the complete gradebook traversal. A complete refresh still runs at least every 30 minutes so assignment-only changes are eventually picked up, and an explicit refresh always requests complete data.

`GetClassData` is the authoritative source for official percentage, letter mark, weighting rules, categories, points, missing marks, dropped scores, rounding rules, and all graded assignment IDs. The visible course-content feed may omit assignments, including hidden/previous assignments. For graded IDs absent from that feed, Grademaxxing requests only targeted assignment-detail fragments and merges the authoritative data. This is why the app can show more complete charts and calculations than a simplistic scraper.

If the portal's official percentage differs from a local calculation, show the official mark as correct and label the calculation/chart as potentially incomplete. Hidden, teacher-managed, or portal-only rules may still make an exact local reproduction impossible.

## Attendance and profile details

Attendance is exception-based in StudentVUE. Ordinary past school days can be implicit "present" entries with a numeric portal type and no reason, while future days and weekends must not be marked present. The adapter deliberately combines per-course events, period totals, and the calendar day feed. Changes here need tests for past present days, events, weekends, holidays, and future pending days.

Student profile images are retrieved through the portal's profile/photo representation and converted to the app contract only when the portal returns a supported image file. Do not try to infer or fabricate a photo when the portal lacks one.

## Safe testing

Use a designated test account supplied only by environment variables for live portal tests. Do not put primary-student credentials in prompts, source, screenshots, artifacts, Git history, test traces, or browser recordings. Do not use automated portal traffic for a whole school without explicit district permission and capacity testing.
