import { setDefaultMesh } from '$lib/server/max/max';
import { TokenMesh, type MeshResult } from '$lib/server/max/tokenMesh';
import { sessionCookie } from '$lib/server/student-session';
import { afterEach, expect, test, vi } from 'vitest';
import { POST } from '../routes/api/max/+server';

vi.mock('$lib/server/student-session', () => ({
	sessionCookie: 'grademaxxing_session',
	getStudentSession: vi.fn((token: string | undefined) => {
		if (token !== 'valid-session') throw new Error('invalid session');
		return { sessionId: 'test-session' };
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
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(body)
		}),
		cookies: { get: (name: string) => (name === sessionCookie ? token : undefined) },
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
		complete: vi.fn(async () => value),
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
		request: new Request('https://grademaxxing.app/api/max', { method: 'POST', body: 'not json' }),
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
		text: 'aim for a 93.5% on the final',
		provider: 'groq',
		model: 'test-model',
		usage: null
	});
	expect(mesh.complete).toHaveBeenCalledTimes(1);
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
