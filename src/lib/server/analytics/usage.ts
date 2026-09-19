import { createHmac } from 'node:crypto';

type D1Statement = {
	bind: (...values: unknown[]) => D1Statement;
	run: () => Promise<unknown>;
	first: <T>() => Promise<T | null>;
	all: <T>() => Promise<{ results?: T[] }>;
};

type UsageDatabase = {
	prepare: (query: string) => D1Statement;
};

type UsageAnalytics = {
	writeDataPoint: (point: { doubles: number[]; indexes: string[]; blobs: string[] }) => void;
};

type WorkerPlatform = {
	env?: {
		GRADEMAXXING_USAGE_DB?: UsageDatabase;
		GRADEMAXXING_USAGE_ANALYTICS?: UsageAnalytics;
	};
};

export type UpstreamFailureKind = 'portal_error' | 'portal_timeout';

export type UsageSummary = {
	generatedAt: string;
	rangeDays: UsageRangeDays;
	uniqueStudents: number;
	activeStudents: number;
	previousActiveStudents: number;
	newStudents: number;
	previousNewStudents: number;
	returningStudents: number;
	activeToday: number;
	trackingStartedAt: string | null;
	lastActivityAt: string | null;
	dailyUsage: Array<{
		date: string;
		newStudents: number;
		activeStudents: number;
		totalStudents: number;
	}>;
};

export const usageRangeOptions = [7, 30, 90] as const;
export type UsageRangeDays = (typeof usageRangeOptions)[number];
const defaultUsageRangeDays: UsageRangeDays = 30;
const millisecondsPerDay = 24 * 60 * 60 * 1000;

function workerEnvironment(platform: unknown) {
	return (platform as WorkerPlatform | undefined)?.env;
}

function normalizedIdentity(domain: string, username: string) {
	let normalizedDomain: string;
	try {
		normalizedDomain = new URL(domain.includes('://') ? domain : `https://${domain}`).host;
	} catch {
		normalizedDomain = domain.trim().replace(/\/$/, '');
	}
	return `${normalizedDomain.toLowerCase()}\u0000${username.trim().toLowerCase()}`;
}

/**
 * A deterministic, server-secret HMAC lets the same StudentVUE identity count
 * once across devices. The raw identity never enters the analytics database.
 */
export function protectedStudentUsageKey(domain: string, username: string, secret: string) {
	return createHmac('sha256', secret)
		.update(normalizedIdentity(domain, username))
		.digest('base64url');
}

export async function recordUniqueStudentUsage(
	platform: unknown,
	domain: string,
	username: string
) {
	const environment = workerEnvironment(platform);
	const database = environment?.GRADEMAXXING_USAGE_DB;
	const secret = process.env.GRADEMAXXING_ANALYTICS_HMAC_SECRET;
	if (!database || !secret) return false;
	const now = Date.now();
	const studentKey = protectedStudentUsageKey(domain, username, secret);
	const activityDate = new Date(now).toISOString().slice(0, 10);
	const inserted = (await database
		.prepare(
			`INSERT INTO unique_student_usage (student_key, first_seen_at, last_seen_at)
			 VALUES (?, ?, ?)
			 ON CONFLICT(student_key) DO NOTHING`
		)
		.bind(studentKey, now, now)
		.run()) as { meta?: { changes?: number } };
	const isNewStudent = inserted.meta?.changes === 1;
	if (!isNewStudent)
		await database
			.prepare(`UPDATE unique_student_usage SET last_seen_at = ? WHERE student_key = ?`)
			.bind(now, studentKey)
			.run();
	await database
		.prepare(
			`INSERT INTO daily_student_activity (student_key, activity_date)
			 VALUES (?, ?)
			 ON CONFLICT(student_key, activity_date) DO NOTHING`
		)
		.bind(studentKey, activityDate)
		.run();
	if (isNewStudent)
		environment?.GRADEMAXXING_USAGE_ANALYTICS?.writeDataPoint({
			// The event contains no identity. It is only a time-series increment for
			// Cloudflare's Workers Analytics Engine dashboard.
			blobs: ['new_unique_student'],
			doubles: [1],
			indexes: ['grademaxxing-usage']
		});
	return isNewStudent;
}

export async function getUsageSummary(
	platform: unknown,
	rangeDays: UsageRangeDays = defaultUsageRangeDays
): Promise<UsageSummary | undefined> {
	const database = workerEnvironment(platform)?.GRADEMAXXING_USAGE_DB;
	if (!database) return undefined;
	const now = Date.now();
	const dayStart = new Date(now);
	dayStart.setUTCHours(0, 0, 0, 0);
	const rangeStart = dayStart.getTime() - (rangeDays - 1) * millisecondsPerDay;
	const previousRangeStart = rangeStart - rangeDays * millisecondsPerDay;
	const rangeStartDate = new Date(rangeStart).toISOString().slice(0, 10);
	const previousRangeStartDate = new Date(previousRangeStart).toISOString().slice(0, 10);
	const todayDate = dayStart.toISOString().slice(0, 10);
	const [totals, activity, dailyNewResult, dailyActiveResult] = await Promise.all([
		database
			.prepare(
				`SELECT COUNT(*) AS uniqueStudents,
			 SUM(CASE WHEN first_seen_at >= ? THEN 1 ELSE 0 END) AS newStudents,
			 SUM(CASE WHEN first_seen_at >= ? AND first_seen_at < ? THEN 1 ELSE 0 END)
				 AS previousNewStudents,
			 MIN(first_seen_at) AS trackingStartedAt,
			 MAX(last_seen_at) AS lastActivityAt
			 FROM unique_student_usage`
			)
			.bind(rangeStart, previousRangeStart, rangeStart)
			.first<{
				uniqueStudents: number;
				newStudents: number;
				previousNewStudents: number;
				trackingStartedAt: number | null;
				lastActivityAt: number | null;
			}>(),
		database
			.prepare(
				`SELECT
			 COUNT(DISTINCT CASE WHEN activity.activity_date >= ? THEN activity.student_key END)
				 AS activeStudents,
			 COUNT(DISTINCT CASE
				 WHEN activity.activity_date >= ? AND activity.activity_date < ?
				 THEN activity.student_key END) AS previousActiveStudents,
			 COUNT(DISTINCT CASE WHEN activity.activity_date = ? THEN activity.student_key END)
				 AS activeToday,
			 COUNT(DISTINCT CASE
				 WHEN activity.activity_date >= ? AND students.first_seen_at < ?
				 THEN activity.student_key END) AS returningStudents
			 FROM daily_student_activity activity
			 JOIN unique_student_usage students ON students.student_key = activity.student_key`
			)
			.bind(
				rangeStartDate,
				previousRangeStartDate,
				rangeStartDate,
				todayDate,
				rangeStartDate,
				rangeStart
			)
			.first<{
				activeStudents: number;
				previousActiveStudents: number;
				activeToday: number;
				returningStudents: number;
			}>(),
		database
			.prepare(
				`SELECT strftime('%Y-%m-%d', first_seen_at / 1000, 'unixepoch') AS date,
			 COUNT(*) AS count
			 FROM unique_student_usage
			 WHERE first_seen_at >= ?
			 GROUP BY date
			 ORDER BY date ASC`
			)
			.bind(rangeStart)
			.all<{ date: string; count: number }>(),
		database
			.prepare(
				`SELECT activity_date AS date, COUNT(*) AS count
			 FROM daily_student_activity
			 WHERE activity_date >= ?
			 GROUP BY activity_date
			 ORDER BY activity_date ASC`
			)
			.bind(rangeStartDate)
			.all<{ date: string; count: number }>()
	]);
	const newStudentsByDate = new Map(
		(dailyNewResult.results ?? []).map(({ date, count }) => [date, Number(count)])
	);
	const activeStudentsByDate = new Map(
		(dailyActiveResult.results ?? []).map(({ date, count }) => [date, Number(count)])
	);
	let totalStudents =
		Number(totals?.uniqueStudents ?? 0) -
		Array.from(newStudentsByDate.values()).reduce((sum, count) => sum + count, 0);
	const dailyUsage = Array.from({ length: rangeDays }, (_, index) => {
		const date = new Date(rangeStart + index * millisecondsPerDay).toISOString().slice(0, 10);
		const newStudents = newStudentsByDate.get(date) ?? 0;
		totalStudents += newStudents;
		return {
			date,
			newStudents,
			activeStudents: activeStudentsByDate.get(date) ?? 0,
			totalStudents
		};
	});
	return {
		generatedAt: new Date(now).toISOString(),
		rangeDays,
		uniqueStudents: Number(totals?.uniqueStudents ?? 0),
		activeStudents: Number(activity?.activeStudents ?? 0),
		previousActiveStudents: Number(activity?.previousActiveStudents ?? 0),
		newStudents: Number(totals?.newStudents ?? 0),
		previousNewStudents: Number(totals?.previousNewStudents ?? 0),
		returningStudents: Number(activity?.returningStudents ?? 0),
		activeToday: Number(activity?.activeToday ?? 0),
		trackingStartedAt: timestampToIso(totals?.trackingStartedAt),
		lastActivityAt: timestampToIso(totals?.lastActivityAt),
		dailyUsage
	};
}

function timestampToIso(value: number | null | undefined) {
	return typeof value === 'number' && Number.isFinite(value) ? new Date(value).toISOString() : null;
}

/**
 * Emits only an aggregate operational signal. It intentionally contains no
 * identity, district, request ID, error text, or school-record value.
 */
export function recordStudentVueUpstreamFailure(
	platform: unknown,
	resource: string,
	kind: UpstreamFailureKind
) {
	const safeResource = /^[a-z-]{1,32}$/.test(resource) ? resource : 'unknown';
	try {
		workerEnvironment(platform)?.GRADEMAXXING_USAGE_ANALYTICS?.writeDataPoint({
			blobs: ['studentvue_upstream_failure', kind],
			doubles: [1],
			indexes: [safeResource]
		});
	} catch {
		// Observability must never change a student's StudentVUE result.
	}
}
