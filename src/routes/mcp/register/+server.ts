import { consumeAttempt, McpOAuthError, registerClient } from '$lib/server/mcp/oauth';
import type { RequestHandler } from './$types';

const MAX_BODY_BYTES = 16 * 1024;
const attempts = new Map<string, { count: number; resetAt: number }>();

function registerResponse(body: unknown, status = 200): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: {
			'Content-Type': 'application/json; charset=utf-8',
			'Cache-Control': 'no-store',
			'X-Content-Type-Options': 'nosniff'
		}
	});
}

function safeClientAddress(getClientAddress: () => string) {
	try {
		return getClientAddress().slice(0, 128);
	} catch {
		return 'local';
	}
}

export const POST: RequestHandler = async ({ request, getClientAddress }) => {
	const contentType = request.headers.get('content-type')?.split(';', 1)[0]?.trim();
	if (contentType !== 'application/json')
		return registerResponse(
			{ error: 'invalid_client_metadata', error_description: 'Expected application/json.' },
			415
		);
	const raw = await request.text();
	if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES)
		return registerResponse(
			{ error: 'invalid_client_metadata', error_description: 'Request body is too large.' },
			413
		);
	if (!consumeAttempt(attempts, `register:${safeClientAddress(getClientAddress)}`, 30, 60_000))
		return new Response(JSON.stringify({ error: 'slow_down' }), {
			status: 429,
			headers: {
				'Content-Type': 'application/json; charset=utf-8',
				'Cache-Control': 'no-store',
				'Retry-After': '30'
			}
		});
	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch {
		return registerResponse(
			{ error: 'invalid_client_metadata', error_description: 'Body must be JSON.' },
			400
		);
	}
	try {
		const client = registerClient(parsed);
		return registerResponse(
			{
				client_id: client.clientId,
				client_id_issued_at: client.issuedAt,
				client_name: client.name,
				redirect_uris: client.redirectUris,
				grant_types: ['authorization_code', 'refresh_token'],
				response_types: ['code'],
				token_endpoint_auth_method: 'none',
				scope: 'studentvue:read offline_access'
			},
			201
		);
	} catch (cause) {
		if (cause instanceof McpOAuthError)
			return registerResponse({ error: cause.code, error_description: cause.message }, 400);
		console.warn('MCP registration failure', {
			errorName: cause instanceof Error ? cause.name : typeof cause
		});
		return registerResponse({ error: 'server_error' }, 500);
	}
};

export const OPTIONS: RequestHandler = () =>
	new Response(null, {
		status: 204,
		headers: {
			'Access-Control-Allow-Origin': '*',
			'Access-Control-Allow-Methods': 'POST, OPTIONS',
			'Access-Control-Allow-Headers': 'Content-Type',
			'Access-Control-Max-Age': '600'
		}
	});
