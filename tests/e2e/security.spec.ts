import { expect, test } from '@playwright/test';

test('security headers protect pages and private APIs', async ({ request }) => {
	const pageResponse = await request.get('/login');
	expect(pageResponse.status()).toBe(200);
	expect(pageResponse.headers()['content-security-policy']).toContain("default-src 'self'");
	expect(pageResponse.headers()['x-content-type-options']).toBe('nosniff');
	expect(pageResponse.headers()['x-frame-options']).toBe('DENY');
	expect(pageResponse.headers()['referrer-policy']).toBe('no-referrer');
	expect(pageResponse.headers()['permissions-policy']).toContain('camera=()');
	expect(pageResponse.headers()['x-request-id']).toMatch(/^[0-9a-f-]{36}$/i);
	expect(pageResponse.headers()['server-timing']).toMatch(/^app;dur=\d+(?:\.\d)?$/);
	expect(pageResponse.headers()['cache-control']).toContain('no-store');

	const apiResponse = await request.get('/api/studentvue/gradebook');
	expect(apiResponse.status()).toBe(401);
	expect(apiResponse.headers()['cache-control']).toContain('no-store');
	expect(apiResponse.headers()['pragma']).toBe('no-cache');
});

test('cross-site and malformed session requests are rejected before authentication', async ({
	request,
	baseURL
}) => {
	const crossSite = await request.post('/api/session', {
		headers: { Origin: 'https://attacker.invalid', 'Content-Type': 'application/json' },
		data: { domain: 'example.invalid', username: 'nobody', password: 'invalid' }
	});
	expect(crossSite.status()).toBe(403);

	const wrongType = await request.post('/api/session', {
		headers: { Origin: new URL(baseURL!).origin, 'Content-Type': 'text/plain' },
		data: '{}'
	});
	// SvelteKit's built-in CSRF layer may reject form-like content before our
	// application/json-only guard gets the opportunity to return 415.
	expect([403, 415]).toContain(wrongType.status());

	const oversized = await request.post('/api/session', {
		headers: { Origin: new URL(baseURL!).origin, 'Content-Type': 'application/json' },
		data: { domain: 'x'.repeat(33 * 1024), username: 'nobody', password: 'invalid' }
	});
	expect(oversized.status()).toBe(413);
});

test('health and unknown-resource behavior are deterministic', async ({ request }) => {
	const health = await request.get('/api/health');
	expect(health.status()).toBe(200);
	expect(await health.json()).toEqual({ status: 'ok' });
	expect(health.headers()['cache-control']).toContain('no-store');

	const unknown = await request.get('/api/studentvue/not-a-resource');
	expect(unknown.status()).toBe(404);

	const logout = await request.delete('/api/session');
	expect(logout.status()).toBe(204);
	expect(logout.headers()['clear-site-data']).toBe('"cache", "cookies", "storage"');
});

test('sign-in rejects unsafe district destinations before making an upstream request', async ({
	request,
	baseURL
}) => {
	const origin = new URL(baseURL!).origin;
	for (const domain of [
		'http://ca-example-psv.edupoint.com',
		'https://user:secret@ca-example-psv.edupoint.com',
		'https://ca-example-psv.edupoint.com.evil.test',
		'https://ca-example-psv.edupoint.com:8443'
	]) {
		const response = await request.post('/api/session', {
			headers: { Origin: origin, 'Content-Type': 'application/json' },
			data: { domain, username: 'security-test', password: 'invalid' }
		});
		expect(response.status(), domain).toBe(400);
	}
});
