import { Pxp2Client } from '$lib/server/pxp2';
import { afterEach, expect, test, vi } from 'vitest';

afterEach(() => vi.unstubAllGlobals());

// Synthetic portal responses deliberately use different endpoint and rendered IDs.
function portal(classes: Array<{ ID: string; Name: string }>, alternateRowIds = false) {
	const courses = [
		{ id: 'english', name: 'English', letter: 'B', percentage: '84' },
		{ id: 'ethnic', name: 'Ethnic Studies', letter: 'A-', percentage: '91' },
		{ id: 'math', name: 'Math', letter: 'A+', percentage: '100' }
	];
	const rows = courses.map((course, index) => {
		const focus = JSON.stringify({
			LoadParams: { ControlName: 'Gradebook_ClassDetails' },
			FocusArgs: { classID: course.id }
		}).replaceAll('"', '&quot;');
		return `<div class="gb-class-header"><span class="course-title" data-focus="${focus}">${index + 1}: ${course.name}</span></div><div class="gb-class-row" data-guid="${alternateRowIds ? `row-${course.id}` : course.id}"><span class="mark">${course.letter}</span></div>`;
	});
	const html = `<title>StudentVUE</title>
	<script>PXP.GBCurrentFocus = {"FocusArgs":{"gradePeriodGU":"period-1","AGU":"synthetic-student"}};</script>
	<script>PXP.GBFocusData = {"GradingPeriods":[{"GU":"period-1","schoolID":"school","OrgYearGU":"year","defaultFocus":true,"Name":"Quarter 1","MarkPeriods":[{"GU":"mark-1"}]}]};</script>${rows.join('')}`;
	const focused: string[] = [];
	vi.stubGlobal(
		'fetch',
		vi.fn<typeof fetch>().mockImplementation(async (input, init) => {
			const path = String(input);
			if (path.includes('PXP2_Gradebook.aspx')) return new Response(html);
			if (path.includes('GradebookFocusClassInfo'))
				return Response.json({ d: { Data: { Classes: classes } } });
			if (path.includes('PXP2Communication.asmx/LoadControl')) {
				const body = JSON.parse(String(init?.body));
				if (body.request.control === 'Gradebook_SchoolClasses')
					return Response.json({ d: { Data: { html } } });
				const course = courses.find(({ id }) => id === body.request.parameters.classID)!;
				focused.push(course.id);
				return Response.json({
					d: {
						Data: {
							html: `<div id="current-grade"><span class="mark">${course.letter}</span><span class="score">${course.percentage}%</span></div><div id="AssignmentsGrid"></div><script>{"dataSource":[{"gradeBookId":"${course.id}-work","Date":"9/20/26","GBAssignment":"${course.name} work","GBAssignmentType":"Work","GBScore":"${course.percentage} out of 100","GBPoints":"${course.percentage}/100"}]}</script>`
						}
					}
				});
			}
			if (path.includes('GetClassData')) return Response.json({});
			throw new Error('Unexpected synthetic portal request.');
		})
	);
	return {
		focused,
		client: Pxp2Client.resume({
			baseUrl: 'https://ca-example-psv.edupoint.com/',
			cookies: { ASP_NET_SessionId: 'synthetic-identity-session' }
		})
	};
}

test.each([false, true])(
	'restored compact context matches reordered classes to their own marks and assignments across endpoint IDs (alternate row IDs=%s)',
	async (alternateRowIds) => {
		const { client, focused } = portal(
			[
				{ ID: 'info-math', Name: 'Math' },
				{ ID: 'info-english', Name: 'English' },
				{ ID: 'info-ethnic', Name: 'Ethnic Studies' }
			],
			alternateRowIds
		);
		await client.gradebook(undefined, true);
		const restored = Pxp2Client.resume(client.exportSessionState());
		const result = await restored.gradebook();
		expect(result.courses).toMatchObject([
			{
				id: 'info-math',
				title: 'Math',
				period: '3',
				score: 'A+',
				scoreRaw: '100',
				assignments: [{ Measure: 'Math work' }]
			},
			{
				id: 'info-english',
				title: 'English',
				period: '1',
				score: 'B',
				scoreRaw: '84',
				assignments: [{ Measure: 'English work' }]
			},
			{
				id: 'info-ethnic',
				title: 'Ethnic Studies',
				period: '2',
				score: 'A-',
				scoreRaw: '91',
				assignments: [{ Measure: 'Ethnic Studies work' }]
			}
		]);
		expect(focused).toEqual(['english', 'ethnic', 'math']);
	}
);

test('repeated course titles with unrelated IDs cannot authorize a positional grade match', async () => {
	const { client } = portal([
		{ ID: 'info-english-1', Name: 'English' },
		{ ID: 'info-english-2', Name: 'English' },
		{ ID: 'info-math', Name: 'Math' }
	]);
	await expect(client.gradebook(undefined, true)).rejects.toThrow('ambiguous class identity');
});

test.each([true, false])(
	'a conflicting class ID/title cannot publish another course grade (summary=%s)',
	async (summary) => {
		const { client } = portal([
			{ ID: 'math', Name: 'English' },
			{ ID: 'english', Name: 'Ethnic Studies' },
			{ ID: 'ethnic', Name: 'Math' }
		]);
		await expect(client.gradebook(undefined, summary)).rejects.toThrow('class identity');
	}
);
