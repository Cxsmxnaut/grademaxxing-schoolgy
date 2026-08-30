import { expect, test } from '@playwright/test';

const gradebookXml =
	'<Gradebook><ReportingPeriod Index="0" GradePeriod="Semester 1"/><ReportingPeriods><ReportPeriod Index="0" GradePeriod="Semester 1"/></ReportingPeriods><Courses><Course CourseID="preview" CourseName="Theme Preview" Period="1" Staff="Teacher Example" StaffEMail="teacher@example.edu" Room="101"><Marks><Mark MarkName="Semester 1" CalculatedScoreRaw="95" CalculatedScoreString="A"><Assignments></Assignments></Mark></Marks></Course></Courses></Gradebook>';

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
		const resource = new URL(route.request().url()).pathname.split('/').at(-1);
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
	['/dashboard', /Hey Student, here’s the move\./],
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
		await expect(page.getByRole('link', { name: 'Dashboard', exact: true })).toBeVisible();
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
	await page.getByRole('button', { name: 'Reset all' }).click();
	await expect(page.getByText('5.00')).toHaveCount(0);

	await page.goto('/grades/preview');
	await page.getByRole('button', { name: /Finals Planner/ }).click();
	await expect(page.getByText(/Target Grade/i).first()).toBeVisible();

	await page.goto('/attendance');
	await expect(page.getByRole('heading', { name: 'By class' })).toBeVisible();
	await page.getByRole('button', { name: 'Calendar' }).click();
	await expect(page.getByRole('button', { name: 'Previous month' })).toBeVisible();
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
	await page.goto('/dashboard');
	for (const label of ['Home', 'Grades', 'Attendance', 'Documents', 'Mail'])
		await expect(
			page.getByRole('navigation', { name: 'Mobile navigation' }).getByText(label, { exact: true })
		).toBeVisible();
});
