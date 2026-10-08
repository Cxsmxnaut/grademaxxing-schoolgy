import { createHash, createHmac, randomUUID, timingSafeEqual } from 'node:crypto';

export const adminSessionCookie =
	process.env.NODE_ENV === 'production' ? '__Host-grademaxxing_admin' : 'grademaxxing_admin';
const adminSessionDurationMs = 8 * 60 * 60 * 1000;

/**
 * The admin console ships with one operator account. The password is stored as
 * a SHA-256 digest so the plaintext never reaches Git; the username is matched
 * case-insensitively after whitespace normalization.
 */
const adminConsoleUser = {
	username: 'bhavith lolakapuri',
	displayName: 'Bhavith Lolakapuri',
	role: 'Super Admin',
	passwordHash: 'd676133d537460a200b050b87e60b907f6165d4c19b4702c418d7002208ff59f'
} as const;

/**
 * Fallback signing secret so the console works with no environment setup.
 * Deployments should still set GRADEMAXXING_ADMIN_SECRET (see wrangler.jsonc).
 */
const fallbackSessionSecret = 'grademaxxing-admin-console-fallback-v1-3f9a2c7e5b8d41a6';

export type AdminUser = {
	username: string;
	displayName: string;
	role: string;
};

export const adminConsoleIdentity: AdminUser = {
	username: adminConsoleUser.username,
	displayName: adminConsoleUser.displayName,
	role: adminConsoleUser.role
};

function configuredSessionSecret() {
	const secret = process.env.GRADEMAXXING_ADMIN_SECRET;
	return secret && secret.length >= 32 ? secret : fallbackSessionSecret;
}

function configuredPasswordHash() {
	const hash = process.env.GRADEMAXXING_ADMIN_PASSWORD_HASH;
	return hash && /^[a-f0-9]{64}$/i.test(hash) ? hash.toLowerCase() : undefined;
}

function fixedLengthHash(value: string) {
	return createHash('sha256').update(value).digest();
}

function signaturesMatch(expected: string, supplied: string) {
	return timingSafeEqual(fixedLengthHash(expected), fixedLengthHash(supplied));
}

function digestMatches(digest: string, password: string) {
	return signaturesMatch(digest, createHash('sha256').update(password).digest('hex'));
}

function normalizeUsername(username: string) {
	return username.trim().toLowerCase().replace(/\s+/g, ' ');
}

export function verifyAdminCredentials(username: string, password: string): AdminUser | undefined {
	const normalized = normalizeUsername(username);
	if (
		normalized === adminConsoleUser.username &&
		digestMatches(adminConsoleUser.passwordHash, password)
	)
		return {
			username: adminConsoleUser.username,
			displayName: adminConsoleUser.displayName,
			role: adminConsoleUser.role
		};
	// An environment-configured password keeps working for operators who rotate it.
	const passwordHash = configuredPasswordHash();
	if (passwordHash && digestMatches(passwordHash, password))
		return {
			username: normalized || 'admin',
			displayName: normalized || 'Administrator',
			role: 'Administrator'
		};
	return undefined;
}

export function verifyAdminPassword(password: string) {
	const passwordHash = configuredPasswordHash();
	return Boolean(
		digestMatches(adminConsoleUser.passwordHash, password) ||
		(passwordHash && digestMatches(passwordHash, password))
	);
}

export function createAdminSession() {
	const secret = configuredSessionSecret();
	if (!secret) return undefined;
	const payload = `v1.${Date.now() + adminSessionDurationMs}.${randomUUID()}`;
	const signature = createHmac('sha256', secret).update(payload).digest('base64url');
	return `${payload}.${signature}`;
}

export function validAdminSession(token: string | undefined) {
	const secret = configuredSessionSecret();
	if (!secret || !token) return false;
	const [version, expiresAt, nonce, signature, extra] = token.split('.');
	if (
		version !== 'v1' ||
		!expiresAt ||
		!nonce ||
		!signature ||
		extra !== undefined ||
		!/^\d+$/.test(expiresAt) ||
		!/^[0-9a-f-]{36}$/i.test(nonce) ||
		!/^[A-Za-z0-9_-]+$/.test(signature) ||
		Number(expiresAt) < Date.now()
	)
		return false;
	const payload = `${version}.${expiresAt}.${nonce}`;
	const expected = createHmac('sha256', secret).update(payload).digest('base64url');
	return signaturesMatch(expected, signature);
}

export const adminSessionMaxAge = adminSessionDurationMs / 1000;
