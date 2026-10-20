# Grademaxxing Schoology connector

A reusable, read-only TypeScript package for adding Schoology to Grademaxxing. This is an initial implementation with automated and fictional-data validation; **live district compatibility has not yet been verified**.

## What we combined

| Source                                                                   | Its role in this package                                                                                                                                                                       |
| ------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [Schoolopy](https://github.com/ErikBoesen/schoolopy)                     | Primary API design: current user, enrolled sections, assignments, user grades, categories, and grading scales. Selected methods were adapted into native TypeScript, so Python is unnecessary. |
| [sgy-sgy](https://github.com/SheepTester/sgy-sgy/tree/master/oauth-3leg) | Schoology's three-legged OAuth flow, district authorization URLs, and the `/users/me` redirect behavior.                                                                                       |
| [SchoologyPlus](https://github.com/aopell/SchoologyPlus)                 | Category/period recalculation and local grade-editing behavior, adapted into pure functions for what-if changes, adding work, dropping work, and target scores.                                |
| New connector code                                                       | HMAC signing, bounded pagination, trusted redirects, typed normalized snapshots, hidden-rule warnings, snapshot change detection, and a session-store integration example.                     |

The package is a selective TypeScript adaptation, rather than three installed applications. It does not run SchoologyPlus's extension UI or Schoolopy's Python runtime. Pinned upstream commits and full licenses are recorded in [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md).

## Run it

Requires Node 22+ for development. Runtime code uses standard Fetch, URL, and Web Crypto APIs, with no runtime npm dependencies. The implementation is designed for server runtimes including Cloudflare Workers; Workers execution has not been separately verified.

```sh
npm install
npm run verify
```

`verify` checks types, runs the tests, builds JavaScript/declarations, and runs a fictional-data demo. `npm run demo` makes no network requests.

The demo shows an official 86%, an estimated 86%, and a local what-if estimate of 96.5% after changing an 80-point quiz to 95. The original quiz remains 80. It also solves for the next test score needed to reach 90%.

## Grademaxxing vendor copy

The Schoology edition vendors this connector's source in `packages/schoology-connector/` so a clone can be built without a machine-local path or package registry dependency. The server imports it only from `$lib/server/`. Upstream source notices and licenses remain alongside the copied source. The browser imports only the DOM-free calculation module through `src/lib/grades/schoology.ts`.

## Connect an account

Schoology API access is a prerequisite. The district must permit the credentials/app and the user's requested data access. A successful OAuth redirect does not grant permissions the account does not already have. Check the district's `/api` page and [PowerSchool's API permissions documentation](https://uc.powerschool-docs.com/en/schoology/latest/user-management-permissions-enterprise).

Use one OAuth object configured with trusted application settings:

```ts
import { SchoologyOAuth, SchoologyClient } from '@grademaxxing/schoology-connector';

const config = {
	consumer: { key: env.SCHOOLOGY_KEY, secret: env.SCHOOLOGY_SECRET },
	schoolUrl: 'https://your-district.schoology.com'
};
const oauth = new SchoologyOAuth(config);

// Start route, using an existing authenticated app/browser session:
const { authorizationUrl, pending } = await oauth.beginAuthorization(
	'https://grademaxxing.app/auth/schoology/callback'
);
await sessions.savePending(sessionId, pending);
// Send an HTTP redirect to authorizationUrl.

// Callback route:
const pendingRecord = await sessions.takePending(sessionId); // atomic get + delete
if (!pendingRecord) throw new Error('No pending Schoology connection');
const token = await oauth.completeAuthorization(pendingRecord, request.url);
await sessions.saveToken(sessionId, token);

// Authenticated gradebook route:
const client = new SchoologyClient({ ...config, token });
const gradebook = await client.getGradebook();
```

`env`, `sessions`, `sessionId` and `request` belong to your host application. A complete framework-neutral adapter with a typed storage interface is in [examples/server-integration.ts](./examples/server-integration.ts). Its test verifies that another session cannot finish a connection and that pending tokens are consumed once.

Bind pending authorization to the initiating session, expire it in ten minutes, and consume it once. Store pending/token secrets only server-side using the host's protected secret/session storage. Use a stable configured callback URL and a secure session cookie. An HTTP callback is permitted only on localhost for development. The adapter's `disconnect` deletes local stored tokens; the user can revoke the app authorization in Schoology to invalidate the provider token too.

Personal two-legged API credentials also work by omitting `token` from `SchoologyClient`. Use the OAuth flow above for a multi-user application. Create a client per authorized account; it keeps credentials private and does not maintain shared account state.

## Data available

```ts
await client.getMe();
await client.getSections(userId);
await client.getSection(sectionId);
await client.getAssignments(sectionId);
await client.getCategories(sectionId);
await client.getGradingScales(sectionId);
await client.getUserGrades(userId, { section_id: sectionId });
const snapshot = await client.getGradebook({ includeMetadata: true, includePast: false });
```

Collection methods follow `links.next`, with cycle detection and a configurable page limit (default 100). They throw rather than silently return a truncated result. `getGradebook` resolves the current account, merges sections repeated across enrollment pages, joins assignment metadata, and returns:

- `user`, `fetchedAt`, `source: 'schoology'`;
- `courses`, with categories and separate grading periods;
- each period's untouched `officialGrade` and normalized assignments;
- `warnings` for unavailable metadata and hidden grading rules.

Only missing/forbidden optional metadata (HTTP 403/404) produces partial-data warnings. Authentication, rate limits, malformed core responses, network errors, and pagination failures throw `SchoologyError`. Error bodies, credentials, and signed URLs are excluded from error messages. `RATE_LIMIT` includes `retryAfterSeconds` when the API supplies it; the host decides when to retry. Defaults are a 15-second request timeout and three redirects. Every redirected request is re-signed and confined to the configured HTTPS API origin/path. API and school origins are trusted application configuration, not arbitrary user input.

Schoology date strings without a timezone remain unmodified in `dueAt`; Unix modification timestamps are converted to UTC. IDs are strings. `0` remains a real score; blank/null and letter grades are not coerced to zero. The documented exception codes 1 and 2 become excused and incomplete; undocumented exception codes remain unknown. Numeric strings become numbers, while the original grade remains in `rawGrade`. Assignment factor defaults to the API's documented default of 1 when omitted.

## What-if and target calculations

The `./grades` entry point contains only types and local calculations and can be imported in the browser:

```ts
import {
	calculateGrade,
	simulateGrade,
	requiredScore
} from '@grademaxxing/schoology-connector/grades';

const course = snapshot.courses[0];
const period = course.periods[0]; // choose the intended grading period in the UI
const options = { mode: 'weighted' as const, missing: 'exclude' as const };

const baseline = calculateGrade(period.assignments, course.categories, options);
const result = simulateGrade(period, course.categories, options, [
	{ kind: 'change', id: 'assignment-id', score: 95 }
	// { kind: 'add', assignment: yourUpcomingAssignment },
	// { kind: 'drop', id: 'another-assignment-id' },
]);
// result.officialGrade is unchanged; result.projected is an estimate.
const target = requiredScore(period, course.categories, options, upcomingAssignment, 90);
// target.status: reachable | unreachable | unavailable
```

Choose the course mode explicitly: `points` combines total points, `weighted` uses category weights, and `equal-categories` averages nonempty categories equally. Weighted mode treats weights as relative and renormalizes across categories containing graded work. Both 70/30 and .7/.3 are accepted. Special category weights intended to contribute over 100% require a separate policy and are not modeled.

Category calculations support total points and average assignment percentages, plus assignment factors. Extra credit with zero possible points works inside a points category. Lowest grades are dropped by assignment percentage; confirm the school's policy, especially when assignments have different possible points. No intermediate rounding is applied. The target solver returns a fractional score; the host must round upward to the teacher's accepted score increment, then recheck the projection.

Missing status is only used when explicitly supplied in normalized input. Choose whether missing work counts as zero. Excused, incomplete and ungraded work are excluded. Unknown grades/exceptions and missing possible points block an estimate. Unavailable category calculation/drop rules block estimates unless the caller explicitly chooses `unknownRules: 'assume-points'`; assumptions are returned as warnings. Missing category weights always block weighted estimates.

Final-exam weighting, rubric/letter-scale conversion, teacher overrides, special extra-credit category policies, and combining grading periods are not inferred. Final items block a calculation unless `includeFinalAsRegular` is explicitly chosen because that matches the school's rules. The target solver does not support drop-lowest rules. The official grade remains the source of truth, even when a complete-looking estimate differs.

## Grade changes

```ts
import { diffGradebooks } from '@grademaxxing/schoology-connector';
const changes = diffGradebooks(previousFullSnapshot, currentFullSnapshot);
```

Detects assignments added, removed or changed and official grade changes. Compare full snapshots of the same account and the same query/metadata scope. A snapshot fetched with different filters/permissions can look like additions or removals. Fetch timestamps alone do not count as changes. The connector neither stores snapshots nor sends notifications; the host controls caching and notifications. It does not reconstruct historical grade trends before snapshots were collected.

## Validation and next step

Automated checks cover an independently published OAuth signing vector, the token flow, callback/session isolation, trusted redirects, malicious pagination links, enrollment-page merging, real zero scores, hidden permissions, calculation cases, immutable simulations, target scores, and snapshot changes. `examples/demo.ts` exercises the full client-to-calculation path using fictional API responses.

Before enabling Schoology in Grademaxxing, test an authorized district account end to end, confirm each displayed official grade against the portal, and confirm category/assignment rules before exposing estimates. The host application integration and live district test are still to be done. No Schoology account was accessed, and no app was deployed by creating this package.
