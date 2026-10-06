import { expect, test } from '@playwright/test';
import { createHash } from 'node:crypto';

const VERIFIER = 'a'.repeat(43);
const CHALLENGE = createHash('sha256').update(VERIFIER).digest('base64url');

test('MCP OAuth discovery documents are served at every well-known path', async ({
	request,
	baseURL
}) => {
	const origin = new URL(baseURL!).origin;

	const resource = await request.get('/.well-known/oauth-protected-resource');
	expect(resource.status()).toBe(200);
	expect(resource.headers()['content-type']).toContain('application/json');
	expect(await resource.json()).toMatchObject({
		resource: `${origin}/mcp`,
		authorization_servers: [origin],
		bearer_methods_supported: ['header'],
		scopes_supported: expect.arrayContaining(['studentvue:read', 'offline_access'])
	});

	const scoped = await request.get('/.well-known/oauth-protected-resource/mcp');
	expect(scoped.status()).toBe(200);
	expect(await scoped.json()).toMatchObject({ resource: `${origin}/mcp` });

	const server = await request.get('/.well-known/oauth-authorization-server');
	expect(server.status()).toBe(200);
	const metadata = await server.json();
	expect(metadata).toMatchObject({
		issuer: origin,
		authorization_endpoint: `${origin}/mcp/authorize`,
		token_endpoint: `${origin}/mcp/token`,
		registration_endpoint: `${origin}/mcp/register`,
		code_challenge_methods_supported: ['S256'],
		token_endpoint_auth_methods_supported: ['none'],
		authorization_response_iss_parameter_supported: true,
		grant_types_supported: ['authorization_code', 'refresh_token']
	});

	const oidc = await request.get('/.well-known/openid-configuration');
	expect(oidc.status()).toBe(200);
	expect(await oidc.json()).toMatchObject({ issuer: origin });

	const unknown = await request.get('/.well-known/not-a-document');
	expect(unknown.status()).toBe(404);
});

test('MCP endpoint challenges unauthenticated callers and supports CORS preflight', async ({
	request
}) => {
	const bare = await request.post('/mcp', {
		data: { jsonrpc: '2.0', id: 1, method: 'ping' }
	});
	expect(bare.status()).toBe(401);
	const challenge = bare.headers()['www-authenticate'];
	expect(challenge).toContain('Bearer resource_metadata=');
	expect(challenge).toContain('/.well-known/oauth-protected-resource');
	expect(challenge).toContain('scope="studentvue:read"');
	expect(bare.headers()['access-control-allow-origin']).toBe('*');
	expect(bare.headers()['cache-control']).toContain('no-store');

	const garbage = await request.post('/mcp', {
		headers: { Authorization: 'Bearer not-a-real-token' },
		data: { jsonrpc: '2.0', id: 1, method: 'ping' }
	});
	expect(garbage.status()).toBe(401);
	expect(garbage.headers()['www-authenticate']).toContain('error="invalid_token"');

	const get = await request.get('/mcp');
	expect(get.status()).toBe(405);
	expect(get.headers()['allow']).toContain('POST');

	const preflight = await request.fetch('/mcp', { method: 'OPTIONS' });
	expect(preflight.status()).toBe(204);
	expect(preflight.headers()['access-control-allow-origin']).toBe('*');
	expect(preflight.headers()['access-control-allow-headers']).toContain('Authorization');
});

test('dynamic client registration enforces the redirect allowlist', async ({ request }) => {
	const accepted = await request.post('/mcp/register', {
		data: {
			redirect_uris: ['https://chatgpt.com/connector/oauth/playwright'],
			client_name: 'Playwright'
		}
	});
	expect(accepted.status()).toBe(201);
	const registration = await accepted.json();
	expect(registration.client_id.startsWith('gmcp1_')).toBe(true);
	expect(registration.redirect_uris).toEqual(['https://chatgpt.com/connector/oauth/playwright']);
	expect(registration.token_endpoint_auth_method).toBe('none');
	expect(accepted.headers()['cache-control']).toContain('no-store');

	const rejected = await request.post('/mcp/register', {
		data: { redirect_uris: ['https://evil.test/cb'] }
	});
	expect(rejected.status()).toBe(400);
	expect(await rejected.json()).toMatchObject({ error: 'invalid_client_metadata' });

	const wrongType = await request.post('/mcp/register', {
		headers: { 'Content-Type': 'text/plain' },
		data: '{}'
	});
	expect(wrongType.status()).toBe(415);
});

test('token endpoint answers with OAuth errors for malformed exchanges', async ({ request }) => {
	const wrongType = await request.post('/mcp/token', {
		headers: { 'Content-Type': 'application/json' },
		data: { grant_type: 'authorization_code' }
	});
	expect(wrongType.status()).toBe(415);

	const missingCode = await request.post('/mcp/token', {
		headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
		data: new URLSearchParams({ grant_type: 'authorization_code' }).toString()
	});
	expect(missingCode.status()).toBe(400);
	expect(await missingCode.json()).toMatchObject({ error: 'invalid_request' });
	expect(missingCode.headers()['cache-control']).toContain('no-store');

	const wrongGrant = await request.post('/mcp/token', {
		headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
		data: new URLSearchParams({ grant_type: 'password' }).toString()
	});
	expect(wrongGrant.status()).toBe(400);
	expect(await wrongGrant.json()).toMatchObject({ error: 'unsupported_grant_type' });
});

test('authorize endpoint renders the sign-in and consent page without scripts', async ({
	request,
	baseURL
}) => {
	const origin = new URL(baseURL!).origin;
	const register = await request.post('/mcp/register', {
		data: {
			redirect_uris: ['https://claude.ai/api/mcp/auth_callback'],
			client_name: 'Claude'
		}
	});
	const { client_id: clientId } = await register.json();

	const params = new URLSearchParams({
		client_id: clientId,
		redirect_uri: 'https://claude.ai/api/mcp/auth_callback',
		response_type: 'code',
		code_challenge: CHALLENGE,
		code_challenge_method: 'S256',
		state: 'state-123',
		resource: `${origin}/mcp`
	});
	const page = await request.get(`/mcp/authorize?${params}`);
	expect(page.status()).toBe(200);
	expect(page.headers()['content-type']).toContain('text/html');
	expect(page.headers()['cache-control']).toContain('no-store');
	expect(page.headers()['content-security-policy']).toContain("default-src 'none'");
	const html = await page.text();
	expect(html).toContain('Connect Claude to your StudentVUE data');
	expect(html).toContain('read-only');
	expect(html).toContain('never stored by Grademaxxing');
	expect(html).toContain('name="code_challenge"');
	expect(html).toContain('value="state-123"');
	expect(html).toContain('name="password"');
	expect(html).not.toContain('<script');
	// Credentials are never pre-filled; only the OAuth parameters are preserved.
	expect(html).not.toContain('value="state-123" name="password"');

	// Unknown clients fail locally instead of redirecting anywhere.
	const unknown = await request.get(
		`/mcp/authorize?${new URLSearchParams({
			client_id: 'gmcp1_zzz',
			redirect_uri: 'https://claude.ai/api/mcp/auth_callback',
			response_type: 'code',
			code_challenge: CHALLENGE,
			code_challenge_method: 'S256'
		})}`
	);
	expect(unknown.status()).toBe(400);
	expect(await unknown.text()).toContain('not valid');

	// Redirectable protocol errors bounce back to the host with RFC 9207 iss.
	const badResponseType = await request.get(`/mcp/authorize?${params}`, { maxRedirects: 0 });
	expect(badResponseType.status()).toBe(200);
	const badParams = new URLSearchParams(params);
	badParams.set('response_type', 'token');
	const redirected = await request.get(`/mcp/authorize?${badParams}`, { maxRedirects: 0 });
	expect(redirected.status()).toBe(302);
	const location = redirected.headers()['location'];
	expect(location).toBeTruthy();
	expect(location!.startsWith('https://claude.ai/api/mcp/auth_callback')).toBe(true);
	const locationParams = new URL(location!).searchParams;
	expect(locationParams.get('error')).toBe('unsupported_response_type');
	expect(locationParams.get('state')).toBe('state-123');
	expect(locationParams.get('iss')).toBe(origin);
});

test('authorize accepts ChatGPT-style cross-site form posts', async ({ request, baseURL }) => {
	const register = await request.post('/mcp/register', {
		data: {
			redirect_uris: ['https://chatgpt.com/connector/oauth/callback'],
			client_name: 'ChatGPT'
		}
	});
	expect(register.status()).toBe(201);
	const { client_id: clientId } = await register.json();
	const params = {
		client_id: clientId,
		redirect_uri: 'https://chatgpt.com/connector/oauth/callback',
		response_type: 'code',
		code_challenge: CHALLENGE,
		code_challenge_method: 'S256',
		state: 'state-456',
		resource: `${new URL(baseURL!).origin}/mcp`
	};

	// ChatGPT posts the sign-in form with its own Origin and a cross-site
	// Sec-Fetch-Site. The endpoint must reach credential validation instead of
	// rejecting the navigation: missing credentials re-render the form (400).
	const posted = await request.post('/mcp/authorize', {
		headers: {
			'Content-Type': 'application/x-www-form-urlencoded',
			Origin: 'https://chatgpt.com',
			'Sec-Fetch-Site': 'cross-site',
			'Sec-Fetch-Mode': 'navigate',
			'Sec-Fetch-Dest': 'document'
		},
		data: new URLSearchParams({
			...params,
			domain: '',
			username: '',
			password: ''
		}).toString()
	});
	expect(posted.status()).toBe(400);
	const body = await posted.text();
	expect(body).not.toContain('Cross-site request blocked');
	expect(body).toContain('Enter your district StudentVUE URL');

	// Cross-site posts still fail protocol validation correctly (400, not 403).
	const invalid = await request.post('/mcp/authorize', {
		headers: {
			'Content-Type': 'application/x-www-form-urlencoded',
			Origin: 'https://chatgpt.com',
			'Sec-Fetch-Site': 'cross-site'
		},
		data: new URLSearchParams({
			...params,
			client_id: 'gmcp1_zzz',
			domain: 'example.test',
			username: 'student',
			password: 'irrelevant'
		}).toString()
	});
	expect(invalid.status()).toBe(400);
	expect(await invalid.text()).toContain('not valid');
});
