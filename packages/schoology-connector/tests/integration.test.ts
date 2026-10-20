import assert from 'node:assert/strict';
import test from 'node:test';
import { createSchoologyIntegration } from '../examples/server-integration.js';
import type { OAuthToken, PendingAuthorization } from '../src/index.js';
import { mockFetch, options } from './fixtures.js';

test('server adapter binds authorization to a session and consumes pending tokens once', async () => {
	const pending = new Map<string, PendingAuthorization>();
	const tokens = new Map<string, OAuthToken>();
	let exchanges = 0;
	const app = createSchoologyIntegration(
		{
			consumer: options.consumer,
			schoolUrl: options.schoolUrl,
			fetch: mockFetch((url) => {
				if (url.pathname.endsWith('/access_token')) {
					exchanges++;
					return new Response('oauth_token=access&oauth_token_secret=secret');
				}
				return new Response('oauth_token=request&oauth_token_secret=request-secret');
			})
		},
		{
			async savePending(id, value) {
				pending.set(id, value);
			},
			async takePending(id) {
				const value = pending.get(id) ?? null;
				pending.delete(id);
				return value;
			},
			async saveToken(id, value) {
				tokens.set(id, value);
			},
			async getToken(id) {
				return tokens.get(id) ?? null;
			},
			async deleteToken(id) {
				tokens.delete(id);
			}
		},
		'https://app.example/callback'
	);
	const authorization = new URL(await app.connect('session-one'));
	const callback = new URL(authorization.searchParams.get('oauth_callback')!);
	callback.searchParams.set('oauth_token', 'request');
	await assert.rejects(app.complete('session-two', callback.href));
	assert.equal(exchanges, 0);
	await app.complete('session-one', callback.href);
	assert.equal(exchanges, 1);
	await assert.rejects(app.complete('session-one', callback.href));
	assert.equal(exchanges, 1);
	await app.disconnect('session-one');
	assert.equal(tokens.size, 0);
});
