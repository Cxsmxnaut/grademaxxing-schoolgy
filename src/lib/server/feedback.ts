import { randomUUID } from 'node:crypto';

type D1Statement = {
	bind: (...values: unknown[]) => D1Statement;
	run: () => Promise<{ meta?: { changes?: number } }>;
	all: <T>() => Promise<{ results?: T[] }>;
};

type FeedbackDatabase = { prepare: (query: string) => D1Statement };
type WorkerPlatform = { env?: { GRADEMAXXING_USAGE_DB?: FeedbackDatabase } };

export const feedbackKinds = ['Bug report', 'Grade question', 'Feature idea'] as const;
export const feedbackStatuses = ['new', 'reviewing', 'planned', 'resolved', 'dismissed'] as const;
export type FeedbackKind = (typeof feedbackKinds)[number];
export type FeedbackStatus = (typeof feedbackStatuses)[number];

export type ProductFeedback = {
	id: string;
	kind: FeedbackKind;
	message: string;
	pagePath: string;
	appVersion: string;
	status: FeedbackStatus;
	adminNote: string;
	createdAt: string;
	updatedAt: string;
};

function database(platform: unknown) {
	return (platform as WorkerPlatform | undefined)?.env?.GRADEMAXXING_USAGE_DB;
}

export async function createFeedback(
	platform: unknown,
	input: { kind: FeedbackKind; message: string; pagePath: string; appVersion: string }
) {
	const db = database(platform);
	if (!db) return undefined;
	const id = randomUUID();
	const now = Date.now();
	await db
		.prepare(
			`INSERT INTO product_feedback
			 (id, kind, message, page_path, app_version, status, admin_note, created_at, updated_at)
			 VALUES (?, ?, ?, ?, ?, 'new', '', ?, ?)`
		)
		.bind(id, input.kind, input.message, input.pagePath, input.appVersion, now, now)
		.run();
	return { id, createdAt: new Date(now).toISOString() };
}

export async function listFeedback(platform: unknown) {
	const db = database(platform);
	if (!db) return undefined;
	const result = await db
		.prepare(
			`SELECT id, kind, message, page_path AS pagePath, app_version AS appVersion,
			 status, admin_note AS adminNote, created_at AS createdAt, updated_at AS updatedAt
			 FROM product_feedback
			 ORDER BY created_at DESC
			 LIMIT 500`
		)
		.all<{
			id: string;
			kind: FeedbackKind;
			message: string;
			pagePath: string;
			appVersion: string;
			status: FeedbackStatus;
			adminNote: string;
			createdAt: number;
			updatedAt: number;
		}>();
	return (result.results ?? []).map((item) => ({
		...item,
		createdAt: new Date(Number(item.createdAt)).toISOString(),
		updatedAt: new Date(Number(item.updatedAt)).toISOString()
	}));
}

export async function updateFeedback(
	platform: unknown,
	id: string,
	status: FeedbackStatus,
	adminNote: string
) {
	const db = database(platform);
	if (!db) return undefined;
	const result = await db
		.prepare(
			`UPDATE product_feedback
			 SET status = ?, admin_note = ?, updated_at = ?
			 WHERE id = ?`
		)
		.bind(status, adminNote, Date.now(), id)
		.run();
	return (result.meta?.changes ?? 0) > 0;
}
