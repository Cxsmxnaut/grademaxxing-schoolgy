import { parsePublicEvent } from '$lib/analytics/public-events';
import { isProductionHost } from '$lib/seo/public-pages';
import { PublicWriteBudget } from '$lib/server/analytics/public-budget';
import { McpBodyTooLargeError, readMcpBody } from '$lib/server/mcp/body';
import type { RequestHandler } from './$types';

type AggregatePlatform = {
	env?: {
		GRADEMAXXING_USAGE_ANALYTICS?: {
			writeDataPoint: (point: { blobs: string[]; doubles: number[]; indexes: string[] }) => void;
		};
	};
};

const writeBudget = new PublicWriteBudget();

export const POST: RequestHandler = async ({ request, platform, url }) => {
	let body: string;
	try {
		// Reuse the bounded reader, including streams without Content-Length.
		body = await readMcpBody(request, 512);
	} catch (cause) {
		return new Response(null, { status: cause instanceof McpBodyTooLargeError ? 413 : 400 });
	}
	let value: unknown;
	try {
		value = JSON.parse(body);
	} catch {
		return new Response(null, { status: 400 });
	}
	const event = parsePublicEvent(value);
	if (!event) return new Response(null, { status: 400 });
	// Preview and loopback requests never enter the production dataset.
	if (!isProductionHost(url.hostname)) return new Response(null, { status: 204 });
	const retryAfter = writeBudget.take();
	if (retryAfter)
		return new Response(null, { status: 429, headers: { 'Retry-After': String(retryAfter) } });
	try {
		(platform as AggregatePlatform | undefined)?.env?.GRADEMAXXING_USAGE_ANALYTICS?.writeDataPoint({
			blobs: ['public_acquisition', event.event, event.path, event.channel],
			doubles: [1],
			indexes: ['public-acquisition']
		});
	} catch {
		// Never log the payload or let measurement failure block public use.
	}
	return new Response(null, { status: 204 });
};
