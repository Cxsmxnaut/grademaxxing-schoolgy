import { isMaintenancePage, needsNoindex, productionHttpsRedirect } from '$lib/seo/indexing';
import {
	canonicalUrl,
	getPublicPage,
	PUBLIC_PAGES,
	publicPageSchema,
	serializeSchema,
	SITE_ORIGIN,
	socialImagePath
} from '$lib/seo/public-pages';
import type { RequestEvent } from '@sveltejs/kit';
import { beforeEach, expect, test, vi } from 'vitest';
import { handle } from '../hooks.server';
import { GET as robots } from '../routes/robots.txt/+server';
import { GET as sitemap } from '../routes/sitemap.xml/+server';

const { environment } = vi.hoisted(() => ({ environment: {} as Record<string, string> }));
vi.mock('$env/dynamic/private', () => ({ env: environment }));

function eventFor(
	url: string,
	options: { method?: string; headers?: HeadersInit; routeId?: string | null } = {}
): RequestEvent {
	const parsed = new URL(url);
	return {
		url: parsed,
		request: new Request(parsed, { method: options.method ?? 'GET', headers: options.headers }),
		locals: {},
		route: { id: options.routeId === undefined ? parsed.pathname : options.routeId },
		params: {},
		platform: undefined
	} as RequestEvent;
}

beforeEach(() => {
	delete environment.MAINTENANCE_MODE;
	vi.restoreAllMocks();
});

test('public registry produces unique canonical URLs and only known paths', () => {
	expect(new Set(PUBLIC_PAGES.map(({ path }) => path)).size).toBe(PUBLIC_PAGES.length);
	for (const page of PUBLIC_PAGES) {
		expect(canonicalUrl(page.path)).toBe(`${SITE_ORIGIN}${page.path}`);
		expect(page.title).toBeTruthy();
		expect(page.description).toBeTruthy();
		expect(socialImagePath(page.path)).toMatch(/^\/og\/[a-z-]+\.png$/);
	}
	expect(canonicalUrl('/calculators/final-grade/?utm_source=test#formula')).toBe(
		`${SITE_ORIGIN}/calculators/final-grade`
	);
	expect(getPublicPage('/login')).toBeUndefined();
	expect(() => canonicalUrl('https://attacker.invalid/')).toThrow();
	expect(() => canonicalUrl('//attacker.invalid')).toThrow();
});

test('schema facts remain tied to visible metadata and contain no invented ratings', () => {
	const page = getPublicPage('/calculators/assignment-impact')!;
	const schema = publicPageSchema(page);
	const webPage = schema['@graph'].find((item) => item['@type'] === 'WebPage');
	expect(webPage).toMatchObject({ name: page.title, description: page.description });
	const crumbs = schema['@graph'].find((item) => item['@type'] === 'BreadcrumbList');
	expect(crumbs?.itemListElement).toEqual([
		{ '@type': 'ListItem', position: 1, name: 'Home', item: `${SITE_ORIGIN}/` },
		{
			'@type': 'ListItem',
			position: 2,
			name: 'Grade calculators',
			item: `${SITE_ORIGIN}/calculators`
		},
		{ '@type': 'ListItem', position: 3, name: page.label, item: canonicalUrl(page.path) }
	]);
	expect(JSON.stringify(schema)).not.toMatch(/aggregateRating|review|FAQPage/);
	expect(serializeSchema({ text: '</script><script>alert(1)</script>&' })).not.toContain('<');
	expect(JSON.parse(serializeSchema({ text: '</script>&' }))).toEqual({ text: '</script>&' });
});

test.each([
	['https://grademaxxing.app/', 200, 'text/html', false],
	['https://grademaxxing.app/calculators/assignment-impact?score=private', 200, 'text/html', false],
	['https://grademaxxing.app/login', 200, 'text/html', true],
	['https://grademaxxing.app/grades/0', 200, 'text/html', true],
	['https://grademaxxing.app/migrate/import', 200, 'text/html', true],
	['https://grademaxxing.app/api/health', 200, 'application/json', true],
	['https://grademaxxing.app/mcp', 401, 'application/json', true],
	['https://grademaxxing.app/admin-app/shell.html', 200, 'text/html', true],
	['https://grademaxxing.app/not-a-page', 404, 'text/html', true],
	['https://new.grademaxxing.app/calculators', 200, 'text/html', true],
	['https://grademaxxing-beta.bhavith-lolakapuri.workers.dev/', 200, 'text/html', true],
	['https://admin.grademaxxing.app/privacy', 200, 'text/html', true],
	['http://127.0.0.1:5173/', 200, 'text/html', true]
])('indexing policy for %s (%i)', (url, status, contentType, expected) => {
	expect(needsNoindex(new URL(url), status, contentType)).toBe(expected);
});

test('HTTP production redirects preserve path/query and never use an untrusted host', async () => {
	const event = eventFor('http://grademaxxing.app/calculators/final-grade?utm_source=test');
	const resolve = vi.fn();
	const response = await handle({ event, resolve });
	expect(response.status).toBe(308);
	expect(response.headers.get('location')).toBe(
		'https://grademaxxing.app/calculators/final-grade?utm_source=test'
	);
	expect(resolve).not.toHaveBeenCalled();
	expect(response.headers.get('x-content-type-options')).toBe('nosniff');
	expect(productionHttpsRedirect(event.url, 'https')).toBeUndefined();
	expect(productionHttpsRedirect(new URL('http://new.grademaxxing.app/'), null)).toBeUndefined();
	expect(productionHttpsRedirect(new URL('http://127.0.0.1:5173/'), null)).toBeUndefined();
});

test('public responses retain security/private caching while alternate hosts get noindex', async () => {
	for (const host of ['grademaxxing.app', 'new.grademaxxing.app']) {
		const response = await handle({
			event: eventFor(`https://${host}/calculators`),
			resolve: async () =>
				new Response('<h1>Calculators</h1>', { headers: { 'Content-Type': 'text/html' } })
		});
		expect(response.status).toBe(200);
		expect(response.headers.get('x-robots-tag')).toBe(
			host === 'grademaxxing.app' ? null : 'noindex'
		);
		expect(response.headers.get('cache-control')).toBe('private, no-store, max-age=0');
		expect(response.headers.get('strict-transport-security')).toContain('max-age=31536000');
	}
});

test('guard failures retain their HTTP status, noindex and private cache protections', async () => {
	const resolve = vi.fn();
	const response = await handle({
		event: eventFor('https://grademaxxing.app/api/session', {
			method: 'POST',
			headers: { Origin: 'https://attacker.invalid', 'Content-Type': 'application/json' }
		}),
		resolve
	});
	expect(response.status).toBe(403);
	expect(response.headers.get('x-robots-tag')).toBe('noindex');
	expect(response.headers.get('cache-control')).toContain('no-store');
	expect(response.headers.get('pragma')).toBe('no-cache');
	expect(resolve).not.toHaveBeenCalled();
});

test('SvelteKit data responses cannot become indexed or publicly cached', async () => {
	const event = eventFor('https://grademaxxing.app/grades');
	event.isDataRequest = true;
	const response = await handle({
		event,
		resolve: async () =>
			new Response('{"type":"data"}', {
				headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=300' }
			})
	});
	expect(response.status).toBe(200);
	expect(response.headers.get('x-robots-tag')).toBe('noindex');
	expect(response.headers.get('cache-control')).toBe('private, no-store, max-age=0');
});

test('MCP discovery keeps provider origins and CORS while gaining exclusion', async () => {
	const response = await handle({
		event: eventFor('https://grademaxxing.app/.well-known/oauth-protected-resource'),
		resolve: vi.fn()
	});
	expect(response.status).toBe(200);
	expect(response.headers.get('access-control-allow-origin')).toBe('*');
	expect(response.headers.get('access-control-expose-headers')).toContain('WWW-Authenticate');
	expect(response.headers.get('x-robots-tag')).toBe('noindex');
	expect(await response.json()).toMatchObject({ resource: 'https://grademaxxing.app/mcp' });
});

test('maintenance uses 503/Retry-After for app HTML but leaves public pages and real errors intact', async () => {
	environment.MAINTENANCE_MODE = 'on';
	vi.spyOn(console, 'warn').mockImplementation(() => {});
	const cases = [
		['/grades', '/(authed)/grades', 200, 503],
		['/login', '/login', 200, 503],
		['/calculators', '/(public)/calculators', 200, 200],
		['/privacy', '/(public)/privacy', 200, 200],
		['/', '/', 200, 200],
		['/not-a-page', null, 404, 404],
		['/grades', '/(authed)/grades', 401, 401]
	] as const;
	for (const [path, routeId, originalStatus, expectedStatus] of cases) {
		const response = await handle({
			event: eventFor(`https://grademaxxing.app${path}`, { routeId }),
			resolve: async () =>
				new Response('<h1>Example</h1>', {
					status: originalStatus,
					headers: { 'Content-Type': 'text/html' }
				})
		});
		expect(response.status, path).toBe(expectedStatus);
		expect(response.headers.get('retry-after'), path).toBe(expectedStatus === 503 ? '30' : null);
	}
	expect(isMaintenancePage('/api/health', '/api/health')).toBe(false);
	expect(isMaintenancePage('/mcp/authorize', '/mcp/authorize')).toBe(false);
});

test('sitemap contains every registered canonical public page and no private/query URL', async () => {
	const response = await sitemap(
		eventFor('https://grademaxxing.app/sitemap.xml') as Parameters<typeof sitemap>[0]
	);
	const body = await response.text();
	expect(response.status).toBe(200);
	const urls = [...body.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);
	expect(urls).toEqual(PUBLIC_PAGES.map(({ path }) => canonicalUrl(path)));
	expect(urls.some((url) => /\/login|\/api|\/admin|\/grades|\?/.test(url ?? ''))).toBe(false);
});

test('robots stays crawlable and advertises a sitemap only on the canonical host', async () => {
	for (const host of ['grademaxxing.app', 'new.grademaxxing.app']) {
		const response = await robots(
			eventFor(`https://${host}/robots.txt`) as Parameters<typeof robots>[0]
		);
		const body = await response.text();
		expect(response.status).toBe(200);
		expect(body).toContain('User-agent: *\nAllow: /');
		expect(body.includes(`Sitemap: ${SITE_ORIGIN}/sitemap.xml`)).toBe(host === 'grademaxxing.app');
		expect(body).not.toContain('Disallow: /');
	}
});
