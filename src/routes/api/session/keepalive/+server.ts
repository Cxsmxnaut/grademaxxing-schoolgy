import { dev } from '$app/environment';
import {
	recordStudentVueUpstreamFailure,
	recordUniqueStudentUsage
} from '$lib/server/analytics/usage';
import { Pxp2SessionExpiredError, Pxp2TimeoutError } from '$lib/server/pxp2';
import { RequestTiming, timingRequestHeader } from '$lib/server/request-timing';
import {
	clientSessionHeader,
	getStudentSession,
	requireStudentSessionContext,
	runStudentOperation,
	serializeStudentSession,
	sessionCookie,
	sessionMaxAge,
	StudentOperationAbortedError,
	StudentServiceBusyError,
	StudentSessionBusyError
} from '$lib/server/student-session';
import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ cookies, request, platform, locals }) => {
	let session: ReturnType<typeof getStudentSession>;
	const wantsTiming = request.headers.get(timingRequestHeader) === 'true';
	let timing: RequestTiming | undefined;
	const sessionStartedAt = wantsTiming ? performance.now() : 0;
	try {
		session = getStudentSession(
			cookies.get(sessionCookie),
			wantsTiming ? (span) => timing?.record(span) : undefined
		);
		requireStudentSessionContext(session, request.headers.get(clientSessionHeader));
	} catch (cause) {
		return json(
			{
				code: 'APP_SESSION_INVALID',
				message: cause instanceof Error ? cause.message : 'Sign in to StudentVUE first.'
			},
			{ status: 401 }
		);
	}
	if (wantsTiming) {
		timing = new RequestTiming();
		timing.record({ name: 'session_decode', durationMs: performance.now() - sessionStartedAt });
		locals.requestTiming = timing;
	}
	const respond: typeof json = (data, init) =>
		timing ? timing.measureSync('response_encode', () => json(data, init)) : json(data, init);
	const finishQueue = timing?.start('queue');

	try {
		await runStudentOperation(
			session,
			() => {
				finishQueue?.();
				return session.client.keepAlive();
			},
			request.signal
		);
		const recordUsage = () => recordUniqueStudentUsage(platform, session.domain, session.username);
		await (timing ? timing.measure('usage', recordUsage) : recordUsage()).catch(() => undefined);
		const updatedAt = Date.now();
		const token = timing
			? timing.measureSync('session_encode', () => serializeStudentSession(session))
			: serializeStudentSession(session);
		cookies.set(sessionCookie, token, {
			path: '/',
			httpOnly: true,
			sameSite: 'lax',
			secure: !dev,
			maxAge: sessionMaxAge
		});
		return respond(
			{ signedIn: true, updatedAt },
			{ headers: { 'Cache-Control': 'private, no-store, max-age=0' } }
		);
	} catch (cause) {
		if (cause instanceof StudentOperationAbortedError) throw error(499, cause.message);
		if (cause instanceof StudentSessionBusyError) throw error(429, cause.message);
		if (cause instanceof StudentServiceBusyError) throw error(503, cause.message);
		if (cause instanceof Pxp2SessionExpiredError)
			return respond(
				{
					code: 'UPSTREAM_SESSION_EXPIRED',
					message: 'Reconnect to StudentVUE to update your school data.'
				},
				{ status: 401 }
			);
		if (cause instanceof Pxp2TimeoutError) {
			recordStudentVueUpstreamFailure(platform, 'keepalive', 'portal_timeout');
			throw error(504, cause.message);
		}
		recordStudentVueUpstreamFailure(platform, 'keepalive', 'portal_error');
		throw error(502, cause instanceof Error ? cause.message : 'StudentVUE request failed.');
	} finally {
		finishQueue?.();
	}
};
