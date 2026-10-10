import { browser } from '$app/environment';
import { getPublicPage, isProductionHost } from '$lib/seo/public-pages';
import { publicReferrerChannel, type PublicChannel, type PublicEventName } from './public-events';

const lastSent = new Map<string, number>();
let initialChannel: PublicChannel | undefined;

/** No cookies, persistent identifier, input values or personal account state. */
export function recordPublicEvent(event: PublicEventName, path?: string) {
	if (
		!browser ||
		navigator.doNotTrack === '1' ||
		(navigator as Navigator & { globalPrivacyControl?: boolean }).globalPrivacyControl
	)
		return;
	// Loopback remains testable; the endpoint drops its writes. Preview hosts stay quiet.
	if (
		!isProductionHost(location.hostname) &&
		!['127.0.0.1', 'localhost'].includes(location.hostname)
	)
		return;
	const publicPath = path ?? location.pathname;
	if (getPublicPage(publicPath)?.path !== publicPath) return;
	const key = `${event}:${publicPath}`;
	const now = Date.now();
	if (now - (lastSent.get(key) ?? 0) < (event === 'tool_used' ? 30_000 : 5_000)) return;
	lastSent.set(key, now);
	initialChannel ??= publicReferrerChannel(document.referrer);
	void fetch('/api/public-analytics', {
		method: 'POST',
		credentials: 'omit',
		keepalive: true,
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ event, path: publicPath, channel: initialChannel })
	}).catch(() => {
		// Aggregate measurement must not affect a calculator or navigation.
	});
}
