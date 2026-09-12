import {
	attendanceCourseRecords,
	attendancePeriodRecords,
	normalizeDistrictUrl,
	parseGradebookAssignmentDetail,
	parseGradebookClassDetail,
	Pxp2Client,
	Pxp2InputError,
	Pxp2SessionExpiredError
} from '$lib/server/pxp2';
import { afterEach, expect, test, vi } from 'vitest';

afterEach(() => vi.unstubAllGlobals());

test('keep-alive touches an authenticated lightweight StudentVUE page', async () => {
	const fetchMock = vi
		.fn<typeof fetch>()
		.mockResolvedValue(new Response('<title>StudentVUE</title>'));
	vi.stubGlobal('fetch', fetchMock);
	const client = Pxp2Client.resume({
		baseUrl: 'https://ca-example-psv.edupoint.com/',
		cookies: { ASP_NET_SessionId: 'upstream-session' }
	});

	await client.keepAlive();
	expect(fetchMock).toHaveBeenCalledTimes(1);
	const [url, init] = fetchMock.mock.calls[0]!;
	expect(String(url)).toBe('https://ca-example-psv.edupoint.com/PXP2_Student.aspx?AGU=0');
	expect(new Headers(init?.headers).get('cookie')).toBe('ASP_NET_SessionId=upstream-session');
});

test('keep-alive detects StudentVUE login redirects as upstream expiry', async () => {
	const response = new Response('<title>StudentVUE login</title>');
	Object.defineProperty(response, 'url', {
		value: 'https://ca-example-psv.edupoint.com/PXP2_Login_Student.aspx'
	});
	vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockResolvedValue(response));
	const client = Pxp2Client.resume({
		baseUrl: 'https://ca-example-psv.edupoint.com/',
		cookies: { ASP_NET_SessionId: 'expired-session' }
	});

	await expect(client.keepAlive()).rejects.toBeInstanceOf(Pxp2SessionExpiredError);
});

test('summary gradebook skips serial class detail only when every class has a usable header', async () => {
	const focus = JSON.stringify({
		LoadParams: { ControlName: 'Gradebook_ClassDetails' },
		FocusArgs: { classID: 'course-1' }
	}).replaceAll('"', '&quot;');
	const page = `<title>StudentVUE</title>
		<script>PXP.GBCurrentFocus = {"FocusArgs":{"gradePeriodGU":"period-1","AGU":"student"}};</script>
		<script>PXP.GBFocusData = {"GradingPeriods":[{"GU":"period-1","schoolID":"school","OrgYearGU":"year","defaultFocus":true,"Name":"Quarter 1","MarkPeriods":[{"GU":"mark-1","Name":"Quarter 1"}]}]};</script>
		<div class="gb-class-header"><span class="course-title" data-focus="${focus}">1: Biology</span></div>
		<div class="gb-class-row" data-guid="course-1"><span class="mark">A</span></div>`;
	const fetchMock = vi.fn<typeof fetch>().mockImplementation(async (input) => {
		const path = String(input);
		if (path.includes('PXP2_Gradebook.aspx')) return new Response(page);
		if (path.includes('GradebookFocusClassInfo'))
			return new Response(
				JSON.stringify({ d: { Data: { Classes: [{ ID: 'class-info-id', Name: 'Biology' }] } } })
			);
		throw new Error(`Unexpected portal request: ${path}`);
	});
	vi.stubGlobal('fetch', fetchMock);
	const client = Pxp2Client.resume({
		baseUrl: 'https://ca-example-psv.edupoint.com/',
		cookies: { ASP_NET_SessionId: 'summary-session' }
	});

	const gradebook = await client.gradebook(undefined, true);

	expect(gradebook.courses).toMatchObject([{ id: 'class-info-id', title: 'Biology', score: 'A' }]);
	expect(gradebook.detailed).toBe(false);
	expect(fetchMock).toHaveBeenCalledTimes(2);
});

test('modern attendance HTML preserves SOAP-equivalent per-course events', () => {
	const html = `
		<div id="attendance-by-course"><div class="detail-grid"><div class="school-detail">
		<table class="table table-striped"><tbody>
			<tr><td><button></button></td><td>Biology</td><td>81</td><td>2</td><td>1</td><td>1</td><td>0</td></tr>
			<tr class="att-course-details"><td><table><tbody>
				<tr><th>Date</th><th>StartTime</th><th>End Time</th><th>Absence</th><th>Reason</th></tr>
				<tr><td>8/27/2026</td><td>8:30 AM</td><td>9:20 AM</td><td>Tardy</td><td>Excused</td></tr>
			</tbody></table></td></tr>
		</tbody></table>
		</div></div></div>`;

	expect(attendanceCourseRecords(html)).toEqual([
		{
			course: 'Biology',
			totals: { present: 81, tardy: 2, absent: 1, excused: 1, unexcused: 0 },
			events: [
				{
					date: '8/27/2026',
					startTime: '8:30 AM',
					endTime: '9:20 AM',
					absence: 'Tardy',
					reason: 'Excused'
				}
			]
		}
	]);
});

test('modern attendance HTML preserves period totals and fallback events', () => {
	const html = `
		<div id="attendance-by-period"><div class="detail-grid"><div class="school-detail">
		<table class="table table-striped"><tbody>
			<tr><td><button></button></td><td>Period 2</td><td>9:25 AM</td><td>10:15 AM</td><td>1</td><td>2</td><td>1</td><td>1</td></tr>
			<tr class="att-course-details"><td><table><tbody>
				<tr><th>Date</th><th>Absence</th><th>Reason</th></tr>
				<tr><td>8/28/2026</td><td>Absent</td><td>Excused</td></tr>
			</tbody></table></td></tr>
		</tbody></table>
		</div></div></div>`;

	expect(attendancePeriodRecords(html)).toEqual([
		{
			period: 'Period 2',
			startTime: '9:25 AM',
			endTime: '10:15 AM',
			totals: { tardy: 1, absent: 2, excused: 1, unexcused: 1 },
			events: [{ date: '8/28/2026', absence: 'Absent', reason: 'Excused' }]
		}
	]);
});

test('district URLs are restricted to credential-free HTTPS StudentVUE hosts', () => {
	expect(normalizeDistrictUrl('ca-example-psv.edupoint.com/path?ignored=true').href).toBe(
		'https://ca-example-psv.edupoint.com/'
	);
	expect(normalizeDistrictUrl('synergylive.pusd11.net').href).toBe(
		'https://synergylive.pusd11.net/'
	);
	expect(
		normalizeDistrictUrl('https://sdhome.sdcoe.net/bonsall/PXP2_Login_Student.aspx').href
	).toBe('https://sdhome.sdcoe.net/bonsall/');
	expect(() => normalizeDistrictUrl('http://ca-example-psv.edupoint.com')).toThrow(Pxp2InputError);
	expect(() => normalizeDistrictUrl('https://example.com')).toThrow(Pxp2InputError);
	expect(() => normalizeDistrictUrl('https://sdhome.sdcoe.net/not-a-district')).toThrow(
		Pxp2InputError
	);
	expect(() => normalizeDistrictUrl('https://edupoint.com')).toThrow(Pxp2InputError);
	expect(() => normalizeDistrictUrl('https://ca-example-psv.edupoint.com.evil.test')).toThrow(
		Pxp2InputError
	);
	expect(() => normalizeDistrictUrl('https://user:secret@ca-example-psv.edupoint.com')).toThrow(
		Pxp2InputError
	);
	expect(() => normalizeDistrictUrl('https://ca-example-psv.edupoint.com:8443')).toThrow(
		Pxp2InputError
	);
});

test('complete class details recover wrapped and scaled assignment rows', () => {
	const html = `
		<div id="current-grade"><span class="mark">A-</span><span class="score">91.25%</span></div>
		<script>{"dataSource":[{"CategoryName":"Tests","Weight":"60%","Points":"15","PointsPossible":"19","WeightedPct":"47.37","CalculatedMark":"C"}]}</script>
		<div id="AssignmentsGrid"></div>
		<script>{"dataSource":[{
			"gradeBookId":"396634",
			"Date":"8/14/26",
			"GBAssignment":"{\\"value\\":\\"Unit Test\\",\\"dataType\\":\\"LinkColumn\\"}",
			"GBAssignmentType":"Tests",
			"GBScore":"{\\"value\\":\\"15 out of 19.0000\\",\\"dataType\\":\\"LinkColumn\\"}",
			"GBScoreType":"Raw Score",
			"GBPoints":"7.89/10.0000",
			"GBNotes":"Retake available"
		}]}</script>`;

	const detail = parseGradebookClassDetail(html);
	expect(detail).toMatchObject({
		hasAssignmentGrid: true,
		letter: 'A-',
		percentage: '91.25',
		categories: [
			{
				name: 'Tests',
				weight: '60',
				points: '15',
				pointsPossible: '19',
				weightedPercentage: '47.37',
				calculatedMark: 'C'
			}
		],
		assignments: [
			{
				AssignmentID: '396634',
				Measure: 'Unit Test',
				Type: 'Tests',
				Date: '8/14/2026',
				Point: '7.89',
				PointPossible: '10.0000',
				ScoreCalValue: '15',
				ScoreMaxValue: '19.0000'
			}
		]
	});
});

test('N/A class-detail placeholders are not exposed as real zero-percent grades', () => {
	const detail = parseGradebookClassDetail(`
		<div id="current-grade"><span class="mark">N/A</span><span class="score">0.0%</span></div>
		<div id="AssignmentsGrid"></div>`);
	expect(detail.letter).toBe('');
	expect(detail.percentage).toBe('');
});

test('assignment details recover graded rows omitted from the course-content feed', () => {
	const cell = (label: string, value: string) =>
		`<td><span class="tbl_label">${label}:</span><span class="tbl_value">${value}</span></td>`;
	const detail = parseGradebookAssignmentDetail(
		`<table class="info_tbl"><tr>
			${cell('Assignment', 'Course Outline Quiz')}
			${cell('Assignment Type', 'Assessments')}
			${cell('Date', '8/19/2026')}
			${cell('Due Date', '8/20/2026')}
			${cell('Score', '11.25')}
			${cell('Score Type', 'Raw Score')}
			${cell('Points', '11.25 / 12.0000')}
			${cell('Notes', 'Retake available')}
		</tr></table>`,
		'396650'
	);

	expect(detail).toEqual({
		AssignmentID: '396650',
		Measure: 'Course Outline Quiz',
		Type: 'Assessments',
		Date: '8/19/2026',
		DueDate: '8/20/2026',
		Score: '11.25',
		ScoreType: 'Raw Score',
		Points: '11.25 / 12.0000',
		Notes: 'Retake available',
		Description: ''
	});
});
