# Grademaxxing (Beta)

An advanced grade calculator designed to interface with StudentVUE®.

<sub>StudentVUE is a registered trademark of Edupoint Educational Systems LLC. Grademaxxing (Beta) is not affiliated with or endorsed by Edupoint Educational Systems LLC.</sub>

## Developing

Install Node.js, then run `npm install` and `npm run dev`. Live PXP2 StudentVUE access is the default.

### Mocking

Mocking is opt-in. Set `PUBLIC_MOCK_STUDENTVUE_ORIGIN` only when you want the generated mock service worker and cached portal data.

```bash
bun run generate-mocks
```

The script will prompt you for your login information. If you do not want to have to enter it every time, you can set the [environment variables used](./generate_mock_data.ts#L101) in a `.env` file.

You must also set the environment variable `PUBLIC_MOCK_STUDENTVUE_ORIGIN` to your StudentVUE domain origin (e.g. `https://[your-district]-psv.edupoint.com`) when mocking is enabled. This can be done in a `.env` file.

### Dev Server

```bash
npm run dev
```

### Building

```bash
npm run build
```

You can preview the production build with `npm run preview`.

### Live end-to-end tests

Set `DISTRICT_URL`, `STUDENTVUE_USERNAME`, and `STUDENTVUE_PASSWORD` in the environment, start the app, and run `npm run test:e2e`. The Playwright suite exercises login, grades and course details, attendance, documents and PDF downloads, mail and attachments, student info, session reload, errors, and logout. Credentials are never embedded in test files or traces by the application.

### StudentVUE JSON API

After sign-in, the read-only same-origin API is available under `/api/studentvue`. Its discoverable contract inventory is `/api/studentvue/capabilities`. See [the SOAP-to-PXP2 contract map](./docs/studentvue-modern-api.md) for every route and its first-party modern source.

### StudentVUE API performance CLI

For approved test-account diagnostics, configure credentials once in macOS Keychain and run the real upstream benchmark:

```bash
npm run benchmark:studentvue -- configure
npm run benchmark:studentvue
```

See [`docs/studentvue-api-benchmark.md`](./docs/studentvue-api-benchmark.md) for complete-mode, JSON, timing-history, and non-macOS instructions. The CLI never prints or records StudentVUE payloads or credentials.

## Hosting

Use HTTPS in production and configure `GRADEMAXXING_SESSION_SECRET` with at least 32 random characters. StudentVUE credentials are discarded immediately after login. The resulting StudentVUE cookie state is encrypted into an HttpOnly application session, which allows the official Vercel adapter and multi-instance Node deployments without a shared session database. Failed logins are rate-limited per user and client address, and session-bound requests are serialized in the browser to protect StudentVUE's mutable gradebook focus.

Follow the [production hardening and reverse-proxy checklist](./docs/production-hardening.md) and [release gate](./docs/release-checklist.md) before exposing the app to students.

## License

Grademaxxing (Beta) is a modified version of the AGPLv3-licensed GradeCompass project. The product-facing name and identity are Grademaxxing (Beta); the repository history and license remain intact as required for an AGPL-derived work. If you

- modify the source code, and
- host this modified version on the internet,

you are required to publish the source code of your modified version under the same GNU AGPL license and document the changes you have made.

## Example .env file

Only `PUBLIC_MOCK_STUDENTVUE_ORIGIN` is required.

```dotenv
# dev server
PUBLIC_DISABLE_MSW=false
PUBLIC_MOCK_STUDENTVUE_ORIGIN=

# generating mocks
STUDENTVUE_DOMAIN=
STUDENTVUE_USERNAME=
STUDENTVUE_PASSWORD=
STUDENTVUE_MOCK_DOCUMENT_GU=
STUDENTVUE_MOCK_ATTACHMENT_GU=
```
