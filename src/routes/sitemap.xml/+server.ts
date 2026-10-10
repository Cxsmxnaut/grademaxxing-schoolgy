import { canonicalUrl, PUBLIC_PAGES } from '$lib/seo/public-pages';
import type { RequestHandler } from './$types';

// Keep the host-aware response headers in hooks.server.ts active on every adapter.
export const prerender = false;

const body = [
	'<?xml version="1.0" encoding="UTF-8"?>',
	'<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
	...PUBLIC_PAGES.map(({ path }) => `\t<url><loc>${canonicalUrl(path)}</loc></url>`),
	'</urlset>'
].join('\n');

export const GET: RequestHandler = () =>
	new Response(body, {
		headers: {
			'Content-Type': 'application/xml; charset=utf-8',
			'Cache-Control': 'public, max-age=300'
		}
	});
