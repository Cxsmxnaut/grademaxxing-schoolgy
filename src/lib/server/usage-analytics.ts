import { createHmac } from 'node:crypto';

type D1Statement = {
	bind: (...values: unknown[]) => D1Statement;
	run: () => Promise<unknown>;
	first: <T>() => Promise<T | null>;
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
	uniqueStudents: number;
	activeStudentsLast30Days: number;
};

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
	return createHmac('sha256', secret).update(normalizedIdentity(domain, username)).digest('base64url');
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

export async function getUsageSummary(platform: unknown): Promise<UsageSummary | undefined> {
	const database = workerEnvironment(platform)?.GRADEMAXXING_USAGE_DB;
	if (!database) return undefined;
	const since = Date.now() - 30 * 24 * 60 * 60 * 1000;
	const result = await database
		.prepare(
			`SELECT COUNT(*) AS uniqueStudents,
			 COUNT(CASE WHEN last_seen_at >= ? THEN 1 END) AS activeStudentsLast30Days
			 FROM unique_student_usage`
		)
		.bind(since)
		.first<{ uniqueStudents: number; activeStudentsLast30Days: number }>();
	return {
		uniqueStudents: Number(result?.uniqueStudents ?? 0),
		activeStudentsLast30Days: Number(result?.activeStudentsLast30Days ?? 0)
	};
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
