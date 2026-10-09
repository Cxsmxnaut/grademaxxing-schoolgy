import { createHash, randomUUID } from 'node:crypto';
import { McpOAuthError } from './oauth';

type Statement = {
	bind: (...values: unknown[]) => Statement;
	run: () => Promise<{ meta: { changes: number } }>;
	first: <T>() => Promise<T | null>;
};
type Database = { prepare: (sql: string) => Statement };
type Platform = { env?: { GRADEMAXXING_USAGE_DB?: Database } };
type Grant = { current_token_hash: string; expires_at: number; revoked: number };
const developmentGrants = new Map<string, Grant>();

function hash(value: string) {
	return createHash('sha256').update(value).digest('hex');
}

function database(platform: unknown) {
	const db = (platform as Platform | undefined)?.env?.GRADEMAXXING_USAGE_DB;
	if (!db && process.env.NODE_ENV === 'production')
		throw new McpOAuthError('temporarily_unavailable', 'The OAuth grant store is unavailable.');
	return db;
}

function storeUnavailable(): never {
	throw new McpOAuthError('temporarily_unavailable', 'The OAuth grant store is unavailable.');
}

async function execute(db: Database, sql: string, ...values: unknown[]) {
	try {
		return await db
			.prepare(sql)
			.bind(...values)
			.run();
	} catch {
		return storeUnavailable();
	}
}

async function readGrant(db: Database, key: string) {
	try {
		return await db
			.prepare(
				'SELECT current_token_hash, expires_at, revoked FROM mcp_oauth_grants WHERE grant_key = ?'
			)
			.bind(key)
			.first<Grant>();
	} catch {
		return storeUnavailable();
	}
}

function pruneDevelopmentGrants() {
	const now = Math.floor(Date.now() / 1000);
	for (const [key, grant] of developmentGrants)
		if (grant.expires_at <= now) developmentGrants.delete(key);
	if (developmentGrants.size >= 10_000)
		throw new McpOAuthError('temporarily_unavailable', 'The OAuth grant store is busy.');
}

// Store only opaque hashes and expiry/revocation metadata. Never persist a
// bearer credential, portal session, username, password, or student record.
export async function consumeAuthorizationCode(platform: unknown, code: string, expiresAt: number) {
	const db = database(platform);
	const key = `code:${hash(code)}`;
	if (db) {
		await execute(
			db,
			'DELETE FROM mcp_oauth_grants WHERE expires_at <= ?',
			Math.floor(Date.now() / 1000)
		);
		const result = await execute(
			db,
			'INSERT OR IGNORE INTO mcp_oauth_grants (grant_key, current_token_hash, expires_at, revoked) VALUES (?, ?, ?, 0)',
			key,
			'',
			expiresAt
		);
		if (result.meta.changes === 1) return;
	} else {
		pruneDevelopmentGrants();
		if (!developmentGrants.has(key)) {
			developmentGrants.set(key, { current_token_hash: '', expires_at: expiresAt, revoked: 0 });
			return;
		}
	}
	throw new McpOAuthError('invalid_grant', 'The authorization code has already been used.');
}

export async function createRefreshFamily(
	platform: unknown,
	familyId: string,
	token: string,
	expiresAt: number
) {
	const db = database(platform);
	const key = `family:${hash(familyId)}`;
	const tokenHash = hash(token);
	if (db) {
		await execute(
			db,
			'INSERT INTO mcp_oauth_grants (grant_key, current_token_hash, expires_at, revoked) VALUES (?, ?, ?, 0)',
			key,
			tokenHash,
			expiresAt
		);
	} else {
		pruneDevelopmentGrants();
		developmentGrants.set(key, {
			current_token_hash: tokenHash,
			expires_at: expiresAt,
			revoked: 0
		});
	}
}

export async function rotateRefreshFamily(
	platform: unknown,
	familyId: string,
	oldToken: string,
	nextToken: string,
	expiresAt: number
) {
	const db = database(platform);
	const key = `family:${hash(familyId)}`;
	const oldHash = hash(oldToken);
	const nextHash = hash(nextToken);
	const now = Math.floor(Date.now() / 1000);
	if (db) {
		const result = await execute(
			db,
			'UPDATE mcp_oauth_grants SET current_token_hash = ?, expires_at = ? WHERE grant_key = ? AND current_token_hash = ? AND revoked = 0 AND expires_at > ?',
			nextHash,
			expiresAt,
			key,
			oldHash,
			now
		);
		if (result.meta.changes === 1) return;
		await execute(db, 'UPDATE mcp_oauth_grants SET revoked = 1 WHERE grant_key = ?', key);
	} else {
		const grant = developmentGrants.get(key);
		if (grant && !grant.revoked && grant.expires_at > now && grant.current_token_hash === oldHash) {
			developmentGrants.set(key, {
				current_token_hash: nextHash,
				expires_at: expiresAt,
				revoked: 0
			});
			return;
		}
		if (grant) grant.revoked = 1;
	}
	throw new McpOAuthError(
		'invalid_grant',
		'The refresh token was reused or revoked. Reconnect to continue.'
	);
}

export async function requireActiveRefreshFamily(
	platform: unknown,
	familyId: string,
	refreshToken?: string
) {
	const db = database(platform);
	const key = `family:${hash(familyId)}`;
	const grant = db ? await readGrant(db, key) : developmentGrants.get(key);
	if (!grant || grant.revoked || grant.expires_at <= Math.floor(Date.now() / 1000))
		throw new McpOAuthError('invalid_token', 'The connection was revoked. Reconnect to continue.');
	if (refreshToken && grant.current_token_hash !== hash(refreshToken)) {
		await revokeRefreshFamily(platform, familyId);
		throw new McpOAuthError(
			'invalid_grant',
			'The refresh token was reused. Reconnect to continue.'
		);
	}
}

/** Prevent separate MCP HTTP requests from racing the portal's mutable focus. */
export async function withMcpSessionLease<T>(
	platform: unknown,
	sessionId: string,
	operation: () => Promise<T>
): Promise<T> {
	const db = database(platform);
	const key = `lease:${hash(sessionId)}`;
	const owner = hash(randomUUID());
	const now = Math.floor(Date.now() / 1000);
	const expiresAt = now + 600;
	let acquired = false;
	if (db) {
		const result = await execute(
			db,
			'INSERT INTO mcp_oauth_grants (grant_key, current_token_hash, expires_at, revoked) VALUES (?, ?, ?, 0) ON CONFLICT(grant_key) DO UPDATE SET current_token_hash = excluded.current_token_hash, expires_at = excluded.expires_at WHERE mcp_oauth_grants.expires_at <= ?',
			key,
			owner,
			expiresAt,
			now
		);
		acquired = result.meta.changes === 1;
	} else {
		const current = developmentGrants.get(key);
		if (!current || current.expires_at <= now) {
			pruneDevelopmentGrants();
			developmentGrants.set(key, { current_token_hash: owner, expires_at: expiresAt, revoked: 0 });
			acquired = true;
		}
	}
	if (!acquired)
		throw new McpOAuthError(
			'temporarily_unavailable',
			'Another StudentVUE operation is in progress. Retry shortly.'
		);
	try {
		return await operation();
	} finally {
		if (db)
			await execute(
				db,
				'DELETE FROM mcp_oauth_grants WHERE grant_key = ? AND current_token_hash = ?',
				key,
				owner
			);
		else if (developmentGrants.get(key)?.current_token_hash === owner)
			developmentGrants.delete(key);
	}
}

export async function revokeRefreshFamily(platform: unknown, familyId: string) {
	const db = database(platform);
	const key = `family:${hash(familyId)}`;
	if (db) await execute(db, 'UPDATE mcp_oauth_grants SET revoked = 1 WHERE grant_key = ?', key);
	else {
		const grant = developmentGrants.get(key);
		if (grant) grant.revoked = 1;
	}
}
