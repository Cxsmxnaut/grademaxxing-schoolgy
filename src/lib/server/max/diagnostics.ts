import type {
	MaxDiagnostic,
	MaxDiagnosticEvent,
	MaxDiagnosticStatus,
	MaxDiagnosticSummary,
	MaxReportReason
} from '$lib/contracts/max-diagnostics';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { MeshAttempt, MeshResult } from './tokenMesh';
import { MAX_TOOLS } from './tools';

type Statement = {
	bind: (...values: unknown[]) => Statement;
	run: () => Promise<{ meta?: { changes?: number } }>;
	all: <T>() => Promise<{ results?: T[] }>;
};
type Database = { prepare: (sql: string) => Statement };
const retentionDays = 7;
const toolNames = new Set(MAX_TOOLS.map((tool) => tool.function.name));
const errorCodes = new Set([
	'Error',
	'TypeError',
	'NotConfigured',
	'PoolExhaustedError',
	'UpstreamError',
	'TitleFallback'
]);
const cutoff = () => Date.now() - retentionDays * 86400_000;
const database = (platform: unknown) =>
	(platform as { env?: { GRADEMAXXING_USAGE_DB?: Database } } | undefined)?.env
		?.GRADEMAXXING_USAGE_DB;
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const bounded = (value: number) => Math.max(0, Math.min(2_147_483_647, Math.round(value)));
const safeLabel = (value: string) => value.replace(/[^a-zA-Z0-9_./:-]/g, '').slice(0, 100);

// This is a best-effort reduction, not a promise of anonymization. Question
// capture is enabled only by the development route, and excludes app context.
export function redactSharedQuestion(question: string, username = '') {
	let text = question;
	if (username.length >= 3) text = text.split(username).join('[account]');
	return text
		.replace(/\b(?:bearer\s+\S+|(?:api[_ -]?key|password|secret|token)\s*[:=]\s*\S+)/gi, '[secret]')
		.replace(/\b(?:sk|gsk|AIza)[-_a-zA-Z0-9]{12,}\b/g, '[secret]')
		.replace(/https?:\/\/\S+/gi, '[link]')
		.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[email]')
		.replace(/\b\d[\d\s().+/-]{5,}\d\b/g, '[number]')
		.slice(0, 8000);
}

function questionTopic(query: string) {
	const categories = [
		['gpa', /\bgpa\b/i],
		['attendance', /absen|tardy|attendan/i],
		['mail', /\bmail\b|\bemail\b|\bsender\b/i],
		['assignments', /assign|homework|quiz|exam|feedback|\btest\b/i],
		['privacy', /privacy|retention|saved chats/i],
		['schedule', /schedule|class time/i],
		['documents', /document|report card|transcript/i],
		['grades', /grade|score|final|points/i]
	] as const;
	return categories.find(([, pattern]) => pattern.test(query))?.[0] ?? 'other';
}

export function createMaxDiagnostics(
	platform: unknown,
	input: {
		question: string;
		shareQuestion: boolean;
		username?: string;
		action: 'chat' | 'title';
	}
) {
	const db = database(platform);
	const started = Date.now();
	const receipt = randomBytes(32).toString('base64url');
	const row: MaxDiagnostic = {
		id: randomUUID(),
		createdAt: started,
		action: input.action,
		topic: input.action === 'title' ? 'title' : questionTopic(input.question),
		status: 'running',
		question:
			input.shareQuestion && input.action === 'chat'
				? redactSharedQuestion(input.question, input.username)
				: null,
		durationMs: 0,
		firstTokenMs: null,
		tokenFrames: 0,
		outputChars: 0,
		provider: null,
		model: null,
		errorCode: null,
		flags: [],
		events: [],
		reportedReason: null
	};
	let writes = Promise.resolve();
	let lastFlush = started;
	let ended = false;
	let available = Boolean(db);
	function queue(operation: () => Promise<unknown>) {
		writes = writes
			.then(() => {
				if (!available) return;
				let timer: ReturnType<typeof setTimeout>;
				return Promise.race([
					Promise.resolve().then(operation),
					new Promise((_, reject) => {
						timer = setTimeout(() => reject(new Error('diagnostics_timeout')), 1000);
					})
				]).finally(() => clearTimeout(timer));
			})
			.then(() => undefined)
			.catch(() => {
				available = false;
			});
		const context = platform as
			| {
					context?: { waitUntil: (promise: Promise<unknown>) => void };
					ctx?: { waitUntil: (promise: Promise<unknown>) => void };
			  }
			| undefined;
		(context?.ctx ?? context?.context)?.waitUntil(writes);
		return writes;
	}
	if (db)
		queue(async () => {
			await db.prepare('DELETE FROM max_diagnostics WHERE created_at < ?').bind(cutoff()).run();
			await db
				.prepare(
					`INSERT INTO max_diagnostics (id, created_at, action, topic, status, question, report_hash) VALUES (?, ?, ?, ?, 'running', ?, ?)`
				)
				.bind(row.id, started, row.action, row.topic, row.question, hash(receipt))
				.run();
		});
	function flush() {
		if (!db || !available) return writes;
		const snapshot = JSON.parse(JSON.stringify(row)) as MaxDiagnostic;
		return queue(() =>
			db
				.prepare(
					`UPDATE max_diagnostics SET status = ?, duration_ms = ?, first_token_ms = ?, token_frames = ?, output_chars = ?, provider = ?, model = ?, error_code = ?, flags_json = ?, events_json = ? WHERE id = ?`
				)
				.bind(
					snapshot.status,
					snapshot.durationMs,
					snapshot.firstTokenMs,
					snapshot.tokenFrames,
					snapshot.outputChars,
					snapshot.provider,
					snapshot.model,
					snapshot.errorCode,
					JSON.stringify(snapshot.flags),
					JSON.stringify(snapshot.events),
					row.id
				)
				.run()
		);
	}
	function event(value: Omit<MaxDiagnosticEvent, 'ms'>) {
		if (ended) return;
		if (row.events.length < 160) row.events.push({ ...value, ms: bounded(Date.now() - started) });
		else if (!row.flags.includes('events_truncated')) row.flags.push('events_truncated');
		row.durationMs = bounded(Date.now() - started);
		if (Date.now() - lastFlush >= 2000) {
			lastFlush = Date.now();
			void flush();
		}
	}
	return {
		id: row.id,
		get reportReceipt() {
			return available ? receipt : undefined;
		},
		attempt(attempt: MeshAttempt) {
			if (ended) return;
			row.provider = safeLabel(attempt.provider);
			row.model = safeLabel(attempt.model);
			if (attempt.kind === 'empty' && !row.flags.includes('empty_provider_reply'))
				row.flags.push('empty_provider_reply');
			event({
				type: 'provider',
				name: safeLabel(attempt.provider),
				model: safeLabel(attempt.model),
				outcome: safeLabel(attempt.kind),
				status: attempt.status,
				durationMs: bounded(attempt.durationMs)
			});
		},
		tool(name: string, result: unknown, durationMs: number) {
			const failed =
				!!result &&
				typeof result === 'object' &&
				('error' in result || ('success' in result && result.success === false));
			if (failed && !row.flags.includes('tool_error')) row.flags.push('tool_error');
			event({
				type: 'tool',
				name: toolNames.has(name) ? name : 'unknown_tool',
				outcome: failed ? 'error' : 'success',
				durationMs: bounded(durationMs)
			});
		},
		token(chunk: string) {
			if (ended) return;
			if (row.firstTokenMs === null && chunk.trim())
				row.firstTokenMs = bounded(Date.now() - started);
			row.tokenFrames++;
			row.outputChars = bounded(row.outputChars + chunk.length);
		},
		async finish(status: MaxDiagnosticStatus, result?: MeshResult, errorCode?: string) {
			if (ended) return;
			ended = true;
			row.durationMs = bounded(Date.now() - started);
			row.status = status;
			row.errorCode = errorCode ? (errorCodes.has(errorCode) ? errorCode : 'InternalError') : null;
			if (result) {
				row.provider = safeLabel(result.provider);
				row.model = safeLabel(result.model);
				row.outputChars = bounded(result.text.length);
				if (!result.text.trim()) {
					row.status = 'empty';
					row.flags.push('empty_reply');
				}
				if (/【\s*\{/.test(result.text)) row.flags.push('internal_citation');
				if (result.finishReason === 'length') row.flags.push('output_limit');
			}
			if ((status === 'failed' || status === 'cancelled') && row.outputChars > 0)
				row.flags.push('partial_reply');
			await flush();
		},
		settled: () => writes
	};
}
export type MaxDiagnostics = ReturnType<typeof createMaxDiagnostics>;

type StoredRow = {
	id: string;
	created_at: number;
	action: 'chat' | 'title';
	topic: string;
	status: MaxDiagnosticStatus;
	question: string | null;
	duration_ms: number;
	first_token_ms: number | null;
	token_frames: number;
	output_chars: number;
	provider: string | null;
	model: string | null;
	error_code: string | null;
	flags_json: string;
	events_json: string;
	reported_reason: MaxReportReason | null;
};
export async function listMaxDiagnostics(
	platform: unknown,
	options: { before?: string; issuesOnly?: boolean } = {}
): Promise<MaxDiagnosticSummary | undefined> {
	const db = database(platform);
	if (!db) return undefined;
	await db.prepare('DELETE FROM max_diagnostics WHERE created_at < ?').bind(cutoff()).run();
	const stale = Date.now() - 10 * 60_000;
	const [cursorTime, cursorId] = (options.before ?? '').split(':');
	const beforeTime = Number(cursorTime) || Date.now() + 1;
	const beforeId = /^[a-f0-9-]{36}$/i.test(cursorId ?? '') ? cursorId : '';
	const where = options.issuesOnly
		? `AND (status IN ('failed', 'empty', 'cancelled') OR (status = 'running' AND created_at < ${stale}) OR flags_json <> '[]' OR reported_reason IS NOT NULL)`
		: '';
	const result = await db
		.prepare(
			`SELECT * FROM max_diagnostics WHERE created_at >= ? AND (created_at < ? OR (created_at = ? AND id < ?)) ${where} ORDER BY created_at DESC, id DESC LIMIT 51`
		)
		.bind(cutoff(), beforeTime, beforeTime, beforeId)
		.all<StoredRow>();
	const totals = await db
		.prepare(
			`SELECT COUNT(*) AS requests, SUM(CASE WHEN status IN ('failed', 'empty', 'cancelled') OR (status = 'running' AND created_at < ?) THEN 1 ELSE 0 END) AS failed, SUM(CASE WHEN flags_json <> '[]' THEN 1 ELSE 0 END) AS flagged, SUM(CASE WHEN reported_reason IS NOT NULL THEN 1 ELSE 0 END) AS reported FROM max_diagnostics WHERE created_at >= ?`
		)
		.bind(stale, cutoff())
		.all<MaxDiagnosticSummary['totals']>();
	const rows = result.results ?? [];
	return {
		items: rows.slice(0, 50).map((r) => ({
			id: r.id,
			createdAt: r.created_at,
			action: r.action,
			topic: r.topic,
			status: r.status === 'running' && r.created_at < stale ? 'incomplete' : r.status,
			question: r.question,
			durationMs: r.duration_ms,
			firstTokenMs: r.first_token_ms,
			tokenFrames: r.token_frames,
			outputChars: r.output_chars,
			provider: r.provider,
			model: r.model,
			errorCode: r.error_code,
			flags: JSON.parse(r.flags_json),
			events: JSON.parse(r.events_json),
			reportedReason: r.reported_reason
		})),
		nextBefore: rows.length > 50 ? `${rows[49]!.created_at}:${rows[49]!.id}` : null,
		retentionDays,
		totals: {
			requests: Number(totals.results?.[0]?.requests ?? 0),
			failed: Number(totals.results?.[0]?.failed ?? 0),
			flagged: Number(totals.results?.[0]?.flagged ?? 0),
			reported: Number(totals.results?.[0]?.reported ?? 0)
		}
	};
}
export async function clearMaxDiagnostics(platform: unknown) {
	const db = database(platform);
	if (!db) return false;
	await db.prepare('DELETE FROM max_diagnostics').run();
	return true;
}
export async function reportMaxDiagnostic(
	platform: unknown,
	id: string,
	receipt: string,
	reason: MaxReportReason
) {
	const db = database(platform);
	if (!db) return undefined;
	const result = await db
		.prepare(
			'UPDATE max_diagnostics SET reported_reason = ? WHERE id = ? AND report_hash = ? AND created_at >= ?'
		)
		.bind(reason, id, hash(receipt), cutoff())
		.run();
	return (result.meta?.changes ?? 0) > 0;
}
