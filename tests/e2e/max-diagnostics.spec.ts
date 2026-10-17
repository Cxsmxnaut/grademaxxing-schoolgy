import { expect, test } from '@playwright/test';

for (const mobile of [false, true])
	test(`Max diagnostics filters, inspects and clears synthetic records on ${mobile ? 'phone' : 'desktop'}`, async ({
		page
	}) => {
		if (mobile) await page.setViewportSize({ width: 390, height: 844 });
		await page.route('**/api/admin/session', (route) =>
			route.fulfill({
				json: {
					authenticated: true,
					user: {
						username: 'synthetic-operator',
						displayName: 'Synthetic Operator',
						role: 'Administrator'
					}
				}
			})
		);
		let cleared = false,
			deleteCount = 0;
		const requests: string[] = [];
		await page.route(/\/api\/admin\/max(?:\?.*)?$/, (route) => {
			if (route.request().method() === 'DELETE') {
				cleared = true;
				deleteCount++;
				return route.fulfill({ status: 204 });
			}
			requests.push(route.request().url());
			return route.fulfill({
				json: {
					items: cleared
						? []
						: [
								{
									id: '11111111-1111-4111-8111-111111111111',
									createdAt: Date.now(),
									action: 'chat',
									topic: 'gpa',
									status: 'failed',
									question: 'Synthetic question: what is my GPA? <img src=x>',
									durationMs: 850,
									firstTokenMs: null,
									tokenFrames: 0,
									outputChars: 0,
									provider: null,
									model: null,
									errorCode: 'PoolExhaustedError',
									flags: ['empty_provider_reply'],
									reportedReason: 'empty',
									events: [
										{
											ms: 850,
											type: 'provider',
											name: 'groq',
											model: 'synthetic-model',
											outcome: 'rate_limit',
											status: 429,
											durationMs: 850
										}
									]
								}
							],
					nextBefore: null,
					retentionDays: 7,
					totals: {
						requests: cleared ? 0 : 1,
						failed: cleared ? 0 : 1,
						flagged: cleared ? 0 : 1,
						reported: cleared ? 0 : 1
					}
				}
			});
		});
		await page.goto('/admin-app/max');
		await expect(
			page.getByRole('heading', { name: 'Max AI diagnostics', exact: true })
		).toBeVisible();
		await expect(page.getByText('Synthetic question:', { exact: false }).first()).toBeVisible();
		await page.getByRole('checkbox', { name: 'Show issues only' }).check();
		await expect.poll(() => requests.some((url) => url.includes('issues=1'))).toBe(true);
		await page.getByRole('button', { name: 'Inspect', exact: true }).click();
		await expect(page.getByText('Request timeline', { exact: true })).toBeVisible();
		await expect(page.getByText(/HTTP 429/)).toBeVisible();
		await expect(page.getByText('PoolExhaustedError', { exact: true })).toBeVisible();
		await expect(page.locator('table img')).toHaveCount(0);
		await expect(page.getByText(/Reply text is not stored/)).toBeVisible();
		await page.getByRole('button', { name: 'Clear diagnostics', exact: true }).click();
		expect(deleteCount).toBe(0);
		await page
			.getByRole('button', { name: 'Confirm: delete all diagnostics', exact: true })
			.click();
		await expect(page.getByText('No matching Max requests yet.')).toBeVisible();
		expect(deleteCount).toBe(1);
		const overflow = await page.evaluate(
			() => document.documentElement.scrollWidth > window.innerWidth
		);
		expect(overflow).toBe(false);
	});

test('Max diagnostics shows a recoverable storage error', async ({ page }) => {
	await page.route('**/api/admin/session', (route) =>
		route.fulfill({
			json: {
				authenticated: true,
				user: {
					username: 'synthetic-operator',
					displayName: 'Synthetic Operator',
					role: 'Administrator'
				}
			}
		})
	);
	await page.route('**/api/admin/max?*', (route) =>
		route.fulfill({ status: 503, json: { message: 'Unavailable' } })
	);
	await page.goto('/admin-app/max');
	await expect(page.getByRole('alert')).toContainText('Diagnostics are unavailable');
	await expect(page.getByRole('button', { name: 'Refresh', exact: true })).toBeEnabled();
});
