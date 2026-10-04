import { markPortalOffline } from '$lib/session.svelte';
import { captureRequestTiming, type RequestTimingCapture } from './refresh-timing';

export class StudentVueSessionExpiredError extends Error {
	readonly code = 'UPSTREAM_SESSION_EXPIRED';
}

export class StudentVueAppSessionInvalidError extends Error {
	readonly code = 'APP_SESSION_INVALID';
}

export class StudentVueAuthenticationError extends Error {}

const localSessionRequestTails = new Map<string, Promise<void>>();

export function serializedStudentVueRequest<T>(sessionId: string, operation: () => Promise<T>) {
	// StudentVUE mutates server-side focus while loading gradebook details. A Web Lock
	// keeps requests ordered across tabs and prevents an older encrypted session response
	// from overwriting a newer one. The promise queue covers browsers without Web Locks.
	if (typeof navigator !== 'undefined' && navigator.locks) {
		return navigator.locks.request(`grademaxxing-studentvue-${sessionId}`, operation);
	}
	const previous = localSessionRequestTails.get(sessionId) ?? Promise.resolve();
	const result = previous.catch(() => undefined).then(operation);
	const tail = result.then(
		() => undefined,
		() => undefined
	);
	localSessionRequestTails.set(sessionId, tail);
	void tail.finally(() => {
		if (localSessionRequestTails.get(sessionId) === tail)
			localSessionRequestTails.delete(sessionId);
	});
	return result;
}

export async function apiRequest<T>(
	path: string,
	init: RequestInit = {},
	redirectOnUnauthorized = true,
	requestTiming?: RequestTimingCapture
): Promise<T> {
	const timing = requestTiming ?? captureRequestTiming(path);
	if (!requestTiming) timing?.ready();
	const method = (init.method ?? 'GET').toUpperCase();
	// A Worker/platform 500 is sometimes transient during a cold start or a
	// short-lived upstream failure. Safe read requests may retry it; mutations
	// (including sign-in) never do.
	const retryableStatuses = new Set([429, 500, 502, 503, 504]);
	const maximumRetries = method === 'GET' ? 2 : 0;
	try {
		for (let attempt = 0; ; attempt += 1) {
			const attemptTiming = timing?.attempt(attempt);
			let response: Response;
			try {
				response = await fetch(path, {
					...init,
					headers: {
						Accept: 'application/json',
						...(timing ? { 'X-Grademaxxing-Timing': 'true' } : {}),
						...(init.body ? { 'Content-Type': 'application/json' } : {}),
						...init.headers
					}
				});
			} catch (error) {
				attemptTiming?.finish(true);
				if (attempt < maximumRetries) {
					const retryStartedAt = performance.now();
					await retryDelay(attempt);
					attemptTiming?.retry(retryStartedAt);
					continue;
				}
				throw error;
			}

			attemptTiming?.headers(response);
			if (response.ok) {
				try {
					return (await response.json()) as T;
				} finally {
					attemptTiming?.finish();
				}
			}
			const payload = (await response.json().catch(() => undefined)) as
				{ message?: string; code?: string } | undefined;
			attemptTiming?.finish();
			if (path === '/api/session' && method === 'POST' && response.status === 401)
				throw new StudentVueAuthenticationError(
					payload?.message ?? 'StudentVUE authentication failed.'
				);
			if (attempt < maximumRetries && retryableStatuses.has(response.status)) {
				const retryStartedAt = performance.now();
				await retryDelay(attempt, response.headers.get('retry-after'));
				attemptTiming?.retry(retryStartedAt);
				continue;
			}
			if (
				redirectOnUnauthorized &&
				response.status === 401 &&
				payload?.code === 'UPSTREAM_SESSION_EXPIRED'
			) {
				throw new StudentVueSessionExpiredError(
					payload.message ?? 'Reconnect to StudentVUE to update your school data.'
				);
			}
			if (
				redirectOnUnauthorized &&
				response.status === 401 &&
				payload?.code === 'APP_SESSION_INVALID'
			) {
				// Give the matching encrypted vault a chance to restore this session before
				// clearing identity or navigating to sign-in.
				throw new StudentVueAppSessionInvalidError(
					payload.message ?? 'Your StudentVUE session has expired. Please sign in again.'
				);
			}
			// Unknown 401s must not erase local data. Only the explicit app-session code above
			// proves this browser cannot resume; portal outages and proxy failures can otherwise
			// look deceptively similar.
			if (response.status === 0 || response.status >= 500 || response.status === 401)
				markPortalOffline();
			throw new Error(
				payload?.message ?? `StudentVUE API request failed (HTTP ${response.status}).`
			);
		}
	} finally {
		if (!requestTiming) timing?.finish();
	}
}

export function normalizedDomain(value: string) {
	try {
		return new URL(value.includes('://') ? value : `https://${value}`).host.toLowerCase();
	} catch {
		return value.trim().toLowerCase();
	}
}

const retryDelay = (attempt: number, retryAfter?: string | null) => {
	const fallback = attempt === 0 ? 250 : 750;
	let delay = fallback;
	if (retryAfter) {
		const seconds = Number(retryAfter);
		const dateDelay = Date.parse(retryAfter) - Date.now();
		const requested = Number.isFinite(seconds) ? seconds * 1000 : dateDelay;
		if (Number.isFinite(requested) && requested >= 0) delay = Math.min(5_000, requested);
	}
	return new Promise<void>((resolve) => setTimeout(resolve, delay));
};
