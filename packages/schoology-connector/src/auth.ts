// Flow adapted from SheepTester/sgy-sgy oauth-3leg/app2.js. See THIRD_PARTY_NOTICES.md.
import { SchoologyError } from './errors.js';
import { secureUrl, Transport } from './transport.js';
import type {
	AuthorizationStart,
	ConnectorOptions,
	OAuthToken,
	PendingAuthorization
} from './types.js';

function callbackUrl(value: string): URL {
	let url: URL;
	try {
		url = new URL(value);
	} catch {
		throw new SchoologyError('URL', 'Invalid callback URL.');
	}
	if (
		url.username ||
		url.password ||
		url.hash ||
		(url.protocol !== 'https:' &&
			!(url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)))
	)
		throw new SchoologyError(
			'URL',
			'Callback must use HTTPS, or HTTP on localhost for development.'
		);
	return url;
}
async function tokenResponse(response: Response): Promise<OAuthToken> {
	const params = new URLSearchParams(await response.text());
	const key = params.get('oauth_token');
	const secret = params.get('oauth_token_secret');
	if (
		!key ||
		!secret ||
		params.getAll('oauth_token').length !== 1 ||
		params.getAll('oauth_token_secret').length !== 1
	)
		throw new SchoologyError('RESPONSE', 'Schoology did not return a valid OAuth token.');
	return { key, secret };
}

export class SchoologyOAuth {
	#transport: Transport;
	#school: URL;
	constructor(options: Omit<ConnectorOptions, 'token'>) {
		this.#transport = new Transport(options);
		this.#school = secureUrl(options.schoolUrl);
		if (this.#school.pathname !== '/' || this.#school.search)
			throw new SchoologyError(
				'URL',
				'schoolUrl must be the trusted district origin, without a path or query.'
			);
	}
	async beginAuthorization(returnUrl: string): Promise<AuthorizationStart> {
		const callback = callbackUrl(returnUrl);
		if (['state', 'oauth_token', 'oauth_verifier'].some((key) => callback.searchParams.has(key)))
			throw new SchoologyError('AUTH', 'Callback URL contains reserved OAuth parameters.');
		const state = crypto.randomUUID();
		callback.searchParams.set('state', state);
		const requestToken = await tokenResponse(await this.#transport.request('oauth/request_token'));
		const authorizationUrl = new URL('/oauth/authorize', this.#school);
		authorizationUrl.search = new URLSearchParams({
			oauth_token: requestToken.key,
			oauth_callback: callback.href
		}).toString();
		return {
			authorizationUrl: authorizationUrl.href,
			pending: { requestToken, callbackUrl: callback.href, state, createdAt: Date.now() }
		};
	}
	/** Caller must atomically consume a session-bound pending record once, even on failure. */
	async completeAuthorization(
		pending: PendingAuthorization,
		returnedUrl: string
	): Promise<OAuthToken> {
		const returned = callbackUrl(returnedUrl);
		const expected = callbackUrl(pending.callbackUrl);
		const age = Date.now() - pending.createdAt;
		if (
			!Number.isFinite(age) ||
			age < 0 ||
			age > 10 * 60_000 ||
			returned.origin !== expected.origin ||
			returned.pathname !== expected.pathname ||
			returned.searchParams.getAll('state').length !== 1 ||
			returned.searchParams.get('state') !== pending.state ||
			returned.searchParams.getAll('oauth_token').length !== 1 ||
			returned.searchParams.get('oauth_token') !== pending.requestToken.key ||
			returned.searchParams.getAll('oauth_verifier').length > 1 ||
			[...expected.searchParams.keys()].some(
				(key) =>
					JSON.stringify(expected.searchParams.getAll(key)) !==
					JSON.stringify(returned.searchParams.getAll(key))
			)
		)
			throw new SchoologyError(
				'AUTH',
				'OAuth callback did not match the pending session, or has expired.'
			);
		const verifier = returned.searchParams.get('oauth_verifier');
		return tokenResponse(
			await this.#transport.request(
				'oauth/access_token',
				{},
				pending.requestToken,
				verifier ? { oauth_verifier: verifier } : {}
			)
		);
	}
}
