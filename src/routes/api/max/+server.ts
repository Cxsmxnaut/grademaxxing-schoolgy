import { dev } from '$app/environment';
import { env as privateEnv } from '$env/dynamic/private';
import type { Env } from '$lib/server/max/config';
import { sanitizeMaxContext } from '$lib/server/max/context';
import { createMaxDiagnostics, type MaxDiagnostics } from '$lib/server/max/diagnostics';
import { askMaxDetailed, generateChatTitle, getDefaultMesh } from '$lib/server/max/max';
import { createMaxResourceAccess, type MaxResourceAccess } from '$lib/server/max/resources';
import {
	PoolExhaustedError,
	TokenMesh,
	UpstreamError,
	type AttemptError
} from '$lib/server/max/tokenMesh';
import {
	clientSessionHeader,
	getStudentSession,
	requireStudentSessionContext,
	serializeStudentSession,
	sessionCookie,
	sessionMaxAge
} from '$lib/server/student-session';
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const config = { maxDiagnostics: true };

/**
 * POST /api/max — the Max AI chat endpoint.
 *
 * Same contract as the max-grademaxxing `api/max.js` serverless function:
 *   { studentDataContext, userQuery, history?, stream? }
 *     -> JSON: { text, provider, model, usage }
 *     -> SSE (stream: true): data:{"t":chunk} … data:{"done":true,…}
 *
 * Provider keys come only from server environment variables — never from the
 * client, the repo, or the UI:
 *   GROQ_API_KEYS / OPENROUTER_API_KEYS / MISTRAL_API_KEYS / GEMINI_API_KEYS
 *   (comma-separated lists), plus optional <PROVIDER>_MODEL / <PROVIDER>_BASE_URL
 *   and APP_URL / APP_NAME (OpenRouter attribution).
 *
 * The Token Mesh module-scope cache means warm invocations keep their 429
 * benches; cold starts simply begin with a clean pool. Either way the caller
 * only ever sees a successful reply or a clean JSON error. Content-free diagnostics are stored separately; only an
 * development-test question may be included, never replies or app context.
 *
 * Abuse protection mirrors /api/feedback: the app-wide cross-site POST guard
 * in hooks.server.ts plus a per-address soft rate ceiling here.
 */

const WINDOW_MS = 60 * 1000;
const MAX_REQUESTS = 12;
const MAX_QUERY_LENGTH = 8_000;
const MAX_BODY_BYTES = 32 * 1024;
const requests = new Map<string, { count: number; resetAt: number }>();

function safeClientAddress(getClientAddress: () => string) {
	try {
		return getClientAddress().slice(0, 128);
	} catch {
		return 'local';
	}
}

function recordRequest(address: string) {
	const now = Date.now();
	for (const [key, value] of requests) if (value.resetAt <= now) requests.delete(key);
	if (!requests.has(address) && requests.size >= 10_000)
		requests.delete(requests.keys().next().value!);
	const current = requests.get(address);
	requests.set(
		address,
		current && current.resetAt > now
			? { ...current, count: current.count + 1 }
			: { count: 1, resetAt: now + WINDOW_MS }
	);
}

function requestEnv(platform: unknown): Env {
	// $env/dynamic/private supplies Vite-loaded .env defaults (dev needs no
	// manual sourcing); real process env overrides them, and explicit platform
	// env (Worker bindings) wins overall.
	const platformEnv = (platform as { env?: Env } | undefined)?.env;
	const processEnv: Env = typeof process !== 'undefined' ? process.env : {};
	return { ...privateEnv, ...processEnv, ...platformEnv };
}

/** Shared failure classification — matches the max-grademaxxing servers. */
function classifyError(err: unknown): { status: number; payload: Record<string, unknown> } {
	// Classify by message/name first — not just instanceof: "No provider
	// keys" is a plain Error, and bundlers can duplicate error classes so
	// instanceof fails while .name survives.
	const error = err instanceof Error ? err : new Error(String(err));
	const name = error.name ?? 'Error';
	const message = typeof error.message === 'string' ? error.message : '';
	const rawAttempts = (err as { attempts?: unknown } | null)?.attempts;
	const attempts = Array.isArray(rawAttempts)
		? rawAttempts.map(({ slotId, provider, kind, status }: AttemptError) => ({
				slotId,
				provider,
				kind,
				status
			}))
		: [];

	if (message.includes('No provider keys configured')) {
		return { status: 503, payload: { error: message, type: 'NotConfigured', retryable: false } };
	}
	if (name === 'PoolExhaustedError' || err instanceof PoolExhaustedError) {
		return {
			status: 503,
			payload: {
				error: 'Max is temporarily busy. Please try again in a minute.',
				type: 'PoolExhaustedError',
				retryable: true
			}
		};
	}
	if (name === 'MaxOutputLimitError') {
		return {
			status: 502,
			payload: {
				error: "Max's reply hit its length limit. Try asking for one part at a time.",
				type: name,
				retryable: true
			}
		};
	}
	if (name === 'UpstreamError' || err instanceof UpstreamError) {
		return {
			status: 502,
			payload: {
				error: 'Max is having trouble reaching its AI providers. Please try again shortly.',
				type: 'UpstreamError',
				attempts
			}
		};
	}
	if (err instanceof TypeError) {
		return { status: 400, payload: { error: message, type: name } };
	}
	return { status: 500, payload: { error: 'internal error', type: name } };
}

/**
 * SSE variant — same frame format as the max-grademaxxing servers:
 *   data: {"t":"token"}   per content delta
 *   data: {"done":true,"text":...,"provider":...,"model":...,"usage":...}
 *   data: {"error":...,"type":...,"status":...,"partial":bool}  on failure
 * The head is committed before the first token (SSE requires it), so a
 * pre-token failure is reported as an in-stream error event; the UI treats
 * it exactly like a failed request.
 */
async function streamMax(
	mesh: TokenMesh,
	body: {
		studentDataContext?: unknown;
		userQuery: string;
		history?: unknown;
		conversationMemory?: unknown;
	},
	access: MaxResourceAccess,
	commitSession: () => void,
	diagnostics: MaxDiagnostics
) {
	const encoder = new TextEncoder();
	let closed = false;
	let ready!: () => void;
	const started = new Promise<void>((resolve) => (ready = resolve));
	const stream = new ReadableStream<Uint8Array>({
		start(controller) {
			const send = (obj: Record<string, unknown>) => {
				if (closed) return;
				try {
					controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));
				} catch {
					closed = true;
				}
			};

			let delivered = false;
			askMaxDetailed(body.studentDataContext ?? null, body.userQuery, {
				mesh,
				history: body.history,
				conversationMemory: body.conversationMemory,
				resourceAccess: access,
				onAttempt: diagnostics.attempt,
				onTool: diagnostics.tool,
				onToken: (chunk) => {
					diagnostics.token(chunk);
					ready();
					delivered = true;
					send({ t: chunk });
				}
			})
				.then(async (result) => {
					await diagnostics.finish('success', result);
					send({
						diagnosticId: diagnostics.id,
						reportReceipt: diagnostics.reportReceipt,
						done: true,
						text: result.text,
						provider: result.provider,
						model: result.model,
						usage: result.usage,
						toolsUsed: result.toolsUsed
					});
				})
				.catch(async (err: unknown) => {
					const { status, payload } = classifyError(err);
					await diagnostics.finish('failed', undefined, String(payload.type ?? 'Error'));
					delete payload.attempts; // too heavy for the stream
					send({
						diagnosticId: diagnostics.id,
						reportReceipt: diagnostics.reportReceipt,
						error: payload.error,
						type: payload.type ?? 'Error',
						status,
						partial: delivered
					});
				})
				.finally(() => {
					ready();
					void access.dispose().catch(() => undefined);
					closed = true;
					try {
						controller.close();
					} catch {
						/* already closed */
					}
				});
		},
		async cancel() {
			closed = true;
			access.cancel();
			await diagnostics.finish('cancelled');
		}
	});

	await started;
	commitSession();
	return new Response(stream, {
		headers: {
			'content-type': 'text/event-stream; charset=utf-8',
			'cache-control': 'no-store, no-transform',
			'x-accel-buffering': 'no' // proxies: don't buffer, the whole point is liveness
		}
	});
}

export const POST: RequestHandler = async ({ request, cookies, platform, getClientAddress }) => {
	let session: ReturnType<typeof getStudentSession>;
	try {
		session = getStudentSession(cookies.get(sessionCookie));
		requireStudentSessionContext(session, request.headers.get(clientSessionHeader));
	} catch {
		return json({ error: 'Sign in before asking Max.', type: 'Unauthorized' }, { status: 401 });
	}

	const address = safeClientAddress(getClientAddress);
	const current = requests.get(address);
	if (current && current.resetAt > Date.now() && current.count >= MAX_REQUESTS)
		return json(
			{ error: 'Too many questions at once. Please wait a moment.', type: 'RateLimited' },
			{
				status: 429,
				headers: { 'Retry-After': String(Math.ceil((current.resetAt - Date.now()) / 1000)) }
			}
		);

	let input: {
		action?: unknown;
		feedbackReceipts?: unknown;
		assistantReply?: unknown;
		studentDataContext?: unknown;
		userQuery?: unknown;
		history?: unknown;
		conversationMemory?: unknown;
		stream?: unknown;
	};
	try {
		const declared = Number(request.headers.get('content-length') ?? 0);
		if (declared > MAX_BODY_BYTES)
			return json({ error: 'Question payload is too large.', type: 'BadRequest' }, { status: 413 });
		const reader = request.body?.getReader();
		const chunks: Uint8Array[] = [];
		let size = 0;
		try {
			if (reader)
				for (;;) {
					const { done, value } = await reader.read();
					if (done) break;
					size += value.byteLength;
					if (size > MAX_BODY_BYTES) {
						void reader.cancel().catch(() => undefined);
						return json(
							{ error: 'Question payload is too large.', type: 'BadRequest' },
							{ status: 413 }
						);
					}
					chunks.push(value);
				}
		} finally {
			reader?.releaseLock();
		}
		const bytes = new Uint8Array(size);
		let offset = 0;
		for (const chunk of chunks) {
			bytes.set(chunk, offset);
			offset += chunk.byteLength;
		}
		const parsed: unknown = JSON.parse(new TextDecoder().decode(bytes));
		if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
			return json({ error: 'Expected a question object.', type: 'BadRequest' }, { status: 400 });
		input = parsed as typeof input;
	} catch {
		return json({ error: 'invalid JSON body', type: 'BadRequest' }, { status: 400 });
	}

	const userQuery = input.userQuery;
	if (typeof userQuery !== 'string' || userQuery.trim() === '') {
		return json(
			{ error: 'askMax: userQuery must be a non-empty string', type: 'BadRequest' },
			{ status: 400 }
		);
	}
	if (userQuery.length > MAX_QUERY_LENGTH) {
		return json(
			{
				error: `Keep questions under ${MAX_QUERY_LENGTH.toLocaleString()} characters.`,
				type: 'BadRequest'
			},
			{ status: 400 }
		);
	}

	if (input.action !== undefined && input.action !== 'title')
		return json({ error: 'Unknown action.', type: 'BadRequest' }, { status: 400 });

	recordRequest(address);
	const context = sanitizeMaxContext(input.studentDataContext);
	const diagnostics = createMaxDiagnostics(platform, {
		question: userQuery,
		shareQuestion: dev,
		username: session.username,
		action: input.action === 'title' ? 'title' : 'chat'
	});
	request.signal.addEventListener(
		'abort',
		() => {
			void diagnostics.finish('cancelled');
		},
		{ once: true }
	);

	let mesh: TokenMesh;
	try {
		mesh = getDefaultMesh(requestEnv(platform));
	} catch (err) {
		const { status, payload } = classifyError(err);
		await diagnostics.finish('failed', undefined, String(payload.type ?? 'Error'));
		return json(
			{ ...payload, diagnosticId: diagnostics.id, reportReceipt: diagnostics.reportReceipt },
			{ status }
		);
	}

	if (input.action === 'title') {
		const result = await generateChatTitle(
			userQuery,
			typeof input.assistantReply === 'string' ? input.assistantReply.slice(0, 300) : '',
			{ mesh, onAttempt: diagnostics.attempt }
		);
		await diagnostics.finish(
			result.provider === 'fallback' ? 'failed' : 'success',
			undefined,
			result.provider === 'fallback' ? 'TitleFallback' : undefined
		);
		return json(result, { headers: { 'cache-control': 'no-store' } });
	}

	const access = createMaxResourceAccess(session, {
		signal: request.signal,
		platform,
		feedbackReceipts: input.feedbackReceipts
	});
	const commitSession = () => {
		if (access.usedPortal)
			cookies.set(sessionCookie, serializeStudentSession(session), {
				path: '/',
				httpOnly: true,
				sameSite: 'lax',
				secure: !dev,
				maxAge: sessionMaxAge
			});
	};
	if (input.stream === true) {
		return streamMax(
			mesh,
			{
				studentDataContext: context,
				userQuery,
				history: input.history,
				conversationMemory: input.conversationMemory
			},
			access,
			commitSession,
			diagnostics
		);
	}

	try {
		const result = await askMaxDetailed(context, userQuery, {
			mesh,
			history: input.history,
			conversationMemory: input.conversationMemory,
			resourceAccess: access,
			onAttempt: diagnostics.attempt,
			onTool: diagnostics.tool
		});
		commitSession();
		await diagnostics.finish('success', result);
		return json({
			diagnosticId: diagnostics.id,
			reportReceipt: diagnostics.reportReceipt,
			text: result.text,
			provider: result.provider,
			model: result.model,
			usage: result.usage,
			toolsUsed: result.toolsUsed
		});
	} catch (err) {
		const { status, payload } = classifyError(err);
		await diagnostics.finish('failed', undefined, String(payload.type ?? 'Error'));
		return json(
			{ ...payload, diagnosticId: diagnostics.id, reportReceipt: diagnostics.reportReceipt },
			{ status }
		);
	} finally {
		await access.dispose();
	}
};
