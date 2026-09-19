import {
	getUsageSummary,
	protectedStudentUsageKey,
	recordStudentVueUpstreamFailure
} from '$lib/server/analytics/usage';
import { expect, test } from 'vitest';

test('usage key counts the same StudentVUE identity once across devices', () => {
	const key = protectedStudentUsageKey(
		'HTTPS://CA-PLEAS-PSV.EDUPOINT.COM',
		'Student@Example.edu',
		'test-secret'
	);
	expect(
		protectedStudentUsageKey('ca-pleas-psv.edupoint.com', 'student@example.edu', 'test-secret')
	).toBe(key);
	expect(key).not.toContain('student');
	expect(
		protectedStudentUsageKey('ca-pleas-psv.edupoint.com', 'student@example.edu', 'other-secret')
	).not.toBe(key);
});

test('usage summary returns a complete zero-filled growth window', async () => {
	const summary = await getUsageSummary({
		env: {
			GRADEMAXXING_USAGE_DB: {
				prepare: () => ({
					bind: () => ({
						first: async () => ({ uniqueStudents: 12, activeStudentsLast30Days: 4 }),
						all: async () => ({ results: [] })
					})
				})
			}
		}
	});
	expect(summary).toMatchObject({
		uniqueStudents: 12,
		activeStudentsLast30Days: 4,
		newStudentsLast30Days: 0
	});
	expect(summary?.dailyNewStudents).toHaveLength(30);
	expect(summary?.dailyNewStudents.every(({ count }) => count === 0)).toBe(true);
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
