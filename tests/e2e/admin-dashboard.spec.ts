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
	await page.route('**/api/admin/usage', (route) => {
		if (!signedIn) return route.fulfill({ status: 401 });
		return route.fulfill({
			status: 200,
			contentType: 'application/json',
			body: JSON.stringify({
				uniqueStudents: 18,
				activeStudentsLast30Days: 7,
				newStudentsLast30Days: 4,
				dailyNewStudents: Array.from({ length: 30 }, (_, index) => ({
					date: `2026-09-${String(index + 1).padStart(2, '0')}`,
					count: index % 8 === 0 ? 1 : 0
				}))
			})
		});
	});
	await page.goto('/admin');
	await expect(page.getByRole('heading', { name: 'Beta usage' })).toBeVisible();
	await page.getByLabel('Administrator password').fill('test-only-admin-password');
	await page.getByRole('button', { name: 'Open dashboard' }).click();
	await expect(page.getByText('18', { exact: true })).toBeVisible();
	await expect(page.getByText('7', { exact: true })).toBeVisible();
	await expect(page.getByText('4', { exact: true })).toBeVisible();
	await expect(page.getByRole('heading', { name: 'New students by day' })).toBeVisible();
	await expect(
		page.getByRole('img', { name: 'New unique students per day for the last thirty days' })
	).toBeVisible();
});
