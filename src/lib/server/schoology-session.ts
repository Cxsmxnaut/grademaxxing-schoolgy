import { dev } from '$app/environment';
import type { Cookies } from '@sveltejs/kit';
import type {
	AuthorizationStart,
	OAuthToken,
	PendingAuthorization
} from '../../../packages/schoology-connector/dist/index.js';

const SESSION_TTL_MS = 12 * 60 * 60 * 1000;
const COOKIE = dev ? 'grademaxxing_schoology' : '__Host-grademaxxing_schoology';

export type SchoologySession = {
	v: 1;
	kind: 'pending' | 'oauth' | 'demo';
	districtId: string;
	expiresAt: number;
	pending?: PendingAuthorization;
	token?: OAuthToken;
};

// The browser receives only this opaque random identifier. OAuth tokens and
// request-token secrets remain in this server-only store, never in a cookie,
// page payload, or browser storage.
const sessions = new Map<string, SchoologySession>();
const MAX_SESSIONS = 10_000;

function pruneSessions(now = Date.now()) {
	for (const [id, session] of sessions) if (session.expiresAt <= now) sessions.delete(id);
}

export function readSchoologySession(id: string | undefined): SchoologySession | null {
	if (!id || !/^[a-f\d]{32}$/u.test(id)) return null;
	pruneSessions();
	return sessions.get(id) ?? null;
}

export function setSchoologySession(cookies: Cookies, session: SchoologySession) {
	pruneSessions();
	const priorId = cookies.get(COOKIE);
	if (priorId) sessions.delete(priorId);
	if (sessions.size >= MAX_SESSIONS)
		throw new Error(
			'Schoology local session capacity is full. Restart the local server and try again.'
		);
	const id = crypto.randomUUID().replaceAll('-', '');
	sessions.set(id, session);
	cookies.set(COOKIE, id, {
		path: '/',
		httpOnly: true,
		sameSite: 'lax',
		secure: !dev,
		maxAge: Math.floor((session.expiresAt - Date.now()) / 1000)
	});
}

export function getSchoologyCookie(cookies: Cookies) {
	return cookies.get(COOKIE);
}

export function clearSchoologySession(cookies: Cookies) {
	const id = cookies.get(COOKIE);
	if (id) sessions.delete(id);
	cookies.delete(COOKIE, { path: '/' });
}

export function pendingSession(districtId: string, start: AuthorizationStart): SchoologySession {
	return {
		v: 1,
		kind: 'pending',
		districtId,
		pending: start.pending,
		expiresAt: Date.now() + 10 * 60 * 1000
	};
}

export function oauthSession(districtId: string, token: OAuthToken): SchoologySession {
	return { v: 1, kind: 'oauth', districtId, token, expiresAt: Date.now() + SESSION_TTL_MS };
}

export function demoSession(districtId: string): SchoologySession {
	return { v: 1, kind: 'demo', districtId, expiresAt: Date.now() + SESSION_TTL_MS };
}
