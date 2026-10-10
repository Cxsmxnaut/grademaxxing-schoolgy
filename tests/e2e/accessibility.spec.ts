import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { PUBLIC_PAGES } from '../../src/lib/seo/public-pages';

const publicPages = [...PUBLIC_PAGES.map(({ path }) => path), '/login'];

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
	test(`${path} meets WCAG A/AA`, async ({ page }) => {
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
