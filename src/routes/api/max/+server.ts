import { env as privateEnv } from '$env/dynamic/private';
import type { Env } from '$lib/server/max/config';
import { askMaxDetailed, getDefaultMesh } from '$lib/server/max/max';
import {
	PoolExhaustedError,
	TokenMesh,
	UpstreamError,
	type AttemptError
} from '$lib/server/max/tokenMesh';
import { getStudentSession, sessionCookie } from '$lib/server/student-session';
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

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
 * only ever sees a successful reply or a clean JSON error. Nothing about a
 * conversation is stored server-side.
 *
 * Abuse protection mirrors /api/feedback: the app-wide cross-site POST guard
 * in hooks.server.ts plus a per-address soft rate ceiling here.
 */

const WINDOW_MS = 60 * 1000;
const MAX_REQUESTS = 12;
const MAX_QUERY_LENGTH = 8_000;
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
	const rawAttempts = (err as { attempts?: unknown }).attempts;
	const attempts = Array.isArray(rawAttempts)
		? rawAttempts.map((attempt: AttemptError) => {
				const { detail: _detail, ...rest } = attempt;
				return rest;
			})
		: [];

	if (message.includes('No provider keys configured')) {
		return { status: 503, payload: { error: message, type: 'NotConfigured', retryable: false } };
	}
	if (name === 'PoolExhaustedError' || err instanceof PoolExhaustedError) {
		return {
			status: 503,
			payload: { error: message, type: 'PoolExhaustedError', retryable: true }
		};
	}
	if (name === 'UpstreamError' || err instanceof UpstreamError) {
		return {
			status: 502,
			payload: {
				error: message || 'all pooled provider keys failed',
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
function streamMax(
	mesh: TokenMesh,
	body: { studentDataContext?: unknown; userQuery: string; history?: unknown }
) {
	const encoder = new TextEncoder();
	let closed = false;
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
				onToken: (chunk) => {
					delivered = true;
					send({ t: chunk });
				}
			})
				.then((result) => {
					send({
						done: true,
						text: result.text,
						provider: result.provider,
						model: result.model,
						usage: result.usage
					});
				})
				.catch((err: unknown) => {
					const { status, payload } = classifyError(err);
					delete payload.attempts; // too heavy for the stream
					send({
						error: payload.error,
						type: payload.type ?? 'Error',
						status,
						partial: delivered
					});
				})
				.finally(() => {
					closed = true;
					try {
						controller.close();
					} catch {
						/* already closed */
					}
				});
		}
	});

	return new Response(stream, {
		headers: {
			'content-type': 'text/event-stream; charset=utf-8',
			'cache-control': 'no-cache, no-transform',
			'x-accel-buffering': 'no' // proxies: don't buffer, the whole point is liveness
		}
	});
}

export const POST: RequestHandler = async ({ request, cookies, platform, getClientAddress }) => {
	try {
		getStudentSession(cookies.get(sessionCookie));
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
		studentDataContext?: unknown;
		userQuery?: unknown;
		history?: unknown;
		stream?: unknown;
	};
	try {
		input = (await request.json()) as typeof input;
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

	recordRequest(address);

	let mesh: TokenMesh;
	try {
		mesh = getDefaultMesh(requestEnv(platform));
	} catch (err) {
		const { status, payload } = classifyError(err);
		return json(payload, { status });
	}

	if (input.stream === true) {
		return streamMax(mesh, {
			studentDataContext: input.studentDataContext ?? null,
			userQuery,
			history: input.history
		});
	}

	try {
		const result = await askMaxDetailed(input.studentDataContext ?? null, userQuery, {
			mesh,
			history: input.history
		});
		return json({
			text: result.text,
			provider: result.provider,
			model: result.model,
			usage: result.usage
		});
	} catch (err) {
		const { status, payload } = classifyError(err);
		if (status === 500) console.error('askMax failed:', err);
		return json(payload, { status });
	}
};
