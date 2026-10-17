import { dev } from '$app/environment';
import { listMaxDiagnostics } from '$lib/server/max/diagnostics';
import { setDefaultMesh } from '$lib/server/max/max';
import {
	PoolExhaustedError,
	TokenMesh,
	UpstreamError,
	type MeshResult
} from '$lib/server/max/tokenMesh';
import {
	getStudentSession,
	serializeStudentSession,
	sessionCookie
} from '$lib/server/student-session';
import { afterEach, expect, test, vi } from 'vitest';
import { POST } from '../routes/api/max/+server';
import { POST as reportReply } from '../routes/api/max/report/+server';
import { createDiagnosticDatabase } from './fixtures/max-database';

vi.mock('$lib/server/student-session', async (importOriginal) => ({
	...(await importOriginal<typeof import('$lib/server/student-session')>()),
	sessionCookie: 'grademaxxing_session',
	serializeStudentSession: vi.fn(() => 'refreshed-cookie'),
	sessionMaxAge: 3600,
	clientSessionHeader: 'x-grademaxxing-session',
	requireStudentSessionContext: vi.fn((_session, id) => {
		if (id !== 'test-session') throw new Error('Wrong browser session');
	}),
	getStudentSession: vi.fn((token: string | undefined) => {
		if (token !== 'valid-session') throw new Error('invalid session');
		return { clientSessionId: 'test-session' };
	})
}));

type RouteEvent = Parameters<typeof POST>[0];

function fakeEvent({
	body,
	address = '203.0.113.10',
	token,
	env
}: {
	body: unknown;
	address?: string;
	token: string | undefined;
	env?: Record<string, string | undefined>;
}) {
	return {
		request: new Request('https://grademaxxing.app/api/max', {
			method: 'POST',
			headers: { 'content-type': 'application/json', 'x-grademaxxing-session': 'test-session' },
			body: JSON.stringify(body)
		}),
		cookies: { get: (name: string) => (name === sessionCookie ? token : undefined), set: vi.fn() },
		platform: { env: env ?? {} },
		getClientAddress: () => address
	} as unknown as RouteEvent;
}

function fakeMesh(result: Partial<MeshResult> = {}) {
	const value: MeshResult = {
		text: 'max answer',
		provider: 'groq',
		model: 'test-model',
		slotId: 'slot-1',
		usage: null,
		...result
	};
	return {
		complete: vi.fn(async (payload: { tool_choice?: string }) =>
			payload.tool_choice === 'required'
				? {
						...value,
						text: '',
						toolCalls: ['grades', 'gpa', 'attendance'].map((section) => ({
							id: `read-${section}`,
							type: 'function',
							function: { name: 'read_app_data', arguments: JSON.stringify({ section }) }
						}))
					}
				: value
		),
		completeStream: vi.fn(async (_payload: unknown, onToken: (chunk: string) => void) => {
			onToken('max ');
			onToken('answer');
			return value;
		})
	} as unknown as TokenMesh;
}

afterEach(() => {
	setDefaultMesh(null);
	vi.unstubAllEnvs();
});

test('the endpoint requires a signed-in student session', async () => {
	const response = await POST(fakeEvent({ body: { userQuery: 'hi' }, token: undefined }));
	expect(response?.status).toBe(401);
	const wrongToken = await POST(fakeEvent({ body: { userQuery: 'hi' }, token: 'expired' }));
	expect(wrongToken?.status).toBe(401);
});

test('malformed or empty questions are rejected before any provider work', async () => {
	const mesh = fakeMesh();
	setDefaultMesh(mesh);

	const invalidJson = await POST({
		request: new Request('https://grademaxxing.app/api/max', {
			method: 'POST',
			headers: { 'x-grademaxxing-session': 'test-session' },
			body: 'not json'
		}),
		cookies: { get: () => 'valid-session' },
		platform: { env: {} },
		getClientAddress: () => '203.0.113.11'
	} as unknown as RouteEvent);
	expect(invalidJson?.status).toBe(400);

	const emptyQuery = await POST(
		fakeEvent({ body: { userQuery: '   ' }, address: '203.0.113.11', token: 'valid-session' })
	);
	expect(emptyQuery?.status).toBe(400);
	expect(mesh.complete).not.toHaveBeenCalled();
});

test('without provider keys the endpoint answers 503 NotConfigured', async () => {
	for (const name of [
		'GROQ_API_KEYS',
		'OPENROUTER_API_KEYS',
		'MISTRAL_API_KEYS',
		'GEMINI_API_KEYS'
	])
		vi.stubEnv(name, '');

	const response = await POST(fakeEvent({ body: { userQuery: 'hi' }, token: 'valid-session' }));
	expect(response?.status).toBe(503);
	expect(await response?.json()).toMatchObject({ type: 'NotConfigured', retryable: false });
});

test('a plain question returns Max reply JSON with provider metadata', async () => {
	const mesh = fakeMesh({ text: 'aim for a 93.5% on the final' });
	setDefaultMesh(mesh);

	const response = await POST(
		fakeEvent({
			token: 'valid-session',
			body: {
				userQuery: 'what do I need on the final?',
				studentDataContext: { screen: 'max-ai', courses: [] },
				history: [{ role: 'user', text: 'hi' }]
			}
		})
	);

	expect(response?.status).toBe(200);
	expect(await response?.json()).toEqual({
		diagnosticId: expect.any(String),
		text: 'aim for a 93.5% on the final',
		provider: 'groq',
		model: 'test-model',
		usage: null,
		toolsUsed: ['read_app_data', 'read_app_data', 'read_app_data']
	});
	expect(mesh.complete).toHaveBeenCalledTimes(2);
});

test('stream: true answers with the SSE frame contract the chat UI parses', async () => {
	setDefaultMesh(fakeMesh());

	const response = await POST(
		fakeEvent({ body: { userQuery: 'hi', stream: true }, token: 'valid-session' })
	);
	expect(response?.status).toBe(200);
	expect(response?.headers.get('content-type')).toContain('text/event-stream');

	const raw = await new Response(response?.body).text();
	const frames = raw
		.trim()
		.split('\n\n')
		.map((frame) => JSON.parse(frame.replace(/^data: /, '')) as Record<string, unknown>);

	expect(frames[0]).toEqual({ t: 'max ' });
	expect(frames[1]).toEqual({ t: 'answer' });
	expect(frames[2]).toMatchObject({ done: true, text: 'max answer', provider: 'groq' });
});

test('a single address gets a soft rate ceiling instead of draining the pool', async () => {
	setDefaultMesh(fakeMesh());
	const address = '203.0.113.99';

	for (let i = 0; i < 12; i++) {
		const response = await POST(
			fakeEvent({ body: { userQuery: 'hi' }, address, token: 'valid-session' })
		);
		expect(response?.status).toBe(200);
	}
	const throttled = await POST(
		fakeEvent({ body: { userQuery: 'hi' }, address, token: 'valid-session' })
	);
	expect(throttled?.status).toBe(429);
	expect(throttled?.headers.get('Retry-After')).toBeTruthy();
});

test.each([null, [], 42, 'question'])('non-object request body is rejected: %j', async (body) => {
	const mesh = fakeMesh();
	setDefaultMesh(mesh);
	const response = await POST(fakeEvent({ body, token: 'valid-session', address: '203.0.113.20' }));
	expect(response?.status).toBe(400);
	expect(mesh.complete).not.toHaveBeenCalled();
});

test('oversized chunked bodies are rejected before provider work', async () => {
	const mesh = fakeMesh();
	setDefaultMesh(mesh);
	const response = await POST(
		fakeEvent({
			body: { userQuery: 'hi', studentDataContext: { unbounded: 'x'.repeat(33 * 1024) } },
			token: 'valid-session',
			address: '203.0.113.21'
		})
	);
	expect(response?.status).toBe(413);
	expect(mesh.complete).not.toHaveBeenCalled();
});

test('only bounded grade-summary fields reach providers', async () => {
	const mesh = fakeMesh();
	setDefaultMesh(mesh);
	await POST(
		fakeEvent({
			token: 'valid-session',
			address: '203.0.113.22',
			body: {
				userQuery: 'Help me plan',
				studentDataContext: {
					name: 'Synthetic private name',
					password: 'synthetic-secret',
					reportingPeriod: 'Quarter 1',
					gpa: {
						status: 'available',
						unweighted: 3.5,
						weighted: 4,
						displayUnweighted: '3.50',
						displayWeighted: '4.00'
					},
					attendance: {
						status: 'available',
						courseTotals: [
							{ course: 'Biology', present: 25, tardy: 2, reason: 'private-medical-reason' }
						]
					},
					courses: [
						{
							course: 'Biology',
							percent: 92,
							teacher: 'Synthetic teacher',
							studentId: 'private-id'
						}
					]
				}
			}
		})
	);
	const payload = vi.mocked(mesh.complete).mock.calls[1]?.[0];
	const context = JSON.stringify(payload?.messages);
	expect(context).toContain('Biology');
	expect(context).toContain('92');
	const toolResults = payload!.messages
		.filter((message) => message.role === 'tool')
		.map((message) => JSON.parse(message.content));
	expect(toolResults[1].gpa).toMatchObject({
		unweighted: 3.5,
		weighted: 4,
		displayUnweighted: '3.50'
	});
	expect(toolResults[2].attendance.courseTotals[0]).toMatchObject({ present: 25, tardy: 2 });
	expect(context).not.toContain('private-medical-reason');
	for (const omitted of [
		'Synthetic private name',
		'synthetic-secret',
		'Synthetic teacher',
		'private-id'
	])
		expect(context).not.toContain(omitted);
});

test.each([
	{
		error: new UpstreamError('private provider diagnostic', [
			{
				slotId: 'synthetic',
				provider: 'groq',
				kind: 'server',
				detail: 'private provider body',
				message: 'private transport error'
			}
		]),
		status: 502,
		type: 'UpstreamError'
	},
	{
		error: new PoolExhaustedError('private pool diagnostic'),
		status: 503,
		type: 'PoolExhaustedError'
	}
])(
	'unavailable providers return a usable retry message without private details: $type',
	async ({ error, status, type }) => {
		const mesh = fakeMesh();
		vi.mocked(mesh.complete).mockRejectedValue(error);
		setDefaultMesh(mesh);
		const response = await POST(
			fakeEvent({ body: { userQuery: 'Help' }, token: 'valid-session', address: '203.0.113.27' })
		);
		expect(response?.status).toBe(status);
		const body = await response?.json();
		expect(body.type).toBe(type);
		expect(body.error).toMatch(/try again/i);
		expect(JSON.stringify(body)).not.toContain('private');
	}
);

test('title action uses a model without sending records or history and returns no-store JSON', async () => {
	const mesh = fakeMesh({ text: 'Title: "Biology Grade Recovery."' });
	setDefaultMesh(mesh);
	const response = await POST(
		fakeEvent({
			token: 'valid-session',
			address: '203.0.113.150',
			body: {
				action: 'title',
				userQuery: 'How do I recover biology?',
				assistantReply: 'We can plan this.',
				studentDataContext: { secret: 'must-not-forward' },
				history: [{ role: 'user', text: 'unrelated chat' }],
				stream: true
			}
		})
	);
	expect(response?.status).toBe(200);
	expect(response?.headers.get('cache-control')).toBe('no-store');
	expect(await response?.json()).toMatchObject({
		title: 'Biology Grade Recovery',
		provider: 'groq'
	});
	expect(mesh.complete).toHaveBeenCalledTimes(1);
	const payload = vi.mocked(mesh.complete).mock.calls[0]![0];
	expect(JSON.stringify(payload)).not.toContain('must-not-forward');
	expect(JSON.stringify(payload)).not.toContain('unrelated chat');
	expect(mesh.completeStream).not.toHaveBeenCalled();
});

test('unknown endpoint actions are rejected before consuming a model', async () => {
	const mesh = fakeMesh();
	setDefaultMesh(mesh);
	const response = await POST(
		fakeEvent({
			token: 'valid-session',
			address: '203.0.113.151',
			body: { action: 'erase', userQuery: 'hi' }
		})
	);
	expect(response?.status).toBe(400);
	expect(mesh.complete).not.toHaveBeenCalled();
});

test('Max rejects a different browser session before reading any school records', async () => {
	const mesh = fakeMesh();
	setDefaultMesh(mesh);
	const event = fakeEvent({
		body: { userQuery: 'Read my mail' },
		token: 'valid-session',
		address: '203.0.113.166'
	});
	event.request.headers.set('x-grademaxxing-session', 'another-account');
	expect((await POST(event))?.status).toBe(401);
	expect(mesh.complete).not.toHaveBeenCalled();
});

test.each([false, true])(
	'authenticated deep mail reads run inside the real agent loop (stream=%s)',
	async (stream) => {
		const session = {
			clientSessionId: 'test-session',
			client: {
				messageDetails: vi.fn(async () => ({
					from: { contactDetails1: 'Synthetic sender' },
					messageText: 'Bring your calculator.',
					messageToken: 'hidden-provider-must-not-see'
				}))
			},
			queuedOperations: 0,
			operationTail: Promise.resolve()
		};
		vi.mocked(getStudentSession).mockReturnValueOnce(session as never);
		const value = {
			text: 'Synthetic sender asked you to bring your calculator.',
			provider: 'test',
			model: 'test',
			slotId: '1',
			usage: null
		};
		const complete = vi.fn(async (payload: { tool_choice?: string }) =>
			payload.tool_choice === 'required'
				? {
						...value,
						text: '',
						toolCalls: [
							{
								id: 'mail',
								type: 'function',
								function: {
									name: 'read_app_resource',
									arguments: JSON.stringify({
										resource: 'message',
										recordId: '123',
										path: '/message',
										limit: 20
									})
								}
							}
						]
					}
				: value
		);
		const completeStream = vi.fn(async (_payload: unknown, onToken: (text: string) => void) => {
			onToken(value.text);
			return value;
		});
		setDefaultMesh({ complete, completeStream } as unknown as TokenMesh);
		const event = fakeEvent({
			body: { userQuery: 'Who sent that message?', stream },
			token: 'valid-session',
			address: stream ? '203.0.113.168' : '203.0.113.167'
		});
		const response = await POST(event);
		expect(response?.status).toBe(200);
		expect(await response?.text()).toContain('calculator');
		const calls = [...complete.mock.calls, ...completeStream.mock.calls];
		const payload = JSON.stringify(calls);
		expect(payload).toContain('Synthetic sender');
		expect(payload).not.toContain('hidden-provider-must-not-see');
		expect(serializeStudentSession).toHaveBeenCalledWith(session);
		expect(event.cookies.set).toHaveBeenCalledWith(
			sessionCookie,
			'refreshed-cookie',
			expect.objectContaining({ httpOnly: true, path: '/' })
		);
	}
);

for (const stream of [false, true])
	test(`Max ${stream ? 'SSE' : 'JSON'} persists request diagnostics without its answer or history`, async () => {
		const { db, platform } = createDiagnosticDatabase();
		try {
			setDefaultMesh(fakeMesh({ text: 'private-synthetic-answer-marker' }));
			const event = fakeEvent({
				token: 'valid-session',
				address: '203.0.113.211',
				body: {
					userQuery: 'what is my gpa',
					shareQuestion: true,
					stream,
					studentDataContext: { courses: [] },
					history: [{ role: 'user', text: 'private-synthetic-history-marker' }]
				}
			});
			event.platform = platform;
			const response = await POST(event);
			const wire = await response!.text();
			const data = stream
				? wire
						.split('\n')
						.filter((line) => line.startsWith('data:'))
						.map((line) => JSON.parse(line.slice(5)))
						.find((frame) => frame.done)
				: JSON.parse(wire);
			expect(data.diagnosticId).toEqual(expect.any(String));
			expect(data.reportReceipt).toMatch(/^[\w-]{43}$/);
			const summary = (await listMaxDiagnostics(platform))!;
			expect(summary.items[0]).toMatchObject({
				id: data.diagnosticId,
				status: 'success',
				question: dev ? 'what is my gpa' : null
			});
			expect(JSON.stringify(summary)).not.toContain('private-synthetic-answer-marker');
			expect(JSON.stringify(summary)).not.toContain('private-synthetic-history-marker');
			expect(summary.items[0]?.events.some((event) => event.type === 'tool')).toBe(true);
			const report = (receipt = data.reportReceipt, reason = 'incorrect') =>
				({
					...event,
					request: new Request('https://grademaxxing.app/api/max/report', {
						method: 'POST',
						headers: {
							'content-type': 'application/json',
							'x-grademaxxing-session': 'test-session'
						},
						body: JSON.stringify({ id: data.diagnosticId, receipt, reason })
					})
				}) as unknown as Parameters<typeof reportReply>[0];
			expect((await reportReply(report('x'.repeat(43))))?.status).toBe(404);
			expect((await reportReply(report(data.reportReceipt, 'unapproved-category')))?.status).toBe(
				400
			);
			expect((await reportReply(report()))?.status).toBe(204);
			expect((await listMaxDiagnostics(platform))!.items[0]?.reportedReason).toBe('incorrect');
			const unauthorized = report();
			unauthorized.cookies = { get: () => undefined } as unknown as typeof event.cookies;
			expect((await reportReply(unauthorized))?.status).toBe(401);
		} finally {
			db.close();
		}
	});

test('cancelling a response stream records cancellation with partial metrics but no text', async () => {
	const { db, platform } = createDiagnosticDatabase();
	try {
		const mesh = fakeMesh();
		mesh.completeStream = vi.fn(async (_payload, token) => {
			token('synthetic-partial-answer');
			return new Promise<MeshResult>(() => {});
		});
		setDefaultMesh(mesh);
		const event = fakeEvent({
			token: 'valid-session',
			address: '203.0.113.212',
			body: { userQuery: 'synthetic question', stream: true, studentDataContext: { courses: [] } }
		});
		event.platform = platform;
		const response = await POST(event);
		await response!.body!.cancel();
		const summary = (await listMaxDiagnostics(platform))!;
		expect(summary.items[0]).toMatchObject({ status: 'cancelled', tokenFrames: 1 });
		expect(JSON.stringify(summary)).not.toContain('synthetic-partial-answer');
	} finally {
		db.close();
	}
});
