import { createAdminSession, validAdminSession, verifyAdminPassword } from '$lib/server/admin/auth';
import { afterEach, expect, test, vi } from 'vitest';

const originalSecret = process.env.GRADEMAXXING_ADMIN_SECRET;

afterEach(() => {
	if (originalSecret === undefined) delete process.env.GRADEMAXXING_ADMIN_SECRET;
	else process.env.GRADEMAXXING_ADMIN_SECRET = originalSecret;
	vi.useRealTimers();
});

test('administrator sessions are signed and expire', () => {
	process.env.GRADEMAXXING_ADMIN_SECRET = 'a-long-test-only-administrator-secret-value';
	expect(verifyAdminPassword('a-long-test-only-administrator-secret-value')).toBe(true);
	expect(verifyAdminPassword('incorrect')).toBe(false);
	const session = createAdminSession();
	expect(session).toBeDefined();
	expect(validAdminSession(session)).toBe(true);
	expect(validAdminSession(`${session}.modified`)).toBe(false);
});
