import { dev } from '$app/environment';
import { recordUniqueStudentUsage } from '$lib/server/analytics/usage';
import { Pxp2AuthenticationError, Pxp2InputError, Pxp2TimeoutError } from '$lib/server/pxp2';
import {
	createStudentSession,
	deleteStudentSession,
	sessionCookie,
	sessionMaxAge,
	StudentSessionCapacityError,
	StudentSessionConfigurationError
} from '$lib/server/student-session';
import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

const WINDOW_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS_PER_IP_AND_ACCOUNT = 8;
const MAX_ATTEMPTS_PER_ACCOUNT = 20;
const MAX_ATTEMPTS_PER_IP = 50;
const MAX_ACTIVE_LOGINS_PER_ACCOUNT = 2;
const MAX_ACTIVE_LOGINS = 32;
const MAX_ATTEMPT_ENTRIES = 10_000;
const attempts = new Map<string, { count: number; resetAt: number }>();
const activeLogins = new Map<string, number>();
let activeLoginCount = 0;

export const POST: RequestHandler = async ({ request, cookies, getClientAddress, platform }) => {
	const rawBody = await request.text();
	if (new TextEncoder().encode(rawBody).byteLength > 16 * 1024)
		throw error(413, 'Request body is too large.');
	const body = (() => {
		try {
			return JSON.parse(rawBody) as { domain?: unknown; username?: unknown; password?: unknown };
		} catch {
			return undefined;
		}
	})();
	if (
		!body ||
		typeof body.domain !== 'string' ||
		typeof body.username !== 'string' ||
		typeof body.password !== 'string'
	)
		throw error(400, 'A district URL, username, and password are required.');
	const domain = body.domain.trim();
	const username = body.username.trim();
	if (
		!domain ||
		domain.length > 253 ||
		!username ||
		username.length > 254 ||
		!body.password ||
		body.password.length > 1024
	)
		throw error(400, 'A valid district URL, username, and password are required.');
	const clientAddress = safeClientAddress(getClientAddress);
	const accountKey = `${domain.toLowerCase()}:${username.toLowerCase()}`;
	const ipAndAccountAttemptKey = `pair:${clientAddress}:${accountKey}`;
	const accountAttemptKey = `account:${accountKey}`;
	const ipAttemptKey = `ip:${clientAddress}`;
	checkRateLimit(
		ipAndAccountAttemptKey,
		MAX_ATTEMPTS_PER_IP_AND_ACCOUNT,
		'Too many failed sign-in attempts. Please wait ten minutes and try again.'
	);
	checkRateLimit(
		accountAttemptKey,
		MAX_ATTEMPTS_PER_ACCOUNT,
		'Too many failed sign-in attempts for this account. Please wait ten minutes and try again.'
	);
	checkRateLimit(
		ipAttemptKey,
		MAX_ATTEMPTS_PER_IP,
		'Too many failed sign-in attempts from this network. Please wait ten minutes and try again.'
	);
	const active = activeLogins.get(accountKey) ?? 0;
	if (active >= MAX_ACTIVE_LOGINS_PER_ACCOUNT)
		throw error(429, 'Too many sign-in requests are in progress. Please wait and try again.');
	if (activeLoginCount >= MAX_ACTIVE_LOGINS)
		throw error(503, 'The sign-in service is busy. Please wait and try again.');
	activeLogins.set(accountKey, active + 1);
	activeLoginCount += 1;
	const previousToken = cookies.get(sessionCookie);
	let session: Awaited<ReturnType<typeof createStudentSession>>;
	try {
		try {
			session = await createStudentSession(domain, username, body.password);
		} catch (cause) {
			if (cause instanceof Pxp2AuthenticationError) {
				recordFailure(ipAndAccountAttemptKey);
				recordFailure(accountAttemptKey);
				recordFailure(ipAttemptKey);
				throw error(401, cause.message);
			}
			if (cause instanceof Pxp2InputError) throw error(400, cause.message);
			if (cause instanceof Pxp2TimeoutError) throw error(504, cause.message);
			if (cause instanceof StudentSessionCapacityError) throw error(503, cause.message);
			if (cause instanceof StudentSessionConfigurationError) throw error(503, cause.message);
			throw error(502, cause instanceof Error ? cause.message : 'StudentVUE sign-in failed.');
		}
	} finally {
		const remaining = (activeLogins.get(accountKey) ?? 1) - 1;
		if (remaining > 0) activeLogins.set(accountKey, remaining);
		else activeLogins.delete(accountKey);
		activeLoginCount = Math.max(0, activeLoginCount - 1);
	}
	attempts.delete(ipAndAccountAttemptKey);
	attempts.delete(accountAttemptKey);
	// Only retire the prior session after replacement authentication succeeds. Failed
	// reauthentication leaves the user's still-valid session intact and successful
	// account switching cannot leak an unreachable entry in the server session map.
	deleteStudentSession(previousToken);
	cookies.set(sessionCookie, session.token, {
		path: '/',
		httpOnly: true,
		sameSite: 'lax',
		secure: !dev,
		maxAge: sessionMaxAge
	});
	// Analytics is deliberately best-effort: a private counter outage can never
	// block StudentVUE sign-in, and no raw identity is stored in the database.
	await recordUniqueStudentUsage(platform, session.domain, session.username).catch(() => undefined);
	return json({
		username: session.username,
		domain: session.domain,
		sessionId: session.clientSessionId
	});
};

export const DELETE: RequestHandler = ({ cookies }) => {
	deleteStudentSession(cookies.get(sessionCookie));
	cookies.delete(sessionCookie, { path: '/' });
	return new Response(null, {
		status: 204,
		headers: { 'Clear-Site-Data': '"cache", "cookies", "storage"' }
	});
};

function safeClientAddress(getClientAddress: () => string) {
	try {
		return getClientAddress().slice(0, 128);
	} catch {
		return 'local';
	}
}
function checkRateLimit(key: string, maximum: number, message: string) {
	const now = Date.now();
	pruneAttempts(now);
	const attempt = attempts.get(key);
	if (attempt && attempt.resetAt > now && attempt.count >= maximum) throw error(429, message);
	if (!attempts.has(key) && attempts.size >= MAX_ATTEMPT_ENTRIES)
		throw error(503, 'Sign-in protection is temporarily at capacity. Please try again shortly.');
}
function recordFailure(key: string) {
	const now = Date.now();
	const current = attempts.get(key);
	attempts.set(
		key,
		current && current.resetAt > now
			? { ...current, count: current.count + 1 }
			: { count: 1, resetAt: now + WINDOW_MS }
	);
}
function pruneAttempts(now: number) {
	for (const [entry, value] of attempts) if (value.resetAt <= now) attempts.delete(entry);
}
