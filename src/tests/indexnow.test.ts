import { INDEXNOW_KEY, allPublicPaths, indexNowPayload } from '$lib/seo/indexnow';
import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';

test('IndexNow proof and payload are confined to canonical public documents', () => {
	expect(
		readFileSync(new URL(`../../static/${INDEXNOW_KEY}.txt`, import.meta.url), 'utf8').trim()
	).toBe(INDEXNOW_KEY);
	const payload = indexNowPayload(allPublicPaths());
	expect(payload.host).toBe('grademaxxing.app');
	expect(payload.urlList.every((url) => url.startsWith('https://grademaxxing.app/'))).toBe(true);
	for (const path of [
		'/grades',
		'/api/session',
		'/calculators/final-grade/',
		'/calculators/final-grade?grade=82',
		'/login',
		'https://other.invalid/'
	])
		expect(() => indexNowPayload([path])).toThrow();
	expect(() => indexNowPayload([])).toThrow();
	expect(indexNowPayload(['/', '/']).urlList).toHaveLength(1);
});
