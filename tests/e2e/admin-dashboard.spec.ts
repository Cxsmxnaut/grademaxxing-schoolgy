import { expect, test } from '@playwright/test';

test('the private dashboard presents aggregate usage cards and a growth chart', async ({
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
				activeToday: 2,
				trackingStartedAt: '2026-08-23T18:47:04.000Z',
				lastActivityAt: '2026-09-19T07:58:00.000Z',
				dailyUsage: Array.from({ length: range }, (_, index) => ({
					date: `2026-09-${String(index + 1).padStart(2, '0')}`,
					newStudents: index % 8 === 0 ? 1 : 0,
					activeStudents: index % 4,
					totalStudents: 14 + Math.ceil(index / 8)
				}))
			})
		});
	});
	await page.goto('/admin');
	await expect(page.getByRole('heading', { name: 'Enter command center' })).toBeVisible();
	await page.getByLabel('Administrator password').fill('test-only-admin-password');
	await page.getByRole('button', { name: 'Open dashboard' }).click();
	await expect(page.getByRole('heading', { name: 'Command center', exact: true })).toBeVisible();
	await expect(
		page.locator('#overview .metric-card').filter({ hasText: 'Total students' }).getByText('18')
	).toBeVisible();
	await expect(
		page.locator('#overview .metric-card').filter({ hasText: 'Active students' }).getByText('7')
	).toBeVisible();
	await expect(
		page.locator('#overview .metric-card').filter({ hasText: 'New students' }).getByText('4')
	).toBeVisible();
	await expect(page.getByRole('heading', { name: 'Daily product pulse' })).toBeVisible();
	await expect(page.getByRole('img', { name: 'Daily student usage trend' })).toBeVisible();
	await expect(page.getByRole('heading', { name: 'Engagement pulse' })).toBeVisible();
	await expect(page.getByRole('heading', { name: 'New student velocity' })).toBeVisible();
	await expect(page.getByRole('heading', { name: 'Activity intensity' })).toBeVisible();
	await page.getByRole('button', { name: '7D' }).click();
	await expect(page.getByText('Past 7 days')).toBeVisible();
});
