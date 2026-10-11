import { expect, test } from '@playwright/test';

test('the operations console presents sign-in, analytics, feedback, referrals and user registry', async ({
	page
}) => {
	let signedIn = false;
	await page.route('**/api/admin/session', async (route) => {
		const method = route.request().method();
		if (method === 'POST') {
			signedIn = true;
			await route.fulfill({ status: 204 });
			return;
		}
		if (method === 'DELETE') {
			signedIn = false;
			await route.fulfill({ status: 204 });
			return;
		}
		await route.fulfill({
			status: 200,
			contentType: 'application/json',
			body: JSON.stringify(
				signedIn
					? {
							authenticated: true,
							user: {
								username: 'bhavith lolakapuri',
								displayName: 'Bhavith Lolakapuri',
								role: 'Super Admin'
							}
						}
					: { authenticated: false }
			)
		});
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
						activeInRange: false
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
	let sentReply = '';
	let sentReplyCount = 0;
	let failNextFeedbackSave = false;
	await page.route(/\/api\/admin\/feedback\/[0-9a-f-]+\/messages$/, async (route) => {
		if (!signedIn) return route.fulfill({ status: 401 });
		if (failNextFeedbackSave) {
			failNextFeedbackSave = false;
			return route.abort('failed');
		}
		sentReply = ((await route.request().postDataJSON()) as { message: string }).message;
		return route.fulfill({
			status: 201,
			contentType: 'application/json',
			body: JSON.stringify({
				id: `reply-${++sentReplyCount}`,
				sender: 'admin',
				message: sentReply,
				createdAt: '2026-09-19T09:00:00.000Z'
			})
		});
	});
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
						appVersion: '0.2.0',
						status: 'new',
						adminNote: '',
						adminReply: '',
						repliedAt: null,
						createdAt: '2026-09-19T08:00:00.000Z',
						updatedAt: '2026-09-19T08:00:00.000Z',
						messages: [
							{
								id: 'original',
								sender: 'student',
								message: 'Add a weekly grade summary',
								createdAt: '2026-09-19T08:00:00.000Z'
							}
						]
					}
				]
			})
		});
	});
	const referralPartners: Array<{
		id: string;
		code: string;
		firstName: string;
		lastName: string;
		email: string;
		createdAt: string;
		active: boolean;
		referrals: number;
		lastReferralAt: string | null;
	}> = [
		{
			id: 'partner-1',
			code: 'maya',
			firstName: 'Maya',
			lastName: 'Chen',
			email: 'maya@example.com',
			createdAt: '2026-09-19T08:00:00.000Z',
			active: true,
			referrals: 5,
			lastReferralAt: '2026-09-20T08:00:00.000Z'
		}
	];
	await page.route('**/api/admin/referrals', async (route) => {
		if (!signedIn) return route.fulfill({ status: 401 });
		if (route.request().method() === 'POST') {
			const input = (await route.request().postDataJSON()) as {
				firstName: string;
				lastName: string;
				email: string;
			};
			const partner = {
				id: 'partner-2',
				code: 'jordan',
				...input,
				createdAt: '2026-09-20T09:00:00.000Z',
				active: true,
				referrals: 0,
				lastReferralAt: null
			};
			referralPartners.push(partner);
			return route.fulfill({
				status: 201,
				contentType: 'application/json',
				body: JSON.stringify({ partner })
			});
		}
		return route.fulfill({
			status: 200,
			contentType: 'application/json',
			body: JSON.stringify({ partners: referralPartners })
		});
	});

	// Sign-in gate
	await page.goto('/admin-app/');
	await expect(page.getByRole('heading', { name: 'Sign In' })).toBeVisible();
	await page.getByLabel('Username').fill('bhavith lolakapuri');
	await page.getByLabel(/^Password/).fill('synthetic-admin-password');
	await page.getByRole('button', { name: 'Open dashboard' }).click();

	// Overview dashboard
	await expect(page.getByRole('heading', { name: 'Product overview' })).toBeVisible();
	await expect(page.getByText('Total students')).toBeVisible();
	await expect(page.getByRole('heading', { name: 'Daily student activity' })).toBeVisible();
	await expect(page.getByRole('heading', { name: 'Feedback pipeline' })).toBeVisible();
	await expect(page.getByText('Protected user registry').first()).toBeVisible();
	if (process.env.ADMIN_VISUAL_CAPTURE)
		await page.screenshot({
			path: '/tmp/grademaxxing-admin-reference-desktop.png',
			fullPage: true
		});

	// Range switcher refetches the usage window
	await page.getByRole('tab', { name: '7 days' }).click();
	await expect(page.getByRole('tab', { name: '7 days' })).toHaveAttribute('aria-selected', 'true');
	await expect(page.getByText('Active students (7d)')).toBeVisible();

	// Protected user registry with search
	await page.getByRole('link', { name: 'Users' }).click();
	await expect(page.getByRole('heading', { name: 'Protected user registry' })).toBeVisible();
	await expect(page.getByText('protected-student-key-001')).toBeVisible();
	await expect(page.getByText('protected-student-key-003')).toBeVisible();
	await page.getByLabel('Search protected key').fill('002');
	await expect(page.getByText('protected-student-key-002')).toBeVisible();
	await expect(page.getByText('protected-student-key-001')).toHaveCount(0);
	await page.getByLabel('Search protected key').fill('');

	// Feedback inbox: triage, private notes and replies
	await page.getByRole('link', { name: 'Feedback' }).click();
	await expect(page.getByRole('heading', { name: 'Feedback inbox' })).toBeVisible();
	await expect(
		page.locator('.message-bubble').getByText('Add a weekly grade summary')
	).toBeVisible();
	await page.getByLabel('Reply to Feature idea').fill('Great idea — this is now on the roadmap.');
	await expect(
		page.locator('.message-bubble').getByText('Great idea — this is now on the roadmap.')
	).toHaveCount(0);
	await page.getByLabel('Status for Feature idea').selectOption('planned');
	await expect.poll(() => savedFeedback.status).toBe('planned');
	expect(savedFeedback.adminReply).toBe('');
	await page.getByLabel('Private admin note').fill('Include in the next product pass.');
	await page.getByRole('button', { name: 'Save private note' }).click();
	await expect.poll(() => savedFeedback.adminNote).toBe('Include in the next product pass.');
	expect(savedFeedback.adminReply).toBe('');
	await page.getByRole('button', { name: 'Send reply' }).click();
	await expect.poll(() => sentReply).toBe('Great idea — this is now on the roadmap.');
	await expect(
		page.locator('.message-bubble').getByText('Great idea — this is now on the roadmap.')
	).toBeVisible();
	if (process.env.ADMIN_VISUAL_CAPTURE) {
		await page.setViewportSize({ width: 390, height: 844 });
		await expect
			.poll(() => page.evaluate(() => document.documentElement.scrollWidth))
			.toBeLessThanOrEqual(390);
		await expect
			.poll(() =>
				page.locator('aside').evaluate((sidebar) => sidebar.getBoundingClientRect().right)
			)
			.toBeLessThanOrEqual(0);
		await page.evaluate(() => window.scrollTo(0, 0));
		await page.screenshot({
			path: '/tmp/grademaxxing-admin-feedback-mobile.png',
			fullPage: true
		});
		await page.setViewportSize({ width: 1280, height: 720 });
	}
	await page.getByLabel('Reply to Feature idea').fill('This should remain an unsent draft.');
	await expect(page.getByRole('button', { name: 'Send reply' })).toBeEnabled();
	failNextFeedbackSave = true;
	await page.getByRole('button', { name: 'Send reply' }).click();
	await expect(page.getByRole('alert')).toContainText('offline');
	await expect(page.getByRole('button', { name: 'Send reply' })).toBeEnabled();
	await expect(
		page.locator('.message-bubble').getByText('This should remain an unsent draft.')
	).toHaveCount(0);
	await expect(
		page.locator('.message-bubble').getByText('Great idea — this is now on the roadmap.')
	).toBeVisible();
	await page.getByRole('button', { name: 'Send reply' }).click();
	await expect(
		page.locator('.message-bubble').getByText('This should remain an unsent draft.')
	).toBeVisible();
	await expect(page.locator('.message-bubble')).toHaveCount(3);

	// Referral leaderboard and link generation
	await page.getByRole('link', { name: 'Referrals' }).click();
	await expect(page.getByRole('heading', { name: 'Referral leaderboard' })).toBeVisible();
	await expect(page.getByText('Maya Chen')).toBeVisible();
	await expect(page.getByText('/refer/maya', { exact: true })).toBeVisible();
	await expect(page.getByRole('cell', { name: '5' })).toBeVisible();
	await page.getByLabel('First name').fill('Jordan');
	await page.getByLabel('Last name').fill('Rivera');
	await page.getByLabel('Email address').fill('jordan@example.com');
	await page.getByRole('button', { name: 'Generate link' }).click();
	await expect(page.getByText('Jordan Rivera')).toBeVisible();
	await expect(page.getByText('/refer/jordan', { exact: true })).toBeVisible();
	await expect(page.getByRole('status')).toContainText("Jordan's referral link is ready");
	if (process.env.ADMIN_VISUAL_CAPTURE)
		await page.screenshot({
			path: '/tmp/grademaxxing-admin-referrals-desktop.png',
			fullPage: true
		});
	// Mobile layout settles within the viewport (polling tolerates the
	// template's 300ms sidebar push animation crossing the xl breakpoint)
	await page.setViewportSize({ width: 390, height: 844 });
	await expect
		.poll(() => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth), {
			timeout: 5000
		})
		.toBeLessThanOrEqual(1);

	// Mobile overview stays within the viewport, reached through the mobile menu
	await page.getByRole('button', { name: 'Toggle sidebar' }).click();
	await page.getByRole('link', { name: 'Dashboard' }).click();
	await expect(page.getByRole('heading', { name: 'Product overview' })).toBeVisible();
	await expect
		.poll(() => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth), {
			timeout: 5000
		})
		.toBeLessThanOrEqual(1);
	if (process.env.ADMIN_VISUAL_CAPTURE)
		await page.screenshot({ path: '/tmp/grademaxxing-admin-reference-mobile.png', fullPage: true });
});
