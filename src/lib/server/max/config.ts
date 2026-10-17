/**
 * config.ts — builds the pooled key array for the Token Mesh.
 *
 * TypeScript port of `src/config.js` from the max-grademaxxing project
 * (github.com/Cxsmxnaut/max-grademaxxing), preserving its behavior exactly.
 *
 * Keys come only from the server environment (or an explicit call to
 * createPool). They are never sent to the browser and never written to disk
 * by this module.
 */
import { TokenMesh, type MeshSlot, type TokenMeshOptions } from './tokenMesh';

/**
 * Free-tier defaults (verified October 2026):
 *   - Groq: openai/gpt-oss-120b is OpenAI's 120B flagship hosted free on Groq
 *     with 1,000 req/day and 8,000 TPM per key (across 5 keys = 5,000 req/day),
 *     sub-second time-to-first-token, and native ChatGPT formatting & math
 *     accuracy. (By contrast, qwen/qwen3.8-27b on Groq has a 1,000 OTPM cap
 *     that rejects long step-by-step math explanations with HTTP 413/429.)
 *   - Gemini: gemini-3.5-flash is Google AI Studio's fast, high-quota free
 *     workhorse (gemini-3.8-flash has a tiny 20 RPD free-tier cap that
 *     exhausts almost immediately).
 *   - OpenRouter: nvidia/nemotron-3-ultra-550b-a55b:free is the fastest,
 *     highest-capacity free model on OpenRouter (~400ms latency vs 20s+ hangs
 *     on nemotron-3.5-lightning:free).
 *   - Mistral: mistral-small-latest is the documented stable alias.
 */
export type ProviderName = 'gemini' | 'groq' | 'openrouter' | 'mistral';

export interface ProviderDefaults {
	baseUrl: string;
	model: string;
	/** 1 = primary waterfall layer, tried before any Tier-2 slot. */
	tier: number;
}

export const PROVIDER_DEFAULTS: Record<ProviderName, ProviderDefaults> = {
	// Tier 1 = primary waterfall layer: tried before any Tier-2 slot.
	gemini: {
		// Google AI Studio keys speak OpenAI-compatible protocol here; free tier.
		// gemini-3.5-flash is the fast, high-quota free workhorse (gemini-3.8-flash
		// has a tiny 20 RPD free-tier cap that exhausts immediately).
		baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
		model: 'gemini-3.5-flash',
		tier: 1
	},
	groq: {
		baseUrl: 'https://api.groq.com/openai/v1',
		model: 'openai/gpt-oss-120b',
		tier: 2
	},
	openrouter: {
		baseUrl: 'https://openrouter.ai/api/v1',
		model: 'nvidia/nemotron-3-ultra-550b-a55b:free',
		tier: 2
	},
	mistral: {
		baseUrl: 'https://api.mistral.ai/v1',
		model: 'mistral-small-latest',
		tier: 2
	}
};

export type Env = Record<string, string | undefined>;

function openRouterHeaders(env: Env) {
	const headers: Record<string, string> = {};
	if (env.APP_URL) headers['HTTP-Referer'] = env.APP_URL; // optional attribution
	if (env.APP_NAME) headers['X-OpenRouter-Title'] = env.APP_NAME;
	return headers;
}

export interface PoolOverrides {
	models?: Partial<Record<ProviderName, string>>;
	baseUrls?: Partial<Record<ProviderName, string | undefined>>;
	headers?: Partial<Record<ProviderName, Record<string, string>>>;
	tiers?: Partial<Record<ProviderName, number>>;
	env?: Env;
}

/**
 * Turn a keyed object of provider -> key array into flat mesh slots.
 *
 * @param keysByProvider
 *   e.g. { groq: ['gk_...','gk_...'], openrouter: ['sk-or-...'], mistral: ['...'] }
 */
export function createPool(
	keysByProvider: Partial<Record<ProviderName, string[]>>,
	overrides: PoolOverrides = {}
): MeshSlot[] {
	const slots: MeshSlot[] = [];
	// guard against the exact bug this once had: a duplicate provider key in
	// PROVIDER_DEFAULTS silently drops fields (object literals keep the last)
	const providers = Object.keys(PROVIDER_DEFAULTS) as ProviderName[];
	if (new Set(providers).size !== providers.length) {
		throw new Error(`PROVIDER_DEFAULTS has duplicate provider keys: ${providers.join(', ')}`);
	}
	for (const provider of providers) {
		const defaults = PROVIDER_DEFAULTS[provider];
		const keys = (keysByProvider[provider] ?? []).filter(Boolean);
		const model = overrides.models?.[provider] ?? defaults.model;
		const baseUrl = overrides.baseUrls?.[provider] ?? defaults.baseUrl;
		const headers =
			overrides.headers?.[provider] ??
			(provider === 'openrouter' ? openRouterHeaders(overrides.env ?? {}) : {});
		const tier = overrides.tiers?.[provider] ?? defaults.tier ?? 2;

		keys.forEach((key, i) => {
			slots.push({ id: `${provider}-${i + 1}`, provider, key, model, baseUrl, headers, tier });
		});
	}
	return slots;
}

const splitKeys = (value: string | undefined) =>
	String(value ?? '')
		.split(',')
		.map((s) => s.trim())
		.filter(Boolean);

/**
 * Normalize deprecated or ultra-low-quota model overrides so stale env vars
 * (e.g. GEMINI_MODEL=gemini-3.8-flash with a 20 RPD cap, or
 * GROQ_MODEL=qwen/qwen3.8-27b with a 1,000 OTPM cap) automatically upgrade to
 * the high-quota workhorse models.
 */
const STALE_MODEL_UPGRADES: Record<string, string> = {
	'gemini-3.8-flash': 'gemini-3.5-flash',
	'gemini-2.5-flash': 'gemini-3.5-flash',
	'qwen/qwen3.8-27b': 'openai/gpt-oss-120b',
	'nvidia/nemotron-3.5-lightning:free': 'nvidia/nemotron-3-ultra-550b-a55b:free'
};

const resolveModel = (override: string | undefined, fallback: string) => {
	const trimmed = typeof override === 'string' ? override.trim() : '';
	if (!trimmed) return fallback;
	return STALE_MODEL_UPGRADES[trimmed] ?? trimmed;
};

/**
 * Pool from environment variables (comma-separated key lists):
 *   GROQ_API_KEYS, OPENROUTER_API_KEYS, MISTRAL_API_KEYS, GEMINI_API_KEYS
 * Optional overrides:
 *   GROQ_MODEL / OPENROUTER_MODEL / MISTRAL_MODEL / GEMINI_MODEL
 *   <PROVIDER>_BASE_URL for any of the above
 *   APP_URL, APP_NAME (OpenRouter attribution headers)
 */
export function createPoolFromEnv(env: Env = process.env): MeshSlot[] {
	return createPool(
		{
			groq: splitKeys(env.GROQ_API_KEYS),
			openrouter: splitKeys(env.OPENROUTER_API_KEYS),
			mistral: splitKeys(env.MISTRAL_API_KEYS),
			gemini: splitKeys(env.GEMINI_API_KEYS)
		},
		{
			env,
			models: {
				groq: resolveModel(env.GROQ_MODEL, PROVIDER_DEFAULTS.groq.model),
				openrouter: resolveModel(env.OPENROUTER_MODEL, PROVIDER_DEFAULTS.openrouter.model),
				mistral: resolveModel(env.MISTRAL_MODEL, PROVIDER_DEFAULTS.mistral.model),
				gemini: resolveModel(env.GEMINI_MODEL, PROVIDER_DEFAULTS.gemini.model)
			},
			baseUrls: {
				groq: env.GROQ_BASE_URL,
				openrouter: env.OPENROUTER_BASE_URL,
				mistral: env.MISTRAL_BASE_URL,
				gemini: env.GEMINI_BASE_URL
			}
		}
	);
}

/** Convenience factory: mesh wired straight from the environment. */
export function createMeshFromEnv(
	env: Env = process.env,
	meshOptions: Omit<TokenMeshOptions, 'slots'> = {}
) {
	const slots = createPoolFromEnv(env);
	if (slots.length === 0) {
		throw new Error(
			'No provider keys configured. Set GROQ_API_KEYS / OPENROUTER_API_KEYS / MISTRAL_API_KEYS ' +
				'(comma-separated lists) in the server environment.'
		);
	}
	return new TokenMesh({ slots, ...meshOptions });
}
