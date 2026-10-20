/** Framework-neutral adapter. Call these functions only from authenticated server routes. */
import type { ConnectorOptions, OAuthToken, PendingAuthorization } from '../src/index.js';
import { SchoologyClient, SchoologyOAuth } from '../src/index.js';

/** Implement using the host app's server-side session store. Never send pending secrets to the browser. */
export interface SchoologySessionStore {
	savePending(sessionId: string, value: PendingAuthorization): Promise<void>;
	/** Atomically get AND delete; enforce the 10-minute expiry in storage too. */
	takePending(sessionId: string): Promise<PendingAuthorization | null>;
	saveToken(sessionId: string, token: OAuthToken): Promise<void>;
	getToken(sessionId: string): Promise<OAuthToken | null>;
	deleteToken(sessionId: string): Promise<void>;
}

export function createSchoologyIntegration(
	options: Omit<ConnectorOptions, 'token'>,
	store: SchoologySessionStore,
	callbackUrl: string
) {
	const oauth = new SchoologyOAuth(options);
	return {
		async connect(sessionId: string): Promise<string> {
			const { authorizationUrl, pending } = await oauth.beginAuthorization(callbackUrl);
			await store.savePending(sessionId, pending);
			return authorizationUrl;
		},
		async complete(sessionId: string, returnedUrl: string): Promise<void> {
			const pending = await store.takePending(sessionId);
			if (!pending)
				throw new Error(
					'Schoology connection was not started in this session, or was already consumed.'
				);
			const token = await oauth.completeAuthorization(pending, returnedUrl);
			await store.saveToken(sessionId, token);
		},
		async gradebook(sessionId: string) {
			const token = await store.getToken(sessionId);
			if (!token) throw new Error('Connect Schoology first.');
			return new SchoologyClient({ ...options, token }).getGradebook();
		},
		async disconnect(sessionId: string): Promise<void> {
			await store.takePending(sessionId);
			await store.deleteToken(sessionId);
		}
	};
}
