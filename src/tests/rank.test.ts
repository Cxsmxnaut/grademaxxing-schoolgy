import { getGpaRank } from '$lib/grades/rank';
import { describe, expect, test } from 'vitest';

describe('GPA rank', () => {
	test.each([
		[0, 'Rising'],
		[2.5, 'Bronze'],
		[3, 'Silver'],
		[3.3, 'Gold'],
		[3.7, 'Platinum'],
		[3.9, 'Diamond'],
		[4, 'Diamond']
	])('maps %s GPA to %s', (gpa, name) => {
		expect(getGpaRank(gpa)?.current.name).toBe(name);
	});

	test('reports exact progress to the next rank', () => {
		const rank = getGpaRank(3.67);
		expect(rank?.current.name).toBe('Gold');
		expect(rank?.next?.name).toBe('Platinum');
		expect(rank?.pointsAway).toBeCloseTo(0.03);
		expect(rank?.progress).toBeCloseTo(0.925);
	});

	test('handles missing and top-rank GPA values', () => {
		expect(getGpaRank(undefined)).toBeUndefined();
		expect(getGpaRank(Number.NaN)).toBeUndefined();
		expect(getGpaRank(4)?.next).toBeUndefined();
		expect(getGpaRank(4)?.progress).toBe(1);
	});
});
