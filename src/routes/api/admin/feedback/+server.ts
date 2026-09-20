import { adminSessionCookie, validAdminSession } from '$lib/server/admin/auth';
import {
	feedbackStatuses,
	listFeedback,
	updateFeedback,
	type FeedbackStatus
} from '$lib/server/feedback';
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

function authorized(cookies: Parameters<RequestHandler>[0]['cookies']) {
	return validAdminSession(cookies.get(adminSessionCookie));
}

export const GET: RequestHandler = async ({ cookies, platform }) => {
	if (!authorized(cookies))
		return json({ message: 'Administrator sign-in required.' }, { status: 401 });
	const items = await listFeedback(platform);
	if (!items) return json({ message: 'Feedback storage is not configured.' }, { status: 503 });
	return json({ items }, { headers: { 'Cache-Control': 'private, no-store, max-age=0' } });
};

export const PATCH: RequestHandler = async ({ cookies, platform, request }) => {
	if (!authorized(cookies))
		return json({ message: 'Administrator sign-in required.' }, { status: 401 });
	let input: { id?: unknown; status?: unknown; adminNote?: unknown };
	try {
		input = (await request.json()) as typeof input;
	} catch {
		return json({ message: 'Invalid feedback update.' }, { status: 400 });
	}
	const id = typeof input.id === 'string' ? input.id : '';
	const status = input.status;
	const adminNote = typeof input.adminNote === 'string' ? input.adminNote.trim() : '';
	if (!/^[0-9a-f-]{36}$/i.test(id) || !feedbackStatuses.includes(status as FeedbackStatus))
		return json({ message: 'Invalid feedback update.' }, { status: 400 });
	if (adminNote.length > 1_000)
		return json({ message: 'Admin notes must be 1,000 characters or fewer.' }, { status: 400 });
	const updated = await updateFeedback(platform, id, status as FeedbackStatus, adminNote);
	if (updated === undefined)
		return json({ message: 'Feedback storage is not configured.' }, { status: 503 });
	if (!updated) return json({ message: 'Feedback item not found.' }, { status: 404 });
	return new Response(null, { status: 204 });
};
