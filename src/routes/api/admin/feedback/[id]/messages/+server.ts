import { adminSessionCookie, validAdminSession } from '$lib/server/admin/auth';
import { appendFeedbackMessage } from '$lib/server/feedback';
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ cookies, params, platform, request }) => {
	if (!validAdminSession(cookies.get(adminSessionCookie)))
		return json({ message: 'Administrator sign-in required.' }, { status: 401 });
	if (!/^[0-9a-f-]{36}$/i.test(params.id))
		return json({ message: 'Conversation not found.' }, { status: 404 });
	let input: { message?: unknown };
	try {
		input = (await request.json()) as typeof input;
	} catch {
		return json({ message: 'Invalid message.' }, { status: 400 });
	}
	const message = typeof input.message === 'string' ? input.message.trim() : '';
	if (!message || message.length > 2_000)
		return json({ message: 'Write between 1 and 2,000 characters.' }, { status: 400 });
	const result = await appendFeedbackMessage(platform, params.id, message, 'admin');
	if (result === undefined)
		return json({ message: 'Feedback storage is not configured.' }, { status: 503 });
	if (!result) return json({ message: 'Conversation not found or full.' }, { status: 404 });
	return json(result, { status: 201, headers: { 'Cache-Control': 'private, no-store' } });
};
