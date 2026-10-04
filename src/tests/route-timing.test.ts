import { Pxp2Client } from '$lib/server/pxp2';
import { RequestTiming, timingRequestHeader } from '$lib/server/request-timing';
import {
	clientSessionHeader,
	serializeStudentSession,
	sessionCookie,
	type StudentSession
} from '$lib/server/student-session';
import type { RequestEvent } from '@sveltejs/kit';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { handle } from '../hooks.server';
import { GET as keepalive } from '../routes/api/session/keepalive/+server';
import { GET as studentvue } from '../routes/api/studentvue/[resource]/+server';

vi.mock('$app/environment', () => ({ dev: true, browser: false, building: false }));

const fixtureSessionId = 'd9428888-122b-4f22-bc7f-1d95e4097a11';

function syntheticSession(): StudentSession {
	return {
		client: Pxp2Client.resume({
			baseUrl: 'https://synthetic.edupoint.com/',
			cookies: { ASP_NET_SessionId: 'synthetic-upstream-cookie' }
		}),
		clientSessionId: fixtureSessionId,
		username: 'synthetic-test-user',
		domain: 'synthetic.edupoint.com',
		expiresAt: Date.now() + 60_000,
		operationTail: Promise.resolve(),
		queuedOperations: 0
	};
}

function syntheticEvent(
	path = '/api/studentvue/capabilities',
	options: { timing?: string; clientSession?: string | null; cookie?: boolean } = {}
) {
	const headers = new Headers();
	if (options.timing !== undefined) headers.set(timingRequestHeader, options.timing);
	const clientSession =
		options.clientSession === undefined ? fixtureSessionId : options.clientSession;
	if (clientSession !== null) headers.set(clientSessionHeader, clientSession);
	const url = new URL(path, 'https://app.example');
	const token = options.cookie === false ? undefined : serializeStudentSession(syntheticSession());
	const cookies = {
		get: vi.fn((name: string) => (name === sessionCookie ? token : undefined)),
		set: vi.fn()
	};
	return {
		url,
		request: new Request(url, { headers }),
		params: { resource: 'capabilities' },
		locals: {} as App.Locals,
		cookies,
		platform: undefined
	} as unknown as Parameters<typeof studentvue>[0];
}

async function withHook(
	event: ReturnType<typeof syntheticEvent>,
	route: typeof studentvue | typeof keepalive
) {
	const invoke = route as unknown as (event: RequestEvent) => ReturnType<typeof studentvue>;
	return handle({
		event,
		resolve: async (resolvedEvent) => invoke(resolvedEvent)
	});
}

beforeEach(() => {
	vi.stubGlobal(
		'fetch',
		vi.fn(() => {
			throw new Error('Timing route tests must not make network requests.');
		})
	);
});

afterEach(() => {
	expect(fetch).not.toHaveBeenCalled();
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
});

test.each([undefined, 'false', 'TRUE'])(
	'resource timing requires the exact opt-in header %s',
	async (timing) => {
		const event = syntheticEvent(undefined, { timing });
		const response = await withHook(event, studentvue);
		expect(response.status).toBe(200);
		expect(event.locals.requestTiming).toBeUndefined();
		expect(response.headers.get('Server-Timing')).toMatch(/^app;dur=\d+\.\d$/);
	}
);

test('authenticated resource diagnostics reach the hook as fixed numeric spans', async () => {
	const event = syntheticEvent(undefined, { timing: 'true' });
	const response = await withHook(event, studentvue);
	expect(response.status).toBe(200);
	expect(event.locals.requestTiming).toBeInstanceOf(RequestTiming);
	const metrics = response.headers.get('Server-Timing')!;
	for (const name of ['app', 'session_decode', 'queue', 'response_encode', 'session_encode']) {
		expect(metrics).toMatch(new RegExp(`(?:^|, )${name};dur=\\d+\\.\\d(?:,|$)`));
	}
	expect(metrics).not.toMatch(/synthetic|cookie|user|desc=/);
	expect(response.headers.get('Cache-Control')).toBe('private, no-store, max-age=0');
});

test.each([{ clientSession: null }, { clientSession: 'stale-session' }, { cookie: false }])(
	'resource diagnostics never create a collector before authentication succeeds: %o',
	async (options) => {
		const event = syntheticEvent(undefined, { ...options, timing: 'true' });
		await expect(studentvue(event)).rejects.toMatchObject({ status: 401 });
		expect(event.locals.requestTiming).toBeUndefined();
		expect(event.cookies.set).not.toHaveBeenCalled();
	}
);

test('authenticated keepalive diagnostics include queue, usage and cookie work without networking', async () => {
	const keepAlive = vi.spyOn(Pxp2Client.prototype, 'keepAlive').mockResolvedValue(undefined);
	const event = syntheticEvent('/api/session/keepalive', { timing: 'true' });
	const response = await withHook(event, keepalive);
	expect(response.status).toBe(200);
	expect(keepAlive).toHaveBeenCalledOnce();
	expect(event.locals.requestTiming).toBeInstanceOf(RequestTiming);
	const metrics = response.headers.get('Server-Timing')!;
	for (const name of [
		'app',
		'session_decode',
		'queue',
		'usage',
		'session_encode',
		'response_encode'
	]) {
		expect(metrics).toMatch(new RegExp(`(?:^|, )${name};dur=\\d+\\.\\d(?:,|$)`));
	}
});

test('ordinary keepalive does not create a diagnostics collector', async () => {
	vi.spyOn(Pxp2Client.prototype, 'keepAlive').mockResolvedValue(undefined);
	const event = syntheticEvent('/api/session/keepalive');
	const response = await withHook(event, keepalive);
	expect(response.status).toBe(200);
	expect(event.locals.requestTiming).toBeUndefined();
	expect(response.headers.get('Server-Timing')).toMatch(/^app;dur=\d+\.\d$/);
});

test.each([{ clientSession: null }, { clientSession: 'stale-session' }, { cookie: false }])(
	'keepalive diagnostics remain disabled for rejected authentication: %o',
	async (options) => {
		const keepAlive = vi.spyOn(Pxp2Client.prototype, 'keepAlive').mockResolvedValue(undefined);
		const event = syntheticEvent('/api/session/keepalive', { ...options, timing: 'true' });
		const response = await withHook(event, keepalive);
		expect(response.status).toBe(401);
		expect(keepAlive).not.toHaveBeenCalled();
		expect(event.locals.requestTiming).toBeUndefined();
		expect(response.headers.get('Server-Timing')).toMatch(/^app;dur=\d+\.\d$/);
		expect(event.cookies.set).not.toHaveBeenCalled();
	}
);

test('the hook preserves existing timing entries and appends diagnostics to handled error responses', async () => {
	const event = syntheticEvent();
	event.locals.requestTiming = new RequestTiming();
	event.locals.requestTiming.record({ name: 'gb_context_network', durationMs: 12.34 });
	const response = await handle({
		event,
		resolve: async () =>
			new Response('invalid query', {
				status: 400,
				headers: { 'Server-Timing': 'existing;dur=3.0' }
			})
	});
	expect(response.status).toBe(400);
	expect(response.headers.get('Server-Timing')).toMatch(
		/^existing;dur=3\.0, app;dur=\d+\.\d, gb_context_network;dur=12\.3$/
	);
});
