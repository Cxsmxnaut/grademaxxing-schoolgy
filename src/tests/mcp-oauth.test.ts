import { mcpResource } from '$lib/server/mcp/metadata';
import {
	ACCESS_TOKEN_TTL_SECONDS,
	isAllowedRedirectUri,
	issueAuthorizationCode,
	issueTokens,
	isValidCodeVerifier,
	McpOAuthError,
	parseClientId,
	registerClient,
	requestedScope,
	validateAuthorizeParams,
	verifyAccessToken,
	verifyAuthorizationCode,
	verifyRefreshToken
} from '$lib/server/mcp/oauth';
import { Pxp2Client } from '$lib/server/pxp2';
import { serializeStudentSession } from '$lib/server/student-session';
import { createHash, randomBytes } from 'node:crypto';
import { expect, test, vi } from 'vitest';

const ORIGIN = 'https://grademaxxing.app';
const RESOURCE = mcpResource(ORIGIN);
const CHALLENGE = createHash('sha256').update('verifier'.padEnd(43, 'x')).digest('base64url');

function client(redirectUris = ['https://chatgpt.com/connector/oauth/abc123']) {
	return registerClient({ redirect_uris: redirectUris, client_name: 'ChatGPT' });
}

function authorizeParams(overrides: Record<string, string> = {}) {
	const registration = client();
	return {
		params: new URLSearchParams({
			client_id: registration.clientId,
			redirect_uri: registration.redirectUris[0]!,
			response_type: 'code',
			code_challenge: CHALLENGE,
			code_challenge_method: 'S256',
			state: 'xyz',
			...overrides
		}),
		registration
	};
}

function sessionToken() {
	return serializeStudentSession({
		client: Pxp2Client.resume({
			baseUrl: 'https://ca-pleas-psv.edupoint.com/',
			cookies: { ASP_NET_SessionId: 'encrypted-upstream-cookie' }
		}),
		clientSessionId: 'd9428888-122b-4f22-bc7f-1d95e4097a11',
		username: 'student@example.edu',
		domain: 'ca-pleas-psv.edupoint.com',
		expiresAt: Date.now() + 60_000,
		operationTail: Promise.resolve(),
		queuedOperations: 0
	} as Parameters<typeof serializeStudentSession>[0]);
}

test('dynamic client registration only accepts trusted redirect targets', () => {
	expect(isAllowedRedirectUri('https://chatgpt.com/connector/oauth/9f2')).toBe(true);
	expect(isAllowedRedirectUri('https://chatgpt.com/connector_platform_oauth_redirect')).toBe(true);
	expect(isAllowedRedirectUri('https://claude.ai/api/mcp/auth_callback')).toBe(true);
	expect(isAllowedRedirectUri('http://localhost:3118/callback')).toBe(true);
	expect(isAllowedRedirectUri('http://127.0.0.1:1455/callback')).toBe(true);
	expect(isAllowedRedirectUri('https://evil.test/callback')).toBe(false);
	expect(isAllowedRedirectUri('https://chatgpt.com.evil.test/callback')).toBe(false);
	expect(isAllowedRedirectUri('https://user:pass@chatgpt.com/callback')).toBe(false);
	expect(isAllowedRedirectUri('ftp://chatgpt.com/callback')).toBe(false);

	const registration = client();
	expect(registration.clientId.startsWith('gmcp1_')).toBe(true);
	expect(parseClientId(registration.clientId).redirectUris).toEqual(registration.redirectUris);
	expect(() => registerClient({ redirect_uris: ['https://evil.test/cb'] })).toThrow(McpOAuthError);
	expect(() =>
		registerClient({
			redirect_uris: ['https://claude.ai/cb'],
			token_endpoint_auth_method: 'client_secret_post'
		})
	).toThrow('public client');
	expect(() => parseClientId('gmcp1_not-a-real-token')).toThrow(McpOAuthError);
});

test('authorize validation separates redirectable and local errors', () => {
	const { params } = authorizeParams();
	const ok = validateAuthorizeParams(params, ORIGIN, RESOURCE);
	expect(ok).toMatchObject({ ok: true });
	if (ok.ok) {
		expect(ok.request.redirectUri).toContain('chatgpt.com');
		expect(ok.request.scopes).toEqual(['studentvue:read', 'offline_access']);
		expect(ok.request.state).toBe('xyz');
	}

	const badResponseType = validateAuthorizeParams(
		new URLSearchParams({
			...Object.fromEntries(authorizeParams().params),
			response_type: 'token'
		}),
		ORIGIN,
		RESOURCE
	);
	expect(badResponseType).toMatchObject({
		ok: false,
		error: 'unsupported_response_type',
		redirectable: true
	});

	const unknownClient = validateAuthorizeParams(
		new URLSearchParams({ client_id: 'gmcp1_zzz', redirect_uri: 'https://chatgpt.com/x' }),
		ORIGIN,
		RESOURCE
	);
	expect(unknownClient).toMatchObject({ ok: false, redirectable: false });

	const unregisteredRedirect = validateAuthorizeParams(
		authorizeParams({ redirect_uri: 'https://chatgpt.com/other' }).params,
		ORIGIN,
		RESOURCE
	);
	expect(unregisteredRedirect).toMatchObject({ ok: false, redirectable: false });

	const missingChallenge = authorizeParams();
	missingChallenge.params.delete('code_challenge');
	expect(validateAuthorizeParams(missingChallenge.params, ORIGIN, RESOURCE)).toMatchObject({
		ok: false,
		error: 'invalid_request',
		redirectable: true
	});

	const wrongResource = validateAuthorizeParams(
		authorizeParams({ resource: 'https://other.example/mcp' }).params,
		ORIGIN,
		RESOURCE
	);
	expect(wrongResource).toMatchObject({ ok: false, error: 'invalid_target', redirectable: true });

	expect(() => requestedScope('studentvue:read evil:scope')).toThrow('Unsupported scope');
	expect(requestedScope(null)).toEqual(['studentvue:read', 'offline_access']);
});

test('authorization codes bind client, redirect, resource, and PKCE', () => {
	vi.useFakeTimers();
	try {
		vi.setSystemTime(new Date('2026-10-05T12:00:00Z'));
		const { params } = authorizeParams();
		const validation = validateAuthorizeParams(params, ORIGIN, RESOURCE);
		expect(validation.ok).toBe(true);
		if (!validation.ok) return;
		const session = sessionToken();
		const code = issueAuthorizationCode(validation.request, session);
		const verifier = 'verifier'.padEnd(43, 'x');
		expect(isValidCodeVerifier(verifier)).toBe(true);

		const payload = verifyAuthorizationCode(code, {
			clientId: validation.request.clientId,
			redirectUri: validation.request.redirectUri,
			verifier,
			resource: RESOURCE
		});
		expect(payload.session).toBe(session);

		expect(() =>
			verifyAuthorizationCode(code, {
				clientId: validation.request.clientId,
				redirectUri: validation.request.redirectUri,
				verifier: 'a'.repeat(43),
				resource: RESOURCE
			})
		).toThrow('verifier');
		expect(() =>
			verifyAuthorizationCode(code, {
				clientId: validation.request.clientId,
				redirectUri: 'https://chatgpt.com/other',
				verifier,
				resource: RESOURCE
			})
		).toThrow('redirect_uri');
		expect(() =>
			verifyAuthorizationCode(code, {
				clientId: 'gmcp1_other',
				redirectUri: validation.request.redirectUri,
				verifier,
				resource: RESOURCE
			})
		).toThrow('another client');

		vi.setSystemTime(new Date('2026-10-05T12:10:00Z'));
		expect(() =>
			verifyAuthorizationCode(code, {
				clientId: validation.request.clientId,
				redirectUri: validation.request.redirectUri,
				verifier,
				resource: RESOURCE
			})
		).toThrow('expired');
	} finally {
		vi.useRealTimers();
	}
});

test('tokens carry the resource audience and never leak the session', () => {
	const registration = client();
	const session = sessionToken();
	const issued = issueTokens({
		clientId: registration.clientId,
		resource: RESOURCE,
		scope: 'studentvue:read offline_access',
		sessionToken: session
	});
	expect(issued.expiresIn).toBe(ACCESS_TOKEN_TTL_SECONDS);
	expect(issued.accessToken).not.toContain('student@example.edu');
	expect(issued.accessToken).not.toContain('encrypted-upstream-cookie');
	expect(issued.refreshToken).not.toContain('student@example.edu');

	const access = verifyAccessToken(issued.accessToken, RESOURCE);
	expect(access.typ).toBe('access');
	expect(access.session).toBe(session);

	expect(() => verifyAccessToken(issued.accessToken, 'https://other.example/mcp')).toThrow(
		'another resource'
	);
	expect(() => verifyAccessToken(issued.refreshToken, RESOURCE)).toThrow('not valid');
	expect(() => verifyRefreshToken(issued.accessToken)).toThrow('not valid');
	expect(verifyRefreshToken(issued.refreshToken).typ).toBe('refresh');

	// A raw StudentVUE session cookie is not a valid MCP credential.
	expect(() => verifyAccessToken(session, RESOURCE)).toThrow(McpOAuthError);
	expect(() => parseClientId(session)).toThrow(McpOAuthError);

	const garbage = `${issued.accessToken.slice(0, -1)}${issued.accessToken.endsWith('A') ? 'B' : 'A'}`;
	expect(() => verifyAccessToken(garbage, RESOURCE)).toThrow();
});

test('expired access tokens are rejected', () => {
	vi.useFakeTimers();
	try {
		const registration = client();
		const issued = issueTokens({
			clientId: registration.clientId,
			resource: RESOURCE,
			scope: 'studentvue:read',
			sessionToken: sessionToken()
		});
		vi.advanceTimersByTime((ACCESS_TOKEN_TTL_SECONDS + 60) * 1_000);
		expect(() => verifyAccessToken(issued.accessToken, RESOURCE)).toThrow('expired');
	} finally {
		vi.useRealTimers();
	}
});

test('code verifiers follow the RFC 7636 charset and length', () => {
	expect(isValidCodeVerifier(randomBytes(32).toString('base64url'))).toBe(true);
	expect(isValidCodeVerifier('too-short')).toBe(false);
	expect(isValidCodeVerifier('!'.repeat(43))).toBe(false);
	expect(isValidCodeVerifier('a'.repeat(129))).toBe(false);
});
