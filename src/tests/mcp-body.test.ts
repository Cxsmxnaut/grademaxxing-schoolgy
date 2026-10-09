import { McpBodyTooLargeError, readMcpBody } from '$lib/server/mcp/body';
import { expect, test } from 'vitest';

test('chunked bodies are bounded by bytes rather than characters', async () => {
	let cancelled = false;
	const request = new Request('https://example.test/mcp', {
		method: 'POST',
		body: new ReadableStream({
			start(controller) {
				controller.enqueue(new TextEncoder().encode('éé'));
			},
			cancel() {
				cancelled = true;
			}
		}),
		duplex: 'half'
	} as RequestInit);
	await expect(readMcpBody(request, 3)).rejects.toBeInstanceOf(McpBodyTooLargeError);
	expect(cancelled).toBe(true);
});

test('valid UTF-8 and empty bodies survive the bounded reader', async () => {
	const request = new Request('https://example.test/mcp', { method: 'POST', body: 'éé' });
	expect(await readMcpBody(request, 4)).toBe('éé');
	expect(await readMcpBody(new Request('https://example.test/mcp'), 1)).toBe('');
});
