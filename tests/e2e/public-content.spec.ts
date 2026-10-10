import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

const contentRoutes = [
	'/about',
	'/studentvue-grade-calculator',
	'/studentvue-compatibility',
	'/guides/studentvue-grade-calculation',
	'/guides/grade-mismatches',
	'/guides/missing-excused-ungraded',
	'/methodology/grade-calculations',
	'/methodology/calculator-validation',
	'/demo'
];

test('public articles expose useful content and related destinations without signing in', async ({
	page
}) => {
	for (const path of contentRoutes) {
		await page.goto(path);
		await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
		await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
		await expect(page.locator('main article')).toBeVisible();
		await expect(page.getByRole('navigation', { name: 'Continue exploring' })).toBeVisible();
		await expect(
			page
				.getByRole('navigation', { name: 'Primary navigation' })
				.getByRole('link', { name: 'Sign in' })
		).toHaveAttribute('href', '/login');
	}
});

test('calculation guidance remains readable when JavaScript is disabled', async ({
	browser,
	baseURL
}) => {
	const context = await browser.newContext({ javaScriptEnabled: false, baseURL });
	const page = await context.newPage();
	await page.goto('/methodology/grade-calculations');
	await expect(
		page.getByRole('heading', { name: 'The formulas behind a grade estimate.' })
	).toBeVisible();
	await expect(page.locator('main')).toContainText('Required final score X');
	await expect(page.locator('main')).toContainText('122%');
	await expect(
		page.getByRole('link', { name: 'Check six synthetic reference cases' })
	).toBeVisible();
	await context.close();
});

test('demo changes estimates and replacement math without portal requests or grade storage', async ({
	page
}) => {
	const privateRequests: string[] = [];
	page.on('request', (request) => {
		const path = new URL(request.url()).pathname;
		if (path.startsWith('/api/studentvue') || path.startsWith('/api/session'))
			privateRequests.push(path);
	});
	await page.goto('/demo');
	await expect(page.locator('#public-main')).toHaveAttribute('data-public-ready', 'true');
	await expect(page.locator('main')).toContainText('entirely synthetic');
	await expect(page.getByTestId('impact-after')).toHaveText('80%');
	await page.getByLabel('New earned points', { exact: true }).fill('50');
	await expect(page.getByTestId('impact-after')).toHaveText('86.67%');
	await page.getByLabel('Assignment action', { exact: true }).selectOption('replace');
	await page.getByLabel('Current possible points', { exact: true }).fill('150');
	await page.getByLabel('Original earned points', { exact: true }).fill('0');
	await page.getByLabel('Original possible points', { exact: true }).fill('50');
	await page.getByLabel('New earned points', { exact: true }).fill('40');
	await expect(page.getByTestId('impact-after')).toHaveText('80%');
	await expect(page.getByTestId('impact-delta')).toHaveText('+26.67 percentage points');
	await page.getByLabel('Assignment action', { exact: true }).selectOption('new');
	await page.getByLabel('Course calculation model', { exact: true }).selectOption('categories');
	await expect(page.getByTestId('impact-after')).toHaveText('89.5%');
	await expect(page.getByTestId('category-target')).toHaveText('97 / 100');
	expect(privateRequests).toEqual([]);
	expect(await page.evaluate(() => Object.keys(localStorage))).toEqual([]);
	expect(await page.evaluate(() => Object.keys(sessionStorage))).toEqual([]);
});

test('the public shell has a keyboard skip link and clear compatibility limits', async ({
	page
}) => {
	await page.goto('/studentvue-compatibility');
	await page.keyboard.press('Tab');
	await expect(page.getByRole('link', { name: 'Skip to content' })).toBeFocused();
	await page.keyboard.press('Enter');
	await expect(page.locator('#public-main')).toBeFocused();
	await expect(page.locator('main')).toContainText(
		'No independently verified district-by-district coverage'
	);
	await expect(page.locator('main')).toContainText('Direct Grademaxxing SSO handoff unavailable');
	await expect(page.locator('main')).toContainText(
		'Your credentials pass over HTTPS through the Grademaxxing server'
	);
});

test('article links remain identifiable after login styles load during client navigation', async ({
	page
}) => {
	await page.goto('/login');
	await expect(
		page.getByRole('heading', { name: 'Sign in to Grademaxxing', exact: true })
	).toBeVisible();
	await page.evaluate(() => {
		(window as Window & { publicStyleNavigationMarker?: boolean }).publicStyleNavigationMarker =
			true;
	});
	await page.getByRole('link', { name: 'Back to website', exact: true }).click();
	await page.locator('footer').getByRole('link', { name: 'About', exact: true }).click();
	await expect(page).toHaveURL(/\/about$/);
	expect(
		await page.evaluate(
			() =>
				(window as Window & { publicStyleNavigationMarker?: boolean }).publicStyleNavigationMarker
		)
	).toBe(true);
	await expect(page.getByRole('link', { name: 'public calculators', exact: true })).toHaveCSS(
		'text-decoration-line',
		'underline'
	);
	const results = await new AxeBuilder({ page })
		.withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
		.analyze();
	expect(
		results.violations.map(({ id, nodes }) => ({
			id,
			targets: nodes.flatMap(({ target }) => target)
		}))
	).toEqual([]);
});

for (const width of [320, 375, 414, 768]) {
	test(`public demo remains usable without page overflow at ${width}px`, async ({ page }) => {
		await page.setViewportSize({ width, height: 844 });
		const errors: string[] = [];
		page.on('pageerror', (error) => errors.push(error.message));
		await page.goto('/demo');
		await expect(page.locator('#public-main')).toHaveAttribute('data-public-ready', 'true');
		await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
		await page.getByLabel('New earned points', { exact: true }).fill('50');
		await expect(page.getByTestId('impact-after')).toHaveText('86.67%');
		expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
			width
		);
		expect(errors).toEqual([]);
	});
}
