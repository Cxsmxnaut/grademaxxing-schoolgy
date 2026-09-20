import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

const publicPages = ['/', '/login', '/privacy'] as const;

async function expectWcagAA(page: Page) {
	const results = await new AxeBuilder({ page })
		.withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
		.analyze();
	const summary = results.violations.map((violation) => ({
		id: violation.id,
		impact: violation.impact,
		help: violation.help,
		targets: violation.nodes.flatMap((node) => node.target)
	}));
	expect(summary, 'Expected no WCAG A/AA accessibility violations').toEqual([]);
}

for (const path of publicPages) {
	test(`${path} meets WCAG A/AA in light mode`, async ({ page }) => {
		await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
		await page.goto(path);
		await expectWcagAA(page);
	});

	test(`${path} meets WCAG A/AA in dark mode`, async ({ page }) => {
		await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
		await page.goto(path);
		await expectWcagAA(page);
	});
}

test('login remains accessible at phone width', async ({ page }) => {
	await page.setViewportSize({ width: 390, height: 844 });
	await page.goto('/login');
	await expectWcagAA(page);
});
