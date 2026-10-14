/**
 * Markdown mirrors of the public pages, served two ways:
 *
 * - directly at `/index.md`, `/login.md`, `/privacy.md`, `/glossary.md`
 * - through content negotiation when a request sends `Accept: text/markdown`
 *
 * Every mirror carries YAML frontmatter, an H1, and a `## Sitemap` section so
 * agent-readability validators can verify the page without a DOM. Keep the
 * copy in sync with the corresponding `+page.svelte` files.
 */

/** Public pages that have a Markdown mirror, keyed by their clean path. */
const MIRRORS: Record<string, string> = {
	'/': `---
title: Grademaxxing — gradebook without the maze
description: Understand StudentVUE grades with trends, category math, what-if scores, attendance, documents, and mail.
url: https://grademaxxing.app/
lastmod: 2026-10-10
---

# Grademaxxing — gradebook without the maze

> Grademaxxing turns a final percentage into the information you actually need — grade trends, category math, and what-if scores, so you always know what to do next.

Grademaxxing is a calmer, read-only layer on top of StudentVUE, the grade portal used by many school districts. It connects with your existing account, reads your gradebook over HTTPS, and never changes school records.

## What it does

- Grade trends: see your grade change across dated assignments, and try what-if scores on the chart.
- What-if calculator: test a final, a missing assignment, or a target grade before it happens. This is a simulation, not a prophecy.
- Attendance detail: review absences, tardies, activities, dates, and class periods.
- Records in one place: StudentVUE documents, report cards, and mail within reach.
- Projected GPA: explore estimates without confusing them with official records.

## How it works

1. Connect StudentVUE — sign in with your existing account to read grades, attendance, documents, and mail from your district's portal.
2. See the real math — follow dated assignments and watch each new score move the chart, so you know what changed your grade.
3. Try the what-if scores — add hypothetical work and explore what you need next. Estimates stay separate from official grades.

## Good to know

- All previews use fictional sample records. Projected grades and GPA are estimates, not school records.
- Grademaxxing is free to use, works in any modern browser, and needs nothing installed.
- Availability depends on your district's portal; not every district configuration has been verified.
- ParentVUE accounts and multi-student switching are not currently supported.

## Sitemap

See the full [sitemap](https://grademaxxing.app/sitemap.md) for all pages on grademaxxing.app.
`,
	'/login': `---
title: Log In - Grademaxxing
description: Connect Grademaxxing to your district's StudentVUE account; your password is encrypted on-device and sent only over HTTPS.
url: https://grademaxxing.app/login
lastmod: 2026-10-10
---

# Log In - Grademaxxing

> Sign in with your existing StudentVUE account. Grademaxxing establishes a read-only portal session, then discards your password.

## Sign in

1. Pick your district (for example, your school district's StudentVUE portal URL).
2. Enter your StudentVUE email and password.
3. Optionally keep me signed in on this device, then select **Log in**.

## Security details

- Your password is encrypted on this device and passed directly to your district when Grademaxxing reconnects; it is never stored on our servers.
- Saved credentials are encrypted locally with a non-exportable browser key held in IndexedDB; only ciphertext is stored in browser storage.
- If a password is rejected, use the district's StudentVUE password-help page — check the All Mail folder in your school email for the reset message.
- Grademaxxing is independent and is not affiliated with Edupoint.

## After you sign in

Grademaxxing loads your gradebook: courses, dated assignments, category weights, attendance, documents, and school mail. What-if scores and projected grades stay clearly labeled as estimates.

## Sitemap

See the full [sitemap](https://grademaxxing.app/sitemap.md) for all pages on grademaxxing.app.
`,
	'/privacy': `---
title: Privacy - Grademaxxing
description: How Grademaxxing handles credentials, sessions, local caches, and referrals — without keeping your StudentVUE password on our servers.
url: https://grademaxxing.app/privacy
lastmod: 2026-10-10
---

# Privacy - Grademaxxing

> Grademaxxing keeps the convenience of a persistent sign-in without putting your StudentVUE password on our servers.

## Signing in

Your browser sends your credentials over HTTPS to the Grademaxxing server. The server uses them to establish a session with the official StudentVUE portal, then discards the password. It is never written to our disk, logs, or server session.

## While you are signed in

The active StudentVUE session state is encrypted and authenticated inside a secure, HTTP-only app cookie for up to 12 hours. The server uses it only to proxy read-only student information, and browser scripts cannot read it.

## Local data and signing out

If you choose Keep me signed in, your district, username, and password are encrypted on this device. The encryption key is held in IndexedDB as a non-exportable browser key, while only ciphertext is stored in browser storage. Grade data used by the interface may also be cached on your device. Signing out deletes the active server session, saved credentials, and local caches.

## Invite-only referrals

Invited referrers are created privately by the administrator using their name and email. Visitors opening a referral link go directly to the standard StudentVUE sign-in and are counted only if a one-way protected student key shows they are a new user. No referred student name or email is stored, and referral attribution stays separate from StudentVUE credentials, grades, and school records.

## Sitemap

See the full [sitemap](https://grademaxxing.app/sitemap.md) for all pages on grademaxxing.app.
`,
	'/glossary': `---
title: Glossary - Grademaxxing
description: Plain-language definitions for grading and StudentVUE terms — reporting periods, category weights, what-if scores, impact deltas, and more.
url: https://grademaxxing.app/glossary
lastmod: 2026-10-13
---

# Glossary - Grademaxxing

> The vocabulary Grademaxxing uses, in plain language. Official values come from your school; everything Grademaxxing calculates on top is labeled as an estimate.

## StudentVUE

The student grade portal from Edupoint Educational Systems that many districts use, and the only source Grademaxxing reads from.

## Reporting period

The quarter, trimester, or semester window that grades are reported in. Your gradebook view is scoped to one reporting period at a time.

## Category

A weighted group of assignments inside a course — homework, quizzes, tests, and so on. Categories are how your district decides what counts.

## Category weight

How much a category counts toward your course grade. A category worth 40% moves your grade more than one worth 10%.

## Points possible and percentage

The maximum points on an assignment (points possible), the points you earned, and the resulting percentage for the assignment or the course.

## What-if score

A hypothetical grade you have not earned yet. Grademaxxing simulates its impact locally so you can plan; it never changes your official record.

## Grade trend

Your course percentage plotted across dated assignments, so you can see what actually moved the line.

## Impact delta

How much a newly posted assignment moved your course average — for example, +0.42% or −1.15%.

## Tardy

A late arrival recorded in attendance, shown alongside absences and activities with dates and class periods.

## Estimate versus official

Every projected, hypothetical, or simulated number in Grademaxxing is labeled as an estimate. Letter grades and percentages that come straight from StudentVUE are the official values your school reports.

## Sitemap

See the full [sitemap](https://grademaxxing.app/sitemap.md) for all pages on grademaxxing.app.
`
};

/** Markdown mirror URL for a public page path (`/` → `/index.md`), if one exists. */
export function markdownMirrorPath(pathname: string): string | undefined {
	if (!(pathname in MIRRORS)) return undefined;
	return pathname === '/' ? '/index.md' : `${pathname}.md`;
}

/**
 * Resolve a request path to a mirror: accepts both the clean page path and the
 * direct mirror URL (`/index.md`, `/login.md`, …).
 */
function resolveMirror(pathname: string): { path: string; body: string } | undefined {
	if (pathname in MIRRORS) return { path: pathname, body: MIRRORS[pathname]! };
	if (pathname.endsWith('.md')) {
		const path = pathname === '/index.md' ? '/' : pathname.slice(0, -3);
		if (path in MIRRORS) return { path, body: MIRRORS[path]! };
	}
	return undefined;
}

/**
 * Serve the Markdown mirror for a GET request — either because the URL asks
 * for it directly (`/login.md`) or because the client sent
 * `Accept: text/markdown`. Returns undefined for everything else.
 */
export function markdownResponse(request: Request, pathname: string): Response | undefined {
	const mirror = resolveMirror(pathname);
	if (!mirror) return undefined;
	const direct = pathname.endsWith('.md');
	const negotiated =
		request.headers.get('accept')?.toLowerCase().includes('text/markdown') ?? false;
	if (!direct && !negotiated) return undefined;

	const mirrorUrl = mirror.path === '/' ? '/index.md' : `${mirror.path}.md`;
	return new Response(mirror.body, {
		headers: {
			'Content-Type': 'text/markdown; charset=utf-8',
			Vary: 'Accept',
			'X-Content-Type-Options': 'nosniff',
			Link: `<${mirrorUrl}>; rel="alternate"; type="text/markdown", </llms.txt>; rel="describedby"`
		}
	});
}
