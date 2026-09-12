# StudentVUE API benchmark CLI

This is an internal, API-only diagnostic for a designated StudentVUE test account. It does not use a browser, save payloads, print grades, or write portal cookies to disk. It invokes the same `Pxp2Client` path used by the application and reports login, resource, and upstream-request timings only.

On macOS, configure the account once. The district URL, username, and password are stored as separate items in macOS Keychain; no credential file is created:

```sh
npm run benchmark:studentvue -- configure
```

Then run the default fastest gradebook measurement whenever needed:

```sh
npm run benchmark:studentvue
```

The CLI asks you to type `TEST` during setup to confirm that the account is approved for diagnostics. Use only a designated test account; do not use a primary student's account.

To remove the local Keychain entries:

```sh
npm run benchmark:studentvue -- clear
```

For CI or non-macOS environments, use the documented environment fallback:

```sh
STUDENTVUE_TEST_ACCOUNT=1 \
STUDENTVUE_USERNAME='...' \
STUDENTVUE_PASSWORD='...' \
DISTRICT_URL='https://district.edupoint.com' \
npm run benchmark:studentvue -- --mode all --json
```

Modes:

- `fast` (default): measures the safe header-only gradebook path used for quick first paint when the portal provides enough complete header data.
- `complete`: measures the full current-report-period gradebook, including authoritative details needed for charts and calculations.
- `all`: measures the complete gradebook plus every supported collection/index endpoint. It deliberately does not download individual files, attachments, or message bodies.

Use `--budget-ms 4000 --fail-over-budget` in a local diagnostic run when checking the four-second target. The target applies best to `fast`; the complete gradebook can require several mandatory, serial upstream requests because StudentVUE mutates the selected class in a session.

Add `--record` to append a timing-only comparison entry to the ignored local file `.local/studentvue-api-benchmarks.ndjson`. The history contains timestamps, duration, pass/fail, generic error class, upstream path/status/timing, and no credentials, portal URL, identifiers, grades, or response bodies. Use a custom local path after `--record` only when needed.

Only run this against a designated test account and only at a reasonable diagnostic cadence. It is not a load-testing tool.
