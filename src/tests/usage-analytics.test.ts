import {
	getUsageSummary,
	protectedStudentUsageKey,
	recordStudentVueUpstreamFailure,
	recordUniqueStudentUsage
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

test('usage recording stores one protected daily activity row', async () => {
	const previousSecret = process.env.GRADEMAXXING_ANALYTICS_HMAC_SECRET;
	process.env.GRADEMAXXING_ANALYTICS_HMAC_SECRET = 'test-only-analytics-secret';
	const queries: string[] = [];
	try {
		await recordUniqueStudentUsage(
			{
				env: {
					GRADEMAXXING_USAGE_DB: {
						prepare: (query: string) => {
							queries.push(query);
							const statement = {
								bind: (..._values: unknown[]) => statement,
								run: async () => ({
									meta: { changes: query.includes('INSERT INTO unique_student_usage') ? 1 : 0 }
								}),
								first: async <T>() => null as T | null,
								all: async <T>() => ({ results: [] as T[] })
							};
							return statement;
						}
					}
				}
			},
			'ca-pleas-psv.edupoint.com',
			'student@example.edu'
		);
	} finally {
		if (previousSecret === undefined) delete process.env.GRADEMAXXING_ANALYTICS_HMAC_SECRET;
		else process.env.GRADEMAXXING_ANALYTICS_HMAC_SECRET = previousSecret;
	}
	expect(queries.some((query) => query.includes('INSERT INTO daily_student_activity'))).toBe(true);
	expect(JSON.stringify(queries)).not.toContain('student@example.edu');
});

test('usage summary returns a complete zero-filled growth window', async () => {
	const database = {
		prepare: (query: string) => {
			const statement = {
				bind: (..._values: unknown[]) => statement,
				run: async () => ({}),
				first: async <T>() => {
					if (query.includes('MIN(first_seen_at)'))
						return {
							uniqueStudents: 12,
							newStudents: 2,
							previousNewStudents: 1,
							trackingStartedAt: Date.UTC(2026, 7, 23),
							lastActivityAt: Date.UTC(2026, 8, 18)
						} as T;
					if (query.includes('JOIN unique_student_usage'))
						return {
							activeStudents: 4,
							previousActiveStudents: 3,
							activeToday: 2,
							returningStudents: 3
						} as T;
					return null;
				},
				all: async <T>() => ({ results: [] as T[] })
			};
			return statement;
		}
	};
	const summary = await getUsageSummary({
		env: {
			GRADEMAXXING_USAGE_DB: database
		}
	});
	expect(summary).toMatchObject({
		uniqueStudents: 12,
		activeStudents: 4,
		previousActiveStudents: 3,
		newStudents: 2,
		previousNewStudents: 1,
		returningStudents: 3,
		activeToday: 2,
		rangeDays: 30
	});
	expect(summary?.dailyUsage).toHaveLength(30);
	expect(summary?.dailyUsage.every(({ activeStudents }) => activeStudents === 0)).toBe(true);
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
