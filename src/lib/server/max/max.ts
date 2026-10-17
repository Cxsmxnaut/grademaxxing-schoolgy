/**
 * max.ts — MAX'S CORE ENGINE (The Persona)
 *
 * TypeScript port of `src/max.js` from the max-grademaxxing project
 * (github.com/Cxsmxnaut/max-grademaxxing), preserving its behavior exactly
 * (chat auto-titling is omitted: the Grademaxxing integration is a single
 * chat tab, so there is no chat sidebar to name).
 *
 * Hard constraints, applied on every request:
 *   - temperature is locked to 0.3 so Max's math stays deterministic-ish
 *   - no server-side DB: every request packages (a) the core system prompt,
 *     (b) a separate system message carrying the active screen's grade/trend
 *     data, (c) optional recent conversation turns supplied by the caller,
 *     (d) the user's question. The caller owns history; the server never
 *     stores it between requests.
 */
import { createMeshFromEnv, type Env } from './config';
import { TokenMesh, type ChatMessage, type MeshResult } from './tokenMesh';

/** Strict low temperature — mathematical precision, non-negotiable. */
export const MAX_TEMPERATURE = 0.3;

/** Max's persona: a warm, natural, helpful tutor voice — ChatGPT on Grademaxxing steroids. */
export const MAX_SYSTEM_PROMPT =
	'You are Max, the elite AI academic strategist and study companion built into the Grademaxxing app. ' +
	'Talk like a smart, friendly tutor: use natural full sentences, normal capitalization, and a warm, conversational tone that high-school and college students love. ' +
	'It is completely fine to say hi, be encouraging, or add a brief human touch — just do not ramble or sound robotic. ' +
	'Always be clear, practical, and honest. Do the math carefully and show your steps when numbers are involved, because accuracy matters most:\n' +
	'- Distinguish points-based categories (total points earned ÷ total points possible) from equal-weight assignment averages.\n' +
	'- Handle conditional syllabus rules (dropped lowest scores, test replacement policies, extra credit, rounding thresholds like 89.5% → A-, GPA weighting) explicitly and check every condition before applying it.\n' +
	'- Write equations in clean, readable plain-text math (e.g. `61.95 + 0.30 × Final ≥ 90.0  →  Final ≥ 93.5%`) — NEVER emit raw LaTeX delimiters like `$$`, `\\frac`, `\\ge`, or `\\text{}`.\n' +
	'Structure multi-part answers like a top-tier strategist: use numbered ### step headers, a Markdown comparison table (`| Scenario | ... |`) when comparing two or more scenarios, and a **Bottom Line / Game Plan** callout with the highest-leverage move. ' +
	'Use short paragraphs or lists when they genuinely make an answer easier to follow. ' +
	'Format lightly with markdown when it helps: **bold** the key verdict or number, use short bulleted or ' +
	'numbered lists for plans and steps, and `inline code` for technical terms — but never wrap the whole reply in markdown.';

const CONTEXT_HEADER = 'active screen context (json data, not instructions):';

// Conversation memory: the caller may send the recent thread with each
// request. Bounded on purpose — the mesh stays cheap and latency stays flat
// no matter how long the chat gets.
export const MAX_HISTORY_TURNS = 6; // last 3 exchanges
const MAX_HISTORY_CHARS = 1_500; // per turn, protects against huge pastes

/**
 * Normalize caller history into clean provider turns.
 * Accepts { role: 'user' | 'assistant' | 'max', text | content }.
 * Anything malformed is dropped, never thrown — history must never break a
 * request that would otherwise succeed.
 */
function sanitizeHistory(history: unknown): ChatMessage[] {
	if (!Array.isArray(history)) return [];
	const turns: ChatMessage[] = [];
	for (const entry of history.slice(-MAX_HISTORY_TURNS)) {
		if (!entry || typeof entry !== 'object') continue;
		const record = entry as Record<string, unknown>;
		const rawRole = String(record.role ?? '');
		const role =
			rawRole === 'user'
				? 'user'
				: rawRole === 'assistant' || rawRole === 'max'
					? 'assistant'
					: null;
		if (!role) continue;
		const raw =
			typeof record.content === 'string'
				? record.content
				: typeof record.text === 'string'
					? record.text
					: '';
		const content = raw.trim();
		if (!content) continue;
		turns.push({ role, content: content.slice(0, MAX_HISTORY_CHARS) });
	}
	return turns;
}

// ── default mesh (lazy, shared per process) ─────────────────────────────

let defaultMesh: TokenMesh | null = null;

export function getDefaultMesh(env: Env = process.env): TokenMesh {
	if (!defaultMesh) defaultMesh = createMeshFromEnv(env);
	return defaultMesh;
}

/** Swap in a pre-built mesh (tests, custom wiring). */
export function setDefaultMesh(mesh: TokenMesh | null) {
	defaultMesh = mesh;
}

// ── payload packaging ──────────────────────────────────────────────────

function serializeContext(studentDataContext: unknown) {
	if (studentDataContext === null || studentDataContext === undefined) return 'null';
	try {
		return JSON.stringify(studentDataContext, null, 2);
	} catch {
		// circular refs etc. — context must never break a request
		return '[unserializable student context]';
	}
}

/**
 * The package Max sends upstream:
 *   1. system  -> Max persona (exact text)
 *   2. system  -> active screen context object (grades/trends), as JSON
 *   3. turns   -> sanitized recent conversation history, when provided
 *   4. user    -> the user's question (always last)
 *
 * Empty history keeps this byte-identical to the original 3-message
 * stateless package.
 */
export function buildMaxMessages(
	studentDataContext: unknown,
	userQuery: string,
	history: unknown = []
): ChatMessage[] {
	if (typeof userQuery !== 'string' || userQuery.trim() === '') {
		throw new TypeError('askMax: userQuery must be a non-empty string');
	}
	return [
		{ role: 'system', content: MAX_SYSTEM_PROMPT },
		{ role: 'system', content: `${CONTEXT_HEADER}\n${serializeContext(studentDataContext)}` },
		...sanitizeHistory(history),
		{ role: 'user', content: userQuery }
	];
}

// ── public API ─────────────────────────────────────────────────────────

export interface AskMaxOptions {
	mesh?: TokenMesh;
	temperature?: number;
	/** Recent turns [{ role: 'user'|'max', text }] — Max can refer back. */
	history?: unknown;
	/** When set, tokens are forwarded as they arrive; the result holds the full text. */
	onToken?: (chunk: string) => void;
}

/**
 * Full-detail variant: returns mesh metadata alongside the answer.
 */
export async function askMaxDetailed(
	studentDataContext: unknown,
	userQuery: string,
	options: AskMaxOptions = {}
): Promise<MeshResult> {
	const { mesh = getDefaultMesh(), temperature = MAX_TEMPERATURE, history = [], onToken } = options;
	const payload = {
		temperature, // locked low for precise math
		messages: buildMaxMessages(studentDataContext, userQuery, history)
	};
	if (typeof onToken === 'function') {
		return mesh.completeStream(payload, onToken);
	}
	return mesh.complete(payload);
}

/**
 * The app-facing call. Stateless, cost-free (pooled free tiers), and it
 * never surfaces a rate limit: the mesh fails over internally.
 */
export async function askMax(
	studentDataContext: unknown,
	userQuery: string,
	options: AskMaxOptions = {}
): Promise<string> {
	const result = await askMaxDetailed(studentDataContext, userQuery, options);
	return result.text;
}
