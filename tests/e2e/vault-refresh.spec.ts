import { expect, test, type Page, type Route } from '@playwright/test';

const username = 'vault-refresh-preview';
const domain = 'ca-pleas-psv.edupoint.com';
const password = 'synthetic-vault-password';

function gradebookXml(index = 0, assignment = 'Saved assignment', score = 94) {
	return `<Gradebook><ReportingPeriod Index="${index}" GradePeriod="Quarter ${index + 1}"/><ReportingPeriods><ReportPeriod Index="0" GradePeriod="Quarter 1"/><ReportPeriod Index="1" GradePeriod="Quarter 2"/></ReportingPeriods><Courses><Course CourseID="vault-refresh" CourseName="Vault Refresh Preview" Period="1" Staff="Example Teacher" Room="101"><Marks><Mark MarkName="Quarter ${index + 1}" CalculatedScoreRaw="${score}" CalculatedScoreString="A"><Assignments><Assignment GradebookID="vault-refresh-assignment" Measure="${assignment}" Type="Homework" Date="9/1/2026" DueDate="9/1/2026" Point="${score}" PointPossible="100"/></Assignments></Mark></Marks></Course></Courses></Gradebook>`;
}

function gate() {
	let release!: () => void;
	const promise = new Promise<void>((resolve) => (release = resolve));
	return { promise, release };
}

async function mockPortal(page: Page) {
	const state = {
		loginRequests: 0,
		rejectLogin: false,
		expireStatus: false,
		loginResponse: undefined as Promise<void> | undefined,
		keepaliveError: undefined as 'APP_SESSION_INVALID' | 'UPSTREAM_SESSION_EXPIRED' | undefined,
		gradebookRequests: [] as URL[],
		gradebookResponse: undefined as
			((route: Route, parameters: URLSearchParams) => Promise<void>) | undefined
	};
	await page.route('**/api/session', async (route) => {
		if (route.request().method() !== 'POST') return route.fulfill({ status: 204 });
		state.loginRequests += 1;
		const body = route.request().postDataJSON() as { username: string; password: string };
		expect(body.username).toBe(username);
		expect(body.password).toBe(password);
		if (state.rejectLogin)
			return route.fulfill({ status: 401, json: { message: 'StudentVUE authentication failed.' } });
		await state.loginResponse;
		state.expireStatus = false;
		state.keepaliveError = undefined;
		return route.fulfill({
			json: { username, domain, sessionId: `vault-refresh-session-${state.loginRequests}` }
		});
	});
	await page.route('**/api/session/status', (route) =>
		route.fulfill({ json: { signedIn: !state.expireStatus, username, domain } })
	);
	await page.route('**/api/session/keepalive', (route) =>
		state.keepaliveError
			? route.fulfill({
					status: 401,
					json: {
						code: state.keepaliveError,
						message: 'Reconnect to StudentVUE to update your school data.'
					}
				})
			: route.fulfill({ json: { signedIn: true, updatedAt: Date.now() } })
	);
	await page.route('**/api/studentvue/**', async (route) => {
		const url = new URL(route.request().url());
		const resource = url.pathname.split('/').at(-1);
		if (resource === 'gradebook') {
			state.gradebookRequests.push(url);
			if (state.gradebookResponse) return state.gradebookResponse(route, url.searchParams);
			return route.fulfill({
				json: {
					xml: gradebookXml(Number(url.searchParams.get('reportPeriod') ?? 0)),
					detailed: true
				}
			});
		}
		const records: Record<string, unknown> = {
			attendance: {
				Absences: {},
				DailyRecords: [],
				TotalExcused: {},
				TotalTardies: {},
				TotalUnexcused: {},
				TotalActivities: {},
				TotalUnexcusedTardies: {}
			},
			documents: { StudentDocumentDatas: {} },
			messages: { InboxItemListings: { MessageXML: [] } },
			'student-info': { FormattedName: 'Vault Refresh Preview', Grade: 10, Photo: '' }
		};
		return route.fulfill({ json: records[resource ?? ''] ?? {} });
	});
	return state;
}

async function seedSavedSession(
	page: Page,
	{ token = true, vault = true, selectedPeriod = 0 } = {}
) {
	await page.goto('/login');
	await expect(page.getByLabel('StudentVUE email')).toBeVisible();
	await page.evaluate(
		async ({ username, domain, password, token, vault, selectedPeriod, xml }) => {
			const records = [0, 1].map((index) => ({
				xml: xml[index],
				lastRefresh: Date.now(),
				detailed: true
			}));
			localStorage.setItem(
				'gradebook5',
				JSON.stringify({
					version: 6,
					owner: `${domain}\n${username}`,
					defaultIndex: 0,
					overrideIndex: selectedPeriod || null,
					recordCache: records
				})
			);
			if (token)
				localStorage.setItem(
					'token',
					JSON.stringify({ username, domain, sessionId: 'expired-preview-session' })
				);
			if (!vault) return;
			const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, [
				'encrypt',
				'decrypt'
			]);
			await new Promise<void>((resolve, reject) => {
				const request = indexedDB.open('grademaxxing-vault', 1);
				request.onupgradeneeded = () => request.result.createObjectStore('keys');
				request.onerror = () => reject(request.error);
				request.onsuccess = () => {
					const database = request.result;
					const transaction = database.transaction('keys', 'readwrite');
					transaction.objectStore('keys').put(key, 'studentvue-credentials-v1');
					transaction.oncomplete = () => {
						database.close();
						resolve();
					};
					transaction.onerror = () => reject(transaction.error);
				};
			});
			const iv = crypto.getRandomValues(new Uint8Array(12));
			const ciphertext = await crypto.subtle.encrypt(
				{ name: 'AES-GCM', iv },
				key,
				new TextEncoder().encode(JSON.stringify({ username, domain, password }))
			);
			const toBase64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
			localStorage.setItem(
				'studentvueCredentials',
				JSON.stringify({ v: 1, iv: toBase64(iv), ciphertext: toBase64(new Uint8Array(ciphertext)) })
			);
		},
		{
			username,
			domain,
			password,
			token,
			vault,
			selectedPeriod,
			xml: [gradebookXml(0), gradebookXml(1)]
		}
	);
}

async function watchForLoginFlash(page: Page) {
	await page.addInitScript(() => {
		const frames = { visibleLogin: false };
		Object.assign(window, { recoveryFrames: frames });
		const inspect = () => {
			const input = document.querySelector<HTMLInputElement>('#username');
			if (input?.getClientRects().length && getComputedStyle(input).visibility !== 'hidden')
				frames.visibleLogin = true;
			requestAnimationFrame(inspect);
		};
		requestAnimationFrame(inspect);
	});
}

async function expectNoLoginFlash(page: Page) {
	expect(
		await page.evaluate(
			() =>
				(window as unknown as { recoveryFrames: { visibleLogin: boolean } }).recoveryFrames
					.visibleLogin
		)
	).toBe(false);
	await expect(page.getByLabel('StudentVUE email')).toHaveCount(0);
}

function expectLiveFullRequest(parameters: URLSearchParams, selectedPeriod?: number) {
	expect(parameters.get('fresh')).toBe('true');
	expect(parameters.has('summary')).toBe(false);
	if (selectedPeriod !== undefined)
		expect(parameters.get('reportPeriod')).toBe(String(selectedPeriod));
}

for (const entry of ['/grades', '/login']) {
	test(`vault recovery from ${entry} without a local token waits for fresh grades without flashing sign-in`, async ({
		page
	}) => {
		await page.setViewportSize({ width: 1440, height: 900 });
		const portal = await mockPortal(page);
		await seedSavedSession(page, { token: false });
		await watchForLoginFlash(page);
		const loginGate = gate();
		portal.loginResponse = loginGate.promise;
		const responseGate = gate();
		portal.gradebookResponse = async (route, parameters) => {
			expectLiveFullRequest(parameters);
			await responseGate.promise;
			await route.fulfill({
				json: { xml: gradebookXml(0, 'Fresh vault assignment', 97), detailed: true }
			});
		};
		await page.goto(entry);
		await expect.poll(() => portal.loginRequests).toBe(1);
		const recovery = page.getByTestId('session-recovery-loading');
		await expect(recovery.getByTestId('post-login-loading')).toBeVisible();
		await expect(recovery).toContainText('Saving your session…');
		await expectNoLoginFlash(page);
		loginGate.release();
		await expect.poll(() => portal.gradebookRequests.length).toBe(1);
		const loading = page.getByTestId('post-login-loading');
		await expect(loading).toBeVisible();
		await expect(recovery).toContainText('Refreshing your grades…');
		await expectNoLoginFlash(page);
		await page.screenshot({ path: 'test-results/vault-restoring-desktop.png' });
		await page.setViewportSize({ width: 390, height: 844 });
		await expect(loading).toBeVisible();
		expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
			390
		);
		await page.screenshot({ path: 'test-results/vault-restoring-phone.png' });
		responseGate.release();
		await expect(page).toHaveURL(/\/grades$/);
		await page.setViewportSize({ width: 1440, height: 900 });
		await expect(page.getByText('Fresh vault assignment', { exact: true })).toBeVisible();
		await expect(loading).toHaveCount(0);
		await expectNoLoginFlash(page);
		expect(portal.loginRequests).toBe(1);
	});
}

for (const code of ['APP_SESSION_INVALID', 'UPSTREAM_SESSION_EXPIRED'] as const) {
	test(`manual refresh recovers ${code} without a navigation flash or request-queue deadlock`, async ({
		page
	}) => {
		const portal = await mockPortal(page);
		await seedSavedSession(page, { selectedPeriod: 1 });
		await page.goto('/grades');
		const refresh = page.getByTestId('sidebar-refresh');
		await expect(refresh).toBeEnabled();
		const navigations: string[] = [];
		page.on('framenavigated', (frame) => {
			if (frame === page.mainFrame()) navigations.push(new URL(frame.url()).pathname);
		});
		portal.keepaliveError = code;
		const responseGate = gate();
		portal.gradebookResponse = async (route, parameters) => {
			expectLiveFullRequest(parameters, 1);
			await responseGate.promise;
			await route.fulfill({
				json: { xml: gradebookXml(1, `${code} fresh assignment`, 97), detailed: true }
			});
		};
		await refresh.click();
		await expect.poll(() => portal.gradebookRequests.length).toBeGreaterThan(0);
		await expect(
			page.getByTestId('session-recovery-loading').getByTestId('post-login-loading')
		).toBeVisible();
		await expect(page.getByLabel('StudentVUE email')).toHaveCount(0);
		responseGate.release();
		await expect(page.getByText(`${code} fresh assignment`, { exact: true })).toBeVisible();
		await expect(page.getByTestId('session-recovery-loading')).toHaveCount(0);
		await expect(page.getByTestId('studentvue-reconnect-banner')).toHaveCount(0);
		await expect(refresh).toBeEnabled();
		await expect(page.getByLabel('Report period')).toHaveValue('1');
		expect(portal.loginRequests).toBe(1);
		expect(navigations).toEqual([]);
	});
}

test('expired app-session recovery refreshes the selected nondefault period in place', async ({
	page
}) => {
	const portal = await mockPortal(page);
	await seedSavedSession(page, { selectedPeriod: 1 });
	await watchForLoginFlash(page);
	portal.expireStatus = true;
	const responseGate = gate();
	portal.gradebookResponse = async (route, parameters) => {
		expectLiveFullRequest(parameters, 1);
		await responseGate.promise;
		await route.fulfill({
			json: { xml: gradebookXml(1, 'Quarter 2 fresh assignment', 98), detailed: true }
		});
	};
	await page.goto('/grades');
	await expect.poll(() => portal.gradebookRequests.length).toBe(1);
	await expect(page).toHaveURL(/\/grades$/);
	await expect(page.getByTestId('post-login-loading')).toBeVisible();
	await expectNoLoginFlash(page);
	responseGate.release();
	await expect(page.getByLabel('Report period')).toHaveValue('1');
	await expect(page.getByText('Quarter 2 fresh assignment', { exact: true })).toBeVisible();
	await expect(page.getByTestId('post-login-loading')).toHaveCount(0);
	expect(portal.loginRequests).toBe(1);
	const cache = await page.evaluate(() => JSON.parse(localStorage.getItem('gradebook5')!));
	expect(cache.overrideIndex).toBe(1);
	expect(cache.recordCache[1].xml).toContain('Quarter 2 fresh assignment');
	await expectNoLoginFlash(page);
});

test('immediate repeated manual refreshes each fetch live full data and reject in-flight clicks', async ({
	page
}) => {
	const portal = await mockPortal(page);
	await seedSavedSession(page, { vault: false, selectedPeriod: 1 });
	await page.goto('/grades');
	const refresh = page.getByTestId('sidebar-refresh');
	await expect(refresh).toBeEnabled();
	expect(portal.gradebookRequests).toHaveLength(0);
	for (let attempt = 1; attempt <= 3; attempt += 1) {
		const responseGate = gate();
		portal.gradebookResponse = async (route, parameters) => {
			expectLiveFullRequest(parameters, 1);
			await responseGate.promise;
			await route.fulfill({
				json: { xml: gradebookXml(1, `Live refresh ${attempt}`, 95 + attempt), detailed: true }
			});
		};
		await refresh.click();
		await expect.poll(() => portal.gradebookRequests.length).toBe(attempt);
		await expect(refresh).toBeDisabled();
		await expect(refresh).toHaveAttribute('aria-busy', 'true');
		await refresh.dispatchEvent('click');
		expect(portal.gradebookRequests).toHaveLength(attempt);
		responseGate.release();
		await expect(page.getByText(`Live refresh ${attempt}`, { exact: true })).toBeVisible();
		await expect(refresh).toBeEnabled();
		await expect(refresh).toHaveAttribute('aria-busy', 'false');
		await expect(page.getByLabel('Report period')).toHaveValue('1');
	}
	expect(portal.gradebookRequests).toHaveLength(3);
});

test('a failed manual refresh keeps saved grades and the next click retries live data', async ({
	page
}) => {
	const portal = await mockPortal(page);
	await seedSavedSession(page, { vault: false });
	await page.goto('/grades');
	const refresh = page.getByTestId('sidebar-refresh');
	await expect(refresh).toBeEnabled();
	const cachedBefore = await page.evaluate(() => JSON.parse(localStorage.getItem('gradebook5')!));
	portal.gradebookResponse = async (route, parameters) => {
		expectLiveFullRequest(parameters);
		await route.fulfill({ status: 503, json: { message: 'Synthetic district maintenance.' } });
	};
	await refresh.click();
	await expect(page.getByTestId('gradebook-stale-indicator')).toBeVisible();
	await expect(page.getByText('Saved assignment', { exact: true })).toBeVisible();
	await expect(refresh).toBeEnabled();
	const cachedAfterFailure = await page.evaluate(() =>
		JSON.parse(localStorage.getItem('gradebook5')!)
	);
	expect(cachedAfterFailure.recordCache[0]).toEqual(cachedBefore.recordCache[0]);
	const failedRequests = portal.gradebookRequests.length;
	expect(failedRequests).toBeGreaterThan(0);
	portal.gradebookResponse = async (route, parameters) => {
		expectLiveFullRequest(parameters);
		await route.fulfill({
			json: { xml: gradebookXml(0, 'Recovered live assignment', 96), detailed: true }
		});
	};
	await refresh.click();
	await expect(page.getByText('Recovered live assignment', { exact: true })).toBeVisible();
	await expect(page.getByTestId('gradebook-stale-indicator')).toHaveCount(0);
	await expect(refresh).toBeEnabled();
	expect(portal.gradebookRequests).toHaveLength(failedRequests + 1);
});

test('manual refresh recovers an initial uncached grade load failure with a fresh request', async ({
	page
}) => {
	const portal = await mockPortal(page);
	await seedSavedSession(page, { vault: false });
	await page.evaluate(() => localStorage.removeItem('gradebook5'));
	portal.gradebookResponse = async (route, parameters) => {
		expect(parameters.has('summary')).toBe(false);
		await route.fulfill({ status: 503, json: { message: 'Synthetic cold-load failure.' } });
	};
	await page.goto('/grades');
	const refresh = page.getByTestId('sidebar-refresh');
	await expect(page.getByTestId('gradebook-stale-indicator')).toBeVisible();
	await expect(refresh).toBeEnabled();
	const failedRequests = portal.gradebookRequests.length;
	const manualGate = gate();
	portal.gradebookResponse = async (route, parameters) => {
		expectLiveFullRequest(parameters);
		await manualGate.promise;
		await route.fulfill({
			json: { xml: gradebookXml(0, 'Fresh after cold-load failure', 97), detailed: true }
		});
	};
	await refresh.click();
	await expect.poll(() => portal.gradebookRequests.length).toBe(failedRequests + 1);
	await expect(refresh).toBeDisabled();
	await expect(refresh).toHaveAttribute('aria-busy', 'true');
	await refresh.dispatchEvent('click');
	expect(portal.gradebookRequests).toHaveLength(failedRequests + 1);
	manualGate.release();
	await expect(page.getByText('Fresh after cold-load failure', { exact: true })).toBeVisible();
	await expect(page.getByTestId('gradebook-stale-indicator')).toHaveCount(0);
	await expect(refresh).toBeEnabled();
	expect(portal.gradebookRequests).toHaveLength(failedRequests + 1);
});

test('no-token vault recovery clears another account’s grade, profile, and mail cache before rendering', async ({
	page
}) => {
	const portal = await mockPortal(page);
	await seedSavedSession(page, { token: false });
	const oldOwner = await page.evaluate(
		async ({ domain }) => {
			const identity = `${domain}\nprevious-account-preview`;
			const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(identity));
			const owner = Array.from(new Uint8Array(digest), (byte) =>
				byte.toString(16).padStart(2, '0')
			).join('');
			localStorage.setItem('gradebookOwner', owner);
			const cache = JSON.parse(localStorage.getItem('gradebook5')!);
			cache.owner = identity;
			for (const record of cache.recordCache)
				record.xml = record.xml.replaceAll('Vault Refresh Preview', 'Previous Account A');
			localStorage.setItem('gradebook5', JSON.stringify(cache));
			for (const [key, data] of Object.entries({
				studentInfo3: { FormattedName: 'Previous Account A', Grade: 11, Photo: '' },
				studentProfile1: { StudentName: 'Previous Account A' },
				mailData: {
					InboxItemListings: { MessageXML: [{ _Subject: 'Previous Account A private mail' }] }
				}
			}))
				localStorage.setItem(key, JSON.stringify({ data, owner, lastRefresh: Date.now() }));
			return owner;
		},
		{ domain }
	);
	await page.addInitScript(() => {
		const observations = { leakedAccount: false };
		Object.assign(window, { accountRecoveryFrames: observations });
		const inspect = () => {
			if (document.body?.innerText.includes('Previous Account A'))
				observations.leakedAccount = true;
			requestAnimationFrame(inspect);
		};
		requestAnimationFrame(inspect);
	});
	const responseGate = gate();
	portal.gradebookResponse = async (route, parameters) => {
		expectLiveFullRequest(parameters);
		await responseGate.promise;
		await route.fulfill({
			json: { xml: gradebookXml(0, 'Current account assignment'), detailed: true }
		});
	};
	await page.goto('/grades');
	await expect.poll(() => portal.gradebookRequests.length).toBe(1);
	const stores = await page.evaluate(() => ({
		owner: localStorage.getItem('gradebookOwner'),
		profile: localStorage.getItem('studentProfile1'),
		mail: localStorage.getItem('mailData')
	}));
	expect(stores.owner).not.toBe(oldOwner);
	expect(stores.profile).toBeNull();
	expect(stores.mail).toBeNull();
	responseGate.release();
	await expect(page.getByText('Current account assignment', { exact: true })).toBeVisible();
	expect(
		await page.evaluate(
			() =>
				(window as unknown as { accountRecoveryFrames: { leakedAccount: boolean } })
					.accountRecoveryFrames.leakedAccount
		)
	).toBe(false);
	await page.goto('/studentinfo');
	await expect(page.getByText('Previous Account A', { exact: false })).toHaveCount(0);
	await page.goto('/mail');
	await expect(page.getByText('Previous Account A', { exact: false })).toHaveCount(0);
	expect(
		await page.evaluate(
			() =>
				(window as unknown as { accountRecoveryFrames: { leakedAccount: boolean } })
					.accountRecoveryFrames.leakedAccount
		)
	).toBe(false);
});

test('logging out in another tab cancels a pending vault recovery and cannot restore the old account', async ({
	page,
	context
}) => {
	const portal = await mockPortal(page);
	await seedSavedSession(page);
	await page.goto('/grades');
	await expect(page.getByTestId('sidebar-refresh')).toBeEnabled();
	const otherTab = await context.newPage();
	await mockPortal(otherTab);
	await otherTab.goto('/grades');
	await expect(otherTab.getByTestId('sidebar-log-out')).toBeVisible();
	const loginGate = gate();
	portal.loginResponse = loginGate.promise;
	portal.keepaliveError = 'UPSTREAM_SESSION_EXPIRED';
	await page.bringToFront();
	await page.getByTestId('sidebar-refresh').click();
	await expect.poll(() => portal.loginRequests).toBe(1);
	await expect(
		page.getByTestId('session-recovery-loading').getByTestId('post-login-loading')
	).toBeVisible();
	await otherTab.bringToFront();
	await otherTab.getByTestId('sidebar-log-out').click();
	await otherTab.getByTestId('confirm-log-out').click();
	await expect(otherTab).toHaveURL(/\/login$/);
	await expect(page).toHaveURL(/\/login$/);
	loginGate.release();
	await expect(page.getByLabel('StudentVUE email')).toBeVisible();
	await expect(otherTab.getByLabel('StudentVUE email')).toBeVisible();
	const stored = await page.evaluate(() => ({
		token: localStorage.getItem('token'),
		gradebook: localStorage.getItem('gradebook5'),
		vault: localStorage.getItem('studentvueCredentials')
	}));
	expect(stored).toEqual({ token: null, gradebook: null, vault: null });
	expect(portal.gradebookRequests).toHaveLength(0);
	await expect(page.getByTestId('session-recovery-loading')).toHaveCount(0);
	await otherTab.close();
});

for (const entry of ['/login', '/grades']) {
	test(`logout in another tab cancels no-token vault recovery from ${entry} while its authentication is pending`, async ({
		page,
		context
	}) => {
		const portal = await mockPortal(page);
		await seedSavedSession(page, { token: false });
		const otherTab = await context.newPage();
		await mockPortal(otherTab);
		await otherTab.goto('/');
		const loginGate = gate();
		portal.loginResponse = loginGate.promise;
		await page.goto(entry);
		await expect.poll(() => portal.loginRequests).toBe(1);
		await expect(
			page.getByTestId('session-recovery-loading').getByTestId('post-login-loading')
		).toBeVisible();
		// Reproduce the logout side effects from a second tab. With no saved local token,
		// that tab cannot mount an authenticated sidebar before the pending login returns.
		await otherTab.evaluate(async () => {
			await fetch('/api/session', { method: 'DELETE' });
			localStorage.clear();
		});
		await expect(page.getByLabel('StudentVUE email')).toBeVisible();
		loginGate.release();
		await expect(page.getByTestId('session-recovery-loading')).toHaveCount(0);
		expect(await page.evaluate(() => localStorage.getItem('token'))).toBeNull();
		expect(await page.evaluate(() => localStorage.getItem('gradebook5'))).toBeNull();
		expect(await page.evaluate(() => localStorage.getItem('studentvueCredentials'))).toBeNull();
		expect(portal.gradebookRequests).toHaveLength(0);
		await page.reload();
		await expect(page.getByLabel('StudentVUE email')).toBeVisible();
		expect(portal.loginRequests).toBe(1);
		await otherTab.close();
	});
}

test('no-token recovery on attendance loads fresh grades before returning to working attendance records', async ({
	page
}) => {
	const portal = await mockPortal(page);
	await seedSavedSession(page, { token: false });
	const date = await page.evaluate(() => {
		const today = new Date();
		return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
	});
	let attendanceRequests = 0;
	await page.route('**/api/studentvue/attendance', async (route) => {
		attendanceRequests += 1;
		await route.fulfill({
			json: {
				Absences: {},
				DailyRecords: [{ Date: date, Status: 'Present', Reason: 'Fresh attendance record' }],
				TotalExcused: {},
				TotalTardies: {},
				TotalUnexcused: {},
				TotalActivities: {},
				TotalUnexcusedTardies: {}
			}
		});
	});
	const responseGate = gate();
	portal.gradebookResponse = async (route, parameters) => {
		expectLiveFullRequest(parameters);
		await responseGate.promise;
		await route.fulfill({
			json: { xml: gradebookXml(0, 'Fresh during attendance recovery'), detailed: true }
		});
	};
	await page.goto('/attendance');
	await expect.poll(() => portal.gradebookRequests.length).toBe(1);
	await expect(
		page.getByTestId('session-recovery-loading').getByTestId('post-login-loading')
	).toBeVisible();
	await expect(page.getByLabel('StudentVUE email')).toHaveCount(0);
	responseGate.release();
	await expect(page.getByTestId('session-recovery-loading')).toHaveCount(0);
	await expect(page).toHaveURL(/\/attendance$/);
	await expect.poll(() => attendanceRequests).toBeGreaterThan(0);
	await expect(page.getByText('Fresh attendance record', { exact: true })).toBeVisible();
	const cached = await page.evaluate(() => JSON.parse(localStorage.getItem('gradebook5')!));
	expect(cached.recordCache[0].xml).toContain('Fresh during attendance recovery');
	expect(portal.loginRequests).toBe(1);
});

test('manual refresh remains busy while secondary records finish so the next click cannot silently no-op', async ({
	page
}) => {
	const portal = await mockPortal(page);
	await seedSavedSession(page, { vault: false });
	await page.goto('/grades');
	const refresh = page.getByTestId('sidebar-refresh');
	await expect(refresh).toBeEnabled();
	const documentsGate = gate();
	let documentRequests = 0;
	await page.route('**/api/studentvue/documents', async (route) => {
		documentRequests += 1;
		await documentsGate.promise;
		await route.fulfill({ json: { StudentDocumentDatas: {} } });
	});
	portal.gradebookResponse = async (route, parameters) => {
		expectLiveFullRequest(parameters);
		await route.fulfill({
			json: { xml: gradebookXml(0, 'Fresh before documents'), detailed: true }
		});
	};
	await refresh.click();
	await expect(page.getByText('Fresh before documents', { exact: true })).toBeVisible();
	await expect.poll(() => documentRequests).toBe(1);
	await expect(refresh).toBeDisabled();
	await expect(refresh).toHaveAttribute('aria-busy', 'true');
	await refresh.dispatchEvent('click');
	expect(portal.gradebookRequests).toHaveLength(1);
	documentsGate.release();
	await expect(refresh).toBeEnabled();
	await refresh.click();
	await expect.poll(() => portal.gradebookRequests.length).toBe(2);
	await expect(refresh).toBeEnabled();
});

test('successful vault authentication with a grade outage returns to saved grades and allows retry', async ({
	page
}) => {
	const portal = await mockPortal(page);
	await seedSavedSession(page);
	portal.expireStatus = true;
	portal.gradebookResponse = async (route, parameters) => {
		expectLiveFullRequest(parameters);
		await route.fulfill({ status: 503, json: { message: 'Synthetic district maintenance.' } });
	};
	await page.goto('/grades');
	await expect(page.getByTestId('gradebook-stale-indicator')).toBeVisible();
	await expect(page.getByTestId('session-recovery-loading')).toHaveCount(0);
	await expect(page.getByText('Saved assignment', { exact: true })).toBeVisible();
	await expect(page.getByLabel('StudentVUE email')).toHaveCount(0);
	expect(portal.loginRequests).toBe(1);
	portal.gradebookResponse = async (route, parameters) => {
		expectLiveFullRequest(parameters);
		await route.fulfill({
			json: { xml: gradebookXml(0, 'Recovered after vault outage', 96), detailed: true }
		});
	};
	await page.getByTestId('sidebar-refresh').click();
	await expect(page.getByText('Recovered after vault outage', { exact: true })).toBeVisible();
	await expect(page.getByTestId('gradebook-stale-indicator')).toHaveCount(0);
});

for (const recovery of ['unavailable', 'rejected'] as const) {
	test(`${recovery === 'unavailable' ? 'an unavailable' : 'a rejected'} vault returns to usable sign-in instead of an endless recovery screen`, async ({
		page
	}) => {
		const portal = await mockPortal(page);
		await seedSavedSession(page, { token: false, vault: recovery === 'rejected' });
		portal.rejectLogin = true;
		await page.goto('/grades');
		await expect(page.getByLabel('StudentVUE email')).toBeVisible();
		await expect(page.getByLabel('StudentVUE Password')).toBeEnabled();
		await expect(page.getByRole('button', { name: 'Log in', exact: true })).toBeEnabled();
		await expect(page.getByTestId('post-login-loading')).toHaveCount(0);
		expect(portal.loginRequests).toBe(recovery === 'rejected' ? 1 : 0);
		expect(portal.gradebookRequests).toHaveLength(0);
		if (recovery === 'rejected')
			expect(await page.evaluate(() => localStorage.getItem('studentvueCredentials'))).toBeNull();
	});
}
