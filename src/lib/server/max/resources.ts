import { getFeedbackForReceipt } from '$lib/server/feedback';
import { mcpToolByName, toToolFailure } from '$lib/server/mcp/tools';
import { runStudentOperation, type StudentSession } from '$lib/server/student-session';
import { load } from 'cheerio';
import { readMaxFile } from './files';
import { maxAppKnowledge } from './knowledge';
import type { FunctionTool } from './tokenMesh';

const resources = [
	'gradebook',
	'attendance',
	'calendar',
	'schedule',
	'documents',
	'document',
	'report_cards',
	'profile',
	'school',
	'mail_folders',
	'mail',
	'message',
	'attachment',
	'feedback',
	'app_info'
] as const;
const properties = {
	resource: { type: 'string', enum: resources },
	reportPeriod: {
		type: 'integer',
		description:
			'Gradebook reporting-period index from gradebook.reportingPeriods. Omit for current period.'
	},
	recordId: {
		type: 'string',
		description:
			'Exact id returned by documents, mail or feedback. Required for document, message and attachment.'
	},
	folderId: { type: 'string', description: 'Mail folder id from mail_folders; omit for inbox.' },
	folderType: { type: 'integer' },
	month: { type: 'integer' },
	year: { type: 'integer' },
	system: { type: 'boolean' },
	page: { type: 'integer', description: 'PDF page number, starts at 1.' },
	path: {
		type: 'string',
		description:
			'JSON Pointer from a prior result, e.g. /courses/0/assignments/125. Empty reads the root. Use returned paths to drill into ANY record/field.'
	},
	offset: {
		type: 'integer',
		description:
			'Pagination offset for records, object fields or text characters. Follow nextOffset until null.'
	},
	limit: {
		type: 'integer',
		description:
			'Maximum records (1–20) or text characters (1–6000). Defaults: 5 records / 6000 characters.'
	}
};
export const MAX_RESOURCE_TOOLS: FunctionTool[] = [
	{
		type: 'function',
		function: {
			name: 'read_app_resource',
			description:
				'Read ANY signed-in app record in depth, on demand. Full gradebook across periods, every assignment and teacher note/description/score, categories and teacher contacts; attendance events/reasons; calendar; schedule; school/profile; documents/report cards; inbox/sent folders, mail bodies/senders/recipients/attachments; own feedback threads and team replies; all app pages, landing-page copy, privacy policy and how features work (app_info). Results are paginated, not a fixed summary: follow paths and nextOffset. For PDFs use page then /content; text files are readable. Images have metadata only and explicitly report unreadable. No write actions.',
			parameters: {
				type: 'object',
				properties,
				required: ['resource'],
				additionalProperties: false
			}
		}
	},
	{
		type: 'function',
		function: {
			name: 'search_app_records',
			description:
				'Search the COMPLETE requested resource, including assignments beyond the initial chat summary, full teacher notes, mail text/senders, feedback and product/privacy/landing content. Returns exact record paths and excerpts; then read_app_resource for full details. Search one resource/period at a time; list mail_folders and search each relevant folder for sent/inbox. Never assume a preview is the full dataset.',
			parameters: {
				type: 'object',
				properties: {
					...properties,
					query: {
						type: 'string',
						description: 'Short keywords or a specific assignment, sender, topic or feature.'
					}
				},
				required: ['resource', 'query'],
				additionalProperties: false
			}
		}
	}
];
export type MaxResourceAccess = {
	execute: (args: unknown, search: boolean) => Promise<unknown>;
	dispose: () => Promise<void>;
	usedPortal: boolean;
	cancel: () => void;
};
class MaxResourceInputError extends Error {}
type Args = Record<string, unknown>;
const obj = (value: unknown): Args => {
	if (!value || typeof value !== 'object' || Array.isArray(value))
		throw new MaxResourceInputError('Expected resource arguments.');
	return value as Args;
};
function number(args: Args, key: string, min: number, max: number, fallback?: number) {
	const value = args[key];
	if (value === undefined) return fallback;
	if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < min || value > max)
		throw new MaxResourceInputError(`Invalid ${key}.`);
	return value;
}
function text(args: Args, key: string, required = false) {
	const value = args[key];
	if (value === undefined && !required) return '';
	if (typeof value !== 'string' || value.length > 1024 || (required && !value.trim()))
		throw new MaxResourceInputError(`Invalid ${key}.`);
	return value;
}
const forbidden =
	/password|secret|token|cookie|authorization|credential|base64|photo$|clientSessionId|sessionId|api[_-]?key/i;
const pointer = (path: string, key: string | number) =>
	path + '/' + String(key).replace(/~/g, '~0').replace(/\//g, '~1');

const redactUrlSecrets = (value: string) =>
	value.replace(
		/([?&](?:access[_-]?token|refresh[_-]?token|token|api[_-]?key|key|auth|password|secret)=)(?!\[redacted\])[^\s&#"']+/gi,
		'$1[redacted]'
	);

/** Credentials never enter the model-facing record tree. Record contents are inert data. */
export function cleanMaxRecord(value: unknown): unknown {
	if (typeof value === 'string') {
		if (/<(?:p|div|html|br|script|style|a)\b/i.test(value)) {
			const $ = load(value);
			$('script,style').remove();
			$('a[href]').each((_index, element) => {
				const href = $(element).attr('href') ?? '';
				if (/^(?:https?:\/\/|mailto:|\/)/i.test(href))
					$(element).replaceWith(`${$(element).text()} (${redactUrlSecrets(href)})`);
			});
			$('p,div,br').append('\n');
			value = $.text();
		}
		return redactUrlSecrets(String(value));
	}
	if (Array.isArray(value)) return value.map(cleanMaxRecord);
	if (value && typeof value === 'object')
		return Object.fromEntries(
			Object.entries(value)
				.filter(
					([key]) =>
						!forbidden.test(key) && !['__proto__', 'constructor', 'prototype'].includes(key)
				)
				.map(([key, item]) => [key, cleanMaxRecord(item)])
		);
	return value;
}
function resolvePath(value: unknown, path: string) {
	if (!path) return value;
	if (!path.startsWith('/') || path.split('/').length > 40)
		throw new MaxResourceInputError('Use an exact returned JSON Pointer path.');
	for (const part of path.slice(1).split('/')) {
		const key = part.replace(/~1/g, '/').replace(/~0/g, '~');
		if (
			!value ||
			typeof value !== 'object' ||
			!Object.hasOwn(value, key) ||
			['__proto__', 'constructor', 'prototype'].includes(key)
		)
			throw new MaxResourceInputError(
				'Record path was not found. Read its parent to discover available fields.'
			);
		value = (value as Args)[key];
	}
	return value;
}
function preview(value: unknown, path: string, depth = 0): unknown {
	if (typeof value === 'string')
		return value.length <= 500
			? value
			: { path, preview: value.slice(0, 500), characters: value.length, hasMore: true };
	if (Array.isArray(value))
		return {
			path,
			type: 'array',
			count: value.length,
			...(depth < 2
				? {
						items: value
							.slice(0, 3)
							.map((item, index) => preview(item, pointer(path, index), depth + 1))
					}
				: {})
		};
	if (value && typeof value === 'object') {
		const entries = Object.entries(value);
		if (depth >= 2)
			return {
				path,
				type: 'object',
				fields: entries.slice(0, 100).map(([key]) => key),
				moreFields: entries.length > 100
			};
		return {
			...Object.fromEntries(
				entries
					.slice(0, 30)
					.map(([key, item]) => [key, preview(item, pointer(path, key), depth + 1)])
			),
			_recordPath: path,
			...(entries.length > 30 ? { _moreFields: true } : {})
		};
	}
	return value;
}
function readPage(value: unknown, args: Args) {
	const path = text(args, 'path');
	const selected = resolvePath(value, path);
	const offset = number(args, 'offset', 0, 10_000_000, 0)!;
	if (typeof selected === 'string') {
		const limit = number(args, 'limit', 1, 6000, 6000)!;
		return {
			path,
			totalCharacters: selected.length,
			offset,
			content: selected.slice(offset, offset + limit),
			nextOffset: offset + limit < selected.length ? offset + limit : null
		};
	}
	if (!selected || typeof selected !== 'object') return { path, value: selected, nextOffset: null };
	const limit = number(args, 'limit', 1, 20, 5)!;
	const entries = Object.entries(selected);
	let end = Math.min(offset + limit, entries.length);
	const build = () =>
		Object.fromEntries(
			entries.slice(offset, end).map(([key, item]) => [key, preview(item, pointer(path, key))])
		);
	let records = build();
	while (end > offset + 1 && JSON.stringify(records).length > 14000) {
		end--;
		records = build();
	}
	if (JSON.stringify(records).length > 14000)
		records = Object.fromEntries(
			entries.slice(offset, end).map(([key, item]) => [key, preview(item, pointer(path, key), 2)])
		);
	return {
		path,
		total: entries.length,
		offset,
		records,
		nextOffset: end < entries.length ? end : null,
		note: 'Nested arrays and long values are references. Read their exact paths; no rows are inaccessible due to pagination.'
	};
}
function searchRecords(value: unknown, args: Args) {
	const query = text(args, 'query', true).toLowerCase().split(/\s+/).filter(Boolean);
	if (query.length > 20) throw new MaxResourceInputError('Use a shorter search query.');
	const offset = number(args, 'offset', 0, 10_000_000, 0)!;
	const limit = number(args, 'limit', 1, 20, 10)!;
	const rootPath = text(args, 'path');
	const matches: { path: string; excerpt: string }[] = [];
	let fields = 0;
	function walk(item: unknown, path: string) {
		fields++;
		if (fields > 250000) return;
		if (typeof item === 'string' && query.every((word) => item.toLowerCase().includes(word))) {
			const start = Math.max(0, item.toLowerCase().indexOf(query[0]!) - 120);
			matches.push({ path, excerpt: item.slice(start, start + 600) });
		} else if (item && typeof item === 'object')
			for (const [key, child] of Object.entries(item)) walk(child, pointer(path, key));
	}
	walk(resolvePath(value, rootPath), rootPath);
	return {
		query: query.join(' '),
		totalMatches: matches.length,
		matches: matches.slice(offset, offset + limit),
		nextOffset: offset + limit < matches.length ? offset + limit : null,
		incomplete: fields > 250000,
		note: 'Search covers the requested resource, period and folder. Read parent paths for the complete matching records.'
	};
}
export function createMaxResourceAccess(
	session: StudentSession,
	options: { signal?: AbortSignal; platform?: unknown; feedbackReceipts?: unknown } = {}
): MaxResourceAccess {
	const cache = new Map<string, Promise<unknown>>();
	const controller = new AbortController();
	const signal = controller.signal;
	const cancel = () => controller.abort();
	if (options.signal?.aborted) cancel();
	options.signal?.addEventListener('abort', cancel, { once: true });
	const fileReaders: Array<Awaited<ReturnType<typeof readMaxFile>>> = [];
	const receipts = (Array.isArray(options.feedbackReceipts) ? options.feedbackReceipts : [])
		.slice(0, 20)
		.flatMap((value) => {
			if (!value || typeof value !== 'object') return [];
			const item = value as Args;
			return typeof item.id === 'string' &&
				/^[0-9a-f-]{36}$/i.test(item.id) &&
				typeof item.replyToken === 'string' &&
				/^[A-Za-z0-9_-]{43}$/.test(item.replyToken)
				? [{ id: item.id, replyToken: item.replyToken }]
				: [];
		});
	const access: MaxResourceAccess = {
		usedPortal: false,
		cancel,
		dispose: async () => {
			cancel();
			options.signal?.removeEventListener('abort', cancel);
			await Promise.allSettled([...cache.values()]);
			for (const file of fileReaders)
				if ('dispose' in file) await file.dispose?.().catch(() => undefined);
		},
		execute: async (rawArgs, search) => {
			try {
				if (signal.aborted) throw new MaxResourceInputError('Request cancelled.');
				const args = obj(rawArgs);
				const resource = text(args, 'resource', true);
				if (!(resources as readonly string[]).includes(resource))
					throw new MaxResourceInputError('Unsupported app resource.');
				const reportPeriod = number(args, 'reportPeriod', 0, 999);
				const id = text(args, 'recordId');
				const folderId = text(args, 'folderId');
				const folderType = number(args, 'folderType', 0, 64, 0)!;
				const month = number(args, 'month', 1, 12);
				const year = number(args, 'year', 2000, 2200);
				if ((month === undefined) !== (year === undefined))
					throw new MaxResourceInputError('Provide both month and year.');
				if (args.system !== undefined && typeof args.system !== 'boolean')
					throw new MaxResourceInputError('system must be a boolean.');
				if (['message', 'document', 'attachment'].includes(resource) && !id)
					throw new MaxResourceInputError(
						'Read the corresponding list first, then provide its recordId.'
					);
				const key = JSON.stringify([
					resource,
					reportPeriod,
					id,
					folderId,
					folderType,
					month,
					year,
					args.system
				]);
				if (!cache.has(key))
					cache.set(
						key,
						(async () => {
							if (resource === 'app_info') return maxAppKnowledge;
							if (resource === 'feedback') {
								const threads = [];
								for (const receipt of receipts.filter((item) => !id || item.id === id)) {
									const thread = await getFeedbackForReceipt(
										options.platform,
										receipt.id,
										receipt.replyToken
									);
									if (thread === undefined)
										throw new MaxResourceInputError(
											'Feedback storage is unavailable in this environment. Open Feedback to check.'
										);
									if (thread) threads.push(thread);
								}
								return {
									source: 'Feedback conversations available in this browser',
									threads,
									note: 'Only threads with a valid saved receipt are accessible. Missing receipts are unknown, not proof that feedback was never sent.'
								};
							}
							access.usedPortal = true;
							if (resource === 'attendance')
								return mcpToolByName.get('get_attendance')!.handler({}, { session, signal });
							return runStudentOperation(
								session,
								async () => {
									switch (resource) {
										case 'gradebook':
											return session.client.gradebook(reportPeriod, false);
										case 'calendar':
											return session.client.calendar(month, year);
										case 'schedule':
											return session.client.schedule();
										case 'documents':
											return { documents: await session.client.documents() };
										case 'report_cards':
											return session.client.reportCards();
										case 'profile': {
											const info = await session.client.studentInfo();
											return {
												...info,
												profileImage: {
													available: !!info.photo,
													readable: false,
													reason:
														'Profile images can be viewed in the app; Max cannot interpret visual content.'
												}
											};
										}
										case 'school':
											return session.client.schoolInfo();
										case 'mail_folders':
											return { folders: await session.client.folders() };
										case 'mail':
											return {
												messages: await session.client.messages(folderId || null, folderType)
											};
										case 'message':
											return {
												message: await session.client.messageDetails(id, args.system === true)
											};
										case 'document':
										case 'attachment': {
											const file = await readMaxFile(
												await (resource === 'document'
													? session.client.document(id)
													: session.client.attachment(id))
											);
											fileReaders.push(file);
											return file;
										}
									}
								},
								signal
							);
						})().then((data) =>
							data && typeof data === 'object' && 'readPage' in data ? data : cleanMaxRecord(data)
						)
					);
				let data = await cache.get(key);
				if (
					data &&
					typeof data === 'object' &&
					'readPage' in data &&
					typeof data.readPage === 'function'
				) {
					const file = data as Extract<
						Awaited<ReturnType<typeof readMaxFile>>,
						{ readPage: unknown }
					>;
					const page = number(args, 'page', 1, file.pageCount, 1)!;
					const content = String(cleanMaxRecord(await file.readPage(page)));
					const textAvailable = content.trim().length > 0;
					data = {
						fileName: file.fileName,
						mimeType: file.mimeType,
						pageCount: file.pageCount,
						page,
						content,
						textAvailable,
						...(!textAvailable
							? {
									reason:
										'No extractable text on this page. It may be a scan or image; Max cannot inspect its visual content. Open it in the app.'
								}
							: {})
					};
				}
				return {
					source:
						resource === 'app_info' ? 'Grademaxxing app source' : 'Signed-in Grademaxxing app data',
					resource,
					reportPeriod: reportPeriod ?? 'current',
					dataAsOf: new Date().toISOString(),
					...(data && typeof data === 'object' && 'textAvailable' in data
						? {
								textAvailable: data.textAvailable,
								...(!data.textAvailable && 'reason' in data ? { limitation: data.reason } : {})
							}
						: {}),
					...(search ? searchRecords(data, args) : readPage(data, args))
				};
			} catch (error) {
				const failure =
					error instanceof MaxResourceInputError
						? { message: error.message, code: 'INVALID_ARGUMENTS' }
						: toToolFailure(error);
				return {
					error: failure.message,
					code: failure.code,
					action:
						'Use returned paths or narrower inputs. Refresh/reconnect if unavailable. Do not invent missing records.'
				};
			}
		}
	};
	return access;
}
