import { markPortalOffline } from '$lib/session.svelte';

export class StudentVueSessionExpiredError extends Error {
	readonly code = 'UPSTREAM_SESSION_EXPIRED';
}

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
	expectedSessionId?: string
): Promise<T> {
	const method = (init.method ?? 'GET').toUpperCase();
	// A Worker/platform 500 is sometimes transient during a cold start or a
	// short-lived upstream failure. Safe read requests may retry it; mutations
	// (including sign-in) never do.
	const retryableStatuses = new Set([429, 500, 502, 503, 504]);
	const maximumRetries = method === 'GET' ? 2 : 0;
	for (let attempt = 0; ; attempt += 1) {
		let response: Response;
		try {
			response = await fetch(path, {
				...init,
				headers: {
					Accept: 'application/json',
					...(init.body ? { 'Content-Type': 'application/json' } : {}),
					...init.headers
				}
			});
		} catch (error) {
			if (attempt < maximumRetries) {
				await retryDelay(attempt);
				continue;
			}
			throw error;
		}

		if (response.ok) return response.json() as Promise<T>;
		const payload = (await response.json().catch(() => undefined)) as
			{ message?: string; code?: string } | undefined;
		if (attempt < maximumRetries && retryableStatuses.has(response.status)) {
			await retryDelay(attempt, response.headers.get('retry-after'));
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
			payload?.code === 'APP_SESSION_INVALID' &&
			typeof window !== 'undefined'
		) {
			// An expired or invalid portal session must clear every cached client store. Use a
			// full navigation so module-level Svelte state cannot survive into the next account.
			if (!expectedSessionId || storedSessionId() === expectedSessionId)
				localStorage.removeItem('token');
			window.location.assign('/login?sessionExpired=true');
		}
		// Unknown 401s must not erase local data. Only the explicit app-session code above
		// proves this browser cannot resume; portal outages and proxy failures can otherwise
		// look deceptively similar.
		if (response.status === 0 || response.status >= 500 || response.status === 401)
			markPortalOffline();
		throw new Error(payload?.message ?? `StudentVUE API request failed (HTTP ${response.status}).`);
	}
}

export function normalizedDomain(value: string) {
	try {
		return new URL(value.includes('://') ? value : `https://${value}`).host.toLowerCase();
	} catch {
		return value.trim().toLowerCase();
	}
}

function storedSessionId() {
	try {
		const value = JSON.parse(localStorage.getItem('token') ?? '') as { sessionId?: unknown };
		return typeof value.sessionId === 'string' ? value.sessionId : undefined;
	} catch {
		return undefined;
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
