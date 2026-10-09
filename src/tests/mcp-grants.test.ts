import {
	consumeAuthorizationCode,
	createRefreshFamily,
	requireActiveRefreshFamily,
	rotateRefreshFamily,
	withMcpSessionLease
} from '$lib/server/mcp/grants';
import {
	issueAuthorizationCode,
	issueTokens,
	registerClient,
	validateAuthorizeParams
} from '$lib/server/mcp/oauth';
import { Pxp2Client } from '$lib/server/pxp2';
import { serializeStudentSession } from '$lib/server/student-session';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import { afterEach, expect, test, vi } from 'vitest';
import { POST as mcpPOST } from '../routes/mcp/+server';
import { POST as revokePOST } from '../routes/mcp/revoke/+server';
import { POST as tokenPOST } from '../routes/mcp/token/+server';

const databases: DatabaseSync[] = [];
afterEach(() => {
	for (const db of databases.splice(0)) db.close();
	vi.unstubAllEnvs();
});

function fixtureDatabase() {
	const db = new DatabaseSync(':memory:');
	databases.push(db);
	db.exec(readFileSync('migrations/0007_mcp_oauth_grants.sql', 'utf8'));
	const platform = {
		env: {
			GRADEMAXXING_USAGE_DB: {
				prepare(sql: string) {
					let values: SQLInputValue[] = [];
					const statement = {
						bind(...input: SQLInputValue[]) {
							values = input;
							return statement;
						},
						async run() {
							return { meta: { changes: Number(db.prepare(sql).run(...values).changes) } };
						},
						async first() {
							return db.prepare(sql).get(...values) ?? null;
						}
					};
					return statement;
				}
			}
		}
	};
	return { db, platform };
}

const expiry = () => Math.floor(Date.now() / 1000) + 3600;

test('a code can be redeemed only once, including concurrent exchanges and another store client', async () => {
	const { db, platform } = fixtureDatabase();
	const outcomes = await Promise.allSettled([
		consumeAuthorizationCode(platform, 'synthetic-authorization-code', expiry()),
		consumeAuthorizationCode({ env: { ...platform.env } }, 'synthetic-authorization-code', expiry())
	]);
	expect(outcomes.filter((outcome) => outcome.status === 'fulfilled')).toHaveLength(1);
	expect(outcomes.filter((outcome) => outcome.status === 'rejected')).toHaveLength(1);
	const rows = db.prepare('SELECT * FROM mcp_oauth_grants').all();
	expect(rows).toHaveLength(1);
	expect(JSON.stringify(rows)).not.toContain('synthetic-authorization-code');
});

test('rotation invalidates the previous refresh token and replay revokes the whole family', async () => {
	const { db, platform } = fixtureDatabase();
	await createRefreshFamily(platform, 'synthetic-family', 'original-token', expiry());
	await rotateRefreshFamily(
		platform,
		'synthetic-family',
		'original-token',
		'rotated-token',
		expiry()
	);
	await requireActiveRefreshFamily(platform, 'synthetic-family');
	await expect(
		rotateRefreshFamily(platform, 'synthetic-family', 'original-token', 'attacker-token', expiry())
	).rejects.toThrow('reused');
	await expect(requireActiveRefreshFamily(platform, 'synthetic-family')).rejects.toThrow('revoked');
	await expect(
		rotateRefreshFamily(platform, 'synthetic-family', 'rotated-token', 'next-token', expiry())
	).rejects.toThrow('revoked');
	const stored = JSON.stringify(db.prepare('SELECT * FROM mcp_oauth_grants').all());
	for (const secret of ['synthetic-family', 'original-token', 'rotated-token'])
		expect(stored).not.toContain(secret);
});

test('production grants fail closed without a shared durable store', async () => {
	vi.stubEnv('NODE_ENV', 'production');
	await expect(consumeAuthorizationCode(undefined, 'synthetic', expiry())).rejects.toThrow(
		'unavailable'
	);
	await expect(createRefreshFamily(undefined, 'family', 'token', expiry())).rejects.toThrow(
		'unavailable'
	);
});

test('expired families cannot grant access', async () => {
	const { platform } = fixtureDatabase();
	await createRefreshFamily(platform, 'expired-family', 'token', Math.floor(Date.now() / 1000) - 1);
	await expect(requireActiveRefreshFamily(platform, 'expired-family')).rejects.toThrow('revoked');
});

test('a database outage returns a retryable response rather than invalidating a valid connection', async () => {
	const { db, platform } = fixtureDatabase();
	db.exec('DROP TABLE mcp_oauth_grants');
	const tokens = issueTokens({
		clientId: 'synthetic-client',
		resource: 'https://example.test/mcp',
		scope: 'studentvue:read',
		sessionToken: 'synthetic-session'
	});
	const response = await mcpPOST({
		url: new URL('https://example.test/mcp'),
		platform,
		request: new Request('https://example.test/mcp', {
			method: 'POST',
			headers: { Authorization: `Bearer ${tokens.accessToken}` },
			body: '{}'
		})
	} as unknown as Parameters<typeof mcpPOST>[0]);
	expect(response.status).toBe(503);
	expect(await response.json()).toMatchObject({ error: 'temporarily_unavailable' });
	expect(response.headers.has('WWW-Authenticate')).toBe(false);
});

test('portal operations cannot overlap across HTTP handlers and leases release on failure', async () => {
	const { platform } = fixtureDatabase();
	let finish!: () => void;
	const first = withMcpSessionLease(
		platform,
		'synthetic-session',
		() =>
			new Promise<void>((resolve) => {
				finish = resolve;
			})
	);
	await vi.waitFor(() => expect(finish).toBeDefined());
	await expect(
		withMcpSessionLease(platform, 'synthetic-session', async () => 'overlap')
	).rejects.toThrow('in progress');
	finish();
	await first;
	await expect(
		withMcpSessionLease(platform, 'synthetic-session', async () => {
			throw new Error('synthetic failure');
		})
	).rejects.toThrow('synthetic failure');
	await expect(
		withMcpSessionLease(platform, 'synthetic-session', async () => 'next operation')
	).resolves.toBe('next operation');
});

test('token routes bind public clients and audiences, reject replays, and expose actual CORS responses', async () => {
	const { platform } = fixtureDatabase();
	const origin = 'https://example.test';
	const resource = `${origin}/mcp`;
	const verifier = 'v'.repeat(43);
	const client = registerClient({ redirect_uris: ['https://chatgpt.com/callback'] });
	const validation = validateAuthorizeParams(
		new URLSearchParams({
			client_id: client.clientId,
			redirect_uri: client.redirectUris[0]!,
			response_type: 'code',
			code_challenge: createHash('sha256').update(verifier).digest('base64url'),
			code_challenge_method: 'S256'
		}),
		origin,
		resource
	);
	if (!validation.ok) throw new Error('Synthetic registration failed');
	const session = serializeStudentSession({
		client: Pxp2Client.resume({
			baseUrl: 'https://ca-example-psv.edupoint.com/',
			cookies: { ASP_NET_SessionId: 'synthetic-cookie' }
		}),
		clientSessionId: 'd9428888-122b-4f22-bc7f-1d95e4097a11',
		username: 'synthetic-student',
		domain: 'ca-example-psv.edupoint.com',
		expiresAt: Date.now() + 60_000,
		operationTail: Promise.resolve(),
		queuedOperations: 0
	});
	const code = issueAuthorizationCode(validation.request, session);
	const exchange = async (
		fields: Record<string, string>,
		endpoint = `${origin}/mcp/token`,
		handler: typeof tokenPOST | typeof revokePOST = tokenPOST
	) =>
		handler({
			url: new URL(endpoint),
			platform,
			getClientAddress: () => 'test-route-client',
			request: new Request(endpoint, {
				method: 'POST',
				headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
				body: new URLSearchParams(fields)
			})
		} as unknown as Parameters<typeof tokenPOST>[0] & Parameters<typeof revokePOST>[0]);
	const fields = {
		grant_type: 'authorization_code',
		code,
		client_id: client.clientId,
		redirect_uri: client.redirectUris[0]!,
		code_verifier: verifier
	};
	const missingClient = { ...fields };
	delete (missingClient as Partial<typeof fields>).client_id;
	expect((await exchange(missingClient)).status).toBe(400);
	const first = await exchange(fields);
	expect(first.status).toBe(200);
	expect(first.headers.get('Access-Control-Allow-Origin')).toBe('*');
	const tokens = await first.json();
	expect((await exchange(fields)).status).toBe(400);
	const refresh = {
		grant_type: 'refresh_token',
		client_id: client.clientId,
		refresh_token: tokens.refresh_token
	};
	expect((await exchange(refresh, 'https://different.test/mcp/token')).status).toBe(400);
	const keepAlive = vi.spyOn(Pxp2Client.prototype, 'keepAlive').mockResolvedValue(undefined);
	try {
		const rotated = await exchange(refresh);
		expect(rotated.status).toBe(200);
		const next = await rotated.json();
		expect((await exchange(refresh)).status).toBe(400);
		expect(keepAlive).toHaveBeenCalledTimes(1);
		expect((await exchange({ ...refresh, refresh_token: next.refresh_token })).status).toBe(400);
		const freshCode = issueAuthorizationCode(validation.request, session);
		const newTokens = await (await exchange({ ...fields, code: freshCode })).json();
		const revoked = await exchange(
			{ token: newTokens.refresh_token, client_id: client.clientId },
			`${origin}/mcp/revoke`,
			revokePOST
		);
		expect(revoked.status).toBe(200);
		expect((await exchange({ ...refresh, refresh_token: newTokens.refresh_token })).status).toBe(
			400
		);
	} finally {
		keepAlive.mockRestore();
	}
});
