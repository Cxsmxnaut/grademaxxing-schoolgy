import type { Credentials, OAuthToken } from './types.js';

const encode = (value: string): string =>
	encodeURIComponent(value).replace(
		/[!'()*]/g,
		(char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`
	);

/** RFC 5849 HMAC-SHA1. Uses Web Crypto, so no Node-only runtime dependency. */
export async function signOAuth(
	url: URL,
	consumer: Credentials,
	token?: OAuthToken,
	extra: Record<string, string> = {},
	clock: { nonce: string; timestamp: string } = {
		nonce: crypto.randomUUID().replaceAll('-', ''),
		timestamp: String(Math.floor(Date.now() / 1000))
	}
): Promise<string> {
	const oauth: Record<string, string> = {
		oauth_consumer_key: consumer.key,
		oauth_token: token?.key ?? '',
		oauth_nonce: clock.nonce,
		oauth_timestamp: clock.timestamp,
		oauth_signature_method: 'HMAC-SHA1',
		oauth_version: '1.0',
		...extra
	};
	const entries = [...url.searchParams.entries(), ...Object.entries(oauth)]
		.map(([key, value]) => [encode(key), encode(value)] as const)
		.sort(([ak, av], [bk, bv]) => (ak < bk ? -1 : ak > bk ? 1 : av < bv ? -1 : av > bv ? 1 : 0));
	const baseUrl = new URL(url);
	baseUrl.search = '';
	baseUrl.hash = '';
	const normalized = entries.map(([key, value]) => `${key}=${value}`).join('&');
	const baseString = `GET&${encode(baseUrl.href)}&${encode(normalized)}`;
	const signingKey = `${encode(consumer.secret)}&${encode(token?.secret ?? '')}`;
	const encoder = new TextEncoder();
	const key = await crypto.subtle.importKey(
		'raw',
		encoder.encode(signingKey),
		{ name: 'HMAC', hash: 'SHA-1' },
		false,
		['sign']
	);
	const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(baseString));
	oauth.oauth_signature = btoa(String.fromCharCode(...new Uint8Array(signature)));
	return (
		'OAuth realm="Schoology API", ' +
		Object.entries(oauth)
			.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
			.map(([key, value]) => `${encode(key)}="${encode(value)}"`)
			.join(', ')
	);
}
