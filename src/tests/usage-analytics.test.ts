import { protectedStudentUsageKey } from '$lib/server/usage-analytics';
import { expect, test } from 'vitest';

test('usage key counts the same StudentVUE identity once across devices', () => {
	const key = protectedStudentUsageKey(
		'HTTPS://CA-PLEAS-PSV.EDUPOINT.COM',
		'Student@Example.edu',
		'test-secret'
	);
	expect(
		protectedStudentUsageKey(
			'ca-pleas-psv.edupoint.com',
			'student@example.edu',
			'test-secret'
		)
	).toBe(key);
	expect(key).not.toContain('student');
	expect(protectedStudentUsageKey('ca-pleas-psv.edupoint.com', 'student@example.edu', 'other-secret')).not.toBe(key);
});
