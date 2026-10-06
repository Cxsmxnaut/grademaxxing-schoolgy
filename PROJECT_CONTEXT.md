# Grademaxxing (Beta) — agent handoff

This is the starting point for a fresh Codex task working on Grademaxxing. Read this file first, then use the linked documents for the requested area.

## Product and scope

Grademaxxing (Beta) is a student-facing SvelteKit application for viewing StudentVUE records and exploring grades. It is a **read-only** companion: it does not send mail, change records, submit work, or report absences. Its product features include a gradebook, individual-course what-if calculations, GPA calculator, attendance/calendar, documents, StudentVUE mail reading, profile information, and a landing/sign-in flow.

The source is an AGPL-derived work. Keep the existing license and attribution/history obligations intact. The public product name is **Grademaxxing (Beta)**; do not represent it as affiliated with Edupoint or a school district.

## Where the project is

- Repository: `/Users/slolakap/Documents/ChatGPT/New project/gradecompass-a47c44e`
- Local development: `npm run dev`, serving on `127.0.0.1`
- Public production URL: `https://grademaxxing.app`
- Current hosting: Cloudflare Worker named `grademaxxing-beta`
- Cloudflare Worker test URL: `https://grademaxxing-beta.bhavith-lolakapuri.workers.dev`

The repository can be dirty. Treat every existing uncommitted change as user-owned unless the exact change is part of the active task. Never reset, clean, or overwrite unrelated work.

## Read next

| Need                                                  | Document                                                                                                          |
| ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Orientation, routes, data flow, state                 | [Codebase architecture](docs/codebase-architecture.md)                                                            |
| StudentVUE login/session/API behavior                 | [StudentVUE integration](docs/studentvue-integration.md) and [modern API contract](docs/studentvue-modern-api.md) |
| Cloudflare, domain, deployment, rollback              | [Operations runbook](docs/operations-runbook.md)                                                                  |
| UI, fonts, visual parity, and testing                 | [Design system and visual QA](docs/design-system.md)                                                              |
| ChatGPT/Claude MCP connector, OAuth, and tool surface | [MCP server](docs/mcp-server.md)                                                                                  |
| Commands and release testing                          | [Release checklist](docs/release-checklist.md)                                                                    |
| Privacy, school authorization, and student-data risk  | [Student-data compliance audit](docs/student-data-compliance-audit.md)                                            |

## Non-negotiable working rules

1. Do not put StudentVUE credentials, session cookies, portal pages, student records, screenshots, tokens, or secrets in Git, source, test fixtures, logs, chat, or deployed analytics.
2. Use only a designated test account for live StudentVUE checks. Do not repeatedly authenticate or scrape a real student's primary account, and do not run load tests against district systems without approval.
3. Preserve the encrypted-session architecture. StudentVUE passwords are used only during login/reconnect and must not be retained.
4. Before a production deployment, run the relevant automated checks. A UI-only change still needs `npm run check` and focused Playwright coverage; platform/auth/parser changes need the full release gate.
5. The deployed domain is technically live, but that does not by itself satisfy school/district privacy or procurement approval. Follow the compliance audit before describing it as school-ready.

## Recent verified deployment state

On the latest Cloudflare cutover, public DNS resolved to Cloudflare, HTTPS returned 200, `/api/health` returned `{ "status": "ok" }`, and production-domain Playwright coverage passed. The Worker route is stored in `wrangler.jsonc`; do not delete it during future deployment changes.
