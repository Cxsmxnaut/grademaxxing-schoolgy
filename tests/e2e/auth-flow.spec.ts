import { expect, test } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

test('the sign-in and district-password setup flow matches the current product', async ({
	page
}) => {
	await mkdir('test-results/auth-flow', { recursive: true });
	await page.setViewportSize({ width: 1440, height: 1000 });
	await page.goto('/login');

	await expect(page.getByRole('heading', { name: 'Sign in to Grademaxxing (Beta)' })).toBeVisible();
	await expect(page.getByLabel('StudentVUE email')).toBeVisible();
	await expect(page.getByLabel('StudentVUE Password')).toBeVisible();
	await expect(page.getByLabel('Keep me signed in on this device')).toBeChecked();
	await expect(page.getByText('Pleasanton Unified School District', { exact: true })).toBeVisible();
	await expect(
		page.getByText(
			'Your password is encrypted on this device and passed directly to your district when Grademaxxing (Beta) reconnects. We never store it on our servers.',
			{ exact: true }
		)
	).toBeVisible();
	await page.getByRole('button', { name: 'Forgot password?', exact: true }).click();
	const resetDialog = page.getByRole('dialog');
	await expect(resetDialog).toBeVisible();
	await expect(
		resetDialog.getByRole('heading', { name: 'Before you go, check All Mail' })
	).toBeVisible();
	await expect(resetDialog.getByText('All Mail', { exact: true })).toBeVisible();
	await page.waitForTimeout(250);
	await page.screenshot({
		path: 'test-results/auth-flow/password-help-reminder.png',
		fullPage: true
	});
	await expect(
		resetDialog.getByRole('link', { name: 'Open StudentVUE password help' })
	).toHaveAttribute('href', 'https://ca-pleas-psv.edupoint.com/PXP2_Password_Help.aspx?S=Y');
	await resetDialog.getByRole('button', { name: 'Not now' }).click();
	await expect(resetDialog).toBeHidden();
	await expect(page.getByText('use the quick setup', { exact: true })).toHaveCount(0);
	await page.screenshot({ path: 'test-results/auth-flow/login.png', fullPage: true });
});

test('the sign-in flow fits a phone without horizontal overflow', async ({ page }) => {
	await page.setViewportSize({ width: 390, height: 844 });
	await page.goto('/login');
	await expect(page.getByRole('heading', { name: 'Sign in to Grademaxxing (Beta)' })).toBeVisible();
	const widths = await page.evaluate(() => ({
		viewport: window.innerWidth,
		document: document.documentElement.scrollWidth,
		body: document.body.scrollWidth
	}));
	expect(widths.document).toBeLessThanOrEqual(widths.viewport);
	expect(widths.body).toBeLessThanOrEqual(widths.viewport);
});

test('a rejected sign-in points students to password recovery', async ({ page }) => {
	await page.route('**/api/session', async (route) => {
		if (route.request().method() !== 'POST') return route.fallback();
		await route.fulfill({
			status: 401,
			contentType: 'application/json',
			body: JSON.stringify({ message: 'StudentVUE authentication failed.' })
		});
	});
	await page.goto('/login');
	await page.getByLabel('StudentVUE email').fill('student@example.invalid');
	await page.getByLabel('StudentVUE Password').fill('incorrect-password');
	await page.getByRole('button', { name: 'Log in' }).click();

	await expect(page.getByText('That password was wrong.', { exact: true })).toBeVisible();
	await expect(page.getByText('Reset it below, then try again.', { exact: true })).toBeVisible();
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
	await page.getByRole('button', { name: 'Forgot password?', exact: true }).click();
	await expect(
		page.getByRole('dialog').getByRole('link', { name: 'Open StudentVUE password help' })
	).toHaveAttribute('href', 'https://sdhome.sdcoe.net/bonsall/PXP2_Password_Help.aspx?S=Y');
	await expect(domain).toHaveAttribute('autocapitalize', 'off');
	await expect(domain).toHaveAttribute('autocorrect', 'off');
});

test('sign-in keeps the app hidden until the gradebook is ready', async ({ page }) => {
	let releaseSession!: () => void;
	const sessionGate = new Promise<void>((resolve) => (releaseSession = resolve));
	let releaseGradebook!: () => void;
	const gradebookGate = new Promise<void>((resolve) => (releaseGradebook = resolve));
	let markGradebookRequested!: () => void;
	const gradebookRequested = new Promise<void>((resolve) => (markGradebookRequested = resolve));

	await page.route('**/api/session', async (route) => {
		if (route.request().method() !== 'POST') return route.fallback();
		await sessionGate;
		await route.fulfill({
			status: 200,
			contentType: 'application/json',
			body: JSON.stringify({
				username: 'theme-preview',
				domain: 'ca-pleas-psv.edupoint.com',
				sessionId: 'preview-session'
			})
		});
	});
	await page.route('**/api/session/status', (route) =>
		route.fulfill({
			status: 200,
			contentType: 'application/json',
			body: JSON.stringify({
				signedIn: true,
				username: 'theme-preview',
				domain: 'ca-pleas-psv.edupoint.com'
			})
		})
	);
	await page.route('**/api/session/keepalive', (route) =>
		route.fulfill({
			status: 200,
			contentType: 'application/json',
			body: JSON.stringify({ signedIn: true, updatedAt: Date.now() })
		})
	);
	let gradebookRequestCount = 0;
	await page.route('**/api/studentvue/**', async (route) => {
		if (new URL(route.request().url()).pathname.endsWith('/gradebook')) {
			gradebookRequestCount += 1;
			if (gradebookRequestCount === 1) {
				// A cold login must use the same complete gradebook load as Refresh.
				expect(new URL(route.request().url()).searchParams.get('summary')).not.toBe('true');
				markGradebookRequested();
				await gradebookGate;
			}
			const xml =
				'<Gradebook><ReportingPeriod Index="0" GradePeriod="Semester 1"/><ReportingPeriods><ReportPeriod Index="0" GradePeriod="Semester 1"/></ReportingPeriods><Courses><Course CourseID="preview" CourseName="Theme Preview" Period="1" Staff="Teacher" Room="101"><Marks><Mark MarkName="Semester 1" CalculatedScoreRaw="95" CalculatedScoreString="A"><Assignments></Assignments></Mark></Marks></Course></Courses></Gradebook>';
			await route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify({ xml, detailed: gradebookRequestCount > 1 })
			});
			return;
		}

		await route.fulfill({
			status: 500,
			contentType: 'application/json',
			body: JSON.stringify({ message: 'Not needed by this loading-flow test.' })
		});
	});

	await page.goto('/login');
	await page.getByLabel('StudentVUE email').fill('theme-preview');
	await page.getByLabel('StudentVUE Password').fill('preview-password');
	await page.getByRole('button', { name: 'Log in' }).click();

	const loadingScreen = page.getByTestId('post-login-loading');
	await expect(loadingScreen).toBeVisible();
	await expect(loadingScreen).toContainText('Connecting to StudentVUE…');
	await expect(page.locator('form')).toHaveCount(0);
	await expect(page).toHaveURL(/\/login$/);
	await page.screenshot({ path: 'test-results/auth-flow/loading.png', fullPage: true });
	await expect(loadingScreen).toContainText('Connect to StudentVUE');
	await expect(loadingScreen).toContainText('Load your grades');

	releaseSession();
	await gradebookRequested;
	await expect(loadingScreen).toContainText('Loading your grades…');
	await expect(page.locator('form')).toHaveCount(0);
	await expect(page).toHaveURL(/\/login$/);

	releaseGradebook();
	await expect(page).toHaveURL(/\/grades$/);
	await expect(page.getByRole('heading', { level: 1, name: 'Gradebook' })).toBeVisible();
	await expect(loadingScreen).toHaveCount(0);
});
