import { expect, test } from '@playwright/test';

const gradebookXml = `<Gradebook><ReportingPeriod Index="0" GradePeriod="Quarter 1"/><ReportingPeriods><ReportPeriod Index="0" GradePeriod="Quarter 1"/></ReportingPeriods><Courses><Course CourseID="persistence" CourseName="Persistence Test" Period="1" Staff="Teacher" Room="101"><Marks><Mark MarkName="Quarter 1" CalculatedScoreRaw="94" CalculatedScoreString="A"><Assignments></Assignments></Mark></Marks></Course></Courses></Gradebook>`;

test('an expired StudentVUE session preserves cached grades and supports password-only reconnect', async ({
	page
}) => {
	let expireGradebook = false;
	let replacementSessionId = 'persistence-session';

	await page.addInitScript(() => {
		if (localStorage.getItem('token') === null)
			localStorage.setItem(
				'token',
				JSON.stringify({
					username: 'persistence-preview',
					domain: 'ca-pleas-psv.edupoint.com',
					sessionId: 'persistence-session'
				})
			);
	});

	await page.route('**/api/session/status', (route) =>
		route.fulfill({
			status: 200,
			contentType: 'application/json',
			body: JSON.stringify({
				signedIn: true,
				username: 'persistence-preview',
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
	await page.route('**/api/session', async (route) => {
		if (route.request().method() !== 'POST')
			return route.fulfill({ status: 204, contentType: 'application/json', body: '' });
		const body = route.request().postDataJSON() as { password?: string };
		expect(body.password).toBe('correct-password');
		replacementSessionId = 'replacement-session';
		expireGradebook = false;
		return route.fulfill({
			status: 200,
			contentType: 'application/json',
			body: JSON.stringify({
				username: 'persistence-preview',
				domain: 'ca-pleas-psv.edupoint.com',
				sessionId: replacementSessionId
			})
		});
	});

	await page.route('**/api/studentvue/**', (route) => {
		const resource = new URL(route.request().url()).pathname.split('/').at(-1);
		if (resource === 'gradebook' && expireGradebook)
			return route.fulfill({
				status: 401,
				contentType: 'application/json',
				body: JSON.stringify({
					code: 'UPSTREAM_SESSION_EXPIRED',
					message: 'Reconnect to StudentVUE to update your school data.'
				})
			});
		const bodies: Record<string, unknown> = {
			gradebook: { xml: gradebookXml },
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
			'student-info': {
				FormattedName: 'Persistence Preview',
				PermID: 123456,
				Gender: '',
				Grade: 10,
				Photo: ''
			}
		};
		return route.fulfill({
			status: 200,
			contentType: 'application/json',
			body: JSON.stringify(bodies[resource ?? ''] ?? {})
		});
	});

	await page.goto('/grades');
	await expect(page.getByText('Persistence Test', { exact: true }).first()).toBeVisible();
	expireGradebook = true;
	await page.getByTestId('sidebar-refresh').click();

	await expect(page).toHaveURL(/\/grades$/);
	await expect(page.getByTestId('studentvue-reconnect-banner')).toBeVisible();
	await expect(page.getByText('Persistence Test', { exact: true }).first()).toBeVisible();
	expect(await page.evaluate(() => localStorage.getItem('token'))).not.toBeNull();

	await page.setViewportSize({ width: 390, height: 844 });
	await page
		.getByTestId('studentvue-reconnect-banner')
		.getByRole('button', { name: 'Reconnect' })
		.click();
	const dialog = page.getByTestId('studentvue-reconnect-dialog');
	await expect(dialog).toBeVisible();
	expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
	await dialog.getByLabel('StudentVUE password').fill('correct-password');
	await dialog.getByRole('button', { name: 'Reconnect' }).click();

	await expect(page.getByTestId('studentvue-reconnect-banner')).toHaveCount(0);
	await expect(page.getByText('Persistence Test', { exact: true }).first()).toBeVisible();
	const savedSessionId = await page.evaluate(() => {
		const value = JSON.parse(localStorage.getItem('token') ?? '{}') as { sessionId?: string };
		return value.sessionId;
	});
	expect(savedSessionId).toBe('replacement-session');
	expect(replacementSessionId).toBe('replacement-session');
});

test('an ambiguous upstream 401 does not sign the student out or discard cached grades', async ({
	page
}) => {
	await page.addInitScript(() => {
		localStorage.setItem(
			'token',
			JSON.stringify({
				username: 'status-preview',
				domain: 'ca-pleas-psv.edupoint.com',
				sessionId: 'status-preview-session'
			})
		);
	});
	await page.route('**/api/session/status', (route) =>
		route.fulfill({
			status: 401,
			contentType: 'application/json',
			body: JSON.stringify({ message: 'Temporary portal gateway response' })
		})
	);
	await page.route('**/api/session/keepalive', (route) =>
		route.fulfill({
			status: 200,
			contentType: 'application/json',
			body: JSON.stringify({ signedIn: true, updatedAt: Date.now() })
		})
	);
	await page.route('**/api/studentvue/**', (route) => {
		const resource = new URL(route.request().url()).pathname.split('/').at(-1);
		if (resource === 'gradebook')
			return route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify({ xml: gradebookXml })
			});
		return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
	});

	await page.goto('/grades');
	await expect(page).toHaveURL(/\/grades$/);
	await expect(page.getByText('Persistence Test', { exact: true }).first()).toBeVisible();
	expect(await page.evaluate(() => localStorage.getItem('token'))).not.toBeNull();
});

test('restores an expired app session from the encrypted device vault', async ({ page }) => {
	let sessionRequests = 0;
	const passwords: string[] = [];
	const gradebookXml =
		'<Gradebook><ReportingPeriod Index="0" GradePeriod="Quarter 1"/><ReportingPeriods><ReportPeriod Index="0" GradePeriod="Quarter 1"/></ReportingPeriods><Courses><Course CourseID="vault" CourseName="Vault Test" Period="1" Staff="Teacher" Room="101"><Marks><Mark MarkName="Quarter 1" CalculatedScoreRaw="94" CalculatedScoreString="A"><Assignments></Assignments></Mark></Marks></Course></Courses></Gradebook>';

	await page.route('**/api/session', async (route) => {
		if (route.request().method() !== 'POST')
			return route.fulfill({ status: 204, contentType: 'application/json', body: '' });
		const body = route.request().postDataJSON() as { password?: string };
		sessionRequests += 1;
		passwords.push(body.password ?? '');
		return route.fulfill({
			status: 200,
			contentType: 'application/json',
			body: JSON.stringify({
				username: 'vault-preview',
				domain: 'ca-pleas-psv.edupoint.com',
				sessionId: `vault-session-${sessionRequests}`
			})
		});
	});
	await page.route('**/api/session/status', (route) =>
		route.fulfill({
			status: 200,
			contentType: 'application/json',
			body: JSON.stringify({
				signedIn: true,
				username: 'vault-preview',
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
	await page.route('**/api/studentvue/**', (route) => {
		const resource = new URL(route.request().url()).pathname.split('/').at(-1);
		const body =
			resource === 'gradebook'
				? { xml: gradebookXml }
				: resource === 'student-info'
					? { FormattedName: 'Vault Preview', Grade: 10, Photo: '' }
					: {};
		return route.fulfill({
			status: 200,
			contentType: 'application/json',
			body: JSON.stringify(body)
		});
	});

	await page.goto('/login');
	await page.getByLabel('StudentVUE email').fill('vault-preview');
	await page.getByLabel('StudentVUE Password').fill('preview-password');
	await page.getByRole('button', { name: 'Log in' }).click();
	await expect(page).toHaveURL(/\/grades$/);
	await expect(page.getByText('Vault Test', { exact: true }).first()).toBeVisible();

	const storedEnvelope = await page.evaluate(() => localStorage.getItem('studentvueCredentials'));
	expect(storedEnvelope).not.toBeNull();
	expect(storedEnvelope).not.toContain('preview-password');
	expect(sessionRequests).toBe(1);

	await page.evaluate(() => localStorage.removeItem('token'));
	await page.reload();
	await expect(page).toHaveURL(/\/grades$/, { timeout: 20_000 });
	await expect(page.getByText('Vault Test', { exact: true }).first()).toBeVisible();
	expect(sessionRequests).toBe(2);
	expect(passwords).toEqual(['preview-password', 'preview-password']);
});
