import { expect, test } from '@playwright/test';

test('the private dashboard presents a responsive aggregate analytics workspace', async ({
	page
}) => {
	let signedIn = false;
	await page.route('**/api/admin/session', async (route) => {
		if (route.request().method() === 'POST') {
			signedIn = true;
			await route.fulfill({ status: 204 });
			return;
		}
		await route.fulfill({ status: 204 });
	});
	await page.route(/\/api\/admin\/usage(?:\?.*)?$/, (route) => {
		if (!signedIn) return route.fulfill({ status: 401 });
		const range = Number(new URL(route.request().url()).searchParams.get('range') ?? 30);
		return route.fulfill({
			status: 200,
			contentType: 'application/json',
			body: JSON.stringify({
				generatedAt: '2026-09-19T08:00:00.000Z',
				rangeDays: range,
				uniqueStudents: 18,
				activeStudents: 7,
				previousActiveStudents: 5,
				newStudents: 4,
				previousNewStudents: 2,
				returningStudents: 3,
				returningStudentsInRange: 2,
				activeToday: 2,
				trackingStartedAt: '2026-08-23T18:47:04.000Z',
				dailyTrackingStartedAt: '2026-09-19',
				lastActivityAt: '2026-09-19T07:58:00.000Z',
				users: [
					{
						studentKey: 'protected-student-key-001',
						firstSeenAt: '2026-08-23T18:47:04.000Z',
						lastSeenAt: '2026-09-19T07:58:00.000Z',
						activeDays: 4,
						activeInRange: true
					},
					{
						studentKey: 'protected-student-key-002',
						firstSeenAt: '2026-09-18T18:47:04.000Z',
						lastSeenAt: '2026-09-18T18:47:04.000Z',
						activeDays: 1,
						activeInRange: true
					},
					{
						studentKey: 'protected-student-key-003',
						firstSeenAt: '2026-08-30T18:47:04.000Z',
						lastSeenAt: '2026-09-17T18:47:04.000Z',
						activeDays: 2,
						activeInRange: true
					}
				],
				dailyUsage: Array.from({ length: range }, (_, index) => {
					const date = new Date(Date.UTC(2026, 8, 19 - (range - 1 - index)));
					return {
						date: date.toISOString().slice(0, 10),
						newStudents: index % 8 === 0 ? 1 : 0,
						activeStudents: (index * 3) % 8,
						totalStudents: 14 + Math.ceil(index / 8)
					};
				})
			})
		});
	});
	await page.goto('/admin');
	await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
	await page.getByLabel('Password').fill('test-only-admin-password');
	await page.getByRole('button', { name: 'Open dashboard' }).click();
	await expect(
		page.getByRole('heading', { name: /Good (morning|afternoon|evening), admin/ })
	).toBeVisible();
	await expect(page.locator('.hero-number-row > strong')).toHaveText('18');
	await expect(page.getByRole('heading', { name: 'Track your growth' })).toBeVisible();
	await expect(page.getByRole('heading', { name: 'Daily activity' })).toBeVisible();
	await expect(page.getByRole('heading', { name: 'Recent activity' })).toBeVisible();
	await expect(page.getByRole('heading', { name: 'Protected users' })).toBeVisible();
	await expect(page.getByText('protected-student-key-001')).toBeVisible();
	await expect(page.getByText('protected-student-key-003')).toBeVisible();
	await expect(page.getByText('Aggregate data only')).toBeVisible();
	await page.getByPlaceholder('Search protected key').fill('002');
	await expect(page.getByText('protected-student-key-002')).toBeVisible();
	await expect(page.getByText('protected-student-key-001')).toHaveCount(0);
	await page.getByPlaceholder('Search protected key').fill('');

	if (process.env.ADMIN_VISUAL_CAPTURE)
		await page.screenshot({
			path: '/tmp/grademaxxing-admin-reference-desktop.png',
			fullPage: true
		});
	await page.getByRole('button', { name: '7d' }).click();
	await expect(page.getByRole('button', { name: '7d' })).toHaveClass(/active/);

	await page.setViewportSize({ width: 390, height: 844 });
	await expect(page.locator('.hero-card')).toBeVisible();
	const overflow = await page.evaluate(
		() => document.documentElement.scrollWidth - window.innerWidth
	);
	expect(overflow).toBeLessThanOrEqual(1);
	if (process.env.ADMIN_VISUAL_CAPTURE)
		await page.screenshot({ path: '/tmp/grademaxxing-admin-reference-mobile.png', fullPage: true });
});
