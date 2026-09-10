import { protectedStudentUsageKey, recordStudentVueUpstreamFailure } from '$lib/server/usage-analytics';
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

test('upstream outage telemetry contains only an aggregate resource category', () => {
	const writes: Array<{ doubles: number[]; indexes: string[]; blobs: string[] }> = [];
	recordStudentVueUpstreamFailure(
		{
			env: {
				GRADEMAXXING_USAGE_ANALYTICS: {
					writeDataPoint: (point: { doubles: number[]; indexes: string[]; blobs: string[] }) =>
						writes.push(point)
				}
			}
		},
		'gradebook',
		'portal_timeout'
	);
	expect(writes).toEqual([
		{
			blobs: ['studentvue_upstream_failure', 'portal_timeout'],
			doubles: [1],
			indexes: ['gradebook']
		}
	]);
	expect(JSON.stringify(writes)).not.toMatch(/student@|edupoint|password/i);
});
