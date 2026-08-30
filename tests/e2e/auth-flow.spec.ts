import { expect, test } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

test('the sign-in and district-password setup flow matches the current product', async ({
	page
}) => {
	await mkdir('test-results/auth-flow', { recursive: true });
	await page.setViewportSize({ width: 1440, height: 1000 });
	await page.goto('/login');

	await expect(page.getByRole('heading', { name: 'Sign in to Grademaxxing' })).toBeVisible();
	await expect(page.getByLabel('StudentVUE email')).toBeVisible();
	await expect(page.getByLabel('StudentVUE Password')).toBeVisible();
	await expect(page.getByText('Pleasanton Unified School District', { exact: true })).toBeVisible();
	await expect(
		page.getByText(
			'Your password is encrypted in transit and passed directly to your district. We never store it, and we never save your grades.',
			{ exact: true }
		)
	).toBeVisible();
	await page.screenshot({ path: 'test-results/auth-flow/login.png', fullPage: true });

	await page.getByRole('link', { name: 'create one', exact: true }).click();
	await expect(page.getByText('Sign up for Grademaxxing', { exact: true })).toBeVisible();
	await expect(page.getByText('How do you sign in to StudentVUE?', { exact: true })).toBeVisible();
	await expect(page.getByRole('link', { name: 'with Google', exact: true })).toBeVisible();
	await expect(page.getByRole('link', { name: 'with a password', exact: true })).toHaveAttribute(
		'href',
		'/login'
	);
	await page.screenshot({ path: 'test-results/auth-flow/signup.png', fullPage: true });

	await page.getByRole('link', { name: 'with Google', exact: true }).click();
	await expect(page.getByText('Create a password', { exact: true })).toBeVisible();
	await page.getByRole('button', { name: 'How to set your StudentVUE password' }).click();
	await expect(page.getByRole('dialog')).toBeVisible();
	await page
		.getByPlaceholder('https://[your-district]-psv.edupoint.com/Home_PXP2.aspx')
		.fill('https://ca-pleas-psv.edupoint.com/PXP2_Login_Student.aspx');
	await expect(page.getByRole('link', { name: 'Open', exact: true })).toHaveAttribute(
		'href',
		'https://ca-pleas-psv.edupoint.com/PXP2_Password_Help.aspx'
	);
	await page.screenshot({ path: 'test-results/auth-flow/password-help.png', fullPage: true });
});

test('the sign-in flow fits a phone without horizontal overflow', async ({ page }) => {
	await page.setViewportSize({ width: 390, height: 844 });
	await page.goto('/login');
	await expect(page.getByRole('heading', { name: 'Sign in to Grademaxxing' })).toBeVisible();
	const widths = await page.evaluate(() => ({
		viewport: window.innerWidth,
		document: document.documentElement.scrollWidth,
		body: document.body.scrollWidth
	}));
	expect(widths.document).toBeLessThanOrEqual(widths.viewport);
	expect(widths.body).toBeLessThanOrEqual(widths.viewport);
});

test('the desktop sign-in form stays centered and readable', async ({ page }) => {
	await page.setViewportSize({ width: 1470, height: 805 });
	await page.goto('/login');

	const form = await page.locator('form').boundingBox();
	expect(form).not.toBeNull();
	expect(form!.width).toBeGreaterThanOrEqual(350);
	expect(form!.width).toBeLessThanOrEqual(410);
	const main = await page.locator('main').boundingBox();
	expect(main).not.toBeNull();
	expect(Math.abs(form!.x + form!.width / 2 - (main!.x + main!.width / 2))).toBeLessThanOrEqual(2);
	expect(Math.abs(form!.y + form!.height / 2 - 805 / 2)).toBeLessThanOrEqual(2);
	expect(form!.y + form!.height).toBeLessThanOrEqual(805);
});

test('students can enter district-owned StudentVUE portal origins and paths directly', async ({
	page
}) => {
	await page.goto('/login');
	await page.getByRole('button', { name: 'Change' }).click();
	const domain = page.getByLabel('StudentVUE Domain');

	await domain.fill('https://synergylive.pusd11.net');
	await expect(domain).toHaveValue('https://synergylive.pusd11.net');

	await domain.fill('https://sdhome.sdcoe.net/bonsall');
	await expect(domain).toHaveValue('https://sdhome.sdcoe.net/bonsall');
	await expect(domain).toHaveAttribute('autocapitalize', 'off');
	await expect(domain).toHaveAttribute('autocorrect', 'off');
});
