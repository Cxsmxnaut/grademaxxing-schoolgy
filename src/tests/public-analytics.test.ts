import { parsePublicEvent, publicReferrerChannel } from '$lib/analytics/public-events';
import { describe, expect, it } from 'vitest';

describe('public aggregate event boundary', () => {
	it('retains only known event, canonical public path and bounded channel', () => {
		expect(
			parsePublicEvent({ event: 'tool_used', path: '/calculators/final-grade', channel: 'chatgpt' })
		).toEqual({ event: 'tool_used', path: '/calculators/final-grade', channel: 'chatgpt' });
		for (const path of [
			'/grades',
			'/api/session',
			'/calculators/final-grade/',
			'/calculators/final-grade?grade=82',
			'/calculators/final-grade#target'
		])
			expect(parsePublicEvent({ event: 'tool_used', path, channel: 'chatgpt' })).toBeNull();
		for (const extra of [
			{ grade: 82 },
			{ username: 'synthetic' },
			{ referrer: 'https://example.invalid/private' }
		])
			expect(
				parsePublicEvent({ event: 'tool_used', path: '/', channel: 'direct', ...extra })
			).toBeNull();
		expect(parsePublicEvent({ event: 'school_record', path: '/', channel: 'direct' })).toBeNull();
	});
	it('categorizes hosts without trusting lookalikes or retaining query strings', () => {
		expect(publicReferrerChannel('https://chatgpt.com/c/example?private=ignored')).toBe('chatgpt');
		expect(publicReferrerChannel('https://chatgpt.com.evil.invalid/')).toBe('other');
		expect(publicReferrerChannel('https://www.google.com/search?q=ignored')).toBe('google');
		expect(publicReferrerChannel('')).toBe('direct');
	});
});
