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
	let savedFeedback: { status?: string; adminReply?: string; adminNote?: string } = {};
	let failNextFeedbackSave = false;
	await page.route('**/api/admin/feedback', async (route) => {
		if (!signedIn) return route.fulfill({ status: 401 });
		if (route.request().method() === 'PATCH') {
			if (failNextFeedbackSave) {
				failNextFeedbackSave = false;
				return route.abort('failed');
			}
			savedFeedback = (await route.request().postDataJSON()) as typeof savedFeedback;
			return route.fulfill({ status: 204 });
		}
		return route.fulfill({
			status: 200,
			contentType: 'application/json',
			body: JSON.stringify({
				items: [
					{
						id: '0f143f0d-a034-48d6-8bb8-1d00c4a7e255',
						kind: 'Feature idea',
						message: 'Add a weekly grade summary',
						pagePath: '/feedback',
						appVersion: '0.2.0-beta.1',
						status: 'new',
						adminNote: '',
						adminReply: '',
						repliedAt: null,
						createdAt: '2026-09-19T08:00:00.000Z',
						updatedAt: '2026-09-19T08:00:00.000Z'
					}
				]
			})
		});
	});
	await page.goto('/admin');
	await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
	await page.getByLabel('Password').fill('test-only-admin-password');
	await page.getByRole('button', { name: 'Open dashboard' }).click();
	await expect(page.getByRole('heading', { name: 'Product overview' })).toBeVisible();
	await expect(page.getByText('Total students')).toBeVisible();
	await expect(page.getByRole('heading', { name: 'Daily active students' })).toBeVisible();
	await expect(page.getByRole('heading', { name: 'Protected user registry' })).toBeVisible();
	await expect(page.getByText('protected-student-key-001')).toBeVisible();
	await expect(page.getByText('protected-student-key-003')).toBeVisible();
	await page.getByPlaceholder('Search protected key').fill('002');
	await expect(page.getByText('protected-student-key-002')).toBeVisible();
	await expect(page.getByText('protected-student-key-001')).toHaveCount(0);
	await page.getByPlaceholder('Search protected key').fill('');
	await page.getByRole('button', { name: /Feedback/ }).click();
	await expect(page.getByRole('heading', { name: 'Feedback inbox' })).toBeVisible();
	await expect(
		page.locator('.message-bubble').getByText('Add a weekly grade summary')
	).toBeVisible();
	await page.getByLabel('Reply to Feature idea').fill('Great idea — this is now on the roadmap.');
	await expect(page.getByText('Great idea — this is now on the roadmap.')).toHaveCount(0);
	await page.getByLabel('Status for Feature idea').selectOption('planned');
	await expect.poll(() => savedFeedback.status).toBe('planned');
	expect(savedFeedback.adminReply).toBe('');
	await page.getByLabel('Private admin note').fill('Include in the next product pass.');
	await page.getByRole('button', { name: 'Save private note' }).click();
	await expect.poll(() => savedFeedback.adminNote).toBe('Include in the next product pass.');
	expect(savedFeedback.adminReply).toBe('');
	await page.getByRole('button', { name: 'Send reply' }).click();
	await expect
		.poll(() => savedFeedback.adminReply)
		.toBe('Great idea — this is now on the roadmap.');

	if (process.env.ADMIN_VISUAL_CAPTURE)
		await page.screenshot({
			path: '/tmp/grademaxxing-admin-reference-desktop.png',
			fullPage: true
		});
	if (process.env.ADMIN_VISUAL_CAPTURE) {
		await page.setViewportSize({ width: 390, height: 844 });
		await page.screenshot({
			path: '/tmp/grademaxxing-admin-feedback-mobile.png',
			fullPage: true
		});
		await page.setViewportSize({ width: 1280, height: 720 });
	}
	await page.getByLabel('Reply to Feature idea').fill('This should remain an unsent draft.');
	failNextFeedbackSave = true;
	await page.getByRole('button', { name: 'Update reply' }).click();
	await expect(page.getByRole('alert')).toContainText('offline');
	await expect(page.getByRole('button', { name: 'Update reply' })).toBeEnabled();
	await expect(
		page.locator('.message-bubble').getByText('This should remain an unsent draft.')
	).toHaveCount(0);
	await expect(
		page.locator('.message-bubble').getByText('Great idea — this is now on the roadmap.')
	).toBeVisible();
	await page.getByRole('button', { name: 'Overview' }).click();
	await page.getByRole('button', { name: '7 days' }).click();
	await expect(page.getByRole('button', { name: '7 days' })).toHaveClass(/active/);

	await page.setViewportSize({ width: 390, height: 844 });
	await expect(page.locator('.metrics-grid')).toBeVisible();
	const overflow = await page.evaluate(
		() => document.documentElement.scrollWidth - window.innerWidth
	);
	expect(overflow).toBeLessThanOrEqual(1);
	if (process.env.ADMIN_VISUAL_CAPTURE)
		await page.screenshot({ path: '/tmp/grademaxxing-admin-reference-mobile.png', fullPage: true });
});
