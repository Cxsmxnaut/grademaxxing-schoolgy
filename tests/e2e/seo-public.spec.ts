import { expect, test } from '@playwright/test';
import { load } from 'cheerio';
import { PUBLIC_PAGES, SITE_ORIGIN } from '../../src/lib/seo/public-pages';

for (const entry of PUBLIC_PAGES) {
	test(`${entry.path} serves substantive HTML and one canonical metadata owner`, async ({
		request
	}) => {
		const response = await request.get(`${entry.path}?utm_source=seo-verification`);
		expect(response.status()).toBe(200);
		const $ = load(await response.text());
		expect($('title')).toHaveLength(1);
		expect($('title').text()).toBe(entry.title);
		expect($('meta[name="description"]')).toHaveLength(1);
		expect($('meta[name="description"]').attr('content')).toBe(entry.description);
		expect($('link[rel="canonical"]')).toHaveLength(1);
		expect($('link[rel="canonical"]').attr('href')).toBe(`${SITE_ORIGIN}${entry.path}`);
		expect($('meta[property="og:url"]').attr('content')).toBe(`${SITE_ORIGIN}${entry.path}`);
		expect($('meta[property="og:image"]').attr('content')).toMatch(
			/^https:\/\/grademaxxing\.app\/og\/.+\.png$/
		);
		expect($('h1')).toHaveLength(1);
		expect($('main').text().trim().split(/\s+/).length).toBeGreaterThan(60);
		const schemas = $('script[type="application/ld+json"]');
		expect(schemas).toHaveLength(1);
		const graph = JSON.parse(schemas.first().html() ?? '{}')['@graph'];
		expect(graph.some((item: Record<string, unknown>) => item['@type'] === 'WebPage')).toBe(true);
		expect(response.headers()['cache-control']).toContain('no-store');
		expect(response.headers()['content-security-policy']).toContain("default-src 'self'");
	});
}

test('sitemap corresponds to real public 200 routes and excludes sign-in and private routes', async ({
	request
}) => {
	const response = await request.get('/sitemap.xml');
	expect(response.status()).toBe(200);
	const $ = load(await response.text(), { xmlMode: true });
	const urls = $('loc')
		.map((_, element) => $(element).text())
		.get();
	expect(urls).toEqual(PUBLIC_PAGES.map(({ path }) => `${SITE_ORIGIN}${path}`));
	expect(new Set(urls).size).toBe(urls.length);
	expect(urls).not.toContain(`${SITE_ORIGIN}/login`);
	const robots = await request.get('/robots.txt');
	expect(robots.status()).toBe(200);
	expect(await robots.text()).toContain('User-agent: *\nAllow: /');
});

test('anonymous private shells, APIs, admin and errors retain noindex/status semantics', async ({
	request
}) => {
	for (const path of [
		'/login',
		'/grades',
		'/grades/0',
		'/gpa-calculator',
		'/migrate/import',
		'/api/health'
	]) {
		const response = await request.get(path);
		expect(response.headers()['x-robots-tag'], path).toContain('noindex');
		expect(response.headers()['cache-control'], path).toContain('no-store');
	}
	const noSession = await request.get('/api/studentvue/gradebook');
	expect(noSession.status()).toBe(401);
	expect(noSession.headers()['x-robots-tag']).toContain('noindex');
	const unknown = await request.get('/seo-verification-page-that-does-not-exist');
	expect(unknown.status()).toBe(404);
	expect(unknown.headers()['x-robots-tag']).toContain('noindex');
	const admin = await request.get('/admin', { maxRedirects: 0 });
	expect(admin.status()).toBe(302);
	expect(admin.headers()['x-robots-tag']).toContain('noindex');
});

test('client navigation leaves one description/canonical/schema after changing public tools', async ({
	page
}) => {
	await page.goto('/calculators');
	await page
		.getByRole('link', { name: /final grade|final exam/i })
		.first()
		.click();
	await expect(page).toHaveURL(/\/calculators\/final-grade$/);
	await expect(page.locator('head meta[name="description"]')).toHaveCount(1);
	await expect(page.locator('head link[rel="canonical"]')).toHaveCount(1);
	await expect(page.locator('head script[type="application/ld+json"]')).toHaveCount(1);
});
