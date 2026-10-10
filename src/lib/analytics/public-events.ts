import { getPublicPage } from '$lib/seo/public-pages';

export const publicEventNames = ['page_view', 'tool_used', 'connection_start'] as const;
export const publicChannels = [
	'chatgpt',
	'perplexity',
	'copilot',
	'bing',
	'google',
	'other',
	'direct'
] as const;
export type PublicEventName = (typeof publicEventNames)[number];
export type PublicChannel = (typeof publicChannels)[number];
export type PublicEvent = { event: PublicEventName; path: string; channel: PublicChannel };

/** Only a bounded category survives; the referrer URL never leaves the browser. */
export function publicReferrerChannel(referrer: string): PublicChannel {
	if (!referrer) return 'direct';
	try {
		const host = new URL(referrer).hostname.toLowerCase();
		if (host === 'chatgpt.com' || host === 'chat.openai.com') return 'chatgpt';
		if (host === 'perplexity.ai' || host.endsWith('.perplexity.ai')) return 'perplexity';
		if (host === 'copilot.microsoft.com') return 'copilot';
		if (host === 'bing.com' || host.endsWith('.bing.com')) return 'bing';
		// Google referral is not proof the visit came from an AI feature.
		if (host === 'google.com' || host.endsWith('.google.com')) return 'google';
		return 'other';
	} catch {
		return 'other';
	}
}

/** Reject unknown fields rather than accidentally retaining calculator values. */
export function parsePublicEvent(value: unknown): PublicEvent | null {
	if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
	const record = value as Record<string, unknown>;
	if (
		Object.keys(record).length !== 3 ||
		Object.keys(record).some((key) => !['event', 'path', 'channel'].includes(key))
	)
		return null;
	if (
		!publicEventNames.includes(record.event as PublicEventName) ||
		!publicChannels.includes(record.channel as PublicChannel)
	)
		return null;
	if (typeof record.path !== 'string' || getPublicPage(record.path)?.path !== record.path)
		return null;
	return {
		event: record.event as PublicEventName,
		path: record.path,
		channel: record.channel as PublicChannel
	};
}
