import { appendFeedbackMessage } from '$lib/server/feedback';
import { getStudentSession, sessionCookie } from '$lib/server/student-session';
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ cookies, params, platform, request, url }) => {
	try {
		getStudentSession(cookies.get(sessionCookie));
	} catch {
		return json({ message: 'Sign in before sending feedback.' }, { status: 401 });
	}
	const token = url.searchParams.get('token') ?? '';
	if (!/^[A-Za-z0-9_-]{43}$/.test(token) || !/^[0-9a-f-]{36}$/i.test(params.id))
		return json({ message: 'Conversation not found.' }, { status: 404 });
	let input: { message?: unknown };
	try {
		input = (await request.json()) as typeof input;
	} catch {
		return json({ message: 'Invalid message.' }, { status: 400 });
	}
	const message = typeof input.message === 'string' ? input.message.trim() : '';
	if (message.length < 3 || message.length > 2_000)
		return json({ message: 'Write between 3 and 2,000 characters.' }, { status: 400 });
	const result = await appendFeedbackMessage(platform, params.id, message, 'student', token);
	if (result === undefined)
		return json({ message: 'Feedback storage is not configured.' }, { status: 503 });
	if (!result) return json({ message: 'Conversation not found or full.' }, { status: 404 });
	return json(result, { status: 201, headers: { 'Cache-Control': 'private, no-store' } });
};
