import { expect, test } from '@playwright/test';

const ORIGIN = 'https://grademaxxing.app';
const PUBLIC_PATHS = ['/', '/login', '/privacy', '/glossary'] as const;
const MIRRORS = [
	['/', '/index.md'],
	['/login', '/login.md'],
	['/privacy', '/privacy.md'],
	['/glossary', '/glossary.md']
] as const;

test.describe('agent-readability files', () => {
	test('llms.txt follows the llmstxt.org format and every linked page resolves', async ({
		request
	}) => {
		const response = await request.get('/llms.txt');
		expect(response.status()).toBe(200);
		expect(response.headers()['content-type']).toContain('text/plain');
		const body = await response.text();
		expect(body).toMatch(/^# /m);
		expect(body).toMatch(/^> /m);
		expect(body).toContain('## Optional');
		const links = [...body.matchAll(/\]\((https:\/\/grademaxxing\.app[^)]+)\)/g)]
			.map((match) => match[1])
			.filter((url): url is string => Boolean(url));
		expect(links.length).toBeGreaterThan(4);
		for (const link of links) {
			const linked = await request.get(link.replace(ORIGIN, ''));
			expect(linked.status(), `${link} must be reachable`).toBe(200);
		}
	});

	test('llms-full.txt is available with the full documentation', async ({ request }) => {
		const response = await request.get('/llms-full.txt');
		expect(response.status()).toBe(200);
		expect(response.headers()['content-type']).toContain('text/plain');
		const body = await response.text();
		expect(body).toContain('# Grademaxxing');
		expect(body).toContain('https://grademaxxing.app/glossary');
	});

	test('sitemap.md lists the pages with headings and links', async ({ request }) => {
		const response = await request.get('/sitemap.md');
		expect(response.status()).toBe(200);
		const body = await response.text();
		expect(body).toMatch(/^# /m);
		expect(body).toMatch(/^## /m);
		expect(body).toContain('](https://grademaxxing.app/login)');
		expect(body).toContain('](https://grademaxxing.app/glossary)');
	});

	test('AGENTS.md is served with install, configuration, and usage guidance', async ({
		request
	}) => {
		const response = await request.get('/AGENTS.md');
		expect(response.status()).toBe(200);
		const body = await response.text();
		for (const heading of ['## Overview', '## Install', '## Configuration', '## Usage']) {
			expect(body, `AGENTS.md needs a ${heading} section`).toContain(heading);
		}
		expect(body).toContain('```sh');
		expect(body).toContain('## Out of scope');
	});

	test('sitemap.xml declares a lastmod for every URL', async ({ request }) => {
		const response = await request.get('/sitemap.xml');
		expect(response.status()).toBe(200);
		const body = await response.text();
		const urls = body.match(/<url>/g) ?? [];
		const lastmods = body.match(/<lastmod>\d{4}-\d{2}-\d{2}<\/lastmod>/g) ?? [];
		expect(urls.length).toBeGreaterThan(0);
		expect(lastmods.length).toBe(urls.length);
	});

	test('robots.txt allows all crawlers and is not blocking llms.txt', async ({ request }) => {
		const response = await request.get('/robots.txt');
		expect(response.status()).toBe(200);
		const body = await response.text();
		expect(body).toContain('User-agent: *');
		expect(body).toContain('Allow: /');
		expect(body).not.toMatch(/Disallow:\s*\/llms\.txt/);
	});
});

for (const path of PUBLIC_PATHS) {
	test(`${path} exposes canonical, og, JSON-LD, robots, and agent links`, async ({ page }) => {
		const response = await page.goto(path);
		expect(response?.status()).toBe(200);

		const canonical = `${ORIGIN}${path === '/' ? '/' : path}`;
		expect(await page.locator('link[rel="canonical"]').getAttribute('href')).toBe(canonical);

		const description = await page
			.locator('meta[name="description"]')
			.first()
			.getAttribute('content');
		expect(
			(description ?? '').length,
			'meta description must be at least 50 characters'
		).toBeGreaterThan(50);

		expect(await page.locator('meta[property="og:title"]').getAttribute('content')).toBeTruthy();
		expect(
			await page.locator('meta[property="og:description"]').getAttribute('content')
		).toBeTruthy();

		const robots = await page.locator('meta[name="robots"]').getAttribute('content');
		expect(robots).toContain('max-snippet:-1');
		expect(robots).toContain('max-image-preview:large');

		const alternate = page.locator('link[rel="alternate"][type="text/markdown"]');
		await expect(alternate).toHaveCount(1);
		expect(await alternate.getAttribute('href')).toBe(path === '/' ? '/index.md' : `${path}.md`);
		await expect(page.locator('link[rel="describedby"][href="/llms.txt"]')).toHaveCount(1);

		const jsonLd = await page.locator('script[type="application/ld+json"]').textContent();
		const parsed = JSON.parse(jsonLd ?? '{}') as Record<string, any>;
		const graph = (parsed['@graph'] ?? [parsed]) as Record<string, any>[];
		const [primary] = graph;
		expect(primary?.name).toBeTruthy();
		expect(primary?.description).toBeTruthy();
		expect(primary?.url).toBeTruthy();

		await expect(page.locator('a[href="/glossary"]').first()).toBeAttached();

		const linkHeader = response?.headers()['link'] ?? '';
		expect(linkHeader).toContain('rel="alternate"; type="text/markdown"');
		expect(linkHeader).toContain('rel="describedby"');
	});
}

test.describe('markdown mirrors', () => {
	for (const [path, mirror] of MIRRORS) {
		test(`${mirror} serves the Markdown mirror of ${path}`, async ({ request }) => {
			const response = await request.get(mirror);
			expect(response.status()).toBe(200);
			expect(response.headers()['content-type']).toContain('text/markdown');
			const body = await response.text();
			expect(body.startsWith('---')).toBe(true);
			expect(body).toMatch(/^# /m);
			expect(body).toContain('## Sitemap');
		});
	}

	test('Accept: text/markdown negotiates a mirror with Vary: Accept', async ({ request }) => {
		const response = await request.get('/login', {
			headers: { accept: 'text/markdown, text/html, */*' }
		});
		expect(response.status()).toBe(200);
		expect(response.headers()['content-type']).toContain('text/markdown');
		expect(response.headers()['vary']).toContain('Accept');
		expect(await response.text()).toContain('# Log In - Grademaxxing');

		const html = await request.get('/login');
		expect(html.headers()['content-type']).toContain('text/html');
		expect(html.headers()['vary']).toContain('Accept');
	});
});
