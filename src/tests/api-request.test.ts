import { apiRequest, StudentVueSessionExpiredError } from '$lib/synergy';
import { afterEach, expect, test, vi } from 'vitest';

afterEach(() => {
	vi.useRealTimers();
	vi.unstubAllGlobals();
});

test('idempotent API reads recover from a transient upstream failure', async () => {
	vi.useFakeTimers();
	const fetchMock = vi
		.fn<typeof fetch>()
		.mockResolvedValueOnce(
			Response.json({ message: 'temporary' }, { status: 502, statusText: 'Bad Gateway' })
		)
		.mockResolvedValueOnce(Response.json({ value: 'recovered' }));
	vi.stubGlobal('fetch', fetchMock);

	const resultPromise = apiRequest<{ value: string }>('/api/studentvue/gradebook');
	await vi.runAllTimersAsync();
	await expect(resultPromise).resolves.toEqual({ value: 'recovered' });
	expect(fetchMock).toHaveBeenCalledTimes(2);
});

test('idempotent API reads recover from one transient server error', async () => {
	vi.useFakeTimers();
	const fetchMock = vi
		.fn<typeof fetch>()
		.mockResolvedValueOnce(Response.json({ message: 'temporary' }, { status: 500 }))
		.mockResolvedValueOnce(Response.json({ value: 'recovered' }));
	vi.stubGlobal('fetch', fetchMock);

	const result = apiRequest<{ value: string }>('/api/studentvue/gradebook');
	await vi.runAllTimersAsync();
	await expect(result).resolves.toEqual({ value: 'recovered' });
	expect(fetchMock).toHaveBeenCalledTimes(2);
});

test('non-idempotent API writes are never automatically repeated', async () => {
	const fetchMock = vi
		.fn<typeof fetch>()
		.mockResolvedValue(Response.json({ message: 'temporary' }, { status: 503 }));
	vi.stubGlobal('fetch', fetchMock);

	await expect(apiRequest('/api/session', { method: 'POST', body: '{}' }, false)).rejects.toThrow(
		'temporary'
	);
	expect(fetchMock).toHaveBeenCalledTimes(1);
});

test('retryable reads honor a bounded Retry-After response', async () => {
	vi.useFakeTimers();
	const fetchMock = vi
		.fn<typeof fetch>()
		.mockResolvedValueOnce(
			Response.json({ message: 'busy' }, { status: 503, headers: { 'Retry-After': '1' } })
		)
		.mockResolvedValueOnce(Response.json({ value: 'ready' }));
	vi.stubGlobal('fetch', fetchMock);

	const result = apiRequest<{ value: string }>('/api/studentvue/gradebook');
	await vi.advanceTimersByTimeAsync(999);
	expect(fetchMock).toHaveBeenCalledTimes(1);
	await vi.advanceTimersByTimeAsync(1);
	await expect(result).resolves.toEqual({ value: 'ready' });
	expect(fetchMock).toHaveBeenCalledTimes(2);
});

test('upstream expiry is distinguished from an invalid app session', async () => {
	vi.stubGlobal(
		'fetch',
		vi.fn<typeof fetch>().mockResolvedValue(
			Response.json(
				{
					code: 'UPSTREAM_SESSION_EXPIRED',
					message: 'Reconnect to StudentVUE to update your school data.'
				},
				{ status: 401 }
			)
		)
	);

	await expect(apiRequest('/api/studentvue/gradebook')).rejects.toBeInstanceOf(
		StudentVueSessionExpiredError
	);
});
