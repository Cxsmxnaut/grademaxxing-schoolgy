import { error, type Handle, type HandleServerError } from '@sveltejs/kit';
import { randomUUID } from 'node:crypto';

const MAX_API_BODY_BYTES = 32 * 1024;
const unsafeMethods = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export const handle: Handle = async ({ event, resolve }) => {
	event.locals.requestId = randomUUID();
	const startedAt = performance.now();
	if (event.url.hostname === 'admin.grademaxxing.app' && event.url.pathname === '/') {
		return Response.redirect(new URL('/admin', event.url), 302);
	}

	if (event.url.pathname.startsWith('/api/')) {
		guardApiRequest(event.request, event.url);
	}

	const response = await resolve(event);
	const durationMs = performance.now() - startedAt;
	response.headers.set('X-Request-ID', event.locals.requestId);
	response.headers.set('Server-Timing', `app;dur=${durationMs.toFixed(1)}`);
	response.headers.set('X-Content-Type-Options', 'nosniff');
	response.headers.set('Referrer-Policy', 'no-referrer');
	response.headers.set('X-Frame-Options', 'DENY');
	response.headers.set('Cross-Origin-Opener-Policy', 'same-origin');
	response.headers.set('Cross-Origin-Resource-Policy', 'same-origin');
	response.headers.set(
		'Permissions-Policy',
		'camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()'
	);

	const forwardedProtocol = event.request.headers
		.get('x-forwarded-proto')
		?.split(',', 1)[0]
		?.trim();
	if (
		forwardedProtocol === 'https' ||
		(event.url.protocol === 'https:' &&
			!['localhost', '127.0.0.1', '::1'].includes(event.url.hostname))
	) {
		response.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
	}
	if (event.url.pathname.startsWith('/api/')) {
		response.headers.set('Cache-Control', 'private, no-store, max-age=0');
		response.headers.set('Pragma', 'no-cache');
	} else if (response.headers.get('content-type')?.includes('text/html')) {
		response.headers.set('Cache-Control', 'private, no-store, max-age=0');
	}
	if (
		(response.status === 429 || response.status === 503) &&
		!response.headers.has('Retry-After')
	) {
		response.headers.set('Retry-After', '30');
	}
	if (response.status >= 500 || durationMs >= 30_000) {
		console.warn('Slow or failed request', {
			requestId: event.locals.requestId,
			method: event.request.method,
			path: event.url.pathname,
			status: response.status,
			durationMs: Math.round(durationMs)
		});
	}

	return response;
};

export const handleError: HandleServerError = ({ error: cause, event, status, message }) => {
	const requestId = event.locals.requestId || randomUUID();
	console.error('Unhandled request failure', {
		requestId,
		method: event.request.method,
		path: event.url.pathname,
		status,
		error: cause instanceof Error ? cause.message : String(cause)
	});
	return { message: status >= 500 ? 'An unexpected server error occurred.' : message, requestId };
};

function guardApiRequest(request: Request, url: URL) {
	const contentLength = Number(request.headers.get('content-length') ?? '0');
	if (Number.isFinite(contentLength) && contentLength > MAX_API_BODY_BYTES) {
		throw error(413, 'Request body is too large.');
	}

	if (!unsafeMethods.has(request.method)) return;
	const origin = request.headers.get('origin');
	const fetchSite = request.headers.get('sec-fetch-site');
	if ((origin && !sameRequestOrigin(origin, request, url)) || fetchSite === 'cross-site') {
		throw error(403, 'Cross-site API requests are not allowed.');
	}

	if (url.pathname === '/api/session' && request.method === 'POST') {
		const contentType = request.headers.get('content-type')?.split(';', 1)[0]?.trim();
		if (contentType !== 'application/json') throw error(415, 'Expected an application/json body.');
	}
}

function sameRequestOrigin(origin: string, request: Request, url: URL) {
	if (origin === url.origin) return true;
	try {
		// adapter-node deployments can use an internal ORIGIN behind a reverse proxy.
		// The browser-visible Host header remains authoritative and cannot be changed
		// by cross-origin browser JavaScript.
		return new URL(origin).host === request.headers.get('host');
	} catch {
		return false;
	}
}
