import { demoSession, setSchoologySession } from '$lib/server/schoology-session';
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request, cookies }) => {
	if (request.headers.get('origin') !== new URL(request.url).origin)
		return json({ message: 'The demo request could not be verified.' }, { status: 403 });
	await setSchoologySession(cookies, demoSession('fictional-demo'));
	return json({ ok: true });
};
