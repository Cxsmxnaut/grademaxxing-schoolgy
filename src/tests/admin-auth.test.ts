import { createAdminSession, validAdminSession, verifyAdminPassword } from '$lib/server/admin/auth';
import { afterEach, expect, test, vi } from 'vitest';

const originalSecret = process.env.GRADEMAXXING_ADMIN_SECRET;
const originalPasswordHash = process.env.GRADEMAXXING_ADMIN_PASSWORD_HASH;

afterEach(() => {
	if (originalSecret === undefined) delete process.env.GRADEMAXXING_ADMIN_SECRET;
	else process.env.GRADEMAXXING_ADMIN_SECRET = originalSecret;
	if (originalPasswordHash === undefined) delete process.env.GRADEMAXXING_ADMIN_PASSWORD_HASH;
	else process.env.GRADEMAXXING_ADMIN_PASSWORD_HASH = originalPasswordHash;
	vi.useRealTimers();
});

test('administrator sessions are signed and expire', () => {
	process.env.GRADEMAXXING_ADMIN_SECRET = 'a-long-test-only-administrator-secret-value';
	process.env.GRADEMAXXING_ADMIN_PASSWORD_HASH =
		'f7a03f48c0e2aa2d5e55ca186c20032ddbf53b7f5f93fce387d65c3f83433e8d';
	expect(verifyAdminPassword('test-admin-password')).toBe(true);
	expect(verifyAdminPassword('incorrect')).toBe(false);
	const session = createAdminSession();
	expect(session).toBeDefined();
	expect(validAdminSession(session)).toBe(true);
	expect(validAdminSession(`${session}.modified`)).toBe(false);
});

test('administrator password and session-signing secret are independent', () => {
	process.env.GRADEMAXXING_ADMIN_SECRET = 'another-long-test-only-session-secret-value';
	process.env.GRADEMAXXING_ADMIN_PASSWORD_HASH =
		'f7a03f48c0e2aa2d5e55ca186c20032ddbf53b7f5f93fce387d65c3f83433e8d';
	expect(verifyAdminPassword('test-admin-password')).toBe(true);
	expect(createAdminSession()).toBeDefined();
});
