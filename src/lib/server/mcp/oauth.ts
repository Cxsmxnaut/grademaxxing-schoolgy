import { StudentSessionConfigurationError, sessionMaxAge } from '$lib/server/student-session';
import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID } from 'node:crypto';
import { deflateRawSync, inflateRawSync } from 'node:zlib';

/**
 * An OAuth authorization server with self-contained encrypted credentials for the Grademaxxing MCP resource.
 *
 * Every credential is a self-contained encrypted payload instead of a row in a
 * database: the StudentVUE app already ships its portal session as an encrypted
 * token, so MCP credentials embed the same never-plain session blob. That keeps
 * the "no student-record database" posture intact on every adapter (Cloudflare,
 * Node, Vercel). A durable hash-only grant ledger enforces one-time code
 * redemption, refresh rotation and family revocation across Worker restarts.
 *
 * Properties encoded here, matching the MCP authorization specification and the
 * documented Claude/ChatGPT client behaviors:
 * - Dynamic client registration (RFC 7591) with a strict redirect-URI allowlist.
 * - Authorization code + PKCE (S256 only; verifiers validated per RFC 7636).
 * - Access/refresh tokens bound to the MCP resource audience (RFC 8707).
 * - Rotating refresh tokens enforced by the durable grant ledger.
 * - `iss` is returned in authorization and token responses (RFC 9207).
 */

export const MCP_SCOPES = ['studentvue:read', 'offline_access'] as const;
export const DEFAULT_SCOPE = 'studentvue:read offline_access';
export const ACCESS_TOKEN_TTL_SECONDS = 3_600;
export const AUTH_CODE_TTL_SECONDS = 300;
export const MAX_OAUTH_TOKEN_BYTES = 12 * 1024;
const MAX_CLIENT_ID_BYTES = 4 * 1024;
const MAX_OAUTH_PAYLOAD_BYTES = 128 * 1024;
const TOKEN_VERSION = 'mcp1';
const TOKEN_AAD = Buffer.from('grademaxxing-mcp-oauth-v1');

export class McpOAuthError extends Error {
	constructor(
		readonly code: string,
		description?: string
	) {
		super(description ?? code);
		this.name = 'McpOAuthError';
	}
}

export type ClientRegistration = {
	clientId: string;
	redirectUris: string[];
	name: string;
	issuedAt: number;
};

export type AuthorizeRequest = {
	clientId: string;
	client: ClientRegistration;
	redirectUri: string;
	challenge: string;
	resource: string;
	scopes: string[];
	state?: string;
};

type ClientPayload = { v: 1; jti: string; uris: string[]; name: string; iat: number };
type CodePayload = {
	v: 1;
	typ: 'code';
	clientId: string;
	redirectUri: string;
	challenge: string;
	resource: string;
	scope: string;
	session: string;
	exp: number;
};
type AccessPayload = {
	v: 1;
	typ: 'access';
	familyId: string;
	clientId: string;
	resource: string;
	scope: string;
	session: string;
	exp: number;
};
type RefreshPayload = {
	v: 1;
	typ: 'refresh';
	familyId: string;
	clientId: string;
	resource: string;
	scope: string;
	session: string;
	exp: number;
};

/** RFC 8252 loopback redirects for Claude Code, Codex CLI, and desktop hosts. */
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

export function isAllowedRedirectUri(value: string): boolean {
	let url: URL;
	try {
		url = new URL(value);
	} catch {
		return false;
	}
	if (url.username || url.password || url.hash) return false;
	if (url.protocol === 'https:') {
		const host = url.hostname.toLowerCase();
		const allowed = ['chatgpt.com', 'openai.com', 'claude.ai', 'claude.com', 'anthropic.com'];
		return allowed.some((domain) => host === domain || host.endsWith(`.${domain}`));
	}
	if (url.protocol === 'http:') return LOOPBACK_HOSTS.has(url.hostname);
	return false;
}

export function requestedScope(value: string | null): string[] {
	if (!value?.trim()) return [...MCP_SCOPES];
	const scopes = [...new Set(value.trim().split(/\s+/))];
	const unsupported = scopes.filter((scope) => !(MCP_SCOPES as readonly string[]).includes(scope));
	if (unsupported.length > 0)
		throw new McpOAuthError('invalid_scope', `Unsupported scope: ${unsupported.join(' ')}`);
	return scopes;
}

export function registerClient(metadata: unknown): ClientRegistration {
	if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata))
		throw new McpOAuthError('invalid_client_metadata', 'A JSON object body is required.');
	const input = metadata as Record<string, unknown>;
	const uris = input.redirect_uris;
	if (!Array.isArray(uris) || uris.length < 1 || uris.length > 10)
		throw new McpOAuthError(
			'invalid_client_metadata',
			'redirect_uris must be a non-empty array of at most 10 entries.'
		);
	const redirectUris = uris.map((uri) => (typeof uri === 'string' ? uri : ''));
	if (redirectUris.some((uri) => !uri || uri.length > 2_000))
		throw new McpOAuthError('invalid_client_metadata', 'redirect_uris must be strings.');
	const rejected = redirectUris.filter((uri) => !isAllowedRedirectUri(uri));
	if (rejected.length > 0)
		throw new McpOAuthError('invalid_client_metadata', `Redirect URI not allowed: ${rejected[0]}`);
	if (
		input.token_endpoint_auth_method !== undefined &&
		input.token_endpoint_auth_method !== 'none'
	) {
		throw new McpOAuthError(
			'invalid_client_metadata',
			'Only the public client method token_endpoint_auth_method=none is supported.'
		);
	}
	if (input.grant_types !== undefined) {
		if (
			!Array.isArray(input.grant_types) ||
			input.grant_types.some((grant) => grant !== 'authorization_code' && grant !== 'refresh_token')
		)
			throw new McpOAuthError('invalid_client_metadata', 'Unsupported grant type.');
	}
	if (input.response_types !== undefined) {
		if (!Array.isArray(input.response_types) || input.response_types.some((t) => t !== 'code'))
			throw new McpOAuthError('invalid_client_metadata', 'Unsupported response type.');
	}
	if (input.scope !== undefined && typeof input.scope === 'string') requestedScope(input.scope);
	const name =
		typeof input.client_name === 'string' && input.client_name.trim()
			? input.client_name.trim().slice(0, 100)
			: 'MCP client';
	const payload: ClientPayload = {
		v: 1,
		jti: randomUUID(),
		uris: redirectUris,
		name,
		iat: Math.floor(Date.now() / 1_000)
	};
	const clientId = seal(payload, 'gmcp1_');
	if (Buffer.byteLength(clientId) > MAX_CLIENT_ID_BYTES)
		throw new McpOAuthError(
			'invalid_client_metadata',
			'The registration is too large. Use fewer or shorter redirect URIs.'
		);
	return {
		// The version segment doubles as the public prefix so an access or refresh
		// token can never be confused for a client_id (and vice versa).
		clientId,
		redirectUris,
		name,
		issuedAt: payload.iat
	};
}

export function parseClientId(clientId: string): ClientRegistration {
	if (typeof clientId !== 'string' || Buffer.byteLength(clientId) > MAX_CLIENT_ID_BYTES)
		throw new McpOAuthError('invalid_client', 'The client identifier is invalid.');
	const payload = open<ClientPayload>(clientId, 'gmcp1_', 'invalid_client');
	if (payload.v !== 1 || !Array.isArray(payload.uris) || typeof payload.name !== 'string')
		throw new McpOAuthError('invalid_client', 'The client identifier is invalid.');
	return {
		clientId,
		redirectUris: payload.uris,
		name: payload.name,
		issuedAt: payload.iat
	};
}

export type AuthorizeValidation =
	| { ok: true; request: AuthorizeRequest }
	| { ok: false; error: string; errorDescription: string; redirectable: boolean };

export function validateAuthorizeParams(
	params: URLSearchParams,
	issuerOrigin: string,
	resource: string
): AuthorizeValidation {
	const clientId = params.get('client_id') ?? '';
	const redirectUri = params.get('redirect_uri') ?? '';
	let client: ClientRegistration;
	try {
		client = parseClientId(clientId);
	} catch {
		return {
			ok: false,
			error: 'invalid_client',
			errorDescription: 'The client identifier is unknown or malformed.',
			redirectable: false
		};
	}
	if (!redirectUri)
		return {
			ok: false,
			error: 'invalid_request',
			errorDescription: 'redirect_uri is required.',
			redirectable: false
		};
	if (!client.redirectUris.includes(redirectUri))
		return {
			ok: false,
			error: 'invalid_request',
			errorDescription: 'redirect_uri does not match a registered URI for this client.',
			redirectable: false
		};
	if (params.get('response_type') !== 'code')
		return {
			ok: false,
			error: 'unsupported_response_type',
			errorDescription: 'Only response_type=code is supported.',
			redirectable: true
		};
	const challenge = params.get('code_challenge') ?? '';
	if (!/^[A-Za-z0-9_-]{43}$/.test(challenge))
		return {
			ok: false,
			error: 'invalid_request',
			errorDescription: 'A PKCE code_challenge is required.',
			redirectable: true
		};
	if (params.get('code_challenge_method') !== 'S256')
		return {
			ok: false,
			error: 'invalid_request',
			errorDescription: 'code_challenge_method must be S256.',
			redirectable: true
		};
	const requestedResource = params.get('resource');
	if (requestedResource && requestedResource !== resource)
		return {
			ok: false,
			error: 'invalid_target',
			errorDescription: `The resource must be ${resource}.`,
			redirectable: true
		};
	let scopes: string[];
	try {
		scopes = requestedScope(params.get('scope'));
	} catch (cause) {
		return {
			ok: false,
			error: cause instanceof McpOAuthError ? cause.code : 'invalid_scope',
			errorDescription:
				cause instanceof McpOAuthError ? cause.message : 'The requested scope is invalid.',
			redirectable: true
		};
	}
	const state = params.get('state') ?? undefined;
	return {
		ok: true,
		request: {
			clientId: client.clientId,
			client,
			redirectUri,
			challenge,
			resource,
			scopes,
			...(state ? { state } : {})
		}
	};
}

export function issueAuthorizationCode(request: AuthorizeRequest, sessionToken: string): string {
	return seal({
		v: 1,
		typ: 'code',
		clientId: request.clientId,
		redirectUri: request.redirectUri,
		challenge: request.challenge,
		resource: request.resource,
		scope: request.scopes.join(' '),
		session: sessionToken,
		exp: Math.floor(Date.now() / 1_000) + AUTH_CODE_TTL_SECONDS
	} satisfies CodePayload);
}

export function verifyAuthorizationCode(
	code: string,
	expect: { clientId: string; redirectUri: string; verifier: string; resource?: string }
): CodePayload {
	const payload = open<CodePayload>(code, TOKEN_VERSION, 'invalid_grant');
	if (payload.v !== 1 || payload.typ !== 'code')
		throw new McpOAuthError('invalid_grant', 'The authorization code is not valid.');
	if (payload.exp <= Math.floor(Date.now() / 1_000))
		throw new McpOAuthError('invalid_grant', 'The authorization code has expired.');
	if (payload.clientId !== expect.clientId)
		throw new McpOAuthError(
			'invalid_grant',
			'The authorization code was issued to another client.'
		);
	if (payload.redirectUri !== expect.redirectUri)
		throw new McpOAuthError('invalid_grant', 'redirect_uri does not match the code.');
	if (expect.resource && payload.resource !== expect.resource)
		throw new McpOAuthError('invalid_target', 'The token was requested for another resource.');
	if (!/^[A-Za-z0-9\-._~]{43,128}$/.test(expect.verifier))
		throw new McpOAuthError('invalid_grant', 'The PKCE code_verifier is malformed.');
	const derived = createHash('sha256').update(expect.verifier, 'ascii').digest('base64url');
	if (derived !== payload.challenge)
		throw new McpOAuthError('invalid_grant', 'The PKCE code_verifier is incorrect.');
	return payload;
}

export type IssuedTokens = {
	familyId: string;
	refreshExpiresAt: number;
	accessToken: string;
	expiresIn: number;
	refreshToken: string;
	scope: string;
};

export function issueTokens(input: {
	clientId: string;
	resource: string;
	scope: string;
	sessionToken: string;
	familyId?: string;
}): IssuedTokens {
	const issuedAt = Math.floor(Date.now() / 1_000);
	const familyId = input.familyId ?? randomUUID();
	const refreshExpiresAt = issuedAt + sessionMaxAge;
	const shared = {
		familyId,
		clientId: input.clientId,
		resource: input.resource,
		scope: input.scope,
		session: input.sessionToken
	};
	return {
		familyId,
		refreshExpiresAt,
		accessToken: seal({
			v: 1,
			typ: 'access',
			...shared,
			exp: issuedAt + ACCESS_TOKEN_TTL_SECONDS
		} satisfies AccessPayload),
		expiresIn: ACCESS_TOKEN_TTL_SECONDS,
		// The refresh credential carries the app-session TTL, matching the browser
		// session's rolling lifetime; the embedded session is re-serialized on use.
		refreshToken: seal({
			v: 1,
			typ: 'refresh',
			...shared,
			exp: refreshExpiresAt
		} satisfies RefreshPayload),
		scope: input.scope
	};
}

export function verifyAccessToken(token: string, expectedResource: string): AccessPayload {
	const payload = open<AccessPayload>(token, TOKEN_VERSION, 'invalid_token');
	if (payload.v !== 1 || payload.typ !== 'access' || typeof payload.familyId !== 'string')
		throw new McpOAuthError('invalid_token', 'The access token is not valid.');
	if (payload.exp <= Math.floor(Date.now() / 1_000))
		throw new McpOAuthError('invalid_token', 'The access token has expired.');
	if (payload.resource !== expectedResource)
		throw new McpOAuthError('invalid_token', 'The access token was issued for another resource.');
	if (!payload.scope.split(' ').includes('studentvue:read'))
		throw new McpOAuthError('invalid_token', 'The access token lacks the studentvue:read scope.');
	return payload;
}

export function verifyRefreshToken(token: string): RefreshPayload {
	const payload = open<RefreshPayload>(token, TOKEN_VERSION, 'invalid_grant');
	if (payload.v !== 1 || payload.typ !== 'refresh' || typeof payload.familyId !== 'string')
		throw new McpOAuthError('invalid_grant', 'The refresh token is not valid.');
	if (payload.exp <= Math.floor(Date.now() / 1_000))
		throw new McpOAuthError('invalid_grant', 'The refresh token has expired.');
	return payload;
}

/** Verifier-validity check shared by the token endpoint and tests. */
export function isValidCodeVerifier(verifier: string) {
	return /^[A-Za-z0-9\-._~]{43,128}$/.test(verifier);
}

type AttemptState = { count: number; resetAt: number };

/**
 * A small in-memory sliding-window limiter. It intentionally loses state on a
 * cold start: it protects the sign-in and registration endpoints from basic
 * bursts without becoming a store of anything user-identifying.
 */
export function consumeAttempt(
	attempts: Map<string, AttemptState>,
	key: string,
	maximum: number,
	windowMs: number,
	now = Date.now()
) {
	for (const [entryKey, entry] of attempts) if (entry.resetAt <= now) attempts.delete(entryKey);
	const existing = attempts.get(key);
	if (existing && existing.resetAt > now && existing.count >= maximum) return false;
	if (!existing && attempts.size >= 10_000) return false;
	attempts.set(
		key,
		existing && existing.resetAt > now
			? { count: existing.count + 1, resetAt: existing.resetAt }
			: { count: 1, resetAt: now + windowMs }
	);
	return true;
}

function seal(payload: unknown, version = TOKEN_VERSION): string {
	const compressed = deflateRawSync(Buffer.from(JSON.stringify(payload)), { level: 9 });
	const iv = randomBytes(12);
	const cipher = createCipheriv('aes-256-gcm', oauthEncryptionKey(), iv);
	cipher.setAAD(TOKEN_AAD);
	const encrypted = Buffer.concat([cipher.update(compressed), cipher.final()]);
	const token = [
		version,
		iv.toString('base64url'),
		encrypted.toString('base64url'),
		cipher.getAuthTag().toString('base64url')
	].join('.');
	if (Buffer.byteLength(token) > MAX_OAUTH_TOKEN_BYTES)
		throw new McpOAuthError('server_error', 'The issued credential is too large.');
	return token;
}

function open<T>(token: string, expectedVersion: string, errorCode: string): T {
	if (typeof token !== 'string' || Buffer.byteLength(token) > MAX_OAUTH_TOKEN_BYTES)
		throw new McpOAuthError(errorCode, 'The credential is malformed.');
	const [version, encodedIv, encodedCiphertext, encodedTag, extra] = token.split('.');
	if (
		version !== expectedVersion ||
		extra !== undefined ||
		!encodedIv ||
		!encodedCiphertext ||
		!encodedTag ||
		![encodedIv, encodedCiphertext, encodedTag].every((part) => /^[A-Za-z0-9_-]+$/.test(part))
	)
		throw new McpOAuthError(errorCode, 'The credential format is invalid.');
	try {
		const iv = decodeCanonicalBase64Url(encodedIv);
		const ciphertext = decodeCanonicalBase64Url(encodedCiphertext);
		const tag = decodeCanonicalBase64Url(encodedTag);
		if (iv.byteLength !== 12 || tag.byteLength !== 16 || ciphertext.byteLength === 0)
			throw new McpOAuthError(errorCode, 'The credential format is invalid.');
		const decipher = createDecipheriv('aes-256-gcm', oauthEncryptionKey(), iv);
		decipher.setAAD(TOKEN_AAD);
		decipher.setAuthTag(tag);
		const compressed = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
		const json = inflateRawSync(compressed, { maxOutputLength: MAX_OAUTH_PAYLOAD_BYTES });
		return JSON.parse(json.toString('utf8')) as T;
	} catch (cause) {
		if (cause instanceof McpOAuthError) throw cause;
		throw new McpOAuthError(errorCode, 'The credential could not be verified.');
	}
}

function decodeCanonicalBase64Url(value: string) {
	const decoded = Buffer.from(value, 'base64url');
	if (decoded.toString('base64url') !== value)
		throw new McpOAuthError('invalid_token', 'The credential encoding is invalid.');
	return decoded;
}

let developmentKey: Buffer | undefined;

function oauthEncryptionKey(): Buffer {
	const configured = process.env.GRADEMAXXING_SESSION_SECRET;
	if (!configured) {
		if (process.env.NODE_ENV === 'production')
			throw new StudentSessionConfigurationError(
				'GRADEMAXXING_SESSION_SECRET must be configured in production.'
			);
		developmentKey ??= randomBytes(32);
		return developmentKey;
	}
	if (configured.length < 32)
		throw new StudentSessionConfigurationError(
			'GRADEMAXXING_SESSION_SECRET must contain at least 32 characters.'
		);
	// Same key material as the browser session, separated by the AAD domain so a
	// session cookie can never be replayed as an MCP credential or vice versa.
	return createHash('sha256').update(configured, 'utf8').digest();
}
