# Max administrator diagnostics

Local implementation; no deployment or district approval is implied.

## Data flow

`POST /api/max` creates an independent random diagnostic ID. The existing D1
`GRADEMAXXING_USAGE_DB` binding stores a running row before model work, then bounded
provider-attempt and tool-outcome events and final metrics. Apply migration
`0007_max_diagnostics.sql` in the intended environment before enabling this feature.
Apply this additive, repeatable schema with an authorized Wrangler login before the
first deployment to an environment:

```sh
npx wrangler d1 execute grademaxxing-usage --remote --config wrangler.jsonc --file migrations/0007_max_diagnostics.sql
```

The deployment-only GitHub token does not have D1 administration permission; schema
changes are separate from Worker deployment. Missing storage/migrations fail open
for chat and appear as unavailable in the console.

Max provider credentials live in the encrypted `MAX_PROVIDER_SECRETS` GitHub Actions
secret as a JSON object of provider environment variables. The production workflow
uploads them into Cloudflare Worker secrets without writing them into the repository.

Model routing tries both Google keys at each level before moving on:
Gemini 3.5 Flash-Lite, Gemini 3.1 Flash-Lite, Gemini 3.8 Flash, then Gemini 2.5 Flash.
Only after all available Gemini slots fail does it try Groq, OpenRouter, or Mistral.
Failures before visible output (rate limits, rejected keys/models, network errors,
timeouts, empty responses and provider outages) advance through the waterfall.
Interrupted visible streams and an entirely unavailable pool still report an error;
fallback cannot guarantee availability or safely append a different model's answer.
OpenRouter free models try `cohere/north-mini-code:free`, then the free-only router
`openrouter/free`, when the preferred model is overloaded. Successful diagnostics record the actual returned
model. Provider `Retry-After` reset times are honored; keys in one provider project
can share quota, so key rotation cannot guarantee additional capacity.

The authenticated admin console at `/admin-app/max` reads `/api/admin/max`.
Neither the public chat tools nor student APIs can list these records. Responses use
private/no-store caching. Clear-all requires administrator authentication and a second
button click. Existing same-origin mutation guards protect both admin and report APIs.

Stored metadata: action, broad topic, random request ID, time, status, provider/model,
HTTP/error category, tool name/outcome, latency, time to first nonblank token, frame and
output-character counts, technical flags, optional student report category.
Never store AI replies, generated titles, history, tool arguments/results, upstream
error bodies/messages, student account/session IDs, IPs, credentials or portal payloads.
Observers are request-scoped so simultaneous students cannot mix events.

The local development route automatically records each user question (maximum 8,000
characters, matching the question limit), after basic email/link/secret/account redaction.
This is explicitly a developer testing mode. The production route does not record question
text, regardless of client flags. The composer has no sharing checkbox or disclaimer block,
as requested for local testing; the privacy page explains diagnostics. Redaction is **not
anonymization**: do not assume patterns can remove all personal information. Do not run
student-data tests or screenshots against a real account. Production question collection
requires a separately reviewed change and appropriate notice/authorization.

For the Node development server, adapter emulation supplies a private local SQLite D1
facade only to the three Max diagnostics routes. It uses `.local/max-diagnostics.sqlite`
(mode 0600), applies the Max migration on first use, and is never bundled into the Worker.
Synthetic browser tests set `GRADEMAXXING_MAX_DEV_DATABASE` to a separate file under
`.local/max-validation/`; never inspect or screenshot the primary development database.

Reporting submits a fixed category, diagnostic ID and random capability. The database
stores only the capability hash; administrator JSON excludes it. Reports require a
valid student session and capability; no question or reply is accepted by that endpoint.
The receipt stays in the encrypted local chat archive, excluded from model history.

## Failure and quality signals

Track pre-token failover, 429, rejected keys, timeouts, network/provider errors, empty
provider output, tool errors, partial interrupted output, output-limit finish reasons,
and internal citation markers. A running request older than ten minutes is shown as
incomplete, which can also represent an unusually long request. It is not proof of a
server crash. A successful technical completion is not a factual quality endorsement;
student reports are the signal for incorrect/off-topic responses.

Events are capped at 160 per request. Flushes are throttled to two seconds with a final
flush and Cloudflare execution-context lifetime extension. Storage failures never
change the answer. During storage outages some diagnostics can be missing.

## Retention and release review

The review window is seven days. Reads and writes purge expired rows; listing excludes
expired records independently. An idle deployment has no timed background purge:
physical deletion occurs on its next diagnostic read/write, or explicit clear-all.
Do not describe this as an exact seven-day physical TTL. Add and verify a scheduled
purge before a release requiring a strict physical deletion deadline.

Before a school-directed release, district/privacy counsel must review question
collection, under-13 handling, operator access, deletion requests, storage/backup
retention, and the notices/agreement. Developer testing does not authorize production
question collection. Keep this feature free of
advertising, training reuse and unrelated profiling. Do not deploy as part of a local
implementation request.

Validate using synthetic records only: migration-backed database tests, route/auth
tests, request isolation, redaction/no-content assertions, stream cancellation,
student reporting, and admin desktop/phone flows. Run the repository verification
and Cloudflare build gates before handoff.

## Live helpfulness evaluation

Run `MAX_LIVE_EVAL=true npm run eval:max:helpfulness` to evaluate the configured
provider waterfall using invented records and a synthetic portal client. No real
student account or district system is contacted. Provider keys stay in the server
environment; the command prints synthetic answers and technical outcomes.

The cases cover an English improvement request, its "but how?" follow-up, recovery
from an earlier vague answer, and a simple GPA question. A low-scoring assignment
and specific teacher feedback are intentionally absent from the initial summary:
Max must retrieve them and give concrete advice. Improvement answers have no length
cap. The GPA case checks that a simple question stays focused.

Use `PLAN_PROVIDERS=gemini` (or a comma-separated list of configured providers) to
isolate providers. Quota/timeouts are evaluation failures, not successful answers.
Review the generated plans as well as the checks: matching assignment names and
feedback does not prove every recommendation or interpretation is correct.
