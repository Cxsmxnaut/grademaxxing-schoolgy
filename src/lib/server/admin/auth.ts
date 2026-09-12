import { createHash, createHmac, randomUUID, timingSafeEqual } from 'node:crypto';

export const adminSessionCookie =
	process.env.NODE_ENV === 'production' ? '__Host-grademaxxing_admin' : 'grademaxxing_admin';
const adminSessionDurationMs = 8 * 60 * 60 * 1000;

function configuredSecret() {
	const secret = process.env.GRADEMAXXING_ADMIN_SECRET;
	return secret && secret.length >= 32 ? secret : undefined;
}

function fixedLengthHash(value: string) {
	return createHash('sha256').update(value).digest();
}

function signaturesMatch(expected: string, supplied: string) {
	return timingSafeEqual(fixedLengthHash(expected), fixedLengthHash(supplied));
}

export function verifyAdminPassword(password: string) {
	const secret = configuredSecret();
	return Boolean(secret && signaturesMatch(secret, password));
}

export function createAdminSession() {
	const secret = configuredSecret();
	if (!secret) return undefined;
	const payload = `v1.${Date.now() + adminSessionDurationMs}.${randomUUID()}`;
	const signature = createHmac('sha256', secret).update(payload).digest('base64url');
	return `${payload}.${signature}`;
}

export function validAdminSession(token: string | undefined) {
	const secret = configuredSecret();
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
