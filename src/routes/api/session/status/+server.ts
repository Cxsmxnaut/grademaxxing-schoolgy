import { dev } from '$app/environment';
import { recordUniqueStudentUsage } from '$lib/server/analytics/usage';
import {
	clientSessionHeader,
	getStudentSession,
	requireStudentSessionContext,
	serializeStudentSession,
	sessionCookie,
	sessionMaxAge
} from '$lib/server/student-session';
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ cookies, request, platform }) => {
	try {
		const session = getStudentSession(cookies.get(sessionCookie));
		requireStudentSessionContext(session, request.headers.get(clientSessionHeader));
		// A valid returning app session is real usage even when the student does not
		// need to type their password again. The daily primary key makes this idempotent.
		await recordUniqueStudentUsage(platform, session.domain, session.username).catch(
			() => undefined
		);
		cookies.set(sessionCookie, serializeStudentSession(session), {
			path: '/',
			httpOnly: true,
			sameSite: 'lax',
			secure: !dev,
			maxAge: sessionMaxAge
		});
		return json({ signedIn: true, username: session.username, domain: session.domain });
	} catch {
		return json({ signedIn: false });
	}
};
