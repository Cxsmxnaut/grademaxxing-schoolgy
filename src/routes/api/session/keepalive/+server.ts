import { dev } from '$app/environment';
import { recordStudentVueUpstreamFailure } from '$lib/server/analytics/usage';
import { Pxp2SessionExpiredError, Pxp2TimeoutError } from '$lib/server/pxp2';
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

export const GET: RequestHandler = async ({ cookies, request, platform }) => {
	let session: ReturnType<typeof getStudentSession>;
	try {
		session = getStudentSession(cookies.get(sessionCookie));
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

	try {
		await runStudentOperation(session, () => session.client.keepAlive(), request.signal);
		const updatedAt = Date.now();
		cookies.set(sessionCookie, serializeStudentSession(session), {
			path: '/',
			httpOnly: true,
			sameSite: 'lax',
			secure: !dev,
			maxAge: sessionMaxAge
		});
		return json(
			{ signedIn: true, updatedAt },
			{ headers: { 'Cache-Control': 'private, no-store, max-age=0' } }
		);
	} catch (cause) {
		if (cause instanceof StudentOperationAbortedError) throw error(499, cause.message);
		if (cause instanceof StudentSessionBusyError) throw error(429, cause.message);
		if (cause instanceof StudentServiceBusyError) throw error(503, cause.message);
		if (cause instanceof Pxp2SessionExpiredError)
			return json(
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
	}
};
