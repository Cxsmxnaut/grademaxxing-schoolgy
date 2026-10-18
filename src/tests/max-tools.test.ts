import { sanitizeMaxContext } from '$lib/max/context';
import { askMaxDetailed, MAX_SYSTEM_PROMPT } from '$lib/server/max/max';
import {
	TokenMesh,
	type ChatPayload,
	type FetchLike,
	type ToolCall
} from '$lib/server/max/tokenMesh';
import { executeMaxTool } from '$lib/server/max/tools';
import { expect, test, vi } from 'vitest';

const context = () =>
	sanitizeMaxContext({
		reportingPeriod: 'Quarter 1',
		gradesStatus: 'available',
		assignmentDetailsAvailable: true,
		gpa: {
			status: 'available',
			gradeLevel: 10,
			unweighted: 3.5,
			weighted: 4,
			displayUnweighted: '3.50',
			displayWeighted: '4.00'
		},
		courses: [
			{
				course: 'AP Biology',
				letter: 'A',
				percent: 94,
				categories: [
					{ name: 'Tests', weightPercentage: 60, pointsEarned: 90, pointsPossible: 100 },
					{ name: 'Homework', weightPercentage: 40, pointsEarned: 100, pointsPossible: 100 }
				]
			},
			{ course: 'English', letter: 'B', percent: 83.5 }
		]
	})!;
const call = (name: string, args: unknown, id = 'call-1'): ToolCall => ({
	id,
	type: 'function',
	function: { name, arguments: JSON.stringify(args) }
});
const execute = (name: string, args: unknown, app = context()) =>
	executeMaxTool(call(name, args), app) as Record<string, unknown>;

test('master prompt requires app tools for calculations and forbids independent arithmetic', () => {
	expect(MAX_SYSTEM_PROMPT).toContain('Do not do arithmetic yourself');
	expect(MAX_SYSTEM_PROMPT).toContain('MUST come from an app calculation tool');
	expect(MAX_SYSTEM_PROMPT).toContain('only authority');
	expect(MAX_SYSTEM_PROMPT).not.toContain('recompute the numerator');
});

test('read tool returns structured app data, not canned prose', () => {
	const result = execute('read_app_data', { section: 'gpa' });
	expect(result.gpa).toMatchObject({ unweighted: 3.5, weighted: 4, displayUnweighted: '3.50' });
	expect(result).not.toHaveProperty('text');
});

test.each([
	[
		'points_average',
		[
			{ earned: 10, possible: 10 },
			{ earned: 30, possible: 90 }
		],
		40
	],
	[
		'equal_average',
		[
			{ earned: 10, possible: 10 },
			{ earned: 30, possible: 90 }
		],
		200 / 3
	],
	[
		'weighted_average',
		[
			{ earned: 80, possible: 100, weight: 75 },
			{ earned: 100, possible: 100, weight: 25 }
		],
		85
	]
])('grade engine calculates %s', (operation, rows, expected) => {
	const result = execute('calculate_grade', { operation, rows });
	expect(result.percentage).toBeCloseTo(expected as number);
	expect(result.source).toBe('Grademaxxing grade engine');
});

test('final target and impossible assignment targets use app target-grade calculator', () => {
	expect(
		execute('calculate_grade', {
			operation: 'final_target',
			currentPercentage: 80,
			finalWeightPercent: 25,
			targetPercentage: 85
		})
	).toMatchObject({ requiredFinalPercentage: 100, achievableWithoutExtraCredit: true });
	expect(
		execute('calculate_grade', {
			operation: 'target_assignment',
			rows: [{ earned: 60, possible: 100 }],
			assignmentPointsPossible: 50,
			targetPercentage: 80
		})
	).toMatchObject({
		requiredPoints: 60,
		requiredPercentage: 120,
		achievableWithoutExtraCredit: false
	});
});

test('course projection sources official category totals and preserves the snapshot', () => {
	const app = context();
	const before = JSON.stringify(app);
	expect(
		execute(
			'project_course',
			{ course: 'AP Biology', category: 'Tests', pointsEarned: 10, pointsPossible: 10 },
			app
		).projectedPercentage
	).toBeCloseTo(94.545454545);
	expect(
		execute(
			'project_course',
			{ course: 'AP Biology', category: 'Tests', pointsPossible: 100, targetPercentage: 95 },
			app
		).requiredPoints
	).toBeCloseTo(93.33333333);
	expect(JSON.stringify(app)).toBe(before);
});

test('GPA scenario uses app flat letter scale and course weighting', () => {
	expect(execute('project_gpa', { changes: [{ course: 'English', letter: 'A-' }] })).toMatchObject({
		unweighted: '4.00',
		weighted: '4.50',
		estimate: true
	});
});

test('GPA scenario respects app minimum grade level', () => {
	const app = context();
	app.gpa.gradeLevel = 8;
	expect(
		execute('project_gpa', { changes: [{ course: 'English', letter: 'A' }] }, app)
	).toMatchObject({ unweighted: '—', weighted: '—' });
});

test('missing inputs, unsupported categories and mismatched baselines produce errors', () => {
	expect(
		execute('calculate_grade', { operation: 'final_target', currentPercentage: 80 })
	).toHaveProperty('error');
	expect(
		execute('project_course', {
			course: 'AP Biology',
			category: 'Unknown',
			pointsEarned: 10,
			pointsPossible: 10
		})
	).toHaveProperty('error');
	const app = context();
	app.courses[0]!.percent = 70;
	expect(
		execute(
			'project_course',
			{ course: 'AP Biology', category: 'Tests', pointsEarned: 10, pointsPossible: 10 },
			app
		)
	).toHaveProperty('error');
	expect(
		executeMaxTool(
			{
				...call('calculate_grade', {}),
				function: { name: 'calculate_grade', arguments: 'not-json' }
			},
			app
		)
	).toHaveProperty('error');
	expect(execute('run_arbitrary_code', { code: 'process.exit()' })).toHaveProperty('error');
});

const slot = {
	id: 'test',
	provider: 'test',
	key: 'synthetic',
	model: 'test-model',
	baseUrl: 'https://provider.test/v1'
};
const json = (body: unknown) =>
	new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } });
const sse = (frames: unknown[]) =>
	new Response(
		frames.map((frame) => `data: ${JSON.stringify(frame)}\n\n`).join('') + 'data: [DONE]\n\n',
		{ headers: { 'content-type': 'text/event-stream' } }
	);

test('agent executes native tools, returns results by call id, and streams the model explanation', async () => {
	const seen: ChatPayload[] = [];
	const fetchImpl = vi.fn<FetchLike>(async (_url, init) => {
		seen.push(JSON.parse(String(init?.body)));
		if (seen.length === 1)
			return json({
				choices: [
					{
						message: {
							content: null,
							tool_calls: [call('read_app_data', { section: 'gpa' }, 'read')]
						}
					}
				]
			});
		if (seen.length === 2)
			return sse([
				{
					choices: [
						{
							delta: {
								tool_calls: [
									{
										index: 0,
										id: 'calc',
										function: { name: 'calculate_grade', arguments: '{"operation":"final_target",' }
									}
								]
							}
						}
					]
				},
				{
					choices: [
						{
							delta: {
								tool_calls: [
									{
										index: 0,
										function: {
											arguments:
												'"currentPercentage":80,"finalWeightPercent":25,"targetPercentage":85}'
										}
									}
								]
							},
							finish_reason: 'tool_calls'
						}
					]
				}
			]);
		return sse([
			{ choices: [{ delta: { content: 'The app calculator says ' } }] },
			{ choices: [{ delta: { content: '**100%**.' }, finish_reason: 'stop' }] }
		]);
	});
	const chunks: string[] = [];
	const result = await askMaxDetailed(
		context(),
		'An arbitrary paraphrase, not a matched canned question.',
		{ mesh: new TokenMesh({ slots: [slot], fetchImpl }), onToken: (chunk) => chunks.push(chunk) }
	);
	expect(result.toolsUsed).toEqual(['read_app_data', 'calculate_grade']);
	expect(result.text).toBe('The app calculator says **100%**.');
	expect(chunks).toEqual(['The app calculator says ', '**100%**.']);
	expect(seen[0]?.tool_choice).toBe('auto');
	expect(seen[0]?.messages[1]?.content).not.toContain('3.50'); // Read via tool, not guessed from prompt.
	const resultMessage = seen[2]!.messages.find((message) => message.tool_call_id === 'calc');
	expect(JSON.parse(resultMessage!.content)).toMatchObject({
		source: 'Grademaxxing grade engine',
		requiredFinalPercentage: 100
	});
});

test('required tool support fails over past a provider that ignores tools', async () => {
	const fetchImpl = vi
		.fn<typeof fetch>()
		.mockResolvedValueOnce(json({ choices: [{ message: { content: 'invented answer' } }] }))
		.mockResolvedValueOnce(
			json({
				choices: [
					{ message: { content: null, tool_calls: [call('read_app_data', { section: 'gpa' })] } }
				]
			})
		);
	const mesh = new TokenMesh({
		slots: [
			{ ...slot, id: 'bad', tier: 1 },
			{ ...slot, id: 'good', tier: 2 }
		],
		fetchImpl
	});
	const result = await mesh.complete({ messages: [], tools: [], tool_choice: 'required' });
	expect(result.slotId).toBe('good');
	expect(result.toolCalls?.[0]?.function.name).toBe('read_app_data');
});

test('agent bounds repeated tool calls and never executes arbitrary tool names', async () => {
	const complete = vi.fn(async () => ({
		text: '',
		provider: 'test',
		model: 'test',
		slotId: 'test',
		usage: null,
		toolCalls: [call('unknown_tool', {})]
	}));
	await expect(
		askMaxDetailed(context(), 'test', { mesh: { complete } as unknown as TokenMesh })
	).rejects.toMatchObject({ name: 'UpstreamError' });
	expect(complete).toHaveBeenCalledTimes(16);
});
