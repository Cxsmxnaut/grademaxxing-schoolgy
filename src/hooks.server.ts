import { env } from '$env/dynamic/private';
import { isMaintenancePage, needsNoindex, productionHttpsRedirect } from '$lib/seo/indexing';
import { adminConsoleCsp } from '$lib/server/admin/csp';
import { wellKnownResponse } from '$lib/server/mcp/metadata';
import { appendServerTiming } from '$lib/server/request-timing';
import {
	error,
	isHttpError,
	type Handle,
	type HandleServerError,
	type RequestEvent
} from '@sveltejs/kit';
import { randomUUID } from 'node:crypto';

const MAX_API_BODY_BYTES = 32 * 1024;
const unsafeMethods = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const crossOriginMcpEndpoints = new Set(['/mcp', '/mcp/register', '/mcp/token', '/mcp/revoke']);
// The admin console is a standalone client-side app (admin-app/) built into
// static/admin-app and served under this base path on every host.
const adminAppBasePath = '/admin-app';

export const handle: Handle = async ({ event, resolve }) => {
	event.locals.requestId = randomUUID();
	const startedAt = performance.now();
	let response: Response | undefined;
	const httpsLocation = productionHttpsRedirect(
		event.url,
		event.request.headers.get('x-forwarded-proto')
	);
	if (httpsLocation) {
		response = new Response(null, { status: 308, headers: { Location: httpsLocation } });
	} else if (
		event.url.pathname === '/admin' ||
		(event.url.hostname === 'admin.grademaxxing.app' && event.url.pathname === '/')
	) {
		response = new Response(null, {
			status: 302,
			headers: { Location: new URL(`${adminAppBasePath}/`, event.url).href }
		});
	}

	// MCP OAuth discovery documents are answered before application routing so
	// ChatGPT and Claude can find the authorization server on every adapter.
	response ??= wellKnownResponse(event.url);

	if (!response) {
		try {
			// Public registration and bearer-token MCP endpoints use no ambient cookies.
			// The credential/consent form at /mcp/authorize still requires this origin.
			if (
				unsafeMethods.has(event.request.method) &&
				!crossOriginMcpEndpoints.has(event.url.pathname)
			) {
				const contentType = event.request.headers.get('content-type')?.split(';', 1)[0]?.trim();
				const isForm = [
					'application/x-www-form-urlencoded',
					'multipart/form-data',
					'text/plain'
				].includes(contentType ?? '');
				const origin = event.request.headers.get('origin');
				if (
					event.request.headers.get('sec-fetch-site') === 'cross-site' ||
					(origin && !sameRequestOrigin(origin, event.request, event.url)) ||
					(isForm && !origin)
				) {
					throw error(403, 'Cross-site requests are not allowed.');
				}
			}

			if (event.url.pathname.startsWith('/api/')) {
				guardApiRequest(event.request, event.url);
			}
		} catch (cause) {
			if (!isHttpError(cause)) throw cause;
			// Guard errors also pass through security and indexing headers. Keep the
			// original HTTP status and avoid reflecting request inputs in the body.
			response = new Response(JSON.stringify(cause.body), {
				status: cause.status,
				headers: { 'Content-Type': 'application/json; charset=utf-8' }
			});
		}
	}

	response ??= wantsAdminAppShell(event.url.pathname)
		? await adminAppShell(event)
		: await resolve(event);
	if (
		env.MAINTENANCE_MODE === 'on' &&
		isMaintenancePage(event.url.pathname, event.route?.id) &&
		response.status === 200 &&
		response.headers.get('content-type')?.includes('text/html')
	) {
		// The layout renders the maintenance message; the HTTP status must agree.
		// Public calculators, guides, sitemap, robots and protocol/API endpoints
		// retain their normal availability and any real 4xx/5xx stays unchanged.
		response = new Response(response.body, {
			status: 503,
			headers: response.headers
		});
	}

	const durationMs = performance.now() - startedAt;
	response.headers.set('X-Request-ID', event.locals.requestId);
	appendServerTiming(response.headers, `app;dur=${durationMs.toFixed(1)}`);
	event.locals.requestTiming?.append(response.headers);
	response.headers.set('X-Content-Type-Options', 'nosniff');
	response.headers.set('Referrer-Policy', 'no-referrer');
	response.headers.set('X-Frame-Options', 'DENY');
	response.headers.set('Cross-Origin-Opener-Policy', 'same-origin');
	response.headers.set('Cross-Origin-Resource-Policy', 'same-origin');
	response.headers.set(
		'Permissions-Policy',
		'camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()'
	);
	if (
		event.isDataRequest ||
		needsNoindex(event.url, response.status, response.headers.get('content-type'))
	) {
		response.headers.set('X-Robots-Tag', 'noindex');
	}

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
	if (event.isDataRequest || event.url.pathname.startsWith('/api/')) {
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

/**
 * The console routes client-side (e.g. /admin-app/feedback); extension-less
 * paths under the base serve the app shell while real assets fall through to
 * static serving.
 */
function wantsAdminAppShell(pathname: string) {
	if (pathname !== adminAppBasePath && !pathname.startsWith(`${adminAppBasePath}/`)) return false;
	const rest = pathname.slice(adminAppBasePath.length);
	if (rest === '' || rest === '/') return true;
	return !(rest.split('/').pop() ?? '').includes('.');
}

async function adminAppShell(event: RequestEvent) {
	const assets = (event.platform as { env?: { ASSETS?: { fetch: typeof fetch } } } | undefined)?.env
		?.ASSETS;
	const shellUrl = new URL(`${adminAppBasePath}/shell.html`, event.url);
	const options = { headers: { 'accept-encoding': 'identity' } };
	// Cloudflare's static assets live behind this binding; an ordinary fetch
	// inside its Worker does not dispatch back through the local asset server.
	const shell = assets
		? await assets.fetch(shellUrl.href, options)
		: await event.fetch(shellUrl, options);
	if (shell.ok) {
		const headers = new Headers(shell.headers);
		// Fetch can decode a compressed asset body while retaining its wire headers.
		// Forward headers for the returned body, rather than the compressed asset.
		headers.delete('Content-Encoding');
		headers.delete('Content-Length');
		headers.delete('ETag');
		headers.set('Content-Security-Policy', adminConsoleCsp);
		return new Response(shell.body, { status: shell.status, headers });
	}
	return new Response('The admin console assets are missing. Run `npm run build:admin`.', {
		status: 503,
		headers: { 'content-type': 'text/plain; charset=utf-8', 'Retry-After': '30' }
	});
}

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

	if (unsafeMethods.has(request.method) && request.method !== 'DELETE') {
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
