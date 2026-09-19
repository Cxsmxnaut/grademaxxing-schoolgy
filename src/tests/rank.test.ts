import { getGpaRank } from '$lib/grades/rank';
import { describe, expect, test } from 'vitest';

describe('GPA rank', () => {
	test.each([
		[0, 'Rising'],
		[2.5, 'Bronze'],
		[3, 'Bronze'],
		[3.1, 'Silver'],
		[3.5, 'Gold'],
		[3.8, 'Platinum'],
		[3.99, 'Platinum'],
		[4, 'Diamond']
	])('maps %s GPA to %s', (gpa, name) => {
		expect(getGpaRank(gpa, 6)?.current.name).toBe(name);
	});

	test('reports exact progress to the next rank', () => {
		const rank = getGpaRank(3.7, 6);
		expect(rank?.current.name).toBe('Gold');
		expect(rank?.next?.name).toBe('Platinum');
		expect(rank?.pointsAway).toBeCloseTo(0.1);
		expect(rank?.progress).toBeCloseTo(2 / 3);
	});

	test('marks ranks as provisional until four graded courses are available', () => {
		expect(getGpaRank(4, 1)).toMatchObject({
			provisional: true,
			gradedCourses: 1,
			coursesNeeded: 3
		});
		expect(getGpaRank(3.8, 4)).toMatchObject({
			provisional: false,
			gradedCourses: 4,
			coursesNeeded: 0
		});
	});

	test('handles missing and top-rank GPA values', () => {
		expect(getGpaRank(undefined, 0)).toBeUndefined();
		expect(getGpaRank(Number.NaN, 0)).toBeUndefined();
		expect(getGpaRank(4, 4)?.next).toBeUndefined();
		expect(getGpaRank(4, 4)?.progress).toBe(1);
	});
});
