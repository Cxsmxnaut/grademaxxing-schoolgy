import { expect, test, type Page } from '@playwright/test';

const username = 'cache-preview';
const domain = 'ca-pleas-psv.edupoint.com';
const xml = `<Gradebook><ReportingPeriod Index="0" GradePeriod="Quarter 1"/><ReportingPeriods><ReportPeriod Index="0" GradePeriod="Quarter 1"/></ReportingPeriods><Courses><Course CourseID="cache" CourseName="Cache Preview" Period="1" Staff="Example Teacher" Room="101"><Marks><Mark MarkName="Quarter 1" CalculatedScoreRaw="94" CalculatedScoreString="A"><Assignments><Assignment GradebookID="cache-assignment" Measure="Saved assignment" Type="Homework" Date="9/1/2026" DueDate="9/1/2026" Point="94" PointPossible="100"/></Assignments></Mark></Marks></Course></Courses></Gradebook>`;
const summaryXml = xml.replace(/<Assignments>.*?<\/Assignments>/, '<Assignments/>');

function gate() {
	let release!: () => void;
	const promise = new Promise<void>((resolve) => (release = resolve));
	return { promise, release };
}

async function mockSession(page: Page) {
	await page.route('**/api/session', (route) =>
		route.fulfill({
			json: { username, domain, sessionId: 'cache-session' }
		})
	);
	await page.route('**/api/session/status', (route) =>
		route.fulfill({ json: { signedIn: true, username, domain } })
	);
	await page.route('**/api/session/keepalive', (route) =>
		route.fulfill({ json: { signedIn: true, updatedAt: Date.now() } })
	);
	await page.route('**/api/studentvue/student-info', (route) =>
		route.fulfill({ json: { FormattedName: 'Cache Preview', Grade: 10, Photo: '' } })
	);
}

async function seedCache(
	page: Page,
	ageMinutes: number,
	signedIn = true,
	lastCheckedAgeMinutes?: number
) {
	await page.addInitScript(
		({ xml, username, domain, ageMinutes, signedIn, lastCheckedAgeMinutes }) => {
			if (localStorage.getItem('gradebook5') !== null) return;
			localStorage.setItem(
				'gradebook5',
				JSON.stringify({
					version: 6,
					owner: `${domain}\n${username}`,
					defaultIndex: 0,
					overrideIndex: null,
					recordCache: [
						{
							xml,
							lastRefresh: Date.now() - ageMinutes * 60_000,
							lastChecked:
								lastCheckedAgeMinutes === undefined
									? undefined
									: Date.now() - lastCheckedAgeMinutes * 60_000,
							detailed: true
						}
					]
				})
			);
			if (signedIn)
				localStorage.setItem(
					'token',
					JSON.stringify({ username, domain, sessionId: 'cache-session' })
				);
		},
		{ xml, username, domain, ageMinutes, signedIn, lastCheckedAgeMinutes }
	);
}

async function expectSavedGrades(page: Page) {
	await expect(page.getByRole('heading', { level: 1, name: 'Gradebook' })).toBeVisible();
	await expect(page.getByRole('link', { name: /Cache Preview/ }).last()).toBeVisible();
	await expect(page.getByText('Saved assignment', { exact: true })).toBeVisible();
	await expect(page.getByTestId('post-login-loading')).toHaveCount(0);
	await expect(page.getByText('StudentVUE is on the clock.', { exact: false })).toHaveCount(0);
}

test('a cold protected-route load uses the full-screen loader and persists the complete cache', async ({
	page
}) => {
	await page.setViewportSize({ width: 1440, height: 900 });
	await mockSession(page);
	await page.addInitScript(
		({ username, domain }) => {
			localStorage.setItem(
				'token',
				JSON.stringify({ username, domain, sessionId: 'cache-session' })
			);
		},
		{ username, domain }
	);
	const responseGate = gate();
	let requests = 0;
	await page.route('**/api/studentvue/gradebook*', async (route) => {
		requests += 1;
		expect(new URL(route.request().url()).searchParams.has('summary')).toBe(false);
		await responseGate.promise;
		await route.fulfill({ json: { xml, detailed: true } });
	});
	await page.goto('/grades');
	await expect(page.getByTestId('post-login-loading')).toBeVisible();
	await expect(page.getByText('StudentVUE is on the clock.', { exact: false })).toHaveCount(0);
	await page.screenshot({ path: 'test-results/cache-loading-desktop.png' });
	await page.setViewportSize({ width: 390, height: 844 });
	await expect(page.getByTestId('post-login-loading')).toBeVisible();
	expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
	await page.screenshot({ path: 'test-results/cache-loading-phone.png' });
	responseGate.release();
	await expect(page.getByRole('heading', { name: 'Gradebook', level: 1 })).toBeVisible();
	await expect.poll(() => page.evaluate(() => localStorage.getItem('gradebook5'))).not.toBeNull();
	await page.reload();
	await expect(page.getByRole('heading', { name: 'Gradebook', level: 1 })).toBeVisible();
	expect(requests).toBe(1);
});

test('hours-old cached grades stay visible while the full refresh waits, with the sidebar orb active', async ({
	page
}) => {
	await page.setViewportSize({ width: 1440, height: 900 });
	await mockSession(page);
	await seedCache(page, 120);
	const responseGate = gate();
	const requested = gate();
	await page.route('**/api/studentvue/gradebook*', async (route) => {
		expect(new URL(route.request().url()).searchParams.has('summary')).toBe(false);
		requested.release();
		await responseGate.promise;
		await route.fulfill({ json: { xml, detailed: true } });
	});
	await page.goto('/grades');
	await requested.promise;
	await expectSavedGrades(page);
	const refresh = page.getByTestId('sidebar-refresh');
	await expect(refresh).toHaveAttribute('aria-busy', 'true');
	await expect(refresh.getByTestId('thinking-orb')).toHaveAttribute('data-state', 'searching');
	await expect(refresh).toBeDisabled();
	await page.screenshot({ path: 'test-results/cached-gradebook-refresh.png' });
	responseGate.release();
	await expect(refresh).toHaveAttribute('aria-busy', 'false');
});

test('an unchanged summary keeps assignments and records its check without duplicate refreshes', async ({
	page
}) => {
	await page.setViewportSize({ width: 1440, height: 900 });
	await mockSession(page);
	await seedCache(page, 10);
	const responseGate = gate();
	const requested = gate();
	let requests = 0;
	await page.route('**/api/studentvue/gradebook*', async (route) => {
		requests += 1;
		expect(new URL(route.request().url()).searchParams.get('summary')).toBe('true');
		requested.release();
		await responseGate.promise;
		await route.fulfill({ json: { xml: summaryXml, detailed: false } });
	});
	await page.goto('/grades');
	await requested.promise;
	await expectSavedGrades(page);
	responseGate.release();
	await expect(page.getByTestId('sidebar-refresh')).toHaveAttribute('aria-busy', 'false');
	await expectSavedGrades(page);
	const cache = await page.evaluate(() => JSON.parse(localStorage.getItem('gradebook5')!));
	expect(cache.recordCache[0].xml).toBe(xml);
	expect(cache.recordCache[0].lastChecked).toBeGreaterThan(cache.recordCache[0].lastRefresh);
	await page.reload();
	await expectSavedGrades(page);
	await expect(page.getByTestId('sidebar-refresh')).toHaveAttribute('aria-busy', 'false');
	expect(requests).toBe(1);
});

test('a recent summary check does not postpone the complete assignment refresh', async ({
	page
}) => {
	await mockSession(page);
	await seedCache(page, 31, true, 1);
	const requested = gate();
	await page.route('**/api/studentvue/gradebook*', (route) => {
		expect(new URL(route.request().url()).searchParams.has('summary')).toBe(false);
		requested.release();
		return route.fulfill({ json: { xml, detailed: true } });
	});
	await page.goto('/grades');
	await requested.promise;
	await expectSavedGrades(page);
	await expect(page.getByTestId('sidebar-refresh')).toHaveAttribute('aria-busy', 'false');
	const cache = await page.evaluate(() => JSON.parse(localStorage.getItem('gradebook5')!));
	expect(cache.recordCache[0].lastChecked).toBeUndefined();
	expect(Date.now() - cache.recordCache[0].lastRefresh).toBeLessThan(60_000);
});

test('a failed background refresh retains cached grades and releases the sidebar orb', async ({
	page
}) => {
	await page.setViewportSize({ width: 1440, height: 900 });
	await mockSession(page);
	await seedCache(page, 10);
	const responseGate = gate();
	const requested = gate();
	await page.route('**/api/studentvue/gradebook*', async (route) => {
		requested.release();
		await responseGate.promise;
		await route.fulfill({
			status: 503,
			json: { message: 'StudentVUE is temporarily unavailable.', code: 'UPSTREAM_UNAVAILABLE' }
		});
	});
	await page.goto('/grades');
	await requested.promise;
	await expectSavedGrades(page);
	await expect(page.getByTestId('sidebar-refresh')).toHaveAttribute('aria-busy', 'true');
	responseGate.release();
	await expect(page.getByTestId('gradebook-stale-indicator')).toBeVisible();
	await expect(page.getByTestId('sidebar-refresh')).toHaveAttribute('aria-busy', 'false');
	await expectSavedGrades(page);
	const cache = await page.evaluate(() => JSON.parse(localStorage.getItem('gradebook5')!));
	expect(cache.recordCache[0].xml).toBe(xml);
	expect(cache.recordCache[0].lastChecked).toBeUndefined();
});

for (const sameStudent of [true, false]) {
	test(`re-login with no saved token ${sameStudent ? 'restores the same student cache immediately' : 'discards another student cache'}`, async ({
		page
	}) => {
		await page.setViewportSize({ width: 1440, height: 900 });
		await mockSession(page);
		await seedCache(page, 10, false);
		if (!sameStudent) {
			await page.route('**/api/session', (route) =>
				route.fulfill({ json: { username: 'other-preview', domain, sessionId: 'other-session' } })
			);
			await page.route('**/api/session/status', (route) =>
				route.fulfill({ json: { signedIn: true, username: 'other-preview', domain } })
			);
		}
		const responseGate = gate();
		const requested = gate();
		await page.route('**/api/studentvue/gradebook*', async (route) => {
			expect(new URL(route.request().url()).searchParams.get('summary')).toBe(
				sameStudent ? 'true' : null
			);
			requested.release();
			await responseGate.promise;
			await route.fulfill({
				json: {
					xml: sameStudent ? summaryXml : xml.replaceAll('Cache Preview', 'Other Preview'),
					detailed: !sameStudent
				}
			});
		});
		await page.goto('/login');
		await page.getByLabel('StudentVUE email').fill(sameStudent ? username : 'other-preview');
		await page.getByLabel('StudentVUE Password').fill('synthetic-password');
		await page.getByLabel('Keep me signed in on this device').uncheck();
		await page.getByRole('button', { name: 'Log in', exact: true }).click();
		await requested.promise;
		if (sameStudent) {
			await expect(page).toHaveURL(/\/grades$/);
			await expectSavedGrades(page);
		} else {
			await expect(page).toHaveURL(/\/login$/);
			await expect(page.getByTestId('post-login-loading')).toBeVisible();
			await expect(page.getByText('Cache Preview', { exact: true })).toHaveCount(0);
		}
		responseGate.release();
		await expect(page).toHaveURL(/\/grades$/);
		await expect(page.getByTestId('sidebar-refresh')).toHaveAttribute('aria-busy', 'false');
	});
}
