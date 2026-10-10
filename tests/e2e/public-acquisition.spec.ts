import { expect, test } from '@playwright/test';

test('a fresh public visit avoids app utilities and optional app font/toast assets', async ({
	page
}) => {
	const assets: string[] = [];
	page.on('request', (request) => assets.push(new URL(request.url()).pathname));
	await page.goto('/', { waitUntil: 'networkidle' });
	expect(
		assets.some(
			(path) =>
				path.includes('app-utilities') ||
				path.includes('AppEnhancements') ||
				path.includes('jetbrains-mono')
		)
	).toBe(false);
	await page.goto('/calculators/assignment-impact', { waitUntil: 'networkidle' });
	expect(
		assets.some(
			(path) =>
				path.includes('app-utilities') ||
				path.includes('AppEnhancements') ||
				path.includes('jetbrains-mono')
		)
	).toBe(false);
});

test('anonymous public visits do not bootstrap a StudentVUE session and send only bounded aggregate events', async ({
	page
}) => {
	const requests: string[] = [];
	const events: Record<string, unknown>[] = [];
	page.on('request', (request) => requests.push(new URL(request.url()).pathname));
	await page.route('**/api/public-analytics', async (route) => {
		events.push(route.request().postDataJSON() as Record<string, unknown>);
		await route.fulfill({ status: 204 });
	});
	await page.goto('/');
	await expect.poll(() => events.length).toBeGreaterThan(0);
	await page.goto('/calculators/final-grade');
	await expect
		.poll(() =>
			events.some(
				(event) => event.event === 'page_view' && event.path === '/calculators/final-grade'
			)
		)
		.toBe(true);
	const numberInput = page.locator('input[type="number"]').first();
	await numberInput.fill('83.27');
	await numberInput.press('Tab');
	await expect.poll(() => events.some((event) => event.event === 'tool_used')).toBe(true);
	for (const event of events) {
		expect(Object.keys(event).sort()).toEqual(['channel', 'event', 'path']);
		expect(['page_view', 'tool_used', 'connection_start']).toContain(event.event);
		expect(['direct', 'other', 'google', 'bing', 'chatgpt', 'perplexity', 'copilot']).toContain(
			event.channel
		);
		expect(JSON.stringify(event)).not.toContain('83.27');
	}
	expect(
		requests.some((path) => path.startsWith('/api/session') || path.startsWith('/api/studentvue'))
	).toBe(false);
});

for (const preference of ['doNotTrack', 'globalPrivacyControl']) {
	test(`${preference} prevents public aggregate requests`, async ({ page }) => {
		await page.addInitScript(
			(name) =>
				Object.defineProperty(navigator, name, { get: () => (name === 'doNotTrack' ? '1' : true) }),
			preference
		);
		const events: string[] = [];
		page.on('request', (request) => {
			if (new URL(request.url()).pathname === '/api/public-analytics') events.push(request.url());
		});
		await page.goto('/calculators/final-grade', { waitUntil: 'networkidle' });
		await page.locator('input[type="number"]').first().fill('84.19');
		await page.locator('input[type="number"]').first().press('Tab');
		await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
		expect(events).toEqual([]);
	});
}

test('aggregate endpoint rejects private paths, input values and oversized payloads', async ({
	request,
	baseURL
}) => {
	const headers = { Origin: baseURL! };
	for (const data of [
		{ event: 'page_view', path: '/grades', channel: 'direct' },
		{ event: 'tool_used', path: '/calculators/final-grade', channel: 'direct', score: 83.27 },
		{ event: 'tool_used', path: '/calculators/final-grade/', channel: 'direct' }
	]) {
		const response = await request.post('/api/public-analytics', { headers, data });
		expect(response.status()).toBe(400);
	}
	const oversized = await request.post('/api/public-analytics', {
		headers,
		data: { value: 'x'.repeat(600) }
	});
	expect(oversized.status()).toBe(413);
	const accepted = await request.post('/api/public-analytics', {
		headers,
		data: { event: 'page_view', path: '/', channel: 'direct' }
	});
	expect(accepted.status()).toBe(204);
});
