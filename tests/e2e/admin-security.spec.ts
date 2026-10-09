import { expect, test } from '@playwright/test';

for (const unavailable of ['usage', 'feedback']) {
	test(`dashboard keeps healthy panels usable when ${unavailable} is unavailable and recovers`, async ({
		page
	}) => {
		let failed = true;
		await page.route('**/api/admin/session', (route) =>
			route.fulfill({
				json: {
					authenticated: true,
					user: { username: 'operator', displayName: 'Test Operator', role: 'Administrator' }
				}
			})
		);
		await page.route('**/api/admin/usage?*', (route) =>
			failed && unavailable === 'usage'
				? route.fulfill({ status: 503, json: { message: 'Usage storage unavailable.' } })
				: route.fulfill({
						json: {
							generatedAt: '2026-10-08T12:00:00Z',
							rangeDays: 30,
							uniqueStudents: 18,
							activeStudents: 1,
							previousActiveStudents: 1,
							newStudents: 0,
							previousNewStudents: 0,
							returningStudents: 0,
							returningStudentsInRange: 0,
							activeToday: 1,
							trackingStartedAt: null,
							dailyTrackingStartedAt: null,
							lastActivityAt: null,
							dailyUsage: [],
							users: []
						}
					})
		);
		await page.route('**/api/admin/feedback', (route) =>
			failed && unavailable === 'feedback'
				? route.fulfill({ status: 503, json: { message: 'Feedback storage unavailable.' } })
				: route.fulfill({
						json: {
							items: [
								{
									id: 'synthetic-feedback',
									kind: 'Bug report',
									message: 'Synthetic feedback remains visible',
									status: 'new',
									createdAt: '2026-10-08T12:00:00Z'
								}
							]
						}
					})
		);
		await page.route('**/api/health', (route) => route.fulfill({ json: { status: 'ok' } }));
		await page.goto('/admin-app/');
		await expect(page.getByRole('alert')).toContainText('storage unavailable');
		await expect(page.getByRole('status', { name: 'Loading usage chart' })).toHaveCount(0);
		await expect(page.getByText('API health', { exact: true }).locator('..')).toContainText('ok');
		const total = page
			.getByText('Total students', { exact: true })
			.locator('..')
			.getByRole('heading');
		if (unavailable === 'usage') {
			await expect(page.getByText('Usage chart unavailable. Try refreshing.')).toBeVisible();
			await expect(page.getByText('Synthetic feedback remains visible')).toBeVisible();
		} else {
			await expect(total).toHaveText('18');
		}
		failed = false;
		await page.getByRole('button', { name: 'Refresh', exact: true }).click();
		await expect(page.getByRole('alert')).toHaveCount(0);
		await expect(total).toHaveText('18');
		await expect(page.getByText('Synthetic feedback remains visible')).toBeVisible();
		await expect(page.getByText('Usage chart unavailable. Try refreshing.')).toHaveCount(0);
		await page.getByRole('button', { name: 'Switch to dark theme' }).click();
		await expect(page.locator('html')).toHaveAttribute('data-color-scheme', 'dark');
		await page.getByRole('button', { name: 'Switch to light theme' }).click();
		await expect(page.locator('html')).toHaveAttribute('data-color-scheme', 'light');
	});
}

test('configured admin login persists after reload and sign-out removes access', async ({
	page,
	baseURL
}) => {
	test.skip(
		process.env.GRADEMAXXING_RELEASE_TEST_ADMIN !== '1',
		'Requires the release harness synthetic administrator.'
	);
	expect(['127.0.0.1', 'localhost']).toContain(new URL(baseURL!).hostname);
	await page.goto('/admin-app/profile');
	await page.getByLabel('Username').fill('release-test-operator');
	await page.getByLabel(/^Password/).fill('synthetic-release-admin-password');
	await page.getByRole('button', { name: 'Open dashboard' }).click();
	await expect(page.getByRole('heading', { name: 'Profile', exact: true })).toBeVisible({
		timeout: 3000
	});
	const cookie = (await page.context().cookies()).find(
		(cookie) => cookie.name === '__Host-grademaxxing_admin'
	);
	expect(cookie).toMatchObject({ secure: true, httpOnly: true, path: '/', sameSite: 'Strict' });
	await page.reload();
	await expect(page.getByRole('heading', { name: 'Profile', exact: true })).toBeVisible();
	await page.getByRole('button', { name: 'Open user menu' }).click();
	await page.getByRole('button', { name: 'Sign out', exact: true }).click();
	await expect(page.getByRole('heading', { name: 'Sign In' })).toBeVisible();
	expect(await (await page.request.get('/api/admin/session')).json()).toEqual({
		authenticated: false
	});
});

test('admin sign-in stays usable when browser storage is blocked', async ({ page }) => {
	const errors: string[] = [];
	page.on('pageerror', (error) => errors.push(error.message));
	await page.addInitScript(() =>
		Object.defineProperty(window, 'localStorage', {
			get() {
				throw new DOMException('Storage disabled', 'SecurityError');
			}
		})
	);
	await page.route('**/api/admin/session', (route) =>
		route.fulfill({ json: { authenticated: false } })
	);
	await page.goto('/admin-app/');
	await expect(page.getByRole('heading', { name: 'Sign In' })).toBeVisible({ timeout: 2000 });
	await page.getByRole('button', { name: 'Show password' }).click();
	await expect(page.getByLabel(/^Password/)).toHaveAttribute('type', 'text');
	expect(errors).toEqual([]);
});

test('a failed sign-in confirmation shows an error and can be retried', async ({ page }) => {
	let signedIn = false;
	let failConfirmation = true;
	await page.route('**/api/admin/session', (route) => {
		if (route.request().method() === 'POST') {
			signedIn = true;
			return route.fulfill({ status: 204 });
		}
		if (signedIn && failConfirmation) {
			failConfirmation = false;
			return route.abort('failed');
		}
		return route.fulfill({
			json: signedIn
				? {
						authenticated: true,
						user: { username: 'operator', displayName: 'Test Operator', role: 'Administrator' }
					}
				: { authenticated: false }
		});
	});
	await page.goto('/admin-app/profile');
	await page.getByLabel('Username').fill('operator');
	await page.getByLabel(/^Password/).fill('synthetic-password');
	await page.getByRole('button', { name: 'Open dashboard' }).click();
	await expect(page.getByRole('alert')).toContainText('offline', { timeout: 2000 });
	await page.getByLabel(/^Password/).fill('synthetic-password');
	await page.getByRole('button', { name: 'Open dashboard' }).click();
	await expect(page.getByRole('heading', { name: 'Profile', exact: true })).toBeVisible();
});

test('phone and tablet navigation stays reachable and closes after selecting a page', async ({
	page
}) => {
	await page.route('**/api/admin/session', (route) =>
		route.fulfill({
			json: {
				authenticated: true,
				user: { username: 'operator', displayName: 'Test Operator', role: 'Administrator' }
			}
		})
	);
	await page.route('**/api/admin/feedback', (route) => route.fulfill({ json: { items: [] } }));
	for (const width of [390, 1100]) {
		await page.setViewportSize({ width, height: 844 });
		await page.goto('/admin-app/profile');
		await expect(page.getByRole('heading', { name: 'Profile', exact: true })).toBeVisible();
		await expect(page.getByRole('button', { name: 'Toggle sidebar' })).toBeVisible();
		// Closed navigation must be absent from the accessibility/focus tree.
		await expect(page.getByRole('link', { name: 'Feedback', exact: true })).toHaveCount(0);
		await page.getByRole('button', { name: 'Toggle sidebar' }).click();
		await page.getByRole('link', { name: 'Feedback', exact: true }).click();
		await expect(page.getByRole('heading', { name: 'Feedback inbox' })).toBeVisible();
		const title = await page.getByRole('heading', { name: 'Feedback inbox' }).boundingBox();
		expect(title).not.toBeNull();
		expect(title!.x + title!.width).toBeLessThanOrEqual(width);
		await expect(page.getByRole('link', { name: 'Feedback', exact: true })).toHaveCount(0);
		await expect
			.poll(() =>
				page.locator('aside').evaluate((sidebar) => sidebar.getBoundingClientRect().right)
			)
			.toBeLessThanOrEqual(0);
		await expect
			.poll(() => page.evaluate(() => document.documentElement.scrollWidth))
			.toBeLessThanOrEqual(width);
	}
});

test('admin deep links serve a protected shell and unrelated prefix routes stay missing', async ({
	request
}) => {
	const redirect = await request.get('/admin', { maxRedirects: 0 });
	expect(redirect.status()).toBe(302);
	expect(new URL(redirect.headers()['location']!).pathname).toBe('/admin-app/');
	for (const path of ['/admin-app/', '/admin-app/profile', '/admin-app/feedback']) {
		const response = await request.get(path);
		expect(response.status(), path).toBe(200);
		expect(response.headers()['content-security-policy']).toContain("script-src 'self'");
		expect(response.headers()['cache-control']).toContain('no-store');
	}
	expect((await request.get('/admin-app-unrelated')).status()).toBe(404);
	expect((await request.get('/api/admin/usage')).status()).toBe(401);
	expect(await (await request.get('/api/admin/session')).json()).toEqual({ authenticated: false });
});

test('password reveal works with the keyboard and failed sign-out keeps the session visible', async ({
	page
}) => {
	let signedIn = false;
	let failSignOut = true;
	await page.route('**/api/admin/session', async (route) => {
		if (route.request().method() === 'DELETE') {
			if (failSignOut) return route.abort('failed');
			signedIn = false;
			return route.fulfill({ status: 204 });
		}
		if (route.request().method() === 'POST') {
			signedIn = true;
			return route.fulfill({ status: 204 });
		}
		return route.fulfill({
			json: signedIn
				? {
						authenticated: true,
						user: { username: 'operator', displayName: 'Test Operator', role: 'Administrator' }
					}
				: { authenticated: false }
		});
	});
	await page.goto('/admin-app/profile');
	await expect(page.getByRole('heading', { name: 'Sign In' })).toBeVisible();
	await expect
		.poll(() =>
			page
				.locator('img[alt="grid"]')
				.first()
				.evaluate((image) => (image as HTMLImageElement).naturalWidth)
		)
		.toBeGreaterThan(0);
	await page.getByLabel('Username', { exact: false }).fill('operator');
	await page.getByLabel(/^Password/).fill('synthetic-password');
	await page.getByRole('button', { name: 'Show password' }).focus();
	await page.keyboard.press('Enter');
	await expect(page.getByLabel(/^Password/)).toHaveAttribute('type', 'text');
	await page.getByRole('button', { name: 'Hide password' }).click();
	await expect(page.getByLabel(/^Password/)).toHaveAttribute('type', 'password');
	await page.getByRole('button', { name: 'Open dashboard' }).click();
	await expect(page.getByRole('heading', { name: 'Profile', exact: true })).toBeVisible();
	await page.getByRole('button', { name: 'Open user menu' }).click();
	await page.getByRole('button', { name: 'Sign out', exact: true }).click();
	await expect(page.getByRole('alert')).toContainText('session is still active');
	await expect(page.getByRole('heading', { name: 'Profile', exact: true })).toBeVisible();
	failSignOut = false;
	await page.getByRole('button', { name: 'Sign out', exact: true }).click();
	await expect(page.getByRole('heading', { name: 'Sign In' })).toBeVisible();
});

test('a late dashboard refresh cannot overwrite a newer range selection', async ({ page }) => {
	await page.route('**/api/admin/session', (route) =>
		route.fulfill({
			json: {
				authenticated: true,
				user: { username: 'operator', displayName: 'Test Operator', role: 'Administrator' }
			}
		})
	);
	await page.route('**/api/admin/feedback', (route) => route.fulfill({ json: { items: [] } }));
	let slowRefresh = false;
	let finishSlow!: () => void;
	let sevenDayReads = 0;
	await page.route('**/api/admin/usage?*', async (route) => {
		const range = Number(new URL(route.request().url()).searchParams.get('range'));
		if (range === 7) sevenDayReads++;
		if (range === 30 && slowRefresh)
			await new Promise<void>((resolve) => {
				finishSlow = resolve;
			});
		await route.fulfill({
			json: {
				generatedAt: '2026-10-08T12:00:00Z',
				rangeDays: range,
				uniqueStudents: range,
				activeStudents: 1,
				previousActiveStudents: 1,
				newStudents: 0,
				previousNewStudents: 0,
				returningStudents: 0,
				returningStudentsInRange: 0,
				activeToday: 1,
				trackingStartedAt: null,
				dailyTrackingStartedAt: null,
				lastActivityAt: null,
				dailyUsage: [],
				users: []
			}
		});
	});
	await page.goto('/admin-app/?range=30');
	const total = page
		.getByText('Total students', { exact: true })
		.locator('..')
		.getByRole('heading');
	await expect(total).toHaveText('30');
	await page.getByRole('tab', { name: '30 days', exact: true }).click();
	await expect(page.getByRole('button', { name: 'Refresh', exact: true })).toBeEnabled({
		timeout: 1000
	});
	slowRefresh = true;
	await page.getByRole('button', { name: 'Refresh', exact: true }).click();
	await expect.poll(() => Boolean(finishSlow)).toBe(true);
	await page.getByRole('tab', { name: '7 days', exact: true }).click();
	await expect(total).toHaveText('7');
	const completed = page.waitForResponse((response) =>
		response.url().includes('/api/admin/usage?range=30')
	);
	finishSlow();
	await completed;
	await expect(total).toHaveText('7');
	expect(sevenDayReads).toBe(1);
});
