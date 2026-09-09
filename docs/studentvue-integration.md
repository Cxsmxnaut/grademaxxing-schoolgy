# StudentVUE integration notes

## What the app uses

Grademaxxing uses the current StudentVUE PXP2 web portal with a server-side `Pxp2Client`. It does **not** rely on the legacy SOAP endpoint. It logs into the district portal through the normal form flow, retains the resulting upstream cookies only inside an encrypted app session, and reads the same first-party portal data that StudentVUE exposes.

This was necessary because the legacy SOAP experience is no longer reliable for this district. The app's modern PXP2 mapping is documented in [studentvue-modern-api.md](studentvue-modern-api.md).

## Session lifecycle

1. The browser submits a district portal URL, username, and password to `POST /api/session` over HTTPS.
2. The password is passed to StudentVUE to sign in, then discarded. It must never be saved in browser storage, app logs, source, or test data.
3. The server encrypts the resumable upstream session state into an HttpOnly `grademaxxing_session` cookie using `GRADEMAXXING_SESSION_SECRET`.
4. On reload, the server decrypts and resumes that portal state. The browser should remain signed in until either the configured application TTL or StudentVUE's upstream session expires.
5. `GET /api/session/keepalive` runs only while the page is visible or resumes. It rolls the encrypted cookie after a lightweight authenticated StudentVUE request.
6. If the upstream portal expires, the application preserves local cached identity/grades where safe and asks for a password-only reconnect. It does not ask for the username/district again unless the app session is invalid.

The default app-session TTL is 12 hours and can be adjusted with `GRADEMAXXING_SESSION_TTL_HOURS`. The session secret must be at least 32 random characters and must be configured separately in each deployment environment.

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

`GetClassData` is the authoritative source for official percentage, letter mark, weighting rules, categories, points, missing marks, dropped scores, rounding rules, and all graded assignment IDs. The visible course-content feed may omit assignments, including hidden/previous assignments. For graded IDs absent from that feed, Grademaxxing requests only targeted assignment-detail fragments and merges the authoritative data. This is why the app can show more complete charts and calculations than a simplistic scraper.

If the portal's official percentage differs from a local calculation, show the official mark as correct and label the calculation/chart as potentially incomplete. Hidden, teacher-managed, or portal-only rules may still make an exact local reproduction impossible.

## Attendance and profile details

Attendance is exception-based in StudentVUE. Ordinary past school days can be implicit "present" entries with a numeric portal type and no reason, while future days and weekends must not be marked present. The adapter deliberately combines per-course events, period totals, and the calendar day feed. Changes here need tests for past present days, events, weekends, holidays, and future pending days.

Student profile images are retrieved through the portal's profile/photo representation and converted to the app contract only when the portal returns a supported image file. Do not try to infer or fabricate a photo when the portal lacks one.

## Safe testing

Use a designated test account supplied only by environment variables for live portal tests. Do not put primary-student credentials in prompts, source, screenshots, artifacts, Git history, test traces, or browser recordings. Do not use automated portal traffic for a whole school without explicit district permission and capacity testing.
