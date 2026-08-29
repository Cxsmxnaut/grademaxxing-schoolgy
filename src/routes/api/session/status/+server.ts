import {
	clientSessionHeader,
	getStudentSession,
	requireStudentSessionContext,
	sessionCookie
} from '$lib/server/student-session';
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = ({ cookies, request }) => {
	try {
		const session = getStudentSession(cookies.get(sessionCookie));
		requireStudentSessionContext(session, request.headers.get(clientSessionHeader));
		return json({ signedIn: true, username: session.username, domain: session.domain });
	} catch {
		return json({ signedIn: false });
	}
};
