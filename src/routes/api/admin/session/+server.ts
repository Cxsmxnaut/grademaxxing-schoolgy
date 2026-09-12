import {
	adminSessionCookie,
	adminSessionMaxAge,
	createAdminSession,
	verifyAdminPassword
} from '$lib/server/admin/auth';
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request, cookies }) => {
	const raw = await request.text();
	if (new TextEncoder().encode(raw).byteLength > 2048)
		return json({ message: 'Invalid administrator password.' }, { status: 400 });
	let password: unknown;
	try {
		password = (JSON.parse(raw) as { password?: unknown }).password;
	} catch {
		return json({ message: 'Invalid administrator password.' }, { status: 400 });
	}
	if (typeof password !== 'string' || !verifyAdminPassword(password))
		return json({ message: 'Invalid administrator password.' }, { status: 401 });
	const session = createAdminSession();
	if (!session)
		return json({ message: 'Administrator dashboard is not configured.' }, { status: 503 });
	cookies.set(adminSessionCookie, session, {
		path: '/',
		httpOnly: true,
		sameSite: 'strict',
		// Local Cloudflare preview is HTTP; production custom domains are HTTPS.
		secure: new URL(request.url).protocol === 'https:',
		maxAge: adminSessionMaxAge
	});
	return new Response(null, { status: 204 });
};

export const DELETE: RequestHandler = ({ cookies }) => {
	cookies.delete(adminSessionCookie, { path: '/' });
	return new Response(null, { status: 204 });
};
