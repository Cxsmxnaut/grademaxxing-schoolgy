import { expect, test } from '@playwright/test';

test('the landing page presents the product and every destination works', async ({ page }) => {
	await page.goto('/');
	await expect(
		page.getByRole('heading', { level: 1, name: 'Your grades are complicated enough.' })
	).toBeVisible();
	await expect(page.getByLabel('Preview of the Grademaxxing gradebook')).toBeVisible();
	const navigation = page.getByRole('navigation', { name: 'Primary navigation' });
	await expect(navigation.getByRole('link', { name: 'Log in' })).toHaveAttribute('href', '/login');
	await expect(navigation.getByRole('link', { name: 'Create account' })).toHaveCount(0);
	await page.locator('main').getByRole('link', { name: 'Open Grademaxxing' }).click();
	await expect(page).toHaveURL(/\/login$/);
	await expect(page.getByRole('heading', { name: 'Sign in to Grademaxxing' })).toBeVisible();
	await page.goto('/');
	await navigation.getByRole('link', { name: 'Features' }).click();
	await expect(page).toHaveURL(/\/#why$/);
	await expect(page.getByRole('heading', { name: 'Grade trends' })).toBeVisible();
	await page.goto('/');
	await page.getByRole('link', { name: 'Privacy', exact: true }).click();
	await expect(page).toHaveURL(/\/privacy$/);
	await expect(page.getByRole('heading', { level: 1 })).toContainText('handles your information');
	await page.goto('/');
	await page.locator('footer').getByRole('link', { name: 'Open Grademaxxing' }).click();
	await expect(page).toHaveURL(/\/login$/);
});

test('obsolete onboarding routes redirect to login', async ({ page }) => {
	await page.goto('/signup');
	await expect(page).toHaveURL(/\/login$/);
	await page.goto('/signup/google');
	await expect(page).toHaveURL(/\/login$/);
});

for (const width of [320, 390, 768, 1440]) {
	test(`landing loads all images without runtime errors or overflow at ${width}px`, async ({
		page
	}) => {
		await page.setViewportSize({ width, height: 844 });
		const errors: string[] = [];
		page.on('pageerror', (error) => errors.push(error.message));
		page.on('console', (message) => {
			if (message.type() === 'error') errors.push(message.text());
		});
		page.on('response', (response) => {
			if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`);
		});
		await page.goto('/');
		await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
		await expect(
			page.locator('main').getByRole('link', { name: 'Open Grademaxxing' })
		).toBeVisible();
		for (const image of await page.locator('img').all()) {
			await image.scrollIntoViewIfNeeded();
			await expect
				.poll(() => image.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0))
				.toBe(true);
		}
		expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
			width
		);
		expect(errors).toEqual([]);
	});
}

test('FAQ works with a keyboard and its privacy link is wired', async ({ page }) => {
	await page.goto('/#faq');
	const item = page.locator('details').nth(2);
	await item.locator('summary').focus();
	await page.keyboard.press('Enter');
	await expect(item).toHaveAttribute('open', '');
	await item.getByRole('link', { name: 'Read the privacy details' }).click();
	await expect(page).toHaveURL(/\/privacy$/);
});

test('reduced motion keeps the introduction readable and previews stationary', async ({ page }) => {
	await page.emulateMedia({ reducedMotion: 'reduce' });
	await page.goto('/');
	await expect(page.locator('.landing-word-sticky span[aria-hidden]').first()).toHaveCSS(
		'opacity',
		'1'
	);
	await expect(page.locator('.landing-word-sticky span[aria-hidden]').first()).toHaveCSS(
		'filter',
		'none'
	);
	const visualIntroduction = page.locator('.landing-word-sticky span[aria-hidden]');
	const words = await visualIntroduction.allTextContents();
	expect(words.every((word) => word.endsWith('\u00a0'))).toBe(true);
	expect(words.join('').replaceAll('\u00a0', ' ').trim()).toBe(
		await page.locator('.landing-word-sticky .sr-only').textContent()
	);
	await expect(page.locator('.landing-overview')).toHaveCSS('transform', 'none');
	await expect(page.locator('.landing-steps article').first()).toHaveCSS('position', 'static');
});

test('a saved session bypasses the landing for the gradebook', async ({ page }) => {
	await page.route('**/api/session/status', (route) =>
		route.fulfill({
			json: { signedIn: true, username: 'landing-preview', domain: 'school.example.invalid' }
		})
	);
	await page.route('**/api/session/keepalive', (route) =>
		route.fulfill({ json: { signedIn: true, updatedAt: Date.now() } })
	);
	await page.route('**/api/studentvue/**', (route) => {
		if (new URL(route.request().url()).pathname.endsWith('/gradebook')) {
			return route.fulfill({
				json: {
					detailed: true,
					xml: '<Gradebook><ReportingPeriod Index="0" GradePeriod="Quarter 1"/><ReportingPeriods><ReportPeriod Index="0" GradePeriod="Quarter 1"/></ReportingPeriods><Courses><Course CourseID="landing-preview" CourseName="Landing Preview" Period="1" Staff="Teacher" Room="101"><Marks><Mark MarkName="Quarter 1" CalculatedScoreRaw="94" CalculatedScoreString="A"><Assignments></Assignments></Mark></Marks></Course></Courses></Gradebook>'
				}
			});
		}
		return route.fulfill({
			status: 500,
			json: { message: 'Not needed by this synthetic redirect test.' }
		});
	});
	await page.addInitScript(() =>
		localStorage.setItem(
			'token',
			JSON.stringify({
				username: 'landing-preview',
				domain: 'school.example.invalid',
				sessionId: 'synthetic-session'
			})
		)
	);
	await page.goto('/');
	await expect(page).toHaveURL(/\/grades$/);
	await expect(page.getByRole('heading', { name: 'Gradebook', exact: true })).toBeVisible();
});
