import {
	createAdminSession,
	validAdminSession,
	verifyAdminCredentials,
	verifyAdminPassword
} from '$lib/server/admin/auth';
import { afterEach, expect, test, vi } from 'vitest';

const originalSecret = process.env.GRADEMAXXING_ADMIN_SECRET;
const originalPasswordHash = process.env.GRADEMAXXING_ADMIN_PASSWORD_HASH;

afterEach(() => {
	if (originalSecret === undefined) delete process.env.GRADEMAXXING_ADMIN_SECRET;
	else process.env.GRADEMAXXING_ADMIN_SECRET = originalSecret;
	if (originalPasswordHash === undefined) delete process.env.GRADEMAXXING_ADMIN_PASSWORD_HASH;
	else process.env.GRADEMAXXING_ADMIN_PASSWORD_HASH = originalPasswordHash;
	vi.useRealTimers();
	vi.unstubAllEnvs();
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

test('administrator authentication fails closed without deployment secrets', () => {
	delete process.env.GRADEMAXXING_ADMIN_SECRET;
	delete process.env.GRADEMAXXING_ADMIN_PASSWORD_HASH;
	expect(verifyAdminCredentials('admin', 'unconfigured')).toBeUndefined();
	expect(verifyAdminPassword('unconfigured')).toBe(false);
	expect(createAdminSession()).toBeUndefined();
	process.env.GRADEMAXXING_ADMIN_SECRET = 'short';
	expect(createAdminSession()).toBeUndefined();
	expect(validAdminSession('v1.9999999999999.00000000-0000-0000-0000-000000000000.signature')).toBe(
		false
	);
});

test('only the configured operator password and identity are accepted', () => {
	vi.stubEnv('GRADEMAXXING_ADMIN_USERNAME', 'Test Operator');
	vi.stubEnv('GRADEMAXXING_ADMIN_DISPLAY_NAME', 'Test Administrator');
	process.env.GRADEMAXXING_ADMIN_PASSWORD_HASH =
		'f7a03f48c0e2aa2d5e55ca186c20032ddbf53b7f5f93fce387d65c3f83433e8d';
	expect(verifyAdminCredentials(' Test  Operator ', 'test-admin-password')).toEqual({
		username: 'Test Operator',
		displayName: 'Test Administrator',
		role: 'Administrator'
	});
	expect(verifyAdminCredentials('different-operator', 'test-admin-password')).toBeUndefined();
	process.env.GRADEMAXXING_ADMIN_PASSWORD_HASH = 'invalid';
	expect(verifyAdminCredentials('Test Operator', 'test-admin-password')).toBeUndefined();
});

test('secret rotation and expiration invalidate administrator sessions', () => {
	vi.useFakeTimers();
	process.env.GRADEMAXXING_ADMIN_SECRET = 'a-long-test-only-administrator-secret-value';
	const session = createAdminSession();
	process.env.GRADEMAXXING_ADMIN_SECRET = 'rotated-test-only-administrator-secret-value';
	expect(validAdminSession(session)).toBe(false);
	process.env.GRADEMAXXING_ADMIN_SECRET = 'a-long-test-only-administrator-secret-value';
	vi.advanceTimersByTime(8 * 60 * 60 * 1000);
	expect(validAdminSession(session)).toBe(false);
});
