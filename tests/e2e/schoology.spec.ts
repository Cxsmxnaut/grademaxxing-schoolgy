import { expect, test } from '@playwright/test';

test.describe('Schoology edition', () => {
	test('district picker explains official OAuth and offers a no-secret demo', async ({ page }) => {
		await page.goto('/schoology/login');
		await expect(page.getByRole('heading', { name: 'Connect your school' })).toBeVisible();
		await expect(page.getByLabel('Schoology district')).toBeVisible();
		await expect(page.getByRole('button', { name: 'Continue to Schoology' })).toBeDisabled();
		await expect(page.getByText(/official Schoology authorization page/i)).toBeVisible();
		await expect(page.getByRole('button', { name: 'Open fictional-data demo' })).toBeVisible();
		await page.goto('/schoology/login?error=callback');
		await expect(page.getByText(/could not complete authorization/i)).toBeVisible();
	});

	test('district search supports ambiguous abbreviations, selection, domain lookup, and no results on mobile', async ({
		page,
		request
	}) => {
		await page.setViewportSize({ width: 390, height: 844 });
		await page.goto('/schoology/login');
		const search = page.getByRole('searchbox', { name: 'Schoology district' });
		await search.fill('FCPS');
		await expect(page.getByRole('radio')).toHaveCount(2);
		await page.getByRole('radio', { name: /Fairfax County/ }).check();
		await expect(page.getByRole('link', { name: 'Open district Schoology' })).toHaveAttribute(
			'href',
			'https://lms.fcps.edu'
		);
		await expect(
			page.getByText('Grade connection is not enabled for this district yet.', { exact: false })
		).toBeVisible();
		await expect(page.getByRole('button', { name: 'Continue to Schoology' })).toBeDisabled();
		await search.fill('lms.fcps.org');
		await expect(page.getByRole('radio')).toHaveCount(1);
		await search.press('Tab');
		await page.keyboard.press('Space');
		await expect(page.getByRole('radio', { name: /Frederick County/ })).toBeChecked();
		await expect(page.getByRole('link', { name: 'Open district Schoology' })).toHaveAttribute(
			'href',
			'https://lms.fcps.org'
		);
		await search.fill('nonexistent district');
		await expect(page.getByText('No matching districts.', { exact: false })).toBeVisible();
		await expect(page.getByRole('link', { name: 'Open district Schoology' })).toHaveCount(0);
		await search.fill('');
		await expect(page.getByRole('radio')).toHaveCount(5);
		const response = await request.post('/api/schoology/auth/start', {
			headers: { origin: new URL(page.url()).origin },
			data: { districtId: 'fairfax-va', schoolUrl: 'https://attacker.example.org' }
		});
		expect(response.status()).toBe(400);
	});

	test('demo loads courses, keeps official grades distinct, calculates what-if, shows capabilities, and logs out', async ({
		page
	}) => {
		await page.goto('/schoology/login');
		const demoResponse = page.waitForResponse('**/api/schoology/demo');
		await page.getByRole('button', { name: 'Open fictional-data demo' }).click();
		expect((await demoResponse).status()).toBe(200);
		expect(
			(await page.context().cookies()).some((cookie) => cookie.name === 'grademaxxing_schoology')
		).toBe(true);
		await page.goto('/schoology');
		await expect(page).toHaveURL(/\/schoology$/);
		await expect(page.getByText('Fictional-data demo.')).toBeVisible();
		await expect(page.getByLabel('Course', { exact: true })).toHaveValue('algebra');
		await expect(page.getByText('Official Schoology grade')).toBeVisible();
		await expect(page.getByText('88.4%')).toBeVisible();
		await expect(page.getByRole('heading', { name: 'What-if planner' })).toBeVisible();
		const estimate = page.getByText('Projected local estimate').locator('strong');
		const before = await estimate.textContent();
		await page
			.getByRole('spinbutton', { name: 'What-if score for Linear equations quiz' })
			.fill('10');
		await expect(estimate).not.toHaveText(before ?? '');
		await page.getByLabel('Course', { exact: true }).selectOption('biology');
		await expect(page.getByText('Biology · Current Term')).toBeVisible();

		await page.getByRole('link', { name: 'Calendar' }).click();
		await expect(page.getByRole('heading', { name: 'Calendar', exact: true })).toBeVisible();
		await expect(page.getByText('Algebra II · Review quiz')).toBeVisible();
		await page.getByRole('link', { name: 'Documents' }).click();
		await expect(page.getByText('Course outline')).toBeVisible();
		await page.getByRole('link', { name: 'Mail' }).click();
		await expect(page.getByText('Welcome to the course')).toBeVisible();
		await page.getByRole('link', { name: 'Attendance' }).click();
		await expect(page.getByText('Attendance is unavailable in this edition')).toBeVisible();
		await expect(page.getByText(/does not request those broader records/)).toBeVisible();

		await page.getByRole('button', { name: 'Log out' }).click();
		await expect(page).toHaveURL(/\/schoology\/login$/);
		await expect(page.getByRole('button', { name: 'Open fictional-data demo' })).toBeVisible();
	});

	test('callback without a matching pending session returns to the error sign-in state', async ({
		request
	}) => {
		const response = await request.get(
			'/api/schoology/callback?oauth_token=fictional&oauth_verifier=fictional',
			{
				maxRedirects: 0
			}
		);
		expect(response.status()).toBe(303);
		expect(response.headers().location).toContain('/schoology/login?error=expired');
	});
});
