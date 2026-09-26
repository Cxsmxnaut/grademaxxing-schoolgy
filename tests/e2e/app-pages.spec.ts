import { expect, test } from '@playwright/test';

function gradebookXml(index: number, name: string, score: string, letter: string) {
	return `<Gradebook><ReportingPeriod Index="${index}" GradePeriod="${name}"/><ReportingPeriods><ReportPeriod Index="0" GradePeriod="Semester 1"/><ReportPeriod Index="1" GradePeriod="Semester 2"/></ReportingPeriods><Courses><Course CourseID="preview" CourseName="Theme Preview" Period="1" Staff="Teacher Example" StaffEMail="teacher@example.edu" Room="101"><Marks><Mark MarkName="${name}" CalculatedScoreRaw="${score}" CalculatedScoreString="${letter}"><GradeCalculationSummary><AssignmentGradeCalc Type="Assessments" Weight="100%" Points="${score}" PointsPossible="100" WeightedPct="${score}%" CalculatedMark="${letter}"/></GradeCalculationSummary><Assignments><Assignment GradebookID="preview-assessment" Measure="Unit assessment" Type="Assessments" Date="8/20/2026" DueDate="8/20/2026" Score="${score}" DisplayScore="${score} out of 100" ScoreCalValue="${score}" ScoreMaxValue="100" ScoreType="Raw Score" Points="${score} / 100" Point="${score}" PointPossible="100" Notes="Strong reasoning. Review question 4." MeasureDescription="Cumulative unit assessment covering the first four lessons." HasDropBox="false"/></Assignments></Mark></Marks></Course></Courses></Gradebook>`;
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
	['/rankings', 'Rankings & achievements'],
	['/gpa-calculator', 'GPA calculator'],
	['/grades/preview', 'Theme Preview'],
	['/attendance', 'Attendance'],
	['/documents', 'Documents'],
	['/mail', 'Mail'],
	['/studentinfo', 'Student information'],
	['/feedback', 'What can we make better?']
] as const;

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

test('gradebook calculator, course planner, and attendance views are interactive', async ({
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
	await page.getByLabel('Hypothetical Mode').check();
	await expect(page.getByTestId('hypothetical-letter')).toBeVisible();
	const whatIfForm = page.getByRole('form', { name: 'Add what-if assignment' });
	await expect(whatIfForm).toBeVisible();
	await whatIfForm.getByLabel('What-if score').fill('10');
	await whatIfForm.getByLabel('What-if points possible').fill('10');
	await whatIfForm.getByRole('button', { name: 'Add' }).click();
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
	const miniCalendar = page.getByRole('complementary', { name: 'Calendar and status filters' });
	const monthHeading = miniCalendar.locator('.mini-heading strong');
	const initialMonth = await monthHeading.textContent();
	await page.getByRole('button', { name: 'Previous month' }).click();
	await expect(monthHeading).not.toHaveText(initialMonth ?? '');
	await page.getByRole('button', { name: 'Next month' }).click();
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

test('empty records, feedback state, mobile navigation, and dark theme are clear', async ({
	page
}) => {
	await page.goto('/documents');
	await expect(
		page.getByRole('heading', { name: 'No documents available yet' })
	).toBeVisible();
	await page.goto('/mail');
	await expect(
		page.getByRole('heading', { name: 'Your inbox is empty. Enjoy the silence.' })
	).toBeVisible();
	await page.goto('/feedback');
	let submittedFeedback: { kind?: string; message?: string } = {};
	const feedbackId = '0f143f0d-a034-48d6-8bb8-1d00c4a7e255';
	const replyToken = 'a'.repeat(43);
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
				createdAt: '2026-09-20T16:00:00.000Z'
			})
		});
	});
	const report = page.getByRole('button', { name: 'Send feedback' });
	await expect(report).toBeDisabled();
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
	await expect(page.getByRole('heading', { name: 'Your feedback' })).toBeVisible();
	await expect(page.getByText('Thanks — we found the issue and are working on it.')).toBeVisible();
	await expect(page.getByText('The latest assignment is missing')).toHaveCount(1);
	if (process.env.FEEDBACK_VISUAL_CAPTURE)
		await page.screenshot({ path: '/tmp/grademaxxing-feedback-chat-desktop.png', fullPage: true });
	await page.setViewportSize({ width: 390, height: 844 });
	if (process.env.FEEDBACK_VISUAL_CAPTURE)
		await page.screenshot({ path: '/tmp/grademaxxing-feedback-chat-mobile.png', fullPage: true });
	await page.setViewportSize({ width: 1280, height: 900 });

	await expect(page.locator('html')).toHaveClass(/dark/);
	await expect(page.getByTestId('sidebar-theme')).toHaveCount(0);

	await page.setViewportSize({ width: 390, height: 844 });
	await page.goto('/grades');
	await expect(page.getByRole('button', { name: 'Use light theme' })).toHaveCount(0);
	for (const label of ['Grades', 'Rankings', 'Attendance', 'Documents', 'Mail'])
		await expect(
			page.getByRole('navigation', { name: 'Mobile navigation' }).getByText(label, { exact: true })
		).toBeVisible();
	for (const [label, path] of [
		['Rankings', '/rankings'],
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

test('Rankings shows the tougher tier ladder and gradebook achievements', async ({ page }) => {
	await page.goto('/rankings');
	await expect(
		page.getByRole('heading', { level: 1, name: 'Rankings & achievements' })
	).toBeVisible();
	await expect(page.getByRole('heading', { level: 2, name: 'Champion', exact: true })).toBeVisible();
	await expect(page.getByText('Provisional', { exact: true }).first()).toBeVisible();
	await expect(page.getByText('Add 3 more to confirm this tier.')).toBeVisible();
	await expect(page.getByText('4.00–4.00 GPA')).toBeVisible();
	await expect(page.getByTestId('completed-ranks')).not.toHaveAttribute('open', '');
	await expect(page.getByTestId('completed-ranks-toggle')).toContainText('Completed tiers');
	await page.getByTestId('completed-ranks-toggle').click();
	await expect(page.getByTestId('completed-ranks')).toHaveAttribute('open', '');
	await expect(page.getByRole('heading', { level: 3, name: 'Bronze', exact: true })).toHaveCount(0);
	await expect(page.getByRole('heading', { level: 3, name: 'Summit', exact: true })).toBeVisible();
	await expect(page.locator('img[src="/ranks/bronze.png"]')).toHaveCount(3);
	await expect(page.locator('img[src="/ranks/champion.png"]')).toHaveCount(2);
	await expect(page.getByRole('progressbar', { name: 'Achievements unlocked' })).toHaveAttribute(
		'aria-valuenow',
		'1'
	);
	await expect(page.getByRole('progressbar', { name: 'Achievements unlocked' })).toHaveAttribute(
		'aria-valuemax',
		'10'
	);
	await expect(page.getByRole('progressbar', { name: 'First ace progress' })).toHaveAttribute(
		'aria-valuenow',
		'100'
	);
	await expect(page.getByText('Your next move')).toHaveCount(0);
	const firstAchievement = page
		.getByRole('listitem')
		.filter({ has: page.getByRole('heading', { name: 'First ace' }) });
	await expect(firstAchievement).toBeVisible();
	await expect(firstAchievement.getByText('Unlocked', { exact: true })).toBeVisible();
	await expect(page.getByText('not your school’s official class rank or awards')).toBeVisible();
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
	await expect(summary.getByText('Champion', { exact: true })).toBeVisible();
	await expect(page.getByRole('progressbar', { name: 'Theme Preview grade' })).toHaveAttribute(
		'aria-valuenow',
		'95'
	);
	await expect(page.getByRole('button', { name: 'Share your rank' })).toBeVisible();
	await expect(page.getByRole('heading', { name: 'Next rank' })).toBeVisible();
	await expect(page.getByText('Unreal', { exact: true })).toBeVisible();
	await expect(page.getByText('0.01 GPA away')).toBeVisible();

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
		page.getByRole('region', { name: 'Grade summary' }).getByText('3.00').first()
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
	await expect(page.getByRole('dialog', { name: 'Your rank card' })).toBeVisible();
	await expect(page.getByText('No GPA or grades on the card.')).toBeVisible();
	await page.getByRole('button', { name: 'Cancel', exact: true }).click();
	await expect(page.getByRole('dialog', { name: 'Your rank card' })).toHaveCount(0);

	await page.getByRole('button', { name: 'Share your rank' }).click();
	const downloadPromise = page.waitForEvent('download');
	await page.getByRole('button', { name: 'Save image', exact: true }).click();
	const download = await downloadPromise;
	expect(download.suggestedFilename()).toMatch(/-rank\.svg$/);

	await page.getByRole('button', { name: 'Close', exact: true }).click();
	await page.getByRole('button', { name: 'Share your rank' }).click();
	await page.getByRole('button', { name: 'Share', exact: true }).click();
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
