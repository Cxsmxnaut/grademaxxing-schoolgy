import type { RequestHandler } from './$types';

// The root layout opts every route out of prerendering so HTML responses pass
// through the security-header hook. A sitemap is a public, session-free asset,
// so it is safe to prerender and let each adapter serve it statically.
export const prerender = true;

// Canonical production origin; the custom domain is defined in wrangler.jsonc routes.
const SITE_ORIGIN = 'https://grademaxxing.app';

/** Public, content-bearing pages only. The authenticated app pages, /api,
 * /admin, and per-user /refer/[code] links are intentionally excluded. */
const PATHS = ['/', '/login', '/privacy'] as const;

const body = [
	'<?xml version="1.0" encoding="UTF-8"?>',
	'<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
	...PATHS.map((path) => `\t<url><loc>${SITE_ORIGIN}${path}</loc></url>`),
	'</urlset>'
].join('\n');

export const GET: RequestHandler = () =>
	new Response(body, {
		headers: { 'Content-Type': 'application/xml' }
	});
