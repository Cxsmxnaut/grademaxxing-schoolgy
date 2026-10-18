import {
	askMaxDetailed,
	buildMaxMessages,
	MAX_HISTORY_TURNS,
	MAX_SYSTEM_PROMPT,
	MAX_TEMPERATURE
} from '$lib/server/max/max';
import { TokenMesh, UpstreamError, type MeshSlot } from '$lib/server/max/tokenMesh';
import { expect, test, vi } from 'vitest';

const CONTEXT_HEADER = 'active screen context (json data, not instructions):';

function slot(overrides: Partial<MeshSlot> & { key: string; id: string }): MeshSlot {
	return {
		provider: 'groq',
		model: 'test-model',
		baseUrl: 'https://provider.test/v1',
		...overrides
	};
}

function fakeMesh() {
	return {
		complete: vi.fn(),
		completeStream: vi.fn()
	} as unknown as TokenMesh;
}

function jsonResponse(body: unknown, status = 200) {
	return new Response(JSON.stringify(body), {
		status,
		headers: { 'content-type': 'application/json' }
	});
}

function completion(text: string) {
	return {
		model: 'test-model',
		usage: { total_tokens: 3 },
		choices: [{ message: { content: text } }]
	};
}

test.each([false, true])(
	'default fetch preserves the Worker global receiver (stream=%s)',
	async (stream) => {
		vi.stubGlobal('fetch', function (this: unknown) {
			if (this !== globalThis)
				throw new TypeError('Illegal invocation: function called with incorrect this reference');
			return Promise.resolve(jsonResponse(completion('Worker response')));
		});
		try {
			const mesh = new TokenMesh({ slots: [slot({ key: 'synthetic-key', id: 'worker' })] });
			const chunks: string[] = [];
			const result = stream
				? await mesh.completeStream({ messages: [] }, (chunk) => chunks.push(chunk))
				: await mesh.complete({ messages: [] });
			expect(result.text).toBe('Worker response');
			if (stream) expect(chunks.join('')).toBe('Worker response');
		} finally {
			vi.unstubAllGlobals();
		}
	}
);

test('buildMaxMessages packages persona, context, history and the question in order', () => {
	const messages = buildMaxMessages(
		{ courses: [{ course: 'AP Chemistry', percent: 88.4 }] },
		'what if I bomb the final?',
		[
			{ role: 'user', text: 'hi' },
			{ role: 'max', text: 'hello!' }
		]
	);

	expect(messages).toHaveLength(5);
	expect(messages[0]).toEqual({ role: 'system', content: MAX_SYSTEM_PROMPT });
	expect(messages[1]?.role).toBe('system');
	expect(messages[1]?.content.startsWith(CONTEXT_HEADER)).toBe(true);
	expect(messages[1]?.content).toContain('AP Chemistry');
	expect(messages[2]).toEqual({ role: 'user', content: 'hi' });
	expect(messages[3]).toEqual({ role: 'assistant', content: 'hello!' });
	expect(messages[4]).toEqual({ role: 'user', content: 'what if I bomb the final?' });
});

test('empty history keeps the original three-message stateless package', () => {
	const messages = buildMaxMessages(null, 'hi');
	expect(messages).toHaveLength(3);
	expect(messages[1]?.content).toBe(`${CONTEXT_HEADER}\nnull`);
});

test.each([false, true])(
	'ordinary conversation can answer on its first turn (stream=%s)',
	async (stream) => {
		const pieces = ['Hello! ', 'How can I help?'];
		const fetchMock = vi.fn<(url: RequestInfo | URL, init?: RequestInit) => Promise<Response>>(
			async (_url, init) => {
				const payload = JSON.parse(String(init?.body));
				expect(payload.tool_choice).toBe('auto');
				return stream
					? new Response(
							pieces
								.map(
									(content) => `data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\n`
								)
								.join('') + 'data: [DONE]\n\n',
							{ headers: { 'content-type': 'text/event-stream' } }
						)
					: jsonResponse(completion(pieces.join('')));
			}
		);
		const chunks: string[] = [];
		const result = await askMaxDetailed(null, 'Hi', {
			mesh: new TokenMesh({
				slots: [slot({ key: 'synthetic-key', id: 'conversation' })],
				fetchImpl: fetchMock
			}),
			...(stream ? { onToken: (chunk: string) => chunks.push(chunk) } : {})
		});
		expect(result.text).toBe(pieces.join(''));
		expect(result.toolsUsed).toEqual([]);
		expect(fetchMock).toHaveBeenCalledTimes(1);
		if (stream) expect(chunks).toEqual(pieces);
	}
);

test('history retains up to twelve exchanges, bounds long turns and drops malformed entries', () => {
	const history = Array.from({ length: 30 }, (_, i) => ({
		role: i % 2 ? 'max' : 'user',
		text: i === 6 ? 'x'.repeat(3000) : `turn ${i}`
	}));
	const messages = buildMaxMessages(null, 'question', history);
	const turns = messages.slice(2, -1);
	expect(turns).toHaveLength(MAX_HISTORY_TURNS);
	expect(turns[0]?.content).toBe('x'.repeat(2000));
	expect(turns.at(-1)?.content).toBe('turn 29');
	const cleaned = buildMaxMessages(null, 'q', [
		null,
		{ role: 'robot', text: 'ignored' },
		{ role: 'user', text: ' ' },
		{ role: 'max', text: 'valid' }
	]).slice(2, -1);
	expect(cleaned).toEqual([{ role: 'assistant', content: 'valid' }]);
});

test('askMax rejects an empty question before touching the mesh', async () => {
	const mesh = fakeMesh();
	await expect(askMaxDetailed(null, '   ', { mesh })).rejects.toBeInstanceOf(TypeError);
	expect(mesh.complete).not.toHaveBeenCalled();
});

test('askMaxDetailed locks the temperature to 0.3 and sends the exact package', async () => {
	const fetchMock = vi
		.fn<typeof fetch>()
		.mockResolvedValueOnce(
			jsonResponse({
				choices: [
					{
						message: {
							content: null,
							tool_calls: [
								{
									id: 'read-1',
									type: 'function',
									function: { name: 'read_app_data', arguments: '{"section":"grades"}' }
								}
							]
						}
					}
				]
			})
		)
		.mockResolvedValueOnce(jsonResponse(completion('answer')));
	const mesh = new TokenMesh({
		slots: [slot({ key: 'k', id: 's1' })],
		fetchImpl: fetchMock,
		benchJitterMs: 0
	});

	const result = await askMaxDetailed({ courses: [] }, 'how is my average?', { mesh });
	expect(result.text).toBe('answer');

	expect(fetchMock).toHaveBeenCalledTimes(2);
	const [, init] = fetchMock.mock.calls[0]!;
	const payload = JSON.parse(String(init?.body)) as {
		temperature: number;
		model: string;
		messages: { role: string; content: string }[];
	};
	expect(payload.temperature).toBe(MAX_TEMPERATURE);
	expect(payload.model).toBe('test-model');
	expect(payload.messages.map((message) => message.role)).toEqual([
		'system',
		'system',
		'user',
		'system'
	]);
	expect(payload.messages[2]?.content).toBe('how is my average?');
	expect(JSON.parse(String(fetchMock.mock.calls[0]![1]?.body)).tool_choice).toBe('auto');
	const toolRound = JSON.parse(String(fetchMock.mock.calls[1]![1]?.body)).messages;
	expect(toolRound.at(-2).role).toBe('tool');
	expect(toolRound.at(-1).role).toBe('system');
	expect(result.toolsUsed).toEqual(['read_app_data']);
});

test('a 429 is benched and the identical request instantly fails over to the next key', async () => {
	const keysSeen: string[] = [];
	const fetchMock = vi.fn<(url: RequestInfo | URL, init?: RequestInit) => Promise<Response>>(
		async (_url, init) => {
			const authorization =
				(init?.headers as Record<string, string | undefined>)['authorization'] ?? '';
			keysSeen.push(authorization);
			if (authorization === 'Bearer k-one') {
				return jsonResponse({ error: { message: 'rate limited' } }, 429);
			}
			return jsonResponse(completion('from key two'));
		}
	);
	const mesh = new TokenMesh({
		slots: [slot({ key: 'k-one', id: 'one', tier: 1 }), slot({ key: 'k-two', id: 'two', tier: 2 })],
		fetchImpl: fetchMock,
		benchJitterMs: 0
	});

	const result = await mesh.complete({
		temperature: 0.3,
		messages: [{ role: 'user', content: 'q' }]
	});

	expect(result.text).toBe('from key two');
	expect(result.slotId).toBe('two');
	expect(keysSeen).toEqual(['Bearer k-one', 'Bearer k-two']);
	expect(mesh.isBenched('one')).toBe(true);
	expect(mesh.isBenched('two')).toBe(false);
});

test('a dead key earns the long bench and fails over without surfacing an error', async () => {
	const fetchMock = vi
		.fn<typeof fetch>()
		.mockResolvedValueOnce(jsonResponse({ error: { message: 'invalid key' } }, 401))
		.mockResolvedValueOnce(jsonResponse(completion('recovered')));
	const mesh = new TokenMesh({
		slots: [
			slot({ key: 'dead', id: 'dead', tier: 1 }),
			slot({ key: 'alive', id: 'alive', tier: 2 })
		],
		fetchImpl: fetchMock,
		benchJitterMs: 0
	});

	const result = await mesh.complete({
		temperature: 0.3,
		messages: [{ role: 'user', content: 'q' }]
	});

	expect(result.text).toBe('recovered');
	expect(mesh.benchRemaining('dead')).toBeGreaterThan(60_000);
});

test('every key failing surfaces one UpstreamError with per-slot attempts', async () => {
	const fetchMock = vi
		.fn<typeof fetch>()
		.mockResolvedValue(jsonResponse({ error: { message: 'boom' } }, 500));
	const mesh = new TokenMesh({
		slots: [slot({ key: 'a', id: 'a', tier: 1 }), slot({ key: 'b', id: 'b', tier: 2 })],
		fetchImpl: fetchMock,
		benchJitterMs: 0
	});

	const failure = mesh.complete({ temperature: 0.3, messages: [{ role: 'user', content: 'q' }] });
	await expect(failure).rejects.toBeInstanceOf(UpstreamError);
	await expect(failure).rejects.toMatchObject({
		name: 'UpstreamError',
		attempts: [
			{ slotId: 'a', kind: 'server' },
			{ slotId: 'b', kind: 'server' }
		]
	});
});

test.each([undefined, 0])(
	'parallel streamed calls keep distinct IDs when indexes are %s',
	async (index) => {
		const calls = ['gpa', 'grades', 'attendance'].map((section, position) => ({
			...(index === undefined ? {} : { index }),
			id: `parallel-${position}`,
			function: { name: 'read_app_data', arguments: JSON.stringify({ section }) },
			...(position === 0
				? { extra_content: { google: { thought_signature: 'synthetic-signature' } } }
				: {})
		}));
		const fetchImpl = vi
			.fn<(url: RequestInfo | URL, init?: RequestInit) => Promise<Response>>()
			.mockResolvedValue(
				new Response(
					`data: ${JSON.stringify({ choices: [{ delta: { tool_calls: calls }, finish_reason: 'tool_calls' }] })}\n\ndata: [DONE]\n\n`,
					{ headers: { 'content-type': 'text/event-stream' } }
				)
			);
		const result = await new TokenMesh({
			slots: [slot({ key: 'synthetic-key', id: 'parallel' })],
			fetchImpl
		}).completeStream({ messages: [] }, () => {});
		expect(result.toolCalls).toHaveLength(3);
		expect(result.toolCalls?.map((call) => call.id)).toEqual(calls.map((call) => call.id));
		expect(result.toolCalls?.map((call) => call.function)).toEqual(
			calls.map((call) => call.function)
		);
		expect(result.toolCalls?.[0]?.extra_content).toEqual(calls[0]?.extra_content);
	}
);

test.each([false, true])(
	'OpenRouter free capacity fallback stays free and reports the model used (stream=%s)',
	async (stream) => {
		const fetchImpl = vi.fn<(url: RequestInfo | URL, init?: RequestInit) => Promise<Response>>(
			async (_url, init) => {
				const request = JSON.parse(String(init?.body));
				expect(request.models).toEqual([
					'primary/model:free',
					'cohere/north-mini-code:free',
					'openrouter/free'
				]);
				return jsonResponse({
					model: 'available/model:free',
					choices: [{ message: { content: 'Available reply' } }]
				});
			}
		);
		const mesh = new TokenMesh({
			slots: [
				slot({
					provider: 'openrouter',
					key: 'synthetic-key',
					id: 'fallback',
					model: 'primary/model:free'
				})
			],
			fetchImpl
		});
		const result = stream
			? await mesh.completeStream({ messages: [] }, () => {})
			: await mesh.complete({ messages: [] });
		expect(result.model).toBe('available/model:free');
		expect(result.text).toBe('Available reply');
	}
);

test('completeStream assembles SSE deltas and reports provider metadata', async () => {
	const encoder = new TextEncoder();
	const frames = [
		'data: {"choices":[{"delta":{"content":"Hi"}}]}\n\n',
		'data: {"choices":[{"delta":{"content":" there"}}]}\n\n',
		'data: {"usage":{"total_tokens":5},"choices":[{"delta":{}}]}\n\n',
		'data: [DONE]\n\n'
	];
	const stream = new ReadableStream<Uint8Array>({
		start(controller) {
			for (const frame of frames) controller.enqueue(encoder.encode(frame));
			controller.close();
		}
	});
	const fetchMock = vi
		.fn<typeof fetch>()
		.mockResolvedValue(
			new Response(stream, { status: 200, headers: { 'content-type': 'text/event-stream' } })
		);
	const mesh = new TokenMesh({
		slots: [slot({ key: 'k', id: 'streamer' })],
		fetchImpl: fetchMock,
		benchJitterMs: 0
	});

	const chunks: string[] = [];
	const result = await mesh.completeStream(
		{ temperature: 0.3, messages: [{ role: 'user', content: 'q' }] },
		(chunk) => chunks.push(chunk)
	);

	expect(chunks).toEqual(['Hi', ' there']);
	expect(result.text).toBe('Hi there');
	expect(result.usage).toEqual({ total_tokens: 5 });
	expect(result.slotId).toBe('streamer');

	const [, init] = fetchMock.mock.calls[0]!;
	expect(JSON.parse(String(init?.body)).stream).toBe(true);
});

test('invalid slot errors cannot disclose configured keys', () => {
	expect(
		() => new TokenMesh({ slots: [slot({ key: 'synthetic-secret-key', id: 'bad', baseUrl: '' })] })
	).toThrow('invalid key slot configuration');
});

test('HTTP error bodies cannot stall failover after response headers', async () => {
	const fetchMock = vi
		.fn<typeof fetch>()
		.mockResolvedValueOnce(new Response(new ReadableStream({ start() {} }), { status: 429 }))
		.mockResolvedValueOnce(jsonResponse(completion('fallback')));
	const mesh = new TokenMesh({
		slots: [slot({ key: 'a', id: 'a' }), slot({ key: 'b', id: 'b' })],
		fetchImpl: fetchMock,
		random: () => 0.99,
		benchJitterMs: 0
	});
	await expect(
		mesh.complete({ messages: [{ role: 'user', content: 'hi' }] })
	).resolves.toMatchObject({ text: 'fallback' });
});

test('an empty HTTP 200 answer fails over to a useful response', async () => {
	const fetchMock = vi
		.fn<typeof fetch>()
		.mockResolvedValueOnce(jsonResponse({ choices: [] }))
		.mockResolvedValueOnce(jsonResponse(completion('useful answer')));
	const mesh = new TokenMesh({
		slots: [slot({ key: 'a', id: 'a' }), slot({ key: 'b', id: 'b' })],
		fetchImpl: fetchMock,
		random: () => 0.99
	});
	await expect(
		mesh.complete({ messages: [{ role: 'user', content: 'hi' }] })
	).resolves.toMatchObject({ text: 'useful answer' });
	expect(fetchMock).toHaveBeenCalledTimes(2);
});

test('a provider stream ending mid-answer never becomes a completed answer', async () => {
	const fetchMock = vi
		.fn<typeof fetch>()
		.mockResolvedValue(new Response('data: {"choices":[{"delta":{"content":"Partial"}}]}\n\n'));
	const mesh = new TokenMesh({ slots: [slot({ key: 'a', id: 'a' })], fetchImpl: fetchMock });
	const onToken = vi.fn();
	await expect(mesh.completeStream({ messages: [] }, onToken)).rejects.toMatchObject({
		name: 'UpstreamError'
	});
	expect(onToken).toHaveBeenCalledWith('Partial');
	expect(fetchMock).toHaveBeenCalledTimes(1);
});

test('a final provider frame without a newline is retained', async () => {
	const fetchMock = vi
		.fn<typeof fetch>()
		.mockResolvedValue(
			new Response('data: {"choices":[{"delta":{"content":"Complete"}}]}\n\ndata: [DONE]')
		);
	const mesh = new TokenMesh({ slots: [slot({ key: 'a', id: 'a' })], fetchImpl: fetchMock });
	await expect(mesh.completeStream({ messages: [] }, () => {})).resolves.toMatchObject({
		text: 'Complete'
	});
});

test('a completely benched application pool offers retry instead of waiting a minute', async () => {
	const { createMeshFromEnv } = await import('$lib/server/max/config');
	const sleep = vi.fn(async () => {});
	const mesh = createMeshFromEnv({ GROQ_API_KEYS: 'synthetic-only' }, { sleep });
	mesh.bench('groq-1', 60_000);
	await expect(
		mesh.complete({ messages: [{ role: 'user', content: 'hi' }] })
	).rejects.toMatchObject({ name: 'PoolExhaustedError' });
	expect(sleep).not.toHaveBeenCalled();
});

test('both Gemini keys use Lite first and all Google models precede other providers', async () => {
	const { createPoolFromEnv } = await import('$lib/server/max/config');
	const pool = createPoolFromEnv({
		GEMINI_API_KEYS: 'synthetic-one,synthetic-two',
		GROQ_API_KEYS: 'synthetic-groq',
		OPENROUTER_API_KEYS: 'synthetic-router',
		MISTRAL_API_KEYS: 'synthetic-mistral'
	});
	for (const key of ['synthetic-one', 'synthetic-two']) {
		expect(
			pool.filter((slot) => slot.key === key).map(({ model, tier }) => ({ model, tier }))
		).toEqual([
			{ model: 'gemini-3.5-flash-lite', tier: 1 },
			{ model: 'gemini-3.1-flash-lite', tier: 2 },
			{ model: 'gemini-3.8-flash', tier: 3 },
			{ model: 'gemini-2.5-flash', tier: 4 }
		]);
	}
	expect(pool.filter((slot) => slot.provider !== 'gemini').every((slot) => slot.tier === 5)).toBe(
		true
	);
	expect(new Set(pool.map((slot) => slot.id)).size).toBe(pool.length);
});

test.each(['gemini-3.5-flash', 'gemini-3.8-flash', 'gemini-2.5-flash'])(
	'old environment override %s cannot keep low-quota Flash primary',
	async (model) => {
		const { createPoolFromEnv } = await import('$lib/server/max/config');
		const pool = createPoolFromEnv({ GEMINI_API_KEYS: 'synthetic-only', GEMINI_MODEL: model });
		expect(pool[0]).toMatchObject({ model: 'gemini-3.5-flash-lite', tier: 1 });
	}
);

test.each([false, true])(
	'priority Google keys precede existing keys at every model, before other providers (stream=%s)',
	async (stream) => {
		const { createMeshFromEnv } = await import('$lib/server/max/config');
		const tried: { model: string; key: string }[] = [];
		const fetchImpl = vi.fn<(url: RequestInfo | URL, init?: RequestInit) => Promise<Response>>(
			async (_url, init) => {
				const body = JSON.parse(String(init?.body));
				tried.push({ model: body.model, key: new Headers(init?.headers).get('authorization')! });
				if (body.model.startsWith('gemini-')) return new Response('{}', { status: 429 });
				return jsonResponse(completion('Recovered'));
			}
		);
		const mesh = createMeshFromEnv(
			{
				GEMINI_PRIORITY_API_KEYS: 'new-one,new-two,new-three,new-four,new-one',
				GEMINI_API_KEYS: 'old-one,old-two,new-one,old-one',
				GROQ_API_KEYS: 'synthetic-groq'
			},
			{ fetchImpl, random: () => 0.99, benchJitterMs: 0 }
		);
		const result = stream
			? await mesh.completeStream({ messages: [] }, () => {})
			: await mesh.complete({ messages: [] });
		expect(result).toMatchObject({ text: 'Recovered', provider: 'groq' });
		const models = [
			'gemini-3.5-flash-lite',
			'gemini-3.1-flash-lite',
			'gemini-3.8-flash',
			'gemini-2.5-flash'
		];
		for (const [index, model] of models.entries()) {
			const group = tried.slice(index * 6, index * 6 + 6);
			expect(group.every((attempt) => attempt.model === model)).toBe(true);
			expect(group.map((attempt) => attempt.key)).toEqual([
				'Bearer new-one',
				'Bearer new-two',
				'Bearer new-three',
				'Bearer new-four',
				'Bearer old-one',
				'Bearer old-two'
			]);
		}
		expect(tried).toHaveLength(25);
		expect(new Set(mesh.slots.map((slot) => slot.id)).size).toBe(mesh.slots.length);
	}
);

test('priority-only configuration can run without legacy Google keys', async () => {
	const { createPoolFromEnv } = await import('$lib/server/max/config');
	const pool = createPoolFromEnv({ GEMINI_PRIORITY_API_KEYS: 'new-only' });
	expect(pool).toHaveLength(4);
	expect(pool[0]).toMatchObject({ key: 'new-only', model: 'gemini-3.5-flash-lite', tier: 1 });
});

test.each([false, true])(
	'waterfall continues through every Google key/model on failure (stream=%s)',
	async (stream) => {
		const { createMeshFromEnv } = await import('$lib/server/max/config');
		const failures = [429, 401, 503, 404, 'network', 'empty', 429, 500];
		const tried: { model: string; key: string }[] = [];
		const fetchImpl = vi.fn<(url: RequestInfo | URL, init?: RequestInit) => Promise<Response>>(
			async (_url, init) => {
				const body = JSON.parse(String(init?.body));
				tried.push({ model: body.model, key: new Headers(init?.headers).get('authorization')! });
				const failure = failures[tried.length - 1];
				if (failure === 'network') throw new TypeError('Synthetic network failure');
				if (failure === 'empty') return jsonResponse({ choices: [] });
				if (typeof failure === 'number') return new Response('{}', { status: failure });
				return stream
					? new Response(
							'data: {"choices":[{"delta":{"content":"Recovered"}}]}\n\ndata: [DONE]\n\n',
							{ headers: { 'content-type': 'text/event-stream' } }
						)
					: jsonResponse(completion('Recovered'));
			}
		);
		const mesh = createMeshFromEnv(
			{
				GEMINI_API_KEYS: 'synthetic-one,synthetic-two',
				GROQ_API_KEYS: 'synthetic-groq'
			},
			{ fetchImpl, random: () => 0.99, benchJitterMs: 0 }
		);
		const chunks: string[] = [];
		const result = stream
			? await mesh.completeStream({ messages: [] }, (chunk) => chunks.push(chunk))
			: await mesh.complete({ messages: [] });
		expect(result).toMatchObject({ text: 'Recovered', provider: 'groq' });
		expect(tried.map((attempt) => attempt.model)).toEqual([
			'gemini-3.5-flash-lite',
			'gemini-3.5-flash-lite',
			'gemini-3.1-flash-lite',
			'gemini-3.1-flash-lite',
			'gemini-3.8-flash',
			'gemini-3.8-flash',
			'gemini-2.5-flash',
			'gemini-2.5-flash',
			'openai/gpt-oss-120b'
		]);
		for (let index = 0; index < 8; index += 2) {
			expect(new Set(tried.slice(index, index + 2).map((attempt) => attempt.key)).size).toBe(2);
		}
		if (stream) expect(chunks.join('')).toBe('Recovered');
	}
);

test('rate-limited primary slots stay benched while healthy Google fallbacks keep answering', async () => {
	const { createMeshFromEnv } = await import('$lib/server/max/config');
	const tried: string[] = [];
	const mesh = createMeshFromEnv(
		{ GEMINI_API_KEYS: 'synthetic-one,synthetic-two', GROQ_API_KEYS: 'synthetic-groq' },
		{
			random: () => 0.99,
			benchJitterMs: 0,
			fetchImpl: vi.fn<(url: RequestInfo | URL, init?: RequestInit) => Promise<Response>>(
				async (_url, init) => {
					const model = JSON.parse(String(init?.body)).model;
					tried.push(model);
					return model === 'gemini-3.5-flash-lite'
						? new Response('{}', { status: 429, headers: { 'retry-after': '3600' } })
						: jsonResponse(completion('Google fallback'));
				}
			)
		}
	);
	for (let index = 0; index < 2; index++) {
		await expect(mesh.complete({ messages: [] })).resolves.toMatchObject({
			provider: 'gemini',
			text: 'Google fallback'
		});
	}
	expect(tried).toEqual([
		'gemini-3.5-flash-lite',
		'gemini-3.5-flash-lite',
		'gemini-3.1-flash-lite',
		'gemini-3.1-flash-lite'
	]);
});

test('rate limits preserve the provider Retry-After instead of forcing sixty seconds', async () => {
	const fetchImpl = vi
		.fn<(url: RequestInfo | URL, init?: RequestInit) => Promise<Response>>()
		.mockResolvedValueOnce(new Response('{}', { status: 429, headers: { 'retry-after': '7' } }))
		.mockResolvedValueOnce(jsonResponse(completion('Fallback reply')));
	const mesh = new TokenMesh({
		slots: [
			slot({ key: 'first', id: 'first', tier: 1 }),
			slot({ key: 'second', id: 'second', tier: 2 })
		],
		fetchImpl,
		benchJitterMs: 0
	});
	await expect(mesh.complete({ messages: [] })).resolves.toMatchObject({ text: 'Fallback reply' });
	expect(mesh.benchRemaining('first')).toBeGreaterThan(5000);
	expect(mesh.benchRemaining('first')).toBeLessThanOrEqual(7000);
});

test('a pooled model names chats with bounded snippets and cleaned output', async () => {
	const { generateChatTitle, MAX_TITLE_PROMPT } = await import('$lib/server/max/max');
	const mesh = fakeMesh();
	vi.mocked(mesh.complete).mockResolvedValue({
		text: '<think>reasoning</think>\nTitle: **Biology Final Target.**',
		provider: 'groq',
		model: 'test',
		slotId: '1',
		usage: null
	});
	const result = await generateChatTitle('Biology '.repeat(80), 'Reply '.repeat(80), { mesh });
	expect(result).toMatchObject({ title: 'Biology Final Target', provider: 'groq' });
	const payload = vi.mocked(mesh.complete).mock.calls[0]![0];
	expect(payload.messages[0]?.content).toBe(MAX_TITLE_PROMPT);
	expect(payload.messages[1]?.content.length).toBeLessThan(620);
	expect(payload.tools).toBeUndefined();
	vi.mocked(mesh.complete).mockRejectedValue(new Error('unavailable'));
	expect((await generateChatTitle('My biology final goal', '', { mesh })).title).toBe(
		'My biology final goal'
	);
});
