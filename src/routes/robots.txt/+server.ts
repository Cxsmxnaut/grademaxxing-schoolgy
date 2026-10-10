import { isProductionHost, SITE_ORIGIN } from '$lib/seo/public-pages';
import type { RequestHandler } from './$types';

export const prerender = false;

export const GET: RequestHandler = ({ url }) => {
	// Allow crawling so search engines can observe noindex on excluded pages.
	// Authentication protects student records. Training permission remains an
	// independent owner decision; this change does not add a training opt-in.
	const body = [
		'User-agent: *',
		'Allow: /',
		...(isProductionHost(url.hostname) ? ['', `Sitemap: ${SITE_ORIGIN}/sitemap.xml`] : []),
		''
	].join('\n');
	return new Response(body, {
		headers: {
			'Content-Type': 'text/plain; charset=utf-8',
			'Cache-Control': 'public, max-age=300'
		}
	});
};
