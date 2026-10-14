import type { RequestHandler } from './$types';

// The root layout opts every route out of prerendering so HTML responses pass
// through the security-header hook. A sitemap is a public, session-free asset,
// so it is safe to prerender and let each adapter serve it statically.
export const prerender = true;

// Canonical production origin; the custom domain is defined in wrangler.jsonc routes.
const SITE_ORIGIN = 'https://grademaxxing.app';

/** Public, content-bearing pages only. The authenticated app pages, /api,
 * /admin, and per-user /refer/[code] links are intentionally excluded.
 *
 * `lastmod` records each page's last meaningful content change — keep it a real
 * date rather than stamping build time, because validators treat identical
 * auto-dated entries as noise. */
const PATHS = [
	{ path: '/', lastmod: '2026-10-10' },
	{ path: '/login', lastmod: '2026-10-10' },
	{ path: '/privacy', lastmod: '2026-10-10' },
	{ path: '/glossary', lastmod: '2026-10-13' }
] as const;

const body = [
	'<?xml version="1.0" encoding="UTF-8"?>',
	'<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
	...PATHS.map(
		({ path, lastmod }) =>
			`\t<url><loc>${SITE_ORIGIN}${path}</loc><lastmod>${lastmod}</lastmod></url>`
	),
	'</urlset>'
].join('\n');

export const GET: RequestHandler = () =>
	new Response(body, {
		headers: { 'Content-Type': 'application/xml' }
	});
