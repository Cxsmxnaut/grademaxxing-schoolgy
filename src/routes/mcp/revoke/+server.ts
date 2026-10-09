import { McpBodyTooLargeError, readMcpBody } from '$lib/server/mcp/body';
import { revokeRefreshFamily } from '$lib/server/mcp/grants';
import { mcpResource } from '$lib/server/mcp/metadata';
import { McpOAuthError, verifyAccessToken, verifyRefreshToken } from '$lib/server/mcp/oauth';
import type { RequestHandler } from './$types';

const headers = { 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*' };
export const POST: RequestHandler = async ({ request, url, platform }) => {
	if (
		request.headers.get('content-type')?.split(';', 1)[0]?.trim() !==
		'application/x-www-form-urlencoded'
	)
		return new Response(null, { status: 415, headers });
	let raw: string;
	try {
		raw = await readMcpBody(request, 32 * 1024);
	} catch (cause) {
		if (cause instanceof McpBodyTooLargeError) return new Response(null, { status: 413, headers });
		throw cause;
	}
	const params = new URLSearchParams(raw);
	const token = params.get('token') ?? '';
	const resource = mcpResource(url.origin);
	let payload;
	try {
		payload = verifyRefreshToken(token);
	} catch {
		try {
			payload = verifyAccessToken(token, resource);
		} catch {
			return new Response(null, { status: 200, headers });
		}
	}
	// RFC 7009 answers 200 for unknown tokens, including a mismatched client.
	if (
		payload.resource !== resource ||
		(params.has('client_id') && params.get('client_id') !== payload.clientId)
	)
		return new Response(null, { status: 200, headers });
	try {
		await revokeRefreshFamily(platform, payload.familyId);
	} catch (cause) {
		if (cause instanceof McpOAuthError) return new Response(null, { status: 503, headers });
		return new Response(null, { status: 503, headers });
	}
	return new Response(null, { status: 200, headers });
};
export const OPTIONS: RequestHandler = () =>
	new Response(null, {
		status: 204,
		headers: {
			...headers,
			'Access-Control-Allow-Methods': 'POST, OPTIONS',
			'Access-Control-Allow-Headers': 'Content-Type'
		}
	});
