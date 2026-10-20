# Upstream attribution

This package selectively adapts API designs, flow logic and grading behavior from these MIT-licensed projects. It does not imply affiliation with Schoology, PowerSchool, or the upstream authors. Original notices are included in `licenses/` and in the installable package.

## Schoolopy — primary API design

- Repository: https://github.com/ErikBoesen/schoolopy
- Reviewed commit: `a168f97ab40f9c9603ebd943730bd0aea1314809`
- Reviewed source: `schoolopy/main.py`, `schoolopy/authentication.py`, `schoolopy/models.py`.
- Adaptation: selected read endpoints in `src/client.ts`; the native TypeScript transport, normalization and HMAC implementation replace the Python runtime and its transport/authentication implementation.
- Copyright (c) 2017 Erik Boesen.
- Full notice: [licenses/ErikBoesen--schoolopy.txt](./licenses/ErikBoesen--schoolopy.txt).

## sgy-sgy — OAuth workflow

- Repository: https://github.com/SheepTester/sgy-sgy
- Reviewed commit: `7b9bbfc1da0023666aab64a9baccb1ac55ea8203`
- Reviewed source: `oauth-3leg/app2.js`.
- Adaptation: Schoology token endpoints and authorization callback behavior in `src/auth.ts`; re-signing a bounded same-origin `/users/me` redirect in `src/transport.ts`. The prototype's user-supplied account identifier and shared token maps are replaced by a session-bound storage interface in the example.
- Copyright (c) 2024 Sean.
- Full notice: [licenses/SheepTester--sgy-sgy.txt](./licenses/SheepTester--sgy-sgy.txt).

## SchoologyPlus — local grading behavior

- Repository: https://github.com/aopell/SchoologyPlus
- Reviewed commit: `85e2e869678570179fba6ba554d5ca0b469ff3ec`
- Reviewed source: `src/scripts/pages/grades.ts`, including `recalculateCategoryScore`, `recalculatePeriodScore`, and the what-if/minimum-grade workflow.
- Adaptation: category/period arithmetic and what-if behavior rewritten into immutable, DOM-free functions in `src/grades.ts`. The implementation exposes missing-rule uncertainty and intentionally does not reproduce every SchoologyPlus grading/UI behavior.
- Copyright (c) 2017-2024 Aaron Opell and Glen Husman.
- Full notice: [licenses/aopell--SchoologyPlus.txt](./licenses/aopell--SchoologyPlus.txt).

## Protocol and API references

- [Schoology authentication](https://developers.schoology.com/api-documentation/authentication/)
- [User grades and enrollment pagination](https://developers.schoology.com/api-documentation/rest-api-v1/user-grades/)
- [Section categories and grading rules](https://developers.schoology.com/api-documentation/rest-api-v1/course-section/)
- [Assignment metadata](https://developers.schoology.com/api-documentation/rest-api-v1/assignment/)
- [OAuth Core 1.0 signing example](https://oauth.net/core/1.0/#sig_base_example)

Upstream reference snapshots downloaded for development live in ignored `.upstream/`; they are not shipped. Only the notices and the adapted connector are packaged.
