import { getGpaRank } from '$lib/grades/rank';
import { describe, expect, test } from 'vitest';

describe('GPA rank', () => {
	test.each([
		[0, 'Bronze I'],
		[0.49, 'Bronze I'],
		[0.5, 'Bronze II'],
		[1.49, 'Bronze III'],
		[1.5, 'Silver I'],
		[1.75, 'Silver II'],
		[2.2, 'Gold I'],
		[2.8, 'Platinum I'],
		[3.2, 'Platinum III'],
		[3.4, 'Diamond I'],
		[3.55, 'Diamond II'],
		[3.7, 'Diamond III'],
		[3.85, 'Elite'],
		[4, 'Champion'],
		[4.01, 'Unreal'],
		[5, 'Unreal']
	])('maps %s GPA to %s', (gpa, name) => {
		expect(getGpaRank(gpa, 6)?.current.name).toBe(name);
	});

	test('reports exact progress to the next rank', () => {
		const rank = getGpaRank(3.6, 6);
		expect(rank?.current.name).toBe('Diamond II');
		expect(rank?.next?.name).toBe('Diamond III');
		expect(rank?.pointsAway).toBeCloseTo(0.1);
		expect(rank?.progress).toBeCloseTo(1 / 3);
	});

	test('marks ranks as provisional until four graded courses are available', () => {
		expect(getGpaRank(4, 1)).toMatchObject({
			provisional: true,
			gradedCourses: 1,
			coursesNeeded: 3
		});
		expect(getGpaRank(3.85, 4)).toMatchObject({
			provisional: false,
			gradedCourses: 4,
			coursesNeeded: 0
		});
	});

	test('handles missing and top-rank GPA values', () => {
		expect(getGpaRank(undefined, 0)).toBeUndefined();
		expect(getGpaRank(Number.NaN, 0)).toBeUndefined();
		expect(getGpaRank(5, 4)?.next).toBeUndefined();
		expect(getGpaRank(5, 4)?.progress).toBe(1);
	});
});
