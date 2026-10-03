import { expect, test } from '@playwright/test';

function gradebookXml(index: number, name: string, score: string, letter: string) {
	return `<Gradebook><ReportingPeriod Index="${index}" GradePeriod="${name}"/><ReportingPeriods><ReportPeriod Index="0" GradePeriod="Semester 1"/><ReportPeriod Index="1" GradePeriod="Semester 2"/></ReportingPeriods><Courses><Course CourseID="preview" CourseName="Theme Preview" Period="1" Staff="Teacher Example" StaffEMail="teacher@example.edu" Room="101"><Marks><Mark MarkName="${name}" CalculatedScoreRaw="${score}" CalculatedScoreString="${letter}"><GradeCalculationSummary><AssignmentGradeCalc Type="Assessments" Weight="100%" Points="${score}" PointsPossible="100" WeightedPct="${score}%" CalculatedMark="${letter}"/></GradeCalculationSummary>							<Assignments><Assignment GradebookID="preview-assessment" Measure="Unit assessment" Type="Assessments" Date="8/20/2026" DueDate="8/20/2026" Score="${score}" DisplayScore="${score} out of 100" ScoreCalValue="${score}" ScoreMaxValue="100" ScoreType="Raw Score" Points="${score} / 100" Point="${score}" PointPossible="100" Notes="Strong reasoning. Review question 4." MeasureDescription="Cumulative unit assessment covering the first four lessons." HasDropBox="false"/><Assignment GradebookID="preview-upcoming" Measure="Upcoming quiz" Type="Quizzes" Date="9/25/2026" DueDate="9/28/2026" DisplayScore="Not Graded" ScoreType="Raw Score" Points="10 Points Possible" Notes="" MeasureDescription="" HasDropBox="false"/></Assignments></Mark></Marks></Course></Courses></Gradebook>`;
}

function assignmentEvidenceXml(score: string, assignments: string, summary = '') {
	return `<Gradebook><ReportingPeriod Index="0" GradePeriod="Quarter 1"/><ReportingPeriods><ReportPeriod Index="0" GradePeriod="Quarter 1"/></ReportingPeriods><Courses><Course CourseID="assignment-evidence" CourseName="Assignment Evidence" Period="1"><Marks><Mark MarkName="Quarter 1" CalculatedScoreRaw="${score}" CalculatedScoreString="B">${summary}<Assignments>${assignments}</Assignments></Mark></Marks></Course></Courses></Gradebook>`;
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
	await page.route('**/api/session/keepalive', (route) =>
		route.fulfill({
			status: 200,
			contentType: 'application/json',
			body: JSON.stringify({ signedIn: true, updatedAt: Date.now() })
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
			schedule: {
				date: '2026-09-28',
				classes: [
					{
						period: '1',
						courseTitle: 'Example Biology',
						teacher: 'Teacher Example',
						teacherEmail: '',
						room: '101',
						startTime: '8:30 AM',
						endTime: '9:20 AM',
						schoolName: 'Example School',
						date: '2026-09-28'
					},
					{
						period: '2',
						courseTitle: 'Example History',
						teacher: 'Another Teacher',
						teacherEmail: '',
						room: '202',
						startTime: '9:25 AM',
						endTime: '10:15 AM',
						schoolName: 'Example School',
						date: '2026-09-28'
					}
				]
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
			'student-profile': { fields: { Counselor: 'Counselor Example' } },
			'school-info': {
				name: 'Example School',
				principal: 'Principal Example',
				address: '123 Example Way, Example City, CA 90210',
				phone: '(555) 555-0100',
				fax: '',
				website: 'https://example.edu',
				fields: {}
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
	['/feedback', 'Feedback']
] as const;

test('student pages fit small, standard, and large phone widths in dark mode', async ({ page }) => {
	for (const width of [320, 390, 430]) {
		await page.setViewportSize({ width, height: 844 });
		for (const [path, heading] of pages) {
			await page.goto(path);
			await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible();
			await expect(page.getByRole('navigation', { name: 'Mobile navigation' })).toBeVisible();
			await expect(page.locator('html')).toHaveCSS('color-scheme', 'dark');
			const overflow = await page.evaluate(
				() => document.documentElement.scrollWidth - document.documentElement.clientWidth
			);
			expect(overflow, `${path} should not scroll horizontally at ${width}px`).toBeLessThanOrEqual(
				1
			);
		}
	}
});

for (const [path, heading] of pages) {
	test(`${path} has a visible page identity and app navigation`, async ({ page }) => {
		await page.goto(path);
		await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible();
		await expect(page.getByRole('link', { name: 'Gradebook', exact: true })).toBeVisible();
		await expect(page.locator('img[src="/grademaxxing-growth-mark.png"]').first()).toBeVisible();
		expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
			await page.evaluate(() => window.innerWidth)
		);
	});
}

test('gradebook calculator, course details, and attendance views are interactive', async ({
	page
}) => {
	await page.goto('/grades');
	await page.getByRole('link', { name: 'GPA calculator' }).click();
	await expect(page).toHaveURL(/\/gpa-calculator$/);
	await expect(page.getByText('4.00').first()).toBeVisible();
	await expect(page.getByText('not weighted by policy')).toBeVisible();
	await page.getByRole('combobox', { name: 'Projected grade' }).selectOption('B');
	await expect(page.getByText('3.00').first()).toBeVisible();
	await page.getByRole('button', { name: 'Reset all' }).click();
	await expect(page.getByText('4.00').first()).toBeVisible();
	await page.getByRole('link', { name: 'Back to Gradebook' }).click();
	await expect(page).toHaveURL(/\/grades$/);

	await page.goto('/grades/preview');
	await expect(
		page.getByRole('progressbar', { name: 'Unit assessment score progress' })
	).toHaveAttribute('aria-valuenow', '95');
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

	await page.getByTitle('Assignment description').filter({ visible: true }).click();
	await expect(
		page.getByText('Cumulative unit assessment covering the first four lessons.')
	).toBeVisible();
	await page.getByTitle('Assignment description').filter({ visible: true }).click();
	await page.getByTitle('Teacher comments').filter({ visible: true }).click();
	await expect(page.getByText('Strong reasoning. Review question 4.')).toBeVisible();
	await page.getByTitle('Teacher comments').filter({ visible: true }).click();

	await page.getByLabel('Show category breakdown').check();
	await expect(page.getByRole('columnheader', { name: 'Category' })).toBeVisible();
	await expect(page.getByTestId('grade-trend-chart')).toBeVisible();
	await page.getByLabel('Hypothetical Mode').check();
	await expect(page.getByTestId('hypothetical-letter')).toBeVisible();
	await expect(page.getByTestId('grade-trend-insufficient')).toBeVisible();
	const whatIfForm = page.getByRole('form', { name: 'Add what-if assignment' });
	await expect(whatIfForm).toBeVisible();
	await whatIfForm.getByLabel('What-if score').fill('10');
	await whatIfForm.getByLabel('What-if points possible').fill('10');
	await whatIfForm.getByRole('button', { name: 'Add' }).click();
	await expect(page.getByTestId('grade-trend-chart')).toBeVisible();
	await expect(
		page.getByText('What-if 1', { exact: true }).filter({ visible: true }).first()
	).toBeVisible();
	await expect(
		page.getByText('what-if', { exact: true }).filter({ visible: true }).first()
	).toBeVisible();
	await page
		.getByRole('button', { name: 'Remove this what-if' })
		.filter({ visible: true })
		.first()
		.click();
	await expect(page.getByText('What-if 1', { exact: true })).toHaveCount(0);
	await whatIfForm.getByLabel('What-if score').fill('10');
	await whatIfForm.getByLabel('What-if points possible').fill('10');
	await whatIfForm.getByRole('button', { name: 'Add' }).click();
	await page.getByRole('button', { name: 'Reset changes' }).click();
	await expect(page.getByText('What-if 1', { exact: true })).toHaveCount(0);

	await page.getByRole('link', { name: 'All courses' }).click();
	await expect(page).toHaveURL(/\/grades$/);

	await page.goto('/attendance');
	await expect(page.getByRole('heading', { level: 1, name: 'Attendance' })).toBeVisible();
	await expect(
		page.getByRole('region', { name: 'Class schedule' }).getByText('Example Biology')
	).toBeVisible();
	const scheduleBounds = await page.getByRole('region', { name: 'Class schedule' }).boundingBox();
	const calendarBounds = await page
		.getByRole('complementary', { name: 'Calendar and status filters' })
		.boundingBox();
	expect(scheduleBounds!.y).toBeLessThan(calendarBounds!.y + calendarBounds!.height);
	if (process.env.ATTENDANCE_VISUAL_CAPTURE) {
		await expect(page.getByText('Loading attendance records…')).toBeHidden();
		await page.screenshot({
			path: '/tmp/grademaxxing-attendance-calendar-desktop.png',
			fullPage: true
		});
		await page
			.getByRole('region', { name: 'Class schedule' })
			.screenshot({ path: '/tmp/grademaxxing-attendance-schedule-desktop.png' });
	}
	const miniCalendar = page.getByRole('complementary', { name: 'Calendar and status filters' });
	const calendar = miniCalendar.getByRole('application', { name: /Attendance dates/ });
	const monthHeading = calendar.getByRole('heading', { name: /Attendance dates/ });
	const initialMonth = await monthHeading.textContent();
	await calendar.getByRole('button', { name: 'Previous', exact: true }).click();
	await expect(monthHeading).not.toHaveText(initialMonth ?? '');
	await calendar.getByRole('button', { name: 'Next', exact: true }).click();
	await expect(monthHeading).toHaveText(initialMonth ?? '');
	await page.getByRole('button', { name: 'Week', exact: true }).click();
	await expect(page.getByRole('button', { name: 'Week', exact: true })).toHaveAttribute(
		'aria-pressed',
		'true'
	);
	await page.getByRole('button', { name: 'Month', exact: true }).click();
	await expect(page.getByRole('button', { name: 'Month', exact: true })).toHaveAttribute(
		'aria-pressed',
		'true'
	);
	await expect(page.getByText('No records this month')).toBeVisible();
});

test('grade percentages keep two decimal places when StudentVUE provides them', async ({
	page
}) => {
	const xml = gradebookXml(0, 'Semester 1', '96.534', 'A');
	await page.route('**/api/studentvue/gradebook*', (route) =>
		route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ xml }) })
	);
	await page.setViewportSize({ width: 320, height: 844 });
	await page.goto('/grades');
	await expect(
		page
			.getByRole('link', { name: /Theme Preview/ })
			.getByText('96.53%')
			.filter({ visible: true })
			.first()
	).toBeVisible();
	expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
	await page.setViewportSize({ width: 1280, height: 800 });
	await page.goto('/grades/preview');
	await expect(page.getByText('96.53%').first()).toBeVisible();
	await expect(page.getByTitle('Assignment grade percentage').first()).toHaveText('96.53%');
	await expect(page.getByText('96.534%')).toHaveCount(0);
});

test('server-corrected weighted scores leave the chart on the official course grade', async ({
	page
}) => {
	const xml = `<Gradebook><ReportingPeriod Index="0" GradePeriod="Quarter 1"/><ReportingPeriods><ReportPeriod Index="0" GradePeriod="Quarter 1"/></ReportingPeriods><Courses><Course CourseID="points-check" CourseName="Sample Course" Period="1"><Marks><Mark MarkName="Quarter 1" CalculatedScoreRaw="90" CalculatedScoreString="A"><GradeCalculationSummary><AssignmentGradeCalc Type="Homework" Weight="100" Points="1.8" PointsPossible="2" WeightedPct="90" CalculatedMark="A"/></GradeCalculationSummary><Assignments><Assignment GradebookID="earlier" Measure="Earlier quiz" Type="Homework" Date="9/19/2026" DueDate="9/19/2026" Score="10" DisplayScore="10 out of 10" ScoreCalValue="10" ScoreMaxValue="10" Points="1 / 1" Point="1" PointPossible="1" Notes="" MeasureDescription="Earlier work"/><Assignment GradebookID="corrected" Measure="Weighted quiz" Type="Homework" Date="9/20/2026" DueDate="9/20/2026" Score="8" DisplayScore="8 out of 10" ScoreCalValue="8" ScoreMaxValue="10" AssignmentPercentage="80" Points="0.8 / 1" Point="0.8" PointPossible="1" Notes="" MeasureDescription="Sample work"/></Assignments></Mark></Marks></Course></Courses></Gradebook>`;
	await page.route('**/api/studentvue/gradebook*', (route) =>
		route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ xml }) })
	);
	await page.goto('/grades/points-check');
	await expect(page.getByRole('heading', { level: 1, name: 'Sample Course' })).toBeVisible();
	await expect(
		page.getByTitle('Points earned/Points possible').filter({ hasText: '0.8/1' }).first()
	).toBeVisible();
	await expect(
		page.getByTitle('Points before scaling').filter({ hasText: '(8/10)' }).first()
	).toBeVisible();
	await expect(page.getByTestId('grade-trend-chart')).toBeVisible();
	await expect(page.getByText(/estimated from studentvue assignments/i)).toHaveCount(0);
	await expect(page.getByText('Point Discrepancy')).toHaveCount(0);
	await expect(page.getByText('800%')).toHaveCount(0);
});

test('a StudentVUE category mismatch keeps an estimated chart anchored to the official grade', async ({
	page
}) => {
	const xml = `<Gradebook><ReportingPeriod Index="0" GradePeriod="Quarter 1"/><ReportingPeriods><ReportPeriod Index="0" GradePeriod="Quarter 1"/></ReportingPeriods><Courses><Course CourseID="mismatch-check" CourseName="History" Period="1"><Marks><Mark MarkName="Quarter 1" CalculatedScoreRaw="96.5" CalculatedScoreString="A"><GradeCalculationSummary><AssignmentGradeCalc Type="Homework" Weight="100" Points="19.3" PointsPossible="20" WeightedPct="96.5" CalculatedMark="A"/></GradeCalculationSummary><Assignments><Assignment GradebookID="earlier" Measure="Earlier quiz" Type="Homework" Date="9/19/2026" DueDate="9/19/2026" Score="10" DisplayScore="10 out of 10" ScoreCalValue="10" ScoreMaxValue="10" Points="10 / 10" Point="10" PointPossible="10" Notes="" MeasureDescription="Earlier work"/><Assignment GradebookID="visible" Measure="Video quiz" Type="Homework" Date="9/20/2026" DueDate="9/20/2026" Score="9.5" DisplayScore="9.5 out of 10" ScoreCalValue="9.5" ScoreMaxValue="10" Points="9.5 / 10" Point="9.5" PointPossible="10" Notes="" MeasureDescription="Video work"/></Assignments></Mark></Marks></Course></Courses></Gradebook>`;
	await page.route('**/api/studentvue/gradebook*', (route) =>
		route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ xml }) })
	);
	await page.goto('/grades/mismatch-check');
	await expect(page.getByRole('heading', { level: 1, name: 'History' })).toBeVisible();
	await expect(page.getByText('96.5%').first()).toBeVisible();
	await expect(page.getByText('Point Discrepancy')).toHaveCount(0);
	await expect(page.getByText('Official and visible-work grades differ')).toHaveCount(0);
	await expect(page.getByText(/Trend estimated from StudentVUE assignments/)).toHaveCount(0);
	await expect(page.getByTestId('grade-trend-chart')).toBeVisible();
	await expect(page.getByText(/estimated from studentvue assignments/i)).toHaveCount(0);
});

test('entering hypothetical mode never moves the official course grade', async ({ page }) => {
	const xml = `<Gradebook><ReportingPeriod Index="0" GradePeriod="Quarter 1"/><ReportingPeriods><ReportPeriod Index="0" GradePeriod="Quarter 1"/></ReportingPeriods><Courses><Course CourseID="mismatch-check" CourseName="History" Period="1"><Marks><Mark MarkName="Quarter 1" CalculatedScoreRaw="96.5" CalculatedScoreString="A"><GradeCalculationSummary><AssignmentGradeCalc Type="Homework" Weight="100" Points="19.3" PointsPossible="20" WeightedPct="96.5" CalculatedMark="A"/></GradeCalculationSummary><Assignments><Assignment GradebookID="earlier" Measure="Earlier quiz" Type="Homework" Date="9/19/2026" DueDate="9/19/2026" Score="10" DisplayScore="10 out of 10" ScoreCalValue="10" ScoreMaxValue="10" Points="10 / 10" Point="10" PointPossible="10" Notes="" MeasureDescription="Earlier work"/><Assignment GradebookID="visible" Measure="Video quiz" Type="Homework" Date="9/20/2026" DueDate="9/20/2026" Score="9.5" DisplayScore="9.5 out of 10" ScoreCalValue="9.5" ScoreMaxValue="10" Points="9.5 / 10" Point="9.5" PointPossible="10" Notes="" MeasureDescription="Video work"/></Assignments></Mark></Marks></Course></Courses></Gradebook>`;
	await page.route('**/api/studentvue/gradebook*', (route) =>
		route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ xml }) })
	);
	await page.goto('/grades/mismatch-check');
	await expect(page.getByRole('heading', { level: 1, name: 'History' })).toBeVisible();
	await expect(page.getByText('96.5%').first()).toBeVisible();

	await page.getByLabel('Hypothetical mode').check();

	// The local sums say 19.5/20 (97.5%); the official score must still win.
	await expect(page.getByText('97.5%')).toHaveCount(0);
	await expect(page.getByText('96.5%').first()).toBeVisible();
	await expect(page.getByText('±0.00% vs actual')).toBeVisible();
	await expect(page.getByText('Point Discrepancy')).toHaveCount(0);
	await expect(page.getByText('Official category totals')).toHaveCount(0);

	// A what-if edit still moves the grade by its simulated change.
	const form = page.getByRole('form', { name: 'Add what-if assignment' });
	await form.getByLabel('What-if score').fill('10');
	await form.getByLabel('What-if points possible').fill('10');
	await form.getByLabel('What-if points possible').press('Enter');
	await expect(
		page.getByText('What-if 1', { exact: true }).filter({ visible: true }).first()
	).toBeVisible();
	await expect(page.getByText('±0.00% vs actual')).toHaveCount(0);
	await expect(page.getByTestId('hypothetical-letter')).toBeVisible();
});

test('scaled assignment percentages stay official until what-if points are edited', async ({
	page
}) => {
	const rows = [
		{ id: 'weighted', name: 'Weighted quiz', earned: '0.8', raw: '7.95', percentage: '79.5' },
		{ id: 'zero', name: 'Zero score', earned: '0', raw: '0', percentage: '0' },
		{ id: 'bonus', name: 'Bonus score', earned: '1.25', raw: '12.5', percentage: '125' }
	]
		.map(
			({ id, name, earned, raw, percentage }) =>
				`<Assignment GradebookID="${id}" Measure="${name}" Type="Homework" Date="9/2/2026" DueDate="9/2/2026" Score="${raw}" DisplayScore="${raw} out of 10" ScoreCalValue="${raw}" ScoreMaxValue="10" ScoreType="Raw Score" AssignmentPercentage="${percentage}" Points="${earned} / 1" Point="${earned}" PointPossible="1" Notes="" MeasureDescription=""/>`
		)
		.join('');
	const xml = `<Gradebook><ReportingPeriod Index="0" GradePeriod="Quarter 1"/><ReportingPeriods><ReportPeriod Index="0" GradePeriod="Quarter 1"/></ReportingPeriods><Courses><Course CourseID="assignment-scale-check" CourseName="Sample Course" Period="1"><Marks><Mark MarkName="Quarter 1" CalculatedScoreRaw="68.33" CalculatedScoreString="D"><GradeCalculationSummary><AssignmentGradeCalc Type="Homework" Weight="100" Points="2.05" PointsPossible="3" WeightedPct="68.33" CalculatedMark="D"/></GradeCalculationSummary><Assignments>${rows}</Assignments></Mark></Marks></Course></Courses></Gradebook>`;
	await page.route('**/api/studentvue/gradebook*', (route) =>
		route.fulfill({
			status: 200,
			contentType: 'application/json',
			body: JSON.stringify({ xml })
		})
	);
	await page.goto('/grades/assignment-scale-check');
	await expect(page.getByRole('heading', { level: 1, name: 'Sample Course' })).toBeVisible();
	const activeRows = page.getByRole('tabpanel').filter({ visible: true }).locator('li');
	const weighted = activeRows.filter({ hasText: 'Weighted quiz' });
	await expect(weighted.locator('[title="Points earned/Points possible"]')).toHaveText('0.8/1');
	await expect(weighted.locator('[title="Points before scaling"]')).toHaveText('(7.95/10)');
	await expect(weighted.locator('[title="Assignment grade percentage"]')).toHaveText('79.5%');
	await expect(
		activeRows.filter({ hasText: 'Zero score' }).locator('[title="Assignment grade percentage"]')
	).toHaveText('0%');
	await expect(
		activeRows.filter({ hasText: 'Bonus score' }).locator('[title="Assignment grade percentage"]')
	).toHaveText('125%');
	await page.getByLabel('Hypothetical mode').check();
	await expect(page.getByText('±0.00% vs actual')).toBeVisible();
	await expect(weighted.getByRole('progressbar')).toHaveAttribute('aria-valuetext', '79.5%');
	await weighted.getByRole('spinbutton', { name: 'Points earned', exact: true }).fill('0.4');
	await expect(weighted.getByRole('progressbar')).toHaveAttribute('aria-valuetext', '40%');
	await page.getByRole('tab', { name: 'Homework', exact: true }).click();
	await expect(weighted.getByRole('progressbar')).toHaveAttribute('aria-valuetext', '40%');
	await page.getByRole('button', { name: 'Reset changes', exact: true }).click();
	await expect(weighted.getByRole('progressbar')).toHaveAttribute('aria-valuetext', '79.5%');
	await weighted.getByRole('spinbutton', { name: 'Points possible', exact: true }).fill('2');
	await expect(weighted.getByRole('progressbar')).toHaveAttribute('aria-valuetext', '40%');
});

test('truncated assignment percentages preserve weighted points and what-if deltas', async ({
	page
}) => {
	const assignment = `<Assignment GradebookID="truncated" Measure="Truncated quiz" Type="Homework" Date="9/2/2026" DueDate="9/2/2026" Score="38.85" ScoreType="Raw Score" AssignmentPercentage="77" AssignmentPercentagePrecision="0" Points="38.85 / 50" Point="38.85" PointPossible="50" Notes="" MeasureDescription=""/>`;
	await page.route('**/api/studentvue/gradebook*', (route) =>
		route.fulfill({
			status: 200,
			contentType: 'application/json',
			body: JSON.stringify({ xml: assignmentEvidenceXml('77.7', assignment) })
		})
	);
	await page.goto('/grades/assignment-evidence');
	const row = page
		.getByRole('tabpanel')
		.filter({ visible: true })
		.locator('li')
		.filter({ hasText: 'Truncated quiz' });
	await expect(row.locator('[title="Points earned/Points possible"]')).toHaveText('38.85/50');
	await expect(row.locator('[title="Assignment grade percentage"]')).toHaveText('77%');
	await expect(page.getByText('Weighted points unavailable', { exact: true })).toHaveCount(0);
	await expect(page.getByLabel('Hypothetical mode')).toBeEnabled();
	await page.getByLabel('Hypothetical mode').check();
	await row.getByRole('spinbutton', { name: 'Points earned', exact: true }).fill('39.35');
	await expect(page.getByText('+1.00% vs actual')).toBeVisible();
	await expect(row.getByRole('progressbar')).toHaveAttribute('aria-valuetext', '78.7%');
	await page.getByRole('button', { name: 'Reset changes', exact: true }).click();
	await expect(row.getByRole('progressbar')).toHaveAttribute('aria-valuetext', '77%');
	await expect(page.getByText('±0.00% vs actual')).toBeVisible();
});

test('a coarse point display does not change the grade when edited to its official percentage', async ({
	page
}) => {
	const assignment = `<Assignment GradebookID="coarse" Measure="Coarse quiz" Type="Homework" Date="9/2/2026" DueDate="9/2/2026" Score="6" DisplayScore="6 out of 10" ScoreCalValue="6" ScoreMaxValue="10" ScoreType="Raw Score" AssignmentPercentage="60" Points="1 / 1" Point="1" PointPossible="1" Notes="" MeasureDescription=""/>`;
	const summary = `<GradeCalculationSummary><AssignmentGradeCalc Type="Homework" Weight="100" Points="0.6" PointsPossible="1" WeightedPct="60" CalculatedMark="D"/></GradeCalculationSummary>`;
	const xml = assignmentEvidenceXml('60', assignment, summary);
	await page.route('**/api/studentvue/gradebook*', (route) =>
		route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ xml }) })
	);
	await page.goto('/grades/assignment-evidence');
	const row = page
		.getByRole('tabpanel')
		.filter({ visible: true })
		.locator('li')
		.filter({ hasText: 'Coarse quiz' });
	await expect(row.locator('[title="Points earned/Points possible"]')).toHaveText('1/1');
	await expect(row.locator('[title="Assignment grade percentage"]')).toHaveText('60%');
	await page.getByLabel('Hypothetical mode').check();
	await expect(row.getByRole('spinbutton', { name: 'Points earned', exact: true })).toHaveValue(
		'1'
	);
	await row.getByRole('spinbutton', { name: 'Points earned', exact: true }).fill('0.6');
	await expect(row.getByRole('progressbar')).toHaveAttribute('aria-valuetext', '60%');
	await expect(page.getByText('±0.00% vs actual')).toBeVisible();
	await row.getByRole('spinbutton', { name: 'Points earned', exact: true }).fill('0.5');
	await expect(page.getByText('-10.00% vs actual')).toBeVisible();
	await row.getByRole('spinbutton', { name: 'Points earned', exact: true }).fill('');
	await expect(row.getByRole('progressbar')).toHaveCount(0);
	await expect(page.locator('header').getByText('NaN%', { exact: true })).toHaveCount(0);
	await row.getByRole('spinbutton', { name: 'Points earned', exact: true }).fill('0.6');
	await expect(page.getByText('±0.00% vs actual')).toBeVisible();
	await page.getByRole('button', { name: 'Reset changes', exact: true }).click();
	await expect(row.getByRole('spinbutton', { name: 'Points earned', exact: true })).toHaveValue(
		'1'
	);
	await expect(row.getByRole('progressbar')).toHaveAttribute('aria-valuetext', '60%');
	await expect(page.getByText('±0.00% vs actual')).toBeVisible();
});

test('an official percentage remains visible when weighted earned points are missing', async ({
	page
}) => {
	const assignment = `<Assignment GradebookID="earned-missing" Measure="Known percentage" Type="Homework" Date="9/2/2026" DueDate="9/2/2026" Score="8" DisplayScore="8 out of 10" ScoreCalValue="8" ScoreMaxValue="10" ScoreType="Raw Score" AssignmentPercentage="80" Points="1 Points Possible" PointPossible="1" Notes="" MeasureDescription=""/>`;
	const summary = `<GradeCalculationSummary><AssignmentGradeCalc Type="Homework" Weight="100" Points="0.8" PointsPossible="1" WeightedPct="80" CalculatedMark="B"/></GradeCalculationSummary>`;
	const xml = assignmentEvidenceXml('80', assignment, summary);
	await page.route('**/api/studentvue/gradebook*', (route) =>
		route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ xml }) })
	);
	await page.goto('/grades/assignment-evidence');
	const row = page
		.getByRole('tabpanel')
		.filter({ visible: true })
		.locator('li')
		.filter({ hasText: 'Known percentage' });
	await expect(row.getByText('Not Graded', { exact: true })).toHaveCount(0);
	await expect(row.locator('[title="StudentVUE raw score"]')).toHaveText('(8/10)');
	await expect(row.locator('[title="Assignment grade percentage"]')).toHaveText('80%');
	await expect(row.getByRole('progressbar')).toHaveAttribute('aria-valuetext', '80%');
	await page.getByLabel('Hypothetical mode').check();
	await expect(page.getByText('±0.00% vs actual')).toBeVisible();
	await row.getByRole('spinbutton', { name: 'Points earned', exact: true }).fill('0.8');
	await expect(page.getByText('±0.00% vs actual')).toBeVisible();
});

test('missing weighted maxima preserve official and raw evidence without guessing a percentage', async ({
	page
}) => {
	const rows = `<Assignment GradebookID="maximum-missing" Measure="Unknown weighted maximum" Type="Homework" Date="9/2/2026" DueDate="9/2/2026" Score="8" DisplayScore="8 out of 10" ScoreCalValue="8" ScoreMaxValue="10" ScoreType="Raw Score" AssignmentPercentage="80" Points="Points Possible" Point="0.8" Notes="" MeasureDescription=""/><Assignment GradebookID="raw-only" Measure="Raw score only" Type="Homework" Date="9/2/2026" DueDate="9/2/2026" Score="8" DisplayScore="8 out of 10" ScoreCalValue="8" ScoreMaxValue="10" ScoreType="Raw Score" Points="Points Possible" Notes="" MeasureDescription=""/><Assignment GradebookID="pending" Measure="Pending work" Type="Homework" Date="9/2/2026" DueDate="9/2/2026" DisplayScore="Not Graded" ScoreType="Raw Score" Points="1 Points Possible" PointPossible="1" Notes="" MeasureDescription=""/>`;
	const xml = assignmentEvidenceXml('80', rows);
	await page.route('**/api/studentvue/gradebook*', (route) =>
		route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ xml }) })
	);
	await page.goto('/grades/assignment-evidence');
	const activeRows = page.getByRole('tabpanel').filter({ visible: true }).locator('li');
	const known = activeRows.filter({ hasText: 'Unknown weighted maximum' });
	await expect(known.getByText('Not Graded', { exact: true })).toHaveCount(0);
	await expect(known.locator('[title="Points earned/Points possible"]')).toHaveText('0.8/—');
	await expect(known.locator('[title="Assignment grade percentage"]')).toHaveText('80%');
	await expect(known.getByText('Weighted points unavailable', { exact: true })).toBeVisible();
	await expect(page.getByLabel('Hypothetical mode')).toBeDisabled();
	await expect(page.getByRole('button', { name: /Finals Planner/ })).toBeDisabled();
	const rawOnly = activeRows.filter({ hasText: 'Raw score only' });
	await expect(rawOnly.getByText('Not Graded', { exact: true })).toHaveCount(0);
	await expect(rawOnly.locator('[title="StudentVUE raw score"]')).toHaveText('(8/10)');
	await expect(rawOnly.locator('[title="Assignment grade percentage"]')).toHaveCount(0);
	await expect(rawOnly.getByRole('progressbar')).toHaveCount(0);
	await expect(rawOnly.getByText('Weighted points unavailable', { exact: true })).toBeVisible();
	await expect(
		activeRows.filter({ hasText: 'Pending work' }).getByText('Not Graded', { exact: true })
	).toBeVisible();
});

test('excluded assignments need a known weighted maximum before they can count in a what-if grade', async ({
	page
}) => {
	const rows = `<Assignment GradebookID="current" Measure="Current work" Type="Homework" Date="9/2/2026" DueDate="9/2/2026" Score="80" DisplayScore="80 out of 100" ScoreType="Raw Score" AssignmentPercentage="80" Points="80 / 100" Point="80" PointPossible="100" Notes="" MeasureDescription=""/><Assignment GradebookID="excluded-unknown" Measure="Excluded unknown maximum" Type="Homework" Date="9/2/2026" DueDate="9/2/2026" Score="8" DisplayScore="8 out of 10" ScoreCalValue="8" ScoreMaxValue="10" ScoreType="Raw Score" Points="Points Possible" Notes="(Not For Grading)" MeasureDescription=""/><Assignment GradebookID="excluded-percent" Measure="Excluded known percentage" Type="Homework" Date="9/2/2026" DueDate="9/2/2026" Score="8" DisplayScore="8 out of 10" ScoreCalValue="8" ScoreMaxValue="10" ScoreType="Raw Score" AssignmentPercentage="80" Points="1 Points Possible" PointPossible="1" Notes="(Not For Grading)" MeasureDescription=""/><Assignment GradebookID="excluded-bonus" Measure="Excluded bonus" Type="Homework" Date="9/2/2026" DueDate="9/2/2026" Score="2" DisplayScore="2" ScoreType="Raw Score" Points="2 / 0" Point="2" PointPossible="0" Notes="(Not For Grading)" MeasureDescription=""/>`;
	const xml = assignmentEvidenceXml('80', rows);
	await page.route('**/api/studentvue/gradebook*', (route) =>
		route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ xml }) })
	);
	await page.goto('/grades/assignment-evidence');
	await page.getByLabel('Hypothetical mode').check();
	const activeRows = page.getByRole('tabpanel').filter({ visible: true }).locator('li');
	await expect(
		activeRows
			.filter({ hasText: 'Excluded unknown maximum' })
			.getByRole('checkbox', { name: 'Not For Grade' })
	).toBeDisabled();
	await expect(
		activeRows
			.filter({ hasText: 'Excluded known percentage' })
			.getByRole('checkbox', { name: 'Not For Grade' })
	).toBeEnabled();
	await expect(
		activeRows
			.filter({ hasText: 'Excluded bonus' })
			.getByRole('checkbox', { name: 'Not For Grade' })
	).toBeEnabled();
});

test('the finals planner reaches its target in the anchored hypothetical calculation', async ({
	page
}) => {
	const assignment = `<Assignment GradebookID="current" Measure="Current work" Type="Homework" Date="9/2/2026" DueDate="9/2/2026" Score="80" DisplayScore="80 out of 100" ScoreCalValue="80" ScoreMaxValue="100" ScoreType="Raw Score" AssignmentPercentage="80" Points="80 / 100" Point="80" PointPossible="100" Notes="" MeasureDescription=""/>`;
	const xml = assignmentEvidenceXml('90', assignment);
	await page.route('**/api/studentvue/gradebook*', (route) =>
		route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ xml }) })
	);
	await page.goto('/grades/assignment-evidence');
	await page.getByRole('button', { name: /Finals Planner/ }).click();
	const planner = page.getByRole('region', { name: 'Finals Planner' });
	await expect(planner.getByLabel('Target grade')).toHaveValue('93');
	await expect(planner.getByText('86 / 100', { exact: true })).toBeVisible();
	await page.getByLabel('Hypothetical mode').check();
	const form = page.getByRole('form', { name: 'Add what-if assignment' });
	await form.getByLabel('What-if score').fill('86');
	await form.getByLabel('What-if points possible').fill('100');
	await form.getByRole('button', { name: 'Add', exact: true }).click();
	await expect(page.locator('header').getByText('93%', { exact: true })).toBeVisible();
	await expect(page.getByText('+3.00% vs actual')).toBeVisible();
});

test('saved official StudentVUE marks replace assignment estimates in the chart', async ({
	page
}) => {
	await page.goto('/grades/preview');
	await expect(page.getByTestId('grade-trend-chart')).toBeVisible();
	await page.evaluate(() => {
		const owner = 'synthetic-preview-owner';
		localStorage.setItem('gradebookOwner', owner);
		localStorage.setItem(
			'officialGradeHistory1',
			JSON.stringify({
				owner,
				courses: {
					'["preview",0]': [
						{ observedAt: new Date(2026, 7, 19).getTime(), percentage: 90 },
						{ observedAt: new Date(2026, 7, 21).getTime(), percentage: 95 }
					]
				}
			})
		);
	});
	await page.reload();
	await expect(page.getByTestId('grade-trend-chart')).toBeVisible();
	await expect(page.getByText(/estimated from studentvue assignments/i)).toHaveCount(0);
});

test('attendance agenda shows school records and fits a phone viewport', async ({ page }) => {
	const today = new Date();
	const date = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
	await page.route('**/api/studentvue/attendance', (route) =>
		route.fulfill({
			status: 200,
			contentType: 'application/json',
			body: JSON.stringify({
				Absences: {
					Absence: [
						{
							_AbsenceDate: date,
							_Reason: 'Arrived late',
							_Note: '',
							Periods: {
								Period: [
									{
										_Number: '2',
										_Name: 'Tardy',
										_Reason: 'Arrived late',
										_Course: 'Example Biology',
										_Staff: 'Teacher Example'
									}
								]
							}
						}
					]
				},
				DailyRecords: []
			})
		})
	);
	await page.setViewportSize({ width: 375, height: 812 });
	await page.goto('/attendance');
	await expect(page.locator('.calendar-toolbar h2')).toHaveText(
		today.toLocaleString('en-US', { month: 'long', year: 'numeric' })
	);
	await expect(page.getByText('Arrived late').first()).toBeVisible();
	const schedule = page.getByRole('region', { name: 'Class schedule' });
	await expect(schedule.getByText('Monday, Sep 28, 2026')).toBeVisible();
	await expect(schedule.getByRole('listitem')).toHaveCount(2);
	await expect(schedule.getByText('Example Biology')).toBeVisible();
	await expect(schedule.getByText('8:30 AM – 9:20 AM')).toBeVisible();
	await expect(schedule.getByText('Room 101')).toBeVisible();
	const mobileScheduleBounds = await schedule.boundingBox();
	const mobileCalendarBounds = await page
		.getByRole('complementary', { name: 'Calendar and status filters' })
		.boundingBox();
	expect(mobileScheduleBounds!.y).toBeGreaterThanOrEqual(
		mobileCalendarBounds!.y + mobileCalendarBounds!.height
	);
	if (process.env.ATTENDANCE_VISUAL_CAPTURE) {
		await expect(page.getByText('Loading attendance records…')).toBeHidden();
		await page.screenshot({
			path: '/tmp/grademaxxing-attendance-calendar-mobile.png',
			fullPage: true
		});
	}
	const attendanceCalendar = page.getByRole('application', { name: /Attendance dates/ });
	await expect(attendanceCalendar.locator('.date-dot')).toHaveCount(1);
	await attendanceCalendar
		.getByRole('button', {
			name: today.toLocaleDateString('en-US', {
				weekday: 'long',
				month: 'long',
				day: 'numeric',
				year: 'numeric'
			})
		})
		.click();
	await expect(page.locator('.record-trigger .type-badge')).toBeVisible();
	await page.getByRole('button', { name: /Arrived late/ }).click();
	await expect(page.locator('.record-detail').getByText('Example Biology')).toBeVisible();
	await expect(page.getByRole('combobox', { name: 'Course' })).toHaveCount(0);
	await expect(page.getByRole('combobox', { name: 'Status' })).toHaveCount(0);
	const tardy = page.getByRole('checkbox', { name: 'Tardy' });
	await tardy.uncheck();
	await expect(page.getByText('No attendance records for this day.')).toBeVisible();
	await tardy.check();
	await expect(page.getByText('Arrived late').first()).toBeVisible();
	const otherRecords = page.getByRole('checkbox', { name: 'Other records' });
	await otherRecords.uncheck();
	await expect(otherRecords).not.toBeChecked();
	expect(await otherRecords.evaluate((input) => getComputedStyle(input).backgroundColor)).toBe(
		'rgba(0, 0, 0, 0)'
	);
	for (const width of [320, 375, 414, 768]) {
		await page.setViewportSize({ width, height: 812 });
		expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
			width
		);
	}
});

test('six scheduled classes fit in a laptop attendance view', async ({ page }) => {
	const earlierDate = new Date();
	earlierDate.setDate(earlierDate.getDate() - 1);
	const recordDate = `${earlierDate.getFullYear()}-${String(earlierDate.getMonth() + 1).padStart(2, '0')}-${String(earlierDate.getDate()).padStart(2, '0')}`;
	await page.route('**/api/studentvue/attendance', (route) =>
		route.fulfill({
			status: 200,
			contentType: 'application/json',
			body: JSON.stringify({
				Absences: {
					Absence: [
						{
							_AbsenceDate: recordDate,
							_Reason: 'Example record',
							_Note: '',
							Periods: { Period: [] }
						}
					]
				},
				DailyRecords: []
			})
		})
	);
	await page.route('**/api/studentvue/schedule', (route) =>
		route.fulfill({
			status: 200,
			contentType: 'application/json',
			body: JSON.stringify({
				date: '2026-09-28',
				classes: [
					'Example English Language Arts',
					'Example World History',
					'Example Precalculus',
					'Example Biology Lab',
					'Example Physical Education',
					'Example Spanish II'
				].map((courseTitle, index) => ({
					period: String(index + 1).padStart(2, '0'),
					courseTitle: `90010${index + 1} ${courseTitle} (P) - 90010${index + 1}-${index + 1}`,
					teacher: `Example Teacher ${index + 1}`,
					teacherEmail: '',
					room: `B-${index + 1}`,
					startTime: '8:30 AM',
					endTime: '9:25 AM',
					schoolName: 'Example School',
					date: '2026-09-28'
				}))
			})
		})
	);
	await page.setViewportSize({ width: 1366, height: 768 });
	await page.goto('/attendance');
	await expect(page.getByRole('button', { name: 'Go to latest record' })).toBeVisible();
	const schedule = page.getByRole('region', { name: 'Class schedule' });
	await expect(schedule.getByRole('listitem')).toHaveCount(6);
	await expect(page.getByText('Loading attendance records…')).toBeHidden();
	const lastPeriod = await schedule.getByRole('listitem').last().boundingBox();
	expect(lastPeriod!.y + lastPeriod!.height).toBeLessThanOrEqual(768);
	expect(
		await page.evaluate(() => document.scrollingElement?.scrollHeight ?? 0)
	).toBeLessThanOrEqual(768);
	if (process.env.ATTENDANCE_VISUAL_CAPTURE) {
		await page.screenshot({ path: '/tmp/grademaxxing-attendance-laptop.png' });
	}
});

test('course what-if controls preserve compact mobile geometry and keyboard operation', async ({
	page
}) => {
	await page.setViewportSize({ width: 390, height: 844 });
	await page.goto('/grades/preview');
	await page.getByLabel('Hypothetical mode').check();

	const form = page.getByRole('form', { name: 'Add what-if assignment' });
	const formBox = await form.boundingBox();
	const category = form.getByLabel('Category for the what-if assignment');
	const categoryBox = await category.boundingBox();
	expect(formBox?.width).toBeGreaterThanOrEqual(357);
	expect(categoryBox?.width).toBeGreaterThanOrEqual(315);

	const score = form.getByLabel('What-if score');
	const possible = form.getByLabel('What-if points possible');
	await score.focus();
	await expect(score).toBeFocused();
	await score.fill('9');
	await page.keyboard.press('Tab');
	await expect(possible).toBeFocused();
	await possible.fill('10');
	await page.keyboard.press('Enter');

	await expect(
		page.getByText('What-if 1', { exact: true }).filter({ visible: true }).first()
	).toBeVisible();
	const addedCard = page
		.getByText('What-if 1', { exact: true })
		.filter({ visible: true })
		.first()
		.locator('xpath=ancestor::*[@data-slot="card"]');
	const cardBox = await addedCard.boundingBox();
	expect(cardBox?.width).toBeGreaterThanOrEqual(357);

	const remove = page
		.getByRole('button', { name: 'Remove this what-if' })
		.filter({ visible: true })
		.first();
	await remove.focus();
	await expect(remove).toBeFocused();
	await page.keyboard.press('Enter');
	await expect(page.getByText('What-if 1', { exact: true })).toHaveCount(0);

	expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
		await page.evaluate(() => window.innerWidth)
	);
});

test('feedback keeps previous chats separate and opens replies inside the selected chat', async ({
	page
}) => {
	const olderId = '0f143f0d-a034-48d6-8bb8-1d00c4a7e255';
	const newerId = '5bb61304-159a-4a6a-bc22-061c74d8c852';
	let followUpArrived = false;
	await page.addInitScript(
		({ olderId, newerId }) => {
			localStorage.setItem(
				'feedbackReceipts',
				JSON.stringify([
					{ id: newerId, replyToken: 'b'.repeat(43) },
					{ id: olderId, replyToken: 'a'.repeat(43) }
				])
			);
		},
		{ olderId, newerId }
	);
	await page.route(/\/api\/feedback\/[0-9a-f-]+\?token=/, (route) => {
		const older = route.request().url().includes(olderId);
		const createdAt = older ? '2026-09-19T08:00:00.000Z' : '2026-09-20T08:00:00.000Z';
		return route.fulfill({
			status: 200,
			contentType: 'application/json',
			body: JSON.stringify({
				id: older ? olderId : newerId,
				kind: older ? 'Bug report' : 'Feature idea',
				message: older ? 'Calendar dates are wrong' : 'Add a weekly summary',
				status: older ? 'reviewing' : 'new',
				adminReply: older ? 'We fixed the date display.' : '',
				repliedAt: older ? '2026-09-21T08:00:00.000Z' : null,
				createdAt,
				updatedAt: older
					? followUpArrived
						? '2026-09-22T08:00:00.000Z'
						: '2026-09-21T08:00:00.000Z'
					: createdAt,
				messages: older
					? [
							{
								id: 'older-original',
								sender: 'student',
								message: 'Calendar dates are wrong',
								createdAt
							},
							{
								id: 'older-reply',
								sender: 'admin',
								message: 'We fixed the date display.',
								createdAt: '2026-09-21T08:00:00.000Z'
							},
							...(followUpArrived
								? [
										{
											id: 'older-follow-up',
											sender: 'admin',
											message: 'The calendar fix is now available.',
											createdAt: '2026-09-22T08:00:00.000Z'
										}
									]
								: [])
						]
					: [
							{
								id: 'newer-original',
								sender: 'student',
								message: 'Add a weekly summary',
								createdAt
							}
						]
			})
		});
	});
	await page.goto('/feedback');
	await expect(page.getByRole('button', { name: /Bug report/ })).toBeVisible();
	await expect(
		page.getByLabel('Feedback conversation').getByText('We fixed the date display.')
	).toBeVisible();
	await expect(page.getByRole('button', { name: /Check (for )?replies/i })).toHaveCount(0);
	followUpArrived = true;
	await page.evaluate(() => window.dispatchEvent(new Event('focus')));
	await expect(
		page.getByLabel('Feedback conversation').getByText('The calendar fix is now available.')
	).toBeVisible();
	await page
		.getByRole('button', { name: /Feature idea/ })
		.first()
		.click();
	await expect(
		page.getByLabel('Feedback conversation').getByText('Add a weekly summary')
	).toBeVisible();
	await expect(
		page.getByLabel('Feedback conversation').getByText('We fixed the date display.')
	).toHaveCount(0);
	await page.setViewportSize({ width: 390, height: 844 });
	await page.getByRole('button', { name: 'Back to chats' }).click();
	await expect(page.getByRole('heading', { name: 'Chats' })).toBeVisible();
	await page.getByRole('button', { name: /Bug report/ }).click();
	await expect(
		page.getByLabel('Feedback conversation').getByText('We fixed the date display.')
	).toBeVisible();
});

test('empty records, feedback state, mobile navigation, and dark theme are clear', async ({
	page
}) => {
	await page.goto('/documents');
	await expect(page.getByRole('heading', { name: 'No documents available yet' })).toBeVisible();
	await page.goto('/mail');
	await expect(page.getByRole('heading', { name: 'No messages yet' })).toBeVisible();
	await page.goto('/feedback');
	let submittedFeedback: { kind?: string; message?: string } = {};
	const feedbackId = '0f143f0d-a034-48d6-8bb8-1d00c4a7e255';
	const replyToken = 'a'.repeat(43);
	const messages = [
		{
			id: 'original',
			sender: 'student',
			message: 'The latest assignment is missing',
			createdAt: '2026-09-20T16:00:00.000Z'
		},
		{
			id: 'reply',
			sender: 'admin',
			message: 'Thanks — we found the issue and are working on it.',
			createdAt: '2026-09-20T16:30:00.000Z'
		}
	];
	await page.route(/\/api\/feedback$/, async (route) => {
		submittedFeedback = (await route.request().postDataJSON()) as typeof submittedFeedback;
		await route.fulfill({
			status: 201,
			contentType: 'application/json',
			body: JSON.stringify({ id: feedbackId, replyToken })
		});
	});
	await page.route(/\/api\/feedback\/[0-9a-f-]+\?token=/, async (route) => {
		await route.fulfill({
			status: 200,
			contentType: 'application/json',
			body: JSON.stringify({
				id: feedbackId,
				kind: 'Feature idea',
				message: 'The latest assignment is missing',
				status: 'reviewing',
				adminReply: 'Thanks — we found the issue and are working on it.',
				repliedAt: '2026-09-20T16:30:00.000Z',
				createdAt: '2026-09-20T16:00:00.000Z',
				updatedAt: '2026-09-20T16:30:00.000Z',
				messages
			})
		});
	});
	await page.route(/\/api\/feedback\/[0-9a-f-]+\/messages\?token=/, async (route) => {
		const body = (await route.request().postDataJSON()) as { message: string };
		const sent = {
			id: 'followup',
			sender: 'student',
			message: body.message,
			createdAt: '2026-09-20T17:00:00.000Z'
		};
		messages.push(sent);
		await route.fulfill({
			status: 201,
			contentType: 'application/json',
			body: JSON.stringify(sent)
		});
	});
	const report = page.getByRole('button', { name: 'Send feedback' });
	await expect(report).toBeDisabled();
	await expect(page.getByText('Start a conversation')).toBeVisible();
	if (process.env.FEEDBACK_VISUAL_CAPTURE)
		await page.screenshot({ path: '/tmp/grademaxxing-feedback-chat-desktop.png', fullPage: true });
	await page.setViewportSize({ width: 390, height: 844 });
	await expect(page.getByLabel('Your message')).toBeVisible();
	if (process.env.FEEDBACK_VISUAL_CAPTURE)
		await page.screenshot({ path: '/tmp/grademaxxing-feedback-chat-mobile.png', fullPage: true });
	await page.setViewportSize({ width: 1280, height: 900 });
	await page.getByRole('button', { name: /Feature idea/ }).click();
	await expect(page.getByRole('button', { name: /Feature idea/ })).toHaveAttribute(
		'aria-pressed',
		'true'
	);
	await page.getByLabel('Your message').fill('The latest assignment is missing');
	await report.click();
	await expect(page.getByRole('heading', { name: 'Feedback sent' })).toBeVisible();
	expect(submittedFeedback).toMatchObject({
		kind: 'Feature idea',
		message: 'The latest assignment is missing'
	});
	await expect(page.getByRole('heading', { name: 'Chats' })).toBeVisible();
	await expect(
		page
			.getByLabel('Feedback conversation')
			.getByText('Thanks — we found the issue and are working on it.')
	).toBeVisible();
	await expect(
		page.getByLabel('Feedback conversation').getByText('The latest assignment is missing')
	).toBeVisible();
	await expect(page.locator('[data-slot="message"]')).toHaveCount(2);
	await expect(page.locator('[data-slot="bubble"]')).toHaveCount(2);
	await page.getByLabel('Your message').fill('Can I send a follow-up?');
	await page.getByRole('button', { name: 'Send feedback' }).click();
	await expect(
		page.getByLabel('Feedback conversation').getByText('Can I send a follow-up?')
	).toBeVisible();
	await expect(page.locator('[data-slot="message"]')).toHaveCount(3);
	if (process.env.FEEDBACK_VISUAL_CAPTURE)
		await page.screenshot({ path: '/tmp/grademaxxing-feedback-sent-desktop.png', fullPage: true });
	await page.setViewportSize({ width: 390, height: 844 });
	if (process.env.FEEDBACK_VISUAL_CAPTURE)
		await page.screenshot({ path: '/tmp/grademaxxing-feedback-sent-mobile.png', fullPage: true });
	await page.setViewportSize({ width: 1280, height: 900 });

	await expect(page.locator('html')).toHaveCSS('color-scheme', 'dark');
	await expect(page.getByTestId('sidebar-theme')).toHaveCount(0);

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

test('Gradebook shows GPA and courses without rankings on desktop and mobile', async ({ page }) => {
	await page.setViewportSize({ width: 1440, height: 900 });
	await page.goto('/grades');
	const summary = page.getByRole('region', { name: 'Grade summary' });
	await expect(summary.getByText('GPA · Unweighted', { exact: true })).toBeVisible();
	await expect(summary.getByText('GPA · Weighted', { exact: true })).toBeVisible();
	await expect(page.getByRole('progressbar', { name: 'Theme Preview grade' })).toHaveAttribute(
		'aria-valuenow',
		'95'
	);
	await expect(page.getByRole('button', { name: 'Share your rank' })).toHaveCount(0);
	await expect(page.getByRole('heading', { name: 'Next rank' })).toHaveCount(0);

	await page.setViewportSize({ width: 390, height: 844 });
	await expect(page.getByText('GPA summary', { exact: true })).toBeVisible();
	await page.getByText('GPA summary', { exact: true }).click();
	const mobileSummary = page.locator('details');
	await expect(mobileSummary.getByText('GPA · Unweighted', { exact: true })).toBeVisible();
	await expect(mobileSummary.getByText('GPA · Weighted', { exact: true })).toBeVisible();
	await expect(mobileSummary.getByText('Rank', { exact: true })).toHaveCount(0);
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
		page.getByRole('region', { name: 'Grade summary' }).getByText('3.00').first()
	).toBeVisible();
	await expect(
		page.locator('main ol').getByRole('link', { name: /B\+ Theme Preview/ })
	).toBeVisible();
});

test('Gradebook class controls open the selected course', async ({ page }) => {
	await page.goto('/grades');
	await page
		.locator('main ol')
		.getByRole('link', { name: /Theme Preview/ })
		.click();
	await expect(page).toHaveURL(/\/grades\/preview$/);
	await expect(page.getByRole('heading', { level: 1, name: 'Theme Preview' })).toBeVisible();
});
