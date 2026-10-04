import { parseServerMetrics, RefreshTimingRecorder } from '$lib/studentvue/refresh-timing';
import { expect, test } from 'vitest';

test('separates session queue wait, fetch, body processing, and retry delay', () => {
	let now = 100;
	const recorder = new RefreshTimingRecorder(() => now);
	const request = recorder.capture('/api/studentvue/gradebook?reportPeriod=7&private=never-retain');
	expect(request).toBeDefined();
	now = 600;
	request!.ready();
	const first = request!.attempt(0);
	now = 900;
	first.headers(new Response('{}', { status: 503, headers: { 'Server-Timing': 'app;dur=220' } }));
	now = 920;
	first.finish();
	const retryStartedAt = now;
	now = 1170;
	first.retry(retryStartedAt);
	const second = request!.attempt(1);
	now = 1500;
	second.headers(new Response('{}', { status: 200 }));
	now = 1520;
	second.finish();
	request!.finish();
	recorder.finish();
	expect(recorder.result).toMatchObject({
		complete: true,
		elapsedMs: 1420,
		requests: [
			{
				path: '/api/studentvue/gradebook',
				queuedMs: 0,
				queueWaitMs: 500,
				totalMs: 1420,
				attempts: [
					{
						attempt: 1,
						startedMs: 500,
						status: 503,
						toHeadersMs: 300,
						bodyMs: 20,
						retryDelayMs: 250,
						server: [{ name: 'app', durationMs: 220 }]
					},
					{ attempt: 2, startedMs: 1070, status: 200, toHeadersMs: 330, bodyMs: 20 }
				]
			}
		]
	});
	expect(JSON.stringify(recorder.result)).not.toContain('private');
	expect(JSON.stringify(recorder.result)).not.toContain('reportPeriod');
});

test('does not capture unrelated requests or retain responses and header descriptions', () => {
	const recorder = new RefreshTimingRecorder(() => 0);
	expect(recorder.capture('/api/studentvue/message?id=private')).toBeUndefined();
	expect(recorder.capture('https://other.example/api/studentvue/gradebook')).toBeUndefined();
	const capture = recorder.capture('/api/studentvue/messages')!;
	capture.ready();
	const attempt = capture.attempt(0);
	attempt.headers(
		new Response('private body', {
			status: 200,
			headers: {
				'Server-Timing': 'app;dur=12;desc="private description", unknown_name;dur=999',
				'Set-Cookie': 'private-cookie'
			}
		})
	);
	attempt.finish();
	capture.finish();
	recorder.finish();
	expect(JSON.stringify(recorder.result)).not.toContain('private');
	expect(JSON.stringify(recorder.result)).not.toContain('cookie');
	expect(recorder.capture('/api/studentvue/gradebook')).toBeUndefined();
});

test('only accepts numeric durations for known timing names', () => {
	expect(
		parseServerMetrics(
			'app;dur=1.2, gb_classes_network;dur=3.4, app;dur=NaN, app;dur=-4, secret;dur=999'
		)
	).toEqual([
		{ name: 'app', durationMs: 1.2 },
		{ name: 'gb_classes_network', durationMs: 3.4 }
	]);
});
