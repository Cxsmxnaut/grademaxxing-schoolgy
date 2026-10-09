import { McpBodyTooLargeError, readMcpBody } from '$lib/server/mcp/body';
import {
	consumeAuthorizationCode,
	createRefreshFamily,
	requireActiveRefreshFamily,
	rotateRefreshFamily,
	withMcpSessionLease
} from '$lib/server/mcp/grants';
import { mcpResource } from '$lib/server/mcp/metadata';
import {
	consumeAttempt,
	issueTokens,
	McpOAuthError,
	parseClientId,
	verifyAuthorizationCode,
	verifyRefreshToken
} from '$lib/server/mcp/oauth';
import { Pxp2SessionExpiredError } from '$lib/server/pxp2';
import {
	getStudentSession,
	runStudentOperation,
	serializeStudentSession
} from '$lib/server/student-session';
import type { RequestHandler } from './$types';

const MAX_FORM_BYTES = 32 * 1024;
const attempts = new Map<string, { count: number; resetAt: number }>();

function tokenResponse(body: unknown, status = 200): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: {
			'Content-Type': 'application/json; charset=utf-8',
			'Cache-Control': 'no-store',
			'Access-Control-Allow-Origin': '*',
			'X-Content-Type-Options': 'nosniff'
		}
	});
}

function oauthError(error: string, description: string, status = 400): Response {
	return tokenResponse({ error, error_description: description }, status);
}

function safeClientAddress(getClientAddress: () => string) {
	try {
		return getClientAddress().slice(0, 128);
	} catch {
		return 'local';
	}
}

export const POST: RequestHandler = async ({ request, url, getClientAddress, platform }) => {
	const contentType = request.headers.get('content-type')?.split(';', 1)[0]?.trim();
	if (contentType !== 'application/x-www-form-urlencoded')
		return oauthError('invalid_request', 'Expected application/x-www-form-urlencoded.', 415);
	let raw: string;
	try {
		raw = await readMcpBody(request, MAX_FORM_BYTES);
	} catch (cause) {
		if (cause instanceof McpBodyTooLargeError)
			return oauthError('invalid_request', 'Request body is too large.', 413);
		throw cause;
	}
	if (!consumeAttempt(attempts, `token:${safeClientAddress(getClientAddress)}`, 120, 60_000))
		return new Response(JSON.stringify({ error: 'slow_down' }), {
			status: 429,
			headers: {
				'Content-Type': 'application/json; charset=utf-8',
				'Cache-Control': 'no-store',
				'Access-Control-Allow-Origin': '*',
				'Retry-After': '30'
			}
		});

	const params = new URLSearchParams(raw);
	const grantType = params.get('grant_type') ?? '';
	const resource = params.get('resource');
	const canonicalResource = mcpResource(url.origin);
	if (resource && resource !== canonicalResource)
		return oauthError('invalid_target', `The resource must be ${canonicalResource}.`);
	if (params.get('client_secret'))
		return oauthError('invalid_client', 'Public clients cannot send a client_secret.');

	try {
		if (grantType === 'authorization_code') {
			const clientId = params.get('client_id');
			if (!clientId) return oauthError('invalid_request', 'client_id is required.');
			if (clientId) {
				// Validate the client even though the code is self-bound; this keeps
				// unknown/rotated clients from exchanging codes.
				parseClientId(clientId);
			}
			const code = params.get('code');
			const redirectUri = params.get('redirect_uri');
			const verifier = params.get('code_verifier');
			if (!code) return oauthError('invalid_request', 'code is required.');
			if (!redirectUri) return oauthError('invalid_request', 'redirect_uri is required.');
			if (!verifier) return oauthError('invalid_request', 'code_verifier is required.');
			const payload = verifyAuthorizationCode(code, {
				clientId,
				redirectUri,
				verifier,
				resource: canonicalResource
			});
			await consumeAuthorizationCode(platform, code, payload.exp);
			const issued = issueTokens({
				clientId: payload.clientId,
				resource: payload.resource,
				scope: payload.scope,
				sessionToken: payload.session
			});
			await createRefreshFamily(
				platform,
				issued.familyId,
				issued.refreshToken,
				issued.refreshExpiresAt
			);
			return tokenResponse({
				access_token: issued.accessToken,
				...(payload.scope.split(' ').includes('offline_access')
					? { refresh_token: issued.refreshToken }
					: {}),
				expires_in: issued.expiresIn,
				scope: issued.scope,
				token_type: 'Bearer',
				iss: url.origin
			});
		}

		if (grantType === 'refresh_token') {
			const refreshToken = params.get('refresh_token');
			if (!refreshToken) return oauthError('invalid_request', 'refresh_token is required.');
			const payload = verifyRefreshToken(refreshToken);
			if (!payload.scope.split(' ').includes('offline_access'))
				return oauthError('invalid_grant', 'Offline access was not granted to this connection.');
			const clientId = params.get('client_id');
			if (!clientId) return oauthError('invalid_request', 'client_id is required.');
			if (clientId !== payload.clientId)
				return oauthError('invalid_grant', 'The refresh token was issued to another client.');
			if (payload.resource !== canonicalResource)
				return oauthError('invalid_target', 'The refresh token was issued for another resource.');
			await requireActiveRefreshFamily(platform, payload.familyId, refreshToken);
			let session: ReturnType<typeof getStudentSession>;
			try {
				session = getStudentSession(payload.session);
			} catch (cause) {
				if (cause instanceof McpOAuthError) throw cause;
				return oauthError(
					'invalid_grant',
					'The StudentVUE session has expired. Reconnect the connector to sign in again.'
				);
			}
			try {
				await withMcpSessionLease(platform, session.clientSessionId, () =>
					runStudentOperation(session, () => session.client.keepAlive(), request.signal)
				);
			} catch (cause) {
				if (cause instanceof Pxp2SessionExpiredError)
					return oauthError(
						'invalid_grant',
						'The StudentVUE session expired. Reconnect to continue.'
					);
				if (cause instanceof McpOAuthError) throw cause;
				return oauthError(
					'temporarily_unavailable',
					'StudentVUE could not be reached. Retry shortly.',
					503
				);
			}
			// Re-serialize on refresh so an active connector keeps its session alive
			// exactly like the browser's rolling keep-alive does.
			const rotatedSession = serializeStudentSession(session);
			const issued = issueTokens({
				clientId: payload.clientId,
				resource: payload.resource,
				scope: payload.scope,
				sessionToken: rotatedSession,
				familyId: payload.familyId
			});
			await rotateRefreshFamily(
				platform,
				payload.familyId,
				refreshToken,
				issued.refreshToken,
				issued.refreshExpiresAt
			);
			return tokenResponse({
				access_token: issued.accessToken,
				...(payload.scope.split(' ').includes('offline_access')
					? { refresh_token: issued.refreshToken }
					: {}),
				expires_in: issued.expiresIn,
				scope: issued.scope,
				token_type: 'Bearer',
				iss: url.origin
			});
		}

		return oauthError(
			'unsupported_grant_type',
			`Unsupported grant type: ${grantType || '(missing)'}.`
		);
	} catch (cause) {
		if (cause instanceof McpOAuthError)
			return oauthError(
				cause.code === 'invalid_token' ? 'invalid_grant' : cause.code,
				cause.message,
				cause.code === 'temporarily_unavailable' ? 503 : cause.code === 'invalid_client' ? 401 : 400
			);
		console.warn('MCP token failure', {
			errorName: cause instanceof Error ? cause.name : typeof cause
		});
		return oauthError('server_error', 'The token could not be issued.', 500);
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
