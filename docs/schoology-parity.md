# Schoology edition: capability and parity

This edition is a separate, read-only Schoology experience within the Grademaxxing clone. It reuses the product's visual tokens and gradebook hierarchy while keeping its authentication, routes, and session separate from the StudentVUE edition.

## Capability table

| Existing Grademaxxing area        | Schoology edition                                         | API evidence and limits                                                                                                                                                                                 |
| --------------------------------- | --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Course gradebook                  | Supported when the app and account can read the endpoints | Reads `/users/me`, enrolled sections, user grades, assignment metadata, and grading categories. The official Schoology grade stays separate from the local estimate.                                    |
| Course details and what-if scores | Supported as local calculations                           | Uses visible assignment/category data. Hidden grade rules, special finals, letter scales, and some extra-credit rules can make an estimate unavailable. Changes never write to Schoology.               |
| Grade trend                       | Current assignment-score bars only                        | Schoology API snapshots do not provide historical gradebook history through this integration. No past overall-grade history is fabricated or stored.                                                    |
| GPA calculator                    | Unavailable                                               | The gradebook API does not provide a transcript credit model or district GPA conversion scale. The app does not infer one.                                                                              |
| Attendance                        | Unavailable                                               | Schoology documents attendance under a course-section endpoint that may return multiple enrollments, not a student-only attendance feed. This edition avoids requesting other students' records.        |
| Calendar                          | Permission-dependent                                      | Reads user-scoped `/users/{id}/events`. Empty results are shown as empty; denied/missing access is shown as unavailable.                                                                                |
| Documents                         | Permission-dependent, metadata only                       | Reads documents from the user's enrolled sections. Download URLs and file contents are not fetched or exposed.                                                                                          |
| Mail                              | Permission-dependent, inbox read-only                     | Reads `/messages/inbox`; opening an item requests `keep_unread=TRUE` because Schoology documents that ordinary message reads can change message status. No sending or attachment access is implemented. |
| Profile                           | Basic API identity only                                   | Uses the fields returned by `/users/me`. Photos and broader profile data are not requested.                                                                                                             |
| Dashboard/Max AI                  | Not included in this edition                              | Schoology records are not sent to Max AI.                                                                                                                                                               |

API access is conditional. Schoology OAuth app approval does not grant a user role any permission that the district has not enabled. The account must be allowed to authorize the app and read each requested resource. Schoology's authentication update states that OAuth 1 access tokens expire after at most 90 days and that cross-school access requires Schoology app approval; locally stored app sessions expire after 12 hours. See [OAuth authentication](https://developers.schoology.com/api-documentation/authentication/), [Schoology API authentication update](https://developers.schoology.com/api-documentation/important-api-authentication-update/), [grades](https://developers.schoology.com/api-documentation/rest-api-v1/user-grades/), [events](https://developers.schoology.com/api-documentation/rest-api-v1/event/), [attendance](https://developers.schoology.com/api-documentation/rest-api-v1/attendance/), [documents](https://developers.schoology.com/api-documentation/rest-api-v1/documents/), and [private messaging](https://developers.schoology.com/api-documentation/rest-api-v1/private-messaging/).

## Local configuration

The fictional demo is available at `/schoology/login` with no secrets and makes no network requests. The searchable district picker includes five public destinations verified against district documentation. Search supports names, state names/abbreviations, district abbreviations, and domains. These directory entries are not claims that Grademaxxing is district-approved. Selecting an entry shows its official portal; live grade connection remains disabled until the operator explicitly enables that district and supplies app credentials. The browser cannot submit an arbitrary Schoology host.

| Catalog ID       | District                                        | Official source                                                                                     |
| ---------------- | ----------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `fairfax-va`     | Fairfax County Public Schools, Virginia         | [District instructions](https://www.fcps.edu/schoology/students/overview)                           |
| `frederick-md`   | Frederick County Public Schools, Maryland       | [District help center](https://sites.google.com/fcps.org/schoology/getting-started)                 |
| `baltimore-md`   | Baltimore County Public Schools, Maryland       | [District resource page](https://innovationhub.bcps.org/digital-resource-toolbox/schoology)         |
| `lausd-ca`       | Los Angeles Unified School District, California | [District sign-in guide](https://www.lausd.org/cms/lib/CA01000043/Centricity/Domain/548/signin.pdf) |
| `center-line-mi` | Center Line Public Schools, Michigan            | [District technology help](https://www.clps.org/apps/pages/techhelp)                                |

Sources checked October 18, 2026. Additional schools can be found through Schoology's own school finder, linked from the picker. That external finder does not enable this app's API access.

For an approved Schoology app, set these values in the local ignored `.env` file or the hosting platform's protected secret/configuration store:

- `SCHOOLOGY_CONSUMER_KEY` and `SCHOOLOGY_CONSUMER_SECRET`: the app credentials from the Schoology API integration. The secret is server-only.
- `SCHOOLOGY_ENABLED_DISTRICTS`: comma-separated catalog IDs, such as `fairfax-va,baltimore-md`. Set IDs only after confirming your app is permitted to access those districts. Unknown IDs are ignored. Empty by default; directory entries alone never enable OAuth.
- `SCHOOLOGY_DISTRICTS`: JSON allowlist such as `[{"id":"north-campus","name":"North Campus","schoolUrl":"https://north-campus.schoology.com"}]`. Each URL must be an HTTPS origin without a path, query, or fragment.
- `SCHOOLOGY_CALLBACK_URL`: the exact callback registered for the Schoology app, such as `https://schoology.example.org/api/schoology/callback`. Local development can use `http://localhost:5173/api/schoology/callback`.

Configuration uses SvelteKit's private runtime environment, so ignored local `.env` values are supported. Custom `SCHOOLOGY_DISTRICTS` entries also explicitly enable those destinations and override catalog entries with the same ID. An enabled district still requires both consumer credentials. Keep approval records outside the student UI; do not enable districts based solely on appearing in the directory.

Users select a configured district, then enter credentials only on Schoology's official authorization page. Pending OAuth state is session-bound, expires after ten minutes, and is consumed once. OAuth token secrets remain in the server-only in-memory session store; the browser receives only an opaque, random, HttpOnly, SameSite=Lax session ID cookie. The local server session expires after 12 hours. The app uses no student-record database or localStorage cache in this edition. Responses are marked `private, no-store`.

This in-memory store is for the runnable local clone only. A production host would need a durable server-side session store with per-user isolation and encryption at rest. The Cloudflare configurations in this clone use unique Worker names and no route; they are not a production-ready Schoology deployment configuration.

## Verification status

The vendored connector passes 29 mocked tests, including the OAuth signing/callback cases and a check that reading message details preserves the unread status. The local demo uses only fictional fixtures. No real Schoology account or district has been accessed. The API integration is not proven against a live district; endpoint availability and returned shapes should be confirmed only with a district-approved app and a designated account supplied securely. The project does not claim district approval, Schoology/PowerSchool endorsement, or production readiness.

The vendored source adapts work from Schoolopy, sgy-sgy, and SchoologyPlus. Preserve `packages/schoology-connector/THIRD_PARTY_NOTICES.md`, the full license texts, the upstream project links, and the root AGPL license and attribution history.
