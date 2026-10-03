import { parseSynergyAssignment } from '$lib/grades/assignments';
import { gradebookXml } from '$lib/server/gradebook-adapter';
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
import {
	courseAssignment,
	gradeCategories,
	missingGradedAssignmentIds,
	reconcileAssignmentPoints
} from '$lib/server/pxp2/parsers';
import { parseGradebookXML } from '$lib/synergy';
import { afterEach, expect, test, vi } from 'vitest';

afterEach(() => vi.unstubAllGlobals());

test('category rules retain omitted zero weights and inactive future weights without inventing active totals', () => {
	expect(
		gradeCategories({
			isAssignmentWeightingOn: true,
			measureTypes: [
				{ id: 'practice', name: 'Practice', weight: 0 },
				{ id: 'pending-practice', name: 'Pending practice', weight: '0.00%' },
				{ id: 'tests', name: 'Tests', weight: 85 },
				{ id: 'final', name: 'Final', weight: 15 },
				{ id: 'active-missing', name: 'Active missing', weight: 20 },
				{ id: 'unused', name: 'Unused practice', weight: 0 },
				{ id: 'unknown', name: 'Unknown' },
				{ id: 'blank', name: 'Blank', weight: '' },
				{ id: 'malformed', name: 'Malformed', weight: 'unknown 0' }
			],
			assignments: [
				{ gradeBookId: 'practice-1', measureTypeId: 'practice', score: 9 },
				{ gradeBookId: 'pending-1', measureTypeId: 'pending-practice' },
				{ gradeBookId: 'test-1', measureTypeId: 'tests', score: 8 },
				{ gradeBookId: 'active-missing-1', measureTypeId: 'active-missing', score: 5 },
				{ gradeBookId: 'unknown-1', measureTypeId: 'unknown', score: 5 },
				{ gradeBookId: 'blank-1', measureTypeId: 'blank', score: 5 },
				{ gradeBookId: 'malformed-1', measureTypeId: 'malformed', score: 5 }
			],
			measureTypeGrades: [
				{ measureTypeId: 'tests', measureTypeWeight: 85, points: 8, pointsPossible: 10 }
			]
		})
	).toEqual([
		{
			name: 'Tests',
			weight: '85',
			points: '8',
			pointsPossible: '10',
			weightedPercentage: '68',
			calculatedMark: ''
		},
		{
			name: 'Practice',
			weight: '0',
			points: '0',
			pointsPossible: '0',
			weightedPercentage: '0',
			calculatedMark: ''
		},
		{
			name: 'Pending practice',
			weight: '0',
			points: '0',
			pointsPossible: '0',
			weightedPercentage: '0',
			calculatedMark: ''
		},
		{
			name: 'Final',
			weight: '15',
			points: '0',
			pointsPossible: '0',
			weightedPercentage: '0',
			calculatedMark: ''
		}
	]);
});

test('zero-weight definitions preserve existing totals and do not change point-based courses', () => {
	const classData = {
		isAssignmentWeightingOn: true,
		measureTypes: [{ id: 'practice', name: 'Practice', weight: 0 }],
		assignments: [{ gradeBookId: 'practice-1', measureTypeId: 'practice', score: 9 }],
		measureTypeGrades: [
			{ measureTypeId: 'practice', measureTypeWeight: 0, points: 9, pointsPossible: 10 }
		]
	};
	expect(gradeCategories(classData)).toMatchObject([
		{ name: 'Practice', weight: '0', points: '9', pointsPossible: '10' }
	]);
	expect(gradeCategories({ ...classData, isAssignmentWeightingOn: false })).toEqual([]);
});

test.each([0, '0%', '0.00', '100.0%', '85.5'])(
	'category summary accepts an explicit numeric weight %s',
	(weight) => {
		expect(
			gradeCategories({
				isAssignmentWeightingOn: true,
				measureTypes: [{ id: 'tests', name: 'Tests' }],
				assignments: [{ gradeBookId: 'test-1', measureTypeId: 'tests', score: 8 }],
				measureTypeGrades: [
					{ measureTypeId: 'tests', measureTypeWeight: weight, points: 8, pointsPossible: 10 }
				]
			})
		).toMatchObject([
			{
				name: 'Tests',
				weight: String(Number(String(weight).replace('%', ''))),
				points: '8',
				pointsPossible: '10'
			}
		]);
	}
);

test.each(['unknown 0', 'weight 100%', '', ' ', null, -1, Infinity])(
	'category summary cannot establish a weight from %s',
	(weight) => {
		expect(
			gradeCategories({
				isAssignmentWeightingOn: true,
				measureTypes: [{ id: 'tests', name: 'Tests', weight: 100 }],
				assignments: [{ gradeBookId: 'test-1', measureTypeId: 'tests', score: 8 }],
				measureTypeGrades: [
					{ measureTypeId: 'tests', measureTypeWeight: weight, points: 8, pointsPossible: 10 }
				]
			})
		).toEqual([]);
	}
);

test.each(['assignment-grid', 'course-content'])(
	'complete gradebook %s path preserves omitted zero weights and posted category totals',
	async (source) => {
		const focus = JSON.stringify({
			LoadParams: { ControlName: 'Gradebook_ClassDetails' },
			FocusArgs: { classID: 'course-1' }
		}).replaceAll('"', '&quot;');
		const page = `<title>StudentVUE</title>
		<script>PXP.GBCurrentFocus = {"FocusArgs":{"gradePeriodGU":"period-1","AGU":"synthetic-student"}};</script>
		<script>PXP.GBFocusData = {"GradingPeriods":[{"GU":"period-1","schoolID":"school","OrgYearGU":"year","defaultFocus":true,"Name":"Quarter 1","MarkPeriods":[{"GU":"mark-1","Name":"Quarter 1"}]}]};</script>
		<div class="gb-class-header"><span class="course-title" data-focus="${focus}">1: Synthetic course</span></div>
		<div class="gb-class-row" data-guid="course-1"><span class="mark">B</span></div>`;
		const grid = `<div id="current-grade"><span class="mark">B</span><span class="score">80%</span></div>
		<script>{"dataSource":[{"CategoryName":"Tests","Weight":"85%","Points":"8","PointsPossible":"10"}]}</script>
		<div id="AssignmentsGrid"></div><script>{"dataSource":[
		{"gradeBookId":"practice-1","Date":"9/20/26","GBAssignment":"Synthetic practice","GBAssignmentType":"Practice","GBScore":"9 out of 10","GBPoints":"9/10"},
		{"gradeBookId":"test-1","Date":"9/20/26","GBAssignment":"Synthetic test","GBAssignmentType":"Tests","GBScore":"8 out of 10","GBPoints":"8/10"}
		]}</script>`;
		vi.stubGlobal(
			'fetch',
			vi.fn<typeof fetch>().mockImplementation(async (input) => {
				const path = String(input);
				if (path.includes('PXP2_Gradebook.aspx')) return new Response(page);
				if (path.includes('GradebookFocusClassInfo'))
					return new Response(
						JSON.stringify({
							d: { Data: { Classes: [{ ID: 'course-1', Name: 'Synthetic course' }] } }
						})
					);
				if (path.includes('PXP2Communication.asmx/LoadControl'))
					return new Response(
						JSON.stringify({
							d: {
								Data: {
									html: source === 'assignment-grid' ? grid : '<div>Legacy class detail</div>'
								}
							}
						})
					);
				if (path.includes('genericdata.classdata-GetClassData'))
					return new Response(
						JSON.stringify({
							enabled: true,
							isAssignmentWeightingOn: true,
							students: [{ calculatedMark: 'B', percentage: '80' }],
							measureTypes: [
								{ id: 'practice', name: 'Practice', weight: 0 },
								{ id: 'tests', name: 'Tests', weight: 85 },
								{ id: 'final', name: 'Final', weight: 15 }
							],
							measureTypeGrades: [
								{ measureTypeId: 'tests', measureTypeWeight: 85, points: 8.5, pointsPossible: 10 }
							],
							assignments: [
								{ gradeBookId: 'practice-1', measureTypeId: 'practice', score: 9 },
								{ gradeBookId: 'test-1', measureTypeId: 'tests', score: 8 }
							]
						})
					);
				if (path.includes('pxp.course.content.items-LoadWithOptions'))
					return new Response(
						JSON.stringify({
							responseData: {
								data: [
									{
										itemID: 'practice-1',
										title: 'Synthetic practice',
										date: '9/20/2026',
										points: 9,
										pointsPossible: 10
									},
									{
										itemID: 'test-1',
										title: 'Synthetic test',
										date: '9/20/2026',
										points: 8,
										pointsPossible: 10
									}
								]
							}
						})
					);
				if (path.includes('pxp.course.grade.card-get'))
					return new Response(JSON.stringify({ classGrade: 'B', classPct: '80' }));
				throw new Error(`Unexpected portal request: ${path}`);
			})
		);
		const client = Pxp2Client.resume({
			baseUrl: 'https://ca-example-psv.edupoint.com/',
			cookies: { ASP_NET_SessionId: 'synthetic-session' }
		});
		const gradebook = await client.gradebook();
		expect(gradebook.courses[0]?.categories).toMatchObject([
			{
				name: 'Tests',
				weight: '85',
				points: source === 'assignment-grid' ? '8' : '8.5',
				pointsPossible: '10'
			},
			{ name: 'Practice', weight: '0', points: '0', pointsPossible: '0' },
			{ name: 'Final', weight: '15', points: '0', pointsPossible: '0' }
		]);
		expect(gradebook.courses[0]?.categories).toHaveLength(3);
		expect(gradebook.courses[0]?.assignments.map((assignment) => assignment.Type)).toEqual([
			'Practice',
			'Tests'
		]);
	}
);

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

test('subsequent gradebook reads use the compact class control context', async () => {
	const focus = JSON.stringify({
		LoadParams: { ControlName: 'Gradebook_ClassDetails' },
		FocusArgs: { classID: 'course-1' }
	}).replaceAll('"', '&quot;');
	const page = `<title>StudentVUE</title>
		<script>PXP.GBCurrentFocus = {"FocusArgs":{"gradePeriodGU":"period-1","AGU":"student"}};</script>
		<script>PXP.GBFocusData = {"GradingPeriods":[{"GU":"period-1","schoolID":"school","OrgYearGU":"year","defaultFocus":true,"Name":"Quarter 1","MarkPeriods":[{"GU":"mark-1","Name":"Quarter 1"}]}]};</script>
		<div class="gb-class-header"><span class="course-title" data-focus="${focus}">1: Biology</span></div>
		<div class="gb-class-row" data-guid="course-1"><span class="mark">A</span></div>`;
	let gradebookPageCalls = 0;
	const fetchMock = vi.fn<typeof fetch>().mockImplementation(async (input, init) => {
		const path = String(input);
		if (path.includes('PXP2_Gradebook.aspx')) {
			gradebookPageCalls += 1;
			if (gradebookPageCalls > 1) throw new Error('slow gradebook page should not be reloaded');
			return new Response(page);
		}
		if (path.includes('PXP2Communication.asmx/LoadControl')) {
			const body = JSON.parse(String(init?.body)) as { request?: { control?: string } };
			if (body.request?.control === 'Gradebook_SchoolClasses')
				return new Response(JSON.stringify({ d: { Data: { html: page } } }));
		}
		if (path.includes('GradebookFocusClassInfo'))
			return new Response(
				JSON.stringify({ d: { Data: { Classes: [{ ID: 'class-info-id', Name: 'Biology' }] } } })
			);
		throw new Error(`Unexpected portal request: ${path}`);
	});
	vi.stubGlobal('fetch', fetchMock);
	const firstClient = Pxp2Client.resume({
		baseUrl: 'https://ca-example-psv.edupoint.com/',
		cookies: { ASP_NET_SessionId: 'summary-session' }
	});

	await firstClient.gradebook(undefined, true);
	const secondClient = Pxp2Client.resume(firstClient.exportSessionState());
	const gradebook = await secondClient.gradebook(undefined, true);

	expect(gradebook.courses).toMatchObject([{ id: 'class-info-id', title: 'Biology', score: 'A' }]);
	expect(gradebook.detailed).toBe(false);
	expect(gradebookPageCalls).toBe(1);
	expect(
		fetchMock.mock.calls.filter(([input]) => String(input).includes('LoadControl'))
	).toHaveLength(1);
});

test('detailed gradebook cross-checks the class grid against StudentVUE bulk assignment IDs', async () => {
	const focus = JSON.stringify({
		LoadParams: { ControlName: 'Gradebook_ClassDetails' },
		FocusArgs: { classID: 'course-1' }
	}).replaceAll('"', '&quot;');
	const page = `<title>StudentVUE</title>
		<script>PXP.GBCurrentFocus = {"FocusArgs":{"gradePeriodGU":"period-1","AGU":"student"}};</script>
		<script>PXP.GBFocusData = {"GradingPeriods":[{"GU":"period-1","schoolID":"school","OrgYearGU":"year","defaultFocus":true,"Name":"Quarter 1","MarkPeriods":[{"GU":"mark-1","Name":"Quarter 1"}]}]};</script>
		<div class="gb-class-header"><span class="course-title" data-focus="${focus}">1: Biology</span></div>
		<div class="gb-class-row" data-guid="course-1"><span class="mark">A</span></div>`;
	const classDetail = `<div id="current-grade"><span class="mark">A</span><span class="score">96.5%</span></div>
		<script>{"dataSource":[{"CategoryName":"Homework","Weight":"100%","Points":"19.3","PointsPossible":"20"}]}</script>
		<div id="AssignmentsGrid"></div><script>{"dataSource":[{"gradeBookId":1,"Date":"9/20/26","GBAssignment":"Quiz","GBAssignmentType":"Homework","GBScore":"9.5 out of 10","GBPoints":"9.5/10"}]}</script>`;
	const recoveredDetail = `<table class="info_tbl"><tr>
		<td><span class="tbl_label">Assignment:</span><span class="tbl_value">Notebook</span></td>
		<td><span class="tbl_label">Assignment Type:</span><span class="tbl_value">Homework</span></td>
		<td><span class="tbl_label">Date:</span><span class="tbl_value">9/21/2026</span></td>
		<td><span class="tbl_label">Score:</span><span class="tbl_value">9.8</span></td>
		<td><span class="tbl_label">Points:</span><span class="tbl_value">9.8 / 10</span></td>
		</tr></table>`;
	const requestedControls: string[] = [];
	const fetchMock = vi.fn<typeof fetch>().mockImplementation(async (input, init) => {
		const path = String(input);
		if (path.includes('PXP2_Gradebook.aspx')) return new Response(page);
		if (path.includes('GradebookFocusClassInfo'))
			return new Response(
				JSON.stringify({ d: { Data: { Classes: [{ ID: 'course-1', Name: 'Biology' }] } } })
			);
		if (path.includes('PXP2Communication.asmx/LoadControl')) {
			const body = JSON.parse(String(init?.body)) as { request: { control: string } };
			requestedControls.push(body.request.control);
			return new Response(
				JSON.stringify({
					d: {
						Data: {
							html:
								body.request.control === 'Gradebook_ClassDetails' ? classDetail : recoveredDetail
						}
					}
				})
			);
		}
		if (path.includes('genericdata.classdata-GetClassData'))
			return new Response(
				JSON.stringify({
					assignments: [
						{ gradeBookId: 1, score: 9.5 },
						{ gradeBookId: 2, score: 9.8 }
					]
				})
			);
		throw new Error(`Unexpected portal request: ${path}`);
	});
	vi.stubGlobal('fetch', fetchMock);
	const client = Pxp2Client.resume({
		baseUrl: 'https://ca-example-psv.edupoint.com/',
		cookies: { ASP_NET_SessionId: 'test-session' }
	});

	const gradebook = await client.gradebook();

	expect(requestedControls).toEqual(['Gradebook_ClassDetails', 'Gradebook_AssignmentDetails']);
	expect(gradebook.courses[0]?.scoreRaw).toBe('96.5');
	expect(gradebook.courses[0]?.assignments).toMatchObject([
		{ AssignmentID: '2', Measure: 'Notebook', Points: '9.8 / 10' },
		{ AssignmentID: '1', Measure: 'Quiz', Points: '9.5/10' }
	]);
});

test.each(['assignment-grid', 'course-content'])(
	'complete gradebook %s path preserves a scaled score through the bulk cross-check',
	async (source) => {
		const focus = JSON.stringify({
			LoadParams: { ControlName: 'Gradebook_ClassDetails' },
			FocusArgs: { classID: 'course-1' }
		}).replaceAll('"', '&quot;');
		const page = `<title>StudentVUE</title>
		<script>PXP.GBCurrentFocus = {"FocusArgs":{"gradePeriodGU":"period-1","AGU":"synthetic-student"}};</script>
		<script>PXP.GBFocusData = {"GradingPeriods":[{"GU":"period-1","schoolID":"school","OrgYearGU":"year","defaultFocus":true,"Name":"Quarter 1","MarkPeriods":[{"GU":"mark-1","Name":"Quarter 1"}]}]};</script>
		<div class="gb-class-header"><span class="course-title" data-focus="${focus}">1: Chemistry</span></div>
		<div class="gb-class-row" data-guid="course-1"><span class="mark">B</span></div>`;
		const grid = `<div id="current-grade"><span class="mark">B</span><span class="score">80%</span></div>
		<div id="AssignmentsGrid"></div><script>{"dataSource":[{"gradeBookId":"scaled-quiz","Date":"9/20/26","GBAssignment":"Synthetic quiz","GBAssignmentType":"Homework","GBScore":"8 out of 10","GBScoreType":"Raw Score","GBPoints":"8/1"}]}</script>`;
		const fetchMock = vi.fn<typeof fetch>().mockImplementation(async (input) => {
			const path = String(input);
			if (path.includes('PXP2_Gradebook.aspx')) return new Response(page);
			if (path.includes('GradebookFocusClassInfo'))
				return new Response(
					JSON.stringify({ d: { Data: { Classes: [{ ID: 'course-1', Name: 'Chemistry' }] } } })
				);
			if (path.includes('PXP2Communication.asmx/LoadControl'))
				return new Response(
					JSON.stringify({
						d: {
							Data: { html: source === 'assignment-grid' ? grid : '<div>Legacy class detail</div>' }
						}
					})
				);
			if (path.includes('genericdata.classdata-GetClassData'))
				return new Response(
					JSON.stringify({
						enabled: true,
						isAssignmentWeightingOn: false,
						students: [{ calculatedMark: 'B', percentage: '80' }],
						assignments: [
							{
								gradeBookId: 'scaled-quiz',
								score: '8',
								maxScore: '10',
								pointsPossible: 1,
								penaltyPct: 0,
								weight: 1
							}
						]
					})
				);
			if (path.includes('pxp.course.content.items-LoadWithOptions'))
				return new Response(
					JSON.stringify({
						responseData: {
							data: [
								{
									itemID: 'scaled-quiz',
									title: 'Synthetic quiz',
									assignmentType: 'Homework',
									date: '9/20/2026',
									gradeMark: '8',
									points: '0.8000000000',
									pointsPossible: '1.00',
									calcValue: '80.00%'
								}
							]
						}
					})
				);
			if (path.includes('pxp.course.grade.card-get'))
				return new Response(JSON.stringify({ classGrade: 'B', classPct: '80' }));
			throw new Error(`Unexpected portal request: ${path}`);
		});
		vi.stubGlobal('fetch', fetchMock);
		const client = Pxp2Client.resume({
			baseUrl: 'https://ca-example-psv.edupoint.com/',
			cookies: { ASP_NET_SessionId: 'synthetic-session' }
		});

		const gradebook = await client.gradebook();
		const assignment = gradebook.courses[0]?.assignments[0];

		expect(gradebook.courses[0]?.scoreRaw).toBe('80');
		expect(assignment).toMatchObject({ AssignmentID: 'scaled-quiz', AssignmentPercentage: '80' });
		if (source === 'assignment-grid') {
			expect(assignment).toMatchObject({
				ScoreTypeConfirmed: 'true',
				ScoreCalValue: '8',
				ScoreMaxValue: '10'
			});
		} else {
			expect(assignment?.ScoreTypeConfirmed).toBeUndefined();
			expect(assignment?.AssignmentPercentagePrecision).toBe('2');
			expect(assignment?.ScoreCalValue).toBeUndefined();
			expect(assignment?.ScoreMaxValue).toBeUndefined();
		}
		expect(Number(assignment?.Point)).toBe(0.8);
		expect(Number(assignment?.PointPossible)).toBe(1);
		expect(
			fetchMock.mock.calls.filter(([input]) => String(input).includes('GetClassData'))
		).toHaveLength(1);
	}
);

test.each(['assignment-grid', 'course-content'])(
	'complete gradebook %s path signals contradictory non-unit weighting instead of guessing point values',
	async (source) => {
		const focus = JSON.stringify({
			LoadParams: { ControlName: 'Gradebook_ClassDetails' },
			FocusArgs: { classID: 'course-1' }
		}).replaceAll('"', '&quot;');
		const page = `<title>StudentVUE</title>
		<script>PXP.GBCurrentFocus = {"FocusArgs":{"gradePeriodGU":"period-1","AGU":"synthetic-student"}};</script>
		<script>PXP.GBFocusData = {"GradingPeriods":[{"GU":"period-1","schoolID":"school","OrgYearGU":"year","defaultFocus":true,"Name":"Quarter 1","MarkPeriods":[{"GU":"mark-1","Name":"Quarter 1"}]}]};</script>
		<div class="gb-class-header"><span class="course-title" data-focus="${focus}">1: Chemistry</span></div>
		<div class="gb-class-row" data-guid="course-1"><span class="mark">B</span></div>`;
		const grid = `<div id="current-grade"><span class="mark">B</span><span class="score">80%</span></div>
		<div id="AssignmentsGrid"></div><script>{"dataSource":[{"gradeBookId":"unknown-weight","Date":"9/20/26","GBAssignment":"Synthetic weight contradiction","GBAssignmentType":"Homework","GBScore":"8 out of 10","GBScoreType":"Raw Score","GBPoints":"8/1"}]}</script>`;
		vi.stubGlobal(
			'fetch',
			vi.fn<typeof fetch>().mockImplementation(async (input) => {
				const path = String(input);
				if (path.includes('PXP2_Gradebook.aspx')) return new Response(page);
				if (path.includes('GradebookFocusClassInfo'))
					return new Response(
						JSON.stringify({ d: { Data: { Classes: [{ ID: 'course-1', Name: 'Chemistry' }] } } })
					);
				if (path.includes('PXP2Communication.asmx/LoadControl'))
					return new Response(
						JSON.stringify({
							d: {
								Data: {
									html: source === 'assignment-grid' ? grid : '<div>Legacy class detail</div>'
								}
							}
						})
					);
				if (path.includes('genericdata.classdata-GetClassData'))
					return new Response(
						JSON.stringify({
							enabled: true,
							isAssignmentWeightingOn: false,
							students: [{ calculatedMark: 'B', percentage: '80' }],
							assignments: [
								{
									gradeBookId: 'unknown-weight',
									score: '8',
									maxScore: '10',
									pointsPossible: 1,
									penaltyPct: 0,
									weight: 2
								}
							]
						})
					);
				if (path.includes('pxp.course.content.items-LoadWithOptions'))
					return new Response(
						JSON.stringify({
							responseData: {
								data: [
									{
										itemID: 'unknown-weight',
										title: 'Synthetic weight contradiction',
										assignmentType: 'Homework',
										date: '9/20/2026',
										gradeMark: '8',
										points: '8/1',
										pointsPossible: '1',
										calcValue: '80.00%'
									}
								]
							}
						})
					);
				if (path.includes('pxp.course.grade.card-get'))
					return new Response(JSON.stringify({ classGrade: 'B', classPct: '80' }));
				throw new Error(`Unexpected portal request: ${path}`);
			})
		);
		const client = Pxp2Client.resume({
			baseUrl: 'https://ca-example-psv.edupoint.com/',
			cookies: { ASP_NET_SessionId: 'synthetic-session' }
		});

		const gradebook = await client.gradebook();
		const assignment = gradebook.courses[0]?.assignments[0];

		expect(assignment).toMatchObject({
			AssignmentID: 'unknown-weight',
			Point: '8',
			PointPossible: '1',
			Points: '8/1',
			CalculationUnavailable: 'true'
		});
		if (source === 'course-content')
			expect(assignment).toMatchObject({
				AssignmentPercentage: '80',
				AssignmentPercentagePrecision: '2'
			});
		else expect(assignment?.AssignmentPercentage).toBeUndefined();
	}
);

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

test('bulk row evidence repairs a stale maximum without relying on category totals', () => {
	const detail = parseGradebookClassDetail(`
		<div id="current-grade"><span class="mark">B</span><span class="score">80%</span></div>
		<div id="AssignmentsGrid"></div>
		<script>{"dataSource":[{
			"gradeBookId":"example-1", "Date":"9/20/26", "GBAssignment":"Synthetic quiz",
			"GBAssignmentType":"Homework", "GBScore":"8 out of 10", "GBScoreType":"Raw Score",
			"GBPoints":"8/1"
		}]}</script>`);
	// Raw display values alone cannot resolve a weighted score or a penalty.
	expect(detail.assignments[0]?.Points).toBe('8/1');
	const assignments = reconcileAssignmentPoints(detail.assignments, [], detail.percentage, {
		assignments: [
			{
				gradeBookId: 'example-1',
				score: '8',
				maxScore: '10',
				pointsPossible: 10,
				penaltyPct: 0,
				weight: 1
			}
		]
	});
	const xml = gradebookXml([
		{
			id: 'course-1',
			period: '1',
			title: 'History',
			room: '',
			teacher: '',
			teacherEmail: '',
			score: detail.letter,
			scoreRaw: detail.percentage,
			missing: '0',
			categories: detail.categories,
			assignments
		}
	]);
	const course = parseGradebookXML(xml).Courses.Course[0]!;
	const assignment = parseSynergyAssignment(course.Marks!.Mark[0]!.Assignments!.Assignment[0]!);

	expect(assignment).toMatchObject({ pointsEarned: 8, pointsPossible: 10 });
	expect(assignments[0]?.AssignmentPercentage).toBe('80');
	expect(course.Marks!.Mark[0]!._CalculatedScoreRaw).toBe('80');
});

test('bulk class data identifies graded rows absent from a rendered assignment grid', () => {
	expect(
		missingGradedAssignmentIds(
			{
				assignments: [
					{ gradeBookId: 1, score: 9.5 },
					{ gradeBookId: 2, score: 0 },
					{ gradeBookId: 2, score: 0 },
					{ gradeBookId: 3, score: null }
				]
			},
			[{ AssignmentID: '1' }]
		)
	).toEqual(['2']);
});

test('course-content fallback uses weighted numeric points instead of the raw grade mark', () => {
	const assignment = courseAssignment(
		{
			itemID: 'example-2',
			title: 'Synthetic quiz',
			date: '9/20/2026',
			gradeMark: '8',
			pointsPossible: '1.00',
			points: '0.8000000000',
			calcValue: '80.00%'
		},
		new Map()
	);
	expect(assignment).toMatchObject({
		Score: '8',
		Points: '0.8000000000 / 1.00',
		Point: '0.8000000000',
		PointPossible: '1.00',
		AssignmentPercentage: '80'
	});
	expect(assignment.ScoreCalValue).toBeUndefined();
	expect(assignment.ScoreMaxValue).toBeUndefined();
	const [reconciled] = reconcileAssignmentPoints([assignment], [], '80', {
		assignments: [
			{
				gradeBookId: 'example-2',
				score: '8',
				maxScore: '10',
				pointsPossible: 1,
				penaltyPct: 0,
				weight: 1
			}
		]
	});
	expect(reconciled).toMatchObject({ Points: '0.8000000000 / 1.00', AssignmentPercentage: '80' });
	expect(reconciled?.ScoreCalValue).toBeUndefined();
	expect(reconciled?.ScoreMaxValue).toBeUndefined();
});

test.each([undefined, '75.00%'])(
	'unconfirmed course-feed score type with calcValue %s preserves the portal point scale',
	(calcValue) => {
		const row = courseAssignment(
			{
				itemID: 'unconfirmed-scale',
				title: 'Synthetic point scale',
				date: '9/20/2026',
				gradeMark: '2',
				points: '0.7500000000',
				pointsPossible: '1.00',
				calcValue
			},
			new Map()
		);
		const [reconciled] = reconcileAssignmentPoints([row], [], '50', {
			assignments: [
				{
					gradeBookId: 'unconfirmed-scale',
					score: '2',
					maxScore: '4',
					pointsPossible: 1,
					penaltyPct: 0,
					weight: 1
				}
			]
		});

		expect(row.ScoreType).toBe('Raw Score');
		expect(row.ScoreTypeConfirmed).toBeUndefined();
		expect(reconciled).toMatchObject({
			Point: '0.7500000000',
			PointPossible: '1.00',
			Points: '0.7500000000 / 1.00'
		});
		expect(reconciled?.ScoreCalValue).toBeUndefined();
		expect(reconciled?.ScoreMaxValue).toBeUndefined();
		expect(reconciled?.AssignmentPercentage).toBe(calcValue ? '75' : undefined);
	}
);

test('an unlabeled assignment grid never confirms a numeric raw score by default', () => {
	const detail = parseGradebookClassDetail(`<div id="AssignmentsGrid"></div>
		<script>{"dataSource":[{"gradeBookId":"unlabeled","Date":"9/20/26","GBAssignment":"Synthetic scale","GBScore":"2 out of 4","GBPoints":"0.75/1"}]}</script>`);
	const [reconciled] = reconcileAssignmentPoints(detail.assignments, [], '50', {
		assignments: [
			{
				gradeBookId: 'unlabeled',
				score: '2',
				maxScore: '4',
				pointsPossible: 1,
				penaltyPct: 0,
				weight: 1
			}
		]
	});

	expect(reconciled?.Points).toBe('0.75/1');
	expect(reconciled?.ScoreTypeConfirmed).toBeUndefined();
	expect(reconciled?.ScoreCalValue).toBeUndefined();
	expect(reconciled?.ScoreMaxValue).toBeUndefined();
	expect(reconciled?.AssignmentPercentage).toBeUndefined();
});

test.each([
	[94, '94', '0'],
	[0.8, '0.8', '1'],
	[1e-7, '1e-7', '7'],
	['.5%', '0.5', '1'],
	['94.00', '94', '2'],
	['94.44%', '94.44', '2'],
	['94,44 %', '94.44', '2']
])(
	'explicit calcValue %s retains its percentage units and published precision',
	(calcValue, expected, precision) => {
		const row = courseAssignment(
			{
				itemID: 'percent-format',
				title: 'Synthetic percentage',
				gradeMark: '8.5',
				points: '8.5 / 9',
				pointsPossible: '9',
				calcValue
			},
			new Map()
		);

		expect(row.AssignmentPercentage).toBe(expected);
		expect(row.AssignmentPercentagePrecision).toBe(precision);
	}
);

test.each(['1,234%', '94,444%', '1,234.50%', '--', ''])(
	'ambiguous calcValue %s never becomes an invented numeric percentage',
	(calcValue) => {
		const row = courseAssignment(
			{
				itemID: 'ambiguous-percent',
				title: 'Synthetic percentage',
				points: '8.5 / 9',
				pointsPossible: '9',
				calcValue
			},
			new Map()
		);

		expect(row.AssignmentPercentage).toBeUndefined();
		expect(row.AssignmentPercentagePrecision).toBeUndefined();
	}
);

test('a rounded whole percentage cannot rewrite more precise published earned points', () => {
	const row = courseAssignment(
		{
			itemID: 'rounded-percent',
			title: 'Synthetic rounded percent',
			gradeMark: '8.5',
			points: '8.5000 / 9.0000',
			pointsPossible: '9.0000',
			calcValue: '94%'
		},
		new Map()
	);
	const [reconciled] = reconcileAssignmentPoints([row], [], '94');

	expect(reconciled).toMatchObject({
		Point: '8.5000',
		PointPossible: '9.0000',
		Points: '8.5000 / 9.0000',
		AssignmentPercentage: '94',
		AssignmentPercentagePrecision: '0'
	});
	expect(reconciled?.CalculationUnavailable).toBeUndefined();
});

test.each([
	['7.6600', '76%', '0'],
	['7.6590', '76.5%', '1'],
	['12.7690', '127.6%', '1'],
	['-7.6590', '-76.5%', '1']
])(
	'a truncated percentage %s/%s preserves a valid non-unit weighted pair',
	(earned, display, precision) => {
		const row = courseAssignment(
			{
				itemID: 'truncated-percent',
				title: 'Synthetic truncated percent',
				gradeMark: earned,
				points: earned,
				pointsPossible: '10.0000',
				calcValue: display
			},
			new Map()
		);
		const [reconciled] = reconcileAssignmentPoints([row], [], '80', {
			assignments: [
				{
					gradeBookId: 'truncated-percent',
					score: earned,
					maxScore: '10',
					pointsPossible: 10,
					weight: 2,
					penaltyPct: 0
				}
			]
		});
		expect(reconciled).toMatchObject({
			Point: earned,
			PointPossible: '10.0000',
			AssignmentPercentagePrecision: precision
		});
		expect(reconciled?.CalculationUnavailable).toBeUndefined();
	}
);

test.each(['76.3%', '76.8%'])(
	'a discrepancy beyond rounding or truncation of %s still blocks an unknown scale',
	(display) => {
		const row = courseAssignment(
			{ itemID: 'mismatch', points: '7.6590', pointsPossible: '10.0000', calcValue: display },
			new Map()
		);
		const [reconciled] = reconcileAssignmentPoints([row], [], '80', {
			assignments: [{ gradeBookId: 'mismatch', weight: 2 }]
		});
		expect(reconciled?.Point).toBe('7.6590');
		expect(reconciled?.CalculationUnavailable).toBe('true');
	}
);

test('a corroborated separate maximum restores denominator precision without rewriting earned points', () => {
	const row = courseAssignment(
		{
			itemID: 'rounded-max',
			title: 'Synthetic rounded denominator',
			gradeMark: '8',
			points: '1.00 / 1',
			pointsPossible: '1.25',
			calcValue: '80.00%'
		},
		new Map()
	);
	const [reconciled] = reconcileAssignmentPoints([row], [], '80');

	expect(reconciled).toMatchObject({
		Point: '1.00',
		PointPossible: '1.25',
		Points: '1.00 / 1.25',
		AssignmentPercentage: '80',
		AssignmentPercentagePrecision: '2'
	});
	expect(reconciled?.CalculationUnavailable).toBeUndefined();
});

test('a separate maximum that does not corroborate the percentage cannot replace the fraction maximum', () => {
	const row = courseAssignment(
		{
			itemID: 'uncorroborated-max',
			title: 'Synthetic conflicting denominator',
			gradeMark: '8',
			points: '0.8000 / 1',
			pointsPossible: '1.25',
			calcValue: '80.00%'
		},
		new Map()
	);

	expect(row).toMatchObject({ Point: '0.8000', PointPossible: '1', Points: '0.8000 / 1' });
});

test.each([undefined, 2])(
	'contradictory percentage with unknown/non-unit weight %s retains evidence and marks math unavailable',
	(weight) => {
		const row = courseAssignment(
			{
				itemID: 'unknown-weight',
				title: 'Synthetic contradictory weight',
				gradeMark: '8',
				points: '8 / 1',
				pointsPossible: '1',
				calcValue: '80.00%'
			},
			new Map()
		);
		const [reconciled] = reconcileAssignmentPoints([row], [], '80', {
			assignments: [
				{
					gradeBookId: 'unknown-weight',
					score: '8',
					maxScore: '10',
					pointsPossible: 1,
					penaltyPct: 0,
					weight
				}
			]
		});

		expect(reconciled).toMatchObject({
			Point: '8',
			PointPossible: '1',
			Points: '8 / 1',
			AssignmentPercentage: '80',
			CalculationUnavailable: 'true'
		});
	}
);

test.each([undefined, 2])(
	'a confirmed unpenalized raw ratio detects contradictory points with unresolved weight %s without inventing a percentage',
	(weight) => {
		const row = {
			AssignmentID: 'primary-unknown-weight',
			Score: '8 out of 10',
			ScoreType: 'Raw Score',
			ScoreTypeConfirmed: 'true',
			Points: '8 / 1',
			Point: '8',
			PointPossible: '1'
		};
		const [reconciled] = reconcileAssignmentPoints([row], [], '80', {
			assignments: [
				{
					gradeBookId: 'primary-unknown-weight',
					score: '8',
					maxScore: '10',
					pointsPossible: 1,
					penaltyPct: 0,
					weight
				}
			]
		});

		expect(reconciled).toMatchObject({
			Point: '8',
			PointPossible: '1',
			Points: '8 / 1',
			CalculationUnavailable: 'true'
		});
		expect(reconciled?.AssignmentPercentage).toBeUndefined();
	}
);

test('a percentage can keep a known independent maximum without manufacturing missing earned display points', () => {
	const row = courseAssignment(
		{
			itemID: 'missing-earned',
			title: 'Synthetic unavailable score display',
			points: '',
			pointsPossible: '1.2500',
			calcValue: '80.00%'
		},
		new Map()
	);
	const [reconciled] = reconcileAssignmentPoints([row], [], '80');

	expect(reconciled).toMatchObject({
		PointPossible: '1.2500',
		AssignmentPercentage: '80',
		AssignmentPercentagePrecision: '2'
	});
	expect(reconciled?.Point).toBeUndefined();
	expect(reconciled?.CalculationUnavailable).toBeUndefined();
});

test('a percentage without any positive weighted maximum remains visible while math is unavailable', () => {
	const row = courseAssignment(
		{
			itemID: 'missing-max',
			title: 'Synthetic unavailable maximum',
			points: '',
			calcValue: '80.00%'
		},
		new Map()
	);
	const [reconciled] = reconcileAssignmentPoints([row], [], '80');

	expect(reconciled).toMatchObject({ AssignmentPercentage: '80', CalculationUnavailable: 'true' });
	expect(reconciled?.Point).toBeUndefined();
	expect(reconciled?.PointPossible).toBeUndefined();
});

test('an explicit assignment percentage corrects the weighted numerator without changing its weight', () => {
	const row = courseAssignment(
		{
			itemID: 'explicit-percent',
			title: 'Synthetic scaled quiz',
			date: '9/20/2026',
			gradeMark: '8',
			points: '8 / 1',
			pointsPossible: '1',
			calcValue: '80%'
		},
		new Map()
	);
	const [reconciled] = reconcileAssignmentPoints([row], [], '20');

	expect(reconciled).toMatchObject({
		Point: '0.8',
		PointPossible: '1',
		Points: '0.8 / 1',
		AssignmentPercentage: '80'
	});
	expect(reconciled?.ScoreCalValue).toBeUndefined();
});

test('confirmed bulk raw scores normalize weighted points and retain the unscaled display pair', () => {
	const [reconciled] = reconcileAssignmentPoints(
		[
			{
				AssignmentID: 'scaled',
				Score: '8',
				ScoreType: 'Raw Score',
				ScoreTypeConfirmed: 'true',
				Points: '8 / 1',
				Point: '8',
				PointPossible: '1'
			}
		],
		[],
		'20',
		{
			assignments: [
				{
					gradeBookId: 'scaled',
					score: '8',
					maxScore: '10',
					pointsPossible: 1,
					penaltyPct: 0,
					weight: 1
				}
			]
		}
	);

	expect(reconciled).toMatchObject({
		Point: '0.8',
		PointPossible: '1',
		Points: '0.8 / 1',
		ScoreCalValue: '8',
		ScoreMaxValue: '10',
		AssignmentPercentage: '80'
	});
});

test.each([undefined, 25])(
	'unknown or nonzero penalty %s never turns raw scores into weighted percentages',
	(penaltyPct) => {
		const [reconciled] = reconcileAssignmentPoints(
			[
				{
					AssignmentID: 'penalized',
					Score: '8',
					ScoreType: 'Raw Score',
					ScoreTypeConfirmed: 'true',
					Points: '0.6 / 1',
					Point: '0.6',
					PointPossible: '1'
				}
			],
			[],
			'80',
			{
				assignments: [
					{
						gradeBookId: 'penalized',
						score: '8',
						maxScore: '10',
						pointsPossible: 1,
						penaltyPct,
						weight: 1
					}
				]
			}
		);

		expect(reconciled?.Points).toBe('0.6 / 1');
		expect(reconciled?.AssignmentPercentage).toBeUndefined();
		expect(reconciled).toMatchObject({ ScoreCalValue: '8', ScoreMaxValue: '10' });
	}
);

test('explicit percentages take priority over a penalized raw score without applying a guessed penalty formula', () => {
	const row = courseAssignment(
		{
			itemID: 'penalized',
			title: 'Synthetic penalized quiz',
			date: '9/20/2026',
			gradeMark: '8',
			points: '8 / 1',
			pointsPossible: '1',
			calcValue: '60%'
		},
		new Map()
	);
	const [reconciled] = reconcileAssignmentPoints([row], [], '80', {
		assignments: [
			{
				gradeBookId: 'penalized',
				score: '8',
				maxScore: '10',
				pointsPossible: 1,
				penaltyPct: 25,
				weight: 1
			}
		]
	});

	expect(reconciled).toMatchObject({ Points: '0.6 / 1', AssignmentPercentage: '60' });
	expect(reconciled?.ScoreCalValue).toBeUndefined();
	expect(reconciled?.ScoreMaxValue).toBeUndefined();
});

test.each([undefined, 2])(
	'missing or non-unit weight %s cannot replace the published weighted maximum',
	(weight) => {
		const row = {
			AssignmentID: 'weighted',
			Score: '8',
			ScoreType: 'Raw Score',
			ScoreTypeConfirmed: 'true',
			Points: '1.6 / 2',
			Point: '1.6',
			PointPossible: '2'
		};
		const [reconciled] = reconcileAssignmentPoints([row], [], '80', {
			assignments: [
				{
					gradeBookId: 'weighted',
					score: '8',
					maxScore: '10',
					pointsPossible: 1,
					penaltyPct: 0,
					weight
				}
			]
		});

		expect(reconciled).toMatchObject({
			Points: '1.6 / 2',
			Point: '1.6',
			PointPossible: '2',
			ScoreCalValue: '8',
			ScoreMaxValue: '10'
		});
		expect(reconciled?.AssignmentPercentage).toBeUndefined();
		expect(reconciled?.CalculationUnavailable).toBeUndefined();
	}
);

test.each(['7.89', '8'])(
	'rounded weighted points %s stay published when their precision covers the raw-percentage difference',
	(earned) => {
		const row = {
			AssignmentID: 'rounded',
			Score: '15',
			ScoreType: 'Raw Score',
			ScoreTypeConfirmed: 'true',
			Points: `${earned} / 10`,
			Point: earned,
			PointPossible: '10'
		};
		const [reconciled] = reconcileAssignmentPoints([row], [], '80', {
			assignments: [
				{
					gradeBookId: 'rounded',
					score: '15',
					maxScore: '19',
					pointsPossible: 10,
					penaltyPct: 0,
					weight: 1
				}
			]
		});

		expect(reconciled).toMatchObject({
			Points: `${earned} / 10`,
			Point: earned,
			PointPossible: '10'
		});
		expect(Number(reconciled?.AssignmentPercentage)).toBeCloseTo((15 / 19) * 100);
	}
);

test('decimal precision distinguishes a contradictory score from a valid integer-rounded value', () => {
	const [reconciled] = reconcileAssignmentPoints(
		[
			{
				AssignmentID: 'precise',
				Score: '15',
				ScoreType: 'Raw Score',
				ScoreTypeConfirmed: 'true',
				Points: '8.0 / 10.00',
				Point: '8.0',
				PointPossible: '10.00'
			}
		],
		[],
		'80',
		{
			assignments: [
				{
					gradeBookId: 'precise',
					score: '15',
					maxScore: '19',
					pointsPossible: 10,
					penaltyPct: 0,
					weight: 1
				}
			]
		}
	);

	expect(Number(reconciled?.Point)).toBeCloseTo((15 / 19) * 10);
	expect(reconciled?.PointPossible).toBe('10.00');
});

test.each(['2 / ', '2 / 0'])(
	'extra credit fraction %s never becomes ordinary graded points',
	(points) => {
		const [reconciled] = reconcileAssignmentPoints(
			[
				{
					AssignmentID: 'bonus',
					Score: '2',
					ScoreType: 'Raw Score',
					ScoreTypeConfirmed: 'true',
					Points: points
				}
			],
			[],
			'80',
			{
				assignments: [
					{
						gradeBookId: 'bonus',
						score: '2',
						maxScore: '10',
						pointsPossible: 10,
						penaltyPct: 0,
						weight: 1
					}
				]
			}
		);

		expect(reconciled?.Points).toBe(points);
		expect(reconciled?.AssignmentPercentage).toBeUndefined();
	}
);

test('non-raw score types preserve the provided point scale without deriving a percentage', () => {
	const row = {
		AssignmentID: 'point-scale',
		Score: '2',
		ScoreType: 'Point Scale',
		Points: '2 / 4',
		Point: '2',
		PointPossible: '4'
	};
	const [reconciled] = reconcileAssignmentPoints([row], [], '80', {
		assignments: [
			{
				gradeBookId: 'point-scale',
				score: '2',
				maxScore: '4',
				pointsPossible: 1,
				penaltyPct: 0,
				weight: 1
			}
		]
	});

	expect(reconciled).toEqual(row);
});

test('course feed keeps zero earned points, extra credit, and pending work distinct', () => {
	const zero = courseAssignment(
		{
			itemID: 'zero',
			title: 'Zero score',
			gradeMark: 0,
			points: 0,
			pointsPossible: 10,
			calcValue: '0%'
		},
		new Map()
	);
	const extra = courseAssignment(
		{ itemID: 'extra', title: 'Extra credit', gradeMark: '2', points: '2', pointsPossible: '' },
		new Map()
	);
	const pending = courseAssignment(
		{
			itemID: 'pending',
			title: 'Pending work',
			gradeMark: 'Not Graded',
			points: '',
			pointsPossible: '10',
			calcValue: '--'
		},
		new Map()
	);

	expect(zero).toMatchObject({
		Score: '0',
		Point: '0',
		PointPossible: '10',
		AssignmentPercentage: '0'
	});
	expect(extra).toMatchObject({ Point: '2', PointPossible: '', Points: '2 / ' });
	expect(
		reconcileAssignmentPoints([extra], [], '80', {
			assignments: [
				{
					gradeBookId: 'extra',
					score: '2',
					maxScore: '10',
					pointsPossible: '',
					penaltyPct: 0,
					weight: 1
				}
			]
		})[0]?.Points
	).toBe('2 / ');
	expect(pending.Point).toBeUndefined();
	expect(pending.AssignmentPercentage).toBeUndefined();
	expect(pending.Points).toBe('10 Points Possible');
});

test('a high assignment percentage remains when the official category supports it', () => {
	const [assignment] = reconcileAssignmentPoints(
		[
			{
				Type: 'Homework',
				Points: '15 / 10',
				Point: '15',
				PointPossible: '10',
				ScoreCalValue: '15',
				ScoreMaxValue: '20'
			}
		],
		[
			{
				name: 'Homework',
				weight: '100',
				points: '15',
				pointsPossible: '10',
				weightedPercentage: '150',
				calculatedMark: 'A'
			}
		],
		'150'
	);
	expect(assignment?.Points).toBe('15 / 10');
});

test('a category gap cannot rewrite a legitimate bonus score alongside dropped work', () => {
	const rows = [
		{ Type: 'Homework', Points: '12 / 10', Point: '12', PointPossible: '10', Notes: '' },
		{ Type: 'Homework', Points: '4 / 10', Point: '4', PointPossible: '10', Notes: '' }
	];
	const reconciled = reconcileAssignmentPoints(
		rows,
		[
			{
				name: 'Homework',
				weight: '100',
				points: '12',
				pointsPossible: '10',
				weightedPercentage: '120',
				calculatedMark: 'A'
			}
		],
		'120'
	);

	expect(reconciled).toEqual(rows);
});

test('an ambiguous category gap never rewrites a specific row', () => {
	const rows = [
		{
			Type: 'Homework',
			Points: '12 / 10',
			Point: '12',
			PointPossible: '10',
			Notes: ''
		},
		{
			Type: 'Homework',
			Points: '11 / 10',
			Point: '11',
			PointPossible: '10',
			Notes: ''
		}
	];
	const reconciled = reconcileAssignmentPoints(
		rows,
		[
			{
				name: 'Homework',
				weight: '100',
				points: '20',
				pointsPossible: '20',
				weightedPercentage: '100',
				calculatedMark: 'A'
			}
		],
		'100'
	);

	expect(reconciled[0]?.Points).toBe('12 / 10');
	expect(reconciled[1]?.Points).toBe('11 / 10');
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
		ScoreTypeConfirmed: 'true',
		Points: '11.25 / 12.0000',
		Notes: 'Retake available',
		Description: ''
	});
});
