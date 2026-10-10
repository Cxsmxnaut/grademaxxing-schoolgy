# SEO and GEO measurement

Public pages are defined in `src/lib/seo/public-pages.ts`. Their canonical URLs, metadata, internal navigation and sitemap share that inventory. Private app/API/admin pages and alternate deployment hosts are nonindexable. Authentication and private response caching remain independent protections.

## Anonymous acquisition counts

`POST /api/public-analytics` accepts exactly three bounded fields: event (`page_view`, `tool_used`, `connection_start`), a manifest public path, and a referral category. It rejects unknown fields, private paths, query strings and fragments. Requests omit cookies. The client respects Do Not Track/Global Privacy Control and throttles repeated actions in memory without a persistent identifier.

Only the exact production hostname writes to the dataset; preview and loopback events are discarded. An in-memory per-worker-isolate budget permits at most 600 aggregate writes per minute and returns 429 with Retry-After beyond that. It holds no IP or visitor identifier. This is a best-effort local cost bound, not a distributed sitewide quota or a guarantee against fabricated public events. Rejected or missing events can undercount activity.

The existing Workers Analytics Engine binding receives `blobs = ['public_acquisition', event, path, channel]`, `doubles = [1]`, `indexes = ['public-acquisition']`. No entered grades, credential, username, student identifier, full URL/referrer, IP or session cookie is written by this code. Missing telemetry never interrupts public tools. Worker observability stays disabled.

`tool_used` is an interaction count, not unique people, a completed school task or a grade outcome. `connection_start` is a click to sign in, not a successful account connection. Google and Bing referrers can be ordinary search; they do not establish an AI visit. Missing referrers are common. These counts cannot be joined to individual student records.

An aggregate query for a permitted account operator is:

```sql
SELECT blob2 AS event, blob3 AS path, blob4 AS channel,
       SUM(_sample_interval * double1) AS estimated_events
FROM grademaxxing_usage
WHERE blob1 = 'public_acquisition'
  AND timestamp > NOW() - INTERVAL '7' DAY
GROUP BY event, path, channel
```

Analytics Engine sampling means the weighted result is an estimate. Keep dates and sampling context with exported reports. This code does not create a public metrics endpoint or expose private usage dashboards.

## First-party search evidence

- In Google Search Console, inspect effective Search generative AI inclusion and public URL indexing. Use the dedicated generative AI report for AI Overviews/AI Mode link impressions, alongside ordinary Search performance. An absent report is unavailable data, not zero visibility. [Google report](https://support.google.com/webmasters/answer/16984139).
- In Bing Webmaster Tools, inspect public URLs and AI Performance cited URLs/grounding concepts. Its preview Citation Share is not traffic share, rank or a competitor list. [Bing report update](https://blogs.bing.com/search/2026/6/New-AI-Visibility-Insights-in-Bing-Webmaster-Tools-Intents-Topics-Citation-Share-Compare/).
- Establish genuine desired crawler access using provider provenance and public request inspection; a local spoofed user agent returning 200 is not enough. Do not remove security rules without identifying a real false positive.

Property ownership, account report access and Cloudflare configuration are account operations. Repository code cannot prove those settings or force an engine to cite a page.

## Prompt benchmark

`prompt-benchmark.json` is an unexecuted 32-prompt library. The proposed pilot is 12 selected prompts × two actual surfaces × two repetitions × two separated days = 96 observations. Brand diagnostics, recommendation intents, informational citations and arithmetic accuracy have separate denominators. Refine/freeze the sample before collecting a baseline; it is not measured demand.

Use clean conversations, no prior brand coaching, synthetic math, fixed language/region, and record surface, model label if exposed, search activation, date, source visibility, available answer, error and page revision. Keep Google AI Mode separate from AI Overviews. API web search is a separate surface from consumer ChatGPT Search. Supplied-URL/file diagnostics test answerability, not organic discovery.

Report counts and denominators, including no-search/no-answer outcomes, and distinguish unavailable interfaces or errors. Verify that a citation supports the attached claim. A recommendation that invents official affiliation, universal compatibility or official GPA fails accuracy. Do not claim causal uplift from a bundled release or treat repeated runs as independent users.

## IndexNow

The public ownership proof file is a host-verification token, not an application secret. Preview with `npm run indexnow -- --all` or pass the exact changed public paths. Submit with `--submit` only after the published key and indexable 200 pages are verified. The script checks both before posting and excludes private/input-bearing URLs. Use `--all` for the initial public release; later notify substantive changed documents only. Receipt is not indexing or citation. [Protocol](https://www.indexnow.org/documentation).

Google/ChatGPT/Perplexity report access and live citation observations remain separate from deployment success. Do not insert fabricated baselines or visibility gains in this document.

## Rebuild public social cards

Cards are deterministic 1200×630 PNGs derived from the public registry. Their source uses the real brand mark and truthful page titles, without ratings, endorsements or fabricated usage. From the repository root:

```sh
npx vite-node scripts/generate-social-cards.ts /tmp/grademaxxing-social-card-sources
npm exec --yes --package=sharp-cli -- sharp -i '/tmp/grademaxxing-social-card-sources/*.svg' -o static/og -f png
```

Inspect the longest titles and homepage after regenerating. Encoding is a development operation, with no image-processing dependency shipped to the worker.
