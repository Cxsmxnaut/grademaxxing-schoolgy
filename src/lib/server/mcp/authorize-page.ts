import { DISTRICTS } from '$lib/data/districts';

/**
 * Self-contained HTML for the OAuth authorization step: the screen where the
 * student signs in to StudentVUE and approves the connector.
 *
 * It is intentionally a raw server-rendered page (not a SvelteKit page) so it
 * renders even while the root layout shows the maintenance gate, and it carries
 * no scripts at all — the form posts straight back to this route.
 *
 * Visual language mirrors the app's sign-in screen (src/routes/login): the
 * framed split layout, semantic tokens from src/app.css, and the same
 * Manrope / Outfit / JetBrains Mono faces (served from /fonts because this
 * page's CSP allows no external origins). Keep both screens in sync.
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
/* Hallmark · pre-emit critique: P5 H5 E5 S5 R5 V4
 * macrostructure: framed split sign-in · theme: existing Grademaxxing semantic
 * tokens · enrichment: none (existing login-dunes asset) · motion: cut
 */

@font-face { font-family: 'Manrope'; font-style: normal; font-weight: 400; font-display: swap; src: url('/fonts/manrope-latin-400-normal.woff2') format('woff2'); }
@font-face { font-family: 'Manrope'; font-style: normal; font-weight: 500; font-display: swap; src: url('/fonts/manrope-latin-500-normal.woff2') format('woff2'); }
@font-face { font-family: 'Manrope'; font-style: normal; font-weight: 600; font-display: swap; src: url('/fonts/manrope-latin-600-normal.woff2') format('woff2'); }
@font-face { font-family: 'Outfit'; font-style: normal; font-weight: 600; font-display: swap; src: url('/fonts/outfit-latin-600-normal.woff2') format('woff2'); }
@font-face { font-family: 'Outfit'; font-style: normal; font-weight: 700; font-display: swap; src: url('/fonts/outfit-latin-700-normal.woff2') format('woff2'); }
@font-face { font-family: 'JetBrains Mono'; font-style: normal; font-weight: 400; font-display: swap; src: url('/fonts/jetbrains-mono-latin-400-normal.woff2') format('woff2'); }
@font-face { font-family: 'JetBrains Mono'; font-style: normal; font-weight: 600; font-display: swap; src: url('/fonts/jetbrains-mono-latin-600-normal.woff2') format('woff2'); }

:root {
\tcolor-scheme: light dark;
\t--font-body: 'Manrope', system-ui, sans-serif;
\t--font-heading: 'Outfit', 'Manrope', system-ui, sans-serif;
\t--font-technical: 'JetBrains Mono', ui-monospace, monospace;
\t--radius: 0.625rem;
\t--background: #f5f9fd;
\t--foreground: #0f1c2e;
\t--card: #ffffff;
\t--primary: #0a73b2;
\t--primary-foreground: #ffffff;
\t--secondary: #e9f2fa;
\t--muted-foreground: #52657c;
\t--tertiary-foreground: #5b6e85;
\t--border: rgb(15 28 46 / 9%);
\t--input: rgb(15 28 46 / 17%);
\t--destructive: #b0483a;
\t--destructive-soft: rgb(176 72 58 / 10%);
\t--link: #0a73b2;
\t--surface-sunken: #e9f2fa;
}
@media (prefers-color-scheme: dark) {
\t:root {
\t\t--background: #151e28;
\t\t--foreground: #f1f5f7;
\t\t--card: #1a2737;
\t\t--primary: #6ea8dc;
\t\t--primary-foreground: #151e28;
\t\t--secondary: #202d38;
\t\t--muted-foreground: #aab7c5;
\t\t--tertiary-foreground: #8195ab;
\t\t--border: rgb(241 245 247 / 9%);
\t\t--input: rgb(241 245 247 / 16%);
\t\t--destructive: #f08078;
\t\t--destructive-soft: rgb(240 128 120 / 12%);
\t\t--link: #6ea8dc;
\t\t--surface-sunken: #0a0f13;
\t}
}

* { box-sizing: border-box; }
body {
\tmargin: 0;
\tmin-height: 100dvh;
\tdisplay: grid;
\tplace-items: center;
\tbackground: color-mix(in srgb, var(--background) 76%, var(--primary));
\tcolor: var(--foreground);
\tfont-family: var(--font-body);
\tfont-size: 0.90625rem;
\tline-height: 1.5;
\tpadding: clamp(1rem, 3.5vw, 3.5rem);
}
.frame {
\tdisplay: grid;
\tgrid-template-columns: minmax(0, 1.04fr) minmax(0, 0.96fr);
\tgap: clamp(1rem, 2vw, 1.5rem);
\twidth: min(100%, 78rem);
\tmin-height: 43rem;
\tborder: 1px solid var(--border);
\tborder-radius: 1.5rem;
\tbackground: var(--card);
\tpadding: 1rem;
\tbox-shadow: 0 2rem 4.5rem color-mix(in srgb, var(--surface-sunken) 46%, transparent);
}
.story {
\tposition: relative;
\tmin-width: 0;
\tmin-height: 41rem;
\toverflow: hidden;
\tborder-radius: 1rem;
\tcolor: var(--foreground);
}
.story > img {
\tposition: absolute;
\tinset: 0;
\twidth: 100%;
\theight: 100%;
\tobject-fit: cover;
\tobject-position: center 56%;
}
.story-shade {
\tposition: absolute;
\tinset: 0;
\tbackground: linear-gradient(
\t\t180deg,
\t\tcolor-mix(in srgb, var(--surface-sunken) 38%, transparent),
\t\ttransparent 35%,
\t\tcolor-mix(in srgb, var(--surface-sunken) 78%, transparent)
\t);
}
.story-top,
.story-bottom {
\tposition: absolute;
\tright: clamp(1.5rem, 3vw, 2.5rem);
\tleft: clamp(1.5rem, 3vw, 2.5rem);
}
.story-top { top: 1.5rem; }
.story-brand {
\tdisplay: flex;
\talign-items: center;
\tgap: 0.625rem;
\tfont-family: var(--font-heading);
\tfont-size: 1.1875rem;
\tfont-weight: 700;
\tletter-spacing: -0.01em;
\twhite-space: nowrap;
}
.story-brand img { width: 2rem; height: 2rem; }
.story-bottom { bottom: 2.5rem; }
.story-bottom h2 {
\tmax-width: 24rem;
\tmargin: 0;
\tfont-family: var(--font-heading);
\tfont-size: clamp(1.85rem, 2.6vw, 2.4rem);
\tfont-weight: 600;
\tline-height: 1.13;
\tletter-spacing: -0.04em;
\ttext-wrap: balance;
}
.story-bottom p {
\tmargin: 0.75rem 0 0;
\tcolor: var(--muted-foreground);
\tfont-size: 0.875rem;
}
.beta {
\tcolor: var(--muted-foreground);
\tfont-family: var(--font-body);
\tfont-size: 0.8rem;
\tfont-weight: 500;
\tletter-spacing: 0;
}
.pane {
\tdisplay: grid;
\tmin-width: 0;
\tplace-items: center;
\tpadding: clamp(1.5rem, 4.25vw, 4rem);
}
.panel { width: min(100%, 28.5rem); }
.pane-brand { display: none; }
.eyebrow {
\tmargin: 0 0 1rem;
\tcolor: var(--primary);
\tfont-family: var(--font-technical);
\tfont-size: 0.6875rem;
\tfont-weight: 600;
\tletter-spacing: 0.17em;
}
h1 {
\tmargin: 0;
\tfont-family: var(--font-heading);
\tfont-size: clamp(1.5rem, 3vw, 2.125rem);
\tfont-weight: 600;
\tline-height: 1.12;
\tletter-spacing: -0.04em;
\ttext-wrap: balance;
}
.lede {
\tmargin: 0.75rem 0 0;
\tcolor: var(--muted-foreground);
\tfont-size: 0.875rem;
\tline-height: 1.5;
}
.lede strong { color: var(--foreground); font-weight: 600; }
.perms {
\tdisplay: grid;
\tgap: 0.5rem;
\tmargin: 0.875rem 0 0;
\tpadding: 0;
\tlist-style: none;
}
.perms li {
\tdisplay: flex;
\tgap: 0.625rem;
\talign-items: flex-start;
\tmargin: 0;
\tcolor: var(--muted-foreground);
\tfont-size: 0.875rem;
\tline-height: 1.45;
}
.tick {
\tflex: none;
\twidth: 1.125rem;
\theight: 1.125rem;
\tmargin-top: 0.1rem;
}
.tick circle { fill: color-mix(in srgb, var(--primary) 14%, transparent); }
.tick path {
\tfill: none;
\tstroke: var(--primary);
\tstroke-width: 1.7;
\tstroke-linecap: round;
\tstroke-linejoin: round;
}
.limits {
\tmargin: 1rem 0 0;
\tcolor: var(--muted-foreground);
\tfont-size: 0.8125rem;
\tline-height: 1.55;
}
.limits strong { color: var(--foreground); font-weight: 600; }
.alert {
\tdisplay: flex;
\tgap: 0.625rem;
\talign-items: flex-start;
\tmargin: 1.25rem 0 0;
\tborder: 1px solid color-mix(in srgb, var(--destructive) 35%, transparent);
\tborder-radius: calc(var(--radius) + 0.125rem);
\tbackground: var(--destructive-soft);
\tcolor: var(--destructive);
\tpadding: 0.75rem 0.9rem;
\tfont-size: 0.875rem;
}
.alert svg {
\tflex: none;
\twidth: 1.125rem;
\theight: 1.125rem;
\tmargin-top: 0.1rem;
\tfill: none;
\tstroke: currentColor;
\tstroke-width: 1.75;
\tstroke-linecap: round;
}
.alert p { margin: 0; }
form { display: grid; gap: 1.25rem; margin-top: 1.5rem; }
.field { display: grid; }
label {
\tmargin-bottom: 0.375rem;
\tcolor: var(--muted-foreground);
\tfont-size: 0.78125rem;
\tline-height: 1.172rem;
\tfont-weight: 600;
}
input {
\twidth: 100%;
\theight: 3rem;
\tborder: 1px solid var(--input);
\tborder-radius: var(--radius);
\tbackground: var(--secondary);
\tcolor: var(--foreground);
\tpadding: 0 1rem;
\tfont-size: 0.875rem;
\tfont-family: inherit;
}
input::placeholder { color: var(--tertiary-foreground); }
/* Room for the browser's native datalist affordance, matching the app's
   combobox, whose search input sits left of a 2.5rem chevron area. */
input.picker { padding-right: 2.5rem; }
input:focus-visible {
\tborder-color: var(--primary);
\toutline: 2px solid var(--primary);
\toutline-offset: 2px;
}
button {
\tmargin-top: 0.25rem;
\twidth: 100%;
\theight: 3rem;
\tborder: 1px solid var(--primary);
\tborder-radius: var(--radius);
\tbackground: var(--primary);
\tcolor: var(--primary-foreground);
\tfont-family: inherit;
\tfont-size: 0.90625rem;
\tfont-weight: 600;
\tcursor: pointer;
}
button:hover { filter: brightness(1.08); }
button:active { filter: brightness(0.96); }
button:focus-visible { outline: 2px solid var(--primary); outline-offset: 2px; }
button:disabled { opacity: 0.6; cursor: not-allowed; }
.legal {
\tmargin: 1.75rem 0 0;
\tcolor: var(--muted-foreground);
\tfont-size: 0.75rem;
\tline-height: 1.6;
\ttext-align: center;
}
.legal a { color: var(--link); font-weight: 500; }
.legal a:hover { filter: brightness(1.1); }

@media (max-height: 53.125rem) and (min-width: 64.0625rem) {
\tbody { padding-block: 1rem; }
\t.frame,
\t.story { min-height: 0; }
\t.pane { padding-block: 1.5rem; }
}
@media (max-width: 64rem) {
\t.frame {
\t\tgrid-template-columns: minmax(0, 1fr);
\t\twidth: min(100%, 34rem);
\t\tmin-height: 0;
\t\tgap: 0;
\t\tpadding: 0;
\t}
\t.story { display: none; }
\t.pane { padding: 2.5rem; }
\t.pane-brand {
\t\tdisplay: flex;
\t\talign-items: center;
\t\tgap: 0.5625rem;
\t\tmargin-bottom: 1.609375rem;
\t\tfont-family: var(--font-heading);
\t\tfont-size: 1.1875rem;
\t\tfont-weight: 700;
\t\tletter-spacing: -0.01em;
\t}
\t.pane-brand img { width: 2.125rem; height: 2.125rem; }
}
@media (max-width: 40rem) {
\tbody {
\t\tplace-items: start center;
\t\tbackground: var(--background);
\t\tpadding: 0;
\t}
\t.frame {
\t\tborder: 0;
\t\tborder-radius: 0;
\t\tbackground: transparent;
\t\tbox-shadow: none;
\t}
\t.pane { padding: 1.5rem 1rem 2rem; }
}
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

const GROWTH_MARK = `<img src="/grademaxxing-growth-mark.png" alt="" />`;
// The same district catalog the login picker (DistrictCombobox) searches.
// The consent page runs no scripts, so the combobox ships as a native
// <input list> + <datalist>: identical data, placeholder, and search-by-
// district/state/portal behavior, powered by the browser instead of JS.
const DISTRICT_OPTIONS = DISTRICTS.map(
	(district) =>
		`<option value="https://${escapeHtml(district.domain)}">${escapeHtml(district.name)}, ${escapeHtml(district.state)}</option>`
).join('\n\t\t\t\t\t');
const TICK_ICON = `<svg class="tick" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="7.3" /><path d="M4.9 8.35 7.05 10.5 11.2 5.9" /></svg>`;
const ALERT_ICON = `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9.25" /><path d="M12 7.6v5.2" /><path d="M12 16.35h.01" /></svg>`;

function frameShell(paneInner: string) {
	return `	<div class="frame">
		<aside class="story" aria-label="Grademaxxing introduction">
			<img src="/login-dunes.jpg" alt="" />
			<div class="story-shade" aria-hidden="true"></div>
			<div class="story-top">
				<div class="story-brand">${GROWTH_MARK}<span>Grademaxxing</span><span class="beta">(Beta)</span></div>
			</div>
			<div class="story-bottom">
				<h2>Your grades are complicated enough.</h2>
				<p>See the school day more clearly.</p>
			</div>
		</aside>
		<main class="pane">
			<div class="panel">
				<header class="pane-brand">${GROWTH_MARK}<span>Grademaxxing</span><span class="beta">(Beta)</span></header>
${paneInner}
			</div>
		</main>
	</div>`;
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
		? `\t\t\t<div class="alert" role="alert">${ALERT_ICON}<p>${escapeHtml(input.error.message)}</p></div>\n`
		: '';
	return documentShell(
		`Connect ${clientName} to Grademaxxing`,
		frameShell(`				<p class="eyebrow">STUDENTVUE CONNECTOR</p>
				<h1>Connect ${escapeHtml(clientName)} to your StudentVUE data</h1>
				<p class="lede">Sign in to StudentVUE to grant this connector <strong>read-only</strong> access:</p>
				<ul class="perms">
					<li>${TICK_ICON}Gradebook, official marks, and assignments</li>
					<li>${TICK_ICON}Attendance, calendar, and class schedule</li>
					<li>${TICK_ICON}Documents, report cards, and school information</li>
					<li>${TICK_ICON}StudentVUE mail <em>reading</em> and student profile</li>
				</ul>
				<p class="limits"><strong>What it cannot do:</strong> change grades, send mail, edit records, or report absences. Your password goes directly to the StudentVUE sign-in and is never stored by Grademaxxing.</p>
${errorBanner}				<form method="post" action="">
					${hidden}
					<div class="field">
						<label for="domain">School district</label>
						<input id="domain" name="domain" class="picker" type="text" list="districts" required maxlength="253" placeholder="Search by district, state, or portal" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" value="${escapeHtml(input.district ?? '')}" />
						<datalist id="districts">${DISTRICT_OPTIONS}</datalist>
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
				<p class="legal">By connecting, you allow ${escapeHtml(clientName)} to read the data listed above through this connector until you remove it. See the <a href="/privacy">privacy policy</a>. Access is encrypted end to end and revokes when you remove the connector or your StudentVUE session expires.</p>`)
	);
}

export function renderAuthorizeErrorPage(input: AuthorizeErrorPageInput) {
	return documentShell(
		input.title,
		frameShell(`				<p class="eyebrow">CONNECTION ERROR</p>
				<h1>${escapeHtml(input.title)}</h1>
				<p class="lede">${escapeHtml(input.detail)}</p>
				<p class="legal">Return to your AI app and try adding the connector again.</p>`)
	);
}
