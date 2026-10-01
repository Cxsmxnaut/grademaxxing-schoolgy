import { formatPercentage } from '$lib/grades/percentage-format';
import { expect, test } from 'vitest';

test('grade percentages show at most two decimals without changing their values', () => {
	expect(formatPercentage(96.534)).toBe('96.53');
	expect(formatPercentage(96.535)).toBe('96.54');
	expect(formatPercentage(97.5)).toBe('97.5');
	expect(formatPercentage(100)).toBe('100');
});
