import { appendServerTiming, RequestTiming, timingRequestHeader } from '$lib/server/request-timing';
import { expect, test } from 'vitest';

const headerFor = (timing: RequestTiming, existing?: string) => {
	const headers = new Headers(existing ? { 'Server-Timing': existing } : undefined);
	timing.append(headers);
	return headers.get('Server-Timing');
};

test('numeric timings append to the existing aggregate without descriptions or payload fields', () => {
	const timing = new RequestTiming();
	timing.record({ name: 'gb_context_network', durationMs: 12.34 });
	timing.record({ name: 'gb_class_detail_2_body', durationMs: 4.56 });
	expect(headerFor(timing, 'app;dur=25.0')).toBe(
		'app;dur=25.0, gb_context_network;dur=12.3, gb_class_detail_2_body;dur=4.6'
	);
	expect(timingRequestHeader).toBe('X-Grademaxxing-Timing');

	const headers = new Headers({ 'Server-Timing': 'queue;dur=2.0' });
	appendServerTiming(headers, 'app;dur=10.0');
	appendServerTiming(headers, ' ');
	expect(headers.get('Server-Timing')).toBe('queue;dur=2.0, app;dur=10.0');
});

test('timings admit only fixed operation names and bounded class and assignment ordinals', () => {
	const timing = new RequestTiming();
	const accepted = [
		'gb_class_detail_1_network',
		'gb_class_parse_999',
		'gb_class_prepare_1',
		'gb_class_reconcile_2',
		'gb_assignment_detail_2_999_body',
		'gb_assignment_parse_999_1',
		'student_photo_body',
		'queue'
	];
	const rejected = [
		'gb_class_detail_0_network',
		'gb_class_detail_01_network',
		'gb_class_detail_1000_network',
		'gb_assignment_detail_2_0_body',
		'gb_assignment_detail_2_1000_body',
		'gb_assignment_detail_2_001_body',
		'gb_class_detail_student_network',
		'gb_class_detail_1_network;desc="student"',
		'gb_class_detail_1_network\r\nstudent: value',
		'gb_class_detail_1_network\n',
		'gb_assignment_parse_1_1\n',
		'https://portal.example/course',
		'gb_student_name',
		'session_token',
		'app'
	];
	for (const name of [...accepted, ...rejected]) timing.record({ name, durationMs: 1 });
	expect(headerFor(timing)).toBe(accepted.map((name) => `${name};dur=1.0`).join(', '));
});

test('invalid durations never reach a header and each record copies only safe fields', () => {
	const timing = new RequestTiming();
	for (const durationMs of [-1, NaN, Infinity, -Infinity]) {
		timing.record({ name: 'queue', durationMs });
	}
	const span = { name: 'session_decode', durationMs: 0, payload: 'synthetic-private-value' };
	timing.record(span);
	span.name = 'synthetic-private-value';
	span.durationMs = 100;
	timing.record({ name: 'queue', durationMs: -0 });
	expect(headerFor(timing)).toBe('session_decode;dur=0.0, queue;dur=0.0');
});

test('synchronous and asynchronous measurements preserve results and record failures in finally', async () => {
	let now = 0;
	const timing = new RequestTiming(() => now);
	expect(
		timing.measureSync('session_encode', () => {
			now += 2;
			return 42;
		})
	).toBe(42);
	expect(() =>
		timing.measureSync('gb_context_parse', () => {
			now += 3;
			throw new Error('synthetic failure');
		})
	).toThrow('synthetic failure');
	await expect(
		timing.measure('student_photo_body', async () => {
			now += 4;
			return 'finished';
		})
	).resolves.toBe('finished');
	await expect(
		timing.measure('mail_inbox_body', async () => {
			now += 5;
			throw new Error('synthetic failure');
		})
	).rejects.toThrow('synthetic failure');
	expect(headerFor(timing)).toBe(
		'session_encode;dur=2.0, gb_context_parse;dur=3.0, student_photo_body;dur=4.0, mail_inbox_body;dur=5.0'
	);
});

test('finishing one span repeatedly records it only once', () => {
	let now = 10;
	const timing = new RequestTiming(() => now);
	const finish = timing.start('queue');
	now = 20;
	finish();
	now = 30;
	finish();
	expect(headerFor(timing)).toBe('queue;dur=10.0');
});

test('capture and serialization stay bounded for requests with many assignment details', () => {
	const timing = new RequestTiming();
	for (let index = 0; index < 1_000; index += 1) {
		timing.record({ name: 'queue', durationMs: 1 });
	}
	expect(headerFor(timing)?.split(', ')).toHaveLength(256);

	const large = new RequestTiming();
	for (let index = 0; index < 256; index += 1) {
		large.record({ name: 'gb_assignment_detail_999_999_network', durationMs: 1234567890 });
	}
	const existing = 'app;dur=10.0';
	const header = headerFor(large, existing)!;
	expect(new TextEncoder().encode(header).byteLength).toBeLessThanOrEqual(12 * 1024);
	expect(header.startsWith(`${existing}, `)).toBe(true);
	expect(header.split(', ').length).toBeLessThan(257);
	expect(header.endsWith(';dur=1234567890.0')).toBe(true);

	const fullHeaders = new Headers({ 'Server-Timing': 'x'.repeat(12 * 1024) });
	large.append(fullHeaders);
	expect(fullHeaders.get('Server-Timing')).toBe('x'.repeat(12 * 1024));
});

test('large finite durations remain numeric rather than exponent notation', () => {
	const timing = new RequestTiming();
	timing.record({ name: 'queue', durationMs: 1e30 });
	expect(headerFor(timing)).toBe('queue;dur=1000000000000000000000000000000.0');
});
