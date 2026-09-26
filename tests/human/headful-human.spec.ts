import AxeBuilder from '@axe-core/playwright';
import {
	chromium,
	expect,
	test,
	type Browser,
	type BrowserContext,
	type Page
} from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';

const username = process.env.STUDENTVUE_USERNAME;
const password = process.env.STUDENTVUE_PASSWORD;
const district = process.env.DISTRICT_URL;
const diagnosticsDirectory = 'test-results/human-diagnostics';

test.describe.configure({ mode: 'serial' });
test.skip(!username || !password || !district, 'Live StudentVUE credentials are required.');

let browser: Browser;
let context: BrowserContext;
let page: Page;
const pageErrors: string[] = [];
const diagnostics: Array<Record<string, unknown>> = [];
let traceStarted = false;
let expectingInvalidLoginFailure = false;

function redact(value: string) {
	let output = value;
	for (const secret of [username, password])
		if (secret) output = output.replaceAll(secret, '<redacted>');
	return output
		.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '<redacted-email>')
		.replace(/([?&](?:token|code|key|session|documentGU|attachmentGU)=)[^&\s]+/gi, '$1<redacted>')
		.slice(0, 1_000);
}

function safeUrl(value: string) {
	try {
		const url = new URL(value);
		return `${url.origin}${url.pathname}`;
	} catch {
		return '<invalid-url>';
	}
}

function record(type: string, detail: Record<string, unknown> = {}) {
	diagnostics.push({ timestamp: new Date().toISOString(), type, ...detail });
}

async function expectWcagAA() {
	const results = await new AxeBuilder({ page })
		.withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
		.analyze();
	const summary = results.violations.map((violation) => ({
		id: violation.id,
		impact: violation.impact,
		help: violation.help,
		targets: violation.nodes.flatMap((node) => node.target)
	}));
	expect(summary, `WCAG A/AA violations on ${safeUrl(page.url())}`).toEqual([]);
}

test.beforeAll(async () => {
	browser = await chromium.launch({
		headless: process.env.PLAYWRIGHT_HEADLESS === '1',
		slowMo: 100,
		executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
	});
	context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
	page = await context.newPage();
	page.on('pageerror', (error) => {
		const message = redact(error.message);
		pageErrors.push(message);
		record('page-error', { message });
	});
	page.on('console', (message) => {
		if (message.type() === 'error' || message.type() === 'warning')
			record('console', {
				level: message.type(),
				message: redact(message.text()),
				expected: expectingInvalidLoginFailure
			});
	});
	page.on('requestfailed', (request) =>
		record('request-failed', {
			method: request.method(),
			url: safeUrl(request.url()),
			reason: redact(request.failure()?.errorText ?? 'unknown')
		})
	);
	page.on('response', (response) => {
		if (response.status() >= 400)
			record('http-error', {
				method: response.request().method(),
				status: response.status(),
				url: safeUrl(response.url()),
				expected: expectingInvalidLoginFailure
			});
	});
	page.on('framenavigated', (frame) => {
		if (frame === page.mainFrame()) record('navigation', { url: safeUrl(frame.url()) });
	});
});

test.afterAll(async () => {
	await mkdir(diagnosticsDirectory, { recursive: true });
	if (traceStarted) await context.tracing.stop({ path: `${diagnosticsDirectory}/trace.zip` });
	await writeFile(
		`${diagnosticsDirectory}/events.json`,
		JSON.stringify({ generatedAt: new Date().toISOString(), events: diagnostics }, null, 2)
	);
	await context.close();
	await browser.close();
});

test.afterEach(async ({}, testInfo) => {
	record('test-result', {
		title: testInfo.title,
		status: testInfo.status,
		durationMs: testInfo.duration,
		error: testInfo.error?.message ? redact(testInfo.error.message) : undefined
	});
});

test('1 — a student signs in and sees the Gradebook home', async () => {
	await page.goto('/login');
	await page.getByLabel('StudentVUE Username').fill(username!);
	await page.getByLabel('StudentVUE Password').fill(password!);
	await page.getByRole('checkbox', { name: /independent, unofficial tool/i }).check();
	if (new URL(district!).host !== 'ca-pleas-psv.edupoint.com') {
		await page.getByLabel('StudentVUE Domain').fill(new URL(district!).origin);
	}
	await page.getByRole('button', { name: 'Log in', exact: true }).click();

	await expect(page).toHaveURL(/\/grades$/, { timeout: 60_000 });
	await expect(page.getByRole('heading', { level: 1, name: 'Gradebook' })).toBeVisible();
	await expect(page.getByText('GPA · Unweighted', { exact: true })).toBeVisible();
	await expect(page.getByText('Rank', { exact: true })).toBeVisible();
	await expect(page.getByRole('link', { name: 'Gradebook', exact: true })).toBeVisible();
	await expect(page.getByText('Loading grades. StudentVUE is on the clock.')).toBeHidden();
	await expect(page.getByText('Something went wrong')).toHaveCount(0);
	await mkdir(diagnosticsDirectory, { recursive: true });
	await context.tracing.start({ screenshots: true, snapshots: true, sources: true });
	traceStarted = true;

	const courseCards = page.locator('main a[href^="/grades/"]');
	const courseCardCount = await courseCards.count();
	expect(courseCardCount).toBeGreaterThan(0);
	const roomBadges = page.locator('main [title="Room"]');
	const teacherBadges = page.locator('main [title="Teacher"]');
	expect(await roomBadges.count()).toBe(courseCardCount);
	expect(await teacherBadges.count()).toBe(courseCardCount);
	for (const cardText of await courseCards.allTextContents()) {
		expect(cardText).toMatch(/Period\s+\S+/);
	}
	for (const roomText of await roomBadges.allTextContents()) expect(roomText.trim()).not.toBe('');
	for (const teacherText of await teacherBadges.allTextContents())
		expect(teacherText.trim()).not.toBe('');
	expect(await page.locator('main [data-slot="progress"]').count()).toBeGreaterThan(0);
	expect(pageErrors).toEqual([]);
});

test('1b — a student refreshes grades and opens every course without broken metadata', async () => {
	const reportPeriodMenu = page.getByRole('combobox', { name: 'Report period' });
	expect(await reportPeriodMenu.count()).toBe(1);
	const defaultPeriodName = (
		await reportPeriodMenu.locator('option:checked').textContent()
	)?.trim();
	expect(defaultPeriodName).toBeTruthy();
	const reportPeriodOptions = reportPeriodMenu.getByRole('option');
	expect(await reportPeriodOptions.count()).toBeGreaterThan(0);
	if ((await reportPeriodOptions.count()) > 1) {
		const activeValue = await reportPeriodMenu.inputValue();
		let historicalValue = await reportPeriodOptions.first().getAttribute('value');
		for (let index = 0; index < (await reportPeriodOptions.count()); index += 1) {
			const optionValue = await reportPeriodOptions.nth(index).getAttribute('value');
			if (optionValue !== activeValue) {
				historicalValue = optionValue;
				break;
			}
		}
		const [historicalResponse] = await Promise.all([
			page.waitForResponse((response) =>
				/\/api\/studentvue\/gradebook\?reportPeriod=\d+/.test(response.url())
			),
			reportPeriodMenu.selectOption(historicalValue ?? '')
		]);
		expect(historicalResponse.status()).toBe(200);
		await expect(page.getByText(/Viewing grades from/)).toBeVisible({ timeout: 60_000 });
		await page.getByRole('button', { name: `Return to ${defaultPeriodName}`, exact: true }).click();
		await expect(page.getByText(/Viewing grades from/)).toBeHidden();
	} else {
		expect(await reportPeriodMenu.inputValue()).toBeTruthy();
	}

	const refreshButton = page.getByRole('button', { name: 'Refresh', exact: true });
	expect(await refreshButton.count()).toBe(1);
	const refreshStartedAt = Date.now();
	const [gradebookResponse] = await Promise.all([
		page.waitForResponse(
			(response) =>
				response.url().includes('/api/studentvue/gradebook') &&
				response.request().method() === 'GET'
		),
		refreshButton.click()
	]);
	expect(gradebookResponse.status()).toBe(200);
	record('gradebook-refresh', { durationMs: Date.now() - refreshStartedAt });
	await expect(
		page.getByText('Loading grades. StudentVUE is on the clock.', { exact: true })
	).toBeHidden();
	await expect(page.getByText('NaN', { exact: true })).toBeHidden();

	let courseCards = page.locator('main a[href^="/grades/"]');
	const courseCount = await courseCards.count();
	expect(courseCount).toBeGreaterThan(0);
	for (let index = 0; index < courseCount; index += 1) {
		courseCards = page.locator('main a[href^="/grades/"]');
		await courseCards.nth(index).click();
		await expect(page).toHaveURL(/\/grades\/\d+$/);
		await expect(page.getByLabel('Hypothetical Mode')).toBeVisible();
		await expect(page.getByText('NaN', { exact: true })).toBeHidden();
		await expect(page.getByText('Something went wrong')).toHaveCount(0);
		await expect(page.getByText('Grade calculation error', { exact: true })).toHaveCount(0);
		const trendState = page.locator('[data-testid^="grade-trend-"]');
		await expect(trendState).toHaveCount(1);
		await expect(trendState).toBeVisible();
		const gradesLink = page.getByRole('link', { name: 'Grades', exact: true });
		expect(await gradesLink.count()).toBe(1);
		await gradesLink.click();
		await expect(page).toHaveURL(/\/grades$/);
	}
	expect(pageErrors).toEqual([]);
});

test('1bc — a stale class link fails safely instead of opening the wrong class', async () => {
	await page.goto('/grades/not-a-real-course');
	await expect(page.getByText('This class is no longer in this grading period.')).toBeVisible();
	await expect(page.getByRole('link', { name: 'Back to Grades', exact: true })).toBeVisible();
	await expect(page.getByText('Something went wrong')).toHaveCount(0);
	await page.getByRole('link', { name: 'Back to Grades', exact: true }).click();
	await expect(page).toHaveURL(/\/grades$/);
});

test('1ba — authenticated student screens meet WCAG A/AA', async () => {
	for (const path of ['/grades', '/attendance', '/documents', '/mail', '/studentinfo']) {
		await page.goto(path);
		await page.waitForLoadState('networkidle');
		await expect(page.getByText('Something went wrong')).toHaveCount(0);
		await expectWcagAA();
	}

	await page.goto('/grades');
	const courseLinks = page.locator('main a[href^="/grades/"]');
	expect(await courseLinks.count()).toBeGreaterThan(0);
	await courseLinks.first().click();
	await expect(page.getByLabel('Hypothetical Mode')).toBeVisible();
	await expectWcagAA();
	await page.goto('/grades');
});

test('1bb — grade refresh behaves correctly when the network is slow, fails, and returns changed data', async () => {
	const gradebookPattern = '**/api/studentvue/gradebook*';
	const courseCards = page.locator('main a[href^="/grades/"]');
	const originalCourseCount = await courseCards.count();
	expect(originalCourseCount).toBeGreaterThan(0);

	let releaseSlowRequest!: () => void;
	const slowRequestMayFinish = new Promise<void>((resolve) => {
		releaseSlowRequest = resolve;
	});
	await page.route(gradebookPattern, async (route) => {
		await slowRequestMayFinish;
		await route.continue();
	});

	let refreshButton = page.getByRole('button', { name: 'Refresh', exact: true });
	await refreshButton.click();
	await expect(page.getByRole('button', { name: 'Refreshing…', exact: true })).toBeDisabled();
	await expect(page.getByText(/Loading .* grades\.\.\./)).toBeVisible();
	expect(await courseCards.count()).toBe(originalCourseCount);
	releaseSlowRequest();
	await expect(page.getByRole('button', { name: 'Refresh', exact: true })).toBeEnabled({
		timeout: 60_000
	});
	await page.unroute(gradebookPattern);

	await page.route(gradebookPattern, async (route) => {
		await route.fulfill({
			status: 503,
			contentType: 'application/json',
			body: JSON.stringify({ message: 'Deliberate browser-test upstream failure.' })
		});
	});
	refreshButton = page.getByRole('button', { name: 'Refresh', exact: true });
	await refreshButton.click();
	const gradeErrorAlert = page
		.getByRole('alert')
		.filter({ hasText: 'An error occurred while loading grades.' });
	await expect(gradeErrorAlert).toBeVisible();
	await expect(
		gradeErrorAlert.getByText('Deliberate browser-test upstream failure.', { exact: true })
	).toBeVisible();
	await expect(refreshButton).toBeEnabled();
	expect(await courseCards.count()).toBe(originalCourseCount);
	await page.unroute(gradebookPattern);

	await page.route(gradebookPattern, async (route) => {
		const response = await route.fetch();
		const body = (await response.json()) as { xml: string };
		body.xml = body.xml.replace(/CourseName="[^"]+"/, 'CourseName="REFRESH PROBE"');
		await route.fulfill({ response, json: body });
	});
	await page.getByRole('button', { name: 'Refresh', exact: true }).click();
	const refreshProbeCourse = page
		.locator('main a[href^="/grades/"]')
		.filter({ hasText: 'REFRESH PROBE' });
	await expect(refreshProbeCourse).toBeVisible({ timeout: 60_000 });
	await page.unroute(gradebookPattern);

	// Restore live portal data so every later journey uses the student's real record.
	await page.getByRole('button', { name: 'Refresh', exact: true }).click();
	await expect(refreshProbeCourse).toBeHidden({ timeout: 60_000 });
	await expect(
		page.getByText('An error occurred while loading grades.', { exact: true })
	).toBeHidden();
});

test('1c — the complete modern StudentVUE API returns every read-only contract', async () => {
	const clientSessionId = await page.evaluate(() => {
		const value = JSON.parse(localStorage.getItem('token') ?? '{}') as { sessionId?: unknown };
		return typeof value.sessionId === 'string' ? value.sessionId : '';
	});
	expect(clientSessionId).not.toBe('');
	const unbound = await page.evaluate(async () =>
		fetch('/api/studentvue/capabilities', { headers: { Accept: 'application/json' } }).then(
			(response) => response.status
		)
	);
	expect(unbound).toBe(401);

	const fetchJson = async (path: string) => {
		const startedAt = Date.now();
		const response = await page.evaluate(
			async ({ requestPath, sessionId }) => {
				const result = await fetch(requestPath, {
					headers: { Accept: 'application/json', 'X-Grademaxxing-Session': sessionId }
				});
				return { status: result.status, body: await result.json() };
			},
			{ requestPath: path, sessionId: clientSessionId }
		);
		expect(response.status, path).toBe(200);
		record('modern-api', { path: path.split('?')[0], durationMs: Date.now() - startedAt });
		return response.body as Record<string, any>;
	};

	const capabilities = await fetchJson('/api/studentvue/capabilities');
	expect(capabilities.transport).toBe('HTTPS JSON');
	expect(Object.keys(capabilities.resources)).toHaveLength(15);

	const attendance = await fetchJson('/api/studentvue/attendance-details');
	expect(attendance.attendanceData.Calendar.attData.length).toBeGreaterThan(0);
	expect(Array.isArray(attendance.courses)).toBeTruthy();

	const calendar = await fetchJson('/api/studentvue/calendar?month=8&year=2026');
	expect(Array.isArray(calendar.events)).toBeTruthy();
	for (const event of calendar.events) expect(event.date).toMatch(/^8\/\d{1,2}\/2026$/);

	const profile = await fetchJson('/api/studentvue/student-profile');
	expect(profile.name).not.toBe('');
	expect(Object.keys(profile.fields).length).toBeGreaterThan(0);

	const reportCards = await fetchJson('/api/studentvue/report-cards');
	expect(reportCards.transcript).toHaveProperty('enrollments');
	expect(Array.isArray(reportCards.documents)).toBeTruthy();

	const schedule = await fetchJson('/api/studentvue/schedule');
	expect(Array.isArray(schedule.classes)).toBeTruthy();
	for (const course of schedule.classes) {
		expect(course.courseTitle).not.toBe('');
		expect(course.room).not.toBe('');
	}

	const school = await fetchJson('/api/studentvue/school-info');
	expect(school.name).not.toBe('');
	expect(Object.keys(school.fields).length).toBeGreaterThan(0);

	const mailbox = await fetchJson('/api/studentvue/mailbox');
	expect(Array.isArray(mailbox.folders)).toBeTruthy();
	expect(Array.isArray(mailbox.messages)).toBeTruthy();
	if (mailbox.messages.length) {
		const message = mailbox.messages.find(
			(item: Record<string, unknown>) => typeof item.messagePersonId === 'string'
		);
		if (message) {
			const query = new URLSearchParams({
				id: message.messagePersonId,
				system: String(Boolean(message.isSystemMessage))
			});
			const detail = await fetchJson(`/api/studentvue/message?${query}`);
			expect(detail).toHaveProperty('subject');
		}
	}
});

test('2 — a student opens a course and uses the grade-planning controls', async () => {
	let courseCards = page.locator('main a[href^="/grades/"]');
	const courseCount = await courseCards.count();
	expect(courseCount).toBeGreaterThan(0);
	let foundAssignments = false;
	for (let index = 0; index < courseCount; index += 1) {
		courseCards = page.locator('main a[href^="/grades/"]');
		await courseCards.nth(index).click();
		await expect(page).toHaveURL(/\/grades\/\d+$/);
		await expect(page.getByLabel('Hypothetical Mode')).toBeVisible();
		const assignmentCards = page.locator('[role="tabpanel"] li');
		if (await assignmentCards.count()) {
			foundAssignments = true;
			break;
		}
		const gradesLink = page.getByRole('link', { name: 'Grades', exact: true });
		expect(await gradesLink.count()).toBe(1);
		await gradesLink.click();
		await expect(page).toHaveURL(/\/grades$/);
	}
	expect(foundAssignments).toBeTruthy();

	await expect(page).toHaveURL(/\/grades\/\d+$/);
	await expect(page.getByText('Something went wrong')).toHaveCount(0);
	await expect(page.getByText(/^Official · synced /)).toBeVisible();
	const assignmentTabs = page.getByRole('tab');
	const assignmentTabCount = await assignmentTabs.count();
	expect(assignmentTabCount).toBeGreaterThan(0);
	for (let index = 0; index < assignmentTabCount; index += 1) {
		await assignmentTabs.nth(index).click();
		await expect(page.getByRole('tabpanel')).toBeVisible();
	}

	await page.getByLabel('Hypothetical Mode').check();
	await expect(page.getByText('Simulation · not official', { exact: true })).toBeVisible();
	await expect(
		page.getByRole('button', { name: 'Target Grade Calculator', exact: true })
	).toBeVisible();
	const whatIfForm = page.getByRole('form', { name: 'Add what-if assignment', exact: true });
	await expect(whatIfForm).toBeVisible();

	await whatIfForm.getByLabel('What-if score', { exact: true }).fill('8');
	await whatIfForm.getByLabel('What-if points possible', { exact: true }).fill('10');
	await whatIfForm.getByRole('button', { name: 'Add', exact: true }).click();
	await expect(
		page.getByText('What-if 1', { exact: true }).filter({ visible: true }).first()
	).toBeVisible();

	const earnedInputs = page.locator('input[title="Points earned"]');
	const possibleInputs = page.locator('input[title="Points possible"]');
	expect(await earnedInputs.count()).toBeGreaterThan(0);
	expect(await possibleInputs.count()).toBeGreaterThan(0);
	await earnedInputs.nth(0).fill('8');
	await possibleInputs.nth(0).fill('10');

	await page.getByRole('button', { name: 'Target Grade Calculator', exact: true }).click();
	await expect(
		page.getByRole('region', { name: 'Target Grade Calculator', exact: true })
	).toBeVisible();
	await page.getByRole('button', { name: 'Select', exact: true }).click();
	await expect(page.getByRole('dialog')).toBeVisible();
	const assignmentChoices = page.getByRole('radio');
	expect(await assignmentChoices.count()).toBeGreaterThan(0);
	await assignmentChoices.nth(0).check();
	await page.keyboard.press('Escape');
	await expect(page.getByRole('dialog')).toBeHidden();

	await page.getByRole('button', { name: 'Reset', exact: true }).click();
	await page.getByLabel('Hypothetical Mode').uncheck();
	await expect(page.getByText(/^Official · synced /)).toBeVisible();
	expect(pageErrors).toEqual([]);
});

test('3 — a student reviews attendance and refreshes it', async () => {
	const attendanceLink = page.getByRole('link', { name: 'Attendance', exact: true });
	expect(await attendanceLink.count()).toBe(1);
	await attendanceLink.click();
	await expect(page).toHaveURL(/\/attendance$/);
	await expect(page.getByText('Loading attendance records…', { exact: true })).toBeHidden();
	await expect(page.getByText('Something went wrong')).toHaveCount(0);

	const refreshButton = page.getByRole('button', { name: 'Refresh', exact: true });
	expect(await refreshButton.count()).toBe(1);
	let releaseAttendance!: () => void;
	const allowAttendance = new Promise<void>((resolve) => {
		releaseAttendance = resolve;
	});
	await page.route('**/api/studentvue/attendance', async (route) => {
		await allowAttendance;
		await route.continue();
	});
	await refreshButton.click();
	await expect(page.getByText('Refreshing attendance…', { exact: true })).toBeVisible();
	await expect(page.getByRole('button', { name: 'Refreshing…', exact: true })).toBeDisabled();
	releaseAttendance();
	await expect(page.getByText('Refreshing attendance…', { exact: true })).toBeHidden({
		timeout: 60_000
	});
	await page.unroute('**/api/studentvue/attendance');

	await page.route('**/api/studentvue/attendance', async (route) => {
		await route.fulfill({
			status: 502,
			contentType: 'application/json',
			body: JSON.stringify({ message: 'Deliberate attendance browser-test failure.' })
		});
	});
	await page.getByRole('button', { name: 'Refresh', exact: true }).click();
	await expect(page.getByText("Couldn't load attendance.", { exact: true })).toBeVisible();
	await expect(
		page.getByText('Deliberate attendance browser-test failure.', { exact: true })
	).toBeVisible();
	await page.unroute('**/api/studentvue/attendance');
	await page.getByRole('button', { name: 'Try again', exact: true }).click();
	await expect(page.getByText("Couldn't load attendance.", { exact: true })).toBeHidden({
		timeout: 60_000
	});
	await expect(page.getByRole('button', { name: 'Refresh', exact: true })).toBeEnabled();
	expect(pageErrors).toEqual([]);
});

test('4 — a student reviews documents and opens an available document', async () => {
	const documentsLink = page.getByRole('link', { name: 'Documents', exact: true });
	expect(await documentsLink.count()).toBe(1);
	await documentsLink.click();
	await expect(page).toHaveURL(/\/documents$/);
	await expect(
		page.getByText('Loading documents. Filing cabinet mode.', { exact: true })
	).toBeHidden();
	await expect(page.getByText('Something went wrong')).toHaveCount(0);
	await expect(page.getByRole('tab', { name: 'All', exact: true })).toBeVisible();

	const documentLinks = page.locator('main a[href^="/documents/document?"]');
	const documentCount = await documentLinks.count();
	if (documentCount > 0) {
		const popupPromise = context.waitForEvent('page');
		await documentLinks.first().click();
		const documentPage = await popupPromise;
		await documentPage.waitForLoadState('domcontentloaded');
		expect(documentPage.url()).toContain('/documents/document?documentGU=');
		await documentPage.close();
	} else
		await expect(page.getByRole('status')).toHaveText('No student documents are available yet.');

	if (documentCount > 0) {
		await page.route('**/api/studentvue/documents', async (route) => {
			const response = await route.fetch();
			const payload = await response.json();
			const records = payload.StudentDocumentDatas?.StudentDocumentData;
			if (Array.isArray(records) && records[0]) records[0]._DocumentDate = '';
			await route.fulfill({ response, json: payload });
		});
		await page.getByRole('button', { name: 'Refresh', exact: true }).click();
		await expect(page.getByText('Date unavailable').first()).toBeVisible();
		await expect(page.getByText('Something went wrong')).toHaveCount(0);
		await page.unroute('**/api/studentvue/documents');
		await page.getByRole('button', { name: 'Refresh', exact: true }).click();

		await page.route('**/api/studentvue/documents', async (route) => {
			await route.fulfill({
				status: 502,
				contentType: 'application/json',
				body: JSON.stringify({ message: 'Deliberate documents browser-test failure.' })
			});
		});
		await page.getByRole('button', { name: 'Refresh', exact: true }).click();
		await expect(page.getByText("Couldn't load documents.", { exact: true })).toBeVisible();
		await expect(
			page.getByText('Deliberate documents browser-test failure.', { exact: true })
		).toBeVisible();
		await page.unroute('**/api/studentvue/documents');
		await page.getByRole('button', { name: 'Try again', exact: true }).click();
		await expect(page.getByText("Couldn't load documents.", { exact: true })).toBeHidden();
	}
	expect(pageErrors).toEqual([]);
});

test('5 — a student reads mail and opens an available attachment', async () => {
	const mailLink = page.getByRole('link', { name: 'Mail', exact: true });
	expect(await mailLink.count()).toBe(1);
	await mailLink.click();
	await expect(page).toHaveURL(/\/mail$/);
	await expect(
		page.getByText('Loading mail. Checking the digital hallway.', { exact: true })
	).toBeHidden();
	await expect(page.getByText('Something went wrong')).toHaveCount(0);

	const inbox = page.getByRole('list', { name: 'Inbox messages', exact: true });
	if (await inbox.count()) {
		const messageButtons = inbox.getByRole('button');
		const messageCount = await messageButtons.count();
		expect(messageCount).toBeGreaterThan(0);
		let releaseMessage!: () => void;
		const allowMessage = new Promise<void>((resolve) => (releaseMessage = resolve));
		await page.route('**/api/studentvue/message?**', async (route) => {
			await allowMessage;
			await route.continue();
		});
		await messageButtons.first().click();
		await expect(page.getByText('Opening message…', { exact: true })).toBeVisible();
		await expect(messageButtons.first()).toBeDisabled();
		releaseMessage();
		const dialog = page.getByRole('dialog');
		await expect(dialog).toBeVisible();
		await page.unroute('**/api/studentvue/message?**');
		await expect(dialog.getByTitle('Message Content')).toBeVisible();

		const attachmentLinks = dialog.locator('a[href^="/mail/attachment?"]');
		const attachmentCount = await attachmentLinks.count();
		if (attachmentCount > 0) {
			const popupPromise = context.waitForEvent('page');
			await attachmentLinks.first().click();
			const attachmentPage = await popupPromise;
			await attachmentPage.waitForLoadState('domcontentloaded');
			expect(attachmentPage.url()).toContain('/mail/attachment?attachmentGU=');
			await attachmentPage.close();
		}
		await page.keyboard.press('Escape');
		await expect(dialog).toBeHidden();
		await page.route('**/api/studentvue/messages', async (route) => {
			const response = await route.fetch();
			const payload = await response.json();
			const records = payload.InboxItemListings?.MessageXML;
			if (Array.isArray(records) && records[0]) records[0]._SendDateTime = '';
			await route.fulfill({ response, json: payload });
		});
		await page.getByRole('button', { name: 'Refresh', exact: true }).click();
		await expect(page.getByText('Date unavailable').first()).toBeVisible();
		await expect(page.getByText('Something went wrong')).toHaveCount(0);
		await page.unroute('**/api/studentvue/messages');
		await page.getByRole('button', { name: 'Refresh', exact: true }).click();
	} else
		await expect(page.getByRole('status')).toContainText('Your inbox is empty. Enjoy the silence.');
	expect(pageErrors).toEqual([]);
});

test('6 — a student reviews identity details and remains signed in after reload', async () => {
	const studentInfoLink = page.locator('a[href="/studentinfo"]');
	expect(await studentInfoLink.count()).toBe(1);
	await studentInfoLink.click();
	await expect(page).toHaveURL(/\/studentinfo$/);
	await expect(page.getByText('Loading student info.', { exact: true })).toBeHidden();
	await expect(page.getByText('Something went wrong')).toHaveCount(0);
	await expect(page.getByText('Student Information', { exact: true })).toBeVisible();
	await expect(
		page
			.getByRole('img', { name: 'Student Portrait', exact: true })
			.or(page.getByLabel('Student portrait unavailable', { exact: true }))
	).toBeVisible();
	await expect(page.getByText('Login Information', { exact: true })).toBeVisible();
	await expect(page.getByText('Not stored', { exact: true })).toBeVisible();
	await expect(page.getByRole('button', { name: 'Copy username', exact: true })).toBeVisible();
	await expect(page.getByRole('button', { name: 'Copy domain', exact: true })).toBeVisible();

	await page.route('**/api/studentvue/student-info', async (route) => {
		const response = await route.fetch();
		const payload = await response.json();
		payload.PermID = null;
		payload.Grade = null;
		await route.fulfill({ response, json: payload });
	});
	await page.getByRole('button', { name: 'Refresh', exact: true }).click();
	await expect(page.getByText('Student ID unavailable', { exact: true })).toBeVisible();
	await expect(page.getByText('Grade unavailable', { exact: true })).toBeVisible();
	await expect(page.getByText('Something went wrong')).toHaveCount(0);
	await page.unroute('**/api/studentvue/student-info');
	await page.getByRole('button', { name: 'Refresh', exact: true }).click();

	await page.reload();
	await expect(page).toHaveURL(/\/studentinfo$/);
	await expect(page.getByText('Loading student info.', { exact: true })).toBeHidden();
	await expect(page.getByText('Student Information', { exact: true })).toBeVisible();
	await expect(page.getByText('Something went wrong')).toHaveCount(0);
	expect(pageErrors).toEqual([]);
});

test('6b — a student can read privacy information and reach feedback', async () => {
	const privacyLink = page.locator('a[href="/privacy"]');
	expect(await privacyLink.count()).toBe(1);
	await privacyLink.click();
	await expect(page).toHaveURL(/\/privacy$/);
	await expect(
		page.getByText('How Grademaxxing handles your information', { exact: true })
	).toBeVisible();
	await expect(
		page.getByText('Your password is not written to disk', { exact: false })
	).toBeVisible();
	await page.goBack();
	await expect(page).toHaveURL(/\/studentinfo$/);

	const feedbackLinks = page.locator('a[href="/feedback"]');
	const feedbackLinkCount = await feedbackLinks.count();
	expect(feedbackLinkCount).toBeGreaterThan(0);
	await feedbackLinks.first().click();
	await expect(page).toHaveURL(/\/feedback$/);
	await expect(page.getByRole('heading', { name: 'Feedback', exact: true })).toBeVisible();
	await expect(
		page.getByText(
			'The page is ready for a support channel, but it will not pretend to send a message until a real feedback destination is configured.',
			{
				exact: true
			}
		)
	).toBeVisible();
	await page.goBack();
	await expect(page).toHaveURL(/\/studentinfo$/);
	expect(pageErrors).toEqual([]);
});

test('7 — a student logs out and receives a safe visible sign-in error', async () => {
	const accountMenu = page.getByRole('button', { name: 'Account menu', exact: true });
	expect(await accountMenu.count()).toBe(1);
	await accountMenu.click();
	const logoutButton = page.getByRole('menuitem', { name: 'Log Out', exact: true });
	expect(await logoutButton.count()).toBe(1);
	await logoutButton.click();
	await expect(page).toHaveURL(/\/login$/);

	await page.reload();
	await expect(page).toHaveURL(/\/login$/);
	await page.goto('/grades');
	await expect(page).toHaveURL(/\/login$/);

	await page.getByLabel('StudentVUE Username').fill('student@example.invalid');
	await page.getByLabel('StudentVUE Password').fill('not-a-real-password');
	await page.getByLabel('StudentVUE Domain').fill('example.com');
	await page.getByRole('checkbox', { name: /independent, unofficial tool/i }).check();
	expectingInvalidLoginFailure = true;
	await page.getByRole('button', { name: 'Log in', exact: true }).click();
	await expect(page.getByText('That password was wrong.', { exact: true })).toBeVisible();
	await expect(
		page.getByText('Use a supported HTTPS StudentVUE district portal URL.', { exact: true })
	).toBeVisible();
	expectingInvalidLoginFailure = false;
	await expect(page.getByRole('button', { name: 'Log in', exact: true })).toBeEnabled();
	await expect(page).toHaveURL(/\/login$/);
	expect(pageErrors).toEqual([]);
});

test('7b — an expired StudentVUE session preserves cached grades and offers reconnect', async () => {
	const expiryContext = await browser.newContext({ viewport: { width: 1280, height: 800 } });
	const expiryPage = await expiryContext.newPage();
	try {
		await expiryPage.goto('/login');
		await expiryPage.getByLabel('StudentVUE Username').fill(username!);
		await expiryPage.getByLabel('StudentVUE Password').fill(password!);
		await expiryPage.getByRole('checkbox', { name: /independent, unofficial tool/i }).check();
		if (new URL(district!).host !== 'ca-pleas-psv.edupoint.com') {
			await expiryPage.getByLabel('StudentVUE Domain').fill(new URL(district!).origin);
		}
		await expiryPage.getByRole('button', { name: 'Log in', exact: true }).click();
		await expect(expiryPage).toHaveURL(/\/grades$/, { timeout: 60_000 });
		await expiryPage.goto('/grades');
		await expect(expiryPage.getByText(/Loading .* grades\.\.\./)).toBeHidden({ timeout: 60_000 });

		await expiryPage.route('**/api/studentvue/gradebook*', async (route) => {
			await route.fulfill({
				status: 401,
				contentType: 'application/json',
				body: JSON.stringify({
					code: 'UPSTREAM_SESSION_EXPIRED',
					message: 'Reconnect to StudentVUE to update your school data.'
				})
			});
		});
		await expiryPage.getByRole('button', { name: 'Refresh', exact: true }).click();
		await expect(expiryPage).toHaveURL(/\/grades$/, { timeout: 15_000 });
		await expect(expiryPage.getByTestId('studentvue-reconnect-banner')).toBeVisible();
		await expect(
			expiryPage.getByText('Grades are saved on this device', { exact: true })
		).toBeVisible();
		const token = await expiryPage.evaluate(() => localStorage.getItem('token'));
		expect(token).not.toBeNull();
	} finally {
		await expiryContext.close();
	}
});

test('8 — a student can navigate the full app at phone width', async () => {
	const mobileContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
	const mobilePage = await mobileContext.newPage();
	mobilePage.setDefaultTimeout(15_000);
	mobilePage.setDefaultNavigationTimeout(30_000);
	const mobileErrors: string[] = [];
	let mobileTraceStarted = false;
	mobilePage.on('pageerror', (error) => {
		const message = redact(error.message);
		mobileErrors.push(message);
		record('page-error', { surface: 'mobile', message });
	});
	mobilePage.on('console', (message) => {
		if (message.type() === 'error' || message.type() === 'warning')
			record('console', {
				surface: 'mobile',
				level: message.type(),
				message: redact(message.text())
			});
	});
	mobilePage.on('requestfailed', (request) =>
		record('request-failed', {
			surface: 'mobile',
			method: request.method(),
			url: safeUrl(request.url()),
			reason: redact(request.failure()?.errorText ?? 'unknown')
		})
	);
	mobilePage.on('response', (response) => {
		if (response.status() >= 400)
			record('http-error', {
				surface: 'mobile',
				method: response.request().method(),
				status: response.status(),
				url: safeUrl(response.url())
			});
	});
	mobilePage.on('framenavigated', (frame) => {
		if (frame === mobilePage.mainFrame())
			record('navigation', { surface: 'mobile', url: safeUrl(frame.url()) });
	});

	try {
		record('mobile-step', { step: 'open-login' });
		await mobilePage.goto('/login');
		await mobilePage.getByLabel('StudentVUE Username').fill(username!);
		await mobilePage.getByLabel('StudentVUE Password').fill(password!);
		await mobilePage.getByRole('checkbox', { name: /independent, unofficial tool/i }).check();
		if (new URL(district!).host !== 'ca-pleas-psv.edupoint.com') {
			await mobilePage.getByLabel('StudentVUE Domain').fill(new URL(district!).origin);
		}
		await mobilePage.getByRole('button', { name: 'Log in', exact: true }).click();
		record('mobile-step', { step: 'submitted-login' });
		await expect(mobilePage).toHaveURL(/\/grades$/, { timeout: 60_000 });
		await expect(mobilePage.getByText('GPA and rank', { exact: true })).toBeVisible();
		await mobileContext.tracing.start({ screenshots: true, snapshots: true, sources: true });
		mobileTraceStarted = true;
		record('mobile-step', { step: 'signed-in' });

		const attendanceLink = mobilePage
			.getByRole('navigation', { name: 'Mobile navigation' })
			.getByRole('link', { name: 'Attendance', exact: true });
		expect(await attendanceLink.count()).toBe(1);
		await attendanceLink.click();
		record('mobile-step', { step: 'opened-attendance' });
		await expect(mobilePage).toHaveURL(/\/attendance$/);
		record('mobile-step', { step: 'attendance-url-confirmed' });
		await mobilePage.screenshot({
			path: `${diagnosticsDirectory}/mobile-attendance.png`,
			fullPage: true
		});
		await expect(mobilePage.getByText('Loading attendance records…', { exact: true })).toBeHidden();
		record('mobile-step', { step: 'attendance-loaded' });

		const gradesLink = mobilePage
			.getByRole('navigation', { name: 'Mobile navigation' })
			.getByRole('link', { name: 'Grades', exact: true });
		expect(await gradesLink.count()).toBe(1);
		await gradesLink.click();
		record('mobile-step', { step: 'returned-to-grades' });
		await expect(mobilePage).toHaveURL(/\/grades$/);

		const courseCards = mobilePage.locator('main a[href^="/grades/"]');
		const courseCardCount = await courseCards.count();
		expect(courseCardCount).toBeGreaterThan(0);
		await courseCards.first().click();
		record('mobile-step', { step: 'opened-course' });
		await expect(mobilePage).toHaveURL(/\/grades\/[^/]+$/);
		await expect(mobilePage.getByLabel('Hypothetical Mode')).toBeVisible();
		await expect(mobilePage.getByText('NaN', { exact: true })).toBeHidden();
		await expect(mobilePage.getByText('Something went wrong')).toHaveCount(0);

		await mobilePage.goto('/studentinfo');
		await expect(mobilePage.getByText('Loading student info.', { exact: true })).toBeHidden();
		await mobilePage.getByRole('button', { name: 'Developer Tools', exact: true }).click();
		const overflow = await mobilePage.evaluate(() => ({
			viewport: window.innerWidth,
			document: document.documentElement.scrollWidth,
			body: document.body.scrollWidth
		}));
		expect(overflow.document).toBeLessThanOrEqual(overflow.viewport);
		expect(overflow.body).toBeLessThanOrEqual(overflow.viewport);
		expect(mobileErrors).toEqual([]);
	} catch (error) {
		record('mobile-step', {
			step: 'failed',
			message: redact(error instanceof Error ? error.message : String(error))
		});
		await mobilePage
			.screenshot({ path: `${diagnosticsDirectory}/mobile-failure.png`, fullPage: true })
			.catch(() => undefined);
		throw error;
	} finally {
		record('mobile-step', { step: 'cleanup', traceStarted: mobileTraceStarted });
		if (mobileTraceStarted)
			await mobileContext.tracing.stop({ path: `${diagnosticsDirectory}/mobile-trace.zip` });
		await mobileContext.close();
	}
});
