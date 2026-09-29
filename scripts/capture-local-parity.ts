import { chromium, type BrowserContext, type Page } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';

const outputRoot = '/tmp/grademaxxing-parity/local';
const baseUrl = 'http://127.0.0.1:5173';
const requestedPage = process.env.PARITY_PAGE;
const requestedMode = process.env.PARITY_MODE;
const courses = [
	['ap-calc', 'AP Calculus BC', '1', '214', 'M. Okafor', '91.6', 'A-'],
	['ap-english', 'AP English Language', '2', '108', 'S. Whitfield', '88.2', 'B+'],
	['ap-physics', 'AP Physics 1', '3', '301', 'D. Chen', '84.9', 'B'],
	['history', 'US History', '4', '117', 'R. Alvarez', '94.8', 'A'],
	['spanish', 'Spanish III', '5', '122', 'L. Fuentes', '90.4', 'A-'],
	['computer-science', 'Computer Science A', '6', '019', 'P. Nguyen', '97.1', 'A']
] as const;

const assignments = [
	['1', 'Unit 2 Test — Derivatives', 'Assessments', '8/17/2026', '87', '100'],
	['2', 'Quiz 2.3 — Chain Rule', 'Assessments', '8/14/2026', '38', '40'],
	['3', 'HW 2.4 — Implicit Differentiation', 'Homework', '8/16/2026', '10', '10'],
	['4', 'Related Rates Group Work', 'Classwork', '8/15/2026', '15', '15']
] as const;

const gradebookXml = `<Gradebook Type="" ErrorMessage="" HideStandardGraphInd="false" HideMarksColumnElementary="false" HidePointsColumnElementary="false" HidePercentSecondary="false" DisplayStandardsData="false" GBStandardsTabDefault="false"><ReportingPeriod Index="0" GradePeriod="Quarter 1" StartDate="8/1/2026" EndDate="10/10/2026"/><ReportingPeriods><ReportPeriod Index="0" GradePeriod="Quarter 1" StartDate="8/1/2026" EndDate="10/10/2026"/><ReportPeriod Index="1" GradePeriod="Quarter 2" StartDate="10/11/2026" EndDate="12/18/2026"/></ReportingPeriods><Courses>${courses.map(([id, name, period, room, teacher, score, letter]) => `<Course CourseID="${id}" CourseName="${name}" Period="${period}" Staff="${teacher}" StaffEMail="teacher@example.edu" Room="${room}" StaffGU="" ImageType="" HighlightPercentageCutOffForProgressBar="0" UsesRichContent="false"><Marks><Mark MarkName="Quarter 1" ShortMarkName="Q1" CalculatedScoreRaw="${score}" CalculatedScoreString="${letter}"><GradeCalculationSummary><AssignmentGradeCalc Type="Assessments" Weight="60%" Points="125" PointsPossible="140" WeightedPct="54%" CalculatedMark="A-"/><AssignmentGradeCalc Type="Homework" Weight="40%" Points="80" PointsPossible="85" WeightedPct="38%" CalculatedMark="A"/></GradeCalculationSummary><Assignments>${assignments.map(([assignmentId, name, type, date, earned, possible]) => `<Assignment GradebookID="${id}-${assignmentId}" Measure="${name}" Type="${type}" Date="${date}" DueDate="${date}" Score="${earned}" DisplayScore="${earned} out of ${possible}" ScoreCalValue="${earned}" ScoreMaxValue="${possible}" ScoreType="Raw Score" Points="${earned} / ${possible}" Point="${earned}" PointPossible="${possible}" Notes="${assignmentId === '1' ? 'Strong reasoning. Review question 4.' : ''}" MeasureDescription="${assignmentId === '1' ? 'Cumulative unit assessment covering derivatives and their applications.' : ''}" TeacherID="1" StudentID="1" HasDropBox="false" DropStartDate="" DropEndDate="" TimeSincePost="1d" TotalSecondsSincePost="1"/>`).join('')}</Assignments></Mark></Marks></Course>`).join('')}</Courses></Gradebook>`;

const gradebookXmlQuarter2 = gradebookXml
	.replace(
		'<ReportingPeriod Index="0" GradePeriod="Quarter 1" StartDate="8/1/2026" EndDate="10/10/2026"/>',
		'<ReportingPeriod Index="1" GradePeriod="Quarter 2" StartDate="10/11/2026" EndDate="12/18/2026"/>'
	)
	.replaceAll('MarkName="Quarter 1"', 'MarkName="Quarter 2"')
	.replaceAll('ShortMarkName="Q1"', 'ShortMarkName="Q2"');

const attendance = {
	Absences: {
		Absence: [
			{
				_AbsenceDate: '8/13/2026',
				_Reason: 'Excused',
				_Note: 'Medical appointment',
				Periods: {
					Period: [
						{
							_Number: '1',
							_Name: 'Excused',
							_Reason: 'Excused',
							_Course: 'AP Calculus BC',
							_Staff: 'M. Okafor',
							_StaffEMail: '',
							_IconName: '',
							_SchoolName: '',
							_StaffGU: '',
							_OrgYearGU: ''
						}
					]
				}
			},
			{
				_AbsenceDate: '8/6/2026',
				_Reason: 'Tardy',
				_Note: 'Tardy',
				Periods: {
					Period: [
						{
							_Number: '1',
							_Name: 'Tardy',
							_Reason: 'Tardy',
							_Course: 'AP Calculus BC',
							_Staff: 'M. Okafor',
							_StaffEMail: '',
							_IconName: '',
							_SchoolName: '',
							_StaffGU: '',
							_OrgYearGU: ''
						}
					]
				}
			}
		]
	},
	CourseTotals: [
		{ Course: 'AP Calculus BC', Present: 16, Tardy: 1, Absent: 0, Excused: 1, Unexcused: 0 },
		{ Course: 'AP English Language', Present: 17, Tardy: 0, Absent: 0, Excused: 1, Unexcused: 0 }
	],
	DailyRecords: [],
	TotalExcused: {},
	TotalTardies: {},
	TotalUnexcused: {},
	TotalActivities: {},
	TotalUnexcusedTardies: {}
};

const documents = {
	StudentDocumentDatas: {
		StudentDocumentData: [
			{
				_DocumentGU: 'report-card-q4',
				_DocumentFileName: 'Quarter 4 Report Card.pdf',
				_DocumentDate: '6/5/2026',
				_DocumentType: 'Report Card',
				_StudentGU: 'visual-student',
				_DocumentComment: 'Quarter 4 Report Card'
			},
			{
				_DocumentGU: 'unofficial-transcript',
				_DocumentFileName: 'Unofficial Transcript.pdf',
				_DocumentDate: '6/10/2026',
				_DocumentType: 'Transcript',
				_StudentGU: 'visual-student',
				_DocumentComment: 'Unofficial Transcript'
			},
			{
				_DocumentGU: 'map-growth-spring',
				_DocumentFileName: 'Spring MAP Growth Family Report.pdf',
				_DocumentDate: '5/20/2026',
				_DocumentType: 'MAP Growth Family Report',
				_StudentGU: 'visual-student',
				_DocumentComment: 'Spring MAP Growth Family Report'
			}
		]
	}
};

const recipient = {
	_RecipientType: 'From',
	_GU: 'counselor',
	_RecipientList: 'Staff',
	_GroupUserTypes: '',
	_Details1: 'College & Career Center',
	_Details2: 'Staff',
	_ReadCount: '',
	_PersonCount: ''
};

const mailMessages = [
	{
		From: { RecipientXML: recipient },
		To: {
			RecipientXML: {
				...recipient,
				_RecipientType: 'To',
				_GU: 'visual-student',
				_Details1: 'Bhavith Student',
				_Details2: 'Student'
			}
		},
		CC: '',
		BCC: '',
		Attachments: {
			AttachmentXML: [{ _SmAttachmentGU: 'senior-night-flyer', _DocumentName: 'College Night.pdf' }]
		},
		_SMMessageGU: 'college-night',
		_SMMsgPersonGU: 'college-night-person',
		_SendDateTime: '2026-08-28T09:15:00',
		_Subject: 'College information night — September 3',
		_MessageText:
			'<p>Students and families are invited to our fall college information night.</p><p>Please review the attached flyer and <a href="https://example.edu/college-night">reserve a seat online</a>.</p>',
		_FolderType: 'Inbox',
		_Priority: 'None',
		_IsItDraft: 'false',
		_MailRead: 'false',
		_SendDateTimeFormattedLong: 'Friday, August 28, 2026 at 9:15 AM',
		_SendDateTimeFormattedShort: '8/28/26',
		_IsSystemMessage: 'false'
	},
	{
		From: {
			RecipientXML: {
				...recipient,
				_GU: 'attendance-office',
				_Details1: 'Attendance Office'
			}
		},
		To: '',
		CC: '',
		BCC: '',
		Attachments: '',
		_SMMessageGU: 'attendance-reminder',
		_SMMsgPersonGU: 'attendance-reminder-person',
		_SendDateTime: '2026-08-26T14:40:00',
		_Subject: 'Attendance record updated',
		_MessageText: '<p>Your attendance record for August 26 has been updated.</p>',
		_FolderType: 'Inbox',
		_Priority: 'None',
		_IsItDraft: 'false',
		_MailRead: 'true',
		_SendDateTimeFormattedLong: 'Wednesday, August 26, 2026 at 2:40 PM',
		_SendDateTimeFormattedShort: '8/26/26',
		_IsSystemMessage: 'false'
	}
];

async function mockApp(context: BrowserContext) {
	await context.addInitScript(() => {
		localStorage.setItem(
			'token',
			JSON.stringify({
				username: 'student@example.edu',
				domain: 'ca-pleas-psv.edupoint.com',
				sessionId: 'visual-parity'
			})
		);
	});
	await context.route('**/api/session/status', (route) =>
		route.fulfill({
			status: 200,
			contentType: 'application/json',
			body: JSON.stringify({
				signedIn: true,
				username: 'student@example.edu',
				domain: 'ca-pleas-psv.edupoint.com'
			})
		})
	);
	await context.route('**/api/studentvue/**', (route) => {
		const url = new URL(route.request().url());
		const resource = url.pathname.split('/').at(-1);
		const bodies: Record<string, unknown> = {
			gradebook: {
				xml: url.searchParams.get('reportPeriod') === '1' ? gradebookXmlQuarter2 : gradebookXml
			},
			attendance,
			documents,
			messages: { InboxItemListings: { MessageXML: mailMessages } },
			message: mailMessages[0],
			'student-info': {
				FormattedName: 'Bhavith Student',
				PermID: 123456,
				Gender: '',
				Grade: 10,
				Photo: ''
			},
			calendar: { events: [] }
		};
		return route.fulfill({
			status: 200,
			contentType: 'application/json',
			body: JSON.stringify(bodies[resource ?? ''] ?? {})
		});
	});
}

async function settlePage(page: Page) {
	await page.evaluate(async () => {
		await document.fonts.ready;
		window.scrollTo(0, 0);
	});
	await page.waitForTimeout(250);
}

async function measurePage(page: Page) {
	// tsx can preserve nested function names with a small `__name` helper. Playwright serializes
	// this callback without that module helper, so make the capture self-contained in the browser.
	await page.evaluate('globalThis.__name ??= (target) => target');
	return page.evaluate(() => {
		function measure(selector: string) {
			const element = document.querySelector<HTMLElement>(selector);
			return element ? measureElement(element) : null;
		}

		function measureLast(selector: string) {
			const elements = document.querySelectorAll<HTMLElement>(selector);
			const element = elements.item(elements.length - 1);
			return element ? measureElement(element) : null;
		}

		function measureAt(selector: string, index = 0) {
			const element = document.querySelectorAll<HTMLElement>(selector).item(index);
			return element ? measureElement(element) : null;
		}

		function measureElement(element: HTMLElement) {
			const box = element.getBoundingClientRect();
			const style = getComputedStyle(element);
			return {
				box: {
					x: box.x,
					y: box.y,
					width: box.width,
					height: box.height
				},
				fontFamily: style.fontFamily,
				fontSize: style.fontSize,
				fontWeight: style.fontWeight,
				lineHeight: style.lineHeight,
				letterSpacing: style.letterSpacing,
				textAlign: style.textAlign,
				color: style.color,
				backgroundColor: style.backgroundColor,
				borderColor: style.borderColor,
				borderRadius: style.borderRadius,
				boxShadow: style.boxShadow,
				opacity: style.opacity,
				padding: style.padding,
				gap: style.gap
			};
		}

		function findExactText(text: string) {
			return Array.from(document.querySelectorAll<HTMLElement>('*')).find(
				(element) => element.children.length === 0 && element.textContent?.trim() === text
			);
		}

		const assignmentTitle = findExactText('Unit 2 Test — Derivatives');
		const gpaCalculator = Array.from(
			document.querySelectorAll<HTMLElement>('main a, main button')
		).find((element) => element.textContent?.trim() === 'GPA calculator');
		const reportPeriod = Array.from(document.querySelectorAll<HTMLElement>('main button')).find(
			(element) => element.textContent?.trim() === 'Quarter 1'
		);
		const allCoursesLink = Array.from(document.querySelectorAll<HTMLAnchorElement>('a')).find(
			(link) => link.textContent?.includes('All courses')
		);

		return {
			viewport: { width: innerWidth, height: innerHeight },
			body: measure('body'),
			h1: measure('h1'),
			main: measureLast('main'),
			nav: measure('nav'),
			aside: measure('aside'),
			button: measure('button'),
			input: measure('input'),
			allCoursesLink: allCoursesLink ? measureElement(allCoursesLink) : null,
			gpaCalculator: gpaCalculator ? measureElement(gpaCalculator) : null,
			reportPeriod: reportPeriod ? measureElement(reportPeriod) : null,
			mobileGpaFold: measure('details'),
			courseCard: measure('main ol > li:first-child > a'),
			gradeChart: measure('section[aria-label="Grade trend"]'),
			assignmentTabs: measure('[data-slot="tabs-list"]'),
			assignmentCard: assignmentTitle?.closest<HTMLElement>('[data-slot="card"]')
				? measureElement(assignmentTitle.closest<HTMLElement>('[data-slot="card"]')!)
				: null,
			assignmentTitle: assignmentTitle ? measureElement(assignmentTitle) : null,
			assignmentProgress: assignmentTitle
				?.closest<HTMLElement>('[data-slot="card"]')
				?.querySelector<HTMLElement>('[data-slot="progress"]')
				? measureElement(
						assignmentTitle
							.closest<HTMLElement>('[data-slot="card"]')!
							.querySelector<HTMLElement>('[data-slot="progress"]')!
					)
				: null,
			typography: {
				metricLabel: measure('[aria-label="Grade summary"] .metric-label'),
				summaryValue: measure('[aria-label="Grade summary"] strong'),
				summaryCount: measure('[aria-label="Grade summary"] .font-mono.text-xs'),
				courseGrade: measure('ol > li:first-child > a > div:first-child'),
				courseTitle: measure('ol > li:first-child h2'),
				courseMetadata: measure('ol > li:first-child > a > div:nth-child(2) > div:nth-child(2)'),
				coursePill: measure(
					'ol > li:first-child > a > div:nth-child(2) > div:nth-child(2) > span:first-child'
				),
				coursePillIcon: measure(
					'ol > li:first-child > a > div:nth-child(2) > div:nth-child(2) > span:first-child svg'
				),
				coursePercentage: measure('ol > li:first-child > a > div:nth-child(3) .font-mono'),
				detailHeading: measureAt('[aria-label="Gradebook details"] h2', 0),
				recentHeading: measureAt('[aria-label="Gradebook details"] h2', 1),
				recentAssignment: measure(
					'[aria-label="Gradebook details"] section:nth-child(2) li:first-child p:first-child'
				)
			}
		};
	});
}

async function capture(
	mode: 'desktop-dark' | 'mobile-dark' | 'desktop-light' | 'mobile-light',
	viewport: { width: number; height: number },
	light: boolean
) {
	const browser = await chromium.launch({ channel: 'chrome' });
	const context = await browser.newContext({ viewport, colorScheme: light ? 'light' : 'dark' });
	await mockApp(context);
	await context.addInitScript(
		(theme) => {
			localStorage.setItem('mode-watcher-mode', theme);
			Object.defineProperty(navigator, 'share', {
				configurable: true,
				value: async (payload: ShareData) =>
					sessionStorage.setItem('visual-audit-share', JSON.stringify(payload))
			});
		},
		light ? 'light' : 'dark'
	);
	const page: Page = await context.newPage();
	const directory = `${outputRoot}/${mode}`;
	await mkdir(directory, { recursive: true });
	const metrics: Record<string, Awaited<ReturnType<typeof measurePage>>> = {};
	const pages = [
		['gradebook', '/grades'],
		['course', '/grades/ap-calc'],
		['attendance', '/attendance'],
		['gpa-calculator', '/gpa-calculator'],
		['documents', '/documents'],
		['mail', '/mail'],
		['feedback', '/feedback'],
		['student-info', '/studentinfo']
	] as const;
	for (const [name, path] of requestedPage
		? pages.filter(([name]) => name === requestedPage)
		: pages) {
		await page.goto(`${baseUrl}${path}`, { waitUntil: 'networkidle' });
		await page.mouse.move(0, 0);
		await settlePage(page);
		await page.screenshot({
			path: `${directory}/${name}.png`,
			fullPage: true,
			animations: 'disabled'
		});
		metrics[name] = await measurePage(page);
		if (mode.startsWith('mobile') && name === 'gradebook') {
			await page.locator('details > summary').click();
			await settlePage(page);
			await page.screenshot({
				path: `${directory}/gradebook-gpa-open.png`,
				fullPage: true,
				animations: 'disabled'
			});
			metrics['gradebook-gpa-open'] = await measurePage(page);
		}
		if (mode.startsWith('desktop') && name === 'gradebook') {
			await page.screenshot({
				path: `${directory}/sidebar.png`,
				clip: { x: 0, y: 0, width: 240, height: viewport.height },
				animations: 'disabled'
			});
			await page.getByTestId('sidebar-nav-attendance').hover();
			await page.waitForTimeout(100);
			await page.screenshot({
				path: `${directory}/sidebar-hover.png`,
				clip: { x: 0, y: 0, width: 240, height: viewport.height },
				animations: 'disabled'
			});
		}
		if (name === 'gradebook') {
			await page.locator('main ol a').first().hover();
			await page.screenshot({
				path: `${directory}/gradebook-course-hover.png`,
				fullPage: true,
				animations: 'disabled'
			});
			await page.mouse.move(0, 0);
			await page.getByRole('combobox', { name: 'Report period' }).selectOption('1');
			await settlePage(page);
			await page.screenshot({
				path: `${directory}/gradebook-period-changed.png`,
				fullPage: true,
				animations: 'disabled'
			});
			await page.getByRole('combobox', { name: 'Report period' }).selectOption('0');
			await page.getByRole('button', { name: 'Share your rank' }).click();
			await settlePage(page);
			await page.screenshot({
				path: `${directory}/gradebook-rank-shared.png`,
				fullPage: true
			});
			await page.getByRole('button', { name: 'Close', exact: true }).click();
			if (mode.startsWith('desktop')) {
				await page.getByRole('button', { name: light ? 'Dark' : 'Light', exact: true }).click();
				await settlePage(page);
				await page.screenshot({
					path: `${directory}/gradebook-theme-toggled.png`,
					fullPage: true,
					animations: 'disabled'
				});
				await page.getByRole('button', { name: light ? 'Light' : 'Dark', exact: true }).click();
			}
		}
		if (name === 'course') {
			await page.getByRole('tab', { name: 'Assessments', exact: true }).click();
			await settlePage(page);
			await page.screenshot({
				path: `${directory}/course-assessments.png`,
				fullPage: true,
				animations: 'disabled'
			});
			await page.getByRole('tab', { name: 'Homework', exact: true }).click();
			await settlePage(page);
			await page.screenshot({
				path: `${directory}/course-homework.png`,
				fullPage: true,
				animations: 'disabled'
			});
			await page.getByRole('tab', { name: 'Classwork', exact: true }).click();
			await settlePage(page);
			await page.screenshot({
				path: `${directory}/course-classwork.png`,
				fullPage: true,
				animations: 'disabled'
			});
			await page.getByRole('tab', { name: 'All', exact: true }).click();
			await page.getByTitle('Assignment description').first().click();
			await settlePage(page);
			await page.screenshot({
				path: `${directory}/course-description-open.png`,
				fullPage: true,
				animations: 'disabled'
			});
			await page.getByTitle('Assignment description').first().click();
			await page.getByTitle('Teacher comments').first().click();
			await settlePage(page);
			await page.screenshot({
				path: `${directory}/course-comments-open.png`,
				fullPage: true,
				animations: 'disabled'
			});
			await page.getByTitle('Teacher comments').first().click();
			await page.getByLabel('Show category breakdown').check();
			await settlePage(page);
			await page.screenshot({
				path: `${directory}/course-category-breakdown.png`,
				fullPage: true,
				animations: 'disabled'
			});
			await page.getByLabel('Show category breakdown').uncheck();
			await page.getByRole('tab', { name: 'Assessments', exact: true }).click();
			await page.getByLabel('Hypothetical Mode').check();
			await settlePage(page);
			await page.screenshot({
				path: `${directory}/course-hypothetical.png`,
				fullPage: true,
				animations: 'disabled'
			});
			const whatIfForm = page.getByRole('form', { name: 'Add what-if assignment' });
			await whatIfForm.getByLabel('What-if score').focus();
			await page.screenshot({
				path: `${directory}/course-hypothetical-focused.png`,
				fullPage: true,
				animations: 'disabled'
			});
			await whatIfForm.getByLabel('What-if score').fill('10');
			await whatIfForm.getByLabel('What-if points possible').fill('10');
			await whatIfForm.getByRole('button', { name: 'Add' }).click();
			await settlePage(page);
			await page.screenshot({
				path: `${directory}/course-hypothetical-added.png`,
				fullPage: true,
				animations: 'disabled'
			});
			const addedCard = page
				.getByText('What-if 1', { exact: true })
				.filter({ visible: true })
				.first()
				.locator('xpath=ancestor::*[@data-slot="card"]');
			await addedCard.getByLabel('Category for What-if 1').selectOption('Homework');
			await settlePage(page);
			await page.screenshot({
				path: `${directory}/course-hypothetical-category-edited.png`,
				fullPage: true,
				animations: 'disabled'
			});
			await page.getByRole('tab', { name: 'Homework', exact: true }).click();
			await addedCard.getByTitle('Points earned').fill('7');
			await settlePage(page);
			await page.screenshot({
				path: `${directory}/course-hypothetical-score-edited.png`,
				fullPage: true,
				animations: 'disabled'
			});
			await addedCard.getByRole('button', { name: 'Remove this what-if' }).click();
			await page.getByRole('button', { name: 'Reset changes' }).click();
			await settlePage(page);
			await page.screenshot({
				path: `${directory}/course-hypothetical-reset.png`,
				fullPage: true,
				animations: 'disabled'
			});
		}
		if (name === 'gpa-calculator') {
			await page.getByLabel('weighted +1.0').first().click();
			await settlePage(page);
			await page.screenshot({
				path: `${directory}/gpa-calculator-edited.png`,
				fullPage: true,
				animations: 'disabled'
			});
			await page.getByRole('combobox', { name: 'Projected grade' }).first().selectOption('B');
			await settlePage(page);
			await page.screenshot({
				path: `${directory}/gpa-calculator-letter-edited.png`,
				fullPage: true,
				animations: 'disabled'
			});
			await page.getByRole('button', { name: 'Reset all' }).click();
			await settlePage(page);
			await page.screenshot({
				path: `${directory}/gpa-calculator-reset.png`,
				fullPage: true,
				animations: 'disabled'
			});
		}
		if (name === 'feedback') {
			await page.locator('textarea').focus();
			await page.locator('textarea').fill('Visual parity keyboard check');
			await page.screenshot({
				path: `${directory}/feedback-focused.png`,
				fullPage: true,
				animations: 'disabled'
			});
		}
		if (name === 'attendance') {
			await page.getByRole('button', { name: 'Calendar', exact: true }).click();
			await settlePage(page);
			await page.screenshot({
				path: `${directory}/attendance-calendar.png`,
				fullPage: true,
				animations: 'disabled'
			});
			await page.getByRole('button', { name: 'Previous month' }).click();
			await settlePage(page);
			await page.screenshot({
				path: `${directory}/attendance-previous-month.png`,
				fullPage: true,
				animations: 'disabled'
			});
			await page.getByRole('button', { name: 'Next month' }).click();
			await page.getByRole('button', { name: 'Next month' }).click();
			await settlePage(page);
			await page.screenshot({
				path: `${directory}/attendance-next-month.png`,
				fullPage: true,
				animations: 'disabled'
			});
			await page.getByRole('button', { name: 'Today', exact: true }).click();
			await page.getByRole('button', { name: 'Overview', exact: true }).click();
			await settlePage(page);
			await page.screenshot({
				path: `${directory}/attendance-overview.png`,
				fullPage: true,
				animations: 'disabled'
			});
		}
		if (name === 'documents') {
			for (const tab of ['Transcript', 'Report Card', 'MAP Growth Family Report']) {
				await page.getByRole('tab', { name: tab, exact: true }).click();
				await settlePage(page);
				await page.screenshot({
					path: `${directory}/documents-${tab.toLowerCase().replaceAll(' ', '-')}.png`,
					fullPage: true,
					animations: 'disabled'
				});
			}
			await page.getByRole('tab', { name: 'All', exact: true }).click();
		}
		if (name === 'mail') {
			await page.getByTestId('mail-message').first().click();
			await page.getByRole('dialog').waitFor({ state: 'visible' });
			await settlePage(page);
			await page.screenshot({
				path: `${directory}/mail-message-open.png`,
				fullPage: true,
				animations: 'disabled'
			});
			await page.keyboard.press('Escape');
			await page.getByTestId('mail-message').nth(1).click();
			await page.getByRole('dialog').waitFor({ state: 'visible' });
			await settlePage(page);
			await page.screenshot({
				path: `${directory}/mail-second-message-open.png`,
				fullPage: true,
				animations: 'disabled'
			});
		}
	}
	await writeFile(`${directory}/metrics.json`, `${JSON.stringify(metrics, null, 2)}\n`);
	await browser.close();
}

async function capturePublic(
	viewport: { width: number; height: number },
	mode: 'desktop' | 'mobile'
) {
	const browser = await chromium.launch({ channel: 'chrome' });
	const context = await browser.newContext({ viewport, colorScheme: 'dark' });
	const page = await context.newPage();
	const directory = `${outputRoot}/${mode}-public`;
	await mkdir(directory, { recursive: true });
	const metrics: Record<string, Awaited<ReturnType<typeof measurePage>>> = {};
	const pages = [
		['landing', '/'],
		['login', '/login'],
		['signup', '/signup'],
		['signup-google', '/signup/google']
	] as const;
	for (const [name, path] of requestedPage
		? pages.filter(([name]) => name === requestedPage)
		: pages) {
		await page.goto(`${baseUrl}${path}`, { waitUntil: 'networkidle' });
		await page.mouse.move(0, 0);
		await settlePage(page);
		await page.screenshot({
			path: `${directory}/${name}.png`,
			fullPage: true,
			animations: 'disabled'
		});
		metrics[name] = await measurePage(page);
		if (name === 'login') {
			await page.getByRole('button', { name: 'Change', exact: true }).click();
			await settlePage(page);
			await page.screenshot({
				path: `${directory}/login-district-change.png`,
				fullPage: true,
				animations: 'disabled'
			});
		}
	}
	await writeFile(`${directory}/metrics.json`, `${JSON.stringify(metrics, null, 2)}\n`);
	await browser.close();
}

if (!requestedMode || requestedMode === 'desktop-dark')
	await capture('desktop-dark', { width: 1440, height: 900 }, false);
if (!requestedMode || requestedMode === 'mobile-dark')
	await capture('mobile-dark', { width: 390, height: 844 }, false);
if (!requestedMode || requestedMode === 'desktop-light')
	await capture('desktop-light', { width: 1440, height: 900 }, true);
if (!requestedMode || requestedMode === 'mobile-light')
	await capture('mobile-light', { width: 390, height: 844 }, true);
if (!requestedMode || requestedMode === 'desktop-public')
	await capturePublic({ width: 1440, height: 900 }, 'desktop');
if (!requestedMode || requestedMode === 'mobile-public')
	await capturePublic({ width: 390, height: 844 }, 'mobile');
console.log(outputRoot);
