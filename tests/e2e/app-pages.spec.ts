import { expect, test } from '@playwright/test';

function gradebookXml(index: number, name: string, score: string, letter: string) {
	return `<Gradebook><ReportingPeriod Index="${index}" GradePeriod="${name}"/><ReportingPeriods><ReportPeriod Index="0" GradePeriod="Semester 1"/><ReportPeriod Index="1" GradePeriod="Semester 2"/></ReportingPeriods><Courses><Course CourseID="preview" CourseName="Theme Preview" Period="1" Staff="Teacher Example" StaffEMail="teacher@example.edu" Room="101"><Marks><Mark MarkName="${name}" CalculatedScoreRaw="${score}" CalculatedScoreString="${letter}"><Assignments></Assignments></Mark></Marks></Course></Courses></Gradebook>`;
}

test.beforeEach(async ({ page }) => {
	await page.addInitScript(() => {
		localStorage.setItem(
			'token',
			JSON.stringify({
				username: 'page-preview',
				domain: 'ca-pleas-psv.edupoint.com',
				sessionId: 'page-preview-session'
			})
		);
	});

	await page.route('**/api/session/status', (route) =>
		route.fulfill({
			status: 200,
			contentType: 'application/json',
			body: JSON.stringify({
				signedIn: true,
				username: 'page-preview',
				domain: 'ca-pleas-psv.edupoint.com'
			})
		})
	);

	await page.route('**/api/studentvue/**', (route) => {
		const url = new URL(route.request().url());
		const resource = url.pathname.split('/').at(-1);
		const requestedPeriod = url.searchParams.get('reportPeriod');
		const bodies: Record<string, unknown> = {
			gradebook: {
				xml:
					requestedPeriod === '1'
						? gradebookXml(1, 'Semester 2', '87', 'B+')
						: gradebookXml(0, 'Semester 1', '95', 'A')
			},
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
				FormattedName: 'Student Example',
				PermID: 123456,
				Gender: '',
				Grade: 10,
				Photo: ''
			},
			calendar: { events: [] }
		};
		route.fulfill({
			status: 200,
			contentType: 'application/json',
			body: JSON.stringify(bodies[resource ?? ''] ?? {})
		});
	});
});

const pages = [
	['/grades', 'Gradebook'],
	['/gpa-calculator', 'GPA calculator'],
	['/grades/preview', 'Theme Preview'],
	['/attendance', 'Attendance'],
	['/documents', 'Documents'],
	['/mail', 'Mail'],
	['/studentinfo', 'Student information'],
	['/feedback', 'Chat with the team']
] as const;

for (const [path, heading] of pages) {
	test(`${path} has a visible page identity and app navigation`, async ({ page }) => {
		await page.goto(path);
		await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible();
		await expect(page.getByRole('link', { name: 'Gradebook', exact: true })).toBeVisible();
		await expect(page.locator('img[src="/favicon.svg"]').first()).toBeVisible();
		expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
			await page.evaluate(() => window.innerWidth)
		);
	});
}

test('gradebook calculator, course planner, and attendance views are interactive', async ({
	page
}) => {
	await page.goto('/grades');
	await page.getByRole('link', { name: 'GPA calculator' }).click();
	await expect(page).toHaveURL(/\/gpa-calculator$/);
	await expect(page.getByText('4.00').first()).toBeVisible();
	await page.getByLabel('weighted +1.0').click();
	await expect(page.getByText('5.00')).toBeVisible();
	await page.getByRole('combobox', { name: 'Projected grade' }).selectOption('B');
	await expect(page.getByText('3.00')).toBeVisible();
	await page.getByRole('button', { name: 'Reset all' }).click();
	await expect(page.getByText('5.00')).toHaveCount(0);
	await page.getByRole('link', { name: 'Back to Gradebook' }).click();
	await expect(page).toHaveURL(/\/grades$/);

	await page.goto('/grades/preview');
	const finalsPlanner = page.getByRole('button', { name: /Finals Planner/ });
	await finalsPlanner.click();
	const plannerRegion = page.getByRole('region', { name: 'Finals Planner' });
	await expect(plannerRegion).toBeVisible();
	await expect(plannerRegion.getByLabel('Target grade')).toHaveValue('93');
	const initialRequirement = await plannerRegion.getByText(/You need/).textContent();
	await plannerRegion.getByLabel('Target grade').selectOption('90');
	await plannerRegion.getByLabel('Final points possible').fill('50');
	await expect(plannerRegion.getByText(/You need/)).not.toHaveText(initialRequirement ?? '');
	await finalsPlanner.click();
	await expect(plannerRegion).toHaveCount(0);
	await page.getByRole('link', { name: 'All courses' }).click();
	await expect(page).toHaveURL(/\/grades$/);

	await page.goto('/attendance');
	await expect(page.getByRole('heading', { name: 'By class' })).toBeVisible();
	await page.getByRole('button', { name: 'Calendar' }).click();
	const monthHeading = page.locator('#attendance-month');
	const initialMonth = await monthHeading.textContent();
	await page.getByRole('button', { name: 'Previous month' }).click();
	await expect(monthHeading).not.toHaveText(initialMonth ?? '');
	await page.getByRole('button', { name: 'Next month' }).click();
	await expect(monthHeading).toHaveText(initialMonth ?? '');
	await page.getByRole('button', { name: 'Today' }).click();
	await expect(monthHeading).toHaveText(initialMonth ?? '');
	await page.getByRole('button', { name: 'Overview' }).click();
	await expect(page.getByRole('heading', { name: 'By class' })).toBeVisible();
});

test('empty records, feedback state, mobile navigation, and theme controls are clear', async ({
	page
}) => {
	await page.goto('/documents');
	await expect(page.getByRole('heading', { name: 'No documents yet' })).toBeVisible();
	await page.goto('/mail');
	await expect(page.getByRole('heading', { name: 'Your inbox is empty' })).toBeVisible();
	await page.goto('/feedback');
	await expect(page.getByRole('button', { name: 'Send' })).toBeDisabled();

	await page.getByRole('button', { name: 'Light' }).click();
	await expect(page.locator('html')).not.toHaveClass(/dark/);
	await page.getByRole('button', { name: 'Dark' }).click();
	await expect(page.locator('html')).toHaveClass(/dark/);

	await page.setViewportSize({ width: 390, height: 844 });
	await page.goto('/grades');
	for (const label of ['Grades', 'Attendance', 'Documents', 'Mail'])
		await expect(
			page.getByRole('navigation', { name: 'Mobile navigation' }).getByText(label, { exact: true })
		).toBeVisible();
	for (const [label, path] of [
		['Attendance', '/attendance'],
		['Documents', '/documents'],
		['Mail', '/mail'],
		['Grades', '/grades']
	] as const) {
		await page
			.getByRole('navigation', { name: 'Mobile navigation' })
			.getByRole('link', { name: label })
			.click();
		await expect(page).toHaveURL(new RegExp(`${path}$`));
		await expect(
			page.getByRole('navigation', { name: 'Mobile navigation' }).getByRole('link', { name: label })
		).toHaveAttribute('aria-current', 'page');
	}
});

test('legacy dashboard bookmarks resolve to the Gradebook home', async ({ page }) => {
	await page.goto('/dashboard');
	await expect(page).toHaveURL(/\/grades$/);
	await expect(page.getByRole('heading', { level: 1, name: 'Gradebook' })).toBeVisible();
});

test('Gradebook exposes the GPA rank summary on desktop and mobile', async ({ page }) => {
	await page.setViewportSize({ width: 1440, height: 900 });
	await page.goto('/grades');
	const summary = page.getByRole('region', { name: 'Grade summary' });
	await expect(summary.getByText('Rank', { exact: true })).toBeVisible();
	await expect(summary.getByText('Diamond', { exact: true })).toBeVisible();
	await expect(page.getByRole('button', { name: 'Share your rank' })).toBeVisible();
	await expect(page.getByRole('heading', { name: 'Next rank' })).toBeVisible();
	await expect(page.getByText('Highest rank reached')).toBeVisible();

	await page.setViewportSize({ width: 390, height: 844 });
	await expect(page.getByText('GPA and rank', { exact: true })).toBeVisible();
	await page.getByText('GPA and rank', { exact: true }).click();
	const mobileSummary = page.locator('details');
	await expect(mobileSummary.getByText('GPA · Unweighted', { exact: true })).toBeVisible();
	await expect(mobileSummary.getByText('GPA · Weighted', { exact: true })).toBeVisible();
	await expect(mobileSummary.getByRole('button', { name: 'Share your rank' })).toBeVisible();
});

test('Gradebook report period menu switches data and preserves native menu semantics', async ({
	page
}) => {
	await page.goto('/grades');
	const reportPeriod = page.getByRole('combobox', { name: 'Report period' });
	await expect(reportPeriod).toHaveValue('0');
	await expect(reportPeriod.getByRole('option')).toHaveCount(2);
	await reportPeriod.selectOption('1');
	await expect(reportPeriod).toHaveValue('1');
	await expect(
		page.getByRole('region', { name: 'Grade summary' }).getByText('3.30').first()
	).toBeVisible();
	await expect(
		page.locator('main ol').getByRole('link', { name: /B\+ Theme Preview/ })
	).toBeVisible();
});

test('Gradebook class and rank controls perform their real actions', async ({ page }) => {
	await page.addInitScript(() => {
		Object.defineProperty(navigator, 'share', {
			configurable: true,
			value: async (payload: ShareData) =>
				sessionStorage.setItem('shared-rank', JSON.stringify(payload))
		});
	});
	await page.goto('/grades');
	await page.getByRole('button', { name: 'Share your rank' }).click();
	await expect
		.poll(() => page.evaluate(() => sessionStorage.getItem('shared-rank')))
		.toContain('GPA rank');

	await page
		.locator('main ol')
		.getByRole('link', { name: /Theme Preview/ })
		.click();
	await expect(page).toHaveURL(/\/grades\/preview$/);
	await expect(page.getByRole('heading', { level: 1, name: 'Theme Preview' })).toBeVisible();
});
