import { expect, test } from '@playwright/test';

const username = process.env.STUDENTVUE_USERNAME;
const password = process.env.STUDENTVUE_PASSWORD;
const district = process.env.DISTRICT_URL;
const live = Boolean(username && password && district);

test.describe('live StudentVUE journeys', () => {
	test.skip(
		!live,
		'Set STUDENTVUE_USERNAME, STUDENTVUE_PASSWORD, and DISTRICT_URL to run live tests.'
	);

	test('requires a session and rejects an invalid resource', async ({ request }) => {
		expect((await request.get('/api/studentvue/grades')).status()).toBe(404);
		expect((await request.get('/api/studentvue/gradebook')).status()).toBe(401);
	});

	test('shows a safe login error without persisting credentials', async ({ page }) => {
		await page.goto('/login');
		await page.locator('#username').fill('invalid-student');
		await page.locator('#password').fill('not-a-real-password');
		await page.locator('#domain').fill('example.com');
		await page.locator('#disclaimer').check();
		await page.getByRole('button', { name: 'Log in' }).click();
		await expect(page.getByText('That password was wrong.')).toBeVisible();
		expect(await page.evaluate(() => localStorage.getItem('token'))).toBeNull();
	});

	test('logs in through the UI and exercises every student journey', async ({ page, context }) => {
		const pageErrors: string[] = [];
		page.on('pageerror', (error) => pageErrors.push(error.message));
		await page.goto('/login');
		await page.locator('#username').fill(username!);
		await page.locator('#password').fill(password!);
		const disclaimer = page.locator('#disclaimer');
		if (await disclaimer.count()) await disclaimer.check();
		if (new URL(district!).host !== 'ca-pleas-psv.edupoint.com')
			await page.locator('#domain').fill(new URL(district!).origin);
		await page.getByRole('button', { name: 'Log in' }).click();
		await expect(page).toHaveURL(/\/grades$/);
		await expect(page.getByText('GPA · unweighted', { exact: true })).toBeVisible();
		await page.goto('/grades');
		await expect(page.locator('a[href^="/grades/"]')).not.toHaveCount(0);

		const course = page.locator('a[href^="/grades/"]').first();
		await course.click();
		await expect(page).toHaveURL(/\/grades\/.+/);
		await expect(page.getByText('Something went wrong')).toHaveCount(0);
		await expect(page.getByText(/^Official · synced /)).toBeVisible();

		await page.goto('/attendance');
		await expect(page.getByText('Loading attendance...')).toHaveCount(0);
		await expect(page.getByText('Something went wrong')).toHaveCount(0);

		await page.goto('/studentinfo');
		await expect(page.getByText('Loading student information...')).toHaveCount(0);
		await expect(page.getByText('Something went wrong')).toHaveCount(0);

		await page.goto('/documents');
		const documentLinks = page.locator('main a[href^="/documents/document?"]:visible');
		await expect(documentLinks).not.toHaveCount(0);
		const documentCount = await documentLinks.count();
		for (let index = 0; index < documentCount; index += 1) {
			const documentPagePromise = context.waitForEvent('page');
			await documentLinks.nth(index).click();
			const documentPage = await documentPagePromise;
			await expect.poll(() => documentPage.url(), { timeout: 30_000 }).toMatch(/^blob:/);
			await documentPage.close();
		}

		const mailboxResponse = page.waitForResponse(
			(response) =>
				response.url().includes('/api/studentvue/messages') && response.request().method() === 'GET'
		);
		await page.goto('/mail');
		const mailbox = await mailboxResponse;
		expect(mailbox.ok()).toBeTruthy();
		const mail = await mailbox.json();
		const messages = page.locator('ol > li button');
		await expect(messages).not.toHaveCount(0);
		await messages.first().click();
		await expect(page.getByRole('dialog')).toBeVisible();
		await expect(page.locator('iframe[title="Message Content"]')).toBeVisible();
		await page.keyboard.press('Escape');
		await expect(page.getByRole('dialog')).toBeHidden();

		const messagesWithFiles = mail.InboxItemListings.MessageXML.filter(
			(message: { Attachments: unknown }) => typeof message.Attachments === 'object'
		);
		if (messagesWithFiles.length) {
			const index = mail.InboxItemListings.MessageXML.findIndex(
				(message: { Attachments: unknown }) => typeof message.Attachments === 'object'
			);
			await messages.nth(index).click();
			const attachmentLink = page.locator('a[href^="/mail/attachment?"]').first();
			await expect(attachmentLink).toBeVisible();
			const attachmentPagePromise = context.waitForEvent('page');
			await attachmentLink.click();
			const attachmentPage = await attachmentPagePromise;
			await attachmentPage.waitForURL(/^blob:/, { timeout: 30_000 });
			await attachmentPage.close();
			await page.keyboard.press('Escape');
		}

		await page.reload();
		await expect(page).toHaveURL(/\/mail$/);
		expect(pageErrors).toEqual([]);

		await page.getByRole('button', { name: 'Account menu', exact: true }).click();
		await page.getByRole('menuitem', { name: 'Log Out', exact: true }).click();
		await expect(page).toHaveURL(/\/login$/);
		expect((await page.request.get('/api/session/status')).status()).toBe(200);
		expect(await (await page.request.get('/api/session/status')).json()).toEqual({
			signedIn: false
		});
	});
});
