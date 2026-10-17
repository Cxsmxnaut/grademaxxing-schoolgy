/**
 * tokenMesh.ts — THE MODEL SWITCHER ENGINE ("Token Mesh")
 *
 * TypeScript port of `src/tokenMesh.js` from the max-grademaxxing project
 * (github.com/Cxsmxnaut/max-grademaxxing), preserving its behavior exactly.
 *
 * A dependency-free router that spreads chat traffic across a pooled array of
 * free-tier provider keys (Groq, OpenRouter, Mistral, Gemini — anything
 * OpenAI-compatible).
 *
 * Behaviour per incoming request:
 *   1. Waterfall order: Tier-1 slots first (shuffled within the tier), then
 *      Tier-2, etc. — see orderWaterfall(). Benched slots are excluded.
 *   2. Try slots in that order with native fetch.
 *   3. HTTP 429 (rate limit)  -> bench that key for 60s (+ jitter) and INSTANTLY
 *      retry the exact same request on the next key. The caller never sees it.
 *   4. HTTP 401/403 (dead key) -> bench 10 min, fail over to the next key.
 *   5. HTTP 5xx / network drop -> fail over to the next key without benching.
 *   6. Every key benched       -> wait for the shortest bench to expire
 *      (bounded by maxPoolWaitMs) instead of failing the user.
 *   7. Hung upstreams          -> every fetch carries an abort signal: a
 *      silent provider is cut off (attemptTimeoutMs for non-stream, idle
 *      timeout between SSE chunks), benched like a rate limit, and the
 *      request fails over — no key can stall a reply until the platform
 *      kills the invocation.
 *
 * The mesh is stateless with respect to conversations: it only ever tracks
 * per-key bench timers. No message history is stored, ever.
 */

export const DEFAULT_BENCH_MS = 60_000; // 60 seconds, per spec
export const DEFAULT_BENCH_JITTER_MS = 1_000; // avoids thundering-herd retries
export const INVALID_KEY_BENCH_MS = 10 * 60_000; // 401/403 keys get a longer penalty
export const DEFAULT_MAX_POOL_WAIT_MS = 120_000;
export const DEFAULT_ATTEMPT_TIMEOUT_MS = 20_000; // non-stream: headers + body must finish within this
export const DEFAULT_STREAM_IDLE_TIMEOUT_MS = 20_000; // stream: max silence between SSE reads (first read included)

export class PoolExhaustedError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'PoolExhaustedError';
	}
}

export class UpstreamError extends Error {
	/** One entry per failed slot: { slotId, provider, kind, status } */
	attempts: AttemptError[];
	constructor(message: string, attempts: AttemptError[] = []) {
		super(message);
		this.name = 'UpstreamError';
		this.attempts = attempts;
	}
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Fisher-Yates shuffle; returns a new array, never mutates the input. */
export function shuffle<T>(array: readonly T[], random: () => number = Math.random): T[] {
	const out = [...array];
	for (let i = out.length - 1; i > 0; i--) {
		const j = Math.floor(random() * (i + 1));
		[out[i]!, out[j]!] = [out[j]!, out[i]!];
	}
	return out;
}

export interface MeshSlot {
	id?: string;
	provider: string;
	key: string;
	model: string;
	baseUrl: string;
	headers?: Record<string, string>;
	tier?: number;
}

interface ResolvedSlot {
	id: string;
	provider: string;
	key: string;
	model: string;
	baseUrl: string;
	headers: Record<string, string>;
	tier: number;
}

export interface ToolCall {
	id: string;
	type: 'function';
	function: { name: string; arguments: string };
	extra_content?: Record<string, unknown>;
}
export interface FunctionTool {
	type: 'function';
	function: { name: string; description: string; parameters: Record<string, unknown> };
}

function parseToolCalls(value: unknown): ToolCall[] {
	if (!Array.isArray(value)) return [];
	return value.slice(0, 8).flatMap((entry) => {
		if (!entry || typeof entry !== 'object') return [];
		const call = entry as ToolCall;
		if (
			typeof call.id !== 'string' ||
			!call.id ||
			typeof call.function?.name !== 'string' ||
			typeof call.function.arguments !== 'string' ||
			call.function.arguments.length > 16_000
		)
			return [];
		return [{ ...call, type: 'function' as const }];
	});
}

export interface ChatMessage {
	role: string;
	content: string;
	tool_calls?: ToolCall[];
	tool_call_id?: string;
}

export interface ChatPayload {
	temperature?: number;
	messages: ChatMessage[];
	tools?: FunctionTool[];
	tool_choice?: 'auto' | 'none' | 'required';
}

export type MeshUsage = Record<string, unknown>;

export interface MeshResult {
	text: string;
	provider: string;
	model: string;
	slotId: string;
	usage: MeshUsage | null;
	toolCalls?: ToolCall[];
	toolsUsed?: string[];
	finishReason?: string;
}

export type MeshAttempt = {
	provider: string;
	model: string;
	kind: AttemptErrorKind | 'success';
	status: number | null;
	durationMs: number;
};
export type MeshObserver = (attempt: MeshAttempt) => void;

export interface MeshEvent {
	type: 'bench' | 'failover' | 'success' | 'pool_wait' | string;
	[key: string]: unknown;
}

export type AttemptErrorKind =
	'rate_limit' | 'invalid_key' | 'timeout' | 'network' | 'server' | 'client' | 'stream' | 'empty';

export interface AttemptError {
	slotId: string;
	provider: string;
	kind: AttemptErrorKind;
	status?: number | null;
	message?: string;
	detail?: string;
}

export type AttemptOutcome =
	| { ok: true; value: MeshResult }
	| { ok: false; benchMs: number; error: AttemptError; partial?: boolean };

/** Injectable fetch surface — global fetch satisfies it on every runtime. */
export type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export interface TokenMeshOptions {
	slots: MeshSlot[];
	benchMs?: number;
	benchJitterMs?: number;
	invalidKeyBenchMs?: number;
	maxPoolWaitMs?: number;
	attemptTimeoutMs?: number;
	streamIdleTimeoutMs?: number;
	fetchImpl?: FetchLike;
	random?: () => number;
	sleep?: (ms: number) => Promise<void>;
	onEvent?: ((event: MeshEvent) => void) | null;
}

/** Minimal OpenAI-compatible chat completion response fields the mesh reads. */
interface ProviderChatResponse {
	model?: unknown;
	usage?: unknown;
	error?: { code?: unknown; message?: unknown };
	choices?: Array<{
		message?: { content?: unknown; tool_calls?: unknown };
		delta?: {
			content?: unknown;
			tool_calls?: Array<{
				index?: number;
				id?: string;
				type?: string;
				function?: { name?: string; arguments?: string };
				extra_content?: Record<string, unknown>;
			}>;
		};
		finish_reason?: unknown;
	}>;
}

/** A response, or the response-shaped failure `_post` synthesizes. */
interface ClassifiableResponse {
	ok: boolean;
	status: number;
	body?: ReadableStream<Uint8Array> | null;
	json(): Promise<unknown>;
	text(): Promise<string>;
	_timeout?: boolean;
	_networkError?: string;
}

class StreamIdleTimeoutError extends Error {
	readonly isIdleTimeout = true;
	constructor(message: string) {
		super(message);
		this.name = 'StreamIdleTimeoutError';
	}
}

/**
 * Waterfall ordering: tiers ascending, shuffled within each tier. Keys of the
 * same tier split traffic evenly; failover walks down the tiers — e.g. two
 * Tier-1 Gemini keys alternate, and only when all Tier-1 keys fail or are
 * benched does the request reach Tier-2 (OpenRouter/Groq). Slots without an
 * explicit tier default to 2, preserving plain-shuffle behaviour.
 */
function orderWaterfall(slots: readonly ResolvedSlot[], random: () => number = Math.random) {
	const tiers = new Map<number, ResolvedSlot[]>();
	for (const slot of slots) {
		const tier = slot.tier ?? 2;
		const bucket = tiers.get(tier);
		if (bucket) bucket.push(slot);
		else tiers.set(tier, [slot]);
	}
	return [...tiers.keys()]
		.sort((a, b) => a - b)
		.flatMap((tier) => shuffle(tiers.get(tier)!, random));
}

const truncate = (s: string, n = 300) => (s.length > n ? `${s.slice(0, n)}…` : s);

export class TokenMesh {
	slots: ResolvedSlot[];
	benchMs: number;
	benchJitterMs: number;
	invalidKeyBenchMs: number;
	maxPoolWaitMs: number;
	attemptTimeoutMs: number;
	streamIdleTimeoutMs: number;
	fetchImpl: FetchLike;
	random: () => number;
	sleep: (ms: number) => Promise<void>;
	onEvent: ((event: MeshEvent) => void) | null;

	private benches = new Map<string, number>(); // slotId -> epoch ms when the bench expires

	constructor({
		slots,
		benchMs = DEFAULT_BENCH_MS,
		benchJitterMs = DEFAULT_BENCH_JITTER_MS,
		invalidKeyBenchMs = INVALID_KEY_BENCH_MS,
		maxPoolWaitMs = DEFAULT_MAX_POOL_WAIT_MS,
		attemptTimeoutMs = DEFAULT_ATTEMPT_TIMEOUT_MS,
		streamIdleTimeoutMs = DEFAULT_STREAM_IDLE_TIMEOUT_MS,
		fetchImpl = globalThis.fetch,
		random = Math.random,
		sleep = defaultSleep,
		onEvent = null
	}: TokenMeshOptions) {
		if (!Array.isArray(slots) || slots.length === 0) {
			throw new TypeError('TokenMesh requires a non-empty array of key slots');
		}
		for (const slot of slots) {
			if (!slot || typeof slot.key !== 'string' || slot.key === '' || !slot.baseUrl) {
				throw new TypeError('TokenMesh: invalid key slot configuration');
			}
		}
		if (typeof fetchImpl !== 'function') {
			throw new TypeError('TokenMesh: fetchImpl must be a function (global fetch is missing)');
		}

		this.slots = slots.map((slot, i) => ({
			provider: slot.provider,
			key: slot.key,
			model: slot.model,
			baseUrl: slot.baseUrl,
			headers: slot.headers ?? {},
			tier: slot.tier ?? 2,
			id: slot.id ?? `${slot.provider ?? 'provider'}-${i + 1}`
		}));
		this.benchMs = benchMs;
		this.benchJitterMs = benchJitterMs;
		this.invalidKeyBenchMs = invalidKeyBenchMs;
		this.maxPoolWaitMs = maxPoolWaitMs;
		this.attemptTimeoutMs = attemptTimeoutMs;
		this.streamIdleTimeoutMs = streamIdleTimeoutMs;
		this.fetchImpl = fetchImpl;
		this.random = random;
		this.sleep = sleep;
		this.onEvent = onEvent;
	}

	// ── bench bookkeeping ────────────────────────────────────────────────

	bench(slotId: string, ms: number = this.benchMs) {
		const jitter = this.benchJitterMs > 0 ? Math.floor(this.random() * this.benchJitterMs) : 0;
		this.benches.set(slotId, Date.now() + ms + jitter);
		this.emit({ type: 'bench', slotId, ms: ms + jitter });
	}

	benchRemaining(slotId: string, now = Date.now()) {
		const until = this.benches.get(slotId);
		return until ? Math.max(0, until - now) : 0;
	}

	isBenched(slotId: string, now = Date.now()) {
		return this.benchRemaining(slotId, now) > 0;
	}

	clearBench(slotId: string) {
		this.benches.delete(slotId);
	}

	resetBenches() {
		this.benches.clear();
	}

	availableSlots(now = Date.now()) {
		return this.slots.filter((slot) => !this.isBenched(slot.id, now));
	}

	// ── routing ──────────────────────────────────────────────────────────

	/**
	 * Route one OpenAI-style chat payload through the pool.
	 * The payload is never mutated; each attempt re-serializes it with the
	 * slot's model, so every retry is the exact same request.
	 */
	async complete(payload: ChatPayload, _depth = 0, observer?: MeshObserver): Promise<MeshResult> {
		if (!payload || !Array.isArray(payload.messages)) {
			throw new TypeError('TokenMesh.complete(payload) requires payload.messages (array)');
		}
		return this.route(
			payload,
			(slot) => this.attempt(slot, payload),
			(depth) => this.complete(payload, depth, observer),
			_depth,
			observer
		);
	}

	/**
	 * Streaming variant: same waterfall, benching and failover as complete(),
	 * but tokens are handed to onToken as they arrive over SSE.
	 *
	 * Safe-by-construction ordering: every failure that can fail over (429,
	 * dead key, 5xx, network) happens BEFORE the first token is delivered —
	 * the provider only starts emitting after we have a 200 with a stream
	 * body. Once tokens have been delivered we cannot replay them on another
	 * key, so a mid-stream break throws UpstreamError (attempts: kind
	 * 'stream') instead of silently stitching a second provider's answer onto
	 * a partial one.
	 */
	async completeStream(
		payload: ChatPayload,
		onToken: (chunk: string) => void,
		_depth = 0,
		observer?: MeshObserver
	): Promise<MeshResult> {
		if (!payload || !Array.isArray(payload.messages)) {
			throw new TypeError('TokenMesh.completeStream(payload) requires payload.messages (array)');
		}
		if (typeof onToken !== 'function') {
			throw new TypeError('TokenMesh.completeStream(payload, onToken) requires onToken (function)');
		}
		return this.route(
			payload,
			(slot) => this.attemptStream(slot, payload, onToken),
			(depth) => this.completeStream(payload, onToken, depth, observer),
			_depth,
			observer
		);
	}

	/**
	 * Shared routing loop for complete() and completeStream().
	 * rerun(depth) re-enters the owning method with a bumped retry depth.
	 */
	private async route(
		payload: ChatPayload,
		attemptFn: (slot: ResolvedSlot) => Promise<AttemptOutcome>,
		rerun: (depth: number) => Promise<MeshResult>,
		_depth: number,
		observer?: MeshObserver
	): Promise<MeshResult> {
		const attempts: AttemptError[] = [];
		for (const slot of await this.nextBatch()) {
			// A concurrent request may have benched this key mid-loop — skip it.
			if (this.isBenched(slot.id)) continue;

			const started = Date.now();
			const outcome = await attemptFn(slot);
			try {
				observer?.({
					provider: slot.provider,
					model: slot.model,
					kind: outcome.ok ? 'success' : outcome.error.kind,
					status: outcome.ok ? 200 : (outcome.error.status ?? null),
					durationMs: Date.now() - started
				});
			} catch {
				/* Diagnostics must never break provider routing. */
			}
			if (outcome.ok) {
				this.emit({ type: 'success', slotId: slot.id, provider: slot.provider });
				return outcome.value;
			}

			attempts.push(outcome.error);
			if (outcome.benchMs) this.bench(slot.id, outcome.benchMs);
			this.emit({
				type: 'failover',
				slotId: slot.id,
				reason: outcome.error.kind,
				status: outcome.error.status ?? null
			});

			// Tokens already reached the caller — another key's answer cannot be
			// appended to a partial one, so surface the interruption immediately.
			if (outcome.partial) {
				const kind = outcome.error.kind;
				throw new UpstreamError(`TokenMesh: stream interrupted mid-answer (${kind})`, attempts);
			}

			// 429 and dead keys were benched — the loop instantly moves to the next
			// shuffled key. The user never sees the rate limit.
		}

		if (attempts.length === 0) {
			// Every slot was benched by concurrent requests before we could try one.
			if (_depth < 3) return rerun(_depth + 1);
			throw new PoolExhaustedError('TokenMesh: pool raced to empty; retry depth exceeded');
		}

		// Every key we touched was rate-limited: the pool is temporarily
		// saturated, not broken. Wait out the shortest bench and re-route instead
		// of surfacing an error — bounded by the retry depth and the
		// maxPoolWaitMs budget enforced inside waitForAvailable.
		if (attempts.every((a) => a.kind === 'rate_limit') && _depth < 3) {
			return rerun(_depth + 1);
		}

		const kinds = attempts
			.map((a) => `${a.provider}/${a.kind}${a.status ? `:${a.status}` : ''}`)
			.join(', ');
		throw new UpstreamError(
			`TokenMesh: all ${this.slots.length} provider keys failed (${kinds})`,
			attempts
		);
	}

	private async nextBatch() {
		let available = this.availableSlots();
		if (available.length === 0) available = await this.waitForAvailable();
		return orderWaterfall(available, this.random);
	}

	/** All keys benched: block until the shortest bench expires (bounded). */
	private async waitForAvailable() {
		const deadline = Date.now() + this.maxPoolWaitMs;
		for (;;) {
			const available = this.availableSlots();
			if (available.length > 0) return available;

			const earliest = Math.min(...this.benches.values());
			const wait = Math.max(0, earliest - Date.now());
			if (Date.now() + wait > deadline) {
				throw new PoolExhaustedError(
					`TokenMesh: all ${this.slots.length} keys are benched; earliest frees in ${Math.ceil(wait / 1000)}s. ` +
						'Add more keys to the pool to keep the $0.00 mesh always-available.'
				);
			}
			this.emit({ type: 'pool_wait', ms: wait });
			if (wait > 0) await this.sleep(wait);
		}
	}

	/**
	 * POST one payload to one slot; no streaming.
	 * The whole attempt (response headers + JSON body) must finish within
	 * attemptTimeoutMs, otherwise the fetch is aborted, the key is benched
	 * (kind 'timeout') and routing moves on.
	 */
	private async attempt(slot: ResolvedSlot, payload: ChatPayload): Promise<AttemptOutcome> {
		const url = this.chatUrl(slot);
		const body = JSON.stringify({ ...payload, model: slot.model });

		const controller = new AbortController();
		const timer =
			this.attemptTimeoutMs > 0
				? setTimeout(() => controller.abort(), this.attemptTimeoutMs)
				: null;

		try {
			const res = await this.post(url, slot, body, controller.signal);
			if (!res.ok) return await this.classifyHttp(slot, res);

			const data = (await res.json().catch(() => null)) as ProviderChatResponse | null;
			if (data === null && controller.signal.aborted) {
				return this.timeoutFailure(slot, `response body stalled past ${this.attemptTimeoutMs}ms`);
			}
			if (data && typeof data === 'object' && data.error !== null && data.error !== undefined) {
				// Some gateways return HTTP 200 with a provider error document.
				return this.providerErrorFailure(slot, res, data);
			}
			const content = data?.choices?.[0]?.message?.content;
			const toolCalls = parseToolCalls(data?.choices?.[0]?.message?.tool_calls);
			if (payload.tool_choice === 'required' && !toolCalls.length)
				return this.emptyResponseFailure(slot);
			if ((typeof content !== 'string' || !content.trim()) && !toolCalls.length)
				return this.emptyResponseFailure(slot);
			const usage = data?.usage;
			const model = data?.model;
			return {
				ok: true,
				value: {
					text: typeof content === 'string' ? content : '',
					...(toolCalls.length ? { toolCalls } : {}),
					provider: slot.provider,
					model: typeof model === 'string' && model !== '' ? model : slot.model,
					slotId: slot.id,
					usage: usage && typeof usage === 'object' ? (usage as MeshUsage) : null,
					finishReason:
						typeof data?.choices?.[0]?.finish_reason === 'string'
							? data.choices[0].finish_reason
							: undefined
				}
			};
		} finally {
			if (timer) clearTimeout(timer);
		}
	}

	private providerErrorFailure(
		slot: ResolvedSlot,
		res: ClassifiableResponse,
		data: ProviderChatResponse
	): AttemptOutcome {
		const rawCode = Number(data?.error?.code);
		const status = Number.isInteger(rawCode) ? rawCode : res.status || null;
		const rawMessage = data?.error?.message;
		const message =
			typeof rawMessage === 'string' && rawMessage !== ''
				? rawMessage
				: `provider error document (HTTP ${res.status ?? 'unknown'})`;
		const base = { slotId: slot.id, provider: slot.provider, status, detail: truncate(message) };
		if (status === 429) {
			return {
				ok: false,
				benchMs: this.benchMs,
				error: { ...base, kind: 'rate_limit', message: truncate(message) }
			};
		}
		if (status === 401 || status === 403) {
			return {
				ok: false,
				benchMs: this.invalidKeyBenchMs,
				error: { ...base, kind: 'invalid_key', message: truncate(message) }
			};
		}
		return {
			ok: false,
			benchMs: 0,
			error: {
				...base,
				kind: status !== null && status < 500 ? 'client' : 'server',
				message: truncate(message)
			}
		};
	}

	private timeoutFailure(slot: ResolvedSlot, message: string): AttemptOutcome {
		return {
			ok: false,
			benchMs: this.benchMs,
			error: {
				slotId: slot.id,
				provider: slot.provider,
				status: null,
				kind: 'timeout',
				message: truncate(message)
			}
		};
	}

	/**
	 * Race a promise (a body read, or the fallback JSON parse) against the
	 * stream idle timeout. On expiry the fetch is aborted — releasing the
	 * socket — and an error flagged `isIdleTimeout` is thrown so the caller
	 * can classify it as a timeout instead of a plain network drop.
	 */
	private withIdleTimeout<T>(promise: Promise<T>, controller: AbortController): Promise<T> {
		if (!(this.streamIdleTimeoutMs > 0)) return promise;
		let timer: ReturnType<typeof setTimeout> | undefined;
		const expiry = new Promise<never>((_, reject) => {
			timer = setTimeout(() => {
				// Reject with the flagged error BEFORE aborting: the abort makes the
				// pending read reject too, and that AbortError must not win the race
				// (it would be classified as a plain network drop, without benching).
				reject(
					new StreamIdleTimeoutError(`TokenMesh: stream silent for ${this.streamIdleTimeoutMs}ms`)
				);
				controller.abort();
			}, this.streamIdleTimeoutMs);
		});
		return Promise.race([promise, expiry]).finally(() => clearTimeout(timer));
	}

	/**
	 * POST one payload to one slot with stream:true and pump SSE deltas into
	 * onToken. Returns ok:false with partial:true once any token was
	 * delivered (the caller must not retry — see completeStream).
	 */
	private async attemptStream(
		slot: ResolvedSlot,
		payload: ChatPayload,
		onToken: (chunk: string) => void
	): Promise<AttemptOutcome> {
		const url = this.chatUrl(slot);
		const body = JSON.stringify({ ...payload, model: slot.model, stream: true });

		// Stage 1: response headers must arrive within attemptTimeoutMs — a
		// provider that never answers is aborted before it can stall the reply.
		const controller = new AbortController();
		const startTimer =
			this.attemptTimeoutMs > 0
				? setTimeout(() => controller.abort(), this.attemptTimeoutMs)
				: null;
		const res = await this.post(url, slot, body, controller.signal);
		if (startTimer) clearTimeout(startTimer);
		if (!res.ok) return await this.classifyHttp(slot, res);

		// Defensive fallback: a provider that ignores stream:true answers with a
		// normal JSON body — parse it (under the idle timeout) and deliver it as
		// one chunk.
		const reader = typeof res.body?.getReader === 'function' ? res.body.getReader() : null;
		if (!reader) {
			let data: ProviderChatResponse | null = null;
			try {
				data = (await this.withIdleTimeout(res.json(), controller)) as ProviderChatResponse | null;
			} catch (err) {
				if (err instanceof StreamIdleTimeoutError) return this.timeoutFailure(slot, err.message);
			}
			if (data && typeof data === 'object' && data.error !== null && data.error !== undefined) {
				return this.providerErrorFailure(slot, res, data);
			}
			const content = data?.choices?.[0]?.message?.content;
			const text = typeof content === 'string' ? content : '';
			const toolCalls = parseToolCalls(data?.choices?.[0]?.message?.tool_calls);
			if (payload.tool_choice === 'required' && !toolCalls.length)
				return this.emptyResponseFailure(slot);
			if (!text.trim() && !toolCalls.length) return this.emptyResponseFailure(slot);
			if (text) onToken(text);
			const usage = data?.usage;
			const model = data?.model;
			return {
				ok: true,
				value: {
					text,
					...(toolCalls.length ? { toolCalls } : {}),
					provider: slot.provider,
					model: typeof model === 'string' && model !== '' ? model : slot.model,
					slotId: slot.id,
					usage: usage && typeof usage === 'object' ? (usage as MeshUsage) : null,
					finishReason:
						typeof data?.choices?.[0]?.finish_reason === 'string'
							? data.choices[0].finish_reason
							: undefined
				}
			};
		}

		const decoder = new TextDecoder();
		let text = '';
		let usage: MeshUsage | null = null;
		let model = slot.model;
		let delivered = false;
		let sawDone = false;
		let sawFinish = false;
		let finishReason: string | undefined;
		let buf = '';
		const toolFragments = new Map<number, ToolCall>();
		let bufferedToolCalls: ToolCall[] = [];

		try {
			for (;;) {
				// Idle-bounded: covers both "never starts" and "stalls mid-answer".
				const { done, value } = await this.withIdleTimeout(reader.read(), controller);
				if (done) {
					buf += decoder.decode();
					if (buf.trim().startsWith('data:')) buf += '\n';
					else break;
				} else buf += decoder.decode(value, { stream: true });

				let nl: number;
				while ((nl = buf.indexOf('\n')) !== -1) {
					const line = buf.slice(0, nl).trim();
					buf = buf.slice(nl + 1);
					if (!line || line.startsWith(':')) continue; // comments/keep-alives
					if (!line.startsWith('data:')) continue;

					const data = line.slice(5).trim();
					if (data === '[DONE]') {
						sawDone = true;
						break;
					}
					let chunk: ProviderChatResponse;
					try {
						chunk = JSON.parse(data) as ProviderChatResponse;
					} catch {
						continue; // malformed frame — skip, don't kill the stream
					}
					if (
						chunk &&
						typeof chunk === 'object' &&
						chunk.error !== null &&
						chunk.error !== undefined
					) {
						const failure = this.providerErrorFailure(slot, res, chunk);
						if (failure.ok) return failure;
						// After tokens, an error frame is still an interruption; before
						// tokens it is an ordinary pre-token failover.
						return {
							...failure,
							benchMs: delivered ? 0 : failure.benchMs,
							partial: delivered
						};
					}
					if (!chunk || typeof chunk !== 'object') continue;
					if (typeof chunk.choices?.[0]?.finish_reason === 'string')
						finishReason = chunk.choices[0].finish_reason;
					if (chunk.choices?.some((choice) => typeof choice.finish_reason === 'string'))
						sawFinish = true;
					if (chunk.usage && typeof chunk.usage === 'object') usage = chunk.usage as MeshUsage;
					if (typeof chunk.model === 'string' && chunk.model !== '') model = chunk.model;
					for (const fragment of chunk.choices?.[0]?.delta?.tool_calls ?? []) {
						const index = fragment.index ?? 0;
						if (!Number.isInteger(index) || index < 0 || index >= 8)
							throw new Error('Invalid tool call index');
						const call = toolFragments.get(index) ?? {
							id: '',
							type: 'function',
							function: { name: '', arguments: '' }
						};
						if (fragment.id) call.id = fragment.id;
						call.function.name += fragment.function?.name ?? '';
						call.function.arguments += fragment.function?.arguments ?? '';
						if (call.function.arguments.length > 16_000)
							throw new Error('Tool arguments too large');
						if (fragment.extra_content) call.extra_content = fragment.extra_content;
						toolFragments.set(index, call);
					}
					const delta = chunk.choices?.[0]?.delta?.content;
					if (typeof delta === 'string' && delta !== '') {
						delivered = true;
						text += delta;
						onToken(delta);
					}
				}
				if (sawDone || done) break;
			}
		} catch (streamError) {
			// A silent stream before the first token is a timeout: bench the key
			// and fail over. After the first token it stays an interruption
			// (partial) — the caller must not stitch a second provider's answer on.
			const timedOut = streamError instanceof StreamIdleTimeoutError && !delivered;
			const error: AttemptError = {
				slotId: slot.id,
				provider: slot.provider,
				kind: delivered ? 'stream' : timedOut ? 'timeout' : 'network',
				message: truncate(streamError instanceof Error ? streamError.message : String(streamError))
			};
			// partial:true only when the caller already saw tokens.
			return { ok: false, benchMs: timedOut ? this.benchMs : 0, error, partial: delivered };
		} finally {
			void reader.cancel().catch(() => undefined);
			reader.releaseLock();
		}

		// Whole body buffered but never framed as SSE (some proxies re-wrap the
		// response): try to salvage a plain JSON completion.
		if (!delivered && !sawDone && buf.trim().startsWith('{')) {
			try {
				const data = JSON.parse(buf.trim()) as ProviderChatResponse;
				if (data && typeof data === 'object' && data.error !== null && data.error !== undefined) {
					return this.providerErrorFailure(slot, res, data);
				}
				const content = data?.choices?.[0]?.message?.content;
				const salvaged = typeof content === 'string' ? content : '';
				bufferedToolCalls = parseToolCalls(data?.choices?.[0]?.message?.tool_calls);
				if (typeof data?.choices?.[0]?.finish_reason === 'string')
					finishReason = data.choices[0].finish_reason;
				if (bufferedToolCalls.length) sawFinish = true;
				if (salvaged) {
					delivered = true;
					text = salvaged;
					sawFinish = true;
					if (data.usage && typeof data.usage === 'object') usage = data.usage as MeshUsage;
					if (typeof data.model === 'string' && data.model !== '') model = data.model;
					onToken(salvaged);
				}
			} catch {
				/* not salvageable — fall through with empty text */
			}
		}

		const toolCalls = bufferedToolCalls.length
			? bufferedToolCalls
			: parseToolCalls([...toolFragments.values()]);
		if (payload.tool_choice === 'required' && !toolCalls.length)
			return this.emptyResponseFailure(slot);
		if (!text.trim() && !toolCalls.length) return this.emptyResponseFailure(slot);
		if ((delivered || toolCalls.length) && !sawDone && !sawFinish)
			return {
				ok: false,
				benchMs: 0,
				partial: true,
				error: { slotId: slot.id, provider: slot.provider, kind: 'stream' }
			};
		return {
			ok: true,
			value: {
				text,
				provider: slot.provider,
				model,
				slotId: slot.id,
				usage,
				finishReason,
				...(toolCalls.length ? { toolCalls } : {})
			}
		};
	}

	private emptyResponseFailure(slot: ResolvedSlot): AttemptOutcome {
		return {
			ok: false,
			benchMs: 0,
			error: { slotId: slot.id, provider: slot.provider, kind: 'empty' }
		};
	}

	private chatUrl(slot: ResolvedSlot) {
		return `${slot.baseUrl.replace(/\/+$/, '')}/chat/completions`;
	}

	private async post(
		url: string,
		slot: ResolvedSlot,
		body: string,
		signal: AbortSignal
	): Promise<ClassifiableResponse> {
		try {
			return (await this.fetchImpl(url, {
				method: 'POST',
				headers: {
					'content-type': 'application/json',
					authorization: `Bearer ${slot.key}`,
					...slot.headers
				},
				body,
				signal
			})) as ClassifiableResponse;
		} catch (networkError) {
			// DNS blip, connection reset — fail over, do not bench. An abort from
			// our own timer is a timeout: bench the silent key so the next request
			// skips it instead of paying the timeout again.
			// Returned as a response-shaped failure so both attempt paths share
			// the classification below.
			return {
				ok: false,
				status: 0,
				_networkError: truncate(
					networkError instanceof Error ? networkError.message : String(networkError)
				),
				...(signal?.aborted ? { _timeout: true } : {}),
				json: async () => null,
				text: async () => ''
			};
		}
	}

	/** Map an unsuccessful HTTP (or network) result to a bench/failover decision. */
	private async classifyHttp(
		slot: ResolvedSlot,
		res: ClassifiableResponse
	): Promise<AttemptOutcome> {
		const base: AttemptError = {
			slotId: slot.id,
			provider: slot.provider,
			status: res.status || null,
			kind: 'network'
		};

		if (res._timeout) {
			// Our abort timer fired: the provider produced nothing within the
			// attempt timeout. Bench it (like a rate limit) and fail over.
			return {
				ok: false,
				benchMs: this.benchMs,
				error: { ...base, kind: 'timeout', message: res._networkError }
			};
		}
		if (res._networkError !== undefined || res.status === 0) {
			return {
				ok: false,
				benchMs: 0,
				error: { ...base, kind: 'network', message: res._networkError }
			};
		}

		void res.body?.cancel().catch(() => undefined);
		const status = res.status;

		if (status === 429) {
			// THE headline case: bench 60s, retry instantly on the next key.
			return { ok: false, benchMs: this.benchMs, error: { ...base, kind: 'rate_limit' } };
		}
		if (status === 401 || status === 403) {
			// The key itself is bad — longer penalty so it stops eating requests.
			return {
				ok: false,
				benchMs: this.invalidKeyBenchMs,
				error: { ...base, kind: 'invalid_key' }
			};
		}
		// 5xx (provider outage) and other 4xx (e.g. model not found on this
		// provider): fail over without benching — the key may be perfectly fine.
		return { ok: false, benchMs: 0, error: { ...base, kind: status >= 500 ? 'server' : 'client' } };
	}

	private emit(event: MeshEvent) {
		if (typeof this.onEvent !== 'function') return;
		try {
			this.onEvent(event);
		} catch {
			/* observability must never break routing */
		}
	}
}
