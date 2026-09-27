import { createHash, randomBytes, randomUUID } from 'node:crypto';

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
export type FeedbackMessage = {
	id: string;
	sender: 'student' | 'admin';
	message: string;
	createdAt: string;
};

export type ProductFeedback = {
	id: string;
	kind: FeedbackKind;
	message: string;
	pagePath: string;
	appVersion: string;
	status: FeedbackStatus;
	adminNote: string;
	adminReply: string;
	repliedAt: string | null;
	createdAt: string;
	updatedAt: string;
	messages: FeedbackMessage[];
};

type StoredMessage = {
	id: string;
	feedbackId: string;
	sender: 'student' | 'admin';
	message: string;
	createdAt: number;
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
	const replyToken = randomBytes(32).toString('base64url');
	const now = Date.now();
	await db
		.prepare(
			`INSERT INTO product_feedback
			 (id, kind, message, page_path, app_version, status, admin_note,
			  reply_token_hash, admin_reply, created_at, updated_at)
			 VALUES (?, ?, ?, ?, ?, 'new', '', ?, '', ?, ?)`
		)
		.bind(
			id,
			input.kind,
			input.message,
			input.pagePath,
			input.appVersion,
			hashReplyToken(replyToken),
			now,
			now
		)
		.run();
	return { id, replyToken, createdAt: new Date(now).toISOString() };
}

export async function listFeedback(platform: unknown) {
	const db = database(platform);
	if (!db) return undefined;
	const result = await db
		.prepare(
			`SELECT id, kind, message, page_path AS pagePath, app_version AS appVersion,
			 status, admin_note AS adminNote, admin_reply AS adminReply,
			 replied_at AS repliedAt, created_at AS createdAt, updated_at AS updatedAt
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
			adminReply: string;
			repliedAt: number | null;
			createdAt: number;
			updatedAt: number;
		}>();
	const items = result.results ?? [];
	const messages = await messagesForFeedback(
		db,
		items.map((item) => item.id)
	);
	return items
		.map((item) => ({
			...item,
			repliedAt: timestampToIso(item.repliedAt),
			createdAt: new Date(Number(item.createdAt)).toISOString(),
			updatedAt: new Date(Number(item.updatedAt)).toISOString(),
			messages: conversationMessages(item, messages.get(item.id) ?? [])
		}))
		.sort((first, second) => second.updatedAt.localeCompare(first.updatedAt));
}

export async function updateFeedback(
	platform: unknown,
	id: string,
	status: FeedbackStatus,
	adminNote: string,
	adminReply: string
) {
	const db = database(platform);
	if (!db) return undefined;
	const result = await db
		.prepare(
			`UPDATE product_feedback
			 SET status = ?, admin_note = ?, admin_reply = ?,
			 replied_at = CASE
				WHEN ? = '' THEN NULL
				WHEN admin_reply <> ? THEN ?
				ELSE replied_at
			 END,
			 updated_at = ?
			 WHERE id = ?`
		)
		.bind(status, adminNote, adminReply, adminReply, adminReply, Date.now(), Date.now(), id)
		.run();
	return (result.meta?.changes ?? 0) > 0;
}

export async function getFeedbackForReceipt(platform: unknown, id: string, replyToken: string) {
	const db = database(platform);
	if (!db) return undefined;
	const result = await db
		.prepare(
			`SELECT id, kind, message, status, admin_reply AS adminReply,
			 replied_at AS repliedAt, created_at AS createdAt, updated_at AS updatedAt
			 FROM product_feedback
			 WHERE id = ? AND reply_token_hash = ?`
		)
		.bind(id, hashReplyToken(replyToken))
		.all<{
			id: string;
			kind: FeedbackKind;
			message: string;
			status: FeedbackStatus;
			adminReply: string;
			repliedAt: number | null;
			createdAt: number;
			updatedAt: number;
		}>();
	const item = result.results?.[0];
	if (!item) return null;
	const messages = await messagesForFeedback(db, [id]);
	return {
		...item,
		createdAt: new Date(Number(item.createdAt)).toISOString(),
		updatedAt: new Date(Number(item.updatedAt)).toISOString(),
		repliedAt: timestampToIso(item.repliedAt),
		messages: conversationMessages(item, messages.get(id) ?? [])
	};
}

export async function appendFeedbackMessage(
	platform: unknown,
	id: string,
	message: string,
	sender: 'student' | 'admin',
	replyToken?: string
) {
	const db = database(platform);
	if (!db) return undefined;
	const messageId = randomUUID();
	const now = Date.now();
	const tokenCheck = sender === 'student' ? 'AND reply_token_hash = ?' : '';
	const statement = db.prepare(
		`INSERT INTO product_feedback_messages (id, feedback_id, sender, message, created_at)
		 SELECT ?, id, ?, ?, ? FROM product_feedback
		 WHERE id = ? ${tokenCheck}
		 AND (SELECT COUNT(*) FROM product_feedback_messages WHERE feedback_id = ?) < 100`
	);
	const values = [messageId, sender, message, now, id];
	if (sender === 'student') values.push(hashReplyToken(replyToken ?? ''));
	values.push(id);
	const result = await statement.bind(...values).run();
	if (!(result.meta?.changes ?? 0)) return null;
	await db
		.prepare(
			sender === 'student'
				? 'UPDATE product_feedback SET updated_at = ?, status = ? WHERE id = ?'
				: 'UPDATE product_feedback SET updated_at = ? WHERE id = ?'
		)
		.bind(...(sender === 'student' ? [now, 'reviewing', id] : [now, id]))
		.run();
	return { id: messageId, sender, message, createdAt: new Date(now).toISOString() };
}

async function messagesForFeedback(db: FeedbackDatabase, ids: string[]) {
	const messages = new Map<string, StoredMessage[]>();
	if (!ids.length) return messages;
	const placeholders = ids.map(() => '?').join(',');
	const result = await db
		.prepare(
			`SELECT id, feedback_id AS feedbackId, sender, message, created_at AS createdAt
			 FROM product_feedback_messages WHERE feedback_id IN (${placeholders})
			 ORDER BY created_at ASC, id ASC`
		)
		.bind(...ids)
		.all<StoredMessage>();
	for (const message of result.results ?? []) {
		const thread = messages.get(message.feedbackId) ?? [];
		thread.push(message);
		messages.set(message.feedbackId, thread);
	}
	return messages;
}

function conversationMessages(
	item: {
		id: string;
		message: string;
		adminReply: string;
		createdAt: number;
		repliedAt: number | null;
	},
	additional: StoredMessage[]
): FeedbackMessage[] {
	const messages: FeedbackMessage[] = [
		{
			id: `${item.id}:original`,
			sender: 'student',
			message: item.message,
			createdAt: new Date(Number(item.createdAt)).toISOString()
		}
	];
	if (item.adminReply)
		messages.push({
			id: `${item.id}:legacy-reply`,
			sender: 'admin',
			message: item.adminReply,
			createdAt: timestampToIso(item.repliedAt) ?? new Date(Number(item.createdAt)).toISOString()
		});
	return [
		...messages,
		...additional.map((message) => ({
			id: message.id,
			sender: message.sender,
			message: message.message,
			createdAt: new Date(Number(message.createdAt)).toISOString()
		}))
	].sort((first, second) => first.createdAt.localeCompare(second.createdAt));
}

function hashReplyToken(token: string) {
	return createHash('sha256').update(token).digest('hex');
}

function timestampToIso(value: number | null | undefined) {
	return typeof value === 'number' && Number.isFinite(value) ? new Date(value).toISOString() : null;
}
