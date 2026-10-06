import { CORS_HEADERS, mcpResource, wwwAuthenticateChallenge } from '$lib/server/mcp/metadata';
import { McpOAuthError, verifyAccessToken } from '$lib/server/mcp/oauth';
import {
	handleMcpPayload,
	isSupportedProtocolVersion,
	McpProtocolError
} from '$lib/server/mcp/protocol';
import { McpAuthRequiredError } from '$lib/server/mcp/tools';
import { getStudentSession } from '$lib/server/student-session';
import type { RequestHandler } from './$types';

const MAX_BODY_BYTES = 512 * 1024;

const baseHeaders: Record<string, string> = {
	...CORS_HEADERS,
	'Cache-Control': 'no-store'
};

function unauthorized(url: URL, error?: string, description?: string): Response {
	const challenge = [
		wwwAuthenticateChallenge(url.origin),
		error ? `error="${error}"` : undefined,
		description ? `error_description="${description.replace(/["\\]/g, '\\$&')}"` : undefined
	]
		.filter(Boolean)
		.join(', ');
	return new Response(JSON.stringify({ error: 'unauthorized' }), {
		status: 401,
		headers: { ...baseHeaders, 'WWW-Authenticate': challenge }
	});
}

function jsonResponse(body: unknown, status = 200): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { ...baseHeaders, 'Content-Type': 'application/json; charset=utf-8' }
	});
}

function parseBody(raw: string) {
	try {
		return { value: JSON.parse(raw) as unknown };
	} catch {
		return { parseError: true as const };
	}
}

export const POST: RequestHandler = async ({ request, url }) => {
	const resource = mcpResource(url.origin);
	const authorization = request.headers.get('authorization');
	if (!authorization || !/^Bearer\s+/i.test(authorization))
		return unauthorized(url, 'invalid_token', 'Authentication is required.');
	let access;
	try {
		access = verifyAccessToken(authorization.replace(/^Bearer\s+/i, '').trim(), resource);
	} catch (cause) {
		return unauthorized(
			url,
			'invalid_token',
			cause instanceof McpOAuthError ? cause.message : 'The access token is invalid.'
		);
	}
	const protocolVersion = request.headers.get('mcp-protocol-version');
	if (!isSupportedProtocolVersion(protocolVersion))
		return jsonResponse({ error: `Unsupported MCP-Protocol-Version: ${protocolVersion}` }, 400);

	const contentLength = Number(request.headers.get('content-length') ?? '0');
	if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES)
		return new Response(JSON.stringify({ error: 'Request body is too large.' }), {
			status: 413,
			headers: baseHeaders
		});
	const raw = await request.text();
	if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES)
		return new Response(JSON.stringify({ error: 'Request body is too large.' }), {
			status: 413,
			headers: baseHeaders
		});
	const parsed = parseBody(raw);
	if ('parseError' in parsed)
		return jsonResponse(
			{ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } },
			400
		);

	const declaredMethod = request.headers.get('mcp-method');
	const single = !Array.isArray(parsed.value) ? parsed.value : undefined;
	if (
		declaredMethod &&
		single &&
		typeof single === 'object' &&
		(single as Record<string, unknown>).method !== declaredMethod
	) {
		return jsonResponse(
			{
				jsonrpc: '2.0',
				id: null,
				error: { code: -32600, message: 'Mcp-Method header does not match the request body.' }
			},
			400
		);
	}

	let session;
	try {
		session = getStudentSession(access.session);
	} catch {
		return unauthorized(
			url,
			'invalid_token',
			'The StudentVUE session expired. Reconnect to continue.'
		);
	}

	let response;
	try {
		response = await handleMcpPayload(parsed.value, { session, signal: request.signal });
	} catch (cause) {
		if (cause instanceof McpAuthRequiredError)
			return unauthorized(
				url,
				'invalid_token',
				'The StudentVUE session expired. Reconnect to continue.'
			);
		if (cause instanceof McpProtocolError)
			return jsonResponse({
				jsonrpc: '2.0',
				id: null,
				error: { code: cause.code, message: cause.message }
			});
		console.warn('MCP dispatch failed', {
			errorName: cause instanceof Error ? cause.name : typeof cause
		});
		return jsonResponse({
			jsonrpc: '2.0',
			id: null,
			error: { code: -32603, message: 'Internal error.' }
		});
	}
	if (response === null) return new Response(null, { status: 202, headers: baseHeaders });
	return jsonResponse(response);
};

export const GET: RequestHandler = () =>
	new Response(JSON.stringify({ error: 'Use POST for MCP JSON-RPC messages.' }), {
		status: 405,
		headers: {
			...baseHeaders,
			'Content-Type': 'application/json; charset=utf-8',
			Allow: 'POST, DELETE'
		}
	});

export const DELETE: RequestHandler = () =>
	new Response(null, { status: 204, headers: baseHeaders });

export const OPTIONS: RequestHandler = () =>
	new Response(null, { status: 204, headers: baseHeaders });
