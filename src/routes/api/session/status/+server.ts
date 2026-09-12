import { dev } from '$app/environment';
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

export const GET: RequestHandler = ({ cookies, request }) => {
	try {
		const session = getStudentSession(cookies.get(sessionCookie));
		requireStudentSessionContext(session, request.headers.get(clientSessionHeader));
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
