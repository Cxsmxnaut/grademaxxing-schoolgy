import {
	adminSessionCookie,
	adminSessionMaxAge,
	createAdminSession,
	verifyAdminPassword
} from '$lib/server/admin/auth';
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILED_ATTEMPTS = 5;
const attempts = new Map<string, { count: number; resetAt: number }>();

export const POST: RequestHandler = async ({ request, cookies, getClientAddress }) => {
	const clientAddress = safeClientAddress(getClientAddress);
	const attempt = attempts.get(clientAddress);
	if (attempt && attempt.resetAt > Date.now() && attempt.count >= MAX_FAILED_ATTEMPTS)
		return json(
			{ message: 'Too many failed attempts. Please wait fifteen minutes and try again.' },
			{
				status: 429,
				headers: { 'Retry-After': String(Math.ceil((attempt.resetAt - Date.now()) / 1000)) }
			}
		);
	const raw = await request.text();
	if (new TextEncoder().encode(raw).byteLength > 2048)
		return json({ message: 'Invalid administrator password.' }, { status: 400 });
	let password: unknown;
	try {
		password = (JSON.parse(raw) as { password?: unknown }).password;
	} catch {
		return json({ message: 'Invalid administrator password.' }, { status: 400 });
	}
	if (typeof password !== 'string' || !verifyAdminPassword(password)) {
		recordFailure(clientAddress);
		return json({ message: 'Invalid administrator password.' }, { status: 401 });
	}
	attempts.delete(clientAddress);
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

function safeClientAddress(getClientAddress: () => string) {
	try {
		return getClientAddress().slice(0, 128);
	} catch {
		return 'local';
	}
}

function recordFailure(clientAddress: string) {
	const now = Date.now();
	const current = attempts.get(clientAddress);
	attempts.set(
		clientAddress,
		current && current.resetAt > now
			? { ...current, count: current.count + 1 }
			: { count: 1, resetAt: now + WINDOW_MS }
	);
}
