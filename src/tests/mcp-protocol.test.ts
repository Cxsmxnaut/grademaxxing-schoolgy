import { mcpResource } from '$lib/server/mcp/metadata';
import { handleMcpMessage, handleMcpPayload, McpProtocolError } from '$lib/server/mcp/protocol';
import {
	McpAuthRequiredError,
	McpToolResult,
	mcpTools,
	type ToolContext
} from '$lib/server/mcp/tools';
import { Pxp2SessionExpiredError, type PortalGradebook } from '$lib/server/pxp2';
import { StudentSessionBusyError, type StudentSession } from '$lib/server/student-session';
import { expect, test, vi } from 'vitest';

const RESOURCE = mcpResource('http://127.0.0.1:5173');

function fixtureGradebook(): PortalGradebook {
	return {
		detailed: true,
		reportingPeriods: [{ name: 'Quarter 1', index: 0, startDate: '', endDate: '' }],
		selectedPeriod: { name: 'Quarter 1', index: 0, startDate: '', endDate: '' },
		courses: [
			{
				id: 'course-1',
				period: '1',
				title: 'AP Biology',
				room: '101',
				teacher: 'Dr. Rivera',
				teacherEmail: 'rivera@school.edu',
				score: 'B+',
				scoreRaw: '88.4',
				missing: '1',
				categories: [
					{
						name: 'Tests',
						weight: '60',
						points: '120',
						pointsPossible: '150',
						weightedPercentage: '60',
						calculatedMark: '80'
					},
					{
						name: 'Homework',
						weight: '40',
						points: '80',
						pointsPossible: '100',
						weightedPercentage: '40',
						calculatedMark: '80'
					}
				],
				assignments: [
					{
						AssignmentID: '101',
						Measure: 'Unit 1 Test',
						Type: 'Tests',
						Date: '09/15/2026',
						Score: '85',
						ScoreCalValue: '85',
						ScoreMaxValue: '100',
						Point: '85',
						PointPossible: '100'
					},
					{
						AssignmentID: '102',
						Measure: 'Lab Report',
						Type: 'Homework',
						Date: '09/20/2026',
						Score: 'Missing',
						ScoreCalValue: '0',
						ScoreMaxValue: '20',
						Point: '0',
						PointPossible: '20'
					},
					{
						AssignmentID: '103',
						Measure: 'Quiz 2',
						Type: 'Tests',
						Date: '09/28/2026',
						Score: '90',
						ScoreCalValue: '90',
						ScoreMaxValue: '100',
						Point: '90',
						PointPossible: '100'
					}
				]
			},
			{
				id: 'course-2',
				period: '2',
				title: 'PE',
				room: 'Gym',
				teacher: 'Coach Lee',
				teacherEmail: '',
				score: 'N/A',
				scoreRaw: '',
				missing: '0',
				categories: [],
				assignments: []
			}
		]
	};
}

function fakeCtx(client: Record<string, unknown>): ToolContext {
	return {
		session: {
			client,
			clientSessionId: 'd9428888-122b-4f22-bc7f-1d95e4097a11',
			username: 'student@example.edu',
			domain: 'ca-pleas-psv.edupoint.com',
			expiresAt: Date.now() + 60_000,
			operationTail: Promise.resolve(),
			queuedOperations: 0
		} as unknown as StudentSession
	};
}

function call(ctx: ToolContext, name: string, args: unknown = {}) {
	return handleMcpMessage(
		{ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } },
		ctx
	);
}

function resultOf(response: unknown) {
	const value = response as {
		result: { structuredContent: Record<string, unknown>; isError?: boolean };
	};
	return value.result;
}

test('initialize negotiates versions and server/discover works statelessly', async () => {
	const ctx = fakeCtx({});
	const older = (await handleMcpMessage(
		{ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18' } },
		ctx
	)) as { result: Record<string, unknown> };
	expect(older.result.protocolVersion).toBe('2025-06-18');
	expect(older.result.serverInfo).toMatchObject({ name: 'grademaxxing' });
	expect(older.result.instructions).toContain('read-only');

	const unknown = (await handleMcpMessage(
		{ jsonrpc: '2.0', id: 2, method: 'initialize', params: { protocolVersion: '1999-01-01' } },
		ctx
	)) as { result: Record<string, unknown> };
	expect(unknown.result.protocolVersion).toBe('2025-11-25');

	const discovered = (await handleMcpMessage(
		{ jsonrpc: '2.0', id: 3, method: 'server/discover' },
		ctx
	)) as { result: Record<string, unknown> };
	expect(discovered.result).toMatchObject({ resultType: 'complete' });
	expect(discovered.result.supportedVersions).toContain('2026-07-28');

	const ping = await handleMcpMessage({ jsonrpc: '2.0', id: 4, method: 'ping' }, ctx);
	expect(ping).toEqual({ jsonrpc: '2.0', id: 4, result: {} });

	// Notifications receive no response.
	expect(
		await handleMcpMessage({ jsonrpc: '2.0', method: 'notifications/initialized' }, ctx)
	).toBeNull();
});

test('tool catalog is read-only, unique, and OpenAI profile designations are present', async () => {
	const names = mcpTools.map((tool) => tool.name);
	expect(new Set(names).size).toBe(names.length);
	expect(names).toEqual(
		expect.arrayContaining([
			'get_profile',
			'get_capabilities',
			'get_gradebook',
			'get_course',
			'get_gradebook_digest',
			'calculate_gpa',
			'project_course_grade',
			'get_attendance',
			'get_calendar',
			'get_schedule',
			'list_documents',
			'get_document',
			'get_report_cards',
			'get_student_profile',
			'get_student_photo',
			'get_school_info',
			'list_mail_folders',
			'list_mail',
			'get_message',
			'get_mail_attachment'
		])
	);
	for (const tool of mcpTools) {
		expect(tool.annotations, tool.name).toEqual({ readOnlyHint: true, openWorldHint: true });
		expect(tool.inputSchema.type, tool.name).toBe('object');
		expect(tool.outputSchema.type, tool.name).toBe('object');
		expect(tool.description.length, tool.name).toBeGreaterThan(20);
	}
	const profile = mcpTools.find((tool) => tool.name === 'get_profile');
	expect(profile?._meta).toEqual({ 'openai/profile': true });

	const listed = (await handleMcpMessage(
		{ jsonrpc: '2.0', id: 1, method: 'tools/list' },
		fakeCtx({})
	)) as {
		result: { tools: Array<Record<string, unknown>> };
	};
	expect(listed.result.tools.length).toBe(mcpTools.length);
	expect(listed.result.tools[0]).toHaveProperty('_meta');
});

test('profile tool returns a stable opaque identity', async () => {
	const ctx = fakeCtx({});
	const first = resultOf(await call(ctx, 'get_profile'));
	const second = resultOf(await call(ctx, 'get_profile'));
	expect(first.structuredContent).toEqual({
		id: expect.stringMatching(/^[0-9a-f]{32}$/),
		name: 'student@example.edu',
		nickname: 'StudentVUE (ca-pleas-psv.edupoint.com)'
	});
	expect(second.structuredContent.id).toBe(first.structuredContent.id);
});

test('gradebook tool separates official marks from assignments', async () => {
	const client = { gradebook: vi.fn(async () => fixtureGradebook()) };
	const ctx = fakeCtx(client);
	const summary = resultOf(await call(ctx, 'get_gradebook'));
	const courses = summary.structuredContent.courses as Array<Record<string, unknown>>;
	expect(courses).toHaveLength(2);
	expect(courses[0]!.officialMark).toEqual({ letter: 'B+', percentage: '88.4', missingCount: '1' });
	expect(courses[0]!.categories).toHaveLength(2);
	expect(courses[0]).not.toHaveProperty('assignments');
	expect(client.gradebook).toHaveBeenCalledWith(undefined, false);

	const detailed = resultOf(
		await call(ctx, 'get_gradebook', { includeAssignments: true, assignmentLimit: 2 })
	);
	const detailedCourse = (detailed.structuredContent.courses as Array<Record<string, unknown>>)[0]!;
	expect(detailedCourse.assignments).toHaveLength(2);
	expect(detailedCourse.assignmentCount).toBe(3);
	expect(detailedCourse.assignmentsTruncated).toBe(true);
	const detailedAssignments = detailedCourse.assignments as Array<Record<string, unknown>>;
	expect(detailedAssignments[0]).toMatchObject({
		name: 'Unit 1 Test',
		category: 'Tests',
		earned: 85
	});
});

test('digest tool flags missing work and computes labeled local statistics', async () => {
	const ctx = fakeCtx({ gradebook: vi.fn(async () => fixtureGradebook()) });
	const digest = resultOf(await call(ctx, 'get_gradebook_digest'));
	const biology = (digest.structuredContent.courses as Array<Record<string, unknown>>)[0]!;
	const stats = biology.localCalculations as Record<string, unknown>;
	expect(stats.missingIndicatorCount).toBe(1);
	expect(stats.assignmentCount).toBe(3);
	expect(stats.pointsEarned).toBe(175);
	expect(stats.pointsPossible).toBe(220);
	expect(digest.structuredContent.disclaimer).toContain('local calculations');
	expect(biology.recentAssignments).toHaveLength(3);
	const lowest = biology.lowestScoringAssignments as Array<Record<string, unknown>>;
	expect(lowest[0]).toMatchObject({ name: 'Lab Report' });
});

test('gpa tool matches the app policy for provided and portal courses', async () => {
	const provided = resultOf(
		await call(fakeCtx({}), 'calculate_gpa', {
			courses: [
				{ name: 'English 10', letter: 'A' },
				{ name: 'Math 10', letter: 'B' },
				{ name: 'AP US History', letter: 'A' },
				{ name: 'PE', letter: 'F' }
			]
		})
	);
	const structured = provided.structuredContent;
	expect(structured.basis).toBe('provided');
	// (4 + 3 + 4 + 0) / 4
	expect(structured.unweighted).toBeCloseTo(2.75, 3);
	// Rigor points: AP A counts 5; PE is graded but not academic.
	expect(structured.weighted).toBeCloseTo(3, 3);
	expect(structured.academicWeighted).toBeCloseTo((4 + 3 + 5) / 3, 3);
	expect(structured.policy).toBe('PUSD provisional');

	const fromPortal = resultOf(
		await call(fakeCtx({ gradebook: vi.fn(async () => fixtureGradebook()) }), 'calculate_gpa')
	);
	expect(fromPortal.structuredContent.basis).toBe('gradebook');
	const graded = fromPortal.structuredContent.graded as Array<Record<string, unknown>>;
	// PE's official "N/A" mark cannot be graded and is skipped.
	expect(graded).toHaveLength(1);
	expect(graded[0]).toMatchObject({ name: 'AP Biology', letter: 'B+', basis: 'portal' });
	expect(fromPortal.structuredContent.unweighted).toBeCloseTo(3, 3);
});

test('what-if tool projects weighted simulations and keeps official values distinct', async () => {
	const ctx = fakeCtx({ gradebook: vi.fn(async () => fixtureGradebook()) });

	const add = resultOf(
		await call(ctx, 'project_course_grade', {
			courseId: 'course-1',
			changes: [{ type: 'add', category: 'Tests', earned: 25, possible: 25 }]
		})
	);
	const simulation = add.structuredContent.simulation as Record<string, unknown>;
	expect(add.structuredContent.official).toMatchObject({ letter: 'B+', percentage: '88.4' });
	expect(simulation.mode).toBe('weighted');
	expect(simulation.beforePercent).toBe(80);
	// Tests: (120+25)/(150+25) = 82.857% weighted 60 + Homework 80% weighted 40.
	expect(simulation.afterPercent).toBeCloseTo(81.71, 2);
	expect(simulation.deltaPercent).toBeCloseTo(1.71, 2);
	expect(add.structuredContent.disclaimer).toContain('Simulation only');
	expect((add.structuredContent.assumptions as string[]).join(' ')).toContain('plus/minus scale');

	const change = resultOf(
		await call(ctx, 'project_course_grade', {
			courseId: 'course-1',
			changes: [{ type: 'change', assignmentId: '101', earned: 100, possible: 100 }]
		})
	);
	// Tests become 135/150 = 90% * 0.6 + 80% * 0.4 = 86.
	expect((change.structuredContent.simulation as Record<string, unknown>).afterPercent).toBeCloseTo(
		86,
		2
	);

	await expect(
		call(ctx, 'project_course_grade', {
			courseId: 'course-1',
			changes: [{ type: 'add', category: 'Participation', earned: 1, possible: 1 }]
		})
	).resolves.toMatchObject({ error: { code: -32602 } });

	await expect(
		call(fakeCtx({ gradebook: vi.fn(async () => fixtureGradebook()) }), 'project_course_grade', {
			courseId: 'nope',
			changes: [{ type: 'add', earned: 1, possible: 1 }]
		})
	).resolves.toMatchObject({ error: { code: -32602 } });
});

test('unknown tools, bad arguments, and unknown resources are protocol errors', async () => {
	const ctx = fakeCtx({});
	await expect(call(ctx, 'delete_everything')).resolves.toMatchObject({ error: { code: -32602 } });
	await expect(call(ctx, 'get_course', {})).resolves.toMatchObject({ error: { code: -32602 } });
	await expect(
		handleMcpMessage(
			{ jsonrpc: '2.0', id: 5, method: 'resources/read', params: { uri: 'studentvue://nope' } },
			ctx
		)
	).resolves.toMatchObject({ error: { code: -32602 } });
	await expect(
		handleMcpMessage({ jsonrpc: '2.0', id: 6, method: 'resources/read', params: {} }, ctx)
	).resolves.toMatchObject({ error: { code: -32602 } });
	await expect(
		handleMcpMessage(
			{ jsonrpc: '2.0', id: 7, method: 'prompts/get', params: { name: 'ghost' } },
			ctx
		)
	).resolves.toMatchObject({ error: { code: -32602 } });
	await expect(
		handleMcpMessage(
			{ jsonrpc: '2.0', id: 8, method: 'tools/call', params: { name: 'analyze-grades' } },
			ctx
		)
	).resolves.toMatchObject({ error: { code: -32602 } });
	await expect(
		handleMcpMessage({ jsonrpc: '2.0', id: 9, method: 'ghost/method' }, ctx)
	).resolves.toMatchObject({ error: { code: -32601 } });
});

test('explicit null tool and prompt arguments are rejected instead of becoming an empty object', async () => {
	for (const [method, name] of [
		['tools/call', 'get_capabilities'],
		['prompts/get', 'analyze-grades']
	]) {
		await expect(
			handleMcpMessage(
				{ jsonrpc: '2.0', id: 1, method, params: { name, arguments: null } },
				fakeCtx({})
			)
		).resolves.toMatchObject({ error: { code: -32602 } });
	}
});

test('resources and prompts are listable and readable', async () => {
	const ctx = fakeCtx({ gradebook: vi.fn(async () => fixtureGradebook()) });
	const listed = (await handleMcpMessage(
		{ jsonrpc: '2.0', id: 1, method: 'resources/list' },
		ctx
	)) as {
		result: { resources: Array<{ uri: string }> };
	};
	expect(listed.result.resources.map((resource) => resource.uri)).toContain(
		'studentvue://gradebook'
	);

	const read = (await handleMcpMessage(
		{ jsonrpc: '2.0', id: 2, method: 'resources/read', params: { uri: 'studentvue://gradebook' } },
		ctx
	)) as { result: { contents: Array<{ text: string; mimeType: string }> } };
	expect(read.result.contents[0]!.mimeType).toBe('application/json');
	expect(JSON.parse(read.result.contents[0]!.text).courses).toHaveLength(2);

	const prompts = (await handleMcpMessage(
		{ jsonrpc: '2.0', id: 3, method: 'prompts/list' },
		ctx
	)) as {
		result: { prompts: Array<{ name: string; arguments: unknown[] }> };
	};
	expect(prompts.result.prompts.map((prompt) => prompt.name)).toContain('analyze-grades');

	const prompt = (await handleMcpMessage(
		{
			jsonrpc: '2.0',
			id: 4,
			method: 'prompts/get',
			params: { name: 'what-if-scenario', arguments: { course: 'AP Biology' } }
		},
		ctx
	)) as { result: { messages: Array<{ content: { text: string } }> } };
	expect(prompt.result.messages[0]!.content.text).toContain('AP Biology');
	expect(prompt.result.messages[0]!.content.text).toContain('project_course_grade');

	await expect(
		handleMcpMessage(
			{
				jsonrpc: '2.0',
				id: 5,
				method: 'prompts/get',
				params: { name: 'what-if-scenario', arguments: {} }
			},
			ctx
		)
	).resolves.toMatchObject({ error: { code: -32602 } });
});

test('portal expiry escalates to a re-auth error while busy portals degrade safely', async () => {
	const expired = fakeCtx({
		gradebook: vi.fn(async () => {
			throw new Pxp2SessionExpiredError('StudentVUE session expired.');
		})
	});
	await expect(call(expired, 'get_gradebook')).rejects.toBeInstanceOf(McpAuthRequiredError);

	const busy = fakeCtx({
		gradebook: vi.fn(async () => {
			throw new StudentSessionBusyError('Too many StudentVUE requests are already queued.');
		})
	});
	const busyResponse = resultOf(await call(busy, 'get_gradebook'));
	expect(busyResponse.isError).toBe(true);
	expect(busyResponse.structuredContent).toMatchObject({ code: 'SERVICE_BUSY' });

	const broken = fakeCtx({
		gradebook: vi.fn(async () => {
			throw new Error('secret portal internals must not leak');
		})
	});
	const brokenResponse = resultOf(await call(broken, 'get_gradebook'));
	expect(brokenResponse.structuredContent).toMatchObject({ code: 'UPSTREAM_ERROR' });
	expect(JSON.stringify(brokenResponse.structuredContent)).not.toContain('secret portal internals');
});

test('binary tools emit image blocks and bound oversized payloads', async () => {
	const smallPng = Buffer.from('89504e470d0a1a0a', 'hex').toString('base64');
	const ctx = fakeCtx({
		document: vi.fn(async () => ({
			base64: smallPng,
			mimeType: 'image/png',
			fileName: 'report.png'
		}))
	});
	const response = resultOf(await call(ctx, 'get_document', { documentId: 'doc-1' }));
	// Handlers may wrap outputs to attach native image content.
	const structured = response.structuredContent as { included: boolean; fileName: string };
	expect(structured).toMatchObject({ included: true, fileName: 'report.png' });

	const oversized = fakeCtx({
		document: vi.fn(async () => ({
			base64: 'A'.repeat(600_000),
			mimeType: 'application/pdf',
			fileName: 'big.pdf'
		}))
	});
	const large = resultOf(await call(oversized, 'get_document', { documentId: 'doc-2' }));
	expect(large.structuredContent).toMatchObject({ included: false });
	expect(JSON.stringify(large.structuredContent)).not.toContain('AAAA');
});

test('mail tools normalize message previews and bound message bodies', async () => {
	const ctx = fakeCtx({
		messages: vi.fn(async () => [
			{
				messagePersonId: '11111111-2222-4333-8444-555555555555',
				messageId: '99999999-8888-4777-8666-555555555555',
				subject: 'Field trip form',
				sendDateTime: '10/01/2026 9:00 AM',
				mailRead: false,
				messageText: 'Please sign the attached form.',
				from: { contactDetails1: 'Ms. Chan <chan@school.edu>' },
				attachments: [{ attachmentId: '22222222-3333-4444-8555-666666666666', name: 'form.pdf' }]
			}
		])
	});
	const listed = resultOf(await call(ctx, 'list_mail'));
	const message = (listed.structuredContent.messages as Array<Record<string, unknown>>)[0]!;
	expect(message).toMatchObject({
		id: '11111111-2222-4333-8444-555555555555',
		subject: 'Field trip form',
		from: 'Ms. Chan <chan@school.edu>',
		read: false
	});
	expect(message.attachments).toEqual([
		{ id: '22222222-3333-4444-8555-666666666666', name: 'form.pdf' }
	]);
	expect(ctx.session.client.messages).toBeTypeOf('function');

	const detailCtx = fakeCtx({
		messageDetails: vi.fn(async () => ({ subject: 'Long', messageText: 'x'.repeat(30_000) }))
	});
	const detail = resultOf(
		await call(detailCtx, 'get_message', { messageId: '11111111-2222-4333-8444-555555555555' })
	);
	const messageBody = detail.structuredContent.message as { messageText: string };
	expect(messageBody.messageText.length).toBeLessThan(30_000);
	expect(messageBody.messageText).toContain('[truncated]');
});

test('batch payloads and parse failures behave per JSON-RPC', async () => {
	const ctx = fakeCtx({});
	const batch = (await handleMcpPayload(
		[
			{ jsonrpc: '2.0', id: 1, method: 'ping' },
			{ jsonrpc: '2.0', method: 'notifications/initialized' }
		],
		ctx
	)) as Array<{ id: number }>;
	expect(batch).toHaveLength(1);
	expect(batch[0]!.id).toBe(1);

	const onlyNotifications = await handleMcpPayload(
		[{ jsonrpc: '2.0', method: 'notifications/initialized' }],
		ctx
	);
	expect(onlyNotifications).toBeNull();

	await expect(handleMcpPayload([], ctx)).rejects.toBeInstanceOf(McpProtocolError);
	await expect(handleMcpPayload('not a message', ctx)).rejects.toBeInstanceOf(McpProtocolError);
});

test('resource reads surface official capabilities without a portal round trip', async () => {
	const ctx = fakeCtx({});
	const read = (await handleMcpMessage(
		{
			jsonrpc: '2.0',
			id: 1,
			method: 'resources/read',
			params: { uri: 'studentvue://capabilities' }
		},
		ctx
	)) as { result: { contents: Array<{ text: string }> } };
	const payload = JSON.parse(read.result.contents[0]!.text);
	expect(payload.readOnly).toBe(true);
	expect(payload.transport).toContain('MCP');
	expect(RESOURCE).toContain('/mcp');
});

test('McpToolResult wraps structured output for hosts', () => {
	const wrapped = new McpToolResult({ ok: true }, [{ data: 'abc', mimeType: 'image/png' }]);
	expect(wrapped.structured).toEqual({ ok: true });
	expect(wrapped.images).toHaveLength(1);
});

test('zero grades remain zero and projected category totals match the projection', async () => {
	const gradebook = fixtureGradebook();
	const course = gradebook.courses[0]!;
	course.assignments = [
		{ AssignmentID: 'zero', Type: 'Tests', Point: '0', PointPossible: '100', Score: '0' }
	];
	course.categories = [
		{
			name: 'Tests',
			weight: '100',
			points: '0',
			pointsPossible: '100',
			weightedPercentage: '100',
			calculatedMark: '0'
		}
	];
	const ctx = fakeCtx({ gradebook: vi.fn().mockResolvedValue(gradebook) });
	const digest = resultOf(await call(ctx, 'get_gradebook_digest')).structuredContent as {
		courses: Array<{ localCalculations: { pointsPercent: number } }>;
	};
	expect(digest.courses[0]!.localCalculations.pointsPercent).toBe(0);
	const output = resultOf(
		await call(ctx, 'project_course_grade', {
			courseId: course.id,
			changes: [{ type: 'change', assignmentId: 'zero', earned: 80, possible: 100 }]
		})
	).structuredContent as {
		simulation: {
			afterPercent: number;
			categories: Array<{ earned: number; possible: number; percent: number }>;
		};
	};
	expect(output.simulation.afterPercent).toBe(80);
	expect(output.simulation.categories[0]).toMatchObject({ earned: 80, possible: 100, percent: 80 });
});

test('what-if rejects invalid modes and duplicate replacements', async () => {
	const ctx = fakeCtx({ gradebook: vi.fn().mockResolvedValue(fixtureGradebook()) });
	const change = { type: 'change', assignmentId: '101', earned: 95, possible: 100 };
	for (const args of [
		{ courseId: 'course-1', mode: 'bogus', changes: [change] },
		{ courseId: 'course-1', changes: [change, change] }
	]) {
		const output = (await call(ctx, 'project_course_grade', args)) as { error: { code: number } };
		expect(output.error.code).toBe(-32602);
	}
});

test('zero-weight categories do not turn weighted courses into points-only simulations', async () => {
	const gradebook = fixtureGradebook();
	gradebook.courses[0]!.categories.push({
		name: 'Practice',
		weight: '0',
		points: '0',
		pointsPossible: '1000',
		weightedPercentage: '0',
		calculatedMark: '0'
	});
	const ctx = fakeCtx({ gradebook: vi.fn().mockResolvedValue(gradebook) });
	const output = resultOf(
		await call(ctx, 'project_course_grade', {
			courseId: 'course-1',
			changes: [{ type: 'add', category: 'Tests', earned: 80, possible: 100 }]
		})
	).structuredContent as { simulation: { mode: string; afterPercent: number } };
	expect(output.simulation).toMatchObject({ mode: 'weighted', afterPercent: 80 });
});

test('MCP digest uses weighted evidence, excludes practice, and counts extra credit like the UI', async () => {
	const gradebook = fixtureGradebook();
	gradebook.courses[0]!.assignments = [
		{
			AssignmentID: 'graded',
			Type: 'Tests',
			Point: '8',
			PointPossible: '10',
			ScoreCalValue: '80',
			ScoreMaxValue: '100',
			Score: '80'
		},
		{
			AssignmentID: 'practice',
			Type: 'Tests',
			Point: '0',
			PointPossible: '1000',
			Notes: '(Not For Grading) Practice',
			Score: '0'
		},
		{
			AssignmentID: 'unavailable',
			Type: 'Tests',
			ScoreCalValue: '0',
			ScoreMaxValue: '100',
			CalculationUnavailable: 'true',
			Score: '0'
		},
		{ AssignmentID: 'extra-credit', Type: 'Tests', Point: '2', PointPossible: '', Score: '2' }
	];
	const ctx = fakeCtx({ gradebook: vi.fn().mockResolvedValue(gradebook) });
	const digest = resultOf(await call(ctx, 'get_gradebook_digest')).structuredContent as {
		courses: Array<{
			localCalculations: { pointsEarned: number; pointsPossible: number; pointsPercent: number };
		}>;
	};
	expect(digest.courses[0]!.localCalculations).toMatchObject({
		pointsEarned: 10,
		pointsPossible: 10,
		pointsPercent: 100
	});
	const unavailable = (await call(ctx, 'project_course_grade', {
		courseId: 'course-1',
		changes: [{ type: 'change', assignmentId: 'unavailable', earned: 100, possible: 100 }]
	})) as { error: { code: number } };
	expect(unavailable.error.code).toBe(-32602);
});
