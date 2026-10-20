import assert from 'node:assert/strict';
import test from 'node:test';
import { SchoologyOAuth } from '../src/index.js';
import { signOAuth } from '../src/oauth.js';
import { mockFetch, options } from './fixtures.js';

test('OAuth signing matches the published OAuth 1.0 photos test vector', async () => {
	const header = await signOAuth(
		new URL('http://photos.example.net/photos?file=vacation.jpg&size=original'),
		{ key: 'dpf43f3p2l4k3l03', secret: 'kd94hf93k423kf44' },
		{ key: 'nnch734d00sl2jdk', secret: 'pfkkdhi9sl3r4s00' },
		{},
		{ nonce: 'kllo9940pd9333jh', timestamp: '1191242096' }
	);
	assert.ok(header.includes('oauth_signature="tR3%2BTy81lMeYAr%2FFid0kMTYa%2FWM%3D"'));
});

test('OAuth round trip preserves request-token secret and supports legacy callbacks without verifier', async () => {
	const headers: string[] = [];
	const oauth = new SchoologyOAuth({
		consumer: options.consumer,
		schoolUrl: options.schoolUrl,
		fetch: mockFetch((url, init) => {
			headers.push(new Headers(init.headers).get('authorization')!);
			return new Response(
				url.pathname.endsWith('request_token')
					? 'oauth_token=request&oauth_token_secret=request-secret'
					: 'oauth_token=access&oauth_token_secret=access-secret'
			);
		})
	});
	const { pending, authorizationUrl } = await oauth.beginAuthorization(
		'http://localhost:3000/callback?purpose=connect'
	);
	assert.equal(new URL(authorizationUrl).origin, options.schoolUrl);
	assert.equal(new URL(authorizationUrl).searchParams.get('oauth_callback'), pending.callbackUrl);
	const callback = new URL(pending.callbackUrl);
	callback.searchParams.set('oauth_token', 'request');
	const token = await oauth.completeAuthorization(pending, callback.href);
	assert.deepEqual(token, { key: 'access', secret: 'access-secret' });
	assert.ok(headers[1]!.includes('oauth_token="request"'));
	assert.ok(!headers.join('').includes('request-secret'));
	assert.equal(JSON.stringify(oauth), '{}');
});

test('OAuth refuses mismatched, expired and duplicate callback parameters before token exchange', async () => {
	let calls = 0;
	const oauth = new SchoologyOAuth({
		consumer: options.consumer,
		schoolUrl: options.schoolUrl,
		fetch: mockFetch(() => {
			calls++;
			return new Response('oauth_token=request&oauth_token_secret=secret');
		})
	});
	const { pending } = await oauth.beginAuthorization('https://example.com/callback');
	const callback = new URL(pending.callbackUrl);
	callback.searchParams.set('oauth_token', 'request');
	for (const edit of [
		(url: URL) => url.searchParams.set('state', 'wrong'),
		(url: URL) => url.searchParams.set('oauth_token', 'wrong'),
		(url: URL) => url.searchParams.append('state', pending.state),
		(url: URL) => {
			url.host = 'evil.example';
		}
	]) {
		const url = new URL(callback);
		edit(url);
		await assert.rejects(oauth.completeAuthorization(pending, url.href), { code: 'AUTH' });
	}
	await assert.rejects(
		oauth.completeAuthorization({ ...pending, createdAt: Date.now() - 600_001 }, callback.href),
		{ code: 'AUTH' }
	);
	assert.equal(calls, 1);
});

test('OAuth refuses insecure school URLs and remote HTTP callbacks', async () => {
	assert.throws(
		() => new SchoologyOAuth({ consumer: options.consumer, schoolUrl: 'http://school.example' }),
		{ code: 'URL' }
	);
	const oauth = new SchoologyOAuth({ consumer: options.consumer, schoolUrl: options.schoolUrl });
	await assert.rejects(oauth.beginAuthorization('http://example.com/callback'), { code: 'URL' });
});
