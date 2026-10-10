import { PublicWriteBudget } from '$lib/server/analytics/public-budget';
import { expect, test, vi } from 'vitest';
import { POST } from '../routes/api/public-analytics/+server';

function eventFor(host: string, body: BodyInit, writeDataPoint = vi.fn()) {
	const url = new URL(`https://${host}/api/public-analytics`);
	return {
		url,
		request: new Request(url, { method: 'POST', body, duplex: 'half' } as RequestInit),
		platform: { env: { GRADEMAXXING_USAGE_ANALYTICS: { writeDataPoint } } }
	} as unknown as Parameters<typeof POST>[0];
}
const payload = JSON.stringify({ event: 'page_view', path: '/', channel: 'direct' });

test('only the exact production host writes allowlisted aggregate fields', async () => {
	const writeDataPoint = vi.fn();
	for (const host of [
		'localhost',
		'grademaxxing-beta.bhavith-lolakapuri.workers.dev',
		'grademaxxing.app.example.invalid'
	]) {
		expect((await POST(eventFor(host, payload, writeDataPoint))).status).toBe(204);
	}
	expect(writeDataPoint).not.toHaveBeenCalled();
	expect((await POST(eventFor('grademaxxing.app', payload, writeDataPoint))).status).toBe(204);
	expect(writeDataPoint).toHaveBeenCalledExactlyOnceWith({
		blobs: ['public_acquisition', 'page_view', '/', 'direct'],
		doubles: [1],
		indexes: ['public-acquisition']
	});
});

test('an oversized chunked request is cancelled before parsing or writing', async () => {
	let cancelled = false;
	const body = new ReadableStream({
		start(controller) {
			controller.enqueue(new TextEncoder().encode('é'.repeat(300)));
		},
		cancel() {
			cancelled = true;
		}
	});
	const writeDataPoint = vi.fn();
	expect((await POST(eventFor('grademaxxing.app', body, writeDataPoint))).status).toBe(413);
	expect(cancelled).toBe(true);
	expect(writeDataPoint).not.toHaveBeenCalled();
});

test('aggregate budget caps a burst and expires without retaining visitor identity', () => {
	const budget = new PublicWriteBudget(2, 60_000);
	expect(budget.take(100_000)).toBe(0);
	expect(budget.take(100_001)).toBe(0);
	expect(budget.take(100_002)).toBe(60);
	expect(budget.take(159_001)).toBe(1);
	expect(budget.take(160_000)).toBe(0);
});

test('endpoint returns Retry-After when its isolate write budget is exhausted', async () => {
	vi.resetModules();
	const { POST: freshPost } = await import('../routes/api/public-analytics/+server');
	const writeDataPoint = vi.fn();
	for (let index = 0; index < 600; index++) {
		expect((await freshPost(eventFor('grademaxxing.app', payload, writeDataPoint))).status).toBe(
			204
		);
	}
	const response = await freshPost(eventFor('grademaxxing.app', payload, writeDataPoint));
	expect(response.status).toBe(429);
	expect(Number(response.headers.get('Retry-After'))).toBeGreaterThan(0);
	expect(writeDataPoint).toHaveBeenCalledTimes(600);
});
