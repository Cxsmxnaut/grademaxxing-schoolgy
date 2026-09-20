import { getFeedbackForReceipt } from '$lib/server/feedback';
import { getStudentSession, sessionCookie } from '$lib/server/student-session';
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ cookies, params, platform, url }) => {
	try {
		getStudentSession(cookies.get(sessionCookie));
	} catch {
		return json({ message: 'Sign in before checking feedback.' }, { status: 401 });
	}
	const replyToken = url.searchParams.get('token') ?? '';
	if (!/^[A-Za-z0-9_-]{43}$/.test(replyToken) || !/^[0-9a-f-]{36}$/i.test(params.id))
		return json({ message: 'Feedback receipt not found.' }, { status: 404 });
	const item = await getFeedbackForReceipt(platform, params.id, replyToken);
	if (item === undefined)
		return json({ message: 'Feedback storage is not configured.' }, { status: 503 });
	if (!item) return json({ message: 'Feedback receipt not found.' }, { status: 404 });
	return json(item, { headers: { 'Cache-Control': 'private, no-store, max-age=0' } });
};
