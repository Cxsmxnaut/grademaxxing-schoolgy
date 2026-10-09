import { createHash, createHmac, randomUUID, timingSafeEqual } from 'node:crypto';

export const adminSessionCookie =
	process.env.NODE_ENV === 'production' ? '__Host-grademaxxing_admin' : 'grademaxxing_admin';
const adminSessionDurationMs = 8 * 60 * 60 * 1000;

export type AdminUser = {
	username: string;
	displayName: string;
	role: string;
};

// One configured operator credential; identity is deployment configuration,
// never inferred from an arbitrary username submitted at sign-in.
export function adminConsoleIdentity(): AdminUser {
	const username = process.env.GRADEMAXXING_ADMIN_USERNAME?.trim() || 'admin';
	return {
		username,
		displayName: process.env.GRADEMAXXING_ADMIN_DISPLAY_NAME?.trim() || 'Administrator',
		role: 'Administrator'
	};
}

function configuredSessionSecret() {
	const secret = process.env.GRADEMAXXING_ADMIN_SECRET;
	return secret && secret.length >= 32 ? secret : undefined;
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
	const identity = adminConsoleIdentity();
	// Empty username preserves the original password-only API contract.
	if (username && normalizeUsername(username) !== normalizeUsername(identity.username))
		return undefined;
	return verifyAdminPassword(password) ? identity : undefined;
}

export function verifyAdminPassword(password: string) {
	const passwordHash = configuredPasswordHash();
	return Boolean(passwordHash && digestMatches(passwordHash, password));
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
		Number(expiresAt) <= Date.now()
	)
		return false;
	const payload = `${version}.${expiresAt}.${nonce}`;
	const expected = createHmac('sha256', secret).update(payload).digest('base64url');
	return signaturesMatch(expected, signature);
}

export const adminSessionMaxAge = adminSessionDurationMs / 1000;
