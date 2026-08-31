import { chromium, type BrowserContext, type Page } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

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

const gradebookXml = `<Gradebook Type="" ErrorMessage="" HideStandardGraphInd="false" HideMarksColumnElementary="false" HidePointsColumnElementary="false" HidePercentSecondary="false" DisplayStandardsData="false" GBStandardsTabDefault="false"><ReportingPeriod Index="0" GradePeriod="Quarter 1" StartDate="8/1/2026" EndDate="10/10/2026"/><ReportingPeriods><ReportPeriod Index="0" GradePeriod="Quarter 1" StartDate="8/1/2026" EndDate="10/10/2026"/></ReportingPeriods><Courses>${courses.map(([id, name, period, room, teacher, score, letter]) => `<Course CourseID="${id}" CourseName="${name}" Period="${period}" Staff="${teacher}" StaffEMail="teacher@example.edu" Room="${room}" StaffGU="" ImageType="" HighlightPercentageCutOffForProgressBar="0" UsesRichContent="false"><Marks><Mark MarkName="Quarter 1" ShortMarkName="Q1" CalculatedScoreRaw="${score}" CalculatedScoreString="${letter}"><GradeCalculationSummary><AssignmentGradeCalc Type="Assessments" Weight="60%" Points="125" PointsPossible="140" WeightedPct="54%" CalculatedMark="A-"/><AssignmentGradeCalc Type="Homework" Weight="40%" Points="80" PointsPossible="85" WeightedPct="38%" CalculatedMark="A"/></GradeCalculationSummary><Assignments>${assignments.map(([assignmentId, name, type, date, earned, possible]) => `<Assignment GradebookID="${id}-${assignmentId}" Measure="${name}" Type="${type}" Date="${date}" DueDate="${date}" Score="${earned}" DisplayScore="${earned} out of ${possible}" ScoreCalValue="${earned}" ScoreMaxValue="${possible}" ScoreType="Raw Score" Points="${earned} / ${possible}" Point="${earned}" PointPossible="${possible}" Notes="" MeasureDescription="" TeacherID="1" StudentID="1" HasDropBox="false" DropStartDate="" DropEndDate="" TimeSincePost="1d" TotalSecondsSincePost="1"/>`).join('')}</Assignments></Mark></Marks></Course>`).join('')}</Courses></Gradebook>`;

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
		const resource = new URL(route.request().url()).pathname.split('/').at(-1);
		const bodies: Record<string, unknown> = {
			gradebook: { xml: gradebookXml },
			attendance,
			documents: { StudentDocumentDatas: { StudentDocumentData: [] } },
			messages: { InboxItemListings: { MessageXML: [] } },
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

async function capture(
	mode: 'desktop-dark' | 'mobile-dark' | 'desktop-light' | 'mobile-light',
	viewport: { width: number; height: number },
	light: boolean
) {
	const browser = await chromium.launch({ channel: 'chrome' });
	const context = await browser.newContext({ viewport, colorScheme: light ? 'light' : 'dark' });
	await mockApp(context);
	const page: Page = await context.newPage();
	await page.goto(`${baseUrl}/grades`, { waitUntil: 'networkidle' });
	if (light) await page.evaluate(() => localStorage.setItem('mode-watcher-mode', 'light'));
	await page.reload({ waitUntil: 'networkidle' });
	const directory = `${outputRoot}/${mode}`;
	await mkdir(directory, { recursive: true });
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
		await page.waitForTimeout(350);
		await page.screenshot({ path: `${directory}/${name}.png`, fullPage: true });
		if (mode.startsWith('desktop') && name === 'gradebook') {
			await page.screenshot({
				path: `${directory}/sidebar.png`,
				clip: { x: 0, y: 0, width: 240, height: viewport.height }
			});
			await page.getByTestId('sidebar-nav-attendance').hover();
			await page.screenshot({
				path: `${directory}/sidebar-hover.png`,
				clip: { x: 0, y: 0, width: 240, height: viewport.height }
			});
		}
	}
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
		await page.waitForTimeout(250);
		await page.screenshot({ path: `${directory}/${name}.png`, fullPage: true });
	}
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
