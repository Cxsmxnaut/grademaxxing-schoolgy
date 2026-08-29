import { expect, test } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

test('the Pleasanton sign-in and password-setup flow matches the intended interaction', async ({
	page
}) => {
	await mkdir('test-results/auth-flow', { recursive: true });
	await page.setViewportSize({ width: 1440, height: 1000 });
	await page.goto('/login');

	await expect(page.getByRole('heading', { name: 'Sign in to Grademaxxing' })).toBeVisible();
	await expect(page.getByText('Pleasanton USD', { exact: true })).toBeVisible();
	await expect(page.locator('#domain')).toHaveCount(0);
	await page.screenshot({ path: 'test-results/auth-flow/login.png', fullPage: true });

	await page.getByRole('button', { name: 'Change', exact: true }).click();
	const districtSelector = page.getByRole('combobox', { name: 'School district' });
	await expect(districtSelector).toHaveValue('Pleasanton Unified School District');
	await expect(page.getByLabel('StudentVUE Domain')).toHaveValue(
		'https://ca-pleas-psv.edupoint.com'
	);
	await districtSelector.fill('San Francisco Unified');
	await page.getByText('San Francisco Unified School District', { exact: true }).click();
	await expect(page.getByLabel('StudentVUE Domain')).toHaveValue('https://ca-sfu-psv.edupoint.com');
	await expect(
		page.getByText('San Francisco Unified School District', { exact: true })
	).toBeVisible();
	await page.screenshot({ path: 'test-results/auth-flow/login-change.png', fullPage: true });

	await page.locator('a[href="/signup"]').click();
	await expect(page.getByRole('heading', { name: 'Sign up for Grademaxxing' })).toBeVisible();
	await expect(page.getByRole('link', { name: 'With Google', exact: true })).toBeVisible();
	await page.screenshot({ path: 'test-results/auth-flow/signup.png', fullPage: true });

	await page.getByRole('link', { name: 'With Google', exact: true }).click();
	const passwordLink = page.getByRole('link', {
		name: 'Set your StudentVUE password',
		exact: true
	});
	await expect(passwordLink).toHaveAttribute(
		'href',
		'https://ca-pleas-psv.edupoint.com/PXP2_Password_Help.aspx'
	);
	await page.screenshot({ path: 'test-results/auth-flow/google-password.png', fullPage: true });
});

test('the redesigned sign-in flow fits a phone without horizontal overflow', async ({ page }) => {
	await page.setViewportSize({ width: 390, height: 844 });
	await page.goto('/login');
	await expect(page.getByRole('heading', { name: 'Sign in to Grademaxxing' })).toBeVisible();
	await page.getByRole('button', { name: 'Change', exact: true }).click();
	const widths = await page.evaluate(() => ({
		viewport: window.innerWidth,
		document: document.documentElement.scrollWidth,
		body: document.body.scrollWidth
	}));
	expect(widths.document).toBeLessThanOrEqual(widths.viewport);
	expect(widths.body).toBeLessThanOrEqual(widths.viewport);
});

test('the desktop sign-in geometry stays aligned with the visual reference', async ({ page }) => {
	await page.setViewportSize({ width: 1470, height: 805 });
	await page.goto('/login');

	const promo = await page.locator('aside').boundingBox();
	const card = await page.locator('form').boundingBox();
	expect(promo).not.toBeNull();
	expect(card).not.toBeNull();
	expect(promo!.width).toBeGreaterThanOrEqual(675);
	expect(promo!.width).toBeLessThanOrEqual(677);
	expect(card!.width).toBeGreaterThanOrEqual(399);
	expect(card!.width).toBeLessThanOrEqual(401);
	expect(card!.x).toBeGreaterThanOrEqual(872);
	expect(card!.x).toBeLessThanOrEqual(874);
	expect(card!.y).toBeGreaterThanOrEqual(59);
	expect(card!.y + card!.height).toBeLessThanOrEqual(746);
});

test('the local district selector supports keyboard selection and district-owned portals', async ({
	page
}) => {
	await page.goto('/login');
	await page.getByRole('button', { name: 'Change', exact: true }).click();
	await expect(page.getByText('Find your district (US ZIP code)')).toHaveCount(0);

	const districtSelector = page.getByRole('combobox', { name: 'School district' });
	await districtSelector.fill('Peoria Unified School District');
	await expect(page.getByRole('listbox', { name: 'Matching school districts' })).toBeVisible();
	await districtSelector.press('Enter');

	await expect(districtSelector).toHaveValue('Peoria Unified School District');
	await expect(page.getByLabel('StudentVUE Domain')).toHaveValue('https://synergylive.pusd11.net');

	await districtSelector.fill('Bonsall Unified School District');
	await districtSelector.press('Enter');
	await expect(page.getByLabel('StudentVUE Domain')).toHaveValue(
		'https://sdhome.sdcoe.net/bonsall'
	);
	await expect(page.getByText('Bonsall Unified School District', { exact: true })).toBeVisible();
});
