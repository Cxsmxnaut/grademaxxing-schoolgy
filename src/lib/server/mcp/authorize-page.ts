/**
 * Self-contained HTML for the OAuth authorization step: the screen where the
 * student signs in to StudentVUE and approves the connector.
 *
 * It is intentionally a raw server-rendered page (not a SvelteKit page) so it
 * renders even while the root layout shows the maintenance gate, and it carries
 * no scripts at all — the form posts straight back to this route.
 */

export type AuthorizePageInput = {
	clientName: string;
	actionPath: string;
	hiddenFields: Array<[string, string]>;
	district?: string;
	username?: string;
	error?: { status: number; message: string };
};

export type AuthorizeErrorPageInput = {
	status: number;
	title: string;
	detail: string;
};

const BASE_STYLE = `
	:root { color-scheme: light dark; }
	* { box-sizing: border-box; }
	body {
		margin: 0;
		min-height: 100svh;
		font-family: 'Manrope', 'Instrument Sans', system-ui, -apple-system, 'Segoe UI', sans-serif;
		background: #f6f6f2;
		color: #16181d;
		display: grid;
		place-items: start center;
		padding: clamp(1.5rem, 5vw, 4rem) 1.25rem;
	}
	@media (prefers-color-scheme: dark) {
		body { background: #0d1014; color: #e9ecf1; }
		.card { background: #14181e !important; border-color: #262c35 !important; }
		.field input { background: #0f1318 !important; color: #e9ecf1 !important; border-color: #2c333d !important; }
		.muted, .note, li { color: #aab3c0 !important; }
		.brand { color: #e9ecf1 !important; }
		.error { background: #2a1417 !important; border-color: #7a2a33 !important; color: #ffb9c0 !important; }
	}
	.card {
		width: min(100%, 34rem);
		background: #ffffff;
		border: 1px solid #e4e4dd;
		border-radius: 1.25rem;
		padding: clamp(1.5rem, 5vw, 2.5rem);
		box-shadow: 0 1.5rem 3rem rgba(15, 17, 21, 0.08);
	}
	.brand { display: flex; align-items: center; gap: 0.6rem; font-weight: 700; font-size: 1.05rem; letter-spacing: -0.01em; margin-bottom: 1.5rem; color: #16181d; }
	.brand img { border-radius: 0.5rem; }
	.eyebrow { font-size: 0.7rem; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase; color: #1f7a4d; margin: 0 0 0.5rem; }
	h1 { font-size: 1.5rem; line-height: 1.2; margin: 0 0 0.75rem; letter-spacing: -0.02em; }
	.muted, .note, li { color: #4c5361; font-size: 0.9rem; line-height: 1.55; }
	ul { padding-left: 1.1rem; margin: 0.75rem 0 1rem; }
	li { margin: 0.3rem 0; }
	.error {
		border: 1px solid #b4232f;
		background: #fdecee;
		color: #8c1620;
		border-radius: 0.75rem;
		padding: 0.75rem 0.9rem;
		font-size: 0.88rem;
		margin: 0 0 1rem;
	}
	form { display: grid; gap: 0.9rem; margin-top: 1.25rem; }
	.field { display: grid; gap: 0.35rem; }
	label { font-size: 0.82rem; font-weight: 600; }
	input {
		border: 1px solid #d8d8d0;
		background: #fbfbf9;
		color: inherit;
		border-radius: 0.6rem;
		padding: 0.7rem 0.85rem;
		font-size: 0.95rem;
		font-family: inherit;
	}
	input:focus-visible { outline: 2px solid #1f7a4d; outline-offset: 2px; }
	button {
		margin-top: 0.25rem;
		border: 0;
		border-radius: 0.65rem;
		background: #1f7a4d;
		color: #ffffff;
		font-weight: 700;
		font-size: 0.95rem;
		padding: 0.8rem 1rem;
		cursor: pointer;
		font-family: inherit;
	}
	button:hover { background: #186241; }
	.note { border-top: 1px solid #ecece5; margin-top: 1.5rem; padding-top: 1rem; font-size: 0.8rem; }
	a { color: #1f7a4d; }
`;

function escapeHtml(value: string) {
	return value
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;');
}

function documentShell(title: string, body: string, style = BASE_STYLE) {
	return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="robots" content="noindex, nofollow" />
<title>${escapeHtml(title)}</title>
<style>${style}</style>
</head>
<body>
${body}
</body>
</html>`;
}

export function renderAuthorizePage(input: AuthorizePageInput) {
	const clientName = input.clientName || 'An MCP client';
	const hidden = input.hiddenFields
		.map(
			([name, value]) =>
				`<input type="hidden" name="${escapeHtml(name)}" value="${escapeHtml(value)}" />`
		)
		.join('\n\t\t\t');
	const errorBanner = input.error
		? `\t\t<div class="error" role="alert">${escapeHtml(input.error.message)}</div>\n`
		: '';
	return documentShell(
		`Connect ${clientName} to Grademaxxing`,
		`	<main class="card">
		<div class="brand"><img src="/grademaxxing-growth-mark.png" width="36" height="36" alt="" /> Grademaxxing <span class="muted" style="font-weight:500">(Beta)</span></div>
		<p class="eyebrow">StudentVUE connector</p>
		<h1>Connect ${escapeHtml(clientName)} to your StudentVUE data</h1>
		<p class="muted">Sign in to StudentVUE to grant this connector <strong>read-only</strong> access:</p>
		<ul>
			<li>Gradebook, official marks, and assignments</li>
			<li>Attendance, calendar, and class schedule</li>
			<li>Documents, report cards, and school information</li>
			<li>StudentVUE mail <em>reading</em> and student profile</li>
		</ul>
		<p class="muted"><strong>What it cannot do:</strong> change grades, send mail, edit records, or report absences. Your password goes directly to the StudentVUE sign-in and is never stored by Grademaxxing.</p>
${errorBanner}\t\t<form method="post" action="">
			${hidden}
			<div class="field">
				<label for="domain">District StudentVUE URL</label>
				<input id="domain" name="domain" type="url" inputmode="url" required maxlength="253" placeholder="https://ca-pleas-psv.edupoint.com" autocomplete="url" value="${escapeHtml(input.district ?? '')}" />
			</div>
			<div class="field">
				<label for="username">StudentVUE username</label>
				<input id="username" name="username" type="text" required maxlength="254" autocomplete="username" value="${escapeHtml(input.username ?? '')}" />
			</div>
			<div class="field">
				<label for="password">StudentVUE password</label>
				<input id="password" name="password" type="password" required maxlength="1024" autocomplete="current-password" />
			</div>
			<button type="submit">Sign in and connect</button>
		</form>
		<p class="note">By connecting, you allow ${escapeHtml(clientName)} to read the data listed above through this connector until you remove it. See the <a href="/privacy">privacy policy</a>. Access is encrypted end to end and revokes when you remove the connector or your StudentVUE session expires.</p>
	</main>`
	);
}

export function renderAuthorizeErrorPage(input: AuthorizeErrorPageInput) {
	return documentShell(
		input.title,
		`	<main class="card">
		<div class="brand"><img src="/grademaxxing-growth-mark.png" width="36" height="36" alt="" /> Grademaxxing <span class="muted" style="font-weight:500">(Beta)</span></div>
		<p class="eyebrow">Connection error</p>
		<h1>${escapeHtml(input.title)}</h1>
		<p class="muted">${escapeHtml(input.detail)}</p>
		<p class="note">Return to your AI app and try adding the connector again.</p>
	</main>`
	);
}
