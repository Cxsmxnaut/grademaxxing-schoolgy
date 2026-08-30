import { expect, test } from '@playwright/test';

test('the landing page presents the product and every destination works', async ({ page }) => {
	await page.goto('/');

	await expect(
		page.getByRole('heading', { level: 1, name: 'Know where your grades are headed.' })
	).toBeVisible();
	await expect(page.getByLabel('Preview of the Grademaxxing gradebook')).toBeVisible();

	const navigation = page.getByRole('navigation', { name: 'Primary navigation' });
	await expect(navigation.getByRole('link', { name: 'Log in' })).toHaveAttribute('href', '/login');
	await expect(navigation.getByRole('link', { name: 'Sign up' })).toHaveAttribute(
		'href',
		'/signup'
	);

	await navigation.getByRole('link', { name: 'Sign up' }).click();
	await expect(page).toHaveURL(/\/signup$/);

	await page.goto('/');
	await page.getByRole('link', { name: 'Sign in with StudentVUE' }).click();
	await expect(page).toHaveURL(/\/login$/);

	await page.goto('/');
	await page.getByRole('link', { name: 'See what it does' }).click();
	await expect(page).toHaveURL(/\/#features$/);
	await expect(page.getByRole('heading', { name: 'Grade trends' })).toBeVisible();

	await page.goto('/');
	await page.getByRole('link', { name: 'Read the privacy details' }).click();
	await expect(page).toHaveURL(/\/privacy$/);

	await page.goto('/');
	await page.getByRole('link', { name: 'Open Grademaxxing' }).click();
	await expect(page).toHaveURL(/\/login$/);
});

test('the landing page has no phone-width overflow', async ({ page }) => {
	await page.setViewportSize({ width: 390, height: 844 });
	await page.goto('/');

	await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
	await expect(page.getByRole('link', { name: 'Sign in with StudentVUE' })).toBeVisible();
	expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});
