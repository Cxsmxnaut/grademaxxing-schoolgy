import { expect, test } from '@playwright/test';

test('real referral storage allocates readable links and serves invitations', async ({
	page,
	request,
	baseURL
}) => {
	test.skip(
		process.env.GRADEMAXXING_RELEASE_TEST_REFERRALS !== '1',
		'Requires an isolated local Cloudflare worker with synthetic administrator and referral storage.'
	);
	expect(['127.0.0.1', 'localhost']).toContain(new URL(baseURL!).hostname);
	await page.goto('/admin-app/referrals');
	await page.getByLabel('Username').fill('release-test-operator');
	await page.getByLabel(/^Password/).fill('synthetic-release-admin-password');
	await page.getByRole('button', { name: 'Open dashboard' }).click();
	await expect(page.getByText('No referral partners yet.')).toBeVisible();
	const fixtureId = Date.now();
	for (const [index, lastName] of ['Lovelace', 'Lane', 'Lewis'].entries()) {
		await page.getByLabel('First name').fill('Ada');
		await page.getByLabel('Last name').fill(lastName);
		await page.getByLabel('Email address').fill(`ada${index}-${fixtureId}@example.com`);
		await page.getByRole('button', { name: 'Generate link' }).click();
		await expect(page.getByText(`Ada ${lastName}`, { exact: true })).toBeVisible();
	}
	for (const code of ['ada', 'adal', 'adal2']) {
		await expect(page.getByText(`/refer/${code}`, { exact: true })).toBeVisible();
		const invitation = await request.get(`/refer/${code}`, { maxRedirects: 0 });
		expect(invitation.status()).toBe(303);
		expect(invitation.headers().location).toBe('/login?referred=1');
		expect(invitation.headers()['set-cookie']).toContain(`grademaxxing_referral=${code};`);
	}
	await page.getByLabel('First name').fill('Another');
	await page.getByLabel('Last name').fill('Partner');
	await page.getByLabel('Email address').fill(`ada0-${fixtureId}@example.com`);
	await page.getByRole('button', { name: 'Generate link' }).click();
	await expect(page.getByRole('alert')).toHaveText(
		'That email is already registered as a referrer.'
	);
	expect((await request.get('/refer/nonexistent-invitation')).status()).toBe(404);
});
